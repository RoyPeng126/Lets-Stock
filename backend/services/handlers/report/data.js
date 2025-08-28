// backend/services/handlers/report/data.js
const { withConnection } = require('@config/db');

module.exports = async function (req) {
  const body = req.body || {};
  const query = req.query || {};
  const { source = 'db' } = req.params || {};
  const log = req.log || console;

  const symbolsParam = body.symbols || query.symbols || body.params?.symbols || ['AAPL','AMZN','TSLA'];
  const fromParam = body.from || query.from || body.params?.from || null;
  const toParam   = body.to   || query.to   || body.params?.to   || null;

  const symbols = Array.isArray(symbolsParam)
    ? symbolsParam.map(s => String(s).trim().toUpperCase()).filter(Boolean)
    : String(symbolsParam).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  if (source !== 'db') throw new Error(`不支援的來源 source: ${source}`);

  return await withConnection(log, async (client) => {
    const params = [];
    let i = 1;
    const where = [];

    where.push(`symbol = ANY($${i++})`);
    params.push(symbols);

    if (fromParam) { where.push(`trade_date >= $${i++}`); params.push(fromParam); }
    if (toParam)   { where.push(`trade_date <= $${i++}`); params.push(toParam); }

    const sql = `
      SELECT symbol, trade_date, open, high, low, close, volume
      FROM public.stock_prices
      WHERE ${where.join(' AND ')}
      ORDER BY trade_date, symbol
      LIMIT 5000
    `;

    const { rows } = await client.query(sql, params);
    return { data: rows };
  });
};
