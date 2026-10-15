#!/usr/bin/env bash
# Assemble the USB pen-drive bundle in dist/usb/CIRS-KIOSK/ (copy that folder to each stick).
#   - runs offline from the stick or a laptop: double-click START-KIOSK.bat (Windows)
#   - videos/hd and videos/lite also serve "Load from USB stick" on the hosted link
#   - CIRS-Showreel.mp4 for any TV/panel media player (backup tier F)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/usb/CIRS-KIOSK"
rm -rf "$OUT"
mkdir -p "$OUT"

cp "$ROOT"/index.html "$ROOT"/manifest.webmanifest "$ROOT"/sw.js "$OUT"/
cp -r "$ROOT"/css "$ROOT"/js "$ROOT"/app-icons "$ROOT"/posters "$OUT"/
mkdir -p "$OUT/assets"
cp -r "$ROOT"/assets/icons "$ROOT"/assets/fonts "$OUT/assets/"
mkdir -p "$OUT/videos"
cp -r "$ROOT"/videos/hd "$ROOT"/videos/lite "$OUT/videos/"
cp "$ROOT"/kiosk/*.bat "$OUT"/
[[ -f "$ROOT/videos/CIRS-Showreel.mp4" ]] && cp "$ROOT/videos/CIRS-Showreel.mp4" "$OUT/"
mkdir -p "$OUT/docs"
for f in "$ROOT"/docs/*.pdf; do [[ -f "$f" ]] && cp "$f" "$OUT/docs/"; done

cat >"$OUT/READ-ME-FIRST.txt" <<'EOF'
CIRS VIDEO KIOSK - USB PEN DRIVE
================================

Windows computer or laptop:
    Double-click START-KIOSK.bat   (runs full screen, no internet needed)
    To stop: double-click STOP-KIOSK.bat
    To start automatically at power-on: copy this folder to C:\CIRS-KIOSK
    and run INSTALL-AUTOSTART.bat from there.

Android screen with Chrome (setup page open, no Wi-Fi):
    On the setup page tap "Load from USB stick", open this pen drive,
    go to videos > hd, select all 18 files (menu > Select all), tap Open/Select.

Touch not working / any TV with a USB port:
    Play CIRS-Showreel.mp4 in the screen's media player and set it to Repeat.

Help: see docs/ (Quick Start card and Technician sheet).
EOF
sed -i 's/$/\r/' "$OUT/READ-ME-FIRST.txt"

du -sh "$OUT"
echo "USB bundle ready: $OUT"
echo "Copy the CIRS-KIOSK folder to each USB stick (exFAT or NTFS recommended; FAT32 works, files are < 4 GB)."
