import { createServerFn } from "@tanstack/react-start";

const DEX_BASE = "https://api.dexscreener.com/latest/dex";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

export type TokenDataResult =
  | { ok: true; token: TokenData }
  | { ok: false; error: string };

export type SolPriceResult = { ok: true; priceUsd: number } | { ok: false; error: string };

type DexPair = {
  chainId: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  pairCreatedAt?: number;
  txns?: { h24?: { buys?: number; sells?: number } };
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

async function fetchPairs(address: string): Promise<DexPair[] | { rateLimited: true } | null> {
  const res = await fetch(`${DEX_BASE}/tokens/${address}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) return null;
  const json = (await res.json()) as { pairs?: DexPair[] | null };
  return (json.pairs ?? []).filter((p) => p.chainId === "solana");
}

export const getTokenData = createServerFn({ method: "GET" })
  .inputValidator((input: { ca: string }) => {
    const ca = (input?.ca ?? "").trim();
    if (!SOL_ADDRESS_RE.test(ca)) throw new Error("INVALID_CA");
    return { ca };
  })
  .handler(async ({ data }): Promise<TokenDataResult> => {
    let pairs: Awaited<ReturnType<typeof fetchPairs>>;
    try {
      pairs = await fetchPairs(data.ca);
    } catch {
      return { ok: false, error: "Market data service is unavailable. Try again shortly." };
    }
    if (pairs && "rateLimited" in pairs) {
      return { ok: false, error: "Rate limited by the market data provider. Try again in a moment." };
    }
    if (!pairs) {
      return { ok: false, error: "Market data service is unavailable. Try again shortly." };
    }
    if (pairs.length === 0) {
      return { ok: false, error: "Token data could not be found. Check the CA and try again." };
    }

    const sorted = [...pairs].sort(
      (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
    );
    const best = sorted[0]!;
    const priceUsd = num(best.priceUsd);
    if (priceUsd === null) {
      return { ok: false, error: "Token price unavailable right now. Try again shortly." };
    }

    const marketCap = num(best.marketCap);
    const fdv = num(best.fdv);

    return {
      ok: true,
      token: {
        name: best.baseToken?.name ?? "Unknown",
        symbol: best.baseToken?.symbol ?? "???",
        address: best.baseToken?.address ?? data.ca,
        priceUsd,
        priceNative: num(best.priceNative) ?? 0,
        marketCap,
        fdv,
        marketCapMetric: marketCap !== null ? "marketCap" : fdv !== null ? "fdv" : "none",
        liquidityUsd: num(best.liquidity?.usd),
        volume24h: num(best.volume?.h24),
        priceChange24h: num(best.priceChange?.h24),
        pairAddress: best.pairAddress ?? "",
        dexId: best.dexId ?? "unknown",
        pairCreatedAt: num(best.pairCreatedAt),
        pairUrl: best.url ?? `https://dexscreener.com/solana/${best.pairAddress ?? data.ca}`,
        txns24h: best.txns?.h24
          ? { buys: best.txns.h24.buys ?? 0, sells: best.txns.h24.sells ?? 0 }
          : null,
        pairCount: pairs.length,
      },
    };
  });

export const getSolPrice = createServerFn({ method: "GET" }).handler(
  async (): Promise<SolPriceResult> => {
    try {
      const pairs = await fetchPairs(SOL_MINT);
      if (!pairs || "rateLimited" in pairs || pairs.length === 0) {
        return { ok: false, error: "SOL price unavailable. Try again shortly." };
      }
      const withPrice = pairs
        .filter((p) => p.baseToken?.address === SOL_MINT && num(p.priceUsd) !== null)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      const price = num(withPrice[0]?.priceUsd);
      if (price === null || price <= 0) {
        return { ok: false, error: "SOL price unavailable. Try again shortly." };
      }
      return { ok: true, priceUsd: price };
    } catch {
      return { ok: false, error: "SOL price unavailable. Try again shortly." };
    }
  },
);
