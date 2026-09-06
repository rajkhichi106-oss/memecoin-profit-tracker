import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Rocket, Target, TrendingUp, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CheckForm } from "@/components/checker/CheckForm";
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

const BENEFITS = [
  { icon: Zap, title: "Live Data", body: "Current token market data, fetched automatically." },
  { icon: TrendingUp, title: "INR Profit", body: "Position value and P/L in rupees, USD alongside." },
  { icon: Target, title: "Target Calculator", body: "See value at higher market caps instantly." },
];

function Index() {
  const c = useProfitChecker();
  const [tick, setTick] = useState(0);

  // Drives the "updated x ago" labels.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const scrollToChecker = () => {
    document.getElementById("checker")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="text-center">
        <span className="num inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-[11px] text-muted-foreground">
          Solana • Live market data • INR profit • No login
        </span>
        <h1 className="mt-4 text-2xl font-bold leading-tight sm:text-4xl">
          Know Your Memecoin <span className="text-gradient">Profit Instantly.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Paste a Solana CA. Enter your investment. See your estimated profit in seconds.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="lg" className="h-11 px-5 text-sm" onClick={scrollToChecker}>
            <Rocket className="size-4" /> Check My Profit
          </Button>
          <span className="num rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-[11px] text-muted-foreground">
            {c.solPrice && c.usdInr
              ? `1 SOL = ${formatInr(c.solPrice * c.usdInr)} • $${c.solPrice.toFixed(2)}`
              : "Loading live SOL price…"}
          </span>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="glass rounded-xl p-3 text-left">
              <b.icon className="size-4 text-brand-2" />
              <p className="mt-1.5 text-xs font-semibold">{b.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,1.04fr)_minmax(420px,0.96fr)]">
        {/* Left: trade inputs and supporting tools */}
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
            customTarget={c.customTarget}
            setCustomTarget={c.setCustomTarget}
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
            onAddEntry={c.addEntry}
            onPaste={() => void c.pasteFromClipboard()}
          />
          <WalletTracker usdInr={c.usdInr} onTrack={c.trackTrade} tick={tick} />
          {c.targets.length > 0 && c.buyMarketCap ? (
            <PotentialChart buyMarketCap={c.buyMarketCap} targets={c.targets} />
          ) : null}
        </div>

        {/* Right: live position + live DEX Screener market data (sticky on desktop) */}
        <div className="space-y-5 lg:sticky lg:top-5">
          {c.result && c.currentMarketCap && c.buyMarketCap && c.token ? (
            <ResultCard
              result={c.result}
              positions={c.livePositions}
              currentMarketCap={c.currentMarketCap}
              buyMarketCap={c.buyMarketCap}
              marketCapMetric={c.token.marketCapMetric}
              usdInr={c.usdInr}
              fxRates={c.fxRates}
              displayCurrency={c.displayCurrency}
              setDisplayCurrency={c.setDisplayCurrency}
              feeSol={c.feeSol}
              refreshInterval={c.refreshInterval}
              setRefreshInterval={c.setRefreshInterval}
              refreshing={c.refreshing}
              onRefresh={c.refreshNow}
              onAddEntry={c.addEntry}
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

          {c.targets.length > 0 ? (
            <TargetSection
              targets={c.targets}
              targetGroups={c.targetGroups}
              customTargetRow={c.customTargetRow}
              customTargetGroup={c.customTargetGroup}
              usdInr={c.usdInr}
              feeSol={c.feeSol}
            />
          ) : null}
        </div>

      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        {c.token ? <TokenAnalysis token={c.token} /> : <div />}
        <RecentChecks history={c.history} onClear={c.clearAllHistory} tick={tick} />
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
