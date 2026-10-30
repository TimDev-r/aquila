// Plain assertions for the paper-trading engine.
// Run: npx tsx scripts/engine-check.ts
import type { Account, Candle } from "../src/lib/contracts";
import { FEE_RATE, applyCandle, closeTrade, createAccount, equity, openTrade, unrealizedPnl } from "../src/lib/trading/engine";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${(e as Error).message}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function near(actual: number | null | undefined, expected: number, msg: string) {
  assert(actual != null && Math.abs(actual - expected) < 1e-9, `${msg}: expected ${expected}, got ${actual}`);
}

function throws(fn: () => unknown, text: string) {
  try {
    fn();
  } catch (e) {
    const m = (e as Error).message;
    assert(m.includes(text), `expected error containing "${text}", got "${m}"`);
    return;
  }
  throw new Error(`expected an error containing "${text}"`);
}

const THESIS = "Price bounced off support twice, so I expect a move up.";
const T0 = 1_700_000_000;
const candle = (time: number, open: number, high: number, low: number, close: number): Candle =>
  ({ time, open, high, low, close, volume: 1 });
const fee = (size: number, entry: number, exit: number) => FEE_RATE * size * (entry + exit);

function open(acc: Account, over: Partial<Parameters<typeof openTrade>[1]> = {}) {
  return openTrade(acc, { symbol: "BTCUSDT", side: "long", size: 0.1, price: 50000, thesis: THESIS, time: T0, ...over });
}

check("long win (manual close)", () => {
  const { account, trade } = open(createAccount());
  const r = closeTrade(account, trade.id, 51000, T0 + 3600);
  near(r.trade.pnl, 100 - fee(0.1, 50000, 51000), "pnl");
  near(r.account.balance, 10000 + r.trade.pnl!, "balance");
  assert(r.trade.exitReason === "manual", "exitReason manual");
  assert(r.account.openTrades.length === 0 && r.account.closedTrades.length === 1, "moved to closedTrades");
});

check("long loss (manual close)", () => {
  const { account, trade } = open(createAccount());
  const r = closeTrade(account, trade.id, 49000, T0 + 3600);
  near(r.trade.pnl, -100 - fee(0.1, 50000, 49000), "pnl");
  assert(r.account.balance < 10000, "balance went down");
});

check("short win (manual close)", () => {
  const { account, trade } = open(createAccount(), { side: "short" });
  const r = closeTrade(account, trade.id, 48000, T0 + 3600);
  near(r.trade.pnl, 200 - fee(0.1, 50000, 48000), "pnl");
});

check("stop hit (long)", () => {
  const { account } = open(createAccount(), { stopLoss: 49000, takeProfit: 52000 });
  const r = applyCandle(account, candle(T0 + 3600, 49900, 50100, 48800, 49500));
  assert(r.closed.length === 1, "one trade closed");
  const t = r.closed[0]!;
  assert(t.exitReason === "stop_loss", `exitReason stop_loss, got ${t.exitReason}`);
  near(t.exitPrice, 49000, "exit at stop");
  near(t.closedAt, T0 + 3600, "closedAt = candle time");
  near(r.account.balance, 10000 + t.pnl!, "balance settled");
});

check("target hit (long)", () => {
  const { account } = open(createAccount(), { stopLoss: 49000, takeProfit: 52000 });
  const r = applyCandle(account, candle(T0 + 3600, 50500, 52300, 50400, 52100));
  const t = r.closed[0];
  assert(t && t.exitReason === "take_profit", "take_profit");
  near(t.exitPrice, 52000, "exit at target");
  near(t.pnl, 200 - fee(0.1, 50000, 52000), "pnl");
});

check("stop and target hit (short)", () => {
  const { account } = open(createAccount(), { side: "short", stopLoss: 51000, takeProfit: 48000 });
  const s = applyCandle(account, candle(T0 + 3600, 50200, 51200, 50100, 50900));
  assert(s.closed[0]?.exitReason === "stop_loss", "short stop on high");
  near(s.closed[0]?.exitPrice, 51000, "short stop price");
  const t = applyCandle(account, candle(T0 + 3600, 49800, 49900, 47900, 48100));
  assert(t.closed[0]?.exitReason === "take_profit", "short target on low");
  near(t.closed[0]?.exitPrice, 48000, "short target price");
});

check("gap through the stop exits at candle open", () => {
  const { account } = open(createAccount(), { stopLoss: 49000 });
  const r = applyCandle(account, candle(T0 + 3600, 48000, 48500, 47500, 48200));
  const t = r.closed[0];
  assert(t && t.exitReason === "stop_loss", "stop_loss");
  near(t.exitPrice, 48000, "exit at open, not at stop");
  near(t.pnl, -200 - fee(0.1, 50000, 48000), "pnl uses open");
});

check("both touched in one candle: stop first", () => {
  const { account } = open(createAccount(), { stopLoss: 49000, takeProfit: 51000 });
  const r = applyCandle(account, candle(T0 + 3600, 50000, 51500, 48500, 50000));
  assert(r.closed[0]?.exitReason === "stop_loss", `expected stop_loss, got ${r.closed[0]?.exitReason}`);
  near(r.closed[0]?.exitPrice, 49000, "exit at stop");
});

check("untouched candle leaves trade open", () => {
  const { account } = open(createAccount(), { stopLoss: 49000, takeProfit: 51000 });
  const r = applyCandle(account, candle(T0 + 3600, 50000, 50800, 49200, 50500));
  assert(r.closed.length === 0 && r.account === account, "nothing closed, same account returned");
});

check("entry candle only triggers on its latest price", () => {
  // Trade opened during this candle; its low is from before the entry.
  const { account } = open(createAccount(), { stopLoss: 49000, time: T0 });
  const r = applyCandle(account, candle(T0, 48000, 50100, 48000, 50000));
  assert(r.closed.length === 0, "pre-entry low must not stop the trade");
  const s = applyCandle(account, candle(T0, 48000, 50100, 48000, 48900));
  assert(s.closed[0]?.exitReason === "stop_loss", "latest price below stop closes it");
});

check("insufficient balance rejected", () => {
  throws(() => open(createAccount(), { size: 0.3 }), "Not enough balance for this position size.");
  // Existing open notional counts too: 0.1 * 50000 = 5000 in use.
  const { account } = open(createAccount());
  open(account, { size: 0.1 });
  throws(() => open(account, { size: 0.11 }), "Not enough balance for this position size.");
});

check("short thesis rejected", () => {
  throws(() => open(createAccount(), { thesis: "  going up!          " }), "at least 20 characters");
});

check("invalid size rejected", () => {
  throws(() => open(createAccount(), { size: 0 }), "Size");
  throws(() => open(createAccount(), { size: -1 }), "Size");
  throws(() => open(createAccount(), { size: Number.NaN }), "Size");
  throws(() => open(createAccount(), { size: Number.POSITIVE_INFINITY }), "Size");
});

check("wrong-side stop and target rejected", () => {
  throws(() => open(createAccount(), { stopLoss: 51000 }), "stop-loss must be below");
  throws(() => open(createAccount(), { takeProfit: 49000 }), "take-profit must be above");
  throws(() => open(createAccount(), { side: "short", stopLoss: 49000 }), "stop-loss must be above");
  throws(() => open(createAccount(), { side: "short", takeProfit: 51000 }), "take-profit must be below");
});

check("fees applied on entry and exit", () => {
  const { account, trade } = open(createAccount());
  const r = closeTrade(account, trade.id, 50000, T0 + 60);
  near(r.trade.pnl, -(0.1 * 50000 * FEE_RATE * 2), "flat trade loses exactly two fees");
  near(unrealizedPnl(trade, 50000), -10, "unrealized includes fees");
  near(equity(account, 51000), 10000 + 100 - fee(0.1, 50000, 51000), "equity includes fees");
  assert(FEE_RATE === 0.001, "FEE_RATE is 0.1%");
});

check("closing a trade that is not open throws", () => {
  const { account, trade } = open(createAccount());
  const r = closeTrade(account, trade.id, 50500, T0 + 60);
  throws(() => closeTrade(r.account, trade.id, 50500, T0 + 120), "not open");
});

check("inputs not mutated", () => {
  const acc = createAccount();
  const snapshot = JSON.stringify(acc);
  const opened = open(acc, { stopLoss: 49000, takeProfit: 51000 });
  assert(JSON.stringify(acc) === snapshot, "openTrade mutated account");
  const afterOpen = JSON.stringify(opened.account);
  const c = candle(T0 + 3600, 50000, 51500, 48500, 50000);
  const cSnap = JSON.stringify(c);
  const applied = applyCandle(opened.account, c);
  assert(JSON.stringify(opened.account) === afterOpen, "applyCandle mutated account");
  assert(JSON.stringify(c) === cSnap, "applyCandle mutated candle");
  const second = open(opened.account, { size: 0.05 });
  const beforeClose = JSON.stringify(second.account);
  closeTrade(second.account, second.trade.id, 50100, T0 + 60);
  assert(JSON.stringify(second.account) === beforeClose, "closeTrade mutated account");
  assert(applied.account !== opened.account, "new account object returned");
});

check("ids are unique UUIDs", () => {
  const a = open(createAccount());
  const b = open(a.account, { size: 0.05 });
  assert(/^[0-9a-f-]{36}$/.test(a.trade.id) && a.trade.id !== b.trade.id, "uuid ids");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
