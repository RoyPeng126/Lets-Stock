// default-table.js
import { TabulatorFull as Tabulator } from 'tabulator-tables';

export default function renderDefault(rows) {
  const data = rows?.data || [];

  // ===== 建卡片 & 表格外框（一次性） =====
  const tableEl = document.querySelector('#report-table');
  if (!tableEl) throw new Error('#report-table not found');

  // 外層的表格容器（有滾動/圓角）
  let wrap = tableEl.parentElement;
  if (!wrap || !wrap.classList.contains('apple-table-wrap')) {
    wrap = document.createElement('div');
    wrap.id = 'report-table-wrapper';
    wrap.className = 'apple-table-wrap';
    tableEl.parentNode.insertBefore(wrap, tableEl);
    wrap.appendChild(tableEl);
  }

  // 再往外包一層卡片
  if (!document.getElementById('default-table-card')) {
    const card = document.createElement('div');
    card.id = 'default-table-card';
    card.className = 'apple-card';
    wrap.parentNode.insertBefore(card, wrap);
    card.appendChild(wrap);
  }

  const columns = generateColumns(data);

  const table = new Tabulator('#report-table', {
    data,
    columns,
    // 版面與體驗
    layout: 'fitDataFill',          // 撐滿卡片寬度（比 fitData 更好看）
    responsiveLayout: 'collapse',
    placeholder: '查無資料',
    // 互動
    movableColumns: true,
    resizableColumns: true,
    clipboard: true,
    // 分頁
    pagination: 'local',
    paginationSize: 20,
    paginationSizeSelector: [10, 20, 50, 100],
    paginationCounter: 'rows',
    // 匯出
    downloadRowRange: 'all',
    // 右鍵選單
    rowContextMenu: rowMenu,
  });

  return table;
}

function generateColumns(data) {
  if (!data || data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({
    title: key,
    field: key,
    resizable: true,
    headerSort: true,
    minWidth: 120,          // 比 100 再寬一點，版面更穩
    headerMenu,             // 欄位顯示切換
  }));
}

// ===== Row 右鍵選單 =====
const rowMenu = [
  {
    label: "<i class='fas fa-user'></i> Change Name",
    action: (e, row) => row.update({ name: 'Steve Bobberson' }),
  },
  {
    label: "<i class='fas fa-check-square'></i> Select Row",
    action: (e, row) => row.select(),
  },
  { separator: true },
  {
    label: 'Admin Functions',
    menu: [
      {
        label: "<i class='fas fa-trash'></i> Delete Row",
        action: (e, row) => row.delete(),
      },
      { label: "<i class='fas fa-ban'></i> Disabled Option", disabled: true },
    ],
  },
];

// ===== Header 菜單：欄位顯示切換 =====
var headerMenu = function () {
  const menu = [];
  const columns = this.getColumns();

  for (const column of columns) {
    const icon = document.createElement('i');
    icon.classList.add('fas', column.isVisible() ? 'fa-check-square' : 'fa-square');

    const label = document.createElement('span');
    const title = document.createElement('span');
    title.textContent = ' ' + column.getDefinition().title;
    label.appendChild(icon);
    label.appendChild(title);

    menu.push({
      label,
      action: function (e) {
        e.stopPropagation();
        column.toggle();
        if (column.isVisible()) {
          icon.classList.remove('fa-square');
          icon.classList.add('fa-check-square');
        } else {
          icon.classList.remove('fa-check-square');
          icon.classList.add('fa-square');
        }
      },
    });
  }

  return menu;
};
