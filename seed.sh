#!/usr/bin/env bash
# Build the deliberately slow Bayview Dental site from nothing, then snapshot it for reset.sh.
#   ./seed.sh            (needs assets/photos — assets/fetch-photos.sh downloads them)
set -euo pipefail
cd "$(dirname "$0")"
URL=http://localhost:8091
wp() { ./wp "$@" 2> >(grep -v -e '^ Container' -e '^$' >&2); }

[[ $(ls assets/photos/*.jpg 2>/dev/null | wc -l) -ge 12 ]] || assets/fetch-photos.sh
mkdir -p snapshot
docker compose -p va-p4 up -d
printf 'waiting for wordpress'; until curl -fsS -o /dev/null "$URL/wp-includes/images/blank.gif" 2>/dev/null; do printf .; sleep 2; done; echo

wp core is-installed 2>/dev/null || wp core install --url=$URL --title="Bayview Dental" \
  --admin_user=admin --admin_password=admin --admin_email=admin@example.com --skip-email
wp plugin delete akismet hello 2>/dev/null || true
wp theme install astra --activate
# Front-end plugins a typical clinic site collects. The last two are installed and active but used on no page.
wp plugin install elementor essential-addons-for-elementor-lite contact-form-7 font-awesome instagram-feed \
  smart-slider-3 wpforms-lite --activate
wp eval 'wp_mkdir_p(WP_CONTENT_DIR."/mu-plugins");'
docker compose -p va-p4 run --rm -T cli cp /php/legacy-snippets.php /var/www/html/wp-content/mu-plugins/bayview-legacy-snippets.php 2>/dev/null

if [[ -z $(wp post list --post_type=attachment --name=hero-1 --format=ids) ]]; then
  docker compose -p va-p4 run --rm -T cli sh -c 'wp media import /photos/*.jpg --porcelain' >/dev/null 2>&1  # full-size originals, no smaller copies (legacy snippets)
fi
# Elementor's own image-loading optimisation (lazy-load + fetchpriority) and lazy background images: both are
# settings in Elementor → Settings → Performance, and plenty of sites have them off. The slow site does.
wp option update elementor_optimized_image_loading 0
wp option update elementor_lazy_load_background_images 0
wp eval-file /php/site.php
wp eval-file /php/build-home.php
wp eval-file /php/bloat.php
wp rewrite flush
curl -fsS -o /dev/null "$URL/"   # first view writes Elementor's generated CSS, so the snapshot holds it

wp db export /snap/slow.sql --quiet
docker compose -p va-p4 run --rm -T cli tar -C /var/www/html -cf /snap/html.tar . 2>/dev/null
echo "seeded: $URL  (admin/admin)  snapshot: $(du -sh snapshot | cut -f1)"
