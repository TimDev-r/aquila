import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 400) {
    return new Response(
      JSON.stringify({ error: "Text must be non-empty and at most 400 characters" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID");
  if (!apiKey || !voiceId) {
    console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID in environment");
    return new Response(
      JSON.stringify({ error: "ElevenLabs configuration missing on server" }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`ElevenLabs API error: HTTP ${response.status}: ${errorText}`);
      return new Response(
        JSON.stringify({ error: `ElevenLabs request failed: HTTP ${response.status}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = encodeBase64(arrayBuffer);

    return new Response(
      JSON.stringify({ audioBase64, mimeType: "audio/mpeg" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error calling ElevenLabs:", err);
    const message = (err as Error).name === "AbortError"
      ? "ElevenLabs request timed out after 15s"
      : (err as Error).message || "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } finally {
    clearTimeout(timer);
  }
});
