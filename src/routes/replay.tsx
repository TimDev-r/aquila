import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Hourglass } from "lucide-react";
import { AquilaMascot } from "@/components/aquila/AquilaMascot";
import { QuizRunner } from "@/components/aquila/QuizRunner";
import { CandleChart } from "@/components/trade/CandleChart";
import { price as fmtPrice } from "@/components/trade/format";
import { Button } from "@/components/ui/button";
import { generateQuiz } from "@/lib/api";
import type { MascotMood, QuizQuestion, ReplayScenario } from "@/lib/contracts";
import { getReplayScenarios } from "@/lib/market";
import { useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "Next Candle — Aquila" },
      { name: "description", content: "Up, down or wait? Read a real chart and call the next candle." },
      { property: "og:title", content: "Next Candle — Aquila" },
      { property: "og:description", content: "Up, down or wait? Read a real chart and call the next candle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReplayPage,
});

const ROUNDS = 10;
const WAIT_THRESHOLD = 0.0015;
type Guess = "up" | "down" | "wait";
type Result = { guess: Guess; xp: number; correct: boolean; lostHeart: boolean; mood: MascotMood; line: string };

function ReplayPage() {
  const [scenario, setScenario] = useState<ReplayScenario | null>(null);
  return scenario ? <Game key={scenario.id} scenario={scenario} onExit={() => setScenario(null)} /> : <Start onPick={setScenario} />;
}

function Start({ onPick }: { onPick: (s: ReplayScenario) => void }) {
  const scenarios = getReplayScenarios();
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-4 rounded-3xl border-2 border-border bg-card p-6 sm:flex-row sm:items-center">
        <AquilaMascot mood="proud" size={88} />
        <div>
          <h1 className="text-3xl text-primary">Next Candle</h1>
          <p className="mt-1 font-semibold text-muted-foreground">We show you a real chart. You decide: up, down, or wait. Waiting is a skill too.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {scenarios.map((s) => (
          <button key={s.id} type="button" onClick={() => onPick(s)} className="btn-3d flex flex-col items-start gap-2 rounded-3xl border-2 border-b-4 border-border bg-card p-5 text-left hover:border-accent">
            <span className="flex gap-2 text-xs font-extrabold uppercase text-accent-shadow"><span>{s.symbol}</span>·<span>{s.interval}</span></span>
            <span className="text-xl font-black text-primary">{s.title}</span>
            <span className="font-semibold text-muted-foreground">{s.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function judge(guess: Guess, open: number, close: number): Result {
  const body = Math.abs(close - open) / open;
  const dir: Guess = close >= open ? "up" : "down";
  if (guess === "wait") {
    const good = body < WAIT_THRESHOLD;
    return { guess, xp: good ? 3 : 0, correct: good, lostHeart: false, mood: "neutral", line: "Patience is a position." };
  }
  return guess === dir
    ? { guess, xp: 10, correct: true, lostHeart: false, mood: "proud", line: "Sharp eyes! +10 XP" }
    : { guess, xp: 0, correct: false, lostHeart: true, mood: "disappointed", line: `It went ${dir}. Shake it off.` };
}

function Game({ scenario, onExit }: { scenario: ReplayScenario; onExit: () => void }) {
  const { hearts, loseHeart, addXp } = useProgress();
  const rounds = Math.min(ROUNDS, scenario.candles.length - scenario.revealFrom);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const finished = results.length >= rounds && !result;

  const shownUntil = scenario.revealFrom + round + (result ? 1 : 0);
  const candles = scenario.candles.slice(0, shownUntil);
  const next = scenario.candles[scenario.revealFrom + round];
  const last = candles[candles.length - 1];

  const guess = (g: Guess) => {
    if (!next || result) return;
    const r = judge(g, next.open, next.close);
    if (r.xp) addXp(r.xp);
    if (r.lostHeart) loseHeart();
    setResult(r);
  };

  const advance = () => {
    if (!result) return;
    setResults((rs) => [...rs, result]);
    setResult(null);
    setRound((n) => n + 1);
  };

  if (hearts <= 0 && !result) {
    return (
      <Centered>
        <AquilaMascot mood="disappointed" size={110} />
        <h1 className="text-3xl text-primary">Out of hearts. Even eagles rest.</h1>
        <Button asChild variant="chunky" size="xl"><Link to="/">Back to Learn</Link></Button>
      </Centered>
    );
  }

  if (finished) return <Summary scenario={scenario} results={results} onExit={onExit} />;

  const mood: MascotMood = result?.mood ?? "thinking";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onExit} className="font-extrabold text-muted-foreground hover:text-primary">← Scenarios</button>
        <span className="font-extrabold text-primary">Round {Math.min(round + 1, rounds)} / {rounds}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${((results.length + (result ? 1 : 0)) / rounds) * 100}%` }} />
      </div>

      <div className="rounded-3xl border-2 border-border bg-card p-4">
        <div className="mb-2 flex items-baseline gap-3">
          <span className="font-extrabold text-muted-foreground">{scenario.symbol}</span>
          <span className="text-2xl font-black tabular-nums text-primary">{last ? fmtPrice(last.close) : "—"}</span>
        </div>
        <CandleChart candles={candles} height={340} />
      </div>

      <div className="flex min-h-20 items-center">
        <AquilaMascot mood={mood} size={64} message={result ? result.line : "What's the next candle?"} />
      </div>

      {result ? (
        <div className={cn("animate-pop rounded-3xl px-5 py-4", result.correct ? "bg-success/15" : result.lostHeart ? "bg-destructive/15" : "bg-secondary")}>
          <p className={cn("text-lg font-black", result.correct ? "text-success" : result.lostHeart ? "text-destructive" : "text-primary")}>
            {result.correct ? `Correct! +${result.xp} XP` : result.lostHeart ? "Wrong call. −1 heart" : "Price moved. No XP, no heart lost."}
          </p>
          <Button variant={result.correct ? "success" : result.lostHeart ? "danger" : "chunky"} size="xl" className="mt-3 w-full" onClick={advance}>Continue</Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Button variant="success" size="xl" onClick={() => guess("up")}><ArrowUp className="size-6" />Up</Button>
          <Button variant="soft" size="xl" onClick={() => guess("wait")}><Hourglass className="size-5" />Wait</Button>
          <Button variant="danger" size="xl" onClick={() => guess("down")}><ArrowDown className="size-6" />Down</Button>
        </div>
      )}
    </section>
  );
}

function Summary({ scenario, results, onExit }: { scenario: ReplayScenario; results: Result[]; onExit: () => void }) {
  const correct = results.filter((r) => r.correct).length;
  const xp = results.reduce((s, r) => s + r.xp, 0);
  const [tip, setTip] = useState<{ questions: QuizQuestion[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tipDone, setTipDone] = useState(false);

  const getTip = async () => {
    setLoading(true);
    const res = await generateQuiz({ tag: "trend", difficulty: 1, count: 1, candles: scenario.candles });
    setTip({ questions: res.questions.slice(0, 1) });
    setLoading(false);
  };

  return (
    <section className="flex flex-col items-center gap-5 py-4 text-center">
      <AquilaMascot mood="celebrating" size={110} />
      <h1 className="text-3xl text-primary">Game over!</h1>
      <div className="flex gap-4">
        <Stat label="Accuracy" value={`${Math.round((correct / Math.max(1, results.length)) * 100)}%`} />
        <Stat label="XP earned" value={`+${xp} XP`} />
      </div>

      {!tip && (
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="gold" size="xl" onClick={getTip} disabled={loading}>{loading ? "Aquila is thinking…" : "Get an AI tip"}</Button>
          <Button variant="soft" size="xl" onClick={onExit}>Play again</Button>
        </div>
      )}
      {loading && <AquilaMascot mood="thinking" size={56} message="Preparing a tip…" />}
      {tip && !tipDone && (
        <div className="w-full max-w-2xl text-left">
          <QuizRunner questions={tip.questions} onComplete={() => setTipDone(true)} />
        </div>
      )}
      {tipDone && <Button variant="chunky" size="xl" onClick={onExit}>Back to scenarios</Button>}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-5 py-10 text-center">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-32 rounded-2xl border-2 border-b-4 border-accent bg-card px-5 py-3">
      <div className="text-xs font-extrabold uppercase text-accent-shadow">{label}</div>
      <div className="text-2xl font-black text-primary">{value}</div>
    </div>
  );
}
