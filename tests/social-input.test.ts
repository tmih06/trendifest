import { describe, expect, test } from "bun:test";
import {
  acceptInput,
  MAX_MEDIA_ITEMS,
  MAX_TEXT_CHARS,
  normalizeText,
  postId,
  RETENTION_DAYS,
  type AcceptedPost,
  type InputRejection,
  type InputResult,
  type SourcePost,
} from "../server/social/input.ts";

/**
 * The input gate is the only place where untrusted feed text becomes a stored
 * record. These tests cover what a consumer can observe when it misbehaves:
 * a Vietnamese post silently dropped, an English Vietnam travel article kept,
 * a diacritic variant stored as a second post, or an id/fingerprint that leaks
 * or ignores the source.
 *
 * Dates are driven from a fixed `now` so the 30-day window and clock-skew
 * handling are deterministic.
 */

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const MINUTE = 60_000;
const DAY = 86_400_000;

const ACCENTED =
  "Trời hôm nay mát mẻ nên cả nhà mình quyết định đi dạo quanh hồ, ghé quán quen ăn bún chả rồi ngồi kể cho nhau nghe chuyện cũ.";
const UNACCENTED =
  "Em moi mua con xe may cu, chay duoc mot thang thi bi hong bo phanh truoc, mang ra tho sua thi bao phai thay ca cum phanh het gan hai trieu dong, cac bac cho em hoi gia do co hop ly khong a";
const UNACCENTED_DISCUSSION =
  "Hom qua minh di hop phu huynh o truong cua con, co giao bao la be nha minh hoc tot nhung hay noi chuyen rieng trong lop, vo chong minh ve ban nhau xem nen xu ly the nao cho hop ly";
const VIETNAM_TRAVEL_ENGLISH =
  "We spent two weeks travelling around Vietnam last summer and the food was absolutely incredible everywhere we went.";
const VIETNAM_TRAVEL_ENGLISH_PLACES =
  "Planning a trip to Vietnam next month, looking for recommendations on the best street food in Hanoi and Ho Chi Minh City.";
const UNDETERMINED = "qwrtpsdfghjklzxcvbnmqwrtpsdfghjklzxcvbnm zzzz qqqq";
const FOREIGN_SCRIPT = "สวัสดีครับวันนี้อากาศดีมากเราจะไปเที่ยวทะเลด้วยกันกับเพื่อนๆที่ทำงาน";

const BODY =
  "Buổi sáng cuối tuần cả gia đình mình thường dậy sớm, đạp xe ra công viên tập thể dục rồi ghé chợ mua đồ nấu bữa trưa.";

function sourcePost(overrides: Partial<SourcePost> = {}): SourcePost {
  return {
    source: "voz",
    title: "",
    evidenceType: "discussion",
    publisher: null,
    uri: "t/topic-88#post-4",
    authorId: "user-42",
    authorHandle: "nguoidung",
    text: BODY,
    kind: "text",
    permalink: "https://voz.vn/t/topic-88#post-4",
    publishedAt: new Date(NOW - 60 * MINUTE).toISOString(),
    timeKind: "activity",
    media: [],
    engagement: null,
    ...overrides,
  };
}

function accepted(result: InputResult): AcceptedPost {
  if (!result.accepted) throw new Error(`expected acceptance, got rejection "${result.reason}"`);
  return result.post;
}

function rejected(result: InputResult): InputRejection {
  if (result.accepted) throw new Error("expected rejection, got acceptance");
  return result.reason;
}

describe("Vietnamese language gate", () => {
  test("accepts long Vietnamese text with and without diacritics", () => {
    const accented = accepted(acceptInput(sourcePost({ text: ACCENTED }), NOW));
    expect(accented.language).toBe("vi");
    expect(accented.text).toBe(ACCENTED);

    const unaccented = accepted(acceptInput(sourcePost({ text: UNACCENTED }), NOW));
    expect(unaccented.language).toBe("vi");
    expect(unaccented.text).toBe(UNACCENTED);

    const discussion = accepted(acceptInput(sourcePost({ text: UNACCENTED_DISCUSSION }), NOW));
    expect(discussion.language).toBe("vi");
  });

  test("rejects English Vietnam-travel text that mentions Vietnamese places", () => {
    expect(rejected(acceptInput(sourcePost({ text: VIETNAM_TRAVEL_ENGLISH }), NOW))).toBe(
      "language",
    );
    expect(rejected(acceptInput(sourcePost({ text: VIETNAM_TRAVEL_ENGLISH_PLACES }), NOW))).toBe(
      "language",
    );
  });

  test("rejects empty, short, URL-only, and undetermined text", () => {
    expect(rejected(acceptInput(sourcePost({ text: " \n\t\u00a0\u200b\ufeff " }), NOW))).toBe(
      "empty",
    );
    expect(rejected(acceptInput(sourcePost({ text: "😀😀😀😀😀" }), NOW))).toBe("short");
    expect(rejected(acceptInput(sourcePost({ text: "Việt Nam quê hương tôi" }), NOW))).toBe(
      "short",
    );
    expect(rejected(acceptInput(sourcePost({ text: "@nguoidung @motnguoidungkhac" }), NOW))).toBe(
      "short",
    );

    // The URL is long, but links carry no language evidence.
    expect(
      rejected(
        acceptInput(
          sourcePost({
            text: "https://voz.vn/t/ban-luan-ve-xe-co-va-duong-pho-rat-dai.123456/ hay quá",
          }),
          NOW,
        ),
      ),
    ).toBe("short");

    expect(rejected(acceptInput(sourcePost({ text: UNDETERMINED }), NOW))).toBe("language");
    expect(rejected(acceptInput(sourcePost({ text: FOREIGN_SCRIPT }), NOW))).toBe("language");
  });
});

describe("Unicode and whitespace normalization", () => {
  test("canonically composes Vietnamese and strips invisible padding without losing diacritics", () => {
    expect(normalizeText(BODY.normalize("NFD"))).toBe(BODY);
    expect(normalizeText("\u0000Hà\u200bNội\ufeff  ")).toBe("Hà Nội");
    expect(normalizeText("\u0000\u001f\u007f\u200b\u200f\ufeff")).toBe("");
  });

  test("stores one normalized form and one fingerprint for equivalent Vietnamese input", () => {
    const plain = accepted(acceptInput(sourcePost(), NOW));

    const nfd = accepted(acceptInput(sourcePost({ text: BODY.normalize("NFD") }), NOW));
    expect(nfd.text).toBe(BODY);
    expect(nfd.contentHash).toBe(plain.contentHash);

    const padded = accepted(
      acceptInput(
        sourcePost({
          text: `  \ufeff${BODY.replaceAll(" ", "\u00a0\u200b").replace("mình", "\nmình\t")}  `,
        }),
        NOW,
      ),
    );
    expect(padded.text).toBe(BODY);
    expect(padded.contentHash).toBe(plain.contentHash);
  });
});

describe("source-qualified identity", () => {
  test("namespaces native ids and authors by source", () => {
    expect(postId("voz", "t/topic-88#post-4")).toBe("voz:t/topic-88#post-4");
    expect(postId("otofun", "t/topic-88#post-4")).toBe("otofun:t/topic-88#post-4");

    const voz = accepted(acceptInput(sourcePost(), NOW));
    expect(voz.id).toBe("voz:t/topic-88#post-4");
    expect(voz.authorId).toBe("voz:user-42");
    expect(voz.authorHandle).toBe("nguoidung");

    const otofun = accepted(
      acceptInput(
        sourcePost({
          source: "otofun",
          uri: "threads/9999",
          permalink: "https://www.otofun.net.vn/threads/9999#post-2",
        }),
        NOW,
      ),
    );
    expect(otofun.id).toBe("otofun:threads/9999");
    expect(otofun.authorId).toBe("otofun:user-42");
    expect(otofun.id).not.toBe(voz.id);
  });

  test("marks a missing author as source-scoped unknown rather than fabricating one", () => {
    const anonymous = accepted(
      acceptInput(sourcePost({ authorId: null, authorHandle: null }), NOW),
    );
    expect(anonymous.authorId.startsWith("voz:")).toBe(true);
    expect(anonymous.authorHandle).toBeNull();

    const anonymousOtofun = accepted(
      acceptInput(
        sourcePost({
          source: "otofun",
          uri: "threads/9999",
          authorId: null,
          authorHandle: null,
          permalink: "https://www.otofun.net.vn/threads/9999",
        }),
        NOW,
      ),
    );
    expect(anonymousOtofun.authorId.startsWith("otofun:")).toBe(true);
    expect(anonymousOtofun.authorId).not.toBe(anonymous.authorId);
  });
});

describe("content fingerprints", () => {
  test("keeps one fingerprint for identical content from different sources while the records stay distinct", () => {
    const voz = accepted(acceptInput(sourcePost(), NOW));
    const otofun = accepted(
      acceptInput(
        sourcePost({
          source: "otofun",
          uri: "threads/9999",
          authorId: "user-99",
          authorHandle: "khac",
          permalink: "https://www.otofun.net.vn/threads/9999",
          timeKind: "published",
        }),
        NOW,
      ),
    );

    expect(otofun.contentHash).toBe(voz.contentHash);
    expect(otofun.id).not.toBe(voz.id);
    expect(otofun.authorId).not.toBe(voz.authorId);
    expect(otofun.text).toBe(voz.text);
  });

  test("changes the fingerprint when text or media actually changes", () => {
    const original = accepted(acceptInput(sourcePost(), NOW));

    const edited = accepted(
      acceptInput(sourcePost({ text: BODY.replace("bữa trưa", "bữa tối") }), NOW),
    );
    expect(edited.contentHash).not.toBe(original.contentHash);

    const withImage = accepted(
      acceptInput(sourcePost({ media: [{ kind: "image", url: "https://voz.vn/anh-1.jpg" }] }), NOW),
    );
    expect(withImage.contentHash).not.toBe(original.contentHash);

    const otherImage = accepted(
      acceptInput(sourcePost({ media: [{ kind: "image", url: "https://voz.vn/anh-2.jpg" }] }), NOW),
    );
    expect(otherImage.contentHash).not.toBe(withImage.contentHash);

    const repeated = accepted(
      acceptInput(sourcePost({ media: [{ kind: "image", url: "https://voz.vn/anh-1.jpg" }] }), NOW),
    );
    expect(repeated.contentHash).toBe(withImage.contentHash);
  });
});

describe("bounds", () => {
  test("caps stored text at MAX_TEXT_CHARS and ignores characters past the cap", () => {
    const urls = Array.from(
      { length: 20 },
      (_, index) =>
        `https://voz.vn/t/ban-luan-ve-xe-co-va-duong-pho-rat-dai-${index}-${"x".repeat(120)}`,
    );
    const raw = `${BODY} ${urls.join(" ")}`;
    expect(raw.length).toBeGreaterThan(MAX_TEXT_CHARS);

    const post = accepted(acceptInput(sourcePost({ text: raw }), NOW));
    expect(post.text.length).toBe(MAX_TEXT_CHARS);
    expect(post.text.startsWith(BODY)).toBe(true);

    const beyond = accepted(acceptInput(sourcePost({ text: `${raw} thêm vài chữ nữa` }), NOW));
    expect(beyond.text.length).toBe(MAX_TEXT_CHARS);
    expect(beyond.contentHash).toBe(post.contentHash);
  });

  test("caps media at MAX_MEDIA_ITEMS and drops non-http(s) attachments", () => {
    const post = accepted(
      acceptInput(
        sourcePost({
          media: [
            { kind: "image", url: "javascript:alert(1)" },
            { kind: "image", url: "https://voz.vn/anh-1.jpg" },
            { kind: "link", url: "mailto:nguoidung@example.com" },
            { kind: "image", url: "https://voz.vn/anh-2.jpg" },
            { kind: "video", url: "https://voz.vn/clip-3.mp4" },
            { kind: "audio", url: "https://voz.vn/ghi-am-4.mp3" },
            { kind: "image", url: "https://voz.vn/anh-5.jpg" },
          ],
        }),
        NOW,
      ),
    );

    expect(post.media.length).toBe(MAX_MEDIA_ITEMS);
    expect(post.media).toEqual([
      { kind: "image", url: "https://voz.vn/anh-1.jpg" },
      { kind: "image", url: "https://voz.vn/anh-2.jpg" },
      { kind: "video", url: "https://voz.vn/clip-3.mp4" },
      { kind: "audio", url: "https://voz.vn/ghi-am-4.mp3" },
    ]);
  });

  test("rejects unsupported permalinks and empty native ids", () => {
    expect(rejected(acceptInput(sourcePost({ permalink: "javascript:alert(1)" }), NOW))).toBe(
      "url",
    );
    expect(rejected(acceptInput(sourcePost({ permalink: "ftp://voz.vn/t/topic-88" }), NOW))).toBe(
      "url",
    );
    expect(rejected(acceptInput(sourcePost({ uri: "   " }), NOW))).toBe("url");
  });
});

describe("date window", () => {
  test("rejects stale and unparseable dates", () => {
    const stale = new Date(NOW - RETENTION_DAYS * DAY - 1_000).toISOString();
    expect(rejected(acceptInput(sourcePost({ publishedAt: stale }), NOW))).toBe("date");

    const edge = new Date(NOW - RETENTION_DAYS * DAY).toISOString();
    expect(accepted(acceptInput(sourcePost({ publishedAt: edge }), NOW)).publishedAt).toBe(edge);

    expect(rejected(acceptInput(sourcePost({ publishedAt: "not-a-date" }), NOW))).toBe("date");
  });

  test("rejects clearly future dates but clamps tolerated clock skew to now", () => {
    const clearlyFuture = new Date(NOW + 2 * MINUTE).toISOString();
    expect(rejected(acceptInput(sourcePost({ publishedAt: clearlyFuture }), NOW))).toBe("date");

    const skewed = accepted(
      acceptInput(sourcePost({ publishedAt: new Date(NOW + 30_000).toISOString() }), NOW),
    );
    expect(skewed.publishedAt).toBe(new Date(NOW).toISOString());
  });
});
