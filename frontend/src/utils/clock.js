// src/utils/clock.js

/**
 * 在指定節點顯示時鐘。
 * @param {Object} opts
 * @param {string|HTMLElement} opts.el  目標節點或 selector
 * @param {string} [opts.prefix='現在時間 ']  前綴字
 * @param {boolean} [opts.withDate=true] 是否顯示日期（YYYY 年 M 月 D 日）
 * @param {boolean} [opts.hour12=false]  是否 12 小時制（會補零）
 * @param {boolean} [opts.seconds=true]  是否顯示秒
 * @returns {Function} 停止函式
 */
export function startTopbarClock({
  el,
  prefix = '現在時間 ',
  withDate = true,
  hour12 = false,
  seconds = true,
} = {}) {
  const node = typeof el === 'string' ? document.querySelector(el) : el;
  if (!node) return;

  // 避免同一節點重覆啟動
  if (node.__clockTimer) clearInterval(node.__clockTimer);

  const pad2 = n => String(n).padStart(2, '0');

  const render = () => {
    const now = new Date();

    const y  = now.getFullYear();
    const m  = now.getMonth() + 1; // 中文日期不補零
    const d  = now.getDate();      // 中文日期不補零
    let   H  = now.getHours();
    const h  = hour12 ? (((H + 11) % 12) + 1) : H;

    const hh = pad2(h);
    const mm = pad2(now.getMinutes());
    const ss = pad2(now.getSeconds());

    const datePart = withDate ? `${y} 年 ${m} 月 ${d} 日 ` : '';
    const timePart = seconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;

    node.textContent = `${prefix}${datePart}${timePart}`;
  };

  render();
  node.__clockTimer = setInterval(render, 1000);
  return () => clearInterval(node.__clockTimer);
}

/** 停止指定節點的時鐘（可選） */
export function stopTopbarClock(el) {
  const node = typeof el === 'string' ? document.querySelector(el) : el;
  if (node?.__clockTimer) {
    clearInterval(node.__clockTimer);
    node.__clockTimer = null;
  }
}

