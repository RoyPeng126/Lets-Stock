// routes/apiRouter.js — 修正掉 :source? 導致的 path-to-regexp 錯誤
const express = require('express');
const router = express.Router();

// 1) 基本狀態
router.use('/status', require('./status'));

// 2) 股價三支 API
router.use('/stocks', require('./stock'));
router.use('/analysis', require('./analysis'));
router.use('/ai', require('./ai'));
router.use(require('./latest'));
// 3) 報表（走 stock_prices）
const reportData = require('../services/handlers/report/data');
const reportRights = require('../services/handlers/report/rights');
const { ingestAlpha } = require('@services/ingest/alphavantageIngest');
// --- data：無參數 -> 預設 source = 'db'
router.all('/report/data', async (req, res, next) => {
  try {
    req.params = req.params || {};
    req.params.source = 'db';
    const result = await reportData(req);
    res.json(result);
  } catch (err) { next(err); }
});

// --- data：有參數（/report/data/db 或 /report/data/json）
router.all('/report/data/:source', async (req, res, next) => {
  try {
    const result = await reportData(req);
    res.json(result);
  } catch (err) { next(err); }
});

// --- rights：無參數 -> 預設 source = 'static'（或 'db'，依你 rights.js 實作）
router.get('/report/rights', async (req, res, next) => {
  try {
    req.params = req.params || {};
    req.params.source = 'static';
    const result = await reportRights(req);
    res.json(result);
  } catch (err) { next(err); }
});

// --- rights：有參數（/report/rights/static, /report/rights/json）
router.get('/report/rights/:source', async (req, res, next) => {
  try {
    const result = await reportRights(req);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/admin/ingest/alpha  { symbols: ["AAPL","MSFT"], size: "compact"|"full" }
router.post('/ingest/alpha', async (req, res, next) => {
  try {
    const { symbols = [], size = 'compact' } = req.body || {};
    if (!Array.isArray(symbols) || !symbols.length) {
      return res.status(400).json({ error: 'symbols_required' });
    }
    const n = await ingestAlpha({ symbols, size });
    res.json({ ok: true, upserted: n });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
