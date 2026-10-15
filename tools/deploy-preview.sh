#!/usr/bin/env bash
# Update the team preview on GitHub Pages (https://me-shivamo.github.io/cirs/).
# Builds the Lite-only site, syncs it into dist/gh-pages (a checkout of the gh-pages branch)
# and pushes. Unchanged videos are not uploaded again.
#   tools/deploy-preview.sh "Commit message"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/dist/gh-pages"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
MSG="${1:-Update preview}"

"$ROOT/tools/build-site.sh" --lite-only >/dev/null

if [[ ! -d "$DEPLOY/.git" ]]; then
  git clone --branch gh-pages --single-branch "$REMOTE" "$DEPLOY"
fi
rsync -a --delete --exclude .git "$ROOT/dist/site/" "$DEPLOY/"

cd "$DEPLOY"
git add -A
if git diff --cached --quiet; then
  echo "Preview is already up to date."
  exit 0
fi
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" commit -q -m "$MSG"
git push -q origin gh-pages
echo "Pushed. GitHub Pages will update in 1-2 minutes: https://me-shivamo.github.io/cirs/?demo"
