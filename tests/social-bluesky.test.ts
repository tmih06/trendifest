import { describe, expect, test } from "bun:test";
import { contentHashOf, postPermalink, toSocialPost } from "../server/social/bluesky.ts";
import { ADOPTION_SEGMENTS, VIEWER_SEGMENTS } from "../shared/segments.ts";

/**
 * The adapter is the boundary where a wrong shape silently produces "no media"
 * rather than an error, so these cases pin the two shapes the API actually
 * returns: resolved `#view` embeds from `getFeed` and raw blob records from the
 * Jetstream tail.
 */

describe("Bluesky embed parsing", () => {
  test("reads resolved image views from getFeed", () => {
    const { post, media } = toSocialPost({
      uri: "at://did:plc:abc/app.bsky.feed.post/123",
      did: "did:plc:abc",
      handle: "someone.bsky.social",
      record: { text: "two pictures", createdAt: "2026-11-03T00:00:00.000Z" },
      embed: {
        $type: "app.bsky.embed.images#view",
        images: [
          {
            thumb: "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc/cid1",
            fullsize: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc/cid1",
            alt: "a cat",
          },
          {
            thumb: "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc/cid2",
            fullsize: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc/cid2",
            alt: "",
          },
        ],
      },
    });

    expect(post.kind).toBe("image");
    expect(media).toHaveLength(2);
    expect(media[0]!.url).toContain("feed_fullsize");
    expect(media[0]!.alt).toBe("a cat");
  });

  test("reads raw blob records from the Jetstream tail", () => {
    const { post, media } = toSocialPost({
      uri: "at://did:plc:abc/app.bsky.feed.post/456",
      did: "did:plc:abc",
      handle: null,
      record: { text: "raw shape", createdAt: "2026-11-03T00:00:00.000Z" },
      embed: {
        $type: "app.bsky.embed.images",
        images: [{ image: { ref: { $link: "bafyraw" } }, alt: "raw alt" }],
      },
    });

    expect(post.kind).toBe("image");
    expect(media[0]!.cid).toBe("bafyraw");
    expect(media[0]!.url).toContain("bafyraw");
  });

  test("reads video playlists and classifies video over its thumbnail", () => {
    const { post, media } = toSocialPost({
      uri: "at://did:plc:abc/app.bsky.feed.post/789",
      did: "did:plc:abc",
      handle: null,
      record: { text: "clip", createdAt: "2026-11-03T00:00:00.000Z" },
      embed: {
        $type: "app.bsky.embed.video#view",
        cid: "bafyvid",
        playlist: "https://video.bsky.app/watch/did/cid/playlist.m3u8",
        thumbnail: "https://video.bsky.app/watch/did/cid/thumbnail.jpg",
      },
    });

    expect(post.kind).toBe("video");
    expect(media).toHaveLength(1);
    expect(media[0]!.kind).toBe("video");
    expect(media[0]!.url).toContain("playlist.m3u8");
  });

  test("unwraps recordWithMedia so quoted posts keep their images", () => {
    const { post, media } = toSocialPost({
      uri: "at://did:plc:abc/app.bsky.feed.post/999",
      did: "did:plc:abc",
      handle: null,
      record: { text: "quote with image", createdAt: "2026-11-03T00:00:00.000Z" },
      embed: {
        $type: "app.bsky.embed.recordWithMedia#view",
        record: { $type: "app.bsky.embed.record#view", record: { uri: "at://x" } },
        media: {
          $type: "app.bsky.embed.images#view",
          images: [{ fullsize: "https://cdn.bsky.app/full", thumb: "t", alt: "" }],
        },
      },
    });

    expect(post.kind).toBe("image");
    expect(media).toHaveLength(1);
  });

  test("reports a link embed as link kind, not text", () => {
    const { post, media } = toSocialPost({
      uri: "at://did:plc:abc/app.bsky.feed.post/link",
      did: "did:plc:abc",
      handle: null,
      record: { text: "story", createdAt: "2026-11-03T00:00:00.000Z" },
      embed: {
        $type: "app.bsky.embed.external#view",
        external: { uri: "https://example.com/a", title: "Headline", description: "Deck" },
      },
    });

    expect(post.kind).toBe("link");
    expect(media[0]!.url).toBe("https://example.com/a");
    expect(media[0]!.alt).toBe("Deck");
  });

  test("a missing embed degrades to text without inventing media", () => {
    const { post, media } = toSocialPost({
      uri: "at://did:plc:abc/app.bsky.feed.post/plain",
      did: "did:plc:abc",
      handle: null,
      record: { text: "just words", createdAt: "2026-11-03T00:00:00.000Z" },
      embed: null,
    });

    expect(post.kind).toBe("text");
    expect(media).toHaveLength(0);
  });
});

describe("post identity", () => {
  test("hashes identical text identically and different text differently", () => {
    expect(contentHashOf("hello world")).toBe(contentHashOf("hello world"));
    expect(contentHashOf("hello world")).not.toBe(contentHashOf("hello worlds"));
  });

  test("builds a bsky.app permalink from an at-uri", () => {
    expect(postPermalink("at://did:plc:abc/app.bsky.feed.post/rkey1")).toBe(
      "https://bsky.app/profile/did:plc:abc/post/rkey1",
    );
  });

  test("leaves a non-AT identifier usable instead of dropping the link", () => {
    expect(postPermalink("https://example.com/x")).toBe("https://example.com/x");
  });
});

describe("viewer segment catalog", () => {
  test("every segment names at least one Bluesky feed", () => {
    for (const segment of VIEWER_SEGMENTS) {
      expect(segment.feeds.length).toBeGreaterThan(0);
      expect(segment.feeds.every((feed) => feed.startsWith("at://"))).toBe(true);
    }
  });

  test("adoption segments exclude the whole-network discovery pool", () => {
    // Counting a post that reached Discover and one niche as a crossing would
    // manufacture adoption from a pool that reaches everyone by construction.
    expect(ADOPTION_SEGMENTS.map((segment) => segment.id)).not.toContain("discover");
    expect(ADOPTION_SEGMENTS.every((segment) => segment.scope === "collection")).toBe(true);
  });

  test("segment ids are unique so observations cannot collide", () => {
    const ids = VIEWER_SEGMENTS.map((segment) => segment.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
