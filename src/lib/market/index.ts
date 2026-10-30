// Market data: Binance REST + WebSocket, with replay data as the offline fallback.
import type { Candle, Interval, ReplayScenario } from "../contracts";
import { replayScenarios } from "../../data/replay";

const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];
const TIMEOUT_MS = 8000;
const POLL_MS = 5000;
const SECONDS: Record<Interval, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1d": 86400 };

type Kline = (string | number)[];

function fromKline(k: Kline): Candle {
  return {
    time: Math.floor(Number(k[0]) / 1000),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  };
}

async function fetchKlines(host: string, symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as Kline[];
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty response");
    return rows.map(fromKline);
  } finally {
    clearTimeout(timer);
  }
}

let warnedOffline = false;

// Replay candles re-timed so the last one is "now", for use without network.
function offlineCandles(symbol: string, interval: Interval, limit: number): Candle[] {
  if (!warnedOffline) {
    console.warn("offline mode: Binance unreachable, using replay candles");
    warnedOffline = true;
  }
  const scenario =
    replayScenarios.find((s) => s.symbol === symbol) ?? replayScenarios.find((s) => s.id === "demo-lucky-win");
  if (!scenario) return [];
  const source = scenario.candles.slice(-limit);
  const step = SECONDS[interval];
  const now = Math.floor(Date.now() / 1000 / step) * step;
  return source.map((c, i) => ({ ...c, time: now - (source.length - 1 - i) * step }));
}

export async function getCandles(symbol: string, interval: Interval, limit = 200): Promise<Candle[]> {
  const n = Math.min(1000, Math.max(1, Math.floor(limit) || 200));
  for (const host of HOSTS) {
    try {
      const candles = await fetchKlines(host, symbol, interval, n);
      warnedOffline = false;
      return candles;
    } catch {
      // try the next host
    }
  }
  return offlineCandles(symbol, interval, n);
}

export function subscribeCandles(symbol: string, interval: Interval, onCandle: (c: Candle) => void): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let pollId: ReturnType<typeof setInterval> | null = null;
  let lastTime = 0;

  // Never emit a candle older than the last one: the chart only updates or appends.
  const emit = (c: Candle) => {
    if (stopped || c.time < lastTime) return;
    lastTime = c.time;
    onCandle(c);
  };

  const startPolling = () => {
    if (stopped || pollId) return;
    const poll = async () => {
      const candles = await getCandles(symbol, interval, 2);
      candles.forEach(emit);
    };
    void poll();
    pollId = setInterval(() => void poll(), POLL_MS);
  };

  if (typeof WebSocket === "undefined") {
    startPolling();
  } else {
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);
      ws.onmessage = (ev) => {
        try {
          const k = (JSON.parse(String(ev.data)) as { k?: Record<string, string | number> }).k;
          if (!k) return;
          emit(fromKline([k["t"] ?? 0, k["o"] ?? 0, k["h"] ?? 0, k["l"] ?? 0, k["c"] ?? 0, k["v"] ?? 0]));
        } catch {
          // ignore malformed messages
        }
      };
      ws.onerror = () => startPolling();
      ws.onclose = () => startPolling();
    } catch {
      startPolling();
    }
  }

  return () => {
    stopped = true;
    if (pollId) clearInterval(pollId);
    pollId = null;
    if (ws) {
      ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
      ws = null;
    }
  };
}

export function getReplayScenarios(): ReplayScenario[] {
  return replayScenarios;
}

export function getReplayScenario(id: string): ReplayScenario | undefined {
  return replayScenarios.find((s) => s.id === id);
}
