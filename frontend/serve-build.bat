@echo off
echo === 建置專案 ===
call npm run build

echo === 搬移到 /fsdex_test 子目錄 ===
rmdir /s /q temp-dist
mkdir temp-dist\fsdex_test
xcopy /E /I /Y dist temp-dist\fsdex_test

echo === 啟動本地伺服器 ===
npx serve temp-dist
