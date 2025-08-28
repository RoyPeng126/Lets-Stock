// utils/api.js

function getHeaders(extraHeaders = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...extraHeaders,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

export async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: getHeaders(options.headers),
    });

    if (res.status === 401) {
        alert('登入過期，請重新登入');
        throw new Error('Unauthorized');
    }

    return res;
}

export async function login(account, password) {
  const resp = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password })
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.message || `登入失敗（${resp.status}）`);
  }
  return resp.json();
}

export async function getSelectData(funcName, args = []) {
    const res = await fetch('/api/dbo/getSelect', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ funcName, args })
    });

    if (!res.ok) throw new Error(`getSelectData 失敗 (${res.status})`);

    const json = await res.json();
    if (!Array.isArray(json.select)) throw new Error("回傳格式錯誤");

    return json.select.map(item => ({
        name: item.name,
        value: item.value
    }));
}

export async function getReportData(reportId, params = []) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const res = await fetch('/api/report/data/db', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ reportId, params, user })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

export async function postEditedData(data) {
    const res = await fetch('/api/report/edit', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ data })
    });

    if (!res.ok) throw new Error(`送出更新失敗 (${res.status})`);
    return await res.json();
}

export async function getReportByName(reportName) {
    const res = await apiFetch(`/api/report/rights/${reportName}`, {
        method: "GET",
        headers: getHeaders()
    });
    if (!res.ok) throw new Error(`讀取報表設定失敗 (${res.status})`);
    const json = await res.json();
    return Array.isArray(json.availableReports) ? json.availableReports[0] : json;
}
