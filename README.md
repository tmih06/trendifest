# Trendifest

A Vietnamese-first topic graph: collect bounded community excerpts and labelled
news, embed locally, and group evidence about specific events and model versions.
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
still reaches configured public sources and source-hosted attachment URLs. Initial
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

Earlier small-map browser smoke, 2026-11-05, cache disabled, simulated 80 ms
latency and 250,000 bytes/second download throughput:

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

- **Source sidebar:** filter evidence from VOZ, Otofun, Google News VN, Người
  Việt, VnExpress, Tuổi Trẻ, Thanh Niên, or Dân trí. Counts are collected records,
  not audiences or replies. News publishers are not community accounts;
  accounts across networks are not verified distinct people.
- **Observation window:** 24 hours, 3 days, or 7 days (default), with a sliding
  active indicator that respects reduced motion.
- **Graph:** every node is a specific topic, never a source hub or an individual
  media attachment. **Size** tracks heuristic potential; **colour** tracks the
  number of measured related-topic links. Titles fade out when zoomed out and
  fade in when zooming closer; selected/hovered topics keep contextual labels.
  Full titles and evidence remain in the inspector. Selecting a topic frames
  it and its direct neighbours.
  Pan and zoom cover a wide range; wheel zoom is eased rather than stepped.
  Background mouse, pen, and single-touch pans glide to a stop after release.
  A new press, zoom, or camera control interrupts the glide. Holding still
  before release, multi-touch gestures, and reduced-motion mode do not fling.
- **Topic inspector:** keyboard-accessible ranking, accent-insensitive title
  search, and 80 rows per page without reducing the canvas's topic set. Topic
  details retain the score breakdown, separate community/news counts, excerpts,
  and original links even when the selected topic is on another ranking page.
  The desktop inspector floats above the graph; its toggle and expansion respect
  reduced motion. Map limitations remain available in a native disclosure.
- **Collection status:** bounded polling state, per-source results/errors, and a
  manual collection action. No fictional live-stream connection is reported.
- **Appearance:** light/dark preference, collapsible desktop sidebar, mobile
  source and inspector dialogs.

The initial force layout settles offscreen. Live relaxation stops after at most
two seconds; unchanged-topology refreshes preserve positions and camera.
Reduced-motion mode displays the settled layout without live relaxation.

The graph polls every two minutes; collection status polls every fifteen seconds.
Manual collection returns HTTP 202 immediately. Fetching and inference continue
in the background; `/api/collect/status` exposes the phase, current provider,
completed providers, and actual fetched/stored/unchanged/rejected/embedded counts.
The UI refreshes the graph when collection finishes. Concurrent requests in the
same API process return HTTP 409. A PostgreSQL advisory lease also prevents a CLI
and another API process from collecting simultaneously; a declined cycle reports
the other collector's ownership instead of starting duplicate work.

For a deliberate larger bootstrap, run the progress-reporting CLI separately:

```bash
bun scripts/collect.ts --limit=1000 \
  --segment=vnexpress --segment=tuoitre --segment=thanhnien --segment=dantri
```

Omit `--segment` to collect all configured providers. The default budget is 500
records/provider, with a hard ceiling of 1,000. A cold bootstrap can take many
minutes; the CLI prints measured progress rather than holding a page request
open. Exit codes: 0 completed, 1 errors, 2 another collector owns the lease.

### Vietnamese input policy

The source catalog is `shared/segments.ts`: two community RSS feeds, Google
News VN discovery RSS, Người Việt's WordPress category endpoint, and 53 category
RSS feeds across four additional Vietnamese publishers. News remains publisher
evidence, never community reactions. Each cycle defaults to 500 records/provider
and accepts at most 1,000. Each HTTP response has a 15-second deadline and 1 MB
cap; there is no historical crawl or global stream.

Google News supplies headlines, publisher labels and aggregator links, not
article bodies or reaction counts. Người Việt exposes one page of at most 50
recent records. The four direct publishers supply headlines, short visible feed
excerpts, original permalinks and real publication times. Tuổi Trẻ's wall-clock
dates are interpreted as UTC+07:00, never the server's local timezone.

Category fan-in uses at most two concurrent requests per provider, deduplicates
canonical articles across sections, and samples across the recent seven-day
window when over budget. Rotating samples keep older records reachable.
Conditional responses replay only successfully parsed, normalized records,
filtered again for freshness; raw feed XML/HTML is not retained. A failed
section is reported alongside successful records, not hidden as an empty feed.
These windows still miss incidents and are not complete social coverage.

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
Source records remain distinct in storage. Topic scoring collapses identical
community content and syndicated news headlines so collector paths do not
manufacture independent support. Only latest measured counters are retained;
missing likes/shares remain unknown. Collection expires input after 30 days,
removing derived vectors and repairing affected near-copy centroids.
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

Edges connect **related topics**, never sources to posts. Relatedness is
separate from identity: GPT-5 and GPT-4.1 remain different nodes but can link
through their shared product family. Links require E5 semantic similarity plus
shared subject, headline terms or phrase evidence. Body boilerplate, a city,
or a quantity alone cannot establish a connection. Acronym-only and reordered
headline matches use a stronger semantic floor.

An inverted shared-key index considers eligible pairs across the whole map,
not just the first part of the ranking. Cheap structural guards run before
cosine comparisons. Measured pairs are selected strongest-first with a maximum
degree of three. Isolates are legitimate: links are not invented to fill space,
and a relationship is context, not proof that two reports describe one event.

Topic identity uses `Xenova/multilingual-e5-small` plus conservative lexical,
entity, model/version and historical-context guards. Complete-linkage admission
requires a new record to match every member, avoiding single-link chaining.
GPT-5 paraphrases can strengthen one node while GPT-4.1, Claude 4, and different
incidents at the same show remain separate. Labels come from source titles,
not generated general categories. This is a heuristic, not verified event
extraction; paraphrases can remain split or false matches can occur.

GET `/api/trend-map` reads matching stored topic vectors without inference.
It considers at most 8,000 recent records and displays at most 1,500 topics with
a per-source selection floor. Each topic includes at most three 600-character
examples. Vectors never leave the endpoint. `pendingEmbeddings` exposes missing
or stale model/hash rows; `limited` exposes actual candidate/display truncation.

Vector parsing, indexed grouping, scoring, and relationships run in a dedicated
worker, not the HTTP event loop. Four single-flight snapshots bound the cache.
Database tuple revisions invalidate it on edits, deletes, vector replacements,
observations, metrics, and history changes; a minute bucket refreshes rolling
windows and scores even without writes. Cache hits keep the original
`generatedAt`. This internal cache does not change the HTTP `no-store` policy.
The worker stays referenced during work and becomes unreferenced when idle,
so collection scripts and tests can finish naturally.

The real-corpus expansion smoke on 2026-11-05 displayed 1,500 topics from eight
sources with 381 measured links and 273 topics supported by multiple independent
accounts/publishers. Local projection took 2,999 ms cold and 72 ms cached; the
JSON encoded to 460,656 gzip bytes. An HTTP health request during a cold graph
request returned in 5 ms. These are local snapshots, not latency guarantees;
the live corpus continues changing.

### Emergence score

| Component   | Weight | Evidence                                                |
| ----------- | ------ | ------------------------------------------------------- |
| Reach       | 34%    | Independent community accounts + publishers, log-scaled |
| Velocity    | 26%    | First collections in consecutive six-hour windows       |
| Spread      | 18%    | Distinct observed collection contexts                   |
| Persistence | 12%    | Local collection/observation span                       |
| Diversity   | 10%    | Independent accounts + publishers per evidence record   |

The evidence multiplier is `0.3 + 0.7 × min(1, (accounts + publishers) / 5)`.
News and community counts remain separate in the inspector. Identical copied
content and syndicated headlines cannot multiply support. Node radius grows
monotonically with potential; multiple independent posts about one release
strengthen one larger node, rather than creating more disconnected dots.

Velocity stays neutral until twelve hours of known first-collection history
exist. Schema upgrades assign older records their cutover time rather than
inventing historical collection dates. Collection growth is not measured social
reach, and a forum bump is not a newly published post. Connections do not boost
scores. This ranks collected evidence for inspection, not predicted popularity.

## Local multimodal embeddings

Topic grouping has a separate native 384-dimensional `topic_embeddings` table,
using `Xenova/multilingual-e5-small` (q8), normalized mean pooling and the
documented `query: ` prefix for symmetric clustering. Titles and bounded body
text share a 1,200-character document budget. Ingest/backfill computes vectors;
unchanged model/hash rows are reused. Edits, takedowns and expiry invalidate
derived topic evidence. Model failures remain pending and report an error,
never a fake fallback vector.

The older spaces below remain for multimodal search and near-copy operations,
not public graph identity:

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

Retiring a near-copy cluster at the per-space cap archives it instead of
deleting its memberships. Archived clusters retain evidence but stay out of
new joins. The public topic graph does not use their archival state.

`recluster()` repairs membership rather than rebuilding it: it walks vectors that
have no membership, re-runs the same assignment, and is resumable, so an
interrupted run continues where it stopped. Vectors are never recomputed and
existing memberships are never destroyed. Very short text remains searchable but
is excluded from clustering, sampled video frames stay searchable but do not
cluster, media extraction failure does not discard a post's usable text, and
deletes remove derived vectors and memberships.

### Source and language limitations

Community feeds and publisher discovery are biased samples, not all Vietnamese
social media, a verified Gen-Z audience, or a firehose of replies. Language,
topic grouping and emergence scores are explicit heuristics, not measured
accuracy or representativeness. No source offers a deletion stream; an upstream
takedown cannot be inferred from a rolling feed no longer listing a record.

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

`server/social` owns collection, embedding and clustering. `trend-map.ts`
loads/caches graph evidence; `topic-projection.ts` and `trend-map-worker.ts`
project it off-thread. `src/pages/trend-map.tsx` wires the workspace;
`src/components/trend-graph-canvas.tsx` configures `obi-graph`;
`packages/opendesk` owns the imported UI layer.
