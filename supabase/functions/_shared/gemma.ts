// Minimal Gemma client for the Gemini API. All instructions go in the user turn:
// Gemma on this API does not support systemInstruction or responseMimeType.

export type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GemmaOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  /** Total time for the call, including one retry on a 5xx. */
  timeoutMs?: number;
  /** Gemma 4 thinks before answering; "minimal" cuts latency a lot. null = model default. */
  thinkingLevel?: "minimal" | "low" | "medium" | "high" | null;
  /** Identical requests sent at once; the first answer wins. Default 2. */
  parallel?: number;
};

const API = "https://generativelanguage.googleapis.com/v1beta/models";

export async function callGemma(parts: Part[], opts: GemmaOptions = {}): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMMA_MODEL");
  if (!apiKey || !model) throw new Error("GEMINI_API_KEY or GEMMA_MODEL is not set");

  const thinkingLevel = opts.thinkingLevel === undefined ? "minimal" : opts.thinkingLevel;
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.4,
    maxOutputTokens: opts.maxOutputTokens ?? 1200,
  };
  if (thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel };
  const body = JSON.stringify({ contents: [{ role: "user", parts }], generationConfig });

  const timeoutMs = opts.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // One request: retries a 5xx once (the API returns sporadic 500/503s).
  const lane = async (): Promise<string> => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (res.status >= 500 && attempt === 1) {
        await res.body?.cancel();
        continue;
      }
      if (!res.ok) throw new Error(`Gemma HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
      const data = await res.json();
      const outParts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
      const text = outParts.filter((p) => p.thought !== true).map((p) => p.text ?? "").join("");
      if (!text.trim()) {
        throw new Error(`Gemma returned no text (finishReason ${data?.candidates?.[0]?.finishReason ?? "?"})`);
      }
      return text;
    }
  };

  try {
    // Latency on this API is dominated by queueing, so identical parallel requests
    // cut the wait a lot: the first answer wins and the rest are aborted.
    return await Promise.any(Array.from({ length: Math.max(1, opts.parallel ?? 2) }, lane));
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`Gemma timed out after ${timeoutMs} ms`);
    throw e instanceof AggregateError ? e.errors[0] : e;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
