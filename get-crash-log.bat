@echo off
REM Reads Vibe's crash log from the phone (USB debugging on, phone plugged in)
REM into crash-log.txt next to this file. Double-click to run.
setlocal
cd /d "%~dp0"
set "ADB=adb"
where adb >nul 2>nul
if errorlevel 1 set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not "%ADB%"=="adb" if not exist "%ADB%" (
  echo adb not found. Install Android platform-tools or Android Studio.> crash-log.txt
  type crash-log.txt
  pause
  exit /b 1
)
echo === devices ===> crash-log.txt
"%ADB%" devices -l >> crash-log.txt 2>&1
echo.>> crash-log.txt
echo === app installed? ===>> crash-log.txt
"%ADB%" shell pm list packages com.pingcrood.vibe_app >> crash-log.txt 2>&1
"%ADB%" shell dumpsys package com.pingcrood.vibe_app | findstr /i "versionName lastUpdateTime" >> crash-log.txt 2>&1
echo Starting Vibe on the phone and waiting 8 seconds...
"%ADB%" logcat -c
"%ADB%" shell monkey -p com.pingcrood.vibe_app -c android.intent.category.LAUNCHER 1 >> crash-log.txt 2>&1
timeout /t 8 /nobreak >nul
echo.>> crash-log.txt
echo === crash buffer ===>> crash-log.txt
"%ADB%" logcat -d -b crash >> crash-log.txt 2>&1
echo.>> crash-log.txt
echo === warnings and errors ===>> crash-log.txt
"%ADB%" logcat -d -v time *:W >> crash-log.txt 2>&1
echo Done. Saved crash-log.txt
endlocal
