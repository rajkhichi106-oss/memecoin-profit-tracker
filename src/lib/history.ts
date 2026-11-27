export type HistoryEntry = {
  id: string;
  ca: string;
  symbol: string;
  buyMarketCap: number;
  currentMarketCap: number;
  solInvested: number;
  currentUsd: number;
  profitUsd: number;
  checkedAt: number;
};

const KEY = "smpc:recent-checks:v1";
const LIMIT = 12;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  const existing = loadHistory().filter(
    (e) => !(e.ca === entry.ca && Math.abs(e.buyMarketCap - entry.buyMarketCap) < 1),
  );
  const next = [entry, ...existing].slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — history is best-effort */
  }
  return next;
}

export function clearHistory(): HistoryEntry[] {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
  return [];
}
