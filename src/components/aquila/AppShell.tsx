import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookOpen, Brain, CandlestickChart, Flame, Heart, Lock, Mic, ScanEye, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { allLessonsComplete, isPathLocked } from "@/lib/gates";
import { useProgress } from "@/lib/progress";
import { AquilaMascot } from "./AquilaMascot";
import { DemoPanel } from "./DemoPanel";
import { WelcomeModal } from "./WelcomeModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Learn", icon: BookOpen, gated: false },
  { to: "/practice", label: "Practice", icon: Brain, gated: false },
  { to: "/trade", label: "Trade", icon: CandlestickChart, gated: true },
  { to: "/replay", label: "Next Candle", icon: TrendingUp, gated: true },
  { to: "/vision", label: "Chart Vision", icon: ScanEye, gated: true },
  { to: "/coach", label: "Coach", icon: Mic, gated: false },
] as const;

function LockedScreen() {
  return (
    <div className="flex flex-col items-center gap-5 py-16 text-center">
      <AquilaMascot mood="thinking" size={110} message="Finish every lesson first!" />
      <h1 className="text-3xl text-primary">Locked for now</h1>
      <p className="max-w-md font-semibold text-muted-foreground">
        This tool unlocks once you complete all lessons. Learn the basics first — your future self will thank you.
      </p>
      <Button asChild variant="chunky" size="xl"><Link to="/">Back to lessons</Link></Button>
    </div>
  );
}

function Stats() {
  const { streakDays, xp, hearts } = useProgress();
  return (
    <div className="flex items-center gap-3 text-sm font-extrabold sm:gap-4 sm:text-base">
      <span className="flex items-center gap-1 text-accent-shadow" title="Streak"><Flame className="size-5 fill-accent text-accent-shadow" />{streakDays}</span>
      <span className="flex items-center gap-1 text-primary" title="XP"><Sparkles className="size-5 text-accent-shadow" />{xp} XP</span>
      <span className="flex items-center gap-1 text-primary" title="Hearts"><Heart className="size-5 fill-destructive text-destructive" />{hearts}</span>
    </div>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid size-9 place-items-center rounded-xl border-b-4 border-accent-shadow bg-accent text-xl">🦅</span>
      <span className="text-2xl font-black tracking-tight text-primary">aquila</span>
    </Link>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { completedLessonIds } = useProgress();
  if (pathname.startsWith("/lesson/")) return <Outlet />;

  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const allDone = allLessonsComplete(completedLessonIds);
  const locked = (gated: boolean) => gated && !allDone;
  const lockedToast = () => toast.info("Complete all lessons to unlock this.", { icon: <Lock className="size-4" /> });
  const pageLocked = isPathLocked(pathname, completedLessonIds);

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r-2 border-border bg-sidebar p-5 md:flex">
        <Logo />
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, gated }) =>
            locked(gated) ? (
              <button key={to} type="button" onClick={lockedToast} className={cn(
                "flex items-center gap-3 rounded-2xl border-2 border-transparent px-4 py-3 text-left font-extrabold uppercase tracking-wide text-sm text-muted-foreground/60 transition-colors hover:bg-secondary",
              )}>
                <Icon className="size-6" />{label}<Lock className="ml-auto size-4" />
              </button>
            ) : (
              <Link key={to} to={to} className={cn(
                "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 font-extrabold uppercase tracking-wide text-sm transition-colors",
                active(to) ? "border-accent bg-sidebar-accent text-primary" : "border-transparent text-muted-foreground hover:bg-secondary",
              )}>
                <Icon className="size-6" />{label}
              </Link>
            ),
          )}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b-2 border-border bg-background/90 px-4 py-3 backdrop-blur">
          <div className="md:hidden"><Logo /></div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2"><Stats /><DemoPanel /></div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
          {pageLocked ? <LockedScreen /> : <Outlet />}
        </main>
        <footer className="px-4 pb-24 pt-6 text-center text-xs text-muted-foreground md:pb-6">
          Aquila is an educational simulator. Nothing here is financial advice. No real money is used.
        </footer>
      </div>

      <WelcomeModal />
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t-2 border-border bg-card py-2 md:hidden">
        {NAV.map(({ to, label, icon: Icon, gated }) =>
          locked(gated) ? (
            <button key={to} type="button" onClick={lockedToast} className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-extrabold uppercase text-muted-foreground/60">
              <Lock className="size-6" />{label}
            </button>
          ) : (
            <Link key={to} to={to} className={cn(
              "flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-extrabold uppercase",
              active(to) ? "text-primary" : "text-muted-foreground",
            )}>
              <Icon className={cn("size-6", active(to) && "text-accent-shadow")} />{label}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}
