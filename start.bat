@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================================
::  AI STUDIO — AUTO SETUP & LAUNCHER
::  Проверяет и устанавливает всё необходимое при первом запуске
:: ============================================================

title AI Studio — Launcher
color 0A

echo.
echo  +======================================================+
echo  ^|         AI STUDIO -- AUTO SETUP ^& LAUNCH            ^|
echo  +======================================================+
echo.

:: ── Флаги состояния ─────────────────────────────────────────
set "NEED_INSTALL=0"
set "FFMPEG_OK=0"
set "NODE_OK=0"
set "MODULES_OK=0"

:: ============================================================
:: ШАГ 1 — ПРОВЕРКА NODE.JS
:: ============================================================
echo  [1/4] Проверка Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo        [X] Node.js НЕ найден -- будет установлен автоматически
    set "NEED_INSTALL=1"
    set "NODE_OK=0"
) else (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
    echo        [OK] Node.js !NODE_VER!
    set "NODE_OK=1"
)

:: ============================================================
:: ШАГ 2 — ПРОВЕРКА node_modules И БИНАРНЫХ МОДУЛЕЙ
:: ============================================================
echo  [2/4] Проверка зависимостей npm...

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo        [X] node_modules не установлены
    goto :STEP2_FAIL
)

REM Проверка бинарных модулей на совместимость
node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >nul 2>&1
if !errorlevel! neq 0 (
    echo        [!] Найдена несовместимость бинарных модулей
    goto :STEP2_FAIL
)

echo        [OK] node_modules
set "MODULES_OK=1"
goto :STEP3

:STEP2_FAIL
echo        [>>] Потребуется переустановка зависимостей
set "NEED_INSTALL=1"
set "MODULES_OK=0"

:STEP3
:: ============================================================
:: ШАГ 3 — ПРОВЕРКА FFMPEG
:: ============================================================
echo  [3/4] Проверка FFmpeg...

if exist "%~dp0ffmpeg\bin\ffmpeg.exe" (
    echo        [OK] FFmpeg найден локально
    set "FFMPEG_OK=1"
    set "PATH=%~dp0ffmpeg\bin;%PATH%"
    goto :STEP4
)

ffmpeg -version >nul 2>&1
if !errorlevel! equ 0 (
    echo        [OK] FFmpeg найден в системном PATH
    set "FFMPEG_OK=1"
    goto :STEP4
)

echo        [X] FFmpeg НЕ найден -- будет скачан автоматически
set "NEED_INSTALL=1"
set "FFMPEG_OK=0"

:STEP4
:: ============================================================
:: ШАГ 4 — ПРОВЕРКА РАБОЧИХ ПАПОК
:: ============================================================
echo  [4/4] Проверка рабочих папок...
set "FOLDERS_CREATED=0"
for %%d in (Image Videos Audio Music FinalVideo SkeletonShorts) do (
    if not exist "%~dp0%%d\" (
        mkdir "%~dp0%%d" 2>nul
        set "FOLDERS_CREATED=1"
    )
)
if !FOLDERS_CREATED! equ 1 (
    echo        [>>] Рабочие папки созданы
) else (
    echo        [OK] Рабочие папки
)

echo.

:: ============================================================
:: ЕСЛИ ВСЁ УЖЕ УСТАНОВЛЕНО — СРАЗУ ЗАПУСКАЕМ
:: ============================================================
if "!NEED_INSTALL!"=="0" (
    echo  [OK] Все компоненты на месте. Запускаем приложение...
    echo.
    goto :LAUNCH
)

:: ============================================================
:: НУЖНА УСТАНОВКА — СПРАШИВАЕМ РАЗРЕШЕНИЕ
:: ============================================================
echo  +------------------------------------------------------+
echo  ^|  Требуется первоначальная настройка:                ^|
if "!NODE_OK!"=="0"    echo  ^|   ^> Node.js LTS (скачать и установить)              ^|
if "!MODULES_OK!"=="0" echo  ^|   ^> npm зависимости  (npm install ~500 MB)          ^|
if "!FFMPEG_OK!"=="0"  echo  ^|   ^> FFmpeg (скачать ~80 MB в папку проекта)         ^|
echo  ^|                                                      ^|
echo  ^|  Займёт 5-15 минут в зависимости от интернета.      ^|
echo  +------------------------------------------------------+
echo.
set /p "CONFIRM=  Начать установку? (Y/N): "
if /i "!CONFIRM!" neq "Y" (
    echo.
    echo  Установка отменена. Запустите start.bat снова когда будете готовы.
    pause
    exit
)
echo.

:: ============================================================
:: УСТАНОВКА КОМПОНЕНТОВ ЧЕРЕЗ ПЕРЕХОДЫ
:: ============================================================

if "!NODE_OK!"=="0" call :INSTALL_NODE
if "!FFMPEG_OK!"=="0" call :INSTALL_FFMPEG
if "!MODULES_OK!"=="0" call :INSTALL_NPM

:: ============================================================
:: ФИНАЛЬНАЯ ПРОВЕРКА ПЕРЕД ЗАПУСКОМ
:: ============================================================
echo  ----------------------------------------------------
echo   ИТОГОВАЯ ПРОВЕРКА
echo  ----------------------------------------------------

node --version >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] Node.js недоступен. Перезапустите компьютер и повторите.
    pause
    exit /b 1
)
echo   [OK] Node.js

ffmpeg -version >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] FFmpeg недоступен.
    pause
    exit /b 1
)
echo   [OK] FFmpeg

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo   [X] node_modules неполные.
    pause
    exit /b 1
)
echo   [OK] node_modules
echo.

:: ============================================================
:LAUNCH
:: ЗАПУСК ПРИЛОЖЕНИЯ
:: ============================================================
echo  +======================================================+
echo  ^|               ЗАПУСК AI STUDIO...                   ^|
echo  +======================================================+
echo.

:: Всегда добавляем локальный ffmpeg в PATH сессии
if exist "%~dp0ffmpeg\bin\ffmpeg.exe" (
    set "PATH=%~dp0ffmpeg\bin;%PATH%"
)

cd /d "%~dp0"
call npm run dev


exit


:: ============================================================
:: ПОДПРОГРАММЫ УСТАНОВКИ
:: ============================================================

:INSTALL_NODE
echo  ----------------------------------------------------
echo   УСТАНОВКА NODE.JS LTS
echo  ----------------------------------------------------
echo   Скачиваем Node.js v20 LTS...

set "NODE_FILE=%TEMP%\node_installer.msi"

if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set "NODE_URL=https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
) else (
    set "NODE_URL=https://nodejs.org/dist/v20.18.0/node-v20.18.0-x86.msi"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -Uri '!NODE_URL!' -OutFile '!NODE_FILE!'"

if not exist "!NODE_FILE!" (
    echo   [X] Не удалось скачать Node.js. Проверьте интернет-соединение.
    echo   Скачайте вручную: https://nodejs.org
    pause
    exit /b 1
)

echo   Устанавливаем Node.js (может потребоваться подтверждение UAC)...
msiexec /i "!NODE_FILE!" /quiet /norestart ADDLOCAL=ALL
del /q "!NODE_FILE!" 2>nul

:: Обновляем PATH из реестра для текущей сессии
for /f "tokens=*" %%p in ('powershell -NoProfile -Command ^
    "[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')"') do (
    set "PATH=%%p"
)

node --version >nul 2>&1
if !errorlevel! neq 0 (
    echo   [!] Node.js установлен, но требуется ПЕРЕЗАПУСК системы.
    echo   Перезапустите компьютер и снова запустите start.bat
    pause
    exit /b 1
)
echo   [OK] Node.js успешно установлен!
echo.
goto :eof


:INSTALL_FFMPEG
echo  ----------------------------------------------------
echo   УСТАНОВКА FFMPEG (локально в папку проекта)
echo  ----------------------------------------------------
echo   Скачиваем FFmpeg (~80 MB)...

set "FFMPEG_ZIP=%TEMP%\ffmpeg_setup.zip"
set "FFMPEG_TMP=%TEMP%\ffmpeg_extract"
set "FFMPEG_DEST=%~dp0ffmpeg"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile '!FFMPEG_ZIP!'"

if not exist "!FFMPEG_ZIP!" (
    echo   [X] Не удалось скачать FFmpeg. Проверьте интернет-соединение.
    echo   Скачайте вручную: https://ffmpeg.org/download.html
    echo   Распакуйте содержимое bin\ в папку: %~dp0ffmpeg\bin\
    pause
    exit /b 1
)

echo   Распаковываем FFmpeg...
if exist "!FFMPEG_TMP!" rd /s /q "!FFMPEG_TMP!"
mkdir "!FFMPEG_TMP!"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Expand-Archive -Path '!FFMPEG_ZIP!' -DestinationPath '!FFMPEG_TMP!' -Force"

set "FFMPEG_INNER="
for /d %%d in ("!FFMPEG_TMP!\ffmpeg-*") do set "FFMPEG_INNER=%%d"

if not defined FFMPEG_INNER (
    echo   [X] Не удалось распаковать FFmpeg.
    pause
    exit /b 1
)

if exist "!FFMPEG_DEST!" rd /s /q "!FFMPEG_DEST!"
mkdir "!FFMPEG_DEST!\bin"
xcopy "!FFMPEG_INNER!\bin\*.*" "!FFMPEG_DEST!\bin\" /I /Q >nul

del /q "!FFMPEG_ZIP!" 2>nul
rd /s /q "!FFMPEG_TMP!" 2>nul

set "PATH=%~dp0ffmpeg\bin;!PATH!"

ffmpeg -version >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] FFmpeg не удалось настроить. Проверьте папку %~dp0ffmpeg\bin\
    pause
    exit /b 1
)
echo   [OK] FFmpeg успешно установлен в папку проекта!
echo.
goto :eof


:INSTALL_NPM
echo  ----------------------------------------------------
echo   УСТАНОВКА NPM ЗАВИСИМОСТЕЙ
echo  ----------------------------------------------------
if exist "%~dp0node_modules" (
    echo   [!] Обнаружены существующие node_modules.
    echo   При переносе на новый компьютер рекомендуется ЧИСТАЯ установка.
    echo.
    set /p "CLEAN_NPM=Удалить старые модули перед установкой? (Y/N): "
    if /i "!CLEAN_NPM!"=="Y" (
        echo   Удаление node_modules...
        rd /s /q "%~dp0node_modules" 2>nul
        if exist "%~dp0package-lock.json" del /q "%~dp0package-lock.json" 2>nul
        echo   [OK] Очистка завершена.
    )
)
echo   Выполняем npm install (может занять 5-10 минут)...
echo.

cd /d "%~dp0"
call npm install

if !errorlevel! neq 0 (
    echo.
    echo   [X] npm install завершился с ошибкой.
    echo   Попробуйте запустить start.bat ещё раз.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo.
    echo   [X] Electron не найден после установки. Повторите попытку.
    pause
    exit /b 1
)

echo.
echo   [OK] Все npm зависимости установлены!
echo.
goto :eof
