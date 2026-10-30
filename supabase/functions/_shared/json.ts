import { callGemma, type GemmaOptions, type Part } from "./gemma.ts";

const RETRY_TEXT =
  "Your previous answer was not valid JSON for the schema. Reply again with ONLY the JSON object, no prose, no code fences.";

/** Stats for the selftest table. */
export type AskStats = { retries: number; errors: string[] };

export type AskOptions = GemmaOptions & {
  /** Total budget for both attempts. The frontend gives up after 25 s. */
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
  const { budgetMs = 22_000, stats, ...gemmaOpts } = opts;
  const deadline = Date.now() + budgetMs;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) break;
    if (attempt === 2 && stats) stats.retries++;
    const attemptParts = attempt === 1 ? parts : [...parts, { text: RETRY_TEXT }];
    try {
      const text = await callGemma(attemptParts, { ...gemmaOpts, timeoutMs: Math.min(remaining, 20_000) });
      return validate(extractJson(text));
    } catch (e) {
      lastError = e;
      stats?.errors.push(String((e as Error).message ?? e).slice(0, 200));
      // A timeout leaves no time for a second try.
      if (String((e as Error).message).includes("timed out")) break;
    }
  }
  throw lastError ?? new Error("Gemma budget exhausted");
}
