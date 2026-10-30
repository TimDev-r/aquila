import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { AquilaMascot } from "@/components/aquila/AquilaMascot";
import { Button } from "@/components/ui/button";
import { coachChat } from "@/lib/coach.functions";
import { speakCoach, stopCoach } from "@/lib/coach-voice";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "Voice Coach — Aquila" },
      { name: "description", content: "Talk to Aquila, your eagle trading coach, and learn trading concepts by voice." },
      { property: "og:title", content: "Voice Coach — Aquila" },
      { property: "og:description", content: "Talk to Aquila, your eagle trading coach, and learn trading concepts by voice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoachPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = ["How do I start a budget?", "What is compound interest?", "Why do I need an emergency fund?", "What is a stop loss?", "How do I read a candle?", "How much should I risk per trade?", "Why do I keep revenge trading?"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Recognition = any;

function CoachPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi, I'm Aquila! Ask me anything about trading — tap the mic and just talk." },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recRef = useRef<Recognition>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setMicSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => { stopCoach(); recRef.current?.abort?.(); };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, thinking]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || thinking) return;
    stopCoach();
    setSpeaking(false);
    const next = [...messages, { role: "user" as const, content: t }];
    setMessages(next);
    setInput("");
    setThinking(true);
    let reply = "Sorry, I couldn't hear the market just now. Try again?";
    try {
      reply = (await coachChat({ data: { messages: next.slice(1) } })).reply;
    } catch { /* fallback */ }
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
    setThinking(false);
    if (!muted) {
      setSpeaking(true);
      await speakCoach(reply);
      setSpeaking(false);
    }
  }

  function toggleMic() {
    if (listening) { recRef.current?.stop?.(); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    stopCoach();
    setSpeaking(false);
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    rec.onend = () => { setListening(false); if (finalText.trim()) void send(finalText); };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-primary">Voice Coach</h1>
          <p className="font-bold text-muted-foreground">Talk trading with Aquila. Educational only — not financial advice.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label={muted ? "Unmute coach" : "Mute coach"} onClick={() => { setMuted(!muted); stopCoach(); setSpeaking(false); }}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </div>

      <div className="flex justify-center">
        <AquilaMascot mood={thinking ? "thinking" : speaking ? "proud" : "neutral"} size={110}
          message={listening ? "I'm listening…" : thinking ? "Hmm, let me think…" : speaking ? "Speaking…" : "Ask me anything!"} />
      </div>

      <div className="flex max-h-[50vh] min-h-[240px] flex-col gap-3 overflow-y-auto rounded-3xl border-2 border-border bg-card p-4">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 font-bold",
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-primary",
            )}>
              {m.content}
              {m.role === "assistant" && i > 0 && (
                <button className="ml-2 inline-flex align-middle text-muted-foreground hover:text-primary" aria-label="Play again"
                  onClick={async () => { setSpeaking(true); await speakCoach(m.content); setSpeaking(false); }}>
                  <Volume2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {thinking && <div className="w-fit animate-pulse rounded-2xl bg-secondary px-4 py-2.5 font-bold text-muted-foreground">Aquila is thinking…</div>}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button key={s} onClick={() => void send(s)} className="rounded-full border-2 border-border bg-card px-3 py-1.5 text-sm font-extrabold text-primary hover:bg-secondary">{s}</button>
          ))}
        </div>
      )}

      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        {micSupported && (
          <Button type="button" size="icon" variant={listening ? "destructive" : "gold"} aria-label={listening ? "Stop listening" : "Talk to coach"}
            className={cn("size-12 shrink-0 rounded-full", listening && "animate-pulse")} onClick={toggleMic}>
            {listening ? <MicOff /> : <Mic />}
          </Button>
        )}
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Listening…" : "Ask Aquila a question…"}
          className="h-12 flex-1 rounded-2xl border-2 border-border bg-background px-4 font-bold text-primary outline-none focus:border-accent" />
        <Button type="submit" size="icon" className="size-12 shrink-0 rounded-2xl" disabled={!input.trim() || thinking} aria-label="Send"><Send /></Button>
      </form>
    </div>
  );
}
