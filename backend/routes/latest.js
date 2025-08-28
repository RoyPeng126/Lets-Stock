// backend/routes/latest.js
const router = require('express').Router();
const { withConnection } = require('@config/db');

router.get('/stocks/latest', async (req, res, next) => {
  try {
    const raw = String(req.query.symbols || '')
      .split(/[,\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    const symbols = raw.length ? [...new Set(raw)].slice(0, 20) : null;
    const fallback = ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'TSLA'];

    const sql = `
      WITH ranked AS (
        SELECT
          symbol,
          trade_date::date AS d,
          open, high, low, close, volume,
          LAG(close) OVER (PARTITION BY symbol ORDER BY trade_date) AS prev_close,
          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) AS rn
        FROM stock_prices
        WHERE ($1::text[] IS NULL AND symbol = ANY($2))
           OR ($1::text[] IS NOT NULL AND symbol = ANY($1))
      )
      SELECT
        symbol,
        d AS trade_date,
        open, high, low, close, volume,
        prev_close,
        (close - prev_close)                       AS change,
        CASE WHEN prev_close IS NULL OR prev_close = 0
             THEN NULL
             ELSE (close - prev_close) / prev_close 
        END                                        AS pct_change
      FROM ranked
      WHERE rn = 1
      ORDER BY symbol;
    `;
    const params = [symbols, fallback];
    console.log('SQL: latest pct_change ...')
    const rows = await withConnection(console, async (client) => {
      const { rows } = await client.query(sql, params);
      return rows;
    });

    res.set('Cache-Control', 'no-store'); 
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
