import type {
  SolPriceResult,
  TokenData,
  TokenDataResult,
  WalletTrade,
  WalletTradesResult,
} from "./market-data.types";

const DEX_BASE = "https://api.dexscreener.com/latest/dex";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const WSOL_MINTS = new Set([SOL_MINT]);
const RPC_URL = "https://api.mainnet-beta.solana.com";

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

async function fetchPairs(addresses: string): Promise<DexPair[] | { rateLimited: true } | null> {
  const res = await fetch(`${DEX_BASE}/tokens/${addresses}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) return null;
  const json = (await res.json()) as { pairs?: DexPair[] | null };
  return (json.pairs ?? []).filter((p) => p.chainId === "solana");
}

function toTokenData(best: DexPair, fallbackCa: string, pairCount: number): TokenData | null {
  const priceUsd = num(best.priceUsd);
  if (priceUsd === null) return null;
  const marketCap = num(best.marketCap);
  const fdv = num(best.fdv);
  return {
    name: best.baseToken?.name ?? "Unknown",
    symbol: best.baseToken?.symbol ?? "???",
    address: best.baseToken?.address ?? fallbackCa,
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
    pairUrl: best.url ?? `https://dexscreener.com/solana/${best.pairAddress ?? fallbackCa}`,
    txns24h: best.txns?.h24
      ? { buys: best.txns.h24.buys ?? 0, sells: best.txns.h24.sells ?? 0 }
      : null,
    pairCount,
  };
}

export async function fetchTokenData(ca: string): Promise<TokenDataResult> {
  let pairs: Awaited<ReturnType<typeof fetchPairs>>;
  try {
    pairs = await fetchPairs(ca);
  } catch {
    return { ok: false, error: "Market data service is unavailable. Try again shortly." };
  }
  if (pairs && "rateLimited" in pairs) {
    return { ok: false, error: "Rate limited by the market data provider. Try again in a moment." };
  }
  if (!pairs) return { ok: false, error: "Market data service is unavailable. Try again shortly." };
  if (pairs.length === 0) {
    return { ok: false, error: "Token data could not be found. Check the CA and try again." };
  }
  const sorted = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const token = toTokenData(sorted[0]!, ca, pairs.length);
  if (!token) return { ok: false, error: "Token price unavailable right now. Try again shortly." };
  return { ok: true, token };
}

async function fetchUsdInr(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    return num(json.rates?.["INR"]);
  } catch {
    return null;
  }
}

export async function fetchSolPrice(): Promise<SolPriceResult> {
  try {
    const [pairs, usdInr] = await Promise.all([fetchPairs(SOL_MINT), fetchUsdInr()]);
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
    return { ok: true, priceUsd: price, usdInr };
  } catch {
    return { ok: false, error: "SOL price unavailable. Try again shortly." };
  }
}

type RpcTx = {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: RpcTokenBalance[];
    postTokenBalances?: RpcTokenBalance[];
  } | null;
  transaction?: { message?: { accountKeys?: ({ pubkey?: string } | string)[] } };
};

type RpcTokenBalance = {
  mint?: string;
  owner?: string;
  uiTokenAmount?: { uiAmount?: number | null };
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result as T;
}

/** Derives recent swap-like trades for a public wallet address from on-chain data. */
export async function fetchWalletTrades(wallet: string): Promise<WalletTradesResult> {
  let signatures: { signature: string }[];
  try {
    signatures = await rpc<{ signature: string }[]>("getSignaturesForAddress", [
      wallet,
      { limit: 15 },
    ]);
  } catch {
    return { ok: false, error: "Could not reach the Solana network. Try again shortly." };
  }
  if (!signatures || signatures.length === 0) {
    return { ok: true, trades: [] };
  }

  const raw: {
    signature: string;
    side: "BUY" | "SELL";
    mint: string;
    tokenAmount: number;
    solAmount: number;
    blockTime: number | null;
  }[] = [];

  for (const sig of signatures.slice(0, 10)) {
    let tx: RpcTx | null = null;
    try {
      tx = await rpc<RpcTx | null>("getTransaction", [
        sig.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
    } catch {
      continue;
    }
    if (!tx?.meta || tx.meta.err) continue;

    const keys = (tx.transaction?.message?.accountKeys ?? []).map((k) =>
      typeof k === "string" ? k : (k.pubkey ?? ""),
    );
    const idx = keys.indexOf(wallet);
    const pre = tx.meta.preBalances ?? [];
    const post = tx.meta.postBalances ?? [];
    if (idx < 0 || pre[idx] === undefined || post[idx] === undefined) continue;
    const solDelta = (post[idx]! - pre[idx]!) / 1e9;

    const deltas = new Map<string, number>();
    const add = (list: RpcTokenBalance[] | undefined, sign: 1 | -1) => {
      for (const b of list ?? []) {
        if (b.owner !== wallet || !b.mint || WSOL_MINTS.has(b.mint)) continue;
        const amt = b.uiTokenAmount?.uiAmount ?? 0;
        deltas.set(b.mint, (deltas.get(b.mint) ?? 0) + sign * amt);
      }
    };
    add(tx.meta.postTokenBalances, 1);
    add(tx.meta.preTokenBalances, -1);

    let mint = "";
    let tokenDelta = 0;
    for (const [m, d] of deltas) {
      if (Math.abs(d) > Math.abs(tokenDelta)) {
        mint = m;
        tokenDelta = d;
      }
    }
    if (!mint || tokenDelta === 0 || Math.abs(solDelta) < 0.0005) continue;

    const side: "BUY" | "SELL" = tokenDelta > 0 ? "BUY" : "SELL";
    if ((side === "BUY" && solDelta > 0) || (side === "SELL" && solDelta < 0)) continue;

    raw.push({
      signature: sig.signature,
      side,
      mint,
      tokenAmount: Math.abs(tokenDelta),
      solAmount: Math.abs(solDelta),
      blockTime: tx.blockTime ?? null,
    });
  }

  if (raw.length === 0) return { ok: true, trades: [] };

  const mints = [...new Set(raw.map((t) => t.mint))].slice(0, 20);
  const meta = new Map<string, TokenData>();
  try {
    const pairs = await fetchPairs(mints.join(","));
    if (pairs && !("rateLimited" in pairs)) {
      for (const m of mints) {
        const forMint = pairs
          .filter((p) => p.baseToken?.address === m)
          .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
        const first = forMint[0];
        if (!first) continue;
        const td = toTokenData(first, m, forMint.length);
        if (td) meta.set(m, td);
      }
    }
  } catch {
    /* price enrichment is best-effort */
  }

  const solRes = await fetchSolPrice();
  const solPriceUsd = solRes.ok ? solRes.priceUsd : null;

  const trades: WalletTrade[] = raw.map((t) => {
    const td = meta.get(t.mint) ?? null;
    const entryPriceUsd =
      solPriceUsd && t.tokenAmount > 0 ? (t.solAmount * solPriceUsd) / t.tokenAmount : null;
    const currentPriceUsd = td?.priceUsd ?? null;
    const pnlUsd =
      t.side === "BUY" && entryPriceUsd !== null && currentPriceUsd !== null
        ? (currentPriceUsd - entryPriceUsd) * t.tokenAmount
        : null;
    return {
      signature: t.signature,
      side: t.side,
      mint: t.mint,
      symbol: td?.symbol ?? "???",
      name: td?.name ?? "Unknown token",
      tokenAmount: t.tokenAmount,
      solAmount: t.solAmount,
      entryPriceUsd,
      currentPriceUsd,
      marketCap: td ? (td.marketCap ?? td.fdv ?? null) : null,
      pnlUsd,
      blockTime: t.blockTime,
    };
  });

  return { ok: true, trades };
}
