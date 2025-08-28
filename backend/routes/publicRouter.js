// /routes/publicRouter.js
const express = require('express');
const router = express.Router();

// 路由：/api/hello
router.get('/hello', (req, res) => {
    req.log?.info('hello endpoint accessed');
    res.status(200).json({ message: 'hello' });
});

module.exports = router;
