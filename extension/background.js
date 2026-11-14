// Fetches market data on behalf of the Axiom page (no CORS issues, shared cache).
const cache = new Map();
let lastCall = 0;

async function throttledFetch(url, ttl, force = false) {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.t < ttl) return hit.data;
  const wait = Math.max(0, lastCall + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(url);
  if (res.status === 429) {
    const ra = Number(res.headers.get("Retry-After")) || 3;
    await new Promise((r) => setTimeout(r, ra * 1000));
    return throttledFetch(url, ttl);
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  cache.set(url, { t: Date.now(), data });
  return data;
}

function pickPair(pairs, address) {
  const list = (pairs || []).filter((p) => p.chainId === "solana");
  if (!list.length) return null;
  const exact = list.find((p) => p.pairAddress === address);
  if (exact) return exact;
  return list.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
}

async function getMarket(address, force = false) {
  // Axiom URLs usually carry the pair address; try pair first, then token.
  let pair = null;
  try {
    const d = await throttledFetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${address}`, 4000, force);
    pair = pickPair(d.pairs || (d.pair ? [d.pair] : []), address);
  } catch (e) {}
  if (!pair) {
    const d = await throttledFetch(`https://api.dexscreener.com/tokens/v1/solana/${address}`, 4000, force);
    pair = pickPair(Array.isArray(d) ? d : [], address);
  }
  if (!pair) return getMarketJupiter(address);
  const sol = await getSolUsd();
  return {
    name: pair.baseToken?.name,
    symbol: pair.baseToken?.symbol,
    token: pair.baseToken?.address,
    priceUsd: Number(pair.priceUsd) || 0,
    mc: pair.marketCap || pair.fdv || 0,
    dex: pair.dexId,
    solUsd: sol,
    usdInr: await getUsdInr(),
    t: Date.now(),
  };
}

// Bonding-curve (pre-DEX) tokens are missing from DEX Screener; Jupiter still prices them.
async function getMarketJupiter(address) {
  let t = null;
  try {
    const list = await throttledFetch(`https://lite-api.jup.ag/tokens/v2/search?query=${address}`, 8000, force);
    t = (Array.isArray(list) ? list : []).find((x) => x.id === address);
  } catch (e) {
    throw new Error("Token not found or not indexed by DEX Screener yet.");
  }
  if (!t) throw new Error("Token not found or not indexed by DEX Screener yet.");
  const sol = await getSolUsd();
  return {
    name: t.name,
    symbol: t.symbol,
    token: address,
    priceUsd: Number(t.usdPrice) || 0,
    mc: Number(t.mcap ?? t.fdv) || 0,
    dex: "Jupiter",
    solUsd: sol,
    usdInr: await getUsdInr(),
    t: Date.now(),
  };
}

async function getSolUsd() {
  const d = await throttledFetch(
    "https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112",
    60000,
  );
  const p = pickPair(Array.isArray(d) ? d : [], "");
  const base = p?.baseToken?.address === "So11111111111111111111111111111111111111112";
  return base ? Number(p.priceUsd) : 1 / Number(p?.priceNative || 1) || 150;
}

async function getUsdInr() {
  try {
    const d = await throttledFetch("https://open.er-api.com/v6/latest/USD", 3600000);
    return d.rates?.INR || 83;
  } catch {
    return 83;
  }
}

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.type === "market") {
    getMarket(msg.address, Boolean(msg.force)).then((data) => reply({ ok: true, data }), (e) => reply({ ok: false, error: e.message }));
    return true;
  }
});
