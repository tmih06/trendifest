// engine.js: the small toolkit V5 is built from. Every function here is pure in t (no clocks, no randomness),
// so the renderer can seek any instant in any order and average sub-frames into motion blur.
//
// Why a new engine instead of V4's kinetic one: V4's blocks are built around punches (shakes, whips, flashes,
// frame-filling type). V5 is the opposite brief: long eased moves, objects that morph into the next object,
// one short line of type at a time. A handful of helpers covers that; the scenes live in film.js.

/** Clamps x into [a, b]. */
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** Linear interpolation from a to b by u (u is not clamped). */
export const lerp = (a, b, u) => a + (b - a) * u;

/** Easing curves on u in [0, 1]. crit is a critically damped spring (no overshoot): the "Apple" settle. */
export const E = {
  lin: u => u,
  io3: u => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  io5: u => (u < .5 ? 16 * u ** 5 : 1 - Math.pow(-2 * u + 2, 5) / 2),
  o3: u => 1 - Math.pow(1 - u, 3),
  o5: u => 1 - Math.pow(1 - u, 5),
  i3: u => u * u * u,
  crit: u => (u >= 1 ? 1 : (1 - (1 + 7 * u) * Math.exp(-7 * u)) / (1 - 8 * Math.exp(-7))),
};

/** Eased progress of t through [a, b]: 0 before a, 1 after b. */
export const ramp = (t, a, b, e = E.io3) => e(clamp((t - a) / (b - a)));

/** Presence of something shown over [a, b]: rises over fi seconds from a, falls over fo seconds to b. */
export const win = (t, a, b, fi = .5, fo = .5, e = E.io3) => Math.min(ramp(t, a, a + fi, e), 1 - ramp(t, b - fo, b, e));

/**
 * Keyframe track: keys is [[t, value], ...] sorted by t; value is a number or an object of numbers.
 * Between keys the value eases with e (each segment eases from rest to rest, so a chain of keys reads as a
 * sequence of deliberate moves). Before the first key and after the last the value holds.
 */
export function track(keys, t, e = E.io3) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t < t1) {
      const [t0, v0] = keys[i - 1], u = e((t - t0) / (t1 - t0));
      if (typeof v0 === 'number') return lerp(v0, v1, u);
      const o = {};
      for (const k in v0) o[k] = typeof v0[k] === 'number' ? lerp(v0[k], v1[k] ?? v0[k], u) : (u < .5 ? v0[k] : v1[k]);
      return o;
    }
  }
  return keys[keys.length - 1][1];
}

/** Creates an element with a class and optional inner HTML, appended to parent. */
export function h(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

// Style writes are cached per element: a frame touches only what changed, which keeps seeks cheap.
const cache = new WeakMap();
/** Sets inline style properties on el, skipping values that did not change since the last call. */
export function S(el, props) {
  let c = cache.get(el);
  if (!c) { c = {}; cache.set(el, c); }
  for (const k in props) {
    const v = props[k];
    if (c[k] !== v) { c[k] = v; el.style[k] = v; }
  }
}

/** A CSS transform string from a pose: translate (x, y, z px), rotations (deg) and scale. */
export function tf({ x = 0, y = 0, z = 0, s = 1, rx = 0, ry = 0, rz = 0 } = {}) {
  return 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,' + z.toFixed(1) + 'px) rotateX(' + rx.toFixed(3) + 'deg) rotateY(' +
    ry.toFixed(3) + 'deg) rotateZ(' + rz.toFixed(3) + 'deg) scale(' + s.toFixed(4) + ')';
}

/**
 * Shows el at opacity a (hidden with display:none when a is ~0, so off-screen work is skipped), with an optional
 * blur in px; extra holds further style properties. Blur is the morph glue: things arrive and leave soft.
 */
export function vis(el, a, blur = 0, extra = {}) {
  S(el, { display: a > .002 ? '' : 'none', opacity: clamp(a).toFixed(3), filter: blur > .05 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none', ...extra });
}

/** A deterministic hash noise in [0, 1) for integer-ish inputs: stands in for Math.random. */
export const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * Resolves once img has loaded its current src (failures, such as a 404, are recorded in window.__badSrc and
 * resolve too, so one bad frame cannot stall a render).
 * Why 'load' and not img.decode(): in headless Chrome, decode() on some of the small, transformed orbit tiles
 * resolved only after ~3.1 s (measured: 3146 ms vs 12 ms for their neighbours), which made each sample of the
 * opening wait three seconds. The images use decoding="sync", so the paint before the capture decodes them
 * anyway; the renderer only has to know the bytes have arrived.
 */
function decoded(img) {
  const src = img.src;
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise(res => {
    img.addEventListener('load', res, { once: true });
    img.addEventListener('error', () => { if (img.src === src) (window.__badSrc = window.__badSrc || []).push(src); res(); }, { once: true });
  });
}

/**
 * A JPEG sequence shown in an <img>: at(tau) shows the frame for tau seconds into the clip (held at the ends).
 * Each new frame's decode() promise goes onto window.__pending so the renderer never captures a frame
 * before its picture has decoded.
 */
export class Seq {
  constructor(parent, dir, n, cls = 'seq', fps = 30) {
    this.img = h('img', cls, parent); this.img.decoding = 'sync'; this.img.alt = '';
    this.dir = dir; this.n = n; this.fps = fps; this.i = -1;
  }
  at(tau) {
    const i = clamp(Math.floor(tau * this.fps + 1e-6), 0, this.n - 1);
    if (i !== this.i) {
      this.i = i; this.img.src = this.dir + '/' + String(i + 1).padStart(4, '0') + '.jpg';
      (window.__pending || []).push(decoded(this.img));
    }
  }
}

/**
 * A screencast take of the real app (tools/capture.mjs): frames arrive only on repaint, each with a time, so
 * at(tau) shows the last frame painted at or before tau seconds into the take.
 */
export class Take {
  constructor(parent, dir, times, cls = 'take') {
    this.img = h('img', cls, parent); this.img.decoding = 'sync'; this.img.alt = '';
    this.dir = dir; this.times = times; this.i = -1;
  }
  at(tau) {
    const T = this.times; let lo = 0, hi = T.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= tau) lo = m; else hi = m - 1; }
    if (lo !== this.i) {
      this.i = lo; this.img.src = this.dir + '/' + String(lo).padStart(5, '0') + '.jpg';
      (window.__pending || []).push(decoded(this.img));
    }
  }
}

/**
 * A line of type revealed word by word on the narration's onsets: each word rises 18 px out of a 10 px blur
 * over 0.55 s; out (seconds) sends the whole line up and soft over 0.5 s. words: [[text, onset], ...].
 * The line is laid out once by the browser (it wraps inside its max width), so words never collide.
 */
export class Line {
  constructor(parent, words, cls = 'line') {
    this.el = h('div', cls, parent);
    this.w = words.map(([txt, t0]) => { const s = h('span', 'w', this.el); s.textContent = txt; return [s, t0]; });
  }
  update(t, out = 1e9) {
    const o = ramp(t, out, out + .5, E.io3);
    let any = 0;
    for (const [s, t0] of this.w) {
      const u = ramp(t, t0 - .06, t0 + .5, E.o3);
      const a = u * (1 - o); any = Math.max(any, a);
      S(s, { opacity: a.toFixed(3), transform: 'translateY(' + ((1 - u) * 18 - o * 14).toFixed(2) + 'px)', filter: (1 - u) * 10 + o * 8 > .05 ? 'blur(' + ((1 - u) * 10 + o * 8).toFixed(2) + 'px)' : 'none' });
    }
    S(this.el, { display: any > .002 ? '' : 'none' });
    return any;
  }
}
