// routes/analysis.js
const express = require('express');
const router = express.Router();
const { withConnection } = require('@config/db');

// -------- utils: 指標計算 --------
const sma = (arr, n) => {
  const out = Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) out[i] = +(sum / n).toFixed(4);
  }
  return out;
};

const ema = (arr, n) => {
  const out = Array(arr.length).fill(null);
  const k = 2 / (n + 1);
  // 起始用 SMA 當種子
  let seed = 0;
  for (let i = 0; i < n; i++) seed += arr[i] || 0;
  seed /= n;
  out[n - 1] = +seed.toFixed(4);
  for (let i = n; i < arr.length; i++) {
    out[i] = +(arr[i] * k + out[i - 1] * (1 - k)).toFixed(4);
  }
  return out;
};

const rsi = (closes, n = 14) => {
  const gains = Array(closes.length).fill(0);
  const losses = Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains[i] = Math.max(diff, 0);
    losses[i] = Math.max(-diff, 0);
  }
  // Wilder 平滑
  const out = Array(closes.length).fill(null);
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= n; i++) { avgG += gains[i]; avgL += losses[i]; }
  avgG /= n; avgL /= n;
  out[n] = +(100 - (100 / (1 + (avgL === 0 ? Infinity : avgG / avgL)))).toFixed(2);
  for (let i = n + 1; i < closes.length; i++) {
    avgG = (avgG * (n - 1) + gains[i]) / n;
    avgL = (avgL * (n - 1) + losses[i]) / n;
    const rs = avgL === 0 ? Infinity : avgG / avgL;
    out[i] = +(100 - (100 / (1 + rs))).toFixed(2);
  }
  return out;
};

const macd = (closes, shortN = 12, longN = 26, signalN = 9) => {
  const emaShort = ema(closes, shortN);
  const emaLong  = ema(closes, longN);
  const macdLine = closes.map((_, i) =>
    (emaShort[i] != null && emaLong[i] != null) ? +(emaShort[i] - emaLong[i]).toFixed(4) : null
  );
  // 對「有效值」序列做 EMA，位置對齊
  const valid = macdLine.map(v => (v == null ? 0 : v));
  const sigRaw = ema(valid, signalN);
  const signal = macdLine.map((v, i) => (v == null || sigRaw[i] == null) ? null : +sigRaw[i].toFixed(4));
  const hist = macdLine.map((v, i) => (v == null || signal[i] == null) ? null : +(v - signal[i]).toFixed(4));
  return { macdLine, signal, hist };
};

const stddev = (arr, n) => {
  const out = Array(arr.length).fill(null);
  let sum = 0, sum2 = 0;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    sum += x; sum2 += x * x;
    if (i >= n) {
      const y = arr[i - n];
      sum -= y; sum2 -= y * y;
    }
    if (i >= n - 1) {
      const mean = sum / n;
      const v = (sum2 / n) - (mean * mean);
      out[i] = Math.sqrt(Math.max(v, 0));
    }
  }
  return out;
};

const bbands = (closes, n = 20, mult = 2) => {
  const mid = sma(closes, n);
  const sd  = stddev(closes, n);
  const up  = closes.map((_, i) => (mid[i] == null || sd[i] == null) ? null : +(mid[i] + mult * sd[i]).toFixed(4));
  const low = closes.map((_, i) => (mid[i] == null || sd[i] == null) ? null : +(mid[i] - mult * sd[i]).toFixed(4));
  return { middle: mid, upper: up, lower: low };
};

const atr = (highs, lows, closes, n = 14) => {
  const tr = highs.map((h, i) => {
    if (i === 0) return h - lows[i];
    const prevClose = closes[i - 1];
    return Math.max(
      h - lows[i],
      Math.abs(h - prevClose),
      Math.abs(lows[i] - prevClose)
    );
  });
  // 用 EMA 當 Wilder 平滑
  return ema(tr, n);
};

const maxDrawdown = (closes) => {
  let peak = -Infinity, maxDD = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    maxDD = Math.min(maxDD, (c - peak) / peak);
  }
  return +(maxDD * 100).toFixed(2); // %
};

const pctChange = (a, b) => (a == null || b == null || a === 0) ? null : +(((b - a) / a) * 100).toFixed(2);

// -------- 產訊號 & 判斷 --------
function classifyRegime(closes, ema20Arr, atr14Arr) {
  const n = closes.length;
  if (n < 25) return { trend: '資料不足', volatility: '資料不足' };

  const c = closes[n - 1];
  const e = ema20Arr[n - 1];
  const ePrev = ema20Arr[n - 5] ?? e;
  const slope = e != null && ePrev != null ? (e - ePrev) / 5 : 0;

  let trend = '盤整';
  if (e != null) {
    if (c > e && slope > 0) trend = '上升';
    else if (c < e && slope < 0) trend = '下降';
  }

  const atrP = atr14Arr[n - 1] != null && c ? atr14Arr[n - 1] / c : null;
  let vol = '未知';
  if (atrP != null) {
    if (atrP < 0.01) vol = '低';
    else if (atrP < 0.02) vol = '中';
    else vol = '高';
  }
  return { trend, volatility: vol };
}

function genSignals(dates, ohlcv, ma5, ma20, rsi14, macdObj, bb) {
  const out = [];
  for (let i = 1; i < dates.length; i++) {
    // 均線交叉
    if (ma5[i - 1] != null && ma20[i - 1] != null && ma5[i] != null && ma20[i] != null) {
      if (ma5[i - 1] < ma20[i - 1] && ma5[i] > ma20[i]) {
        out.push({ date: dates[i], type: 'GOLDEN_CROSS', note: 'MA5 上穿 MA20' });
      }
      if (ma5[i - 1] > ma20[i - 1] && ma5[i] < ma20[i]) {
        out.push({ date: dates[i], type: 'DEATH_CROSS', note: 'MA5 下穿 MA20' });
      }
    }
    // RSI 70/30
    if (rsi14[i - 1] != null && rsi14[i] != null) {
      if (rsi14[i - 1] < 70 && rsi14[i] >= 70) out.push({ date: dates[i], type: 'RSI_OVERBOUGHT', note: 'RSI 上穿 70' });
      if (rsi14[i - 1] > 30 && rsi14[i] <= 30) out.push({ date: dates[i], type: 'RSI_OVERSOLD', note: 'RSI 下穿 30' });
    }
    // MACD 交叉（線與 signal）
    const mPrev = macdObj.macdLine[i - 1], sPrev = macdObj.signal[i - 1];
    const mNow  = macdObj.macdLine[i],     sNow  = macdObj.signal[i];
    if (mPrev != null && sPrev != null && mNow != null && sNow != null) {
      if (mPrev <= sPrev && mNow > sNow) out.push({ date: dates[i], type: 'MACD_BULL', note: 'MACD 線上穿 Signal' });
      if (mPrev >= sPrev && mNow < sNow) out.push({ date: dates[i], type: 'MACD_BEAR', note: 'MACD 線下穿 Signal' });
    }
    // 布林帶突破
    const c = ohlcv[i].close, up = bb.upper[i], low = bb.lower[i];
    if (c != null && up != null && low != null) {
      if (c > up) out.push({ date: dates[i], type: 'BB_BREAKUP', note: '收盤突破上軌' });
      if (c < low) out.push({ date: dates[i], type: 'BB_BREAKDOWN', note: '收盤跌破下軌' });
    }
    // 量能暴增（大於 20 日均量 1.5 倍）
    const vol = ohlcv[i].volume;
    const vol20 = sma(ohlcv.map(x => x.volume), 20)[i];
    if (vol20 && vol / vol20 >= 1.5) out.push({ date: dates[i], type: 'VOLUME_SURGE', note: '量能 > 20日均量 1.5x' });
  }
  return out;
}

// -------- 共用：抓資料 --------
async function fetchSeries(client, symbol, from, to) {
  const clauses = ['symbol = $1'];
  const params = [symbol.toUpperCase()];
  let i = 2;
  if (from) { clauses.push(`trade_date >= $${i++}`); params.push(from); }
  if (to)   { clauses.push(`trade_date <= $${i++}`); params.push(to);   }
  const sql = `
    SELECT trade_date, open, high, low, close, volume
    FROM public.stock_prices
    WHERE ${clauses.join(' AND ')}
    ORDER BY trade_date
  `;
  const { rows } = await client.query(sql, params);
  // 映射
  const dates = rows.map(r => r.trade_date);
  const ohlcv = rows.map(r => ({
    open: +r.open, high: +r.high, low: +r.low, close: +r.close, volume: +r.volume
  }));
  return { dates, ohlcv };
}

// ========== API ==========

// GET /api/analysis/kline/:symbol?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/kline/:symbol', async (req, res, next) => {
  const { symbol } = req.params;
  const { from, to } = req.query;
  try {
    const data = await withConnection(console, async (client) => {
      const { dates, ohlcv } = await fetchSeries(client, symbol, from, to);
      const closes = ohlcv.map(x => x.close);
      const highs  = ohlcv.map(x => x.high);
      const lows   = ohlcv.map(x => x.low);

      const MA5  = sma(closes, 5);
      const MA10 = sma(closes, 10);
      const MA20 = sma(closes, 20);
      const RSI14 = rsi(closes, 14);
      const MACD  = macd(closes, 12, 26, 9);
      const BB    = bbands(closes, 20, 2);
      const ATR14 = atr(highs, lows, closes, 14);

      const signals = genSignals(dates, ohlcv, MA5, MA20, RSI14, MACD, BB);

      const n = closes.length;
      const ret20 = n >= 20 ? pctChange(closes[n - 20], closes[n - 1]) : null;
      const dd = maxDrawdown(closes);
      const regime = classifyRegime(closes, ema(closes, 20), ATR14);

      return {
        symbol: symbol.toUpperCase(),
        from: from || (dates[0] || null),
        to:   to   || (dates[n - 1] || null),
        dates,
        ohlcv,
        indicators: { MA5, MA10, MA20, RSI14, MACD, BB, ATR14 },
        regime,
        metrics: { return20dPct: ret20, maxDrawdownPct: dd },
        signals
      };
    });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/analysis/summary?symbols=AAPL,TSLA&from=...&to=...
router.get('/summary', async (req, res, next) => {
  const { symbols = '', from, to } = req.query;
  const syms = String(symbols).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!syms.length) return res.json({ data: [] });
  try {
    const data = await withConnection(console, async (client) => {
      const out = [];
      for (const sym of syms) {
        const { dates, ohlcv } = await fetchSeries(client, sym, from, to);
        if (!dates.length) { out.push({ symbol: sym, days: 0 }); continue; }
        const closes = ohlcv.map(x => x.close);
        const ATR14  = atr(ohlcv.map(x => x.high), ohlcv.map(x => x.low), closes, 14);
        const regime = classifyRegime(closes, ema(closes, 20), ATR14);
        const ret = pctChange(closes[0], closes[closes.length - 1]);
        out.push({
          symbol: sym,
          days: dates.length,
          first_date: dates[0],
          last_date: dates[dates.length - 1],
          min_close: Math.min(...closes).toFixed(2),
          max_close: Math.max(...closes).toFixed(2),
          avg_close: (closes.reduce((a,b)=>a+b,0)/closes.length).toFixed(2),
          avg_volume: Math.round(ohlcv.reduce((a,b)=>a+b.volume,0)/ohlcv.length),
          pct_change: ret,
          trend: regime.trend,
          volatility: regime.volatility
        });
      }
      return out;
    });
    res.json({ data });
  } catch (e) { next(e); }
});

// GET /api/analysis/signals/:symbol?from=...&to=...
router.get('/signals/:symbol', async (req, res, next) => {
  const { symbol } = req.params;
  const { from, to } = req.query;
  try {
    const data = await withConnection(console, async (client) => {
      const { dates, ohlcv } = await fetchSeries(client, symbol, from, to);
      const closes = ohlcv.map(x => x.close);
      const MA5 = sma(closes, 5), MA20 = sma(closes, 20);
      const RSI14 = rsi(closes, 14);
      const MACD  = macd(closes, 12, 26, 9);
      const BB    = bbands(closes, 20, 2);
      return genSignals(dates, ohlcv, MA5, MA20, RSI14, MACD, BB);
    });
    res.json({ symbol: symbol.toUpperCase(), signals: data });
  } catch (e) { next(e); }
});

module.exports = router;