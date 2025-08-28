// src/config/env.js

const SERVICE = Object.freeze({
  WEB: 'WEB',           // 你現在的命名
});

const SECRET_ENV = Object.freeze({
  [SERVICE.WEB]: 'WEB_SECRET',   // 主要使用 WEB_*
});

const TTL_ENV = Object.freeze({
  [SERVICE.WEB]: 'WEB_TTL',
});

// 必要環境變數
const REQUIRED_KEYS = [
  'PORT',
  'DATABASE_URL',
  'APP_LOGIN_ACCOUNT',
  'APP_LOGIN_PASSWORD',
];

console.log('CWD:', process.cwd());

// 基本必填檢查
for (const k of REQUIRED_KEYS) {
  if (!process.env[k]) {
    throw new Error(`[config] Missing env ${k}`);
  }
}

module.exports = { SERVICE, SECRET_ENV, TTL_ENV };