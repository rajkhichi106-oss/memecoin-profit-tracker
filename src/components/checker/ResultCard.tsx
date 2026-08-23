import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatCompactUsd,
  formatPercent,
  formatSol,
  formatUsd,
  type ProfitResult,
} from "@/lib/profit";

type Props = {
  result: ProfitResult;
  currentMarketCap: number;
  buyMarketCap: number;
  marketCapMetric: "marketCap" | "fdv" | "none";
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/35 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num mt-1 text-lg font-semibold sm:text-xl",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ResultCard({ result, currentMarketCap, buyMarketCap, marketCapMetric }: Props) {
  const up = result.profitUsd >= 0;
  const tone = up ? "profit" : "loss";

  return (
    <section className="glass relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <div
        className={cn(
          "pointer-events-none absolute -top-24 left-1/2 h-48 w-3/4 -translate-x-1/2 rounded-full blur-3xl",
          up ? "bg-profit/20" : "bg-loss/20",
        )}
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Your Position
          </h2>
          <span
            className={cn(
              "num inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
              up ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
            )}
          >
            {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {formatPercent(result.roiPercent)}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Value</p>
          <p className="num mt-1 text-4xl font-bold sm:text-5xl">{formatUsd(result.currentUsd)}</p>
          <p className={cn("num mt-1 text-lg font-semibold", up ? "text-profit" : "text-loss")}>
            {formatUsd(result.profitUsd, { sign: true })} ({formatSol(result.profitSol, { sign: true })})
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Profit" value={formatUsd(result.profitUsd, { sign: true })} tone={tone} />
          <Stat label="ROI" value={formatPercent(result.roiPercent)} tone={tone} />
          <Stat label="Value in SOL" value={formatSol(result.currentSol)} />
          <Stat
            label={marketCapMetric === "fdv" ? "Current FDV" : "Market Cap"}
            value={formatCompactUsd(currentMarketCap)}
          />
          <Stat label="Buy Market Cap" value={formatCompactUsd(buyMarketCap)} />
          <Stat label="Multiplier" value={`${result.multiplier.toFixed(2)}×`} />
        </div>

        <p className="num mt-4 text-xs text-muted-foreground">
          Invested {formatUsd(result.initialUsd)} • estimated using market-cap movement, not a live
          sell quote.
        </p>
      </div>
    </section>
  );
}
