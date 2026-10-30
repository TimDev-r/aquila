import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import { AquilaMascot } from "@/components/aquila/AquilaMascot";
import { SourceBadge } from "@/components/aquila/SourceBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import lessonsData from "@/content/lessons.json";
import type { Lesson, MascotMood, Trade, TradeReview } from "@/lib/contracts";
import { useProgress } from "@/lib/progress";
import { speak, stopSpeaking } from "@/lib/voice/speak";
import { ScoreRing } from "./ScoreRing";

const MOOD: Record<TradeReview["verdict"], MascotMood> = {
  great: "proud", good: "proud", lucky: "thinking", unlucky: "neutral", poor: "disappointed",
};
const LABEL: Record<TradeReview["verdict"], string> = {
  great: "Great reasoning", good: "Good reasoning", lucky: "Lucky", unlucky: "Unlucky", poor: "Poor reasoning",
};

export function TradeReviewDialog({ trade, review, loading, onClose }: {
  trade: Trade | null; review: TradeReview | null; loading: boolean; onClose: () => void;
}) {
  const { muted, setMuted } = useProgress();
  const lesson = review ? (lessonsData.lessons as Lesson[]).find((l) => l.tag === review.lessonTag) : undefined;

  useEffect(() => {
    if (review && trade && !muted) void speak(review.coachLine);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, trade]);

  const toggleMute = () => {
    if (!muted) stopSpeaking();
    setMuted(!muted);
  };

  return (
    <Dialog open={!!trade} onOpenChange={(o) => { if (!o) { stopSpeaking(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-primary">Trade review</DialogTitle>
          <DialogDescription>Aquila grades your reasoning, not your profit.</DialogDescription>
        </DialogHeader>
        {loading || !review ? (
          <div className="flex flex-col items-center gap-3 py-6"><AquilaMascot mood="thinking" size={80} /><p className="font-bold text-muted-foreground">Aquila is reviewing your trade…</p></div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <SourceBadge source={review.source} />
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Replay coach" disabled={muted} onClick={() => void speak(review.coachLine)}><RotateCcw /></Button>
                <Button variant="ghost" size="icon" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>{muted ? <VolumeX /> : <Volume2 className="text-accent-shadow" />}</Button>
              </div>
            </div>

            {review.verdict === "lucky" && (
              <div className="rounded-2xl border-2 border-accent bg-accent/20 px-4 py-3 font-bold text-primary">
                You made money, but the reasoning was weak. Luck is not a strategy.
              </div>
            )}

            <div className="flex items-center gap-4">
              <ScoreRing score={review.score} size={120} />
              <div className="flex flex-col gap-2">
                <AquilaMascot mood={MOOD[review.verdict]} size={52} />
                <span className="w-fit rounded-full bg-primary px-3 py-1 text-sm font-extrabold uppercase text-primary-foreground">{LABEL[review.verdict]}</span>
              </div>
            </div>

            <p className="font-semibold text-foreground">{review.summary}</p>
            <p className="rounded-2xl bg-secondary px-4 py-3 font-bold italic text-primary">“{review.coachLine}”</p>

            {review.whatWentWell.length > 0 && <List title="What went well" items={review.whatWentWell} tone="text-success" mark="✓" />}
            {review.mistakes.length > 0 && <List title="Mistakes" items={review.mistakes} tone="text-destructive" mark="✗" />}

            {trade && (
              <blockquote className="rounded-2xl border-l-4 border-accent bg-card px-4 py-3 text-sm">
                <div className="mb-1 text-xs font-extrabold uppercase text-muted-foreground">Your thesis</div>
                <p className="font-semibold text-foreground">{trade.thesis}</p>
              </blockquote>
            )}

            {lesson ? (
              <Button asChild variant="gold" size="xl" onClick={() => stopSpeaking()}>
                <Link to="/lesson/$id" params={{ id: lesson.id }}>Review lesson: {lesson.title}</Link>
              </Button>
            ) : (
              <p className="text-center text-sm font-semibold text-muted-foreground">A lesson on “{review.lessonTag.replace("_", " ")}” is coming soon.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function List({ title, items, tone, mark }: { title: string; items: string[]; tone: string; mark: string }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-extrabold uppercase text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => <li key={i} className="flex gap-2 font-semibold"><span className={tone}>{mark}</span>{it}</li>)}
      </ul>
    </div>
  );
}
