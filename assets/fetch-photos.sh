#!/usr/bin/env bash
# Rebuild assets/photos/*.jpg (gitignored) from Wikimedia Commons — sources + licences in photos.tsv / CREDITS.md.
# Each photo becomes a 3200 px-wide JPEG of 1.5–5 MB: what a clinic owner uploads straight off a camera.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p photos originals
tail -n +2 photos.tsv | while IFS=$'\t' read -r name url _; do
  out="photos/$name.jpg"; [[ -s "$out" ]] && continue
  orig="originals/$name.${url##*.}"
  [[ -s "$orig" ]] || curl -fsSL --retry 6 --retry-delay 20 -A "va-p4-seed/1.0" -o "$orig" "$url"
  crop=(); [[ $name == hero-3 ]] && crop=(-gravity north -crop 100%x90%+0+0 +repage)  # drop the camera timestamp
  for q in 90 94 97 99 85 80 75; do   # first quality that lands in 1.5–5 MB (smooth photos may never reach 1.5)
    magick "$orig" -auto-orient ${crop[@]+"${crop[@]}"} -resize 3200x -strip -quality "$q" "$out"
    s=$(stat -f%z "$out" 2>/dev/null || stat -c%s "$out")
    (( s >= 1500000 && s <= 5000000 )) && break
    (( q == 99 && s < 1500000 )) && break
  done
  echo "$out $(magick identify -format '%wx%h' "$out") $((s/1024)) KB q$q"
done
