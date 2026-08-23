import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getSolPrice, getTokenData, type TokenData } from "@/lib/market-data.functions";
import {
  calculateProfit,
  calculateTargetValue,
  DEFAULT_TARGETS,
  isValidSolanaAddress,
  parseCompactNumber,
  type ProfitResult,
  type TargetRow,
} from "@/lib/profit";
import {
  clearHistory,
  loadHistory,
  saveHistoryEntry,
  type HistoryEntry,
} from "@/lib/history";

export type AmountUnit = "SOL" | "USD";
export type RefreshOption = 0 | 30 | 60 | 300;

const CACHE_TTL = 15_000;

export function useProfitChecker() {
  const fetchToken = useServerFn(getTokenData);
  const fetchSol = useServerFn(getSolPrice);

  const [ca, setCa] = useState("");
  const [amount, setAmount] = useState("");
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("SOL");
  const [buyMcInput, setBuyMcInput] = useState("");
  const [customTarget, setCustomTarget] = useState("");

  const [token, setToken] = useState<TokenData | null>(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<RefreshOption>(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const lastFetch = useRef<{ ca: string; at: number }>({ ca: "", at: 0 });

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Fetch SOL price early so USD -> SOL conversion works before checking.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchSol({});
      if (!cancelled && res.ok) setSolPrice(res.priceUsd);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSol]);

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

  const currentMarketCap = token
    ? (token.marketCap ?? token.fdv ?? null)
    : null;

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
        setError("That doesn't look like a valid Solana contract address.");
        return;
      }
      if (mode === "check") {
        if (!amountValue) {
          setError("Enter how much you invested.");
          return;
        }
        if (!buyMarketCap) {
          setError("Enter the market cap you bought at (e.g. 53K).");
          return;
        }
        const now = Date.now();
        if (
          token &&
          lastFetch.current.ca === address &&
          now - lastFetch.current.at < CACHE_TTL
        ) {
          setError(null);
          return;
        }
      }

      mode === "check" ? setLoading(true) : setRefreshing(true);
      setError(null);
      try {
        const [tokenRes, solRes] = await Promise.all([
          fetchToken({ data: { ca: address } }),
          fetchSol({}),
        ]);

        if (!tokenRes.ok) {
          setError(tokenRes.error);
          return;
        }
        if (!solRes.ok) {
          setError(solRes.error);
          return;
        }
        if (tokenRes.token.marketCap === null && tokenRes.token.fdv === null) {
          setToken(tokenRes.token);
          setSolPrice(solRes.priceUsd);
          setError("Current market cap unavailable. Try again shortly.");
          return;
        }

        setToken(tokenRes.token);
        setSolPrice(solRes.priceUsd);
        setLastUpdated(Date.now());
        lastFetch.current = { ca: address, at: Date.now() };
      } catch {
        setError("Market data service is unavailable. Try again shortly.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ca, amountValue, buyMarketCap, token, fetchToken, fetchSol],
  );

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

  // Auto refresh
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
  };
}
