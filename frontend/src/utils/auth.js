// src/utils/auth.js

const SESSION_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 小時

function isDebugMode() {
    return localStorage.getItem("debug") === "true";
}

export function setDebugMode(enabled) {
    if (enabled) {
        localStorage.setItem("debug", "true");
    } else {
        localStorage.removeItem("debug");
    }
}

export function isLoginValid() {
    const token = localStorage.getItem("token");
    const timestamp = parseInt(localStorage.getItem("loginTimestamp"), 10);
    return token && !isNaN(timestamp) && (Date.now() - timestamp < SESSION_LIMIT_MS);
}

export function enforceLoginOrRedirect() {
    if (!isLoginValid()) {
        logout();
    }
}

export function getAuthHeader() {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getUserInfo() {
    try {
        return JSON.parse(localStorage.getItem("user"));
    } catch {
        return null;
    }
}

export function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("loginTimestamp");
    localStorage.removeItem("debug");
    location.href = "login.html";
}

export { isDebugMode };
