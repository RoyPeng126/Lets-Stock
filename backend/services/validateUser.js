// services/auth/validateUser.js  (Postgres 版)還要改
 //const { withConnection } = require('@config/db'); 仍可保留，但這版不會用到 DB
require('dotenv').config();

const ACC = process.env.APP_LOGIN_ACCOUNT || 'admin';
const PWD = process.env.APP_LOGIN_PASSWORD || 'changeme';

/**
 * 簡易登入：帳密寫死在環境變數
 * company 參數已忽略（為了兼容舊呼叫）
 */
async function checkUser(company, account, password, logger = console) {
  logger.info?.(`[auth] login try: ${account}`);
  if (account === ACC && password === PWD) {
    return {
      account: ACC,
      name: '使用者',
      department: '',
      departmentId: '',
      email: ''
    };
  }
  return null;
}

module.exports = { checkUser };