import { cn } from "@/lib/utils";
import {
  formatCompactUsd,
  formatInr,
  formatPercent,
  formatSol,
  formatUsd,
  type TargetRow,
} from "@/lib/profit";

type Props = {
  targets: TargetRow[];
  customTargetRow: TargetRow | null;
  usdInr: number | null;
};

export function TargetSection({ targets, customTargetRow, usdInr }: Props) {
  const money = (usd: number, sign?: boolean) =>
    usdInr ? formatInr(usd * usdInr, { sign: !!sign }) : formatUsd(usd, { sign: !!sign });

  return (
    <section className="glass rounded-2xl p-4 sm:p-5">
      <h2 className="text-base font-semibold sm:text-lg">What If It Reaches...</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Estimated position value at higher market caps, based on your buy market cap.
      </p>

      {customTargetRow ? (
        <div className="mt-4 rounded-xl border border-brand/40 bg-brand/10 px-3 py-3">
          <p className="num text-xs text-muted-foreground">
            At {formatCompactUsd(customTargetRow.targetMarketCap)} market cap
          </p>
          <p className="num mt-1 text-xl font-bold">{money(customTargetRow.currentUsd)}</p>
          <p
            className={cn(
              "num text-xs",
              customTargetRow.profitUsd >= 0 ? "text-profit" : "text-loss",
            )}
          >
            {money(customTargetRow.profitUsd, true)} • {formatUsd(customTargetRow.profitUsd, { sign: true })} •{" "}
            {formatPercent(customTargetRow.roiPercent)} • {formatSol(customTargetRow.currentSol)}
          </p>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[380px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Target MC</th>
              <th className="pb-2 font-medium">Value</th>
              <th className="pb-2 font-medium">Profit</th>
              <th className="pb-2 text-right font-medium">ROI</th>
            </tr>
          </thead>
          <tbody className="num">
            {targets.map((t) => {
              const up = t.profitUsd >= 0;
              return (
                <tr key={t.targetMarketCap} className="border-t border-border/60">
                  <td className="py-2.5 font-semibold">{formatCompactUsd(t.targetMarketCap)}</td>
                  <td className="py-2.5">
                    {money(t.currentUsd)}
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      {formatUsd(t.currentUsd)}
                    </span>
                  </td>
                  <td className={cn("py-2.5", up ? "text-profit" : "text-loss")}>
                    {money(t.profitUsd, true)}
                  </td>
                  <td className={cn("py-2.5 text-right", up ? "text-profit" : "text-loss")}>
                    {formatPercent(t.roiPercent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
