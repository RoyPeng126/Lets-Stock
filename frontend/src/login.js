import '@/lib/sbadmin2/css/sb-admin-2.min.css';
import { isLoginValid, getUserInfo, setDebugMode } from '@/utils/auth.js';
import '@/styles/default.css';
import { login } from '@/utils/api.js';

document.addEventListener("DOMContentLoaded", () => {
  const accountInput = document.getElementById("accountInput");
  const passwordInput = document.getElementById("passwordInput");
  const rememberCheck = document.getElementById("rememberCheck");
  const loginForm = document.getElementById("loginForm");
  const errorMsg = document.getElementById("errorMsg");

  // ?debug=true 會開啟前端除錯模式
  const urlParams = new URLSearchParams(location.search);
  const debugFlag = urlParams.get("debug") === "true";
  setDebugMode(debugFlag);

  // 已登入就直接回首頁
  if (isLoginValid()) {
    const user = getUserInfo();
    console.log("👤 已登入使用者：", user?.name || "未知");
    location.href = "index.html";
    return;
  } else {
    // 清掉殘留登入資訊
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("loginTimestamp");
  }

  // 還原記住的帳號
  const savedAccount = localStorage.getItem("account");
  if (savedAccount) {
    accountInput.value = savedAccount;
    rememberCheck.checked = true;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const account = accountInput.value.trim();
    const password = passwordInput.value;

    if (!account || !password) {
      return showError("請輸入帳號與密碼");
    }

    try {
      // 後端已預設 serviceName=WEB，所以這裡只要傳 account/password
      // ⚠️ 請把 utils/api.js 的 login 改成 login(account, password)
      //    並呼叫後端 POST /api/login，body: { account, password }
      const result = await login(account, password);

      // 儲存 token 與使用者資訊（維持原本 key）
      localStorage.setItem("token", result.token);
      localStorage.setItem("loginTimestamp", Date.now().toString());

      if (result.user) {
        const userData = {
          ...result.user,
          account
        };
        localStorage.setItem("user", JSON.stringify(userData));
      }

      // 記住帳號
      if (rememberCheck.checked) {
        localStorage.setItem("account", account);
      } else {
        localStorage.removeItem("account");
      }

      // 導回首頁
      location.href = "index.html";
    } catch (err) {
      console.error("登入錯誤:", err);
      // 從伺服器訊息帶回更友善的錯誤（若有）
      const msg = err?.message || "無法連線到伺服器";
      showError(msg);
    }
  });

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = "block";
  }
  function hideError() {
    errorMsg.textContent = "";
    errorMsg.style.display = "none";
  }
});
