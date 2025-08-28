// routes/ai.js
const express = require('express');
const router = express.Router();
const { analyzeWithNews } = require('@services/ai/geminiNewsAnalyze');

/**
 * POST /api/ai/stock-insights/gemini-news
 * body:
 *  - symbols: string[]  (必填)
 *  - from:    'YYYY-MM-DD' (必填)
 *  - to:      'YYYY-MM-DD' (必填)
 *  - perSymbol?: number     (預設 6；每檔最多新聞數)
 *  - lookbackDays?: number  (可選，用來限制新聞視窗 = to 往回 N 天)
 *  - model?: string         (可選，預設 'gemini-1.5-flash-8b')
 */
router.post('/stock-insights/gemini-news', async (req, res, next) => {
  try {
    const {
      symbols = [],
      from,
      to,
      perSymbol = 6,
      lookbackDays = 0,
      model = 'gemini-1.5-flash-8b'
    } = req.body || {};

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ message: 'symbols 不可為空' });
    }
    if (!from || !to) {
      return res.status(400).json({ message: '缺少 from / to' });
    }

    (req.log || console).info(
      '[gemini-news] using model=%s, symbols=%o, %s~%s, perSymbol=%d, lookbackDays=%d',
      model, symbols, from, to, perSymbol, lookbackDays
    );

    const data = await analyzeWithNews(
      { symbols, from, to, perSymbol, lookbackDays, model },
      req.log || console
    );

    // 與前端 normalizeAiJson 相容：回傳 { data: {...} }
    res.json({ data });
  } catch (err) {
    (req.log || console).error(err);
    next(err);
  }
});

module.exports = router;