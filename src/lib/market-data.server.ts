import type {
  FxRateResult,
  SolPriceResult,
  TokenDataResult,
  WalletTrade,
  WalletTradesResult,
} from "./market-data-types";

const DEX_BASE = "https://api.dexscreener.com/latest/dex";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const RPC_URL = "https://api.mainnet-beta.solana.com";
const LAMPORTS = 1_000_000_000;

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

async function fetchPairs(
  address: string,
): Promise<DexPair[] | { rateLimited: true } | null> {
  const res = await fetch(`${DEX_BASE}/tokens/${address}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) return null;
  const json = (await res.json()) as { pairs?: DexPair[] | null };
  return (json.pairs ?? []).filter((p) => p.chainId === "solana");
}

function bestPair(pairs: DexPair[]): DexPair | undefined {
  return [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

export async function loadTokenData(ca: string): Promise<TokenDataResult> {
  let pairs: Awaited<ReturnType<typeof fetchPairs>>;
  try {
    pairs = await fetchPairs(ca);
  } catch {
    return { ok: false, error: "Market data service is unavailable. Try again shortly." };
  }
  if (pairs && "rateLimited" in pairs) {
    return {
      ok: false,
      error: "Rate limited by the market data provider. Try again in a moment.",
    };
  }
  if (!pairs) {
    return { ok: false, error: "Market data service is unavailable. Try again shortly." };
  }
  if (pairs.length === 0) {
    return { ok: false, error: "Token data could not be found. Check the CA and try again." };
  }

  const best = bestPair(pairs)!;
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
      address: best.baseToken?.address ?? ca,
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
      pairUrl: best.url ?? `https://dexscreener.com/solana/${best.pairAddress ?? ca}`,
      txns24h: best.txns?.h24
        ? { buys: best.txns.h24.buys ?? 0, sells: best.txns.h24.sells ?? 0 }
        : null,
      pairCount: pairs.length,
    },
  };
}

export async function loadSolPrice(): Promise<SolPriceResult> {
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
}

export async function loadFxRate(): Promise<FxRateResult> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { ok: false, error: "USD/INR rate unavailable. Try again shortly." };
    const json = (await res.json()) as { rates?: Record<string, number> };
    const inr = num(json.rates?.["INR"]);
    if (inr === null || inr <= 0) {
      return { ok: false, error: "USD/INR rate unavailable. Try again shortly." };
    }
    return { ok: true, usdInr: inr };
  } catch {
    return { ok: false, error: "USD/INR rate unavailable. Try again shortly." };
  }
}

/* ---------- Wallet trade tracking (public address only) ---------- */

type RpcTx = {
  blockTime?: number | null;
  transaction?: { message?: { accountKeys?: (string | { pubkey?: string })[] } };
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
};

type TokenBalance = {
  mint?: string;
  owner?: string;
  uiTokenAmount?: { uiAmount?: number | null };
};

class RpcRateLimit extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Public RPC endpoints are aggressively rate-limited; rotate + retry. */
const RPC_URLS = [RPC_URL, "https://solana-rpc.publicnode.com", "https://rpc.ankr.com/solana"];

async function rpc<T>(method: string, params: unknown[], attempts = 3): Promise<T> {
  let lastRateLimited = false;
  for (let i = 0; i < attempts; i++) {
    const url = RPC_URLS[i % RPC_URLS.length]!;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.status === 429 || res.status === 403) {
        lastRateLimited = true;
        await sleep(350 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`RPC ${res.status}`);
      const json = (await res.json()) as { result?: T; error?: { code?: number; message?: string } };
      if (json.error) {
        if (json.error.code === 429) {
          lastRateLimited = true;
          await sleep(350 * (i + 1));
          continue;
        }
        throw new Error(json.error.message ?? "RPC error");
      }
      return json.result as T;
    } catch (err) {
      if (i === attempts - 1) {
        if (lastRateLimited) throw new RpcRateLimit();
        throw err;
      }
      await sleep(250 * (i + 1));
    }
  }
  throw lastRateLimited ? new RpcRateLimit() : new Error("RPC failed");
}

const tradesCache = new Map<string, { at: number; value: WalletTradesResult }>();
const TRADES_TTL = 20_000;

export async function loadWalletTrades(
  wallet: string,
  limit: number,
): Promise<WalletTradesResult> {
  const cacheKey = `${wallet}:${limit}`;
  const cached = tradesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TRADES_TTL) return cached.value;

  const solPrice = await loadSolPrice();
  if (!solPrice.ok) return { ok: false, error: solPrice.error };

  let signatures: { signature: string }[];
  try {
    signatures = await rpc<{ signature: string }[]>("getSignaturesForAddress", [
      wallet,
      { limit },
    ]);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof RpcRateLimit
          ? "Solana's public network is rate-limiting requests right now. Try again in a few seconds."
          : "Could not reach the Solana network. Try again shortly.",
    };
  }
  if (!signatures || signatures.length === 0) {
    return { ok: true, trades: [], solPriceUsd: solPrice.priceUsd };
  }


  const raw: {
    signature: string;
    side: "BUY" | "SELL";
    mint: string;
    tokenAmount: number;
    solAmount: number;
    blockTime: number | null;
  }[] = [];

  let txFailures = 0;
  for (const sig of signatures) {
    let tx: RpcTx | null = null;
    try {
      tx = await rpc<RpcTx | null>("getTransaction", [
        sig.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
    } catch {
      txFailures += 1;
      // Stop early once the public RPC starts refusing — keep whatever we have.
      if (txFailures >= 3) break;
      continue;
    }

    if (!tx?.meta || tx.meta.err) continue;

    const keys = (tx.transaction?.message?.accountKeys ?? []).map((k) =>
      typeof k === "string" ? k : (k.pubkey ?? ""),
    );
    const idx = keys.indexOf(wallet);
    if (idx < 0) continue;

    const pre = tx.meta.preBalances?.[idx];
    const post = tx.meta.postBalances?.[idx];
    if (pre === undefined || post === undefined) continue;
    const solDelta = (post - pre + (tx.meta.fee ?? 0)) / LAMPORTS;

    const mints = new Map<string, number>();
    const add = (list: TokenBalance[] | undefined, sign: number) => {
      for (const b of list ?? []) {
        if (b.owner !== wallet || !b.mint) continue;
        const amt = b.uiTokenAmount?.uiAmount ?? 0;
        mints.set(b.mint, (mints.get(b.mint) ?? 0) + sign * amt);
      }
    };
    add(tx.meta.preTokenBalances, -1);
    add(tx.meta.postTokenBalances, 1);

    let mint = "";
    let tokenDelta = 0;
    for (const [m, d] of mints) {
      if (m === SOL_MINT) continue;
      if (Math.abs(d) > Math.abs(tokenDelta)) {
        mint = m;
        tokenDelta = d;
      }
    }
    if (!mint || tokenDelta === 0 || Math.abs(solDelta) < 0.0005) continue;

    raw.push({
      signature: sig.signature,
      side: tokenDelta > 0 ? "BUY" : "SELL",
      mint,
      tokenAmount: Math.abs(tokenDelta),
      solAmount: Math.abs(solDelta),
      blockTime: tx.blockTime ?? null,
    });
  }

  if (raw.length === 0 && txFailures > 0) {
    return {
      ok: false,
      error:
        "Solana's public network is rate-limiting requests right now. Try again in a few seconds.",
    };
  }

  const uniqueMints = [...new Set(raw.map((r) => r.mint))].slice(0, 20);

  const meta = new Map<string, DexPair>();
  if (uniqueMints.length > 0) {
    try {
      const pairs = await fetchPairs(uniqueMints.join(","));
      if (pairs && !("rateLimited" in pairs)) {
        for (const m of uniqueMints) {
          const forMint = pairs.filter((p) => p.baseToken?.address === m);
          const best = bestPair(forMint);
          if (best) meta.set(m, best);
        }
      }
    } catch {
      /* enrichment is best-effort */
    }
  }

  const trades: WalletTrade[] = raw.map((r) => {
    const pair = meta.get(r.mint);
    const currentPriceUsd = pair ? num(pair.priceUsd) : null;
    const entryPriceUsd =
      r.tokenAmount > 0 ? (r.solAmount * solPrice.priceUsd) / r.tokenAmount : null;
    const pnlUsd =
      r.side === "BUY" && currentPriceUsd !== null && entryPriceUsd !== null
        ? (currentPriceUsd - entryPriceUsd) * r.tokenAmount
        : null;
    const pnlPercent =
      pnlUsd !== null && entryPriceUsd
        ? (pnlUsd / (entryPriceUsd * r.tokenAmount)) * 100
        : null;
    return {
      signature: r.signature,
      side: r.side,
      mint: r.mint,
      symbol: pair?.baseToken?.symbol ?? "???",
      name: pair?.baseToken?.name ?? "Unknown token",
      tokenAmount: r.tokenAmount,
      solAmount: r.solAmount,
      entryPriceUsd,
      currentPriceUsd,
      marketCap: pair ? (num(pair.marketCap) ?? num(pair.fdv)) : null,
      pnlUsd,
      pnlPercent,
      blockTime: r.blockTime,
      txUrl: `https://solscan.io/tx/${r.signature}`,
    };
  });

  const result: WalletTradesResult = { ok: true, trades, solPriceUsd: solPrice.priceUsd };
  tradesCache.set(cacheKey, { at: Date.now(), value: result });
  return result;
}
