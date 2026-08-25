import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getWalletTrades, type WalletTrade } from "@/lib/market-data.functions";
import {
  formatCompactUsd,
  formatInr,
  formatPercent,
  formatPrice,
  formatUsd,
  isValidSolanaAddress,
  shortenAddress,
  timeAgo,
} from "@/lib/profit";

const STORAGE_KEY = "smpc:axiom-wallet";

type Props = {
  usdInr: number | null;
  onTrack: (trade: WalletTrade) => void;
  tick: number;
};

export function WalletTracker({ usdInr, onTrack, tick }: Props) {
  const fetchTrades = useServerFn(getWalletTrades);
  const [wallet, setWallet] = useState("");
  const [active, setActive] = useState("");
  const [trades, setTrades] = useState<WalletTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const [newBuys, setNewBuys] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setWallet(saved);
  }, []);

  const load = useCallback(
    async (address: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchTrades({ data: { wallet: address, limit: 12 } });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const fresh = res.trades.filter((t) => t.side === "BUY" && !seen.current.has(t.signature));
        if (seen.current.size > 0 && fresh.length > 0) setNewBuys((n) => n + fresh.length);
        res.trades.forEach((t) => seen.current.add(t.signature));
        setTrades(res.trades);
        setLastUpdated(Date.now());
      } catch {
        setError("Could not load wallet activity. Try again shortly.");
      } finally {
        setLoading(false);
      }
    },
    [fetchTrades],
  );

  const start = () => {
    const address = wallet.trim();
    if (!isValidSolanaAddress(address)) {
      setError("Enter a valid public Solana wallet address.");
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, address);
    seen.current = new Set();
    setNewBuys(0);
    setActive(address);
    void load(address);
  };

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => void load(active), 30_000);
    return () => window.clearInterval(id);
  }, [active, load]);

  return (
    <section className="glass rounded-2xl p-4 sm:p-5" data-tick={tick}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <Wallet className="size-4 shrink-0 text-brand-2" />
          <span className="truncate">Track Axiom Wallet</span>
        </h2>
        {active ? (
          <Button variant="secondary" size="sm" onClick={() => void load(active)} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh
          </Button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        <Label htmlFor="wallet">Public Solana wallet address</Label>
        <div className="flex gap-2">
          <Input
            id="wallet"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Your Axiom wallet public address"
            spellCheck={false}
            autoComplete="off"
            className="num h-11 flex-1 text-sm"
          />
          <Button type="button" className="h-11" onClick={start} disabled={loading}>
            {loading && !active ? <Loader2 className="size-4 animate-spin" /> : null}
            Track
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Public address only — never enter a password, seed phrase or private key. Auto-refreshes
          every 30 seconds.
        </p>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
          {error}
        </p>
      ) : null}

      {active ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="num">Watching {shortenAddress(active, 6)}</span>
            {lastUpdated ? <span className="num">• updated {timeAgo(lastUpdated)}</span> : null}
            {newBuys > 0 ? (
              <span className="rounded-full bg-profit/15 px-2 py-0.5 font-semibold text-profit">
                {newBuys} new buy{newBuys === 1 ? "" : "s"} detected
              </span>
            ) : null}
          </div>

          {trades.length === 0 && !loading ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No recent token swaps found for this wallet.
            </p>
          ) : null}

          <ul className="mt-3 space-y-2">
            {trades.map((t) => {
              const up = (t.pnlUsd ?? 0) >= 0;
              return (
                <li
                  key={t.signature}
                  className="rounded-xl border border-border bg-secondary/35 px-3 py-3"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span
                          className={cn(
                            "num inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                            t.side === "BUY"
                              ? "bg-profit/15 text-profit"
                              : "bg-loss/15 text-loss",
                          )}
                        >
                          {t.side === "BUY" ? (
                            <ArrowUpRight className="size-3" />
                          ) : (
                            <ArrowDownRight className="size-3" />
                          )}
                          {t.side}
                        </span>
                        <span className="truncate">{t.symbol}</span>
                      </p>
                      <p className="num mt-1 truncate text-[11px] text-muted-foreground">
                        {shortenAddress(t.mint, 5)} • {t.solAmount.toFixed(3)} SOL •{" "}
                        {t.blockTime ? timeAgo(t.blockTime * 1000) : "—"}
                      </p>
                      <p className="num mt-1 text-[11px] text-muted-foreground">
                        Entry {t.entryPriceUsd ? formatPrice(t.entryPriceUsd) : "—"} → Now{" "}
                        {t.currentPriceUsd ? formatPrice(t.currentPriceUsd) : "—"}
                        {t.marketCap ? ` • MC ${formatCompactUsd(t.marketCap)}` : ""}
                      </p>
                    </div>
                    <div className="num shrink-0 text-right">
                      {t.pnlUsd !== null ? (
                        <>
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              up ? "text-profit" : "text-loss",
                            )}
                          >
                            {usdInr
                              ? formatInr(t.pnlUsd * usdInr, { sign: true })
                              : formatUsd(t.pnlUsd, { sign: true })}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatUsd(t.pnlUsd, { sign: true })}
                            {t.pnlPercent !== null ? ` • ${formatPercent(t.pnlPercent)}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">P&L n/a</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {t.side === "BUY" ? (
                      <Button size="sm" variant="secondary" onClick={() => onTrack(t)}>
                        Track This Position
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="ghost">
                      <a href={t.txUrl} target="_blank" rel="noopener noreferrer">
                        Transaction <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
