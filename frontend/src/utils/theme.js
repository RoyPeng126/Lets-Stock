// src/utils/theme.js
const THEME_KEY = 'theme'; // 'light' | 'dark'
let __delegatedBound = false;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function updateToggleIcon(theme) {
  const icon = document.getElementById('themeToggleIcon');
  if (!icon) return; // 沒有 icon 也不影響功能
  icon.className = (theme === 'dark') ? 'bi bi-sun' : 'bi bi-moon';
  icon.setAttribute('title', theme === 'dark' ? '切換為淺色' : '切換為深色');
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const theme = saved || (systemDark ? 'dark' : 'light');
  applyTheme(theme);
  updateToggleIcon(theme);
}

export function setTheme(theme) {
  applyTheme(theme);
  updateToggleIcon(theme);
  localStorage.setItem(THEME_KEY, theme);
}

export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(cur === 'dark' ? 'light' : 'dark');
}

/** 事件委派：不必等 topbar 載入完成 */
export function enableDelegatedToggle() {
  if (__delegatedBound) return;
  __delegatedBound = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('#themeToggle');
    if (!btn) return;
    e.preventDefault();
    toggleTheme();
  });
}
