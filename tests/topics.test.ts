import { describe, expect, test } from "bun:test";
import { embedTopicText, topicDocumentText } from "../server/social/topic-embedding.ts";
import {
  groupSpecificTopics,
  radiusForPotential,
  relatedTopicEdges,
  scoreTopic,
  topicPairScore,
  type TopicEvidence,
} from "../server/social/topics.ts";

/**
 * Behavioural regressions for specific-topic grouping.
 *
 * The grouping rules exist because a cosine threshold alone cannot do this job:
 * on real Vietnamese text a chat greeting and an unrelated paragraph reached
 * 0.9097 while a genuine event paraphrase scored 0.8958, and GPT-5 sits at
 * 0.906-0.98 from GPT-4.1. These tests exercise the real E5 model alongside
 * deterministic identity guards; unavailable inference must fail, not skip.
 *
 * The model cases are the acceptance battery: same-model paraphrases must merge,
 * different versions/models must not, the reported Olympia salute controversy
 * must group while the winner story and a 1936 documentary stay apart, and
 * unrelated chatter must never be attached to an employment or car topic.
 */

const NOW = new Date("2026-11-05T12:00:00.000Z");

/** Build a record; vectors are supplied per test so rules can be tested alone. */
function record(
  id: string,
  title: string,
  text: string,
  overrides: Partial<TopicEvidence> = {},
): TopicEvidence {
  return {
    id,
    title,
    text,
    source: "voz",
    evidenceType: "discussion",
    publisher: null,
    authorId: `voz:${id}`,
    authorHandle: id,
    permalink: `https://voz.vn/t/${id}/`,
    kind: "text",
    timeKind: "activity",
    mediaCount: 0,
    contentHash: `hash-${id}`,
    publishedAt: NOW,
    firstCollectedAt: NOW,
    observedAt: NOW,
    segments: ["voz"],
    // Rules are vector-independent; unit vectors of identical direction keep the
    // similarity component satisfied when a test is about lexical guards only.
    vector: [1, 0, 0],
    ...overrides,
  };
}

/** A unit vector along one axis angle, so cosine between two records is explicit. */
function vectorAt(cosine: number) {
  return [cosine, Math.sqrt(Math.max(0, 1 - cosine * cosine)), 0];
}

/** Embed a batch with the same document rules ingest uses. */
async function embed(records: { key: string; title: string; text: string }[]) {
  const vectors = new Map<string, number[]>();
  for (const item of records) {
    const embedded = await embedTopicText(topicDocumentText(item.title, item.text));
    expect(embedded.status).toBe("ok");
    if (embedded.status === "ok") vectors.set(item.key, embedded.value);
  }
  return vectors;
}

describe("specific-topic grouping rules", () => {
  test("a threshold alone would merge chat, so unanchored records never pair", () => {
    // Both records are pure greetings: they share words and sit above any
    // plausible floor, yet neither names an event.
    const greeting = record(
      "chat-a",
      "Chào mọi người",
      "Chào mọi người, hôm nay trời đẹp quá, đi đâu chơi không",
      { vector: vectorAt(1) },
    );
    const other = record("chat-b", "Chào cả nhà", "Chào cả nhà, chúc mọi người một ngày tốt lành", {
      vector: vectorAt(1),
    });
    expect(topicPairScore(greeting, other, { threshold: 0 }).matches).toBe(false);
  });

  test("records naming different versions of one family are different topics", () => {
    const gpt5 = record(
      "g5",
      "OpenAI ra mắt GPT-5",
      "OpenAI ra mắt GPT-5 với suy luận nhiều bước",
      {
        vector: vectorAt(1),
      },
    );
    const gpt41 = record(
      "g41",
      "OpenAI cập nhật GPT-4.1",
      "OpenAI cập nhật GPT-4.1 với ngữ cảnh dài",
      {
        vector: vectorAt(1),
      },
    );
    // Identical vectors prove the version rule, not the similarity, is deciding.
    expect(topicPairScore(gpt5, gpt41, { threshold: 0 }).matches).toBe(false);
    const groups = groupSpecificTopics([gpt5, gpt41]);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.members.length === 1)).toBe(true);
  });

  test("a shared show name does not merge its winner story with a controversy", () => {
    const controversy = record(
      "salute",
      "Thí sinh chào kiểu phát xít trong đêm chung kết Olympia",
      "Thí sinh chào kiểu phát xít trong đêm chung kết Olympia gây tranh cãi",
      { vector: vectorAt(1) },
    );
    const winner = record(
      "winner",
      "Thí sinh Hà Nội giành vòng nguyệt quế chung kết Olympia 2026",
      "Thí sinh Hà Nội giành vòng nguyệt quế chung kết Olympia 2026",
      { vector: vectorAt(1) },
    );
    expect(topicPairScore(controversy, winner, { threshold: 0 }).matches).toBe(false);
  });

  test("a historical document is not the same incident as a current report", () => {
    const current = record(
      "current",
      "Nam sinh chào kiểu phát xít trên đài truyền hình Việt Nam",
      "Nam sinh chào kiểu phát xít trên đài truyền hình Việt Nam",
      { vector: vectorAt(1) },
    );
    const history = record(
      "history",
      "Phim tài liệu về lễ chào kiểu phát xít tại Olympic Berlin 1936",
      "Phim tài liệu về lễ chào kiểu phát xít tại Olympic Berlin 1936",
      { vector: vectorAt(1) },
    );
    expect(topicPairScore(current, history, { threshold: 0 }).matches).toBe(false);
  });

  test("same place name, different kind of place, stays separate", () => {
    const school = record(
      "school",
      "Cháy lớn ở trường Tiểu học Kim Liên",
      "Cháy lớn ở trường Tiểu học Kim Liên, học sinh được sơ tán kịp thời",
      { vector: vectorAt(1) },
    );
    const market = record(
      "market",
      "Cháy lớn ở chợ Kim Liên",
      "Cháy lớn ở chợ Kim Liên, hàng hóa bị thiêu rụi hoàn toàn",
      { vector: vectorAt(1) },
    );
    expect(topicPairScore(school, market, { threshold: 0 }).matches).toBe(false);
  });

  test("sharing only a product name does not merge two different incidents", () => {
    // Measured at cosine 0.9104 on the collected corpus: one car, two incidents.
    const crash = record(
      "vf3-crash",
      "Tin mới vụ nữ tài xế VF3 chèn ép, va chạm với người đang mang thai",
      "Tin mới vụ nữ tài xế VF3 chèn ép, va chạm với người đang mang thai điều khiển xe máy điện",
      { vector: [1, 0, 0] },
    );
    const clip = record(
      "vf3-clip",
      "Chia sẻ clip cặp đôi trên xe VF3 ở Sài Gòn",
      "Clip cặp đôi ‘ái ân’ trên xe VF3 ở Sài Gòn lan truyền trên mạng xã hội, nhiều người bình luận",
      { vector: vectorAt(0.9104) },
    );
    expect(topicPairScore(crash, clip).matches).toBe(false);
  });

  test("generic forum vocabulary is not identity evidence", () => {
    // Two unrelated long forum posts that share only common words such as
    // "thời gian", "công ty", "ngày". Cosine is high in the collected corpus.
    const first = record(
      "forum-a",
      "Ngày đầu trải nghiệm",
      "Sau 2 tháng thử việc thì công ty cho nghỉ, thời gian gần đây mình thấy mệt mỏi và muốn tìm việc khác ở Hà Nội",
      { vector: vectorAt(0.9028) },
    );
    const second = record(
      "forum-b",
      "Còn hai tháng nữa hết năm",
      "Còn hai tháng nữa hết năm các bác còn dự định gì không, thời gian trôi nhanh quá, công ty năm nay khó khăn",
      { vector: vectorAt(0.9028) },
    );
    expect(topicPairScore(first, second).matches).toBe(false);
  });

  test("sharing a quantity is not sharing an occurrence", () => {
    const salary = record(
      "salary-a",
      "Thu nhập 15tr ở HN",
      "Thu nhập 15tr ở Hà Nội liệu có phải mức phổ biến không các bác",
      { vector: vectorAt(0.999) },
    );
    const bonus = record(
      "salary-b",
      "Thưởng 15tr dịp Tết",
      "Công ty thưởng 15tr dịp Tết cho nhân viên, các bác thấy thế nào",
      { vector: vectorAt(0.999) },
    );
    expect(topicPairScore(salary, bonus).matches).toBe(false);
  });

  test("membership is complete linkage, so a chain cannot merge strangers", () => {
    // A~B and B~C clear the floor, A~C does not. Single linkage would produce one
    // group of three; complete linkage must keep C out of A and B's group.
    const a = record("a", "VinFast ra mắt xe VF3 tại Hà Nội", "VinFast ra mắt xe VF3 tại Hà Nội", {
      vector: vectorAt(0.95),
    });
    const b = record(
      "b",
      "VinFast ra mắt xe VF3 tại Hà Nội hôm nay",
      "VinFast ra mắt xe VF3 tại Hà Nội hôm nay",
      { vector: vectorAt(0.9) },
    );
    const c = record(
      "c",
      "VinFast ra mắt xe VF3 với giá mới",
      "VinFast ra mắt xe VF3 với giá mới",
      {
        vector: [0.9, 0, 0.44],
      },
    );
    const groups = groupSpecificTopics([a, b, c]);
    const sizes = groups.map((group) => group.members.length);
    expect(Math.max(...sizes)).toBeLessThan(3);
  });

  test("grouping ignores input order and is stable across runs", () => {
    const items = [
      record("x1", "OpenAI ra mắt GPT-5", "OpenAI ra mắt GPT-5 hôm nay", {
        vector: vectorAt(0.99),
      }),
      record("x2", "OpenAI công bố GPT-5", "OpenAI công bố GPT-5 với suy luận", {
        vector: vectorAt(0.98),
      }),
      record("y1", "Anthropic ra mắt Claude 4", "Anthropic ra mắt Claude 4", {
        vector: vectorAt(0.99),
      }),
    ];
    const partition = (groups: { id: string; members: { id: string }[] }[]) =>
      groups
        .map((group) => ({
          id: group.id,
          members: group.members.map((member) => member.id).sort(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

    const forward = partition(groupSpecificTopics(items));
    const backward = partition(groupSpecificTopics([...items].reverse()));

    // Same records, same ids, same partition — whichever order they arrived in.
    expect(forward).toEqual(backward);
    expect(new Set(forward.map((group) => group.id)).size).toBe(forward.length);
    expect(forward).toHaveLength(2);
  });

  test("republishing one report through two collector paths is one report", () => {
    const direct = record(
      "news-direct",
      "Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam",
      "Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam",
      {
        evidenceType: "news",
        publisher: "Người Việt",
        authorId: "nguoi-viet:unknown",
        permalink: "https://www.nguoi-viet.com/viet-nam/nam-sinh-chao-kieu-phat-xit/",
        vector: vectorAt(0.99),
        segments: ["nguoi-viet"],
      },
    );
    const syndicated = record(
      "news-google",
      "Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam",
      "Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam",
      {
        evidenceType: "news",
        publisher: "Nguoi Viet Online",
        authorId: "google-news:unknown",
        permalink: "https://news.google.com/rss/articles/CBMi123",
        vector: vectorAt(0.99),
        segments: ["google-news"],
      },
    );
    const [group] = groupSpecificTopics([direct, syndicated]);
    expect(group!.newsPosts).toBe(1);
    expect(group!.publishers).toBe(1);
    // The survivor is the direct publisher link, not the opaque aggregator URL.
    expect(group!.representative.permalink).toBe(direct.permalink);
  });

  test("one specific topic grows beyond twelve independent posts", () => {
    const reactions = [
      "lập trình",
      "giải toán",
      "dịch thuật",
      "viết văn",
      "ngữ cảnh",
      "suy luận",
      "tốc độ",
      "chi phí",
      "độ chính xác",
      "bộ nhớ",
      "tìm kiếm",
      "học tập",
      "nghiên cứu",
      "thiết kế",
      "âm thanh",
      "hình ảnh",
      "kiến thức",
      "ngôn ngữ",
      "tóm tắt",
      "phân tích",
    ];
    const groups = groupSpecificTopics(
      reactions.map((reaction, index) =>
        record(`growth-${index}`, "OpenAI ra mắt GPT-5", `Đánh giá GPT-5 về ${reaction}`),
      ),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.discussionPosts).toBe(reactions.length);
    expect(groups[0]!.authors).toBe(reactions.length);
  });

  test("unknown forum authors do not become invented community accounts", () => {
    const [group] = groupSpecificTopics([
      record("anonymous", "OpenAI ra mắt GPT-5", "OpenAI ra mắt GPT-5", {
        authorId: "voz:unknown",
        authorHandle: null,
      }),
    ]);
    expect(group!.discussionPosts).toBe(1);
    expect(group!.authors).toBe(0);
  });

  test("one author repeating a post is one post, not independent support", () => {
    const first = record("rep-1", "Xe VF3 gặp sự cố", "Xe VF3 gặp sự cố trên đường", {
      text: "Xe VF3 gặp sự cố trên đường",
      contentHash: "hash-1",
      vector: vectorAt(0.99),
    });
    // Same account, same content, a second stored record: one post reposted.
    const copy = record("rep-2", "Xe VF3 gặp sự cố", "Xe VF3 gặp sự cố trên đường", {
      authorId: "voz:rep-1",
      contentHash: "hash-1",
      vector: vectorAt(0.99),
    });
    const [group] = groupSpecificTopics([first, copy]);
    expect(group!.discussionPosts).toBe(1);
    expect(group!.authors).toBe(1);
  });
});

describe("topic scoring and radius", () => {
  const strongGroup = groupSpecificTopics([
    record("s1", "OpenAI ra mắt GPT-5", "OpenAI ra mắt GPT-5 với suy luận nhiều bước", {
      vector: vectorAt(0.99),
      authorId: "voz:an",
      segments: ["voz"],
    }),
    record("s2", "OpenAI công bố GPT-5", "OpenAI công bố GPT-5 cho lập trình viên", {
      vector: vectorAt(0.98),
      authorId: "otofun:binh",
      source: "otofun",
      segments: ["otofun"],
    }),
    record("s3", "GPT-5 chính thức ra mắt", "GPT-5 chính thức ra mắt với cửa sổ ngữ cảnh lớn", {
      vector: vectorAt(0.97),
      authorId: "voz:chi",
      segments: ["voz"],
    }),
  ])[0]!;

  const oneOffGroup = groupSpecificTopics([
    record("o1", "Quán phở mới mở ở phố cổ", "Quán phở bò gia truyền mới mở ở phố cổ Hà Nội", {
      vector: vectorAt(0.5),
    }),
  ])[0]!;

  test("independent evidence outranks a one-off and draws a larger radius", () => {
    const strong = scoreTopic(strongGroup, { now: NOW, observedSpanHours: 48 });
    const oneOff = scoreTopic(oneOffGroup, { now: NOW, observedSpanHours: 48 });
    expect(strong.authors).toBeGreaterThan(oneOff.authors);
    expect(strong.potential).toBeGreaterThan(oneOff.potential);
    expect(radiusForPotential(strong.potential)).toBeGreaterThan(
      radiusForPotential(oneOff.potential),
    );
  });

  test("radius is monotonic in potential", () => {
    const radii = [0, 10, 25, 50, 75, 100].map(radiusForPotential);
    for (let index = 1; index < radii.length; index += 1) {
      expect(radii[index]!).toBeGreaterThan(radii[index - 1]!);
    }
  });

  test("growth stays neutral before two comparable windows exist", () => {
    const cold = scoreTopic(strongGroup, { now: NOW, observedSpanHours: 3 });
    expect(cold.velocity).toBe(0.5);
    const warm = scoreTopic(strongGroup, { now: NOW, observedSpanHours: 48 });
    expect(warm.velocity).not.toBe(0.5);
  });

  test("one account repeating itself cannot outrank several accounts", () => {
    const repeated = groupSpecificTopics([
      record("r1", "OpenAI ra mắt GPT-5", "OpenAI ra mắt GPT-5 với suy luận", {
        vector: vectorAt(0.99),
        authorId: "voz:same",
        contentHash: "h1",
      }),
      record("r2", "OpenAI ra mắt GPT-5", "OpenAI ra mắt GPT-5 với suy luận", {
        vector: vectorAt(0.99),
        authorId: "voz:same",
        contentHash: "h2",
      }),
    ])[0]!;
    expect(scoreTopic(repeated, { now: NOW, observedSpanHours: 48 }).authors).toBe(1);
    expect(scoreTopic(strongGroup, { now: NOW, observedSpanHours: 48 }).authors).toBeGreaterThan(1);
  });
});

describe("related-topic edges", () => {
  test("related model versions stay separate topics but connect through their shared family", () => {
    const groups = groupSpecificTopics([
      record("a", "OpenAI ra mắt GPT-5", "OpenAI ra mắt GPT-5 với suy luận nhiều bước", {
        vector: vectorAt(0.99),
      }),
      record("b", "OpenAI công bố GPT-5", "OpenAI công bố GPT-5 cho lập trình viên", {
        vector: vectorAt(0.98),
      }),
      record("c", "OpenAI cập nhật GPT-4.1", "OpenAI cập nhật GPT-4.1 với ngữ cảnh dài", {
        vector: vectorAt(0.99),
      }),
    ]);
    expect(groups.length).toBe(2);
    const ids = new Set(groups.map((group) => group.id));
    for (const edge of relatedTopicEdges(groups)) {
      expect(edge.source).not.toBe(edge.target);
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
    // Relatedness does not imply event/model identity.
    const gpt5 = groups.find((group) => group.members.some((member) => member.id === "a"))!;
    const gpt41 = groups.find((group) => group.members.some((member) => member.id === "c"))!;
    const joins = relatedTopicEdges(groups).some(
      (edge) =>
        (edge.source === gpt5.id && edge.target === gpt41.id) ||
        (edge.source === gpt41.id && edge.target === gpt5.id),
    );
    expect(joins).toBe(true);
  });

  test("a shared specific phrase connects different events without a repeated proper name", () => {
    const records = [
      record(
        "blood-test",
        "Chỉ số xét nghiệm máu tại bệnh viện Chợ Rẫy",
        "Chỉ số xét nghiệm máu tại bệnh viện Chợ Rẫy",
      ),
      record(
        "donation",
        "Hiến máu và xét nghiệm máu ở bệnh viện Bạch Mai",
        "Hiến máu và xét nghiệm máu ở bệnh viện Bạch Mai",
      ),
    ];
    const groups = records.flatMap((item) => groupSpecificTopics([item]));
    expect(groups).toHaveLength(2);
    expect(relatedTopicEdges(groups).map((edge) => [edge.source, edge.target])).toEqual([
      [groups[0]!.id, groups[1]!.id],
    ]);
  });

  test("sharing only a city or a quantity does not establish a relationship", () => {
    const groups = [
      record(
        "restaurant",
        "Quán phở Hà Nội bán 100 bát",
        "Quán phở Hà Nội bán 100 bát. Tại Việt Nam, đây là món ăn quen thuộc.",
      ),
      record(
        "jobs",
        "Tuyển dụng Hà Nội nhận 100 hồ sơ",
        "Tuyển dụng Hà Nội nhận 100 hồ sơ. Tại Việt Nam, ứng viên có nhiều lựa chọn.",
      ),
    ].flatMap((item) => groupSpecificTopics([item]));
    expect(groups).toHaveLength(2);
    expect(relatedTopicEdges(groups)).toEqual([]);
  });

  test("Vietnamese date words do not invent conflicting product families", () => {
    const a = record("nov", "OpenAI công bố GPT-5", "OpenAI công bố GPT-5 trong tháng 11 năm 2026");
    const b = record("dec", "Trải nghiệm GPT-5", "Trải nghiệm GPT-5 trong tháng 12 năm 2026");
    expect(topicPairScore(a, b).matches).toBe(true);
  });

  test("shared body boilerplate cannot link unrelated subjects", () => {
    const boilerplate =
      "Thông tin trong cuộc sống hằng ngày được chia sẻ để mọi người hiểu rõ hơn.";
    const groups = [
      record("chat", "Góc tâm sự tại Hà Nội", `${boilerplate} Tôi muốn kể chuyện gia đình.`),
      record("ants", "Diệt kiến tại Sài Gòn", `${boilerplate} Cách xử lý côn trùng trong nhà.`),
    ].flatMap((item) => groupSpecificTopics([item]));
    expect(groups).toHaveLength(2);
    expect(relatedTopicEdges(groups)).toEqual([]);
  });

  test("degree stays capped so the graph cannot become a hairball", () => {
    const places = ["trường", "chợ", "quán", "xưởng", "nhà", "cửa hàng", "rạp", "trạm"];
    const groups = places.flatMap((place, index) =>
      groupSpecificTopics([
        record(
          `n${index}`,
          `Cháy lớn gây thiệt hại tại ${place} Kim Liên`,
          `Cháy lớn gây thiệt hại tại ${place} Kim Liên`,
        ),
      ]),
    );
    const edges = relatedTopicEdges(groups, { maxDegree: 3 });
    expect(
      edges.some((edge) => edge.source === groups[0]!.id || edge.target === groups[0]!.id),
    ).toBe(true);
    const degree = new Map<string, number>();
    for (const edge of edges) {
      for (const node of [edge.source, edge.target]) {
        degree.set(node, (degree.get(node) ?? 0) + 1);
      }
    }
    for (const value of degree.values()) expect(value).toBeLessThanOrEqual(3);
  });
  test("a related pair after a dense unrelated prefix is not discarded", () => {
    const groups = Array.from({ length: 260 }, (_, index) => {
      const title = `OpenAI ra mắt GPT-${100 + index}`;
      return groupSpecificTopics([
        record(`prefix-${index}`, title, title, { vector: [0, 1, 0] }),
      ])[0]!;
    });
    const left = groupSpecificTopics([
      record("tail-5", "OpenAI ra mắt GPT-5", "OpenAI ra mắt GPT-5"),
    ])[0]!;
    const right = groupSpecificTopics([
      record("tail-41", "OpenAI ra mắt GPT-4.1", "OpenAI ra mắt GPT-4.1"),
    ])[0]!;
    groups.push(left, right);
    const edges = relatedTopicEdges(groups);
    expect(
      edges.some(
        (edge) =>
          (edge.source === left.id && edge.target === right.id) ||
          (edge.source === right.id && edge.target === left.id),
      ),
    ).toBe(true);
    const tailIds = new Set([left.id, right.id]);
    expect(edges.filter((edge) => tailIds.has(edge.source) !== tailIds.has(edge.target))).toEqual(
      [],
    );
  });
});

describe("real E5 model acceptance battery", () => {
  /**
   * Paraphrases that must land in one topic, and neighbours that must not. Every
   * string is written as Vietnamese editors would write it; none is a copy of
   * another, so a merge here is a paraphrase merge, not a near-duplicate.
   */
  const battery = {
    gpt5: [
      "OpenAI vừa ra mắt GPT-5, mô hình mới nhất có khả năng suy luận mạnh hơn hẳn",
      "GPT-5 đã chính thức được OpenAI công bố với khả năng suy nghĩ theo từng bước",
      "Người dùng thử GPT-5 và nhận thấy mô hình của OpenAI trả lời câu hỏi khó tốt hơn",
    ],
    gpt41: ["OpenAI tung bản cập nhật GPT-4.1 với cửa sổ ngữ cảnh lớn cho lập trình viên"],
    claude4: ["Anthropic ra mắt Claude 4 với khả năng lập trình được đánh giá vượt trội"],
    olympia: [
      "Nam sinh chào kiểu phát xít trên đài truyền hình Việt Nam",
      "Nam sinh chào kiểu phát xít trên sóng truyền hình gây làn sóng phẫn nộ",
      "Thí sinh chào kiểu phát xít trong đêm chung kết Olympia gây tranh cãi",
    ],
    winner: [
      "Thí sinh Hà Nội giành vòng nguyệt quế chung kết Olympia 2026",
      "Nhà vô địch Olympia 2026 chính thức lộ diện sau phần thi vượt chướng ngại vật",
    ],
    history: ["Phim tài liệu về lễ chào kiểu phát xít tại Olympic Berlin 1936"],
    offtopic: [
      "Chào cả nhà, hôm nay trời đẹp quá, mọi người đi đâu chơi không",
      "Chào mọi người buổi sáng, chúc một ngày tốt lành, trời hôm nay mát mẻ",
    ],
    it: ["Tuyển dụng IT tại Hà Nội đang giảm mạnh, nhiều công ty sa thải nhân sự"],
  };

  test("paraphrases of one model merge while other models and versions do not", async () => {
    const items = [
      ...battery.gpt5.map((text, index) => ({ key: `gpt5-${index}`, title: "", text })),
      { key: "gpt41-0", title: "", text: battery.gpt41[0]! },
      { key: "claude4-0", title: "", text: battery.claude4[0]! },
    ];
    const vectors = await embed(items);
    const records = items.map((item) =>
      record(item.key, item.title, item.text, { vector: vectors.get(item.key)! }),
    );
    const groups = groupSpecificTopics(records);

    const gpt5Ids = groups
      .filter((group) => group.members.some((member) => member.id.startsWith("gpt5-")))
      .map((group) => group.members.map((member) => member.id).sort());
    expect(gpt5Ids).toHaveLength(1);
    expect(gpt5Ids[0]).toEqual(["gpt5-0", "gpt5-1", "gpt5-2"]);

    // Different model and different version stay their own topics.
    const gpt41Group = groups.find((group) =>
      group.members.some((member) => member.id === "gpt41-0"),
    )!;
    expect(gpt41Group.members).toHaveLength(1);
    const claudeGroup = groups.find((group) =>
      group.members.some((member) => member.id === "claude4-0"),
    )!;
    expect(claudeGroup.members).toHaveLength(1);
    expect(gpt41Group.id).not.toBe(claudeGroup.id);
  }, 60_000);

  test("the reported salute controversy groups while the winner story and 1936 stay out", async () => {
    const items = [
      ...battery.olympia.map((text, index) => ({ key: `olympia-${index}`, title: "", text })),
      ...battery.winner.map((text, index) => ({ key: `winner-${index}`, title: "", text })),
      { key: "history-0", title: "", text: battery.history[0]! },
    ];
    const vectors = await embed(items);
    const records = items.map((item) =>
      record(item.key, item.title, item.text, { vector: vectors.get(item.key)! }),
    );
    const groups = groupSpecificTopics(records);

    const eventGroup = groups.find((group) =>
      group.members.some((member) => member.id.startsWith("olympia-")),
    )!;
    expect(
      eventGroup.members.filter((member) => member.id.startsWith("olympia-")).length,
    ).toBeGreaterThanOrEqual(2);
    const eventIds = new Set(eventGroup.members.map((member) => member.id));
    expect(eventIds.has("history-0")).toBe(false);
    expect([...eventIds].some((id) => id.startsWith("winner-"))).toBe(false);

    // The winner story is its own topic (and may legitimately contain both of its
    // paraphrases), never folded into the controversy.
    const winnerIds = groups
      .filter((group) => group.members.some((member) => member.id.startsWith("winner-")))
      .flatMap((group) => group.members.map((member) => member.id));
    expect(winnerIds.length).toBeGreaterThan(0);
    expect(winnerIds).not.toContain("history-0");
  }, 60_000);

  test("off-topic chatter is not attached to an employment topic", async () => {
    const items = [
      ...battery.offtopic.map((text, index) => ({ key: `chat-${index}`, title: "", text })),
      { key: "it-0", title: "", text: battery.it[0]! },
    ];
    const vectors = await embed(items);
    const records = items.map((item) =>
      record(item.key, item.title, item.text, { vector: vectors.get(item.key)! }),
    );
    const groups = groupSpecificTopics(records);
    const itGroup = groups.find((group) => group.members.some((member) => member.id === "it-0"))!;
    for (const member of itGroup.members) expect(member.id.startsWith("chat-")).toBe(false);
  }, 60_000);

  test("partial capitalization in the show name does not split the same incident", async () => {
    const items = [
      {
        key: "gesture",
        title: "Tranh cãi cử chỉ chào phát xít tại chung kết Olympia",
        text: "Thí sinh Đường lên đỉnh Olympia giơ tay chào kiểu Hitler trên sóng VTV, gây nhiều ý kiến tranh luận về hành động này.",
      },
      {
        key: "reaction",
        title: "Cộng đồng phản ứng về động tác chào Hitler của thí sinh Olympia",
        text: "Hành động chào phát xít của một thí sinh trong trận chung kết Đường lên đỉnh Olympia trên VTV đang gây tranh cãi.",
      },
    ].map((item) => ({ ...item, text: `${item.title}. ${item.text}` }));
    const vectors = await embed(items);
    const groups = groupSpecificTopics(
      items.map((item) =>
        record(item.key, item.title, item.text, { vector: vectors.get(item.key)! }),
      ),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((member) => member.id).sort()).toEqual(["gesture", "reaction"]);
  }, 60_000);
});
