#!/usr/bin/env bash
# End-to-end proof: slow snapshot → measure → fix.sh → measure → assert the gains and that the page still looks the same.
# Needs: Docker, Node 22, Chrome (CHROME_PATH), ImageMagick, cwebp, Playwright (PLAYWRIGHT_PATH or `npm i playwright`).
set -euo pipefail
cd "$(dirname "$0")"
t0=$(date +%s)
./reset.sh
node verify.mjs shoot before
node measure.mjs before
./fix.sh
node measure.mjs after
node verify.mjs shoot after
node verify.mjs assert
echo "[check] PASS in $(( $(date +%s) - t0 ))s"
