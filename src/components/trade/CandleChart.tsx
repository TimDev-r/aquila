import { useEffect, useRef } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { Candle, Trade } from "@/lib/contracts";
import { themeColor } from "./themeColor";

type Props = { candles: Candle[]; trades?: Trade[]; height?: number };

/** Candlestick chart. lightweight-charts is imported dynamically so SSR never loads it. */
export function CandleChart({ candles, trades = [], height = 380 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const shown = useRef<Candle[]>([]);
  const lib = useRef<typeof import("lightweight-charts") | null>(null);
  const latest = useRef({ candles, trades });
  latest.current = { candles, trades };

  const sync = () => {
    const s = series.current;
    if (!s) return;
    const { candles: cs } = latest.current;
    const prev = shown.current;
    const toBar = (c: Candle) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
    const sameStart = prev[0] !== undefined && prev[0].time === cs[0]?.time;
    if (sameStart && cs.length >= prev.length && cs.length - prev.length <= 1) {
      const last = cs[cs.length - 1];
      if (last) s.update(toBar(last));
    } else {
      s.setData(cs.map(toBar));
      chart.current?.timeScale().fitContent();
    }
    shown.current = cs;
  };

  const syncLines = () => {
    const s = series.current;
    const L = lib.current;
    if (!s || !L) return;
    lines.current.forEach((l) => s.removePriceLine(l));
    lines.current = [];
    for (const t of latest.current.trades) {
      lines.current.push(s.createPriceLine({ price: t.entryPrice, color: themeColor("--accent"), lineWidth: 2, lineStyle: L.LineStyle.Solid, title: `${t.side === "long" ? "Long" : "Short"} entry` }));
      if (t.stopLoss != null) lines.current.push(s.createPriceLine({ price: t.stopLoss, color: themeColor("--destructive"), lineWidth: 1, lineStyle: L.LineStyle.Dashed, title: "Stop" }));
      if (t.takeProfit != null) lines.current.push(s.createPriceLine({ price: t.takeProfit, color: themeColor("--success"), lineWidth: 1, lineStyle: L.LineStyle.Dashed, title: "Target" }));
    }
  };

  useEffect(() => {
    let disposed = false;
    import("lightweight-charts").then((L) => {
      if (disposed || !el.current) return;
      lib.current = L;
      const c = L.createChart(el.current, {
        autoSize: true,
        layout: { background: { color: "transparent" }, textColor: themeColor("--muted-foreground"), fontFamily: "Nunito, sans-serif" },
        grid: { vertLines: { color: themeColor("--border", 0.6) }, horzLines: { color: themeColor("--border", 0.6) } },
        rightPriceScale: { borderColor: themeColor("--border") },
        timeScale: { borderColor: themeColor("--border"), timeVisible: true },
      });
      const up = themeColor("--success");
      const down = themeColor("--destructive");
      series.current = c.addSeries(L.CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
      chart.current = c;
      sync();
      syncLines();
    });
    return () => {
      disposed = true;
      chart.current?.remove();
      chart.current = null;
      series.current = null;
      lines.current = [];
      shown.current = [];
    };
  }, []);

  useEffect(sync, [candles]);
  useEffect(syncLines, [trades]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
