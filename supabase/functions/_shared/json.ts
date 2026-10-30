import { callGemma, type GemmaOptions, type Part } from "./gemma.ts";

const RETRY_TEXT =
  "Your previous answer was not valid JSON for the schema. Reply again with ONLY the JSON object, no prose, no code fences.";

/** Stats for the selftest table. */
export type AskStats = { retries: number; errors: string[] };

export type AskOptions = GemmaOptions & {
  /** Total Gemma budget for both attempts. The frontend gives up after 25 s, so stay well under. */
  budgetMs?: number;
  stats?: AskStats;
};

export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the answer");
  return JSON.parse(unfenced.slice(start, end + 1));
}

/** Asks Gemma for JSON, validates it and retries once with a correction note. */
export async function askJson<T>(
  parts: Part[],
  validate: (raw: unknown) => T,
  opts: AskOptions = {},
): Promise<T> {
  const { budgetMs = 18_000, stats, ...gemmaOpts } = opts;
  const deadline = Date.now() + budgetMs;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    // A second attempt only helps if a full Gemma answer (7 s+) still fits.
    if (attempt === 2 && remaining < 7_000) break;
    if (attempt === 2 && stats) stats.retries++;
    const attemptParts = attempt === 1 ? parts : [...parts, { text: RETRY_TEXT }];
    try {
      const text = await callGemma(attemptParts, { ...gemmaOpts, timeoutMs: remaining });
      return validate(extractJson(text));
    } catch (e) {
      lastError = e;
      const reason = String((e as Error).message ?? e).slice(0, 300);
      console.error(`askJson attempt ${attempt} failed: ${reason}`);
      stats?.errors.push(reason.slice(0, 200));
      // A timeout leaves no time for a second try; missing config or quota won't fix itself.
      if (/timed out|is not set|quota exhausted/.test(reason)) break;
    }
  }
  throw lastError ?? new Error("Gemma budget exhausted");
}
