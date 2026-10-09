<?php
/**
 * Plugin Name: Bayview speed
 * Description: Installed by fix.sh. Front-end trims that need a few lines of code, not another plugin.
 */
if (is_admin()) return;

// Step 1 — plugin assets only on pages that use them.
add_action('wp_enqueue_scripts', function () {
	$id = get_queried_object_id();
	$content = $id ? get_post_field('post_content', $id) . get_post_meta($id, '_elementor_data', true) : '';
	$unused = [
		'[instagram-feed'  => ['sbi_styles', 'sbi-tokens-local', 'sb-elementor-shared-style', 'sbi_scripts'],
		'[contact-form-7' => ['contact-form-7', 'astra-contact-form-7', 'swv'],
	];
	foreach ($unused as $shortcode => $handles) {
		if (str_contains($content, $shortcode)) continue;
		foreach ($handles as $h) { wp_dequeue_style($h); wp_dequeue_script($h); }
	}
}, 100);

// Step 2 — the hero's first slide is the LCP image: fetch it first and paint it without waiting for Elementor's JS.
add_action('wp_head', function () {
	if (!is_front_page()) return;
	$hero = get_posts(['post_type' => 'attachment', 'name' => 'hero-1', 'numberposts' => 1]);
	if (!$hero) return;
	$url = esc_url(wp_get_attachment_url($hero[0]->ID));
	printf("<link rel=\"preload\" as=\"image\" href=\"%s\" fetchpriority=\"high\">\n", $url);
	// Paint slide 1 with plain CSS, so the hero shows before the slideshow's JavaScript has run (it then fades over the same image).
	printf("<style>.bd-hero{background:url(%s) center/cover no-repeat}</style>\n", $url);
}, 1);

// Step 4 — no emoji script (every modern browser draws emoji itself).
remove_action('wp_head', 'print_emoji_detection_script', 7);
remove_action('wp_print_styles', 'print_emoji_styles');
add_filter('emoji_svg_url', '__return_false');

// Step 5 — defer every front-end script. WordPress's own loading-strategy logic (6.3+) keeps a script
// blocking when something inline still needs it straight away, so jQuery-dependent code keeps working.
add_action('wp_print_scripts', function () {
	$ws = wp_scripts();
	foreach (array_keys($ws->registered) as $h) $ws->add_data($h, 'strategy', 'defer');
}, 1);
