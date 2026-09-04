import type { PositionEntry } from "@/lib/profit";

const KEY = "smpc:position-entries:v1";

export function loadPositionEntries(): PositionEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PositionEntry[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) =>
            typeof entry?.id === "string" &&
            typeof entry?.tokenAddress === "string" &&
            Number.isFinite(entry.entryMarketCap) &&
            Number.isFinite(entry.solInvested) &&
            entry.fees !== null &&
            typeof entry.fees === "object",
        )
      : [];
  } catch {
    return [];
  }
}

export function savePositionEntries(entries: PositionEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — positions remain available for this session */
  }
}