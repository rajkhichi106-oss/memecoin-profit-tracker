import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

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
  refreshInterval: RefreshOption;
  setRefreshInterval: (v: RefreshOption) => void;
  refreshing: boolean;
  onRefresh: () => void;
  lastUpdated: number | null;
  tick: number;
};

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "profit" | "loss";
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/35 px-3 py-2.5">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num mt-0.5 text-sm font-semibold",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
      {sub ? <p className="num text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
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
  refreshInterval,
  setRefreshInterval,
  refreshing,
  onRefresh,
  lastUpdated,
  tick,
}: Props) {
  const up = result.profitUsd >= 0;
  const tone = up ? "profit" : "loss";
  const inr = (usd: number) => (usdInr ? usd * usdInr : null);
  const profitInr = inr(result.profitUsd);
  const valueInr = inr(result.currentUsd);
  const currencyOptions = [...new Set([...CURRENCY_CODES, ...Object.keys(fxRates)])].filter(
    (code) => code === "USD" || !!fxRates[code],
  );

  return (
    <section className="glass relative overflow-hidden rounded-2xl p-4 sm:p-5" data-tick={tick}>
      <div
        className={cn(
          "pointer-events-none absolute -top-24 left-1/2 h-48 w-3/4 -translate-x-1/2 rounded-full blur-3xl",
          up ? "bg-profit/20" : "bg-loss/20",
        )}
      />
      <div className="relative">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Live Position
          </h2>
          <span
            className={cn(
              "num inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
              up ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
            )}
          >
            {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {formatPercent(result.roiPercent)}
          </span>
        </div>

        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
             Active Net Profit — after fees ({displayCurrency})
          </p>
          <p
            className={cn(
              "num mt-0.5 text-3xl font-bold leading-tight sm:text-4xl",
              up ? "text-profit" : "text-loss",
            )}
          >
             {formatCurrency(result.profitUsd, displayCurrency, fxRates, { sign: true })}
          </p>
          <p className="num mt-1 text-sm text-muted-foreground">
            {formatUsd(result.profitUsd, { sign: true })} USD •{" "}
            {formatSol(result.profitSol, { sign: true })}
            {profitInr !== null && displayCurrency !== "INR"
              ? ` • ${formatInr(profitInr, { sign: true })}`
              : ""}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat
            label="Current Position Value"
             value={formatCurrency(result.currentUsd, displayCurrency, fxRates)}
            sub={`${formatUsd(result.currentUsd)} USD • ${formatSol(result.currentSol)}`}
          />
          <Stat
            label="Total Fees"
            value={formatSol(result.totalFeesSol)}
            sub="buy + sell, fixed"
          />

          <Stat label="ROI" value={formatPercent(result.roiPercent)} tone={tone} />
          <Stat label="Multiplier" value={`${result.multiplier.toFixed(2)}×`} />
          <Stat
            label={marketCapMetric === "fdv" ? "Current FDV" : "Current MC"}
            value={formatCompactUsd(currentMarketCap)}
          />
          <Stat label="Buy MC" value={formatCompactUsd(buyMarketCap)} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
            <SelectTrigger className="h-9 w-[118px] text-xs" aria-label="Display currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((code) => (
                <SelectItem key={code} value={code}>{code}</SelectItem>
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
          exchange account. Invested{" "}
           {formatUsd(result.initialUsd)}
           {usdInr ? ` (${formatInr(result.initialUsd * usdInr)})` : ""}.
           {feeSol > 0 ? ` Includes ${formatSol(feeSol)} in fees.` : ""}
        </p>
      </div>
    </section>
  );
}
