// Core logic of generate-quiz, separate from index.ts so selftest.ts can call it directly.
import type { Candle, LessonTag, QuizQuestion, Source } from "../_shared/contracts.ts";
import { HttpError } from "../_shared/cors.ts";
import { EXTRA_QUESTIONS } from "../_shared/extraQuestions.ts";
import { FALLBACK_QUESTIONS } from "../_shared/fallbackQuestions.ts";
import { askJson, type AskStats } from "../_shared/json.ts";
import { quizPrompt } from "../_shared/prompts.ts";
import { LESSON_TAGS, validateQuiz } from "../_shared/validate.ts";

export type QuizRequest = { tag: LessonTag; difficulty: 1 | 2 | 3; count: number; candles: Candle[] };
export type QuizResponse = { questions: QuizQuestion[]; source: Source };

const DEFAULT_COUNT = 5;
const MAX_COUNT = 8;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseQuizRequest(body: unknown): QuizRequest {
  const b = body as Record<string, unknown>;
  if (!LESSON_TAGS.includes(b?.tag as LessonTag)) throw new HttpError(400, `tag must be one of ${LESSON_TAGS.join(", ")}`);
  if (b.difficulty !== 1 && b.difficulty !== 2 && b.difficulty !== 3) throw new HttpError(400, "difficulty must be 1, 2 or 3");
  let count = DEFAULT_COUNT;
  if (b.count !== undefined) {
    if (typeof b.count !== "number" || !Number.isInteger(b.count) || b.count < 1) {
      throw new HttpError(400, "count must be a positive integer");
    }
    count = Math.min(b.count, MAX_COUNT);
  }
  if (b.candles !== undefined && !Array.isArray(b.candles)) throw new HttpError(400, "candles must be an array");
  const candles = ((b.candles as Candle[] | undefined) ?? []).filter((c) =>
    c && [c.time, c.open, c.high, c.low, c.close].every((n) => typeof n === "number" && Number.isFinite(n))
  ).toSorted((a, z) => a.time - z.time);
  return { tag: b.tag as LessonTag, difficulty: b.difficulty, count, candles };
}

export function candleSummary(candles: Candle[]): string {
  if (candles.length < 2) return "";
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  const up = candles.filter((c) => c.close > c.open).length;
  const down = candles.filter((c) => c.close < c.open).length;
  return [
    `Numeric chart summary of ${candles.length} real candles (ask at least one question about these numbers):`,
    `- first close: ${r2(first)}`,
    `- last close: ${r2(last)}`,
    `- change: ${r2(((last - first) / first) * 100)}%`,
    `- highest high: ${r2(Math.max(...candles.map((c) => c.high)))}`,
    `- lowest low: ${r2(Math.min(...candles.map((c) => c.low)))}`,
    `- up candles: ${up}, down candles: ${down}`,
  ].join("\n");
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fallbackQuiz(tag: LessonTag, count: number, idPrefix: string): QuizResponse {
  let pool = FALLBACK_QUESTIONS.filter((q) => q.tag === tag);
  if (pool.length < count) pool = [...pool, ...EXTRA_QUESTIONS.filter((q) => q.tag === tag)];
  const questions = shuffle(pool).slice(0, count).map((q, i) => ({ ...q, id: `${idPrefix}-${i + 1}` }));
  return { questions, source: "fallback" };
}

export async function generateQuiz(req: QuizRequest, stats?: AskStats): Promise<QuizResponse> {
  const idPrefix = `q-${Date.now()}`;
  const prompt = quizPrompt(req.tag, req.difficulty, req.count, candleSummary(req.candles));
  try {
    const questions = await askJson(
      [{ text: prompt }],
      (raw) => validateQuiz(raw, req.tag, req.count, idPrefix),
      // Room for thinking plus ~200 tokens per question.
      { maxOutputTokens: 600 + 250 * req.count, stats },
    );
    return { questions, source: "gemma" };
  } catch (e) {
    console.error("generate-quiz: Gemma failed, using lesson questions:", (e as Error).message);
    return fallbackQuiz(req.tag, req.count, idPrefix);
  }
}
