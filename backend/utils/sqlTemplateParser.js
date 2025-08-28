// utils/sqlTemplateParser.js

/**
 * 傳入 SQL 樣板與參數，將可選條件過濾
 * EX: sql = "SELECT * FROM users WHERE id = :id and --[name]name = :name" ; params = { id: 123 }
 * 結果: "SELECT * FROM users WHERE id = :id"，未傳name的情況下將 name 的條件移除
 * 語法格式：--[key] SQL語句（單行）
 */
function prepareDynamicSql(template, params) {
    return template.replace(/--\[(\w+)](.*)/g, (match, key, clause) => {
        const value = params[key];
        // 空字串或 null 都視為未傳值
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            return '';
        }
        return clause;
    });
}

/**
 * 過濾 params 中未在SQL中使用的參數
 * EX: sql = "SELECT * FROM users WHERE id = :id"; params = { id: 123, name: '小明' }
 * 結果: { id: 123 }，過濾掉未使用的 `name`
 * 避免傳入未使用的 bind 變數導致 ORA-01036
 */
function filterParamsBySql(sql, params) {
    const usedKeys = [...sql.matchAll(/:(\w+)/g)].map(m => m[1]);
    const filtered = {};
    for (const key of usedKeys) {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
            filtered[key] = params[key];
        }
    }
    return filtered;
}

module.exports = { prepareDynamicSql, filterParamsBySql };
