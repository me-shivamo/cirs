#!/usr/bin/env bash
# Download the 18 source videos from the public CIRS Google Drive folder.
#   tools/fetch-videos.sh            download missing/incomplete files (resumable)
#   tools/fetch-videos.sh --refresh  compare tools/videos.tsv with the live folder listing
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSV="$ROOT/tools/videos.tsv"
OUT="$ROOT/videos/source"
FOLDER_ID="1PEdc1oiNJ69oz_RuA0imHIRmi7qAKCSX"
PARALLEL="${PARALLEL:-4}"

if [[ "${1:-}" == "--refresh" ]]; then
  echo "Comparing tools/videos.tsv with the live Drive folder..."
  live="$(python3 -I "$ROOT/tools/drive_list.py" "$FOLDER_ID")"
  status=0
  while IFS=$'\t' read -r num slug id bytes name; do
    [[ "$num" == \#* || -z "$num" ]] && continue
    if ! grep -q "^$id"$'\t'"$bytes"$'\t' <<<"$live"; then
      echo "CHANGED/MISSING: $num $slug ($name)"
      grep -F "$(cut -c1-3 <<<"$name")" <<<"$live" | sed 's/^/    live: /' || true
      status=1
    fi
  done <"$TSV"
  [[ $status == 0 ]] && echo "All 18 files match the Drive folder."
  exit $status
fi

mkdir -p "$OUT"

fetch_one() {
  local num="$1" slug="$2" id="$3" bytes="$4"
  local dest="$OUT/$num-$slug.mp4"
  local have=0
  [[ -f "$dest" ]] && have=$(stat -c %s "$dest")
  if [[ "$have" == "$bytes" ]]; then
    echo "ok    $num $slug (already downloaded)"
    return 0
  fi
  for attempt in 1 2 3 4 5; do
    curl -sSL --fail -C - --retry 3 --retry-delay 5 -A "Mozilla/5.0" \
      -o "$dest" "https://drive.usercontent.google.com/download?id=$id&export=download&confirm=t" || true
    have=$(stat -c %s "$dest" 2>/dev/null || echo 0)
    [[ "$have" == "$bytes" ]] && { echo "done  $num $slug ($((bytes / 1048576)) MB)"; return 0; }
    # A size larger than expected means a bad resume: start that file over.
    (( have > bytes )) && rm -f "$dest"
    echo "retry $num $slug (attempt $attempt, have $have of $bytes bytes)" >&2
    sleep 5
  done
  echo "FAIL  $num $slug" >&2
  return 1
}
export -f fetch_one
export OUT

grep -v '^#' "$TSV" | awk -F'\t' 'NF>=4 {print $1, $2, $3, $4}' |
  xargs -P "$PARALLEL" -n 4 bash -c 'fetch_one "$@"' _

echo "All videos are in $OUT"
