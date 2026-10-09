// node measure.mjs <label>  →  results/<label>.json (median of 3 Lighthouse mobile runs) + results/<label>.lhr.json (median run).
// Lighthouse 13.5.0, mobile preset, simulated throttling, performance only, system Chrome headless.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const label = process.argv[2];
if (!/^[\w-]+$/.test(label ?? '')) { console.error('usage: node measure.mjs <label>'); process.exit(2); }
const SITE = 'http://localhost:8091/';
const LH = '13.5.0';
const RUNS = 3;
const OUT = new URL('results/', import.meta.url).pathname;
process.env.CHROME_PATH ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const res = await fetch(SITE);  // one warm-up view, same for both sides (fills a page cache if there is one)
if (!res.ok) { console.error(`[measure] ${SITE} → ${res.status}`); process.exit(1); }
await res.arrayBuffer();

const pick = (lhr) => {
  const a = lhr.audits, num = (k) => Math.round(a[k].numericValue);
  return {
    score: Math.round(lhr.categories.performance.score * 100),
    lcp_ms: num('largest-contentful-paint'), fcp_ms: num('first-contentful-paint'),
    tbt_ms: num('total-blocking-time'), cls: +a['cumulative-layout-shift'].numericValue.toFixed(3),
    speed_index_ms: num('speed-index'), total_bytes: num('total-byte-weight'),
    requests: a['network-requests'].details.items.length,
  };
};
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const runs = [], lhrs = [];
for (let i = 1; i <= RUNS; i++) {
  const r = spawnSync('npx', ['-y', `lighthouse@${LH}`, SITE, '--form-factor=mobile', '--screenEmulation.mobile',
    '--throttling-method=simulate', '--only-categories=performance', '--output=json', '--quiet',
    '--chrome-flags=--headless=new --no-sandbox'], { encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.status !== 0) { console.error(r.stderr.slice(-2000)); process.exit(1); }
  const lhr = JSON.parse(r.stdout);
  if (lhr.runtimeError) { console.error('[measure] lighthouse runtimeError', lhr.runtimeError); process.exit(1); }
  lhrs.push(lhr); runs.push(pick(lhr));
  console.log(`[measure] ${label} run ${i}/${RUNS}:`, JSON.stringify(runs.at(-1)));
}
const med = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(runs.map((r) => r[k]))]));
const mid = runs.map((r, i) => [r.score, i]).sort((a, b) => a[0] - b[0])[Math.floor(RUNS / 2)][1];

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}${label}.json`, JSON.stringify({ label, at: new Date().toISOString(), url: SITE, runs, median: med, lighthouse: LH }, null, 2) + '\n');
writeFileSync(`${OUT}${label}.lhr.json`, JSON.stringify(lhrs[mid]));
console.log(`[measure] ${label} median:`, JSON.stringify(med));
