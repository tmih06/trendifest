# Trendifest

A Vietnamese-first discussion graph: collect bounded public thread excerpts
from VOZ and Otofun, embed content locally, and compare related activity.
The graph is the entire application. There is no Google Trends dashboard,
forecasting workspace, watchlist, alerts system, or separate Signals page.

## Run

Requires Bun, Docker (or an existing Postgres with pgvector), and FFmpeg for
video/audio extraction.

```bash
bun install
docker compose up -d
cp .env.example .env
bun dev
```

Open the URL printed by `bun dev` (default `http://localhost:5180`). It uses
**one TCP port** for the frontend, hot reload, and `/api` requests. Vite reverse
proxies `/api` to a private Unix socket; the API opens no development TCP port.
Only the printed port needs forwarding. Set `PORT=5200 bun dev` to choose a
different starting port; occupied ports advance to the next available one.
The socket lives in a per-run private temporary directory, removed on shutdown
together with both server process groups. This development setup requires Unix
socket support (Linux/macOS).

`bun run dev:api` still starts the standalone TCP API on port 8787.
`bun run dev:web` can proxy to that server when started separately. Production serves the
built frontend and API together on port 8787 (or `PORT`) and refuses to move
silently. The bundled Postgres listens on `127.0.0.1:55433` and uses a persistent
Docker volume.

```dotenv
TRENDIFEST_DATABASE_URL=postgres://trendifest:trendifest@127.0.0.1:55433/trendifest
TRENDIFEST_SOCIAL=1
```

Models download lazily into `.cache/transformers` on first use. Inference stays
local; post content is not sent to an external inference API. Feed/media fetching
still reaches the configured forums and source-hosted attachment URLs. Initial
collection can take longer while weights load and media is decoded.

For production, configure `TRENDIFEST_PASSWORD`, run `bun run build`, then
`bun start`. Basic authentication protects the application and APIs except the
public health endpoint. Protect the deployment with HTTPS.

### Transfer behavior

Development text responses negotiate streaming compression, including modules
and proxied API responses. Source maps and hot reload remain enabled; slow
connections do not need to transfer the debug modules uncompressed.

Production builds emit gzip sidecars for beneficial text assets. The Bun server
negotiates those files and compresses large API JSON while keeping API responses
`no-store` and hashed assets immutable. Binary media is not re-compressed.
Deploy the entire `dist/` directory, including `.gz` files.

Icons use public per-icon imports rather than the full development icon barrel.
Optional feedback tooling loads asynchronously after the document's load event;
it does not block the graph's entry modules. Production excludes it entirely.

Local browser smoke, 2026-11-05, cache disabled, simulated 80 ms latency and
250,000 bytes/second download throughput:

| Measurement                   |                         Before |                              After |
| ----------------------------- | -----------------------------: | ---------------------------------: |
| Development startup resources |          13.11 MB uncompressed | 1.18 MB encoded at graph readiness |
| Development initial load      | Document loading exceeded 30 s |               Graph ready in 6.0 s |
| Graph API representation      |         100,659 bytes identity |                  21,039 bytes gzip |

The deferred development toolbar adds about 429 kB encoded after document load.
The production build reached a populated graph in 1.3 s with about 170 kB of
encoded resources at that point. These are local simulated-network snapshots,
not production latency guarantees; the collector continued receiving new input.

## Graph workspace

- **Source sidebar:** emphasize patterns actually observed in VOZ or Otofun.
  Filtering does not restart the layout. Counts are collected thread excerpts,
  not audience sizes or downloaded reply counts. Source accounts are not
  verified distinct people across networks.
- **Observation window:** 24 hours, 3 days, or 7 days, with a sliding active
  indicator that respects reduced motion.
- **Graph:** three independent encodings: **colour** is the connection count
  (pale for a single link, saturated purple as links accumulate), **size** is
  the trend potential, and **shape** is the pattern's content type — circle for
  text, rounded square for image, triangle for video, diamond for audio, and
  pentagon for links. Source hubs are neutral greys. Selecting a node frames
  only that node and its direct neighbours.
  Pan and zoom cover a wide range; wheel zoom is eased rather than stepped.
  Background mouse, pen, and single-touch pans glide to a stop after release.
  A new press, zoom, or camera control interrupts the glide. Holding still
  before release, multi-touch gestures, and reduced-motion mode do not fling.
- **Pattern inspector:** keyboard-accessible ranking, score breakdown, bounded
  source excerpts with original-thread links and explicit source identity.
  The desktop inspector floats above the graph without resizing its canvas;
  close it from the panel or toggle it beside the observation-window selector.
  Expansion and collapse slide and fade, respecting reduced motion.
- **Collection status:** bounded polling state, per-source results/errors, and a
  manual collection action. No fictional live-stream connection is reported.
- **Appearance:** light/dark preference, collapsible desktop sidebar, mobile
  source and inspector dialogs.

The initial force layout settles offscreen. Live relaxation stops after at most
two seconds; unchanged-topology refreshes preserve positions and camera.
Reduced-motion mode displays the settled layout without live relaxation.

The graph polls every two minutes; collection status polls every fifteen seconds.
Manual collection returns HTTP 202 immediately with its running status. Media
inference continues in the collector rather than holding an HTTP request open.
Poll `/api/collect/status` for completion, the last report, or errors; the UI
refreshes the graph when the completion timestamp changes. Concurrent collection
requests return HTTP 409.

### Vietnamese input policy

The source catalog is `shared/segments.ts`: VOZ's public discussion RSS and
Otofun's public community RSS. Each cycle makes one conditional request per
source, with a default budget of 20 records and a hard cap of 25 per source.
There is no global stream, multi-page historical crawl, or catch-all Discover
pool. Feed responses are capped at 1 MB before parsing.

`server/social/input.ts` is the common gate for every adapter: normalize
Vietnamese Unicode and whitespace, cap text at 2,000 characters and attachments
at four, then check language before storage or inference. `franc-min` compares
all its candidate languages; Vietnamese must rank first with a separation
margin. At least 25 letters are required after removing URLs and mentions.
English posts mentioning Vietnam, short/ambiguous content, and malformed,
future or older-than-30-day dates are rejected. This is heuristic detection,
not a measured accuracy guarantee; unaccented slang and code-switching can be
missed.

The feeds contain first-post excerpts and reply counts, not complete threads
or reply texts. RSS timestamps are marked as **activity**, not verified
publication dates. Quotes, script/style content and raw feed HTML are not
stored. Only source-hosted HTTPS image attachments are eligible for extraction;
arbitrary third-party media is not fetched from RSS.

Post IDs and account identities are namespaced by source. Repeated delivery
does not re-embed unchanged content; edits invalidate old derived evidence.
Identical content on independent sources remains separate evidence. Only the
latest measured counters are retained; missing likes/shares remain unknown,
not zero. Successful collection cycles expire input beyond the 30-day maximum
map window, removing its derived vectors and repairing affected centroids.
Disappearance from a rolling feed does **not** prove a source deletion.

Research, exact endpoints, live probe evidence, access/permission limitations,
the previous-corpus audit, and the verified export are recorded in
[`docs/research/vietnamese-public-sources.md`](docs/research/vietnamese-public-sources.md).
Free API keys do not by themselves establish permission for cross-source
analytics; YouTube, Reddit, Threads and TikTok access constraints are covered
there. No paid scraping or challenge bypass is used.

### Graph library

Rendering, force layout, hit testing, selection, pan/zoom, node dragging, and
view controls come from [obi-graph](https://github.com/tmih06/obi-graph), pinned
to Git revision `08bbc78` in `package.json` and `bun.lock`. There is no embedded
engine copy. `src/lib/graph.ts` adapts API data to its public node/link types;
`src/components/trend-graph-canvas.tsx` supplies Trendifest's degree-based colors
and physics configuration. `src/styles.css` imports `obi-graph/styles.css` and
maps its scoped theme tokens and toolbar placement to the shell.

The library is not yet published on npm, and its Git checkout omits the exported
`dist/` files. `bun install` runs `scripts/build-obi-graph.ts` to emit the bundle,
declarations, and stylesheet inside the installed dependency using the app's
Bun/TypeScript toolchain. Keep dev dependencies installed for this step:
`@types/d3-force` is needed to emit upstream declarations, while `d3-force`
itself is owned by the library. Do not skip install scripts before building.
Library upgrades are explicit Git-pin updates followed by `bun install`.
The install build explicitly uses production-compatible JSX even when invoked
from a development environment; otherwise the production React runtime lacks
the development-only `jsxDEV` function and the graph fails to render.

### Relationships

Solid edges mean **a configured source context observed the pattern**. They do
not establish a person's demographics, exposure, or causal cross-platform adoption.

Dashed edges mean **two displayed patterns have similar embedding centroids**.
Only clusters with the same modality space, model, and native dimension are
compared. Minimum cosine affinity is 0.75 for text and 0.78 for image/audio,
using the same thresholds as clustering. Pairs are considered strongest-first,
with stable ID tie-breaking and at most three similarity edges per pattern.
Weak or incompatible pairs remain unlinked. These thresholds are heuristics,
not calibrated probabilities or proof of identical meaning.

The map shows up to 90 patterns, with stratified source coverage before the
remaining slots go to the strongest scores. It does not render every reply
as a node. Each pattern carries at most three 600-character source excerpts.
An unused duplicate `top` array is no longer sent. Missing engagement metrics
are displayed as unknown; a measured reply count is never relabeled as likes.

### Emergence score

| Component   | Weight | Evidence                                          |
| ----------- | ------ | ------------------------------------------------- |
| Reach       | 34%    | Source-qualified accounts, log-scaled             |
| Velocity    | 26%    | Latest source activity versus the prior six hours |
| Spread      | 18%    | Distinct observed collection contexts             |
| Persistence | 12%    | Activity span, not verified publication span      |
| Diversity   | 10%    | Source accounts per collected excerpt             |

An evidence multiplier reduces small-sample scores: `0.3 + 0.7 × min(1, authors / 5)`.
Velocity stays neutral until twelve hours of observation history exist.
Connections do not increase scores. This ranks collected evidence for human
inspection; it does not predict or guarantee future popularity.

## Local multimodal embeddings

| Content                         | Model                                          | Native dimensions |
| ------------------------------- | ---------------------------------------------- | ----------------- |
| Text bodies                     | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | 384               |
| Images and sampled video frames | `Xenova/clip-vit-base-patch32`                 | 512               |
| Audio and video soundtracks     | `Xenova/clap-htsat-unfused`                    | 512               |

Vectors are L2-normalized and padded to a 1024-dimensional storage column, with
separate pgvector indexes per space. Padding is **not** a universal multimodal
alignment: MiniLM, CLIP, and CLAP vectors cannot be compared arbitrarily.
CLIP's text tower supports text-to-image retrieval. Text/audio/image clusters
stay separate. Sampled video frames are searchable but do not form clusters;
soundtracks can cluster. There is no speech transcription or OCR pipeline.

Cluster admission uses complete linkage: a new member must pass its space's
threshold against every existing member, not merely the centroid. Candidates are
ranked by their nearest member rather than by the running centroid, because a
centroid drifts toward the average of everything a cluster absorbed and can hide
a genuinely compatible neighbour; up to three candidates are tried per vector.

Retiring a cluster at the per-space cap **archives** it instead of deleting it.
Deleting cascaded the cluster's memberships away, and because a busy space hits
the cap constantly, vectorised posts kept losing their only cluster — the live
corpus reached 18k embedded posts with no membership. Archived clusters keep
every member, stay out of new joins, and are excluded from the map and counts.

`recluster()` repairs membership rather than rebuilding it: it walks vectors that
have no membership, re-runs the same assignment, and is resumable, so an
interrupted run continues where it stopped. Vectors are never recomputed and
existing memberships are never destroyed. Very short text remains searchable but
is excluded from clustering, sampled video frames stay searchable but do not
cluster, media extraction failure does not discard a post's usable text, and
deletes remove derived vectors and memberships.

### Source and language limitations

Forum activity is a biased sample of Vietnamese-language discussion, not all
Vietnamese social media, a verified Gen-Z audience, or a firehose of replies.
The existing similarity thresholds were investigated on the former corpus,
not calibrated on Vietnamese RSS excerpts. Language detection and emergence
scores remain explicit heuristics. The selected feeds offer no deletion stream;
an upstream takedown cannot be inferred from a feed page no longer listing it.

## OpenDesk UI library

The application imports `@trendifest/opendesk` through a local Bun workspace at
`packages/opendesk`. This is a source-derived library, not the full helpdesk app
or an upstream published SDK.

Source: [useopendesk/opendesk](https://github.com/useopendesk/opendesk), pinned at
`9f7e79072bb41c8be2bd0a96eaa74aba1333ce3c` (Apache-2.0).

The package adapts OpenDesk's shell, inset work panel, compact sidebar/rail,
Button, Badge, Dialog, theme tokens, Geist/Geist Mono fonts, and Lucide icon
conventions. Helpdesk routing, authentication, chat, billing, telemetry, and AI
assistant services are not imported. Components take Trendifest state through
props; graph interaction and rendering come from the external `obi-graph` library.

Upstream paths, the pinned revision, and modification notices are recorded in
`packages/opendesk/NOTICE` and package metadata. The full upstream license is
retained at `packages/opendesk/LICENSE`. Upgrades are explicit source updates:
review the relevant upstream files, port changes, update the pin and notices,
then exercise the graph. There is no floating Git dependency.

## API

| Endpoint                        | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `GET /api/health`               | Public process and collection health                     |
| `GET /api/trend-map?hours=72`   | Scored nodes, observed/similarity edges, source examples |
| `GET /api/collect/status`       | Polling state, per-source results, and errors            |
| `POST /api/collect`             | Bounded source poll; JSON `{ "limit": 25 }`              |
| `GET /api/signals?hours=72`     | Operational cluster/coverage data                        |
| `GET /api/signals/search?q=...` | Local text/image vector retrieval                        |

## Development

```bash
bun install --frozen-lockfile
bun run ci
```

`ci` fails on the first unsuccessful step: `check` verifies formatting, lint,
and types without modifying files; `test` runs the complete Bun test suite;
`build` typechecks and emits the production bundle. The individual commands
remain available for focused checks.
The CI test timeout is two minutes per test to allow the first embedding model
download on a cold runner; the default `bun test` timeout is unchanged.

GitHub Actions runs `.github/workflows/ci.yml` on every push and pull request,
and supports manual dispatch. It installs the pinned Bun toolchain and FFmpeg,
starts an isolated pgvector/Postgres service, caches downloaded embedding models,
then runs `bun run ci` with database integration tests enabled. No collection
database credentials or repository secrets are required.

Set `TRENDIFEST_TEST_DATABASE_URL` to a disposable database (see below) when
running CI to include the database integration tests. Without it, Bun reports
those tests as skipped; a successful CI command does not imply database coverage.

### Visual feedback with Agentation

`agentation` is a development dependency loaded asynchronously from `src/main.tsx`
after the initial document load, behind Vite's `import.meta.env.DEV` guard. Run
`bun dev` and use **Start feedback mode** in the bottom-right corner once it appears.
Select an element, add a note, then choose **Copy feedback** and paste it into
your coding agent. Clear temporary annotations when finished.

No MCP endpoint or webhook is configured: feedback stays local until copied.
Agentation is excluded from production builds. Individual graph nodes are
canvas pixels, not DOM elements; annotate the graph surface or its inspector
when giving feedback about a node. See the [Agentation documentation](https://www.agentation.com/install)
for optional MCP integration and licensing.

### Database tests

Database integration tests are skipped unless `TRENDIFEST_TEST_DATABASE_URL`
points to a **disposable, separate database**. Tests truncate its public tables;
never point that variable at the collection database.

```bash
docker compose exec postgres createdb -U trendifest trendifest_test
TRENDIFEST_TEST_DATABASE_URL=postgres://trendifest:trendifest@127.0.0.1:55433/trendifest_test bun run ci
```

`server/social` owns collection, embedding, clustering, and map assembly;
`src/pages/trend-map.tsx` wires the workspace; `src/components/trend-graph-canvas.tsx`
configures `obi-graph`; `packages/opendesk` owns the imported UI layer.
