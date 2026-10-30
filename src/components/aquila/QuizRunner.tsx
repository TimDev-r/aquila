import { useState } from "react";
import { Check, X } from "lucide-react";
import type { QuizQuestion } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  questions: QuizQuestion[];
  onAnswer?: (correct: boolean, q: QuizQuestion) => void;
  onComplete: (correctCount: number, total: number) => void;
  onProgress?: (index: number) => void;
};

/** Reusable one-question-at-a-time quiz with a Duolingo-style check sheet. */
export function QuizRunner({ questions, onAnswer, onComplete, onProgress }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const q = questions[index];
  if (!q) return null;
  const isCorrect = selected === q.correctIndex;

  const check = () => {
    if (selected === null) return;
    setChecked(true);
    if (isCorrect) setCorrectCount((c) => c + 1);
    onAnswer?.(isCorrect, q);
  };

  const next = () => {
    const total = correctCount;
    if (index + 1 >= questions.length) return onComplete(total, questions.length);
    setIndex(index + 1);
    onProgress?.(index + 1);
    setSelected(null);
    setChecked(false);
  };

  return (
    <div className="flex w-full flex-1 flex-col">
      <div key={q.id} className="flex flex-1 animate-pop flex-col gap-6">
        <h2 className="text-2xl text-primary md:text-3xl">{q.question}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {q.options.map((opt, i) => {
            const state = checked ? (i === q.correctIndex ? "right" : i === selected ? "wrong" : "idle") : selected === i ? "picked" : "idle";
            return (
              <button
                key={i}
                type="button"
                disabled={checked}
                onClick={() => setSelected(i)}
                className={cn(
                  "btn-3d flex min-h-16 items-center gap-3 rounded-2xl border-2 border-b-4 bg-card px-4 py-3 text-left text-base font-bold transition-colors",
                  state === "idle" && "border-border hover:bg-secondary",
                  state === "picked" && "border-accent bg-sidebar-accent text-primary",
                  state === "right" && "border-success bg-success/10 text-success",
                  state === "wrong" && "border-destructive bg-destructive/10 text-destructive",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-current text-sm">{i + 1}</span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {!checked ? (
        <div className="sticky bottom-0 mt-8 border-t-2 border-border bg-background py-4">
          <Button variant="chunky" size="xl" className="w-full" disabled={selected === null} onClick={check}>Check</Button>
        </div>
      ) : (
        <div className={cn("sticky bottom-0 mt-8 animate-pop rounded-t-3xl px-5 py-5", isCorrect ? "bg-success/15" : "bg-destructive/15")}>
          <div className={cn("flex items-center gap-2 text-xl font-black", isCorrect ? "text-success" : "text-destructive")}>
            {isCorrect ? <Check className="size-7" /> : <X className="size-7" />}
            {isCorrect ? "Nice!" : `Correct answer: ${q.options[q.correctIndex]}`}
          </div>
          <p className="mt-1 font-semibold text-foreground">{q.explanation}</p>
          <Button variant={isCorrect ? "success" : "danger"} size="xl" className="mt-4 w-full" onClick={next}>Continue</Button>
        </div>
      )}
    </div>
  );
}
