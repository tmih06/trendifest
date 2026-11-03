// The product palette, from the OpenDesk web app. Each tone has a tinted chip
// (soft fill, ink text, inset hairline) and a solid fill for dots.
//
// The class strings are spelled out so Tailwind can see them.

export const TONES = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
  "rose",
] as const;

export type Tone = (typeof TONES)[number];

type ToneClasses = {
  /** Soft fill with ink text: badges, chips, pills. */
  chip: string;
  /** Solid fill: dots, bars, tiles. */
  solid: string;
};

export const tone: Record<Tone, ToneClasses> = {
  gray: {
    chip: "bg-tone-gray-soft text-tone-gray shadow-[inset_0_0_0_1px_var(--tone-gray-line)]",
    solid: "bg-tone-gray-solid",
  },
  red: {
    chip: "bg-tone-red-soft text-tone-red shadow-[inset_0_0_0_1px_var(--tone-red-line)]",
    solid: "bg-tone-red-solid",
  },
  orange: {
    chip: "bg-tone-orange-soft text-tone-orange shadow-[inset_0_0_0_1px_var(--tone-orange-line)]",
    solid: "bg-tone-orange-solid",
  },
  amber: {
    chip: "bg-tone-amber-soft text-tone-amber shadow-[inset_0_0_0_1px_var(--tone-amber-line)]",
    solid: "bg-tone-amber-solid",
  },
  yellow: {
    chip: "bg-tone-yellow-soft text-tone-yellow shadow-[inset_0_0_0_1px_var(--tone-yellow-line)]",
    solid: "bg-tone-yellow-solid",
  },
  lime: {
    chip: "bg-tone-lime-soft text-tone-lime shadow-[inset_0_0_0_1px_var(--tone-lime-line)]",
    solid: "bg-tone-lime-solid",
  },
  green: {
    chip: "bg-tone-green-soft text-tone-green shadow-[inset_0_0_0_1px_var(--tone-green-line)]",
    solid: "bg-tone-green-solid",
  },
  teal: {
    chip: "bg-tone-teal-soft text-tone-teal shadow-[inset_0_0_0_1px_var(--tone-teal-line)]",
    solid: "bg-tone-teal-solid",
  },
  cyan: {
    chip: "bg-tone-cyan-soft text-tone-cyan shadow-[inset_0_0_0_1px_var(--tone-cyan-line)]",
    solid: "bg-tone-cyan-solid",
  },
  blue: {
    chip: "bg-tone-blue-soft text-tone-blue shadow-[inset_0_0_0_1px_var(--tone-blue-line)]",
    solid: "bg-tone-blue-solid",
  },
  indigo: {
    chip: "bg-tone-indigo-soft text-tone-indigo shadow-[inset_0_0_0_1px_var(--tone-indigo-line)]",
    solid: "bg-tone-indigo-solid",
  },
  violet: {
    chip: "bg-tone-violet-soft text-tone-violet shadow-[inset_0_0_0_1px_var(--tone-violet-line)]",
    solid: "bg-tone-violet-solid",
  },
  purple: {
    chip: "bg-tone-purple-soft text-tone-purple shadow-[inset_0_0_0_1px_var(--tone-purple-line)]",
    solid: "bg-tone-purple-solid",
  },
  pink: {
    chip: "bg-tone-pink-soft text-tone-pink shadow-[inset_0_0_0_1px_var(--tone-pink-line)]",
    solid: "bg-tone-pink-solid",
  },
  rose: {
    chip: "bg-tone-rose-soft text-tone-rose shadow-[inset_0_0_0_1px_var(--tone-rose-line)]",
    solid: "bg-tone-rose-solid",
  },
};

export const isTone = (v: unknown): v is Tone =>
  typeof v === "string" && (TONES as readonly string[]).includes(v);
