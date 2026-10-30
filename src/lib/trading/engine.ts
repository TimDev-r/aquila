// STUB by Person 1 — Person 3 replaces this. Pure functions, never mutate inputs.
import type { Account, Candle, ExitReason, Side, Trade } from "../contracts";

export function createAccount(startingBalance = 10000): Account {
  return { startingBalance, balance: startingBalance, openTrades: [], closedTrades: [] };
}

function pnlFor(trade: Trade, price: number): number {
  return trade.side === "long" ? (price - trade.entryPrice) * trade.size : (trade.entryPrice - price) * trade.size;
}

export function openTrade(
  account: Account,
  p: { symbol: string; side: Side; size: number; price: number; stopLoss?: number | null; takeProfit?: number | null; thesis: string; time: number },
): { account: Account; trade: Trade } {
  if (!p.thesis || p.thesis.trim().length < 20) throw new Error("Explain your reason in at least 20 characters.");
  if (!(p.size > 0)) throw new Error("Size must be greater than 0.");
  const trade: Trade = {
    id: `t_${p.time}_${Math.random().toString(36).slice(2, 8)}`,
    symbol: p.symbol, side: p.side, size: p.size, entryPrice: p.price, exitPrice: null,
    stopLoss: p.stopLoss ?? null, takeProfit: p.takeProfit ?? null, thesis: p.thesis.trim(),
    openedAt: p.time, closedAt: null, pnl: null, exitReason: null,
  };
  return { account: { ...account, openTrades: [...account.openTrades, trade] }, trade };
}

function close(account: Account, trade: Trade, price: number, time: number, reason: ExitReason) {
  const pnl = pnlFor(trade, price);
  const closed: Trade = { ...trade, exitPrice: price, closedAt: time, pnl, exitReason: reason };
  return {
    account: {
      ...account,
      balance: account.balance + pnl,
      openTrades: account.openTrades.filter((t) => t.id !== trade.id),
      closedTrades: [...account.closedTrades, closed],
    },
    trade: closed,
  };
}

export function applyCandle(account: Account, candle: Candle): { account: Account; closed: Trade[] } {
  let acc = account;
  const closed: Trade[] = [];
  for (const t of account.openTrades) {
    let hit: { price: number; reason: ExitReason } | null = null;
    if (t.side === "long") {
      if (t.stopLoss != null && candle.low <= t.stopLoss) hit = { price: t.stopLoss, reason: "stop_loss" };
      else if (t.takeProfit != null && candle.high >= t.takeProfit) hit = { price: t.takeProfit, reason: "take_profit" };
    } else {
      if (t.stopLoss != null && candle.high >= t.stopLoss) hit = { price: t.stopLoss, reason: "stop_loss" };
      else if (t.takeProfit != null && candle.low <= t.takeProfit) hit = { price: t.takeProfit, reason: "take_profit" };
    }
    if (hit) {
      const r = close(acc, t, hit.price, candle.time, hit.reason);
      acc = r.account;
      closed.push(r.trade);
    }
  }
  return { account: acc, closed };
}

export function closeTrade(account: Account, tradeId: string, price: number, time: number): { account: Account; trade: Trade } {
  const t = account.openTrades.find((x) => x.id === tradeId);
  if (!t) throw new Error("Trade not found.");
  return close(account, t, price, time, "manual");
}

export function unrealizedPnl(trade: Trade, price: number): number {
  return pnlFor(trade, price);
}

export function equity(account: Account, price: number): number {
  return account.balance + account.openTrades.reduce((s, t) => s + pnlFor(t, price), 0);
}
