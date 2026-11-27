import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CheckForm } from "@/components/checker/CheckForm";
import { DiagnosticsDialog } from "@/components/checker/DiagnosticsDialog";
import { MarketDataCard } from "@/components/checker/MarketDataCard";
import { PotentialChart } from "@/components/checker/PotentialChart";
import { RecentChecks } from "@/components/checker/RecentChecks";
import { ResultCard } from "@/components/checker/ResultCard";
import { TargetSection } from "@/components/checker/TargetSection";
import { TokenAnalysis } from "@/components/checker/TokenAnalysis";
import { WalletTracker } from "@/components/checker/WalletTracker";
import { useProfitChecker } from "@/hooks/useProfitChecker";
import { formatInr } from "@/lib/profit";

const TITLE = "Solana Memecoin Profit Checker — Live INR P/L & Target Calculator";
const DESCRIPTION =
  "Paste a Solana contract address, enter your SOL investment and buy market cap, and track live profit in INR, ROI and target market-cap values.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://memcoin-profit-tracker.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://memcoin-profit-tracker.lovable.app/" }],
  }),
  component: Index,
});

function Index() {
  return <CheckerPage />;
}

function CheckerPage() {
  const c = useProfitChecker();
  const [tick, setTick] = useState(0);

  // Drives the "updated x ago" labels.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-brand" aria-hidden="true" />
          <div>
            <h1 className="font-display text-lg font-extrabold leading-tight tracking-tight">
              Profit Pal
            </h1>
            <p className="text-xs text-muted-foreground">Solana memecoin profit checker</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="num inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-3.5 py-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-profit shadow-[0_0_10px_var(--color-profit)]" />
            {c.solPrice && c.usdInr
              ? `Live · 1 SOL = ${formatInr(c.solPrice * c.usdInr)} · $${c.solPrice.toFixed(2)}`
              : "Loading live SOL price…"}
          </span>
          <div
            role="group"
            aria-label="Display currency"
            className="flex rounded-full border border-border bg-white/5 p-1 text-xs font-semibold"
          >
            {["INR", "USD", "SOL"].map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={c.displayCurrency === code}
                onClick={() => c.setDisplayCurrency(code)}
                className={
                  c.displayCurrency === code
                    ? "rounded-full bg-gradient-brand px-4 py-1.5 text-primary-foreground"
                    : "rounded-full px-4 py-1.5 text-muted-foreground hover:text-foreground"
                }
              >
                {code}
              </button>
            ))}
          </div>
          <DiagnosticsDialog
            ca={c.ca}
            amount={c.amount}
            amountUnit={c.amountUnit}
            buyMcInput={c.buyMcInput}
            buyMcUnit={c.buyMcUnit}
            token={c.token}
            loading={c.loading}
            refreshing={c.refreshing}
            error={c.error}
            lastUpdated={c.lastUpdated}
            refreshInterval={c.refreshInterval}
            solPrice={c.solPrice}
            usdInr={c.usdInr}
            solInvested={c.solInvested}
            buyMarketCap={c.buyMarketCap}
            currentMarketCap={c.currentMarketCap}
            calculationReady={Boolean(c.result)}
          />
        </div>
      </header>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
        {/* Left: position form + token */}
        <div className="space-y-5">
          <CheckForm
            ca={c.ca}
            setCa={c.setCa}
            amount={c.amount}
            setAmount={c.setAmount}
            amountUnit={c.amountUnit}
            setAmountUnit={c.setAmountUnit}
            buyMcInput={c.buyMcInput}
            setBuyMcInput={c.setBuyMcInput}
            buyMcUnit={c.buyMcUnit}
            setBuyMcUnit={c.setBuyMcUnit}
            targetMcInput={c.targetMcInput}
            setTargetMcInput={c.setTargetMcInput}
            targetMcUnit={c.targetMcUnit}
            setTargetMcUnit={c.setTargetMcUnit}
            buyPriorityFee={c.buyPriorityFee}
            setBuyPriorityFee={c.setBuyPriorityFee}
            buyBribeFee={c.buyBribeFee}
            setBuyBribeFee={c.setBuyBribeFee}
            sellPriorityFee={c.sellPriorityFee}
            setSellPriorityFee={c.setSellPriorityFee}
            sellBribeFee={c.sellBribeFee}
            setSellBribeFee={c.setSellBribeFee}
            buyMarketCap={c.buyMarketCap}
            solInvested={c.solInvested}
            solPrice={c.solPrice}
            loading={c.loading}
            error={c.error}
            onCheck={c.check}
            onPaste={() => void c.pasteFromClipboard()}
          />
          {c.token ? (
            <MarketDataCard
              token={c.token}
              solPrice={c.solPrice}
              lastUpdated={c.lastUpdated}
              refreshing={c.refreshing}
              refreshInterval={c.refreshInterval}
              setRefreshInterval={c.setRefreshInterval}
              onRefresh={c.refreshNow}
              onCopy={(v, label) => void c.copy(v, label)}
              tick={tick}
            />
          ) : null}

        </div>

        {/* Right: hero profit, stats, progress */}
        <div className="space-y-5">
          {c.result && c.currentMarketCap && c.buyMarketCap && c.token ? (
            <ResultCard
              result={c.result}
              currentMarketCap={c.currentMarketCap}
              buyMarketCap={c.buyMarketCap}
              marketCapMetric={c.token.marketCapMetric}
              usdInr={c.usdInr}
              fxRates={c.fxRates}
              displayCurrency={c.displayCurrency}
              setDisplayCurrency={c.setDisplayCurrency}
              feeSol={c.feeSol}
              solPrice={c.solPrice}
              targets={c.targets}
               expectedTargetRow={c.customTargetRow}
              refreshInterval={c.refreshInterval}
              setRefreshInterval={c.setRefreshInterval}
              refreshing={c.refreshing}
              onRefresh={c.refreshNow}
              lastUpdated={c.lastUpdated}
              tick={tick}
            />
          ) : (
            <section className="glass rounded-2xl p-5 text-center">
              <p className="text-sm font-semibold">Live Position</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter a CA, your SOL amount and entry market cap — your estimated profit in INR, USD
                and SOL appears here and refreshes automatically from DEX Screener.
              </p>
            </section>
          )}

          {c.targets.length > 0 ? (
            <TargetSection
              targets={c.targets}
              customTargetRow={c.customTargetRow}
              usdInr={c.usdInr}
              feeSol={c.feeSol}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <WalletTracker usdInr={c.usdInr} onTrack={c.trackTrade} tick={tick} />
        {c.targets.length > 0 && c.buyMarketCap ? (
          <PotentialChart buyMarketCap={c.buyMarketCap} targets={c.targets} />
        ) : null}
      </div>

      <section className="mt-4 rounded-xl border border-chart-4/35 bg-chart-4/10 p-4 text-[11px] leading-relaxed text-muted-foreground">
        <p className="font-semibold text-chart-4">⚠️ Estimated Value</p>
        <p className="mt-1">
          Your estimated profit is calculated using market-cap movement. Actual sell value can be
          lower because of liquidity, price impact, slippage, trading fees, and changing market
          conditions. Market cap does not equal the amount of money available to sell.
        </p>
        <p className="mt-1.5">
          INR values use a live USD/INR rate. This tool shows market data and estimates only — it is
          not financial advice.
        </p>
      </section>
    </main>
  );
}
