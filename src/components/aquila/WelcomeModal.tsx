import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AquilaMascot } from "./AquilaMascot";

const KEY = "aquila-welcome-v1";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setOpen(true); } catch { /* ignore */ }
  }, []);
  const close = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="rounded-3xl text-center sm:max-w-md">
        <div className="flex flex-col items-center gap-4 py-2">
          <AquilaMascot mood="celebrating" size={120} />
          <DialogTitle className="text-4xl font-black tracking-tight text-primary">aquila</DialogTitle>
          <DialogDescription className="text-lg font-bold text-foreground">Trade with a reason, not a hunch.</DialogDescription>
          <p className="text-sm font-semibold text-muted-foreground">Short lessons, paper trading and an eagle coach who grades your reasoning. No real money, ever.</p>
          <Button variant="gold" size="xl" className="w-full" onClick={close}>Start learning</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
