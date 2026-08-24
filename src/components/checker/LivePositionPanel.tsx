import { Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TokenData } from "@/lib/market-data.types";
import type { RefreshOption } from "@/hooks/useProfitChecker";
import {
  formatCompactUsd,
  formatInr,
  formatPercent,
  formatSol,
  formatUsd,
  timeAgo,
  type ProfitResult,
  type TargetRow,
} from "@/lib/profit";

type Props = {
  token: TokenData | null;
  result: ProfitResult | null;
  customTargetRow: TargetRow | null;
  currentMarketCap: number | null;
  buyMarketCap: number | null;
  solPrice: number | null;
  usdInr: number | null;
  lastUpdated: number | null;
  refreshing: boolean;
  refreshInterval: RefreshOption;
  setRefreshInterval: (v: RefreshOption) => void;
  onRefresh: () => void;
  tick: number;
};

function Line({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: "profit" | "loss" | undefined;

}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">
        <span
          className={cn(
            "num block text-sm font-semibold",
            tone === "profit" && "text-profit",
            tone === "loss" && "text-loss",
          )}
        >
          {value}
        </span>
        {sub ? <span className="num block text-[11px] text-muted-foreground">{sub}</span> : null}
      </span>
    </div>
  );
}

export function LivePositionPanel({
  token,
  result,
  customTargetRow,
  currentMarketCap,
  buyMarketCap,
  solPrice,
  usdInr,
  lastUpdated,
  refreshing,
  refreshInterval,
  setRefreshInterval,
  onRefresh,
  tick,
}: Props) {
  const up = (result?.profitUsd ?? 0) >= 0;
  const tone = up ? "profit" : "loss";

  return (
    <aside className="lg:sticky lg:top-6">
      <div className="glass relative overflow-hidden rounded-3xl p-5">
        <div
          className={cn(
            "pointer-events-none absolute -top-20 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full blur-3xl",
            result ? (up ? "bg-profit/20" : "bg-loss/20") : "bg-brand/15",
          )}
        />
        <div className="relative">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Live Position</p>
              <p className="num truncate text-sm font-semibold">
                {token ? `${token.symbol} • ${token.name}` : "No token loaded"}
              </p>
            </div>
            {result ? (
              <span
                className={cn(
                  "num inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                  up ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
                )}
              >
                {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {formatPercent(result.roiPercent)}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Profit / Loss (INR)
            </p>
            <p
              className={cn(
                "num mt-1 text-3xl font-bold sm:text-4xl",
                result ? (up ? "text-profit" : "text-loss") : "text-muted-foreground",
              )}
            >
              {result ? formatInr(result.profitUsd, usdInr, { sign: true }) : "₹—"}
            </p>
            <p className="num text-sm text-muted-foreground">
              {result ? `${formatUsd(result.profitUsd, { sign: true })} USD` : "Enter your trade"}
            </p>
          </div>

          <div className="mt-4">
            <Line
              label="Current MC"
              value={formatCompactUsd(currentMarketCap)}
              sub={
                token?.marketCapMetric === "fdv" ? "FDV (market cap unavailable)" : "live from DEX"
              }
            />
            <Line
              label="Current Value"
              value={result ? formatInr(result.currentUsd, usdInr) : "—"}
              sub={result ? `${formatUsd(result.currentUsd)} USD` : undefined}
            />
            <Line
              label="Profit / Loss"
              value={result ? formatInr(result.profitUsd, usdInr, { sign: true }) : "—"}
              sub={result ? formatUsd(result.profitUsd, { sign: true }) : undefined}
              {...(result ? { tone } : {})}
            />
            <Line
              label="ROI"
              value={result ? formatPercent(result.roiPercent) : "—"}
              {...(result ? { tone } : {})}
            />
            <Line
              label="Position in SOL"
              value={result ? formatSol(result.currentSol) : "—"}
              sub={result ? `${result.multiplier.toFixed(2)}× from buy MC` : undefined}
            />
            <Line
              label="Buy MC"
              value={formatCompactUsd(buyMarketCap)}
              sub={solPrice ? `SOL $${solPrice.toFixed(2)}` : undefined}
            />
            {customTargetRow ? (
              <Line
                label={`At ${formatCompactUsd(customTargetRow.targetMarketCap)}`}
                value={formatInr(customTargetRow.currentUsd, usdInr)}
                sub={`${formatUsd(customTargetRow.currentUsd)} • ${formatPercent(customTargetRow.roiPercent)}`}
              />
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Select
              value={String(refreshInterval)}
              onValueChange={(v) => setRefreshInterval(Number(v) as RefreshOption)}
            >
              <SelectTrigger className="h-9 w-[148px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Auto refresh: Off</SelectItem>
                <SelectItem value="30">Every 30 seconds</SelectItem>
                <SelectItem value="60">Every 60 seconds</SelectItem>
                <SelectItem value="300">Every 5 minutes</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing || !token}>
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
            <span className="num ml-auto text-[11px] text-muted-foreground" data-tick={tick}>
              {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : "—"}
            </span>
          </div>

          {usdInr ? (
            <p className="num mt-3 text-[11px] text-muted-foreground">
              Live rate: 1 USD = ₹{usdInr.toFixed(2)}
              {solPrice ? ` • 1 SOL = ₹${(solPrice * usdInr).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : ""}
            </p>
          ) : (
            <p className="mt-3 text-[11px] text-muted-foreground">Fetching live INR rate…</p>
          )}
        </div>
      </div>
    </aside>
  );
}
