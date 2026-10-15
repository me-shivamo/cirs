@echo off
rem ================================================================
rem  CIRS video kiosk - start full screen from this folder.
rem  Works with no internet. Restarts the browser if it closes or crashes.
rem  To stop the kiosk: double-click STOP-KIOSK.bat
rem ================================================================
setlocal
if not "%~1"=="run" (
  start "CIRS-KIOSK-LOOP" /min cmd /c ""%~f0" run"
  exit /b
)

set "HERE=%~dp0"
if exist "%HERE%index.html" (set "PAGE=%HERE%index.html") else (set "PAGE=%HERE%..\index.html")
for %%F in ("%PAGE%") do set "PAGE=%%~fF"
set "URL=file:///%PAGE:\=/%"
set "PROFILE=%LOCALAPPDATA%\CIRS-Kiosk-Profile"

set "BROWSER="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if not defined BROWSER if exist %%P set "BROWSER=%%~P"

if not defined BROWSER (
  echo Google Chrome or Microsoft Edge was not found on this computer.
  pause
  exit /b 1
)

:loop
"%BROWSER%" --kiosk "%URL%" --user-data-dir="%PROFILE%" ^
  --autoplay-policy=no-user-gesture-required --disable-pinch --overscroll-history-navigation=0 ^
  --noerrdialogs --disable-session-crashed-bubble --disable-infobars --no-first-run ^
  --no-default-browser-check --disable-translate --disable-features=Translate,TranslateUI ^
  --disable-component-update --check-for-update-interval=31536000 ^
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
timeout /t 3 /nobreak >nul
goto loop
