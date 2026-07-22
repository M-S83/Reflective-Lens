// =============================================================================
// transcribe-audio
// Transcribes an audio recording (live observation, reflection, follow-up answer)
// and writes the transcript back to the originating row.
//
// Body: {
//   bucket: "audio-recordings",
//   audio_path: string,
//   target: "observation" | "reflection" | "answer",
//   target_id: string
// }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { logUsage, serviceClient, userClient, WHISPER_USD_PER_MINUTE } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { bucket, audio_path, target, target_id } = await req.json();
    if (!audio_path || !target || !target_id) {
      return jsonResponse({ error: "Missing audio_path / target / target_id" }, 400);
    }

    // Verify the caller can see the target row (RLS-scoped read). Under the
    // ownership model the caller IS the owner, so their id owns the usage cost.
    const supa = userClient(req);
    const { data: auth } = await supa.auth.getUser();
    if (!auth?.user) return jsonResponse({ error: "Not authenticated" }, 401);

    const table =
      target === "observation" ? "observations"
      : target === "reflection" ? "reflections"
      : "followup_answers";

    const { data: row, error: rowErr } = await supa
      .from(table).select("id").eq("id", target_id).single();
    if (rowErr || !row) return jsonResponse({ error: "Not found or not permitted" }, 403);

    // Download the audio from storage.
    const admin = serviceClient();
    const { data: file, error: dlErr } = await admin.storage
      .from(bucket ?? "audio-recordings").download(audio_path);
    if (dlErr || !file) return jsonResponse({ error: "Could not download audio" }, 404);

    // --- Transcription -------------------------------------------------------
    // Swap in your STT provider of choice (OpenAI Whisper, Deepgram, etc.).
    const { text: transcript, durationSeconds } = await transcribe(file);

    // Write the transcript back to the correct column.
    const update =
      target === "observation" ? { raw_note: transcript }
      : target === "reflection" ? { raw_transcript: transcript }
      : { answer_text: transcript };

    const { error: upErr } = await admin.from(table).update(update).eq("id", target_id);
    if (upErr) return jsonResponse({ error: upErr.message }, 500);

    // Record the transcription cost (billed by the minute of audio).
    if (durationSeconds != null) {
      await logUsage(admin, {
        user_id: auth.user.id,
        event_name: "transcription",
        feature: `transcribe:${target}`,
        audio_seconds: Math.round(durationSeconds),
        cost_usd: (durationSeconds / 60) * WHISPER_USD_PER_MINUTE,
      });
    }

    return jsonResponse({ ok: true, target, target_id, transcript });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

// Placeholder STT call. Replace with a real provider.
// verbose_json returns the audio duration, which we use to price the call.
async function transcribe(file: Blob): Promise<{ text: string; durationSeconds: number | null }> {
  const form = new FormData();
  form.append("file", file, "audio.webm");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
    body: form,
  });
  if (!res.ok) throw new Error(`STT error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.text ?? "", durationSeconds: data.duration ?? null };
}
