import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCompactUsd, formatUsd, shortenAddress, timeAgo } from "@/lib/profit";
import type { HistoryEntry } from "@/lib/history";

type Props = {
  history: HistoryEntry[];
  onClear: () => void;
  tick: number;
};

export function RecentChecks({ history, onClear, tick }: Props) {
  if (history.length === 0) return null;

  return (
    <section className="glass rounded-3xl p-5 sm:p-7" data-tick={tick}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold sm:text-xl">Recent Checks</h2>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Trash2 className="size-4" /> Clear History
        </Button>
      </div>
      <ul className="mt-4 space-y-2">
        {history.map((h) => (
          <li
            key={h.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-secondary/35 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="num truncate text-sm font-semibold">
                {h.symbol} <span className="text-muted-foreground">• {shortenAddress(h.ca)}</span>
              </p>
              <p className="num text-xs text-muted-foreground">
                Buy: {formatCompactUsd(h.buyMarketCap)} → Now: {formatCompactUsd(h.currentMarketCap)}{" "}
                • {h.solInvested.toFixed(3)} SOL • {timeAgo(h.checkedAt)}
              </p>
            </div>
            <div className="num text-right">
              <p className="text-sm font-semibold">{formatUsd(h.currentUsd)}</p>
              <p className={cn("text-xs", h.profitUsd >= 0 ? "text-profit" : "text-loss")}>
                {formatUsd(h.profitUsd, { sign: true })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
