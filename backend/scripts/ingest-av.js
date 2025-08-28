// backend/scripts/ingest-av.js
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const { ingestDailyPrices } = require('../jobs/dailyIngestAlphaVantage');

// 讀命令列
const argDays = Number(
  (process.argv.find(a => a.startsWith('--withinLastDays=')) || '').split('=')[1]
) || 5;

const symArg = (process.argv.find(a => a.startsWith('--symbols=')) || '').split('=')[1] || '';
const symbols = (symArg || process.env.SYMBOLS || 'AAPL,MSFT,AMZN,GOOGL,TSLA')
  .split(',')
  .map(s => s.trim().toUpperCase());

// 呼叫主流程（只呼叫一次）
ingestDailyPrices({ withinLastDays: argDays, symbols })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
