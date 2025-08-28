// src/home-ticker.js
import { apiFetch } from '@/utils/api.js';

const DEFAULTS = ['AAPL','MSFT','AMZN','GOOGL','TSLA'];

// --- utils ---
function toPercent(p) {
  if (p == null || isNaN(p)) return null;
  const val = Math.abs(p) < 1 ? (p * 100) : p;   // 0.0123 → 1.23%
  return Number.isFinite(val) ? val : null;
}
function fmtPct(p) {
  const val = toPercent(p);
  return val == null ? '—' : `${val.toFixed(2)}%`;
}
function clsByChange(v) {
  if (v == null || isNaN(v)) return 't-flat';
  if (v > 0) return 't-up';
  if (v < 0) return 't-down';
  return 't-flat';
}
function num(v, digits = 2) {
  return v == null || isNaN(v) ? '—' : Number(v).toFixed(digits);
}
function numLocale(v) {
  return v == null || isNaN(v) ? '—' : Number(v).toLocaleString();
}

// 後端沒給變動時，前端自己算
function withDerivedFields(row) {
  const close = row?.close != null ? Number(row.close) : null;
  const prev  = row?.prev_close != null ? Number(row.prev_close) : null;

  let change = row?.change != null ? Number(row.change) : null;
  let pct_change = row?.pct_change != null ? Number(row.pct_change) : null;

  if ((change == null || isNaN(change)) && close != null && prev != null) {
    change = close - prev;
  }
  if ((pct_change == null || isNaN(pct_change)) && close != null && prev != null && prev !== 0) {
    pct_change = ((close - prev) / prev) * 100; // 直接算成百分比
  }

  const date = row?.date || row?.trade_date || '';
  return { ...row, close, prev_close: prev, change, pct_change, date };
}

// --- view（給首頁卡片用，與跑馬燈無關） ---
function card(item) {
  const it = withDerivedFields(item);
  const { symbol, close, change, pct_change, prev_close } = it;
  const cls  = clsByChange(change);
  const sign = change > 0 ? '+' : (change < 0 ? '' : '');

  return `
    <div class="ticker-card">
      <div class="ticker-head"><div class="ticker-symbol">${symbol}</div></div>
      <div class="ticker-price">${numLocale(close)}</div>
      <div class="ticker-change ${cls}">
        ${change != null ? `${sign}${num(change)} (${fmtPct(pct_change)})` : '—'}
      </div>
      <div class="ticker-foot"><span class="ticker-badge">前日: ${numLocale(prev_close)}</span></div>
    </div>
  `;
}

// --- data ---
async function load(symbols = DEFAULTS) {
  const bust = `_t=${Date.now()}`; // 破快取，避免 304 無 body
  const qs = new URLSearchParams({ symbols: symbols.join(',') }).toString();
  const url = `/api/stocks/latest?${qs}&${bust}`;

  const res = await apiFetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  const rows = Array.isArray(json?.data) ? json.data : [];

  // 確保所有 symbols 都有項（即使沒資料）
  const by = Object.fromEntries(rows.map(r => [r.symbol, r]));
  return symbols.map(sym => {
    return by[sym] || { symbol: sym, date: '', close: null, prev_close: null, change: null, pct_change: null };
  });
}

// --- 首頁 mini grid 初始化（若沒有該容器就不做） ---
async function render() {
  const mount = document.getElementById('mini-ticker');
  if (!mount) return;
  const data = await load(DEFAULTS);
  mount.innerHTML = data.map(card).join('');
}
document.addEventListener('DOMContentLoaded', render);

export { load }; // ← 重點：提供給跑馬燈使用