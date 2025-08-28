// paramRenderer.js
import {getSelectData} from './utils/api.js';
import {getUserInfo} from "./utils/auth";
import Choices from 'choices.js';
import flatpickr from 'flatpickr';
import {Mandarin} from "flatpickr/dist/l10n/zh";


export async function renderParams(report, containerId = 'params') {
    const user = getUserInfo()
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!report || !report.params) return;

    const ui = report.ui || {};
    const groupMap = ui.group || {};
    const cols = ui.cols || 2;
    const colClass = `col-md-${Math.floor(12 / cols)}`;
    const groups = {};
  
    // 工具：取排序鍵（支援 sort / SORT；非數字忽略）
    const extractSort = (v) => {
    const raw = v?.sort ?? v?.SORT;
    if (raw === null || raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
    };

    // 先依 sort 排序（穩定排序）
    report.params = report.params
    .map((v, i) => ({ __origIndex: i, ...v }))
    .sort((a, b) => {
        const sa = extractSort(a);
        const sb = extractSort(b);
        const aHas = sa !== undefined;
        const bHas = sb !== undefined;

        if (aHas && bHas) return sa - sb;        // 都有 sort → 數字小的在前
        if (aHas && !bHas) return -1;            // 只有 a 有 sort → a 在前
        if (!aHas && bHas) return 1;             // 只有 b 有 sort → b 在前
        return a.__origIndex - b.__origIndex;    // 都沒有 → 保持原順序
    })
    .map(({ __origIndex, ...rest }) => rest);

    // 先分類群組
    for (const param of report.params) {
        const group = groupMap[param.key] || 'default';
        if (!groups[group]) groups[group] = [];
        groups[group].push(param);
    }

    // todo 進階顯示規則調整
    for (const groupName in groups) {
        const groupParams = groups[groupName];

        const groupId = `group-${groupName}`;
        const isCollapsible = groupName.includes('進階');

        if (groupName !== 'default') {
            const headerWrapper = document.createElement('div');
            headerWrapper.className = 'd-flex justify-content-between align-items-center mt-3';

            const h = document.createElement('h6');
            h.textContent = groupName;
            headerWrapper.appendChild(h);

            if (isCollapsible) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'btn btn-outline-secondary btn-sm';
                toggleBtn.setAttribute('data-toggle', 'collapse');
                toggleBtn.setAttribute('data-target', `#${groupId}`);
                toggleBtn.textContent = '顯示 / 隱藏';
                headerWrapper.appendChild(toggleBtn);
            }

            container.appendChild(headerWrapper);
            container.appendChild(document.createElement('hr'));
        }

        const row = document.createElement('div');
        row.className = 'row';

        for (const param of groupParams) {
        const special = (ui.special && ui.special[param.key]) || {};

        // ✅ 整個欄位略過的條件（只針對沒 label 的 symbols）
        const hideThis =
            special.hidden === true ||
            param.hidden === true ||
            (param.key === 'symbols' && !(param.label && param.label.trim()));
        if (hideThis) continue;

        const col = document.createElement('div');
        // 日期固定兩欄；其他欄位用既有 colClass
        if (param.type === 'date') {
            col.className = 'col-12 col-md-6 mb-3';
        } else {
            col.className = (special.fullWidth ? 'col-12' : colClass) + ' mb-3';
        }

        // 只有有文字才加 label（避免空 label 佔位）
        if (param.label && param.label.trim() !== '') {
            const label = document.createElement('label');
            label.textContent = param.label;
            const inputId = param.func_name || param.key;
            label.setAttribute('for', inputId);
            col.appendChild(label);
        }

        let input;
        switch (param.type) {
            case 'text':
            case 'number':
            input = document.createElement('input');
            input.type = param.type;
            input.className = 'form-control';
            input.id = param.key;
            input.value = param.default || '';
            col.appendChild(input);
            break;

            case 'date':
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control';
            input.id = param.key;
            input.placeholder = '請輸入日期...';
            input.style.backgroundColor = '#f9f9f9';
            input.style.cursor = 'pointer';
            col.appendChild(input);
            flatpickr(input, {
                locale: Mandarin,
                dateFormat: 'Y-m-d',
                defaultDate: param.default ? parseDynamicDate(param.default) : undefined,
                allowInput: true
            });
            break;

            case 'select':
            input = document.createElement('select');
            input.className = 'form-select';
            input.id = param.key;

            if (param.isAll) {
                const all = document.createElement('option');
                all.value = '';
                all.textContent = param.allContent || '全部';
                input.appendChild(all);
            }
            for (const opt of param.options || []) {
                const o = document.createElement('option');
                if (typeof opt === 'object') {
                o.value = opt.value; o.textContent = opt.label;
                if (opt.value === param.default) o.selected = true;
                } else {
                o.value = opt; o.textContent = opt;
                if (opt === param.default) o.selected = true;
                }
                input.appendChild(o);
            }
            col.appendChild(input);
            new Choices(input, { searchEnabled: true, itemSelectText: '', shouldSort: false });
            break;

            case 'getSelect':
            input = document.createElement('select');
            input.className = 'form-select';
            input.id = param.func_name;
            let args = [];

            if (param.isAll) {
                const all = document.createElement('option');
                all.value = '';
                all.textContent = param.allContent || '全部';
                input.appendChild(all);
            }

            if (Array.isArray(param.param_key)) {
                args = param.param_key.map(k => {
                const fieldEl = document.getElementById(k);
                if (fieldEl) return fieldEl.value;
                if (k.startsWith('user.') && user) return user[k.split('.')[1]];
                return k;
                });
            }

            const options = await getSelectData(param.func_name, args);
            for (const opt of options || []) {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = `${opt.name}（${opt.value}）`;
                if (opt.value === param.default) o.selected = true;
                input.appendChild(o);
            }
            col.appendChild(input);
            new Choices(input, { searchEnabled: true, itemSelectText: '', shouldSort: false });
            break;

            case 'checkbox':
            input = document.createElement('div');
            input.id = param.key;
            input.classList.add('d-flex', 'flex-wrap', 'gap-3');
            for (const opt of param.options || []) {
                const checkboxId = `${param.key}_${opt}`;
                const wrap = document.createElement('div');
                wrap.className = 'form-check';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'form-check-input';
                cb.id = checkboxId;
                cb.name = param.key;
                cb.value = opt;
                if ((param.default || []).includes(opt)) cb.checked = true;
                const cbLabel = document.createElement('label');
                cbLabel.className = 'form-check-label';
                cbLabel.setAttribute('for', checkboxId);
                cbLabel.textContent = opt;
                wrap.appendChild(cb);
                wrap.appendChild(cbLabel);
                input.appendChild(wrap);
            }
            col.appendChild(input);
            break;
        }

        row.appendChild(col);
        }

        if (isCollapsible) {
            const collapseDiv = document.createElement('div');
            collapseDiv.className = 'collapse';
            collapseDiv.id = groupId;
            collapseDiv.appendChild(row);
            container.appendChild(collapseDiv);
        } else {
            container.appendChild(row);
        }
    }
}

function formatLocalDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function parseDynamicDate(keyword) {
    const today = new Date();

    // @TODAY 或 @TODAY+3 / @TODAY-2
    const todayMatch = keyword.match(/^@TODAY([+-]\d+)?$/);
    if (todayMatch) {
        const offset = parseInt(todayMatch[1] || '0', 10);
        today.setDate(today.getDate() + offset);
        return formatLocalDate(today);
    }

    // @MONTH_START
    if (keyword === '@MONTH_START') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        return formatLocalDate(firstDay);
    }

    // @MONTH_DAYn，例如 @MONTH_DAY5 → 這個月第5天
    const dayMatch = keyword.match(/^@MONTH_DAY(\d{1,2})$/);
    if (dayMatch) {
        const day = parseInt(dayMatch[1], 10);
        const targetDay = new Date(today.getFullYear(), today.getMonth(), day);
        return formatLocalDate(targetDay);
    }

    // 否則回傳原本字串
    return keyword;
}
