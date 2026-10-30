// Validators for Gemma output: repair what is safe (clamp, trim, cut), throw on
// missing required fields or invalid enums so askJson can retry.
import type { ChartAnalysis, LessonTag, QuizQuestion, TradeReview } from "./contracts.ts";

export const LESSON_TAGS: LessonTag[] = [
  "candles", "trend", "support_resistance", "stop_loss", "position_sizing", "risk_reward", "psychology",
];
const VERDICTS: TradeReview["verdict"][] = ["great", "good", "lucky", "unlucky", "poor"];
const TRENDS: ChartAnalysis["trend"][] = ["up", "down", "sideways", "unclear"];

function obj(raw: unknown, what: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${what} is not an object`);
  return raw as Record<string, unknown>;
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim()).slice(0, max);
}

function enumOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  const s = typeof v === "string" ? v.trim().toLowerCase() : v;
  if (!allowed.includes(s as T)) throw new Error(`Invalid ${field}: ${JSON.stringify(v)}`);
  return s as T;
}

function int(v: unknown, field: string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`Missing ${field}`);
  return Math.round(n);
}

export function cutWords(s: string, max: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  return words.length <= max ? s : words.slice(0, max).join(" ").replace(/[,;:]$/, "") + "…";
}

export function cutSentences(s: string, max: number): string {
  const sentences = s.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!sentences || sentences.length <= max) return s;
  return sentences.slice(0, max).join("").trim();
}

/**
 * The verdict rules depend on facts the app knows exactly (pnl) and on the score,
 * so they are applied in code rather than trusted to the model.
 */
export function verdictFor(score: number, pnl: number): TradeReview["verdict"] {
  if (pnl > 0 && score < 50) return "lucky";
  if (pnl <= 0 && score >= 60) return "unlucky";
  if (score >= 80) return "great";
  if (score >= 60) return "good";
  return "poor";
}

export function validateTradeReview(raw: unknown, pnl: number): TradeReview {
  const o = obj(raw, "Review");
  const score = Math.min(100, Math.max(0, int(o.score, "score")));
  enumOf(o.verdict, VERDICTS, "verdict");
  return {
    score,
    verdict: verdictFor(score, pnl),
    summary: str(o.summary, "summary"),
    whatWentWell: strList(o.whatWentWell, 3),
    mistakes: strList(o.mistakes, 3),
    lessonTag: enumOf(o.lessonTag, LESSON_TAGS, "lessonTag"),
    coachLine: cutWords(str(o.coachLine, "coachLine"), 25),
    source: "gemma",
  };
}

/** Validates one question; the id and tag are set by the caller. */
export function validateQuestion(raw: unknown, id: string, tag: LessonTag): QuizQuestion {
  const o = obj(raw, "Question");
  if (!Array.isArray(o.options) || o.options.length !== 4) throw new Error("A question needs exactly 4 options");
  const options = o.options.map((x, i) => str(typeof x === "number" ? String(x) : x, `option ${i}`));
  const correctIndex = int(o.correctIndex, "correctIndex");
  if (correctIndex < 0 || correctIndex > 3) throw new Error(`correctIndex out of range: ${correctIndex}`);
  return {
    id,
    question: str(o.question, "question"),
    options,
    correctIndex,
    explanation: cutSentences(str(o.explanation, "explanation"), 2),
    tag,
  };
}

/** Drops invalid questions; throws only if none are usable. */
export function validateQuiz(raw: unknown, tag: LessonTag, count: number, idPrefix: string): QuizQuestion[] {
  const o = obj(raw, "Quiz");
  if (!Array.isArray(o.questions)) throw new Error("Missing questions array");
  const questions: QuizQuestion[] = [];
  for (const q of o.questions) {
    try {
      questions.push(validateQuestion(q, `${idPrefix}-${questions.length + 1}`, tag));
    } catch { /* skip the broken one */ }
    if (questions.length === count) break;
  }
  if (questions.length === 0) throw new Error("No valid questions");
  return questions;
}

export function validateChartAnalysis(raw: unknown, followUpId: string): ChartAnalysis {
  const o = obj(raw, "Analysis");
  const isChart = o.isChart === true || o.isChart === "true";
  const f = obj(o.followUp, "followUp");
  const tag = LESSON_TAGS.includes(f.tag as LessonTag) ? (f.tag as LessonTag) : "support_resistance";
  return {
    isChart,
    pattern: typeof o.pattern === "string" && o.pattern.trim() ? o.pattern.trim() : "none",
    trend: enumOf(o.trend, TRENDS, "trend"),
    explanation: str(o.explanation, "explanation"),
    keyLevels: strList(o.keyLevels, 3),
    followUp: validateQuestion(f, followUpId, tag),
    source: "gemma",
  };
}
