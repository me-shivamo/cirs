#!/usr/bin/env bash
# Build videos/CIRS-Showreel.mp4: all 18 topics back to back, each after a 3-second title card.
# Backup tier F: plays on any TV / panel media player from a USB stick (set it to repeat).
# Needs videos/hd/ (run tools/transcode.sh first), Google Chrome and ffmpeg.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/videos/CIRS-Showreel.mp4"
WORK="$(mktemp -d)"
CHROME="${CHROME:-google-chrome}"
trap 'rm -rf "$WORK"' EXIT

: >"$WORK/list.txt"
for f in "$ROOT"/videos/hd/[0-9][0-9]-*.mp4; do
  n="$(basename "$f" | cut -c1-2)"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --window-size=1920,1400 \
    --allow-file-access-from-files --virtual-time-budget=3000 --user-data-dir="$WORK/profile" \
    --screenshot="$WORK/card-raw-$n.png" "file://$ROOT/tools/showreel/card.html?n=$n" >/dev/null 2>&1
  ffmpeg -hide_banner -loglevel error -y -i "$WORK/card-raw-$n.png" -vf "crop=1920:1080:0:0" "$WORK/card-$n.png"
  ffmpeg -hide_banner -loglevel error -y \
    -loop 1 -framerate 25 -t 3 -i "$WORK/card-$n.png" \
    -f lavfi -t 3 -i anullsrc=r=48000:cl=stereo \
    -i "$f" \
    -filter_complex "[0:v]format=yuv420p,setsar=1[c];[2:v]fps=25,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];[2:a]aresample=48000,aformat=channel_layouts=stereo[a];[c][1:a][v][a]concat=n=2:v=1:a=1[ov][oa]" \
    -map "[ov]" -map "[oa]" -c:v libx264 -preset medium -crf 23 -maxrate 4M -bufsize 8M \
    -profile:v high -level 4.0 -g 50 -c:a aac -b:a 128k "$WORK/seg-$n.mp4"
  echo "file '$WORK/seg-$n.mp4'" >>"$WORK/list.txt"
  echo "segment $n done"
done

ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$WORK/list.txt" -c copy -movflags +faststart "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
