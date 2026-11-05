import { createHash } from "node:crypto";
import { VIEWER_SEGMENTS } from "../../shared/segments.ts";
import type {
  EvidenceType,
  PostKind,
  SocialSource,
  SourceTimeKind,
  TrendScore,
} from "../../shared/types.ts";

/**
 * Specific-topic grouping: turn individual collected records into the concrete
 * events and products people are actually talking about, and score each one.
 *
 * Why this is not a cosine threshold over post vectors:
 *
 * E5 (the topic model) is trained for retrieval, not for identity. Measured on
 * real Vietnamese texts, unrelated chat greetings score 0.9097 and a genuine
 * event paraphrase scores as low as 0.8958, so *no* single cosine floor
 * separates events from boilerplate. The model also rates GPT-5 against GPT-4.1
 * at 0.906-0.98 and "chào kiểu phát xít" against an Olympic Berlin 1936
 * documentary at 0.87, because they share a topic, not an incident.
 *
 * So grouping is a conjunction of independent signals, each of which can only
 * reject:
 *
 * 1. Semantic floor: E5 cosine, the only signal that survives paraphrase.
 * 2. Specificity: at least one record must name something concrete (a proper
 *    noun or a number/version). "Chào mọi người, hôm nay trời đẹp" names
 *    nothing, and two records that both name nothing never pair.
 * 3. Version/product conflict: two records naming the same family with
 *    different versions, or naming disjoint products, are different topics
 *    however close their vectors are. This rule is what keeps GPT-5, GPT-4.1
 *    and Claude 4 apart.
 * 4. Same-name/different-class conflict: one name introduced by different words
 *    ("trường Tiểu học Kim Liên" vs "chợ Kim Liên") is a different incident at a
 *    coincidentally named place.
 * 5. Time conflict: a record whose only year is decades old describes a
 *    historical subject, not a current incident.
 * 6. Place conflict: two records naming disjoint Vietnamese places are about
 *    different occurrences even when they name the same product.
 * 7. Shared identity support: one shared product identifier, or a run of three
 *    consecutive informative words. Vocabulary overlap is not evidence; a
 *    reproduced phrase is.
 *
 * Membership is complete-linkage: a record joins a group only when it passes
 * every rule against *every* current member. That forbids the chaining that
 * turns three unrelated posts into one "trend" (A~B, B~C, A≁C). Missed merges
 * are a smaller cluster; a wrong merge is unrecoverable evidence.
 *
 * Nothing here reads the database, calls a model, or depends on the composition
 * of the candidate set, so the same records always produce the same groups,
 * ids, and scores.
 */

/** One collected record as the map consumes it; vectors stay server-side. */
export interface TopicEvidence {
  id: string;
  title: string;
  text: string;
  source: SocialSource;
  evidenceType: EvidenceType;
  /** News publisher; null for community discussion. */
  publisher: string | null;
  authorId: string;
  authorHandle: string | null;
  permalink: string;
  kind: PostKind;
  timeKind: SourceTimeKind;
  mediaCount: number;
  contentHash: string;
  publishedAt: Date;
  /** First accepted collection of this record; never rewritten by redelivery. */
  firstCollectedAt: Date;
  /** Latest observation in a collection context; drives measured persistence. */
  observedAt: Date;
  segments: string[];
  /**
   * E5 topic vector, native 384 dims, L2-normalized by the embedder.
   *
   * Grouping needs only indexed reads. ArrayLike accepts ordinary arrays and
   * typed-array views without requiring callers to copy their representation.
   */
  vector: ArrayLike<number>;
  likes?: number;
  shares?: number;
}

/** A topic: one specific event/product and the independent records behind it. */
export interface TopicGroup {
  /** Deterministic from the earliest record, stable while the topic grows. */
  id: string;
  /** Source-grounded specific title; never generated text. */
  label: string;
  /** The member whose text best represents the group (highest mean similarity). */
  representative: TopicEvidence;
  /** Deduplicated, deterministically ordered member records. */
  members: TopicEvidence[];
  /** Distinct community posts after collapsing copies from the same author. */
  discussionPosts: number;
  /** Distinct news reports after collapsing syndicated copies of one headline. */
  newsPosts: number;
  /** Distinct news publishers; never counted as people. */
  publishers: number;
  /** Distinct source-qualified community accounts behind the discussion posts. */
  authors: number;
  /** Observed collection contexts only. */
  segments: string[];
  /** Earliest local collection and latest observation of the retained evidence. */
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/**
 * E5 paraphrases and false matches overlap in cosine space. The semantic floor
 * admits measured paraphrases; independent identity guards reject false merges.
 */
export const GROUPING_THRESHOLD = 0.88;

/** Relatedness uses the semantic floor, but not same-event identity guards. */
export const RELATED_THRESHOLD = GROUPING_THRESHOLD;

/**
 * Consecutive informative words the two records must reproduce identically.
 * Three is the shortest run that cannot be explained by ordinary Vietnamese
 * word order ("hai người ở", "bồ đào nha"), and every measured same-incident
 * pair produced at least that many.
 */
const MIN_SHARED_RUN = 3;

/**
 * Cosine required when the *only* shared identity evidence is a product name.
 * Measured on the battery: same-release paraphrases sharing just "GPT-5" ran
 * 0.9319-0.9526, while two unrelated incidents involving one car sat at 0.9104.
 */
const IDENTIFIER_ONLY_THRESHOLD = 0.92;

/** Bounded so one long post cannot drown the representative text. */
const MAX_LABEL_CHARS = 140;

/**
 * How far behind its own publication a named year must sit before a record is
 * read as describing a historical subject. Two years admits "năm ngoái" and a
 * story published just after New Year; it rejects a 1936 documentary.
 */
const HISTORICAL_YEARS_BACK = 2;

/**
 * Vietnamese function words, pronouns, discourse particles, and time filler.
 * These carry grammar, not an event; keeping them would let "chào mọi người"
 * look like a shared anchor. The list is language-scoped on purpose: it says
 * nothing about any particular event, model, or source.
 */
/**
 * Split a phrase list into single tokens. Vietnamese writes multi-syllable
 * words with spaces ("chung kết"), so a list entry must contribute every shown
 * syllable or it could never match a token.
 */
function tokenSet(phrases: string) {
  const words = new Set<string>();
  for (const phrase of phrases.split(/\s+/)) {
    if (phrase) words.add(phrase);
  }
  return words;
}

const FUNCTION_WORDS = tokenSet(
  `à ạ ả á ấy ai anh ắt âu bà bác bảo bằng bị biết bởi cả các cái cần càng cấp chỉ chi chị chỗ
   chớ chưa chuyện chứ chúng cô còn của cùng cũng cụ cực dạ dẫn dạy để đây đến đều đi đã đang
   đầu đấy đâu được đúng đem điều định đó đọc đối đồng đời đừng đưa em gì giờ giúp gồm hay hãy
   hết hiện hoặc họ hơn hẳn khi không kia lại làm lắm lần lên lời lúc mà mãi mấy mình mọi một
   mới muốn nó nếu này nên nào năm năng ngay ngày nghe nghĩ người nhà nhé nhỉ những như nhưng
   nữa nơi ơi ở phải phía qua quá ra rằng rồi rất sao sẽ song sự tại tay tháng thế thì thôi
   trong trên tiếp tới tôi tốt trước từ từng tự vẫn vào và vâng vậy về việc vì vừa với vui xong
   ý ừ ờ nhận thấy chào chúc mừng cảm ơn hello hi`,
);

/**
 * Minimal English function vocabulary: Vietnamese posts routinely quote Latin
 * product names and short English phrases, and "the/of/and" must not become a
 * shared anchor.
 */
const ENGLISH_FUNCTION_WORDS = tokenSet(
  `the a an of to in on for and or is are was were be been with by at as it this that
   from but not you your we they he she i my our their has have had will would can`,
);

/**
 * Role, round, and medium nouns: "thí sinh", "chung kết", "nam sinh", "video".
 * They name a participant or a venue, which is exactly what the winner story and
 * the salute controversy share, so treating them as anchors would let "same
 * category" masquerade as "same event". They are still displayed; they just
 * carry no identity evidence. Like the function-word list this is
 * language-general: no event, model, or outlet appears here.
 */
const CONTEXT_NOUNS = tokenSet(
  `người sinh viên thí học nam nữ chung kết cuộc vụ vấn đề tin bài báo ảnh clip video
   phút giây đêm sáng chiều trưa hôm qua nay mai tuần tháng năm trước sau trên dưới
   đội tuyển trận giải hạng vòng bảng cầu thủ huấn luyện thầy cô giáo bạn đồng nghiệp`,
);

/** Tokens that carry grammar or role, never event identity. */
function isStopWord(token: string) {
  return FUNCTION_WORDS.has(token) || ENGLISH_FUNCTION_WORDS.has(token) || CONTEXT_NOUNS.has(token);
}

/** One record with the extracted evidence the rules need. */
interface PreparedRecord {
  evidence: TopicEvidence;
  /** Informative phrases cached once per record, not rebuilt for every pair. */
  phrases: Set<string>;
  tokenSet: Set<string>;
  /** Capitalized name (lowercased) mapped to the word introducing it, if any. */
  entities: Map<string, string | null>;
  /** Product/model family mapped to every version seen in this record. */
  families: Map<string, Set<string>>;
  /**
   * Tokens that identify *this* thing rather than its category: proper names,
   * numbers/versions, and Latin product tokens. Empty for general chatter.
   */
  specificAnchors: Set<string>;
  /**
   * Derived subsets of the fields above, computed once. The pair rules ran
   * these filters on *both* sides for every comparison; hoisting them here is
   * what keeps the same rules affordable over a corpus of thousands.
   */
  numericAnchors: string[];
  /** Membership view of `numericAnchors`, so the conflict costs no allocation. */
  numericSet: Set<string>;
  /** Plain product/version identifiers ("gpt-5", "vf3", "2026"). */
  identifiers: string[];
  identifierSet: Set<string>;
  /** Vietnamese multi-word names that carry a classifier ("chợ Kim Liên"). */
  classifiedNames: Array<[phrase: string, classifier: string]>;
  /** Vietnamese multi-word names, the only evidence the place rule reads. */
  placeNames: string[];
  /** Four-digit years this record names, for the historical rule. */
  years: number[];
  yearSet: Set<number>;
  /** True when its only years predate its own publication by two years. */
  historical: boolean;
  /** Squared L2 norm, so a pair needs one dot product and no re-norming. */
  normSq: number;
  /**
   * Candidate-index keys: every informative three-token phrase and every product
   * identifier, hashed. Identity requires one of them (see `anchorSupport`), so
   * two records with no shared key can never pair — the index is a proof of
   * impossibility, not a heuristic neighbourhood.
   */
  identityKeys: number[];
  /** True when the record names something concrete enough to be a topic. */
  specific: boolean;
}

/**
 * FNV-1a over a string, 32 bits. Only a candidate-index key: a collision adds a
 * comparison that the exact rules then reject, so it can never create a link.
 */
function hashKey(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}._+#-]*/gu;
/** Bare numbers and dotted versions ("2026", "4.1", "5") are specific. */
const NUMBER_TOKEN = /^\d+(?:[.,]\d+)*$/;
/**
 * A name written with Vietnamese letters. ASCII-only names are product and
 * organization identifiers, which the version rule judges instead.
 */
const VIETNAMESE_NAME = /[^\p{ASCII}]/u;

/**
 * A token that identifies one release or one occurrence: a product version
 * ("gpt-5", "vf3", "4.1") or a year ("2026", "1936").
 *
 * Quantities do not qualify. A shared "15tr" salary or "3 lần" count is
 * coincidence, not identity, and treating any shared digit as proof of a shared
 * subject is how two unrelated salary threads would merge.
 */
const PRODUCT_IDENTIFIER = /^(?:[a-z][a-z0-9._-]*\d|\d{4})$/;

/** Family + version, e.g. "gpt-5", "GPT 4.1", "Claude 4", "Olympia 2026". */
const FAMILY_VERSION = /(?<![\p{L}\p{N}])([a-z]{2,})[\s._-]{0,2}(\d+(?:[.,]\d+)*)/gu;
const SENTENCE_START = /(?:^|[.!?:\n]\s*)$/;

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** Lowercase and strip diacritics only for identity keys, never for display. */
function foldForIdentity(value: string) {
  return normalizeSpaces(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/** Ordered informative tokens; numbers are kept because versions matter. */
function contentTokens(text: string) {
  const tokens: string[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const raw = match[0].replace(/[._+#-]+$/, "");
    if (!raw) continue;
    const lower = raw.toLowerCase();
    // Versions and numbers are the strongest identity evidence a record can
    // carry, so they bypass the stop lists entirely.
    if (!NUMBER_TOKEN.test(lower) && isStopWord(lower)) continue;
    if (lower.length < 2 && !NUMBER_TOKEN.test(lower)) continue;
    tokens.push(lower);
  }
  return tokens;
}

/**
 * Capitalized name runs and the word that precedes each run.
 *
 * Vietnamese capitalizes every syllable of a proper noun ("Kim Liên"), so the
 * run is the maximal sequence of capitalized words. The preceding word is the
 * nearest earlier *content* word, skipping function words such as "tại"/"ở":
 * that word says what kind of thing the name is ("trường Tiểu học" vs "chợ"),
 * which is how two different places with the same name stay apart. Following
 * lowercase words are deliberately not absorbed — "gây tranh cãi" is commentary,
 * not part of the name.
 */
function namedEntities(text: string) {
  const entities = new Map<string, string | null>();
  const words = [...text.matchAll(TOKEN_PATTERN)];

  const isCapitalizedWord = (raw: string) => /^\p{Lu}/u.test(raw);
  const isFunction = (raw: string) => {
    const lower = raw.toLowerCase();
    return FUNCTION_WORDS.has(lower) || ENGLISH_FUNCTION_WORDS.has(lower);
  };

  /**
   * Classifier directly in front of a name — the word immediately adjacent, with
   * nothing between them.
   *
   * Strict adjacency is the point. Vietnamese puts the classifier next to its
   * head noun ("chợ Kim Liên", "trường Tiểu học Kim Liên"); any word in between
   * means the preceding token is framing, not classification. Skipping function
   * words would read the verb in "giã từ ĐT Bồ Đào Nha" as a classifier and split
   * two reports of one retirement.
   */
  const precedingWord = (startIndex: number) => {
    const raw = words[startIndex - 1]?.[0];
    if (!raw) return null;
    if (!/^\p{L}+$/u.test(raw)) return null;
    if (isCapitalizedWord(raw) || isFunction(raw)) return null;
    return raw.toLowerCase();
  };

  let runStart = -1;
  const flush = (endIndex: number) => {
    if (runStart < 0) return;
    const phrase = words
      .slice(runStart, endIndex + 1)
      .map((match) => match[0].toLowerCase().replace(/[^\p{L}\p{N}]+$/u, ""))
      .filter(Boolean)
      .join(" ");
    entities.set(phrase, precedingWord(runStart));
    runStart = -1;
  };

  words.forEach((match, index) => {
    const before = text.slice(0, match.index ?? 0);
    // A capitalized word names something unless it merely opens a sentence:
    // Vietnamese capitalizes every syllable of a name, so consecutive
    // capitalized words are one phrase.
    const isName = isCapitalizedWord(match[0]) && !SENTENCE_START.test(before);
    if (isName) {
      if (runStart < 0) runStart = index;
      return;
    }
    // All-caps function words ("ĐT", "TP") are abbreviations, not a name run;
    // they never join the preceding name.
    flush(index - 1);
  });
  flush(words.length - 1);
  return entities;
}

/**
 * Product/model families with their versions. Only ASCII families match, which
 * is what keeps Vietnamese words such as "quý" or "tháng" out of the rule
 * without a hardcoded allowlist.
 */
function familyVersions(text: string) {
  const families = new Map<string, Set<string>>();
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(FAMILY_VERSION)) {
    const family = match[1]!;
    const version = match[2]!.replace(",", ".");
    if (isStopWord(family) || family.length < 2) continue;
    const versions = families.get(family) ?? new Set<string>();
    versions.add(version);
    families.set(family, versions);
  }
  return families;
}

/**
 * The identity anchors of one record.
 *
 * These are the tokens that name *this* thing: proper-noun phrases, numbers and
 * versions, and Latin product/brand tokens of at least three characters (two-
 * letter Latin fragments are usually acronym noise). General vocabulary such as
 * "phát xít" or "truyền hình" deliberately does not qualify: it is the category
 * the incident belongs to, and the whole point of this set is to separate
 * "same category" from "same incident".
 */
function specificAnchors(tokens: readonly string[], entities: ReadonlyMap<string, string | null>) {
  const anchors = new Set<string>();
  for (const token of tokens) {
    // Numbers and versions are unambiguous identity evidence in any language.
    if (NUMBER_TOKEN.test(token)) {
      anchors.add(token);
      continue;
    }
    // A Latin token carrying a number ("gpt-5", "vf3", "4.1") is a product or
    // version identifier wherever it appears in the sentence. Capitalization
    // cannot decide this: Vietnamese headlines routinely open with the product
    // name, which the sentence-start rule correctly refuses to read as a name.
    if (/^[\p{ASCII}]+$/u.test(token) && /\d/.test(token) && /[a-z]/.test(token)) {
      anchors.add(token);
    }
  }
  for (const phrase of entities.keys()) {
    // A Vietnamese name is multi-syllable ("Kim Liên", "Hà Nội"), so a multi-word
    // capitalized run names a thing. A *single* capitalized Vietnamese word is
    // usually just the sentence's first word after a title/body seam ("Thời
    // gian gần đây..."), which names nothing.
    if (phrase.includes(" ")) {
      anchors.add(phrase);
      continue;
    }
    // A single ASCII capitalized token is a product or organization
    // ("Olympia", "OpenAI", "VF3"): Vietnamese words carry diacritics.
    if (/^[\p{ASCII}]+$/u.test(phrase) && phrase.length >= 2) anchors.add(phrase);
  }
  return anchors;
}

/**
 * The text the rules read, with a title that already opens the body not
 * repeated. Adapters prefix the title onto a forum excerpt, so a naive
 * `${title} ${text}` would duplicate it and make the second copy look like a
 * mid-sentence proper noun — a fake name that then blocks a genuine merge.
 */
function readingText(evidence: TopicEvidence) {
  const title = normalizeSpaces(evidence.title);
  const body = normalizeSpaces(evidence.text);
  if (!title) return body;
  if (body.toLowerCase().startsWith(title.toLowerCase())) return body;
  return `${title} ${body}`;
}

function prepare(evidence: TopicEvidence): PreparedRecord {
  const text = readingText(evidence);
  const tokens = contentTokens(text);
  const entities = namedEntities(text);
  const families = familyVersions(text);
  const anchors = specificAnchors(tokens, entities);
  const phrases = new Set<string>();
  for (let index = 0; index + MIN_SHARED_RUN <= tokens.length; index += 1) {
    phrases.add(tokens.slice(index, index + MIN_SHARED_RUN).join("\0"));
  }

  const numericAnchors: string[] = [];
  const identifiers: string[] = [];
  for (const anchor of anchors) {
    if (NUMBER_TOKEN.test(anchor)) numericAnchors.push(anchor);
    if (PRODUCT_IDENTIFIER.test(anchor)) identifiers.push(anchor);
  }

  const classifiedNames: Array<[string, string]> = [];
  const placeNames: string[] = [];
  for (const [phrase, classifier] of entities) {
    // Only Vietnamese-script multi-word names are places/organizations. "OpenAI",
    // "GPT-5", and "Olympia" are products, and the verb in front of them says
    // nothing about what they are; the version rule decides those instead.
    if (!phrase.includes(" ") || !VIETNAMESE_NAME.test(phrase)) continue;
    placeNames.push(phrase);
    if (classifier) classifiedNames.push([phrase, classifier]);
  }

  const years: number[] = [];
  for (const anchor of numericAnchors) {
    if (!/^\d{4}$/.test(anchor)) continue;
    const year = Number(anchor);
    if (year >= 1000 && year <= 2100) years.push(year);
  }
  // A record whose only dates are decades old is about a *historical* subject,
  // not about an incident being reported now.
  const historical =
    years.length > 0 &&
    Math.max(...years) <= evidence.publishedAt.getUTCFullYear() - HISTORICAL_YEARS_BACK;

  const vector = evidence.vector;
  let normSq = 0;
  for (let index = 0; index < vector.length; index += 1) normSq += vector[index]! * vector[index]!;

  // Candidate keys are exactly the evidence `anchorSupport` accepts: reproduced
  // three-token phrases and shared product identifiers. Two records that share
  // no key cannot pass that test, so they never need a cosine.
  const identityKeys: number[] = [];
  for (const phrase of phrases) identityKeys.push(hashKey(`p:${phrase}`));
  for (const identifier of identifiers) identityKeys.push(hashKey(`i:${identifier}`));

  return {
    evidence,
    phrases,
    tokenSet: new Set(tokens),
    entities,
    families,
    specificAnchors: anchors,
    numericAnchors,
    numericSet: new Set(numericAnchors),
    identifiers,
    identifierSet: new Set(identifiers),
    classifiedNames,
    placeNames,
    years,
    yearSet: new Set(years),
    historical,
    normSq,
    identityKeys,
    // A topic must name something concrete. "Chào mọi người, hôm nay trời
    // đẹp" names nothing, so it can never anchor a topic node.
    specific: anchors.size > 0,
  };
}

/** Plain dot product on normalized vectors; both sides are L2-normalized. */
export function topicCosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! * a[index]!;
    normB += b[index]! * b[index]!;
  }
  if (!(normA > 0) || !(normB > 0)) return 0;
  return dot / Math.sqrt(normA * normB);
}

/**
 * Two records naming the same product family at different versions, or naming
 * disjoint products, are different topics. Missing versions are unknown, not a
 * conflict: a story that says "GPT-5" and one that only says "the new model"
 * stays comparable.
 */
function versionConflict(a: PreparedRecord, b: PreparedRecord) {
  if (a.families.size === 0 || b.families.size === 0) return false;
  let shared = 0;
  for (const [family, aVersions] of a.families) {
    const bVersions = b.families.get(family);
    if (!bVersions) continue;
    shared += 1;
    let overlap = false;
    for (const version of aVersions) if (bVersions.has(version)) overlap = true;
    if (!overlap) return true;
  }
  // Both records name concrete products, and none is shared: a different model,
  // not a paraphrase of the same launch.
  return shared === 0;
}

/**
 * Same name, different kind of thing: the same capitalized name introduced by
 * different words ("trường ... Kim Liên" vs "chợ Kim Liên"). One side whose
 * introducer is unknown contributes nothing, so the rule never *creates* a
 * split from absence of evidence.
 */
function entityQualifierConflict(a: PreparedRecord, b: PreparedRecord) {
  // Only Vietnamese-script, multi-word, classified names are candidates; that
  // filter is applied once per record in `prepare`, not per pair.
  if (a.classifiedNames.length === 0 || b.classifiedNames.length === 0) return false;
  for (const [aPhrase, aClass] of a.classifiedNames) {
    for (const [bPhrase, bClass] of b.classifiedNames) {
      // "Tiểu học Kim Liên" and "Kim Liên" name the same place when one phrase
      // ends with the other: Vietnamese names are head-final.
      const sameName =
        aPhrase === bPhrase || aPhrase.endsWith(` ${bPhrase}`) || bPhrase.endsWith(` ${aPhrase}`);
      if (!sameName || aClass === bClass) continue;
      return true;
    }
  }
  return false;
}

/**
 * Two records that each carry a *number or version*, and share none, are about
 * different occurrences: "Olympia 2026" and "Olympic Berlin 1936".
 *
 * Only numeric evidence is used. Proper nouns are *not* compared this way: the
 * salute controversy is named "Việt Nam" in one report and "Olympia" in another
 * and both describe one incident, so disjoint names would wrongly split it. A
 * side without a number is unknown, not a conflict — a paraphrase that says
 * "the new model" instead of "GPT-5" must still merge.
 */
function numericAnchorConflict(a: PreparedRecord, b: PreparedRecord) {
  if (a.numericAnchors.length === 0 || b.numericAnchors.length === 0) return false;
  return !a.numericAnchors.some((anchor) => b.numericSet.has(anchor));
}

/**
 * Time conflict: a record whose only dates are decades old is about a
 * *historical* subject, not about an incident being reported now.
 *
 * "Phim tài liệu về lễ chào ... Olympic Berlin 1936" and "thí sinh chào kiểu
 * phát xít trong đêm chung kết Olympia" share vocabulary and sit at cosine
 * 0.87-0.89; they are one incident and one historical documentary. Pairing a
 * historical subject with a non-historical record is refused. Two records that
 * both point at the same old year stay comparable, and a record with no year is
 * unknown, never historical.
 */
function historicalConflict(a: PreparedRecord, b: PreparedRecord) {
  if (a.years.length === 0 && b.years.length === 0) return false;
  if (a.historical === b.historical) return false;
  // Both naming the same old year is the same subject even when one report also
  // carries "làm lại hôm nay"-style current framing.
  for (const year of a.years) if (b.yearSet.has(year)) return false;
  return true;
}

/**
 * Two records naming disjoint Vietnamese places/organizations are about
 * different occurrences: "tông ngã thai phụ ở Lào Cai" and "trên xe VF3 ở Sài
 * Gòn" are two different incidents involving the same product.
 *
 * Only Vietnamese-script multi-word names count, and only when *both* sides name
 * at least one. That keeps the rule precise: a report that names "Việt Nam"
 * still pairs with one that names only "Olympia", because ASCII product/show
 * names are identity evidence handled above, not places.
 */
function placeConflict(a: PreparedRecord, b: PreparedRecord) {
  const aPlaces = a.placeNames;
  const bPlaces = b.placeNames;
  if (aPlaces.length === 0 || bPlaces.length === 0) return false;
  for (const aPlace of aPlaces) {
    for (const bPlace of bPlaces) {
      if (aPlace === bPlace || aPlace.endsWith(` ${bPlace}`) || bPlace.endsWith(` ${aPlace}`)) {
        return false;
      }
    }
  }
  return true;
}

function sharedAnchors(a: PreparedRecord, b: PreparedRecord) {
  let shared = 0;
  // Iterate the smaller set, which is what the count needs and what keeps a
  // long post from paying for its whole vocabulary on every comparison.
  const [smaller, larger] =
    a.tokenSet.size <= b.tokenSet.size ? [a.tokenSet, b.tokenSet] : [b.tokenSet, a.tokenSet];
  for (const token of smaller) if (larger.has(token)) shared += 1;
  return shared;
}

/** Test the required shared phrase without quadratic substring DP or per-pair rows. */
function hasSharedPhrase(a: PreparedRecord, b: PreparedRecord) {
  const [smaller, larger] =
    a.phrases.size <= b.phrases.size ? [a.phrases, b.phrases] : [b.phrases, a.phrases];
  for (const phrase of smaller) if (larger.has(phrase)) return true;
  return false;
}

/**
 * Do these two records carry identity evidence for the *same* thing?
 *
 * Two acceptable proofs:
 *
 * - A shared product identifier, but only above `IDENTIFIER_ONLY_THRESHOLD`:
 *   naming the same product is weaker than reproducing the same phrase, because
 *   one product appears in many unrelated incidents.
 * - A run of `MIN_SHARED_RUN` consecutive informative words. Reproducing a
 *   phrase in order is a retelling; sharing scattered vocabulary is the language.
 */
function anchorSupport(a: PreparedRecord, b: PreparedRecord, similarity: number) {
  for (const anchor of a.identifiers) {
    // Measured: "nữ tài xế VF3 chèn ép" and "clip trên xe VF3" are two different
    // incidents about one car and sit at 0.9104, below every measured same-release
    // paraphrase (0.9319-0.9526), so identifier-only support clears a higher floor.
    if (b.identifierSet.has(anchor)) return similarity >= IDENTIFIER_ONLY_THRESHOLD;
  }
  return hasSharedPhrase(a, b);
}

/**
 * Cosine with the norms already known.
 *
 * Identical arithmetic to `topicCosine` — same minimum length, same
 * `dot / sqrt(normA * normB)` — but the norms are computed once per record
 * instead of once per pair, which is what makes a corpus of thousands
 * affordable.
 */
function pairSimilarity(left: PreparedRecord, right: PreparedRecord) {
  if (!(left.normSq > 0) || !(right.normSq > 0)) return 0;
  const a = left.evidence.vector;
  const b = right.evidence.vector;
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) dot += a[index]! * b[index]!;
  return dot / Math.sqrt(left.normSq * right.normSq);
}

/**
 * The membership test, allocation-free: the similarity when these two records
 * may describe one occurrence, otherwise -1.
 *
 * Every rule is a pure predicate, so the cheap identity conflicts run before the
 * 384-element dot product rather than after it. The result is the same as
 * evaluating `topicPairScore`; only the order of work changed.
 */
function pairMatch(left: PreparedRecord, right: PreparedRecord, threshold: number) {
  // At least one side must name something concrete, and the *other* may be a
  // plain comment on it: community posts routinely describe an incident without
  // naming anyone, and those legitimate paraphrases must still join. Two
  // records that both name nothing are never one topic.
  if (!left.specific && !right.specific) return -1;
  if (
    versionConflict(left, right) ||
    entityQualifierConflict(left, right) ||
    numericAnchorConflict(left, right) ||
    historicalConflict(left, right) ||
    placeConflict(left, right)
  ) {
    return -1;
  }
  const similarity = pairSimilarity(left, right);
  if (similarity < threshold) return -1;
  return anchorSupport(left, right, similarity) ? similarity : -1;
}

/**
 * The pair test: may these two records describe one occurrence?
 *
 * Exported so a caller with its own evidence (a test, or a future ingest-time
 * check) can ask the same question instead of re-deriving the rules.
 */
export function topicPairScore(
  a: TopicEvidence,
  b: TopicEvidence,
  options: { threshold?: number; prepared?: [PreparedRecord, PreparedRecord] } = {},
) {
  const threshold = options.threshold ?? GROUPING_THRESHOLD;
  const [left, right] = options.prepared ?? [prepare(a), prepare(b)];
  const similarity = pairSimilarity(left, right);
  const anchors = sharedAnchors(left, right);
  const versionClash = versionConflict(left, right);
  const nameClash = entityQualifierConflict(left, right);
  const numberClash = numericAnchorConflict(left, right);
  const timeClash = historicalConflict(left, right);
  const placeClash = placeConflict(left, right);
  // At least one side must name something concrete, and the *other* may be a
  // plain comment on it: community posts routinely describe an incident without
  // naming anyone, and those legitimate paraphrases must still join. Two
  // records that both name nothing are never one topic.
  const anchored = left.specific || right.specific;
  const conflict = versionClash || nameClash || numberClash || timeClash || placeClash;
  const matches =
    anchored && similarity >= threshold && anchorSupport(left, right, similarity) && !conflict;
  return { similarity, anchors, conflict, matches };
}

/** Folded headline, falling back to the report's own opening text. */
function headlineKey(evidence: TopicEvidence) {
  const strip = (value: string) => foldForIdentity(value).replace(/[^\p{L}\p{N} ]/gu, " ");
  return (
    strip(normalizeSpaces(evidence.title)) || strip(normalizeSpaces(evidence.text).slice(0, 160))
  );
}

/** A direct publisher link is better evidence than an opaque aggregator URL. */
function isDirectPublisherLink(evidence: TopicEvidence) {
  try {
    return !new URL(evidence.permalink).hostname.endsWith("news.google.com");
  } catch {
    return false;
  }
}

function recordRank(evidence: TopicEvidence) {
  return [
    isDirectPublisherLink(evidence) ? 0 : 1,
    evidence.publishedAt.getTime(),
    evidence.id,
  ] as const;
}

function compareRank(a: readonly [number, number, string], b: readonly [number, number, string]) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2].localeCompare(b[2]);
}

function dedupeKey(evidence: TopicEvidence) {
  // News collapses on the normalized headline alone, deliberately ignoring the
  // publisher label. Aggregators and direct feeds name the same outlet
  // differently ("Nguoi Viet Online" vs "Người Việt"), so a publisher-keyed
  // comparison would count one article twice and inflate both the report count
  // and the publisher count. Two outlets printing the identical headline is
  // treated as one report: undercounting syndication is the conservative error,
  // double-counting is the misleading one.
  if (evidence.evidenceType === "news") return `news|${headlineKey(evidence)}`;
  // Community evidence collapses on content, not on the account: an account
  // repeating itself and several accounts pasting the same excerpt are both one
  // unit of evidence ("copied content"), and neither may inflate support. The
  // content hash covers text, title and media; the text fallback keeps records
  // without one from silently staying separate.
  return `discussion|${evidence.contentHash || headlineKey(evidence)}`;
}

/**
 * Keep one record per independent unit of evidence: a syndicated headline is one
 * report even when two collector paths produced different URLs and descriptions,
 * and one account's repeated copy is one post. Publisher and author identity stay
 * separate, so neither is ever counted as the other.
 *
 * The survivor is the one with a direct publisher link and the earliest
 * publication, so the node keeps its best attribution instead of whichever
 * collector happened to run last.
 */
function collapseDuplicates(records: readonly TopicEvidence[]) {
  const byKey = new Map<string, TopicEvidence>();
  for (const record of records) {
    const key = dedupeKey(record);
    const current = byKey.get(key);
    if (!current || compareRank(recordRank(record), recordRank(current)) < 0) {
      byKey.set(key, record);
    }
  }
  return [...byKey.values()];
}

/** Deterministic order: oldest first collection, then id. */
function compareEvidence(a: TopicEvidence, b: TopicEvidence) {
  const byCollection = a.firstCollectedAt.getTime() - b.firstCollectedAt.getTime();
  if (byCollection !== 0) return byCollection;
  const byPublication = a.publishedAt.getTime() - b.publishedAt.getTime();
  if (byPublication !== 0) return byPublication;
  return a.id.localeCompare(b.id);
}

/** Stable 12-hex id from the seed record's source identity. */
function topicIdFor(seed: TopicEvidence) {
  return `topic:${createHash("sha1").update(seed.id).digest("hex").slice(0, 12)}`;
}

/**
 * A source-grounded label: a real title that names the event, not a generated
 * summary and not a body paragraph. News headlines are written to name the
 * event, so they win; otherwise the representative's own title is used, and a
 * forum body is only a fallback when it has no title at all.
 */
function labelFor(member: TopicEvidence, group: readonly TopicEvidence[]) {
  const titled = group.filter((item) => normalizeSpaces(item.title).length >= 8);
  const newsTitles = titled.filter((item) => item.evidenceType === "news");
  const candidates = [member, ...newsTitles, ...titled].filter(
    (item) => normalizeSpaces(item.title).length >= 8,
  );
  const chosen = candidates[0];
  if (chosen) {
    const title = normalizeSpaces(chosen.title);
    return title.length > MAX_LABEL_CHARS
      ? `${title.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…`
      : title;
  }
  const text = readingText(member);
  // Fall back to the first clause: leading sentences state the event far more
  // often than later ones in forum posts.
  const clause = text.split(/(?<=[.!?])\s| - |\s\|\s/)[0] ?? text;
  const trimmed =
    clause.length > MAX_LABEL_CHARS ? `${clause.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…` : clause;
  return trimmed || "(không có tiêu đề)";
}

/**
 * Medoid: the member closest to the rest of the group. It is the most
 * representative *evidence*, and its text backs the label and the description.
 */
function medoid(members: readonly PreparedRecord[]) {
  let best = members[0]!;
  let bestScore = -Infinity;
  for (const candidate of members) {
    let total = 0;
    for (const other of members) {
      if (other === candidate) continue;
      total += pairSimilarity(candidate, other);
    }
    if (total > bestScore) {
      bestScore = total;
      best = candidate;
    }
  }
  return best;
}

/** The per-group evidence counts and observed time range. */
interface GroupCounts {
  discussionPosts: number;
  newsPosts: number;
  publishers: number;
  authors: number;
  segments: string[];
  firstSeenAt: Date;
  lastSeenAt: Date;
}

function describeGroup(prepared: readonly PreparedRecord[]): GroupCounts {
  const authors = new Set<string>();
  const publishers = new Set<string>();
  const segments = new Set<string>();
  let discussionPosts = 0;
  let newsPosts = 0;
  for (const record of prepared) {
    for (const segment of record.evidence.segments) segments.add(segment);
    if (record.evidence.evidenceType === "news") {
      newsPosts += 1;
      if (record.evidence.publisher) publishers.add(record.evidence.publisher);
    } else {
      discussionPosts += 1;
      if (record.evidence.authorId && !record.evidence.authorId.endsWith(":unknown")) {
        authors.add(record.evidence.authorId);
      }
    }
  }
  // Local observation history is distinct from source publication/activity time.
  let firstSeenAt = Number.POSITIVE_INFINITY;
  let lastSeenAt = Number.NEGATIVE_INFINITY;
  for (const record of prepared) {
    const { observedAt, firstCollectedAt } = record.evidence;
    firstSeenAt = Math.min(firstSeenAt, firstCollectedAt.getTime());
    lastSeenAt = Math.max(lastSeenAt, observedAt.getTime(), firstCollectedAt.getTime());
  }
  return {
    discussionPosts,
    newsPosts,
    publishers: publishers.size,
    authors: authors.size,
    segments: [...segments].sort(),
    firstSeenAt: new Date(Number.isFinite(firstSeenAt) ? firstSeenAt : Date.now()),
    lastSeenAt: new Date(Number.isFinite(lastSeenAt) ? lastSeenAt : Date.now()),
  };
}

/**
 * Group records into specific topics.
 *
 * Input order does not matter: records are sorted deterministically, duplicates
 * are collapsed first, and membership is complete-linkage, so the same set of
 * records always yields the same groups, ids, labels, and ordering (strongest
 * first, ties broken by id).
 *
 * The scan is bounded by a candidate index instead of the group list. Identity
 * support requires a reproduced three-token phrase or a shared product
 * identifier (see `anchorSupport`), and every such key is registered in
 * `identityKeys`; two records sharing no key cannot pair, so a group that shares
 * no key with the incoming record cannot accept it. The index therefore skips
 * only comparisons that are already impossible — the partition is identical to
 * the exhaustive scan, minus the comparisons that could never succeed.
 */
export function groupSpecificTopics(records: readonly TopicEvidence[]): TopicGroup[] {
  const prepared = collapseDuplicates(records).sort(compareEvidence).map(prepare);

  const groups: PreparedRecord[][] = [];
  /** Identity key → indices of groups holding at least one record with it. */
  const groupsByKey = new Map<number, number[]>();
  /** Per-group key set, so an appended member does not re-add its group. */
  const groupKeys: Set<number>[] = [];
  /** Marks a group as already a candidate for the record being placed. */
  const seen: number[] = [];
  const seenStamp = { value: 0 };

  for (const record of prepared) {
    // Candidate groups in creation order, which is what keeps the tie-break
    // ("first group wins an equal mean") identical to the exhaustive scan.
    seenStamp.value += 1;
    const candidates: number[] = [];
    for (const key of record.identityKeys) {
      const owners = groupsByKey.get(key);
      if (!owners) continue;
      for (const index of owners) {
        if (seen[index] === seenStamp.value) continue;
        seen[index] = seenStamp.value;
        candidates.push(index);
      }
    }
    candidates.sort((a, b) => a - b);

    let bestGroup: PreparedRecord[] | null = null;
    let bestGroupIndex = -1;
    let bestSimilarity = -Infinity;
    for (const index of candidates) {
      const group = groups[index]!;
      let similarity = 0;
      let joined = true;
      for (const member of group) {
        // Complete linkage: every rule against every current member. The pair
        // test itself decides whether this record may join at all — an
        // unanchored paraphrase is allowed in, two unanchored records never pair.
        const match = pairMatch(record, member, GROUPING_THRESHOLD);
        if (match < 0) {
          joined = false;
          break;
        }
        similarity += match;
      }
      // Average similarity to the group, so the tightest fit wins when two
      // groups both accept the record.
      if (joined) {
        const mean = similarity / group.length;
        if (mean > bestSimilarity) {
          bestSimilarity = mean;
          bestGroup = group;
          bestGroupIndex = index;
        }
      }
    }

    if (bestGroup) {
      bestGroup.push(record);
      const keys = groupKeys[bestGroupIndex]!;
      for (const key of record.identityKeys) {
        if (keys.has(key)) continue;
        keys.add(key);
        const owners = groupsByKey.get(key);
        if (owners) owners.push(bestGroupIndex);
        else groupsByKey.set(key, [bestGroupIndex]);
      }
      continue;
    }

    const index = groups.length;
    groups.push([record]);
    seen[index] = 0;
    const keys = new Set(record.identityKeys);
    groupKeys.push(keys);
    for (const key of keys) {
      const owners = groupsByKey.get(key);
      if (owners) owners.push(index);
      else groupsByKey.set(key, [index]);
    }
  }

  // A record that names nothing and stands alone is chat, not a topic: "chào
  // mọi người, hôm nay trời đẹp" is a greeting, and drawing it as an event would
  // claim coverage the evidence does not support. It can still JOIN an anchored
  // topic above, which is how an unanchored paraphrase contributes.
  const topicGroups = groups.filter((members) => members.length > 1 || members[0]!.specific);

  const sized = topicGroups.map((members) => {
    const representative = medoid(members).evidence;
    const seed = [...members].sort((a, b) => compareEvidence(a.evidence, b.evidence))[0]!.evidence;
    const counts = describeGroup(members);
    return {
      id: topicIdFor(seed),
      label: labelFor(
        representative,
        members.map((member) => member.evidence),
      ),
      representative,
      members: members.map((member) => member.evidence),
      ...counts,
    } satisfies TopicGroup;
  });

  // Deterministic ranking: independent evidence first, then recency. Scoring is
  // a separate, explicit step so the map can add observation history without
  // changing how groups are built.
  sized.sort((a, b) => {
    const supportA = a.authors + a.publishers;
    const supportB = b.authors + b.publishers;
    if (supportA !== supportB) return supportB - supportA;
    if (a.members.length !== b.members.length) return b.members.length - a.members.length;
    const newestA = a.representative.publishedAt.getTime();
    const newestB = b.representative.publishedAt.getTime();
    if (newestA !== newestB) return newestB - newestA;
    return a.id.localeCompare(b.id);
  });
  return sized;
}

/** Options shared by scoring and radius so the two cannot drift apart. */
export interface TopicScoreOptions {
  /** Reference instant; defaults to now, injected by tests. */
  now?: Date;
  /** Width of each velocity window. Two windows must be observable. */
  velocityWindowHours?: number;
  /**
   * Hours of observation history available to the collector. Below twice the
   * velocity window, growth is unmeasured and stays neutral.
   */
  observedSpanHours?: number;
}

export const VELOCITY_WINDOW_HOURS = 6;

/**
 * Components are normalized to 0..1 before weighting so one long-running topic
 * cannot dominate through raw volume, and a support factor keeps tiny samples
 * from scoring high.
 *
 * - reach: independent evidence (community accounts + news publishers), log
 *   scaled. A publisher is not a person and an account is not a verified
 *   person; neither is merged across sources.
 * - velocity: records *first collected* in consecutive windows. Collection
 *   growth is measured; an old forum thread bumped today is not publication
 *   growth, which is why this uses `firstCollectedAt`, not `publishedAt`.
 * - spread: distinct observed collection contexts, normalized by the catalog.
 * - persistence: how long the topic has been observable at all.
 * - diversity: independent sources per record. One account reposting itself
 *   must not outrank several accounts saying the same thing.
 */
export function scoreTopic(group: TopicGroup, options: TopicScoreOptions = {}): TrendScore {
  const now = options.now ?? new Date();
  const windowHours = options.velocityWindowHours ?? VELOCITY_WINDOW_HOURS;
  const observedSpanHours = options.observedSpanHours;

  const posts = group.discussionPosts + group.newsPosts;
  const support = group.authors + group.publishers;

  const recentStart = now.getTime() - windowHours * 3_600_000;
  const priorStart = recentStart - windowHours * 3_600_000;
  let recent = 0;
  let prior = 0;
  for (const member of group.members) {
    const collected = member.firstCollectedAt.getTime();
    if (collected > recentStart) recent += 1;
    else if (collected > priorStart) prior += 1;
  }

  // Growth needs two comparable windows. Until the collector has that much
  // history, "no prior records" means unmeasured, not infinite growth; the same
  // unknown-is-not-zero rule the coverage panel follows.
  const comparable = observedSpanHours !== undefined && observedSpanHours >= windowHours * 2;
  const velocity = !comparable
    ? 0.5
    : prior === 0
      ? recent > 0
        ? 1
        : 0
      : Math.min(1, recent / (prior * 2));

  const reach = Math.min(1, Math.log10(support + 1) / Math.log10(11));
  const spread = Math.min(1, group.segments.length / Math.max(1, VIEWER_SEGMENTS.length));

  const ageHours = Math.max(
    0,
    (group.lastSeenAt.getTime() - group.firstSeenAt.getTime()) / 3_600_000,
  );
  const persistence = Math.min(1, ageHours / 12);
  const diversity = posts === 0 ? 0 : Math.min(1, support / posts);

  const raw = 0.34 * reach + 0.26 * velocity + 0.18 * spread + 0.12 * persistence + 0.1 * diversity;

  // Evidence volume gates the score: one independent source keeps 30%, five or
  // more keep all of it. The curve is linear so ranking stays stable.
  const confidence = 0.3 + 0.7 * Math.min(1, support / 5);

  return {
    potential: Math.round(raw * confidence * 100),
    reach,
    velocity,
    spread,
    persistence,
    diversity,
    confidence,
    authors: group.authors,
    posts,
  };
}

/**
 * Radius grows with the square root of potential so circle *area* tracks the
 * score, and the mapping is strictly monotonic: three independent posts about a
 * model always draw larger than an unrelated one-off.
 */
export function radiusForPotential(potential: number) {
  const bounded = Math.min(100, Math.max(0, potential));
  return Math.round((4 + Math.sqrt(bounded / 100) * 16) * 100) / 100;
}

/** One measured, anchor-supported relationship between two distinct topics. */
export interface RelatedTopicEdge {
  source: string;
  target: string;
  similarity: number;
  weight: number;
}

/** Framing a discussion is not evidence of a shared subject. */
const RELATED_FRAMING = tokenSet("dân chia sẻ kinh nghiệm hỏi tư vấn tâm sự ý kiến thảo luận");

interface RelatedRecord {
  record: PreparedRecord;
  headline: Set<string>;
  subjects: Map<string, string | null>;
  families: Map<string, Set<string>>;
  identifiers: Set<string>;
}

/**
 * Related topics need semantic proximity and shared subject evidence, not an
 * identical event. Versions, places and numeric details may differ here.
 * A specific phrase can relate discussions without a proper name; a shared
 * name alone needs additional context so a city cannot connect unrelated news.
 */
function relatedFloor(a: RelatedRecord, b: RelatedRecord, threshold: number) {
  let headlineOverlap = 0;
  for (const token of a.headline) {
    if (!NUMBER_TOKEN.test(token) && b.headline.has(token)) headlineOverlap += 1;
  }
  if (headlineOverlap >= 3 && hasSharedPhrase(a.record, b.record)) return threshold;
  for (const family of a.families.keys()) {
    if (b.families.has(family)) return threshold;
  }
  for (const aName of a.subjects.keys()) {
    for (const bName of b.subjects.keys()) {
      const sameSubject =
        aName === bName || aName.endsWith(` ${bName}`) || bName.endsWith(` ${aName}`);
      if (!sameSubject) continue;
      const subjectWords = new Set([...contentTokens(aName), ...contentTokens(bName)]);
      if (subjectWords.size === 0) continue;
      let context = 0;
      for (const token of a.headline) {
        if (!subjectWords.has(token) && !NUMBER_TOKEN.test(token) && b.headline.has(token)) {
          if (++context >= 2) return threshold;
        }
      }
    }
  }
  if (headlineOverlap >= 3) return Math.max(threshold, 0.91);
  for (const identifier of a.identifiers) {
    if (b.identifiers.has(identifier)) return Math.max(threshold, 0.91);
  }
  return Infinity;
}

function relatedPair(a: RelatedRecord, b: RelatedRecord, threshold: number) {
  if (historicalConflict(a.record, b.record)) return null;
  // Reject unsupported pairs before the dot product. This makes examining all
  // shared-key candidates practical without dropping a late topic's neighbours.
  const floor = relatedFloor(a, b, threshold);
  if (!Number.isFinite(floor)) return null;
  const similarity = pairSimilarity(a.record, b.record);
  return similarity >= floor ? { similarity } : null;
}

/**
 * Every inverted-index key on which `relatedPair` could accept this topic.
 *
 * Each branch of that test compares headline terms, identifiers, families, or
 * subject names, and names may differ by a head ("Tiểu học Kim Liên" vs "Kim
 * Liên"), so a name contributes its own key plus every proper suffix.
 */
function relatedKeys(item: RelatedRecord) {
  const keys = new Set<string>();
  for (const token of item.headline) {
    if (!NUMBER_TOKEN.test(token)) keys.add(`h:${token}`);
  }
  for (const identifier of item.identifiers) keys.add(`i:${identifier}`);
  for (const family of item.families.keys()) keys.add(`f:${family}`);
  for (const name of item.subjects.keys()) {
    const words = name.split(" ");
    for (let start = 0; start < words.length; start += 1) {
      keys.add(`s:${words.slice(start).join(" ")}`);
    }
  }
  return keys;
}

export interface RelatedEdgeOptions {
  threshold?: number;
  maxDegree?: number;
}

/**
 * Related-topic edges between *groups*, never between posts or sources.
 *
 * Shared subject/phrase evidence plus semantic proximity creates a relation.
 * Identity guards still keep different releases and incidents in distinct nodes.
 * Degree stays capped so contextual links do not become a hairball.
 *
 * The candidate set comes from a shared-key index (headline terms, product
 * families, acronyms) instead of the first N ordered pairs. Both sides must
 * share at least one key for `relatedPair` to return anything — every branch of
 * that test reads a shared headline term, identifier, family, or subject — so
 * the index removes only impossible comparisons while making every topic, late
 * ones included, propose its own candidates.
 */
export function relatedTopicEdges(
  groups: readonly TopicGroup[],
  options: RelatedEdgeOptions = {},
): RelatedTopicEdge[] {
  const threshold = options.threshold ?? RELATED_THRESHOLD;
  const maxDegree = options.maxDegree ?? 3;
  if (groups.length < 2) return [];

  const prepared: RelatedRecord[] = groups.map((group) => ({
    record: prepare(group.representative),
    headline: new Set(contentTokens(group.label).filter((token) => !RELATED_FRAMING.has(token))),
    subjects: namedEntities(group.label),
    families: familyVersions(group.label),
    // Preserve real acronyms/camel-case products even at the start of a title.
    identifiers: new Set(
      [...group.label.matchAll(/\b(?:[A-Z][A-Z\d._-]+|[A-Z][a-z]+[A-Z][A-Za-z\d]*)\b/g)].map(
        (match) => match[0].toLowerCase(),
      ),
    ),
  }));

  // Index every suffix on both sides so candidate membership is symmetric.
  // Each shared-key pair is evaluated once; there is no corpus-prefix budget.
  const keys = prepared.map(relatedKeys);
  const byKey = new Map<string, number[]>();
  keys.forEach((ownedKeys, index) => {
    for (const key of ownedKeys) {
      const owners = byKey.get(key);
      if (owners) owners.push(index);
      else byKey.set(key, [index]);
    }
  });
  const candidates: { left: number; right: number; similarity: number }[] = [];
  for (let index = 0; index < prepared.length; index += 1) {
    const examined = new Set<number>();
    for (const key of keys[index]!) {
      const owners = byKey.get(key)!;
      for (const owner of owners) {
        if (owner <= index || examined.has(owner)) continue;
        examined.add(owner);
        const pair = relatedPair(prepared[index]!, prepared[owner]!, threshold);
        if (pair) candidates.push({ left: index, right: owner, similarity: pair.similarity });
      }
    }
  }

  candidates.sort(
    (a, b) =>
      b.similarity - a.similarity ||
      groups[a.left]!.id.localeCompare(groups[b.left]!.id) ||
      groups[a.right]!.id.localeCompare(groups[b.right]!.id),
  );
  const degree = new Map<string, number>();
  const edges: RelatedTopicEdge[] = [];
  for (const candidate of candidates) {
    const source = groups[candidate.left]!.id;
    const target = groups[candidate.right]!.id;
    const sourceDegree = degree.get(source) ?? 0;
    const targetDegree = degree.get(target) ?? 0;
    if (sourceDegree >= maxDegree || targetDegree >= maxDegree) continue;
    degree.set(source, sourceDegree + 1);
    degree.set(target, targetDegree + 1);
    edges.push({
      source,
      target,
      // Ranked evidence, not calibrated confidence: keep three decimals so the
      // payload stays small and the number stops implying precision.
      similarity: Math.round(candidate.similarity * 1000) / 1000,
      weight: Math.round(candidate.similarity * 1000) / 1000,
    });
  }
  // Deterministic output order for stable diffs and tests.
  edges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  return edges;
}
