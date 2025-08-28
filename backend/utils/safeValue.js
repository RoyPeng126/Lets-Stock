// backend/utils/safeValue.js

const safeStr = val => (val === null || val === undefined ? "" : val);

const safeNum = val => {
    const n = Number(val);
    return isNaN(n) ? null : n;
};

const safeNumNan = val => {
    if (val === null || val === undefined) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
};

const safeTime = (dateInput, timeInput) => {
    if (!dateInput) return null;

    let d, t;

    // Date 情況
    if (dateInput instanceof Date) {
        d = dateInput.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
        if (!timeInput) {
            // 若沒傳時間，就用 Date 物件本身的時間
            const isoTime = dateInput.toISOString().slice(11, 19).replace(/:/g, '');
            t = isoTime;
        } else {
            t = timeInput.toString();
        }
    } else {
        // 一般字串 情況
        d = dateInput.toString();
        t = timeInput ? timeInput.toString() : '000000';
    }

    // 檢查長度
    t = t.padStart(6, '0');
    if (d.length !== 8 || t.length !== 6) return null;

    // 回傳 T 格式
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
};



module.exports = { safeStr, safeNum, safeNumNan, safeTime };