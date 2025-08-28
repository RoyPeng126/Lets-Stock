// src/utils.js

export function showError(message) {
    alert(message);
    const output = document.getElementById('output');
    if (output) output.textContent = message;
}

export function cleanNulls(dataArray) {
    return dataArray.map(row => {
        const clean = {};
        for (let key in row) {
            clean[key] = row[key] == null ? '' : row[key];
        }
        return clean;
    });
}