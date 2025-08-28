// backend/services/ingest/alphavantageIngest.js
const { withConnection } = require('@config/db');
const { DateTime } = require('luxon');

const API = 'https://www.alphavantage.co/query';
const PROVIDER = 'alphavantage';
const TZ_NY = 'America/New_York';
const DEFAULT_DAILY_LIMIT = Number(process.env.ALPHAVANTAGE_DAILY_LIMIT || 25);

// Node 18+ 有全域 fetch；否則動態載入 node-fetch
async function httpFetch(url, options) {
  if (typeof fetch === 'function') return fetch(url, options);
  const { default: nf } = await import('node-fetch');
  return nf(url, options);
}

function todayNYISO() {
  try {
    return DateTime.now().setZone(TZ_NY).toISODate();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** 判斷是否為 premium 或配額訊息 */
function isPremiumMessage(json) {
  const s = (json && (json.Information || json.Note || json['Error Message'] || '')).toString();
  return /premium endpoint/i.test(s);
}
function isRateLimited(json) {
  const s = (json && (json.Note || json.Information || '')).toString();
  return /higher call volume|standard api usage limit|per minute|per day|25 requests per day/i.test(s);
}

/** 將 Alpha Vantage 的 series 轉為我們的欄位 */
function mapSeriesToRows(symbol, series) {
  return Object.entries(series)
    .map(([date, v]) => ({
      symbol,
      trade_date: date,                         // YYYY-MM-DD
      open:   Number(v['1. open']),
      high:   Number(v['2. high']),
      low:    Number(v['3. low']),
      close:  Number(v['4. close']),
      volume: Number(v['6. volume'] || v['7. volume'] || v['8. volume'] || 0),
    }))
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

/** 通用抓取器（依 functionName 取 Daily 或 Daily Adjusted） */
async function fetchDailyGeneric(symbol, functionName, { output = 'compact' } = {}) {
  const url = new URL(API);
  url.searchParams.set('function', functionName);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('datatype', 'json');
  url.searchParams.set('outputsize', output); // 'compact'≈最近100天, 'full'≈20年
  url.searchParams.set('apikey', process.env.ALPHAVANTAGE_API_KEY);

  const res = await httpFetch(url);
  if (!res.ok) throw new Error(`AlphaVantage HTTP ${res.status}`);
  const json = await res.json();

  // 先攔截錯誤/限制訊息
  if (json['Error Message']) throw new Error(`AlphaVantage error for ${symbol}: ${json['Error Message']}`);
  if (isRateLimited(json)) {
    const err = new Error(`AlphaVantage rate limit hit: ${JSON.stringify(json).slice(0, 200)}`);
    err.code = 'RATE_LIMIT';
    err.raw = json;
    throw err;
  }
  if (isPremiumMessage(json)) {
    const msg = json.Information || json.Note || 'Premium endpoint';
    const err = new Error(`AlphaVantage premium endpoint for ${symbol}: ${msg}`);
    err.code = 'PREMIUM';
    throw err;
  }

  const series =
    json['Time Series (Daily)'] ||
    json['Time Series (Daily Adjusted)'] ||
    json['Time Series (Digital Currency Daily)'];

  if (!series) {
    throw new Error(`No series for ${symbol}: ${JSON.stringify(json).slice(0, 200)}`);
  }

  return mapSeriesToRows(symbol, series);
}

/**
 * 依偏好＆可用性抓取：
 * - 若 ALPHAVANTAGE_USE_ADJUSTED=true 先嘗試 ADJUSTED，premium 則 fallback 到 DAILY
 * - 否則直接 DAILY
 */
async function fetchDailySmart(symbol, { output = 'compact' } = {}) {
  const preferAdjusted = String(process.env.ALPHAVANTAGE_USE_ADJUSTED || 'false').toLowerCase() === 'true';

  if (preferAdjusted) {
    try {
      return await fetchDailyGeneric(symbol, 'TIME_SERIES_DAILY_ADJUSTED', { output });
    } catch (e) {
      if (e && e.code === 'PREMIUM') {
        return await fetchDailyGeneric(symbol, 'TIME_SERIES_DAILY', { output });
      }
      throw e;
    }
  } else {
    return await fetchDailyGeneric(symbol, 'TIME_SERIES_DAILY', { output });
  }
}

async function ensureUniqueIndex() {
  const sql = `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_stock_prices_symbol_date'
      ) THEN
        EXECUTE 'CREATE UNIQUE INDEX idx_stock_prices_symbol_date ON public.stock_prices(symbol, trade_date)';
      END IF;
    END $$;
  `;
  await withConnection(console, async (client) => {
    await client.query(sql);
  });
}

/* ------------- 每日用量表（以美東日計） ------------- */

async function ensureUsageTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS public.api_call_usage (
      provider TEXT NOT NULL,
      ymd      DATE NOT NULL,
      count    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (provider, ymd)
    );
  `;
  await withConnection(console, async (client) => {
    await client.query(sql);
  });
}

async function getDailyUsage(provider, ymd) {
  const sql = `SELECT count FROM public.api_call_usage WHERE provider=$1 AND ymd=$2`;
  const row = await withConnection(console, async (client) => {
    const { rows } = await client.query(sql, [provider, ymd]);
    return rows[0];
  });
  return row ? Number(row.count) : 0;
}

async function incrementDailyUsage(provider, ymd, inc = 1) {
  const sql = `
    INSERT INTO public.api_call_usage(provider, ymd, count)
    VALUES ($1, $2, $3)
    ON CONFLICT (provider, ymd) DO UPDATE
      SET count = public.api_call_usage.count + EXCLUDED.count
  `;
  await withConnection(console, async (client) => {
    await client.query(sql, [provider, ymd, inc]);
  });
}

async function setDailyUsage(provider, ymd, count) {
  const sql = `
    INSERT INTO public.api_call_usage(provider, ymd, count)
    VALUES ($1, $2, $3)
    ON CONFLICT (provider, ymd) DO UPDATE
      SET count = GREATEST(public.api_call_usage.count, EXCLUDED.count)
  `;
  await withConnection(console, async (client) => {
    await client.query(sql, [provider, ymd, count]);
  });
}

async function getRemainingQuota(limit = DEFAULT_DAILY_LIMIT) {
  const ymd = todayNYISO();
  await ensureUsageTable();
  const used = await getDailyUsage(PROVIDER, ymd);
  const remain = Math.max(0, limit - used);
  return { ymd, used, limit, remain };
}

/* ------------- Upsert ------------- */

async function upsertPrices(rows = []) {
  if (!rows.length) return 0;

  const cols = ['symbol','trade_date','open','high','low','close','volume'];
  const params = [];
  const values = rows.map((r, i) => {
    params.push(r.symbol, r.trade_date, r.open, r.high, r.low, r.close, r.volume);
    const off = i * cols.length;
    return `($${off+1},$${off+2},$${off+3},$${off+4},$${off+5},$${off+6},$${off+7})`;
  }).join(',');

  const sql = `
    INSERT INTO public.stock_prices (${cols.join(',')})
    VALUES ${values}
    ON CONFLICT (symbol, trade_date) DO UPDATE
      SET open   = EXCLUDED.open,
          high   = EXCLUDED.high,
          low    = EXCLUDED.low,
          close  = EXCLUDED.close,
          volume = EXCLUDED.volume
  `;

  return withConnection(console, async (client) => {
    const res = await client.query(sql, params);
    return res.rowCount || 0;
  });
}

/**
 * 封裝：一次更新多支股票（內建每日 25 次上限控管 & 容錯）
 * @param {Object} opt
 * @param {string[]} opt.symbols
 * @param {'compact'|'full'} [opt.size='compact']
 * @param {string} [opt.filterSinceISO] YYYY-MM-DD（若提供，僅保留該日之後的 rows）
 */
async function ingestAlpha({ symbols = [], size = 'compact', filterSinceISO } = {}) {
  if (!process.env.ALPHAVANTAGE_API_KEY) {
    throw new Error('缺少 ALPHAVANTAGE_API_KEY');
  }
  if (!symbols || symbols.length === 0) return 0;

  await ensureUniqueIndex();
  await ensureUsageTable();

  // 今日剩餘額度（以美東日）
  const quota = await getRemainingQuota();
  if (quota.remain <= 0) {
    console.warn(`[AV] quota exhausted for ${quota.ymd} (used=${quota.used}/${quota.limit}), skip all symbols`);
    return 0;
  }

  // 可處理的 symbols（裁切到剩餘額度）
  const todo = symbols.slice(0, quota.remain);
  const dropped = symbols.slice(quota.remain);
  if (dropped.length) {
    console.warn(`[AV] only ${quota.remain} calls left today; will skip ${dropped.length} symbols: ${dropped.join(', ')}`);
  }

  let total = 0;

  for (let i = 0; i < todo.length; i++) {
    const s = todo[i];
    const tag = `[AV][${i + 1}/${todo.length} ${s}]`;

    // 先把今日用量 +1（供應商算請求數；成功與否都會計）
    const ymd = todayNYISO();
    await incrementDailyUsage(PROVIDER, ymd, 1);

    console.log(`${tag} start fetch (size=${size}${filterSinceISO ? `, since=${filterSinceISO}` : ''})`);

    try {
      // 嘗試抓取（含 ADJUSTED→DAILY fallback）
      let rows = await fetchDailySmart(s, { output: size });
      if (filterSinceISO) rows = rows.filter(r => r.trade_date >= filterSinceISO);
      console.log(`${tag} fetched ${rows.length} rows`);

      if (rows.length) {
        const n = await upsertPrices(rows);
        total += n;
        console.log(`${tag} upserted ${n} rows (cumulative=${total})`);
      } else {
        console.log(`${tag} no rows to upsert`);
      }

    } catch (e) {
      if (e && e.code === 'RATE_LIMIT') {
        console.warn(`${tag} provider says DAILY LIMIT REACHED → stop for today`);
        // 與供應商狀態同步：將本地用量標為已滿，避免本日重複嘗試
        await setDailyUsage(PROVIDER, ymd, DEFAULT_DAILY_LIMIT);
        break; // 結束剩餘 symbols
      }
      // 其他錯誤：跳過這檔，繼續下一檔
      console.error(`${tag} error:`, e.message || e);
    }
  }

  console.log(`[AV] done, total upserted=${total}`);
  return total;
}

module.exports = {
  ingestAlpha,
  upsertPrices,
  // 內部/測試/狀態查詢用
  fetchDailySmart,
  fetchDailyGeneric,
  isPremiumMessage,
  isRateLimited,
  getRemainingQuota,
};
