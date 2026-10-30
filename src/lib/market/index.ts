// STUB by Person 1 — Person 3 replaces this with real market data.
import type { Candle, Interval, ReplayScenario } from "../contracts";

const SECONDS: Record<Interval, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1d": 86400 };
const BASE: Record<string, number> = { BTCUSDT: 65000, ETHUSDT: 3500 };

function nextCandle(prevClose: number, time: number, drift = 0, vol = 0.002): Candle {
  const open = prevClose;
  const close = open * (1 + drift + (Math.random() - 0.5) * 2 * vol);
  const high = Math.max(open, close) * (1 + Math.random() * vol);
  const low = Math.min(open, close) * (1 - Math.random() * vol);
  return { time, open, high, low, close, volume: Math.round(Math.random() * 100 * 100) / 100 };
}

function walk(start: number, count: number, step: number, endTime: number, driftAt?: (i: number) => number): Candle[] {
  const out: Candle[] = [];
  let price = start;
  const first = endTime - (count - 1) * step;
  for (let i = 0; i < count; i++) {
    const c = nextCandle(price, first + i * step, driftAt ? driftAt(i) : 0);
    out.push(c);
    price = c.close;
  }
  return out;
}

const lastClose: Record<string, number> = {};

export async function getCandles(symbol: string, interval: Interval, limit = 200): Promise<Candle[]> {
  const step = SECONDS[interval];
  const now = Math.floor(Date.now() / 1000 / step) * step;
  const candles = walk(BASE[symbol] ?? 100, limit, step, now);
  lastClose[symbol] = candles[candles.length - 1]?.close ?? BASE[symbol] ?? 100;
  return candles;
}

export function subscribeCandles(symbol: string, interval: Interval, onCandle: (c: Candle) => void): () => void {
  const step = SECONDS[interval];
  let time = Math.floor(Date.now() / 1000 / step) * step;
  const id = setInterval(() => {
    time += step;
    const c = nextCandle(lastClose[symbol] ?? BASE[symbol] ?? 100, time);
    lastClose[symbol] = c.close;
    onCandle(c);
  }, 3000);
  return () => clearInterval(id);
}

let cache: ReplayScenario[] | null = null;

export function getReplayScenarios(): ReplayScenario[] {
  if (cache) return cache;
  const end = Math.floor(Date.now() / 1000 / 3600) * 3600 - 86400 * 7;
  cache = [
    {
      id: "demo-lucky-win",
      title: "The lucky breakout",
      description: "Choppy BTC price action… then something happens.",
      symbol: "BTCUSDT",
      interval: "1h",
      candles: walk(65000, 100, 3600, end, (i) => (i >= 70 && i < 80 ? 0.004 : 0)),
      revealFrom: 70,
    },
    {
      id: "demo-slow-fade",
      title: "Slow fade",
      description: "ETH drifts lower. Can you read the trend?",
      symbol: "ETHUSDT",
      interval: "1h",
      candles: walk(3500, 100, 3600, end, () => -0.0008),
      revealFrom: 70,
    },
  ];
  return cache;
}

export function getReplayScenario(id: string): ReplayScenario | undefined {
  return getReplayScenarios().find((s) => s.id === id);
}
