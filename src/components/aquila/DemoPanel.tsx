import { Heart, RotateCcw, Settings, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import lessonsData from "@/content/lessons.json";
import type { Lesson } from "@/lib/contracts";
import { useProgress } from "@/lib/progress";

export function DemoPanel() {
  const { resetAll, refillHearts, unlockLessons } = useProgress();
  const ids = (lessonsData.lessons as Lesson[]).map((l) => l.id);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Demo settings"><Settings className="size-5 text-muted-foreground" /></Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-primary">Demo panel</DialogTitle>
          <DialogDescription>Shortcuts for presenting Aquila.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button variant="soft" size="xl" onClick={() => { refillHearts(); toast.success("Hearts refilled"); }}><Heart className="text-destructive" />Refill 5 hearts</Button>
          <Button variant="soft" size="xl" onClick={() => { unlockLessons(ids); toast.success("All lessons unlocked"); }}><Unlock />Unlock all lessons</Button>
          <Button variant="danger" size="xl" onClick={() => {
            resetAll();
            try { localStorage.removeItem("aquila-welcome-v1"); } catch { /* ignore */ }
            toast.success("Progress reset");
          }}><RotateCcw />Reset progress</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
