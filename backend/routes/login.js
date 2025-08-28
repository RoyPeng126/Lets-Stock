// routes/login.js  — 精簡版（不需要 company，serviceName 可省略）
const express = require('express');
const router = express.Router();

// 確認這個別名指到你現在的 auth 檔案（寫死帳密版）
// 若不是，改成：const { checkUser } = require('../services/auth/checkUser');
const { checkUser } = require('@services/validateUser');

const { sign } = require('@services/jwt');
const { AppError, BadRequestError, UnauthorizedError } = require('@errors');

router.post('/', async (req, res) => {
  const { account, password, serviceName } = req.body || {};

  // 只驗 account/password；serviceName 可省略（jwt 內預設 WEB）
  const missing = ['account', 'password'].filter((k) => !req.body?.[k]);
  if (missing.length) {
    req.log.error(`Login Error: 缺少欄位: ${missing.join(', ')}`);
    throw new BadRequestError('缺少必要欄位');
  }

  try {
    // 帳密驗證（你目前的 checkUser 是寫死帳密版，company 參數可傳 undefined）
    const user = await checkUser(undefined, account, password, req.log);
    if (!user) {
      throw new UnauthorizedError('帳號或密碼錯誤');
    }

    // JWT payload（用小寫欄位，對齊你新的 checkUser 回傳）
    const payload = {
      account: user.account,
      name: user.name || '',
      departmentId: user.departmentId || '',
      department: user.department || '',
      email: user.email || '',
      serviceName: (serviceName || 'WEB').toUpperCase(),
    };

    const token = sign(payload, serviceName); // serviceName 可為空，sign 內預設 WEB

    // TTL 顯示（僅回應用，實際過期以 token 為準）
    const expiresIn =
      process.env.WEB_TTL ||
      process.env.DEFAULT_TTL ||
      '2h';

    req.log.info(`使用者 ${user.account}【${payload.serviceName}】 登入成功`);

    res.json({
      message: '登入成功',
      tokenType: 'Bearer',
      token,
      expiresIn,
      user: {
        account: user.account,
        name: user.name || '',
        department: user.department || '',
        email: user.email || '',
        departmentId: user.departmentId || '',
        serviceName: payload.serviceName,
      },
    });
  } catch (err) {
    req.log.error(`Login Error: ${err.stack || err.message || err}`);
    if (err instanceof AppError) {
      const status = err.status || 500;
      return res.status(status).json({
        error: err.code || 'ERROR',
        message: status >= 500 ? '伺服器錯誤' : err.message,
        requestId: req.requestId,
      });
    }
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: '伺服器錯誤',
      requestId: req.requestId,
    });
  }
});

module.exports = router;