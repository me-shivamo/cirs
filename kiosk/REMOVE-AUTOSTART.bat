@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CIRS Kiosk.lnk" >nul 2>&1
echo The kiosk will no longer start automatically.
pause
