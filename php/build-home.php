<?php
// wp eval-file /php/build-home.php — builds the Bayview Dental home page as Elementor data.
// Idempotent: reuses the "Home" page if it exists. Fictional clinic, demo content.

$img = function (string $slug) {
	$p = get_page_by_path($slug, OBJECT, 'attachment');
	if (!$p) WP_CLI::error("missing attachment $slug — run the media import first");
	return ['id' => $p->ID, 'url' => wp_get_attachment_url($p->ID)];
};
$n = 0;
$id = function () use (&$n) { return substr(md5('bayview' . ++$n), 0, 7); };
$typo = function (string $family, string $weight, int $px, ?int $mobile = null, string $style = '') {
	$t = ['typography_typography' => 'custom', 'typography_font_family' => $family, 'typography_font_weight' => $weight,
		'typography_font_size' => ['unit' => 'px', 'size' => $px]];
	if ($mobile) $t['typography_font_size_mobile'] = ['unit' => 'px', 'size' => $mobile];
	if ($style) $t['typography_font_style'] = $style;
	return $t;
};
$w = function (string $type, array $settings) use ($id) {
	return ['id' => $id(), 'elType' => 'widget', 'widgetType' => $type, 'settings' => $settings, 'elements' => []];
};
$col = function (int $size, array $widgets, array $settings = []) use ($id) {
	return ['id' => $id(), 'elType' => 'column', 'settings' => ['_column_size' => $size, '_inline_size' => null] + $settings, 'elements' => $widgets];
};
$section = function (array $cols, array $settings = []) use ($id) {
	return ['id' => $id(), 'elType' => 'section', 'settings' => $settings + [
		'padding' => ['unit' => 'px', 'top' => '80', 'right' => '20', 'bottom' => '80', 'left' => '20', 'isLinked' => false],
	], 'elements' => $cols];
};
$NAVY = '#0B3954'; $TEAL = '#1B998B'; $INK = '#33475B'; $SOFT = '#F2F7FA';
$h = function (string $text, string $tag = 'h2', string $color = '#0B3954', string $align = 'center', int $px = 38, int $mobile = 28) use ($w, $typo) {
	return $w('heading', ['title' => $text, 'header_size' => $tag, 'align' => $align, 'title_color' => $color] + $typo('Poppins', '700', $px, $mobile));
};
$p = function (string $html, string $align = 'center', string $color = '#33475B') use ($w, $typo) {
	return $w('text-editor', ['editor' => $html, 'align' => $align, 'text_color' => $color] + $typo('Open Sans', '400', 17, 16));
};
$btn = function (string $text, string $url, string $bg, string $fg = '#FFFFFF') use ($w, $typo) {
	return $w('button', ['text' => $text, 'link' => ['url' => $url], 'background_color' => $bg, 'button_text_color' => $fg, 'size' => 'md',
		'border_radius' => ['unit' => 'px', 'top' => '30', 'right' => '30', 'bottom' => '30', 'left' => '30', 'isLinked' => true],
		'_css_classes' => 'bd-btn'] + $typo('Poppins', '600', 16));
};
$anchor = fn(string $a) => ['_element_id' => $a];

// 1. Hero — background slideshow (Elementor's free "slideshow" background), three full-size photos.
$hero = $section([$col(100, [
	$w('heading', ['title' => 'Bayview Dental · Davao City', 'header_size' => 'p', 'align' => 'left', 'title_color' => '#9FE3D9'] + $typo('Open Sans', '600', 16)),
	$h('Gentle dental care in the heart of Davao City', 'h1', '#FFFFFF', 'left', 58, 36),
	$p('<p>Check-ups, cleanings, braces and same-week appointments on J.P. Laurel Avenue. Open Monday to Saturday, 9am to 6pm.</p>', 'left', '#E8F1F5'),
	$btn('Book an appointment', '#contact', $TEAL),
	$btn('Call the front desk', 'tel:+6382000000', '#FFFFFF', $NAVY),
], ['content_position' => 'center'])], [
	'layout' => 'boxed', 'content_width' => ['unit' => 'px', 'size' => 1140], 'height' => 'min-height',
	'custom_height' => ['unit' => 'vh', 'size' => 86], 'custom_height_mobile' => ['unit' => 'vh', 'size' => 82],
	'background_background' => 'slideshow',
	'background_slideshow_gallery' => [$img('hero-1'), $img('hero-2'), $img('hero-3')],
	'background_slideshow_loop' => 'yes', 'background_slideshow_slide_duration' => 5000,
	'background_slideshow_slide_transition' => 'fade', 'background_slideshow_transition_duration' => 800,
	'background_overlay_background' => 'classic', 'background_overlay_color' => $NAVY,
	'background_overlay_opacity' => ['unit' => 'px', 'size' => 0.62], '_element_id' => 'top', 'css_classes' => 'bd-hero',
]);

// 2. Quick facts strip.
$fact = fn($icon, $title, $text) => $col(33, [$w('icon-box', [
	'selected_icon' => ['value' => "fas fa-$icon", 'library' => 'fa-solid'], 'title_text' => $title, 'description_text' => $text,
	'position' => 'left', 'primary_color' => $TEAL, 'title_color' => $NAVY, 'description_color' => $INK,
	'icon_size' => ['unit' => 'px', 'size' => 34],
	'title_typography_typography' => 'custom', 'title_typography_font_family' => 'Poppins', 'title_typography_font_weight' => '600',
	'description_typography_typography' => 'custom', 'description_typography_font_family' => 'Open Sans',
])]);
$facts = $section([
	$fact('clock', 'Mon–Sat, 9am–6pm', 'One-hour appointments. Closed Sundays.'),
	$fact('shield-alt', 'HMO welcome', 'Maxicare and Intellicare accepted.'),
	$fact('wallet', 'Cash, GCash or card', 'Final price confirmed after your check-up.'),
], ['background_background' => 'classic', 'background_color' => $SOFT,
	'padding' => ['unit' => 'px', 'top' => '40', 'right' => '20', 'bottom' => '40', 'left' => '20', 'isLinked' => false]]);

// 3. Services — four cards, photos used at full size.
$svc = fn($slug, $title, $text) => $col(25, [
	$w('image', ['image' => $img($slug), 'image_size' => 'full', 'height' => ['unit' => 'px', 'size' => 220], 'object-fit' => 'cover',
		'image_border_radius' => ['unit' => 'px', 'top' => '12', 'right' => '12', 'bottom' => '12', 'left' => '12', 'isLinked' => true]]),
	$h($title, 'h3', $NAVY, 'left', 21, 20),
	$p("<p>$text</p>", 'left'),
]);
$services = $section([
	$col(100, [$h('Our services'), $p('<p>Everything a family needs, from a first check-up to a brighter smile.</p>')]),
], $anchor('services') + ['padding' => ['unit' => 'px', 'top' => '80', 'right' => '20', 'bottom' => '10', 'left' => '20', 'isLinked' => false]]);
$serviceCards = $section([
	$svc('service-checkup', 'Check-ups & fillings', 'A full exam, then fillings from ₱1,000 if you need them.'),
	$svc('service-cleaning', 'Teeth cleaning', 'Scaling and polishing for ₱1,500. Whitening from ₱8,000.'),
	$svc('service-xray', 'Digital X-rays', 'Low-dose X-rays read on the spot, so you see what we see.'),
	$svc('service-orthodontics', 'Braces & extractions', 'Free braces consultation. Extractions from ₱1,200.'),
], ['padding' => ['unit' => 'px', 'top' => '10', 'right' => '20', 'bottom' => '80', 'left' => '20', 'isLinked' => false]]);

// 4. About.
$about = $section([
	$col(50, [$w('image', ['image' => $img('about'), 'image_size' => 'full', 'height' => ['unit' => 'px', 'size' => 460], 'object-fit' => 'cover',
		'image_border_radius' => ['unit' => 'px', 'top' => '16', 'right' => '16', 'bottom' => '16', 'left' => '16', 'isLinked' => true]])]),
	$col(50, [
		$h('A calm clinic and a careful team', 'h2', $NAVY, 'left'),
		$p('<p>Bayview Dental is a family clinic on J.P. Laurel Avenue. We explain every step before we start, give you the price up front, and keep the waiting room quiet and on time.</p><ul><li>Sterilised instruments for every patient</li><li>Digital records — no repeated paperwork</li><li>Kids and nervous patients welcome</li></ul>', 'left'),
		$btn('Book a check-up', '#contact', $TEAL),
	], ['content_position' => 'center']),
], ['background_background' => 'classic', 'background_color' => $SOFT, '_element_id' => 'about']);

// 5. Team (monograms — the clinic is fictional, so no stock faces pretending to be dentists).
$member = fn($ini, $name, $role) => $col(33, [
	$w('text-editor', ['editor' => "<div class=\"bd-avatar\">$ini</div>", 'align' => 'center']),
	$h($name, 'h3', $NAVY, 'center', 21, 20),
	$p("<p>$role</p>"),
]);
$team = $section([
	$col(100, [$h('Meet the team')]),
], $anchor('team') + ['padding' => ['unit' => 'px', 'top' => '80', 'right' => '20', 'bottom' => '0', 'left' => '20', 'isLinked' => false]]);
$teamRow = $section([
	$member('AR', 'Dr. Ana Reyes', 'General dentist · 12 years'),
	$member('PS', 'Dr. Paolo Santos', 'Orthodontist · braces & aligners'),
	$member('JC', 'Jessa Cruz', 'Dental hygienist · cleanings'),
]);

// 6. Testimonials.
$quote = fn($text, $who, $where) => $col(33, [$w('testimonial', [
	'testimonial_content' => $text, 'testimonial_image' => ['url' => '', 'id' => ''], 'testimonial_name' => $who, 'testimonial_job' => $where, 'testimonial_alignment' => 'center',
	'content_content_color' => $INK, 'name_text_color' => $NAVY, 'job_text_color' => $TEAL,
	'content_typography_typography' => 'custom', 'content_typography_font_family' => 'Lora', 'content_typography_font_style' => 'italic',
	'content_typography_font_size' => ['unit' => 'px', 'size' => 18],
	'name_typography_typography' => 'custom', 'name_typography_font_family' => 'Poppins', 'name_typography_font_weight' => '600',
])], ['background_background' => 'classic', 'background_color' => '#FFFFFF',
	'border_radius' => ['unit' => 'px', 'top' => '14', 'right' => '14', 'bottom' => '14', 'left' => '14', 'isLinked' => true],
	'margin' => ['unit' => 'px', 'top' => '10', 'right' => '10', 'bottom' => '10', 'left' => '10', 'isLinked' => true],
	'padding' => ['unit' => 'px', 'top' => '30', 'right' => '24', 'bottom' => '30', 'left' => '24', 'isLinked' => false]]);
$reviews = $section([$col(100, [$h('What patients say'), $p('<p>Sample reviews for this demo site.</p>')])],
	$anchor('reviews') + ['background_background' => 'classic', 'background_color' => $SOFT,
	'padding' => ['unit' => 'px', 'top' => '80', 'right' => '20', 'bottom' => '10', 'left' => '20', 'isLinked' => false]]);
$reviewRow = $section([
	$quote('They told me the price before touching anything. The cleaning took forty minutes and didn’t hurt.', 'Maria L.', 'Matina'),
	$quote('My son was scared of dentists. Dr. Ana let him hold the mirror the whole time. Now he asks when we go back.', 'Joel P.', 'Lanang'),
	$quote('Booked on Monday, seen on Wednesday. Friendly front desk and they accepted my Maxicare card.', 'Grace T.', 'Bajada'),
], ['background_background' => 'classic', 'background_color' => $SOFT,
	'padding' => ['unit' => 'px', 'top' => '10', 'right' => '20', 'bottom' => '80', 'left' => '20', 'isLinked' => false]]);

// 7. Gallery — WordPress gallery at full size.
$gallery = $section([$col(100, [
	$h('Inside the clinic'),
	$w('image-gallery', ['wp_gallery' => [$img('gallery-1'), $img('gallery-2'), $img('gallery-3'), $img('gallery-4')],
		'thumbnail_size' => 'full', 'gallery_columns' => '4', 'gallery_columns_mobile' => '2', 'gallery_link' => 'none', '_css_classes' => 'bd-gallery']),
])], $anchor('gallery'));

// 8. Contact — Contact Form 7.
$form = get_posts(['post_type' => 'wpcf7_contact_form', 'numberposts' => 1, 'title' => 'Book an appointment']);
$contact = $section([
	$col(50, [
		$h('Book a visit', 'h2', '#FFFFFF', 'left'),
		$p('<p><strong>Bayview Dental</strong><br>J.P. Laurel Avenue, Davao City (demo)</p><p>Monday to Saturday, 9am to 6pm<br>Closed Sundays</p><p>Please give 24 hours’ notice to move or cancel.</p>', 'left', '#E8F1F5'),
	]),
	$col(50, [$w('shortcode', ['shortcode' => '[contact-form-7 id="' . $form[0]->ID . '" title="Book an appointment"]'])], ['css_classes' => 'bd-form']),
], $anchor('contact') + ['background_background' => 'classic', 'background_color' => $NAVY]);

$note = $section([$col(100, [$p('<p>Demo site for a portfolio project — Bayview Dental is a fictional clinic. Photos: Wikimedia Commons, see credits.</p>', 'center', '#5B6B7A')])],
	['padding' => ['unit' => 'px', 'top' => '20', 'right' => '20', 'bottom' => '20', 'left' => '20', 'isLinked' => false]]);

$data = [$hero, $facts, $services, $serviceCards, $about, $team, $teamRow, $reviews, $reviewRow, $gallery, $contact, $note];

$home = get_page_by_path('home');
$pid = $home ? $home->ID : wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Home', 'post_name' => 'home']);
update_post_meta($pid, '_elementor_edit_mode', 'builder');
update_post_meta($pid, '_elementor_template_type', 'wp-page');
update_post_meta($pid, '_elementor_version', ELEMENTOR_VERSION);
update_post_meta($pid, '_wp_page_template', 'elementor_header_footer');
update_post_meta($pid, '_elementor_data', wp_slash(wp_json_encode($data)));
update_option('show_on_front', 'page');
update_option('page_on_front', $pid);

// Kit defaults → the same three Google families the widgets use (Elementor requests every weight of each).
$kit = (int) get_option('elementor_active_kit');
$ks = get_post_meta($kit, '_elementor_page_settings', true) ?: [];
$ks['system_typography'] = [
	['_id' => 'primary', 'title' => 'Primary', 'typography_typography' => 'custom', 'typography_font_family' => 'Poppins', 'typography_font_weight' => '600'],
	['_id' => 'secondary', 'title' => 'Secondary', 'typography_typography' => 'custom', 'typography_font_family' => 'Poppins', 'typography_font_weight' => '500'],
	['_id' => 'text', 'title' => 'Text', 'typography_typography' => 'custom', 'typography_font_family' => 'Open Sans', 'typography_font_weight' => '400'],
	['_id' => 'accent', 'title' => 'Accent', 'typography_typography' => 'custom', 'typography_font_family' => 'Poppins', 'typography_font_weight' => '600'],
];
$ks['system_colors'] = [
	['_id' => 'primary', 'title' => 'Primary', 'color' => $NAVY], ['_id' => 'secondary', 'title' => 'Secondary', 'color' => $TEAL],
	['_id' => 'text', 'title' => 'Text', 'color' => $INK], ['_id' => 'accent', 'title' => 'Accent', 'color' => $TEAL],
];
update_post_meta($kit, '_elementor_page_settings', $ks);
\Elementor\Plugin::$instance->files_manager->clear_cache();
WP_CLI::success("home page $pid built (" . strlen(wp_json_encode($data)) . ' bytes of Elementor data)');
