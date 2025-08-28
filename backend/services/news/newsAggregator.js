// services/news/newsAggregator.js
const Parser = require('rss-parser');
const { htmlToText } = require('html-to-text');
const parser = new Parser();

const GOOGLE_NEWS = (q, days=7, locale='zh-TW') =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:${days}d&hl=${locale}&gl=TW&ceid=TW:${locale}`;

function norm(str=''){ return String(str || '').trim(); }
function hostname(url){ try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ''; } }

function relevanceScore({ title, content, symbol, companyNames=[] }) {
  const t = (title||'').toLowerCase();
  const c = (content||'').toLowerCase();
  let score = 0;
  if (t.includes(symbol.toLowerCase())) score += 5;
  if (c.includes(symbol.toLowerCase())) score += 2;
  for (const n of companyNames) {
    if (!n) continue;
    const k = n.toLowerCase();
    if (t.includes(k)) score += 4;
    if (c.includes(k)) score += 2;
  }
  // 關鍵詞加權
  ['earnings','guidance','regulation','lawsuit','merger','acquisition','chip','ai','data center','recall','ban','tariff','sec','fed','inflation','yield']
    .forEach(k => { if (t.includes(k) || c.includes(k)) score += 1; });
  // 新聞源可信度（可自行調整）
  const src = hostname(norm(this?.link));
  if (/reuters|apnews|bloomberg|wsj|ft\.com|nikkei|cna|cnbc|yahoo|businessinsider/.test(src)) score += 1;
  return score;
}

// 你可擴充公司映射（符號→公司名/別名）
const COMPANY_MAP = {
  AAPL: ['Apple', '蘋果'],
  MSFT: ['Microsoft', '微軟'],
  AMZN: ['Amazon', '亞馬遜'],
  GOOGL:['Alphabet','Google','谷歌'],
  TSLA: ['Tesla','特斯拉'],
};

async function fetchNewsForSymbol(symbol, { lookbackDays=7, locale='zh-TW', perSymbol=8 } = {}) {
  // 使用公司名 OR 代號搜尋
  const names = COMPANY_MAP[symbol] || [];
  const query = `${symbol} OR ${names.join(' OR ')}`;
  const url = GOOGLE_NEWS(query, lookbackDays, locale);

  let feed;
  try { feed = await parser.parseURL(url); } catch { return []; }
  const seen = new Set();
  const rows = [];

  for (const item of feed.items || []) {
    const link = norm(item.link);
    const title = norm(item.title);
    if (!link || !title) continue;

    const key = (link || title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const published_at = item.isoDate || item.pubDate || null;
    const raw = (item.contentSnippet || item.content || item.summary || '').toString();
    const content = htmlToText(raw, { wordwrap: 130, selectors: [{ selector: 'a', options: { ignoreHref: true } }] });

    rows.push({
      symbol,
      title,
      link,
      source: hostname(link),
      published_at,
      content
    });
  }

  // 打分 & 取前 N
  const scored = rows.map(r => ({
    ...r,
    score: relevanceScore.call(r, { ...r, companyNames: COMPANY_MAP[symbol] || [] })
  }));
  scored.sort((a,b)=> (b.score || 0) - (a.score || 0));
  return scored.slice(0, perSymbol);
}

async function aggregateNews({ symbols=[], lookbackDays=7, perSymbol=8, locale='zh-TW' } = {}) {
  if (!Array.isArray(symbols)) symbols = String(symbols || '').split(',').map(s=>s.trim()).filter(Boolean);
  const out = [];
  for (const s of symbols) {
    const arr = await fetchNewsForSymbol(s, { lookbackDays, perSymbol, locale });
    out.push(...arr);
  }
  // 依時間 + 分數排序
  out.sort((a,b)=>{
    const ta = new Date(a.published_at||0).getTime();
    const tb = new Date(b.published_at||0).getTime();
    return (tb - ta) || ((b.score||0) - (a.score||0));
  });
  return out;
}

module.exports = { aggregateNews };
