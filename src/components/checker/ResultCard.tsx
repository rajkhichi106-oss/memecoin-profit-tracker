import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  formatCompactUsd,
  CURRENCY_CODES,
  formatCurrency,
  formatInr,
  formatPercent,
  formatSol,
  formatUsd,
  timeAgo,
  type TargetRow,
  type ProfitResult,
} from "@/lib/profit";
import type { RefreshOption } from "@/hooks/useProfitChecker";

type Props = {
  result: ProfitResult;
  currentMarketCap: number;
  buyMarketCap: number;
  marketCapMetric: "marketCap" | "fdv" | "none";
  usdInr: number | null;
  fxRates: Record<string, number>;
  displayCurrency: string;
  setDisplayCurrency: (v: string) => void;
  feeSol: number;
  solPrice: number | null;
  expectedTargetRow: TargetRow | null;
  targets: TargetRow[];
  refreshInterval: RefreshOption;
  setRefreshInterval: (v: RefreshOption) => void;
  refreshing: boolean;
  onRefresh: () => void;
  lastUpdated: number | null;
  tick: number;
  chartSlot?: ReactNode;
};

const CARD = "rounded-3xl border border-border bg-white/[0.04] backdrop-blur-md";

function StatCard({
  label,
  value,
  sub,
  tone,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "profit" | "loss" | undefined;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-3xl border p-5",
        accent ? "border-chart-1/40 bg-chart-1/10" : "border-border bg-white/[0.04]",
      )}
    >
      <p className={cn("text-xs font-medium", accent ? "text-chart-1" : "text-muted-foreground")}>
        {label}
      </p>
      <p
        className={cn(
          "num font-display mt-1.5 truncate text-2xl font-extrabold tracking-tight",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
      {sub ? <p className="num mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** Honest sparkline: straight segments entry → now (→ target), scaled to real market caps. */
function Sparkline({
  entry,
  now,
  target,
  up,
}: {
  entry: number;
  now: number;
  target: number | null;
  up: boolean;
}) {
  const pts = target && target > 0 ? [entry, now, target] : [entry, now];
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = hi - lo || 1;
  const W = 600;
  const H = 90;
  const y = (v: number) => H - 8 - ((v - lo) / span) * (H - 20);
  const xs = pts.length === 3 ? [0, W * 0.55, W] : [0, W];
  const line = pts.map((v, i) => `${xs[i]},${y(v)}`).join(" ");
  const color = up ? "var(--color-profit)" : "var(--color-loss)";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="90"
      preserveAspectRatio="none"
      role="img"
      aria-label="Market cap from entry to now and target"
      className="mt-4 block"
    >
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill="url(#spark)" points={`0,${H} ${line} ${W},${H}`} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={line}
      />
    </svg>
  );
}

export function ResultCard({
  result,
  currentMarketCap,
  buyMarketCap,
  marketCapMetric,
  usdInr,
  fxRates,
  displayCurrency,
  setDisplayCurrency,
  feeSol,
  solPrice,
  expectedTargetRow,
  targets,
  refreshInterval,
  setRefreshInterval,
  refreshing,
  onRefresh,
  lastUpdated,
  tick,
  chartSlot,
}: Props) {
  const up = result.profitUsd >= 0;
  const tone = up ? "profit" : "loss";
  const currencyOptions = [
    ...new Set(["SOL", ...CURRENCY_CODES, ...Object.keys(fxRates)]),
  ].filter((code) => code === "SOL" || code === "USD" || !!fxRates[code]);

  const toSol = (usd: number) => (solPrice ? usd / solPrice : 0);
  /** Main figure in the chosen currency (INR / USD / SOL / any FX code). */
  const money = (usd: number, sign = false) => {
    if (displayCurrency === "SOL") return formatSol(toSol(usd), { sign });
    return formatCurrency(usd, displayCurrency, fxRates, { sign });
  };
  /** Sub line: the other two common units, never repeating the main one. */
  const others = (usd: number, sign = false) => {
    const parts: string[] = [];
    if (displayCurrency !== "INR" && usdInr) parts.push(formatInr(usd * usdInr, { sign }));
    if (displayCurrency !== "USD") parts.push(formatUsd(usd, { sign }));
    if (displayCurrency !== "SOL") parts.push(formatSol(toSol(usd), { sign }));
    return parts.join(" · ");
  };

  const target = expectedTargetRow;
  const progress =
    target && target.targetMarketCap > buyMarketCap
      ? Math.max(
          0,
          Math.min(
            100,
            ((currentMarketCap - buyMarketCap) / (target.targetMarketCap - buyMarketCap)) * 100,
          ),
        )
      : null;
  const nextTargets = targets.filter((t) => t.targetMarketCap > currentMarketCap).slice(0, 4);

  return (
    <div className="space-y-4" data-tick={tick}>
      {/* Hero */}
      <section
        className={cn(
          "relative overflow-hidden rounded-[28px] border p-6 sm:p-7",
          up
            ? "border-profit/30 bg-gradient-to-br from-profit/15 via-white/[0.03] to-transparent"
            : "border-loss/30 bg-gradient-to-br from-loss/15 via-white/[0.03] to-transparent",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">Net profit · after fees</p>
          <div className="flex gap-2">
            <span
              className={cn(
                "num rounded-full bg-black/40 px-3 py-1.5 text-[13px] font-bold",
                up ? "text-profit" : "text-loss",
              )}
            >
              {formatPercent(result.roiPercent)} ROI
            </span>
            <span className="num rounded-full bg-black/40 px-3 py-1.5 text-[13px] font-bold">
              {result.multiplier.toFixed(2)}×
            </span>
          </div>
        </div>
        <p
          className={cn(
            "num font-display mt-3 whitespace-nowrap text-5xl font-extrabold leading-[1.05] tracking-tighter sm:text-7xl",
            "bg-clip-text text-transparent",
            up
              ? "bg-gradient-to-br from-[oklch(0.9_0.17_165)] to-[oklch(0.8_0.13_205)]"
              : "bg-gradient-to-br from-[oklch(0.75_0.2_22)] to-[oklch(0.65_0.2_340)]",
          )}
        >
          {money(result.profitUsd, true)}
        </p>
        <p className="num mt-1 text-sm text-muted-foreground">{others(result.profitUsd, true)}</p>
        <Sparkline
          entry={buyMarketCap}
          now={currentMarketCap}
          target={target ? target.targetMarketCap : null}
          up={up}
        />
      </section>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Invested"
          value={money(result.initialUsd)}
          sub={others(result.initialUsd)}
        />
        <StatCard
          label="Current value"
          value={money(result.currentUsd)}
          sub={others(result.currentUsd)}
        />
        {target ? (
          <StatCard
            accent
            label={`If it hits ${formatCompactUsd(target.targetMarketCap)}`}
            value={money(target.profitUsd, true)}
            sub={others(target.profitUsd, true)}
            tone={target.profitUsd >= 0 ? undefined : "loss"}
          />
        ) : (
          <StatCard
            label="Total fees"
            value={formatSol(result.totalFeesSol)}
            sub="buy + sell, fixed"
          />
        )}
      </div>

      {chartSlot}

      {/* Progress to target */}
      {progress !== null && target ? (
        <section className={cn(CARD, "px-6 py-5")}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-display font-bold">Progress to target</span>
            <span className="num text-xs text-muted-foreground">
              {progress.toFixed(0)}% of the way to {formatCompactUsd(target.targetMarketCap)}
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-chart-1 to-profit"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="num mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Entry {formatCompactUsd(buyMarketCap)}</span>
            <span>
              Now {formatCompactUsd(currentMarketCap)}
              {marketCapMetric === "fdv" ? " (FDV)" : ""}
            </span>
            <span>Target {formatCompactUsd(target.targetMarketCap)}</span>
          </div>
        </section>
      ) : null}

      {/* Multiplier cards */}
      {nextTargets.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {nextTargets.map((t) => (
            <div key={t.targetMarketCap} className={cn(CARD, "min-w-0 p-4")}>
              <p className="num truncate text-xs text-muted-foreground">
                {formatCompactUsd(t.targetMarketCap)} · {(t.targetMarketCap / buyMarketCap).toFixed(0)}×
              </p>
              <p
                className={cn(
                  "num font-display mt-1 truncate text-lg font-bold",
                  t.profitUsd >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {money(t.profitUsd, true)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Controls */}
      <div className={cn(CARD, "px-5 py-4")}>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
            <SelectTrigger className="h-9 w-[118px] text-xs" aria-label="Display currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(refreshInterval)}
            onValueChange={(v) => setRefreshInterval(Number(v) as RefreshOption)}
          >
            <SelectTrigger className="h-9 w-[142px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Auto refresh: Off</SelectItem>
              <SelectItem value="15">Every 15 seconds</SelectItem>
              <SelectItem value="30">Every 30 seconds</SelectItem>
              <SelectItem value="60">Every 60 seconds</SelectItem>
              <SelectItem value="300">Every 5 minutes</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <span className="num ml-auto text-[11px] text-muted-foreground">
            {lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleTimeString()} (${timeAgo(lastUpdated)})`
              : "—"}
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Estimated from your manually entered SOL amount and entry market cap combined with live
          DEX Screener market data — not a live sell quote and not connected to any wallet or
          exchange account.
          {feeSol > 0 ? ` Includes ${formatSol(feeSol)} in fees.` : ""}
        </p>
      </div>
    </div>
  );
}
