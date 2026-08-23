import { Copy, ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TokenData } from "@/lib/market-data.functions";
import {
  formatCompactUsd,
  formatPercent,
  formatPrice,
  shortenAddress,
  timeAgo,
} from "@/lib/profit";
import type { RefreshOption } from "@/hooks/useProfitChecker";

type Props = {
  token: TokenData;
  solPrice: number | null;
  lastUpdated: number | null;
  refreshing: boolean;
  refreshInterval: RefreshOption;
  setRefreshInterval: (v: RefreshOption) => void;
  onRefresh: () => void;
  onCopy: (v: string, label?: string) => void;
  tick: number;
};

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("num text-sm font-semibold", tone)}>{value}</span>
    </div>
  );
}

export function MarketDataCard({
  token,
  solPrice,
  lastUpdated,
  refreshing,
  refreshInterval,
  setRefreshInterval,
  onRefresh,
  onCopy,
  tick,
}: Props) {
  const change = token.priceChange24h;
  const lowLiquidity = (token.liquidityUsd ?? 0) < 5_000;

  return (
    <section className="glass rounded-3xl p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {token.name} <span className="text-muted-foreground">(${token.symbol})</span>
          </h2>
          <button
            type="button"
            onClick={() => onCopy(token.address, "Contract address copied")}
            className="num mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {shortenAddress(token.address, 6)} <Copy className="size-3" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(refreshInterval)}
            onValueChange={(v) => setRefreshInterval(Number(v) as RefreshOption)}
          >
            <SelectTrigger className="h-9 w-[150px] text-xs">
              <SelectValue placeholder="Auto Refresh" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Auto refresh: Off</SelectItem>
              <SelectItem value="30">Every 30 seconds</SelectItem>
              <SelectItem value="60">Every 60 seconds</SelectItem>
              <SelectItem value="300">Every 5 minutes</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh Now
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <Row label="Current Price" value={formatPrice(token.priceUsd)} />
        <Row
          label={token.marketCapMetric === "fdv" ? "FDV (market cap unavailable)" : "Market Cap"}
          value={formatCompactUsd(token.marketCap ?? token.fdv)}
        />
        <Row label="Liquidity" value={formatCompactUsd(token.liquidityUsd)} />
        <Row
          label="24h Change"
          value={change === null ? "—" : formatPercent(change)}
          tone={change === null ? undefined : change >= 0 ? "text-profit" : "text-loss"}
        />
        <Row label="24h Volume" value={formatCompactUsd(token.volume24h)} />
        <Row label="SOL Price" value={solPrice ? `$${solPrice.toFixed(2)}` : "—"} />
        <Row label="DEX" value={token.dexId} />
      </div>

      {token.pairCount > 1 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {token.pairCount} trading pairs found — using the deepest liquidity pair.
        </p>
      ) : null}

      {lowLiquidity ? (
        <p className="mt-3 rounded-xl border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-xs text-chart-4">
          ⚠️ Low liquidity — estimated sell value may differ significantly from displayed value.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="sm">
          <a href={token.pairUrl} target="_blank" rel="noopener noreferrer">
            View on DexScreener <ExternalLink className="size-3.5" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCopy(token.address, "Contract address copied")}
        >
          <Copy className="size-3.5" /> Copy CA
        </Button>
        <span className="num ml-auto text-xs text-muted-foreground" data-tick={tick}>
          {lastUpdated ? `Last updated: ${timeAgo(lastUpdated)}` : "—"}
        </span>
      </div>
    </section>
  );
}
