// report.js
import { renderReportWithFormat } from './table_formats/loader.js';
import { showError } from './utils.js';
import 'tabulator-tables/dist/css/tabulator.min.css';
import { initReportMenu, allReports } from './reportMenu.js';
import { renderParams } from './paramRenderer.js';
import { isDebugMode } from '@/utils/auth.js';
import { apiFetch } from '@/utils/api.js';
import { notify } from '@/utils/notification.js';
let currentTable = null;
let reportData = [];
let currentController = null;
const debugMode = isDebugMode();
const titleEl = document.querySelector('h2');

if (titleEl) titleEl.classList.add('page-title'); // 會吃上面更粗的樣式
function ensureAppleCard() {
  const content = document.getElementById('content');
  if (!content) return;

  // 只找內容區的 container（避免抓到 topbar 內的 .container）
  let container =
    content.querySelector(':scope > .container') ||  // 直接子層
    content.querySelector('.container');              // 次之

  // 如果本來沒有 container，就幫你建一個
  if (!container) {
    container = document.createElement('div');
    container.className = 'container page-body py-4';
    // 把 content 下除了 topbar、overlay 以外的節點移進 container
    [...content.children].forEach(el => {
      if (el.id !== 'topbar-placeholder' && el.id !== 'loadingOverlay') {
        container.appendChild(el);
      }
    });
    content.appendChild(container);
  } else {
    container.classList.add('page-body', 'py-4');
  }

  // 若還沒有卡片就包一層
  if (!container.querySelector(':scope > .apple-card')) {
    const card = document.createElement('div');
    card.className = 'apple-card';
    // 把 overlay 以外的節點全部移進卡片
    [...container.children].forEach(el => {
      if (el !== card && el.id !== 'loadingOverlay') card.appendChild(el);
    });
    container.prepend(card);
  }
}

function ensureTableDecor() {
  // 確保表格有外框容器（圓角 + 可捲動）
  const table = document.getElementById('report-table');
  if (!table) return;

  let wrap = document.getElementById('report-table-wrapper') || table.parentElement;
  if (!wrap || !wrap.classList.contains('apple-table-wrap')) {
    const newWrap = document.createElement('div');
    newWrap.id = 'report-table-wrapper';
    newWrap.className = 'apple-table-wrap';
    table.parentNode.insertBefore(newWrap, table);
    newWrap.appendChild(table);
    wrap = newWrap;
  } else {
    wrap.classList.add('apple-table-wrap');
  }

  // 避免表格被壓太窄
  table.style.minWidth = '720px';
}
document.addEventListener('DOMContentLoaded', async () => {
    ensureAppleCard();
    try {
        const fetchedReports = await fetchAllReports();
        const reports = fetchedReports.availableReports ?? fetchedReports;
        reportData = reports;
        await initReportMenu(reports, onReportChange);

        const queryBtn = document.getElementById('queryBtn');
        if (queryBtn) queryBtn.addEventListener('click', queryReport);
        
        const csvBtn = document.querySelector('[data-export="csv"]');
        if (csvBtn) csvBtn.addEventListener('click', exportCSV);

        const xlsxBtn = document.querySelector('[data-export="xlsx"]');
        if (xlsxBtn) xlsxBtn.addEventListener('click', exportXLSX);

        const pdfBtn = document.querySelector('[data-export="pdf"]');
        if (pdfBtn) pdfBtn.addEventListener('click', exportPDF);

        const cancelBtn = document.getElementById('cancelQuery');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (currentController) {
                    currentController.abort();
                }
                cancelBtn.setAttribute('disabled', 'true');
            });
        }



        // 處理 URL 自動查詢邏輯
        const urlParams = new URLSearchParams(window.location.search);
        const reportIdFromUrl = urlParams.get('reportId');
        const paramsJsonFromUrl = urlParams.get('params');
        const autoQuery = urlParams.get('autoQuery') === 'true';

        if (reportIdFromUrl) {
            const report = allReports.find(r => r.reportId === Number(reportIdFromUrl));
            if (report) {
                const reportSelect = document.getElementById('reportSelect');
                if (reportSelect) {
                    reportSelect.value = reportIdFromUrl;
                    reportSelect.dispatchEvent(new Event('change'));
                }

                if (paramsJsonFromUrl) {
                    try {
                        const parsedParams = JSON.parse(decodeURIComponent(paramsJsonFromUrl));
                        applyParamsToForm(reportIdFromUrl, parsedParams);
                    } catch (e) {
                        console.error("解析 URL 參數失敗:", e);
                    }
                }

                if (autoQuery) {
                    setTimeout(() => queryReport(), 100);
                }
            } else {
                showError(`URL 中指定的報表類型 "${reportIdFromUrl}" 不存在。`);
            }
        }
    } catch (error) {
        console.error("初始化報表選單或處理 URL 參數失敗:", error);
        showError("初始化報表選單失敗：" + error.message);
    }
});

function onReportChange(report) {
    if (!report) {
        document.getElementById('params').innerHTML = '';
        return;
    }
    renderParams(report);
}

async function queryReport() {
    const reportId = document.getElementById('reportSelect').value;
    const report = reportData.find(r => r.reportId === Number(reportId));
    if (!report) return;

    const payload = {};
    for (const param of report.params) {
        if (param.type === 'checkbox') {
            const checkboxes = document.querySelectorAll(`input[name='${param.key}']:checked`);
            payload[param.key] = Array.from(checkboxes).map(cb => cb.value);
        } else {
            let inputId = param.func_name || param.key;
            let value = document.getElementById(inputId)?.value || '';
            value = value.trim();
            payload[param.key] = value;
        }
    }

    const queryBtn = document.getElementById('queryBtn');
    queryBtn?.setAttribute('disabled', 'true');

    document.getElementById('loadingOverlay')?.classList.remove('d-none');
    document.getElementById('cancelQuery')?.classList.remove('d-none');

    let result;
    currentController = new AbortController();
    const signal = currentController.signal;

    try {
        result = await fetchReportData(report, payload, signal);
    } catch (err) {
        if (err.name === 'AbortError') {
            showError('查詢已取消');
        } else {
            showError('查詢失敗：' + err.message);
        }
        document.getElementById('loadingOverlay')?.classList.add('d-none');
        resetCancelButton()
        queryBtn?.removeAttribute('disabled');
        return;
    }

    try {
    const table = await renderReportWithFormat(report.formatId, result);
    currentTable = table;
    ensureTableDecor();
    } catch (err) {
        showError('渲染報表失敗：' + err.message);
    }

    document.getElementById('loadingOverlay')?.classList.add('d-none');
    resetCancelButton()
    queryBtn?.removeAttribute('disabled');
}

// ------- 匯出 -------
function exportCSV() {
  if (currentTable) currentTable.download('csv', '報表查詢.csv');
  notify.downloadOk({ kind: 'CSV', filename: '報表查詢.csv' });
}
async function exportXLSX() {
  if (!currentTable) return;
  if (!window.XLSX) {
    const xlsx = await import('xlsx');
    window.XLSX = xlsx;
  }
  currentTable.download('xlsx', '報表查詢.xlsx', { sheetName: '報表查詢' });
  notify.downloadOk({ kind: 'XLSX', filename: '報表查詢.xlsx' });
}
async function exportPDF() {
  if (!currentTable) return;
  try {
    await import('@/fonts/NotoSansTC-Light-bold.js');
    await import('@/fonts/NotoSansTC-Light-normal.js');
    await import('@/fonts/NotoSansTC-Bold.js');
    const jsPDFModule = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');

    const jsPDF = jsPDFModule.jsPDF;
    const autoTable = autoTableModule.default || autoTableModule;
    const doc = new jsPDF();

    const columns = currentTable.getColumns().map(col => ({
      header: col.getDefinition().title,
      dataKey: col.getField()
    }));
    const data = currentTable.getData();

    autoTable(doc, {
      columns,
      body: data,
      styles: { font: 'NotoSansTC-Light', fontSize: 10 },
      margin: { top: 30 },
      didDrawPage(info) {
        doc.setFont('NotoSansTC-Light', 'normal');
        doc.setFontSize(14);
        doc.text('報表查詢', info.settings.margin.left, 22);
      }
    });

    doc.save('報表查詢.pdf');
    notify.downloadOk({ kind: 'PDF', filename: '報表查詢.pdf' });
  } catch (e) {
    showError('PDF 匯出失敗：' + e.message);
  }
}

function resetCancelButton() {
    const btn = document.getElementById('cancelQuery');
    if (btn) {
        btn.classList.add('d-none');
        btn.removeAttribute('disabled');
    }
}

async function fetchAllReports() {
    //todo URL待調整
    if (debugMode) {
        const res = await fetch(`${import.meta.env.BASE_URL}mock/report-rights.json`);
        if (!res.ok) throw new Error(`Mock 報表列表讀取失敗 (${res.status})`);
        return await res.json();
    }
    const res = await apiFetch(`/api/report/rights`);
    if (!res.ok) throw new Error(`報表列表讀取失敗 (${res.status})`);
    return await res.json();
}
    
async function fetchReportData(report, payload, signal) {
  if (debugMode) {
    const delay = Math.random() * 4000 + 1000;
    await new Promise(r => setTimeout(r, delay));
    const mockPath = `${import.meta.env.BASE_URL}mock/report_data/report-data-${report.reportId}.json`;
    const res = await fetch(mockPath, { signal });
    if (!res.ok) throw new Error(`Mock 檔案讀取失敗 (${res.status})`);
    return await res.json();
  }

  // 101：明細（沿用 /api/report/data）
  if (report.reportId === 101) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const body = { reportId: report.reportId, params: payload, user };
    const res = await apiFetch(`/api/report/data`, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json(); // { data: [...] }
  }

  // 102：匯總分析 → GET /api/stocks/summary
  if (report.reportId === 102) {
    const qs = new URLSearchParams({
      symbols: payload.symbols || '',
      from: payload.from || '',
      to: payload.to || '',
    }).toString();

    const res = await apiFetch(`/api/stocks/summary?${qs}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json(); // { data: [...] }
  }

  // 103：走勢追蹤 → GET /api/stocks/track/:symbol
  if (report.reportId === 103) {
    const sym = String(payload.symbol || '').toUpperCase() || 'AAPL';
    const qs = new URLSearchParams({
      from: payload.from || '',
      to: payload.to || '',
    }).toString();

    const res = await apiFetch(`/api/stocks/track/${sym}?${qs}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json(); // { symbol, data: [...] }
  }

  throw new Error(`未知的 reportId: ${report.reportId}`);
}



function applyParamsToForm(reportId, params) {
    const reportSelect = document.getElementById('reportSelect');
    if (reportSelect) {
        reportSelect.value = reportId;
        reportSelect.dispatchEvent(new Event('change'));
    }

    for (const key in params) {
        const value = params[key];
        if (Array.isArray(value)) {
            const checkboxes = document.querySelectorAll(`#params input[name="${key}"][type="checkbox"]`);
            checkboxes.forEach(cb => {
                cb.checked = value.includes(cb.value);
            });
        } else {
            const inputElement = document.querySelector(`#params [name="${key}"]`);
            if (inputElement) {
                inputElement.value = value;
            }
        }
    }
}

export function collectAllParams() {
    const paramElements = document.querySelectorAll('#params select, #params input[type="text"], #params input[type="number"], #params input[type="date"]');
    const result = {};
    paramElements.forEach(el => {
        result[el.id] = el.value?.trim() ?? '';
    });
    return result;
};