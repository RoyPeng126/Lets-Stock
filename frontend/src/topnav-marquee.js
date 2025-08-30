// src/topnav-marquee.js
import { load as loadLatest } from './home-ticker.js';

const DEFAULTS = ['AAPL','MSFT','AMZN','GOOGL','TSLA'];
const STEP_MS = 2400;  // 每筆停留
const ANIM_MS = 380;   // 滾動動畫

/* 小工具對齊 home-ticker */
const toPercent = (p)=> (p==null||isNaN(p))?null : (Math.abs(p)<1 ? p*100 : p);
const fmtPct = (p)=> { const v = toPercent(p); return v==null?'—':`${v.toFixed(2)}%`; };
const clsByChange = (v)=> (v==null||isNaN(v))?'t-flat':(v>0?'t-up':(v<0?'t-down':'t-flat'));
const numLocale = (v)=> (v==null||isNaN(v))?'—':Number(v).toLocaleString();
function withDerived(r){
  const close = r?.close!=null?Number(r.close):null;
  const prev  = r?.prev_close!=null?Number(r.prev_close):null;
  let change  = r?.change!=null?Number(r.change):(close!=null&&prev!=null?close-prev:null);
  let pct     = r?.pct_change!=null?Number(r.pct_change):(close!=null&&prev?((close-prev)/prev)*100:null);
  return { ...r, close, prev_close: prev, change, pct_change: pct };
}
function itemView(r){
  const it = withDerived(r);
  const sign = it.change>0?'+':(it.change<0?'':'');
  const cls  = clsByChange(it.change);
  return `<div class="vt-item"><span class="sym">${it.symbol}</span><span class="price">${numLocale(it.close)}</span><span class="chg ${cls}">${sign}${fmtPct(it.pct_change)}</span></div>`;
}

/* 狀態與幫手 */
const wantsDesktop = ()=> window.matchMedia('(min-width:1300px)').matches;
const isActuallyVisible = (el)=>{
  if (!el) return false;
  const st = getComputedStyle(el);
  if (st.display==='none' || st.visibility==='hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width>0 && r.height>0;
};
function clearTimers(mount){
  if (mount._marqueeTimer){ clearInterval(mount._marqueeTimer); mount._marqueeTimer=null; }
  if (mount._waitTimer){ clearTimeout(mount._waitTimer); mount._waitTimer=null; }
}

/* 真正渲染一次（產生 DOM 並量高度） */
async function renderOnce(mount, symbols){
  let rows=[];
  try { rows = await loadLatest(symbols); } catch(e){ console.error('[marquee] load failed', e); }
  if (!rows || rows.length===0){
    mount.innerHTML = `<div class="vt-wrap"><div class="vt-track"><div class="vt-item">暫無資料</div></div></div>`;
    return {count:0, itemH:24};
  }

  const itemsHTML = rows.map(itemView);
  const loopHTML  = itemsHTML.concat(itemsHTML[0]).join('');
  mount.innerHTML = `<div class="vt-wrap"><div class="vt-track">${loopHTML}</div></div>`;

  // 量高度（多次嘗試，避免 0）
  let itemH = 0;
  const first = ()=> mount.querySelector('.vt-item');
  for (let i=0;i<3 && itemH===0;i++){
    await new Promise(r => requestAnimationFrame(r));
    itemH = first()?.offsetHeight || 0;
    if (itemH===0) await new Promise(r => setTimeout(r, 60));
  }
  return {count: rows.length, itemH: itemH || 24};
}

/* 啟動步進動畫（可重入） */
async function start(mount){
  clearTimers(mount);

  if (!wantsDesktop()){ mount.innerHTML=''; return; }

  // 等容器真的可見（避免量到 0 高）
  let tries=0;
  const waitVisible = (resolve)=>{
    if (isActuallyVisible(mount) || tries++>15) return resolve();
    mount._waitTimer = setTimeout(()=>waitVisible(resolve), 100);
  };
  await new Promise(waitVisible);

  // 取 symbols
  const list = (mount.dataset.symbols || '').split(',').map(s=>s.trim()).filter(Boolean);
  const symbols = list.length?list:DEFAULTS;

  const {count, itemH} = await renderOnce(mount, symbols);
  if (count<=1) return; // 一筆就不滾

  const track = mount.querySelector('.vt-track');
  let idx=0;
  mount._marqueeTimer = setInterval(()=>{
    idx += 1;
    track.style.transition = `transform ${ANIM_MS}ms ease`;
    track.style.transform  = `translateY(${-idx*itemH}px)`;
    if (idx>=count){
      setTimeout(()=>{
        track.style.transition = 'none';
        track.style.transform  = 'translateY(0)';
        idx=0;
      }, ANIM_MS+20);
    }
  }, STEP_MS);
}

/* 初始化與事件 */
function init(){
  const mount = document.getElementById('topnav-marquee');
  if (!mount) return;

  // 初始
  start(mount);

  // 視窗變化
  let tm=null;
  const retrigger = ()=>{ clearTimeout(tm); tm=setTimeout(()=>start(mount), 120); };
  window.addEventListener('resize', retrigger);
  window.addEventListener('orientationchange', retrigger);

  // 字體載入完成後可能高度改變
  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=> start(mount));
  }

  // Bootstrap collapse 展開/收起時重算（v4/v5 都會派發這些事件）
  document.addEventListener('shown.bs.collapse', e => {
    if (e.target && e.target.id === 'mainNavbar') start(mount);
  });
  document.addEventListener('hidden.bs.collapse', e => {
    if (e.target && e.target.id === 'mainNavbar') start(mount);
  });
}

export function initTopnavMarquee() { init(); }
