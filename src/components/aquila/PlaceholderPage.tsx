import type { MascotMood } from "@/lib/contracts";
import { AquilaMascot } from "./AquilaMascot";

export function PlaceholderPage({ title, subtitle, mood = "neutral", message }: {
  title: string; subtitle: string; mood?: MascotMood; message: string;
}) {
  return (
    <section className="flex flex-col items-center gap-6 py-10 text-center">
      <AquilaMascot mood={mood} size={112} />
      <div>
        <h1 className="text-3xl text-primary md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-md text-muted-foreground">{subtitle}</p>
      </div>
      <div className="rounded-3xl border-2 border-dashed border-border bg-card px-6 py-5 font-bold text-muted-foreground">{message}</div>
    </section>
  );
}
