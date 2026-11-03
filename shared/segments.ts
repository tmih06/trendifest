import type { ViewerSegment } from "./types.ts";

/**
 * Viewer segments are the unit of stratified collection. Each segment is a
 * feed subscription whose contents plausibly reach a bounded audience.
 *
 * ## What a segment can and cannot claim
 *
 * Bluesky exposes no age, gender, or demographic data. "Gen Z" here is a
 * *declared analyst prior about who plausibly reads these feeds*, never an
 * inferred attribute of an author. The system does not guess anyone's age, and
 * the UI labels the catalog as a prior. What *is* verified is language: feeds
 * were sampled 2026-11-03 and the English share of self-tagged posts measured;
 * `englishFloor` records that number, and the pipeline drops posts that are
 * tagged as other languages.
 *
 * ## Selection criteria
 *
 * 1. Resolves against the public feed index (dead feeds are removed, not left
 *    to fail silently at ingest).
 * 2. Measured English share of tagged posts ≥ 71%.
 * 3. Content is youth-culture-adjacent: internet humour, fandom, gaming, music,
 *    short-form video, meme formats.
 *
 * Feeds deliberately excluded: News (verified organisations, not an audience),
 * Science/AcademicSky (professional), Gardening, Astronomy, Urbanism,
 * Home cooking. Those skew older and would dilute a Gen-Z read; a broad-age
 * "control" segment was also removed, because it makes the collection claim
 * narrower without making the panel more useful.
 */

interface SegmentDefinition extends ViewerSegment {
  /** Measured share of English-tagged posts at the sample date, 0-1. */
  englishFloor: number;
  /** Why this feed belongs to a Gen-Z prior. Shown in the UI. */
  prior: string;
}

export const VIEWER_SEGMENTS: SegmentDefinition[] = [
  {
    id: "discover",
    label: "Discover",
    description: "Bluesky's general trending feed: the broad discovery pool.",
    source: "bluesky",
    feeds: ["at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot"],
    scope: "whole-network",
    englishFloor: 0.62,
    prior: "Whole-network pool. English share measured at 62% before filtering.",
  },
  {
    id: "shitpost",
    label: "Shitposting",
    description: "Trans and queer shitposters: meme formats and internet humour.",
    source: "bluesky",
    feeds: ["at://did:plc:q6gjnaw2blty4crticxkmujt/app.bsky.feed.generator/cl-tqsp"],
    scope: "collection",
    englishFloor: 0.95,
    prior: "Internet humour and meme formats; a young-adult posting culture.",
  },
  {
    id: "overheard",
    label: "Overheard",
    description: "Out-of-context quotes and overheard replies.",
    source: "bluesky",
    feeds: ["at://did:plc:vjyot2w7zeomrslomwpfxirl/app.bsky.feed.generator/aaajjrj657mnm"],
    scope: "collection",
    englishFloor: 1,
    prior: "Screenshot-style quote humour; 100% English when sampled.",
  },
  {
    id: "music",
    label: "Music discovery",
    description: "Posts using the headphones emoji to share music.",
    source: "bluesky",
    feeds: ["at://did:plc:stu4unkwieyt5suhyfl6u5e4/app.bsky.feed.generator/aaacjvrirvq2w"],
    scope: "collection",
    englishFloor: 0.86,
    prior: "Music sharing and discovery; a core short-form-video crossover.",
  },
  {
    id: "gaming",
    label: "VTuber / gaming",
    description: "VTuber fan activity and gaming culture.",
    source: "bluesky",
    feeds: ["at://did:plc:7dl6s4wfcygfxzxok46z5gtu/app.bsky.feed.generator/aaaiyn75rk3wy"],
    scope: "collection",
    englishFloor: 0.71,
    prior: "VTuber and gaming fandom; strongly skews young.",
  },
  {
    id: "himbofeed",
    label: "Himbo feed",
    description: "Opt-in primary posts from a self-selected humour community.",
    source: "bluesky",
    feeds: ["at://did:plc:cxuzwp5dzmxkrdr55qh25mgb/app.bsky.feed.generator/aaap2eo4gzzes"],
    scope: "collection",
    englishFloor: 0.93,
    prior: "Self-selected shitposting community; 93% English when sampled.",
  },
  {
    id: "newskies",
    label: "New users",
    description: "First posts from people who just joined Bluesky.",
    source: "bluesky",
    feeds: ["at://did:plc:wzsilnxf24ehtmmc3gssy5bu/app.bsky.feed.generator/newskies"],
    scope: "collection",
    englishFloor: 0.56,
    prior: "Newcomer introductions; a strong proxy for recent cohort behaviour.",
  },
  {
    id: "art",
    label: "Artists",
    description: "Human-made art, trending and new.",
    source: "bluesky",
    feeds: [
      "at://did:plc:y7crv2yh74s7qhmtx3mvbgv5/app.bsky.feed.generator/art-new",
      "at://did:plc:odqmsar3ikz5ubokya4sempk/app.bsky.feed.generator/aaabhy3bowhbo",
    ],
    scope: "collection",
    englishFloor: 0.72,
    prior: "Fandom and OC art, a young creator-audience crossover.",
  },
  {
    id: "film",
    label: "Film & TV",
    description: "Film watchers and makers.",
    source: "bluesky",
    feeds: ["at://did:plc:2hwwem55ce6djnk6bn62cstr/app.bsky.feed.generator/aaaotdzmoni2q"],
    scope: "collection",
    englishFloor: 0.75,
    prior: "Fandom and media discussion.",
  },
];

const BY_ID = new Map(VIEWER_SEGMENTS.map((segment) => [segment.id, segment]));

export function findSegment(id: string): SegmentDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Segments that may contribute to cross-segment adoption. The whole-network
 * discovery pool is excluded: a post reaching Discover and one niche segment is
 * not evidence of adoption *between* audiences.
 */
export const ADOPTION_SEGMENTS = VIEWER_SEGMENTS.filter(
  (segment) => segment.scope === "collection",
);

/**
 * Language gate for collected posts.
 *
 * `record.langs` is author-declared and sometimes absent or wrong, so this is a
 * filter, not a classifier. A post is kept when it declares English, or declares
 * nothing at all — untagged posts are unknown, and dropping them would silently
 * remove whatever a feed's authors forgot to tag. A post that declares only
 * non-English languages is dropped: keeping it would make an "English only"
 * collection claim false.
 */
export function declaresEnglish(langs: string[] | undefined): boolean {
  if (!langs || langs.length === 0) return true;
  return langs.some((lang) => {
    const lower = String(lang).toLowerCase();
    return lower === "en" || lower.startsWith("en-");
  });
}
