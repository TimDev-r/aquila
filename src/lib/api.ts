import type { Candle, ChartAnalysis, LessonTag, QuizQuestion, Source, Trade, TradeReview } from "./contracts";
import reviewMock from "@/mocks/review-trade.json";
import quizMock from "@/mocks/generate-quiz.json";
import chartMock from "@/mocks/analyze-chart.json";

const TIMEOUT_MS = 25_000;

/**
 * Equivalent of supabase.functions.invoke(name, { body }) without extra packages.
 * Reads the backend URL/key from VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or _ANON_KEY).
 */
async function invoke<T>(name: string, body: unknown): Promise<T> {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const key = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? import.meta.env["VITE_SUPABASE_ANON_KEY"]) as string | undefined;
  if (!url || !key) throw new Error("Backend not configured (VITE_SUPABASE_URL / key missing)");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key };
    if (key.split(".").length === 3) headers["Authorization"] = `Bearer ${key}`;
    const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${name}`, {
      method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!data || (typeof data === "object" && "error" in data && data.error)) throw new Error(`Function returned error: ${JSON.stringify(data?.error)}`);
    return data as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Timed out after 25s");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function reviewTrade(trade: Trade, candles: Candle[]): Promise<TradeReview> {
  try {
    return await invoke<TradeReview>("review-trade", { trade, candles });
  } catch (e) {
    console.warn("[aquila] review-trade failed, using mock:", (e as Error).message);
    return { ...(reviewMock as TradeReview), source: "mock" };
  }
}

export async function generateQuiz(req: {
  tag: LessonTag; difficulty: 1 | 2 | 3; count?: number; candles?: Candle[];
}): Promise<{ questions: QuizQuestion[]; source: Source }> {
  try {
    return await invoke<{ questions: QuizQuestion[]; source: Source }>("generate-quiz", req);
  } catch (e) {
    console.warn("[aquila] generate-quiz failed, using mock:", (e as Error).message);
    const all = quizMock.questions as QuizQuestion[];
    return { questions: all.slice(0, req.count ?? all.length), source: "mock" };
  }
}

export async function analyzeChart(
  imageBase64: string, mimeType: "image/png" | "image/jpeg" | "image/webp",
): Promise<ChartAnalysis> {
  try {
    return await invoke<ChartAnalysis>("analyze-chart", { imageBase64, mimeType });
  } catch (e) {
    console.warn("[aquila] analyze-chart failed, using mock:", (e as Error).message);
    return { ...(chartMock as ChartAnalysis), source: "mock" };
  }
}
