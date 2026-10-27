import type { GeoOption, RangeKey } from "./types.ts";

export const RANGE_OPTIONS: Record<
  RangeKey,
  { googleTime: string; label: string; shortLabel: string; horizon: number }
> = {
  "3m": { googleTime: "today 3-m", label: "Past 3 months", shortLabel: "3M", horizon: 10 },
  "12m": { googleTime: "today 12-m", label: "Past 12 months", shortLabel: "12M", horizon: 6 },
  "5y": { googleTime: "today 5-y", label: "Past 5 years", shortLabel: "5Y", horizon: 8 },
};

export const RANGE_KEYS = Object.keys(RANGE_OPTIONS) as RangeKey[];

export const GEO_OPTIONS: GeoOption[] = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "JP", name: "Japan" },
];

export function isRangeKey(value: string): value is RangeKey {
  return value === "3m" || value === "12m" || value === "5y";
}

export function isGeoCode(value: string): boolean {
  return GEO_OPTIONS.some((option) => option.code === value.toUpperCase());
}

export function geoName(code: string): string {
  return GEO_OPTIONS.find((option) => option.code === code)?.name ?? code;
}
