// /src/profile.js
import { enforceLoginOrRedirect, getUserInfo, isDebugMode } from '@/utils/auth.js';
enforceLoginOrRedirect();

import $ from 'jquery';
window.$ = $;
window.jQuery = $;

import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@/lib/sbadmin2/css/sb-admin-2.css';
import('@/lib/sbadmin2/js/sb-admin-2.js');

// 直接使用你提供的 HTML（包含 mailto）
const COMPANY_HTML = '若您有任何資訊上的問題或建議，請透過電子郵件聯絡：<a href="mailto:112306079@g.nccu.edu.tw">112306079@g.nccu.edu.tw</a>';

// 取得公開 IP（若失敗回傳 'Unavailable'）
async function fetchPublicIp() {
  try {
    const resp = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('fetch failed');
    const data = await resp.json();
    return data.ip || 'Unavailable';
  } catch (err) {
    if (isDebugMode && console && console.warn) console.warn('fetchPublicIp failed:', err);
    return 'Unavailable';
  }
}

// 取得 client 時區（若無法取則回空字串）
function getClientTimezone() {
  try {
    if (typeof Intl === 'object' && Intl.DateTimeFormat) {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    }
  } catch (e) {
    if (isDebugMode && console && console.warn) console.warn('getClientTimezone failed:', e);
  }
  return '';
}

// 主初始化：填入各個欄位
(async function init() {
  const user = getUserInfo() || {};

  // 填姓名、帳號（若無資料則留空）
  const elName = document.getElementById('profile-name');
  const elAccount = document.getElementById('profile-account');
  if (elName) elName.textContent = user.name || '';
  if (elAccount) elAccount.textContent = user.account || '';

  // 填時區（立即）
  const elTZ = document.getElementById('profile-timezone');
  const tz = getClientTimezone();
  if (elTZ) elTZ.textContent = tz || 'Unavailable';

  // 填 IP（非同步）
  const elIP = document.getElementById('profile-ip');
  if (elIP) {
    elIP.textContent = 'Loading...';
    const ip = await fetchPublicIp();
    elIP.textContent = ip;
  }

  // 填 company 整欄（含 mailto） — 直接 innerHTML 你提供的內容
  const elCompany = document.getElementById('profile-company-full');
  if (elCompany) {
    elCompany.innerHTML = COMPANY_HTML;
    // 可選樣式：小卡片視覺
    elCompany.style.padding = '0.75rem 1rem';
    elCompany.style.background = 'rgba(0,0,0,0.02)';
    elCompany.style.borderRadius = '8px';
  }
})();