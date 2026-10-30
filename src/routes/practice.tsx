import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AquilaMascot } from "@/components/aquila/AquilaMascot";
import { QuizRunner } from "@/components/aquila/QuizRunner";
import { SourceBadge } from "@/components/aquila/SourceBadge";
import { Button } from "@/components/ui/button";
import { generateQuiz } from "@/lib/api";
import type { LessonTag, QuizQuestion, Source } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/practice")({
  head: () => ({
    meta: [
      { title: "Practice — Aquila" },
      { name: "description", content: "Sharpen your trading skills with AI-generated quizzes on any topic." },
      { property: "og:title", content: "Practice — Aquila" },
      { property: "og:description", content: "Sharpen your trading skills with AI-generated quizzes on any topic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PracticePage,
});

const TAGS: { tag: LessonTag; label: string }[] = [
  { tag: "candles", label: "Candles" },
  { tag: "trend", label: "Trend" },
  { tag: "support_resistance", label: "Support & resistance" },
  { tag: "stop_loss", label: "Stop loss" },
  { tag: "position_sizing", label: "Position sizing" },
  { tag: "risk_reward", label: "Risk/reward" },
  { tag: "psychology", label: "Psychology" },
];

type Quiz = { questions: QuizQuestion[]; source: Source };

function PracticePage() {
  const [tag, setTag] = useState<LessonTag>("candles");
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);

  const start = async () => {
    setLoading(true);
    setResult(null);
    const res = await generateQuiz({ tag, difficulty, count: 5 });
    setQuiz(res.questions.length ? res : null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <AquilaMascot mood="thinking" size={110} message="Aquila is preparing your questions…" />
      </div>
    );
  }

  if (quiz && !result) {
    return (
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setQuiz(null)} className="font-extrabold text-muted-foreground hover:text-primary">← Topics</button>
          <SourceBadge source={quiz.source} />
        </div>
        <QuizRunner
          questions={quiz.questions}
          onComplete={(correct, total) => setResult({ correct, total })}
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {result && (
        <div className="flex animate-pop items-center gap-4 rounded-3xl border-2 border-accent bg-card p-5">
          <AquilaMascot mood={result.correct / result.total >= 0.6 ? "celebrating" : "neutral"} size={72} />
          <div>
            <p className="text-2xl font-black text-primary">{result.correct} / {result.total} correct</p>
            <p className="font-semibold text-muted-foreground">Pick another topic or go again.</p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl text-primary">Practice</h1>
        <p className="mt-1 font-semibold text-muted-foreground">Pick a topic and difficulty. Aquila writes fresh questions for you.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TAGS.map((t) => (
          <button key={t.tag} type="button" onClick={() => setTag(t.tag)} className={cn(
            "btn-3d rounded-full border-2 border-b-4 px-4 py-2 font-extrabold",
            tag === t.tag ? "border-accent-shadow bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground hover:text-primary",
          )}>{t.label}</button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-extrabold uppercase text-muted-foreground">Difficulty</span>
        <div className="flex gap-2">
          {([1, 2, 3] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDifficulty(d)} className={cn(
              "btn-3d rounded-2xl border-2 border-b-4 px-5 py-2 font-extrabold",
              difficulty === d ? "border-primary-shadow bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
            )}>{["Easy", "Medium", "Hard"][d - 1]}</button>
          ))}
        </div>
      </div>

      <Button variant="chunky" size="xl" className="w-full sm:w-fit" onClick={start}>Generate 5 questions</Button>
    </section>
  );
}
