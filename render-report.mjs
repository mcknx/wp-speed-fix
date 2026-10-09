// node render-report.mjs → report.html (self-contained: results/before.json + after.json inlined, no network).
import { readFileSync, writeFileSync } from 'node:fs';

const dir = (p) => new URL(p, import.meta.url).pathname;
const [b, a] = ['before', 'after'].map((l) => JSON.parse(readFileSync(dir(`results/${l}.json`), 'utf8')));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const rows = [
  ['Largest Contentful Paint', 'lcp_ms', sec], ['First Contentful Paint', 'fcp_ms', sec], ['Total Blocking Time', 'tbt_ms', (v) => `${v} ms`],
  ['Cumulative Layout Shift', 'cls', (v) => v.toFixed(3)], ['Speed Index', 'speed_index_ms', sec],
  ['Page weight', 'total_bytes', mb], ['Requests', 'requests', String],
];
const fixes = [
  ['Plugins', 'Removed 3 plugins nothing used (Smart Slider 3, WPForms Lite, Font Awesome); Instagram Feed and Contact Form 7 files load only where they are used.'],
  ['Images', '12 camera-size JPEGs (24 MB) → WebP at max 1920 px, real srcset sizes, lazy-loading below the fold, hero preloaded with fetchpriority=high.'],
  ['Caching', 'Page cache (Cache Enabler), gzip, and browser-cache headers in .htaccess.'],
  ['Fonts', 'Three Google Font families served from the site itself with font-display: swap; emoji script off.'],
  ['JavaScript', 'Every script deferred; WordPress keeps one blocking only where inline code needs it.'],
  ['Database', 'Old revisions, expired transients and spam comments deleted; tables optimised.'],
];
const color = (s) => (s >= 90 ? '#0c8a4a' : s >= 50 ? '#c26a00' : '#c62828');
const dial = (label, s) => {
  const r = 54, c = 2 * Math.PI * r;
  return `<figure class="dial"><svg viewBox="0 0 140 140" role="img" aria-label="${label} score ${s}">
  <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--track)" stroke-width="12"/>
  <circle cx="70" cy="70" r="${r}" fill="none" stroke="${color(s)}" stroke-width="12" stroke-linecap="round"
    stroke-dasharray="${(c * s) / 100} ${c}" transform="rotate(-90 70 70)"/>
  <text x="70" y="80" text-anchor="middle" font-size="38" font-weight="700" fill="${color(s)}">${s}</text></svg>
  <figcaption>${label}</figcaption></figure>`;
};
const pct = (k) => {
  const d = ((a.median[k] - b.median[k]) / b.median[k]) * 100;
  return b.median[k] ? `${d > 0 ? '+' : ''}${d.toFixed(0)}%` : '—';
};

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Speed Fix Report</title>
<style>
:root{--bg:#f6f8fa;--card:#fff;--ink:#14212b;--mute:#5b6b7a;--line:#e3e8ee;--track:#e8edf2;--good:#0c8a4a}
@media (prefers-color-scheme:dark){:root{--bg:#0f161c;--card:#17212a;--ink:#e8eef3;--mute:#9aabb9;--line:#26333e;--track:#26333e;--good:#3ccf7e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:28px 16px 40px}
h1{font-size:28px;margin:0 0 4px}p.sub{color:var(--mute);margin:0 0 22px}
.grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
.dials{display:flex;align-items:center;justify-content:center;gap:14px}
.dial{margin:0;text-align:center}.dial svg{width:150px;height:150px}.dial figcaption{color:var(--mute);font-weight:600}
.arrow{font-size:34px;color:var(--mute)}
.gain{text-align:center;margin-top:8px;font-weight:700;color:var(--good)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:right}th:first-child,td:first-child{text-align:left}
td:not(:first-child){white-space:nowrap}th{font-size:13px;color:var(--mute);font-weight:600}td.ch{font-weight:700;color:var(--good)}
ol{margin:0;padding-left:20px}li{margin:6px 0}li b{margin-right:4px}
.method{color:var(--mute);font-size:13px;margin-top:16px}
@media (max-width:760px){.grid{grid-template-columns:1fr}.dial svg{width:112px;height:112px}h1{font-size:23px}th,td{padding:7px 3px;font-size:14px}}
</style></head><body><main>
<h1>Bayview Dental — WordPress speed fix</h1>
<p class="sub">Same page, same content. Lighthouse ${esc(b.lighthouse)} mobile, before and after one run of <code>fix.sh</code>.</p>
<div class="grid">
<section class="card"><div class="dials">${dial('Before', b.median.score)}<span class="arrow" aria-hidden="true">→</span>${dial('After', a.median.score)}</div>
<p class="gain">+${a.median.score - b.median.score} points</p></section>
<section class="card"><table><thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>
${rows.map(([n, k, f]) => `<tr><td>${n}</td><td>${f(b.median[k])}</td><td>${f(a.median[k])}</td><td class="ch">${pct(k)}</td></tr>`).join('\n')}
</tbody></table></section>
<section class="card" style="grid-column:1/-1"><h2 style="margin:0 0 8px;font-size:18px">What fix.sh changed</h2><ol>
${fixes.map(([t, d]) => `<li><b>${t}.</b>${esc(d)}</li>`).join('\n')}</ol>
<p class="method">Demo site (fictional clinic) on localhost. Lighthouse ${esc(b.lighthouse)}, mobile, simulated throttling, performance only; each number is the median of ${b.runs.length} runs. Measured ${esc(b.at.slice(0, 10))}.</p></section>
</div></main></body></html>
`;
writeFileSync(dir('report.html'), html);
console.log('report.html written');
