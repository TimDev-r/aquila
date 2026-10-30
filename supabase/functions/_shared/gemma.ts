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
/** A 429 asking to wait longer than this is a per-minute quota: give up at once. */
const MAX_RATE_LIMIT_WAIT_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Set when Google says the quota is used up ("Please retry in 48s"). Until then
 * calls fail at once, so the function answers with its fallback right away
 * instead of spending the time budget on requests that cannot succeed.
 */
let quotaBlockedUntil = 0;

function retryDelayMs(body: string): number | null {
  const m = body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) ?? body.match(/retry in (\d+(?:\.\d+)?)s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

export async function callGemma(parts: Part[], opts: GemmaOptions = {}): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMMA_MODEL");
  if (!apiKey || !model) throw new Error("GEMINI_API_KEY or GEMMA_MODEL is not set");
  if (Date.now() < quotaBlockedUntil) {
    const reason = `Gemma quota exhausted, retry in ${Math.ceil((quotaBlockedUntil - Date.now()) / 1000)} s`;
    console.error(`gemma: ${reason}`);
    throw new Error(reason);
  }

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

  // One request; retries a short 429 or a 5xx once after a backoff if time allows.
  const lane = async (name: string): Promise<string> => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        const detail = text.slice(0, 300).replace(/\s+/g, " ");
        console.error(`gemma ${name} attempt ${attempt}: HTTP ${res.status} ${detail}`);
        let backoff = res.status >= 500 ? BACKOFF_MS.serverError : null;
        if (res.status === 429) {
          const wait = retryDelayMs(text) ?? BACKOFF_MS.rateLimited;
          if (wait > MAX_RATE_LIMIT_WAIT_MS) {
            quotaBlockedUntil = Math.max(quotaBlockedUntil, Date.now() + wait);
            throw new Error(`Gemma quota exhausted (HTTP 429), retry in ${Math.ceil(wait / 1000)} s`);
          }
          backoff = wait;
        }
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
