# Vietnamese-first public post sources

Research date: 2026-11-05. Scope: Vietnamese-language user-generated content,
not English posts mentioning Vietnam, publisher news, or paid scraping trials.

## Decision

Use VOZ and Otofun's public RSS discussion feeds as the initial independent
sources. Both returned RSS without authentication using an honest
`Trendifest/0.1 (public-feed reader)` user-agent in live probes. No browser
impersonation, challenge solver, private API, login cookie, or paid service is
required for the observed access. Access may change; surface failures instead
of bypassing them.

These are thread excerpts, not all posts or replies. They do not represent all
Vietnamese users, prove anyone's age, or provide a complete social-media sample.
RSS availability is not a blanket copyright, redistribution, or commercial
analytics licence. Review source terms and obtain permission where the use
requires it; this report is not legal clearance.

## Why the previous input was bloated

The live database audit found 107,245 posts, zero explicitly Vietnamese-tagged
posts, 89,990 English-tagged posts, and 93,812 Discover observations. Embeddings
and indexes occupied 1,819 MB. The global Bluesky stream was the dominant input;
its English-or-untagged gate was opposite to the new corpus boundary. The old
fingerprint also included a source record key, preventing it from identifying
identical text posted under different IDs.

The approved cutover is export then remove the old collected corpus, not mix it
into the Vietnamese graph. Collection processes were stopped before export.
The custom-format backup is
`.cache/backups/pre-vietnam-20261105T101547Z.dump` (222,169,759 bytes), SHA-256
`9714e590746d5811d084066e748948c9bcdf3027b638a4627c1a17da6de6e340`.
Schema and table data were restored into a separate temporary database without
rebuilding indexes. All seven table counts matched: 107,527 posts, 107,739
observations, 80,956 metric snapshots, 137,328 embeddings, 1,460 clusters,
2,158 memberships, and zero ingest-state rows. Counts increased between the
initial audit and stopping the live collectors. The verification database was
removed; the backup is retained locally and is not committed.

## Source comparison

| Source                             | Free/public access                                                              | Vietnamese suitability                                                                                          | Decision and caveat                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VOZ                                | No-key RSS: `https://voz.vn/f/17/index.rss`                                     | Active Vietnamese community discussion and colloquial text in the live sample                                   | Collect bounded excerpts. Not a JSON search API or a complete reply feed.                                                                                                  |
| Otofun                             | No-key RSS: `https://www.otofun.net.vn/forums/77/index.rss`                     | Active Vietnamese lifestyle/vehicle/community discussion in the live sample                                     | Collect independently from VOZ. Audience bias differs; no demographic claims.                                                                                              |
| YouTube Data API                   | Free quota, Google Cloud API key required                                       | Video titles and comment threads can provide useful Vietnamese text                                             | Strong credentialed candidate, not an automatically lawful input to cross-owner/cross-source ranking. Review developer policies before integrating.                        |
| Reddit                             | OAuth access and applicable approval/terms; RSS exists but is heavily throttled | `r/vozforums` contains Vietnamese community discussion; `r/VietNam` also contains English tourism/expat content | Do not treat RSS as a terms bypass. Research probes saw 200 followed by 429; JSON access from this environment returned 403. Commercial use requires a separate agreement. |
| Threads                            | Access token plus approved `threads_keyword_search` for public search           | Potential Vietnamese social content; no native Vietnamese-only filter                                           | Without approval, search is limited to the authenticated user's posts. Not immediate no-key coverage.                                                                      |
| Facebook/Instagram                 | Account/app permissions and use-case restrictions                               | Large Vietnamese communities, but popularity is not API availability                                            | No general anonymous free public-post search. Meta Content Library has eligibility restrictions; do not substitute scraping vendors.                                       |
| TikTok                             | Display API is author-consented; Research Tools have eligibility restrictions   | Important Vietnamese short-video audience                                                                       | Not a general free commercial discovery feed. Research access cannot be assumed for this project.                                                                          |
| Telegram                           | Bot API token or user-client credentials; known-channel scope                   | Can contain Vietnamese channels, often niche or promotional                                                     | Bots do not provide a global public-post firehose. Public HTML previews are not a discovery API.                                                                           |
| Bluesky                            | Public feeds/stream; search probe returned 403 unauthenticated                  | A short stream probe found no `vi` tags; existing collected corpus had zero                                     | Not retained as the default backbone. A finite sample does not prove Vietnamese content is absent globally.                                                                |
| Mastodon/Lemmy                     | Some instance REST endpoints work anonymously                                   | Tested Vietnamese tags/communities were sparse, largely foreign-language or automated content                   | Not enabled merely to claim another source. Coverage varies by instance and may require authentication.                                                                    |
| Tinhte RSS / Vietnamese newspapers | No-key feeds available                                                          | Accessible Tinhte lists sampled were editorial; newspapers are publisher content                                | Excluded as substitutes for user posts. Publisher context would need separate labels and a separate scoring population.                                                    |

## Verified feed semantics

Both live feeds supplied RSS 2.0 with `title`, `link`, `guid`, `pubDate`,
`dc:creator`, `content:encoded`, and `slash:comments`.

- VOZ supplied a stable `urn:xenforo:thread:<id>` GUID. Otofun supplied a thread
  permalink GUID. IDs and author names must be namespaced by source.
- `content:encoded` contains HTML and may be truncated. Parse it, remove quoted
  or executable boilerplate, retain a bounded text excerpt and the canonical
  source link. Do not persist the raw feed or entire HTML document.
- `dc:creator` is a displayed account name, not a cross-platform person ID.
  Matching handles on two sites are not proof of the same person, and a renamed
  account may appear distinct because RSS supplies no immutable account ID.
  Missing authors must not become distinct invented creators.
- `pubDate` can track latest activity on an old thread. Live samples included
  long-running threads with thousands of replies and current feed dates.
  Mark dates as activity, not verified original publication. Do not infer a
  new post, a new author, or a breakout merely because a thread resurfaces.
- `slash:comments` measures thread replies. It is not a like, share, view count,
  or a count of downloaded reply texts. Missing metrics stay unknown.
- Disappearance from a rolling RSS page is not a deletion event. A source
  takedown cannot be inferred from absence. Keep a local deletion path and a
  finite retention policy; do not claim full upstream deletion synchronization.
- Poll conservatively (the implementation's interval is ten minutes), honor
  conditional HTTP responses and access failures, and do not paginate/scrape
  complete threads to simulate a full historical API.

## Input policy

The collection boundary normalizes Unicode/whitespace, strips feed HTML,
checks Vietnamese text before inference, caps excerpts and feed response sizes,
limits work per source, and preserves provenance. The language detector must
compare multiple languages, not force a `vi` answer by restricting candidates.
Short or ambiguous text stays out. Detection is heuristic: unaccented slang,
code-switching and short captions can be missed. Do not report measured language
accuracy without a labelled Vietnamese evaluation set.

Keep independent source records even if text is identical: copies are evidence
of multiple observed publications, not duplicate database IDs. Content hashes
must exclude the source record key, and repeated delivery must not re-embed
unchanged text or accumulate unbounded metric snapshots. Cross-source matching
is content affinity, not proof of shared authorship or causal adoption.

The existing cosine floors were investigated on the former corpus, not
calibrated on Vietnamese community excerpts. Retain explicit heuristic labels;
no Vietnamese accuracy, early-warning performance, or representativeness claim
is established by connecting two feeds.

## Free-key API details

The current official YouTube quota page lists separate default buckets of
100 `search.list` calls/day and 100 `videos.insert` calls/day, plus 10,000
units/day shared by other endpoints. `videos.list` and `commentThreads.list`
each cost one unit. Do not repeat the outdated assertion that every search
costs 100 of the general quota. `regionCode=VN` is a regional discovery hint,
not proof that a video's title or comments are Vietnamese; `relevanceLanguage`
is a relevance preference rather than a strict language gate.

For a permitted YouTube use case, shortlist metadata using `videos.list` or
curated channels and fetch recent comment threads with `textFormat=plainText`.
Do not download video/audio or assume API metadata licences grant media rights.
Developer policies constrain storage, refresh/deletion, aggregation and derived
metrics; some analytics amendments require explicit acceptance. This project
has not obtained such approval, supplied an API key, or validated a YouTube
adapter. No permissibility of unified embeddings/ranking is inferred here.

Reddit's Data API Terms apply to other materials accessed from its services as
well, require honest OAuth/user-agent identity, prohibit bypassing restrictions,
and require a separate agreement for commercial or otherwise unapproved uses.
A successful anonymous RSS response is not an approved analytics licence.

## Cutover verification

The first real development-server poll inspected 40 excerpts and accepted 33:
16 from VOZ and 17 from Otofun. Six failed language detection and one failed
the minimum-text requirement; neither source failed. Browser checks exercised
source filtering, source-labelled evidence, original-thread links, activity-time
disclaimers and the per-source collection results.

At the later database check, the retained corpus contained 38 posts: 19 from
each source, all tagged `vi`. The longest stored excerpt was 621 characters.
There were 38 latest-counter rows; unmeasured likes, reposts and quotes remained
null. Embeddings and indexes occupied 672 kB, versus 1,819 MB in the old audit.
These are observed cutover snapshots, not projected long-term storage or a
measured language-accuracy result.

A separate disposable-database smoke accepted nine live excerpts (four VOZ,
five Otofun), then injected a local HTTP 503 for VOZ. Its four known posts
remained counted while only VOZ gained a collection error; the other source
continued. Restoring the real endpoint cleared the error on the next cycle.
All temporary databases and the owned test listener were removed afterward.

`bun run ci` passed with database integration enabled: 66 tests, zero failures,
no formatting/lint/type issues, and a successful production build. Regression
coverage includes Vietnamese/English boundaries, edited evidence, expiry,
source identity, unknown metrics, malformed/oversized feeds, conditional HTTP,
missing links, numeric Vietnamese entities and declarations quoted in CDATA.

## Primary sources

- [VOZ public discussion RSS](https://voz.vn/f/17/index.rss), [terms](https://voz.vn/help/terms/), [privacy policy](https://voz.vn/help/privacy-policy/).
- [Otofun public discussion RSS](https://www.otofun.net.vn/forums/77/index.rss), [service agreement](https://www.otofun.net.vn/threads/thoa-thuan-cung-cap-va-su-dung-dich-vu-mang-xa-hoi-otofun.1962611/).
- [YouTube quotas](https://developers.google.com/youtube/data/determine_quota_cost), [search](https://developers.google.com/youtube/v3/docs/search/list), [videos](https://developers.google.com/youtube/v3/docs/videos/list), [comment threads](https://developers.google.com/youtube/v3/docs/commentThreads/list), [developer policies](https://developers.google.com/youtube/terms/developer-policies).
- [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms), [Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki).
- [Threads public keyword search permissions and limits](https://developers.facebook.com/documentation/threads/keyword-search).
- [TikTok Research API](https://developers.tiktok.com/products/research-api), [Display API](https://developers.tiktok.com/doc/display-api-overview/).
- [Telegram Bot API](https://core.telegram.org/bots/api).
- [Bluesky search API](https://docs.bsky.app/docs/api/app-bsky-feed-search-posts), [Jetstream](https://bsky.network/docs/jetstream/).
- [Mastodon timelines](https://docs.joinmastodon.org/methods/timelines/), [Lemmy API](https://join-lemmy.org/api/).
- [franc detector and short-text limitations](https://github.com/wooorm/franc).
