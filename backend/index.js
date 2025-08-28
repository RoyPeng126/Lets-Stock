// index.js
require('dotenv').config({
  path: process.env.DOTENV_CONFIG_PATH || '.env'
});
require('module-alias/register');

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { logMiddleware } = require('@middleware/logs');
const logger = require('@utils/logger');
const { authRequired, authOptional } = require('@middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

// 啟動自動補資料 + 一般手動補資料
const {
  ensureFreshMarketDataOnBoot,
  ingestDailyPrices
} = require('./jobs/dailyIngestAlphaVantage');

const app = express();

// 共用中介層
app.use(logMiddleware);
app.use(cors());
app.use(express.json());

// 無需驗證的 API
app.use('/api', require('@routes/latest'));
app.get('/api/ping', (req, res) => res.json({ message: 'pong' }));
app.use('/api/login', require('@routes/login'));
app.use('/api/status', require('@routes/status'));   // ← /api/status/health、/api/status/version

// 公開頁面（可帶登入態，但不強制）
app.use('/api/public', authOptional({ onFailLog: 'debug' }), require('@routes/publicRouter'));

// 需驗證的 API
app.use('/api', authRequired(['WEB']), require('@routes/apiRouter')); // 其他 API

// 404
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// 統一錯誤處理
app.use(errorHandler);

// ====== Cron（台灣時間 18:05，交易日執行）======
const DEFAULT_SYMBOLS = (process.env.SYMBOLS || 'AAPL,MSFT,AMZN,GOOGL,TSLA')
  .split(',')
  .map(s => s.trim().toUpperCase());

if (process.env.ENABLE_INGEST_CRON === 'true') {
  cron.schedule('5 18 * * 1-5', () => {
    // 小範圍補幾天就好，降低流量（美股若休市也不會寫入）
    ingestDailyPrices({ withinLastDays: 3, symbols: DEFAULT_SYMBOLS })
      .catch(err => console.error('[dailyIngest] 發生錯誤:', err));
  });
  console.log('[cron] AlphaVantage ingest 排程已啟用');
}

// 啟動
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  const env = process.env.NODE_ENV || 'dev';
  const os = require('os');
  const hostname = os.hostname();

  logger.info(` Mock server started on ${hostname}:${PORT}`);
  logger.info(` Environment: ${env}`);

  if (env !== 'production') {
    logger.warn('您目前執行的是非正式環境（dev/test）');
    logger.warn('請勿在正式環境中啟用 dev mode！');
  }

  // 後端啟動即自動判斷是否需要補資料（美東時間/收盤邏輯/週末處理）
  if (process.env.ENABLE_BOOT_INGEST !== 'false') {
    ensureFreshMarketDataOnBoot({ symbols: DEFAULT_SYMBOLS })
      .catch(err => console.error('[autoIngestOnBoot] error:', err));
  }
});