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

export type SolPriceResult =
  | { ok: true; priceUsd: number; usdInr: number | null }
  | { ok: false; error: string };

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
  blockTime: number | null;
};

export type WalletTradesResult =
  | { ok: true; trades: WalletTrade[] }
  | { ok: false; error: string };
