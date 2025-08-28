// backend/jobs/dailyIngestAlphaVantage.js
const { DateTime } = require('luxon');
const { withConnection } = require('@config/db');
const { ingestAlpha, getRemainingQuota } = require('../services/ingest/alphavantageIngest');

const TZ_NY = 'America/New_York';
const MARKET_CLOSE_HOUR = 16; // 16:00 收盤（不考慮延長盤）

function nowNY() {
  return DateTime.now().setZone(TZ_NY);
}
function isAfterCloseNY(dt = nowNY()) {
  return dt.hour > MARKET_CLOSE_HOUR || (dt.hour === MARKET_CLOSE_HOUR && (dt.minute > 0 || dt.second >= 0));
}
function previousBusinessDateISO(dt) {
  let d = dt.minus({ days: 1 });
  while (d.weekday > 5) d = d.minus({ days: 1 }); // 6=Sat, 7=Sun
  return d.toISODate();
}
function latestAvailableMarketDateISO(dt = nowNY()) {
  if (dt.weekday > 5) return previousBusinessDateISO(dt);
  return isAfterCloseNY(dt) ? dt.toISODate() : previousBusinessDateISO(dt);
}

async function getLatestDatesPerSymbol(symbols) {
  const sql = `
    SELECT symbol, MAX(trade_date)::date AS last_date
    FROM public.stock_prices
    WHERE symbol = ANY($1)
    GROUP BY symbol
  `;
  const map = Object.fromEntries(symbols.map(s => [s, null]));
  const rows = await withConnection(console, async (client) => {
    const { rows } = await client.query(sql, [symbols]);
    return rows;
  });
  for (const r of rows) {
    const iso = (r.last_date instanceof Date)
      ? DateTime.fromJSDate(r.last_date).toISODate()
      : DateTime.fromISO(String(r.last_date)).toISODate();
    map[r.symbol] = iso;
  }
  return map;
}

/** 抓取 withinLastDays 天（會交給 ingestAlpha；實際請求數會被每日額度裁切） */
async function ingestDailyPrices({ withinLastDays = 5, symbols = [], size } = {}) {
  if (!symbols || symbols.length === 0) {
    symbols = (process.env.SYMBOLS || 'AAPL,MSFT,AMZN,GOOGL,TSLA')
      .split(',')
      .map(s => s.trim().toUpperCase());
  }
  const outputsize = size || (withinLastDays > 95 ? 'full' : 'compact');
  const sinceISO = DateTime.now().setZone(TZ_NY).minus({ days: withinLastDays + 2 }).toISODate();
  return ingestAlpha({ symbols, size: outputsize, filterSinceISO: sinceISO });
}

/** 啟動時自動判斷是否需要補資料；會受每日額度限制 */
async function ensureFreshMarketDataOnBoot({ symbols }) {
  if (!symbols || symbols.length === 0) {
    symbols = (process.env.SYMBOLS || 'AAPL,MSFT,AMZN,GOOGL,TSLA')
      .split(',')
      .map(s => s.trim().toUpperCase());
  }

  const now = nowNY();
  const todayISO = now.toISODate();
  const afterClose = isAfterCloseNY(now);
  const latestAvail = latestAvailableMarketDateISO(now);

  // 額度狀態（以美東日）
  const quota = await getRemainingQuota();
  console.log(`[autoIngest] quota NY=${quota.ymd} used=${quota.used}/${quota.limit} remain=${quota.remain}`);

  const lastMap = await getLatestDatesPerSymbol(symbols);

  const toFetch = [];
  let withinLastDays = 0;

  for (const sym of symbols) {
    const last = lastMap[sym]; // 可能為 null
    if (!last) {
      toFetch.push(sym);
      withinLastDays = Math.max(withinLastDays, 365);
      continue;
    }
    if (last < latestAvail) {
      const diffDays = Math.ceil(
        DateTime.fromISO(latestAvail).diff(DateTime.fromISO(last), 'days').days
      );
      const need = diffDays + 1; // buffer
      toFetch.push(sym);
      withinLastDays = Math.max(withinLastDays, need);
    } else if (last === todayISO && afterClose) {
      toFetch.push(sym);
      withinLastDays = Math.max(withinLastDays, 2);
    }
  }

  if (toFetch.length > 0 && withinLastDays > 0) {
    console.log(`[autoIngest] NY now=${now.toISO()} latestAvail=${latestAvail} afterClose=${afterClose}`);
    console.log(`[autoIngest] plan symbols=${toFetch.join(', ')} withinLastDays=${withinLastDays} (actual calls limited by daily quota)`);
    await ingestDailyPrices({ withinLastDays, symbols: toFetch });
    console.log('[autoIngest] done (subject to quota)');
  } else {
    console.log(`[autoIngest] up-to-date. latestAvail=${latestAvail}, afterClose=${afterClose}`);
  }
}

module.exports = {
  ingestDailyPrices,
  ensureFreshMarketDataOnBoot,
  nowNY,
  isAfterCloseNY,
  latestAvailableMarketDateISO
};
