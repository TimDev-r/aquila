import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ImageUp, LineChart } from "lucide-react";
import { toast } from "sonner";
import { AquilaMascot } from "@/components/aquila/AquilaMascot";
import { QuizRunner } from "@/components/aquila/QuizRunner";
import { SourceBadge } from "@/components/aquila/SourceBadge";
import { themeColor } from "@/components/trade/themeColor";
import { Button } from "@/components/ui/button";
import { analyzeChart } from "@/lib/api";
import type { ChartAnalysis } from "@/lib/contracts";
import { getCandles } from "@/lib/market";
import { useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "Chart Vision — Aquila" },
      { name: "description", content: "Upload a price chart and Aquila explains the pattern, trend and key levels." },
      { property: "og:title", content: "Chart Vision — Aquila" },
      { property: "og:description", content: "Upload a price chart and Aquila explains the pattern, trend and key levels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VisionPage,
});

const TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type Mime = (typeof TYPES)[number];
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_W = 1280;

/** Downscale to max 1280px wide and return base64 without the data: prefix. */
async function toBase64(src: string, mime: Mime): Promise<{ base64: string; preview: string }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, MAX_W / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const preview = canvas.toDataURL(mime, 0.9);
  return { base64: preview.split(",")[1] ?? "", preview };
}

async function renderSampleChart(): Promise<string> {
  const L = await import("lightweight-charts");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:500px;";
  document.body.appendChild(host);
  try {
    const chart = L.createChart(host, {
      width: 900, height: 500,
      layout: { background: { color: themeColor("--card") }, textColor: themeColor("--muted-foreground") },
      grid: { vertLines: { color: themeColor("--border") }, horzLines: { color: themeColor("--border") } },
    });
    const up = themeColor("--success");
    const down = themeColor("--destructive");
    const s = chart.addSeries(L.CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    const candles = await getCandles("BTCUSDT", "1h", 120);
    s.setData(candles.map((c) => ({ time: c.time as never, open: c.open, high: c.high, low: c.low, close: c.close })));
    chart.timeScale().fitContent();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const url = chart.takeScreenshot().toDataURL("image/png");
    chart.remove();
    return url;
  } finally {
    host.remove();
  }
}

function VisionPage() {
  const { addXp } = useProgress();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ChartAnalysis | null>(null);
  const [quizDone, setQuizDone] = useState(false);

  const run = async (src: string, mime: Mime) => {
    setLoading(true);
    setAnalysis(null);
    setQuizDone(false);
    try {
      const { base64, preview: p } = await toBase64(src, mime);
      setPreview(p);
      setAnalysis(await analyzeChart(base64, mime));
    } catch {
      toast.error("Couldn't read that image. Try another one.");
    } finally {
      setLoading(false);
    }
  };

  const onFile = (file?: File) => {
    if (!file) return;
    if (!TYPES.includes(file.type as Mime)) { toast.error("Please use a PNG, JPEG or WebP image."); return; }
    if (file.size > MAX_BYTES) { toast.error("That image is over 4 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => void run(String(reader.result), file.type as Mime);
    reader.readAsDataURL(file);
  };

  const sample = async () => {
    setLoading(true);
    try {
      await run(await renderSampleChart(), "image/png");
    } catch {
      setLoading(false);
      toast.error("Couldn't draw the sample chart.");
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl text-primary">Chart Vision</h1>
        <p className="mt-1 font-semibold text-muted-foreground">Drop a screenshot of any price chart. Aquila reads the pattern, trend and key levels.</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
        className={cn("flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed bg-card p-8 text-center transition-colors", drag ? "border-accent bg-sidebar-accent" : "border-border")}
      >
        {preview ? <img src={preview} alt="Chart to analyze" className="max-h-72 rounded-2xl border-2 border-border" /> : <ImageUp className="size-12 text-muted-foreground" />}
        <p className="font-bold text-muted-foreground">Drag & drop a PNG, JPEG or WebP (max 4 MB)</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="chunky" size="xl" disabled={loading} onClick={() => input.current?.click()}><ImageUp />Choose image</Button>
          <Button variant="soft" size="xl" disabled={loading} onClick={sample}><LineChart />Try a sample chart</Button>
        </div>
        <input ref={input} type="file" accept={TYPES.join(",")} className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {loading && <div className="flex justify-center"><AquilaMascot mood="thinking" size={80} message="Aquila is studying the chart…" /></div>}

      {analysis && !loading && (
        analysis.isChart ? (
          <div className="flex animate-pop flex-col gap-4 rounded-3xl border-2 border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl text-primary">{analysis.pattern}</h2>
              <SourceBadge source={analysis.source} />
            </div>
            <span className={cn("w-fit rounded-full px-3 py-1 text-sm font-extrabold uppercase",
              analysis.trend === "up" ? "bg-success/15 text-success" : analysis.trend === "down" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground")}>
              Trend: {analysis.trend}
            </span>
            <p className="font-semibold text-foreground">{analysis.explanation}</p>
            {analysis.keyLevels.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-extrabold uppercase text-muted-foreground">Key levels</h3>
                <ul className="flex flex-col gap-1">{analysis.keyLevels.map((k, i) => <li key={i} className="font-semibold">• {k}</li>)}</ul>
              </div>
            )}
            <div className="border-t-2 border-border pt-4">
              <h3 className="mb-3 text-sm font-extrabold uppercase text-accent-shadow">Quick check · 10 XP</h3>
              {quizDone ? (
                <AquilaMascot mood="proud" size={56} message="Nice work, trader." />
              ) : (
                <QuizRunner questions={[analysis.followUp]} onAnswer={(ok) => ok && addXp(10)} onComplete={() => setQuizDone(true)} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-center"><AquilaMascot mood="disappointed" size={80} message="That doesn't look like a price chart" /></div>
        )
      )}
    </section>
  );
}
