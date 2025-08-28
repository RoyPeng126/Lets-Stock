import '@/lib/sbadmin2/css/sb-admin-2.min.css';
import 'tabulator-tables/dist/css/tabulator.min.css';
import 'choices.js/public/assets/styles/choices.min.css';

import { apiFetch } from '@/utils/api.js';
import Choices from 'choices.js';
import flatpickr from 'flatpickr';
import { Mandarin } from 'flatpickr/dist/l10n/zh';
import * as echarts from 'echarts';
import { TabulatorFull as Tabulator } from 'tabulator-tables';

let table = null;
let chart = null;
let currentController = null;

function ensureAppleCard() {
  const content = document.getElementById('content');
  if (!content) return;
  let container = content.querySelector(':scope > .container') || content.querySelector('.container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'container page-body py-4';
    [...content.children].forEach(el => {
      if (el.id !== 'topbar-placeholder' && el.id !== 'loadingOverlay') container.appendChild(el);
    });
    content.appendChild(container);
  } else {
    container.classList.add('page-body', 'py-4');
  }
  if (!container.querySelector(':scope > .apple-card')) {
    const card = document.createElement('div');
    card.className = 'apple-card';
    [...container.children].forEach(el => { if (el !== card && el.id !== 'loadingOverlay') card.appendChild(el); });
    container.prepend(card);
  }
}

function ymd(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function defaultRange() {
  const to = new Date(); const from = new Date(); from.setDate(to.getDate() - 90);
  return { from: ymd(from), to: ymd(to) };
}

document.addEventListener('DOMContentLoaded', () => {
  ensureAppleCard();

  // symbols 複選
  const symbolSelect = document.getElementById('symbols');
  const choices = new Choices(symbolSelect, { removeItemButton: true, shouldSort: false, itemSelectText: '' });

  // 日期
  const { from, to } = defaultRange();
  flatpickr('#from', { locale: Mandarin, dateFormat: 'Y-m-d', defaultDate: from, allowInput: true });
  flatpickr('#to',   { locale: Mandarin, dateFormat: 'Y-m-d', defaultDate: to,   allowInput: true });

  // 權重區
  buildWeightInputs(getSelectedSymbols());
  document.getElementById('btn-equal-weights')?.addEventListener('click', () => {
    setEqualWeights(getSelectedSymbols());
  });
  symbolSelect.addEventListener('change', () => buildWeightInputs(getSelectedSymbols()));

  // 事件
  document.getElementById('queryBtn')?.addEventListener('click', simulate);
  document.getElementById('cancelQuery')?.addEventListener('click', () => { currentController?.abort(); resetCancel(); });

  // 初始跑一次
  simulate();
});

function getSelectedSymbols() {
  return Array.from(document.getElementById('symbols')?.selectedOptions || [])
    .map(o => o.value).filter(Boolean);
}

function buildWeightInputs(symbols) {
  const wrap = document.getElementById('weightList');
  wrap.innerHTML = '';
  if (!symbols.length) return;
  symbols.forEach(sym => {
    const row = document.createElement('div');
    row.className = 'd-flex align-items-center gap-2 mb-2';
    row.innerHTML = `
      <div style="width:80px"><strong>${sym}</strong></div>
      <input type="number" class="form-control" id="w_${sym}" min="0" max="100" step="0.1" value="">
      <span class="text-muted">%</span>
    `;
    wrap.appendChild(row);
  });
  setEqualWeights(symbols, false);
}
function setEqualWeights(symbols, focus = true) {
  if (!symbols.length) return;
  const each = 100 / symbols.length;
  symbols.forEach(sym => {
    const el = document.getElementById(`w_${sym}`);
    if (el) el.value = each.toFixed(2);
  });
  if (focus) document.getElementById(`w_${symbols[0]}`)?.focus();
}
function readWeights(symbols) {
  const raw = symbols.map(sym => Number(document.getElementById(`w_${sym}`)?.value || 0));
  const sum = raw.reduce((s,v)=>s+v,0) || 1;
  return raw.map(v => v / sum); // 正規化成 1
}

async function simulate() {
  const symbols = getSelectedSymbols();
  if (!symbols.length) return alert('請至少選擇一檔');
  const from = document.getElementById('from')?.value;
  const to   = document.getElementById('to')?.value;
  const weights = readWeights(symbols);

  // UI
  document.getElementById('queryBtn')?.setAttribute('disabled','true');
  document.getElementById('loadingOverlay')?.classList.remove('d-none');
  document.getElementById('cancelQuery')?.classList.remove('d-none');
  currentController = new AbortController();
  const signal = currentController.signal;

  try {
    const tracks = await Promise.all(symbols.map(async (s) => {
      const qs = new URLSearchParams({ from, to }).toString();
      const res = await apiFetch(`/api/stocks/track/${s}?${qs}`, { signal });
      if (!res.ok) throw new Error(`${s} HTTP ${res.status}`);
      return await res.json(); // { symbol, data: [{trade_date, close, ...}] }
    }));

    const aligned = alignTracks(tracks); // { dates:[], series:{SYM:[close,...]} }
    const portfolio = buildPortfolioCurve(aligned, symbols, weights); // { dates, equity:[...], rets:[...] }
    const metrics = calcMetrics(portfolio, aligned, symbols);

    renderMetrics(metrics.portfolio);
    renderChart(portfolio, aligned, symbols);
    renderTable(metrics.perSymbol, metrics.portfolio);

  } catch (e) {
    if (e.name !== 'AbortError') alert(e.message || '模擬失敗');
  }

  document.getElementById('loadingOverlay')?.classList.add('d-none');
  resetCancel();
  document.getElementById('queryBtn')?.removeAttribute('disabled');
}

function resetCancel() {
  const btn = document.getElementById('cancelQuery');
  if (btn) { btn.classList.add('d-none'); btn.removeAttribute('disabled'); }
}

// 把多檔收盤對齊共同交易日（取交集）
function alignTracks(tracks) {
  const maps = tracks.map(t => {
    const m = new Map();
    for (const r of (t.data||[])) m.set(r.trade_date, Number(r.close));
    return { symbol: t.symbol, map: m };
  });
  let common = null;
  maps.forEach(({map}) => {
    const dates = new Set([...map.keys()]);
    common = common ? new Set([...common].filter(d => dates.has(d))) : dates;
  });
  const dates = [...(common||[])].sort();
  const series = {};
  maps.forEach(({symbol, map}) => {
    series[symbol] = dates.map(d => map.get(d));
  });
  return { dates, series };
}

// 由日報酬線性加權，得到投組淨值
function buildPortfolioCurve(aligned, symbols, weights) {
  const n = aligned.dates.length;
  const prices = symbols.map(s => aligned.series[s]);
  const rets = []; // 投組日報酬
  for (let i=1;i<n;i++){
    let pr = 0;
    for (let k=0;k<symbols.length;k++){
      const p0 = prices[k][i-1], p1 = prices[k][i];
      const r = p0 ? (p1 - p0)/p0 : 0;
      pr += weights[k] * r;
    }
    rets.push(pr);
  }
  const equity = [1];
  for (const r of rets) equity.push(equity.at(-1) * (1 + r));
  return { dates: aligned.dates, equity, rets };
}

function calcMetrics(portfolio, aligned, symbols) {
  // 投組
  const totRet = portfolio.equity.at(-1) - 1;
  const std = stdev(portfolio.rets);
  const annVol = std * Math.sqrt(252);
  const sharpe = annVol ? (avg(portfolio.rets) * 252) / annVol : null;
  const mdd = maxDrawdown(portfolio.equity);

  // 各股
  const perSymbol = symbols.map(s => {
    const p = aligned.series[s];
    const rets = dailyReturns(p);
    return {
      symbol: s,
      pct_change: p[0] ? ((p.at(-1)/p[0] - 1) * 100) : null,
      ann_vol: stdev(rets) * Math.sqrt(252) * 100,
      mdd: maxDrawdownFromPrices(p) * 100
    };
  });

  return {
    portfolio: {
      pct_change: totRet * 100,
      ann_vol: annVol * 100,
      sharpe: sharpe,
      mdd: mdd * 100
    },
    perSymbol
  };
}

function dailyReturns(prices) {
  const rets = [];
  for (let i=1;i<prices.length;i++){
    const p0 = prices[i-1], p1 = prices[i];
    if (p0) rets.push((p1 - p0)/p0);
  }
  return rets;
}
function avg(a){ return a.length? a.reduce((s,v)=>s+v,0)/a.length : 0; }
function stdev(a){ const m = avg(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length||1)); }
function maxDrawdown(equity){
  let peak = equity[0], mdd = 0;
  for (const v of equity){
    if (v > peak) peak = v;
    const dd = (peak - v)/peak;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}
function maxDrawdownFromPrices(p){ return maxDrawdown(priceToEquity(p)); }
function priceToEquity(p){
  const base = p[0] || 1;
  return p.map(x => base ? x/base : 1);
}

function renderMetrics(m) {
  const host = document.getElementById('metrics');
  host.innerHTML = `
    <div class="col-6 col-md-3"><div class="p-3 border rounded-3">
      <div class="text-muted small">區間報酬</div>
      <div class="fs-4 fw-bold">${fmtPct(m.pct_change)}</div>
    </div></div>
    <div class="col-6 col-md-3"><div class="p-3 border rounded-3">
      <div class="text-muted small">年化波動</div>
      <div class="fs-4 fw-bold">${fmtPct(m.ann_vol)}</div>
    </div></div>
    <div class="col-6 col-md-3"><div class="p-3 border rounded-3">
      <div class="text-muted small">Sharpe</div>
      <div class="fs-4 fw-bold">${m.sharpe?.toFixed(2) ?? '-'}</div>
    </div></div>
    <div class="col-6 col-md-3"><div class="p-3 border rounded-3">
      <div class="text-muted small">最大回撤</div>
      <div class="fs-4 fw-bold">${fmtPct(m.mdd)}</div>
    </div></div>
  `;
}
function fmtPct(v){ return (v===null||v===undefined)?'-': `${Number(v).toFixed(2)}%`; }

function renderChart(portfolio, aligned, symbols) {
  const el = document.getElementById('chart-portfolio');
  if (!chart) chart = echarts.init(el);

  const series = [
    {
      name: '投組',
      type: 'line',
      data: portfolio.equity.map(x => (x*100).toFixed(2)), // 以100起始的指數
      smooth: true,
      showSymbol: false
    }
  ];
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { top: 40, right: 16, bottom: 40, left: 48 },
    xAxis: { type: 'category', data: portfolio.dates },
    yAxis: { type: 'value', name: '指數(=100)' },
    series
  });
  window.addEventListener('resize', () => chart.resize());
}

function renderTable(perSymbol, portfolio) {
  const el = document.getElementById('lab-table');
  const rows = [
    ...perSymbol,
    { symbol: 'Portfolio', pct_change: portfolio.pct_change, ann_vol: portfolio.ann_vol, mdd: portfolio.mdd }
  ];
  const cols = [
    { title: '代碼', field: 'symbol' },
    { title: '區間報酬', field: 'pct_change', hozAlign: 'right', formatter: pctFmt },
    { title: '年化波動', field: 'ann_vol', hozAlign: 'right', formatter: pctFmt },
    { title: '最大回撤', field: 'mdd', hozAlign: 'right', formatter: pctFmt },
  ];
  if (!table) {
    table = new Tabulator(el, { data: rows, layout: 'fitDataStretch', columns: cols });
  } else {
    table.setColumns(cols); table.replaceData(rows);
  }
}
function pctFmt(cell){ const v = cell.getValue(); return (v===null||v===undefined)?'': `${Number(v).toFixed(2)}%`; }
