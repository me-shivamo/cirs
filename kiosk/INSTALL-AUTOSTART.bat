@echo off
rem Makes the kiosk start by itself when this laptop is switched on (and keeps the screen awake).
rem Run this from the laptop's own copy of the folder (for example C:\CIRS-KIOSK), not from a USB stick.
setlocal
set "TARGET=%~dp0START-KIOSK.bat"
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CIRS Kiosk.lnk"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LINK%'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
rem Never sleep or turn the screen off (plugged in and on battery).
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change monitor-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
echo.
echo Done. The kiosk will start automatically when Windows starts.
echo Also: pause Windows Update (Settings ^> Windows Update ^> Pause) and turn on Do Not Disturb.
pause
