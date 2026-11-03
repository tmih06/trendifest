# Trendifest

A social trend graph: collect real posts from audience-oriented Bluesky feeds,
embed their content locally, group similar posts, and compare emerging patterns.
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

Open the web URL printed by the development command. API and web ports advance
to a free port in development; production refuses to move silently. The bundled
Postgres listens on `127.0.0.1:55433` and uses a persistent Docker volume.

```dotenv
TRENDIFEST_DATABASE_URL=postgres://trendifest:trendifest@127.0.0.1:55433/trendifest
TRENDIFEST_SOCIAL=1
```

Models download lazily into `.cache/transformers` on first use. Inference stays
local; post content is not sent to an external inference API. Feed/media fetching
still reaches Bluesky and its media hosts. Initial collection can take longer
while weights load and media is decoded.

For production, configure `TRENDIFEST_PASSWORD`, run `bun run build`, then
`bun start`. Basic authentication protects the application and APIs except the
public health endpoint. Protect the deployment with HTTPS.

## Graph workspace

- **Audience sidebar:** emphasize patterns actually observed by a selected feed.
  Filtering does not restart the layout. Counts are observed posts, not measured
  audience sizes. Click a section heading to fold its rows; the icon-only rail
  keeps every row available.
- **Observation window:** 24 hours, 3 days, or 7 days, with a sliding active
  indicator that respects reduced motion.
- **Graph:** three independent encodings: **colour** is the connection count
  (pale for a single link, saturated purple as links accumulate), **size** is
  the trend potential, and **shape** is the pattern's content type — circle for
  text, rounded square for image, triangle for video, diamond for audio, and
  pentagon for links. Audience hubs are neutral greys. Selecting a node frames
  only that node and its direct neighbours.
  Pan and zoom cover a wide range; wheel zoom is eased rather than stepped.
  Background mouse, pen, and single-touch pans glide to a stop after release.
  A new press, zoom, or camera control interrupts the glide. Holding still
  before release, multi-touch gestures, and reduced-motion mode do not fling.
- **Pattern inspector:** keyboard-accessible ranking, score breakdown, source
  posts with Bluesky links, and neighboring patterns with cosine similarity.
  The desktop inspector floats above the graph without resizing its canvas;
  close it from the panel or toggle it beside the observation-window selector.
  Expansion and collapse slide and fade, respecting reduced motion.
- **Collection status:** real tail/backfill state, upstream errors, and a manual
  collection action. A disconnected feed is never labeled live.
- **Appearance:** light/dark preference, collapsible desktop sidebar, mobile
  audience and inspector dialogs.

The initial force layout settles offscreen. Live relaxation stops after at most
two seconds; unchanged-topology refreshes preserve positions and camera.
Reduced-motion mode displays the settled layout without live relaxation.
The graph polls every two minutes; collection status polls every fifteen seconds.
Manual collection returns HTTP 202 immediately with its running status. Media
inference continues in the collector rather than holding an HTTP request open.
Poll `/api/collect/status` for completion, the last report, or errors; the UI
refreshes the graph when the completion timestamp changes. Concurrent collection
requests return HTTP 409.

### Relationships

Solid edges mean **an audience feed observed a pattern**. The general Discover
pool does not establish adoption by an additional niche audience.

Dashed edges mean **two displayed patterns have similar embedding centroids**.
Only clusters with the same modality space, model, and native dimension are
compared. Minimum cosine affinity is 0.75 for text and 0.78 for image/audio,
using the same thresholds as clustering. Pairs are considered strongest-first,
with stable ID tie-breaking and at most three similarity edges per pattern.
Weak or incompatible pairs remain unlinked. These thresholds are heuristics,
not calibrated probabilities or proof of identical meaning.

The map shows up to 40 patterns, with stratified audience coverage before the
remaining slots go to the strongest scores. It does not render every collected
post as a separate node. The inspector includes up to three distinct source
posts per pattern, excluding deleted and out-of-window posts.

### Emergence score

| Component   | Weight | Evidence                                            |
| ----------- | ------ | --------------------------------------------------- |
| Reach       | 34%    | Distinct authors, log-scaled                        |
| Velocity    | 26%    | Recent authors versus the preceding six-hour window |
| Spread      | 18%    | Distinct collection audiences, excluding Discover   |
| Persistence | 12%    | Pattern publication span                            |
| Diversity   | 10%    | Authors per post                                    |

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
threshold against every existing member, not merely the centroid. Very short
text remains searchable but is excluded from clustering. Media extraction
failure does not discard a post's usable text. Deletes remove derived vectors
and memberships.

### Audience and language limitations

Feeds are collection contexts, not verified demographics. The catalog uses a
declared youth-culture audience prior; it cannot establish that a poster or
viewer is Gen Z. The language gate trusts post language tags: explicit
non-English-only tags are skipped, while untagged posts are currently accepted.
It is not strict English-language detection. Historical records are not
retroactively verified for age or language.

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
props; the graph is our own canvas renderer with a `d3-force` layout.

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
| `GET /api/collect/status`       | Collector configuration, tail state, and errors          |
| `POST /api/collect`             | Manual backfill; JSON `{ "limit": 25 }`                  |
| `GET /api/signals?hours=72`     | Operational cluster/coverage data                        |
| `GET /api/signals/search?q=...` | Local text/image vector retrieval                        |

## Development

```bash
bun run check
bun run build
bun test
```

### Visual feedback with Agentation

`agentation` is installed as a development dependency and mounted in
`src/main.tsx` behind Vite's `import.meta.env.DEV` guard. Run `bun dev`, open
the desktop app, and use **Start feedback mode** in the bottom-right corner.
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
TRENDIFEST_TEST_DATABASE_URL=postgres://trendifest:trendifest@127.0.0.1:55433/trendifest_test bun test
```

`server/social` owns collection, embedding, clustering, and map assembly;
`src/pages/trend-map.tsx` wires the workspace; `src/components/trend-graph-canvas.tsx`
owns graph interaction; `packages/opendesk` owns the imported UI layer.
