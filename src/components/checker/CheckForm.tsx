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
import { formatCompactUsd, formatSol, isValidSolanaAddress, parseCompactNumber } from "@/lib/profit";
import type { AmountUnit, MarketCapUnit } from "@/hooks/useProfitChecker";

const QUICK_MCS: { label: string; value: string; unit: MarketCapUnit }[] = [
  { label: "$10K", value: "10", unit: "K" },
  { label: "$25K", value: "25", unit: "K" },
  { label: "$50K", value: "50", unit: "K" },
  { label: "$100K", value: "100", unit: "K" },
  { label: "$250K", value: "250", unit: "K" },
  { label: "$500K", value: "500", unit: "K" },
  { label: "$1M", value: "1", unit: "M" },
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
  buyMcUnit: MarketCapUnit;
  setBuyMcUnit: (v: MarketCapUnit) => void;
  customTarget: string;
  setCustomTarget: (v: string) => void;
  priorityFee: string;
  setPriorityFee: (v: string) => void;
  bribeFee: string;
  setBribeFee: (v: string) => void;
  buyMarketCap: number | null;
  solInvested: number | null;
  solPrice: number | null;
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
  buyMcUnit,
  setBuyMcUnit,
  customTarget,
  setCustomTarget,
  priorityFee,
  setPriorityFee,
  bribeFee,
  setBribeFee,
  buyMarketCap,
  solInvested,
  solPrice,
  loading,
  error,
  onCheck,
  onPaste,
}: Props) {
  const caInvalid = ca.trim().length > 0 && !isValidSolanaAddress(ca);
  const targetMc = parseCompactNumber(customTarget);

  return (
    <section id="checker" className="glass rounded-2xl p-4 sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="truncate text-base font-semibold sm:text-lg">Trade Inputs</h2>
        <span className="num shrink-0 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground">
          SOL {solPrice ? `$${solPrice.toFixed(2)}` : "…"}
        </span>
      </div>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onCheck();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="ca">Solana Contract Address</Label>
          <div className="flex gap-2">
            <Input
              id="ca"
              value={ca}
              onChange={(e) => setCa(e.target.value)}
              placeholder="Paste token CA"
              spellCheck={false}
              autoComplete="off"
              className="num h-11 flex-1 text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-11 px-3"
              onClick={onPaste}
              aria-label="Paste Solana contract address"
            >
              <ClipboardPaste className="size-4" />
              <span className="hidden sm:inline">Paste</span>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {caInvalid ? (
              <span className="text-loss">That doesn't look like a valid Solana address.</span>
            ) : (
              <>Example: 6bnmecEMPS2iZaxCKuKDNQFvN6NM3kQ1h7MhouNJpump</>
            )}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="amount">Investment</Label>
          <div className="flex gap-2">
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={amountUnit === "SOL" ? "0.54" : "120"}
              className="num h-11 flex-1"
            />
            <Select value={amountUnit} onValueChange={(v) => setAmountUnit(v as AmountUnit)}>
              <SelectTrigger className="h-11 w-[92px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SOL">SOL</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="num text-[11px] text-muted-foreground">
            {amountUnit === "USD" && solInvested
              ? `≈ ${formatSol(solInvested)} at current SOL price`
              : solInvested
                ? `≈ $${(solInvested * (solPrice ?? 0)).toFixed(2)} invested`
                : "Amount you put into the trade"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="buymc">Buy Market Cap</Label>
             <div className="flex gap-2">
               <Input
                 id="buymc"
                 value={buyMcInput}
                 onChange={(e) => setBuyMcInput(e.target.value)}
                 placeholder="53"
                 className="num h-11 flex-1"
               />
               <Select value={buyMcUnit} onValueChange={(v) => setBuyMcUnit(v as MarketCapUnit)}>
                 <SelectTrigger className="h-11 w-[78px]">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="K">K</SelectItem>
                   <SelectItem value="M">M</SelectItem>
                   <SelectItem value="B">B</SelectItem>
                 </SelectContent>
               </Select>
             </div>
            <p className="num text-[11px] text-muted-foreground">
               {buyMarketCap ? `= ${formatCompactUsd(buyMarketCap)}` : "Choose K, M or B"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-target">Target Market Cap</Label>
            <Input
              id="custom-target"
              value={customTarget}
              onChange={(e) => setCustomTarget(e.target.value)}
              placeholder="750K"
              className="num h-11"
            />
            <p className="num text-[11px] text-muted-foreground">
              {targetMc ? `= ${formatCompactUsd(targetMc)}` : "Optional — your exit goal"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_MCS.map((q) => (
            <button
              key={q.value}
              type="button"
               onClick={() => {
                 setBuyMcInput(q.value);
                 setBuyMcUnit(q.unit as MarketCapUnit);
               }}
              className="num rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/60 hover:text-foreground"
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="priority-fee">Priority Fee (SOL)</Label>
            <Input
              id="priority-fee"
              inputMode="decimal"
              value={priorityFee}
              onChange={(e) => setPriorityFee(e.target.value)}
              placeholder="0.00"
              className="num h-11"
            />
            <p className="num text-[11px] text-muted-foreground">Optional network fee</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bribe-fee">Bribe Fee (SOL)</Label>
            <Input
              id="bribe-fee"
              inputMode="decimal"
              value={bribeFee}
              onChange={(e) => setBribeFee(e.target.value)}
              placeholder="0.00"
              className="num h-11"
            />
            <p className="num text-[11px] text-muted-foreground">Optional validator / tip fee</p>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={loading} className="h-12 w-full text-sm">
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
          <p className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
