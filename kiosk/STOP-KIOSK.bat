@echo off
rem Stops the CIRS kiosk (the restart loop and its browser window). Your normal Chrome is not touched.
taskkill /fi "WINDOWTITLE eq CIRS-KIOSK-LOOP*" /t /f >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*CIRS-Kiosk-Profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Kiosk stopped.
timeout /t 2 /nobreak >nul
