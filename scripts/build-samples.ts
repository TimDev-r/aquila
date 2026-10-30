// Builds request bodies for the edge functions in scripts/samples/ from the real replay
// candles, running every trade through the engine so prices, P&L and exits are consistent.
// Run: npx tsx scripts/build-samples.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Candle, ReplayScenario, Side, Trade, TradeReview } from "../src/lib/contracts";
import { replayScenarios } from "../src/data/replay";
import { applyCandle, closeTrade, createAccount, openTrade } from "../src/lib/trading/engine";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "samples");
const BALANCE = 10000;
const MAX_NOTIONAL = 0.25; // planned trades use at most 25% of the balance

type Plan = {
  scenario: ReplayScenario;
  entry: number;              // candle index; entry at its close
  side: Side;
  size: number;
  stopLoss: number | null;
  takeProfit: number | null;
  thesis: string;
  manualExit?: (c: Candle, i: number) => boolean; // close by hand at this candle's close
};

type Result = { trade: Trade; exitIndex: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const asset = (s: ReplayScenario) => s.symbol.replace("USDT", "");

function at(cs: Candle[], i: number): Candle {
  const c = cs[i];
  if (!c) throw new Error(`No candle at ${i}`);
  return c;
}

function scenario(id: string): ReplayScenario {
  const s = replayScenarios.find((x) => x.id === id);
  if (!s) throw new Error(`Missing scenario ${id}`);
  return s;
}

/** Opens the trade, feeds the following candles, and returns it once closed (null if it never closes). */
function simulate(p: Plan, closeAtEnd = false): Result | null {
  const cs = p.scenario.candles;
  const entry = at(cs, p.entry);
  let { account } = openTrade(createAccount(BALANCE), {
    symbol: p.scenario.symbol, side: p.side, size: p.size, price: entry.close,
    stopLoss: p.stopLoss, takeProfit: p.takeProfit, thesis: p.thesis, time: entry.time,
  });
  for (let i = p.entry + 1; i < cs.length; i++) {
    const c = at(cs, i);
    const r = applyCandle(account, c);
    account = r.account;
    const closed = r.closed[0];
    if (closed) return { trade: closed, exitIndex: i };
    const open = account.openTrades[0];
    if (open && (p.manualExit?.(c, i) || (closeAtEnd && i === cs.length - 1))) {
      return { trade: closeTrade(account, open.id, c.close, c.time).trade, exitIndex: i };
    }
  }
  return null;
}

/** Recent support: the lowest low of the last `lookback` candles, touched at least twice. */
function supportAt(cs: Candle[], i: number, lookback = 24): number | null {
  if (i < lookback) return null;
  const win = cs.slice(i - lookback, i);
  const level = Math.min(...win.map((c) => c.low));
  const touches = win.map((c, k) => (c.low <= level * 1.0025 ? k : -1)).filter((k) => k >= 0);
  const first = touches[0];
  const last = touches[touches.length - 1];
  if (first == null || last == null || last - first < 3) return null;
  const c = at(cs, i);
  if (c.low < level || c.close > level * 1.006) return null;
  return level;
}

type Setup = { scenario: ReplayScenario; entry: number; support: number; stop: number; target: number; size: number; riskPct: string };

/** Long-at-support setups with a stop under support and a 1:2 target, risking ~1% of the account. */
function supportSetups(ids: string[], opts: { stopBuffer?: number; rr?: number } = {}): Setup[] {
  const out: Setup[] = [];
  for (const id of ids) {
    const s = scenario(id);
    for (let i = 24; i < s.candles.length - 3; i++) {
      const support = supportAt(s.candles, i);
      if (support == null) continue;
      const entry = at(s.candles, i).close;
      const stop = r2(support * (1 - (opts.stopBuffer ?? 0.003)));
      const risk = entry - stop;
      if (risk / entry < 0.003 || risk / entry > 0.015) continue;
      const target = r2(entry + (opts.rr ?? 2) * risk);
      const size = r4(Math.min((BALANCE * 0.01) / risk, (BALANCE * MAX_NOTIONAL) / entry));
      const riskPct = ((size * risk) / BALANCE * 100).toFixed(1);
      out.push({ scenario: s, entry: i, support, stop, target, size, riskPct });
    }
  }
  return out;
}

// Entries already used by a sample, so every sample shows a different moment.
const used = new Set<string>();
const key = (s: ReplayScenario, i: number) => `${s.id}:${i}`;

function first<T extends { scenario: ReplayScenario; entry: number }>(name: string, items: T[], build: (x: T) => Result | null): Result & { item: T } {
  for (const x of items) {
    if (used.has(key(x.scenario, x.entry))) continue;
    const r = build(x);
    if (r) {
      used.add(key(x.scenario, x.entry));
      return { ...r, item: x };
    }
  }
  throw new Error(`No real-data setup found for ${name}`);
}

const ALL = ["clean-uptrend", "range-chop", "fake-breakout", "demo-lucky-win"];
const samples: { file: string; verdict: TradeReview["verdict"]; result: Result; scenario: ReplayScenario; note: string }[] = [];

function add(file: string, verdict: TradeReview["verdict"], s: ReplayScenario, result: Result, note: string) {
  samples.push({ file, verdict, result, scenario: s, note });
}

// 1. Lucky win: gut-feeling long with no stop, right before the demo rally.
{
  const s = scenario("demo-lucky-win");
  const entry = s.revealFrom - 1;
  const entryPrice = at(s.candles, entry).close;
  const r = simulate({
    scenario: s, entry, side: "long", size: r4((BALANCE * 0.2) / entryPrice), stopLoss: null, takeProfit: null,
    thesis: "feels like it will go up, I have a good feeling",
  }, true);
  if (!r || (r.trade.exitPrice ?? 0) / entryPrice - 1 < 0.03) throw new Error("lucky-win: no 3% rise");
  used.add(key(s, entry));
  add("lucky-win.json", "lucky", s, r, "Gut-feeling long, no stop, caught the >3% demo rally");
}

// 2. Unlucky loss: textbook support buy, 1:2, stopped out anyway.
{
  const r = first("unlucky-loss", supportSetups(ALL), (x) => {
    const res = simulate({
      scenario: x.scenario, entry: x.entry, side: "long", size: x.size, stopLoss: x.stop, takeProfit: x.target,
      thesis: `${asset(x.scenario)} came back down to the ${fmt(x.support)} support that held twice in the last day, so I'm buying the bounce. Stop just under support at ${fmt(x.stop)}, target ${fmt(x.target)} for 1:2 risk/reward, risking about ${x.riskPct}% of my account.`,
    });
    return res?.trade.exitReason === "stop_loss" ? res : null;
  });
  add("unlucky-loss.json", "unlucky", r.item.scenario, r, "Clear support thesis, sensible stop, 1:2, stopped out");
}

// 3. Great win: trend + support + planned risk, target reached.
{
  const r = first("great-win", supportSetups(["clean-uptrend", ...ALL]), (x) => {
    const cs = x.scenario.candles;
    if (at(cs, x.entry).close < at(cs, x.entry - 24).close * 1.005) return null; // needs an uptrend
    const res = simulate({
      scenario: x.scenario, entry: x.entry, side: "long", size: x.size, stopLoss: x.stop, takeProfit: x.target,
      thesis: `${asset(x.scenario)} is in an uptrend with higher lows, and this pullback is sitting on the ${fmt(x.support)} support that was tested twice. I'm buying here with my stop under that level at ${fmt(x.stop)} and a target of ${fmt(x.target)}, so it's 1:2 and I only risk about ${x.riskPct}% of my account. If support breaks, my idea is wrong and I'm out.`,
    });
    return res?.trade.exitReason === "take_profit" ? res : null;
  });
  add("great-win.json", "great", r.item.scenario, r, "Trend + support + 1% risk, 1:2 target hit");
}

// 4. Oversized: reasonable idea, 60% of the balance in one trade.
{
  const r = first("oversized", supportSetups(ALL), (x) => {
    const price = at(x.scenario.candles, x.entry).close;
    const res = simulate({
      scenario: x.scenario, entry: x.entry, side: "long", size: r4((BALANCE * 0.6) / price), stopLoss: x.stop, takeProfit: x.target,
      thesis: `Price is at support around ${fmt(x.support)} again so I'm going big on this one, I'm really confident it bounces. Stop at ${fmt(x.stop)}.`,
    });
    return res?.trade.exitReason === "stop_loss" ? res : null;
  });
  add("oversized.json", "poor", r.item.scenario, r, "Position is 60% of the balance; stopped out");
}

// 5. Tight stop: stop 0.05% away, knocked out by noise, then price goes the right way.
{
  const cands: { scenario: ReplayScenario; entry: number }[] = [];
  for (const id of ["clean-uptrend", "demo-lucky-win"]) {
    const s = scenario(id);
    for (let i = 10; i < s.candles.length - 10; i++) cands.push({ scenario: s, entry: i });
  }
  const r = first("tight-stop", cands, ({ scenario: s, entry: i }) => {
    const price = at(s.candles, i).close;
    const stop = r2(price * 0.9995);
    const res = simulate({
      scenario: s, entry: i, side: "long", size: r4((BALANCE * 0.3) / price), stopLoss: stop, takeProfit: r2(price * 1.02),
      thesis: `Trend is up so I'm buying, but I don't want to lose much so my stop is super close at ${fmt(stop)}.`,
    });
    if (res?.trade.exitReason !== "stop_loss") return null;
    const later = s.candles.slice(res.exitIndex, res.exitIndex + 12);
    return later.some((c) => c.high >= price * 1.01) ? res : null;
  });
  add("tight-stop.json", "poor", r.item.scenario, r, "Stop 0.05% from entry, hit by noise before the move");
}

// 6. Good short: failed breakout, short back under the level, stop above the spike.
{
  const s = scenario("fake-breakout");
  const cs = s.candles;
  const level = Math.max(...cs.slice(0, s.revealFrom).map((c) => c.high));
  const backBelow = cs.findIndex((c, i) => i >= s.revealFrom && i <= 89 && c.close < level &&
    cs.slice(s.revealFrom, i).some((p) => p.close > level));
  const spike = Math.max(...cs.slice(s.revealFrom, backBelow + 1).map((c) => c.high));
  const entryPrice = at(cs, backBelow).close;
  const stop = r2(spike * 1.001);
  const target = r2(entryPrice - 2 * (stop - entryPrice));
  const res = simulate({
    scenario: s, entry: backBelow, side: "short",
    size: r4(Math.min((BALANCE * 0.01) / (stop - entryPrice), (BALANCE * MAX_NOTIONAL) / entryPrice)), stopLoss: stop, takeProfit: target,
    thesis: `${asset(s)} broke above the ${fmt(level)} high but couldn't hold it and closed back below, which looks like a fake breakout. I'm shorting with my stop above the spike high at ${fmt(stop)} and target ${fmt(target)}, about 1:2.`,
  }, true);
  if (!res || (res.trade.pnl ?? 0) <= 0) throw new Error("good-short: not profitable");
  used.add(key(s, backBelow));
  add("good-short.json", "good", s, res, `Short after failed breakout above ${fmt(level)}; ${res.trade.exitReason}`);
}

// 7. Level, no stop: decent support idea but no stop; support breaks and it's closed at a loss.
{
  const r = first("level-no-stop", supportSetups(ALL), (x) => {
    const entryPrice = at(x.scenario.candles, x.entry).close;
    return simulate({
      scenario: x.scenario, entry: x.entry, side: "long", size: x.size, stopLoss: null, takeProfit: null,
      thesis: `Buying at the ${fmt(x.support)} support because it bounced from there twice already. Not using a stop, I'll just watch it and get out if it looks bad.`,
      manualExit: (c) => c.close <= entryPrice * 0.985,
    });
  });
  add("level-no-stop.json", "poor", r.item.scenario, r, "Support idea, no stop, closed by hand after -1.5%");
}

// 8. Early manual exit: good plan, but closed for a small profit long before the target.
{
  const r = first("early-manual-exit", supportSetups(ALL), (x) => {
    const entryPrice = at(x.scenario.candles, x.entry).close;
    const plan = {
      scenario: x.scenario, entry: x.entry, side: "long" as const, size: x.size, stopLoss: x.stop, takeProfit: x.target,
      thesis: `Support at ${fmt(x.support)} held twice, so I'm buying with a stop at ${fmt(x.stop)} and a target at ${fmt(x.target)}, so the reward is about twice the risk.`,
    };
    if (simulate(plan)?.trade.exitReason !== "take_profit") return null; // the plan would have worked
    const res = simulate({ ...plan, manualExit: (c) => c.close >= entryPrice * 1.005 });
    return res?.trade.exitReason === "manual" ? res : null;
  });
  add("early-manual-exit.json", "good", r.item.scenario, r, "Good plan, closed by hand at a small profit before the target");
}

// 9. Take-profit hit: simple pullback plan, target reached.
{
  const r = first("take-profit-hit", supportSetups(ALL), (x) => {
    const res = simulate({
      scenario: x.scenario, entry: x.entry, side: "long", size: x.size, stopLoss: x.stop, takeProfit: x.target,
      thesis: `Price dipped back to where it bounced before, so I'm buying. Stop below the last low at ${fmt(x.stop)}, take profit at ${fmt(x.target)}.`,
    });
    return res?.trade.exitReason === "take_profit" ? res : null;
  });
  add("take-profit-hit.json", "good", r.item.scenario, r, "Simple pullback buy with stop, target hit");
}

// 10. Stop hit: chasing a big green candle, stopped out.
{
  const cands: { scenario: ReplayScenario; entry: number }[] = [];
  for (const id of ALL) {
    const s = scenario(id);
    for (let i = 5; i < s.candles.length - 5; i++) {
      const c = at(s.candles, i);
      if (c.close / c.open - 1 > 0.006) cands.push({ scenario: s, entry: i });
    }
  }
  const r = first("stop-hit", cands, ({ scenario: s, entry: i }) => {
    const price = at(s.candles, i).close;
    return ((res) => (res?.trade.exitReason === "stop_loss" ? res : null))(simulate({
      scenario: s, entry: i, side: "long", size: r4((BALANCE * 0.25) / price), stopLoss: r2(price * 0.99), takeProfit: r2(price * 1.03),
      thesis: "Huge green candle just now, it's pumping hard so I'm jumping in before I miss it!!",
    }));
  });
  add("stop-hit.json", "poor", r.item.scenario, r, "FOMO buy after a big green candle, stopped out");
}

// Write trade samples.
const tradesDir = join(ROOT, "trades");
mkdirSync(tradesDir, { recursive: true });
const expected: Record<string, TradeReview["verdict"]> = {};
samples.forEach((x, n) => {
  const trade: Trade = { ...x.result.trade, id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}` };
  const candles = x.scenario.candles.slice(Math.max(0, x.result.exitIndex + 1 - 200), x.result.exitIndex + 1);
  writeFileSync(join(tradesDir, x.file), JSON.stringify({ trade, candles }, null, 2) + "\n");
  expected[x.file] = x.verdict;
  const t = trade;
  const notional = (t.size * t.entryPrice) / BALANCE * 100;
  console.log(`${x.file.padEnd(23)} ${x.scenario.id.padEnd(15)} ${t.side.padEnd(5)} entry ${fmt(t.entryPrice)} ` +
    `exit ${fmt(t.exitPrice ?? 0)} (${t.exitReason}) pnl ${t.pnl?.toFixed(2)} size ${notional.toFixed(0)}% -> ${x.verdict} | ${x.note}`);
});
writeFileSync(join(tradesDir, "expected.json"), JSON.stringify(expected, null, 2) + "\n");

// Quiz and speak samples.
const quizDir = join(ROOT, "quiz");
mkdirSync(quizDir, { recursive: true });
writeFileSync(join(quizDir, "stop-loss-d1.json"), JSON.stringify({ tag: "stop_loss", difficulty: 1, count: 5 }, null, 2) + "\n");
writeFileSync(join(quizDir, "trend-d2.json"),
  JSON.stringify({ tag: "trend", difficulty: 2, count: 5, candles: scenario("clean-uptrend").candles }, null, 2) + "\n");
writeFileSync(join(quizDir, "psychology-d3.json"), JSON.stringify({ tag: "psychology", difficulty: 3, count: 5 }, null, 2) + "\n");
writeFileSync(join(ROOT, "speak.json"),
  JSON.stringify({ text: "You made money, but the reasoning was weak. Luck is not a strategy." }, null, 2) + "\n");
console.log("\nWrote 10 trade samples, expected.json, 3 quiz samples and speak.json");
