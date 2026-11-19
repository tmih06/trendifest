# TRENDIFEST promo: current handoff

Last updated: 2026-11-19. Repository: `/home/tmih06/trendifest`.

## V5 (2026-11-19): current cut

V5 replaces V4 after the user's review (too much and too-large type cut off at the edges, too much shake and
punch, wanted smooth Apple-style morphing motion graphics, real app usage, stock footage, a Threads comment
card, a slower score, and a smaller output). Everything is in `promo/v5`; the README's V5 section has the
story, sources, licences and rebuild steps. Outputs: `v5/out/final/trendifest-v5_1080p30.mp4` (master) and
`v5/out/final/trendifest-v5_1080p30_lite.mp4` (optimized), with checks in `v5/out/final/report.json`.
`v5/tools/audit.mjs` must report clean (no text outside title-safe, no overlapping text) before a render.
A self-review pass on contact sheets then removed two weak spots: the early-warning card (0:60-0:66) now
grows with its rows instead of sitting empty, and the model cards (0:38.5) collapse into a seed that the event
graph grows out of, instead of leaving a blank frame. Re-rendered and re-checked (audit clean, report PASS).
Not yet copied to ~/Downloads; nothing committed.

## Earlier request and stopping point

The user objected that stock clips seemed to flicker, replay, and get repeated,
asked for a high-end teaser, then clarified: **they want summary handoff context, not
continued rendering work right now**. Stop here until they ask to resume.

The teaser has a first-pass 48-second scene spec and a rendered video-only worker
segment. It does **not** have a final muxed MP4 or delivery copy. Do not link or
describe `test-part.mp4` as the completed teaser. The open render/delivery todos were
dropped at the user's direction, not completed.

## Teaser: pick up here

- Spec: `promo/teaser/film.mjs` (48 seconds, 12 authored cuts). Concept is
  signal → motion graphics → actual graph → evidence → title card. No VO. Each
  source is guarded so it cannot be used in two shots.
- Build entrypoint: `promo/render.mjs`, selected with `CUT=teaser`.
- Preview page: `promo/index-teaser.html`, which plays the MP4 directly.
- npm entry: `npm run render:teaser` from `promo/`.
- Destination: `promo/out/teaser/RTS 2026 - Video - TRENDIFEST TEASER.mp4`.
- Temporary successful video-only render: `promo/out/teaser/test-part.mp4` (33,876,868
  bytes; one H.264 segment, no music mux). Delete it before/after the complete build.
- Twelve stills exist under `promo/out/teaser/still-*.png`; a contact sheet is
  `/tmp/trendifest-film/teaser-stills.jpg`. Inspection exposed a real rendering bug:
  scene `[17.0,'ripple','water',.4]` has id `ripple`, but `draw()` has no `ripple`
  branch. It falls through to `field()` without clearing the canvas. The still at
  18.5 s visibly carries the prior newspaper shot and text under its drawn lines.
  Fix the branch (likely rename it to `water`) and make every draw path paint a full
  background before rendering. This is likely a direct cause of the apparent repeated
  / flickering footage. Regenerate all stills after fixing; the current contact sheet
  is a broken draft.
- Log: `/tmp/trendifest-film/teaser-render.log` is stale; it records an incomplete
  render worker. An isolated segment render of the same code **did** subsequently
  succeed. The earlier failure followed an attempted `pgrep -f` cleanup that killed
  render processes; do not repeat the broad kill. No teaser render is currently running.

### Teaser-specific design decision to review

The mix currently fits all 94.2 seconds of Bach Goldberg Variation 5 into 48 seconds
with `atempo=1.9625` (nearly double speed). The WAV peaks at -1.5 dBFS, but loudness
is not evidence that the edit sounds good. This is unreviewed and likely too fast for
a high-end cut. Beat-grid checks found approximate tempos of 129.8 BPM near score
start, 127.5 around 17 s, 126.2 around 35 s, 125.5 around 52 s, and 121.8 around
70 s. No musical excerpt has been selected. Prefer a 20–24 second natural-tempo
excerpt from this supplied score for the teaser; do not buy or generate music. Retime
all visual cuts around the excerpt rather than speeding up the whole piece.

Run the V3.1 and teaser player tests via local HTTP with range support. A usable
installed server is `/home/tmih06/.npm/_npx/e5196fa6dc3cecbc/node_modules/http-server/bin/http-server`.
Do not put `npm run render:teaser -- --help` on a live render command: the script
forwards arguments to the renderer, whose default is a full render, not a help page.

## V3.1 continuity revision

- Current spec: `promo/v3/film.mjs`; output path in `promo/render.mjs` is
  `promo/out/v3.1/RTS 2026 - Video - TRENDIFEST V3.1.mp4`.
- `promo/index.html` plays the encoded MP4 directly. This replaces the old custom
  preview's multiple independent `<video>` streams seeking to audio time, which can
  look jerky even when a rendered export is smooth.
- V3.1 source files each occur once: city, phone, newspaper, water, graph, board,
  evidence, watchlist, meeting. The repeated-stock cuts were removed; credits now
  animate typography instead of returning to street/water. Framing for stock is
  fixed, source time advances at 1x, and runtime asserts no duplicated media file.
- Five source clips were decoded and checked for exact duplicate 160×90 grayscale
  thumbnails: **zero repeats** for each. A browser test played each V3.1 stock
  interval and got monotonically increasing `requestVideoFrameCallback` media times:
  city 202 callbacks, phone 174, newspaper 169, water 164, meeting 137.
- V3.1 MP4 decoded cleanly with FFmpeg `-xerror`; 1,920×1,080 at 60 fps, 5,499
  video frames, 91.65 s, 163,961,252 bytes. Browser seeks were tested at 2, 15,
  28, 45, 62, 83, and 89 seconds. **V3.1 is not yet copied to Downloads.**
- Measured with the kinetic-film skill `dyn.py` before the 87.35-second end-card:
  27.6% still comparisons, 2.82 median flow, but longest low-change run is 9.88 s.
  That long hold means do not claim this cut passes the skill's 0.6-second
  pre-end-card hold guideline. A fresh `holds.py` run found 1.33 s at the opening,
  3.42 s at 13 s, and 9.88 s starting at 76.38 s before the end card; the end card
  itself holds about 4.23 s as intended. The 9.88 s hold is in the slowly moving team
  credits. The static/slow pre-end card is not resolved.
- An independent source-to-master correlation script at
  `/tmp/trendifest-film/stock-continuity.py` has a frame-selection bug (master selection
  returns 331 frames for a 250-frame window). Its assertion never ran. Fix it before using it as proof
  that encoded frames match the source clock; current proof is static EDL uniqueness,
  exact-thumbnail checks on source files, playback callbacks, and visual review.

## Earlier cuts: preserve them

- V1: `promo/out/RTS 2026 - Video - TRENDIFEST.mp4`, also
  `~/Downloads/RTS 2026 - Video - TRENDIFEST.mp4`.
- V2: `promo/out/v2/RTS 2026 - Video - TRENDIFEST V2.mp4`, also
  `~/Downloads/RTS 2026 - Video - TRENDIFEST V2.mp4`.
- Recorded SHA-256 values:
  - V1: `5dcf3b856331c5ceb77e1c7f9d13ee602828a317f9c63f20b80dfdd85d50da24`
  - V2: `437f7818f142db870acc9d679a33b7a275255151dca72fc6c009d5ff24e0fcf`
  - Older V3: `cc16bfff8f14203d00877ad5459d83bb05ddaf5ef4ea0a684b217f14226010b3`
  - V3.1: `a83b293598ca4c5c5c5c2311379cc516fd2a91da0355eda917116066dbbbc627`
- These previous outputs are distinct and have not been overwritten. Recheck hashes
  before delivery.

## Code and working-tree state

Current promo changes are under `promo/`, which is untracked in this checkout (as
are `full docs/`, `.agents/skills/`, and `public/logo.svg`). `promo/media/` holds
locally staged clips, the four provided narration files, supplied/CC0 Bach music,
and fonts. Do not add generated `out/` media to source control. `git diff --check`
passed on the previous check; run again before delivery.

Implemented files include:

- `promo/film.mjs` — V2 film code and `W/H/FPS` utilities.
- `promo/v3/film.mjs`, `promo/v3/attacks.mjs`, `promo/v3/score.py` — longer narrated
  cut, attack-timed edits, and V3.1 continuity update.
- `promo/teaser/film.mjs` — newly implemented un-narrated teaser.
- `promo/render.mjs` — selects `CUT=v2` (default), `CUT=3`, or `CUT=teaser`; supports
  `FILM_SCALE=2` for UHD output. Uses indexed source frames, pure absolute-time
  drawing, native resolution scale and distinct output directories.
- `promo/index.html` — V3.1 direct MP4 player.
- `promo/index-v2.html` — original V2 seekable drawing preview.
- `promo/index-teaser.html` — teaser direct MP4 player.
- `promo/package.json` / `package-lock.json` — V2, V3.1 and teaser render scripts.
- `promo/README.md` — current cuts and media provenance.

No paid media generation was used. Teaser uses existing footage/logo/fonts and the
existing CC0 piano track only. `CHROMIUM="$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome"`
and `promo/node_modules` (symlink to `/tmp/trendifest-film/node_modules`) are
available here.

## Next actions (in order)

1. Inspect a contact sheet of the current teaser stills. Check text safe areas,
   actual evidence framing, transitions, and whether the title/product payoff reads.
2. Listen to `promo/out/teaser/mix.wav`. Decide crop vs nearly-2× score, then make
   one editorial decision and retime the cut if needed.
3. Render the full teaser, without parallel/duplicate renderer processes:
   `cd promo && CUT=teaser CHROMIUM="$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome" node render.mjs`.
   Verify the final `RTS 2026 - Video - TRENDIFEST TEASER.mp4` was muxed at 48 s,
   60 fps, 2,880 frames. Decode with FFmpeg `-xerror`; inspect H.264 level, audio
   loudness/true peak, size, all frames at scene boundaries, real MP4 seek/playback,
   native and/or skill motion metrics and longest holds. Do not claim a pass without
   measuring. The older V3.1 has a known 9.88-second hold; teaser should be measured
   separately before delivery.
4. If the teaser passes and looks/sounds right, copy it to
   `~/Downloads/RTS 2026 - Video - TRENDIFEST TEASER.mp4`, `cmp` it, hash it, and
   keep V1 and V2 unchanged. Decide separately whether V3.1 is worth delivering.
5. Update `promo/README.md` and mark remaining todo items only after these checks.
