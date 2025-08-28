const { Pool } = require('pg');
require('dotenv').config();

const configs = {
  test: {
    connectionString: process.env.PG_TEST_URL || process.env.DATABASE_URL,
    schema: process.env.PG_TEST_SCHEMA, // 可選：要用特定 schema 時設定
  },
  production: {
    connectionString: process.env.PG_PROD_URL || process.env.DATABASE_URL,
    schema: process.env.PG_PROD_SCHEMA,
  },
};

const pools = {}; // 各環境的 Postgres 連線池

function needNeonSSL(url) {
  return !!(url && (/neon\.tech/.test(url) || /sslmode=require/.test(url)));
}

async function getPoolByEnv(envName, log = console) {
  const cfg = configs[envName];
  if (!cfg || !cfg.connectionString) {
    throw new Error(`無此資料庫環境設定或缺少 connectionString: ${envName}`);
  }

  if (!pools[envName]) {
    log.info?.(`建立 Postgres 連線池: ${envName}`);
    pools[envName] = new Pool({
      connectionString: cfg.connectionString,
      ssl: needNeonSSL(cfg.connectionString) ? { rejectUnauthorized: false } :
           (process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined),
      max: parseInt(process.env.PG_POOL_MAX || '10', 10),
      idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
    });

    // 觀察 idle client 錯誤
    pools[envName].on('error', (err) => {
      log.error?.('PG idle client error:', err);
    });
  }
  return pools[envName];
}

/**
 * 與原本 API 對齊：
 * withConnection(log, async (client) => { ... return something })
 * - Oracle 的 conn.execute() → 這裡改用 client.query(text, params)
 * - 如果有 config.schema，會設定 search_path
 */
async function withConnection(log, callback) {
  const envName = process.env.DB_ENV || 'test';
  const pool = await getPoolByEnv(envName, log);
  const client = await pool.connect();

  try {
    const cfg = configs[envName];
    if (cfg?.schema) {
      // 類似 Oracle 的 CURRENT_SCHEMA；這裡設 search_path
      await client.query(`SET search_path TO ${cfg.schema}, public`);
    }
    return await callback(client);
  } finally {
    client.release();
  }
}

/** 方便場景：直接查（不需要手動借 client） */
async function query(text, params, log = console) {
  const envName = process.env.DB_ENV || 'test';
  const pool = await getPoolByEnv(envName, log);
  return pool.query(text, params);
}

module.exports = {
  withConnection,
  query,
};
