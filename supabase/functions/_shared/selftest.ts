// Calls each function's core logic directly with sample data and checks the shapes.
// Run from the repo root:
//   deno run -A --no-lock --env-file=.env.local supabase/functions/_shared/selftest.ts
// Add --eval to also run every sample trade twice through Gemma and print a table
// (paced for the free tier's 16k input tokens per minute, takes ~4 minutes);
// --eval=review or --eval=quiz runs only that part.
import type { Candle, ChartAnalysis, QuizQuestion, Trade, TradeReview } from "./contracts.ts";
import { HttpError } from "./cors.ts";
import type { AskStats } from "./json.ts";
import { chartPng } from "./chartPng.ts";
import { promptDocs } from "./promptDocs.ts";
import { LESSON_TAGS, verdictFor } from "./validate.ts";
import { computeFacts, parseReviewRequest, reviewTrade, ruleBasedReview } from "../review-trade/review.ts";
import { fallbackQuiz, generateQuiz, parseQuizRequest } from "../generate-quiz/quiz.ts";
import { analyzeChart, fallbackAnalysis, parseChartRequest } from "../analyze-chart/analyze.ts";

const root = new URL("../../../", import.meta.url);
let failures = 0;

function check(ok: boolean, label: string) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) failures++;
}

async function timed<T>(fn: (stats: AskStats) => Promise<T>): Promise<{ result: T; ms: number; stats: AskStats }> {
  const stats: AskStats = { retries: 0, errors: [] };
  const t = performance.now();
  const result = await fn(stats);
  return { result, ms: Math.round(performance.now() - t), stats };
}

function isQuestion(q: QuizQuestion): boolean {
  return typeof q.id === "string" && typeof q.question === "string" && q.options.length === 4 &&
    q.options.every((o) => typeof o === "string") && Number.isInteger(q.correctIndex) &&
    q.correctIndex >= 0 && q.correctIndex <= 3 && typeof q.explanation === "string" && LESSON_TAGS.includes(q.tag);
}

function isReview(r: TradeReview): boolean {
  return Number.isInteger(r.score) && r.score >= 0 && r.score <= 100 &&
    ["great", "good", "lucky", "unlucky", "poor"].includes(r.verdict) && typeof r.summary === "string" &&
    Array.isArray(r.whatWentWell) && r.whatWentWell.length <= 3 && Array.isArray(r.mistakes) && r.mistakes.length <= 3 &&
    LESSON_TAGS.includes(r.lessonTag) && r.coachLine.split(/\s+/).length <= 25 && ["gemma", "fallback"].includes(r.source);
}

function isAnalysis(a: ChartAnalysis): boolean {
  return typeof a.isChart === "boolean" && typeof a.pattern === "string" &&
    ["up", "down", "sideways", "unclear"].includes(a.trend) && typeof a.explanation === "string" &&
    Array.isArray(a.keyLevels) && a.keyLevels.length <= 3 && isQuestion(a.followUp) && ["gemma", "fallback"].includes(a.source);
}

function expectHttp(status: number, fn: () => unknown, label: string) {
  try {
    fn();
    check(false, `${label} -> expected ${status}`);
  } catch (e) {
    check(e instanceof HttpError && e.status === status, `${label} -> ${status}`);
  }
}

function source(s: string, stats: AskStats) {
  return `source=${s}${stats.retries ? ` retries=${stats.retries}` : ""}${stats.errors.length ? ` errors=${JSON.stringify(stats.errors)}` : ""}`;
}

// ---------- sample data ----------

/** Deterministic hourly BTC candles: a choppy sideways stretch, then a drift up. */
function makeCandles(n: number, start: number, startPrice: number, driftPct: number): Candle[] {
  let seed = 42;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open * (1 + (rand() - 0.5) * 0.008 + (i >= 40 ? driftPct / 100 : 0));
    const high = Math.max(open, close) * (1 + rand() * 0.003);
    const low = Math.min(open, close) * (1 - rand() * 0.003);
    out.push({ time: start + i * 3600, open, high, low, close, volume: 100 + rand() * 50 });
    price = close;
  }
  return out;
}

const T0 = 1_790_000_000 - (1_790_000_000 % 3600);
const btcCandles = makeCandles(64, T0, 60_000, 0.25);
const entryCandle = btcCandles[40];
const entryPrice = Math.round(entryCandle.open * 100) / 100;
const exitPrice = Math.round(entryPrice * 1.04 * 100) / 100;
const luckyTrade: Trade = {
  id: "selftest-lucky",
  symbol: "BTCUSDT",
  side: "long",
  size: 0.02,
  entryPrice,
  exitPrice,
  stopLoss: null,
  takeProfit: null,
  thesis: "feels like it will go up, I have a good feeling",
  openedAt: entryCandle.time,
  closedAt: btcCandles[60].time,
  pnl: Math.round((exitPrice - entryPrice) * 0.02 * 100) / 100,
  exitReason: "manual",
};

// ---------- checks ----------

console.log("\n== static checks");
const contractsCopy = await Deno.readTextFile(new URL("contracts.ts", import.meta.url));
check(contractsCopy === await Deno.readTextFile(new URL("src/lib/contracts.ts", root)), "_shared/contracts.ts equals src/lib/contracts.ts");
for (const doc of promptDocs()) {
  const onDisk = await Deno.readTextFile(new URL(`prompts/${doc.file}`, root)).catch(() => "");
  check(onDisk === doc.markdown, `prompts/${doc.file} in sync with prompts.ts (else run _shared/gen.ts)`);
}
expectHttp(400, () => parseReviewRequest({}), "review-trade without trade");
expectHttp(400, () => parseReviewRequest({ trade: { ...luckyTrade, exitPrice: null }, candles: [] }), "review-trade open trade");
expectHttp(400, () => parseQuizRequest({ tag: "nope", difficulty: 1 }), "generate-quiz bad tag");
expectHttp(400, () => parseQuizRequest({ tag: "trend", difficulty: 4 }), "generate-quiz bad difficulty");
check(parseQuizRequest({ tag: "trend", difficulty: 1, count: 50 }).count === 8, "generate-quiz count capped at 8");
expectHttp(400, () => parseChartRequest({ imageBase64: "abc", mimeType: "image/gif" }), "analyze-chart bad mimeType");
expectHttp(413, () => parseChartRequest({ imageBase64: "A".repeat(5_600_000), mimeType: "image/png" }), "analyze-chart huge image");

console.log("\n== review-trade: lucky trade (long BTC, no stop, gut feeling, +4%)");
const facts = computeFacts(luckyTrade, btcCandles);
console.log(JSON.stringify(facts));
const rule = ruleBasedReview(facts, luckyTrade.thesis);
check(isReview(rule) && rule.verdict === "lucky", `fallback: verdict=${rule.verdict} score=${rule.score} lessonTag=${rule.lessonTag}`);
const review = await timed((stats) => reviewTrade(luckyTrade, btcCandles, stats));
console.log(JSON.stringify(review.result, null, 2));
check(isReview(review.result), `shape ok, ${review.ms} ms, ${source(review.result.source, review.stats)}`);
check(review.result.verdict === "lucky", `verdict=${review.result.verdict} score=${review.result.score}`);

console.log("\n== generate-quiz: trend, difficulty 2, 4 questions, with candles");
const quiz = await timed((stats) => generateQuiz(parseQuizRequest({ tag: "trend", difficulty: 2, count: 4, candles: btcCandles }), stats));
for (const q of quiz.result.questions) {
  console.log(`- ${q.question}\n    ${q.options.map((o, i) => (i === q.correctIndex ? `[${o}]` : o)).join(" | ")}\n    ${q.explanation}`);
}
check(quiz.result.questions.length > 0 && quiz.result.questions.every(isQuestion) &&
  quiz.result.questions.every((q) => q.tag === "trend"), `shape ok, ${quiz.result.questions.length} questions, ${quiz.ms} ms, ${source(quiz.result.source, quiz.stats)}`);
for (const tag of LESSON_TAGS) {
  for (const count of [5, 8]) {
    const fb = fallbackQuiz(tag, count, "fb");
    const own = fb.questions.filter((q) => q.tag === tag).length;
    check(fb.questions.length === count && fb.questions.every(isQuestion) && own >= Math.min(4, count) &&
      new Set(fb.questions.map((q) => q.question)).size === count,
      `fallback quiz ${tag} x${count}: ${fb.questions.length} questions, ${own} tagged ${tag}`);
  }
}

console.log("\n== analyze-chart: rendered BTC candlestick PNG");
const png = await chartPng(btcCandles);
const { imageBase64, mimeType } = parseChartRequest({ imageBase64: png, mimeType: "image/png" });
const chart = await timed((stats) => analyzeChart(imageBase64, mimeType, stats));
console.log(JSON.stringify(chart.result, null, 2));
check(isAnalysis(chart.result), `shape ok, ${chart.ms} ms, ${source(chart.result.source, chart.stats)}`);
check(isAnalysis(fallbackAnalysis("fb")), "fallback analysis shape ok");

console.log("\n== samples from scripts/samples/ (rule-based fallback, no Gemma)");
const samplesDir = new URL("scripts/samples/", root);
const expected: Record<string, TradeReview["verdict"]> = JSON.parse(
  await Deno.readTextFile(new URL("trades/expected.json", samplesDir)).catch(() => "{}"),
);
for (const [file, want] of Object.entries(expected)) {
  const { trade, candles } = parseReviewRequest(JSON.parse(await Deno.readTextFile(new URL(`trades/${file}`, samplesDir))));
  const f = computeFacts(trade, candles);
  const r = ruleBasedReview(f, trade.thesis);
  const consistent = isReview(r) && verdictFor(r.score, f.pnl) === r.verdict &&
    (r.verdict !== "great" || r.mistakes.length === 0);
  check(r.verdict === want && consistent, `${file.padEnd(24)} expected ${want.padEnd(8)} got ${r.verdict.padEnd(8)} score ${r.score}`);
}
for await (const entry of Deno.readDir(new URL("quiz/", samplesDir))) {
  const req = parseQuizRequest(JSON.parse(await Deno.readTextFile(new URL(`quiz/${entry.name}`, samplesDir))));
  const fb = fallbackQuiz(req.tag, req.count, "fb");
  check(fb.questions.length === req.count && fb.questions.every(isQuestion),
    `quiz/${entry.name}: fallback returns ${fb.questions.length} of ${req.count}`);
}

// ~1.5k input tokens per review; one call every 8 s stays under 16k/minute.
const GAP_MS = 8_000;
let lastStart = 0;
async function pace() {
  const wait = lastStart + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastStart = Date.now();
}

const evalArg = Deno.args.find((a) => a.startsWith("--eval"));
if (evalArg) await runEval(evalArg.split("=")[1] ?? "all");

async function runEval(part: string) {
  if (part === "all" || part === "review") await evalReviews();
  if (part === "all" || part === "quiz") await evalQuizzes();
}

async function evalReviews() {
  console.log("sample                   expected verdict  score source   latency retries");
  const rows: { match: boolean; gemma: boolean; ms: number; retries: number }[] = [];
  for (const [file, want] of Object.entries(expected)) {
    const { trade, candles } = parseReviewRequest(JSON.parse(await Deno.readTextFile(new URL(`trades/${file}`, samplesDir))));
    for (let run = 1; run <= 2; run++) {
      await pace();
      const { result: r, ms, stats } = await timed((st) => reviewTrade(trade, candles, st));
      rows.push({ match: r.verdict === want, gemma: r.source === "gemma", ms, retries: stats.retries });
      console.log(
        `${file.padEnd(24)} ${want.padEnd(8)} ${r.verdict.padEnd(8)} ${String(r.score).padStart(5)} ${r.source.padEnd(8)} ` +
          `${(ms / 1000).toFixed(1).padStart(6)}s ${String(stats.retries).padStart(7)}${r.verdict === want ? "" : "  <- mismatch"}`,
      );
    }
  }
  const gemmaRows = rows.filter((r) => r.gemma);
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  console.log(
    `match rate: ${rows.filter((r) => r.match).length}/${rows.length} overall, ` +
      `${gemmaRows.filter((r) => r.match).length}/${gemmaRows.length} answered by Gemma; ` +
      `avg Gemma latency ${(avg(gemmaRows.map((r) => r.ms)) / 1000).toFixed(1)} s; ` +
      `JSON retries ${rows.reduce((a, r) => a + r.retries, 0)}; fallbacks ${rows.length - gemmaRows.length}`,
  );

}

async function evalQuizzes() {
  console.log("\n== eval: generate-quiz samples (Gemma)");
  for await (const entry of Deno.readDir(new URL("quiz/", samplesDir))) {
    const req = parseQuizRequest(JSON.parse(await Deno.readTextFile(new URL(`quiz/${entry.name}`, samplesDir))));
    await pace();
    const { result, ms, stats } = await timed((st) => generateQuiz(req, st));
    const qs = result.questions;
    const distinct = qs.every((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4);
    const positions = qs.map((q) => q.correctIndex).join("");
    const longExplanations = qs.filter((q) => (q.explanation.match(/[.!?](\s|$)/g) ?? []).length > 2).length;
    console.log(
      `${entry.name.padEnd(20)} ${result.source.padEnd(8)} ${(ms / 1000).toFixed(1)}s questions=${qs.length} ` +
        `distinctOptions=${distinct} correctIndex=${positions} explanations>2 sentences=${longExplanations} retries=${stats.retries}`,
    );
    for (const q of qs) console.log(`   - ${q.question}\n     ${q.options.map((o, i) => (i === q.correctIndex ? `[${o}]` : o)).join(" | ")}`);
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
Deno.exit(failures ? 1 : 0);
