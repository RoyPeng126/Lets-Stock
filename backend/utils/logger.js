// utils/logger.js
// 根據 NODE_ENV 產生不同的LOG設定:
// - dev  : Console (pretty) + File (JSON) 【方便自己開發看】
// - test : Console (JSON) 【後續由 PM2 收集】
// - production : Console (JSON) 【後續由 PM2 收集】

const fs = require('fs');
const path = require('path');
const os = require('os');
const dayjs = require('dayjs');
const { createLogger, format, transports } = require('winston');

const env = (process.env.NODE_ENV || 'dev').toLowerCase();
const version = process.env.APP_VERSION || 'dev';

// 確保 logs 目錄存在
// 如果沒有設定 LOG_DIR 環境變數，則使用預設路徑
// 注意：這裡的 LOG_DIR 會被 PM2 覆蓋，所以在開發環境下才確保目錄存在
// PM2 會自動處理生產環境的日誌輪轉和收集
const LOG_DIR = process.env.LOG_DIR || path.resolve(__dirname, '..', 'logs');
if (env === 'dev') fs.mkdirSync(LOG_DIR, { recursive: true }); // only ensure dir in dev

// 自動加在每筆 log 上
const defaultMeta = {
    env,
    version,
    hostname: os.hostname(),
    pid: process.pid,
};

// dev：彩色可讀；test/production：純 JSON 給 PM2/收集器
const prettyConsole = format.combine(
    format.colorize({ all: true }),
    format.timestamp({ format: () => dayjs().format('YYYY-MM-DD HH:mm:ss') }),
    format.errors({ stack: true }),
    format.splat(),
    format.printf((info) => {
        const { timestamp, level, message, requestId, ...rest } = info;
        const splat = info[Symbol.for('splat')];
        if (Array.isArray(splat)) {
            for (const v of splat) if (v && typeof v === 'object') Object.assign(rest, v);
        }
        delete rest.level; delete rest.timestamp;
        const rid = requestId ? ` [${requestId}]` : '';
        const meta = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
        return `[${timestamp}] [${level}]${rid} ${message}${meta}`;
    })
);

// JSON 格式的日誌，包含時間戳、錯誤堆疊、splat 參數
const jsonFmt = format.combine(
    format.timestamp(),          // ISO8601
    format.errors({ stack: true }),
    format.splat(),
    format.json()
);

// JSON 格式的 File 日誌
const baseTransports = [
    new transports.Console({
        format: env === 'dev' ? prettyConsole : jsonFmt
    })
];

const devFileTransports = env === 'dev'
    ? [
        new transports.File({
            filename: path.join(LOG_DIR, 'error.log'),
            level: 'error',
            format: jsonFmt,
            maxsize: 50 * 1024 * 1024, // 50MB per file
            maxFiles: 5                 // keep last 5 files
        }),
        new transports.File({
            filename: path.join(LOG_DIR, 'combined.log'),
            format: jsonFmt,
            maxsize: 100 * 1024 * 1024, // 100MB per file
            maxFiles: 5
        })
    ]
    : [];

const logger = createLogger({
    level: env === 'prod' ? 'info' : 'debug',
    defaultMeta,
    transports: [...baseTransports, ...devFileTransports],
    // Avoid crashing if a transport fails (e.g., file permission in dev)
    exitOnError: false,
});

module.exports = logger;
