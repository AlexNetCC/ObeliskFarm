/** Comma used as thousands separator in numeric displays. */
const THOUSANDS_SEP = ",";

/** Format a number with commas as thousands separators. Optional decimals for fractional part. */
export function formatWithThinSpaces(n: number, decimals?: number): string {
  if (!Number.isFinite(n)) return String(n);
  const d = decimals ?? 1;
  const fixed = d <= 0 ? String(Math.round(n)) : n.toFixed(d);
  const [intPart, decPart] = fixed.split(".");
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEP);
  return decPart != null ? `${withSeparators}.${decPart}` : withSeparators;
}

export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Math.trunc(n).toLocaleString("en-US");
}

/** For cost displays: full number with locale below 10k; 5+ digits as e.g. "10.7k", "1.2M". */
export function formatCostCompact(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.trunc(n).toLocaleString("en-US");
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return String(seconds);
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${Math.round(secs)}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m ${Math.round(secs)}s`;
}

