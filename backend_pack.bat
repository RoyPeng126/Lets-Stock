@echo off
setlocal enabledelayedexpansion

:: === 設定參數 ===
set "SRC_DIR=%~dp0backend"
set "TEMP_DIR=%~dp0temp_backend"
set "TAR_PATH=%~dp0backend_package.tar.gz"

:: === 要排除的資料夾名 ===
set "EXCLUDE_DIRS=logs .git node_modules"

:: === 清除舊的 temp & tar ===
echo [INFO] Cleaning temp folder and old archive...
rd /s /q "%TEMP_DIR%" >nul 2>&1
del "%TAR_PATH%" >nul 2>&1
mkdir "%TEMP_DIR%"

:: === 複製資料夾內容（排除指定子資料夾） ===
echo [INFO] Copying project to temp folder (excluding unwanted folders)...

for /d %%D in ("%SRC_DIR%\*") do (
    set "FOLDER=%%~nxD"
    set "SKIP=false"
    for %%E in (%EXCLUDE_DIRS%) do (
        if /I "!FOLDER!"=="%%E" set "SKIP=true"
    )
    if "!SKIP!"=="false" (
        xcopy "%%D" "%TEMP_DIR%\%%~nxD" /E /I /Y >nul
        echo   [COPIED] %%~nxD
    ) else (
        echo   [SKIPPED] %%~nxD
    )
)

:: === 複製 root 下的檔案 (.js/.json 等) ===
for %%F in ("%SRC_DIR%\*") do (
    if not exist "%%F\" (
        copy "%%F" "%TEMP_DIR%\" >nul
        echo   [FILE] %%~nxF
    )
)

:: === 使用 tar 產生 .tar.gz 檔（需要有 tar.exe） ===
echo [INFO] Creating tar.gz file...
pushd "%TEMP_DIR%"
tar -czf "%TAR_PATH%" *
popd

:: === 顯示結果 ===
if exist "%TAR_PATH%" (
    echo [SUCCESS] Archive created at: %TAR_PATH%
) else (
    echo [ERROR] Failed to create tar.gz!
)
echo .
pause
