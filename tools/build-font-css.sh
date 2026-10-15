#!/usr/bin/env bash
# Embed the Baloo 2 variable font into css/font.css as base64 (works offline and from file://).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
{
  echo "/* Baloo 2 (SIL Open Font License, see assets/fonts/OFL.txt), embedded so it works offline and from file://."
  echo "   Regenerate: tools/build-font-css.sh */"
  printf "@font-face{font-family:'Baloo 2';font-style:normal;font-weight:400 800;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2');}\n" \
    "$(base64 -w0 "$ROOT/assets/fonts/baloo2-latin-var.woff2")"
} >"$ROOT/css/font.css"
echo "Wrote css/font.css"
