// Run with: deno run -A --env-file=.env.local supabase/functions/speak/selftest.ts
const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID");

if (!apiKey || !voiceId) {
  console.error("Error: ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set in .env.local");
  Deno.exit(1);
}

const testText = "Trade with a reason, not a hunch.";
console.log(`[selftest] Requesting ElevenLabs audio for: "${testText}"...`);

const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
const response = await fetch(url, {
  method: "POST",
  headers: {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: testText,
    model_id: "eleven_flash_v2_5",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  }),
});

if (!response.ok) {
  const err = await response.text().catch(() => "");
  console.error(`[selftest] ElevenLabs API error: HTTP ${response.status}: ${err}`);
  Deno.exit(1);
}

const audioBuffer = new Uint8Array(await response.arrayBuffer());
const outputPath = "speak-test.local.mp3";
await Deno.writeFile(outputPath, audioBuffer);

console.log(`[selftest] Success! Wrote ${audioBuffer.byteLength} bytes to ${outputPath}`);
