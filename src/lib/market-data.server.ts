import type {
  FxRateResult,
  SolPriceResult,
  TokenDataResult,
  WalletTrade,
  WalletTradesResult,
} from "./market-data-types";

const DEX_ROOT = "https://api.dexscreener.com";
const CHAIN = "solana";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const RPC_URL = "https://api.mainnet-beta.solana.com";
const LAMPORTS = 1_000_000_000;

type DexPair = {
  chainId: string;
  dexId?: string;
  url?: string;
  labels?: string[];
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: Record<string, { buys?: number; sells?: number } | undefined>;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { url?: string }[];
    socials?: { type?: string; platform?: string; url?: string }[];
  };
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

class DexRateLimited extends Error {}
class DexUnavailable extends Error {}
class DexHttpFailure extends Error {
  constructor(readonly status: number, reason: string) {
    super(reason);
  }
}

/** Cache only successful responses and share requests for the same endpoint. */
const respCache = new Map<string, { at: number; data: unknown }>();
const inFlightDexRequests = new Map<string, Promise<unknown>>();
let nextDexRequestAt = 0;
let rateLimitUntil = 0;
let consecutiveRateLimits = 0;
let dexRequestQueue: Promise<void> = Promise.resolve();

async function dexGet<T>(path: string, ttlMs: number): Promise<T> {
  const hit = respCache.get(path);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.data as T;
  const pending = inFlightDexRequests.get(path);
  if (pending) return pending as Promise<T>;

  const request = requestDex<T>(path, ttlMs);
  inFlightDexRequests.set(path, request);
  try {
    return await request;
  } finally {
    if (inFlightDexRequests.get(path) === request) inFlightDexRequests.delete(path);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function endpointTokenAddress(path: string): string {
  const match = path.match(/\/(?:tokens|token-pairs)\/v1\/solana\/([^/?]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const query = path.split("?")[1];
  return query ? new URLSearchParams(query).get("q") ?? "n/a" : "n/a";
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function waitForDexSlot(): Promise<void> {
  const slot = dexRequestQueue.then(async () => {
    const readyAt = Math.max(nextDexRequestAt, rateLimitUntil);
    if (readyAt > Date.now()) await sleep(readyAt - Date.now());
    nextDexRequestAt = Date.now() + 1_100;
  });
  dexRequestQueue = slot.catch(() => undefined);
  await slot;
}

async function requestDex<T>(path: string, ttlMs: number): Promise<T> {
  const endpoint = `${DEX_ROOT}${path}`;
  const tokenAddress = endpointTokenAddress(path);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForDexSlot();
    let res: Response;
    try {
      res = await fetch(endpoint, { headers: { accept: "application/json" } });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("[DEX Screener] request failed", {
          endpoint,
          tokenAddress,
          status: "NETWORK_ERROR",
          responseBody: error instanceof Error ? error.message : String(error),
        });
      }
      throw new DexUnavailable("Network request failed.");
    }

    const responseBody = await res.text();
    if (import.meta.env.DEV) {
      console.info("[DEX Screener] response", {
        endpoint,
        tokenAddress,
        status: res.status,
        responseBody,
      });
    }

    if (res.status === 429) {
      consecutiveRateLimits += 1;
      const exponentialDelay = Math.min(1_000 * 2 ** (attempt + consecutiveRateLimits - 1), 30_000);
      const delay = Math.max(retryAfterMs(res.headers.get("Retry-After")) ?? 0, exponentialDelay);
      rateLimitUntil = Math.max(rateLimitUntil, Date.now() + delay);
      if (attempt < 2) continue;
      throw new DexRateLimited("HTTP 429 — rate limit exceeded.");
    }
    consecutiveRateLimits = 0;

    if (!res.ok) {
      throw new DexHttpFailure(res.status, responseBody || res.statusText || "Unknown API error.");
    }

    let data: T;
    try {
      data = JSON.parse(responseBody) as T;
    } catch {
      throw new DexHttpFailure(res.status, "DEX Screener returned an invalid JSON response.");
    }
    const now = Date.now();
    respCache.set(path, { at: now, data });
    if (respCache.size > 120) {
      for (const [key, value] of respCache) {
        if (now - value.at > 120_000) respCache.delete(key);
      }
    }
    return data;
  }
  throw new DexRateLimited("HTTP 429 — rate limit exceeded.");
}

const solanaOnly = (pairs: (DexPair | null | undefined)[] | null | undefined): DexPair[] =>
  (pairs ?? []).filter((p): p is DexPair => !!p && p.chainId === CHAIN);

/** GET /tokens/v1/{chain}/{address} — primary source for live token info. */
async function fetchTokenPairs(address: string, ttlMs = 8_000): Promise<DexPair[]> {
  const json = await dexGet<DexPair[] | { pairs?: DexPair[] }>(
    `/tokens/v1/${CHAIN}/${address}`,
    ttlMs,
  );
  const arr = Array.isArray(json) ? json : (json.pairs ?? []);
  return solanaOnly(arr);
}

/** GET /token-pairs/v1/{chain}/{address} — all pools for a token. */
async function fetchAllTokenPairs(address: string, ttlMs = 30_000): Promise<DexPair[]> {
  const json = await dexGet<DexPair[]>(`/token-pairs/v1/${CHAIN}/${address}`, ttlMs);
  return solanaOnly(Array.isArray(json) ? json : []);
}

/** GET /latest/dex/pairs/{chain}/{pairId} — refresh the pinned pair only. */
async function fetchPair(pairAddress: string, ttlMs = 8_000): Promise<DexPair | null> {
  const json = await dexGet<{ pair?: DexPair | null; pairs?: DexPair[] | null }>(
    `/latest/dex/pairs/${CHAIN}/${pairAddress}`,
    ttlMs,
  );
  const pair = json.pair ?? json.pairs?.[0] ?? null;
  return pair && pair.chainId === CHAIN ? pair : null;
}

function byLiquidity(pairs: DexPair[]): DexPair[] {
  return [...pairs].sort((a, b) => {
    const liq = (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0);
    if (liq !== 0) return liq;
    return (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0);
  });
}

function bestPair(pairs: DexPair[]): DexPair | undefined {
  return byLiquidity(pairs)[0];
}

const pairLabel = (p: DexPair) =>
  `${p.baseToken?.symbol ?? "?"}/${p.quoteToken?.symbol ?? "?"}${
    p.labels?.length ? ` ${p.labels.join(" ")}` : ""
  }`;

const tf = (o: { m5?: number; h1?: number; h6?: number; h24?: number } | undefined) => ({
  m5: num(o?.m5),
  h1: num(o?.h1),
  h6: num(o?.h6),
  h24: num(o?.h24),
});

const txn = (o: { buys?: number; sells?: number } | undefined) =>
  o ? { buys: o.buys ?? 0, sells: o.sells ?? 0 } : null;

function toTokenData(best: DexPair, all: DexPair[], fallbackAddress: string) {
  const priceUsd = num(best.priceUsd);
  if (priceUsd === null) return null;
  const marketCap = num(best.marketCap);
  const fdv = num(best.fdv);
  return {
    name: best.baseToken?.name ?? "Unknown",
    symbol: best.baseToken?.symbol ?? "???",
    address: best.baseToken?.address ?? fallbackAddress,
    imageUrl: best.info?.imageUrl ?? null,
    websites: (best.info?.websites ?? []).map((w) => w.url).filter((u): u is string => !!u),
    socials: (best.info?.socials ?? [])
      .map((s) => ({ type: s.type ?? s.platform ?? "link", url: s.url ?? "" }))
      .filter((s) => !!s.url),
    priceUsd,
    priceNative: num(best.priceNative) ?? 0,
    marketCap,
    fdv,
    marketCapMetric: (marketCap !== null ? "marketCap" : fdv !== null ? "fdv" : "none") as
      | "marketCap"
      | "fdv"
      | "none",
    liquidityUsd: num(best.liquidity?.usd),
    volume24h: num(best.volume?.h24),
    priceChange24h: num(best.priceChange?.h24),
    volume: tf(best.volume),
    priceChange: tf(best.priceChange),
    txns: {
      m5: txn(best.txns?.["m5"]),
      h1: txn(best.txns?.["h1"]),
      h6: txn(best.txns?.["h6"]),
      h24: txn(best.txns?.["h24"]),
    },
    txns24h: txn(best.txns?.["h24"]),
    pairAddress: best.pairAddress ?? "",
    pairLabel: pairLabel(best),
    dexId: best.dexId ?? "unknown",
    pairCreatedAt: num(best.pairCreatedAt),
    pairUrl: best.url ?? `https://dexscreener.com/solana/${best.pairAddress ?? fallbackAddress}`,
    pairCount: all.length || 1,
    pairs: byLiquidity(all)
      .slice(0, 8)
      .map((p) => ({
        pairAddress: p.pairAddress ?? "",
        dexId: p.dexId ?? "unknown",
        label: pairLabel(p),
        liquidityUsd: num(p.liquidity?.usd),
      }))
      .filter((p) => !!p.pairAddress),
    fetchedAt: Date.now(),
  };
}

const UNAVAILABLE = "Market data temporarily unavailable";
const NOT_INDEXED = "Token not found or not indexed by DEX Screener yet.";
const NO_TRADING_PAIR = "Token is indexed, but no trading pair is available yet.";
const RATE_LIMITED = "DEX Screener rate limit reached (HTTP 429). Please retry shortly.";

function pairContainsToken(pair: DexPair, address: string): boolean {
  const target = address.toLowerCase();
  return pair.baseToken?.address?.toLowerCase() === target || pair.quoteToken?.address?.toLowerCase() === target;
}

function pairForToken(pair: DexPair, address: string): DexPair | null {
  const target = address.toLowerCase();
  if (pair.baseToken?.address?.toLowerCase() === target) return pair;
  if (pair.quoteToken?.address?.toLowerCase() !== target) return null;

  const basePriceUsd = num(pair.priceUsd);
  const basePriceInQuote = num(pair.priceNative);
  const priceUsd = basePriceUsd !== null && basePriceInQuote !== null && basePriceInQuote > 0
    ? basePriceUsd / basePriceInQuote
    : null;
  const invertChange = (change: number | undefined) => {
    if (change === undefined || !Number.isFinite(change) || change <= -100) return undefined;
    return ((1 / (1 + change / 100)) - 1) * 100;
  };

  return {
    ...pair,
    baseToken: pair.quoteToken,
    quoteToken: pair.baseToken,
    priceUsd: priceUsd === null ? undefined : String(priceUsd),
    priceNative: basePriceInQuote === null || basePriceInQuote <= 0 ? undefined : String(1 / basePriceInQuote),
    marketCap: undefined,
    fdv: undefined,
    priceChange: pair.priceChange
      ? {
          m5: invertChange(pair.priceChange.m5),
          h1: invertChange(pair.priceChange.h1),
          h6: invertChange(pair.priceChange.h6),
          h24: invertChange(pair.priceChange.h24),
        }
      : undefined,
    info: undefined,
  };
}

/**
 * Loads live token data for a Solana token.
 * When `pinnedPair` is supplied we refresh only that pair so the panel never
 * switches pools between refreshes.
 */
export async function loadTokenData(
  ca: string,
  pinnedPair?: string | undefined,
): Promise<TokenDataResult> {
  const address = ca.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return { ok: false, error: "Invalid Solana token address." };
  }

  try {
    if (pinnedPair) {
      try {
        const pair = await fetchPair(pinnedPair);
        if (pair && pairContainsToken(pair, address)) {
          const normalized = pairForToken(pair, address);
          const token = normalized ? toTokenData(normalized, [normalized], address) : null;
          if (token) {
            const all = await fetchAllTokenPairs(address, 120_000).catch(() => [normalized]);
            const matching = all.filter((candidate) => pairContainsToken(candidate, address));
            const merged = toTokenData(normalized, matching.length ? matching : [normalized], address);
            if (merged) return { ok: true, token: merged };
          }
        }
      } catch (error) {
        if (error instanceof DexRateLimited) throw error;
        if (!(error instanceof DexHttpFailure) || error.status !== 404) throw error;
      }
    }

    const pairs = await fetchTokenPairs(address, 15_000);
    if (pairs.length === 0) return { ok: false, error: NOT_INDEXED };

    const matching = pairs.filter((pair) => pairContainsToken(pair, address));
    if (matching.length === 0) return { ok: false, error: NOT_INDEXED };

    const baseMatches = matching.filter((pair) => pair.baseToken?.address?.toLowerCase() === address.toLowerCase());
    const relevantPairs = (baseMatches.length ? baseMatches : matching)
      .map((pair) => pairForToken(pair, address))
      .filter((pair): pair is DexPair => pair !== null);
    const pricedPairs = relevantPairs.filter((pair) => num(pair.priceUsd) !== null);
    if (pricedPairs.length === 0) return { ok: false, error: NO_TRADING_PAIR };

    const best = bestPair(pricedPairs);
    if (!best) return { ok: false, error: NO_TRADING_PAIR };
    const token = toTokenData(best, pricedPairs, address);
    if (!token) return { ok: false, error: NO_TRADING_PAIR };
    return { ok: true, token };
  } catch (err) {
    if (err instanceof DexRateLimited) return { ok: false, error: RATE_LIMITED };
    if (err instanceof DexHttpFailure) {
      console.error("[DEX Screener] API failure", { tokenAddress: address, status: err.status, reason: err.message });
      if (err.status === 404) return { ok: false, error: NOT_INDEXED };
      return { ok: false, error: `DEX Screener API error (HTTP ${err.status}): ${err.message}` };
    }
    if (err instanceof DexUnavailable) {
      console.error("[DEX Screener] network failure", { tokenAddress: address, reason: err.message });
      return { ok: false, error: `${UNAVAILABLE} (network failure).` };
    }
    console.error("[DEX Screener] unexpected lookup failure", { tokenAddress: address, error: err });
    return { ok: false, error: UNAVAILABLE };
  }
}

/** Legacy helper used by the wallet tracker. */
async function fetchPairs(address: string): Promise<DexPair[] | { rateLimited: true } | null> {
  try {
    const viaTokens = await fetchTokenPairs(address, 15_000);
    if (viaTokens.length) return viaTokens;
    const res = await dexGet<{ pairs?: DexPair[] | null }>(`/latest/dex/tokens/${address}`, 15_000);
    return solanaOnly(res.pairs ?? []);
  } catch (err) {
    if (err instanceof DexRateLimited) return { rateLimited: true };
    return null;
  }
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
    const rates = Object.fromEntries(
      Object.entries(json.rates ?? {}).filter(([, value]) => Number.isFinite(value) && value > 0),
    );
    const inr = num(rates["INR"]);
    if (inr === null || inr <= 0) {
      return { ok: false, error: "USD/INR rate unavailable. Try again shortly." };
    }
    return { ok: true, usdInr: inr, rates: { USD: 1, ...rates } };
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
