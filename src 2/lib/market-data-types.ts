export type TimeframeStats = {
  m5: number | null;
  h1: number | null;
  h6: number | null;
  h24: number | null;
};

export type TxnStats = {
  m5: { buys: number; sells: number } | null;
  h1: { buys: number; sells: number } | null;
  h6: { buys: number; sells: number } | null;
  h24: { buys: number; sells: number } | null;
};

export type PairOption = {
  pairAddress: string;
  dexId: string;
  label: string;
  liquidityUsd: number | null;
};

export type TokenData = {
  name: string;
  symbol: string;
  address: string;
  imageUrl: string | null;
  websites: string[];
  socials: { type: string; url: string }[];
  priceUsd: number;
  priceNative: number;
  marketCap: number | null;
  fdv: number | null;
  marketCapMetric: "marketCap" | "fdv" | "none";
  liquidityUsd: number | null;
  /** Kept for backwards compatibility with existing components. */
  volume24h: number | null;
  priceChange24h: number | null;
  volume: TimeframeStats;
  priceChange: TimeframeStats;
  txns: TxnStats;
  /** @deprecated use txns.h24 */
  txns24h: { buys: number; sells: number } | null;
  pairAddress: string;
  pairLabel: string;
  dexId: string;
  pairCreatedAt: number | null;
  pairUrl: string;
  pairCount: number;
  pairs: PairOption[];
  fetchedAt: number;
};

export type TokenDataResult = { ok: true; token: TokenData } | { ok: false; error: string };

export type SolPriceResult = { ok: true; priceUsd: number } | { ok: false; error: string };

export type FxRateResult = {
  ok: true;
  usdInr: number;
  rates: Record<string, number>;
} | { ok: false; error: string };

export type WalletTrade = {
  signature: string;
  side: "BUY" | "SELL";
  mint: string;
  symbol: string;
  name: string;
  tokenAmount: number;
  solAmount: number;
  entryPriceUsd: number | null;
  currentPriceUsd: number | null;
  marketCap: number | null;
  pnlUsd: number | null;
  pnlPercent: number | null;
  blockTime: number | null;
  txUrl: string;
};

export type WalletTradesResult =
  | { ok: true; trades: WalletTrade[]; solPriceUsd: number }
  | { ok: false; error: string };
