import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, X } from "lucide-react";
import { AquilaMascot } from "@/components/aquila/AquilaMascot";
import { QuizRunner } from "@/components/aquila/QuizRunner";
import { Button } from "@/components/ui/button";
import lessonsData from "@/content/lessons.json";
import type { Lesson } from "@/lib/contracts";
import { useProgress } from "@/lib/progress";

export const Route = createFileRoute("/lesson/$id")({
  head: () => ({
    meta: [
      { title: "Lesson — Aquila" },
      { name: "description", content: "A short Aquila trading lesson." },
      { property: "og:title", content: "Lesson — Aquila" },
      { property: "og:description", content: "A short Aquila trading lesson." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LessonPage,
});

type Phase = { kind: "intro"; i: number } | { kind: "quiz"; i: number } | { kind: "done"; correct: number; total: number };

function LessonPage() {
  const { id } = Route.useParams();
  const lesson = (lessonsData.lessons as Lesson[]).find((l) => l.id === id);
  const { hearts, loseHeart, addXp, completeLesson } = useProgress();
  const [phase, setPhase] = useState<Phase>({ kind: "intro", i: 0 });

  if (!lesson) {
    return (
      <Centered>
        <AquilaMascot mood="disappointed" size={110} />
        <h1 className="text-3xl text-primary">Lesson not found</h1>
        <Button asChild variant="chunky" size="xl"><Link to="/">Back to Learn</Link></Button>
      </Centered>
    );
  }

  const steps = lesson.intro.length + lesson.questions.length;
  const done = phase.kind === "intro" ? phase.i : phase.kind === "quiz" ? lesson.intro.length + phase.i : steps;
  const pct = Math.round((done / steps) * 100);

  const outOfHearts = hearts <= 0 && phase.kind !== "done";

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-4">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-4">
        <Link to="/" aria-label="Exit lesson" className="text-muted-foreground hover:text-primary"><X className="size-7" /></Link>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="flex items-center gap-1 font-extrabold text-primary"><Heart className="size-5 fill-destructive text-destructive" />{hearts}</span>
      </div>

      <div className="mx-auto mt-8 flex w-full max-w-2xl flex-1 flex-col">
        {outOfHearts ? (
          <Centered>
            <AquilaMascot mood="disappointed" size={120} />
            <h1 className="text-3xl text-primary">Out of hearts. Even eagles rest.</h1>
            <p className="text-muted-foreground">Your hearts refill tomorrow. Come back fresh.</p>
            <Button asChild variant="chunky" size="xl"><Link to="/">Back to Learn</Link></Button>
          </Centered>
        ) : phase.kind === "intro" ? (
          <div className="flex flex-1 flex-col">
            <div key={phase.i} className="flex flex-1 animate-pop flex-col items-center justify-center gap-6">
              <AquilaMascot mood="thinking" size={96} />
              <div className="w-full rounded-3xl border-2 border-b-4 border-border bg-card p-6 text-xl font-bold leading-relaxed text-foreground">
                {lesson.intro[phase.i]}
              </div>
            </div>
            <div className="sticky bottom-0 mt-8 border-t-2 border-border bg-background py-4">
              <Button variant="chunky" size="xl" className="w-full" onClick={() =>
                setPhase(phase.i + 1 < lesson.intro.length ? { kind: "intro", i: phase.i + 1 } : { kind: "quiz", i: 0 })}>
                Continue
              </Button>
            </div>
          </div>
        ) : phase.kind === "quiz" ? (
          <QuizRunner
            questions={lesson.questions}
            onProgress={(i) => setPhase({ kind: "quiz", i })}
            onAnswer={(ok) => { if (!ok) loseHeart(); }}
            onComplete={(correct, total) => {
              completeLesson(lesson.id);
              addXp(lesson.xp);
              setPhase({ kind: "done", correct, total });
            }}
          />
        ) : (
          <Centered>
            <AquilaMascot mood="celebrating" size={130} />
            <h1 className="text-4xl text-primary">Lesson complete!</h1>
            <div className="flex gap-4">
              <Stat label="XP earned" value={`+${lesson.xp} XP`} />
              <Stat label="Accuracy" value={`${Math.round((phase.correct / phase.total) * 100)}%`} />
            </div>
            <Button asChild variant="gold" size="xl" className="w-full max-w-sm"><Link to="/">Continue</Link></Button>
          </Centered>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 animate-pop flex-col items-center justify-center gap-5 text-center">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-32 rounded-2xl border-2 border-b-4 border-accent bg-card px-5 py-3">
      <div className="text-xs font-extrabold uppercase text-accent-shadow">{label}</div>
      <div className="text-2xl font-black text-primary">{value}</div>
    </div>
  );
}
