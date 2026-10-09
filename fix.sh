#!/usr/bin/env bash
# The speed fix, as one repeatable script (WP-CLI + shell, free wp.org plugins only). Safe to run twice.
set -euo pipefail
cd "$(dirname "$0")"
URL=http://localhost:8091/
wp() { ./wp "$@" 2> >(grep -v -e '^ Container' -e '^$' >&2); }
run() { docker compose -p va-p4 run --rm -T cli "$@" 2> >(grep -v -e '^ Container' -e '^$' >&2); }
say() { echo "[fix] $*"; }
probe() { curl -fsS "$URL?fix-probe=$RANDOM"; }   # a query string skips the page cache, so we see the live page
count() { grep -oE "$1" | wc -l | tr -d ' '; }
html0=$(probe)                                     # the page as it was when fix.sh started

say "1/6 plugins: remove the unused ones, load plugin assets only where they are used"
before=$(wp plugin list --status=active --format=count)
for p in smart-slider-3 wpforms-lite font-awesome; do   # no slider, no WPForms form; Elementor already ships the icons
  # deactivate and delete in separate runs: WPForms' own "deleted" hook fatals if it is still loaded
  wp plugin is-installed "$p" && wp plugin deactivate "$p" --quiet && wp plugin delete "$p" --quiet
done
run sh -c 'mkdir -p /var/www/html/wp-content/mu-plugins && cp /php/speed.php /var/www/html/wp-content/mu-plugins/bayview-speed.php'
say "    active plugins $before → $(wp plugin list --status=active --format=count); stylesheets+scripts on home $(echo "$html0" | count "<link rel='stylesheet'|<script[^>]+src=") → $(probe | count "<link rel='stylesheet'|<script[^>]+src=")"

say "2/6 images: max 1920 px, WebP q78, real srcset sizes, native lazy-loading back on, hero preloaded"
run rm -f /var/www/html/wp-content/mu-plugins/bayview-legacy-snippets.php   # the 3 snippets that disabled sizes, scaling and lazy-load
wp option update elementor_optimized_image_loading 1 --quiet      # Elementor: lazy below the fold, fetchpriority on the first big image
wp option update elementor_lazy_load_background_images 1 --quiet
jpgs=$(wp eval 'foreach (get_posts(["post_type"=>"attachment","post_mime_type"=>"image/jpeg","numberposts"=>-1]) as $a) echo get_post_meta($a->ID, "_wp_attached_file", true), "\n";')
if [[ -n $jpgs ]]; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  jb=0; wb=0; names=()
  for rel in $jpgs; do
    n=$(basename "$rel" .jpg); names+=("$n")
    docker compose -p va-p4 cp "wp:/var/www/html/wp-content/uploads/$rel" "$tmp/$n.jpg" 2>/dev/null
    magick "$tmp/$n.jpg" -resize '1920x1920>' "$tmp/$n.png"
    cwebp -quiet -q 78 -metadata none "$tmp/$n.png" -o "$tmp/$n.webp"
    docker compose -p va-p4 cp "$tmp/$n.webp" "wp:/var/www/html/wp-content/uploads/${rel%.jpg}.webp" 2>/dev/null
    jb=$((jb + $(stat -f%z "$tmp/$n.jpg" 2>/dev/null || stat -c%s "$tmp/$n.jpg")))
    wb=$((wb + $(stat -f%z "$tmp/$n.webp" 2>/dev/null || stat -c%s "$tmp/$n.webp")))
  done
  re=$(IFS='|'; echo "${names[*]}")
  wp search-replace "($re)\.jpg" '$1.webp' wp_posts wp_postmeta --regex --report-changed-only --quiet
  wp db query "UPDATE wp_posts SET post_mime_type='image/webp' WHERE post_type='attachment' AND post_mime_type='image/jpeg'"
  wp media regenerate --yes --quiet
  say "    ${#names[@]} photos: $((jb / 1024)) KB JPEG → $((wb / 1024)) KB WebP (+ smaller sizes for srcset)"
else
  say "    already WebP"
fi
# Hero slides 2–3 wait until the slideshow needs them, instead of competing with slide 1 for bandwidth.
wp eval '$id = get_option("page_on_front"); $d = json_decode(get_post_meta($id, "_elementor_data", true), true);
  $d[0]["settings"]["background_slideshow_lazyload"] = "yes"; update_post_meta($id, "_elementor_data", wp_slash(wp_json_encode($d)));
  delete_metadata("post", 0, "_elementor_element_cache", "", true);   // Elementor caches rendered widgets; drop the stale copies'
wp elementor flush-css --quiet

say "3/6 page cache (Cache Enabler) + gzip + browser caching headers"
wp plugin is-installed cache-enabler || wp plugin install cache-enabler --quiet
wp plugin activate cache-enabler --quiet 2>/dev/null || true
wp eval 'require_once ABSPATH . "wp-admin/includes/misc.php"; insert_with_markers(ABSPATH . ".htaccess", "Bayview speed", file("/php/htaccess-speed.conf", FILE_IGNORE_NEW_LINES));'
gz() { curl -fsS -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}' "$1"; }
say "    home HTML over the wire: $(echo "$html0" | wc -c | tr -d ' ') B → $(gz "$URL?fix-probe=gz") B gzip; WP_CACHE=$(wp config get WP_CACHE)"
say "    headers: HTML $(curl -fsS -D- -o /dev/null -H 'Accept-Encoding: gzip' "$URL?fix-probe=hdr" | grep -iq '^content-encoding: gzip' && echo gzip || echo NOT-gzip), CSS $(curl -fsSI "${URL%/}/wp-includes/css/dist/block-library/style.min.css" | grep -iq '^expires:' && echo Expires || echo NO-Expires)"

say "4/6 fonts: Google Fonts served from this site with font-display: swap; emoji script off"
wp option update elementor_local_google_fonts 1 --quiet
wp option update elementor_font_display swap --quiet
wp elementor flush-css --quiet
html=$(probe)
say "    requests to fonts.googleapis.com $(echo "$html0" | count 'fonts\.googleapis\.com/css') → $(echo "$html" | count 'fonts\.googleapis\.com/css'); emoji script $(echo "$html0" | count 'wp-emoji-release') → $(echo "$html" | count 'wp-emoji-release')"

say "5/6 JavaScript: defer (WordPress keeps a script blocking only where inline code needs it)"
blocking() { grep -oE '<script[^>]+src=[^>]*>' | grep -vcE 'defer|async' || true; }
say "    render-blocking scripts $(echo "$html0" | blocking) → $(echo "$html" | blocking)"

say "6/6 database: revisions, expired transients, spam, optimize"
q() { wp db query "$1" --skip-column-names; }
rev=$(q "SELECT COUNT(*) FROM wp_posts WHERE post_type='revision'"); spam=$(q "SELECT COUNT(*) FROM wp_comments WHERE comment_approved='spam'")
exp=$(q "SELECT COUNT(*) FROM wp_options WHERE option_name LIKE '\_transient\_timeout\_%' AND option_value < UNIX_TIMESTAMP()")
ids=$(wp post list --post_type=revision --format=ids); [[ -n $ids ]] && wp post delete $ids --force --quiet
wp transient delete --expired --quiet
ids=$(wp comment list --status=spam --format=ids); [[ -n $ids ]] && wp comment delete $ids --force --quiet
wp db optimize --quiet >/dev/null
say "    revisions $rev → $(q "SELECT COUNT(*) FROM wp_posts WHERE post_type='revision'"), expired transients $exp → $(q "SELECT COUNT(*) FROM wp_options WHERE option_name LIKE '\_transient\_timeout\_%' AND option_value < UNIX_TIMESTAMP()"), spam $spam → $(q "SELECT COUNT(*) FROM wp_comments WHERE comment_approved='spam'")"

wp cache-enabler clear --quiet 2>/dev/null || true
curl -fsS -o /dev/null "$URL"   # warm the page cache
say "done"
