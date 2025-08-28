// services/handlers/report/rights.js 
const fs = require('fs');
const path = require('path');

const STATIC_REPORTS = [
  {
    reportId: 101,
    name: '股價區間清單',
    category: 'stocks',
    formatId: 'table',
    params: [
      { key: 'symbols', type: 'multi',  default: ['AAPL','AMZN','TSLA'] },
      { key: 'from',    type: 'date',   required: false },
      { key: 'to',      type: 'date',   required: false }
    ],
    ui: { route: '/api/stocks', method: 'GET' }
  },
  {
    reportId: 102,
    name: '股價匯總分析',
    category: 'stocks',
    formatId: 'summary',
    params: [
      { key: 'symbols', type: 'multi',  default: ['AAPL','AMZN','TSLA'] },
      { key: 'from',    type: 'date' },
      { key: 'to',      type: 'date' }
    ],
    ui: { route: '/api/stocks/summary', method: 'GET' }
  },
  {
    reportId: 103,
    name: '單檔走勢追蹤',
    category: 'stocks',
    formatId: 'chart',
    params: [
      { key: 'symbol', type: 'text', default: 'AAPL' }
    ],
    ui: { route: '/api/stocks/track/:symbol', method: 'GET' }
  }
];

module.exports = async function (req) {
  const { source = 'static' } = req.params || {};
  const log = req.log || console;

  try {
    // 保留 json 載入選項（若放了 data/report-rights.json 就讀它）
    if (source === 'json') {
      const file = path.join(__dirname, '../../../data/report-rights.json');
      if (!fs.existsSync(file)) throw new Error('找不到 report-rights.json');
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }

    // 若 :source 是數字，回傳單一報表
    if (!isNaN(source)) {
      const id = Number(source);
      const one = STATIC_REPORTS.find(r => r.reportId === id);
      return { availableReports: one ? [one] : [] };
    }

    // 預設：回傳靜態清單
    log.info('[report/rights] 使用靜態清單');
    return { availableReports: STATIC_REPORTS };
  } catch (err) {
    log.error(`[report/rights] 錯誤: ${err.message}`);
    throw err;
  }
};
