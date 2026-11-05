import type { EntityKind, TopicEntity } from "./intelligence.ts";

/** Heuristic name recognition, not geocoding, identity verification, or NER inference. */
const MAX_ENTITIES = 8;
const MAX_ALIASES = 4;
const MAX_TEXT = 2_000;

/** Accent-free identity/search keys retain version digits and word boundaries. */
function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

interface KnownEntity {
  kind: EntityKind;
  label: string;
  aliases: string[];
  /** Ambiguous canonical labels must not match without their contextual alias. */
  aliasesOnly?: boolean;
}

const KNOWN: readonly KnownEntity[] = [
  {
    kind: "location",
    label: "Hồ Chí Minh",
    aliases: ["TP.HCM", "TPHCM", "Ho Chi Minh City", "Thành phố Hồ Chí Minh"],
    aliasesOnly: true,
  },
  { kind: "location", label: "Hà Nội", aliases: ["Ha Noi", "Hanoi"] },
  { kind: "location", label: "Việt Nam", aliases: ["Vietnam", "Viet Nam"] },
  { kind: "location", label: "Thái Lan", aliases: ["Thailand"] },
  { kind: "location", label: "Trung Quốc", aliases: ["China"] },
  { kind: "location", label: "Nhật Bản", aliases: ["Japan"] },
  { kind: "location", label: "Hàn Quốc", aliases: ["South Korea"] },
  { kind: "location", label: "Triều Tiên", aliases: ["North Korea"] },
  { kind: "location", label: "Ấn Độ", aliases: ["India"] },
  { kind: "location", label: "Campuchia", aliases: ["Cambodia"] },
  { kind: "location", label: "Đà Nẵng", aliases: ["Da Nang", "Danang"] },
  { kind: "location", label: "Cần Thơ", aliases: ["Can Tho"] },
  { kind: "location", label: "Hải Phòng", aliases: ["Hai Phong"] },
  { kind: "location", label: "Đồng Tháp", aliases: ["Dong Thap"] },
  { kind: "location", label: "Đồng Nai", aliases: ["Dong Nai"] },
  { kind: "location", label: "Quảng Ninh", aliases: ["Quang Ninh"] },
  { kind: "location", label: "Quảng Trị", aliases: ["Quang Tri"] },
  { kind: "location", label: "Nghệ An", aliases: ["Nghe An"] },
  { kind: "location", label: "Thanh Hóa", aliases: ["Thanh Hoa"] },
  { kind: "location", label: "Hà Tĩnh", aliases: ["Ha Tinh"] },
  { kind: "location", label: "Khánh Hòa", aliases: ["Khanh Hoa"] },
  { kind: "location", label: "Lâm Đồng", aliases: ["Lam Dong"] },
  { kind: "location", label: "Đắk Lắk", aliases: ["Dak Lak"] },
  { kind: "location", label: "An Giang", aliases: ["An Giang"] },
  { kind: "location", label: "Tây Ninh", aliases: ["Tay Ninh"] },
  { kind: "location", label: "Gia Lai", aliases: ["Gia Lai"] },
  { kind: "organization", label: "OpenAI", aliases: ["Open AI"] },
  { kind: "organization", label: "Google", aliases: [] },
  { kind: "organization", label: "Anthropic", aliases: [] },
  { kind: "organization", label: "Microsoft", aliases: [] },
  { kind: "organization", label: "Meta", aliases: ["Meta Platforms"] },
  { kind: "organization", label: "NVIDIA", aliases: ["Nvidia"] },
  { kind: "organization", label: "Apple", aliases: [] },
  { kind: "organization", label: "Samsung", aliases: [] },
  { kind: "organization", label: "VinFast", aliases: ["Vin Fast"] },
  { kind: "organization", label: "Vingroup", aliases: ["Vin Group"] },
  { kind: "organization", label: "Viettel", aliases: [] },
  { kind: "organization", label: "FPT", aliases: [] },
  {
    kind: "organization",
    label: "VTV",
    aliases: ["Đài Truyền hình Việt Nam", "Vietnam Television"],
  },
  { kind: "organization", label: "VFF", aliases: ["Liên đoàn Bóng đá Việt Nam"] },
  { kind: "organization", label: "Bộ Công an", aliases: [] },
  {
    kind: "organization",
    label: "Bộ Giáo dục và Đào tạo",
    aliases: ["Bộ GDĐT", "Bộ GD-ĐT", "Bộ GD&ĐT"],
  },
  { kind: "organization", label: "Đại học Quốc gia Hà Nội", aliases: ["ĐHQG Hà Nội", "VNU Hanoi"] },
  { kind: "organization", label: "Đại học Quốc gia TP.HCM", aliases: ["ĐHQG TP.HCM", "VNU HCM"] },
];

/** Compile aliases once; boundary matching avoids names inside unrelated words. */
const KNOWN_MATCHERS = KNOWN.map((entity) => ({
  entity,
  key: fold(entity.label),
  needles: [
    ...new Set((entity.aliasesOnly ? entity.aliases : [entity.label, ...entity.aliases]).map(fold)),
  ].map((value) => ` ${value} `),
}));
const KNOWN_LOCATION_KEYS = new Set(
  KNOWN_MATCHERS.filter(({ entity }) => entity.kind === "location").map(({ key }) => key),
);

interface ProductPattern {
  pattern: RegExp;
  family: string;
  label: (match: string) => string;
}

/** Each explicit version/variant is its own product identity, never a family alias. */
const PRODUCTS: readonly ProductPattern[] = [
  {
    pattern: /\bGPT[\s-]?\d+(?:\.\d+)*o?(?:[\s-]+(?:mini|nano|pro|turbo))?\b/giu,
    family: "gpt",
    label: (name) => name.replace(/^gpt[\s-]?/iu, "GPT-").replace(/\s+/gu, " "),
  },
  {
    pattern:
      /\bClaude(?:\s+(?:Sonnet|Opus|Haiku))?\s*[- ]?\d+(?:\.\d+)*(?:\s+(?:Sonnet|Opus|Haiku))?\b/giu,
    family: "claude",
    label: (name) => {
      const version = name.match(/\d+(?:\.\d+)*/u)![0];
      const variant = name.match(/\b(?:Sonnet|Opus|Haiku)\b/iu)?.[0];
      return `Claude ${variant ? `${variant[0]!.toUpperCase()}${variant.slice(1).toLowerCase()} ` : ""}${version}`;
    },
  },
  {
    pattern: /\bGemini\s*[- ]?\d+(?:\.\d+)*(?:\s+(?:Pro|Flash|Ultra|Lite)(?:[- ]Lite)?)?\b/giu,
    family: "gemini",
    label: (name) => name.replace(/^gemini[\s-]*/iu, "Gemini "),
  },
  {
    pattern: /\bDeepSeek[\s-]?(?:R|V)\d+(?:\.\d+)*\b/giu,
    family: "deepseek",
    label: (name) => name.replace(/^deepseek[\s-]?/iu, "DeepSeek-"),
  },
  {
    pattern: /\b(?:Llama|Qwen)\s*[- ]?\d+(?:\.\d+)*(?:[- ]\d+B)?\b/giu,
    family: "llama-qwen",
    label: (name) => name.replace(/^(llama|qwen)[\s-]*/iu, "$1 "),
  },
  {
    pattern: /\biPhone\s*\d+(?:\s+(?:Pro(?:\s+Max)?|Plus|Air|mini))?\b/giu,
    family: "iphone",
    label: (name) => name.replace(/^iphone\s*/iu, "iPhone "),
  },
  {
    pattern: /\bGalaxy\s+[SAZ]\d+(?:\s+(?:Ultra|Plus|FE))?\b/giu,
    family: "galaxy",
    label: (name) => name.replace(/^galaxy/iu, "Galaxy"),
  },
  {
    pattern: /\bVF[\s-]?\d+(?:\s+Plus)?\b/giu,
    family: "vf",
    label: (name) => name.replace(/^vf[\s-]?/iu, "VF "),
  },
  {
    pattern: /\bWindows\s+\d+(?:\.\d+)*\b/giu,
    family: "windows",
    label: (name) => name.replace(/^windows/iu, "Windows"),
  },
];

const FAMILY_PRODUCTS = [
  ["gpt", "ChatGPT"],
  ["claude", "Claude"],
  ["gemini", "Gemini"],
  ["deepseek", "DeepSeek"],
  ["iphone", "iPhone"],
  ["galaxy", "Galaxy"],
] as const;
const NAME_WORD = "[\\p{Lu}][\\p{L}\\p{M}'’-]+";
/** A dotted uppercase abbreviation is one token, not a truncated proper name. */
const INSTITUTION_WORD = `(?:[\\p{Lu}]{2,}(?:\\.\\s*[\\p{Lu}]{2,})+|${NAME_WORD})`;
const NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){1,4}`;
const PERSON_CUE = new RegExp(
  `(?:^|[^\\p{L}])(?:[Ôô]ng|[Bb]à|[Aa]nh|[Cc]hị|[Cc]a sĩ|[Dd]iễn viên|[Nn]hà văn|[Nn]hà báo|[Bb]ộ trưởng|[Tt]hủ tướng|[Cc]hủ tịch(?: nước| Quốc hội)?|[Bb]í thư(?: Thành ủy)?)(?:\\s+(?:TP\\.?HCM|TPHCM|Hà Nội))?\\s+(${NAME})`,
  "gu",
);
const PERSON_SURNAME = new RegExp(
  `(?:^|[^\\p{L}])((?:Nguyễn|Trần|Lê|Phạm|Hoàng|Huỳnh|Phan|Vũ|Võ|Đặng|Bùi|Đỗ|Hồ|Ngô|Dương|Lý|Cao|Mai|Tạ|Tô|Hà|Đào|Đoàn|Đinh|Hứa|Tăng|Thái|Trịnh|Chu|Vương|Mạc|Lâm)(?:\\s+${NAME_WORD}){1,3})`,
  "gu",
);
const PLACE_CUE = new RegExp(
  `(?:^|[^\\p{L}])((?:[Tt]ỉnh|[Tt]hành phố|[Qq]uận|[Hh]uyện|[Pp]hường|[Xx]ã)\\s+${NAME_WORD}(?:\\s+${NAME_WORD}){0,2})`,
  "gu",
);
const INSTITUTION_CUE = new RegExp(
  `(?:^|[^\\p{L}])((?:[Bb]ệnh viện|[Tt]rường Đại học|[Đđ]ại học)\\s+${INSTITUTION_WORD}(?:\\s+(?:${INSTITUTION_WORD}|dân|gia|khoa|công|nghệ|kinh|tế|và)){0,6})`,
  "gu",
);
const CIVIC_CUE = new RegExp(
  `(?:^|[^\\p{L}])(UBND|HĐND)\\s+((?:(?:[Tt]ỉnh|[Tt]hành phố|[Qq]uận|[Hh]uyện|[Pp]hường|[Xx]ã)\\s+)?(?:TP\\.?\\s*HCM|TPHCM|${NAME_WORD}(?:\\s+${NAME_WORD}){0,3}))`,
  "gu",
);
const NON_PERSON_WORDS =
  /(?:^| )(?:thanh uy|quoc hoi|thanh pho|dai hoc|benh vien|tp|hcm|ubnd|hdnd)(?: |$)/u;

/** Stable typed IDs prevent a person's name and a location alias becoming one entity. */
function entityFor(kind: EntityKind, label: string, aliases: readonly string[] = []): TopicEntity {
  const cleaned = label.trim().replace(/\s+/gu, " ");
  return {
    id: `${kind}:${fold(cleaned).replace(/ /gu, "-")}`,
    kind,
    label: cleaned,
    aliases: [...new Set(aliases.filter((alias) => alias && alias !== cleaned))].slice(
      0,
      MAX_ALIASES,
    ),
  };
}

/**
 * Extract at most eight concrete source-named entities from a bounded excerpt.
 * Aliases join spellings, not incidents or model versions. Missing/ambiguous
 * names are deliberately omitted rather than fabricated by a remote model.
 */
export function extractTopicEntities(title: string, text = ""): TopicEntity[] {
  const source = `${title.slice(0, 600)} ${text.slice(0, MAX_TEXT - 600)}`.trim();
  if (!source) return [];
  const normalized = ` ${fold(source)} `;
  const found = new Map<string, TopicEntity>();
  const families = new Set<string>();
  const add = (entity: TopicEntity) => {
    if (found.size < MAX_ENTITIES && !found.has(entity.id)) found.set(entity.id, entity);
  };
  for (const { pattern, family, label } of PRODUCTS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      families.add(family);
      const name = label(match[0]);
      add(entityFor("product", name, [match[0], name.replace(/[- ]/gu, "")]));
    }
  }
  for (const [family, name] of FAMILY_PRODUCTS) {
    if (!families.has(family) && normalized.includes(` ${fold(name)} `))
      add(entityFor("product", name));
  }
  for (const pattern of [PERSON_CUE, PERSON_SURNAME]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const name = match[1]!;
      const start = match.index! + match[0].lastIndexOf(name);
      const prefix = source.slice(Math.max(0, start - 60), start);
      const nameKey = fold(name);
      if (KNOWN_LOCATION_KEYS.has(nameKey) && nameKey !== "ho chi minh") continue;
      if (
        pattern === PERSON_SURNAME &&
        (KNOWN_LOCATION_KEYS.has(nameKey) ||
          /(?:thành phố|đường|trường|giải thưởng|bệnh viện|đại học(?: quốc gia)?|đảo|núi|sông|cầu|phố)\s*$/iu.test(
            prefix,
          ))
      )
        continue;
      if (!NON_PERSON_WORDS.test(nameKey) && !/\b(?:TP|HCM|UBND|HĐND)\b/u.test(name))
        add(entityFor("person", name));
    }
  }
  for (const { entity, needles } of KNOWN_MATCHERS) {
    if (needles.some((needle) => normalized.includes(needle)))
      add(entityFor(entity.kind, entity.label, entity.aliases));
  }
  INSTITUTION_CUE.lastIndex = 0;
  for (const match of source.matchAll(INSTITUTION_CUE)) add(entityFor("organization", match[1]!));
  CIVIC_CUE.lastIndex = 0;
  for (const match of source.matchAll(CIVIC_CUE)) {
    const target = fold(match[2]!.replace(/^(?:tỉnh|thành phố|quận|huyện|phường|xã)\s+/iu, ""));
    const location = KNOWN_MATCHERS.find(
      ({ entity, key, needles }) =>
        entity.kind === "location" && (key === target || needles.includes(` ${target} `)),
    )?.entity;
    const place = location
      ? location.label === "Hồ Chí Minh"
        ? "TP.HCM"
        : location.label
      : match[2]!;
    add(entityFor("organization", `${match[1]} ${place}`, [match[0].trim()]));
  }
  PLACE_CUE.lastIndex = 0;
  for (const match of source.matchAll(PLACE_CUE)) {
    const label = match[1]!;
    const name = fold(label.replace(/^(?:tỉnh|thành phố|quận|huyện|phường|xã)\s+/iu, ""));
    if (
      !KNOWN_MATCHERS.some(
        ({ entity, key, needles }) =>
          entity.kind === "location" && (key === name || needles.includes(` ${name} `)),
      )
    )
      add(entityFor("location", label));
  }
  return [...found.values()];
}

/** Accent-free AND-token matching over typed names/aliases, without fuzzy version conflation. */
export function matchEntity(entity: TopicEntity, query: string): boolean {
  const terms = fold(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  // Decimal versions are atomic: querying GPT-4 must not suggest GPT-4.1 as
  // the same version merely because punctuation folding split its digits.
  const versions = query.match(/\d+(?:\.\d+)*/gu) ?? [];
  const ownVersions = new Set(entity.label.match(/\d+(?:\.\d+)*/gu) ?? []);
  if (versions.some((version) => !ownVersions.has(version))) return false;
  const names = [entity.label, ...entity.aliases].map(fold);
  const kind = fold(entity.kind);
  return names.some((name) => {
    const words = name.split(" ");
    return terms.every((term) => kind === term || words.some((word) => word.startsWith(term)));
  });
}
