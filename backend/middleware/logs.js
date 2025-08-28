// middlewares/logs.js
const { v4: uuidv4 } = require('uuid');
const logger = require('@utils/logger');

// 設定慢查詢時間（毫秒）
// 可透過環境變數 SLOW_MS 調整，預設 500
const SLOW_MS = Number(process.env.SLOW_MS ?? 500);

function logMiddleware(req, res, next) {
    // 高精度起始時間
    const startNs = process.hrtime.bigint();

    // requestId 與子 logger
    const requestId = uuidv4();
    req.requestId = requestId;

    // 寫回 response header，方便追蹤
    res.setHeader('X-Request-Id', requestId);

    // 取得真實 IP（需於 app 層設 trust proxy）
    const xff = req.headers['x-forwarded-for'];
    const realIp = Array.isArray(xff)
        ? xff[0].split(',')[0].trim()
        : (typeof xff === 'string' ? xff.split(',')[0].trim() : req.ip);

    req.log = (req.log || logger).child({ requestId, ip: realIp });

    // 精準統計回應大小（考量字串編碼）
    let respBytes = 0;
    const _write = res.write;
    const _end = res.end;

    res.write = function (chunk, encoding, cb) {
        if (chunk) {
            const enc = typeof encoding === 'string' ? encoding : undefined;
            respBytes += Buffer.isBuffer(chunk)
                ? chunk.length
                : Buffer.byteLength(String(chunk), enc);
        }
        return _write.call(this, chunk, encoding, cb);
    };

    res.end = function (chunk, encoding, cb) {
        if (chunk) {
            const enc = typeof encoding === 'string' ? encoding : undefined;
            respBytes += Buffer.isBuffer(chunk)
                ? chunk.length
                : Buffer.byteLength(String(chunk), enc);
        }
        return _end.call(this, chunk, encoding, cb);
    };

    // 統一組裝 log 資料
    const buildPayload = (status, aborted = false, extra = {}) => {
        const durationMs = Number((process.hrtime.bigint() - startNs) / 1000000n);

        // 呼叫者資訊（由 auth middleware 提供）
        const userId = req.user?.account || 'guest';
        const serviceName = req.user?.serviceName || null;
        const departmentId = req.user?.departmentId || null;
        const company = req.user?.company || null;

        // 路由樣板（避免高基數）
        const routePattern = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : null;

        // Token 指紋與 TTL
        const token_fp = req.authMeta?.token_fp || null;
        let ttl = null;
        if (typeof req.authMeta?.exp === 'number') {
            ttl = req.authMeta.exp - Math.floor(Date.now() / 1000);
        }

        // 避免高基數：path 不含 query；僅記錄 query 鍵名
        const queryKeys = Object.keys(req.query || {});
        const pathNoQuery = req.path || req.originalUrl.split('?')[0];

        return {
            userId,
            company,
            departmentId,
            serviceName,
            method: req.method,
            path: pathNoQuery,
            route: routePattern,
            status,
            duration_ms: durationMs,
            bytes: respBytes,
            token_fp,
            ttl,
            aborted,
            uq: req.get('user-agent')?.slice(0, 200),
            refere: req.get('referer'),
            queryKeys,
            ...extra,
        };
    };

    // 初始請求 log
    req.log.debug('request: start', {
        method: req.method,
        path: req.path || (req.originalUrl || '').split('?')[0],
        queryKeys: Object.keys(req.query || {}),
    });

    // 成功完成
    res.on('finish', () => {
        const payload = buildPayload(res.statusCode, false);

        let level = 'info';
        if (res.statusCode >= 500) {
            level = 'error';
        } else if (res.statusCode >= 400) {
            level = 'warn';
        } else if (payload.duration_ms >= SLOW_MS) {
            level = 'warn';
            payload.slow = true;              // 慢請求標記
            payload.slow_threshold_ms = SLOW_MS;
        }

        req.log[level]('request: done', payload);
    });

    // 客戶端中斷
    res.on('close', () => {
        if (!res.writableEnded) {
            const payload = buildPayload(499, true);
            req.log.warn('request: aborted', payload);
        }
    });

    // 傳輸錯誤
    res.on('error', (err) => {
        const payload = buildPayload(res.statusCode || 500, false, {
            error: { message: err?.message, code: err?.code },
        });
        req.log.error('request: transport_error', payload);
    });

    next();
}

module.exports = { logMiddleware };
