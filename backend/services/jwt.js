// services/jwt.js
const jwt = require('jsonwebtoken');
const { SERVICE, SECRET_ENV, TTL_ENV } = require('../config/env');
const { UnauthorizedError, ConfigError } = require('@errors');

// 預設服務（你的專案就是用 WEB）
const DEFAULT_SERVICE = SERVICE.WEB || 'WEB';

function normalizeService(service) {
  const c = String(service || '').toUpperCase();
  return SERVICE[c] ? c : DEFAULT_SERVICE;
}

function getSecretForService(service) {
  const s = normalizeService(service);

  // 主要從 env 映射表拿（env.js 已把 WEB_* fallback 到 WEB_*）
  let secret = process.env[SECRET_ENV[s]];

  // 但為了穩妥，再手動做一次 fallback
  if (!secret && s === 'WEB') {
    secret =
      process.env.WEB_SECRET ||
      process.env.JWT_SECRET_DEFAULT || // 最後備援
      '';
  }

  return secret;
}

function getTtlForService(service) {
  const s = normalizeService(service);

  // 先從映射表抓
  let ttl = process.env[TTL_ENV[s]];

  // 再做一次手動 fallback
  if (!ttl && s === 'WEB') {
    ttl =
      process.env.WEB_TTL ||
      process.env.DEFAULT_TTL ||
      '2h';
  }

  return ttl;
}

function sign(payload, service) {
  const s = normalizeService(service); // 允許不帶，預設 WEB
  const secret = getSecretForService(s);
  if (!secret) {
    throw new ConfigError(`Missing secret for service ${s}`);
  }

  const expiresIn = getTtlForService(s);
  return jwt.sign({ ...payload, Service: s }, secret, { expiresIn });
}

function verify(token, service) {
  if (!token) {
    throw new UnauthorizedError('Missing token');
  }

  const s = normalizeService(service); // 允許不帶，預設 WEB
  const secret = getSecretForService(s);
  if (!secret) {
    throw new ConfigError(`Missing secret for service ${s}`);
  }

  try {
    return jwt.verify(token, secret);
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token expired');
    }
    throw new UnauthorizedError('Invalid token');
  }
}

module.exports = { sign, verify };
