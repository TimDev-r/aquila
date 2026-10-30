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

/**
 * Exactly `count` questions: the requested tag first (lessons, then extras), topped
 * up with questions from other topics, which keep their own tag.
 */
export function fallbackQuiz(tag: LessonTag, count: number, idPrefix: string): QuizResponse {
  const all = [...FALLBACK_QUESTIONS, ...EXTRA_QUESTIONS];
  const pool = [
    ...shuffle(all.filter((q) => q.tag === tag)),
    ...shuffle(all.filter((q) => q.tag !== tag)),
  ];
  const questions = pool.slice(0, count).map((q, i) => ({ ...q, id: `${idPrefix}-${i + 1}` }));
  return { questions, source: "fallback" };
}

/** Different angles per batch, so parallel batches don't write the same question. */
const FOCUSES = [
  "a practical situation with concrete prices (for example: you buy at 100 with a stop at 95)",
  "a common beginner mistake and why it goes wrong",
  "reading what a chart or a price move shows",
  "a rule of thumb applied to a short scenario",
];
const BATCH_SIZE = 2;

/** Moves the correct answer to a random position; skips options that refer to each other. */
function shuffleOptions(q: QuizQuestion): QuizQuestion {
  if (q.options.some((o) => /\b(all|none|both) of (the|these)\b|\bboth [a-d]\b/i.test(o))) return q;
  const order = shuffle([0, 1, 2, 3]);
  return { ...q, options: order.map((i) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) };
}

const words = (text: string) =>
  new Set(text.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/).filter((w) => w.length > 3));

/**
 * Parallel batches can't see each other and like the same classic scenario, so
 * near-duplicates are dropped by word overlap (Jaccard). In Gemma's output,
 * rewordings of one scenario scored 0.31-0.58 and different questions <= 0.26.
 */
function isDuplicate(text: string, kept: Set<string>[]): boolean {
  const a = words(text);
  return kept.some((b) => {
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    return shared / (a.size + b.size - shared) >= 0.3;
  });
}

export async function generateQuiz(req: QuizRequest, stats?: AskStats): Promise<QuizResponse> {
  const idPrefix = `q-${Date.now()}`;
  const summary = candleSummary(req.candles);
  // Gemma writes ~27 tokens/s here, so one call for 5 questions takes 25 s+.
  // Parallel batches of up to 2 questions finish in about the time of one.
  const sizes = Array.from({ length: Math.ceil(req.count / BATCH_SIZE) }, (_, i) =>
    Math.min(BATCH_SIZE, req.count - i * BATCH_SIZE));
  const batches = await Promise.allSettled(sizes.map((n, i) =>
    askJson(
      [{ text: quizPrompt(req.tag, req.difficulty, n, i === 0 ? summary : "", FOCUSES[i % FOCUSES.length]) }],
      (raw) => validateQuiz(raw, req.tag, n, `${idPrefix}-b${i}`),
      // Room for thinking plus ~250 tokens per question; hedge late, batches are short.
      { maxOutputTokens: 400 + 250 * n, hedgeAfterMs: 10_000, stats },
    )
  ));

  const kept: Set<string>[] = [];
  const questions: QuizQuestion[] = [];
  for (const b of batches) {
    if (b.status === "rejected") {
      console.error("generate-quiz: a batch failed:", (b.reason as Error)?.message);
      continue;
    }
    for (const q of b.value) {
      if (questions.length < req.count && !isDuplicate(q.question, kept)) {
        kept.push(words(q.question));
        questions.push(shuffleOptions(q));
      }
    }
  }
  if (questions.length === 0) {
    console.error("generate-quiz: Gemma failed, using lesson questions");
    return fallbackQuiz(req.tag, req.count, idPrefix);
  }
  // A failed batch or dropped duplicates are topped up with lesson questions.
  const topUp = fallbackQuiz(req.tag, req.count, idPrefix).questions
    .filter((q) => !isDuplicate(q.question, kept))
    .slice(0, req.count - questions.length);
  return {
    questions: [...questions, ...topUp].map((q, i) => ({ ...q, id: `${idPrefix}-${i + 1}` })),
    source: "gemma",
  };
}
