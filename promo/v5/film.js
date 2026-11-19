// film.js: the V5 film — 96 s at 30 fps, every frame a pure function of t (seconds).
//
// Structure: a list of scenes, each a builder that makes its DOM once and returns update(t). A scene is
// displayed only inside its [t0, t1] span; inside, it fades, blurs and moves itself, so neighbouring scenes
// overlap and hand over by morphing rather than cutting. Times are the narration's word onsets in film
// seconds (v4/captions.js: faster-whisper word times aligned to the supplied script), so type and objects
// land on the spoken word. Narration: s1-s4 back to back from 1.5 s (tools/build_audio.py).
//
// Design rules this file keeps (the brief for V5):
//  * one short line of type at a time, 52-112 px, inside the 96 px title-safe margin (tools/audit.mjs checks);
//  * no shakes, flashes, whips or hard cuts: moves ease from rest to rest (E.io3 / E.crit) over 0.5-1.2 s;
//  * objects morph into the next object (dot -> audio pill -> Threads comment -> trending row; Threads +
//    TikTok cards -> early-warning card -> report), and the camera drifts continuously;
//  * drawn mock-ups carry a "Minh họa" tag; the real app captures carry "Bản chạy thực tế".
import { clamp, lerp, E, ramp, win, track, h, S, tf, vis, hash, Seq, Take, Line } from './engine.js';

const W = 1920, H = 1080, CX = 960, CY = 540;
export const DUR = 96, FPS = 30;

// ---------- small helpers ----------
const I = {
  heart: '<path d="M12 20s-7-4.4-9.3-8.6C1 8.2 3 5 6.3 5c2 0 3.3 1.1 4 2.3.7-1.2 2-2.3 4-2.3 3.3 0 5.3 3.2 3.6 6.4C19 15.6 12 20 12 20z"/>',
  chat: '<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5z"/>',
  repost: '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M22 12h-1"/>',
  up: '<path d="M7 17L17 7M9 7h8v8"/>',
  doc: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};
const svg = (k, cls = 'ico') => '<svg class="' + cls + '" viewBox="0 0 24 24">' + I[k] + '</svg>';
/** Positions el so its centre sits at (cx, cy) for a w x h box, with an extra pose (scale/rotation about the centre). */
function at(el, cx, cy, w, hh, p = {}) { S(el, { transform: tf({ ...p, x: cx - w / 2 + (p.x || 0), y: cy - hh / 2 + (p.y || 0) }) }); }
/** A line of narration-timed type. box: {x, y, w} top-left and width (px), size (px), align. */
function line(parent, words, { x, y, w, size = 60, align = 'center', cls = 'line grad', weight } = {}) {
  const l = new Line(parent, words, cls);
  l.el.dataset.text = words.map(q => q[0]).join(' ');
  S(l.el, { left: x + 'px', top: y + 'px', width: w + 'px', fontSize: size + 'px', textAlign: align, ...(weight ? { fontWeight: weight } : {}) });
  return l;
}
/** Marks el as text for the overlap / safe-area audit. */
const txt = (el, id) => { el.dataset.text = id; return el; };
/** A 2D canvas sized in CSS px with a backing store at 2x for crisp lines. */
function canvas(parent, w, hh, cls = '') {
  const c = h('canvas', cls, parent); c.width = w * 2; c.height = hh * 2; S(c, { width: w + 'px', height: hh + 'px' });
  const g = c.getContext('2d'); g.scale(2, 2); return [c, g];
}

// ---------- components ----------
// Each component builds its DOM once and returns handles; the scenes animate them.

/** The audio pill: a spinning disc, "Âm thanh gốc · 0:03" and live waveform bars (bar heights are a function of t). */
function audioPill(parent) {
  const el = h('div', 'pill layer', parent);
  const disc = h('div', 'disc', el);
  const t = h('div', '', el, '<b>Âm thanh gốc</b><span>0:03 · lúc nửa đêm</span>'); txt(t, 'pill');
  const bars = h('div', 'bars', el); const bs = [];
  for (let i = 0; i < 18; i++) bs.push(h('i', '', bars));
  return { el, update(tt) {
    S(disc, { transform: 'rotate(' + (tt * 90).toFixed(1) + 'deg)' });
    bs.forEach((b, i) => { const v = .25 + .75 * Math.abs(Math.sin(tt * 5.3 + i * .7) * Math.sin(tt * 2.1 + i * 1.9)); S(b, { height: (10 + v * 50).toFixed(1) + 'px' }); });
  } };
}

/** A Threads-style comment card (illustrative account and text; the counts are part of the mock-up). */
function threadsCard(parent, { user = 'ngach.genz', time = '3 phút', text, likes = '128', replies = '24', reposts = '9' }) {
  const el = h('div', 'th layer', parent);
  h('div', 'th-head', el, '<div class="th-av"></div><div><b>' + user + '</b> <span>' + time + '</span></div><div class="th-more">···</div>');
  txt(h('div', 'th-text', el, text), 'threads-text');
  h('div', 'th-acts', el, '<div>' + svg('heart') + likes + '</div><div>' + svg('chat') + replies + '</div><div>' + svg('repost') + reposts + '</div><div>' + svg('send') + '</div>');
  return el;
}

/** A row of a trending list: rank, title, kind, a rising arrow. */
function trendRow(parent, rank, title, kind, cls = 'row') {
  const el = h('div', cls, parent);
  const rk = h('div', 'rk', el, String(rank));
  h('div', 'tx', el, '<b>' + title + '</b><span>' + kind + '</span>');
  h('div', 'up', el, svg('up'));
  return { el, rk };
}

/** A browser window holding a real screencast take (tools/capture.mjs, 1280x760 layout at 2x). */
function appWindow(parent, takes, names) {
  const el = h('div', 'win', parent);
  const bar = h('div', 'bar', el);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => { const d = h('i', '', bar); S(d, { left: (20 + i * 22) + 'px', background: c }); });
  h('div', 'url', bar, 'trendifest · Analyst Console');
  const vp = h('div', 'vp', el);
  const T = {};
  for (const n of names) { T[n] = new Take(vp, 'takes/' + n, takes[n]); vis(T[n].img, 0); }
  return { el, vp, T,
    /** Shows take n at tau seconds, with alpha a; zoom {s, x, y}: scale about the viewport's top-left, then offset. */
    show(n, tau, a, z = { s: 1, x: 0, y: 0 }) {
      const k = T[n]; vis(k.img, a);
      if (a > .002) { k.at(tau); S(k.img, { transform: 'translate(' + z.x.toFixed(1) + 'px,' + z.y.toFixed(1) + 'px) scale(' + z.s.toFixed(4) + ')' }); }
    } };
}

/** A TikTok-style vertical video card around a stock sequence (no platform marks: the label says TikTok). */
function tiktokCard(parent, dir, n) {
  const el = h('div', 'card tt-card', parent);
  const seq = new Seq(el, dir, n, 'cover');
  h('div', 'shade', el);
  h('div', 'side', el, '<i>' + svg('heart') + '</i><i>' + svg('chat') + '</i><i>' + svg('send') + '</i>');
  txt(h('div', 'meta', el, '<b>@nhay.cung.genz</b><span>' + svg('note', 'ico mini') + ' âm thanh gốc · chill phết</span>'), 'tt-meta');
  return { el, seq };
}

/** Animated icon for a model card, drawn on its canvas. kind: demucs | whisper | xclip | llm; e = emphasis 0..1. */
function drawModel(g, kind, t, e) {
  const w = 280, hh = 170; g.clearRect(0, 0, w, hh);
  const col = (a) => 'rgba(' + Math.round(lerp(170, 205, e)) + ',' + Math.round(lerp(160, 190, e)) + ',255,' + a + ')';
  g.lineWidth = 2.2; g.lineCap = 'round';
  if (kind === 'demucs') {
    // one mixed waveform on the left splits into three stems on the right
    const cols = ['#8C6CFF', '#FF7AC0', '#5BC8FF'];
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = cols[k]; g.globalAlpha = .45 + .55 * e; g.beginPath();
      for (let x = 10; x <= 270; x += 3) {
        const u = clamp((x - 90) / 100), yc = 85 + (k - 1) * 46 * E.io3(u);
        const amp = (x < 90 ? 22 : 12) * (.6 + .4 * Math.sin(x * .05 + t * 3 + k));
        const y = yc + amp * Math.sin(x * (.18 + k * .07) + t * (6 + k * 2));
        x === 10 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (kind === 'whisper') {
    // a waveform turns into lines of text
    g.strokeStyle = col(.9); g.beginPath();
    for (let x = 14; x <= 120; x += 6) { const a = 8 + 26 * Math.abs(Math.sin(x * .13 + t * 4)); g.moveTo(x, 85 - a); g.lineTo(x, 85 + a); }
    g.stroke();
    const p = (t * .6) % 1;
    for (let r = 0; r < 4; r++) {
      const len = [120, 96, 110, 70][r] * clamp(p * 4 - r + (e > .5 ? 1 : 0));
      g.fillStyle = col(.75); g.beginPath(); g.roundRect(146, 40 + r * 26, Math.max(4, len), 10, 5); g.fill();
    }
  } else if (kind === 'xclip') {
    // video frames with a detection box sliding across them
    for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(255,255,255,' + (.06 + .04 * k) + ')'; g.beginPath(); g.roundRect(14 + k * 64, 40, 58, 90, 8); g.fill(); }
    const bx = 14 + ((t * 40) % 200);
    g.strokeStyle = '#3DDC97'; g.lineWidth = 2.4; g.strokeRect(bx, 58, 44, 54);
    g.fillStyle = '#3DDC97'; g.beginPath(); g.roundRect(bx, 34, 60, 18, 5); g.fill();
  } else {
    // chat bubbles with tokens streaming in
    g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.roundRect(14, 28, 180, 46, 14); g.fill();
    g.fillStyle = 'rgba(140,108,255,.35)'; g.beginPath(); g.roundRect(86, 92, 180, 52, 14); g.fill();
    const n = Math.floor((t * 6) % 9);
    for (let i = 0; i < 9; i++) { g.fillStyle = i <= n ? col(.9) : 'rgba(255,255,255,.15)'; g.beginPath(); g.arc(104 + i * 18, 118, 4.2, 0, 7); g.fill(); }
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.roundRect(30 + i * 52, 46, 40, 10, 5); g.fill(); }
  }
}

// ---------- the film ----------
/**
 * Builds the whole film inside stage. takes: {name: [frame times]} for the real app captures.
 * Returns {render(t), dur, fps, cues}; render is idempotent and order-independent.
 */
export function build(stage, takes) {
  const world = stage.querySelector('#world');
  const cam = h('div', 'scene', world);
  const hud = stage.querySelector('#hud');
  const scenes = [];
  const cues = [];
  /** Adds a scene shown over [t0, t1]; make(root) builds it and returns update(t). */
  const scene = (t0, t1, make) => { const root = h('div', 'scene', cam); scenes.push({ t0, t1, root, update: make(root) }); };
  const cue = (t, name, gain = 1) => cues.push({ t, name, gain });

  // ===== 0.0-7.3  the seed, and the trends orbiting it =====
  scene(0, 7.4, root => {
    const ring = h('div', 'full', root);
    const clips = [['dance-street', 240], ['headphones', 210], ['night-phone', 180], ['dancer-neon', 240], ['city-night', 210], ['typing', 180]];
    const tiles = clips.map(([n, c], i) => { const el = h('div', 'tile', ring); S(el, { width: '250px', height: '330px' }); return { el, seq: new Seq(el, 'frames/' + n, c, 'cover'), i }; });
    const kick = txt(h('div', 'kick abs', root, 'RnD to Startup 2026'), 'kick');
    S(kick, { width: '600px', textAlign: 'center' });
    const l1 = line(root, [['Mọi', 2.36], ['trào', 2.8], ['lưu', 2.94], ['tỷ', 3.16], ['view', 3.32], ['của', 3.52], ['Gen', 3.7], ['Z', 3.96]], { x: 260, y: 130, w: 1400, size: 64 });
    const l2 = line(root, [['đều', 4.18], ['bắt', 4.56], ['đầu', 4.8], ['từ', 4.94], ['một', 5.12], ['thứ', 5.44], ['gần', 5.68], ['như', 5.92], ['vô', 6.14], ['hình', 6.38]], { x: 360, y: 790, w: 1200, size: 60 });
    return t => {
      vis(kick, win(t, .5, 2.3, .8, .5), 0); at(kick, CX, 640, 600, 40, { y: -10 * ramp(t, .5, 2.3) });
      l1.update(t, 4.45); l2.update(t, 6.75);
      const rot = 18 + t * 11;                                   // the ring turns at 11 deg/s
      const gather = ramp(t, 4.5, 6.0, E.io5);                   // tiles fall into the seed
      const R = lerp(600, 0, gather);
      for (const q of tiles) {
        const ph = (rot + q.i * 60) * Math.PI / 180;
        const z = R * (Math.cos(ph) - 1) * .9, x = R * Math.sin(ph), y = 25 * Math.sin(ph * 2 + t * .6);
        const pr = 1800 / (1800 - z);                          // manual perspective, so tiles always face the camera
        const a = ramp(t, 2.2 + q.i * .09, 3.0 + q.i * .09, E.o3) * (1 - ramp(t, 5.3, 6.0)) * (.45 + .55 * pr);
        const s = pr * lerp(.72, 1, ramp(t, 2.2 + q.i * .09, 3.2 + q.i * .09, E.crit)) * lerp(1, .06, gather);
        vis(q.el, a, (1 - ramp(t, 2.2 + q.i * .09, 3.0 + q.i * .09)) * 10 + gather * 6, { zIndex: String(Math.round(1000 + z)) });
        at(q.el, CX + x * pr, CY + y * pr, 250, 330, { s });
        if (a > .002) q.seq.at(t - 2.2);
      }
    };
  });

  // ===== 0.3-12.5  the morph object: seed -> audio pill -> Threads comment -> trending row =====
  // the stock behind the morph lives in its own (lower) scene, so the morph can sit above the phone that follows
  scene(6.7, 12.3, root => {
    const bgA = h('div', 'full', root), bgB = h('div', 'full', root);
    const night = new Seq(bgA, 'frames/night-phone', 180, 'cover'), typing = new Seq(bgB, 'frames/typing', 180, 'cover');
    const shade = h('div', 'full', root); S(shade, { background: 'linear-gradient(180deg, rgba(5,5,7,.55), rgba(5,5,7,.25) 45%, rgba(5,5,7,.8))' });
    return t => {
      vis(bgA, .55 * win(t, 6.8, 9.9, .8, .7), 12 * (1 - ramp(t, 6.8, 7.6)));
      if (t > 6.7 && t < 10) { night.at(t - 6.8); S(night.img, { transform: 'scale(' + lerp(1.04, 1.12, ramp(t, 6.8, 10, E.lin)) + ')' }); }
      vis(bgB, .5 * win(t, 9.3, 12.2, .8, .8), 10 * (1 - ramp(t, 9.3, 10.1)));
      if (t > 9.2 && t < 12.3) { typing.at(t - 9.3); S(typing.img, { transform: 'scale(' + lerp(1.04, 1.12, ramp(t, 9.3, 12.3, E.lin)) + ')' }); }
      vis(shade, win(t, 6.8, 12.2, .8, .8), 0);
    };
  });
  scene(.3, 12.45, root => {
    S(root, { zIndex: '5' });
    const seed = h('div', 'dot', root);
    const M = h('div', 'morph', root);
    const pill = audioPill(M);
    const th = threadsCard(M, { text: 'ủa “chill phết” là trend mới hả? sao cả group mình nói câu này suốt' });
    const row = trendRow(M, 1, '“chill phết”', 'Âm thanh · Threads', 'row layer');
    S(row.el, { left: '0px', background: 'transparent' });
    const moon = txt(h('div', 'tag', root, 'Âm thanh 3 giây · 00:12'), 'moon'); S(moon, { '--c': '#FFB547' });
    const l1 = line(root, [['Một', 7.08], ['đoạn', 7.2], ['âm', 7.36], ['thanh', 7.6], ['3', 7.78], ['giây', 8.0], ['lúc', 8.22], ['nửa', 8.36], ['đêm', 8.62]], { x: 260, y: 300, w: 1400, size: 58 });
    const l2 = line(root, [['hay', 9.28], ['một', 9.34], ['câu', 9.56], ['bình', 9.74], ['luận', 9.88], ['ngách', 10.06], ['trên', 10.28], ['Threads', 10.5]], { x: 260, y: 250, w: 1400, size: 58 });
    const box = [
      [6.45, { x: CX, y: CY, w: 22, h: 22, r: 11 }], [7.25, { x: CX, y: 560, w: 560, h: 120, r: 60 }], [9.3, { x: CX, y: 560, w: 560, h: 120, r: 60 }],
      [10.05, { x: CX, y: 580, w: 780, h: 262, r: 30 }], [11.5, { x: CX, y: 580, w: 780, h: 262, r: 30 }], [12.35, { x: 1260, y: 342, w: 392, h: 104, r: 18 }],
    ];
    return t => {
      // the seed glows from the start and is the first state of the morph
      const sd = win(t, .4, 7.0, 1.2, .3) * (1 + .12 * Math.sin(t * 3.1));
      vis(seed, Math.min(1, sd), 0); at(seed, CX, CY, 0, 0, { s: lerp(.6, 1.25, ramp(t, 4.6, 6.4)) * (1 + .1 * Math.sin(t * 3.1)) });
      // the morph box and its three faces
      const b = track(box, t, E.io3);
      const on = t >= 6.45 && t < 12.4;
      vis(M, on ? clamp((t - 6.45) / .15) : 0, 0, { width: b.w.toFixed(1) + 'px', height: b.h.toFixed(1) + 'px', borderRadius: b.r.toFixed(1) + 'px', transform: tf({ x: b.x - b.w / 2, y: b.y - b.h / 2 }) });
      // faces overlap their fades, so the box is never seen empty mid-morph
      const fp = win(t, 6.75, 9.65, .3, .35), ft = win(t, 9.5, 12.05, .4, .3), fr = ramp(t, 11.9, 12.25);
      vis(pill.el, fp, (1 - fp) * 8, { transform: tf({ x: (b.w - 560) / 2, y: (b.h - 120) / 2 }) });
      vis(th, ft, (1 - ft) * 8, { transform: tf({ x: (b.w - 780) / 2, y: (b.h - 262) / 2 }) });
      vis(row.el, fr, (1 - fr) * 6, { transform: tf({ x: (b.w - 392) / 2, y: (b.h - 104) / 2 }) });
      if (fp > 0) pill.update(t);
      vis(moon, win(t, 8.22, 9.25, .4, .3), 0); at(moon, CX, 690, 300, 44, { y: 10 * (1 - ramp(t, 8.22, 8.8, E.o3)) });
      l1.update(t, 8.85); l2.update(t, 11.3);
    };
  });
  cue(6.55, 'glide', .7); cue(9.55, 'glide', .6); cue(12.0, 'tap', .8);

  // ===== 11.2-18.6  the trending tab, the agencies, game over =====
  scene(11.2, 18.6, root => {
    const grp = h('div', 'full', root);
    const phone = h('div', 'phone', grp);
    h('div', 'island', phone);
    h('div', 'hdr', phone, '<b>Thịnh hành</b><div class="tabs"><span>Dành cho bạn</span><span class="on">Thịnh hành</span><span>Âm thanh</span></div>');
    const r0 = trendRow(phone, 1, '“chill phết”', 'Âm thanh · Threads');
    const others = [['#outfitdihoc', 'Chủ đề · TikTok'], ['Âm thanh: lofi 2AM', 'Âm thanh · TikTok'], ['“đỉnh nóc kịch trần”', 'Tiếng lóng · Threads'], ['#review1phut', 'Chủ đề · Reels'], ['#morningroutine', 'Chủ đề · TikTok']].map(([a, b], i) => trendRow(phone, i + 2, a, b));
    const ads = [['agency-laptop', 210, 'Thương hiệu A'], ['dance-street', 240, 'Thương hiệu B'], ['headphones', 210, 'Thương hiệu C']].map(([n, c, brand]) => {
      const el = h('div', 'card ad', grp);
      const ph = h('div', 'ph', el); const seq = new Seq(ph, 'frames/' + n, c, 'cover');
      h('div', 'sp', el, 'Được tài trợ'); txt(h('div', 'br', el, brand), 'brand');
      h('div', 'chip', el, svg('note') + 'chill phết');
      return { el, seq };
    });
    const l1 = line(root, [['Khi', 11.46], ['nó', 11.64], ['lên', 11.84], ['tab', 12.0], ['Thịnh', 12.22], ['hành', 12.42]], { x: 150, y: 430, w: 800, size: 64, align: 'left' });
    const l1b = line(root, [['để', 12.64], ['bạn', 12.84], ['nhìn', 13.04], ['thấy', 13.3]], { x: 150, y: 520, w: 800, size: 64, align: 'left', cls: 'line' });
    S(l1b.el, { color: 'rgba(235,232,255,.6)' });
    const l2 = line(root, [['Các', 13.92], ['agency', 14.12], ['khác', 14.56], ['sử', 14.86], ['dụng', 15.12], ['trend', 15.44], ['vào', 15.84], ['sản', 16.18], ['phẩm', 16.4]], { x: 260, y: 110, w: 1400, size: 56 });
    const l3 = line(root, [['Cuộc', 17.06], ['chơi', 17.22], ['đã', 17.38], ['kết', 17.56], ['thúc.', 17.76]], { x: 360, y: 495, w: 1200, size: 76 });
    return t => {
      const pin = ramp(t, 11.2, 12.1, E.crit);
      const mv = ramp(t, 12.9, 14.7, E.io3);   // 1.8 s for 840 px: peak ~23 px/frame (it was 72)
      const pose = { x: lerp(0, -840, mv), y: lerp(120 * (1 - pin), 40, mv), s: lerp(1, .78, mv) };
      const sink = ramp(t, 16.95, 18.0, E.io3);
      S(grp, { transform: tf({ y: sink * 160, s: 1 - .06 * sink }), filter: sink > .01 ? 'grayscale(' + sink.toFixed(2) + ') brightness(' + (1 - .5 * sink).toFixed(2) + ')' : 'none' });
      vis(grp, 1 - ramp(t, 16.95, 17.35), 0);
      vis(phone, pin, (1 - pin) * 12); at(phone, 1260, 540, 440, 900, pose);
      // the new row takes slot 1 at 12.35 (the morph lands on it); the others roll down one slot
      vis(r0.el, t >= 12.38 ? 1 : 0, 0); S(r0.el, { top: '190px' });
      const roll = ramp(t, 11.9, 12.45, E.io3);
      others.forEach((r, i) => { S(r.el, { top: (190 + (i + roll) * 118) + 'px' }); r.rk.textContent = String(i + 1 + (roll > .5 ? 1 : 0)); vis(r.el, 1 - ramp(t, 12.2, 12.45) * (i === 4 ? 1 : 0), 0); });
      ads.forEach((q, i) => {
        const t0 = [14.12, 14.86, 15.44][i], a = ramp(t, t0, t0 + .7, E.crit);
        vis(q.el, a, (1 - a) * 10); at(q.el, [880, 1225, 1570][i], 600, 300, 430, { y: 70 * (1 - a), s: lerp(.94, 1, a) });
        if (a > 0) q.seq.at(t - t0);
      });
      l1.update(t, 13.15); l1b.update(t, 13.15); l2.update(t, 16.85); l3.update(t, 18.15);
    };
  });
  cue(14.12, 'tap', .6); cue(14.86, 'tap', .6); cue(15.44, 'tap', .6); cue(16.95, 'glide_down', .7);

  // ===== 18.3-24.4  the tsunami, then the first ripple =====
  scene(18.3, 24.4, root => {
    const a = h('div', 'full', root), b = h('div', 'full', root);
    const waves = new Seq(a, 'frames/waves', 180, 'cover'), water = new Seq(b, 'frames/water', 180, 'cover');
    const shade = h('div', 'full', root); S(shade, { background: 'radial-gradient(ellipse at 50% 45%, rgba(5,5,7,.25), rgba(5,5,7,.8))' });
    const [cv, g] = canvas(root, W, H, 'abs');
    const l1 = line(root, [['Làm', 19.14], ['sao', 19.28], ['để', 19.5], ['nhìn', 19.64], ['thấy', 19.8], ['cơn', 20.2], ['sóng', 20.54], ['thần…', 20.72]], { x: 260, y: 420, w: 1400, size: 68 });
    const l2 = line(root, [['…ngay', 21.18], ['từ', 21.42], ['lúc', 21.92], ['mặt', 22.12], ['nước', 22.32], ['vừa', 22.48], ['gợn?', 22.72]], { x: 260, y: 420, w: 1400, size: 68 });
    return t => {
      const fa = win(t, 18.3, 21.9, .9, .9), fb = win(t, 21.0, 24.2, .9, .8);
      vis(a, fa * .85, (1 - ramp(t, 18.3, 19.2)) * 18 + ramp(t, 21.0, 21.9) * 12);
      if (fa > 0) { waves.at((t - 18.3) * .8); S(waves.img, { transform: 'scale(' + lerp(1.05, 1.16, ramp(t, 18.3, 21.9, E.lin)) + ')' }); }
      vis(b, fb * .8, (1 - ramp(t, 21.0, 21.9)) * 12);
      if (fb > 0) { water.at(t - 21.0); S(water.img, { transform: 'scale(' + lerp(1.12, 1.04, ramp(t, 21.0, 24.2, E.lin)) + ')' }); }
      vis(shade, Math.max(fa, fb), 0);
      // ripple rings from the centre; at 23.3 they draw back into one point (the logo's seed)
      g.clearRect(0, 0, W, H);
      const back = ramp(t, 23.2, 24.1, E.io3);
      for (let k = 0; k < 5; k++) {
        const s0 = 21.5 + k * .55; if (t < s0) continue;
        const u = (t - s0) / 2.6; const r = lerp(10, 520, E.o3(clamp(u))) * (1 - back);
        const al = (1 - clamp(u)) * .55 * (1 - back * .6);
        if (al <= 0 || r < 1) continue;
        g.strokeStyle = 'rgba(200,190,255,' + al.toFixed(3) + ')'; g.lineWidth = 2; g.beginPath(); g.ellipse(CX, 700, r, r * .32, 0, 0, 7); g.stroke();
      }
      vis(cv, 1, 0);
      l1.update(t, 20.8); l2.update(t, 23.3);
    };
  });
  cue(18.35, 'swell', .6); cue(21.0, 'glide_down', .5);

  // ===== 23.9-30.4  TRENDIFEST: the ripple's point blooms into the mark =====
  scene(23.9, 30.5, root => {
    // The official mark is a wordmark (logo.svg, used as a mask so it takes the film's gradient). The ripple's
    // point stretches into a line of light, and the wordmark opens out of that line from the centre.
    const halo = h('div', 'halo', root);
    const beam = h('div', 'abs', root); S(beam, { width: '1000px', height: '4px', borderRadius: '2px', background: 'linear-gradient(90deg, rgba(160,140,255,0), #fff, rgba(160,140,255,0))', boxShadow: '0 0 24px 6px rgba(160,140,255,.6)' });
    const logo = txt(h('div', 'logo', root), 'logo'); S(logo, { width: '1000px', height: '628px' });
    const kick = line(root, [['Đó', 24.32], ['là', 24.82], ['lý', 25.14], ['do', 25.3]], { x: 560, y: 250, w: 800, size: 28, cls: 'line kick' });
    const sub = line(root, [['Hệ', 26.89], ['thống', 27.11], ['trinh', 27.25], ['sát', 27.5], ['&', 27.77], ['dự', 27.96], ['báo', 28.2], ['sớm', 28.48], ['xu', 28.84], ['hướng', 29.02], ['Gen', 29.2], ['Z', 29.34]], { x: 360, y: 700, w: 1200, size: 36, cls: 'line', weight: 400 });
    S(sub.el, { color: 'rgba(235,232,255,.75)' });
    return t => {
      const out = ramp(t, 29.7, 30.5, E.io3);
      const stretch = ramp(t, 23.95, 24.9, E.io3), open = ramp(t, 25.3, 26.3, E.io5);
      vis(beam, stretch * (1 - open) , 0); at(beam, CX, 485, 1000, 4, { s: 1 }); S(beam, { width: (1000 * stretch).toFixed(0) + 'px', transform: tf({ x: CX - 500 * stretch, y: 483 }) });
      vis(halo, Math.max(stretch * .5, open) * (1 - out) * (.85 + .15 * Math.sin(t * 1.7)), 0); at(halo, CX, 480, 1100, 1100, { s: lerp(.3, 1, stretch) });
      const ins = (50 * (1 - open)).toFixed(2);
      vis(logo, Math.min(1, open * 3) * (1 - out), (1 - open) * 6 + out * 14, { clipPath: 'inset(0 ' + ins + '% 0 ' + ins + '%)' });
      at(logo, CX, 500, 1000, 628, { s: (lerp(.96, 1, open) + .025 * ramp(t, 26, 29.7, E.lin)) * lerp(1, 1.1, out) });
      kick.update(t, 26.6); sub.update(t, 29.7);
    };
  });
  cue(24.32, 'chime', .5); cue(25.5, 'bloom', .5);

  // ===== 29.8-32.6  Access-first: three layers stack up, then fold flat into the model cards =====
  // The stack is a 3D group (its own perspective); its plates become the first three model cards.
  const cardX = i => CX + (i - 1.5) * 372, cardY = 590;
  scene(29.8, 32.7, root => {
    const persp = h('div', 'full', root); S(persp, { perspective: '1600px', perspectiveOrigin: '760px 560px' });
    const stack = h('div', 'full', persp); S(stack, { transformStyle: 'preserve-3d' });
    const labels = [['Access-first', 'Truy cập hợp lệ trước tiên'], ['API chính thức', 'Nguồn công khai, có cấp phép'], ['Luật 91/2025', 'Bảo vệ dữ liệu cá nhân']];
    const plates = labels.map(() => h('div', 'plate', stack));
    const calls = labels.map(([a, b]) => txt(h('div', 'callout', root, a + '<small>' + b + '</small>'), 'callout-' + a));
    const head = line(root, [['Ứng', 30.09], ['dụng', 30.23], ['kiến', 30.41], ['trúc', 30.59], ['Access-first', 30.8]], { x: 260, y: 130, w: 1400, size: 58 });
    return t => {
      const fold = ramp(t, 31.55, 32.55, E.io3);             // stack -> flat row of cards
      vis(root, 1 - ramp(t, 32.45, 32.7), 0);
      plates.forEach((p, i) => {
        const a = ramp(t, 29.95 + i * .25, 30.7 + i * .25, E.crit);
        const w = lerp(600, 330, fold), hh = lerp(380, 380, fold);
        // stacked pose: lying in an isometric plane, lifted by layer; flat pose: a card in the row
        const sx = lerp(760, cardX(i), fold), sy = lerp(560 - (2 - i) * 0 , cardY, fold);
        const z = lerp((2 - i) * 95 + 120 * (1 - a), 0, fold);
        S(p, { width: w + 'px', height: hh + 'px', transform: 'translate3d(' + (sx - w / 2).toFixed(1) + 'px,' + (sy - hh / 2).toFixed(1) + 'px,0) rotateX(' + lerp(58, 0, fold).toFixed(2) + 'deg) rotateZ(' + lerp(-38, 0, fold).toFixed(2) + 'deg) translateZ(' + z.toFixed(1) + 'px)',
          borderRadius: lerp(30, 28, fold) + 'px', background: fold > .01 ? 'linear-gradient(160deg, rgba(' + Math.round(lerp(140, 40, fold)) + ',' + Math.round(lerp(108, 38, fold)) + ',' + Math.round(lerp(255, 58, fold)) + ',' + lerp(.55, .92, fold).toFixed(2) + '), rgba(17,16,26,' + lerp(.35, .94, fold).toFixed(2) + '))' : '' });
        vis(p, a, (1 - a) * 8);
      });
      calls.forEach((c, i) => { const a = ramp(t, 30.5 + i * .25, 31.1 + i * .25, E.o3) * (1 - ramp(t, 31.4, 31.8)); vis(c, a, (1 - a) * 6); at(c, 1450, [370, 520, 670][i], 420, 80, { x: 30 * (1 - a) }); S(c, { width: '420px' }); });
      head.update(t, 31.5);
    };
  });

  // ===== 31.6-38.9  multimodal AI: four model cards, each lights on its name =====
  scene(31.6, 39.0, root => {
    const models = [['demucs', 'Demucs', 'Tách lớp âm thanh', 34.37], ['whisper', 'WhisperX', 'Giọng nói thành văn bản', 35.27], ['xclip', 'X-CLIP', 'Hiểu nội dung video', 36.51], ['llm', 'LLM', 'Ngữ cảnh và tiếng lóng', 37.45]];
    const cards = models.map(([k, name, desc, t0], i) => {
      const el = h('div', 'card model', root);
      const [cv, g] = canvas(el, 280, 170);
      txt(h('b', '', el, name), 'model-' + name); txt(h('span', '', el, desc), 'desc-' + name);
      return { el, g, k, t0, i };
    });
    const head = line(root, [['TRENDIFEST', 31.73], ['kết', 32.34], ['hợp', 32.61], ['AI', 32.84], ['đa', 33.27], ['phương', 33.47], ['thức', 33.63]], { x: 260, y: 160, w: 1400, size: 58 });
    return t => {
      const out = ramp(t, 38.1, 38.9, E.io3);
      const pan = ramp(t, 32.5, 38.5, E.lin);
      cards.forEach(c => {
        const born = ramp(t, 32.1 + c.i * .06, 32.7 + c.i * .06, E.o3);
        const lit = ramp(t, c.t0 - .1, c.t0 + .45, E.crit), dim = c.t0 > t ? .55 : 1;
        const e = lit * (1 - .4 * ramp(t, c.t0 + 1.2, c.t0 + 2)), a = born * lerp(.55, 1, Math.max(lit, t > c.t0 ? .85 : 0));
        // on the way out each card shrinks toward the graph's centre, where its node will appear
        const ox = lerp(cardX(c.i), CX + (c.i - 1.5) * 60, out), oy = lerp(cardY - 26 * e, 590, out);   // y 590 = the graph's 'Sự kiện' node, where the seed waits
        vis(c.el, a * (1 - ramp(t, 38.55, 38.95)), out * 10, { borderColor: 'rgba(190,175,255,' + (.11 + .5 * e).toFixed(2) + ')', boxShadow: '0 40px 90px rgba(0,0,0,.55), 0 0 ' + (60 * e).toFixed(0) + 'px rgba(140,108,255,' + (.45 * e).toFixed(2) + ')' });
        at(c.el, ox + lerp(-14, 14, pan), oy, 330, 380, { s: lerp(1, .2, out) * (1 + .03 * e) });
        if (a > .01) drawModel(c.g, c.k, t, Math.max(e, dim < 1 ? 0 : .35));
      });
      head.update(t, 38.0);
    };
  });
  cue(34.37, 'tap', .5); cue(35.27, 'tap', .5); cue(36.51, 'tap', .5); cue(37.45, 'tap', .5);

  // ===== 38.4-44.8  the cross-platform event graph =====
  scene(38.4, 44.9, root => {
    const [cv, g] = canvas(root, W, H, 'abs');
    // node layout (stage px around the centre); kinds appear on their spoken word, platforms on "liên nền tảng"
    const N = [
      { id: 'ev', x: 0, y: 30, t0: 41.5, r: 30, label: 'Sự kiện', big: true },
      { id: 'au', x: -380, y: -150, t0: 39.13, r: 18, label: 'Âm thanh' },
      { id: 'im', x: 380, y: -170, t0: 39.92, r: 18, label: 'Hình ảnh' },
      { id: 'sl', x: 40, y: 300, t0: 40.73, r: 18, label: 'Tiếng lóng' },
      { id: 'tt', x: -690, y: 110, t0: 42.53, r: 13, label: 'TikTok' },
      { id: 'th', x: 700, y: 90, t0: 42.65, r: 13, label: 'Threads' },
      { id: 'fb', x: -470, y: 310, t0: 42.77, r: 13, label: 'Facebook' },
      { id: 'yt', x: 520, y: 320, t0: 42.89, r: 13, label: 'YouTube' },
      { id: 'vz', x: -600, y: -260, t0: 43.01, r: 13, label: 'VOZ' },
      { id: 'np', x: 640, y: -270, t0: 43.13, r: 13, label: 'Báo chí' },
    ];
    const ix = Object.fromEntries(N.map(n => [n.id, n]));
    const L = [['au', 'ev'], ['im', 'ev'], ['sl', 'ev'], ['tt', 'au'], ['tt', 'sl'], ['th', 'sl'], ['th', 'im'], ['fb', 'im'], ['fb', 'au'], ['yt', 'im'], ['vz', 'sl'], ['np', 'ev'], ['vz', 'au'], ['yt', 'sl']];
    for (const n of N) { n.el = txt(h('div', 'gl' + (n.big ? ' big' : ''), root, n.label), 'node-' + n.id); }
    // background dust: small dots that drift, so the graph sits in a field
    const dust = Array.from({ length: 90 }, (_, i) => ({ x: (hash(i) - .5) * 2000, y: (hash(i + 99) - .5) * 1100, r: 1 + 2 * hash(i + 7) }));
    const head = line(root, [['Đồ', 41.7], ['thị', 41.89], ['sự', 42.05], ['kiện', 42.28], ['liên', 42.53], ['nền', 42.78], ['tảng', 42.87]], { x: 260, y: 96, w: 1400, size: 58 });
    return t => {
      const out = ramp(t, 43.9, 44.85, E.io3);
      const rot = lerp(-.06, .06, ramp(t, 38.4, 44.9, E.lin)), sc = lerp(.96, 1.06, ramp(t, 38.4, 44.9, E.lin)) * lerp(1, 1.5, out);
      const P = n => { const c = Math.cos(rot), s = Math.sin(rot); return [CX + (n.x * c - n.y * s * .9) * sc, 560 + (n.x * s * .5 + n.y * c) * sc]; };
      const alpha = 1 - out;
      g.clearRect(0, 0, W, H);
      for (const d of dust) { const [x, y] = P(d); g.fillStyle = 'rgba(200,190,255,' + (.18 * alpha * ramp(t, 38.4, 39.2)).toFixed(3) + ')'; g.beginPath(); g.arc(x, y, d.r, 0, 7); g.fill(); }
      // edges draw from their later node, as a curve with a moving pulse
      for (const [a, b] of L) {
        const na = ix[a], nb = ix[b], t0 = Math.max(na.t0, nb.t0), u = ramp(t, t0, t0 + .6, E.io3);
        if (u <= 0) continue;
        const [x1, y1] = P(na), [x2, y2] = P(nb), mx = (x1 + x2) / 2 + (y2 - y1) * .15, my = (y1 + y2) / 2 - (x2 - x1) * .15;
        g.strokeStyle = 'rgba(170,150,255,' + (.5 * alpha).toFixed(3) + ')'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x1, y1);
        const steps = 30;
        for (let k = 1; k <= steps * u; k++) { const v = k / steps; g.lineTo((1 - v) ** 2 * x1 + 2 * (1 - v) * v * mx + v * v * x2, (1 - v) ** 2 * y1 + 2 * (1 - v) * v * my + v * v * y2); }
        g.stroke();
        if (u >= 1) { const v = ((t - t0) * .5 + hash(x1)) % 1; g.fillStyle = 'rgba(255,255,255,' + (.8 * alpha).toFixed(3) + ')'; g.beginPath(); g.arc((1 - v) ** 2 * x1 + 2 * (1 - v) * v * mx + v * v * x2, (1 - v) ** 2 * y1 + 2 * (1 - v) * v * my + v * v * y2, 2.6, 0, 7); g.fill(); }
      }
      // the seed: the model cards collapse into a point at the centre (38.1-38.95); it stays there, breathing,
      // until the "Sự kiện" node blooms out of it, so the frame is never empty between the two scenes
      const sd = ramp(t, 38.5, 38.95, E.o3) * (1 - ramp(t, 41.4, 41.9));
      if (sd > 0) {
        const [x, y] = P(ix.ev), r = 7 * (1 + .12 * Math.sin(t * 3.2));
        const gr = g.createRadialGradient(x, y, 0, x, y, 70);
        gr.addColorStop(0, 'rgba(170,150,255,' + (.5 * sd).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(170,150,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, 70, 0, 7); g.fill();
        g.fillStyle = 'rgba(235,230,255,' + sd.toFixed(3) + ')'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      for (const n of N) {
        const a = ramp(t, n.t0 - .1, n.t0 + .5, E.crit) * alpha;
        const [x, y] = P(n);
        if (a > 0) {
          const gr = g.createRadialGradient(x, y, 0, x, y, n.r * 3.2);
          gr.addColorStop(0, 'rgba(160,140,255,' + (.55 * a).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(160,140,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, n.r * 3.2, 0, 7); g.fill();
          g.fillStyle = n.big ? 'rgba(255,255,255,' + a + ')' : 'rgba(220,212,255,' + a + ')'; g.beginPath(); g.arc(x, y, n.r * lerp(.4, 1, a), 0, 7); g.fill();
        }
        const lw = n.el.offsetWidth || 120;
        const la = a * (1 - ramp(t, 43.85, 44.25));   // labels leave before the zoom-out carries them off frame
        vis(n.el, la, (1 - a) * 6); at(n.el, x, y + n.r + 34, lw, 48, { y: 10 * (1 - a) });
      }
      vis(cv, 1, 0);
      head.update(t, 43.9);
    };
  });
  cue(41.5, 'bloom', .5); cue(42.53, 'glide', .4);

  // ===== 43.9-55.9  the Analyst Console (real app), the board, and the burst-probability windows =====
  scene(43.9, 56.0, root => {
    const wn = appWindow(root, takes, ['graph', 'board']);
    const tag = line(root, [['Analyst', 46.22], ['Console', 46.64]], { x: 150, y: 80, w: 900, size: 46, align: 'left' });
    const head2 = line(root, [['Đo', 49.04], ['gia', 49.48], ['tốc', 49.7], ['lan', 49.88], ['truyền', 50.12]], { x: 150, y: 80, w: 900, size: 46, align: 'left' });
    // the chart card: an illustrative acceleration curve and the 6 / 12 / 24 h burst windows (no numbers)
    const ch = h('div', 'card chart', root);
    txt(h('div', 'tt', ch, 'Xác suất bùng nổ'), 'chart-title'); txt(h('div', 'st', ch, 'Gia tốc lan truyền · cửa sổ dự báo'), 'chart-sub');
    ch.insertAdjacentHTML('beforeend', '<svg class="plot" viewBox="0 0 420 330"><defs><linearGradient id="cg" x1="0" x2="1"><stop offset="0" stop-color="#5B8CFF"/><stop offset="1" stop-color="#FF7AC0"/></linearGradient>' +
      '<linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(140,108,255,.35)"/><stop offset="1" stop-color="rgba(140,108,255,0)"/></linearGradient></defs>' +
      '<path d="M10 300 H410" stroke="rgba(255,255,255,.12)" stroke-width="1.5"/><path class="fillp" d="M10 300 C 120 296, 190 270, 250 210 S 360 60, 410 30 L410 300 Z" fill="url(#cf)"/>' +
      '<path class="curve" d="M10 300 C 120 296, 190 270, 250 210 S 360 60, 410 30" stroke="url(#cg)" stroke-width="5" fill="none" stroke-linecap="round"/><circle class="head" r="9" fill="#fff"/></svg>');
    const curve = ch.querySelector('.curve'), fillp = ch.querySelector('.fillp'), headDot = ch.querySelector('.head');
    const clen = curve.getTotalLength();
    const cols = [['6 giờ', 52.58, .42], ['12 giờ', 53.32, .66], ['24 giờ', 54.12, .9]].map(([lab, t0, v], i) => {
      const c = h('div', 'wcol', ch); S(c, { left: (452 + i * 96) + 'px' });
      const bk = h('div', 'bk', c), fl = h('div', 'fl', bk); txt(h('b', '', c, lab), 'win-' + lab);
      return { c, fl, t0, v };
    });
    return t => {
      // window: flies in from depth while the graph above dissolves into it, then sits back for the chart
      const inn = ramp(t, 43.9, 45.1, E.crit), back = ramp(t, 50.9, 51.9, E.io3), out = ramp(t, 55.0, 55.95, E.io3);
      const ws = lerp(.5, .88, inn) * lerp(1, .7, back) * lerp(1, .85, out);
      vis(wn.el, inn * (1 - out), (1 - inn) * 14 + back * 1.5 + out * 10);
      at(wn.el, lerp(CX, 1120, back) + lerp(10, -10, ramp(t, 45, 51, E.lin)), lerp(598, 580, back), 1520, 950, { s: ws, ry: lerp(-6, 0, inn) + lerp(0, -8, back) });
      // inside the window: the graph take, then the board take; slow push-ins on the part being described
      const gA = 1 - ramp(t, 47.2, 47.7);
      wn.show('graph', .3 + (t - 44.2) * .9, gA, { s: lerp(1, 1.18, ramp(t, 44.2, 47.6, E.io3)), x: lerp(0, -150, ramp(t, 44.2, 47.6, E.io3)), y: lerp(0, -80, ramp(t, 44.2, 47.6, E.io3)) });
      const bt = t - 47.3, z1 = ramp(t, 47.6, 49.4, E.io3), z2 = ramp(t, 50.2, 51.6, E.io3);
      wn.show('board', bt, ramp(t, 47.2, 47.7), { s: lerp(1, 1.45, z1) * lerp(1, 1.04, z2), x: lerp(0, -260, z1) + lerp(0, -420, z2), y: lerp(0, -90, z1) });
      tag.update(t, 48.7); head2.update(t, 50.9);
      // chart card in front
      const ca = ramp(t, 51.0, 51.9, E.crit);
      vis(ch, ca * (1 - out), (1 - ca) * 10 + out * 8); at(ch, lerp(760, 700, ca), 600, 760, 470, { y: 40 * (1 - ca), s: lerp(.92, 1, ca) * lerp(1, .9, out) });
      const cu = ramp(t, 51.3, 52.5, E.io3);
      S(curve, { strokeDasharray: clen.toFixed(1), strokeDashoffset: (clen * (1 - cu)).toFixed(1) }); S(fillp, { opacity: cu.toFixed(3) });
      const p = curve.getPointAtLength(clen * cu); headDot.setAttribute('cx', p.x.toFixed(1)); headDot.setAttribute('cy', p.y.toFixed(1));
      cols.forEach(c => { const u = ramp(t, c.t0 - .05, c.t0 + .7, E.crit); S(c.fl, { height: (250 * c.v * u).toFixed(1) + 'px' }); vis(c.c, ramp(t, c.t0 - .25, c.t0 + .2), 0); });
    };
  });
  cue(44.0, 'glide', .6); cue(51.0, 'glide', .5); cue(52.58, 'tap', .5); cue(53.32, 'tap', .5); cue(54.12, 'tap', .5);

  // ===== 55.3-61.0  the signal leaves its niche: TikTok -> Threads =====
  // The Threads card here is the same component as the opening's comment, so the film rhymes with its hook.
  const TT = { x: 560, y: 590 }, THC = { x: 1330, y: 560 };
  scene(55.3, 61.2, root => {
    const ring = h('div', 'abs', root); S(ring, { width: '760px', height: '760px', borderRadius: '50%', border: '2px dashed rgba(190,175,255,.35)' });
    const tk = tiktokCard(root, 'frames/dancer-neon', 240);
    const thw = h('div', 'card', root); S(thw, { width: '780px', height: '262px' });
    const th = threadsCard(thw, { user: 'ngach.genz', time: 'vừa xong', text: 'nghe “chill phết” trên TikTok cả tuần, giờ sang Threads ai cũng dùng luôn rồi', likes: '2,1K', replies: '310', reposts: '96' });
    S(th, { position: 'absolute', left: '0', top: '0' });
    const pT = txt(h('div', 'tag', root, 'TikTok · ngách nhảy'), 'pill-tt'); S(pT, { '--c': '#FF5CA8' });
    const pH = txt(h('div', 'tag', root, 'Threads · cộng đồng'), 'pill-th'); S(pH, { '--c': '#5B8CFF' });
    const [cv, g] = canvas(root, W, H, 'abs');
    const head = line(root, [['Tín', 56.1], ['hiệu', 56.3], ['vượt', 56.92], ['biên', 57.36], ['ngách', 57.64]], { x: 260, y: 84, w: 1400, size: 56 });
    // the signal's path: from the TikTok card, out through the dashed niche boundary, into the Threads card
    const P0 = [TT.x + 120, TT.y - 160], P1 = [880, 250], P2 = [THC.x - 300, THC.y - 60];
    const bez = v => [(1 - v) ** 2 * P0[0] + 2 * (1 - v) * v * P1[0] + v * v * P2[0], (1 - v) ** 2 * P0[1] + 2 * (1 - v) * v * P1[1] + v * v * P2[1]];
    return t => {
      const a = ramp(t, 55.3, 56.1, E.crit), out = ramp(t, 59.75, 60.7, E.io3);
      vis(tk.el, a * (1 - ramp(t, 60.15, 60.75)), (1 - a) * 10 + out * 6); at(tk.el, lerp(TT.x, CX - 200, out), lerp(TT.y, 560, out), 360, 640, { y: 50 * (1 - a), s: lerp(.9, 1, a) * lerp(1, .3, out) });
      if (a > 0) tk.seq.at(t - 55.3);
      const ra = ramp(t, 55.7, 56.5, E.o3) * (1 - out);
      vis(ring, ra * .9, 0); at(ring, TT.x, TT.y, 760, 760, { s: lerp(.85, 1, ra), rz: t * 6 });
      vis(pT, a * (1 - out), 0); at(pT, TT.x, TT.y - 360, 300, 44);
      const tha = ramp(t, 58.55, 59.3, E.crit);
      vis(thw, tha * (1 - ramp(t, 60.2, 60.8)), (1 - tha) * 10 + out * 4); at(thw, lerp(THC.x, CX, out), lerp(THC.y, 560, out), 780, 262, { s: lerp(.9, 1, tha) * (1 + .04 * Math.exp(-Math.max(0, t - 59.0) * 4) * (t > 59 ? 1 : 0)) * lerp(1, 1.1, out) });
      vis(pH, tha * (1 - out), 0); at(pH, THC.x, THC.y - 190, 300, 44);
      // the moving signal and its trail
      g.clearRect(0, 0, W, H);
      const mv = ramp(t, 56.3, 58.6, E.io3), born = ramp(t, 56.0, 56.4);
      if (born > 0 && out < 1) {
        for (let k = 0; k < 40; k++) {
          const v = mv - k * .012; if (v < 0) break;
          const [x, y] = bez(v); g.fillStyle = 'rgba(200,185,255,' + ((1 - k / 40) * .5 * (1 - out)).toFixed(3) + ')'; g.beginPath(); g.arc(x, y, 6 * (1 - k / 40) + 1, 0, 7); g.fill();
        }
        const [x, y] = bez(mv);
        const gr = g.createRadialGradient(x, y, 0, x, y, 46); gr.addColorStop(0, 'rgba(255,255,255,' + (born * (1 - out)).toFixed(3) + ')'); gr.addColorStop(.25, 'rgba(160,140,255,' + (.6 * born * (1 - out)).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(160,140,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, 46, 0, 7); g.fill();
        // the crossing: a soft ring where the signal passes the niche boundary
        const cr = ramp(t, 56.92, 57.9, E.o3);
        if (cr > 0 && cr < 1) { const [cx, cy] = bez(.32); g.strokeStyle = 'rgba(255,190,240,' + (.7 * (1 - cr)).toFixed(3) + ')'; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, 20 + 90 * cr, 0, 7); g.stroke(); }
      }
      vis(cv, 1, 0);
      head.update(t, 59.6);
    };
  });
  cue(56.3, 'glide', .5); cue(56.92, 'bloom', .35); cue(58.64, 'tap', .6);

  // ===== 59.8-67.4  the early-warning card builds row by row =====
  scene(59.8, 71.6, root => {
    const el = h('div', 'card alert', root);
    const hd = h('div', 'hd', el, '<div class="pulse"></div><b>Thẻ cảnh báo sớm</b><div class="auto">Tạo tự động</div>');
    txt(hd.querySelector('b'), 'alert-title');
    txt(h('div', 'sub', el, '“chill phết” · TikTok → Threads · vượt biên ngách'), 'alert-sub');
    const mk = (y, ico, title, sub) => { const r = h('div', 'arow', el); S(r, { top: y + 'px' }); h('div', 'ai', r, svg(ico)); txt(h('b', '', r, title), 'row-' + title); txt(h('span', '', r, sub), 'rowsub-' + title); return r; };
    const r1 = mk(150, 'wave', 'Vân tay âm thanh', 'Khớp cùng một đoạn âm thanh gốc');
    const r2 = mk(298, 'shield', 'An toàn thương hiệu', 'Mức rủi ro nội dung');
    const r3 = mk(446, 'link', 'Nguồn gốc', 'Trích dẫn kèm liên kết bài gốc');
    const [fc, fg] = canvas(r1, 420, 80);
    const segs = [0, 1, 2, 3, 4].map(i => { const s = h('div', 'seg', r2); S(s, { left: (400 + i * 86) + 'px' }); return s; });
    const segLab = txt(h('div', 'callout', r2, 'Thấp'), 'risk'); S(segLab, { left: '0px', top: '0px', fontSize: '22px' });
    const srcs = ['vnexpress.net', 'voz.vn', 'tuoitre.vn'].map((s, i) => { const c = h('div', 'src', r3, svg('link') + s); S(c, { left: [390, 600, 730][i] + 'px' }); txt(c, 'src-' + s); return c; });
    const stamp = h('div', 'stamp', root, svg('check') + 'Đã xác thực'); txt(stamp, 'stamp');
    return t => {
      const a = ramp(t, 60.55, 61.35, E.crit);   // after the two cards have converged and mostly faded (60.2-60.8)
      const side = ramp(t, 66.4, 67.3, E.io3);
      const gone = ramp(t, 71.05, 71.5);   // hands over to the report, which grows from the same spot
      // the card grows with its rows (header only, 160 px, then +148 px per row, 640 px once all three are in), so
      // it never sits as an empty box waiting for its first row; it stays centred on y 560 while it grows
      const ru = [[r1, 62.38], [r2, 63.7], [r3, 65.22]].map(([r, t0]) => { const u = ramp(t, t0 - .25, t0 + .45, E.crit); vis(r, u, (1 - u) * 6); S(r, { transform: 'translateY(' + (24 * (1 - u)).toFixed(1) + 'px)' }); return u; });
      const hh = 160 + 148 * ru[0] + 148 * ru[1] + 184 * ru[2];
      S(el, { height: hh.toFixed(1) + 'px' });
      vis(el, a * (1 - gone), (1 - a) * 10 + gone * 6); at(el, lerp(CX, 470, side), 560, 1000, hh, { s: lerp(.86, 1, a) * lerp(1, .46, side) });
      // audio fingerprint: a constellation of peaks, written left to right as it is computed
      fg.clearRect(0, 0, 420, 80);
      const fu = ramp(t, 62.4, 63.6, E.io3);
      for (let i = 0; i < 64; i++) {
        if (i / 56 > fu || i >= 56) break;
        for (let k = 0; k < 4; k++) { if (hash(i * 7 + k) < .55) continue; fg.fillStyle = 'rgba(' + (k % 2 ? '255,122,192' : '170,150,255') + ',' + (.5 + .5 * hash(i + k * 31)).toFixed(2) + ')'; fg.fillRect(i * 7.4, 8 + k * 17, 5.4, 11); }
      }
      segs.forEach((s, i) => { const u = ramp(t, 63.9 + i * .12, 64.2 + i * .12); S(s, { background: i < 4 ? 'rgba(61,220,151,' + (.07 + .6 * u).toFixed(2) + ')' : 'rgba(255,255,255,.07)' }); });
      vis(segLab, ramp(t, 64.3, 64.7), 0); S(segLab, { transform: 'translate(840px,46px)' });
      srcs.forEach((c, i) => { const u = ramp(t, 65.3 + i * .18, 65.8 + i * .18, E.crit); vis(c, u, (1 - u) * 4); S(c, { transform: 'translateY(' + (16 * (1 - u)).toFixed(1) + 'px)' }); });
      // Human-in-the-loop sign-off: the reviewer's check lands on the card (69.52 "xác thực")
      const sa = ramp(t, 69.45, 69.95, E.crit);
      vis(stamp, sa * (1 - ramp(t, 71.0, 71.4)), (1 - sa) * 6); at(stamp, 470, 340, 250, 62, { s: lerp(1.3, 1, sa) });
    };
  });
  cue(59.85, 'glide', .5); cue(62.38, 'tap', .45); cue(63.7, 'tap', .45); cue(65.22, 'tap', .45); cue(69.52, 'bloom', .5);

  // ===== 66.3-71.8  Human-in-the-loop: the reviewer opens the real grouping review =====
  scene(66.3, 71.9, root => {
    const wn = appWindow(root, takes, ['review', 'evidence']);
    const kick = line(root, [['Chuyên', 67.46], ['viên', 67.64], ['kiểm', 67.82], ['duyệt', 68.02]], { x: 820, y: 96, w: 980, size: 28, align: 'left', cls: 'line kick' });
    const head = line(root, [['Human-in-the-loop', 68.4]], { x: 820, y: 136, w: 980, size: 52, align: 'left' });
    const head2 = line(root, [['Xác', 69.52], ['thực', 69.9], ['nhanh', 70.2]], { x: 820, y: 136, w: 980, size: 52, align: 'left' });
    return t => {
      const a = ramp(t, 66.4, 67.4, E.crit), out = ramp(t, 71.0, 71.85, E.io3);
      vis(wn.el, a * (1 - out), (1 - a) * 12 + out * 10);
      at(wn.el, 1240, 610, 1520, 950, { s: lerp(.5, .66, a) * lerp(1, .9, out), x: 80 * (1 - a), ry: lerp(-10, -4, a) });
      // The review take plays at 1.6x so it reaches the opened merge / split controls (take 4.4 s = film 69.35)
      // and holds there; at 70.1 the evidence take (the source-linked timeline) shows what was verified.
      // Zoom 1.55 with x -850 keeps the whole inspector column inside the 1520 px viewport.
      const z = ramp(t, 67.0, 68.4, E.io3);
      wn.show('review', (t - 66.6) * 1.6, 1 - ramp(t, 70.0, 70.35), { s: lerp(1, 1.55, z), x: lerp(0, -850, z), y: lerp(0, -110, z) });
      wn.show('evidence', 1.9 + (t - 70.0), ramp(t, 70.0, 70.35), { s: 1.55, x: -850, y: lerp(-110, -250, ramp(t, 70.2, 71.6, E.io3)) });
      kick.update(t, 69.2); head.update(t, 69.2); head2.update(t, 70.8);
    };
  });
  cue(66.45, 'glide', .5);

  // ===== 71.0-75.9  the report, exported and sent with one click =====
  scene(71.0, 76.0, root => {
    const doc = h('div', 'doc', root);
    txt(h('div', 'dh', doc, 'Báo cáo xu hướng'), 'doc-title'); txt(h('div', 'dm', doc, 'TRENDIFEST · “chill phết” · đã xác thực'), 'doc-meta');
    doc.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 388 150"><path d="M0 140 C 90 136, 150 120, 210 90 S 320 20, 388 10" stroke="#7B5CFF" stroke-width="4" fill="none"/><path d="M0 140 H388" stroke="#D8D5E6"/></svg>');
    [[310, 330], [340, 290], [370, 360], [420, 250], [450, 340], [480, 300], [530, 220]].forEach(([y, w]) => { const i = h('i', '', doc); S(i, { top: y + 'px', width: w + 'px' }); });
    const btn = h('div', 'btn', root, svg('doc') + 'Xuất báo cáo'); txt(btn, 'btn');
    const cur = h('div', 'cursor', root, '<svg width="34" height="44" viewBox="0 0 26 34"><path d="M2 2 L2 27 L8.5 21 L13 31.5 L17.5 29.5 L13 19.5 L22 19.5 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>');
    const ripple = h('div', 'abs', root); S(ripple, { width: '120px', height: '120px', borderRadius: '50%', border: '2px solid rgba(200,185,255,.9)' });
    const toast = h('div', 'toast', root, '<div class="ck">' + svg('check') + '</div>Đã gửi báo cáo cho khách hàng'); txt(toast, 'toast');
    const head = line(root, [['Xuất', 71.3], ['báo', 71.48], ['cáo', 71.72], ['gửi', 71.88], ['khách', 72.08], ['hàng', 72.22]], { x: 260, y: 110, w: 1400, size: 54 });
    const head2 = line(root, [['chỉ', 72.58], ['với', 72.96], ['một', 73.28], ['cú', 73.5], ['nhấp', 73.62], ['chuột', 73.82]], { x: 260, y: 110, w: 1400, size: 54 });
    const BX = 1260, BY = 600;
    return t => {
      const a = ramp(t, 71.1, 72.0, E.crit), fly = ramp(t, 73.75, 74.6, E.io3), out = ramp(t, 75.1, 75.95, E.io3);
      // the document grows out of the verified card's place (left), then flies to the client
      vis(doc, a * (1 - ramp(t, 74.35, 74.65)), (1 - a) * 10);
      at(doc, lerp(lerp(470, 720, a), 1500, fly), lerp(560, 300, fly), 460, 600, { s: lerp(.5, 1, a) * lerp(1, .25, fly), rz: lerp(-4, 0, a) });
      const ba = ramp(t, 71.9, 72.6, E.crit), press = ramp(t, 73.55, 73.66) * (1 - ramp(t, 73.7, 73.95));
      vis(btn, ba * (1 - out), (1 - ba) * 8 + out * 8); at(btn, BX, BY, 340, 92, { s: lerp(.9, 1, ba) * (1 - .06 * press), y: 20 * (1 - ba) });
      // the pointer glides in from the lower right and clicks on "nhấp" (73.62)
      const m = ramp(t, 72.45, 73.5, E.io3);
      vis(cur, ramp(t, 72.4, 72.7) * (1 - ramp(t, 74.6, 75.0)), 0);
      at(cur, lerp(1700, BX + 40, m), lerp(960, BY + 22, m), 34, 44, { s: 1 - .1 * press, x: 17, y: 22 });
      const rp = ramp(t, 73.62, 74.3, E.o3);
      vis(ripple, rp > 0 && rp < 1 ? 1 - rp : 0, 0); at(ripple, BX + 20, BY + 10, 120, 120, { s: lerp(.3, 2.2, rp) });
      const ta = ramp(t, 74.25, 74.8, E.crit);
      vis(toast, ta * (1 - out), (1 - ta) * 8 + out * 8); at(toast, 1260, 430, 520, 84, { y: -30 * (1 - ta) });
      head.update(t, 72.25); head2.update(t, 75.1);
    };
  });
  cue(73.62, 'click', .9); cue(74.25, 'bloom', .5); cue(73.8, 'glide', .4);

  // ===== 75.4-81.2  the team =====
  scene(75.4, 81.3, root => {
    const people = [['Trần Thị Hạnh Nguyên', 'Nhóm trưởng · Chiến lược', 'HN', '#8C6CFF'], ['Ngô Quốc Hoàng Trung', 'Nghiên cứu & phân tích dữ liệu', 'HT', '#5B8CFF'], ['Lê Minh Trí', 'Mô hình học máy & dự báo', 'MT', '#FF7AC0'], ['Phạm Thanh Minh', 'Hạ tầng & phát triển phần mềm', 'TM', '#3DDC97']];
    const kick = line(root, [['Được', 76.06], ['phát', 76.5], ['triển', 76.72], ['bởi', 77.0]], { x: 560, y: 250, w: 800, size: 28, cls: 'line kick' });
    const cards = people.map(([n, r, ini, c], i) => {
      const el = h('div', 'card person', root);
      const av = h('div', 'av', el, ini); S(av, { background: 'linear-gradient(135deg,' + c + ', rgba(255,255,255,.15))' });
      txt(h('b', '', el, n), 'name-' + i); txt(h('span', '', el, r), 'role-' + i);
      return el;
    });
    const l1 = line(root, [['Sinh', 77.4], ['viên', 77.7], ['Công', 77.92], ['nghệ', 78.1], ['Thông', 78.26], ['tin', 78.46]], { x: 360, y: 700, w: 1200, size: 40 });
    const l2 = line(root, [['Trường', 78.76], ['Đại', 79.06], ['học', 79.24], ['Bách', 79.4], ['khoa', 79.64], ['–', 79.8], ['Đại', 79.86], ['học', 79.9], ['Đà', 79.94], ['Nẵng', 79.96]], { x: 260, y: 770, w: 1400, size: 34, cls: 'line', weight: 400 });
    S(l2.el, { color: 'rgba(235,232,255,.7)' });
    return t => {
      const out = ramp(t, 80.4, 81.25, E.io3);
      cards.forEach((el, i) => {
        const a = ramp(t, 76.45 + i * .22, 77.3 + i * .22, E.crit);
        vis(el, a * (1 - out), (1 - a) * 10 + out * 8);
        at(el, CX + (i - 1.5) * 412 + 160 * (1 - a), 470, 390, 210, { s: lerp(.92, 1, a), ry: -25 * (1 - a), y: -30 * out });
      });
      kick.update(t, 80.4); l1.update(t, 80.4); l2.update(t, 80.4);
    };
  });

  // ===== 80.5-89.6  what it changes: three pillars, then everything gathers into the mark =====
  scene(80.5, 89.7, root => {
    const brand = line(root, [['TRENDIFEST', 80.74]], { x: 560, y: 190, w: 800, size: 30, cls: 'line kick' });
    const items = [
      ['clock', [['Giải', 81.58], ['phóng', 81.78], ['hàng', 82.06], ['giờ', 82.24], ['săn', 82.44], ['trend', 82.64], ['thủ', 83.32], ['công', 83.5]], 81.5],
      ['data', [['Biến', 84.32], ['dữ', 84.6], ['liệu', 84.8], ['văn', 85.04], ['hóa', 85.24], ['Gen', 85.42], ['Z', 85.6]], 84.2],
      ['edge', [['thành', 85.94], ['lợi', 86.32], ['thế', 86.52], ['cạnh', 86.7], ['tranh', 86.88], ['an', 87.06], ['toàn', 87.32], ['và', 87.68], ['đo', 87.92], ['lường', 88.06], ['được', 88.22]], 85.85],
    ];
    const P = items.map(([k, words, t0], i) => {
      const el = h('div', 'card pillar', root);
      const [cv, g] = canvas(el, 96, 96);
      const l = new Line(el, words, 'line'); l.el.dataset.text = 'pillar-' + k;
      S(l.el, { left: '32px', top: '150px', width: '390px', fontSize: '30px', textAlign: 'left' });
      return { el, g, k, l, t0, i };
    });
    const draw = (g, k, t, e) => {
      g.clearRect(0, 0, 96, 96); g.lineWidth = 3; g.lineCap = 'round'; g.strokeStyle = 'rgba(207,196,255,.95)';
      if (k === 'clock') {
        g.beginPath(); g.arc(48, 48, 38, 0, 7); g.stroke();
        const sp = 1 - ramp(t, 82.2, 83.6, E.o3);          // hours spin by, then the hands rest
        const ah = -1.5 + t * 6 * sp + 1.2, am = -1.5 + t * 30 * sp + 3.1;
        g.beginPath(); g.moveTo(48, 48); g.lineTo(48 + 20 * Math.cos(ah), 48 + 20 * Math.sin(ah)); g.moveTo(48, 48); g.lineTo(48 + 30 * Math.cos(am), 48 + 30 * Math.sin(am)); g.stroke();
      } else if (k === 'data') {
        for (let i = 0; i < 14; i++) {                    // scattered points gather into a grid
          const u = ramp(t, 84.4 + i * .04, 85.3 + i * .04, E.io3);
          const x = lerp(10 + 76 * hash(i), 18 + (i % 4) * 20, u), y = lerp(10 + 76 * hash(i + 40), 22 + Math.floor(i / 4) * 18, u);
          g.fillStyle = i % 3 ? 'rgba(207,196,255,.95)' : 'rgba(255,122,192,.95)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
        }
      } else {
        const u = ramp(t, 86.0, 87.4, E.io3);              // a rising line under a shield
        g.beginPath(); g.moveTo(48, 10); g.lineTo(82, 22); g.lineTo(82, 48); g.quadraticCurveTo(80, 78, 48, 88); g.quadraticCurveTo(16, 78, 14, 48); g.lineTo(14, 22); g.closePath(); g.stroke();
        g.strokeStyle = '#3DDC97'; g.beginPath(); g.moveTo(26, 64);
        for (let x = 26; x <= 26 + 44 * u; x += 2) g.lineTo(x, 64 - (x - 26) * .7 - 4 * Math.sin((x - 26) * .3)); g.stroke();
      }
    };
    return t => {
      const gather = ramp(t, 88.55, 89.5, E.io5);
      P.forEach(p => {
        const a = ramp(t, p.t0 - .05, p.t0 + .7, E.crit);
        vis(p.el, a * (1 - gather), (1 - a) * 10 + gather * 12);
        at(p.el, lerp(CX + (p.i - 1) * 490, CX, gather), lerp(570, 420, gather), 450, 330, { y: 40 * (1 - a), s: lerp(.94, 1, a) * lerp(1, .1, gather) });
        if (a > 0) { draw(p.g, p.k, t, a); p.l.update(t, 1e9); }
      });
      brand.update(t, 88.55);
    };
  });

  // ===== 89.2-96.0  the end card =====
  scene(89.2, 96.01, root => {
    const halo = h('div', 'halo', root);
    const logo = txt(h('div', 'logo', root), 'end-logo'); S(logo, { width: '840px', height: '527px' });
    const tag = line(root, [['Dẫn', 89.98], ['đầu', 90.2], ['xu', 90.44], ['hướng', 90.6], ['bằng', 90.98], ['dữ', 91.22], ['liệu', 91.4], ['có', 91.62], ['căn', 91.84], ['cứ.', 92.0]], { x: 360, y: 590, w: 1200, size: 40, cls: 'line', weight: 400 });
    S(tag.el, { color: 'rgba(240,238,255,.85)' });
    const small = txt(h('div', 'small', root, 'RnD to Startup 2026 · Trường Đại học Bách khoa – Đại học Đà Nẵng'), 'end-small');
    const mail = txt(h('div', 'small', root, 'hanhnguyen17122006@gmail.com'), 'end-mail'); S(mail, { fontFamily: 'JBM', fontSize: '20px' });
    let sw = 0, mw = 0;
    return t => {
      // the pillars' gathering point (89.5) opens into the mark, on the piece's final chord (89.47)
      const a = ramp(t, 89.35, 90.5, E.crit), end = ramp(t, 95.2, 96.0, E.io3);
      vis(halo, a * (1 - end) * .8, 0); at(halo, CX, 410, 1000, 1000, { s: lerp(.3, 1, a) });
      const ins = (50 * (1 - a)).toFixed(2);
      vis(logo, Math.min(1, a * 3) * (1 - end), (1 - a) * 8, { clipPath: 'inset(0 ' + ins + '% 0 ' + ins + '%)' });
      at(logo, CX, 420, 840, 527, { s: lerp(.94, 1, a) + .02 * ramp(t, 90, 96, E.lin) });
      if (!sw) { sw = small.offsetWidth; mw = mail.offsetWidth; }
      tag.update(t, 95.2);
      const sa = ramp(t, 92.7, 93.4) * (1 - end), ma = ramp(t, 93.2, 93.9) * (1 - end);
      vis(small, sa, 0); at(small, CX, 880, sw, 30); vis(mail, ma, 0); at(mail, CX, 928, mw, 28);
    };
  });
  cue(89.47, 'chime', .7);

  // ===== the corner tag: what is real and what is illustration =====
  const tReal = txt(h('div', 'tag', hud, 'Bản chạy thực tế'), 'tag-real'); S(tReal, { '--c': '#3DDC97' });
  const tIll = txt(h('div', 'tag', hud, 'Minh họa'), 'tag-ill');
  const REAL = [[44.6, 50.9], [66.7, 71.0]], ILL = [[9.6, 17.0], [30.0, 43.8], [51.2, 66.5], [71.4, 75.2]];
  const band = (t, spans) => Math.max(0, ...spans.map(([a, b]) => win(t, a, b, .4, .4)));

  // ===== background: a slow aurora on a small canvas (cheap to redraw every frame, scaled up smooth) =====
  const bg = stage.querySelector('#bg'), bx = bg.getContext('2d');
  S(bg, { width: W + 'px', height: H + 'px' });
  const blobs = [[.25, .3, .55, '120,90,255'], [.78, .35, .5, '60,110,255'], [.6, .85, .45, '200,80,220'], [.15, .85, .4, '40,170,200']];
  // brightness of the aurora through the film: low under footage, fuller under the product and the mark
  const glow = [[0, .25], [2, .55], [6.5, .3], [18, .15], [24, .7], [30, .55], [44, .45], [56, .55], [75, .6], [89, .8], [96, .3]];
  function aurora(t) {
    bx.globalCompositeOperation = 'source-over'; bx.fillStyle = '#050507'; bx.fillRect(0, 0, 480, 270);
    bx.globalCompositeOperation = 'lighter';
    const k = track(glow, t, E.io3);
    blobs.forEach(([x, y, r, c], i) => {
      const px = (x + .08 * Math.sin(t * .11 + i * 1.7)) * 480, py = (y + .07 * Math.cos(t * .09 + i * 2.3)) * 270, rr = r * 480 * (1 + .08 * Math.sin(t * .2 + i));
      const gr = bx.createRadialGradient(px, py, 0, px, py, rr);
      gr.addColorStop(0, 'rgba(' + c + ',' + (.32 * k).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)');
      bx.fillStyle = gr; bx.fillRect(0, 0, 480, 270);
    });
  }

  return {
    dur: DUR, fps: FPS, cues,
    render(t) {
      aurora(t);
      // the camera never parks: a slow drift and breathing scale under every scene (pure in t)
      S(cam, { transform: 'translate3d(' + (20 * Math.sin(t * .23) + 7 * Math.sin(t * .51 + 1)).toFixed(2) + 'px,' + (12 * Math.sin(t * .19 + .7)).toFixed(2) + 'px,0) rotateY(' + (1.1 * Math.sin(t * .17)).toFixed(3) + 'deg) rotateX(' + (.5 * Math.sin(t * .13 + 2)).toFixed(3) + 'deg) scale(' + (1.01 + .01 * Math.sin(t * .21 + .4)).toFixed(4) + ')' });
      for (const s of scenes) {
        const on = t >= s.t0 && t <= s.t1;
        S(s.root, { display: on ? '' : 'none' });
        if (on) s.update(t);
      }
      vis(tReal, band(t, REAL), 0); at(tReal, 1690, 994, 230, 40);
      vis(tIll, band(t, ILL), 0); at(tIll, 1730, 994, 150, 40);
    },
  };
}
