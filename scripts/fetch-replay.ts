// Builds the four replay scenarios in src/data/replay/ from real Binance 1h candles.
// Run: npx tsx scripts/fetch-replay.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Candle, ReplayScenario } from "../src/lib/contracts";

const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];
const SYMBOLS = ["BTCUSDT", "ETHUSDT"];
const WINDOW = 100;
const REVEAL = 70;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "replay");

type Window = { symbol: string; candles: Candle[] };

async function fetchCandles(symbol: string): Promise<Candle[]> {
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=1h&limit=1000`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as (string | number)[][];
      return rows.map((k) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }));
    } catch (e) {
      console.warn(`${host} failed for ${symbol}: ${(e as Error).message}`);
    }
  }
  throw new Error(`Could not fetch ${symbol} from any Binance host`);
}

const at = (cs: Candle[], i: number): Candle => {
  const c = cs[i];
  if (!c) throw new Error(`No candle at ${i}`);
  return c;
};

// R-squared of closes against their index.
function rSquared(values: number[]): number {
  const n = values.length;
  const mx = (n - 1) / 2;
  const my = values.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  values.forEach((y, x) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  });
  return syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
}

const closes = (cs: Candle[]) => cs.map((c) => c.close);
const change = (from: number, to: number) => to / from - 1;
const maxHigh = (cs: Candle[]) => Math.max(...cs.map((c) => c.high));
const minLow = (cs: Candle[]) => Math.min(...cs.map((c) => c.low));

function windowsOf(symbol: string, all: Candle[]): Window[] {
  const out: Window[] = [];
  for (let s = 0; s + WINDOW <= all.length; s++) out.push({ symbol, candles: all.slice(s, s + WINDOW) });
  return out;
}

function best(ws: Window[], score: (w: Window) => number | null): Window | null {
  let top: Window | null = null;
  let topScore = -Infinity;
  for (const w of ws) {
    const s = score(w);
    if (s != null && s > topScore) {
      top = w;
      topScore = s;
    }
  }
  return top;
}

// Tries each threshold set in order until one yields a window.
function pick(name: string, ws: Window[], tiers: ((w: Window) => number | null)[]): Window {
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (!tier) continue;
    const w = best(ws, tier);
    if (w) {
      if (i > 0) console.warn(`${name}: used relaxed criteria (tier ${i + 1})`);
      return w;
    }
  }
  throw new Error(`No window found for ${name}`);
}

function cleanUptrend(minRise: number) {
  return (w: Window) => {
    const cs = w.candles;
    const rise = change(at(cs, 0).close, at(cs, WINDOW - 1).close);
    return rise >= minRise ? rSquared(closes(cs)) : null;
  };
}

function rangeChop(minRange: number) {
  return (w: Window) => {
    const cs = w.candles;
    const range = (maxHigh(cs) - minLow(cs)) / at(cs, 0).open;
    if (range < minRange) return null;
    return -Math.abs(change(at(cs, 0).open, at(cs, WINDOW - 1).close));
  };
}

function fakeBreakout(needCloseAbove: boolean) {
  return (w: Window) => {
    const cs = w.candles;
    const level = maxHigh(cs.slice(0, REVEAL));
    let breakIdx = -1;
    for (let i = REVEAL; i < 80; i++) {
      const c = at(cs, i);
      if (needCloseAbove ? c.close > level : c.high > level) { breakIdx = i; break; }
    }
    if (breakIdx < 0) return null;
    let failed = false;
    for (let i = breakIdx + 1; i <= 89; i++) if (at(cs, i).close < level) { failed = true; break; }
    if (!failed) return null;
    // Prefer a clear poke above and a clear fall back below the level.
    const poke = maxHigh(cs.slice(REVEAL, 80)) / level - 1;
    const drop = 1 - at(cs, WINDOW - 1).close / level;
    return poke + drop;
  };
}

function luckyWin(maxR2: number, maxDrift: number, minRise: number) {
  return (w: Window) => {
    const cs = w.candles;
    const before = cs.slice(0, REVEAL);
    const r2 = rSquared(closes(before));
    const drift = Math.abs(change(at(cs, 0).open, at(cs, REVEAL - 1).close));
    const rise = change(at(cs, REVEAL - 1).close, at(cs, WINDOW - 1).close);
    if (r2 > maxR2 || drift > maxDrift || rise <= minRise) return null;
    return rise - r2 * 0.02;
  };
}

function toScenario(id: string, w: Window, title: string, description: string): ReplayScenario {
  return { id, title, description, symbol: w.symbol, interval: "1h", candles: w.candles, revealFrom: REVEAL };
}

// One candle per line keeps the files readable and diff-friendly.
function format(s: ReplayScenario): string {
  const { candles, ...meta } = s;
  const head = JSON.stringify(meta, null, 2).slice(0, -2);
  const rows = candles.map((c) => "    " + JSON.stringify(c)).join(",\n");
  return `${head},\n  "candles": [\n${rows}\n  ]\n}\n`;
}

const coin = (symbol: string) => (symbol.startsWith("BTC") ? "Bitcoin" : "Ethereum");

async function main() {
  const ws: Window[] = [];
  for (const symbol of SYMBOLS) {
    const all = await fetchCandles(symbol);
    console.log(`${symbol}: ${all.length} candles`);
    ws.push(...windowsOf(symbol, all));
  }

  // Pick the rarest patterns first; later picks may not overlap earlier ones.
  const taken: Window[] = [];
  const overlaps = (a: Window, b: Window) =>
    a.symbol === b.symbol &&
    at(a.candles, 0).time <= at(b.candles, WINDOW - 1).time &&
    at(b.candles, 0).time <= at(a.candles, WINDOW - 1).time;
  const choose = (name: string, tiers: ((w: Window) => number | null)[]) => {
    const w = pick(name, ws.filter((x) => !taken.some((t) => overlaps(t, x))), tiers);
    taken.push(w);
    return w;
  };

  const lucky = choose("demo-lucky-win", [
    luckyWin(0.2, 0.015, 0.03),
    luckyWin(0.35, 0.025, 0.03),
    luckyWin(0.5, 0.04, 0.03),
  ]);
  const fake = choose("fake-breakout", [fakeBreakout(true), fakeBreakout(false)]);
  const up = choose("clean-uptrend", [cleanUptrend(0.06), cleanUptrend(0.04), cleanUptrend(0.02)]);
  const chop = choose("range-chop", [rangeChop(0.04), rangeChop(0.03), rangeChop(0.02)]);

  const scenarios = [
    toScenario("clean-uptrend", up, `${coin(up.symbol)} on the move`,
      "Look at where the candles have been heading and decide what you expect next."),
    toScenario("range-chop", chop, `${coin(chop.symbol)} going nowhere?`,
      "Price has been bouncing around a lot; figure out whether there is a real direction here."),
    toScenario("fake-breakout", fake, `${coin(fake.symbol)} near the top`,
      "Price is testing the highest level of recent days; think about what usually happens at levels like this."),
    toScenario("demo-lucky-win", lucky, `${coin(lucky.symbol)} at a crossroads`,
      "The chart has been choppy with no clear direction; make your call and explain your reasoning."),
  ];

  mkdirSync(OUT_DIR, { recursive: true });
  for (const s of scenarios) {
    writeFileSync(join(OUT_DIR, `${s.id}.json`), format(s));
    const first = at(s.candles, 0).open;
    const last = at(s.candles, WINDOW - 1).close;
    console.log(`${s.id}: ${s.symbol} from ${new Date(at(s.candles, 0).time * 1000).toISOString()}, ` +
      `${first} -> ${last} (${(change(first, last) * 100).toFixed(2)}%)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
