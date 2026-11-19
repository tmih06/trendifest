# TRENDIFEST — RnD To Startup 2026

## V5 — smooth motion-graphics promo (current)

[Play V5](v5/out/final/trendifest-v5_1080p30.mp4) (master) · [lite copy](v5/out/final/trendifest-v5_1080p30_lite.mp4) for sharing — 96 s, 1920 × 1080 at 30 fps. The same four voice-over files play once, in order (s1 → s4 from 0:01.5). V5 answers the V4 review: less and smaller type (one short line at a time, inside title-safe), no shakes, flashes or whip pans, objects that morph into the next object under a slowly drifting camera, real app usage, stock footage, and a slower score.

- **Story by component:** a glowing seed with an orbit of trend clips → the seed morphs into an audio pill (“3 giây lúc nửa đêm”) → a Threads comment card → a row on a phone's *Thịnh hành* tab → agency ad tiles → the tsunami and the first ripple → the wordmark opens out of a line of light → Access-first layers fold into four model cards (Demucs, WhisperX, X-CLIP, LLM) → the cross-platform event graph → the **real Analyst Console** (graph, ranked board) → the 6 / 12 / 24 h burst-window chart → a TikTok card's signal crosses its niche boundary into a Threads card → both merge into the early-warning card (audio fingerprint, brand safety, sources) → the **real grouping review and evidence timeline** (Human-in-the-loop) → the report exports with one click → team → three closing pillars → end card.
- **Honesty tags:** drawn mock-ups carry “Minh họa”; the real captures carry “Bản chạy thực tế”. Account names, comment text and counts on the Threads/TikTok mock-ups are illustrative; the chart shows no numbers.
- **Real app footage:** `v5/tools/capture.mjs` drives the locally running app (`PROMO_APP_URL`, default `http://127.0.0.1:8787`) read-only — navigate, pan, zoom, hover, open panels; it never saves a watch or submits a merge/split — and records CDP screencast frames at 2× (1280 × 760 layout, 2560 × 1520 JPEG) into `v5/takes/`.
- **Stock footage** (all [Mixkit free license](https://mixkit.co/license/#videoFree), no watermark, no attribution required), saved in `media/v5/stock/` from `https://assets.mixkit.co/videos/<id>/<id>-1080.mp4`: night-phone 39789, headphones 4842, typing 4915, dance-street 51295, agency-laptop 4916, waves 5016, dancer-neon 33906, city-night 40640. Also reused from V2 (Pexels license): `media/water.mp4`. Stock actors illustrate audiences, never the team.
- **Music:** Debussy, *Suite bergamasque* III “Clair de lune” — Laurens Goedhart, piano (2011), [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg), public domain. Save as `media/v5/clair-de-lune-goedhart.ogg`, then `ffmpeg -i media/v5/clair-de-lune-goedhart.ogg -ar 48000 -ac 2 media/v5/clair.wav`. Three pieces of the one recording, joined only in the pianist's own breaths (no time-stretch): the opening under the hook, the flowing *Un poco mosso* from the product reveal (0:24.3), and the piece's final chord under the end card (0:89.47). Details in `v5/tools/build_audio.py`.
- **Type:** Be Vietnam Pro (OFL, drawn for Vietnamese) and JetBrains Mono, in `v5/fonts/`.
- **Rebuild** (from `promo/v5`; Python with numpy + opencv-python-headless, Node + Playwright, FFmpeg):
  1. `python3 tools/build_audio.py` — music edit, voice track, soft UI sound kit into `audio/`.
  2. `sh tools/frames.sh` — stock clips to 30 fps JPEG sequences in `frames/`.
  3. `node tools/capture.mjs` — real app takes (with the app running).
  4. `python3 -m http.server 5678`, then `FILM_URL=http://127.0.0.1:5678/ node tools/audit.mjs` — fails on any text outside title-safe or overlapping other text (sampled every 0.1 s).
  5. `BLOOM=.3 GRAIN=.8 ENC="-c:v libx264 -crf 15 -preset slow -level 4.2 -threads 6" python3 tools/kf/render.py . --res 1080` — video only, `out/video_1080.mp4` (motion blur from 5 sub-frames per frame).
  6. `python3 tools/mix.py` — `out/mix.wav`, −14 LUFS, −1 dBTP, the piano ducked under the voice.
  7. `python3 tools/smooth.py out/final/trendifest-v5_1080p30.mp4` (optional) — whole-frame shift, jerk and brightness jumps; compare against V4 to check the cut stays calm.
  8. `python3 tools/finish.py` — the **optimize step**: muxes the master, encodes the lite copy (x264 CRF 22, AAC 160 kb/s, faststart) and checks both (full decode, frames, loudness, SSIM lite vs master) into `out/final/report.json`.
- Preview: serve `promo/v5` and open `/index.html` (space plays silently, arrows step 1 s, `?t=40` seeks).
- Engine: `v5/engine.js` (easing, keyframe tracks, frame sequences, word-timed lines), `v5/film.js` (every scene and component), `v5/main.js` (the renderer contract). `tools/kf/` is V4's copy of the kinetic-film scripts; V5 adds a `BLOOM` knob to `post.py`, drops a motion-blur sub-sample whose brightness strays from the frame's others (a rare headless capture glitch: one grey, ghosted frame at 44.1 s in an earlier render), and serves the film's files to Chrome from disk (`FILM_DIR`, set by `render.py`): on this WSL2 machine about a third of parallel loopback HTTP responses stalled 3.1 s, which had made every frame with several pictures wait. Set `FILM_DIR` yourself when running `snap.mjs` or `audit.mjs`.

## V4 — kinetic promo

[Play V4](v4/out/final/trendifest-v4_1080p30.mp4) — 96 s, 1920 × 1080 at 30 fps. All four supplied voice-over files play once, in order (s1 → s4, back to back from 0:01.5), and every on-screen word lands on the spoken word (faster-whisper onsets aligned to the script, `v4/captions.js`). Built with the kinetic-film engine: every frame is a pure function of time, rendered with real motion blur, bloom and grain.

- **Music:** Vivaldi, *Summer* RV 315, III. Presto — The Modena Chamber Orchestra, via [Musopen on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:The_Modena_Chamber_Orchestra_-_Vivaldi%27s_Summer,_RV_315_-_III._Presto.ogg) (Public Domain Mark). Save it as `media/vivaldi-summer-presto.ogg` and convert: `ffmpeg -i media/vivaldi-summer-presto.ogg -ar 48000 media/vivaldi.wav`. The edit plays the recording from its first attack, then splices (chroma + onset match, 40 ms crossfade) into the finale at 0:78.7 so the final chord lands on the spoken "TRENDIFEST" logo hit at 0:89.47. Natural tempo throughout, no time-stretch. The bed ducks 15 dB under the voice.
- **Sound effects:** synthesized deterministically in `v4/tools/build_audio.py` (no paid generation, no stock SFX).
- **Real product footage:** `graph.webm` and `evidence.webm` captures appear once each, at 1×, labelled "BẢN CHẠY THỰC TẾ". Drawn concepts (growth windows, early-warning card) carry an "R&D · MINH HỌA" tag; the chart shows no invented numbers.
- **Rebuild** (from `promo/v4`, with Python 3 + numpy + opencv-python-headless, Node + Playwright, FFmpeg):
  1. `python3 tools/build_audio.py` — music edit, voice track, SFX kit into `audio/`.
  2. `mkdir -p frames/graph frames/evidence && ffmpeg -i ../media/graph.webm -t 5 -q:v 3 frames/graph/%04d.jpg && ffmpeg -i ../media/evidence.webm -t 7 -q:v 3 frames/evidence/%04d.jpg`
  3. `python3 tools/kf/render.py . --res 1080` — video only, `out/video_1080.mp4`.
  4. `python3 tools/mix.py` — `out/mix.wav` at −14 LUFS, −1 dBTP.
  5. `python3 tools/kf/finish.py . --video out/video_1080.mp4 --audio out/mix.wav --name trendifest-v4 --no-vertical` — muxes and runs the checks.
- Preview: `python3 -m http.server` in `promo/v4`, open `/index.html` (space plays silently, arrows step, `?t=40` seeks).
- `tools/kf/` is a copy of the kinetic-film skill's scripts with one change: `render.mjs`/`snap.mjs` await `__seek`, so a frame is never captured before a capture image has decoded. Engine copies (`blocks.js`, `core.js`, `main.js`, `index.html`) carry small fixes marked "V4": non-breaking spaces in scrambled words, a tighter fit width, Archivo for captions (Instrument Sans has no Vietnamese glyphs), and the async seek.

## High-end teaser

[Play the teaser](out/teaser/RTS%202026%20-%20Video%20-%20TRENDIFEST%20TEASER.mp4) — a separate 48-second, music-led cut. Bach’s supplied performance carries the edit; there is no repeated stock take and no voice-over competing with the visual hook. The structure is: small signal → transformation → growth paths → real map → source proof → mark.

- Each stock file is used once: `city`, `phone`, `press`, `water`, `graph`, and `evidence`.
- The live app footage is shown as a real workspace; the drawn graph and node language are labeled R&D.
- Build with `npm run render:teaser` from `promo/`. Preview the rendered MP4 at `/promo/index-teaser.html`.



## V3.1 — continuity revision

[Play the revised MP4](out/v3.1/RTS%202026%20-%20Video%20-%20TRENDIFEST%20V3.1.mp4). All five stock takes run once at normal speed with fixed framing: city (1.34–5.50 s), phone (8.77–12.70 s), newspaper (12.70–16.42 s), water (18.78–22.35 s), meeting (70.67–73.67 s). The credits use type, not recycled footage. A duplicate-file check rejects repeated stock at scene construction. The preview uses the native MP4 player rather than seeking nine video elements against a separate audio clock.

## V3 archive — Gợn đầu

[Review V3](out/v3/RTS%202026%20-%20Video%20-%20TRENDIFEST%20V3.mp4). This is a separate edit, not an overwrite. The scrolling phone, newspaper and water fill the frame; an engraved signal leads into the illustrative math and the real graph. The workspace section uses close-ups from the actual captures. Actors in stock footage are not presented as team members.

- **00:25**: watch the same media tokens spawn, normalize, group by cosine similarity and trace a topic. **00:43**: three growth paths write forward from one origin. Both are labeled R&D.
- The edit clock in `v3/attacks.mjs` comes from piano attacks in the duration-fitted Bach recording. Regenerate with `python3 v3/score.py` (NumPy and FFmpeg). This is not a metronomic recording.
- From `promo/`, `npm run render` now renders V3.1 into `out/v3.1/`; `FILM_SCALE=2 npm run render` draws at native UHD design resolution. `CHROMIUM=/path/to/chrome` selects a local browser. Serve `/promo/` for the seekable preview. V2 remains available at `/promo/index-v2.html`.

## V2 archive

[V2 review MP4](out/v2/RTS%202026%20-%20Video%20-%20TRENDIFEST%20V2.mp4) is a separate 1080p60 edit. All four voice recordings, the piano performance, and the official mark are unchanged.

- **0:25.85–0:37.15 — Signal lab.** Sound, picture, and text tokens spawn, retain their identities through vector normalization, align by cosine similarity, settle into three mixed-media clusters, and light up a path inside a topic. The vectors are illustrative, not collected records.
- **0:42.67–0:48.95 — Growth monitor.** Three colored trajectories draw forward from the same time-zero point along a common 0–24h axis. They illustrate rapid, steady, and plateauing growth, not measured audience counts or forecast probabilities.
- The real graph, board, source inspector, and watch-save capture each appear once, independently of the conceptual animations. The four added stock takes illustrate context, not the team or app users.

## V1 archive

Output: [`RTS 2026 - Video - TRENDIFEST.mp4`](out/RTS%202026%20-%20Video%20-%20TRENDIFEST.mp4), 1920 × 1080 at 30 fps. This is a review cut, not a submitted entry. The event guide calls for an MP4/MOV under 1 GB with both the project and the team, running 30 seconds to 2 minutes.

The review export decoded cleanly, measured 42.6 MB and −14.5 LUFS, and contains 2,749 frames. It does not meet the kinetic-film skill’s motion targets: at native 30 fps, 73% of pre-end-card frame comparisons fell below its change threshold. The app demo shots prioritize legibility in this cut.

| Narration | Range | Picture |
|---|---|---|
| `s1.m4a` | 0:00–0:22.10 | Supplied mark, evening traffic, signal graphics, graph reveal |
| `s2.m4a` | 0:22.10–0:42.67 | Proposed four-layer architecture, then footage of the current graph |
| `s3.m4a` | 0:42.67–1:13.64 | Labeled R&D concepts intercut with the current board, source timeline and watchlist |
| `s4.m4a` | 1:13.64–1:31.65 | Four credited members, university name and contact card |

The supplied voice-over describes the proposed system in the present tense. Purple R&D graphics say the concepts are not implemented; the real workspace has its own persistent visual label. The local capture uses fresh public source data and no invented alerts, metrics or history. It demonstrates a saved watch, not a triggered alert. The team is presented by name and role from the dossier; no portraits or university logo were supplied for this cut.

## Edit and rebuild V2

Install Node 22+, npm, FFmpeg and FFprobe. In `promo/`, run `npm ci` and `npx playwright install chromium`; use `CHROMIUM=/path/to/chrome` to use an existing Chromium binary. Put the four original `s1.m4a` through `s4.m4a` files in `promo/media/`. Media and renders stay out of Git; the typefaces and their OFL notices are included.

- Save the [Pexels night intersection](https://www.pexels.com/video/busy-night-intersection-in-ho-chi-minh-city-33486917/) (R Georges; [Pexels license](https://www.pexels.com/license/)) as `media/city.mp4`. Source used: [2560 × 1440 take](https://videos.pexels.com/video-files/33486917/14244737_2560_1440_50fps.mp4).
- V2 also uses four [Pexels-licensed](https://www.pexels.com/license/) silent takes. Save each in `media/` with the given filename; cue offsets refer to the original first seven seconds, with no speed change:

  | File | Source and direct rendition |
  |---|---|
  | `phone.mp4` | [Phone scrolling](https://www.pexels.com/video/person-scrolling-using-her-mobile-phone-5876327/) · [MP4](https://videos.pexels.com/video-files/5876327/5876327-hd_1920_1080_30fps.mp4) |
  | `press.mp4` | [Turning newspaper pages](https://www.pexels.com/video/flipping-pages-of-a-newspaper-6700169/) · [MP4](https://videos.pexels.com/video-files/6700169/6700169-hd_1920_1080_25fps.mp4) |
  | `water.mp4` | [Rippling water](https://www.pexels.com/video/the-surface-of-the-water-is-very-smooth-7385122/) · [MP4](https://videos.pexels.com/video-files/7385122/7385122-hd_1920_1080_30fps.mp4) |
  | `meeting.mp4` | [Business meeting](https://www.pexels.com/video/group-of-people-in-a-business-meeting-3191887/) · [MP4](https://videos.pexels.com/video-files/3191887/3191887-uhd_2560_1440_25fps.mp4) |

- Save the exact [Kimiko Ishizaka recording of Bach’s Goldberg Variation 5](https://archive.org/details/The_Open_Goldberg_Variations-11823) ([CC0 track entry](https://freemusicarchive.org/music/Kimiko_Ishizaka/The_Open_Goldberg_Variations/KIMIKO_ISHIZAKA_-_Goldberg_Variations_BWV_988_-_06_-_Variatio_5_a_1_ovvero_2_Clav__44k-24b/)) as `media/score.mp3`. The render fits its whole cadence to the voice track and ducks it under speech.
- [DataReportal — Digital 2026: Vietnam](https://datareportal.com/reports/digital-2026-vietnam) reports 79.0 million social media user **identities**, not unique people, in October 2025. Other market numbers from the pitch script are not shown in this cut.

To record new product footage, follow the [app’s local setup and capture walkthrough](../README.md), build and serve the production app locally, and collect from a few public providers into a **disposable local database**. Then run `npm run capture` from `promo/`. The runner clicks real controls, opens a public source link, and **saves a test watch** in that database; do not run it against a shared deployment. `PROMO_APP_URL` defaults to `http://127.0.0.1:8787`. Capture timings can vary between takes; adjust the source offsets at the top of [film.mjs](film.mjs#L1) when replacing footage.

Run `npm run render:v2` from `promo/` to rebuild the previous edit. It reads `../public/logo.svg` unchanged, writes the audio mix and frame-accurate MP4 to `out/v2/`, and keeps reusable local intermediates there. To inspect specific frames, run `node render.mjs stills 0.8 19.6 30 48 63.5 80 90`. For interactive preview, serve the repository root with a static server that supports HTTP range requests and open `/promo/index-v2.html`. The preview and the exporter share the same absolute-time scene function.
