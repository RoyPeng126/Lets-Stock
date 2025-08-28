// middlewares/auth.js
const { UnauthorizedError } = require('@errors');
const { TokenExpiredError, JsonWebTokenError } = require('jsonwebtoken');
const crypto = require('crypto');
const { verify } = require('@services/jwt');

function getAuthHeader(req) {
  return req?.get?.('authorization') || req?.headers?.authorization || '';
}

function readBearer(req) {
  const h = getAuthHeader(req);
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function tokenFp(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 8);
}

/**
 * 強制驗證：允許多個 service（任一通過即放行）
 * 若未指定 allowedServices，預設使用 ['WEB']。
 */
function authRequired(allowedServices) {
  const allowList = Array.isArray(allowedServices) && allowedServices.length > 0
    ? allowedServices.map(s => String(s).toUpperCase())
    : ['WEB']; // 預設驗 WEB

  return (req, res, next) => {
    const token = readBearer(req);
    if (!token) return next(new UnauthorizedError('Missing token'));

    let lastErr;
    for (const service of allowList) {
      try {
        const decoded = verify(token, service); // 我們的 verify 支援 service 可選，但這裡明確帶
        const serviceName = (decoded.Service || decoded.serviceName || service || 'WEB').toUpperCase();

        req.token = token;
        req.user = {
          account: decoded.account,
          name: decoded.name,
          department: decoded.department,
          departmentId: decoded.departmentId,
          email: decoded.email,
          serviceName,
        };
        req.authService = serviceName;
        req.authMeta = {
          iat: decoded.iat ?? null,
          exp: decoded.exp ?? null,
          token_fp: tokenFp(token),
        };
        return next();
      } catch (e) {
        lastErr = e;
      }
    }

    // 全部嘗試皆失敗
    req.log?.warn('authRequired: verify_failed', { err: lastErr?.message, ip: req.ip });
    return next(new UnauthorizedError('Invalid token'));
  };
}

/**
 * 選擇性驗證：無/壞 token 不擋請求
 * opts.onFailLog: 'silent' | 'debug' | 'warn'（預設 'debug'）
 */
function authOptional(opts = {}) {
  const { onFailLog = 'debug' } = opts;

  return (req, res, next) => {
    const token = readBearer(req);
    if (!token) {
      if (onFailLog === 'debug') req.log?.debug('auth(opt): no token', { ip: req.ip });
      return next();
    }

    try {
      // 不指定 service，verify 會預設驗 WEB
      const decoded = verify(token);
      const serviceName = (decoded.Service || decoded.serviceName || 'WEB').toUpperCase();

      req.token = token;
      req.user = {
        account: decoded.account,
        name: decoded.name,
        department: decoded.department,
        departmentId: decoded.departmentId,
        email: decoded.email,
        serviceName,
      };
      req.authService = serviceName;
      req.authMeta = {
        iat: decoded.iat ?? null,
        exp: decoded.exp ?? null,
        token_fp: tokenFp(token),
      };

      const now = Math.floor(Date.now() / 1000);
      const ttl = typeof decoded.exp === 'number' ? decoded.exp - now : null;
      req.log?.info('auth(opt): verified', { actor: req.user.account, ttl });
      return next();
    } catch (err) {
      const code =
        err instanceof TokenExpiredError ? 'token_expired' :
        err instanceof JsonWebTokenError ? 'token_invalid' : 'token_error';

      if (onFailLog === 'warn') req.log?.warn('authOptional: verify_failed', { code, ip: req.ip });
      else if (onFailLog === 'debug') req.log?.debug('authOptional: verify_failed', { code, ip: req.ip });

      // 不設 user/token，避免下游誤用
      req.token = null;
      return next();
    }
  };
}

module.exports = { authRequired, authOptional };
