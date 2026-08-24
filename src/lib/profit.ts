export const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const isValidSolanaAddress = (v: string) => SOLANA_ADDRESS_RE.test(v.trim());

/** Parses "53K", "1.2m", "$750k", "125000" into a number. Returns null when unparseable. */
export function parseCompactNumber(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/[$,\s_]/g, "");
  if (!cleaned) return null;
  const match = /^(\d*\.?\d+)([kmb])?$/.exec(cleaned);
  if (!match) return null;
  const base = Number.parseFloat(match[1]!);
  if (!Number.isFinite(base)) return null;
  const mult = match[2] === "k" ? 1e3 : match[2] === "m" ? 1e6 : match[2] === "b" ? 1e9 : 1;
  const value = base * mult;
  return value > 0 ? value : null;
}

export function formatUsd(value: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatCompactUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1) return `$${value.toFixed(4)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toExponential(4).replace("e-", "e-")}`;
}

export function formatSol(value: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(4)} SOL`;
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

/** Formats a USD amount as INR using a live USD->INR rate. Returns "—" without a rate. */
export function formatInr(
  usdValue: number,
  usdInr: number | null,
  opts?: { sign?: boolean },
): string {
  if (!usdInr || !Number.isFinite(usdValue)) return "—";
  const value = usdValue * usdInr;
  const sign = opts?.sign && value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: abs < 100 ? 2 : 0 })}`;
}


export function shortenAddress(ca: string, size = 4): string {
  if (ca.length <= size * 2 + 3) return ca;
  return `${ca.slice(0, size)}...${ca.slice(-size)}`;
}

export function timeAgo(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs} second${secs === 1 ? "" : "s"} ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatAge(createdAt: number | null): string {
  if (!createdAt) return "—";
  const mins = Math.round((Date.now() - createdAt) / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export type ProfitInput = {
  solInvested: number;
  buyMarketCap: number;
  currentMarketCap: number;
  solPriceUsd: number;
};

export type ProfitResult = {
  initialUsd: number;
  multiplier: number;
  currentUsd: number;
  currentSol: number;
  profitUsd: number;
  profitSol: number;
  roiPercent: number;
};

export function calculateProfit({
  solInvested,
  buyMarketCap,
  currentMarketCap,
  solPriceUsd,
}: ProfitInput): ProfitResult {
  const initialUsd = solInvested * solPriceUsd;
  const multiplier = buyMarketCap > 0 ? currentMarketCap / buyMarketCap : 0;
  const currentUsd = initialUsd * multiplier;
  const profitUsd = currentUsd - initialUsd;
  const currentSol = solPriceUsd > 0 ? currentUsd / solPriceUsd : 0;
  return {
    initialUsd,
    multiplier,
    currentUsd,
    currentSol,
    profitUsd,
    profitSol: currentSol - solInvested,
    roiPercent: initialUsd > 0 ? (profitUsd / initialUsd) * 100 : 0,
  };
}

export type TargetRow = ProfitResult & { targetMarketCap: number };

export function calculateTargetValue(
  targetMarketCap: number,
  base: Omit<ProfitInput, "currentMarketCap">,
): TargetRow {
  return {
    targetMarketCap,
    ...calculateProfit({ ...base, currentMarketCap: targetMarketCap }),
  };
}

export const DEFAULT_TARGETS = [100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000];
