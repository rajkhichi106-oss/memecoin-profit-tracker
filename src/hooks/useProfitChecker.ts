import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getFxRate,
  getSolPrice,
  getTokenData,
  type TokenData,
  type WalletTrade,
} from "@/lib/market-data.functions";
import {
  calculateProfit,
  calculateTargetValue,
  DEFAULT_TARGETS,
  isValidSolanaAddress,
  parseCompactNumber,
  type ProfitResult,
  type TargetRow,
} from "@/lib/profit";
import { clearHistory, loadHistory, saveHistoryEntry, type HistoryEntry } from "@/lib/history";

export type AmountUnit = "SOL" | "USD";
export type RefreshOption = 0 | 30 | 60 | 300;

const CACHE_TTL = 10_000;

export function useProfitChecker() {
  const fetchToken = useServerFn(getTokenData);
  const fetchSol = useServerFn(getSolPrice);
  const fetchFx = useServerFn(getFxRate);

  const [ca, setCa] = useState("");
  const [amount, setAmount] = useState("");
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("SOL");
  const [buyMcInput, setBuyMcInput] = useState("");
  const [customTarget, setCustomTarget] = useState("");

  const [token, setToken] = useState<TokenData | null>(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [usdInr, setUsdInr] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<RefreshOption>(30);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const lastFetch = useRef<{ ca: string; at: number }>({ ca: "", at: 0 });

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Pull SOL price + USD/INR early so conversions work before the first check.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [sol, fx] = await Promise.all([fetchSol({}), fetchFx({})]);
      if (cancelled) return;
      if (sol.ok) setSolPrice(sol.priceUsd);
      if (fx.ok) setUsdInr(fx.usdInr);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSol, fetchFx]);

  const buyMarketCap = useMemo(() => parseCompactNumber(buyMcInput), [buyMcInput]);
  const amountValue = useMemo(() => {
    const n = Number.parseFloat(amount.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [amount]);

  const solInvested = useMemo(() => {
    if (amountValue === null) return null;
    if (amountUnit === "SOL") return amountValue;
    if (!solPrice) return null;
    return amountValue / solPrice;
  }, [amountValue, amountUnit, solPrice]);

  const currentMarketCap = token ? (token.marketCap ?? token.fdv ?? null) : null;

  const result: ProfitResult | null = useMemo(() => {
    if (!solInvested || !buyMarketCap || !currentMarketCap || !solPrice) return null;
    return calculateProfit({ solInvested, buyMarketCap, currentMarketCap, solPriceUsd: solPrice });
  }, [solInvested, buyMarketCap, currentMarketCap, solPrice]);

  const targets: TargetRow[] = useMemo(() => {
    if (!solInvested || !buyMarketCap || !solPrice) return [];
    return DEFAULT_TARGETS.map((t) =>
      calculateTargetValue(t, { solInvested, buyMarketCap, solPriceUsd: solPrice }),
    );
  }, [solInvested, buyMarketCap, solPrice]);

  const customTargetMc = useMemo(() => parseCompactNumber(customTarget), [customTarget]);
  const customTargetRow: TargetRow | null = useMemo(() => {
    if (!customTargetMc || !solInvested || !buyMarketCap || !solPrice) return null;
    return calculateTargetValue(customTargetMc, {
      solInvested,
      buyMarketCap,
      solPriceUsd: solPrice,
    });
  }, [customTargetMc, solInvested, buyMarketCap, solPrice]);

  const runFetch = useCallback(
    async (mode: "check" | "refresh") => {
      const address = ca.trim();
      if (!isValidSolanaAddress(address)) {
        if (mode === "check") setError("That doesn't look like a valid Solana contract address.");
        return;
      }
      if (mode === "check") {
        const now = Date.now();
        if (token && lastFetch.current.ca === address && now - lastFetch.current.at < CACHE_TTL) {
          setError(null);
          return;
        }
      }

      // Abort-previous semantics: only the newest request may commit state.
      const id = ++reqId.current;
      const stale = () => id !== reqId.current;

      if (mode === "check") setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const pinned = pinnedPair.current.ca === address ? pinnedPair.current.pairAddress : "";
        const needFx = !usdInr || Date.now() - fxFetchedAt.current > FX_TTL;
        const [tokenRes, solRes, fxRes] = await Promise.all([
          fetchToken({ data: { ca: address, pairAddress: pinned } }),
          fetchSol({}),
          needFx ? fetchFx({}) : Promise.resolve(null),
        ]);
        if (stale()) return;

        if (!tokenRes.ok) {
          setError(tokenRes.error);
          return;
        }
        if (fxRes?.ok) {
          setUsdInr(fxRes.usdInr);
          fxFetchedAt.current = Date.now();
        }
        if (solRes.ok) setSolPrice(solRes.priceUsd);

        // Pin the chosen pair for the rest of the session (unless it goes invalid).
        if (tokenRes.token.pairAddress) {
          pinnedPair.current = { ca: address, pairAddress: tokenRes.token.pairAddress };
        }

        setToken(tokenRes.token);
        setLastUpdated(tokenRes.token.fetchedAt);
        lastFetch.current = { ca: address, at: Date.now() };

        if (tokenRes.token.marketCap === null && tokenRes.token.fdv === null) {
          setError("Market cap unavailable for this pair right now.");
        }
      } catch {
        if (!stale()) setError("Market data temporarily unavailable");
      } finally {
        if (!stale()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [ca, token, usdInr, fetchToken, fetchSol, fetchFx],
  );

  // Debounced auto-fetch: typing/pasting a CA loads market data without a click.
  useEffect(() => {
    const address = ca.trim();
    if (!isValidSolanaAddress(address)) return;
    if (lastFetch.current.ca === address && Date.now() - lastFetch.current.at < CACHE_TTL) return;
    const id = window.setTimeout(() => void runFetch("check"), 550);
    return () => window.clearTimeout(id);
  }, [ca, runFetch]);

  // A new contract address invalidates the pinned pair.
  useEffect(() => {
    const address = ca.trim();
    if (pinnedPair.current.ca && pinnedPair.current.ca !== address) {
      pinnedPair.current = { ca: "", pairAddress: "" };
      setToken(null);
      setLastUpdated(null);
    }
  }, [ca]);


  const check = useCallback(() => void runFetch("check"), [runFetch]);
  const refreshNow = useCallback(() => void runFetch("refresh"), [runFetch]);

  // Persist a history entry whenever a fresh successful calculation lands.
  const savedKey = useRef("");
  useEffect(() => {
    if (!token || !result || !solInvested || !buyMarketCap || !currentMarketCap || !lastUpdated)
      return;
    const key = `${token.address}:${buyMarketCap}:${lastUpdated}`;
    if (savedKey.current === key) return;
    savedKey.current = key;
    setHistory(
      saveHistoryEntry({
        id: key,
        ca: token.address,
        symbol: token.symbol,
        buyMarketCap,
        currentMarketCap,
        solInvested,
        currentUsd: result.currentUsd,
        profitUsd: result.profitUsd,
        checkedAt: lastUpdated,
      }),
    );
  }, [token, result, solInvested, buyMarketCap, currentMarketCap, lastUpdated]);

  // Auto refresh of the live position.
  useEffect(() => {
    if (!refreshInterval || !token) return;
    const id = window.setInterval(() => void runFetch("refresh"), refreshInterval * 1000);
    return () => window.clearInterval(id);
  }, [refreshInterval, token, runFetch]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCa(text.trim());
    } catch {
      toast.error("Clipboard access blocked — paste manually.");
    }
  }, []);

  const copy = useCallback(async (value: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("Copy failed.");
    }
  }, []);

  /** Populate the calculator from a detected wallet BUY. */
  const trackTrade = useCallback((trade: WalletTrade) => {
    setCa(trade.mint);
    setAmountUnit("SOL");
    setAmount(trade.solAmount.toFixed(4));
    if (trade.marketCap && trade.currentPriceUsd && trade.entryPriceUsd) {
      const entryMc = trade.marketCap * (trade.entryPriceUsd / trade.currentPriceUsd);
      setBuyMcInput(Math.round(entryMc).toString());
    } else if (trade.marketCap) {
      setBuyMcInput(Math.round(trade.marketCap).toString());
    }
    toast.success(`Tracking ${trade.symbol} position`);
    lastFetch.current = { ca: "", at: 0 };
  }, []);

  // Auto-check once trackTrade has filled every field.
  const pendingTrack = useRef(false);
  const markPendingTrack = useCallback(() => {
    pendingTrack.current = true;
  }, []);
  useEffect(() => {
    if (!pendingTrack.current) return;
    if (!isValidSolanaAddress(ca) || !amountValue || !buyMarketCap) return;
    pendingTrack.current = false;
    void runFetch("check");
  }, [ca, amountValue, buyMarketCap, runFetch]);

  return {
    ca,
    setCa,
    amount,
    setAmount,
    amountUnit,
    setAmountUnit,
    buyMcInput,
    setBuyMcInput,
    customTarget,
    setCustomTarget,
    token,
    solPrice,
    usdInr,
    loading,
    refreshing,
    error,
    lastUpdated,
    refreshInterval,
    setRefreshInterval,
    history,
    clearAllHistory: () => setHistory(clearHistory()),
    buyMarketCap,
    solInvested,
    currentMarketCap,
    result,
    targets,
    customTargetRow,
    check,
    refreshNow,
    pasteFromClipboard,
    copy,
    trackTrade: (t: WalletTrade) => {
      trackTrade(t);
      markPendingTrack();
    },
  };
}
