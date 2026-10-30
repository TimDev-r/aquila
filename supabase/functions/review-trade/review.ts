// Core logic of review-trade, separate from index.ts so selftest.ts can call it directly.
import type { Candle, LessonTag, Trade, TradeReview } from "../_shared/contracts.ts";
import { HttpError } from "../_shared/cors.ts";
import { askJson, type AskStats } from "../_shared/json.ts";
import { tradeReviewPrompt } from "../_shared/prompts.ts";
import { validateTradeReview } from "../_shared/validate.ts";

const STARTING_BALANCE = 10_000;
/** Window for trendBeforeEntryPct. */
const TREND_CANDLES = 30;
/** Candles shown to Gemma; numbers cost about one token per digit, so keep it short. */
const PROMPT_CANDLES = 24;

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

  const before = candles.filter((c) => c.time < trade.openedAt).slice(-TREND_CANDLES);
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
/** "risk about 0.2% of my account": the user sized the trade by risk, not by position value. */
const SIZED_RISK = /\d+(\.\d+)?\s*%\s*of\s+(my|the)\s+(account|balance)/i;

type Issue = { tag: LessonTag; mistake: string; fix: string };

const SCORE_RANGE: Record<TradeReview["verdict"], [number, number]> = {
  lucky: [0, 45],
  poor: [0, 55],
  unlucky: [60, 100],
  good: [60, 79],
  great: [80, 100],
};

/**
 * Process first, then outcome: a weak process is "lucky" on a win and "poor" on a
 * loss; a sound process is "unlucky" on a loss, "good" on a win, and "great" only
 * with no mistakes at all. Score, summary and coachLine follow the verdict.
 */
export function ruleBasedReview(f: TradeFacts, thesis: string): TradeReview {
  const specificThesis = thesis.trim().length >= 60 && THESIS_WORDS.test(thesis);
  const stop = f.stopDistancePct;
  const sensibleStop = stop !== null && stop >= 0.2 && stop <= 5;
  const absurdStop = stop !== null && (stop < 0.2 || stop > 10);
  const goodRR = f.riskReward !== null && f.riskReward >= 1.5;
  // Share of the balance lost if the stop is hit. Kept out of the Gemma facts on
  // purpose: with it, Gemma rated almost every trade with a stop as "great".
  const accountRiskPct = stop !== null ? (f.positionValuePct * stop) / 100 : null;
  const sizedRisk = SIZED_RISK.test(thesis) && accountRiskPct !== null && accountRiskPct <= 1;
  const oversized = f.positionValuePct > 50;
  const largePosition = f.positionValuePct > 20 && !oversized && !sizedRisk;

  // Weak process: any of these makes the result luck or a deserved loss.
  const major: Issue[] = [];
  if (!f.hasStopLoss) {
    major.push({ tag: "stop_loss", mistake: "There was no stop loss, so the possible loss had no limit.", fix: "always set a stop loss" });
  }
  if (oversized) {
    major.push({
      tag: "position_sizing",
      mistake: `You put ${f.positionValuePct}% of your balance in one trade; under 20% is safer.`,
      fix: "keep each trade small",
    });
  }
  if (absurdStop) {
    major.push({
      tag: "stop_loss",
      mistake: `Your stop was ${stop}% away, so normal price noise could hit it; 0.2% to 5% is usually sensible.`,
      fix: "give your stop room to breathe",
    });
  }
  if (!specificThesis) {
    major.push({
      tag: "support_resistance",
      mistake: "Your reason was vague; name a level, trend or pattern you can see on the chart.",
      fix: "base the trade on something you can point to on the chart",
    });
  }
  // Smaller mistakes: a sound trade with any of these is "good", not "great".
  const minor: Issue[] = [];
  if (largePosition) {
    minor.push({
      tag: "position_sizing",
      mistake: `You put ${f.positionValuePct}% of your balance in one trade; under 20% is safer for a beginner.`,
      fix: "use a smaller position",
    });
  }
  if (stop !== null && !sensibleStop && !absurdStop) {
    minor.push({
      tag: "stop_loss",
      mistake: `Your stop was ${stop}% away, which is wide; 0.2% to 5% is usually sensible.`,
      fix: "tighten your stop",
    });
  }
  if (f.hasStopLoss && !goodRR) {
    minor.push({
      tag: "risk_reward",
      mistake: f.riskReward === null
        ? "There was no target, so you could not compare the reward with the risk."
        : `Your target paid only ${f.riskReward}x what you risked; aim for at least 1.5x.`,
      fix: "plan a target worth at least 1.5x your risk",
    });
  }

  const weak = major.length > 0;
  const profit = f.pnl > 0;
  const verdict: TradeReview["verdict"] = weak
    ? (profit ? "lucky" : "poor")
    : !profit
    ? "unlucky"
    : minor.length
    ? "good"
    : "great";

  const exitByPlan = f.exitReason === "stop_loss" || f.exitReason === "take_profit";
  const raw = (specificThesis ? 35 : 10) + (sizedRisk ? 5 : 0) + // thesis 0-40
    Math.min(oversized ? 10 : 40, (f.hasStopLoss ? 15 : 0) + (sensibleStop ? 10 : 0) + (goodRR ? 10 : 0) +
      (largePosition || oversized ? 0 : 5)) + // risk 0-40
    (exitByPlan ? 20 : f.hasStopLoss ? 12 : 5); // discipline 0-20
  const [lo, hi] = SCORE_RANGE[verdict];
  const score = Math.min(hi, Math.max(lo, raw));

  const whatWentWell: string[] = [];
  if (specificThesis) whatWentWell.push("Your reason pointed at something on the chart you could check.");
  if (sensibleStop) whatWentWell.push("You set a stop loss at a sensible distance, so your risk was limited.");
  if (sizedRisk) whatWentWell.push(`You sized the trade so only about ${r2(accountRiskPct!)}% of your account was at risk.`);
  if (goodRR) whatWentWell.push(`Your target paid ${f.riskReward}x what you risked.`);
  if (exitByPlan && f.hasStopLoss) whatWentWell.push("You let your plan close the trade instead of guessing.");

  const issues = [...major, ...minor];
  const fix = issues[0]?.fix;
  const summary = {
    lucky: `You made money, but the plan behind it was weak, so this profit was mostly luck. Next time, ${fix}.`,
    poor: `This trade lost money and the plan behind it was weak. The biggest fix: ${fix}.`,
    unlucky: "You lost money, but your plan was sound; a good process can still lose.",
    good: `A sound plan that worked; one thing to sharpen: ${fix}.`,
    great: "A clear reason and solid risk control: this is how a well-planned trade looks.",
  }[verdict];
  const coachLine = {
    lucky: "A win without a plan is luck. Let's turn luck into skill, one clear reason at a time.",
    poor: "Every eagle learns to fly by falling. Pick one fix and try again.",
    unlucky: "Good plan, bad outcome. Keep the process; the results follow over many trades.",
    good: "Solid flying. Tighten one thing, and you'll soar even higher.",
    great: "Sharp eyes and a steady wing. That is a trade worth repeating.",
  }[verdict];

  return {
    score,
    verdict,
    summary,
    whatWentWell: whatWentWell.slice(0, 3),
    mistakes: issues.map((i) => i.mistake).slice(0, 3),
    lessonTag: issues[0]?.tag ?? (verdict === "unlucky" ? "psychology" : "risk_reward"),
    coachLine,
    source: "fallback",
  };
}

/** [open, high, low, close] rows, oldest first, 5 significant digits (2489.28 -> 2489.3). */
export function candleRows(trade: Trade, candles: Candle[]): string {
  const p5 = (n: number) => Number(n.toPrecision(5));
  return candles
    .filter((c) => c.time < trade.openedAt)
    .slice(-PROMPT_CANDLES)
    .map((c) => JSON.stringify([p5(c.open), p5(c.high), p5(c.low), p5(c.close)]))
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
