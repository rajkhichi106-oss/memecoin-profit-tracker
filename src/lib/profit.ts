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

/** Fixed SOL fees for a round trip. Fees never scale with market cap growth. */
export type TradeFees = {
  buyPriority: number;
  buyBribe: number;
  sellPriority: number;
  sellBribe: number;
};

export const ZERO_FEES: TradeFees = { buyPriority: 0, buyBribe: 0, sellPriority: 0, sellBribe: 0 };

/** Total fixed fees = buy priority + buy bribe + sell priority + sell bribe. */
export function sumFees(fees: TradeFees): number {
  return fees.buyPriority + fees.buyBribe + fees.sellPriority + fees.sellBribe;
}

export type ProfitInput = {
  solInvested: number;
  buyMarketCap: number;
  currentMarketCap: number;
  solPriceUsd: number;
  fees?: TradeFees;
};

export type ProfitResult = {
  initialUsd: number;
  multiplier: number;
  currentUsd: number;
  currentSol: number;
  profitUsd: number;
  profitSol: number;
  roiPercent: number;
  totalFeesSol: number;
};

export type PositionEntry = {
  id: string;
  tokenAddress: string;
  entryMarketCap: number;
  solInvested: number;
  fees: TradeFees;
  createdAt: number;
};

export type CalculatedPosition = {
  entry: PositionEntry;
  result: ProfitResult;
};

export type PositionSummary = ProfitResult & {
  totalInvestedSol: number;
  totalBuyFeesSol: number;
};

/**
 * Single source of truth for Live Position and Expected Market Cap math:
 *   position value = invested SOL × (current MC / entry MC)
 *   net profit     = position value − invested SOL − total fixed fees
 *   ROI %          = net profit / (invested SOL + buy fees) × 100
 */
export function calculateProfit({
  solInvested,
  buyMarketCap,
  currentMarketCap,
  solPriceUsd,
  fees = ZERO_FEES,
}: ProfitInput): ProfitResult {
  const totalFeesSol = sumFees(fees);
  const buyFees = fees.buyPriority + fees.buyBribe;
  const costBasisSol = solInvested + buyFees;
  const initialUsd = costBasisSol * solPriceUsd;
  const multiplier = buyMarketCap > 0 ? currentMarketCap / buyMarketCap : 0;
  const currentUsd = solInvested * solPriceUsd * multiplier;
  const currentSol = solPriceUsd > 0 ? currentUsd / solPriceUsd : 0;
  const profitSol = currentSol - solInvested - totalFeesSol;
  const profitUsd = profitSol * solPriceUsd;
  return {
    initialUsd,
    multiplier,
    currentUsd,
    currentSol,
    profitUsd,
    profitSol,
    roiPercent: costBasisSol > 0 ? (profitSol / costBasisSol) * 100 : 0,
    totalFeesSol,
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

/** Calculates one saved entry at a live or expected market cap. */
export function calculatePosition(
  entry: PositionEntry,
  marketCap: number,
  solPriceUsd: number,
): CalculatedPosition {
  return {
    entry,
    result: calculateProfit({
      solInvested: entry.solInvested,
      buyMarketCap: entry.entryMarketCap,
      currentMarketCap: marketCap,
      solPriceUsd,
      fees: entry.fees,
    }),
  };
}

/** Sums independently calculated entries without changing their fixed fee costs. */
export function summarizePositions(
  positions: CalculatedPosition[],
  solPriceUsd: number,
): PositionSummary {
  const totalInvestedSol = positions.reduce((sum, position) => sum + position.entry.solInvested, 0);
  const totalBuyFeesSol = positions.reduce(
    (sum, position) => sum + position.entry.fees.buyPriority + position.entry.fees.buyBribe,
    0,
  );
  const totalFeesSol = positions.reduce((sum, position) => sum + position.result.totalFeesSol, 0);
  const currentSol = positions.reduce((sum, position) => sum + position.result.currentSol, 0);
  const currentUsd = positions.reduce((sum, position) => sum + position.result.currentUsd, 0);
  const profitSol = positions.reduce((sum, position) => sum + position.result.profitSol, 0);
  const profitUsd = positions.reduce((sum, position) => sum + position.result.profitUsd, 0);
  const costBasisSol = totalInvestedSol + totalBuyFeesSol;
  return {
    initialUsd: costBasisSol * solPriceUsd,
    multiplier: totalInvestedSol > 0 ? currentSol / totalInvestedSol : 0,
    currentUsd,
    currentSol,
    profitUsd,
    profitSol,
    roiPercent: costBasisSol > 0 ? (profitSol / costBasisSol) * 100 : 0,
    totalFeesSol,
    totalInvestedSol,
    totalBuyFeesSol,
  };
}

export type TargetGroup = {
  targetMarketCap: number;
  positions: CalculatedPosition[];
  summary: PositionSummary;
};

export const DEFAULT_TARGETS = [100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000];

export function formatInr(value: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : 2;
  return `${sign}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export const CURRENCY_CODES = [
  "INR", "USD", "EUR", "GBP", "JPY", "CNY", "AED", "CAD", "AUD", "SGD", "CHF", "HKD",
  "NZD", "ZAR", "BRL", "MXN", "KRW", "TRY", "RUB", "THB", "IDR", "MYR", "PHP", "PLN",
  "SEK", "NOK", "DKK", "SAR", "QAR", "KWD",
] as const;

export function formatCurrency(
  valueUsd: number,
  currency: string,
  rates: Record<string, number>,
  opts?: { sign?: boolean },
): string {
  const rate = currency === "USD" ? 1 : rates[currency];
  if (!rate) return formatUsd(valueUsd, opts);
  const value = valueUsd * rate;
  if (currency === "INR") return formatInr(value, opts);
  const sign = opts?.sign && value > 0 ? "+" : "";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return `${sign}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value < 0 ? -abs : abs)}`;
}
