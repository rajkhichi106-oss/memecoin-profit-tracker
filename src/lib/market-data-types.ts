export type TokenData = {
  name: string;
  symbol: string;
  address: string;
  priceUsd: number;
  priceNative: number;
  marketCap: number | null;
  fdv: number | null;
  marketCapMetric: "marketCap" | "fdv" | "none";
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  pairAddress: string;
  dexId: string;
  pairCreatedAt: number | null;
  pairUrl: string;
  txns24h: { buys: number; sells: number } | null;
  pairCount: number;
};

export type TokenDataResult = { ok: true; token: TokenData } | { ok: false; error: string };

export type SolPriceResult = { ok: true; priceUsd: number } | { ok: false; error: string };

export type FxRateResult = { ok: true; usdInr: number } | { ok: false; error: string };

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
