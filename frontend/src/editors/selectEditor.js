export function selectEditor(cell, onRendered, success, cancel, editorParams) {
    const select = document.createElement("select");
    select.className = "form-select";
    select.name = cell.getField();
    select.style.width = "100%";

    const options = editorParams.values || [];
    options.forEach(opt => {
        const option = document.createElement("option");
        option.value = typeof opt === 'object' ? opt.value : opt;
        option.textContent = typeof opt === 'object' ? opt.name : opt;
        select.appendChild(option);
    });

    // 初始化值
    const initialValue = cell.getValue();
    select.value = initialValue;

    onRendered(() => {
        select.focus();
        select.click(); // 自動展開選單
    });

    select.addEventListener("change", () => {
        if (select.value !== initialValue) {
            success(select.value); // ✅ 有變更才送出
        } else {
            cancel(); // ✅ 沒有變更就取消編輯
        }
    });

    select.addEventListener("blur", () => {
        if (select.value !== initialValue) {
            success(select.value);
        } else {
            cancel();
        }
    });

    return select;
}
