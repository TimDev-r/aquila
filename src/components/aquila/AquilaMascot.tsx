import type { MascotMood } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const moodAnim: Record<MascotMood, string> = {
  neutral: "animate-bob",
  thinking: "animate-tilt",
  proud: "animate-bob",
  disappointed: "animate-droop opacity-90",
  celebrating: "animate-bounce-soft",
};

const moodBadge: Partial<Record<MascotMood, string>> = {
  thinking: "💭", proud: "⭐", disappointed: "💧", celebrating: "🎉",
};

export function AquilaMascot({ mood = "neutral", size = 96, message, className }: {
  mood?: MascotMood; size?: number; message?: string; className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn("relative grid shrink-0 place-items-center rounded-full border-b-4 border-accent-shadow bg-accent", moodAnim[mood])}
        style={{ width: size, height: size }}
        role="img"
        aria-label={`Aquila the eagle, ${mood}`}
      >
        <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>🦅</span>
        {moodBadge[mood] && (
          <span className="absolute -right-1 -top-1 grid place-items-center rounded-full bg-card shadow" style={{ width: size * 0.34, height: size * 0.34, fontSize: size * 0.2 }}>
            {moodBadge[mood]}
          </span>
        )}
      </div>
      {message && (
        <div className="relative animate-pop rounded-2xl border-2 border-border bg-card px-4 py-2 font-bold text-foreground shadow-sm">
          <span className="absolute -left-2 top-1/2 size-3 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-border bg-card" />
          {message}
        </div>
      )}
    </div>
  );
}
