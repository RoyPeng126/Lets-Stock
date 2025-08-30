// main.js
import { enforceLoginOrRedirect, isDebugMode, logout } from '@/utils/auth.js';
import { render as renderNotifs, bindMenu as bindNotifMenu } from '@/utils/notification.js';
import { initTheme, enableDelegatedToggle } from '@/utils/theme.js';
import { initTopbarSearch } from '@/utils/search.js';
import { startTopbarClock } from '@/utils/clock.js';

enforceLoginOrRedirect();
initTheme();
enableDelegatedToggle();

import $ from 'jquery';
window.$ = $;
window.jQuery = $;

import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@/lib/sbadmin2/css/sb-admin-2.css';
import('@/lib/sbadmin2/js/sb-admin-2.js');
import 'choices.js/public/assets/styles/choices.min.css';
import 'flatpickr/dist/flatpickr.min.css';
import '@/styles/default.css';
import '@/styles/custom.css';
import '@/styles/theme.css';
import { initTopnavMarquee } from './topnav-marquee.js';

const urlParams = new URLSearchParams(location.search);
const debugFlag = urlParams.get('debug') === 'true';

// 載入 Topnav 後再初始化時鐘與搜尋
fetch(`${import.meta.env.BASE_URL}layout/topnav.html`)
  .then(res => res.text())
  .then(html => {
    const mount = document.getElementById('topbar-placeholder') || document.body;
    mount.insertAdjacentHTML('afterbegin', html);
    initTopnavMarquee();
    // 通知 / 使用者區
    renderNotifs();
    bindNotifMenu();

    if (isDebugMode()) {
      document.getElementById('debug-indicator')?.style && (document.getElementById('debug-indicator').style.display = 'inline-block');
    }

    document.getElementById('logoutButton')?.addEventListener('click', () => logout());

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('topbar-username') && (document.getElementById('topbar-username').textContent = (user.name || user.account || '使用者'));

    // 啟用 Bootstrap dropdown
    $('#userDropdown').dropdown();
    $('.dropdown-toggle').dropdown();
 
    // ✅ 這裡再啟動「時鐘」與「搜尋」
    startTopbarClock({
      el: '#topbar-clock',
      locale: 'zh-TW',
      hour12: true,
      withDate: true,
      seconds: true,
    });

    initTopbarSearch(); // 你的 utils/search.js 已處理綁定
  });

// Footer 如常
fetch(`${import.meta.env.BASE_URL}layout/footer.html`)
  .then(r => r.ok ? r.text() : '')
  .then(html => {
    if (!html) return;
    let el = document.getElementById('footer-placeholder');
    if (!el) {
      const host = document.getElementById('content-wrapper') || document.body;
      el = document.createElement('div');
      el.id = 'footer-placeholder';
      host.appendChild(el);
    }
    el.innerHTML = html;
  })
  .catch(err => console.debug('[footer]', err?.message || err));
