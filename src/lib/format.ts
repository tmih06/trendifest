import { RANGE_OPTIONS } from "../../shared/config.ts";
import type { RangeKey } from "../../shared/types.ts";

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const mediumDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const signedPercent = new Intl.NumberFormat(undefined, {
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

function fromSeconds(seconds: number) {
  return new Date(seconds * 1000);
}

export function formatAxisDate(seconds: number, range: RangeKey) {
  const date = fromSeconds(seconds);
  if (range === "5y") return new Intl.DateTimeFormat(undefined, { year: "numeric" }).format(date);
  if (range === "3m") return shortDate.format(date);
  // A 12-month window crosses a year boundary; keeping the year on older ticks
  // prevents two "Dec" labels that look like a duplicate or an axis bug.
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    ...(sameYear ? {} : { year: "2-digit" }),
  }).format(date);
}

export function formatFullDate(seconds: number) {
  return mediumDate.format(fromSeconds(seconds));
}

export function formatDateTime(iso: string) {
  return dateTime.format(new Date(iso));
}

export function formatRelative(iso: string) {
  const delta = Date.parse(iso) - Date.now();
  const absolute = Math.abs(delta);
  if (absolute < 45_000) return "just now";
  if (absolute < 60 * 60 * 1000) {
    return relative.format(Math.round(delta / 60_000), "minute");
  }
  if (absolute < 24 * 60 * 60 * 1000) {
    return relative.format(Math.round(delta / 3_600_000), "hour");
  }
  return relative.format(Math.round(delta / 86_400_000), "day");
}

export function formatPercent(value: number) {
  return `${signedPercent.format(value)}%`;
}

export function formatNumber(value: number) {
  return decimal.format(value);
}

export function horizonLabel(range: RangeKey, horizon = RANGE_OPTIONS[range].horizon) {
  const unit = range === "3m" ? "day" : "week";
  return `${horizon} ${unit}${horizon === 1 ? "" : "s"}`;
}

export function directionText(direction: "up" | "down" | "flat") {
  if (direction === "up") return "rising";
  if (direction === "down") return "falling";
  return "flat";
}
