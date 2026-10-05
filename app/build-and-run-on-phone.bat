@echo off
REM Builds the release APK, installs it on the phone plugged in by USB and
REM opens it. Output goes to build-and-run.log; if the app crashes, the
REM crash is saved to ..\crash-log.txt. Usage: double-click, or
REM   build-and-run-on-phone.bat --dart-define-from-file=.env   (server mode)
setlocal
cd /d "%~dp0"
set "ADB=adb"
where adb >nul 2>nul
if errorlevel 1 set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
echo Building (takes a few minutes)...
call flutter build apk --release %* > build-and-run.log 2>&1
if errorlevel 1 (
  echo BUILD FAILED - see build-and-run.log
  echo BUILD FAILED>> build-and-run.log
  exit /b 1
)
echo Installing...
"%ADB%" install -r build\app\outputs\flutter-apk\app-release.apk >> build-and-run.log 2>&1
if errorlevel 1 (
  echo INSTALL FAILED - see build-and-run.log
  echo INSTALL FAILED>> build-and-run.log
  exit /b 1
)
"%ADB%" logcat -c
"%ADB%" shell monkey -p com.pingcrood.vibe_app -c android.intent.category.LAUNCHER 1 >nul 2>&1
timeout /t 10 /nobreak >nul
echo === crash buffer ===> ..\crash-log.txt
"%ADB%" logcat -d -b crash >> ..\crash-log.txt 2>&1
echo === app process ===>> ..\crash-log.txt
"%ADB%" shell pidof com.pingcrood.vibe_app >> ..\crash-log.txt 2>&1
echo DONE>> build-and-run.log
echo Done. See ..\crash-log.txt
endlocal
