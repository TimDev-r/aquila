// Paper-trading engine. Pure functions: no React, never mutate inputs. No leverage.
import type { Account, Candle, ExitReason, Side, Trade } from "../contracts";

/** Fee charged on entry and again on exit, as a fraction of notional (0.1%). */
export const FEE_RATE = 0.001;

export function createAccount(startingBalance = 10000): Account {
  return { startingBalance, balance: startingBalance, openTrades: [], closedTrades: [] };
}

const isPositive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function grossPnl(trade: Trade, exit: number): number {
  return trade.side === "long" ? (exit - trade.entryPrice) * trade.size : (trade.entryPrice - exit) * trade.size;
}

function fees(trade: Trade, exit: number): number {
  return FEE_RATE * trade.size * (trade.entryPrice + exit);
}

/** P&L after entry and exit fees if the trade were closed at `exit`. */
function netPnl(trade: Trade, exit: number): number {
  return grossPnl(trade, exit) - fees(trade, exit);
}

function validateLevels(side: Side, price: number, stopLoss: number | null, takeProfit: number | null) {
  if (stopLoss != null && !isPositive(stopLoss)) throw new Error("Stop-loss must be a positive price.");
  if (takeProfit != null && !isPositive(takeProfit)) throw new Error("Take-profit must be a positive price.");
  if (side === "long") {
    if (stopLoss != null && stopLoss >= price) throw new Error("For a long trade, the stop-loss must be below the entry price.");
    if (takeProfit != null && takeProfit <= price) throw new Error("For a long trade, the take-profit must be above the entry price.");
  } else {
    if (stopLoss != null && stopLoss <= price) throw new Error("For a short trade, the stop-loss must be above the entry price.");
    if (takeProfit != null && takeProfit >= price) throw new Error("For a short trade, the take-profit must be below the entry price.");
  }
}

export function openTrade(
  account: Account,
  p: { symbol: string; side: Side; size: number; price: number; stopLoss?: number | null; takeProfit?: number | null; thesis: string; time: number },
): { account: Account; trade: Trade } {
  const thesis = (p.thesis ?? "").trim();
  if (thesis.length < 20) throw new Error("Explain your reason in at least 20 characters.");
  if (!isPositive(p.size)) throw new Error("Size must be a number greater than 0.");
  if (!isPositive(p.price)) throw new Error("Price must be a number greater than 0.");
  if (p.side !== "long" && p.side !== "short") throw new Error("Choose long or short.");
  const stopLoss = p.stopLoss ?? null;
  const takeProfit = p.takeProfit ?? null;
  validateLevels(p.side, p.price, stopLoss, takeProfit);

  const inUse = account.openTrades.reduce((s, t) => s + t.size * t.entryPrice, 0);
  if (p.size * p.price + inUse > account.balance) throw new Error("Not enough balance for this position size.");

  const trade: Trade = {
    id: crypto.randomUUID(),
    symbol: p.symbol, side: p.side, size: p.size, entryPrice: p.price, exitPrice: null,
    stopLoss, takeProfit, thesis,
    openedAt: p.time, closedAt: null, pnl: null, exitReason: null,
  };
  return { account: { ...account, openTrades: [...account.openTrades, trade] }, trade };
}

function closeOne(trade: Trade, price: number, time: number, reason: ExitReason): Trade {
  return { ...trade, exitPrice: price, closedAt: time, pnl: netPnl(trade, price), exitReason: reason };
}

function settle(account: Account, closed: Trade[]): Account {
  const ids = new Set(closed.map((t) => t.id));
  return {
    ...account,
    balance: closed.reduce((b, t) => b + (t.pnl ?? 0), account.balance),
    openTrades: account.openTrades.filter((t) => !ids.has(t.id)),
    closedTrades: [...account.closedTrades, ...closed],
  };
}

/** Where (if anywhere) this candle takes the trade out. Stop wins when both levels are touched. */
function exitFor(t: Trade, c: Candle): { price: number; reason: ExitReason } | null {
  const sl = t.stopLoss;
  const tp = t.takeProfit;
  const long = t.side === "long";

  // The entry candle is still forming (live) or already past (replay): its high/low include
  // prices from before the entry, so only its latest price can trigger an exit.
  if (c.time === t.openedAt) {
    if (sl != null && (long ? c.close <= sl : c.close >= sl)) return { price: sl, reason: "stop_loss" };
    if (tp != null && (long ? c.close >= tp : c.close <= tp)) return { price: tp, reason: "take_profit" };
    return null;
  }

  // Gap: the candle opened beyond a level, so the order fills at the open.
  if (sl != null && (long ? c.open <= sl : c.open >= sl)) return { price: c.open, reason: "stop_loss" };
  if (tp != null && (long ? c.open >= tp : c.open <= tp)) return { price: c.open, reason: "take_profit" };

  if (sl != null && (long ? c.low <= sl : c.high >= sl)) return { price: sl, reason: "stop_loss" };
  if (tp != null && (long ? c.high >= tp : c.low <= tp)) return { price: tp, reason: "take_profit" };
  return null;
}

/** Checks every open trade in `account` against the candle. Callers pass only trades of the candle's symbol. */
export function applyCandle(account: Account, candle: Candle): { account: Account; closed: Trade[] } {
  const closed: Trade[] = [];
  for (const t of account.openTrades) {
    if (candle.time < t.openedAt) continue;
    const hit = exitFor(t, candle);
    if (hit) closed.push(closeOne(t, hit.price, candle.time, hit.reason));
  }
  return { account: closed.length ? settle(account, closed) : account, closed };
}

export function closeTrade(account: Account, tradeId: string, price: number, time: number): { account: Account; trade: Trade } {
  const t = account.openTrades.find((x) => x.id === tradeId);
  if (!t) throw new Error("This trade is not open.");
  if (!isPositive(price)) throw new Error("Price must be a number greater than 0.");
  const trade = closeOne(t, price, time, "manual");
  return { account: settle(account, [trade]), trade };
}

/** P&L if the trade were closed now at `price`, entry and exit fees included. */
export function unrealizedPnl(trade: Trade, price: number): number {
  return netPnl(trade, price);
}

export function equity(account: Account, price: number): number {
  return account.balance + account.openTrades.reduce((s, t) => s + netPnl(t, price), 0);
}
