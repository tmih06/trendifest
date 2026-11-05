const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** Human "collected 4 minutes ago" copy; the graph footer is its only caller. */
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

/** Compact engagement counts: 1_284 → "1.3k" so the inspector stays narrow. */
export function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Match Vietnamese titles with or without typed accents; display stays unchanged. */
export function topicSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}
