// Calls a Supabase Edge Function with a JSON body and prints status, latency and response.
// Run: npx tsx scripts/call-function.ts <function-name> <json-file>
// Needs SUPABASE_URL and SUPABASE_ANON_KEY in .env.local at the repo root
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY also work).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) fail(`Missing ${file}. Add SUPABASE_URL=... and SUPABASE_ANON_KEY=... to it.`);
  const env: Record<string, string> = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || !m[1]) continue;
    let value = (m[2] ?? "").trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    value = quoted ? (quoted[2] ?? "") : value.replace(/\s+#.*$/, "");
    env[m[1]] = value;
  }
  return env;
}

// Long strings such as audioBase64 are replaced by their length.
function shorten(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shorten);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) =>
      [k, k === "audioBase64" && typeof v === "string" ? `<${v.length} base64 chars>` : shorten(v)]));
  }
  return value;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) fail("Usage: npx tsx scripts/call-function.ts <function-name> <json-file>");

  const env = readEnv(ENV_FILE);
  const url = env["SUPABASE_URL"] ?? env["VITE_SUPABASE_URL"];
  const key = env["SUPABASE_ANON_KEY"] ?? env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !key) fail(`SUPABASE_URL and SUPABASE_ANON_KEY must be set in ${ENV_FILE}`);

  const path = resolve(file);
  if (!existsSync(path)) fail(`File not found: ${path}`);
  const body = readFileSync(path, "utf8");
  try {
    JSON.parse(body);
  } catch (e) {
    fail(`${path} is not valid JSON: ${(e as Error).message}`);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` };
  // New-style publishable keys (sb_publishable_...) are not JWTs; the gateway rejects them as a Bearer token.
  if (key.startsWith("sb_")) delete headers["Authorization"];

  const endpoint = `${url.replace(/\/$/, "")}/functions/v1/${name}`;
  console.log(`POST ${endpoint}  (${path})`);
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    console.error(`Request failed after ${Math.round(performance.now() - started)} ms: ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }
  const text = await res.text();
  const ms = Math.round(performance.now() - started);
  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log(`Latency: ${ms} ms`);
  try {
    console.log(JSON.stringify(shorten(JSON.parse(text)), null, 2));
  } catch {
    console.log(text);
  }
  // exitCode instead of process.exit(): exiting while the socket closes crashes Node on Windows.
  if (!res.ok) process.exitCode = 1;
}

void main();
