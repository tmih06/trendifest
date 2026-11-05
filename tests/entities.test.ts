import { describe, expect, test } from "bun:test";
import { extractTopicEntities, matchEntity } from "../shared/entities.ts";

/** Entity matching must not broaden a source-specific incident or model version. */
describe("Vietnamese source-grounded entities", () => {
  test("city aliases resolve to one typed identity without turning the president into a city", () => {
    const aliases = ["TP.HCM", "TPHCM", "Ho Chi Minh City", "Thành phố Hồ Chí Minh"];
    const ids = aliases.map(
      (name) =>
        extractTopicEntities(`Tin tức tại ${name}`).find((entity) => entity.kind === "location")
          ?.id,
    );
    expect(new Set(ids)).toEqual(new Set(["location:ho-chi-minh"]));
    const person = extractTopicEntities("Chủ tịch Hồ Chí Minh trong tư liệu lịch sử");
    expect(person.some((entity) => entity.kind === "location")).toBe(false);
    expect(person.some((entity) => entity.id === "person:ho-chi-minh")).toBe(true);
    expect(
      extractTopicEntities("Thành phố Hồ Chí Minh phát triển giao thông").some(
        (entity) => entity.kind === "person",
      ),
    ).toBe(false);
  });

  test("Vietnamese accents and abbreviations match aliases, but not substrings of unrelated words", () => {
    const hanoi = extractTopicEntities("Giao thông Hà Nội").find(
      (entity) => entity.kind === "location",
    )!;
    expect(matchEntity(hanoi, "ha noi")).toBe(true);
    expect(
      extractTopicEntities("Giao thông Hà Nội và Thái Lan").some(
        (entity) => entity.kind === "person",
      ),
    ).toBe(false);
    expect(matchEntity(hanoi, "Hanoi")).toBe(true);
    expect(matchEntity(hanoi, "location ha noi")).toBe(true);
    expect(matchEntity(hanoi, "da nang")).toBe(false);
    const city = extractTopicEntities("TPHCM thay đổi giao thông").find(
      (entity) => entity.kind === "location",
    )!;
    expect(matchEntity(city, "TP.HCM")).toBe(true);
    expect(matchEntity(city, "Ho Chi Minh City")).toBe(true);
    expect(
      extractTopicEntities("Metaverse và Appleton không phải tên công ty trong bài").some(
        (entity) => entity.kind === "organization",
      ),
    ).toBe(false);
  });

  test("explicit model versions and variants stay separate while spelling aliases join", () => {
    const gpt = (text: string) =>
      extractTopicEntities(text).find((entity) => entity.kind === "product")!;
    expect(gpt("OpenAI ra mắt GPT-5").id).toBe(gpt("OpenAI công bố GPT5").id);
    expect(gpt("GPT-5 ra mắt").id).not.toBe(gpt("GPT-4.1 ra mắt").id);
    expect(gpt("GPT-5 Pro ra mắt").id).not.toBe(gpt("GPT-5 ra mắt").id);
    expect(matchEntity(gpt("GPT-4.1 ra mắt"), "GPT-4")).toBe(false);
    expect(matchEntity(gpt("GPT-4.1 ra mắt"), "GPT4.1")).toBe(true);
    expect(matchEntity(gpt("GPT-5 ra mắt"), "GPT5")).toBe(true);
    expect(gpt("Gemini 2.5 Pro ra mắt").id).not.toBe(gpt("Gemini 2.0 Pro ra mắt").id);
    expect(gpt("DeepSeek-R1 ra mắt").id).not.toBe(gpt("DeepSeek-V3 ra mắt").id);
    expect(gpt("iPhone 17 Pro Max ra mắt").id).not.toBe(gpt("iPhone 17 ra mắt").id);
    expect(gpt("VF 3 mở bán").id).not.toBe(gpt("VF 9 mở bán").id);
    expect(gpt("Claude 3.5 Sonnet ra mắt").id).toBe(gpt("Claude Sonnet 3.5 ra mắt").id);
    expect(gpt("Claude Sonnet 3.5 ra mắt").id).not.toBe(gpt("Claude Opus 3.5 ra mắt").id);
    expect(gpt("Qwen3 ra mắt").id).toBe(gpt("Qwen 3 ra mắt").id);
  });

  test("person cues and institutions remain distinct from city tokens", () => {
    const entities = extractTopicEntities(
      "Bí thư Thành ủy TP.HCM Trần Lưu Quang làm việc ở Đồng Tháp",
    );
    expect(entities.some((entity) => entity.id === "person:tran-luu-quang")).toBe(true);
    expect(entities.some((entity) => entity.id === "location:ho-chi-minh")).toBe(true);
    expect(entities.some((entity) => entity.id === "location:dong-thap")).toBe(true);
    expect(
      entities.some((entity) => entity.kind === "person" && /TP|HCM/u.test(entity.label)),
    ).toBe(false);
    expect(
      extractTopicEntities("Bí thư Thành ủy Hà Nội làm việc").some(
        (entity) => entity.kind === "person",
      ),
    ).toBe(false);
    const council = extractTopicEntities("HĐND TP.HCM khảo sát chính sách miễn vé xe buýt");
    expect(council.some((entity) => entity.id === "organization:hdnd-tp")).toBe(false);
    expect(council.some((entity) => entity.id === "organization:hdnd-tp-hcm")).toBe(true);
    const institutions = extractTopicEntities("Bệnh viện Nhân dân Gia Định tiếp nhận bệnh nhân");
    expect(
      institutions.some(
        (entity) =>
          entity.kind === "organization" && entity.label === "Bệnh viện Nhân dân Gia Định",
      ),
    ).toBe(true);
    const vtv = extractTopicEntities("Đài Truyền hình Việt Nam công bố lịch phát sóng");
    expect(vtv.some((entity) => entity.id === "organization:vtv")).toBe(true);
  });

  test("generic chatter creates no entities and extraction stays bounded on oversized records", () => {
    expect(extractTopicEntities("mô hình mới rất hay, mọi người nghĩ sao")).toEqual([]);
    expect(extractTopicEntities("")).toEqual([]);
    const entities = extractTopicEntities(
      "OpenAI Google Microsoft Meta Anthropic NVIDIA Apple Samsung Viettel FPT VTV VFF Hà Nội Đà Nẵng Cần Thơ",
    );
    expect(entities.length).toBeLessThanOrEqual(8);
    expect(new Set(entities.map((entity) => entity.id)).size).toBe(entities.length);
    expect(entities.every((entity) => entity.aliases.length <= 4)).toBe(true);
    expect(extractTopicEntities("mô hình mới", `${"a".repeat(5_000)} OpenAI`)).toEqual([]);
  });
});
