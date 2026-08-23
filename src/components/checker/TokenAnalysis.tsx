import { useState } from "react";
import { BarChart3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TokenData } from "@/lib/market-data.functions";
import { formatAge, formatCompactUsd, formatPercent } from "@/lib/profit";

export function TokenAnalysis({ token }: { token: TokenData }) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; value: string }[] = [
    { label: "Liquidity", value: formatCompactUsd(token.liquidityUsd) },
    { label: "Pair age", value: formatAge(token.pairCreatedAt) },
    { label: "24h volume", value: formatCompactUsd(token.volume24h) },
    { label: "24h price change", value: token.priceChange24h === null ? "—" : formatPercent(token.priceChange24h) },
    { label: "DEX", value: token.dexId },
    {
      label: "24h buys / sells",
      value: token.txns24h ? `${token.txns24h.buys} / ${token.txns24h.sells}` : "Not available",
    },
    { label: "Trading pairs", value: String(token.pairCount) },
    { label: "Holder count", value: "Not available from this data source" },
  ];

  return (
    <section className="glass rounded-3xl p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold sm:text-xl">Token Analysis</h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          <BarChart3 className="size-4" /> {open ? "Hide" : "Analyze Token"}
        </Button>
      </div>
      {open ? (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {rows.map((r) => (
              <div
                key={r.label}
                className="rounded-2xl border border-border bg-secondary/35 px-4 py-3"
              >
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</dt>
                <dd className="num mt-1 text-sm font-semibold">{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            This is market-data information, not financial advice.
          </p>
        </>
      ) : null}
    </section>
  );
}
