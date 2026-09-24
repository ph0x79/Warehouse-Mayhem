#!/usr/bin/env bash
# Headless browser checks against the working tree: boss, canvas scaling, floor/sprite sizes.
# One-time setup:  cd tests && npm install && npx playwright install chromium-headless-shell
# Run:             bash tests/run.sh      (CHROME=<path> to use an already-installed Chromium)
set -euo pipefail
cd "$(dirname "$0")"
# Plain Node, no browser or server. The warning is Node noting netlify/functions has no "type": "module".
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON submit-score.test.mjs
export PORT="${PORT:-8731}"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory .. >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT
for _ in $(seq 20); do curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html" && break; sleep 0.25; done

for t in boss scale floor gameover lob music fan cursor wind movement spawn; do
  node "$t.test.mjs"
done
echo "ALL PASS"
