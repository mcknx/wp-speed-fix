// Cuts raw.webm by the run's own marks, lays the cloned-voice narration on top, burns captions + chapter tracker → p4-demo.mp4,
// then a contact sheet → contact.jpg.   node assemble.mjs   (after: say-clone.py lines.json $OUT/voices  and  node capture.mjs)
// Nothing is sped up. Waits (the slow page load, fix.sh between steps) play in real time with their on-page timers; the middle
// of the longest waits is cut until the film fits, and each cut is captioned "~N s of waiting cut" — the timer jump shows it too.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = process.env.OUT || "/tmp/va-p4-demo";
const C = Number(process.env.CLIP_START || 0.3); // video t = mark − C
const TARGET = 84; // cut waits until the film is at most this long (hard limits 60–90)
const here = new URL(".", import.meta.url).pathname;
const run = JSON.parse(readFileSync(OUT + "/run.json", "utf8"));
if (run.error) throw new Error("capture failed: " + run.error);
const voice = Object.fromEntries(JSON.parse(readFileSync(OUT + "/voices/manifest.json", "utf8")).map((v) => [v.id, v]));
const m = run.marks;
const LIVE = voice["2-before"].seconds + 1.5; // the slow load plays uncut while its line is spoken

// [narration id | null, src start, src end, live|hold|wait, chapter, [kept head, kept tail] of a cut wait]
const segs = [
  ["1-hook", m.title, m.before, "hold", 0],
  ["2-before", m.before, m.before + LIVE, "live", 1],
  [null, m.before + LIVE, m.beforeLoaded, "wait", 1, [1.5, 2]],
  [null, m.beforeLoaded, m.lh, "live", 1],
  ["3-score", m.lh, m.fix, "hold", 2],
  ["4-fix", m.fix, m.f1 + 1, "live", 3],
  ...[[m.f1 + 1, m.f2], [m.f2, m.f3], [m.f3, m.f4], [m.f4, m.f5], [m.f5, m.fdone]].map(([a, b]) => [null, a, b, "wait", 3, [0.8, 1]]),
  [null, m.fdone, m.after - 1.3, "hold", 3], // the terminal stays up (✓) until the fix line is spoken
  ["5-after", m.after - 1.2, m.report, "hold", 4], // from the empty phone at 0.0 s
  ["6-report", m.report, m.end, "hold", 5],
  ["7-end", m.end, m.stop, "hold", 6],
];
const CHAPTERS = ["The problem", "Before", "Lighthouse", "The fix", "After", "Results", "Built by"];
const AIR = { "3-score": 1, "6-report": 1.2, "7-end": 1.2 };
const VO = 0.4;

function build(cap) {
  let t = 0, vEnd = 0;
  return segs.map(([id, a, b, kind, ch, keep]) => {
    const src = b - a, vs = id ? Math.max(t + VO, vEnd + 0.3) : null, vSec = id ? voice[id].seconds : 0;
    let dur = src, cut = 0;
    if (kind === "hold") dur = Math.max(src, id ? vs + vSec + (AIR[id] ?? 0.8) - t : vEnd + 0.6 - t); // a hold never cuts what was filmed; a silent one waits for the voice
    if (id === "2-before" && vs + vSec > t + src + 0.2) throw new Error(`${id}: ${vSec}s of voice does not fit ${src.toFixed(1)}s of uncut load`); // 4-fix spills over the cut waits on purpose
    if (kind === "wait" && src > cap && src > keep[0] + keep[1] + 1) { cut = src - keep[0] - keep[1]; dur = keep[0] + keep[1]; }
    const p = { id, kind, ss: +Math.max(0, a - C).toFixed(3), src: +src.toFixed(3), dur: +dur.toFixed(2), at: +t.toFixed(2), vs: vs && +vs.toFixed(2), ch, cut: +cut.toFixed(1), keep };
    t += p.dur; if (id) vEnd = vs + vSec;
    return p;
  });
}
const total = (plan) => +plan.reduce((s, p) => s + p.dur, 0).toFixed(2);
let cap = Infinity, plan = build(cap);
const waits = segs.filter((s) => s[3] === "wait").map((s) => s[2] - s[1]).sort((x, y) => y - x);
for (const w of waits) { if (total(plan) <= TARGET) break; cap = w - 0.01; plan = build(cap); } // cut the longest wait first
const T = total(plan);
console.table(plan.map(({ keep, ...p }) => p));
if (T < 60 || T > 90) throw new Error(`planned ${T}s, outside 60–90`);

// ── captions (timed from the voice manifest) + chapter tracker + cut notes, one ASS file
const ts = (s) => { const cs = Math.round(s * 100); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
const wrap = (s, n) => { const out = [""]; for (const w of s.replace(/[{}]/g, "").split(/\s+/)) (out.at(-1) + " " + w).trim().length > n ? out.push(w) : (out[out.length - 1] = (out.at(-1) + " " + w).trim()); return out; };
const ev = [];
for (const p of plan) {
  if (p.id) { // two lines at a time, broken at sentence ends; each part timed by its share of the characters
    const parts = [];
    for (const sen of voice[p.id].text.replace("V A", "VA").match(/.+?(?:[.!?](?=\s|$)|$)\s*/g)) {
      const joined = parts.length ? wrap(parts.at(-1).join(" ") + " " + sen, 62) : null;
      if (joined && joined.length <= 2) { parts[parts.length - 1] = joined; continue; }
      const l = wrap(sen, 62); for (let i = 0; i < l.length; i += 2) parts.push(l.slice(i, i + 2));
    }
    const len = (x) => x.join(" ").length, all = parts.reduce((s, x) => s + len(x), 0);
    let at = p.vs;
    parts.forEach((x, i) => { const d = (voice[p.id].seconds * len(x)) / all; ev.push(`Dialogue: 0,${ts(at)},${ts(at + d + (i === parts.length - 1 ? 0.4 : 0))},Sub,,0,0,0,,${x.join("\\N")}`); at += d; });
  }
  if (p.cut) ev.push(`Dialogue: 0,${ts(p.at + p.keep[0] - 0.3)},${ts(p.at + p.keep[0] + 1.6)},Note,,0,0,0,,~${Math.round(p.cut)} s of waiting cut · real time shown`);
  const chips = CHAPTERS.map((c, i) => (i === p.ch ? `{\\c&H1C62EF&\\b1}● ${c}{\\r}` : i < p.ch ? `{\\c&H8B8B8B&}● ${c}{\\r}` : `{\\c&HC8C8C8&}○ ${c}{\\r}`)).join("  ");
  ev.push(`Dialogue: 1,${ts(p.at)},${ts(p.at + p.dur)},Track,,0,0,0,,${chips}`);
}
// Note sits top-right, clear of the phone timer (left of it) and the terminal's elapsed timer (below it).
writeFileSync(OUT + "/subs.ass", `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Sub,Helvetica,30,&H00FFFFFF,&H00FFFFFF,&H00000000,&H330A0D13,-1,0,0,0,100,100,0,0,3,10,0,2,70,70,30,1
Style: Track,Helvetica,16,&H00FFFFFF,&H00FFFFFF,&H00000000,&H400A0D13,0,0,0,0,100,100,0,0,3,7,0,8,20,20,12,1
Style: Note,Helvetica,22,&H00FFFFFF,&H00FFFFFF,&H00000000,&H201C62EF,-1,0,0,0,100,100,0,0,3,8,0,9,20,40,58,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
${ev.join("\n")}
`);

// ── picture: trim each shot (a cut wait = its head + its tail), pad holds by cloning the last frame, concat, burn subs
const norm = "scale=1280:720,fps=30,setsar=1,format=yuv420p";
const pieces = plan.flatMap((p) => p.cut
  ? [{ ss: p.ss, src: p.keep[0], dur: p.keep[0] }, { ss: p.ss + p.src - p.keep[1], src: p.keep[1], dur: p.keep[1] }]
  : [{ ss: p.ss, src: Math.min(p.src, p.dur), dur: p.dur }]);
const vf = pieces.map((p, i) => `[0:v]trim=start=${p.ss.toFixed(3)}:duration=${p.src.toFixed(3)},setpts=PTS-STARTPTS,${norm},tpad=stop_mode=clone:stop_duration=${(p.dur - p.src + 0.05).toFixed(3)},trim=duration=${p.dur}[v${i}]`);
const voiced = plan.filter((p) => p.id);
const af = voiced.map((p, i) => `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(p.vs * 1000)}:all=1[a${i}]`);
const graph = [...vf, `${pieces.map((_, i) => `[v${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0,ass=${OUT}/subs.ass[v]`,
  ...af, `${voiced.map((_, i) => `[a${i}]`).join("")}amix=inputs=${voiced.length}:duration=longest:normalize=0,apad=whole_dur=${T},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`].join(";");
const dest = here + "p4-demo.mp4";
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", OUT + "/raw.webm", ...voiced.flatMap((p) => ["-i", voice[p.id].file]),
  "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-c:a", "aac", "-b:a", "160k",
  "-t", String(T), "-movflags", "+faststart", dest], { stdio: "inherit" });
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", dest, "-vf", "fps=1/3,scale=320:-1,tile=6x5", "-frames:v", "1", "-q:v", "4", here + "contact.jpg"], { stdio: "inherit" });
writeFileSync(here + "run.json", JSON.stringify({ ...run, reportText: undefined, plan: plan.map(({ keep, ...p }) => p), seconds: T }, null, 2));
console.log(`wrote ${dest} · planned ${T}s · before load ${run.before.seconds}s / ${run.before.mb} MB, after ${run.after.seconds}s / ${run.after.mb} MB · cuts: ${plan.filter((p) => p.cut).map((p) => "~" + p.cut + "s").join(", ") || "none"}`);
