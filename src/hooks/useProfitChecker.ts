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
  calculatePosition,
  DEFAULT_TARGETS,
  isValidSolanaAddress,
  parseCompactNumber,
  sumFees,
  summarizePositions,
  type CalculatedPosition,
  type PositionEntry,
  type PositionSummary,
  type TargetRow,
  type TradeFees,
} from "@/lib/profit";
import { clearHistory, loadHistory, saveHistoryEntries, type HistoryEntry } from "@/lib/history";
import { loadPositionEntries, savePositionEntries } from "@/lib/positions";

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
  const [customTarget, setCustomTarget] = useState("");
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
  const [positionEntries, setPositionEntries] = useState<PositionEntry[]>([]);

  const lastFetch = useRef<{ ca: string; at: number }>({ ca: "", at: 0 });
  const reqId = useRef(0);
  const fxFetchedAt = useRef(0);
  const pinnedPair = useRef<{ ca: string; pairAddress: string }>({ ca: "", pairAddress: "" });

  useEffect(() => {
    setHistory(loadHistory());
    setPositionEntries(loadPositionEntries());
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

  const legacyEntries = useMemo<PositionEntry[]>(() => {
    if (!token) return [];
    return history
      .filter((entry) => entry.ca === token.address)
      .map((entry) => ({
        id: entry.entryId ?? `history:${entry.id}`,
        tokenAddress: entry.ca,
        entryMarketCap: entry.buyMarketCap,
        solInvested: entry.solInvested,
        fees: entry.fees ?? { buyPriority: 0, buyBribe: 0, sellPriority: 0, sellBribe: 0 },
        createdAt: entry.createdAt ?? entry.checkedAt,
      }));
  }, [history, token]);

  const activeEntries = useMemo(() => {
    if (!token) return [];
    const merged = new Map<string, PositionEntry>();
    [...legacyEntries, ...positionEntries]
      .filter((entry) => entry.tokenAddress === token.address)
      .forEach((entry) => merged.set(entry.id, entry));
    if (merged.size === 0 && solInvested && buyMarketCap) {
      merged.set("draft:active", {
        id: "draft:active",
        tokenAddress: token.address,
        entryMarketCap: buyMarketCap,
        solInvested,
        fees,
        createdAt: Date.now(),
      });
    }
    return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt);
  }, [legacyEntries, positionEntries, token, solInvested, buyMarketCap, fees]);

  const livePositions = useMemo<CalculatedPosition[]>(() => {
    if (!currentMarketCap || !solPrice) return [];
    return activeEntries.map((entry) => calculatePosition(entry, currentMarketCap, solPrice));
  }, [activeEntries, currentMarketCap, solPrice]);

  const positionSummary: PositionSummary | null = useMemo(
    () => (livePositions.length > 0 && solPrice ? summarizePositions(livePositions, solPrice) : null),
    [livePositions, solPrice],
  );

  const targetGroups = useMemo(() => {
    if (!solPrice || activeEntries.length === 0) return [];
    return DEFAULT_TARGETS.map((targetMarketCap) => {
      const positions = activeEntries.map((entry) =>
        calculatePosition(entry, targetMarketCap, solPrice),
      );
      return { targetMarketCap, positions, summary: summarizePositions(positions, solPrice) };
    });
  }, [activeEntries, solPrice]);

  const targets: TargetRow[] = useMemo(
    () => targetGroups.map((group) => ({ targetMarketCap: group.targetMarketCap, ...group.summary })),
    [targetGroups],
  );

  const customTargetMc = useMemo(() => parseCompactNumber(customTarget), [customTarget]);
  const customTargetGroup = useMemo(() => {
    if (!customTargetMc || !solPrice || activeEntries.length === 0) return null;
    const positions = activeEntries.map((entry) => calculatePosition(entry, customTargetMc, solPrice));
    return { targetMarketCap: customTargetMc, positions, summary: summarizePositions(positions, solPrice) };
  }, [customTargetMc, activeEntries, solPrice]);
  const customTargetRow: TargetRow | null = customTargetGroup
    ? { targetMarketCap: customTargetGroup.targetMarketCap, ...customTargetGroup.summary }
    : null;

  const appendEntry = useCallback((entry: PositionEntry) => {
    setPositionEntries((previous) => {
      const next = [...previous, entry];
      savePositionEntries(next);
      return next;
    });
    toast.success(`Entry #${positionEntries.filter((item) => item.tokenAddress === entry.tokenAddress).length + 1} saved`);
  }, [positionEntries]);

  const makeEntry = useCallback((tokenAddress = token?.address): PositionEntry | null => {
    if (!tokenAddress || !solInvested || !buyMarketCap) return null;
    return {
      id: `${tokenAddress}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      tokenAddress,
      entryMarketCap: buyMarketCap,
      solInvested,
      fees,
      createdAt: Date.now(),
    };
  }, [token, solInvested, buyMarketCap, fees]);

  const runFetch = useCallback(
    async (mode: "check" | "refresh" | "auto") => {
      const address = ca.trim();
      if (!isValidSolanaAddress(address)) {
        if (mode === "check") setError("That doesn't look like a valid Solana contract address.");
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
          const entry = makeEntry(token.address);
          if (entry) appendEntry(entry);
          return;
        }
      }

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
        if (mode === "check") {
          const entry = makeEntry(tokenRes.token.address);
          if (entry) appendEntry(entry);
        }

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
    [ca, amountValue, buyMarketCap, token, usdInr, makeEntry, appendEntry],
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

  // Persist a history snapshot for each saved entry whenever live data refreshes.
  const savedKey = useRef("");
  useEffect(() => {
    if (!token || livePositions.length === 0 || !currentMarketCap || !lastUpdated)
      return;
    const key = `${token.address}:${lastUpdated}:${livePositions.map((position) => position.entry.id).join(",")}`;
    if (savedKey.current === key) return;
    savedKey.current = key;
    setHistory(
      saveHistoryEntries(
        livePositions.map(({ entry, result: entryResult }) => ({
          id: entry.id,
          entryId: entry.id,
          ca: token.address,
          symbol: token.symbol,
          buyMarketCap: entry.entryMarketCap,
          currentMarketCap,
          solInvested: entry.solInvested,
          currentUsd: entryResult.currentUsd,
          profitUsd: entryResult.profitUsd,
          checkedAt: lastUpdated,
          createdAt: entry.createdAt,
          fees: entry.fees,
        })),
      ),
    );
  }, [token, livePositions, currentMarketCap, lastUpdated]);

  // Auto refresh of the live position.
  useEffect(() => {
    if (!refreshInterval || !token) return;
    const id = window.setInterval(() => void runFetch("refresh"), refreshInterval * 1000);
    return () => window.clearInterval(id);
  }, [refreshInterval, token, runFetch]);

  // Dynamic browser tab title: show active live profit as an integer in INR.
  const titleName = token?.symbol?.trim() || token?.name?.trim() || "";
  const titleProfitInr = useMemo(() => {
    if (!positionSummary || !usdInr) return null;
    return Math.round(positionSummary.profitUsd * usdInr);
  }, [positionSummary, usdInr]);
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

  const addEntry = useCallback(() => {
    const entry = makeEntry();
    if (!entry) {
      setError("Enter an investment and buy market cap before adding an entry.");
      return;
    }
    appendEntry(entry);
  }, [appendEntry, makeEntry]);

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
    customTarget,
    setCustomTarget,
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
    result: positionSummary,
    positionEntries: activeEntries,
    livePositions,
    positionSummary,
    targets,
    customTargetRow,
    targetGroups,
    customTargetGroup,
    check,
    refreshNow,
    pasteFromClipboard,
    copy,
    trackTrade: (t: WalletTrade) => {
      trackTrade(t);
      markPendingTrack();
    },
    addEntry,
  };
}
