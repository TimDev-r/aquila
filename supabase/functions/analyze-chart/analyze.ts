// Core logic of analyze-chart, separate from index.ts so selftest.ts can call it directly.
import type { ChartAnalysis } from "../_shared/contracts.ts";
import { HttpError } from "../_shared/cors.ts";
import { askJson, type AskStats } from "../_shared/json.ts";
import { chartVisionPrompt } from "../_shared/prompts.ts";
import { validateChartAnalysis } from "../_shared/validate.ts";

const MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type MimeType = (typeof MIME_TYPES)[number];
const MAX_BASE64_CHARS = 5_500_000; // ~4 MB image

export function parseChartRequest(body: unknown): { imageBase64: string; mimeType: MimeType } {
  const b = body as { imageBase64?: unknown; mimeType?: unknown };
  if (typeof b?.imageBase64 !== "string" || !b.imageBase64) throw new HttpError(400, "imageBase64 must be a non-empty string");
  if (!MIME_TYPES.includes(b.mimeType as MimeType)) throw new HttpError(400, `mimeType must be one of ${MIME_TYPES.join(", ")}`);
  // Tolerate a data: URL prefix even though the contract says to leave it out.
  const imageBase64 = b.imageBase64.replace(/^data:[^,]*,/, "");
  if (imageBase64.length > MAX_BASE64_CHARS) throw new HttpError(413, "Image too large (max about 4 MB)");
  return { imageBase64, mimeType: b.mimeType as MimeType };
}

export function fallbackAnalysis(id: string): ChartAnalysis {
  return {
    isChart: true,
    pattern: "unknown",
    trend: "unclear",
    explanation:
      "Aquila, the AI coach, is offline right now, so this chart could not be read. " +
      "Try again in a moment; meanwhile, look at whether the highs and lows are rising, falling or flat.",
    keyLevels: [],
    followUp: {
      id,
      question: "On a price chart, which sign best shows an uptrend?",
      options: [
        "Higher highs and higher lows",
        "One big green candle",
        "Price touching the same level twice",
        "Volume going down",
      ],
      correctIndex: 0,
      explanation: "An uptrend is a series of higher highs and higher lows. A single candle does not make a trend.",
      tag: "trend",
    },
    source: "fallback",
  };
}

export async function analyzeChart(imageBase64: string, mimeType: MimeType, stats?: AskStats): Promise<ChartAnalysis> {
  const id = `chart-${Date.now()}`;
  try {
    return await askJson(
      [{ text: chartVisionPrompt() }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
      (raw) => validateChartAnalysis(raw, id),
      { stats },
    );
  } catch (e) {
    console.error("analyze-chart: Gemma failed, using fallback:", (e as Error).message);
    return fallbackAnalysis(id);
  }
}
