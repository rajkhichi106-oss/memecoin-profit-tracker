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

function Row({ label, value, tone }: { label: string; value: string; tone?: string | undefined }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("num text-sm font-semibold", tone)}>{value}</span>
    </div>
  );
}

const TF: { key: "m5" | "h1" | "h6" | "h24"; label: string }[] = [
  { key: "m5", label: "5m" },
  { key: "h1", label: "1h" },
  { key: "h6", label: "6h" },
  { key: "h24", label: "24h" },
];

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
  const lowLiquidity = (token.liquidityUsd ?? 0) < 5_000;

  return (
    <section className="glass rounded-2xl p-4 sm:p-5" data-tick={tick}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {token.imageUrl ? (
            <img
              src={token.imageUrl}
              alt={`${token.symbol} token logo`}
              loading="lazy"
              className="size-9 rounded-full border border-border object-cover"
            />
          ) : null}
          <div>
            <h2 className="text-base font-semibold">
              {token.name} <span className="text-muted-foreground">(${token.symbol})</span>
            </h2>
            <button
              type="button"
              onClick={() => onCopy(token.address, "Contract address copied")}
              className="num mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {shortenAddress(token.address, 6)} <Copy className="size-3" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(refreshInterval)}
            onValueChange={(v) => setRefreshInterval(Number(v) as RefreshOption)}
          >
            <SelectTrigger className="h-9 w-[142px] text-xs">
              <SelectValue placeholder="Auto Refresh" />
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
        </div>
      </div>

      {/* Price change grid */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {TF.map(({ key, label }) => {
          const v = token.priceChange[key];
          return (
            <div key={key} className="rounded-xl border border-border bg-secondary/35 px-2 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p
                className={cn(
                  "num mt-0.5 text-sm font-semibold",
                  v === null ? "" : v >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {v === null ? "—" : formatPercent(v)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Volume grid */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        {TF.map(({ key, label }) => (
          <div key={key} className="rounded-xl border border-border bg-secondary/20 px-2 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label} vol</p>
            <p className="num mt-0.5 text-xs font-semibold">
              {formatCompactUsd(token.volume[key])}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Row label="Current Price" value={formatPrice(token.priceUsd)} />
        <Row label="Market Cap" value={formatCompactUsd(token.marketCap)} />
        <Row label="FDV" value={formatCompactUsd(token.fdv)} />
        <Row label="Liquidity" value={formatCompactUsd(token.liquidityUsd)} />
        {TF.map(({ key, label }) => {
          const t = token.txns[key];
          return (
            <Row
              key={key}
              label={`${label} buys / sells`}
              value={t ? `${t.buys.toLocaleString()} / ${t.sells.toLocaleString()}` : "—"}
            />
          );
        })}
        <Row label="DEX / Pair" value={`${token.dexId} • ${token.pairLabel}`} />
        <Row label="Pair Address" value={token.pairAddress ? shortenAddress(token.pairAddress, 5) : "—"} />
        <Row label="SOL Price" value={solPrice ? `$${solPrice.toFixed(2)}` : "—"} />
      </div>

      {token.pairCount > 1 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {token.pairCount} Solana pairs found — locked to the deepest-liquidity pair for this
          session so values stay stable between refreshes.
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
        {token.websites[0] ? (
          <Button asChild variant="ghost" size="sm">
            <a href={token.websites[0]} target="_blank" rel="noopener noreferrer">
              Website <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}
        <span className="num ml-auto text-xs text-muted-foreground">
          {lastUpdated
            ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()} (${timeAgo(lastUpdated)})`
            : "—"}
        </span>
      </div>
    </section>
  );
}
