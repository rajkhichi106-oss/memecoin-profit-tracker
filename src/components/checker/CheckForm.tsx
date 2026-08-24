import { ClipboardPaste, Loader2, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCompactUsd, formatSol, isValidSolanaAddress } from "@/lib/profit";
import type { AmountUnit } from "@/hooks/useProfitChecker";

const QUICK_MCS: { label: string; value: string }[] = [
  { label: "$10K", value: "10K" },
  { label: "$25K", value: "25K" },
  { label: "$50K", value: "50K" },
  { label: "$100K", value: "100K" },
  { label: "$250K", value: "250K" },
  { label: "$500K", value: "500K" },
  { label: "$1M", value: "1M" },
];

type Props = {
  ca: string;
  setCa: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  amountUnit: AmountUnit;
  setAmountUnit: (v: AmountUnit) => void;
  buyMcInput: string;
  setBuyMcInput: (v: string) => void;
  buyMarketCap: number | null;
  customTarget: string;
  setCustomTarget: (v: string) => void;
  solInvested: number | null;
  solPrice: number | null;
  usdInr: number | null;
  loading: boolean;
  error: string | null;
  onCheck: () => void;
  onPaste: () => void;
};


export function CheckForm({
  ca,
  setCa,
  amount,
  setAmount,
  amountUnit,
  setAmountUnit,
  buyMcInput,
  setBuyMcInput,
  buyMarketCap,
  solInvested,
  solPrice,
  loading,
  error,
  onCheck,
  onPaste,
}: Props) {
  const caInvalid = ca.trim().length > 0 && !isValidSolanaAddress(ca);

  return (
    <section id="checker" className="glass rounded-3xl p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold sm:text-xl">Check Your Memecoin Profit</h2>
        <span className="num rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
          SOL Price: {solPrice ? `$${solPrice.toFixed(2)}` : "loading…"}
        </span>
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          onCheck();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="ca">Solana Contract Address</Label>
          <div className="flex gap-2">
            <Input
              id="ca"
              value={ca}
              onChange={(e) => setCa(e.target.value)}
              placeholder="Paste token CA"
              spellCheck={false}
              autoComplete="off"
              className="num h-12 flex-1 text-sm"
            />
            <Button type="button" variant="secondary" className="h-12 px-3" onClick={onPaste}>
              <ClipboardPaste className="size-4" />
              <span className="hidden sm:inline">Paste</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {caInvalid ? (
              <span className="text-loss">That doesn't look like a valid Solana address.</span>
            ) : (
              <>Example: 6bnmecEMPS2iZaxCKuKDNQFvN6NM3kQ1h7MhouNJpump</>
            )}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount Invested</Label>
            <div className="flex gap-2">
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={amountUnit === "SOL" ? "0.54" : "120"}
                className="num h-12 flex-1"
              />
              <Select value={amountUnit} onValueChange={(v) => setAmountUnit(v as AmountUnit)}>
                <SelectTrigger className="h-12 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOL">SOL</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="num text-xs text-muted-foreground">
              {amountUnit === "USD" && solInvested
                ? `≈ ${formatSol(solInvested)} at current SOL price`
                : solInvested
                  ? `≈ $${(solInvested * (solPrice ?? 0)).toFixed(2)} invested`
                  : "Enter the amount you put in"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="buymc">Buy Market Cap</Label>
            <Input
              id="buymc"
              value={buyMcInput}
              onChange={(e) => setBuyMcInput(e.target.value)}
              placeholder="53K"
              className="num h-12"
            />
            <p className="num text-xs text-muted-foreground">
              {buyMarketCap ? `= ${formatCompactUsd(buyMarketCap)}` : "Accepts 53K, 52.7K, 1.2M"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_MCS.map((q) => (
            <button
              key={q.value}
              type="button"
              onClick={() => setBuyMcInput(q.value)}
              className="num rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/60 hover:text-foreground"
            >
              {q.label}
            </button>
          ))}
        </div>

        <Button type="submit" size="lg" disabled={loading} className="h-14 w-full text-base">
          {loading ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Fetching live market data...
            </>
          ) : (
            <>
              <Rocket className="size-5" /> Check My Profit
            </>
          )}
        </Button>

        {error ? (
          <p className="rounded-xl border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
