#!/usr/bin/env bash
# Build the hosted site into dist/site/ (app only; videos are hosted separately, e.g. Cloudflare R2).
#   tools/build-site.sh https://videos.example.org/      sets remoteBase in the built config.js
#   tools/build-site.sh --lite-only                      preview with the Lite videos included (GitHub Pages)
# Bumps the service-worker version so devices pick up the new build on "Check for updates".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/site"
LITE_ONLY=0
if [[ "${1:-}" == "--lite-only" ]]; then LITE_ONLY=1; shift; fi
BASE="${1:-}"
rm -rf "$OUT"
mkdir -p "$OUT/assets"

cp "$ROOT"/index.html "$ROOT"/manifest.webmanifest "$ROOT"/sw.js "$OUT"/
cp -r "$ROOT"/css "$ROOT"/js "$ROOT"/app-icons "$ROOT"/posters "$OUT"/
cp -r "$ROOT"/assets/icons "$ROOT"/assets/fonts "$OUT/assets/"

if [[ -n "$BASE" ]]; then
  [[ "$BASE" == */ ]] || BASE="$BASE/"
  sed -i "s|^  remoteBase: '.*',|  remoteBase: '$BASE',|" "$OUT/js/config.js"
fi
VER="$(date +%Y%m%d-%H%M%S)"
sed -i "s|^var VERSION = '.*';|var VERSION = '$VER';|" "$OUT/sw.js"
# Version-stamp the page's own files so browsers never mix an old cached copy with a new one.
sed -i -E "s#(href|src)=\"((css|js)/[^\"?]+|manifest\.webmanifest)\"#\1=\"\2?v=$VER\"#g" "$OUT/index.html"

# --lite-only: a self-contained preview (e.g. GitHub Pages, max 100 MB per file) with the
# 720p copies served next to the app.
if (( LITE_ONLY )); then
  sed -i "s|^  liteOnly: false,|  liteOnly: true,|" "$OUT/js/config.js"
  mkdir -p "$OUT/videos"
  cp -r "$ROOT/videos/lite" "$OUT/videos/"
  touch "$OUT/.nojekyll"
fi

# Cloudflare Pages: don't let the browser cache sw.js or config.js for long.
cat >"$OUT/_headers" <<'EOF'
/sw.js
  Cache-Control: no-cache
/js/*
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
EOF

grep -n "remoteBase:" "$OUT/js/config.js"
grep -n "^var VERSION" "$OUT/sw.js"
du -sh "$OUT"
echo "Site ready in $OUT (deploy this folder; upload videos/hd and videos/lite to the video host)."
