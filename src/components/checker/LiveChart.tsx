import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { formatCompactUsd, formatPrice } from "@/lib/profit";

type Candle = { t: number; close: number };

const TIMEFRAMES = {
  "1m": { unit: "minute", agg: 1, limit: 120 },
  "5m": { unit: "minute", agg: 5, limit: 144 },
  "15m": { unit: "minute", agg: 15, limit: 96 },
  "1h": { unit: "hour", agg: 1, limit: 168 },
} as const;
type TF = keyof typeof TIMEFRAMES;

const POLL_MS = 5000;

type Props = {
  pairAddress: string;
  priceUsd: number;
  currentMarketCap: number;
  entryMarketCap: number;
  targetMarketCap: number | null;
};

export function LiveChart({
  pairAddress,
  priceUsd,
  currentMarketCap,
  entryMarketCap,
  targetMarketCap,
}: Props) {
  const [tf, setTf] = useState<TF>("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "error" | "limited">("loading");
  const [updated, setUpdated] = useState<number | null>(null);
  const backoff = useRef(0);

  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const ctl = new AbortController();
    setCandles([]);
    setStatus("loading");

    const load = async () => {
      if (stop) return;
      if (document.hidden) {
        timer = window.setTimeout(load, POLL_MS);
        return;
      }
      const { unit, agg, limit } = TIMEFRAMES[tf];
      try {
        const res = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/${unit}?aggregate=${agg}&limit=${limit}&currency=usd&token=base`,
          { headers: { accept: "application/json;version=20230302" }, signal: ctl.signal },
        );
        if (res.status === 429) {
          backoff.current = Math.min(backoff.current + 1, 4);
          setStatus("limited");
        } else if (!res.ok) {
          throw new Error(String(res.status));
        } else {
          const json = (await res.json()) as {
            data?: { attributes?: { ohlcv_list?: number[][] } };
          };
          const list = json.data?.attributes?.ohlcv_list ?? [];
          const next = list
            .map((c) => ({ t: (c[0] ?? 0) * 1000, close: c[4] ?? 0 }))
            .filter((c) => c.close > 0)
            .sort((a, b) => a.t - b.t);
          if (!stop) {
            backoff.current = 0;
            setCandles(next);
            setUpdated(Date.now());
            setStatus(next.length ? "live" : "error");
          }
        }
      } catch (e) {
        if (stop || (e instanceof DOMException && e.name === "AbortError")) return;
        setStatus("error");
      }
      if (!stop) timer = window.setTimeout(load, POLL_MS * (1 + backoff.current));
    };
    void load();
    return () => {
      stop = true;
      ctl.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [pairAddress, tf]);

  // Price -> market cap using the live supply implied by the current price/MC pair.
  const supplyRatio = priceUsd > 0 ? currentMarketCap / priceUsd : 0;
  const data = useMemo(
    () => candles.map((c) => ({ t: c.t, price: c.close, mc: c.close * supplyRatio })),
    [candles, supplyRatio],
  );

  const lo = data.length ? Math.min(...data.map((d) => d.mc)) : 0;
  const hi = data.length ? Math.max(...data.map((d) => d.mc)) : 0;
  const pad = (hi - lo) * 0.08 || hi * 0.05;
  const inRange = (v: number | null) => v !== null && v >= lo - pad && v <= hi + pad;
  const first = data[0]?.mc ?? 0;
  const last = data[data.length - 1]?.mc ?? 0;
  const up = last >= first;
  const color = up ? "var(--color-profit)" : "var(--color-loss)";
  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      ...(tf === "1h" ? { month: "short", day: "numeric" } : {}),
    });

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
              ? `Live · ${POLL_MS / 1000}s`
              : status === "limited"
                ? "Rate limited"
                : status === "error"
                  ? "Unavailable"
                  : "Loading"}
          </span>
        </div>
        <div role="group" aria-label="Chart timeframe" className="flex rounded-full bg-black/30 p-1">
          {(Object.keys(TIMEFRAMES) as TF[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={tf === k}
              onClick={() => setTf(k)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                tf === k
                  ? "bg-gradient-brand text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 h-64 w-full">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="lc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={color} stopOpacity={0.35} />
                  <stop offset="1" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="oklch(1 0 0 / 6%)" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={fmtTime}
                tick={{ fontSize: 11, fill: "oklch(0.7 0.024 275)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={48}
              />
              <YAxis
                orientation="right"
                width={58}
                domain={[lo - pad, hi + pad]}
                tickFormatter={(v: number) => formatCompactUsd(v)}
                tick={{ fontSize: 11, fill: "oklch(0.7 0.024 275)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ stroke: "oklch(1 0 0 / 25%)" }}
                contentStyle={{
                  background: "oklch(0.2 0.022 275)",
                  border: "1px solid oklch(1 0 0 / 12%)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelFormatter={(t: number) => fmtTime(t)}
                formatter={(v: number, _n, item) => [
                  `${formatCompactUsd(v)} · ${formatPrice((item.payload as { price: number }).price)}`,
                  "Market cap · price",
                ]}
              />
              {inRange(entryMarketCap) ? (
                <ReferenceLine
                  y={entryMarketCap}
                  stroke="oklch(0.62 0.21 288)"
                  strokeDasharray="4 4"
                  label={{ value: "Entry", position: "insideTopLeft", fill: "oklch(0.75 0.15 288)", fontSize: 11 }}
                />
              ) : null}
              {inRange(targetMarketCap) ? (
                <ReferenceLine
                  y={targetMarketCap as number}
                  stroke="oklch(0.82 0.17 85)"
                  strokeDasharray="4 4"
                  label={{ value: "Target", position: "insideTopLeft", fill: "oklch(0.82 0.17 85)", fontSize: 11 }}
                />
              ) : null}
              <Area
                type="monotone"
                dataKey="mc"
                stroke={color}
                strokeWidth={2.5}
                fill="url(#lc)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {status === "error"
              ? "No chart data for this pool from GeckoTerminal."
              : status === "limited"
                ? "Chart data is rate-limited, retrying…"
                : "Loading chart…"}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Candles from GeckoTerminal, refreshed every {POLL_MS / 1000}s{updated ? ` (last ${new Date(updated).toLocaleTimeString()})` : ""}. Shown as market cap using the current supply. Data
        providers cache for a few seconds, so this is near-real-time, not tick-by-tick.
      </p>
    </section>
  );
}
