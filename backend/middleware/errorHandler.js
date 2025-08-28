// middlewares/errorHandler.js
const logger = require('@utils/logger');
const { AppError, BadRequestError, UnprocessableEntityError } = require('@errors');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
    // JWT
    if (err && typeof err.name === 'string') {
        if (err.name === 'TokenExpiredError') {
            err = new AppError('Token expired', 401, 'TOKEN_EXPIRED', 'Token expired, please login again');
        } else if (err.name === 'JsonWebTokenError') {
            err = new AppError('Invalid token', 401, 'TOKEN_INVALID', 'Invalid token');
        } else if (err.name === 'NotBeforeError') {
            err = new AppError('Token not active', 401, 'TOKEN_NOT_ACTIVE', 'Token not yet active');
        }
    }

    // 驗證錯誤（Joi/Zod/express-validator）
    if (!(err instanceof AppError)) {
        if (err?.isJoi) {
            err = new BadRequestError('Validation failed', 'Invalid request');
        } else if (Array.isArray(err?.errors) && err.errors[0]?.param) {
            err = new UnprocessableEntityError('Validation failed', 'Invalid request');
        }
    }

    // 標準化錯誤
    const isApp = err instanceof AppError;
    const status = isApp ? err.status : 500;
    const code = isApp ? err.code : 'INTERNAL_ERROR';
    const message = isApp ? err.publicMessage : 'Internal Server Error';

    // 401 → 附上 WWW-Authenticate（OAuth2/JWT 慣例）
    if (status === 401 && !res.headersSent) {
        res.set('WWW-Authenticate', `Bearer error="${code.toLowerCase()}", error_description="${message}"`);
    }

    // Log：4xx→warn，5xx→error（避免回應前就送出）
    const payload = {
        requestId: req.requestId,
        method: req.method,
        path: req.path || (req.originalUrl || '').split('?')[0],
        status,
        code,
    };

    const log = req?.log || logger;
    if (status >= 500) {
        log.error('request: app_error', { ...payload, error: { message: err.message, stack: err.stack } });
    } else {
        log.warn('request: app_warn', { ...payload, error: { message: err.message } });
    }

    // 統一回應
    if (!res.headersSent) {
        res.status(status).json({
            error: code,
            message,
            requestId: req.requestId,
        });
    }
}

module.exports = { errorHandler };
