import { Bug, CheckCircle2, CircleAlert, CircleDashed, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TokenData } from "@/lib/market-data.functions";
import { formatCompactUsd, isValidSolanaAddress } from "@/lib/profit";
import type { RefreshOption } from "@/hooks/useProfitChecker";
import { cn } from "@/lib/utils";

type State = "ok" | "warn" | "error" | "pending";

type Props = {
  ca: string;
  amount: string;
  amountUnit: "SOL" | "USD";
  buyMcInput: string;
  buyMcUnit: "K" | "M" | "B";
  token: TokenData | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: number | null;
  refreshInterval: RefreshOption;
  solPrice: number | null;
  usdInr: number | null;
  solInvested: number | null;
  buyMarketCap: number | null;
  currentMarketCap: number | null;
  calculationReady: boolean;
};

function DiagnosticRow({
  label,
  value,
  state = "pending",
}: {
  label: string;
  value: string;
  state?: State;
}) {
  const Icon =
    state === "ok"
      ? CheckCircle2
      : state === "error"
        ? CircleAlert
        : state === "pending"
          ? CircleDashed
          : CircleAlert;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="inline-flex max-w-[17rem] items-start gap-1.5 text-right text-xs font-medium">
        {state === "pending" && value.toLowerCase().includes("looking") ? (
          <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-chart-3" />
        ) : (
          <Icon
            className={cn(
              "mt-0.5 size-3.5 shrink-0",
              state === "ok" && "text-profit",
              state === "warn" && "text-chart-4",
              state === "error" && "text-loss",
              state === "pending" && "text-muted-foreground",
            )}
          />
        )}
        <span className="break-all">{value}</span>
      </span>
    </div>
  );
}

export function DiagnosticsDialog({
  ca,
  amount,
  amountUnit,
  buyMcInput,
  buyMcUnit,
  token,
  loading,
  refreshing,
  error,
  lastUpdated,
  refreshInterval,
  solPrice,
  usdInr,
  solInvested,
  buyMarketCap,
  currentMarketCap,
  calculationReady,
}: Props) {
  const address = ca.trim();
  const addressValid = isValidSolanaAddress(address);
  const tokenMatches = Boolean(token && token.address.toLowerCase() === address.toLowerCase());
  const hasMarketCap = Boolean(token?.marketCap ?? token?.fdv);
  const lookupState: State = !address
    ? "pending"
    : !addressValid
      ? "error"
      : tokenMatches
        ? "ok"
        : error
          ? "error"
          : loading
            ? "pending"
            : "pending";
  const lookupValue = !address
    ? "Enter a token address to begin"
    : !addressValid
      ? "Invalid Solana token address; no lookup should be made"
      : tokenMatches
        ? `${token?.name ?? "Token"} (${token?.symbol ?? "—"}) · address verified`
        : error
          ? error
          : loading
            ? "Looking up token on DEX Screener"
            : "Waiting for token lookup";

  const marketValue = tokenMatches
    ? `${formatCompactUsd(token?.marketCap)} market cap${token?.marketCapMetric === "fdv" ? " (using FDV)" : ""}`
    : "No token market data loaded";
  const marketState: State = tokenMatches
    ? hasMarketCap
      ? "ok"
      : "warn"
    : error
      ? "error"
      : "pending";
  const calculationValue = calculationReady
    ? "Ready — live profit calculation available"
    : [
        !addressValid ? "valid token address" : null,
        !amount.trim() || !solInvested ? "investment amount" : null,
        !buyMarketCap ? "buy market cap" : null,
        !currentMarketCap ? "current market cap" : null,
        !solPrice ? "SOL/USD rate" : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join(" · ") || "Waiting for required values";

  const endpoint = tokenMatches && token?.pairAddress
    ? `https://api.dexscreener.com/latest/dex/pairs/solana/${token.pairAddress}`
    : `https://api.dexscreener.com/tokens/v1/solana/${address || "{tokenAddress}"}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="h-11 px-4 text-sm">
          <Bug className="size-4" /> Debug
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Diagnostics</DialogTitle>
          <DialogDescription>
            Current token lookup, market feed, and calculation status.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y-0 rounded-md border border-border bg-secondary/20 px-3">
          <DiagnosticRow
            label="Token address"
            value={address ? (addressValid ? "Valid Solana address" : "Invalid Solana address") : "Not entered"}
            state={!address ? "pending" : addressValid ? "ok" : "error"}
          />
          <DiagnosticRow label="Token lookup" value={lookupValue} state={lookupState} />
          <DiagnosticRow label="Market data" value={marketValue} state={marketState} />
          <DiagnosticRow
            label="Trading pair"
            value={tokenMatches ? `${token?.dexId} · ${token?.pairLabel} · ${token?.pairAddress || "no pair address"}` : "No selected pair"}
            state={tokenMatches ? "ok" : "pending"}
          />
          <DiagnosticRow
            label="Liquidity"
            value={tokenMatches ? formatCompactUsd(token?.liquidityUsd) : "Unavailable"}
            state={tokenMatches && token?.liquidityUsd ? "ok" : "warn"}
          />
          <DiagnosticRow
            label="Profit calculation"
            value={calculationValue}
            state={calculationReady ? "ok" : error ? "error" : "warn"}
          />
          <DiagnosticRow
            label="SOL price"
            value={solPrice ? `$${solPrice.toFixed(4)} USD` : "Unavailable"}
            state={solPrice ? "ok" : "warn"}
          />
          <DiagnosticRow
            label="USD/INR rate"
            value={usdInr ? `₹${usdInr.toFixed(4)} per USD` : "Unavailable"}
            state={usdInr ? "ok" : "warn"}
          />
          <DiagnosticRow
            label="Last market update"
            value={lastUpdated ? new Date(lastUpdated).toLocaleString() : "No successful update yet"}
            state={lastUpdated ? "ok" : "pending"}
          />
          <DiagnosticRow
            label="Refresh status"
            value={refreshing ? "Refreshing now" : loading ? "Loading token data" : refreshInterval ? `Every ${refreshInterval}s` : "Automatic refresh off"}
            state={refreshing || loading ? "pending" : "ok"}
          />
          <DiagnosticRow
            label="Investment inputs"
            value={`${amount || "—"} ${amountUnit} invested · ${buyMcInput || "—"}${buyMcUnit} entry cap`}
            state={amount.trim() && buyMarketCap ? "ok" : "warn"}
          />
          <DiagnosticRow label="Latest lookup endpoint" value={endpoint} />
        </div>

        {error ? (
          <p className="rounded-md border border-loss/35 bg-loss/10 px-3 py-2 text-xs text-loss">
            Latest issue: {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}