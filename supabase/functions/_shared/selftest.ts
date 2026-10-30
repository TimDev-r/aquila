// Calls each function's core logic directly with sample data and checks the shapes.
// Run from the repo root:
//   deno run -A --no-lock --env-file=.env.local supabase/functions/_shared/selftest.ts
import type { Candle, ChartAnalysis, QuizQuestion, Trade, TradeReview } from "./contracts.ts";
import { HttpError } from "./cors.ts";
import type { AskStats } from "./json.ts";
import { promptDocs } from "./promptDocs.ts";
import { LESSON_TAGS } from "./validate.ts";
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

// ---------- tiny PNG chart renderer (no dependencies) ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function chartPng(candles: Candle[], w = 640, h = 360): Promise<string> {
  const px = new Uint8Array(w * h * 3).fill(255);
  const set = (x: number, y: number, [r, g, b]: number[]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    px.set([r, g, b], (y * w + x) * 3);
  };
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const y = (p: number) => Math.round(20 + ((hi - p) / (hi - lo)) * (h - 40));
  for (let gy = 20; gy < h - 20; gy += 40) for (let x = 0; x < w; x++) set(x, gy, [235, 235, 235]);
  const step = (w - 40) / candles.length;
  candles.forEach((c, i) => {
    const cx = Math.round(20 + i * step + step / 2);
    const color = c.close >= c.open ? [22, 163, 74] : [220, 38, 38];
    for (let yy = y(c.high); yy <= y(c.low); yy++) set(cx, yy, color);
    const top = Math.min(y(c.open), y(c.close));
    const bottom = Math.max(y(c.open), y(c.close), top + 1);
    for (let yy = top; yy <= bottom; yy++) for (let dx = -3; dx <= 3; dx++) set(cx + dx, yy, color);
  });
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let row = 0; row < h; row++) raw.set(px.subarray(row * w * 3, (row + 1) * w * 3), row * (w * 3 + 1) + 1);
  const zlib = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts: Uint8Array<ArrayBuffer>[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib), chunk("IEND", new Uint8Array())];
  const png = new Uint8Array(await new Blob(parts).arrayBuffer());
  let bin = "";
  for (const b of png) bin += String.fromCharCode(b);
  return btoa(bin);
}

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
  const fb = fallbackQuiz(tag, 5, "fb");
  check(fb.questions.length >= 3 && fb.questions.every(isQuestion) && fb.questions.every((q) => q.tag === tag),
    `fallback quiz for ${tag}: ${fb.questions.length} questions`);
}

console.log("\n== analyze-chart: rendered BTC candlestick PNG");
const png = await chartPng(btcCandles);
const { imageBase64, mimeType } = parseChartRequest({ imageBase64: png, mimeType: "image/png" });
const chart = await timed((stats) => analyzeChart(imageBase64, mimeType, stats));
console.log(JSON.stringify(chart.result, null, 2));
check(isAnalysis(chart.result), `shape ok, ${chart.ms} ms, ${source(chart.result.source, chart.stats)}`);
check(isAnalysis(fallbackAnalysis("fb")), "fallback analysis shape ok");

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
Deno.exit(failures ? 1 : 0);
