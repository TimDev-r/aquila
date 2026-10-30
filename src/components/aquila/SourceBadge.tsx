import { Sparkles, WifiOff } from "lucide-react";
import type { Source } from "@/lib/contracts";

export function SourceBadge({ source }: { source: Source }) {
  const ai = source === "gemma";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border-2 border-border bg-secondary px-2.5 py-0.5 text-xs font-extrabold uppercase text-primary">
      {ai ? <Sparkles className="size-3.5 text-accent-shadow" /> : <WifiOff className="size-3.5 text-muted-foreground" />}
      {ai ? "Gemma 4" : "Offline coach"}
    </span>
  );
}
