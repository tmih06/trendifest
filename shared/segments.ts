import type { ViewerSegment } from "./types.ts";

/**
 * Verified public Vietnamese discussion feeds. Each network gets one bounded
 * collection context; RSS excerpts are not a census of its users or replies.
 * Do not add a global discovery pool or infer an author's age from a forum.
 */
export const VIEWER_SEGMENTS: ViewerSegment[] = [
  {
    id: "voz",
    label: "VOZ",
    description: "Vietnamese community discussion excerpts from VOZ's public RSS feed.",
    source: "voz",
    feedUrl: "https://voz.vn/f/17/index.rss",
  },
  {
    id: "otofun",
    label: "Otofun",
    description: "Vietnamese community discussion excerpts from Otofun's public RSS feed.",
    source: "otofun",
    feedUrl: "https://www.otofun.net.vn/forums/77/index.rss",
  },
];
