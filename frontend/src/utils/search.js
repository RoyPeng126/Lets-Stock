// src/utils/search.js
export function initTopbarSearch() {
  if (window.__topbarSearchInit) return;
  window.__topbarSearchInit = true;

  const bind = () => {
    // 容器：優先 topbar-apple，退回 mainNavbar 或一般 .navbar-search
    const form =
      document.querySelector('.topbar-apple .navbar-search') ||
      document.querySelector('#mainNavbar .navbar-search') ||
      document.querySelector('.navbar-search');

    if (!form) return false;

    const input = form.querySelector('input.form-control, input[type="search"], input');
    const button = form.querySelector('button, .btn');
    const menuRoot =
      document.querySelector('#mainNavbar') ||
      document.querySelector('.topbar-apple') ||
      document;

    if (!input || !button || !menuRoot) return false;

    const open = () => {
      form.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => input.focus());
    };
    const close = () => {
      form.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      input.blur();
    };

    // 點🔍：未展開→展開；已展開→搜尋
    button.addEventListener('click', (e) => {
      e.preventDefault();
      form.classList.contains('is-open') ? doSearch() : open();
    });

    // Enter 搜尋 / Esc 收起
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    // 阻止 submit reload
    form.addEventListener('submit', (e) => e.preventDefault());

    // 點外面就收起
    document.addEventListener('click', (e) => {
      if (!form.classList.contains('is-open')) return;
      if (form.contains(e.target)) return;
      close();
    });

    // 展開 dropdown（若在 BS4 環境）
    const expandDropdown = (el) => {
      const dd = el.closest('.dropdown');
      const tg = dd && dd.querySelector('.dropdown-toggle');
      if (tg && window.jQuery?.fn?.dropdown) $(tg).dropdown('show');
    };

    function doSearch() {
      const kw = (input.value || '').trim().toLowerCase();
      if (!kw) { close(); return; }

      const candidates =
        '#mainNavbar .dropdown-item, #mainNavbar .nav-link, .topbar-apple .dropdown-item, .topbar-apple .nav-link';

      const node = [...document.querySelectorAll(candidates)]
        .find(n => (n.textContent || '').trim().toLowerCase().includes(kw));

      if (node) {
        const link = node.closest('a') || node;
        expandDropdown(link);
        link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // flash 標記
        link.classList.remove('flash-hit'); void link.offsetWidth; link.classList.add('flash-hit');
        close();
      } else {
        alert('找不到符合的選項');
        input.select();
      }
    }

    if (!document.getElementById('flash-style')) {
    document.head.insertAdjacentHTML('beforeend', `
        <style id="flash-style">
        /* 預設（淺色）與深色模式的提示底色 */
        :root{ --flash-bg:#e4ebeb; }
        [data-theme="dark"]{ --flash-bg:#929292; }

        /* 用變數套進 keyframes */
        @keyframes sf{
            0%,100%{ outline:0 }
            10%{ outline-offset:2px; background: var(--flash-bg); }
        }
        .flash-hit{ animation: sf 1s ease-in-out 1; }
        </style>`);
    }

    return true;
  };

  // 若當下還找不到 .navbar-search，就先觀察 DOM，載入後再綁
  if (!bind()) {
    const mo = new MutationObserver(() => { if (bind()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
}