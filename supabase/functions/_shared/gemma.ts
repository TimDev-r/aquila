// Minimal Gemma client for the Gemini API. All instructions go in the user turn:
// Gemma on this API does not support systemInstruction or responseMimeType.

export type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GemmaOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  /** Total time for the call, including retries and the hedged request. */
  timeoutMs?: number;
  /** Gemma 4 thinks before answering; "minimal" cuts latency a lot. null = model default. */
  thinkingLevel?: "minimal" | "low" | "medium" | "high" | null;
  /** Send a second identical request if the first has not answered by then. null = never. */
  hedgeAfterMs?: number | null;
};

const API = "https://generativelanguage.googleapis.com/v1beta/models";
/** Don't retry when less than this is left: a Gemma answer takes 7 s or more. */
const MIN_RETRY_TIME_MS = 6_000;
const BACKOFF_MS = { rateLimited: 1_500, serverError: 400 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  const timeoutMs = opts.timeoutMs ?? 18_000;
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // One request; retries a 429 or 5xx once after a short backoff if time allows.
  const lane = async (name: string): Promise<string> => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300).replace(/\s+/g, " ");
        console.error(`gemma ${name} attempt ${attempt}: HTTP ${res.status} ${detail}`);
        const backoff = res.status === 429 ? BACKOFF_MS.rateLimited : res.status >= 500 ? BACKOFF_MS.serverError : null;
        if (backoff !== null && attempt === 1 && deadline - Date.now() - backoff > MIN_RETRY_TIME_MS) {
          await sleep(backoff);
          continue;
        }
        throw new Error(`Gemma HTTP ${res.status}: ${detail}`);
      }
      const data = await res.json();
      const outParts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
      const text = outParts.filter((p) => p.thought !== true).map((p) => p.text ?? "").join("");
      if (!text.trim()) {
        const reason = `Gemma returned no text (finishReason ${data?.candidates?.[0]?.finishReason ?? "?"})`;
        console.error(`gemma ${name}: ${reason}`);
        throw new Error(reason);
      }
      return text;
    }
  };

  try {
    // Latency here is mostly queueing on Google's side, so a slow request is
    // hedged with a second one; whichever answers first wins. Only slow calls
    // are doubled, which keeps the request rate (and 429s) down.
    const first = lane("request 1");
    const hedgeAfter = opts.hedgeAfterMs === undefined ? 7_000 : opts.hedgeAfterMs;
    if (hedgeAfter === null || hedgeAfter >= timeoutMs - MIN_RETRY_TIME_MS) return await first;
    let hedgeStarted = false;
    const hedge = new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => {
        hedgeStarted = true;
        lane("request 2 (hedge)").then(resolve, reject);
      }, hedgeAfter);
      first.then(() => clearTimeout(t), () => {
        if (!hedgeStarted) {
          clearTimeout(t);
          reject(new Error("hedge not needed"));
        }
      });
    });
    return await Promise.any([first, hedge]);
  } catch (e) {
    const err = e instanceof AggregateError ? e.errors[0] : e;
    if (controller.signal.aborted) {
      console.error(`gemma: timed out after ${timeoutMs} ms`);
      throw new Error(`Gemma timed out after ${timeoutMs} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
