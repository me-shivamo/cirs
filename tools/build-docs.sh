#!/usr/bin/env bash
# Print the booth documents to PDF (docs/*.pdf) with headless Chrome.
#   tools/build-docs.sh <kiosk-link> ["Helpline name"] ["+91 phone"]
#   e.g. tools/build-docs.sh https://me-shivamo.github.io/cirs/ "Shivam" "+91 98xxxxxxx"
# Without a name/phone the Quick Start card prints blank lines to write on.
# Card screenshots live in docs/img/ (taken from the running app at 1920x1080).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LINK="${1:-https://me-shivamo.github.io/cirs/}"
HELP_NAME="${2:-}"
HELP_PHONE="${3:-}"
[[ "$LINK" == */ ]] || LINK="$LINK/"
CHROME="${CHROME:-google-chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
enc() { python3 -I -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }

print() { # html-file query out.pdf
  "$CHROME" --headless=new --disable-gpu --no-sandbox --no-pdf-header-footer --allow-file-access-from-files \
    --virtual-time-budget=8000 --user-data-dir="$TMP/profile" --print-to-pdf="$3" \
    "file://$ROOT/docs/$1?$2" >/dev/null 2>&1
  echo "Wrote $3"
}

print quick-start.html "url=$(enc "$LINK")&name=$(enc "$HELP_NAME")&phone=$(enc "$HELP_PHONE")" "$ROOT/docs/CIRS-Quick-Start.pdf"
print technician-sheet.html "url=$(enc "$LINK")" "$ROOT/docs/CIRS-Technician-Sheet.pdf"
print qr-standee.html "url=$(enc "${LINK}?visitor")" "$ROOT/docs/CIRS-QR-Standee.pdf"
