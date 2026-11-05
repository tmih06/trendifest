import type { ViewerSegment } from "./types.ts";

/**
 * Verified public Vietnamese collection contexts. Each network gets one bounded
 * collection context per cycle; RSS excerpts are not a census of its users or
 * replies, and an aggregated headline is one article rather than a crowd.
 * Do not add a global discovery pool or infer an author's age from a forum.
 *
 * Community discussion and news are separate evidence: the news contexts carry
 * `evidenceType: "news"` and are never counted as people, authors or reactions
 * by anything downstream.
 *
 * The four publisher contexts below name their whole section catalog in
 * `additionalFeedUrls` and are read fan-in inside one cycle. Every document was
 * read live on 2026-11-05 before being enabled (53 documents, 2,564 distinct
 * articles inside the seven-day window); front pages (`tin-moi-nhat`, `home`)
 * and the Dân trí `xa-hoi` document (frozen at September 2025) are excluded
 * because they only repeat other sections or carry stale records. VietnamNet is
 * not enabled: its section documents exceed the 1 MB response cap, its `/rss/home`
 * and `/rss/tin-moi-nhat` paths are 404, and its one small document had no
 * article inside the window.
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
  {
    id: "vnexpress",
    label: "VnExpress",
    description:
      "Articles from VnExpress' official section feeds, merged by canonical link across the " +
      "last seven days.",
    source: "vnexpress",
    evidenceType: "news",
    feedUrl: "https://vnexpress.net/rss/thoi-su.rss",
    additionalFeedUrls: [
      "https://vnexpress.net/rss/the-gioi.rss",
      "https://vnexpress.net/rss/kinh-doanh.rss",
      "https://vnexpress.net/rss/khoa-hoc.rss",
      "https://vnexpress.net/rss/giai-tri.rss",
      "https://vnexpress.net/rss/the-thao.rss",
      "https://vnexpress.net/rss/phap-luat.rss",
      "https://vnexpress.net/rss/giao-duc.rss",
      "https://vnexpress.net/rss/suc-khoe.rss",
      "https://vnexpress.net/rss/doi-song.rss",
      "https://vnexpress.net/rss/du-lich.rss",
      "https://vnexpress.net/rss/so-hoa.rss",
      "https://vnexpress.net/rss/oto-xe-may.rss",
    ],
  },
  {
    id: "tuoitre",
    label: "Tuổi Trẻ",
    description:
      "Articles from Tuổi Trẻ's official section feeds, with Vietnam wall-clock timestamps " +
      "read as UTC+07:00 and merged by canonical link.",
    source: "tuoitre",
    evidenceType: "news",
    feedUrl: "https://tuoitre.vn/rss/thoi-su.rss",
    additionalFeedUrls: [
      "https://tuoitre.vn/rss/the-gioi.rss",
      "https://tuoitre.vn/rss/kinh-doanh.rss",
      "https://tuoitre.vn/rss/cong-nghe.rss",
      "https://tuoitre.vn/rss/giai-tri.rss",
      "https://tuoitre.vn/rss/the-thao.rss",
      "https://tuoitre.vn/rss/phap-luat.rss",
      "https://tuoitre.vn/rss/giao-duc.rss",
      "https://tuoitre.vn/rss/suc-khoe.rss",
      "https://tuoitre.vn/rss/nhip-song-tre.rss",
      "https://tuoitre.vn/rss/du-lich.rss",
      "https://tuoitre.vn/rss/xe.rss",
      "https://tuoitre.vn/rss/nha-dat.rss",
      "https://tuoitre.vn/rss/ban-doc.rss",
    ],
  },
  {
    id: "thanhnien",
    label: "Thanh Niên",
    description:
      "Articles from Thanh Niên's official section feeds, merged by canonical link across the " +
      "last seven days.",
    source: "thanhnien",
    evidenceType: "news",
    feedUrl: "https://thanhnien.vn/rss/thoi-su.rss",
    additionalFeedUrls: [
      "https://thanhnien.vn/rss/the-gioi.rss",
      "https://thanhnien.vn/rss/kinh-te.rss",
      "https://thanhnien.vn/rss/cong-nghe.rss",
      "https://thanhnien.vn/rss/giai-tri.rss",
      "https://thanhnien.vn/rss/the-thao.rss",
      "https://thanhnien.vn/rss/giao-duc.rss",
      "https://thanhnien.vn/rss/suc-khoe.rss",
      "https://thanhnien.vn/rss/doi-song.rss",
      "https://thanhnien.vn/rss/du-lich.rss",
      "https://thanhnien.vn/rss/xe.rss",
      "https://thanhnien.vn/rss/ban-doc.rss",
      "https://thanhnien.vn/rss/video.rss",
      "https://thanhnien.vn/rss/gioi-tre.rss",
    ],
  },
  {
    id: "dantri",
    label: "Dân trí",
    description:
      "Articles from Dân trí's official section feeds, revalidated with the publisher's own " +
      "ETag/Last-Modified and merged by canonical link.",
    source: "dantri",
    evidenceType: "news",
    feedUrl: "https://dantri.com.vn/rss/su-kien.rss",
    additionalFeedUrls: [
      "https://dantri.com.vn/rss/the-gioi.rss",
      "https://dantri.com.vn/rss/kinh-doanh.rss",
      "https://dantri.com.vn/rss/bat-dong-san.rss",
      "https://dantri.com.vn/rss/the-thao.rss",
      "https://dantri.com.vn/rss/giao-duc.rss",
      "https://dantri.com.vn/rss/cong-nghe.rss",
      "https://dantri.com.vn/rss/giai-tri.rss",
      "https://dantri.com.vn/rss/phap-luat.rss",
      "https://dantri.com.vn/rss/suc-khoe.rss",
      "https://dantri.com.vn/rss/doi-song.rss",
      "https://dantri.com.vn/rss/du-lich.rss",
    ],
  },
];
