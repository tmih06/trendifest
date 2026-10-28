/** Entirely fictional observations for the visual prototype; never sent to the API. */
export type PatternStage = "Nascent" | "Emerging" | "Spreading" | "Saturating";
export type SampleSource = "Bluesky" | "Reddit" | "Short-video lab";
export type EvidenceKind = "video" | "image" | "audio" | "text" | "community";

export interface MockPattern {
  id: string;
  name: string;
  subtitle: string;
  stage: PatternStage;
  score: number;
  growth: number;
  age: number;
  creators: number[];
  communities: string[];
  sources: SampleSource[];
  tags: string[];
  meaning: string;
  difference: string;
  format: string;
  sound: string;
  phrase: string;
  captions: string[];
  outlook: string;
  caution: string;
  art: "quest" | "battery" | "polite" | "objects" | "vacation" | "lore";
}

export const MOCK_PATTERNS: MockPattern[] = [
  {
    id: "side-quest",
    name: "Everything is a side quest",
    subtitle: "Ordinary errands. Unnecessary lore.",
    stage: "Emerging",
    score: 86,
    growth: 238,
    age: 18,
    creators: [7, 23, 61, 143],
    communities: ["Cozy gaming", "Everyday humor", "Student life", "Creative work"],
    sources: ["Bluesky", "Reddit", "Short-video lab"],
    tags: ["POV", "Gaming language", "Everyday rituals"],
    meaning:
      "People frame a small, ordinary task as an elaborate video-game mission. The joke is the mismatch between the trivial errand and the importance of the quest.",
    difference:
      "These examples share a storytelling format, not just the words ‘side quest’. A gaming review mentioning a side quest would not belong to this family.",
    format: "Quest overlay → mundane task → disproportionate reward",
    sound: "Soft chime + quest accepted",
    phrase: "Side quest accepted",
    captions: [
      "Main quest: go home. Side quest: befriend the bakery cat.",
      "Walked out for coffee. Returned with three new objectives.",
      "+10 XP for finally replying to that email.",
    ],
    outlook:
      "New adaptations are appearing outside gaming communities. Independent remixes make this more interesting than a single popular post.",
    caution:
      "Most observations still come from gaming-adjacent communities. Broader adoption is not established.",
    art: "quest",
  },
  {
    id: "low-battery",
    name: "Low battery living",
    subtitle: "A visual language for being almost out of energy.",
    stage: "Nascent",
    score: 79,
    growth: 310,
    age: 9,
    creators: [3, 12, 37, 92],
    communities: ["Work humor", "Student life", "Everyday humor"],
    sources: ["Bluesky", "Short-video lab"],
    tags: ["Visual metaphor", "Work life", "Energy"],
    meaning:
      "A tiny battery indicator is attached to a person or everyday object to express social or emotional exhaustion without saying it directly.",
    difference:
      "The repeated idea is energy depletion expressed through a battery overlay. Phone reviews and literal charging tips are excluded.",
    format: "Normal situation → battery overlay → tiny shutdown",
    sound: "Device disconnect tone",
    phrase: "Running on 2%",
    captions: [
      "Me after saying ‘you too’ to the delivery person.",
      "Social battery after the meeting that could have been an email.",
      "Still technically online.",
    ],
    outlook:
      "A simple visual device is being reused with different situations. The low barrier to remixing could support further adoption.",
    caution:
      "The sample is small and concentrated in work humor. Fast percentage growth starts from a low baseline.",
    art: "battery",
  },
  {
    id: "polite-crashout",
    name: "The polite crashout",
    subtitle: "Perfect manners. Absolutely no composure.",
    stage: "Spreading",
    score: 74,
    growth: 195,
    age: 29,
    creators: [14, 46, 115, 218],
    communities: [
      "Work humor",
      "Customer service",
      "Student life",
      "Everyday humor",
      "Creative work",
    ],
    sources: ["Reddit", "Short-video lab"],
    tags: ["Irony", "Voice contrast", "Work life"],
    meaning:
      "An excessively calm, courteous delivery contrasts with a visibly chaotic situation. The humor depends on the gap between the voice and the scene.",
    difference:
      "Positive sentiment in the transcript is misleading here. Audio delivery and visual context create the actual meaning.",
    format: "Courteous introduction → visible chaos → calm sign-off",
    sound: "‘Thank you for your patience’ voice",
    phrase: "With all due respect",
    captions: [
      "A gentle reminder that I have lost the plot.",
      "Thank you for your patience during my character development.",
      "Kind regards from the absolute edge.",
    ],
    outlook:
      "The format has reached multiple distinct communities, with variations in spoken delivery and setting.",
    caution:
      "Some new posts discuss the format rather than perform it. Those should not count as new creative adoptions.",
    art: "polite",
  },
  {
    id: "objects",
    name: "Objects with day jobs",
    subtitle: "The desk lamp is also just trying its best.",
    stage: "Emerging",
    score: 68,
    growth: 204,
    age: 12,
    creators: [4, 14, 31, 64],
    communities: ["Design", "Work humor", "Everyday humor"],
    sources: ["Bluesky", "Reddit"],
    tags: ["Personification", "Image macros", "Work life"],
    meaning:
      "Everyday objects are given a job title and a small workplace grievance. The recurring format turns their physical function into a human work situation.",
    difference:
      "The family is about a specific job-and-grievance setup, not every image of an object with a face.",
    format: "Object portrait → job title → workplace grievance",
    sound: "Office ambience",
    phrase: "Another day at the office",
    captions: [
      "Senior illumination specialist. Still waiting on the brief.",
      "The stapler has requested a four-day week.",
      "Middle management, but make it a houseplant.",
    ],
    outlook:
      "The image format is easy to adapt, and new objects create natural variants without needing a shared audio track.",
    caution:
      "Several examples come from the same small design cohort. Independent spread needs more evidence.",
    art: "objects",
  },
  {
    id: "vacations",
    name: "One-frame vacations",
    subtitle: "A tiny escape, hidden in an ordinary day.",
    stage: "Nascent",
    score: 62,
    growth: 288,
    age: 7,
    creators: [2, 8, 18, 34],
    communities: ["Editing", "Creative work"],
    sources: ["Short-video lab"],
    tags: ["Quick cuts", "Visual rhythm", "Escapism"],
    meaning:
      "A brief, almost subliminal vacation frame interrupts an ordinary routine. Viewers replay the clip to catch the imagined escape.",
    difference:
      "The meaningful feature is timing: a single-frame interruption. A still thumbnail or transcript alone loses the joke.",
    format: "Routine footage → one-frame escape → routine continues",
    sound: "Room tone with a tiny wave crash",
    phrase: "Mentally elsewhere",
    captions: [
      "Nothing to see here. Just processing the spreadsheet.",
      "My brain briefly left the meeting.",
      "A very short out-of-office.",
    ],
    outlook:
      "The edit pattern is distinctive and repeatable, but there is not enough independent adoption to distinguish a trend from an editing experiment.",
    caution:
      "Sparse frame sampling can miss the entire pattern. This example requires targeted frame inspection.",
    art: "vacation",
  },
  {
    id: "lore",
    name: "Corporate lore drops",
    subtitle: "An unnecessarily dramatic origin story.",
    stage: "Saturating",
    score: 41,
    growth: 18,
    age: 96,
    creators: [85, 282, 705, 960],
    communities: [
      "Work humor",
      "Brand accounts",
      "Design",
      "Creative work",
      "Student life",
      "Gaming",
      "Everyday humor",
    ],
    sources: ["Bluesky", "Reddit", "Short-video lab"],
    tags: ["Storytelling", "Brand adoption", "Overexposure"],
    meaning:
      "A mundane workplace detail is presented as a dramatic piece of hidden history. The same revelation structure now appears in personal and brand-account adaptations.",
    difference:
      "Corporate participation is an observation, not proof the format is dead. Slowing new-creator adoption is the stronger saturation signal here.",
    format: "Mysterious setup → trivial origin story → dramatic reveal",
    sound: "Dramatic documentary sting",
    phrase: "The lore runs deep",
    captions: [
      "The untold history of the shared office mug.",
      "Every logo has a backstory. This one has three.",
      "A documentary about why the printer is called Greg.",
    ],
    outlook:
      "The family is widely replicated, but new-creator growth is slowing. A new variant could still find a different audience.",
    caution:
      "Brand adoption does not imply causation. Do not label a meme dead just because a company used it.",
    art: "lore",
  },
];

/** Stages avoid implying a fixed duration; patterns in this mock have different histories. */
export const REPLAY_LABELS = [
  "First observed",
  "Early replication",
  "Community crossing",
  "Current snapshot",
];

export interface MockEvidence {
  id: string;
  label: string;
  detail: string;
  kind: EvidenceKind;
  source: SampleSource;
  x: number;
  y: number;
  appears: number;
  observed: boolean;
}

/** Stable coordinates preserve the mental map when replay adds observations. */
export function evidenceFor(pattern: MockPattern): MockEvidence[] {
  return [
    {
      id: "phrase",
      label: pattern.phrase,
      detail: "Related expression",
      kind: "text",
      source: pattern.sources[0]!,
      x: 19,
      y: 29,
      appears: 0,
      observed: false,
    },
    {
      id: "original",
      label: "First observed example",
      detail: "Example creator 01",
      kind: pattern.art === "objects" ? "image" : "video",
      source: pattern.sources[0]!,
      x: 49,
      y: 14,
      appears: 0,
      observed: true,
    },
    {
      id: "sound",
      label: pattern.sound,
      detail: "Shared audio motif",
      kind: "audio",
      source: pattern.sources.at(-1)!,
      x: 20,
      y: 74,
      appears: 1,
      observed: false,
    },
    {
      id: "remix",
      label: "A different setting",
      detail: "Example creator 02",
      kind: pattern.art === "objects" ? "image" : "video",
      source: pattern.sources.at(-1)!,
      x: 80,
      y: 32,
      appears: 1,
      observed: false,
    },
    {
      id: "visual",
      label: "Recurring visual format",
      detail: "Template relationship",
      kind: "image",
      source: pattern.sources[0]!,
      x: 77,
      y: 75,
      appears: 2,
      observed: false,
    },
    {
      id: "community",
      label: pattern.communities[1] ?? pattern.communities[0]!,
      detail: "New community crossing",
      kind: "community",
      source: pattern.sources.at(-1)!,
      x: 49,
      y: 89,
      appears: 3,
      observed: false,
    },
  ];
}
