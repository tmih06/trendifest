/**
 * Fictional network model for the graph prototype. Patterns connect to the
 * concepts, sounds and communities that explain them; every observation is
 * invented and no platform or model is contacted.
 */
export type NodeKind = "pattern" | "concept" | "sound" | "community";
export type Stage = "nascent" | "emerging" | "spreading" | "saturating";
export type Source = "Bluesky" | "Reddit" | "Short video";
export type Relation = "expresses" | "uses" | "spreads in" | "echoes";

export const SOURCE_OPTIONS: Source[] = ["Bluesky", "Reddit", "Short video"];

export const STAGE_LABEL: Record<Stage, string> = {
  nascent: "Nascent",
  emerging: "Emerging",
  spreading: "Spreading",
  saturating: "Saturating",
};

export const STAGE_COLOR: Record<Stage, string> = {
  nascent: "--chart-5",
  emerging: "--chart-1",
  spreading: "--success",
  saturating: "--muted-foreground",
};

export const KIND_LABEL: Record<NodeKind, string> = {
  pattern: "Pattern",
  concept: "Concept",
  sound: "Sound",
  community: "Community",
};

export const KIND_COLOR: Record<NodeKind, string> = {
  pattern: "--chart-1",
  concept: "--muted-foreground",
  sound: "--chart-5",
  community: "--chart-2",
};

export interface Evidence {
  quote: string;
  source: Source;
}

export interface Pattern {
  id: string;
  name: string;
  subtitle: string;
  stage: Stage;
  score: number;
  creators: number;
  growth: number;
  age: string;
  sources: Source[];
  summary: string;
  format: string;
  conceptIds: string[];
  soundId: string;
  communityIds: string[];
  evidence: Evidence[];
  trajectory: number[];
  outlook: string;
  caution: string;
}

export interface LeafDefinition {
  id: string;
  label: string;
  description: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  description: string;
  radius: number;
  degree: number;
  pattern?: Pattern;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  relation: Relation;
}

export interface Connection {
  node: GraphNode;
  relation: Relation;
}

export const PATTERNS: Pattern[] = [
  {
    id: "side-quest",
    name: "Side quest energy",
    subtitle: "Small errands, disproportionate narrative weight.",
    stage: "emerging",
    score: 86,
    creators: 143,
    growth: 238,
    age: "18h",
    sources: ["Bluesky", "Reddit", "Short video"],
    summary:
      "People frame an ordinary task as an elaborate mission. The joke lives in the mismatch between a small errand and the importance of the quest.",
    format: "Quest prompt → mundane task → disproportionate reward",
    conceptIds: ["everyday-task", "high-stakes", "game-language"],
    soundId: "quest-chime",
    communityIds: ["cozy-gaming", "student-life", "everyday-humor"],
    evidence: [
      {
        quote: "Main quest: go home. Side quest: befriend the bakery cat.",
        source: "Bluesky",
      },
      {
        quote: "+10 XP for finally replying to that email.",
        source: "Short video",
      },
    ],
    trajectory: [4, 9, 22, 51, 143],
    outlook:
      "New versions are moving beyond gaming circles. Watch for contributors who have never used the format before.",
    caution:
      "Most samples still come from gaming-adjacent communities. Broader adoption is not established.",
  },
  {
    id: "low-battery",
    name: "Low battery",
    subtitle: "A tiny status bar for running on empty.",
    stage: "nascent",
    score: 79,
    creators: 92,
    growth: 310,
    age: "9h",
    sources: ["Bluesky", "Short video"],
    summary:
      "A nearly empty battery marker is placed over a person or scene to describe exhaustion without naming it. One graphic does the emotional work.",
    format: "Ordinary moment → battery overlay → imminent shutdown",
    conceptIds: ["visual-metaphor", "energy-depletion", "everyday-task", "work-grievance"],
    soundId: "low-battery-tone",
    communityIds: ["work-culture", "student-life", "everyday-humor"],
    evidence: [
      {
        quote: "Social battery after the meeting that could have been an email.",
        source: "Bluesky",
      },
      {
        quote: "Still technically online.",
        source: "Short video",
      },
    ],
    trajectory: [2, 6, 17, 41, 92],
    outlook:
      "The visual is easy to remix. A new setting, rather than a new caption, is the signal to watch.",
    caution:
      "The sample is small and concentrated in work humor. Percentage growth starts from a low base.",
  },
  {
    id: "polite-crashout",
    name: "Polite crashout",
    subtitle: "Immaculate manners over visible chaos.",
    stage: "spreading",
    score: 74,
    creators: 218,
    growth: 195,
    age: "29h",
    sources: ["Reddit", "Short video"],
    summary:
      "An excessively calm, courteous delivery contrasts with a visibly chaotic scene. The humor depends on the gap between the voice and what is happening.",
    format: "Courteous introduction → visible chaos → calm sign-off",
    conceptIds: ["deadpan-irony", "service-voice", "containment", "work-grievance"],
    soundId: "hold-music",
    communityIds: ["customer-service", "work-culture", "everyday-humor"],
    evidence: [
      {
        quote: "A gentle reminder that I have lost the plot.",
        source: "Reddit",
      },
      {
        quote: "Thank you for your patience during my character development.",
        source: "Short video",
      },
    ],
    trajectory: [8, 23, 61, 130, 218],
    outlook:
      "The structure is appearing in several unrelated communities. Watch whether the delivery changes, not just the subject.",
    caution:
      "Some new posts discuss the format rather than perform it. Those are not counted as new creative adoption.",
  },
  {
    id: "objects-at-work",
    name: "Objects at work",
    subtitle: "The desk lamp has a job and a grievance.",
    stage: "emerging",
    score: 68,
    creators: 64,
    growth: 204,
    age: "12h",
    sources: ["Bluesky", "Reddit"],
    summary:
      "Everyday objects receive job titles and workplace complaints. Their physical purpose becomes a small human work situation.",
    format: "Object portrait → job title → workplace grievance",
    conceptIds: ["object-personification", "work-grievance", "visual-metaphor"],
    soundId: "office-hum",
    communityIds: ["design", "work-culture", "everyday-humor"],
    evidence: [
      {
        quote: "Senior illumination specialist. Still waiting on the brief.",
        source: "Bluesky",
      },
      {
        quote: "The stapler has requested a four-day week.",
        source: "Reddit",
      },
    ],
    trajectory: [1, 5, 14, 31, 64],
    outlook:
      "A new object is a natural variant. Watch for contributions from outside the original design cohort.",
    caution:
      "Several examples come from the same small design community. Independent spread needs more evidence.",
  },
  {
    id: "frame-vacation",
    name: "One-frame vacation",
    subtitle: "A tiny escape hidden inside a routine clip.",
    stage: "nascent",
    score: 62,
    creators: 34,
    growth: 288,
    age: "7h",
    sources: ["Short video"],
    summary:
      "A single frame of somewhere else interrupts an ordinary video. The joy is in catching a departure that almost escaped notice.",
    format: "Routine footage → one-frame escape → routine continues",
    conceptIds: ["quick-cut", "micro-escape", "visual-rhythm", "everyday-task"],
    soundId: "wave-crash",
    communityIds: ["editing", "design"],
    evidence: [
      {
        quote: "My brain briefly left the meeting.",
        source: "Short video",
      },
      {
        quote: "A very short out-of-office.",
        source: "Short video",
      },
    ],
    trajectory: [1, 3, 8, 17, 34],
    outlook:
      "The timing is the format. Watch for new editors using the interruption rather than copying the exact scene.",
    caution:
      "Sparse frame sampling can miss the entire pattern. This family needs targeted frame inspection.",
  },
  {
    id: "corporate-lore",
    name: "Corporate lore",
    subtitle: "A trivial origin story, told like a documentary.",
    stage: "saturating",
    score: 41,
    creators: 960,
    growth: 18,
    age: "4d",
    sources: ["Bluesky", "Reddit", "Short video"],
    summary:
      "A mundane workplace detail becomes a dramatic piece of hidden history. The reveal structure is now appearing in personal and brand-account versions.",
    format: "Mysterious setup → trivial origin story → dramatic reveal",
    conceptIds: ["origin-story", "brand-voice", "overexposure", "work-grievance", "deadpan-irony"],
    soundId: "lore-sting",
    communityIds: ["brand-accounts", "work-culture", "everyday-humor"],
    evidence: [
      {
        quote: "The untold history of the shared office mug.",
        source: "Bluesky",
      },
      {
        quote: "Every logo has a backstory. This one has three.",
        source: "Short video",
      },
    ],
    trajectory: [180, 420, 690, 870, 960],
    outlook:
      "New-creator growth is slowing, but a different community could still find a fresh use. Brand adoption alone is not proof of death.",
    caution:
      "Corporate participation does not establish causation. The stronger saturation signal is the flattening rate of new creators.",
  },
];

export const CONCEPTS: LeafDefinition[] = [
  {
    id: "everyday-task",
    label: "Everyday task",
    description: "A small routine reframed as something with its own rules and rewards.",
  },
  {
    id: "high-stakes",
    label: "Disproportionate stakes",
    description: "A minor errand is given outsized narrative importance.",
  },
  {
    id: "game-language",
    label: "Game language",
    description: "Quest, XP and objective vocabulary applied outside a game.",
  },
  {
    id: "visual-metaphor",
    label: "Visual metaphor",
    description: "A simple graphic carries an emotional state that words would overexplain.",
  },
  {
    id: "energy-depletion",
    label: "Energy depletion",
    description: "Fatigue represented as a measurable resource running out.",
  },
  {
    id: "deadpan-irony",
    label: "Deadpan irony",
    description: "An intentionally calm surface placed over obvious chaos.",
  },
  {
    id: "service-voice",
    label: "Service voice",
    description: "Customer-support politeness repurposed as a reaction to the absurd.",
  },
  {
    id: "containment",
    label: "Emotional containment",
    description: "Composure performed while it is clearly failing.",
  },
  {
    id: "object-personification",
    label: "Object personification",
    description: "An object receives a job, feelings, or a workplace grievance.",
  },
  {
    id: "work-grievance",
    label: "Workplace grievance",
    description: "A minor professional complaint made broadly relatable.",
  },
  {
    id: "quick-cut",
    label: "Quick cut",
    description: "A one-beat interruption does the work of a whole joke.",
  },
  {
    id: "micro-escape",
    label: "Micro-escape",
    description: "A tiny imagined departure from an ordinary present.",
  },
  {
    id: "visual-rhythm",
    label: "Visual rhythm",
    description: "Timing, repetition and editing carry the meaning.",
  },
  {
    id: "origin-story",
    label: "Origin story",
    description: "A trivial detail is framed as deep, dramatic history.",
  },
  {
    id: "brand-voice",
    label: "Brand voice",
    description: "Corporate language adopting an internet-native format.",
  },
  {
    id: "overexposure",
    label: "Overexposure",
    description: "A format becomes familiar enough that surprise is harder to sustain.",
  },
];

export const SOUNDS: LeafDefinition[] = [
  {
    id: "quest-chime",
    label: "Quest chime",
    description: "A short reward cue borrowed from games and used as punctuation.",
  },
  {
    id: "low-battery-tone",
    label: "Low battery tone",
    description: "A descending device alert that signals imminent shutdown.",
  },
  {
    id: "hold-music",
    label: "Hold music",
    description: "A bland, patient loop that undercuts the chaos around it.",
  },
  {
    id: "office-hum",
    label: "Office ambience",
    description: "Fluorescent hum, keyboards and the sound of a shared room.",
  },
  {
    id: "wave-crash",
    label: "One-frame wave",
    description: "A tiny burst of surf interrupting room tone.",
  },
  {
    id: "lore-sting",
    label: "Lore sting",
    description: "A serious documentary accent applied to something trivial.",
  },
];

export const COMMUNITIES: LeafDefinition[] = [
  {
    id: "cozy-gaming",
    label: "Cozy gaming",
    description: "Low-stakes game worlds and the vocabulary people bring out of them.",
  },
  {
    id: "student-life",
    label: "Student life",
    description: "Campus routines, deadlines and shared exhaustion.",
  },
  {
    id: "everyday-humor",
    label: "Everyday humor",
    description: "Relatable observations about ordinary life.",
  },
  {
    id: "work-culture",
    label: "Work culture",
    description: "Office and service-industry routines.",
  },
  {
    id: "customer-service",
    label: "Customer service",
    description: "Scripted politeness under pressure.",
  },
  {
    id: "design",
    label: "Design",
    description: "Formats, objects and visual craft.",
  },
  {
    id: "editing",
    label: "Editing",
    description: "Cut rhythm, transitions and post-production tricks.",
  },
  {
    id: "brand-accounts",
    label: "Brand accounts",
    description: "Corporate profiles posting in native internet formats.",
  },
];

const LEAVES: Record<string, { kind: NodeKind; entries: LeafDefinition[] }> = {
  concept: { kind: "concept", entries: CONCEPTS },
  sound: { kind: "sound", entries: SOUNDS },
  community: { kind: "community", entries: COMMUNITIES },
};

/** Pattern size comes from emergence, not raw creator volume. */
export function radiusForScore(score: number) {
  return 9.5 + score / 22;
}

export const GRAPH_NODES: GraphNode[] = [
  ...PATTERNS.map((pattern) => ({
    id: pattern.id,
    kind: "pattern" as const,
    label: pattern.name,
    description: pattern.summary,
    radius: radiusForScore(pattern.score),
    degree: 0,
    pattern,
  })),
  ...Object.values(LEAVES).flatMap(({ kind, entries }) =>
    entries.map((entry) => ({
      id: entry.id,
      kind,
      label: entry.label,
      description: entry.description,
      radius: kind === "community" ? 6.4 : kind === "sound" ? 5.7 : 4.8,
      degree: 0,
    })),
  ),
];

export const NODE_BY_ID = new Map(GRAPH_NODES.map((node) => [node.id, node]));

/** Pattern→signal connections. Sharing a leaf is what gives the network its shape. */
const PATTERN_LINKS: GraphLink[] = PATTERNS.flatMap((pattern) => [
  ...pattern.conceptIds.map((target) => ({
    id: `${pattern.id}:concept:${target}`,
    source: pattern.id,
    target,
    relation: "expresses" as const,
  })),
  {
    id: `${pattern.id}:sound:${pattern.soundId}`,
    source: pattern.id,
    target: pattern.soundId,
    relation: "uses" as const,
  },
  ...pattern.communityIds.map((target) => ({
    id: `${pattern.id}:community:${target}`,
    source: pattern.id,
    target,
    relation: "spreads in" as const,
  })),
]);

/** Direct, evidence-backed similarities between families, shown as short arcs. */
const RELATED_PATTERNS: [string, string][] = [
  ["side-quest", "objects-at-work"],
  ["low-battery", "polite-crashout"],
  ["polite-crashout", "corporate-lore"],
  ["corporate-lore", "objects-at-work"],
  ["frame-vacation", "low-battery"],
  ["side-quest", "frame-vacation"],
];

export const GRAPH_LINKS: GraphLink[] = [
  ...PATTERN_LINKS,
  ...RELATED_PATTERNS.map(([source, target]) => ({
    id: `echo:${source}:${target}`,
    source,
    target,
    relation: "echoes" as const,
  })),
];

// Degree is part of the visual grammar: shared signals become larger and earn
// a default label, while single-pattern leaves stay quiet until inspected.
const connectionCount = new Map<string, number>();
for (const link of GRAPH_LINKS) {
  connectionCount.set(link.source, (connectionCount.get(link.source) ?? 0) + 1);
  connectionCount.set(link.target, (connectionCount.get(link.target) ?? 0) + 1);
}
for (const node of GRAPH_NODES) {
  node.degree = connectionCount.get(node.id) ?? 0;
  if (node.kind !== "pattern") {
    const base = node.kind === "community" ? 6.4 : node.kind === "sound" ? 5.7 : 4.8;
    node.radius = base + Math.min(3.2, Math.max(0, node.degree - 1) * 0.6);
  }
}

const CONNECTIONS = new Map<string, Connection[]>();

for (const link of GRAPH_LINKS) {
  const source = NODE_BY_ID.get(link.source);
  const target = NODE_BY_ID.get(link.target);
  if (!source || !target) continue;
  CONNECTIONS.set(source.id, [
    ...(CONNECTIONS.get(source.id) ?? []),
    { node: target, relation: link.relation },
  ]);
  CONNECTIONS.set(target.id, [
    ...(CONNECTIONS.get(target.id) ?? []),
    { node: source, relation: link.relation },
  ]);
}

export function connectionsFor(id: string): Connection[] {
  return CONNECTIONS.get(id) ?? [];
}

export function searchTextFor(node: GraphNode): string {
  return [
    node.label,
    node.description,
    node.kind,
    node.pattern?.subtitle,
    node.pattern?.summary,
    node.pattern?.format,
    node.pattern?.sources.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function sourceLabels(sources: Source[]): string {
  if (sources.length === 1) return sources[0]!;
  return `${sources.slice(0, -1).join(", ")} & ${sources.at(-1)}`;
}
