import type { ViewerSegment } from "./types.ts";

/**
 * Verified public Vietnamese collection contexts. Each network gets one bounded
 * collection context per cycle; RSS excerpts are not a census of its users or
 * replies, and an aggregated headline is one article rather than a crowd.
 * Do not add a global discovery pool or infer an author's age from a forum.
 *
 * Community discussion and news are separate evidence: the two news contexts
 * carry `evidenceType: "news"` and are never counted as people, authors or
 * reactions by anything downstream.
 */
export const VIEWER_SEGMENTS: ViewerSegment[] = [
  {
    id: "voz",
    label: "VOZ",
    description: "Vietnamese community discussion excerpts from VOZ's public RSS feed.",
    source: "voz",
    evidenceType: "discussion",
    feedUrl: "https://voz.vn/f/17/index.rss",
  },
  {
    id: "otofun",
    label: "Otofun",
    description: "Vietnamese community discussion excerpts from Otofun's public RSS feed.",
    source: "otofun",
    evidenceType: "discussion",
    feedUrl: "https://www.otofun.net.vn/forums/77/index.rss",
  },
  {
    id: "google-news",
    label: "Google News VN",
    description:
      "Vietnamese news headlines from Google News' public front-page RSS. Each item is one " +
      "publisher article; related headlines in an item are other coverage, not this article.",
    source: "google-news",
    evidenceType: "news",
    feedUrl: "https://news.google.com/rss?hl=vi&gl=VN&ceid=VN%3Avi",
  },
  {
    id: "nguoi-viet",
    label: "Người Việt",
    description:
      "Articles from Người Việt's public Vietnam section, sampled across the last seven days.",
    source: "nguoi-viet",
    evidenceType: "news",
    feedUrl: "https://www.nguoi-viet.com/wp-json/wp/v2/posts",
  },
];
