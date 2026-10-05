import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  formatCompactUsd,
  isValidSolanaAddress,
  parseCompactNumber,
  sumFees,
  type ProfitResult,
  type TargetRow,
  type TradeFees,
} from "@/lib/profit";
import { clearHistory, loadHistory, saveHistoryEntry, type HistoryEntry } from "@/lib/history";

export type AmountUnit = "SOL" | "USD";
export type MarketCapUnit = "K" | "M" | "B";
export type RefreshOption = 0 | 15 | 30 | 60 | 300;

const CACHE_TTL = 8_000;
const FX_TTL = 300_000;

export function useProfitChecker() {
  const [ca, setCa] = useState("");
  const [amount, setAmount] = useState("");
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("SOL");
  const [buyMcInput, setBuyMcInput] = useState("");
  const [buyMcUnit, setBuyMcUnit] = useState<MarketCapUnit>("K");
  const [targetMcInput, setTargetMcInput] = useState("");
  const [targetMcUnit, setTargetMcUnit] = useState<MarketCapUnit>("M");
  const [buyPriorityFee, setBuyPriorityFee] = useState("");
  const [buyBribeFee, setBuyBribeFee] = useState("");
  const [sellPriorityFee, setSellPriorityFee] = useState("");
  const [sellBribeFee, setSellBribeFee] = useState("");

  const [token, setToken] = useState<TokenData | null>(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [usdInr, setUsdInr] = useState<number | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ USD: 1 });
  const [displayCurrency, setDisplayCurrency] = useState("INR");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<RefreshOption>(30);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const lastFetch = useRef<{ ca: string; at: number }>({ ca: "", at: 0 });
  const inFlightAddresses = useRef(new Set<string>());
  const reqId = useRef(0);
  const fxFetchedAt = useRef(0);
  const pinnedPair = useRef<{ ca: string; pairAddress: string }>({ ca: "", pairAddress: "" });

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Pull SOL price + USD/INR early so conversions work before the first check.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [sol, fx] = await Promise.all([getSolPrice({}), getFxRate({})]);
      if (cancelled) return;
      if (sol.ok) setSolPrice(sol.priceUsd);
      if (fx.ok) {
        setUsdInr(fx.usdInr);
        setFxRates(fx.rates);
        fxFetchedAt.current = Date.now();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buyMarketCap = useMemo(
    () => parseCompactNumber(`${buyMcInput}${buyMcUnit}`),
    [buyMcInput, buyMcUnit],
  );
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

  const parseFee = (raw: string) => {
    const value = Number.parseFloat(raw.replace(/,/g, ""));
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const fees: TradeFees = useMemo(
    () => ({
      buyPriority: parseFee(buyPriorityFee),
      buyBribe: parseFee(buyBribeFee),
      sellPriority: parseFee(sellPriorityFee),
      sellBribe: parseFee(sellBribeFee),
    }),
    [buyPriorityFee, buyBribeFee, sellPriorityFee, sellBribeFee],
  );
  const feeSol = useMemo(() => sumFees(fees), [fees]);

  const currentMarketCap = token ? (token.marketCap ?? token.fdv ?? null) : null;

  const result: ProfitResult | null = useMemo(() => {
    if (!solInvested || !buyMarketCap || !currentMarketCap || !solPrice) return null;
    return calculateProfit({ solInvested, buyMarketCap, currentMarketCap, solPriceUsd: solPrice, fees });
  }, [solInvested, buyMarketCap, currentMarketCap, solPrice, fees]);

  const targets: TargetRow[] = useMemo(() => {
    if (!solInvested || !buyMarketCap || !solPrice) return [];
    return DEFAULT_TARGETS.map((t) =>
      calculateTargetValue(t, { solInvested, buyMarketCap, solPriceUsd: solPrice, fees }),
    );
  }, [solInvested, buyMarketCap, solPrice, fees]);

  const customTargetMc = useMemo(
    () => parseCompactNumber(`${targetMcInput}${targetMcUnit}`),
    [targetMcInput, targetMcUnit],
  );
  const customTargetRow: TargetRow | null = useMemo(() => {
    if (!customTargetMc || !solInvested || !buyMarketCap || !solPrice) return null;
    return calculateTargetValue(customTargetMc, {
      solInvested,
      buyMarketCap,
      solPriceUsd: solPrice,
      fees,
    });
  }, [customTargetMc, solInvested, buyMarketCap, solPrice, fees]);

  const runFetch = useCallback(
    async (mode: "check" | "refresh" | "auto") => {
      const address = ca.trim();
      if (!isValidSolanaAddress(address)) {
        if (mode === "check") setError("Invalid Solana token address.");
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
        if (token && lastFetch.current.ca === address && now - lastFetch.current.at < CACHE_TTL) {
          setError(null);
          return;
        }
      }

      if (inFlightAddresses.current.has(address)) return;
      inFlightAddresses.current.add(address);

      // Abort-previous semantics: only the newest request may commit state.
      const id = ++reqId.current;
      const stale = () => id !== reqId.current;

      if (mode !== "refresh") setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const pinned = pinnedPair.current.ca === address ? pinnedPair.current.pairAddress : "";
        const needFx = !usdInr || Date.now() - fxFetchedAt.current > FX_TTL;
        const [tokenRes, solRes, fxRes] = await Promise.all([
          getTokenData({ data: { ca: address, pairAddress: pinned } }),
          getSolPrice({}),
          needFx ? getFxRate({}) : Promise.resolve(null),
        ]);
        if (stale()) return;

        if (!tokenRes.ok) {
          setError(tokenRes.error);
          return;
        }
        if (fxRes?.ok) {
          setUsdInr(fxRes.usdInr);
          setFxRates(fxRes.rates);
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
        inFlightAddresses.current.delete(address);
        if (!stale()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [ca, amountValue, buyMarketCap, token, usdInr],
  );

  // Debounced auto-fetch: typing/pasting a CA loads market data without a click.
  useEffect(() => {
    const address = ca.trim();
    if (!isValidSolanaAddress(address)) return;
    if (lastFetch.current.ca === address && Date.now() - lastFetch.current.at < CACHE_TTL) return;
    const id = window.setTimeout(() => void runFetch("auto"), 550);
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

  // Dynamic browser tab title: show active live profit as an integer in INR.
  const titleName = token?.symbol?.trim() || token?.name?.trim() || "";
  const titleProfitInr = useMemo(() => {
    if (!result || !usdInr) return null;
    return Math.round(result.profitUsd * usdInr);
  }, [result, usdInr]);
  useEffect(() => {
    if (!titleName || titleProfitInr === null) return;
    const sign = titleProfitInr > 0 ? "+" : titleProfitInr < 0 ? "-" : "";
    document.title = `${titleName} ${sign}₹${Math.abs(titleProfitInr).toLocaleString("en-IN")}`;
  }, [titleName, titleProfitInr]);

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
    const entryMarketCap = trade.marketCap && trade.currentPriceUsd && trade.entryPriceUsd
      ? trade.marketCap * (trade.entryPriceUsd / trade.currentPriceUsd)
      : trade.marketCap;
    setCa(trade.mint);
    setAmountUnit("SOL");
    setAmount(trade.solAmount.toFixed(4));
    if (entryMarketCap) {
      const unit: MarketCapUnit = entryMarketCap >= 1e9 ? "B" : entryMarketCap >= 1e6 ? "M" : "K";
      const divisor = unit === "B" ? 1e9 : unit === "M" ? 1e6 : 1e3;
      setBuyMcUnit(unit);
      setBuyMcInput((entryMarketCap / divisor).toFixed(2).replace(/\.00$/, ""));
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
    buyMcUnit,
    setBuyMcUnit,
    targetMcInput,
    setTargetMcInput,
    targetMcUnit,
    setTargetMcUnit,
    buyPriorityFee,
    setBuyPriorityFee,
    buyBribeFee,
    setBuyBribeFee,
    sellPriorityFee,
    setSellPriorityFee,
    sellBribeFee,
    setSellBribeFee,
    fees,
    feeSol,
    token,
    solPrice,
    usdInr,
    fxRates,
    displayCurrency,
    setDisplayCurrency,
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
