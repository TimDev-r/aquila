export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Returns the preflight response for OPTIONS requests, otherwise null. */
export function handleOptions(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Thrown by request parsers; turned into { error } with this status. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Shared POST/JSON plumbing: CORS, body parsing, HttpError -> { error }. */
export function serveJson(handler: (body: unknown) => Promise<unknown>) {
  Deno.serve(async (req) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;
    if (req.method !== "POST") return jsonResponse({ error: "Use POST" }, 405);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    try {
      return jsonResponse(await handler(body));
    } catch (e) {
      if (e instanceof HttpError) return jsonResponse({ error: e.message }, e.status);
      console.error(e);
      return jsonResponse({ error: "Internal error" }, 500);
    }
  });
}
