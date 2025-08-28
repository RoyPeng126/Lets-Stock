// backend/scripts/ingest-av-1y.js
require('dotenv').config();
const { ingestDailyPrices } = require('../jobs/dailyIngestAlphaVantage');

(async () => {
  // full + 5 天 
  await ingestDailyPrices({
    outputsize: 'full',
    daysBack: 5,
    // 可選：只跑部分股票
    // symbols: ['AAPL','MSFT','AMZN','GOOGL','TSLA'],
  });
  process.exit(0);
})();
