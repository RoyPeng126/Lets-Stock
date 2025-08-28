// backend/routes/status.js
const express = require('express');
const os = require('os');
const path = require('path');

let logger;
try { logger = require('@utils/logger'); } catch { logger = console; }

const router = express.Router();

// 讀 package.json 顯示版本
const pkg = require(path.resolve(__dirname, '..', 'package.json'));

// 這裡引用你剛改好的 Postgres 版 db.js
const { withConnection } = require('../config/db');

// GET /api/status/health
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    pid: process.pid,
    host: os.hostname(),
  });
});

// GET /api/status/version
router.get('/version', (req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    node: process.version,
    env: process.env.NODE_ENV || 'dev',
  });
});

// GET /api/status/db  —— Postgres 連線測試
router.get('/db', async (req, res) => {
  try {
    const payload = await withConnection(logger, async (client) => {
      // Postgres 沒有 DUAL；也不用 :param 綁定，node-pg 用 $1 位置參數
      const r1 = await client.query('SELECT 1 AS ok;');
      const r2 = await client.query('SELECT NOW() AS now;');
      return {
        okRow: r1.rows[0],   // node-pg 結果在 rows[]
        nowRow: r2.rows[0],
      };
    });

    res.json({ ok: true, env: process.env.DB_ENV || 'test', ...payload });
  } catch (e) {
    res.status(500).json({
      ok: false,
      env: process.env.DB_ENV || 'test',
      error: e.message,
    });
  }
});

module.exports = router;