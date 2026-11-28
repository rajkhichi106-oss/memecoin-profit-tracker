import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import { cn } from "@/lib/utils";
import { formatCompactUsd, formatPrice } from "@/lib/profit";

type Bar = { time: number; open: number; high: number; low: number; close: number };

const TIMEFRAMES = {
  "1s": { unit: "second", agg: 1, limit: 0 },
  "1m": { unit: "minute", agg: 1, limit: 300 },
  "5m": { unit: "minute", agg: 5, limit: 288 },
  "15m": { unit: "minute", agg: 15, limit: 192 },
  "1h": { unit: "hour", agg: 1, limit: 336 },
} as const;
type TF = keyof typeof TIMEFRAMES;
type Mode = "mc" | "price";

/** Polling interval. GeckoTerminal allows ~30 requests/min per IP; 3s = 20/min. */
const POLL_MS = 3000;
/** 1s mode samples DexScreener once a second (limit 300 req/min; this uses 60). */
const TICK_MS = 1000;
const MAX_SECOND_BARS = 1800;
/** Free real-time trade feed for pump.fun tokens (PumpPortal). One socket, subscribed to this mint. */
const TRADE_WS_URL = "wss://pumpportal.fun/api/data";
/** pump.fun tokens have a fixed 1,000,000,000 supply. */
const PUMP_SUPPLY = 1_000_000_000;
const PERIOD_SEC: Record<string, number> = { "1s": 1, "1m": 60, "5m": 300, "15m": 900, "1h": 3600 };
const UP = "#3ddc97";
const DOWN = "#ff5d6c";

type Props = {
  pairAddress: string;
  priceUsd: number;
  currentMarketCap: number;
  entryMarketCap: number;
  targetMarketCap: number | null;
  /** Token mint, used for the real-time trade stream. */
  mint?: string;
  /** Live SOL/USD price, used to convert stream market cap (in SOL) to USD. */
  solPriceUsd?: number | null;
};

function geckoUrl(pool: string, tf: TF, limit: number) {
  const { unit, agg } = TIMEFRAMES[tf];
  return `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${unit}?aggregate=${agg}&limit=${limit}&currency=usd&token=base`;
}

async function fetchBars(pool: string, tf: TF, limit: number, signal: AbortSignal): Promise<Bar[]> {
  const res = await fetch(geckoUrl(pool, tf, limit), {
    headers: { accept: "application/json;version=20230302" },
    signal,
  });
  if (res.status === 429) throw new Error("RATE");
  if (!res.ok) throw new Error(String(res.status));
  const json = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  return (json.data?.attributes?.ohlcv_list ?? [])
    .map((c) => ({ time: c[0] ?? 0, open: c[1] ?? 0, high: c[2] ?? 0, low: c[3] ?? 0, close: c[4] ?? 0 }))
    .filter((b) => b.time > 0 && b.close > 0)
    .sort((a, b) => a.time - b.time);
}

export function LiveChart({
  pairAddress,
  priceUsd,
  currentMarketCap,
  entryMarketCap,
  targetMarketCap,
  mint,
  solPriceUsd,
}: Props) {
  const [tf, setTf] = useState<TF>("1s");
  const [mode, setMode] = useState<Mode>("mc");
  const [status, setStatus] = useState<"loading" | "live" | "error" | "limited">("loading");
  const [updated, setUpdated] = useState<number | null>(null);
  const [stream, setStream] = useState<"off" | "connecting" | "trades">("off");
  const lastWsAt = useRef(0);
  const solRef = useRef<number | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const barsRef = useRef<Bar[]>([]);
  const ratioRef = useRef(1);
  const modeRef = useRef<Mode>("mc");
  const secondsRef = useRef(false);
  const tfRef = useRef<TF>("1s");

  // Price -> market cap multiplier (supply implied by the app's current price / MC).
  const ratio = priceUsd > 0 ? currentMarketCap / priceUsd : 1;
  ratioRef.current = ratio;
  modeRef.current = mode;
  secondsRef.current = tf === "1s";
  tfRef.current = tf;
  solRef.current = solPriceUsd ?? null;

  const toPoint = (b: Bar): CandlestickData<UTCTimestamp> => {
    const k = modeRef.current === "mc" ? ratioRef.current : 1;
    return {
      time: b.time as UTCTimestamp,
      open: b.open * k,
      high: b.high * k,
      low: b.low * k,
      close: b.close * k,
    };
  };

  /** Fold a price into the candle for `bucket` (seconds). Used by both polling and the trade stream. */
  const pushPrice = (price: number, bucket: number) => {
    const bars = barsRef.current;
    const last = bars[bars.length - 1];
    let bar: Bar;
    if (last && last.time === bucket) {
      bar = { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price };
      bars[bars.length - 1] = bar;
    } else if (!last || bucket > last.time) {
      const open = last ? last.close : price;
      bar = { time: bucket, open, high: Math.max(open, price), low: Math.min(open, price), close: price };
      bars.push(bar);
      if (bars.length > MAX_SECOND_BARS) bars.shift();
    } else {
      return;
    }
    seriesRef.current?.update(toPoint(bar));
  };
  const streamActive = () => Date.now() - lastWsAt.current < 15000;

  // Create the chart once.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#98a2b8",
        fontFamily: "Inter, system-ui, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        tickMarkFormatter: (t: number) =>
          new Date(t * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            ...(secondsRef.current ? { second: "2-digit" } : {}),
          }),
      },
      localization: {
        timeFormatter: (t: number) => new Date(t * 1000).toLocaleString(),
      },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceFormat: { type: "custom", minMove: 1, formatter: (v: number) => formatCompactUsd(v) },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // Axis format + repaint when switching MC <-> price.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    s.applyOptions({
      priceFormat:
        mode === "mc"
          ? { type: "custom", minMove: 1, formatter: (v: number) => formatCompactUsd(v) }
          : { type: "custom", minMove: 1e-12, formatter: (v: number) => formatPrice(v) },
    });
    if (barsRef.current.length) s.setData(barsRef.current.map(toPoint));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Entry / target lines.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    for (const l of linesRef.current) s.removePriceLine(l);
    linesRef.current = [];
    const k = mode === "mc" ? 1 : ratio > 0 ? 1 / ratio : 1;
    const add = (v: number | null, title: string, color: string) => {
      if (v && v > 0) {
        linesRef.current.push(
          s.createPriceLine({ price: v * k, color, lineStyle: 2, lineWidth: 1, title, axisLabelVisible: true }),
        );
      }
    };
    add(entryMarketCap, "Entry", "#8b7bff");
    add(targetMarketCap, "Target", "#f5c542");
  }, [mode, ratio, entryMarketCap, targetMarketCap]);

  // Data feed: full history once, then cheap 2-candle refreshes.
  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    let strikes = 0;
    const ctl = new AbortController();
    barsRef.current = [];
    seriesRef.current?.setData([]);
    setStatus("loading");
    chartRef.current?.applyOptions({ timeScale: { secondsVisible: tf === "1s" } });

    if (tf === "1s") {
      // Build 1-second candles from live price snapshots (no history exists at this resolution).
      const url = `https://api.dexscreener.com/latest/dex/pairs/solana/${pairAddress}`;
      let failures = 0;
      const sample = async () => {
        if (stop) return;
        if (!document.hidden) {
          try {
            const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
            if (res.status === 429) throw new Error("RATE");
            if (!res.ok) throw new Error(String(res.status));
            const json = (await res.json()) as { pairs?: { priceUsd?: string }[] | null };
            const price = Number(json.pairs?.[0]?.priceUsd);
            if (stop) return;
            if (!(price > 0)) throw new Error("NOPRICE");
            failures = 0;
            if (!streamActive()) pushPrice(price, Math.floor(Date.now() / 1000));
            setUpdated(Date.now());
            setStatus("live");
          } catch (e) {
            if (stop || (e instanceof DOMException && e.name === "AbortError")) return;
            failures = Math.min(failures + 1, 5);
            setStatus(e instanceof Error && e.message === "RATE" ? "limited" : "error");
          }
        }
        if (!stop) timer = window.setTimeout(() => void sample(), TICK_MS * (1 + failures));
      };
      void sample();
      return () => {
        stop = true;
        ctl.abort();
        if (timer) window.clearTimeout(timer);
      };
    }

    const merge = (incoming: Bar[]) => {
      const bars = barsRef.current;
      let repaintAll = false;
      for (const b of incoming) {
        const last = bars[bars.length - 1];
        if (last && b.time === last.time) {
          if (streamActive()) continue; // stream is fresher than the polled candle
          bars[bars.length - 1] = b;
          seriesRef.current?.update(toPoint(b));
        } else if (!last || b.time > last.time) {
          bars.push(b);
          seriesRef.current?.update(toPoint(b));
        } else {
          // Older candle (the previous one, finalised): the chart can only update the
          // newest bar, so patch our copy and repaint the whole series once.
          const i = bars.findIndex((x) => x.time === b.time);
          if (i >= 0 && bars[i]!.close !== b.close) {
            bars[i] = b;
            repaintAll = true;
          }
        }
      }
      if (repaintAll) seriesRef.current?.setData(bars.map(toPoint));
    };

    const tick = async (first: boolean) => {
      if (stop) return;
      if (document.hidden && !first) {
        timer = window.setTimeout(() => void tick(false), POLL_MS);
        return;
      }
      try {
        const got = await fetchBars(pairAddress, tf, first ? TIMEFRAMES[tf].limit : 2, ctl.signal);
        if (stop) return;
        strikes = 0;
        if (first) {
          barsRef.current = got;
          seriesRef.current?.setData(got.map(toPoint));
          chartRef.current?.timeScale().fitContent();
        } else {
          merge(got);
        }
        setUpdated(Date.now());
        setStatus(barsRef.current.length ? "live" : "error");
      } catch (e) {
        if (stop || (e instanceof DOMException && e.name === "AbortError")) return;
        strikes = Math.min(strikes + 1, 5);
        setStatus(e instanceof Error && e.message === "RATE" ? "limited" : "error");
      }
      if (!stop) timer = window.setTimeout(() => void tick(false), POLL_MS * (1 + strikes));
    };
    void tick(true);
    return () => {
      stop = true;
      ctl.abort();
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairAddress, tf]);

  // Real-time trades (pump.fun tokens): every trade moves the live candle instantly.
  useEffect(() => {
    if (!mint || typeof WebSocket === "undefined") return;
    let stop = false;
    let ws: WebSocket | null = null;
    let retry: number | undefined;
    let attempts = 0;
    setStream("connecting");

    const connect = () => {
      if (stop) return;
      ws = new WebSocket(TRADE_WS_URL);
      ws.onopen = () => {
        attempts = 0;
        ws?.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [mint] }));
      };
      ws.onmessage = (ev: MessageEvent) => {
        let m: {
          mint?: string;
          txType?: string;
          marketCapSol?: number;
          solAmount?: number;
          tokenAmount?: number;
        };
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.mint !== mint || !m.txType) return; // ignore subscribe acks / other tokens
        const sol = solRef.current;
        if (!sol) return;
        let price = 0;
        if (m.marketCapSol && m.marketCapSol > 0) price = (m.marketCapSol * sol) / PUMP_SUPPLY;
        else if (m.solAmount && m.tokenAmount) price = (m.solAmount / m.tokenAmount) * sol;
        if (!(price > 0)) return;
        lastWsAt.current = Date.now();
        setStream("trades");
        const period = PERIOD_SEC[tfRef.current] ?? 60;
        if (period > 1 && barsRef.current.length === 0) return; // wait for history first
        pushPrice(price, Math.floor(Date.now() / 1000 / period) * period);
        setUpdated(Date.now());
      };
      ws.onclose = () => {
        if (stop) return;
        setStream("off");
        retry = window.setTimeout(connect, Math.min(1000 * 2 ** attempts, 15000));
        attempts += 1;
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      stop = true;
      if (retry) window.clearTimeout(retry);
      ws?.close();
      setStream("off");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint]);

  const pill = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
      active ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <section className="rounded-3xl border border-border bg-white/[0.04] p-5 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-bold">Live chart</h2>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold",
              status === "live" ? "text-profit" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                status === "live" ? "animate-pulse bg-profit" : "bg-muted-foreground",
              )}
            />
            {status === "live"
              ? stream === "trades"
                ? "Live · trades"
                : `Live · ${tf === "1s" ? 1 : POLL_MS / 1000}s`
              : status === "limited"
                ? "Rate limited"
                : status === "error"
                  ? "Unavailable"
                  : "Loading"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="Chart units" className="flex rounded-full bg-black/30 p-1">
            <button type="button" aria-pressed={mode === "mc"} onClick={() => setMode("mc")} className={pill(mode === "mc")}>
              MC
            </button>
            <button type="button" aria-pressed={mode === "price"} onClick={() => setMode("price")} className={pill(mode === "price")}>
              Price
            </button>
          </div>
          <div role="group" aria-label="Chart timeframe" className="flex rounded-full bg-black/30 p-1">
            {(Object.keys(TIMEFRAMES) as TF[]).map((k) => (
              <button key={k} type="button" aria-pressed={tf === k} onClick={() => setTf(k)} className={pill(tf === k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-3 h-80 w-full">
        <div ref={boxRef} className="absolute inset-0" />
        {status !== "live" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {status === "error"
              ? tf === "1s"
                ? "Could not read the live price for this pool."
                : "No chart data for this pool from GeckoTerminal."
              : status === "limited"
                ? "Rate-limited, retrying…"
                : "Loading chart…"}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {stream === "trades"
          ? "Real-time: every trade from the pump.fun feed updates the live candle instantly. "
          : tf === "1s"
            ? "1s candles are built from the live DexScreener price sampled once a second, starting when you opened this chart (no earlier history exists at this resolution). Not trade-by-trade for non-pump.fun tokens. "
            : `Candles from GeckoTerminal, refreshed every ${POLL_MS / 1000}s. `}
        {updated ? `Last update ${new Date(updated).toLocaleTimeString()}. ` : ""}Market cap = price × current
        supply.
      </p>
    </section>
  );
}
