// src/company.js  —— 只保留「含時事 AI」版
import '@/lib/sbadmin2/css/sb-admin-2.min.css';
import 'tabulator-tables/dist/css/tabulator.min.css';
import 'choices.js/public/assets/styles/choices.min.css';

import { apiFetch } from '@/utils/api.js';
import { showError } from './utils.js';
import Choices from 'choices.js';
import flatpickr from 'flatpickr';
import { Mandarin } from 'flatpickr/dist/l10n/zh';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import { notify } from '@/utils/notification.js';

let table = null;
let currentController = null;

// ------- 版型輔助（沿用 report.js 的卡片/表格裝飾） -------
function ensureAppleCard() {
  const content = document.getElementById('content');
  if (!content) return;

  let container =
    content.querySelector(':scope > .container') ||
    content.querySelector('.container');

  if (!container) {
    container = document.createElement('div');
    container.className = 'container page-body py-4';
    [...content.children].forEach(el => {
      if (el.id !== 'topbar-placeholder' && el.id !== 'loadingOverlay') {
        container.appendChild(el);
      }
    });
    content.appendChild(container);
  } else {
    container.classList.add('page-body', 'py-4');
  }

  if (!container.querySelector(':scope > .apple-card')) {
    const card = document.createElement('div');
    card.className = 'apple-card';
    [...container.children].forEach(el => {
      if (el !== card && el.id !== 'loadingOverlay') card.appendChild(el);
    });
    container.prepend(card);
  }
}

function ensureTableDecor() {
  const el = document.getElementById('peers-table');
  if (!el) return;

  let wrap = el.parentElement;
  if (!wrap || !wrap.classList.contains('apple-table-wrap')) {
    const newWrap = document.createElement('div');
    newWrap.id = 'peers-table-wrapper';
    newWrap.className = 'apple-table-wrap';
    el.parentNode.insertBefore(newWrap, el);
    newWrap.appendChild(el);
    wrap = newWrap;
  } else {
    wrap.classList.add('apple-table-wrap');
  }
  el.style.minWidth = '720px';
}

// ------- 參數 / 預設 -------
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return { from: ymd(from), to: ymd(to) };
}

// ------- 初始化 -------
document.addEventListener('DOMContentLoaded', () => {
  ensureAppleCard();

  // Symbols（複選）
  const symbolSelect = document.getElementById('symbols');
  new Choices(symbolSelect, {
    removeItemButton: true,
    shouldSort: false,
    itemSelectText: ''
  });

  // 日期
  const { from, to } = defaultRange();
  flatpickr('#from', { locale: Mandarin, dateFormat: 'Y-m-d', defaultDate: from, allowInput: true });
  flatpickr('#to',   { locale: Mandarin, dateFormat: 'Y-m-d', defaultDate: to,   allowInput: true });

  // 事件
  document.getElementById('queryBtn')?.addEventListener('click', query);
  document.querySelector('[data-export="csv"]')?.addEventListener('click', exportCSV);
  document.querySelector('[data-export="xlsx"]')?.addEventListener('click', exportXLSX);
  document.querySelector('[data-export="pdf"]')?.addEventListener('click', exportPDF);
  document.getElementById('cancelQuery')?.addEventListener('click', () => {
    if (currentController) currentController.abort();
    resetCancel();
  });

  // ✅ 只綁「含時事」按鈕
  document.getElementById('btn-ai-gemini-news')?.addEventListener('click', askGeminiWithNews);

  // 首次查詢
  query();
});

// ------- 讀取參數 -------
function readParams() {
  const symbols = Array.from(document.getElementById('symbols')?.selectedOptions || [])
    .map(o => o.value)
    .join(',');
  const from = document.getElementById('from')?.value || '';
  const to   = document.getElementById('to')?.value || '';
  return { symbols, from, to };
}

// ------- 查詢主流程 -------
async function query() {
  const { symbols, from, to } = readParams();
  if (!symbols) return showError('請至少選擇一個股票代碼');

  document.getElementById('queryBtn')?.setAttribute('disabled', 'true');
  document.getElementById('loadingOverlay')?.classList.remove('d-none');
  document.getElementById('cancelQuery')?.classList.remove('d-none');

  currentController = new AbortController();
  const signal = currentController.signal;

  try {
    const qs = new URLSearchParams({ symbols, from, to }).toString();
    const res = await apiFetch(`/api/stocks/summary?${qs}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json(); // { data: [...] }
    renderTable(json?.data || []);
  } catch (err) {
    if (err.name === 'AbortError') showError('查詢已取消');
    else showError(err.message || '查詢失敗');
  }

  document.getElementById('loadingOverlay')?.classList.add('d-none');
  resetCancel();
  document.getElementById('queryBtn')?.removeAttribute('disabled');
}

// ------- 表格 -------
function renderTable(rows) {
  ensureTableDecor();
  const el = document.getElementById('peers-table');
  if (!el) return;

  const cols = buildColumns(rows);
  if (!table) {
    table = new Tabulator(el, {
      data: rows,
      layout: 'fitDataStretch',
      reactiveData: true,
      pagination: true,
      paginationSize: 20,
      columns: cols
    });
  } else {
    table.setColumns(cols);
    table.replaceData(rows);
  }
}
function titleOf(key) {
  const map = {
    symbol: '代碼',
    start_date: '起始日',
    end_date: '結束日',
    days: '交易日數',
    close_avg: '平均收盤',
    close_min: '最低收盤',
    close_max: '最高收盤',
    pct_change: '區間漲跌幅(%)',
    volume_avg: '平均量',
    volume_sum: '總量',
  };
  return map[key] || key;
}
function buildColumns(rows) {
  const keys = rows?.[0] ? Object.keys(rows[0]) : ['symbol'];
  return keys.map(k => ({
    title: titleOf(k),
    field: k,
    hozAlign: typeof rows?.[0]?.[k] === 'number' ? 'right' : 'left',
    formatter: numberFormatterIfNeeded(k)
  }));
}
function numberFormatterIfNeeded(key) {
  const percentKeys = ['pct_change'];
  if (percentKeys.includes(key)) {
    return cell => {
      const v = cell.getValue();
      if (v === null || v === undefined || v === '') return '';
      return Number(v).toFixed(2) + '%';
    };
  }
  return cell => {
    const v = cell.getValue();
    if (typeof v === 'number') return v.toLocaleString();
    return v ?? '';
  };
}

// ------- 匯出（含右下角綠色通知） -------
function exportCSV() {
  if (table) table.download('csv', '同業比較.csv');
  notify.downloadOk({ kind: 'CSV', filename: '同業比較.csv' });
}
async function exportXLSX() {
  if (!table) return;
  if (!window.XLSX) {
    const xlsx = await import('xlsx');
    window.XLSX = xlsx;
  }
  table.download('xlsx', '同業比較.xlsx', { sheetName: '同業比較' });
  notify.downloadOk({ kind: 'XLSX', filename: '同業比較.xlsx' });
}
async function exportPDF() {
  if (!table) return;
  try {
    await import('@/fonts/NotoSansTC-Light-bold.js');
    await import('@/fonts/NotoSansTC-Light-normal.js');
    await import('@/fonts/NotoSansTC-Bold.js');
    const jsPDFModule = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');

    const jsPDF = jsPDFModule.jsPDF;
    const autoTable = autoTableModule.default || autoTableModule;
    const doc = new jsPDF();

    const columns = table.getColumns().map(col => ({
      header: col.getDefinition().title,
      dataKey: col.getField()
    }));
    const data = table.getData();

    autoTable(doc, {
      columns,
      body: data,
      styles: { font: 'NotoSansTC-Light', fontSize: 10 },
      margin: { top: 30 },
      didDrawPage(info) {
        doc.setFont('NotoSansTC-Light', 'normal');
        doc.setFontSize(14);
        doc.text('同業比較', info.settings.margin.left, 22);
      }
    });

    doc.save('同業比較.pdf');
    notify.downloadOk({ kind: 'PDF', filename: '同業比較.pdf' });
  } catch (e) {
    showError('PDF 匯出失敗：' + e.message);
  }
}

// ------- 其他 -------
function resetCancel() {
  const btn = document.getElementById('cancelQuery');
  if (btn) {
    btn.classList.add('d-none');
    btn.removeAttribute('disabled');
  }
}
function getSelectedSymbols() {
  const sel = document.getElementById('symbols');
  if (sel && sel.tagName === 'SELECT') {
    const vals = Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
    if (vals.length) return vals.map(s => s.toUpperCase());
  }
  return ['AAPL','MSFT','AMZN','GOOGL','TSLA'];
}

// ------- ✅ 只保留「含時事」的 AI 呼叫 -------
async function askGeminiWithNews(){
  const symbols = getSelectedSymbols();
  const from = document.getElementById('from').value;
  const to   = document.getElementById('to').value;
  const lookbackDays = 7;

  const res = await apiFetch('/api/ai/stock-insights/gemini-news', {
    method: 'POST',
    body: JSON.stringify({ symbols, from, to, lookbackDays })
  });

  const json = await res.json().catch(()=> ({}));
  if (!res.ok) {
    console.error('AI(含時事) error:', json);
    return alert(json?.message || 'AI(含時事) 發生錯誤');
  }

  const ai = normalizeAiJson(json, { symbols, from, to });
  renderAiPanel(ai);
}

// ------- JSON 兼容處理 + 渲染到 #ai-panel -------
function normalizeAiJson(j, ctx = {}) {
  if (!j || typeof j !== 'object') return null;
  if (j.data && typeof j.data === 'object') j = j.data;
  if (j.result && typeof j.result === 'object') j = j.result;

  const fallbackTitle = 'AI 分析結果（含時事）';
  const fallbackTime  = { from: ctx.from || '', to: ctx.to || '' };
  const fallbackTickers = Array.isArray(ctx.symbols) ? ctx.symbols : String(ctx.symbols || '').split(',').filter(Boolean);

  const keyFindings = j.key_findings || j.findings || [];
  const nextSteps   = j.next_steps   || j.nextSteps || [];
  const highlights  = j.highlights   || [];
  const risks       = j.risks        || [];
  const macro       = j.macro || [];
  const company_insights = j.company_insights || [];
  const news_considered  = j.news_considered  || j.news || [];

  return {
    title: j.title || fallbackTitle,
    timeframe: j.timeframe || fallbackTime,
    tickers: j.tickers || fallbackTickers,
    key_findings: Array.isArray(keyFindings) ? keyFindings : [],
    highlights: Array.isArray(highlights) ? highlights : [],
    risks: Array.isArray(risks) ? risks : [],
    next_steps: Array.isArray(nextSteps) ? nextSteps : [],
    macro: Array.isArray(macro) ? macro : [],
    company_insights: Array.isArray(company_insights) ? company_insights : [],
    news_considered: Array.isArray(news_considered) ? news_considered : []
  };
}

function renderAiPanel(ai) {
  const root = document.getElementById('ai-panel');
  if (!root) return;
  root.classList.remove('d-none');

  const esc = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // 建立 newsMap 讓 drivers[id] 能對到標題/連結
  const newsMap = Object.fromEntries((ai.news_considered || []).map(n => [n.id, n]));

  const renderList = (title, arr = []) => {
    if (!arr.length) return '';
    return `
      <div class="mb-3">
        <div class="fw-bold mb-1">${esc(title)}</div>
        <ul class="mb-0">
          ${arr.map(x => `<li>${esc(String(x))}</li>`).join('')}
        </ul>
      </div>`;
  };

  // ✅ 修正版：把 drivers 逐筆展開成 [連結] — why，並加上 stance / confidence
  const renderCompany = (items = []) => {
    items = (Array.isArray(items) ? items : []).filter(it => it && typeof it === 'object');
    if (!items.length) return '';

    const stanceText = s => s === 'bullish' ? '看多' : s === 'bearish' ? '看空' : '中性';
    const stanceCls  = s => s === 'bullish' ? 'text-success' : s === 'bearish' ? 'text-danger' : 'text-secondary';

    const li = items.map(it => {
      const drivers = Array.isArray(it.drivers) ? it.drivers : [];
      const driversHTML = (Array.isArray(it.drivers) ? it.drivers : [])
        .slice(0, 3)
        .map(d => {
          const idRaw = (d?.id || '').trim();
          const whyRaw = (d?.why || '').trim();
          if (!whyRaw) return ''; // 沒理由就不顯示

          // 這些都視為佔位符：string、string1、n/a、-，或是不在新聞清單裡的 id
          const looksPlaceholder =
            !idRaw ||
            /^string\d*$/i.test(idRaw) ||
            /^n\/?a$/i.test(idRaw) ||
            idRaw === '-' ||
            !newsMap[idRaw];

          const news = looksPlaceholder ? null : newsMap[idRaw];
          const label = news
            ? (news.url
                ? `<a href="${esc(news.url)}" target="_blank" rel="noopener">${esc(news.title || idRaw)}</a>`
                : esc(news.title || idRaw))
            : ''; // 佔位符或找不到就不顯示左側標籤

          // 有有效新聞就顯示「[標題] — why」，否則只顯示 why
          return `<li>${label ? `${label} — ` : ''}${esc(whyRaw)}</li>`;
        })
        .filter(Boolean)
        .join('');

      const watchHTML = (Array.isArray(it.watch) ? it.watch : []).map(esc).join('、');
      const nextHTML  = (Array.isArray(it.next_steps) ? it.next_steps : []).map(esc).join('、');

      const conf = (typeof it.confidence === 'number') ? `${Math.round(it.confidence * 100)}%` : '—';
      const fallbackTag = it._fallback ? ' <span class="badge bg-secondary ms-1">fallback</span>' : '';

      return `
        <li class="mb-2">
          <div class="d-flex align-items-center gap-2 mb-1">
            <b class="me-2">${esc(it.symbol || '')}</b>
            <span class="${stanceCls(it.stance)} small">${esc(stanceText(it.stance || 'neutral'))}</span>
            <span class="text-muted small">conf: ${conf}</span>${fallbackTag}
          </div>
          <div class="mb-1">${esc(it.view || '')}</div>
          ${driversHTML ? `<div class="small"><b>驅動因子：</b><ul class="mb-1 ms-3">${driversHTML}</ul></div>` : ''}
          ${watchHTML   ? `<div class="small"><b>觀察重點：</b>${watchHTML}</div>` : ''}
          ${nextHTML    ? `<div class="small"><b>下一步：</b>${nextHTML}</div>` : ''}
        </li>`;
    }).join('');

    return `
      <div class="mb-3">
        <div class="fw-bold mb-1">公司觀點</div>
        <ul class="mb-0">${li}</ul>
      </div>`;
  };

  const renderNews = (items = []) => {
    if (!items.length) return '';
    return `
      <div class="mb-2">
        <div class="fw-bold mb-1">參考新聞（模型使用）</div>
        <ul class="mb-0">
          ${items.map(n => `
            <li>
              <b>${esc(n.symbol || '')}</b>｜
              ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title || '')}</a>` : esc(n.title || '')}
              <span class="text-muted"> ${esc(n.source || '')}・${esc((n.published_at || '').slice(0,16))}</span>
            </li>`).join('')}
        </ul>
      </div>`;
  };
  const noNews = (ai.news_considered || []).length === 0;
  const hint = noNews ? '<div class="text-muted small mb-2">（此期間未取得新聞；以下為純數字解讀）</div>' : '';
  root.innerHTML = `
    <div class="apple-card mt-3" style="padding:16px;">
      <h4 class="mb-2">${esc(ai.title || 'AI 分析結果（含時事）')}</h4>
      <div class="text-muted mb-3">
        期間：${esc(ai.timeframe?.from || '')} ~ ${esc(ai.timeframe?.to || '')}　
        股票：${esc((ai.tickers || []).join(', '))}
      </div>
      ${hint}
      ${renderList('重點結論', ai.key_findings)}
      ${renderCompany(ai.company_insights)}
      ${renderList('風險提示', ai.risks)}
      ${renderList('下一步建議', ai.next_steps)}
      ${renderNews(ai.news_considered)}
    </div>`;
}

