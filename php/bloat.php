<?php
// wp eval-file /php/bloat.php — the database a few years of normal use leaves behind:
// blog posts edited many times (revisions), plugin caches that expired and were never cleaned, spam.
$titles = ['How often should you get a dental cleaning?', 'Braces or clear aligners: which is right for you?', 'What to do in a dental emergency',
	'Is teeth whitening safe?', 'Getting kids ready for their first check-up', 'Does your HMO cover dental?'];
$revisions = 0;
foreach ($titles as $t) {
	$post = get_posts(['post_type' => 'post', 'title' => $t, 'numberposts' => 1]);
	$pid = $post ? $post[0]->ID : wp_insert_post(['post_title' => $t, 'post_status' => 'publish', 'post_content' => "<p>$t — draft.</p>"]);
	for ($i = 1; $i <= 60; $i++) {   // 60 saves each: every autosave-and-update from the editor keeps a full copy
		wp_update_post(['ID' => $pid, 'post_content' => "<p>$t</p>\n" . str_repeat("<p>Edit $i. Bayview Dental answers this in plain words: ask us at your next visit.</p>\n", 12 + $i % 7)]);
		$revisions++;
	}
}
global $wpdb;
for ($i = 1; $i <= 600; $i++) {   // expired transients: plugins set them, nothing ever deletes the stale ones
	$k = "bd_feed_cache_$i";
	$wpdb->replace($wpdb->options, ['option_name' => "_transient_timeout_$k", 'option_value' => time() - 86400 * (1 + $i % 300), 'autoload' => 'off']);
	$wpdb->replace($wpdb->options, ['option_name' => "_transient_$k", 'option_value' => str_repeat('x', 1500), 'autoload' => 'off']);
}
$hello = get_posts(['numberposts' => 1, 'post_type' => 'post', 'orderby' => 'ID', 'order' => 'ASC'])[0];
for ($i = 1; $i <= 250; $i++)
	wp_insert_comment(['comment_post_ID' => $hello->ID, 'comment_author' => "seo-backlinks-$i", 'comment_author_email' => "spam$i@example.com",
		'comment_content' => 'Great post! Cheap backlinks here.', 'comment_approved' => 'spam']);
WP_CLI::success(sprintf('revisions %d, expired transients %d, spam %d',
	$wpdb->get_var("SELECT COUNT(*) FROM $wpdb->posts WHERE post_type='revision'"),
	$wpdb->get_var("SELECT COUNT(*) FROM $wpdb->options WHERE option_name LIKE '\\_transient\\_timeout\\_%' AND option_value < UNIX_TIMESTAMP()"),
	$wpdb->get_var("SELECT COUNT(*) FROM $wpdb->comments WHERE comment_approved='spam'")));
