import Choices from 'choices.js';

export function choicesEditor(cell, onRendered, success, cancel, editorParams) {
    const wrapper = document.createElement("div");
    wrapper.style.width = "100%";

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

    select.value = cell.getValue();
    wrapper.appendChild(select);

    let choices = null;

    // ✅ 簡化，只做一次初始化和展開
    onRendered(() => {
        choices = new Choices(select, {
            searchEnabled: true,
            itemSelectText: '',
            shouldSort: false
        });

        // 強制展開選單
        choices.showDropdown();
    });

    function finalize() {
        success(select.value);
        if (choices) choices.destroy();
    }

    select.addEventListener("change", finalize);
    select.addEventListener("blur", finalize);

    return wrapper;
}

export function choicesFormatter(cell) {
    const value = cell.getValue();
    const opts = cell.getColumn().getDefinition().editorParams?.values || [];
    const match = opts.find(opt => String(opt.value) === String(value));
    return match ? match.name : value;
}
