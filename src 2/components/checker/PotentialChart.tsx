import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompactUsd, formatUsd, type TargetRow } from "@/lib/profit";

type Props = {
  buyMarketCap: number;
  targets: TargetRow[];
};

export function PotentialChart({ buyMarketCap, targets }: Props) {
  const data = [
    { mc: buyMarketCap, value: targets[0] ? targets[0].initialUsd : 0 },
    ...targets
      .filter((t) => t.targetMarketCap > buyMarketCap)
      .map((t) => ({ mc: t.targetMarketCap, value: t.currentUsd })),
  ];

  return (
    <section className="glass rounded-3xl p-5 sm:p-7">
      <h2 className="text-lg font-semibold sm:text-xl">Market Cap vs Portfolio Value</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Starting at your buy market cap of {formatCompactUsd(buyMarketCap)}.
      </p>
      <div className="mt-5 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="mc"
              type="number"
              scale="log"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => formatCompactUsd(v)}
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompactUsd(v)}
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              width={62}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelFormatter={(v) => `Market cap ${formatCompactUsd(Number(v))}`}
              formatter={(v: number | string) => [formatUsd(Number(v)), "Est. value"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-brand)"
              strokeWidth={2}
              fill="url(#portfolioFill)"
              dot={{ r: 3, fill: "var(--color-brand-2)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
