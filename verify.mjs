// node verify.mjs shoot <label>   → results/shots/<label>-{1280,375}.png (full page) + .json (headings), img/<label>-{1280,375}.jpg
// node verify.mjs assert          → before vs after: Lighthouse gains + headings still visible + pixel diff; prints a table, exits 1 on any failure.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Pass/fail lines — why each number is what it is: see README "check thresholds".
const MIN_SCORE_GAIN = 15;      // Lighthouse points, after − before. Plan said 25; real runs +22…+25, and the before score moves with CDN/host load — see README
const MAX_BYTES_RATIO = 0.40;   // after page weight ≤ 40 % of before
const MAX_DIFF_PCT = 1.0;       // % of pixels allowed to differ (fuzz 10 %) between before/after full-page shots
const WIDTHS = [[1280, 720], [375, 812]];
const SITE = 'http://localhost:8091/';
const dir = (p) => new URL(p, import.meta.url).pathname;
const SHOTS = dir('results/shots/'), IMG = dir('img/'), RES = dir('results/');

async function shoot(label) {
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
  mkdirSync(SHOTS, { recursive: true }); mkdirSync(IMG, { recursive: true });
  const browser = await chromium.launch();
  for (const [width, height] of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await page.goto(SITE, { waitUntil: 'networkidle', timeout: 180_000 });
    await page.evaluate(async () => {  // scroll the whole page so lazy images load, then back to the top
      for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
      scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    await page.evaluate(async () => {
      // Freeze the hero slideshow on slide 1 so before/after shots are comparable.
      for (const el of document.querySelectorAll('.elementor-background-slideshow')) {
        const s = el.swiper; if (!s) continue;
        s.autoplay?.stop(); s.params.loop ? s.slideToLoop(0, 0) : s.slideTo(0, 0);
      }
      await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
      await document.fonts.ready;
    });
    await page.waitForTimeout(800);
    const base = `${label}-${width}`;
    await page.screenshot({ path: `${SHOTS}${base}.png`, fullPage: true });
    await page.screenshot({ path: `${IMG}${base}.jpg`, type: 'jpeg', quality: 78 });
    const headings = await page.$$eval('h1,h2,h3', (els) => els.map((e) => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { text: e.innerText.trim(), visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0 };
    }));
    writeFileSync(`${SHOTS}${base}.json`, JSON.stringify({ headings }, null, 2));
    console.log(`[shoot] ${base}: ${headings.length} headings`);
    await page.close();
  }
  await browser.close();
}

function pixelDiff(a, b) {
  const size = (f) => spawnSync('magick', ['identify', '-format', '%w %h', f], { encoding: 'utf8' }).stdout.trim();
  const [sa, sb] = [size(a), size(b)];
  if (sa !== sb) return { pct: Infinity, detail: `size changed ${sa} → ${sb}` };
  const r = spawnSync('magick', ['compare', '-metric', 'AE', '-fuzz', '10%', a, b, 'null:'], { encoding: 'utf8' });
  const ae = parseFloat(r.stderr.match(/\(([\d.e+]+)\)/)?.[1] ?? r.stderr);  // IM 7 prints "<quantum-scaled> (<pixel count>)"
  if (r.status > 1 || Number.isNaN(ae)) throw new Error(`magick compare failed: ${r.stderr}`);
  const [w, h] = sa.split(' ').map(Number);
  return { pct: (100 * ae) / (w * h), detail: `${Math.round(ae)} of ${w * h} px` };
}

function assertAll() {
  const load = (l) => JSON.parse(readFileSync(`${RES}${l}.json`, 'utf8')).median;
  const b = load('before'), a = load('after');
  const rows = [['score', 'Performance score'], ['lcp_ms', 'LCP (ms)'], ['fcp_ms', 'FCP (ms)'], ['tbt_ms', 'TBT (ms)'],
    ['cls', 'CLS'], ['speed_index_ms', 'Speed Index (ms)'], ['total_bytes', 'Page weight (bytes)'], ['requests', 'Requests']];
  console.log('\n| Metric | Before | After | Change |\n|---|---:|---:|---:|');
  for (const [k, name] of rows) {
    const ch = b[k] ? `${a[k] >= b[k] ? '+' : ''}${(((a[k] - b[k]) / b[k]) * 100).toFixed(0)}%` : '—';
    console.log(`| ${name} | ${b[k]} | ${a[k]} | ${ch} |`);
  }
  const checks = [
    [`score +${a.score - b.score} ≥ +${MIN_SCORE_GAIN}`, a.score - b.score >= MIN_SCORE_GAIN],
    [`page weight ${(100 * a.total_bytes / b.total_bytes).toFixed(1)}% of before ≤ ${MAX_BYTES_RATIO * 100}%`, a.total_bytes <= MAX_BYTES_RATIO * b.total_bytes],
    [`LCP ${a.lcp_ms} ms < ${b.lcp_ms} ms`, a.lcp_ms < b.lcp_ms],
  ];
  for (const [w] of WIDTHS) {
    const hb = JSON.parse(readFileSync(`${SHOTS}before-${w}.json`, 'utf8')).headings.filter((h) => h.visible && h.text);
    const ha = JSON.parse(readFileSync(`${SHOTS}after-${w}.json`, 'utf8')).headings;
    const missing = hb.filter((h) => !ha.some((x) => x.visible && x.text === h.text)).map((h) => h.text);
    checks.push([`${w}px: ${hb.length - missing.length}/${hb.length} section headings visible${missing.length ? ` (missing: ${missing.join(' | ')})` : ''}`, hb.length > 0 && !missing.length]);
    const d = pixelDiff(`${SHOTS}before-${w}.png`, `${SHOTS}after-${w}.png`);
    checks.push([`${w}px: pixel diff ${d.pct.toFixed(3)}% (${d.detail}) ≤ ${MAX_DIFF_PCT}%`, d.pct <= MAX_DIFF_PCT]);
  }
  console.log('');
  for (const [msg, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}

const [cmd, label] = process.argv.slice(2);
if (cmd === 'shoot' && /^[\w-]+$/.test(label ?? '')) await shoot(label);
else if (cmd === 'assert') assertAll();
else { console.error('usage: node verify.mjs shoot <label> | assert'); process.exit(2); }
