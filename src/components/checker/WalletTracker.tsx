import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getWalletTrades } from "@/lib/market-data.functions";
import type { WalletTrade } from "@/lib/market-data.types";
import {
  formatCompactUsd,
  formatInr,
  formatPrice,
  formatUsd,
  isValidSolanaAddress,
  shortenAddress,
  timeAgo,
} from "@/lib/profit";

const WALLET_KEY = "smpc:wallet:v1";

export type TrackedPosition = { ca: string; solAmount: number; buyMarketCap: number | null };

type Props = {
  usdInr: number | null;
  onTrackPosition: (position: TrackedPosition) => void;
  tick: number;
};

export function WalletTracker({ usdInr, onTrackPosition, tick }: Props) {
  const fetchTrades = useServerFn(getWalletTrades);
  const [wallet, setWallet] = useState("");
  const [trades, setTrades] = useState<WalletTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [newBuys, setNewBuys] = useState<string[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const stored = window.localStorage.getItem(WALLET_KEY);
    if (stored) setWallet(stored);
  }, []);

  const load = useCallback(
    async (address: string) => {
      if (!isValidSolanaAddress(address)) {
        setError("Enter a valid public Solana wallet address.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetchTrades({ data: { wallet: address } });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const fresh = res.trades
          .filter((t) => t.side === "BUY" && !seen.current.has(t.signature))
          .map((t) => t.signature);
        if (seen.current.size > 0 && fresh.length > 0) setNewBuys(fresh);
        res.trades.forEach((t) => seen.current.add(t.signature));
        setTrades(res.trades);
        setLastUpdated(Date.now());
        window.localStorage.setItem(WALLET_KEY, address);
      } catch {
        setError("Could not load wallet activity. Try again shortly.");
      } finally {
        setLoading(false);
      }
    },
    [fetchTrades],
  );

  useEffect(() => {
    if (!auto || trades.length === 0 || !isValidSolanaAddress(wallet)) return;
    const id = window.setInterval(() => void load(wallet), 30_000);
    return () => window.clearInterval(id);
  }, [auto, trades.length, wallet, load]);

  return (
    <section className="glass rounded-3xl p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wallet className="size-4 shrink-0 text-brand-2" /> Track Axiom Wallet
          </h2>
          <p className="text-xs text-muted-foreground">
            Public wallet address only — never a password, seed phrase or private key.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch id="wallet-auto" checked={auto} onCheckedChange={setAuto} />
          <Label htmlFor="wallet-auto" className="text-xs text-muted-foreground">
            Auto 30s
          </Label>
        </div>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(wallet.trim());
        }}
      >
        <Input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="Your public Solana wallet address"
          spellCheck={false}
          autoComplete="off"
          className="num h-11 flex-1 text-sm"
        />
        <Button type="submit" variant="secondary" className="h-11" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          <span className="hidden sm:inline">Track</span>
        </Button>
      </form>

      {error ? (
        <p className="mt-3 rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
          {error}
        </p>
      ) : null}

      {lastUpdated ? (
        <p className="num mt-3 text-[11px] text-muted-foreground" data-tick={tick}>
          Last updated {timeAgo(lastUpdated)} • {trades.length} recent trades
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {trades.map((t) => {
          const buy = t.side === "BUY";
          const pnlUp = (t.pnlUsd ?? 0) >= 0;
          const entryMc =
            t.marketCap && t.entryPriceUsd && t.currentPriceUsd
              ? (t.marketCap * t.entryPriceUsd) / t.currentPriceUsd
              : null;
          return (
            <li
              key={t.signature}
              className={cn(
                "rounded-2xl border border-border bg-secondary/35 p-3",
                newBuys.includes(t.signature) && "border-brand/60 bg-brand/10",
              )}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className={cn(
                        "num inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                        buy ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
                      )}
                    >
                      {buy ? (
                        <ArrowUpRight className="size-3" />
                      ) : (
                        <ArrowDownRight className="size-3" />
                      )}
                      {t.side}
                    </span>
                    <span className="num truncate">{t.symbol}</span>
                  </p>
                  <p className="num mt-1 text-[11px] text-muted-foreground">
                    {shortenAddress(t.mint, 5)} • {t.solAmount.toFixed(3)} SOL •{" "}
                    {t.blockTime ? timeAgo(t.blockTime * 1000) : "—"}
                  </p>
                  <p className="num mt-1 text-[11px] text-muted-foreground">
                    Entry {t.entryPriceUsd ? formatPrice(t.entryPriceUsd) : "—"} → Now{" "}
                    {t.currentPriceUsd ? formatPrice(t.currentPriceUsd) : "—"}
                    {t.marketCap ? ` • MC ${formatCompactUsd(t.marketCap)}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "num text-sm font-semibold",
                      t.pnlUsd === null
                        ? "text-muted-foreground"
                        : pnlUp
                          ? "text-profit"
                          : "text-loss",
                    )}
                  >
                    {t.pnlUsd === null ? "—" : formatInr(t.pnlUsd, usdInr, { sign: true })}
                  </p>
                  <p className="num text-[11px] text-muted-foreground">
                    {t.pnlUsd === null ? "" : formatUsd(t.pnlUsd, { sign: true })}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {buy ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      onTrackPosition({
                        ca: t.mint,
                        solAmount: t.solAmount,
                        buyMarketCap: entryMc,
                      })
                    }
                  >
                    Track This Position
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="ghost">
                  <a
                    href={`https://solscan.io/tx/${t.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Transaction <ExternalLink className="size-3" />
                  </a>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {!loading && trades.length === 0 && lastUpdated ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No recent swap activity found for this wallet.
        </p>
      ) : null}
    </section>
  );
}
