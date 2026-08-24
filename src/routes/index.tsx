import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Rocket, Target, TrendingUp, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CheckForm } from "@/components/checker/CheckForm";
import { LivePositionPanel } from "@/components/checker/LivePositionPanel";
import { MarketDataCard } from "@/components/checker/MarketDataCard";
import { PotentialChart } from "@/components/checker/PotentialChart";
import { RecentChecks } from "@/components/checker/RecentChecks";
import { ResultCard } from "@/components/checker/ResultCard";
import { TargetSection } from "@/components/checker/TargetSection";
import { TokenAnalysis } from "@/components/checker/TokenAnalysis";
import { WalletTracker } from "@/components/checker/WalletTracker";
import { useProfitChecker } from "@/hooks/useProfitChecker";

const TITLE = "Solana Memecoin Profit Checker — Live P/L in INR";
const DESCRIPTION =
  "Paste a Solana contract address, enter your SOL investment and buy market cap, and track live profit in INR plus your wallet's latest trades.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const BENEFITS = [
  { icon: Zap, title: "Live Data", body: "Current token market data, SOL/USD and USD/INR rates." },
  { icon: TrendingUp, title: "Instant Profit", body: "Estimated position value and ROI in INR." },
  { icon: Target, title: "Target Calculator", body: "Value at higher market caps, updated live." },
];

function Index() {
  const c = useProfitChecker();
  const [tick, setTick] = useState(0);

  // Drives the "last updated / time ago" labels.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const scrollToChecker = () => {
    document.getElementById("checker")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <header className="text-center">
        <span className="num inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
          Solana • Live market data • INR profit • No login
        </span>
        <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
          Know Your Memecoin <span className="text-gradient">Profit Instantly.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Paste a Solana CA. Enter your investment. See your estimated profit in seconds.
        </p>
        <Button size="lg" className="mt-5 px-6" onClick={scrollToChecker}>
          <Rocket className="size-5" /> Check My Profit
        </Button>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="glass rounded-2xl p-3.5 text-left">
              <b.icon className="size-4 text-brand-2" />
              <p className="mt-1.5 text-sm font-semibold">{b.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </header>

      {/* Trade inputs (left) + sticky live position (right) */}
      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
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
            buyMarketCap={c.buyMarketCap}
            customTarget={c.customTarget}
            setCustomTarget={c.setCustomTarget}
            solInvested={c.solInvested}
            solPrice={c.solPrice}
            usdInr={c.usdInr}
            loading={c.loading}
            error={c.error}
            onCheck={c.check}
            onPaste={() => void c.pasteFromClipboard()}
          />

          <WalletTracker
            usdInr={c.usdInr}
            onTrackPosition={c.applyTrackedPosition}
            tick={tick}
          />
        </div>

        <LivePositionPanel
          token={c.token}
          result={c.result}
          customTargetRow={c.customTargetRow}
          currentMarketCap={c.currentMarketCap}
          buyMarketCap={c.buyMarketCap}
          solPrice={c.solPrice}
          usdInr={c.usdInr}
          lastUpdated={c.lastUpdated}
          refreshing={c.refreshing}
          refreshInterval={c.refreshInterval}
          setRefreshInterval={c.setRefreshInterval}
          onRefresh={c.refreshNow}
          tick={tick}
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        {c.result && c.currentMarketCap && c.buyMarketCap && c.token ? (
          <ResultCard
            result={c.result}
            currentMarketCap={c.currentMarketCap}
            buyMarketCap={c.buyMarketCap}
            marketCapMetric={c.token.marketCapMetric}
          />
        ) : null}

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
            customTarget={c.customTarget}
            setCustomTarget={c.setCustomTarget}
            customTargetRow={c.customTargetRow}
          />
        ) : null}

        {c.targets.length > 0 && c.buyMarketCap ? (
          <PotentialChart buyMarketCap={c.buyMarketCap} targets={c.targets} />
        ) : null}

        {c.token ? <TokenAnalysis token={c.token} /> : null}

        <RecentChecks history={c.history} onClear={c.clearAllHistory} tick={tick} />
      </div>

      {c.result ? (
        <section className="mt-5 rounded-2xl border border-chart-4/35 bg-chart-4/10 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-chart-4">⚠️ Estimated Value</p>
          <p className="mt-1">
            Your estimated profit is calculated using market-cap movement. Actual sell value can be
            lower because of liquidity, price impact, slippage, trading fees, and changing market
            conditions.
          </p>
          <p className="mt-2">Market cap does not equal the amount of money available to sell.</p>
          <p className="mt-2">
            Market data and estimates only — not financial advice or an investment recommendation.
          </p>
        </section>
      ) : null}
    </main>
  );
}
