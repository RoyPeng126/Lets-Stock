# 開發者環境建立說明 (Windows + VS Code)

本頁指南用於將頁面前端 (Vite) 和後端 (Node.js + oracledb) 設定在 Windows + VS Code 環境上使用。

---

## ▶️ 一、必備軟體

| 名稱                                        | 用途                     |
| ----------------------------------------- | ---------------------- |
| Node.js                                   | 執行 backend/前端對 npm 相對應 |
| [Git](https://git-scm.com/)               | 原碼管理                   |
| [VS Code](https://code.visualstudio.com/) | 編輯器                    |
| Oracle Instant Client 11.2                | 讓 `oracledb` Node 模組工作，有裝oracle可能不用裝 |

---

## ▶️ 二、Git 下載頁面

```bash
git clone https://github.com/RoyPeng126/Lets-Stock.git
```

---

## ▶️ 三、安裝 npm 套件

### 📁 backend

```bash
cd backend
npm install
```

### 📁 frontend

```bash
cd frontend
npm install
```

---

## ▶️ 四、Oracle Instant Client 安裝

### 步驟:

1. 下載 [Instant Client 11.2 for Windows 64-bit](https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html)

   - 下載 `instantclient-basic-windows.x64-11.2.0.4.0.zip`

2. 解壓至指定路徑 (ex: `C:\\oracle\\instantclient_11_2`)

3. 新增 Windows 系統環境變數:

   - PATH 補充: `C:\oracle\instantclient_11_2`

---

## ▶️ 五、設定 VS Code

### 配置 `.vscode/launch.json`

已含下列兩種啟動方式：

- 「🔹 啟動 lets-stock-backend」 (backend)
- 「🔹 啟動 lets-stock-frontend (Vite)」

### 執行方式

1. 開啟 VS Code
2. 按下 `Ctrl + Shift + D` 進入「執行與除錯」
3. 上方選單選擇要啟動的專案：
   - `啟動 lets-stock-backend`：啟動後端伺服器（Node.js）
   - `啟動 lets-stock-frontend (Vite)`：啟動前端開發伺服器
4. 點擊 ▶️ 或按 `F5` 執行

📝 注意：兩個服務可同時啟動，建議使用多工作區視窗。

---

## ▶️ 六、前端 API proxy 設定 (vite.config.mjs)

```js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3002',
      changeOrigin: true,
      secure: false,
      rewrite: path => path
    }
  }
}
```

⚠️ 本設定僅在本機開發 (`npm run dev`) 時生效，用於將前端請求的 `/api/*` 轉發到後端。正式部署後不會套用，請改由 nginx 等代理設定處理。

---

## ▶️ 七、常見錯誤排除

| 錯誤                                     | 解決方法                                 |
| -------------------------------------- | ------------------------------------ |
| `Cannot find module 'express'`         | npm install 未執行                      |
| `/api/login` 404                       | Vite 未設定 proxy                       |

---

如需幫你生成一份網路佈局 deploy 指南 (nginx + pm2)，或想製作 `.env` + dotenv 管理環境變數，也可以找我指導啟用。

