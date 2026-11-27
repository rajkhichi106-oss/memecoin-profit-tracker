import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getRugCheck, type RugChainData } from "@/lib/rugcheck.functions";
import type { TokenData } from "@/lib/market-data.functions";
import { formatCompactUsd, formatAge, shortenAddress } from "@/lib/profit";
import { cn } from "@/lib/utils";

type Level = "good" | "warn" | "bad" | "info";
type Row = { label: string; value: string; level: Level };

const TONE: Record<Level, string> = {
  good: "text-profit",
  warn: "text-chart-4",
  bad: "text-loss",
  info: "text-muted-foreground",
};
const DOT: Record<Level, string> = {
  good: "bg-profit",
  warn: "bg-chart-4",
  bad: "bg-loss",
  info: "bg-muted-foreground",
};

function buildRows(chain: RugChainData, token: TokenData): Row[] {
  const rows: Row[] = [];
  rows.push(
    chain.mintAuthority
      ? { label: "Mint authority", value: "Active — more tokens can be minted", level: "bad" }
      : { label: "Mint authority", value: "Renounced", level: "good" },
  );
  rows.push(
    chain.freezeAuthority
      ? { label: "Freeze authority", value: "Active — wallets can be frozen", level: "bad" }
      : { label: "Freeze authority", value: "Renounced", level: "good" },
  );
  for (const e of chain.extensions) {
    rows.push({ label: e.name, value: e.detail, level: e.level === "info" ? "info" : e.level });
  }

  const wallets = chain.holders.filter((h) => h.kind === "wallet");
  const top1 = wallets[0]?.pct ?? 0;
  const top10 = wallets.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  rows.push({
    label: "Largest wallet holder",
    value: `${top1.toFixed(1)}% of supply`,
    level: top1 > 25 ? "bad" : top1 > 10 ? "warn" : "good",
  });
  rows.push({
    label: "Top 10 wallets",
    value: `${top10.toFixed(1)}% of supply`,
    level: top10 > 60 ? "bad" : top10 > 40 ? "warn" : "good",
  });

  const liq = token.liquidityUsd;
  const mc = token.marketCap ?? token.fdv;
  if (liq !== null) {
    const ratio = mc ? (liq / mc) * 100 : null;
    rows.push({
      label: "Liquidity",
      value: `${formatCompactUsd(liq)}${ratio !== null ? ` (${ratio.toFixed(1)}% of MC)` : ""}`,
      level: liq < 5_000 ? "bad" : liq < 15_000 || (ratio !== null && ratio < 5) ? "warn" : "good",
    });
  }
  if (token.pairCreatedAt) {
    const hours = (Date.now() - token.pairCreatedAt) / 3_600_000;
    rows.push({
      label: "Pair age",
      value: formatAge(token.pairCreatedAt),
      level: hours < 1 ? "warn" : "good",
    });
  }
  return rows;
}

export function RugCheck({ token }: { token: TokenData }) {
  const [chain, setChain] = useState<RugChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRugCheck({ data: { mint: token.address } });
      if (res.ok) setChain(res.data);
      else {
        setChain(null);
        setError(res.error);
      }
    } catch {
      setChain(null);
      setError("Rug check failed. Try again.");
    } finally {
      setLoading(false);
    }
  }, [token.address]);

  useEffect(() => {
    setChain(null);
    void run();
  }, [run]);

  const rows = chain ? buildRows(chain, token) : [];
  const worst: Level = rows.some((r) => r.level === "bad")
    ? "bad"
    : rows.some((r) => r.level === "warn")
      ? "warn"
      : "good";
  const verdict = { good: "Low risk", warn: "Medium risk", bad: "High risk", info: "" }[worst];
  const Icon = worst === "bad" ? ShieldAlert : worst === "warn" ? ShieldQuestion : ShieldCheck;

  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Rug check</h2>
        <div className="flex items-center gap-2">
          {chain ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-xs font-bold",
                TONE[worst],
              )}
            >
              <Icon className="size-4" /> {verdict}
            </span>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void run()}
            disabled={loading}
            aria-label="Re-run rug check"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {loading && !chain ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking on-chain data…
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-xs text-chart-4">
          {error}
        </p>
      ) : null}

      {chain ? (
        <>
          <ul className="mt-4 divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className={cn("size-2 shrink-0 rounded-full", DOT[r.level])} />
                  {r.label}
                </span>
                <span className={cn("num text-right font-medium", TONE[r.level])}>{r.value}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs font-medium text-muted-foreground">Top holders</p>
          <ul className="mt-2 space-y-1.5">
            {chain.holders.slice(0, 6).map((h) => (
              <li key={h.tokenAccount} className="flex items-center gap-3 text-xs">
                <span className="num w-24 shrink-0 text-muted-foreground">
                  {shortenAddress(h.owner)}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      h.kind === "pool" ? "bg-chart-3" : "bg-chart-1",
                    )}
                    style={{ width: `${Math.min(100, h.pct)}%` }}
                  />
                </span>
                <span className="num w-14 shrink-0 text-right">{h.pct.toFixed(1)}%</span>
                <span className="w-10 shrink-0 text-muted-foreground">
                  {h.kind === "pool" ? "pool" : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            On-chain checks only, via FluxRPC. "Pool" marks program-owned accounts such as liquidity
            vaults, which are excluded from wallet-concentration figures. A passing result does not
            guarantee a token is safe.
          </p>
        </>
      ) : null}
    </section>
  );
}
