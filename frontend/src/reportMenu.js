// reportMenu.js
import Choices from 'choices.js';

const FAVORITE_KEY = 'reportFavorites';

export let allReports = [];
let favorites = [];
let categoryChoices, reportChoices;

export async function initReportMenu(reports, onReportSelected) {
    allReports = reports;
    favorites = loadFavorites();

    const categorySelect = document.getElementById('categorySelect');
    const reportSelect = document.getElementById('reportSelect');
    const starArea = document.getElementById('reportStarArea');

    // 初始化類別
    const categories = [...new Set(reports.map(r => r.category))];
    categories.unshift('我的最愛');

    categorySelect.innerHTML = '';
    for (const cat of categories) {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
    }

    categoryChoices = new Choices(categorySelect, {
        searchEnabled: true,
        itemSelectText: '',
        shouldSort: false
    });

    reportChoices = new Choices(reportSelect, {
        searchEnabled: true,
        itemSelectText: '',
        shouldSort: false,
        placeholderValue: '請選擇報表',
        searchPlaceholderValue: '搜尋報表...'
    });

    categorySelect.addEventListener('change', () => {
        const selectedCat = categorySelect.value;
        updateReportSelect(selectedCat);
    });

    reportSelect.addEventListener('change', () => {
        const reportId = Number(reportSelect.value);
        const report = allReports.find(r => r.reportId === reportId);
        renderStarIcon(reportId, starArea);
        if (onReportSelected) onReportSelected(report);
    });

    if (allReports.length > 0 && categorySelect) {
        categorySelect.dispatchEvent(new Event('change'));
    }
}

function updateReportSelect(category) {
    const reportSelect = document.getElementById('reportSelect');

    // 移除舊的 Choices（避免殘留 UI 狀態）
    if (reportChoices) {
        reportChoices.destroy();
    }

    const filtered = category === '我的最愛'
        ? allReports.filter(r => favorites.includes(r.reportId))
        : allReports.filter(r => r.category === category);

    // 清除舊選項
    reportSelect.innerHTML = '';

    for (const report of filtered) {
        const opt = document.createElement('option');
        opt.value = report.reportId;
        opt.textContent = report.name;
        reportSelect.appendChild(opt);
    }

    // 重新建立 Choices
    reportChoices = new Choices(reportSelect, {
        searchEnabled: true,
        itemSelectText: '',
        shouldSort: false,
        placeholderValue: '請選擇報表',
        searchPlaceholderValue: '搜尋報表...'
    });

    // 選第一個並觸發事件
    if (filtered.length > 0) {
        reportChoices.setChoiceByValue(String(filtered[0].reportId));
        reportChoices.passedElement.element.dispatchEvent(new Event('change'));
    }
}



function renderStarIcon(reportId, container) {
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.marginLeft = '0.5rem';
    container.style.marginBottom = '24px';

    const icon = document.createElement('i');
    icon.className = favorites.includes(reportId) ? 'bi bi-star-fill' : 'bi bi-star';
    icon.style.cursor = 'pointer';
    icon.style.fontSize = '1.3rem';
    icon.title = '點擊加入/移除我的最愛';
    icon.addEventListener('click', () => {
        toggleFavorite(reportId);
        renderStarIcon(reportId, container);
        const selectedCat = categoryChoices.passedElement.element.value;
        if (selectedCat === '我的最愛') {
            updateReportSelect('我的最愛');
        }
    });
    container.appendChild(icon);
}

function toggleFavorite(reportId) {
    const index = favorites.indexOf(reportId);
    if (index >= 0) {
        favorites.splice(index, 1);
    } else {
        favorites.push(reportId);
    }
    saveFavorites();
}

function loadFavorites() {
    try {
        const raw = localStorage.getItem(FAVORITE_KEY);
        return raw ? JSON.parse(raw).map(id => Number(id)) : [];
    } catch {
        return [];
    }
}

function saveFavorites() {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(favorites));
}
