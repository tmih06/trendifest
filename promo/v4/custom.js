// custom.js: the TRENDIFEST V4 blocks that the stock kinetic-type blocks cannot draw.
// Every block follows the engine contract (blocks.js Scene): build() creates elements and registers
// effects/cues once; update(t) and cam(t) are pure functions of the film time t in seconds, so the renderer
// can seek anywhere and sample sub-frames for motion blur. No Math.random, no Date, no state between frames
// (the only cached values are measurements and the last-set image src, both derived from t).
// Times in options are film SECONDS (the narration clock), not beats: the voice-over, not the music grid,
// decides when a word lands. spec.js places each block on the beat grid with S(seconds).
import { Scene, cc, glowDot } from './blocks.js';
import { C, E, clamp, lerp, tw, rng, rgba, el, vis, set, at, type, letters, drawRing } from './core.js';

// Block styles live here so index.html stays the engine's own (apart from the Vietnamese font fix).
const css = document.createElement('style');
css.textContent = [
  '.scrwin { position: absolute; left: 0; top: 0; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 60px 140px rgba(0,0,0,.65), 0 0 0 1.5px color-mix(in srgb, var(--accent) 60%, transparent); }',
  '.scrhead { position: absolute; left: 0; right: 0; top: 0; height: 46px; background: #EEECF4; display: flex; align-items: center; gap: 9px; padding-left: 20px; }',
  '.scrhead i { width: 12px; height: 12px; border-radius: 50%; background: #CFCAD9; }',
  '.scrurl { margin-left: 22px; font-family: JBM; font-size: 15px; color: #57536A; letter-spacing: .04em; }',
  '.scrview { position: absolute; left: 0; right: 0; top: 46px; bottom: 0; overflow: hidden; background: #fff; }',
  '.scrimg { position: absolute; left: 0; top: 0; transform-origin: 0 0; }',
  '.chip { font-family: JBM; font-size: 19px; letter-spacing: .18em; padding: 10px 18px; border-radius: 999px; white-space: nowrap; color: var(--ink); background: var(--hot); font-weight: 700; }',
  '.card { position: absolute; left: 0; top: 0; width: 1180px; height: 660px; border-radius: 22px; background: color-mix(in srgb, var(--bg), var(--paper) 6%); border: 1.5px solid color-mix(in srgb, var(--paper) 18%, transparent); box-shadow: 0 50px 130px rgba(0,0,0,.6); overflow: hidden; }',
  '.card .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: var(--accent); }',
  ".card .hd { position: absolute; left: 56px; top: 40px; font-family: Archivo; font-size: 62px; font-variation-settings: 'wght' 850, 'wdth' 108; color: var(--paper); white-space: nowrap; }",
  '.card .tag { position: absolute; right: 44px; top: 54px; font-family: JBM; font-size: 18px; letter-spacing: .2em; color: color-mix(in srgb, var(--paper) 55%, transparent); }',
  '.card .pulse { position: absolute; left: 30px; top: 66px; width: 14px; height: 14px; border-radius: 50%; background: var(--hot); }',
  '.card .row { position: absolute; left: 56px; right: 44px; height: 150px; border-top: 1.5px solid color-mix(in srgb, var(--paper) 12%, transparent); }',
  '.card .lab { position: absolute; left: 0; top: 26px; font-family: JBM; font-size: 21px; letter-spacing: .22em; color: color-mix(in srgb, var(--paper) 62%, transparent); white-space: nowrap; }',
  '.card .val { position: absolute; left: 0; top: 66px; right: 0; height: 64px; }',
  '.fp { position: absolute; bottom: 0; width: 9px; border-radius: 3px; background: var(--accent); transform-origin: 50% 100%; }',
  '.seg { position: absolute; top: 14px; width: 74px; height: 36px; border-radius: 6px; }',
  '.src { position: absolute; top: 8px; font-family: JBM; font-size: 26px; padding: 10px 20px; border-radius: 10px; white-space: nowrap; color: var(--paper); border: 1.5px solid color-mix(in srgb, var(--accent) 70%, transparent); background: color-mix(in srgb, var(--accent) 14%, transparent); }',
  ".btn { position: absolute; left: 0; top: 0; width: 860px; height: 156px; border-radius: 80px; background: var(--accent); color: var(--ink); font-family: Archivo; font-size: 62px; font-variation-settings: 'wght' 850, 'wdth' 110; display: flex; align-items: center; justify-content: center; white-space: nowrap; box-shadow: 0 30px 80px color-mix(in srgb, var(--accent) 45%, transparent); }",
  ".mname { font-family: Archivo; font-variation-settings: 'wght' 850, 'wdth' 100; font-size: 92px; color: var(--ink); white-space: nowrap; line-height: 1; }",
  '.mrole { font-family: JBM; font-size: 25px; letter-spacing: .12em; color: color-mix(in srgb, var(--ink) 62%, transparent); white-space: nowrap; }',
  '.midx { font-family: JBM; font-size: 30px; font-weight: 700; color: var(--accent); }',
  '.tline { font-family: JBM; font-size: 28px; letter-spacing: .14em; white-space: pre; }',
  '.endmark { position: absolute; left: 0; top: 0; background: var(--paper); -webkit-mask: url(logo.svg) center / contain no-repeat; mask: url(logo.svg) center / contain no-repeat; }',
  '.endmark.sheen2 { background: linear-gradient(100deg, transparent 40%, rgba(255,255,255,.95) 50%, transparent 60%); background-size: 300% 100%; }',
  '.tagw { display: inline-block; margin-right: .26em; }',
  '.plat { font-family: JBM; font-size: 24px; font-weight: 700; letter-spacing: .2em; padding: 12px 22px; border-radius: 10px; white-space: nowrap; color: var(--paper); background: color-mix(in srgb, var(--bg), var(--paper) 8%); border: 1.5px solid color-mix(in srgb, var(--paper) 35%, transparent); }',
].join('\n');
document.head.appendChild(css);

/** Signal lime: the film's second accent, reserved for live data (spec palette 'hot'). */
const LIME = () => C.hot;

/**
 * Register a landing hit: flash, shake, a camera bump, extra blur samples and a sound.
 * lvl 1 = a word, 2 = a section turn (adds rays and a ring). o.light: on a light ground; o.cue: sound name
 * or false; o.gain. Side effects only (pushes onto the film's effect and cue lists, at build time).
 */
function land(f, t, lvl = 1, o = {}) {
  f.shake(t, 7 + 5 * lvl); f.bump(t, .02 + .018 * lvl); f.fast(t - .03, t + .26, 8 + 2 * lvl);
  f.flash({ t0: t, dur: .14, rise: .01, color: '#FFFFFF', peak: o.light ? .12 : .18 + .06 * lvl });
  if (lvl > 1) {
    const extra = o.light ? { blend: 'source-over', alpha: .45 } : {};
    f.ray(Object.assign({ t0: t, dur: .55, color: o.light ? C.ink : C.paper, n: 80, r0: 120, r1: 1600, w: 2.4, screen: true, seed: Math.round(t * 31) }, extra));
    f.ring({ t0: t, dur: .5, r0: 40, r1: 1100, w: 14, color: o.light ? C.ink : C.accent, screen: true });
  }
  if (o.cue !== false) f.cue(t, o.cue || (lvl > 1 ? 'impact' : 'hit'), o.gain ?? (lvl > 1 ? .9 : .6));
}

/**
 * Create a word (or short line) of display type, measured once while visible.
 * o: size (px), wdth (Archivo width axis 62-125), color (palette name or CSS), stroke (outline px),
 * glow (px), mono (JetBrains Mono line instead of Archivo). Returns the element with .w / .h set.
 */
function word(parent, text, o = {}) {
  let e;
  if (o.mono) { e = el('div', parent, 'abs tline'); e.textContent = text; e.style.fontSize = (o.size || 28) + 'px'; e.style.color = cc(o.color) || C.paper; }
  else e = type(parent, text, { size: o.size || 200, wdth: o.wdth || 110, color: cc(o.color) || C.paper, stroke: o.stroke, glow: o.glow, cls: 'abs' });
  e.w = e.offsetWidth; e.h = e.offsetHeight;
  return e;
}

/**
 * Place a word element for time t: visible only in [t0, t1), centred on (x, y), landing from scale o.from
 * to 1 over o.dur seconds (expo ease), then drifting o.drift px/s (default 80) and growing o.grow per second (default 7 %) so it never
 * parks. o.maxW shrinks long words to fit; o.scale multiplies; o.dx/o.dy offset the entrance; o.rot degrees.
 */
function slamWord(e, t, t0, t1, x, y, o = {}) {
  const on = t >= t0 - .005 && t < t1;
  vis(e, on);
  if (!on) return;
  const u = tw(t, t0, t0 + (o.dur ?? .18), E.outExpo), fit = Math.min(1, (o.maxW || 1600) / e.w), a = t - t0;
  const s = lerp(o.from ?? 1.35, 1, u) * (1 + (o.grow ?? .07) * a) * fit * (o.scale ?? 1);
  set(e, 'transform', at(x + (o.dx || 0) * (1 - u) + (o.drift ?? 80) * a, y + (o.dy || 0) * (1 - u), 'scale(' + s.toFixed(4) + ') rotate(' + (o.rot || 0).toFixed(2) + 'deg)'));
  set(e, 'opacity', clamp(u * 4).toFixed(3));
}

/** Interpolate keyframes [[sec, ...values]] at t with a short eased move into each key (move <= 0.7 s). */
function keys(F, t, lead = 0) {
  let k = 0; while (k < F.length - 1 && t >= F[k + 1][0] - lead) k++;
  const a = F[k], b = F[Math.min(k + 1, F.length - 1)];
  const m = b === a ? 0 : E.inOutCubic(clamp((t - a[0] + lead) / Math.max(.01, Math.min(.7, b[0] - a[0]))));
  return a.slice(1).map((v, i) => lerp(v, b[i + 1], m));
}

/**
 * Engraved water on a perspective floor: the end of s1. Words ride the swell as they are spoken.
 * o.items: [{ t, end, text, size, wdth, x, y, color, mono, ride, big }]. o.wave [a, b]: the tsunami swell;
 * o.calm [a, b]: it settles flat; o.drop: one drop makes the first ripple; o.collapse [a, b]: everything
 * folds into a glowing point, and inward speed lines charge the next block until this block's end.
 */
export class Ripple extends Scene {
  build() {
    const f = this.f, o = this.o;
    this.items = o.items.map(it => {
      const r = Object.assign({}, it);
      if (it.ride) { const L = letters(this.root, it.text, { size: it.size || 200, wdth: it.wdth || 110, color: cc(it.color) || C.paper, cls: 'abs' }); r.e = L.e; r.sp = L.spans; r.e.w = L.e.offsetWidth; }
      else r.e = word(this.root, it.text, it);
      if (it.mono) for (let i = 0; i < it.text.length; i += 2) f.cue(it.t + i * .02, 'key', .12);
      else land(f, it.t, it.big ? 2 : 1, { gain: it.big ? 1 : .55, cue: it.big ? 'impact_big' : 'hit' });
      return r;
    });
    const c1 = o.collapse[1];
    f.fast(o.wave[0], o.wave[1] + .3, 8); f.cue(o.wave[0] - .25, 'whoosh_big', .9);
    for (let i = 0; i < 3; i++) f.ring({ t0: o.drop + i * .2, dur: 1.4, cx: 960, cy: 690, r0: 6, r1: 900, w: 4 - i, sy: .26, color: i ? C.paper : C.hot, alpha: .9 - .25 * i });
    f.cue(o.drop, 'pop', .9); f.cue(o.drop + .02, 'sparkle', .5);
    f.cue(o.collapse[0], 'suck', .8, { end: c1 });
    f.comet({ t0: c1 - .05, t1: c1, path: () => [960, 540], tail: .01, size: 11, hold: this.t1 - c1 - .02, fade: .03 });
    f.ray({ t0: c1, dur: this.t1 - c1, inward: true, color: C.accent, n: 70, r0: 26, r1: 1100, w: 2, rate: 2.4, screen: true, seed: 12 });
    f.fast(o.collapse[0], c1 + .05, 10);
    f.paint((x, t) => this.water(x, t));
  }
  /** Height of the sea at t in px: a swell during o.wave, flat after o.calm. */
  amp(t) {
    const o = this.o, up = tw(t, o.wave[0] - .1, o.wave[0] + .35, E.outCubic), calm = tw(t, o.calm[0], o.calm[1], E.inOutCubic);
    return lerp(lerp(22, 230, up), 3, calm);
  }
  water(x, t) {
    const o = this.o;
    if (t < this.t0 || t >= o.collapse[1]) return;
    const A = this.amp(t), k = 1 - tw(t, o.collapse[0], o.collapse[1], E.inExpo);
    const crest = lerp(-400, 2300, tw(t, o.wave[0] - .2, o.wave[1] + .2, E.inOutCubic)), drop = t - o.drop;
    x.save(); x.lineCap = 'round';
    for (let j = 0; j < 30; j++) {
      const v = j / 29, y0 = 430 + 520 * Math.pow(v, 1.35), wgt = .35 + .65 * v;
      x.beginPath();
      for (let px = -160; px <= 2080; px += 14) {
        let dy = A * wgt * .32 * Math.sin(px * .0062 - t * 2.4 + j * .45) + A * wgt * .12 * Math.sin(px * .017 + t * 1.7 - j * .3);
        dy -= A * wgt * 1.15 * Math.exp(-(((px - crest) / 300) ** 2));
        if (drop > 0) {
          const d = Math.hypot(px - 960, (y0 - 690) * 3.4), r = drop * 430;
          dy += 30 * Math.exp(-(((d - r) / 60) ** 2)) * Math.sin(d / 26 - drop * 13) * Math.exp(-drop * .9);
        }
        const X = 960 + (px - 960) * k, Y = 600 + (y0 + dy - 600) * k;
        if (px === -160) x.moveTo(X, Y); else x.lineTo(X, Y);
      }
      const hot = j % 6 === 3;
      x.strokeStyle = hot ? rgba(C.accent, .85) : rgba(C.paper, .14 + .34 * v);
      x.lineWidth = (hot ? 2.6 : 1.6) * (.6 + .6 * v);
      x.stroke();
    }
    x.restore();
  }
  cam(t) {
    const o = this.o, u = clamp((t - this.t0) / (this.t1 - this.t0)), sw = Math.sin(Math.PI * tw(t, o.wave[0], o.wave[1], E.inOutCubic));
    return { s: 1.04 + .05 * u + .05 * sw, r: lerp(-.8, .8, u) + 1.5 * sw * Math.sin(t * 3), y: -30 * sw };
  }
  update(t) {
    const o = this.o, c = tw(t, o.collapse[0], o.collapse[1], E.inExpo), A = this.amp(t);
    for (const it of this.items) {
      slamWord(it.e, t, it.t, Math.min(it.end, o.collapse[1]), 960 + (it.x || 0) * (1 - c), 540 + (it.y || 0) * (1 - c), { from: it.mono ? 1 : 1.25, scale: 1 - c, drift: it.mono ? 0 : 24, maxW: 1700 });
      if (it.sp) it.sp.forEach((sp, i) => set(sp, 'transform', 'translateY(' + (Math.sin(i * .7 - t * 5.5) * A * .09).toFixed(1) + 'px)'));
    }
  }
}

/**
 * The event graph: audio, image and slang nodes spawn as the voice names them, link into event hubs,
 * then wire out to the platforms they cross. o.t: { link, audio, image, slang, graph, platforms } (seconds).
 * Positions come from a seeded generator, so every seek draws the same graph.
 */
export class EventGraph extends Scene {
  build() {
    const f = this.f, T = this.o.t, r = rng(41);
    this.centers = [[500, 470], [1420, 430], [960, 830]];
    this.hubs = [[800, 520], [1110, 470], [960, 650], [1230, 640], [690, 690]];
    this.nodes = [];
    const tk = [T.audio, T.image, T.slang];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 14; i++) {
      const a = r() * 6.283, d = 60 + 230 * Math.sqrt(r()), cx = this.centers[k][0], cy = this.centers[k][1];
      this.nodes.push({ k, i, x: cx + Math.cos(a) * d * 1.25, y: cy + Math.sin(a) * d * .8, from: [cx + Math.cos(a) * 1500, cy + Math.sin(a) * 1100], t: tk[k] + i * .028, hub: Math.floor(r() * 5), ph: r() * 6.3 });
    }
    const colOf = k => k === 1 ? 'hot' : k === 0 ? 'accent' : 'paper';
    this.labels = ['ÂM THANH', 'HÌNH ẢNH', 'TIẾNG LÓNG'].map((s, k) => ({ t: tk[k], e: word(this.root, s, { size: 230, wdth: 112, color: colOf(k) }), m: word(this.root, s, { mono: true, size: 26, color: colOf(k) }) }));
    this.kick = word(this.root, 'XÂU CHUỖI', { size: 150, wdth: 125, color: 'paper' });
    this.title = word(this.root, 'ĐỒ THỊ SỰ KIỆN', { size: 170, wdth: 112, color: 'paper', glow: 20 });
    this.title2 = word(this.root, 'LIÊN NỀN TẢNG', { size: 170, wdth: 112, color: 'accent', glow: 24 });
    this.plats = ['TIKTOK', 'THREADS', 'BÁO CHÍ', 'DIỄN ĐÀN'].map((s, i) => {
      const e = el('div', this.root, 'abs plat'); e.textContent = s;
      const a = -2.55 + i * 1.7; return { e, x: 960 + Math.cos(a) * 800, y: 560 + Math.sin(a) * 400, t: T.platforms + .06 + i * .07 };
    });
    tk.forEach(t => { land(f, t, 1, { gain: .5 }); for (let i = 0; i < 14; i += 2) f.cue(t + i * .028, 'pop', .18); });
    land(f, T.link, 1, { gain: .45 });
    land(f, T.graph, 2, { cue: 'impact', gain: .85 }); f.cue(T.graph + .1, 'sparkle', .4);
    land(f, T.platforms, 1, { gain: .6 }); this.plats.forEach(p => f.cue(p.t, 'tick', .4));
    f.bokeh({ t0: this.t0, t1: this.t1, n: 60, color: C.accent, size: 2.2, vx: 20, vy: -18, alpha: .35, seed: 77 });
    f.fast(T.graph, T.graph + .6, 8);
    f.paint((x, t) => this.draw(x, t));
  }
  /** Node position at t: flies in from off-frame, floats, then is drawn 38 % toward its event hub. */
  pos(n, t) {
    const u = tw(t, n.t, n.t + .5, E.outCubic), g = tw(t, this.o.t.graph, this.o.t.graph + .7, E.inOutCubic), h = this.hubs[n.hub];
    const x0 = lerp(n.from[0], n.x, u) + 8 * Math.sin(t * 1.6 + n.ph), y0 = lerp(n.from[1], n.y, u) + 8 * Math.cos(t * 1.3 + n.ph);
    return [lerp(x0, lerp(n.x, h[0], .38), g), lerp(y0, lerp(n.y, h[1], .38), g)];
  }
  draw(x, t) {
    if (t < this.t0 - .01 || t >= this.t1) return;
    const T = this.o.t, cols = [C.accent, LIME(), C.paper], g = tw(t, T.graph, T.graph + .6, E.outCubic), Hb = this.hubs;
    x.save(); x.lineCap = 'round';
    for (const n of this.nodes) {
      const s0 = T.graph + n.i * .012 + n.k * .05, e = tw(t, s0, s0 + .35, E.outCubic);
      if (e <= 0 || t < n.t) continue;
      const p = this.pos(n, t), h = Hb[n.hub];
      x.strokeStyle = rgba(cols[n.k], .45); x.lineWidth = 2;
      x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(lerp(p[0], h[0], e), lerp(p[1], h[1], e)); x.stroke();
    }
    if (g > 0) {
      for (let i = 0; i < Hb.length; i++) for (const j of [(i + 1) % Hb.length, (i + 2) % Hb.length]) {
        x.strokeStyle = rgba(C.paper, .35 * g); x.lineWidth = 2.4; x.beginPath(); x.moveTo(Hb[i][0], Hb[i][1]); x.lineTo(lerp(Hb[i][0], Hb[j][0], g), lerp(Hb[i][1], Hb[j][1], g)); x.stroke();
        const q = (t * .9 + i * .37 + j * .21) % 1; glowDot(x, lerp(Hb[i][0], Hb[j][0], q), lerp(Hb[i][1], Hb[j][1], q), 3.2, .9 * g, LIME());
      }
      this.plats.forEach((p, i) => {
        const u = tw(t, p.t, p.t + .3, E.outCubic); if (u <= 0) return;
        const h = Hb[i % Hb.length]; x.setLineDash([10, 12]); x.lineDashOffset = -t * 60;
        x.strokeStyle = rgba(LIME(), .6); x.lineWidth = 2.2; x.beginPath(); x.moveTo(h[0], h[1]); x.lineTo(lerp(h[0], p.x, u), lerp(h[1], p.y, u)); x.stroke(); x.setLineDash([]);
        const q = (t * .7 + i * .25) % 1; glowDot(x, lerp(h[0], p.x, q * u), lerp(h[1], p.y, q * u), 3.4, u, LIME());
      });
      Hb.forEach((h, i) => { x.fillStyle = C.bg; x.beginPath(); x.arc(h[0], h[1], 30 * g, 0, 7); x.fill(); x.strokeStyle = C.accent; x.lineWidth = 5; x.stroke(); glowDot(x, h[0], h[1], 8 + 2 * Math.sin(t * 5 + i), g); });
    }
    for (const n of this.nodes) {
      if (t < n.t) continue;
      const p = this.pos(n, t), px = p[0], py = p[1], s = E.outBack(clamp((t - n.t) / .35)), col = cols[n.k];
      x.fillStyle = C.bg; x.beginPath(); x.arc(px, py, 17 * s, 0, 7); x.fill();
      x.strokeStyle = col; x.lineWidth = 3; x.stroke();
      x.fillStyle = col; x.strokeStyle = col;
      if (n.k === 0) for (let b = -1; b <= 1; b++) { const h = (5 + 4 * Math.abs(Math.sin(t * 9 + n.ph + b))) * s; x.fillRect(px + b * 6 - 1.6, py - h, 3.2, h * 2); }
      else if (n.k === 1) { x.lineWidth = 2; x.strokeRect(px - 7 * s, py - 6 * s, 14 * s, 12 * s); x.beginPath(); x.moveTo(px - 6 * s, py + 5 * s); x.lineTo(px - s, py); x.lineTo(px + 6 * s, py + 5 * s); x.stroke(); }
      else { x.font = '700 ' + Math.max(1, Math.round(17 * s)) + 'px JBM'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('#', px, py + 1); }
    }
    x.restore();
  }
  cam(t) {
    const T = this.o.t, u = clamp((t - this.t0) / (this.t1 - this.t0)), back = tw(t, T.platforms - .1, T.platforms + .8, E.inOutCubic);
    return { s: lerp(1.1 + .06 * u, .88, back), r: lerp(-1.4, 1.2, u), x: lerp(-40, 40, u) };
  }
  update(t) {
    const T = this.o.t;
    slamWord(this.kick, t, T.link, T.audio, 960, 520, { from: 1.4, drift: 0 });
    this.labels.forEach((l, k) => {
      const nt = k < 2 ? this.labels[k + 1].t : T.graph, c = this.centers[k];
      slamWord(l.e, t, l.t, nt, lerp(c[0], 960, .45), c[1], { from: 1.5, maxW: 1100 });
      const m = t >= nt - .02; vis(l.m, m);
      if (m) { set(l.m, 'transform', at(c[0], c[1] + (k === 2 ? 220 : -220))); set(l.m, 'opacity', (tw(t, nt, nt + .2) * (1 - tw(t, T.platforms, T.platforms + .3))).toFixed(3)); }
    });
    slamWord(this.title, t, T.graph, T.platforms, 960, 235, { from: 1.5, drift: 0, maxW: 1500 });
    slamWord(this.title2, t, T.platforms, this.t1, 960, 235, { from: 1.6, drift: 0, maxW: 1500 });
    this.plats.forEach(p => { const u = tw(t, p.t, p.t + .25, E.outBack); vis(p.e, u > 0); set(p.e, 'transform', at(p.x, p.y, 'scale(' + u.toFixed(3) + ')')); });
  }
}

/**
 * A real capture of the app in a floating browser window. Frames are pre-extracted JPEGs (25 fps) so the
 * film stays seekable: update() swaps the src and pushes the decode promise onto window.__pending, which the
 * patched __seek (main.js) awaits before the renderer captures. o: dir, count (frames on disk), from (source
 * seconds at t0, played at 1x), url, chip, focus [[sec, scale, fx, fy]] (camera inside the window; fx/fy are
 * 0-1 of the capture), words [[sec, end, text, opts]] (opts: size, wdth, color, x, y, big).
 */
export class Screen extends Scene {
  build() {
    const f = this.f, o = this.o;
    this.root.classList.add('persp');
    this.box = el('div', this.root, 'abs p3d', { left: '960px', top: (o.scale ? 480 : 560) + 'px' });
    this.win = el('div', this.box, 'scrwin', { width: '1440px', height: '856px' });
    const hd = el('div', this.win, 'scrhead'); for (let i = 0; i < 3; i++) el('i', hd); el('span', hd, 'scrurl').textContent = o.url;
    this.view = el('div', this.win, 'scrview');
    this.img = el('img', this.view, 'scrimg', { width: '1440px', height: '810px' });
    this.chip = el('div', this.root, 'abs chip'); this.chip.textContent = o.chip; this.chipW = this.chip.offsetWidth;
    this.words = (o.words || []).map(([t, end, text, wo]) => ({ t, end, wo: wo || {}, e: word(this.root, text, wo || {}) }));
    this.words.forEach(w => land(f, w.t, w.wo.big ? 2 : 1, { gain: w.wo.big ? .9 : .5 }));
    f.cue(this.t0, 'whoosh_big', .7); f.fast(this.t0, this.t0 + .5, 10); f.cue(this.t0 + .35, 'impact', .6);
  }
  update(t) {
    const o = this.o, idx = Math.max(1, Math.min(o.count, Math.floor((o.from + t - this.t0) * 25) + 1));
    const src = o.dir + '/' + String(idx).padStart(4, '0') + '.jpg';
    if (this.img.getAttribute('src') !== src) { this.img.src = src; if (window.__pending) window.__pending.push(this.img.decode()); }
    const u = tw(t, this.t0, this.t0 + .55, E.outExpo), d = t - this.t0;
    set(this.box, 'transform', 'translateZ(' + lerp(-2200, 0, u).toFixed(1) + 'px) rotateY(' + (lerp(-38, -7, u) + 4 * d).toFixed(2) + 'deg) rotateX(' + (lerp(16, 5, u) - d).toFixed(2) + 'deg) rotateZ(' + lerp(-4, -1, u).toFixed(2) + 'deg) scale(' + (o.scale || 1) + ') translate(-720px,-428px)');
    const kf = keys(o.focus, t), s = kf[0];
    const tx = clamp(720 - kf[1] * 1440 * s, 1440 - 1440 * s, 0), ty = clamp(405 - kf[2] * 810 * s, 810 - 810 * s, 0);
    set(this.img, 'transform', 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')');
    const cu = tw(t, this.t0 + .3, this.t0 + .6, E.outBack);
    set(this.chip, 'transform', at(1780 - this.chipW / 2, 150, 'scale(' + cu.toFixed(3) + ')'));
    for (const w of this.words) slamWord(w.e, t, w.t, w.end ?? this.t1, 960 + (w.wo.x || 0), w.wo.y || 900, { from: 1.4, maxW: 1450 });
  }
  cam(t) { const u = clamp((t - this.t0) / (this.t1 - this.t0)); return { s: 1 + .1 * E.inOutCubic(u), r: lerp(.6, -.6, u), x: lerp(-30, 30, u) }; }
}

/**
 * Spread acceleration and burst windows: a curve writes itself, then 6H / 12H / 24H windows open ahead of
 * "now" with a dashed projection. Illustrative and tagged R&D: no numbers on screen except the window
 * lengths the voice says. o.t: { model, accel, prob, window, w6, w12, w24, ahead } (seconds).
 */
export class Curve extends Scene {
  build() {
    const f = this.f, T = this.o.t;
    this.O = [300, 930]; this.Wd = 1380; this.Ht = 740; this.now = .6;
    this.kick = word(this.root, 'MÔ HÌNH TOÁN HỌC', { size: 110, wdth: 118, color: 'paper' });
    this.accel = word(this.root, 'GIA TỐC LAN TRUYỀN', { size: 140, wdth: 108, color: 'paper' });
    this.prob = word(this.root, 'XÁC SUẤT BÙNG NỔ', { size: 210, wdth: 108, color: 'accent', glow: 26 });
    this.wl = word(this.root, 'BÂY GIỜ', { mono: true, size: 26, color: 'paper' });
    this.ahead = word(this.root, 'GIỜ TỚI', { size: 120, wdth: 118, color: 'hot' });
    this.wins = [['6H', T.w6, .7], ['12H', T.w12, .8], ['24H', T.w24, 1]].map(a => ({ s: a[0], t: a[1], u: a[2], e: word(this.root, a[0], { size: 150, wdth: 104, color: 'hot' }) }));
    this.tag = word(this.root, 'R&D · MINH HỌA · KHÔNG PHẢI DỮ LIỆU ĐO', { mono: true, size: 20, color: 'paper' });
    f.comet({ t0: this.t0, t1: this.t0 + .45, path: u => [this.O[0] + this.Wd * u, this.O[1]], tail: .2, size: 8 });
    f.comet({ t0: this.t0 + .1, t1: this.t0 + .5, path: u => [this.O[0], this.O[1] - this.Ht * u], tail: .2, size: 8 });
    f.cue(this.t0, 'whoosh', .6);
    land(f, T.model, 1, { gain: .5 }); land(f, T.accel, 1, { gain: .5 });
    land(f, T.prob, 2, { cue: 'impact', gain: .9 });
    this.wins.forEach(w => land(f, w.t, 1, { gain: .65 }));
    land(f, T.window, 1, { gain: .35, cue: 'tick' }); land(f, T.ahead, 1, { gain: .45 });
    f.fast(T.model, T.prob, 6);
    f.paint((x, t) => this.draw(x, t));
  }
  /** The illustrated growth: an exponential easing on 0-1 (accelerating, ends at 1). */
  g(u) { return (Math.exp(2.4 * u) - 1) / (Math.exp(2.4) - 1); }
  P(u) { return [this.O[0] + this.Wd * u, this.O[1] - this.Ht * this.g(u)]; }
  draw(x, t) {
    if (t < this.t0 || t >= this.t1) return;
    const T = this.o.t, p = this.now * tw(t, T.model, T.prob - .1, E.inOutCubic), ox = this.O[0], oy = this.O[1];
    x.save();
    x.strokeStyle = rgba(C.paper, .1); x.lineWidth = 1.5;
    for (let i = 1; i <= 5; i++) { x.beginPath(); x.moveTo(ox, oy - i * this.Ht / 5); x.lineTo(ox + this.Wd * tw(t, this.t0 + .2 + i * .05, this.t0 + .7 + i * .05), oy - i * this.Ht / 5); x.stroke(); }
    for (const w of this.wins) {
      const u = tw(t, w.t - .05, w.t + .3, E.outExpo); if (u <= 0) continue;
      const x0 = ox + this.Wd * this.now, x1 = lerp(x0, ox + this.Wd * w.u, u);
      x.fillStyle = rgba(LIME(), .07); x.fillRect(x0, oy - this.Ht - 40, x1 - x0, this.Ht + 40);
      x.strokeStyle = rgba(LIME(), .8); x.lineWidth = 3; x.beginPath(); x.moveTo(x1, oy + 20); x.lineTo(x1, oy - this.Ht - 40); x.stroke();
      // the projection inside this window is dashed: a forecast, not a measurement
      x.setLineDash([12, 12]); x.strokeStyle = rgba(LIME(), .9); x.lineWidth = 4; x.beginPath();
      for (let i = 0; i <= 40; i++) { const q = this.P(lerp(this.now, lerp(this.now, w.u, u), i / 40)); if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }
      x.stroke(); x.setLineDash([]);
    }
    if (p > 0) {
      x.beginPath(); x.moveTo(ox, oy);
      for (let i = 0; i <= 80; i++) { const q = this.P(p * i / 80); x.lineTo(q[0], q[1]); }
      const tip = this.P(p); x.lineTo(tip[0], oy); x.closePath();
      const gr = x.createLinearGradient(0, oy - this.Ht, 0, oy); gr.addColorStop(0, rgba(C.accent, .38)); gr.addColorStop(1, rgba(C.accent, 0)); x.fillStyle = gr; x.fill();
      x.beginPath(); for (let i = 0; i <= 80; i++) { const q = this.P(p * i / 80); if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }
      x.strokeStyle = C.accent; x.lineWidth = 7; x.stroke();
      glowDot(x, tip[0], tip[1], 9, 1);
      // the acceleration the voice names, drawn as an arrow along the slope at the tip
      const a = tw(t, T.accel, T.accel + .3);
      if (a > 0) {
        const q = this.P(Math.max(0, p - .02)), ang = Math.atan2(tip[1] - q[1], tip[0] - q[0]), L = 190 * a, ex = tip[0] + Math.cos(ang) * L, ey = tip[1] + Math.sin(ang) * L;
        x.strokeStyle = C.paper; x.lineWidth = 4; x.beginPath(); x.moveTo(tip[0], tip[1]); x.lineTo(ex, ey); x.stroke();
        x.beginPath(); x.arc(ex, ey, 7, 0, 7); x.fillStyle = C.paper; x.fill();
      }
    }
    const nw = tw(t, T.window, T.window + .3);
    if (nw > 0) { const nx = ox + this.Wd * this.now; x.strokeStyle = rgba(C.paper, .9); x.lineWidth = 3; x.beginPath(); x.moveTo(nx, oy + 30); x.lineTo(nx, lerp(oy + 30, oy - this.Ht - 60, nw)); x.stroke(); }
    x.restore();
  }
  cam(t) {
    const T = this.o.t, tip = this.P(this.now * tw(t, T.model, T.prob - .1, E.inOutCubic)), back = tw(t, T.prob - .2, T.window + .2, E.inOutCubic);
    return { s: lerp(1.1, .96, back), x: lerp((tip[0] - 960) * .25, 30, back), y: lerp((tip[1] - 540) * .2, 0, back), r: lerp(-1.2, .6, back) };
  }
  update(t) {
    const T = this.o.t, ox = this.O[0], oy = this.O[1];
    slamWord(this.kick, t, T.model, T.prob, 900, 290, { from: 1.3, maxW: 1300 });
    slamWord(this.accel, t, T.accel, T.prob, 900, 430, { from: 1.3, maxW: 1300, rot: -4 });
    // the probability title slams centre, then rises to become the chart's heading
    const up = tw(t, T.window - .25, T.window + .1, E.inOutCubic);
    slamWord(this.prob, t, T.prob, this.t1, 960, lerp(540, 150, up), { from: 1.6, maxW: 1450, scale: lerp(1, .55, up), drift: 0 });
    slamWord(this.wl, t, T.window, this.t1, ox + this.Wd * this.now, oy + 70, { from: 1, drift: 0 });
    this.wins.forEach((w, i) => {
      slamWord(w.e, t, w.t, this.t1, ox + this.Wd * w.u - 80, 560 - i * 130, { from: 1.8, drift: 0, scale: .8 });
      if (this.wins[i + 1] && t >= this.wins[i + 1].t) set(w.e, 'opacity', '.4');
    });
    slamWord(this.ahead, t, T.ahead, this.t1, ox + this.Wd - 160, oy + 90, { from: 1.4, drift: 0 });
    slamWord(this.tag, t, this.t0 + .3, this.t1, 600, 1012, { from: 1, drift: 0, grow: 0 });
  }
}

/**
 * A niche signal hops a platform border: a pulse on the TikTok side, a dashed border (BIÊN NGÁCH),
 * then a comet arcs over it and lands on Threads. o.t: { signal, move, cross, tiktok, threads } (seconds).
 */
export class Hop extends Scene {
  build() {
    const f = this.f, T = this.o.t;
    this.A = [600, 600]; this.Bp = [1360, 600];
    this.sig = word(this.root, 'TÍN HIỆU', { mono: true, size: 30, color: 'hot' });
    this.move = word(this.root, 'DỊCH CHUYỂN', { size: 150, wdth: 120, color: 'paper' });
    this.cross = word(this.root, 'VƯỢT BIÊN NGÁCH', { size: 200, wdth: 108, color: 'paper', stroke: 3 });
    this.tt = word(this.root, 'TIKTOK', { size: 160, wdth: 104, color: 'paper' });
    this.th = word(this.root, 'THREADS', { size: 160, wdth: 104, color: 'accent', glow: 26 });
    this.arc = u => { const v = 1 - u; return [v * v * this.A[0] + 2 * v * u * 970 + u * u * this.Bp[0], v * v * this.A[1] + 2 * v * u * 120 + u * u * this.Bp[1]]; };
    f.comet({ t0: T.cross, t1: T.cross + .45, path: u => [970, lerp(-60, 1140, u)], tail: .25, size: 8 });
    f.comet({ t0: T.tiktok + .12, t1: T.threads, path: this.arc, ease: E.inOutCubic, tail: .22, size: 12, trail: true, trailEnd: this.t1 });
    f.ring({ t0: T.threads, dur: .5, cx: this.Bp[0], cy: this.Bp[1], r0: 30, r1: 700, w: 14 });
    f.burst({ t0: T.threads, x: this.Bp[0], y: this.Bp[1], n: 40, speed: 1500, life: .55, seed: 31 });
    land(f, T.signal, 1, { gain: .35, cue: 'tick' }); land(f, T.move, 1, { gain: .45 });
    land(f, T.cross, 1, { gain: .6, cue: 'slash' }); land(f, T.tiktok, 1, { gain: .7 }); land(f, T.threads, 2, { cue: 'impact_big', gain: .9 });
    f.cue(T.tiktok + .15, 'whoosh', .7); f.fast(T.tiktok + .1, T.threads + .1, 10); f.smear(T.tiktok + .25, T.threads - .05, 1.8);
    f.paint((x, t) => this.draw(x, t));
  }
  draw(x, t) {
    if (t < this.t0 || t >= this.t1) return;
    const T = this.o.t, u = tw(t, T.cross, T.cross + .45, E.inOutCubic), hop = tw(t, T.tiktok + .12, T.threads, E.inOutCubic);
    if (u > 0) { x.save(); x.setLineDash([18, 16]); x.lineDashOffset = t * 40; x.strokeStyle = rgba(C.paper, .6); x.lineWidth = 3; x.beginPath(); x.moveTo(970, -60); x.lineTo(970, lerp(-60, 1140, u)); x.stroke(); x.restore(); }
    if (hop <= 0) {
      glowDot(x, this.A[0], this.A[1] + 8 * Math.sin(t * 4), 10 + 4 * (.5 + .5 * Math.sin(t * 12)), tw(t, T.signal - .1, T.signal + .1));
      if (t > T.signal) for (let i = 0; i < 3; i++) drawRing(x, { t0: 0, dur: 1, cx: this.A[0], cy: this.A[1], r0: 10, r1: 170, w: 3, color: LIME(), alpha: .7 }, ((t - T.signal) * 1.3 + i / 3) % 1);
    }
  }
  cam(t) {
    const T = this.o.t, hop = tw(t, T.tiktok + .12, T.threads, E.inOutCubic), back = tw(t, T.threads + .1, this.t1, E.inOutCubic);
    return { x: lerp(lerp(-140, 140, hop), 0, back), s: lerp(1.14, .98, back), r: lerp(-1, 1, hop) * (1 - back) };
  }
  update(t) {
    const T = this.o.t;
    slamWord(this.sig, t, T.signal, T.tiktok + .1, this.A[0], this.A[1] - 70, { from: 1, drift: 0 });
    slamWord(this.move, t, T.move, T.cross, this.A[0] + 160, 380, { from: 1.4, maxW: 1100 });
    slamWord(this.cross, t, T.cross, this.t1, 960, 310, { from: 1.4, drift: 10, maxW: 1400 });
    slamWord(this.tt, t, T.tiktok, this.t1, this.A[0], this.A[1] + 170, { from: 1.5, maxW: 820, drift: 0 });
    slamWord(this.th, t, T.threads, this.t1, this.Bp[0], this.Bp[1] + 170, { from: 1.6, maxW: 820, dx: 300, drift: 0 });
  }
}

/**
 * The early-warning card assembles as the voice lists its fields: audio fingerprint, brand-safety level,
 * cited sources. Tagged R&D. o.t: { make, card, fp, safe, src } (seconds); o.sources: domain chips
 * (sources the real capture collects from).
 */
export class Card extends Scene {
  build() {
    const f = this.f, o = this.o, T = o.t;
    this.root.classList.add('persp');
    this.kick = word(this.root, 'TỰ ĐỘNG TẠO', { size: 170, wdth: 118, color: 'paper' });
    this.ghost = ['VÂN TAY ÂM THANH', 'AN TOÀN THƯƠNG HIỆU', 'NGUỒN GỐC'].map(s => word(this.root, s, { size: 330, wdth: 100, color: 'paper', stroke: 2.5 }));
    this.box = el('div', this.root, 'abs p3d', { left: '960px', top: '590px' });
    this.card = el('div', this.box, 'card');
    el('div', this.card, 'bar'); this.pulse = el('div', this.card, 'pulse');
    this.hd = el('div', this.card, 'hd'); this.hdText = 'THẺ CẢNH BÁO SỚM';
    el('div', this.card, 'tag').textContent = 'R&D · MINH HỌA';
    this.rows = ['VÂN TAY ÂM THANH', 'MỨC ĐỘ AN TOÀN THƯƠNG HIỆU', 'TRÍCH DẪN NGUỒN GỐC'].map((s, i) => {
      const r = el('div', this.card, 'row', { top: (160 + i * 166) + 'px' }); el('div', r, 'lab').textContent = s; return { r, v: el('div', r, 'val') };
    });
    const rr = rng(9);
    this.fp = Array.from({ length: 84 }, (_, i) => ({ e: el('div', this.rows[0].v, 'fp', { left: (i * 12.8) + 'px', height: '64px' }), h: .2 + .8 * rr() * rr() + .25 * Math.sin(i * .5) ** 2, ph: rr() * 6 }));
    this.segs = Array.from({ length: 10 }, (_, i) => el('div', this.rows[1].v, 'seg', { left: (i * 84) + 'px' }));
    this.srcs = o.sources.map(s => { const e = el('div', this.rows[2].v, 'src'); e.textContent = '↗ ' + s; return e; });
    let x = 0; this.srcs.forEach(e => { e.style.left = x + 'px'; x += e.offsetWidth + 18; });
    this.focus = [[T.card, 0, 0, 1], [T.fp, 0, 40, 1.08], [T.safe, 0, -40, 1.08], [T.src, 0, -120, 1.08]];
    land(f, T.make, 1, { gain: .5 }); f.cue(T.card - .15, 'whoosh_big', .8); land(f, T.card + .05, 2, { cue: 'impact', gain: .8 });
    [T.fp, T.safe, T.src].forEach(t => { land(f, t, 1, { gain: .55 }); f.cue(t - .12, 'whoosh', .5); });
    this.srcs.forEach((_, i) => f.cue(T.src + .15 + i * .12, 'pop', .3));
    for (let i = 0; i < 8; i++) f.cue(T.safe + .12 + i * .045, 'tick', .18);
    f.bokeh({ t0: this.t0, t1: this.t1, n: 50, color: C.accent, size: 2.2, vy: -24, alpha: .35, seed: 52 });
  }
  cam(t) {
    const k = keys(this.focus, t, .12), u = clamp((t - this.t0) / (this.t1 - this.t0));
    return { x: k[0], y: -k[1] * .9, s: k[2] * (1 + .04 * u), r: lerp(-.8, .8, u) };
  }
  update(t) {
    const T = this.o.t, u = tw(t, T.card, T.card + .5, E.outExpo), d = t - T.card;
    slamWord(this.kick, t, T.make, T.card + .1, 960, 540, { from: 1.4, maxW: 1600 });
    vis(this.box, t >= T.card - .01);
    set(this.box, 'transform', 'translateZ(' + lerp(-2400, 0, u).toFixed(1) + 'px) rotateX(' + (lerp(40, 6, u) - 2 * Math.max(0, d)).toFixed(2) + 'deg) rotateY(' + (lerp(-24, -5, u) + 3 * Math.max(0, d)).toFixed(2) + 'deg) translate(-590px,-330px)');
    const n = Math.floor(tw(t, T.card + .05, T.card + .45, E.lin) * this.hdText.length), txt = this.hdText.slice(0, n);
    if (this.hd.textContent !== txt) this.hd.textContent = txt;
    set(this.pulse, 'opacity', (.4 + .6 * Math.abs(Math.sin(t * 5))).toFixed(3));
    const ends = [T.safe, T.src, this.t1];
    [T.fp, T.safe, T.src].forEach((tk, i) => {
      const r = this.rows[i], v = tw(t, tk - .05, tk + .25, E.outCubic);
      set(r.r, 'opacity', (.25 + .75 * v).toFixed(3)); set(r.v, 'opacity', v.toFixed(3));
      const g = this.ghost[i], on = t >= tk && t < ends[i];
      vis(g, on); if (on) { set(g, 'transform', at(1560 - (t - tk) * 420, 560)); set(g, 'opacity', (.14 * tw(t, tk, tk + .2)).toFixed(3)); }
    });
    this.fp.forEach((b, i) => { const g = tw(t, T.fp + i * .006, T.fp + .3 + i * .006, E.outBack); set(b.e, 'transform', 'scaleY(' + (g * b.h * (.75 + .25 * Math.sin(t * 7 + b.ph))).toFixed(3) + ')'); });
    this.segs.forEach((s, i) => set(s, 'background', i < 8 && t >= T.safe + .12 + i * .045 ? (i < 6 ? LIME() : C.accent) : rgba(C.paper, .12)));
    this.srcs.forEach((e, i) => { const g = tw(t, T.src + .15 + i * .12, T.src + .4 + i * .12, E.outBack); set(e, 'transform', 'translateY(' + (30 * (1 - g)).toFixed(1) + 'px) scale(' + g.toFixed(3) + ')'); set(e, 'opacity', clamp(g * 2).toFixed(3)); });
  }
}

/**
 * "Chỉ với một cú nhấp chuột": the line builds word by word on the voice, a cursor flies to the export
 * button, presses on the spoken "nhấp", and the button turns into a sent confirmation, then the camera
 * pushes into it. o.words: [[text, sec, line (0 | 1)]]; o.press: seconds of the click.
 */
export class Click extends Scene {
  build() {
    const f = this.f, o = this.o;
    this.ws = o.words.map(a => ({ t: a[1], line: a[2], e: word(this.root, a[0], { size: 170, wdth: 112, color: a[0].startsWith('NHẤP') ? 'accent' : 'paper', glow: a[0].startsWith('NHẤP') ? 24 : 0 }) }));
    // two centred lines, laid out once from the measured widths
    for (const line of [0, 1]) {
      const L = this.ws.filter(w => w.line === line), gap = 64, tot = L.reduce((a, w) => a + w.e.w, 0) + gap * (L.length - 1);
      let x = 960 - tot / 2; L.forEach(w => { w.x = x + w.e.w / 2; x += w.e.w + gap; });
    }
    this.btn = el('div', this.root, 'btn'); this.btn.textContent = 'XUẤT BÁO CÁO  →';
    this.cur = el('div', this.root, 'abs');
    this.cur.innerHTML = '<svg width="74" height="96" viewBox="0 0 37 48"><path d="M2 2 L2 38 L11 30 L17 45 L23 42 L17 28 L30 28 Z" fill="#fff" stroke="#0E0B1A" stroke-width="2.6" stroke-linejoin="round"/></svg>';
    this.ws.forEach(w => { f.cue(w.t, 'hit', .45); f.bump(w.t, .02); f.fast(w.t, w.t + .2, 8); });
    const p = o.press;
    f.cue(p - .5, 'whoosh', .45); f.cue(p, 'click', 1); land(f, p + .02, 2, { cue: 'impact', gain: .9 });
    f.burst({ t0: p, x: 960, y: 800, n: 46, speed: 1600, life: .6, seed: 61 });
    f.cue(p + .3, 'sparkle', .5);
    f.bokeh({ t0: this.t0, t1: this.t1, n: 60, color: C.accent, size: 2.4, vy: -30, alpha: .4, seed: 63 });
    f.fast(p + .3, this.t1, 6);
  }
  cam(t) { const u = clamp((t - this.t0) / (this.t1 - this.t0)), p = tw(t, this.o.press + .6, this.t1, E.inCubic); return { s: (1 + .05 * u) * lerp(1, 1.6, p), y: lerp(0, 250, p), r: lerp(.7, -.7, u) }; }
  update(t) {
    const p = this.o.press;
    for (const w of this.ws) slamWord(w.e, t, w.t, this.t1, w.x, w.line ? 470 : 270, { from: 1.5, drift: 0, dy: -40 });
    const bu = tw(t, this.t0 + .05, this.t0 + .4, E.outBack), press = Math.min(tw(t, p - .05, p, E.outCubic), 1 - tw(t, p + .08, p + .25, E.outCubic));
    const done = t >= p + .22;
    if (this.btn.__d !== done) { this.btn.textContent = done ? '✓  ĐÃ GỬI KHÁCH HÀNG' : 'XUẤT BÁO CÁO  →'; this.btn.__d = done; set(this.btn, 'background', done ? LIME() : C.accent); }
    set(this.btn, 'transform', at(960, 800, 'scale(' + (bu * (1 - .07 * press) * (done ? 1 + .04 * tw(t, p + .22, p + .4, E.outBack) : 1)).toFixed(4) + ')'));
    const mv = tw(t, p - .75, p - .08, E.inOutCubic);
    set(this.cur, 'transform', 'translate(' + lerp(1820, 1050, mv).toFixed(1) + 'px,' + lerp(1160, 820, mv).toFixed(1) + 'px) scale(' + (1 - .14 * press).toFixed(3) + ')');
  }
}

/**
 * The team roster on a paper ground: names stack in while the voice credits the team and the school.
 * o.people: [[name, role]]; o.at: per-row seconds; o.kickAt: seconds of the kicker;
 * o.lines: [[text, from, to]] mono lines typed across [from, to] seconds.
 */
export class Team extends Scene {
  build() {
    const f = this.f, o = this.o;
    if (o.ground) f.ground(this.t0, this.t1, cc(o.ground));
    this.kick = word(this.root, 'ĐƯỢC PHÁT TRIỂN BỞI', { size: 64, wdth: 125, color: 'ink' });
    this.rows = o.people.map((p, i) => {
      const g = el('div', this.root, 'abs');
      const idx = el('div', g, 'abs midx', { left: '0px', top: '30px' }); idx.textContent = '0' + (i + 1);
      const nm = el('div', g, 'abs mname', { left: '90px', top: '0px' }); nm.textContent = p[0];
      const rl = el('div', g, 'abs mrole', { left: '94px', top: '102px' }); rl.textContent = p[1].toUpperCase();
      const bar = el('div', g, 'abs', { left: '90px', top: '146px', height: '4px', width: '0px', background: C.accent });
      return { g, bar, t: o.at[i], w: nm.offsetWidth };
    });
    this.lines = o.lines.map(a => ({ s: a[0], a: a[1], b: a[2], e: word(this.root, '', { mono: true, size: 28, color: 'ink' }) }));
    this.rows.forEach(r => { f.cue(r.t, 'hit', .5); f.cue(r.t - .1, 'whoosh', .35); f.bump(r.t, .02); f.fast(r.t, r.t + .3, 8); });
    land(f, o.kickAt, 1, { light: true, gain: .4 });
    this.lines.forEach(l => { for (let i = 0; i < l.s.length; i += 2) f.cue(lerp(l.a, l.b, i / l.s.length), 'key', .1); });
  }
  cam(t) { const u = clamp((t - this.t0) / (this.t1 - this.t0)); return { s: 1.02 + .05 * u, y: lerp(-20, 50, u), r: lerp(-.6, .6, u) }; }
  update(t) {
    slamWord(this.kick, t, this.o.kickAt, this.t1, 960, 178, { from: 1.3, drift: 0 });
    this.rows.forEach((r, i) => {
      const u = tw(t, r.t, r.t + .35, E.outExpo);
      vis(r.g, t >= r.t - .01);
      set(r.g, 'transform', 'translate(' + (330 + 900 * (1 - u) + 14 * Math.max(0, t - r.t)).toFixed(1) + 'px,' + (250 + i * 172) + 'px)');
      set(r.g, 'opacity', clamp(u * 2).toFixed(3));
      set(r.bar, 'width', (r.w * tw(t, r.t + .15, r.t + .55, E.outExpo)).toFixed(1) + 'px');
    });
    let shown = null;
    for (const l of this.lines) if (t >= l.a) shown = l;
    for (const l of this.lines) {
      vis(l.e, l === shown);
      if (l !== shown) continue;
      const n = Math.floor(tw(t, l.a, l.b, E.lin) * l.s.length), txt = l.s.slice(0, n) + (n < l.s.length ? '▍' : '');
      if (l.e.textContent !== txt) l.e.textContent = txt;
      set(l.e, 'transform', 'translate(332px, 958px)');
    }
  }
}

/**
 * A mono line typed letter by letter across [o.from, o.to] seconds and held until the block ends, with letter
 * spacing that keeps opening so it never parks. Used over the charge before the first word. Like Marks, it must
 * come after the block that owns the camera for its span.
 */
export class TypeLine extends Scene {
  build() {
    const o = this.o;
    this.e = word(this.root, '', { mono: true, size: o.size || 30, color: o.color || 'paper' });
    for (let i = 0; i < o.text.length; i += 2) this.f.cue(lerp(o.from, o.to, i / o.text.length), 'key', .14);
  }
  cam() { return {}; }
  update(t) {
    const o = this.o, n = Math.floor(tw(t, o.from, o.to, E.lin) * o.text.length), txt = o.text.slice(0, n) + (n < o.text.length ? '▍' : '');
    if (this.e.textContent !== txt) this.e.textContent = txt;
    set(this.e, 'letterSpacing', (.14 + .1 * tw(t, o.from, this.t1, E.lin)).toFixed(3) + 'em');
    set(this.e, 'transform', at(960, o.y || 640));
    set(this.e, 'opacity', (1 - tw(t, this.t1 - .12, this.t1)).toFixed(3));
  }
}

/** Effects for a span another block owns (strike-through slashes). It must come after that block in
 * spec.scenes, because the compositor takes the camera from the first scene active at t. */
export class Marks extends Scene {
  build() { for (const s of this.o.slashes || []) { this.f.slash(Object.assign({ dur: .14, hold: .5, fade: .3, w: 9 }, s)); this.f.cue(s.t0, 'slash', .9); } }
  cam() { return {}; }
}

/**
 * The end card: the supplied mark (logo.svg used as a CSS mask, so it takes the paper colour on the dark
 * ground) slams on the final chord, the tagline lands word by word with the voice, then the event and
 * contact lines. o: hit, sheenAt, smallAt, contactAt (seconds), words [[text, sec]], small, contact.
 */
export class EndCard extends Scene {
  build() {
    const f = this.f, o = this.o;
    this.mw = 980; this.mh = this.mw * 81 / 129;   // logo.svg viewBox is 129 x 81
    this.mark = el('div', this.root, 'endmark', { width: this.mw + 'px', height: this.mh + 'px' });
    this.sh = el('div', this.root, 'endmark sheen2', { width: this.mw + 'px', height: this.mh + 'px' });
    this.line = el('div', this.root, 'abs lline');
    this.tag = el('div', this.root, 'abs', { whiteSpace: 'nowrap' });
    this.tws = o.words.map(a => {
      const e = el('span', this.tag, 'tagw'); e.textContent = a[0];
      Object.assign(e.style, { fontFamily: 'Archivo', fontSize: '66px', fontVariationSettings: "'wght' 760, 'wdth' 104", color: /căn|cứ/.test(a[0]) ? C.accent : C.paper });
      return { e, t: a[1] };
    });
    this.tagW = this.tag.offsetWidth;
    this.small = word(this.root, o.small, { mono: true, size: 22, color: 'paper' });
    this.contact = word(this.root, o.contact, { mono: true, size: 30, color: 'hot' });
    const h = o.hit;
    f.slash({ t0: h - .12, x1: 380, y1: 548, x2: 1540, y2: 532, dur: .1, hold: .08, fade: .3, w: 5 });
    land(f, h, 2, { cue: 'logo_hit', gain: 1.1 });
    f.burst({ t0: h + .03, x: 960, y: 450, n: 36, speed: 1200, life: .6, seed: 91 });
    f.bokeh({ t0: h, t1: this.t1 + 1, n: 80, color: C.paper, size: 2.2, vy: -24, alpha: .28, seed: 92 });
    f.bokeh({ t0: h, t1: this.t1 + 1, n: 30, color: C.accent, size: 3, vy: -14, alpha: .4, seed: 93 });
    this.tws.forEach(w => f.cue(w.t, 'pop', .25));
    f.cue(o.contactAt, 'sparkle', .35); f.fast(h - .05, h + .6, 10);
  }
  cam(t) { const h = this.o.hit, u = tw(t, h, this.t1, E.outCubic); return { s: lerp(1.18, 1, tw(t, h, h + .5, E.outExpo)) * (1 + .07 * u), r: lerp(1.2, 0, tw(t, h, h + .6, E.outExpo)) }; }
  update(t) {
    const o = this.o, h = o.hit, l = tw(t, h - .14, h, E.outExpo), lo = tw(t, h + .05, h + .4, E.inCubic);
    vis(this.line, t < h + .45); set(this.line, 'width', (lerp(4, 1160, l) * (1 - lo)).toFixed(1) + 'px'); set(this.line, 'transform', at(960, 540));
    const m = tw(t, h, h + .32, E.outExpo), tr = 'translate(' + (960 - this.mw / 2) + 'px,' + (430 - this.mh / 2) + 'px) scale(' + lerp(1.25, 1, m).toFixed(4) + ')';
    vis(this.mark, t >= h - .01);
    set(this.mark, 'transform', tr);
    set(this.mark, 'clipPath', 'inset(-10% ' + ((1 - m) * 100).toFixed(2) + '% -10% 0)');
    const sw = tw(t, o.sheenAt, o.sheenAt + .9, E.inOutCubic);
    vis(this.sh, sw > 0 && sw < 1); set(this.sh, 'transform', tr); set(this.sh, 'backgroundPosition', lerp(100, 0, sw).toFixed(2) + '% 0');
    set(this.tag, 'transform', 'translate(' + (960 - this.tagW / 2) + 'px, 730px)');
    this.tws.forEach(w => { const u = tw(t, w.t - .02, w.t + .2, E.outBack); set(w.e, 'opacity', clamp(u * 2).toFixed(3)); set(w.e, 'transform', 'translateY(' + (36 * (1 - u)).toFixed(1) + 'px)'); });
    slamWord(this.small, t, o.smallAt, this.t1 + 1, 960, 885, { from: 1, drift: 0, grow: 0 });
    slamWord(this.contact, t, o.contactAt, this.t1 + 1, 960, 955, { from: 1, drift: 0, grow: 0 });
  }
}
