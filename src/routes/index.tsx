import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Check, Lock } from "lucide-react";
import { AquilaMascot } from "@/components/aquila/AquilaMascot";
import lessonsData from "@/content/lessons.json";
import type { Lesson } from "@/lib/contracts";
import { useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Learn — Aquila" },
      { name: "description", content: "Bite-sized trading lessons. Trade with a reason, not a hunch." },
      { property: "og:title", content: "Learn — Aquila" },
      { property: "og:description", content: "Bite-sized trading lessons. Trade with a reason, not a hunch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Learn,
});

const OFFSETS = [0, 60, 90, 60, 0, -60, -90, -60];

function Learn() {
  const { completedLessonIds } = useProgress();
  const lessons = [...(lessonsData.lessons as Lesson[])].sort((a, b) => a.order - b.order);
  const currentIdx = lessons.findIndex((l) => !completedLessonIds.includes(l.id));

  return (
    <section className="flex flex-col gap-8">
      <div className="rounded-3xl border-2 border-border bg-card p-6">
        <p className="text-sm font-extrabold uppercase tracking-wide text-accent-shadow">Unit 1</p>
        <h1 className="mt-1 text-3xl text-primary md:text-4xl">Trade with a reason, not a hunch.</h1>
        <p className="mt-2 font-semibold text-muted-foreground">{completedLessonIds.length} / {lessons.length} lessons complete</p>
      </div>

      <ol className="flex flex-col items-center gap-10 pb-6">
        {lessons.map((l, i) => {
          const status = completedLessonIds.includes(l.id) ? "done" : i === currentIdx ? "current" : "locked";
          const node = (
            <span className={cn(
              "relative grid size-20 place-items-center rounded-full border-b-[6px] transition-transform",
              status === "done" && "border-accent-shadow bg-accent text-accent-foreground",
              status === "current" && "border-primary-shadow bg-primary text-primary-foreground animate-ring",
              status === "locked" && "border-locked-shadow bg-locked text-muted-foreground",
              status !== "locked" && "hover:scale-105 active:translate-y-1 active:border-b-2",
            )}>
              {status === "done" ? <Check className="size-9" strokeWidth={3.5} /> : status === "current" ? <BookOpen className="size-9" /> : <Lock className="size-8" />}
            </span>
          );
          return (
            <li key={l.id} className="relative flex flex-col items-center gap-2" style={{ transform: `translateX(${OFFSETS[i % OFFSETS.length]}px)` }}>
              {status === "current" && (
                <AquilaMascot mood="neutral" size={64} message="Ready, trader?" className="absolute right-full top-1 mr-4 hidden w-max flex-row-reverse sm:flex [&>div:last-child>span]:-right-2 [&>div:last-child>span]:left-auto [&>div:last-child>span]:rotate-[225deg]" />
              )}
              {status === "locked" ? (
                <span aria-disabled className="cursor-not-allowed">{node}</span>
              ) : (
                <Link to="/lesson/$id" params={{ id: l.id }} aria-label={`${l.title} lesson`}>{node}</Link>
              )}
              <span className={cn("max-w-40 text-center text-sm font-extrabold", status === "locked" ? "text-muted-foreground" : "text-primary")}>{l.title}</span>
              {status === "current" && <span className="sm:hidden"><AquilaMascot mood="neutral" size={44} message="Ready, trader?" /></span>}
            </li>
          );
        })}
        {currentIdx === -1 && <AquilaMascot mood="celebrating" size={80} message="All lessons complete!" />}
      </ol>
    </section>
  );
}
