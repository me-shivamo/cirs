#!/usr/bin/env bash
# Bake the 19 "4a" topic discs into assets/icons/NN.webp (400x400, transparent corners).
# Sources: design/crops/*.png (from the Claude Design project) and design/fluent/*.svg
# (Microsoft Fluent Emoji, MIT licence). Needs Google Chrome and ffmpeg with libwebp.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/icons"
TMP="$(mktemp -d)"
CHROME="${CHROME:-google-chrome}"
mkdir -p "$OUT"

for n in $(seq 1 19); do
  nn="$(printf %02d "$n")"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --mute-audio \
    --allow-file-access-from-files --force-device-scale-factor=2 --window-size=600,600 \
    --default-background-color=00000000 --virtual-time-budget=3000 \
    --user-data-dir="$TMP/profile" --screenshot="$TMP/$nn.png" \
    "file://$ROOT/tools/icons/compose.html?n=$n" >/dev/null 2>&1
  ffmpeg -hide_banner -loglevel error -y -i "$TMP/$nn.png" \
    -vf "crop=400:400:0:0" -c:v libwebp -lossless 0 -quality 88 -pix_fmt yuva420p "$OUT/$nn.webp"
  printf "%s  %s KB\n" "$nn.webp" "$(( $(stat -c %s "$OUT/$nn.webp") / 1024 ))"
done

rm -rf "$TMP"
du -sh "$OUT"
