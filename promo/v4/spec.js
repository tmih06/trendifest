// spec.js: TRENDIFEST V4, a 96-second kinetic promo for RnD To Startup 2026.
// Picture follows the supplied voice-over (s1-s4.m4a, played back to back in order from 1.5 s); the bed is
// Vivaldi "Summer" RV 315 III. Presto (Modena Chamber Orchestra, Musopen, public domain mark), edited so its
// final chord lands on the spoken "TRENDIFEST" logo hit at 89.47 s (tools/build_audio.py owns that clock).
// Every time below is written in film SECONDS from the narration's word onsets (captions.js) and converted
// to engine beats with S(); the beat is only the engine's unit here (137.2 BPM, the recording's measured pulse).
import { Words, Hero } from './blocks.js';
import { Ripple, EventGraph, Screen, Curve, Hop, Card, Click, Team, Marks, TypeLine, EndCard } from './custom.js';
import CAPS from './captions.js';

const BPM = 137.2;
/** Seconds to beats (the engine's unit). */
const S = sec => +(sec * BPM / 60).toFixed(4);
/** A gap in seconds expressed in beats, for the Words options that are relative (second, noteAt). */
const G = sec => +(sec * BPM / 60).toFixed(4);

export default {
  title: 'TRENDIFEST V4',
  bpm: BPM, beats: S(96), fps: 30,   // 30 fps delivery (user's call); motion blur still samples sub-frames
  palette: { bg: '#0B0A14', paper: '#F4F0E8', accent: '#8C6CFF', hot: '#D4FF3A', ink: '#110E1C' },
  hud: 'TRENDIFEST  ·  RnD TO STARTUP 2026', hudOut: [S(88.6), S(89.2)],
  logo: 'logo.svg',
  // the voice is the lead: mix.py (tools) ducks this bed under it; gain is the bed level before ducking
  music: { file: 'audio/music.wav', offset: 0, gain: -4 },
  voice: { file: 'audio/voice.wav' },
  sounds: {},
  cues: [],
  scenes: [
    // s1: the problem. One idea per spoken phrase, colour flips on every turn.
    [Words, 0, S(18.36), { charge: true, shots: [
      { at: S(2.36), style: 'punch3d', text: 'MỌI TRÀO LƯU', fx: 'punch', big: true },
      { at: S(3.16), style: 'slam', text: 'TỶ VIEW', ground: 'accent' },
      { at: S(3.70), style: 'cut', text: 'GEN Z', size: 640, color: 'hot', rgb: true, fx: 'beat' },
      { at: S(4.18), style: 'stack', text: ['ĐỀU BẮT ĐẦU', 'TỪ MỘT THỨ'], second: G(5.12 - 4.18), ground: 'paper', in: 'whipX', fx: 'none' },
      { at: S(5.68), style: 'split', text: ['GẦN NHƯ', 'VÔ HÌNH'], second: G(6.14 - 5.68), glitch: G(.9), in: 'whipY' },
      { at: S(7.08), style: 'split', text: ['ÂM THANH', '3 GIÂY'], second: G(7.78 - 7.08), note: 'lúc nửa đêm · 00:00:03', noteAt: G(8.22 - 7.08), fx: 'punch' },
      { at: S(9.28), style: 'stack', text: ['MỘT CÂU BÌNH LUẬN', 'NGÁCH'], second: G(10.06 - 9.28), kickerSize: 130, ground: 'paper', in: 'whipX' },
      { at: S(10.46), style: 'cut', text: 'THREADS', size: 520, color: 'accent', fx: 'beat' },
      { at: S(11.46), style: 'pair', text: ['KHI NÓ LÊN TAB', 'THỊNH HÀNH'], second: G(12.22 - 11.46), size: 250, in: 'whipY' },
      { at: S(12.80), style: 'cut', text: 'BẠN NHÌN THẤY', ground: 'paper', size: 260, fx: 'beat' },
      { at: S(13.90), style: 'cut', text: 'CÁC AGENCY KHÁC', size: 240, rot: -3, fx: 'beat' },
      { at: S(14.84), style: 'cut', text: 'SỬ DỤNG TREND', ground: 'accent', size: 250, rot: 3, fx: 'beat' },
      { at: S(15.82), style: 'cut', text: 'VÀO SẢN PHẨM', ground: 'paper', size: 270, fx: 'beat' },
      { at: S(17.04), style: 'stack', text: ['CUỘC CHƠI', 'ĐÃ KẾT THÚC.'], second: G(17.56 - 17.04), size: 380, fx: 'punch', big: true },
    ] }],
    [TypeLine, S(.15), S(2.34), { text: 'RnD TO STARTUP 2026  ·  TRENDIFEST', from: .25, to: 1.5, y: 650, color: 'paper' }],
    // the turn: a tsunami of engraved water that calms to one ripple, then folds into a point
    [Ripple, S(18.36), S(24.30), {
      items: [
        { t: 18.42, end: 19.10, text: 'VẬY…', mono: true, size: 44, y: -40 },
        { t: 19.12, end: 20.18, text: 'LÀM SAO ĐỂ NHÌN THẤY', size: 150, wdth: 118, y: -150 },
        { t: 20.18, end: 21.15, text: 'CƠN SÓNG THẦN', size: 300, ride: true, big: true, y: -120 },
        { t: 21.16, end: 22.10, text: 'NGAY TỪ LÚC', size: 180, y: -170 },
        { t: 22.10, end: 22.70, text: 'MẶT NƯỚC', size: 260, y: -170 },
        { t: 22.70, end: 23.62, text: 'VỪA GỢN.', size: 280, color: 'accent', y: -170 },
      ],
      wave: [20.1, 21.0], calm: [21.1, 22.2], drop: 22.72, collapse: [23.25, 23.62] }],
    // s2: the answer. The title lands on the spoken name.
    [Hero, S(24.30), S(29.10), { kicker: 'ĐÓ LÀ LÝ DO', title: 'TRENDIFEST', sub: 'hệ thống trinh sát & dự báo sớm xu hướng Gen Z', landZoom: 1.6 }],
    [Words, S(29.10), S(38.20), { shots: [
      { at: S(29.10), style: 'cut', text: 'GEN Z', size: 560, color: 'hot', fx: 'beat', in: 'whipY' },
      { at: S(30.05), style: 'split', text: ['KIẾN TRÚC', 'ACCESS-FIRST'], second: G(30.80 - 30.05), note: 'API chính thức · Luật 91/2025', noteAt: G(31.25 - 30.05), in: 'whipX' },
      { at: S(31.70), style: 'stack', text: ['TRENDIFEST KẾT HỢP', 'AI'], second: G(32.84 - 31.70), ground: 'paper', size: 620, in: 'whipY' },
      { at: S(33.25), style: 'slam', text: 'ĐA PHƯƠNG THỨC', ground: 'accent', size: 300 },
      { at: S(34.28), style: 'split', text: ['MÔ HÌNH 01', 'DEMUCS'], second: G(.09), note: 'tách lớp âm thanh', noteAt: G(.4), in: 'whipX' },
      { at: S(35.18), style: 'split', text: ['MÔ HÌNH 02', 'WHISPERX'], second: G(.09), note: 'giọng nói → văn bản', noteAt: G(.4), ground: 'paper', in: 'whipXr' },
      { at: S(36.42), style: 'split', text: ['MÔ HÌNH 03', 'X-CLIP'], second: G(.09), note: 'hiểu khung hình video', noteAt: G(.4), in: 'whipX' },
      { at: S(37.36), style: 'split', text: ['MÔ HÌNH 04', 'LLM'], second: G(.09), note: 'ngữ cảnh & tiếng lóng', noteAt: G(.4), ground: 'accent', color: 'ink', in: 'whipY' },
    ] }],
    [EventGraph, S(38.20), S(44.20), { t: { link: 38.28, audio: 39.13, image: 39.92, slang: 40.73, graph: 41.50, platforms: 42.53 }, whipOut: [1650, 0, .12, 2] }],
    // s3: the product. Real captures are labelled as such; illustrations carry an R&D tag.
    [Screen, S(44.20), S(47.45), { dir: 'frames/graph', count: 125, from: .3, scale: .86, url: 'trendifest  ·  analyst console  ·  đồ thị xu hướng', chip: '●  BẢN CHẠY THỰC TẾ',
      focus: [[44.2, 1, .5, .5], [45.7, 1, .5, .5], [46.4, 1.35, .45, .48]],
      words: [[44.98, 46.20, 'KHÔNG GIAN LÀM VIỆC', { size: 120, y: 975 }], [46.22, 47.45, 'ANALYST CONSOLE', { size: 190, y: 965, color: 'accent', big: true }]] }],
    [Curve, S(47.45), S(55.55), { t: { model: 47.62, accel: 49.48, prob: 51.10, window: 52.20, w6: 52.58, w12: 53.32, w24: 54.12, ahead: 54.46 } }],
    [Hop, S(55.55), S(59.75), { t: { signal: 55.62, move: 56.46, cross: 56.92, tiktok: 58.14, threads: 58.64 } }],
    [Card, S(59.75), S(66.45), { t: { make: 60.30, card: 60.90, fp: 62.38, safe: 63.70, src: 65.22 }, sources: ['vnexpress.net', 'voz.vn', 'tuoitre.vn'], whipOut: [0, 1150, .13] }],
    [Screen, S(66.45), S(69.45), { dir: 'frames/evidence', count: 175, from: 2.6, scale: .86, url: 'trendifest  ·  bảng chủ đề  ·  bằng chứng', chip: '●  BẢN CHẠY THỰC TẾ',
      focus: [[66.45, 1, .5, .5], [67.5, 1, .5, .5], [68.2, 1.6, .8, .45]],
      words: [[67.46, 68.38, 'CHUYÊN VIÊN KIỂM DUYỆT', { size: 120, y: 975 }], [68.40, 69.45, 'HUMAN-IN-THE-LOOP', { size: 170, y: 965, color: 'accent', big: true }]] }],
    [Words, S(69.45), S(72.50), { shots: [
      { at: S(69.50), style: 'slam', text: 'XÁC THỰC', ground: 'paper', size: 400 },
      { at: S(70.18), style: 'cut', text: 'NHANH.', color: 'accent', size: 600, rgb: true, fx: 'beat' },
      { at: S(71.28), style: 'cut', text: 'XUẤT BÁO CÁO', ground: 'accent', size: 260, rot: -3, fx: 'beat' },
      { at: S(71.86), style: 'cut', text: 'GỬI KHÁCH HÀNG', ground: 'paper', size: 250, rot: 2, fx: 'beat' },
    ] }],
    [Click, S(72.50), S(75.50), { words: [['CHỈ VỚI', 72.58, 0], ['MỘT', 73.28, 0], ['CÚ', 73.50, 1], ['NHẤP', 73.62, 1], ['CHUỘT.', 73.82, 1]], press: 73.62 }],
    // s4: who built it, what it changes, the name.
    [Team, S(75.50), S(80.62), { ground: 'paper', kickAt: 76.06, at: [76.55, 77.15, 77.75, 78.35], whipIn: [0, 1150, .13], whipOut: [0, -1150, .13],
      people: [['Trần Thị Hạnh Nguyên', 'Nhóm trưởng · Chiến lược'], ['Ngô Quốc Hoàng Trung', 'Nghiên cứu & phân tích dữ liệu'], ['Lê Minh Trí', 'Mô hình học máy & dự báo'], ['Phạm Thanh Minh', 'Hạ tầng & phát triển phần mềm']],
      lines: [['NHÓM SINH VIÊN CÔNG NGHỆ THÔNG TIN', 77.26, 78.50], ['TRƯỜNG ĐẠI HỌC BÁCH KHOA – ĐẠI HỌC ĐÀ NẴNG', 78.76, 80.00]] }],
    [Words, S(80.62), S(89.30), { shots: [
      { at: S(80.70), style: 'punch3d', text: 'TRENDIFEST', size: 280, fx: 'punch' },
      { at: S(81.08), style: 'split', text: ['KHÔNG CHỈ', 'GIẢI PHÓNG'], second: G(81.58 - 81.08), in: 'whipX' },
      { at: S(82.04), style: 'stack', text: ['HÀNG GIỜ', 'SĂN TREND'], second: G(82.44 - 82.04), ground: 'paper', in: 'whipY' },
      { at: S(83.30), style: 'cut', text: 'THỦ CÔNG', size: 440, stroke: 4, fx: 'beat' },
      { at: S(83.84), style: 'pair', text: ['MÀ CÒN BIẾN', 'DỮ LIỆU'], second: G(84.60 - 83.84), in: 'whipY' },
      { at: S(85.02), style: 'stack', text: ['VĂN HÓA', 'GEN Z'], second: G(85.42 - 85.02), ground: 'accent' },
      { at: S(85.92), style: 'split', text: ['THÀNH', 'LỢI THẾ CẠNH TRANH'], second: G(86.32 - 85.92), fx: 'punch', big: true, in: 'whipX' },
      { at: S(87.04), style: 'cut', text: 'AN TOÀN', ground: 'paper', size: 440, fx: 'beat' },
      { at: S(87.90), style: 'cut', text: 'ĐO LƯỜNG ĐƯỢC.', ground: 'accent', size: 230, fx: 'beat' },
    ], exit: { type: 'collapse', at: S(88.62), end: S(89.22) } }],
    // after the Words block it shares a span with, so that block keeps the camera
    [Marks, S(83.30), S(83.84), { slashes: [{ t0: 83.62, x1: 380, y1: 640, x2: 1540, y2: 430 }] }],
    [EndCard, S(89.30), S(96), { hit: 89.47, sheenAt: 93.7, smallAt: 92.7, contactAt: 93.2,
      words: [['Dẫn đầu', 89.98], ['xu hướng', 90.44], ['bằng', 90.98], ['dữ liệu', 91.22], ['có', 91.62], ['căn cứ.', 91.84]],
      small: 'RnD TO STARTUP 2026  ·  ĐẠI HỌC BÁCH KHOA – ĐẠI HỌC ĐÀ NẴNG', contact: 'hanhnguyen17122006@gmail.com' }],
  ],
  captions: CAPS.map(([a, b, ws]) => [S(a), S(b), ws.map(([w, t]) => [w, S(t)])]),
};
