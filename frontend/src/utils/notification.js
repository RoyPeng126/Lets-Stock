// src/utils/notification.js
export const STORAGE_KEY = 'notifications';

const nowTW = () => new Date().toLocaleString('zh-TW', { hour12: false });

const get = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};
const set = (a) => localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
const esc = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[m]));
const colorOf = (type) => ({ success:'#16a34a' }[type] || '#16a34a');

// --- 右下角 Toast Host ---
function ensureToastHost() {
  let host = document.getElementById('notifToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'notifToastHost';
    host.style.cssText = `
      position:fixed;bottom:16px;right:16px;z-index:99999;
      display:flex;flex-direction:column;gap:10px;
      align-items:flex-end; /* 右對齊 */
      pointer-events:none;  /* 讓點擊不擋住頁面其它元素 */
    `;
    document.body.appendChild(host);
  }
  return host;
}

// --- 單筆綠色面板（右下） ---
function toast(msg, type='success') {
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.style.cssText = `
    pointer-events:auto;
    display:flex;align-items:center;gap:10px;
    padding:12px 14px;border-radius:12px;color:#fff;background:${colorOf(type)};
    box-shadow:0 10px 30px rgba(0,0,0,.22);
    font-size:14px;max-width:60ch;word-break:break-word;
    border:1px solid rgba(255,255,255,.18);
    opacity:0;transform:translateY(8px) scale(.98);
    transition:opacity .18s ease, transform .18s ease;
  `;
  el.innerHTML = `
    <span style="display:inline-flex;width:18px;height:18px;border-radius:999px;background:rgba(255,255,255,.25);
                 align-items:center;justify-content:center;font-weight:700;line-height:1;">✓</span>
    <span>${esc(msg)}</span>
  `;
  host.appendChild(el);

  // 進場
  requestAnimationFrame(() => { el.style.opacity = 1; el.style.transform = 'translateY(0) scale(1)'; });

  // 3 秒自動關閉
  const close = () => {
    el.style.opacity = 0; el.style.transform = 'translateY(8px) scale(.98)';
    setTimeout(() => el.remove(), 200);
  };
  const t = setTimeout(close, 3000);

  // 可手動點擊關閉
  el.addEventListener('click', () => { clearTimeout(t); close(); });
}

// --- 內部：寫入列表＋刷新面板＋彈 toast ---
function pushNotification({ text, type='success', time = nowTW() }) {
  const arr = get();
  arr.unshift({ id: Date.now(), text, type, time });
  set(arr);
  render();
  toast(text, type);  // ✅ 右下角綠色面板
}

// --- 對外：只開放「下載成功」 ---
export const notify = {
  downloadOk: ({ kind = '檔案', filename } = {}) => {
    const text = `已下載 ${kind}${filename ? `：${filename}` : ''}`;
    pushNotification({ text, type: 'success' });
  },

  // 兼容舊呼叫（全部無聲）
  success(){}, info(){}, warning(){}, error(){},
  queryOk(){}, simulateOk(){},
};

// --- 下拉面板（保留原本鈴鐺列表） ---
export const render = () => {
  const b = document.getElementById('notifBadge');
  const c = document.getElementById('notifContainer');
  if (!b || !c) return;

  const a = get();
  b.classList.toggle('d-none', !a.length);
  b.textContent = a.length || '';

  if (!a.length) {
    c.innerHTML = `<h6 class="dropdown-header">通知中心</h6><div class="notif-empty">暫無通知</div>`;
    return;
  }

  c.innerHTML = `
    <div class="notif-head">
      <span>通知中心</span>
      <button type="button" class="notif-clear" id="clearAll">清除全部</button>
    </div>
    <ul class="notif-list">
      ${a.map(n => `
        <li class="notif-item" data-id="${n.id}">
          <span class="notif-dot" aria-hidden="true" style="background:${colorOf(n.type)}"></span>
          <div class="notif-main">
            <div class="notif-time">${esc(n.time || nowTW())}</div>
            <div class="notif-text">${esc(n.text || '')}</div>
          </div>
          <button type="button" class="notif-close js-dismiss" data-id="${n.id}" aria-label="關閉通知">×</button>
        </li>`).join('')}
    </ul>`;
};

export const openMenu = () => {
  const toggle = document.getElementById('alertsDropdown');
  const menu = toggle?.nextElementSibling;
  if (!toggle || !menu) return;
  menu.classList.add('show');
  toggle.setAttribute('aria-expanded', 'true');
  if (window.jQuery?.fn?.dropdown) window.jQuery(toggle).dropdown('show');
};

export const bindMenu = () => {
  const m = document.querySelector('#alertsDropdown + .dropdown-menu');
  if (!m || m.__b) return;
  m.addEventListener('click', (e) => {
    e.stopPropagation();
    const x = e.target.closest('.js-dismiss');
    if (x) { const left = get().filter(n => n.id != x.dataset.id); set(left); render(); return; }
    if (e.target.id === 'clearAll') { set([]); render(); return; }
  });
  m.__b = 1;
};
