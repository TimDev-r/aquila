// Core logic of review-trade, separate from index.ts so selftest.ts can call it directly.
import type { Candle, LessonTag, Trade, TradeReview } from "../_shared/contracts.ts";
import { HttpError } from "../_shared/cors.ts";
import { askJson, type AskStats } from "../_shared/json.ts";
import { tradeReviewPrompt } from "../_shared/prompts.ts";
import { validateTradeReview, verdictFor } from "../_shared/validate.ts";

const STARTING_BALANCE = 10_000;
const CONTEXT_CANDLES = 30;

export type TradeFacts = {
  side: Trade["side"];
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  durationMinutes: number | null;
  exitReason: Trade["exitReason"];
  hasStopLoss: boolean;
  stopDistancePct: number | null;
  hasTakeProfit: boolean;
  riskReward: number | null;
  positionValuePct: number;
  trendBeforeEntryPct: number | null;
  maxFavorablePct: number | null;
  maxAdversePct: number | null;
  thesisLength: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseReviewRequest(body: unknown): { trade: Trade; candles: Candle[] } {
  const b = body as { trade?: Partial<Trade>; candles?: unknown };
  const t = b?.trade;
  if (!t || typeof t !== "object") throw new HttpError(400, "Missing trade");
  if (t.side !== "long" && t.side !== "short") throw new HttpError(400, "trade.side must be long or short");
  if (!isNum(t.entryPrice) || t.entryPrice <= 0) throw new HttpError(400, "trade.entryPrice must be a positive number");
  if (!isNum(t.exitPrice) || t.exitPrice <= 0) throw new HttpError(400, "trade.exitPrice must be set (the trade must be closed)");
  if (!isNum(t.size) || t.size <= 0) throw new HttpError(400, "trade.size must be a positive number");
  if (!isNum(t.openedAt)) throw new HttpError(400, "trade.openedAt must be a UNIX time in seconds");
  if (typeof t.thesis !== "string") throw new HttpError(400, "trade.thesis must be a string");
  if (!Array.isArray(b.candles)) throw new HttpError(400, "candles must be an array");
  const candles = (b.candles as Candle[]).filter((c) =>
    c && isNum(c.time) && isNum(c.open) && isNum(c.high) && isNum(c.low) && isNum(c.close)
  ).toSorted((a, z) => a.time - z.time);
  return { trade: t as Trade, candles };
}

export function computeFacts(trade: Trade, candles: Candle[]): TradeFacts {
  const { side, entryPrice: entry, stopLoss: stop, takeProfit: tp } = trade;
  const exit = trade.exitPrice as number;
  const dir = side === "long" ? 1 : -1;
  const pnl = isNum(trade.pnl) ? trade.pnl : (exit - entry) * trade.size * dir;

  const before = candles.filter((c) => c.time < trade.openedAt).slice(-CONTEXT_CANDLES);
  const closedAt = isNum(trade.closedAt) ? trade.closedAt : Infinity;
  const during = candles.filter((c) => c.time >= trade.openedAt && c.time <= closedAt);

  let maxFavorablePct: number | null = null;
  let maxAdversePct: number | null = null;
  if (during.length) {
    const hi = Math.max(...during.map((c) => c.high));
    const lo = Math.min(...during.map((c) => c.low));
    const up = ((hi - entry) / entry) * 100;
    const down = ((entry - lo) / entry) * 100;
    maxFavorablePct = r2(Math.max(0, side === "long" ? up : down));
    maxAdversePct = r2(Math.max(0, side === "long" ? down : up));
  }

  const hasStopLoss = isNum(stop);
  const hasTakeProfit = isNum(tp);
  return {
    side,
    symbol: trade.symbol,
    entryPrice: entry,
    exitPrice: exit,
    pnl: r2(pnl),
    pnlPct: r2(((exit - entry) / entry) * 100 * dir),
    durationMinutes: isNum(trade.closedAt) ? Math.round((trade.closedAt - trade.openedAt) / 60) : null,
    exitReason: trade.exitReason ?? null,
    hasStopLoss,
    stopDistancePct: hasStopLoss ? r2((Math.abs(entry - stop) / entry) * 100) : null,
    hasTakeProfit,
    riskReward: hasStopLoss && hasTakeProfit && stop !== entry ? r2(Math.abs(tp - entry) / Math.abs(entry - stop)) : null,
    positionValuePct: r2(((trade.size * entry) / STARTING_BALANCE) * 100),
    trendBeforeEntryPct: before.length >= 2
      ? r2(((before[before.length - 1].close - before[0].close) / before[0].close) * 100)
      : null,
    maxFavorablePct,
    maxAdversePct,
    thesisLength: trade.thesis.trim().length,
  };
}

const THESIS_WORDS =
  /support|resistance|trend|breakout|bounce|level|stop|risk|volume|pattern|\brsi\b|moving average|\bma\b/i;

export function ruleBasedReview(f: TradeFacts, thesis: string): TradeReview {
  const specificThesis = thesis.trim().length >= 60 && THESIS_WORDS.test(thesis);
  const sensibleStop = f.stopDistancePct !== null && f.stopDistancePct >= 0.2 && f.stopDistancePct <= 5;
  const goodRR = f.riskReward !== null && f.riskReward >= 1.5;
  const oversized = f.positionValuePct > 20;

  let score = 40;
  if (specificThesis) score += 20;
  if (f.hasStopLoss) score += 20;
  if (sensibleStop) score += 10;
  if (goodRR) score += 10;
  if (oversized) score -= 20;
  score = Math.min(100, Math.max(0, score));

  const whatWentWell: string[] = [];
  const mistakes: string[] = [];
  if (specificThesis) whatWentWell.push("Your reason pointed at something on the chart you could check.");
  else mistakes.push("Your reason was vague; name a level, trend or pattern you can see.");
  if (f.hasStopLoss) whatWentWell.push("You set a stop loss, so your risk was limited.");
  else mistakes.push("There was no stop loss, so the possible loss had no limit.");
  if (f.hasStopLoss && !sensibleStop) mistakes.push(`Your stop was ${f.stopDistancePct}% away; between 0.2% and 5% is usually more sensible.`);
  if (goodRR) whatWentWell.push(`Your target paid ${f.riskReward}x what you risked.`);
  if (oversized) mistakes.push(`You put ${f.positionValuePct}% of your balance in one trade; under 20% is safer.`);

  const lessonTag: LessonTag = !f.hasStopLoss ? "stop_loss" : oversized ? "position_sizing" : !specificThesis
    ? "support_resistance"
    : !goodRR
    ? "risk_reward"
    : "psychology";
  const verdict = verdictFor(score, f.pnl);

  const summary = {
    lucky: "You made money, but the plan behind it was weak, so this profit was mostly luck.",
    unlucky: "You lost money, but your plan was sound; a good process can still lose.",
    great: "A clear reason and solid risk control: this is how a well-planned trade looks.",
    good: "A decent plan with room to sharpen; keep building on what worked.",
    poor: "This trade lacked a clear plan; focus on one fix for next time.",
  }[verdict];
  const coachLine = {
    lucky: "A win without a plan is luck. Let's turn luck into skill, one clear reason at a time.",
    unlucky: "Good plan, bad outcome. Keep the process; the results follow over many trades.",
    great: "Sharp eyes and a steady wing. That is a trade worth repeating.",
    good: "Solid flying. Tighten one thing, and you'll soar even higher.",
    poor: "Every eagle learns to fly by falling. Pick one fix and try again.",
  }[verdict];

  return {
    score,
    verdict,
    summary,
    whatWentWell: whatWentWell.slice(0, 3),
    mistakes: mistakes.slice(0, 3),
    lessonTag,
    coachLine,
    source: "fallback",
  };
}

export function candleRows(trade: Trade, candles: Candle[]): string {
  return candles
    .filter((c) => c.time < trade.openedAt)
    .slice(-CONTEXT_CANDLES)
    .map((c) => JSON.stringify([c.time, r2(c.open), r2(c.high), r2(c.low), r2(c.close)]))
    .join("\n") || "(no candles before entry)";
}

export async function reviewTrade(trade: Trade, candles: Candle[], stats?: AskStats): Promise<TradeReview> {
  const facts = computeFacts(trade, candles);
  const prompt = tradeReviewPrompt(JSON.stringify(facts, null, 2), trade.thesis, candleRows(trade, candles));
  try {
    return await askJson([{ text: prompt }], (raw) => validateTradeReview(raw, facts.pnl), { stats });
  } catch (e) {
    console.error("review-trade: Gemma failed, using rule-based review:", (e as Error).message);
    return ruleBasedReview(facts, trade.thesis);
  }
}
