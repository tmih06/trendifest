// main.js: boots the V5 film and exposes the renderer contract the kinetic-film tools expect:
// __film {title, dur, fps, cues, cuts}, __seek(t) -> Promise (resolves once every new picture decoded),
// __samples(t, dt) (motion-blur sub-frames per output frame), __shutter(t) and __ready.
// Also __audit(t): every visible text box at t, so tools/audit.mjs can flag text that overlaps other text or
// leaves the title-safe area. Preview: space plays, arrows step 1 s, ?t=12 starts at 12 s.
import { build } from './film.js';

await Promise.all(['300 40px BVP', '400 40px BVP', '500 40px BVP', '600 40px BVP', '700 40px BVP', '400 20px JBM'].map(f => document.fonts.load(f)));
const takes = {};
for (const n of ['graph', 'board', 'evidence', 'review']) takes[n] = await fetch('takes/' + n + '/times.json').then(r => r.json());
const film = build(document.getElementById('stage'), takes);
window.__film = { title: 'TRENDIFEST V5', dur: film.dur, fps: film.fps, cues: film.cues, cuts: [], music: null, sounds: {} };
// Five sub-frames over a 180 degree shutter: with three, the rolling list rows (about 7 px a frame) showed
// as three stepped copies; five reads as continuous blur. Render cost grows linearly (about 8 min at 1080p).
window.__samples = () => 5;
window.__shutter = () => 1;
window.__seek = t => { window.__pending = []; film.render(t); return Promise.all(window.__pending.map(p => p.catch(() => {}))); };
window.__audit = t => {
  film.render(t);
  const out = [];
  const st = document.getElementById('stage').getBoundingClientRect();
  for (const el of document.querySelectorAll('#stage [data-text]')) {
    let a = 1, n = el;
    for (; n && n.id !== 'stage'; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') { a = 0; break; } a *= +cs.opacity; }
    if (a < .35) continue;
    // a Line's box spans its full width: measure the union of its visible words instead
    const parts = el.classList.contains('line') ? [...el.children].filter(w => +getComputedStyle(w).opacity * a >= .35) : [el];
    if (!parts.length) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of parts) { const r = p.getBoundingClientRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    out.push({ id: el.dataset.text, a: +a.toFixed(2), x: x0 - st.left, y: y0 - st.top, w: x1 - x0, h: y1 - y0 });
  }
  return out;
};
await window.__seek(0);
window.__ready = true;

if (!location.search.includes('render')) {
  let t = +(new URLSearchParams(location.search).get('t') || 0), playing = false, last = 0;
  const bar = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: film.dur, step: 1 / film.fps, value: t, className: 'scrub' });
  const label = Object.assign(document.createElement('div'), { className: 'scrubt' });
  document.body.append(bar, label);
  const show = () => { film.render(t); bar.value = t; label.textContent = t.toFixed(2) + ' s'; };
  bar.oninput = () => { t = +bar.value; show(); };
  addEventListener('keydown', e => {
    if (e.code === 'Space') { playing = !playing; last = performance.now(); e.preventDefault(); }
    if (e.code === 'ArrowRight') { t = Math.min(film.dur, t + 1); show(); }
    if (e.code === 'ArrowLeft') { t = Math.max(0, t - 1); show(); }
  });
  const loop = now => { if (playing) { t += (now - last) / 1000; if (t > film.dur) t = 0; show(); } last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop); show();
}
