import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  formatCompactUsd,
  formatPercent,
  formatSol,
  formatUsd,
  type TargetRow,
} from "@/lib/profit";

type Props = {
  targets: TargetRow[];
  customTarget: string;
  setCustomTarget: (v: string) => void;
  customTargetRow: TargetRow | null;
};

export function TargetSection({ targets, customTarget, setCustomTarget, customTargetRow }: Props) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-7">
      <h2 className="text-lg font-semibold sm:text-xl">What If It Reaches...</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Estimated position value at higher market caps, based on your buy market cap.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                  <td className="py-3 font-semibold">{formatCompactUsd(t.targetMarketCap)}</td>
                  <td className="py-3">
                    {formatUsd(t.currentUsd)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({t.currentSol.toFixed(3)} SOL)
                    </span>
                  </td>
                  <td className={cn("py-3", up ? "text-profit" : "text-loss")}>
                    {formatUsd(t.profitUsd, { sign: true })}
                  </td>
                  <td className={cn("py-3 text-right", up ? "text-profit" : "text-loss")}>
                    {formatPercent(t.roiPercent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-secondary/35 p-4">
        <Label htmlFor="custom-target">Enter Your Target Market Cap</Label>
        <Input
          id="custom-target"
          value={customTarget}
          onChange={(e) => setCustomTarget(e.target.value)}
          placeholder="$750K"
          className="num mt-2 h-12"
        />
        {customTargetRow ? (
          <div className="num mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">At MC</p>
              <p className="font-semibold">{formatCompactUsd(customTargetRow.targetMarketCap)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Value</p>
              <p className="font-semibold">{formatUsd(customTargetRow.currentUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Profit</p>
              <p
                className={cn(
                  "font-semibold",
                  customTargetRow.profitUsd >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {formatUsd(customTargetRow.profitUsd, { sign: true })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ROI / SOL</p>
              <p className="font-semibold">
                {formatPercent(customTargetRow.roiPercent)} • {formatSol(customTargetRow.currentSol)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Try 200K, 750K or 2M to see your estimated value.
          </p>
        )}
      </div>
    </section>
  );
}
