// Voice coach implementation with ElevenLabs & browser fallback

let sharedAudio: HTMLAudioElement | null = null;
const audioCache = new Map<string, string>(); // text -> blob object URL

function base64ToBlob(base64: string, mimeType = "audio/mpeg"): Blob {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function fallbackSpeechSynthesis(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

function getSupabaseClient() {
  try {
    // If Person 1 or Lovable adds a client in @/integrations/supabase/client
    const glob = import.meta.glob("@/integrations/supabase/client*", { eager: true });
    const mod = Object.values(glob)[0] as any;
    if (mod?.supabase?.functions?.invoke) {
      return mod.supabase;
    }
  } catch {
    // Ignore and use fallback client
  }

  return {
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        const url = (import.meta.env["VITE_SUPABASE_URL"] ?? import.meta.env["SUPABASE_URL"]) as string | undefined;
        const key = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
          import.meta.env["VITE_SUPABASE_ANON_KEY"] ??
          import.meta.env["SUPABASE_ANON_KEY"]) as string | undefined;

        if (!url || !key) {
          return { data: null, error: new Error("Backend not configured (VITE_SUPABASE_URL or key missing)") };
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);

        try {
          const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key };
          if (key.split(".").length === 3) headers["Authorization"] = `Bearer ${key}`;

          const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${name}`, {
            method: "POST",
            headers,
            body: JSON.stringify(options.body),
            signal: ctrl.signal,
          });

          if (!res.ok) {
            return { data: null, error: new Error(`HTTP ${res.status}`) };
          }

          const data = await res.json();
          return { data, error: null };
        } catch (e) {
          return { data: null, error: e };
        } finally {
          clearTimeout(timer);
        }
      },
    },
  };
}

export async function speak(text: string): Promise<void> {
  try {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Stop previous audio
    stopSpeaking();

    // Check in-memory cache
    let blobUrl = audioCache.get(trimmed);

    if (!blobUrl) {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("speak", {
        body: { text: trimmed },
      });

      if (error || !data?.audioBase64) {
        console.warn("[speak] Edge function speak failed, falling back to Web Speech:", error);
        await fallbackSpeechSynthesis(trimmed);
        return;
      }

      const blob = base64ToBlob(data.audioBase64, data.mimeType || "audio/mpeg");
      blobUrl = URL.createObjectURL(blob);
      audioCache.set(trimmed, blobUrl);
    }

    if (typeof window === "undefined") return;

    if (!sharedAudio) {
      sharedAudio = new Audio();
    }

    sharedAudio.src = blobUrl;

    await new Promise<void>((resolve) => {
      if (!sharedAudio) {
        resolve();
        return;
      }

      sharedAudio.onended = () => resolve();
      sharedAudio.onerror = () => {
        // Fallback to speech synthesis on audio error
        void fallbackSpeechSynthesis(trimmed).then(resolve);
      };

      sharedAudio.play().catch(() => {
        // Autoplay rejection: fail silently
        resolve();
      });
    });
  } catch {
    // Contract requirement: never throws
  }
}

export function stopSpeaking(): void {
  try {
    if (sharedAudio) {
      sharedAudio.pause();
      sharedAudio.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // Ignore error
  }
}
