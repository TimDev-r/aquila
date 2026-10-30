import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Side } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { price as fmtPrice, usd } from "./format";

export type OrderInput = { side: Side; size: number; stopLoss: number | null; takeProfit: number | null; thesis: string };

const MIN_THESIS = 20;

export function OrderPanel({ symbol, price, balance, onSubmit }: {
  symbol: string; price: number; balance: number; onSubmit: (o: OrderInput) => boolean;
}) {
  const [side, setSide] = useState<Side>("long");
  const [size, setSize] = useState("0.01");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [thesis, setThesis] = useState("");

  const sizeN = Number(size) || 0;
  const value = sizeN * price;
  const pct = balance > 0 ? (value / balance) * 100 : 0;
  const slN = sl === "" ? null : Number(sl);
  const tpN = tp === "" ? null : Number(tp);
  const slWrong = slN != null && (side === "long" ? slN >= price : slN <= price);
  const tpWrong = tpN != null && (side === "long" ? tpN <= price : tpN >= price);
  const len = thesis.trim().length;
  const asset = symbol.replace("USDT", "");

  const submit = () => {
    if (onSubmit({ side, size: sizeN, stopLoss: slN, takeProfit: tpN, thesis })) {
      setThesis(""); setSl(""); setTp("");
    }
  };

  const field = "h-11 w-full rounded-xl border-2 border-border bg-card px-3 font-bold text-foreground outline-none focus:border-accent";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {(["long", "short"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSide(s)} className={cn(
            "btn-3d rounded-2xl border-2 border-b-4 py-2.5 font-extrabold uppercase",
            side === s ? (s === "long" ? "border-success bg-success/10 text-success" : "border-destructive bg-destructive/10 text-destructive") : "border-border bg-card text-muted-foreground",
          )}>{s === "long" ? "Long ↑" : "Short ↓"}</button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-extrabold uppercase text-muted-foreground">Size ({asset})</span>
        <input className={field} type="number" min="0" step="any" value={size} onChange={(e) => setSize(e.target.value)} />
        <span className="text-sm font-semibold text-muted-foreground">≈ {usd(value)} USDT · {pct.toFixed(1)}% of balance</span>
        {pct > 20 && (
          <span className="flex items-center gap-1 rounded-lg bg-accent/20 px-2 py-1 text-sm font-bold text-accent-shadow">
            <AlertTriangle className="size-4" /> That's a big bet. Most pros risk far less per trade.
          </span>
        )}
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-extrabold uppercase text-muted-foreground">Stop loss</span>
          <input className={field} type="number" step="any" placeholder="optional" value={sl} onChange={(e) => setSl(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-extrabold uppercase text-muted-foreground">Take profit</span>
          <input className={field} type="number" step="any" placeholder="optional" value={tp} onChange={(e) => setTp(e.target.value)} />
        </label>
      </div>
      {slWrong && <p className="-mt-2 text-sm font-bold text-accent-shadow">Hint: for a {side} the stop belongs {side === "long" ? "below" : "above"} {fmtPrice(price)}.</p>}
      {tpWrong && <p className="-mt-2 text-sm font-bold text-accent-shadow">Hint: for a {side} the target belongs {side === "long" ? "above" : "below"} {fmtPrice(price)}.</p>}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-extrabold uppercase text-muted-foreground">Why are you taking this trade?</span>
        <Textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          rows={4}
          className="rounded-xl border-2 font-semibold"
          placeholder="e.g. Price bounced twice at 64,800 support, I expect a move up. Stop below support."
        />
        <span className={cn("self-end text-xs font-bold", len >= MIN_THESIS ? "text-success" : "text-muted-foreground")}>{len}/{MIN_THESIS}</span>
      </label>

      <Button variant={side === "long" ? "success" : "danger"} size="xl" disabled={len < MIN_THESIS} onClick={submit}>
        {side === "long" ? "Buy" : "Sell"} {asset}
      </Button>
    </div>
  );
}
