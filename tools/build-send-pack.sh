#!/usr/bin/env bash
# Gather everything the booth team needs into dist/send-to-team/:
#   1-Quick-Start.pdf, 2-Technician-Sheet.pdf, 3-QR-Standee.pdf  (print these)
#   WhatsApp-message.txt                                           (paste into the group)
#   CIRS-KIOSK.zip                                                 (the pen-drive folder, to share by Drive)
# Run tools/build-usb.sh (and tools/build-docs.sh) first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/send-to-team"
rm -rf "$OUT"
mkdir -p "$OUT"

cp "$ROOT/docs/CIRS-Quick-Start.pdf" "$OUT/1-Quick-Start.pdf"
cp "$ROOT/docs/CIRS-Technician-Sheet.pdf" "$OUT/2-Technician-Sheet.pdf"
cp "$ROOT/docs/CIRS-QR-Standee.pdf" "$OUT/3-QR-Standee.pdf"
cp "$ROOT/docs/whatsapp-message.txt" "$OUT/WhatsApp-message.txt"

# Videos are already compressed, so store them as-is (-0): fast, and the zip opens anywhere.
(cd "$ROOT/dist/usb" && zip -q -0 -r "$OUT/CIRS-KIOSK.zip" CIRS-KIOSK)

ls -la "$OUT"
du -sh "$OUT"
