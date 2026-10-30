import { coachSpeech } from "./coach.functions";
import { speak, stopSpeaking } from "./voice/speak";

let current: HTMLAudioElement | null = null;
let token = 0;

/** Speak with the ElevenLabs coach voice; falls back to the browser voice. Never throws. */
export async function speakCoach(text: string): Promise<void> {
  stopCoach();
  const my = ++token;
  try {
    const { audio } = await coachSpeech({ data: { text } });
    if (my !== token) return;
    if (!audio) return speak(text);
    const el = new Audio(`data:audio/mpeg;base64,${audio}`);
    current = el;
    await new Promise<void>((resolve) => {
      el.onended = () => resolve();
      el.onerror = () => resolve();
      el.onpause = () => resolve();
      el.play().catch(() => resolve());
    });
  } catch {
    if (my === token) await speak(text);
  }
}

export function stopCoach(): void {
  token++;
  if (current) {
    current.pause();
    current = null;
  }
  stopSpeaking();
}
