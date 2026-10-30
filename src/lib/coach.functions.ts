import { createServerFn } from "@tanstack/react-start";

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Text → ElevenLabs speech. Returns base64 MP3, or null when unavailable. */
export const coachSpeech = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string }) => {
    const text = String(input?.text ?? "").trim().slice(0, 1200);
    if (!text) throw new Error("Text is required");
    return { text };
  })
  .handler(async ({ data }) => {
    const key = process.env["ELEVENLABS_API_KEY"];
    const voice = process.env["ELEVENLABS_VOICE_ID"] || "JBFqnCBsd6RMkjVDRZzb";
    if (!key) return { audio: null as string | null, error: "not_configured" };
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`ElevenLabs TTS failed [${res.status}]: ${body}`);
      return { audio: null as string | null, error: `tts_${res.status}` };
    }
    return { audio: toBase64(await res.arrayBuffer()), error: null as string | null };
  });

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are Aquila, a friendly eagle money and trading coach inside a beginner financial-literacy app.
Speak in short, warm, spoken-style replies (2-4 sentences, no markdown, no lists, no emojis).
Teach money basics first when relevant (budgeting, the 50/30/20 rule, emergency funds, interest and compound growth, debt, inflation, scams and safety), then trading concepts: candles, trend, support/resistance, stop losses, position sizing, risk/reward, trading psychology.
Never give personal financial advice or tell someone to buy/sell a real asset; this is an educational simulator with paper money.
End with a short question to keep the learner thinking when it fits.`;

export const coachChat = createServerFn({ method: "POST" })
  .inputValidator((input: { messages: ChatMsg[] }) => {
    const messages = (Array.isArray(input?.messages) ? input.messages : [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!messages.length) throw new Error("No messages");
    return { messages };
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    const fallback = "My connection to the nest is shaky right now. Try again in a moment — and remember, always know your stop before you enter a trade.";
    if (!key) return { reply: fallback };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: SYSTEM,
        input: data.messages.map((m) => ({ role: m.role, content: m.content })),
        reasoning: { effort: "low" },
        store: false,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      console.error(`AI gateway failed [${res.status}]: ${await res.text()}`);
      if (res.status === 429) return { reply: "I'm getting a lot of questions right now. Give me a few seconds and ask again." };
      if (res.status === 402) return { reply: "The coach is out of AI credits for now. Please top up to keep chatting." };
      return { reply: fallback };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as { type?: string; delta?: string };
          if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
        } catch { /* partial */ }
      }
    }
    return { reply: text.trim() || fallback };
  });
