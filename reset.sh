#!/usr/bin/env bash
# Put the site back to the slow snapshot, byte for byte: database + the whole docroot
# (so plugins, mu-plugins, .htaccess, cache files and converted images that fix.sh added are gone).
set -euo pipefail
cd "$(dirname "$0")"
[[ -s snapshot/slow.sql && -s snapshot/html.tar ]] || { echo "no snapshot — run ./seed.sh first" >&2; exit 1; }
run() { docker compose -p va-p4 run --rm -T cli "$@" 2> >(grep -v -e '^ Container' >&2); }
docker compose -p va-p4 up -d 2>/dev/null
run wp db reset --yes --quiet
run wp db import /snap/slow.sql --quiet
run sh -c 'cd /var/www/html && find . -mindepth 1 -delete && tar -xf /snap/html.tar'
docker compose -p va-p4 restart wp >/dev/null 2>&1   # drop PHP's opcache of the fixed files
until curl -fsS -o /dev/null http://localhost:8091/wp-includes/images/blank.gif 2>/dev/null; do sleep 1; done
echo "[reset] slow snapshot restored"
