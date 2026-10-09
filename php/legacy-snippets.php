<?php
/**
 * Plugin Name: Bayview legacy snippets
 * Description: DEMO. Three snippets of the kind an inherited WordPress site often carries
 * (pasted from forums "to stop the slider flicker" / "to save disk space" / "keep my photos sharp").
 * Each one is a real, common setting — and each one makes the site slower. fix.sh deletes this file.
 */

// "Lazy-loading made the slider flicker" — turns off WordPress's native loading="lazy" everywhere.
add_filter('wp_lazy_loading_enabled', '__return_false');

// "Save disk space" — WordPress stops generating smaller copies, so every <img> serves the original and has no srcset.
add_filter('intermediate_image_sizes_advanced', '__return_empty_array');

// "Keep my photos sharp" — no 2560 px "-scaled" copy; the 3200 px camera original is what visitors download.
add_filter('big_image_size_threshold', '__return_false');
