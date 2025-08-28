// backend/services/ai/geminiNewsAnalyze.js
const { withConnection } = require('@config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/* =========================================================
 * 0) 公用工具
 * =======================================================*/
function getGenAI() {
  const key = process.env.GOOGLE_GENAI_API_KEY;
  if (!key) throw new Error('缺少 GOOGLE_GENAI_API_KEY');
  return new GoogleGenerativeAI(key);
}
function escQ(s) { return encodeURIComponent(String(s || '').trim()); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isQuotaErr(e) {
  const msg = String(e?.message || '');
  return /429|Too Many Requests|quota/i.test(msg);
}

function parseRetryMs(e) {
  const msg = String(e?.message || '');
  const m = msg.match(/"retryDelay":"(\d+)s"/);
  if (m) {
    const ms = Number(m[1]) * 1000;
    return Math.min(90_000, Math.max(1_000, ms)); // 1s ~ 90s
  }
  return 3_000;
}
function ymd(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** fetch with timeout（Node18 原生 fetch 不支援 timeout 參數） */
async function fetchWithTimeout(url, ms = 12000, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

/* =========================================================
 * 1) 指標計算 + 匯總（from DB）
 * =======================================================*/
function calcMetrics(rows) {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
  const first = Number(sorted[0].close);
  const last  = Number(sorted.at(-1).close);
  const totalReturn = first ? (last - first) / first : null;

  const rets = [];
  for (let i = 1; i < sorted.length; i++) {
    const p0 = Number(sorted[i - 1].close), p1 = Number(sorted[i].close);
    if (p0) rets.push((p1 - p0) / p0);
  }
  const mean = rets.reduce((s, v) => s + v, 0) / (rets.length || 1);
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length || 1);
  const volatility = Math.sqrt(variance);

  let best = { date: null, pct: -Infinity }, worst = { date: null, pct: Infinity };
  for (let i = 1; i < sorted.length; i++) {
    const p0 = Number(sorted[i - 1].close), p1 = Number(sorted[i].close);
    const pct = p0 ? (p1 - p0) / p0 : 0;
    if (pct > best.pct) best = { date: sorted[i].trade_date, pct };
    if (pct < worst.pct) worst = { date: sorted[i].trade_date, pct };
  }
  const volumeTotal = sorted.reduce((s, r) => s + Number(r.volume || 0), 0);

  return { totalReturn, volatility, best, worst, volumeTotal, days: sorted.length };
}

async function fetchSummaryFromDB({ symbols = [], from, to }, log = console) {
  const sql = `
    SELECT symbol, trade_date::date, open, high, low, close, volume
    FROM stock_prices
    WHERE ($1::text[] IS NULL OR symbol = ANY($1))
      AND trade_date BETWEEN $2::date AND $3::date
    ORDER BY symbol, trade_date
  `;
  const params = [symbols.length ? symbols : null, from, to];

  return withConnection(log, async (client) => {
    const { rows } = await client.query(sql, params);
    const by = {};
    for (const r of rows) (by[r.symbol] ||= []).push(r);

    return Object.entries(by).map(([symbol, rs]) => {
      const m = calcMetrics(rs);
      return {
        symbol,
        firstClose: rs[0]?.close ?? null,
        lastClose: rs.at(-1)?.close ?? null,
        totalReturn: m?.totalReturn ?? null,
        volatility: m?.volatility ?? null,
        bestDay: m?.best ?? null,
        worstDay: m?.worst ?? null,
        volumeTotal: m?.volumeTotal ?? null,
        tradingDays: m?.days ?? rs.length,
      };
    });
  });
}

/* =========================================================
 * 2) 新聞抓取：RSS → GNews（處理 429；過濾日期）
 * =======================================================*/
const COMPANY_HINTS = {
  AAPL: 'Apple', MSFT: 'Microsoft', AMZN: 'Amazon',
  GOOGL: 'Alphabet', GOOG: 'Alphabet', TSLA: 'Tesla',
};

  async function fetchNewsRSS(query, { from, to }, maxItems = 4) {
    const url = `https://news.google.com/rss/search?q=${escQ(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetchWithTimeout(url, 12000).catch(() => null);
    if (!res || !res.ok) return [];
    const xml = await res.text();

    // 以毫秒時間戳過濾 (inclusive)
    const fromMs = from ? Date.parse(typeof from === 'string' ? `${from}T00:00:00Z` : from) : -Infinity;
    const toMs   = to   ? Date.parse(typeof to   === 'string' ? `${to}T23:59:59.999Z` : to) :  Infinity;

    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) && items.length < maxItems) {
      const block = m[1];
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || [])[1]
        || (block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
      const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
      const pub  = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
      const src  = (block.match(/<source.*?>(.*?)<\/source>/) || [])[1] || 'Google News';

      const d = pub ? new Date(pub) : null;
      const t = d?.getTime?.();
      if (!Number.isFinite(t)) continue;              // 沒有可解析日期 → 丟掉
      if (t < fromMs || t > toMs) continue;           // 超出視窗 → 丟掉

      items.push({
        title: title.trim(),
        url: link.trim(),
        source: src.trim(),
        published_at: new Date(t).toISOString(),
        summary: ''
      });
    }
    return items;
  }


async function fetchNewsGNews(query, { from, to }, maxItems = 4, log = console) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const url = `https://gnews.io/api/v4/search?q=${escQ(query)}&lang=en&max=${maxItems}&from=${escQ(from)}&to=${escQ(to)}&sortby=publishedAt&token=${key}`;
  const res = await fetchWithTimeout(url, 12000).catch(() => null);
  if (!res) return [];
  if (res.status === 429) { log?.warn?.('[gnews] rate limited 429'); return []; }
  if (!res.ok) { log?.warn?.(`[gnews] HTTP ${res.status}`); return []; }

  const json = await res.json().catch(() => ({}));
  const arts = Array.isArray(json.articles) ? json.articles : [];
  return arts.map(a => ({
    title: a.title || '',
    url: a.url || '',
    source: (a.source && a.source.name) || 'GNews',
    published_at: a.publishedAt || '',
    summary: a.description || ''
  }));
}

/** 回傳：{ list: [...], by: {SYM: [news...] } } 並且每檔最多 per 篇 */
  async function fetchNewsForSymbols(symbols = [], { from, to, perSymbol = 3 }, log = console) {
    const out = [];
    const by = {};
    const per = Math.min(perSymbol || 3, 4);

    for (const s of symbols) {
      const hint = COMPANY_HINTS[s] ? ` OR (${COMPANY_HINTS[s]})` : '';
      const q = `(${s})${hint}`;

      let items = await fetchNewsRSS(q, { from, to }, per);
      if (items.length < per) {
        const remain = per - items.length;
        const extra = await fetchNewsGNews(q, { from, to }, remain, log);
        items = items.concat(extra);
      }
      items = items.slice(0, per);

      by[s] = [];
      items.forEach((it, i) => {
        const row = { id: `${s}-${i + 1}`, symbol: s, ...it };
        by[s].push(row);
        out.push(row);
      });
    }

    // 去重（title+url）
    const seen = new Set();
    let list = out.filter(n => {
      const key = `${n.title}::${n.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ✅ 保險：再次以時間戳過濾（避免任何路徑沒過濾乾淨）
    const fromMs = from ? Date.parse(typeof from === 'string' ? `${from}T00:00:00Z` : from) : -Infinity;
    const toMs   = to   ? Date.parse(typeof to   === 'string' ? `${to}T23:59:59.999Z` : to) :  Infinity;
    list = list.filter(n => {
      const t = Date.parse(n.published_at || '');
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    });

    // 依 symbol 重建 by
    const by2 = {};
    for (const n of list) (by2[n.symbol] ||= []).push(n);

    return { list, by: by2 };
  }

/* =========================================================
 * 3) 解析 JSON（更耐髒）
 * =======================================================*/
function readModelText(result) {
  // @google/generative-ai v*x response 可能是 result.response.text()
  try { const s = result?.response?.text?.(); if (s && typeof s === 'string') return s; } catch {}
  try {
    const parts = result?.response?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const s = parts.map(p => p?.text || '').join('').trim();
      if (s) return s;
    }
  } catch {}
  return '';
}

/** 從文字中擷取第一個 JSON 物件，帶引號感知的平衡掃描 */
function extractBalancedObject(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) throw new Error('找不到 {');
  let i = start, depth = 0, inStr = false, esc = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = false; continue; }
      continue;
    } else {
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
  }
  if (depth > 0) return s.slice(start) + '}'.repeat(depth);
  throw new Error('未擷取到完整物件');
}

/** 封住未關閉字串 & 轉義裸換行 */
function fixUnterminatedStrings(s) {
  if (!s) return s;
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      if (ch === '\n' || ch === '\r') { out += '\\n'; continue; }
      out += ch;
    } else {
      out += ch;
      if (ch === '"') inStr = true;
    }
  }
  if (inStr) out += '"';
  return out;
}

/** 嘗試修補常見破損 JSON */
function repairJsonText(text) {
  let s = String(text || '');
  s = s.replace(/```json/gi, '').replace(/```/g, '');
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  try { s = extractBalancedObject(s); } catch {}

  s = s.replace(/,\s*([}\]])/g, '$1'); // 移除尾逗號

  const needCurly = (s.match(/{/g) || []).length - (s.match(/}/g) || []).length;
  const needBracket = (s.match(/\[/g) || []).length - (s.match(/]/g) || []).length;
  if (needBracket > 0) s += ']'.repeat(needBracket);
  if (needCurly > 0) s += '}'.repeat(needCurly);

  return s;
}

/** 安全解析：多策略，最後回退 null */
function safeParseModelJson(text, log = console) {
  if (!text) return null;

  try { return JSON.parse(text); } catch {}
  try { return JSON.parse(extractBalancedObject(text)); } catch {}
  try { return JSON.parse(repairJsonText(text)); }
  catch (e1) {
    try {
      const sealed = fixUnterminatedStrings(text);
      return JSON.parse(repairJsonText(sealed));
    } catch (e2) {
      log?.warn?.('[gemini-news] repair 仍失敗: ' + (e2?.message || e2));
      return null;
    }
  }
}

/* =========================================================
 * 4) Prompt + Schema
 * =======================================================*/
function buildPerSymbolPrompt({ symbol, from, to, metric, news }) {
  const lines = [];
  lines.push(
`你是投資研究分析師。針對單一股票 ${symbol}，只輸出 JSON（不要 code fence 或解說）。區間=${from}~${to}。
輸出欄位（object）：
- symbol
- view（1~2 句，≤180字；避免未轉義 " { } [ ]）
- stance（bullish | neutral | bearish）
- confidence（0~1）
- drivers：2~3 個，每個 { id: 下列新聞的 id, why: 重要原因（≤120字） }
- watch：2~3 個（≤40字/項）
- next_steps：1~3 條（≤60字/項）`
  );
  lines.push('\n=== 指標（from DB） ===\n' + JSON.stringify(metric, null, 2));

  lines.push('\n=== 新聞（請引用 id；僅列 id+title） ===');
  if (!Array.isArray(news) || news.length === 0) {
    lines.push('(no news)');
  } else {
    for (const n of news) lines.push(`  [${n.id}] ${n.title}`);
  }
  return lines.join('\n');
}

const perSymbolSchema = {
  type: 'object',
  properties: {
    symbol: { type: 'string' },
    view: { type: 'string' },
    stance: { type: 'string', enum: ['bullish', 'neutral', 'bearish'] },
    confidence: { type: 'number' },
    drivers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, why: { type: 'string' } },
        required: ['id', 'why']
      }
    },
    watch: { type: 'array', items: { type: 'string' } },
    next_steps: { type: 'array', items: { type: 'string' } }
  },
  required: ['symbol', 'view', 'stance', 'confidence', 'drivers']
};

/* =========================================================
 * 5) 逐檔呼叫（含 429 降級 + 兩段式重試）
 * =======================================================*/
async function genOneInsight(genAI, params, log = console) {
  const { symbol } = params;

  // 模型鏈：先用傳入 model，其次 flash，再來 flash-8b
  const modelChain = Array.isArray(params.models) && params.models.length
    ? params.models
    : [params.model || 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

  for (const mdl of modelChain) {
    const modelClient = genAI.getGenerativeModel({
      model: mdl,
      systemInstruction: '你是嚴謹的投資研究分析師，只輸出 JSON，不得輸出其他說明。',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
        responseSchema: perSymbolSchema
      }
    });

    const prompt = buildPerSymbolPrompt(params);

    // 嘗試兩次
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const req = (attempt === 1)
          ? { contents: [{ role: 'user', parts: [{ text: prompt }] }] }
          : {
              contents: [{
                role: 'user',
                parts: [
                  { text: '你剛才輸出的不是有效 JSON，請「只輸出 JSON 本體」對應下列資料，不要附加任何解說或標點：' },
                  { text: JSON.stringify({
                      symbol: params.symbol,
                      timeframe: { from: params.from, to: params.to },
                      metric: params.metric,
                      news: params.news
                    }) }
                ]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 600,
                responseMimeType: 'application/json',
                responseSchema: perSymbolSchema
              }
            };

        const res  = await modelClient.generateContent(req);
        const text = (readModelText(res) || '').trim();
        const obj  = safeParseModelJson(text, log);

        if (obj && typeof obj === 'object') {
          // 保障處理 + drivers 清洗
          obj.symbol = params.symbol;
          const newsIds = new Set((Array.isArray(params.news) ? params.news : []).map(n => n.id));

          obj.drivers = (Array.isArray(obj.drivers) ? obj.drivers : [])
            .filter(d => d && typeof d.why === 'string' && d.why.trim())
            .map(d => {
              const id = String(d.id || '').trim();
              const placeholder =
                !id || /^string\d*$/i.test(id) || /^n\/?a$/i.test(id) || id === '-' || !newsIds.has(id);
              return { id: placeholder ? '' : id, why: d.why.trim() };
            })
            .slice(0, 3);

          if (Array.isArray(obj.watch)) obj.watch = obj.watch.slice(0, 3);
          else obj.watch = [];
          if (Array.isArray(obj.next_steps)) obj.next_steps = obj.next_steps.slice(0, 3);
          else obj.next_steps = [];

          return obj;
        }

        log?.warn?.(`[gemini-news] non-JSON for ${symbol} on ${mdl} (attempt ${attempt}).`);
      } catch (e) {
        if (isQuotaErr(e)) {
          const wait = parseRetryMs(e);
          log?.warn?.(`[genOneInsight] ${symbol} quota on ${mdl}, wait ${wait}ms then downgrade`);
          await sleep(wait);
          break; // 換下一個模型
        }
        log?.warn?.(`[genOneInsight] ${symbol} attempt#${attempt} on ${mdl} failed: ${e?.message}`);
      }
    }
    // 換下一個模型
  }

  // ---- 全部失敗 → fallback ----
  const tr  = (((params.metric?.totalReturn) || 0) * 100).toFixed(2);
  const vol = ((params.metric?.volatility) || 0).toFixed(3);
  return {
    symbol: params.symbol,
    view: `依歷史區間：總報酬 ${tr}%、波動度 ${vol}。`,
    stance: 'neutral',
    confidence: 0.3,
    drivers: [],
    watch: ['財報/法說', '指標新聞'],
    next_steps: ['關注事件前後量價變化'],
    _fallback: true,
  };
}


/** 小工具：限制併發 */
async function mapLimit(list, limit, fn) {
  const ret = new Array(list.length);
  let i = 0, running = 0;
  return await new Promise((resolve) => {
    function next() {
      if (i === list.length && running === 0) return resolve(ret);
      while (running < limit && i < list.length) {
        const idx = i++, item = list[idx];
        running++;
        Promise.resolve(fn(item, idx))
          .then(v => ret[idx] = v)
          .catch(() => ret[idx] = null)
          .finally(() => { running--; next(); });
      }
    }
    next();
  });
}

/* =========================================================
 * 6) 主流程
 * =======================================================*/
async function analyzeWithNews({
  symbols = [],
  from,
  to,
  perSymbol = 3,
  lookbackDays = 0,
  model = 'gemini-1.5-flash-8b',
}, log = console) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('symbols 不可為空');
  }
  if (!from || !to) throw new Error('缺少 from / to');

  // 新聞視窗：若有 lookbackDays，則以 to 往回 N 天；否則就用 from~to
  let newsFrom = from, newsTo = to;
  if (Number(lookbackDays) > 0) {
    const toDate = new Date(to);
    const fromDate = new Date(toDate);
    fromDate.setDate(toDate.getDate() - (Number(lookbackDays) - 1));
    newsFrom = ymd(fromDate);
    newsTo = ymd(toDate);
  }

  // 1) 取數據 + 新聞
  const summary = await fetchSummaryFromDB({ symbols, from, to }, log);
  const { list: newsList, by: newsBy } = await fetchNewsForSymbols(
    symbols, { from: newsFrom, to: newsTo, perSymbol }, log
  );

  log?.info?.('[news] window %s ~ %s', newsFrom, newsTo);
  log?.info?.('[news] fetched=%d sample=%o',
    newsList.length,
    newsList.slice(0, 3).map(n => ({ sym: n.symbol, title: n.title, date: n.published_at, src: n.source }))
  );

  // 2) 逐檔請模型（限制併發，避免 429）
  const genAI = getGenAI();
  const metricBy = Object.fromEntries(summary.map(s => [s.symbol, s]));

  // 模型候選鏈：若第一個是 pro，就再加 flash 與 8b；否則加 8b 一個備援
  const modelChain =
    (model || '').includes('pro')
      ? [model, 'gemini-1.5-flash', 'gemini-1.5-flash-8b']
      : [model || 'gemini-1.5-flash-8b', 'gemini-1.5-flash'];

  // pro 容易 429，把併發降到 1；其他 2
  const maxConc = modelChain[0].includes('pro') ? 1 : 2;

  const tasks = symbols.map(symbol => ({
    symbol,
    from, to,
    metric: metricBy[symbol] || null,
    news: (newsBy[symbol] || []).slice(0, Math.min(perSymbol || 3, 4)),
    model: modelChain[0],
    models: modelChain
  }));

  const insightsRaw = await mapLimit(tasks, maxConc, (t) => genOneInsight(genAI, t, log));

  const insights = insightsRaw.map((x, i) => {
    if (x && typeof x === 'object') return x;
    const t = tasks[i];
    const tr  = (((t.metric?.totalReturn) || 0) * 100).toFixed(2);
    const vol = ((t.metric?.volatility) || 0).toFixed(3);
    return {
      symbol: t.symbol,
      view: `依歷史區間：總報酬 ${tr}%、波動度 ${vol}。`,
      stance: 'neutral',
      confidence: 0.3,
      drivers: [],
      watch: ['財報/法說', '指標新聞'],
      next_steps: ['關注事件前後量價變化'],
      _fallback: true,
    };
  });

  // 3) 總結
  const best = summary.slice().sort((a,b) => (b.totalReturn ?? -1) - (a.totalReturn ?? -1))[0];
  const worst = summary.slice().sort((a,b) => (a.totalReturn ?? 1) - (b.totalReturn ?? 1))[0];

  const minVol = Math.min(...summary.map(s => s.volatility ?? Infinity));
  const maxVol = Math.max(...summary.map(s => s.volatility ?? 0));
  const key_findings = [];
  if (best) key_findings.push(`${best.symbol} 為期間表現最佳（總報酬 ${(best.totalReturn*100).toFixed(2)}%）。`);
  if (worst) key_findings.push(`${worst.symbol} 為期間表現較弱（總報酬 ${(worst.totalReturn*100).toFixed(2)}%）。`);
  if (isFinite(minVol) && isFinite(maxVol)) {
    key_findings.push(`整體波動度區間約 ${minVol.toFixed(3)} ~ ${maxVol.toFixed(3)}。`);
  }

  const counts = Object.fromEntries(symbols.map(s => [s, (newsBy[s] || []).length]));

  const out = {
    title: 'Investment Research (Per-Ticker)',
    timeframe: { from, to },
    tickers: symbols,
    key_findings,
    macro: [],
    company_insights: insights,
    risks: [],
    next_steps: [],
    news_considered: newsList,
    news_meta: {                                // ← 新增
      requested_window: { from: newsFrom, to: newsTo },
      per_symbol_counts: counts,
      total_count: newsList.length
    }
  };

  return out;
}

module.exports = { analyzeWithNews };
