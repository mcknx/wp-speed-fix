// Films the real flow headless: title → the slow site loading on a phone over simulated slow 4G → Lighthouse "before"
// report → the real fix.sh streaming its own output → the same phone load after the fix → report.html → end card.
// node capture.mjs   (needs the va-p4 stack on :8091; runs reset.sh first and again at the end, so the site is left slow)
// Writes $OUT/raw.webm + $OUT/run.json (event marks in seconds since the page opened ≈ video t=0).
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
const { chromium } = createRequire(import.meta.url)(process.env.PW || "playwright");

const OUT = process.env.OUT || "/tmp/va-p4-demo";
const LH = process.env.LH_DIR || new URL("../node_modules/lighthouse", import.meta.url).pathname; // npm i -D lighthouse@13.5.0 (same version as measure.mjs)
const SITE = "http://localhost:8091/";
const SIZE = { width: 1280, height: 720 };
// Lighthouse 13's own "slow 4G" preset as DevTools applies it (constants.throttling.mobileSlow4G): the throttling the scores come from.
const NET = { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 };
const CPU = 4;
const LOAD_CAP = 240_000; // give up on a load after 4 min (the slow side takes ~2.5)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const here = new URL(".", import.meta.url).pathname;
const proj = here + "../";
const res = { before: JSON.parse(readFileSync(proj + "results/before.json", "utf8")).median, after: JSON.parse(readFileSync(proj + "results/after.json", "utf8")).median };
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const css = `body{margin:0;height:100vh;background:#0f1d29;color:#e8eef3;font:18px -apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}`;
const card = (eyebrow, title, sub) => `<!doctype html><meta charset="utf-8"><style>${css}
  body{display:grid;place-items:center;text-align:center}
  .e{letter-spacing:.18em;text-transform:uppercase;color:#7fd3da;font-size:15px;font-weight:600} h1{font-size:50px;margin:14px 0 12px;line-height:1.15} p{color:#b9c8d4;margin:0}
  </style><div><div class="e">${eyebrow}</div><h1>${title}</h1><p>${sub}</p></div>`;

// The phone stage: the real site in a 375 px iframe (same origin, so the page's throttling covers it) + a live timer and byte counter.
const stage = (label, tone) => `<!doctype html><meta charset="utf-8"><style>${css}
  .phone{position:absolute;left:170px;top:62px;width:375px;height:740px;transform:scale(.7);transform-origin:0 0;border:14px solid #05090d;border-radius:44px;overflow:hidden;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.5)}
  iframe{border:0;width:375px;height:740px;display:block}
  .panel{position:absolute;left:560px;top:100px;width:620px}
  .tag{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:700;font-size:16px;letter-spacing:.06em;text-transform:uppercase;background:${tone};color:#fff}
  #t{font:700 92px ui-monospace,Menlo,monospace;margin:18px 0 0;font-variant-numeric:tabular-nums} #st{color:#9fb3c3;font-size:20px;min-height:28px}
  #mb{font:600 30px ui-monospace,Menlo,monospace;margin:18px 0 26px}
  .net{color:#b9c8d4;font-size:16px;line-height:1.6;border-left:3px solid #7fd3da;padding-left:12px}
  </style><div class="phone"><iframe id="f"></iframe></div>
  <div class="panel"><span class="tag">${label}</span><div id="t">0.0 s</div><div id="st">loading…</div><div id="mb">0.0 MB downloaded</div>
  <div class="net"><b>Simulated slow 4G</b> (Lighthouse's mobile preset)<br>1.5 Mbps down · 0.7 Mbps up · 562 ms latency · CPU 4× slower<br>375 px phone viewport · fresh visit, empty cache</div></div>`;

const term = () => `<!doctype html><meta charset="utf-8"><style>${css}
  body{background:#0b1117}
  .win{position:absolute;left:90px;top:104px;width:1100px;height:470px;background:#0d1520;border:1px solid #233243;border-radius:12px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.5)}
  .bar{height:38px;background:#16212d;display:flex;align-items:center;padding:0 16px;gap:8px;color:#9fb3c3;font:600 14px ui-monospace,Menlo,monospace}
  .bar i{width:12px;height:12px;border-radius:50%;display:inline-block} .bar span{margin-left:12px} #el{margin-left:auto;color:#7fd3da}
  #log{padding:14px 20px;font:15px/1.55 ui-monospace,Menlo,monospace;white-space:pre-wrap;height:432px;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}
  .p{color:#7fd3da} .s{color:#fff;font-weight:700} .d{color:#c9d6e0} .x{color:#6b7f90}
  </style><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
  <span>p4-wp-speed-fix — the real fix.sh, live</span><b id="el"></b></div><div id="log"><div><span class="p">~/p4-wp-speed-fix $</span> ./fix.sh</div></div></div>`;

// Visible cursor + ring (Playwright's mouse is invisible on video). Both pointer-events:none.
const cursorJs = () => {
  if (document.getElementById("__cur")) return;
  const mk = (id, css) => Object.assign(document.body.appendChild(Object.assign(document.createElement("div"), { id })).style, { position: "fixed", pointerEvents: "none", zIndex: 2147483646, ...css });
  mk("__cur", { width: "20px", height: "20px", borderRadius: "50%", background: "rgba(20,20,20,.9)", boxShadow: "0 0 0 5px rgba(255,255,255,.85),0 3px 10px rgba(0,0,0,.4)", left: "94%", top: "88%", transition: "left .6s cubic-bezier(.4,0,.2,1),top .6s cubic-bezier(.4,0,.2,1)" });
  mk("__ring", { border: "3px solid #EF621C", borderRadius: "14px", boxShadow: "0 0 0 6px rgba(239,98,28,.18)", opacity: 0, transition: "all .5s cubic-bezier(.4,0,.2,1)" });
};
async function point(page, loc, hold = 800, ring = true) {
  const b = await loc.boundingBox();
  if (!b) throw new Error("nothing to point at: " + loc);
  await page.evaluate(([b, ring]) => {
    Object.assign(document.getElementById("__cur").style, { left: b.x + b.width - 4 + "px", top: b.y + b.height - 4 + "px" });
    Object.assign(document.getElementById("__ring").style, ring ? { left: b.x - 8 + "px", top: b.y - 8 + "px", width: b.width + 10 + "px", height: b.height + 10 + "px", opacity: 1 } : { opacity: 0 });
  }, [b, ring]);
  await wait(hold);
}

// One phone load under throttling. Bytes = encoded (on-the-wire) bytes the browser received, from CDP, pushed to the page live.
async function phoneLoad(page, cdp, label, tone, key) {
  stageHtml = stage(label, tone);
  await page.goto(SITE + "__demo-stage", { waitUntil: "load" }); // served by page.route below: same origin as the site
  await page.evaluate(cursorJs);
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.emulateNetworkConditions", NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  let bytes = 0; const onData = (e) => (bytes += e.encodedDataLength);
  cdp.on("Network.dataReceived", onData);
  await wait(1200);
  const t = await page.evaluate((url) => {
    window.__t0 = performance.now();
    const f = document.getElementById("f"), t = document.getElementById("t");
    window.__tick = setInterval(() => (t.textContent = ((performance.now() - window.__t0) / 1000).toFixed(1) + " s"), 100);
    window.__loaded = new Promise((r) => f.addEventListener("load", () => r((performance.now() - window.__t0) / 1000), { once: true }));
    f.src = url;
    return Date.now();
  }, SITE);
  run.marks[key] = +((t - t0) / 1000).toFixed(2);
  const push = setInterval(() => page.evaluate((b) => (document.getElementById("mb").textContent = (b / 1e6).toFixed(1) + " MB downloaded"), bytes).catch(() => {}), 250);
  const secs = await page.evaluate((cap) => Promise.race([window.__loaded, new Promise((r) => setTimeout(() => r(null), cap))]), LOAD_CAP);
  if (secs == null) throw new Error(label + " load did not finish in " + LOAD_CAP / 1000 + " s");
  mark(key + "Loaded");
  await wait(600); clearInterval(push); cdp.off("Network.dataReceived", onData);
  await page.evaluate(([s, b]) => {
    clearInterval(window.__tick);
    document.getElementById("t").textContent = s.toFixed(1) + " s";
    document.getElementById("st").textContent = "✓ page fully loaded";
    document.getElementById("mb").textContent = (b / 1e6).toFixed(1) + " MB downloaded";
  }, [secs, bytes]);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  run[key] = { seconds: +secs.toFixed(1), mb: +(bytes / 1e6).toFixed(2) };
  await point(page, page.locator("#t"), 2500, true);
}

// fix.sh, spawned for real; every line it prints goes into the terminal page as it arrives.
function runFix(page) {
  return new Promise((resolve, reject) => {
    const p = spawn("./fix.sh", { cwd: proj, stdio: ["ignore", "pipe", "pipe"] });
    const lines = [];
    const feed = (stream, cls) => {
      let buf = "";
      stream.on("data", (d) => {
        buf += d; let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trimEnd(); buf = buf.slice(i + 1);
          if (!line) continue;
          const step = /^\[fix\] (\d)\/6/.exec(line), done = /^\[fix\] done/.test(line);
          if (step) mark("f" + step[1]); if (done) mark("fdone");
          lines.push(line);
          const c = step || done ? "s" : /^\[fix\]/.test(line) ? "d" : "x";
          page.evaluate(([h, c]) => { const el = document.createElement("div"); el.className = c; el.innerHTML = h; document.getElementById("log").appendChild(el); }, [esc(line), c]).catch(() => {});
        }
      });
    };
    feed(p.stdout); feed(p.stderr);
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(lines) : reject(new Error("fix.sh exited " + code + "\n" + lines.slice(-5).join("\n")))));
  });
}

let browser, ctx, t0, stageHtml;
const run = { marks: {}, throttling: { ...NET, cpu: CPU, preset: "Lighthouse 13 mobileSlow4G (devtools values)" } };
const mark = (k) => (run.marks[k] = +((Date.now() - t0) / 1000).toFixed(2));
try {
  console.error("reset.sh → slow site"); execFileSync(proj + "reset.sh", { stdio: "inherit" });
  const g = await import(LH + "/report/generator/report-generator.js");
  writeFileSync(OUT + "/lh-before.html", g.ReportGenerator.generateReportHtml(JSON.parse(readFileSync(proj + "results/before.lhr.json", "utf8"))));

  mkdirSync(OUT + "/raw", { recursive: true });
  browser = await chromium.launch({ headless: true });
  ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: OUT + "/raw", size: SIZE } });
  const page = await ctx.newPage();
  await page.route(SITE + "__demo-stage", (r) => r.fulfill({ contentType: "text/html", body: stageHtml }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  t0 = Date.now();

  await page.setContent(card("Bayview Dental · a demo WordPress site", "Slow site → fast site", "WordPress speed fix · before → after, measured"));
  mark("title"); await wait(6500);

  await phoneLoad(page, cdp, "Before the fix", "#c0392b", "before");

  await page.goto("file://" + OUT + "/lh-before.html", { waitUntil: "load" });
  await page.evaluate(cursorJs); mark("lh"); await wait(800);
  await point(page, page.locator(".lh-exp-gauge__wrapper").first(), 2500);
  await point(page, page.locator("#largest-contentful-paint"), 3000);

  await page.setContent(term()); mark("fix");
  await page.evaluate(() => { const t = performance.now(), el = document.getElementById("el"); window.__tick = setInterval(() => (el.textContent = ((performance.now() - t) / 1000).toFixed(1) + " s"), 100); });
  run.fixLog = await runFix(page); mark("fixEnd");
  await page.evaluate(() => { clearInterval(window.__tick); document.getElementById("el").textContent += " ✓"; });
  await wait(1500);

  await phoneLoad(page, cdp, "After the fix", "#0c8a4a", "after");

  await page.goto("file://" + proj + "report.html", { waitUntil: "load" });
  await page.evaluate(cursorJs); mark("report"); await wait(800);
  await point(page, page.locator(".dials"), 4000);
  await point(page, page.locator("table").first(), 5000);
  run.reportText = (await page.locator("main").innerText()).slice(0, 600);

  // what the film claims must be what happened (a miss = failed take, exit 1, re-run)
  if (!(run.after.seconds < run.before.seconds)) throw new Error("after load is not faster: " + JSON.stringify([run.before, run.after]));
  if (!run.fixLog.some((l) => /^\[fix\] done/.test(l))) throw new Error("fix.sh never printed done");
  for (const [k, v] of [["score", res.before.score], ["score", res.after.score]]) if (!run.reportText.includes(String(v))) throw new Error(`report.html does not show ${k} ${v}`);

  await page.setContent(card("Built by", "McKeen Asma", "WordPress &amp; Tech VA · WP-CLI + free plugins")); mark("end"); await wait(5000);
  mark("stop");
} catch (e) { run.error = String(e.stack || e); console.error(e); process.exitCode = 1; }
finally {
  const v = ctx && ctx.pages()[0]?.video();
  await ctx?.close(); await browser?.close(); // close is what writes the webm
  if (v) renameSync(await v.path(), OUT + "/raw.webm");
  writeFileSync(OUT + "/run.json", JSON.stringify(run, null, 2));
  console.log(JSON.stringify({ ...run, fixLog: run.fixLog?.length, reportText: undefined }, null, 2));
  try { execFileSync(proj + "reset.sh", { stdio: "inherit" }); } catch (e) { console.error("reset.sh failed — site may be left fixed", e); process.exitCode = 1; }
}
