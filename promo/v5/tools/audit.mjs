// audit.mjs [step]: checks every visible text box in the film, sampled every step seconds (default 0.1):
//  * SAFE: text outside the title-safe area (96 px left/right, 54 px top/bottom of 1920x1080);
//  * OVERLAP: two visible text boxes intersecting by more than 4% of the smaller one, unless one contains
//    the other (a label inside its own card is fine).
// Text is anything marked data-text in film.js (lines are measured word by word, see main.js __audit).
// Serve promo/v5 first (FILM_URL). Exit code 1 when anything is found.
import { launch, openFilm } from './kf/browser.mjs';
const step = +(process.argv[2] || .1);
const b = await launch();
const { pg, errs } = await openFilm(b, 1);
const dur = await pg.evaluate(() => window.__film.dur);
const issues = new Map();
const note = (k, t) => { const v = issues.get(k); if (!v) issues.set(k, [t, t]); else v[1] = t; };
for (let t = 0; t <= dur + 1e-6; t += step) {
  const boxes = await pg.evaluate(t => window.__audit(t), +t.toFixed(3));
  for (const q of boxes) if (q.x < 96 || q.y < 54 || q.x + q.w > 1824 || q.y + q.h > 1026) note('SAFE ' + q.id + ' [' + [q.x, q.y, q.x + q.w, q.y + q.h].map(Math.round).join(',') + ']', t);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    const ix = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), iy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
    if (ix <= 0 || iy <= 0) continue;
    const small = Math.min(A.w * A.h, B.w * B.h), inter = ix * iy;
    const contains = inter >= small * .98;
    if (!contains && inter > .04 * small) note('OVERLAP ' + A.id + ' x ' + B.id, t);
  }
}
for (const [k, [a, z]] of issues) console.log(a.toFixed(1) + '-' + z.toFixed(1) + 's  ' + k);
if (errs.length) console.log('page errors', errs.slice(0, 5));
const bad = await pg.evaluate(() => window.__badSrc || []);
if (bad.length) { console.log('undecodable frames', [...new Set(bad)].slice(0, 10)); issues.set('BAD FRAMES', [0, 0]); }
console.log(issues.size ? issues.size + ' issue(s)' : 'clean: no text outside title-safe, no overlapping text');
await b.close();
process.exit(issues.size ? 1 : 0);
