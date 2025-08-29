# 📊 Let's Stock — 前後端開發與部署說明

本專案是一個以 **Vite + SB Admin 2** 打造的多頁式（MPA）前端，串接 **Node.js/Express 後端**、**Neon(Postgres)** 資料庫，並整合 **Alpha Vantage**（股價）、**Google News RSS / GNews**（時事）與 **Gemini API**（AI 解讀）。

---

## 🧱 專案結構

```
project-root/
├─ index.html                 # 首頁（Welcome / 功能導覽）
├─ company.html               # 同業/個股比較 + AI 解讀
├─ dca.html                   # 收益模擬（定期定額）
├─ portfolio.html             # 收益模擬（投組/回測）
├─ report.html                # 報表查詢（下載）
├─ layout/
│  ├─ topnav.html             # 由 main.js 動態載入
│  └─ sidebar.html            # 由 main.js 動態載入
├─ public/                    # 靜態資源（原樣輸出）
├─ src/
│  ├─ main.js                 # 全域初始化（Topnav/Theme/通知/搜尋/時鐘）
│  ├─ company.js              # 同業比較頁（Tabulator/ECharts/AI）
│  ├─ dca.js                  # 定期定額模擬（ECharts/表格）
│  ├─ report.js               # 報表查詢（參數/查詢/匯出）
│  ├─ utils/
│  │  ├─ api.js               # 前端 fetch 包裝
│  │  ├─ notification.js      # 右下角綠色 Toast 通知（下載成功）
│  │  ├─ theme.js             # 深色模式
│  │  ├─ search.js            # Topnav 搜尋
│  │  └─ clock.js             # Topnav 時鐘
│  └─ styles/…                # default.css / custom.css / theme.css
├─ vite.config.mjs            # Vite 設定（可調 base）
├─ backend/
│  ├─ index.js                # Express 入口（掛載路由/cron）
│  ├─ routes/
│  │  ├─ apiRouter.js         # 總路由
│  │  └─ ai.js                # AI 相關路由（/api/ai/...）
│  ├─ services/
│  │  ├─ ai/
│  │  │  ├─ geminiAnalyze.js
│  │  │  └─ geminiNewsAnalyze.js
│  │  └─ stocks/
│  │     └─ summary.js        # /api/stocks/summary 資料服務
│  ├─ jobs/
│  │  ├─ dailyIngestAlphaVantage.js
│  │  └─ dailyIngest.js       # (如有使用別來源)
│  └─ scripts/
│     └─ ingest-av.js         # 批次匯入工具（CLI）
├─ .env                       # Backend 環境變數
└─ package.json
```

---

## 🧰 使用技術

- **前端**：Vite（MPA）、SB Admin 2、Bootstrap 5、Tabulator、ECharts、Choices.js、flatpickr、jspdf、xlsx  
- **後端**：Node.js + Express、node-cron、jsonrepair、@google/generative-ai  
- **資料**：Neon (Postgres)  
- **外部服務**：Alpha Vantage（股價）、Google News RSS（免 key）/ GNews（可選）、Gemini API（AI 解讀）

---

## ⚙️ 安裝與啟動

### 1) 前端

```bash
cd frontend
npm i -D vite
npm run dev
```

> 若網站部署在子路徑（例如 `/lets-stock/`），請在 `vite.config.mjs` 設定：
```js
export default defineConfig({
  base: '/lets-stock/'
})
```
專案內透過 `import.meta.env.BASE_URL` 動態載入 `layout/topnav.html` 等，打包後也能正確取路徑。

**每個頁面必備佔位元素：**
```html
<div id="topbar-placeholder"></div>
<div id="footer-placeholder"></div>
```

### 2) 後端

```bash
cd backend
npm i -D
npm run dev           # nodemon（若有設定）
# 或
node index.js
```

**.env 範例(可直接複製貼上範例內容，但仍需於 ./backend 目錄下建立 .env 檔，並填入自行申請的 API Key)：**
```
# 使用者
APP_LOGIN_ACCOUNT=自行設定
APP_LOGIN_PASSWORD=自行設定

# 資料庫（Neon）
DATABASE_URL="postgresql://neondb_owner:npg_GYb1Z0OCzESs@ep-withered-queen-a1l5fy8t-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# 股價來源
ALPHAVANTAGE_API_KEY=你的AVKey

# AI / 新聞（新聞 Key 可選）
GOOGLE_GENAI_API_KEY=你的GeminiKey
GNEWS_API_KEY=你的GNewsKey  # 可空；將 fallback 至 Google News RSS

# Web
PORT=3002
CORS_ORIGIN=http://localhost:5173

# 排程（可選）
CRON_ENABLED=true
CRON_SCHEDULE=0 4 * * 2-6   # 週二~六每天 04:00 拉前一日資料

NEWS_LOOKBACK_DAYS=7
NEWS_PER_SYMBOL=6

# 你現有的 app secret/TTL 都可留
WEB_SECRET=secret_for_dev_env_WEB
WEB_TTL=2h

# 要抓哪些代號（逗號分隔）
INGEST_SYMBOLS=AAPL,MSFT,AMZN,GOOGL,TSLA


# 回補天數（僅為本程式內的篩選；實際會向 AV 拉 compact=最近~100 天）
INGEST_DAYS_BACK=400


# 開啟排程（true 才會自動跑；否則你可用 CLI 手動執行）
ENABLE_INGEST_CRON=true
```
**申請 API KEY 網址:**
- Alpha Vantage API KEY : https://www.alphavantage.co/support/#api-key
- Gemini API KEY : https://aistudio.google.com/app/apikey
- GNews API KEY : https://gnews.io/


---

## 🔌 API 一覽（後端）

- **股價彙總**  
  `GET /api/stocks/summary?symbols=AAPL,MSFT&from=2025-03-01&to=2025-04-01`  
  回傳區間的平均/最高/最低/總量/漲跌幅等（前端 Tabulator 顯示）。

- **單檔追蹤（模擬用）**  
  `GET /api/stocks/track/:symbol?from=YYYY-MM-DD&to=YYYY-MM-DD`  
  提供 `dca.html` / `portfolio.html` 模擬使用。

- **AI 解讀（含時事）**  
  `POST /api/ai/stock-insights/gemini-news`  
  **Body：**
  ```json
  { "symbols": ["AAPL","MSFT"], "from":"2025-03-05", "to":"2025-04-05", "lookbackDays": 14 }
  ```
  流程：讀 DB 指標 → 抓新聞（以 `to` 回溯 `lookbackDays`）→ Gemini 生成 → `jsonrepair` 穩健解析 → 回傳結構化觀點（含 `company_insights`、`news_considered`）。

---

## 🧪 匯入歷史股價（Alpha Vantage）

> **只要啟動或手動執行一次，系統會依「美東時間」自動比對並把資料**補到「可取得的最新市場日」
- 平日未過美東 16:00 → 補到前一個交易日；
- 平日已過美東 16:00 → 補到當日；
- 週末／休市 → 補到上個交易日。
- 內建每日 25 次（以供應商規則）額度控管與 5 次/分鐘節流；若被供應商回覆「已達每日上限」，本地用量會同步為已滿並停止剩餘請求。

**手動一次性匯入：**
```bash
cd backend
npm run ingest:av:1y
# 預設為近 5 日資料，若需更改請至 backend/scripts/ingest-av-1y.js
```

**安全機制（已內建）**  
- **額度控管**：以供應商日界線計數；若收到「日額已滿」，本地用量同步為 25/25，並停止本日剩餘 symbols。
- **Fallback**：若 TIME_SERIES_DAILY_ADJUSTED 被視為 premium，會自動退回 TIME_SERIES_DAILY。
- **UPSERT**：以 (symbol, trade_date) 唯一鍵 ON CONFLICT 更新，重跑不會重複寫入。

---

## 🖥 前端頁面與邏輯

### 1) `company.html`（同業比較 + AI）
- **查詢/表格**：`src/company.js`  
  - 讀取 symbols/from/to → `GET /api/stocks/summary` → **Tabulator** 渲染  
  - CSV/XLSX/PDF 匯出 → 成功觸發右下角綠色 **Toast** 通知（`utils/notification.js`）
- **AI 解讀（含時事）**：  
  - 點「AI 解讀（雲端/含時事）」→ `POST /api/ai/stock-insights/gemini-news`  
  - 後端回傳 `company_insights` 與 `news_considered`（含可點來源/時間）

### 2) `dca.html`（定期定額模擬）
- 參數（symbols/金額/頻率/區間）→ 依頻率組投入點 →  
  計算 **總投入、持股數、報酬率、（選配）最大回撤** →  
  繪製 ECharts 折線圖 + 明細表（表格高度與其他區塊一致）。

### 3) `report.html`（報表查詢/下載）
- 依選單動態渲染參數 → Query → Tabulator 顯示 → 匯出（成功通知）。  
- **請確認存在**：`<div id="report-table"></div>` 與 `<div id="footer-placeholder"></div>`。

### 4) 共用：`main.js`
- 載入 `layout/topnav.html` → 啟動 **通知 / 深色模式 / 搜尋 / 時鐘** → 載入 Footer  
- 缺少 `#footer-placeholder` 會拋錯，請每頁都放佔位。

---

## 🔔 通知（右下角綠色面板）
- 僅在「**下載成功**」時觸發（CSV/XLSX/PDF）  
- 位置：右下角、可堆疊、自動消失  
- 程式：`src/utils/notification.js`（`notify.downloadOk({ kind, filename })`）

---

## 🌓 深色模式 / 搜尋 / 時鐘
- `utils/theme.js`：記憶使用者偏好（localStorage），Topnav 右上切換  
- `utils/search.js`：Topnav 即時查詢（手機版點漢堡後第一列顯示）  
- `utils/clock.js`：Topnav 右上顯示日期時間（可 12/24 小時）

---

## 🪤 常見問題（Troubleshooting）

- **`/api/ai/stock-insights/gemini-news` 404**：檢查 `routes/ai.js` 是否掛到 `apiRouter`，且 `backend/index.js` 有載入  
- **AI 回傳「模型未回傳合法 JSON」**：確認使用 `jsonrepair` 與降溫 `temperature`  
- **Node 無 `fetch`**：請用 Node 18+（內建 fetch）；舊版需安裝 `node-fetch`  
- **PowerShell 用 `curl` 失敗**：改用 `Invoke-WebRequest`、Postman 或 WSL

---

## 🚀 部署建置

```bash
npm run build        # 產出 dist/
```
- 將 `dist/` 上傳至伺服器目標路徑（根目錄或子路徑）  
- 若放子路徑（例如 `/lets-stock/`），請設定 `vite.config.mjs` 的 `base`，並確保伺服器以該子路徑對外服務

---

