@echo off
echo ===================================================
echo     FORCE RESTARTING KIMI IMAGE ANIMATOR
echo ===================================================

echo 1. Stopping old processes (releasing port 5173)...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1

echo.
echo 2. Processes killed. Starting fresh...
echo.

npm run dev

pause
