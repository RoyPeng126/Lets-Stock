@echo off
setlocal enabledelayedexpansion

:: === 設定 ===
set "SRC_DIR=%~dp0frontend\dist"
set "TEMP_DIR=%TEMP%\frontend_pack_temp"
set "TAR_GZ_PATH=%~dp0frontend.tar.gz"

:: === 清除舊檔 ===
echo [INFO] Cleaning old temp and output...
rd /s /q "!TEMP_DIR!" >nul 2>&1
del /q "!TAR_GZ_PATH!" >nul 2>&1

:: === 檢查 dist 存在 ===
if not exist "!SRC_DIR!" (
    echo [ERROR] dist folder not found! Please run `npm run build` first.
    pause
    exit /b 1
)

:: === 複製 dist 到暫存資料夾 ===
echo [INFO] Copying dist folder to temp...
xcopy /e /i /y "!SRC_DIR!" "!TEMP_DIR!\" >nul

:: === 壓縮成 tar.gz（使用 tar 指令） ===
echo [INFO] Creating tar.gz...
tar -czf "!TAR_GZ_PATH!" -C "!TEMP_DIR!" .

:: === 結果 ===
if exist "!TAR_GZ_PATH!" (
    echo [SUCCESS] frontend.tar.gz created at: !TAR_GZ_PATH!
) else (
    echo [ERROR] Failed to create tar.gz!
)

pause
