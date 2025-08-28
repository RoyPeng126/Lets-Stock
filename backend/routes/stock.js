// routes/stock.js
const express = require('express');
const router = express.Router();
const { withConnection } = require('@config/db');

// GET /api/stocks?symbols=AAPL,TSLA&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  const { symbols = '', from, to } = req.query;
  const syms = String(symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  try {
    const data = await withConnection(console, async (client) => {
      const clauses = [];
      const params = [];
      let i = 1;

      if (syms.length) { clauses.push(`symbol = ANY($${i++})`); params.push(syms); }
      if (from)       { clauses.push(`trade_date >= $${i++}`);  params.push(from); }
      if (to)         { clauses.push(`trade_date <= $${i++}`);  params.push(to); }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const sql = `
        SELECT symbol, trade_date, open, high, low, close, volume
        FROM public.stock_prices
        ${where}
        ORDER BY trade_date, symbol
        LIMIT 10000
      `;
      const { rows } = await client.query(sql, params);
      return rows;
    });
    res.json({ data });
  } catch (e) { next(e); }
});

// GET /api/stocks/summary?symbols=AAPL,TSLA&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/summary', async (req, res, next) => {
  const { symbols = '', from, to } = req.query;
  const syms = String(symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  try {
    const data = await withConnection(console, async (client) => {
      const clauses = [];
      const params = [];
      let i = 1;

      if (syms.length) { clauses.push(`symbol = ANY($${i++})`); params.push(syms); }
      if (from)       { clauses.push(`trade_date >= $${i++}`);  params.push(from); }
      if (to)         { clauses.push(`trade_date <= $${i++}`);  params.push(to); }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const sql = `
        WITH s AS (
          SELECT symbol, trade_date, close, volume
          FROM public.stock_prices
          ${where}
        ), f AS (
          SELECT DISTINCT ON (symbol) symbol, trade_date AS first_date, close AS first_close
          FROM s ORDER BY symbol, trade_date ASC
        ), l AS (
          SELECT DISTINCT ON (symbol) symbol, trade_date AS last_date, close AS last_close
          FROM s ORDER BY symbol, trade_date DESC
        )
        SELECT
          s.symbol,
          COUNT(*)::int               AS days,
          MIN(s.trade_date)           AS first_date,
          MAX(s.trade_date)           AS last_date,
          MIN(s.close)::numeric(10,2) AS min_close,
          MAX(s.close)::numeric(10,2) AS max_close,
          AVG(s.close)::numeric(10,2) AS avg_close,
          AVG(s.volume)::bigint       AS avg_volume,
          ROUND( (l.last_close - f.first_close) / NULLIF(f.first_close,0) * 100, 2) AS pct_change
        FROM s
        JOIN f USING(symbol)
        JOIN l USING(symbol)
        GROUP BY s.symbol, f.first_close, l.last_close
        ORDER BY s.symbol;
      `;
      const { rows } = await client.query(sql, params);
      return rows;
    });
    res.json({ data });
  } catch (e) { next(e); }
});

// GET /api/stocks/track/:symbol?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/track/:symbol', async (req, res, next) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const { from, to } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol_required' });
  try {
    const data = await withConnection(console, async (client) => {
      const clauses = [`symbol = $1`];
      const params = [symbol];
      let i = 2;

      if (from) { clauses.push(`trade_date >= $${i++}`); params.push(from); }
      if (to)   { clauses.push(`trade_date <= $${i++}`); params.push(to); }

      const sql = `
        SELECT trade_date, open, high, low, close, volume
        FROM public.stock_prices
        WHERE ${clauses.join(' AND ')}
        ORDER BY trade_date
      `;
      const { rows } = await client.query(sql, params);
      return rows;
    });
    res.json({ symbol, data });
  } catch (e) { next(e); }
});

module.exports = router;
