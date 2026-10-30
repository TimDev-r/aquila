import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CandleChart } from "@/components/trade/CandleChart";
import { OrderPanel, type OrderInput } from "@/components/trade/OrderPanel";
import { TradeReviewDialog } from "@/components/trade/TradeReviewDialog";
import { price as fmtPrice, signed, usd } from "@/components/trade/format";
import { Button } from "@/components/ui/button";
import { reviewTrade } from "@/lib/api";
import type { Account, Candle, Trade, TradeReview } from "@/lib/contracts";
import { getCandles, getReplayScenarios, subscribeCandles } from "@/lib/market";
import { useProgress } from "@/lib/progress";
import { applyCandle, closeTrade, openTrade, unrealizedPnl } from "@/lib/trading/engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trade — Aquila" },
      { name: "description", content: "Paper-trade real market moves with 10,000 USDT of play money." },
      { property: "og:title", content: "Trade — Aquila" },
      { property: "og:description", content: "Paper-trade real market moves with 10,000 USDT of play money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TradePage,
});

const SYMBOLS = ["BTCUSDT", "ETHUSDT"] as const;
type Mode = "live" | "replay";

/** Merge a streamed candle: same time updates the last one, a new time appends. */
function mergeCandle(list: Candle[], c: Candle): Candle[] {
  const last = list[list.length - 1];
  if (last && last.time === c.time) return [...list.slice(0, -1), c];
  if (last && c.time < last.time) return list;
  return [...list, c];
}

/** Run an engine call only on trades of one symbol, keeping the others untouched. */
function forSymbol<T extends { account: Account }>(account: Account, symbol: string, fn: (a: Account) => T): T {
  const others = account.openTrades.filter((t) => t.symbol !== symbol);
  const res = fn({ ...account, openTrades: account.openTrades.filter((t) => t.symbol === symbol) });
  return { ...res, account: { ...res.account, openTrades: [...others, ...res.account.openTrades] } };
}

function TradePage() {
  const { account, setAccount } = useProgress();
  const scenarios = getReplayScenarios();
  const [mode, setMode] = useState<Mode>("live");
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [scenarioId, setScenarioId] = useState("demo-lucky-win");
  const [speed, setSpeed] = useState(1);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [reviewFor, setReviewFor] = useState<Trade | null>(null);
  const [review, setReview] = useState<TradeReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const activeSymbol = mode === "replay" ? (scenario?.symbol ?? symbol) : symbol;

  const accountRef = useRef(account);
  accountRef.current = account;
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const startReview = useCallback((trade: Trade) => {
    setReviewFor(trade);
    setReview(null);
    setReviewLoading(true);
    reviewTrade(trade, candlesRef.current.slice(-100))
      .then(setReview)
      .finally(() => setReviewLoading(false));
  }, []);

  const onCandle = useCallback((c: Candle, sym: string) => {
    setCandles((prev) => mergeCandle(prev, c));
    const res = forSymbol(accountRef.current, sym, (a) => applyCandle(a, c));
    if (res.closed.length) {
      accountRef.current = res.account;
      setAccount(res.account);
      const last = res.closed[res.closed.length - 1];
      if (last) startReview(last);
    }
  }, [setAccount, startReview]);

  // Live feed
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    setCandles([]);
    getCandles(symbol, "1m", 200).then((cs) => {
      if (cancelled) return;
      setCandles(cs);
      unsub = subscribeCandles(symbol, "1m", (c) => onCandle(c, symbol));
    }).catch(() => toast.error("Couldn't load market data."));
    return () => { cancelled = true; unsub?.(); };
  }, [mode, symbol, onCandle]);

  // Replay feed
  const replayIdx = useRef(0);
  useEffect(() => {
    if (mode !== "replay" || !scenario) return;
    replayIdx.current = scenario.revealFrom;
    setCandles(scenario.candles.slice(0, scenario.revealFrom));
  }, [mode, scenario]);
  useEffect(() => {
    if (mode !== "replay" || !scenario) return;
    const id = setInterval(() => {
      const c = scenario.candles[replayIdx.current];
      if (!c) return clearInterval(id);
      replayIdx.current += 1;
      onCandle(c, scenario.symbol);
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [mode, scenario, speed, onCandle]);

  const last = candles[candles.length - 1];
  const price = last?.close ?? 0;
  const prevClose = candles[candles.length - 2]?.close ?? price;
  const up = price >= prevClose;
  const openHere = account.openTrades.filter((t) => t.symbol === activeSymbol);
  const equityNow = account.balance + openHere.reduce((s, t) => s + unrealizedPnl(t, price), 0);

  const place = (o: OrderInput): boolean => {
    if (!last) return false;
    try {
      const res = openTrade(account, { symbol: activeSymbol, side: o.side, size: o.size, price, stopLoss: o.stopLoss, takeProfit: o.takeProfit, thesis: o.thesis, time: last.time });
      setAccount(res.account);
      toast.success(`${o.side === "long" ? "Long" : "Short"} opened at ${fmtPrice(price)}`);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  const close = (id: string) => {
    if (!last) return;
    try {
      const res = closeTrade(account, id, price, last.time);
      setAccount(res.account);
      startReview(res.trade);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const history = [...account.closedTrades].reverse().slice(0, 20);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Seg options={["live", "replay"]} value={mode} onChange={(v) => setMode(v as Mode)} labels={{ live: "Live", replay: "Replay" }} />
        {mode === "live" ? (
          <Seg options={[...SYMBOLS]} value={symbol} onChange={setSymbol} />
        ) : (
          <>
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} className="h-10 rounded-xl border-2 border-border bg-card px-3 font-bold text-foreground">
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <Seg options={["1", "2", "4"]} value={String(speed)} onChange={(v) => setSpeed(Number(v))} labels={{ "1": "1x", "2": "2x", "4": "4x" }} />
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-3 rounded-3xl border-2 border-border bg-card p-4">
          <div className="flex items-baseline gap-3">
            <span className="font-extrabold text-muted-foreground">{activeSymbol}</span>
            <span className={cn("text-3xl font-black tabular-nums", up ? "text-success" : "text-destructive")}>{price ? fmtPrice(price) : "—"}</span>
          </div>
          <CandleChart key={`${mode}-${activeSymbol}-${scenarioId}`} candles={candles} trades={openHere} height={480} />
        </div>

        <div className="flex flex-col gap-4 rounded-3xl border-2 border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Balance" value={`${usd(account.balance)}`} />
            <Metric label="Equity" value={`${usd(equityNow)}`} />
          </div>
          <OrderPanel symbol={activeSymbol} price={price} balance={account.balance} onSubmit={place} />
        </div>
      </div>

      <section className="rounded-3xl border-2 border-border bg-card p-4">
        <h2 className="mb-3 text-xl text-primary">Open positions</h2>
        {account.openTrades.length === 0 ? <p className="font-semibold text-muted-foreground">No open trades yet.</p> : (
          <ul className="flex flex-col gap-2">
            {account.openTrades.map((t) => {
              const live = t.symbol === activeSymbol;
              const pnl = live ? unrealizedPnl(t, price) : null;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
                  <span className={cn("rounded-lg px-2 py-0.5 text-xs font-extrabold uppercase", t.side === "long" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>{t.side}</span>
                  <span className="font-bold">{t.size} {t.symbol.replace("USDT", "")} @ {fmtPrice(t.entryPrice)}</span>
                  <span className={cn("ml-auto font-black tabular-nums", pnl == null ? "text-muted-foreground" : pnl >= 0 ? "text-success" : "text-destructive")}>{pnl == null ? "switch symbol to see P&L" : `${signed(pnl)} USDT`}</span>
                  <Button variant="soft" size="sm" disabled={!live} onClick={() => close(t.id)}>Close</Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border-2 border-border bg-card p-4">
        <h2 className="mb-3 text-xl text-primary">History</h2>
        {history.length === 0 ? <p className="font-semibold text-muted-foreground">Closed trades appear here.</p> : (
          <ul className="flex flex-col gap-2">
            {history.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm">
                <span className="font-extrabold uppercase">{t.side}</span>
                <span className="font-bold">{t.symbol} {fmtPrice(t.entryPrice)} → {t.exitPrice != null ? fmtPrice(t.exitPrice) : "—"}</span>
                <span className="rounded-lg bg-card px-2 py-0.5 text-xs font-bold text-muted-foreground">{t.exitReason?.replace("_", " ")}</span>
                <span className={cn("ml-auto font-black tabular-nums", (t.pnl ?? 0) >= 0 ? "text-success" : "text-destructive")}>{signed(t.pnl ?? 0)} USDT</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TradeReviewDialog trade={reviewFor} review={review} loading={reviewLoading} onClose={() => setReviewFor(null)} />
    </div>
  );
}

function Seg({ options, value, onChange, labels }: { options: string[]; value: string; onChange: (v: string) => void; labels?: Record<string, string> }) {
  return (
    <div className="flex rounded-2xl border-2 border-border bg-card p-1">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={cn(
          "rounded-xl px-3 py-1.5 text-sm font-extrabold transition-colors",
          value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary",
        )}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary px-3 py-2">
      <div className="text-xs font-extrabold uppercase text-muted-foreground">{label}</div>
      <div className="font-black tabular-nums text-primary">{value}</div>
    </div>
  );
}
