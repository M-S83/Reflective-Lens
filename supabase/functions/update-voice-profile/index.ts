// =============================================================================
// update-voice-profile
// Learns a coach's voice from their OWN writing — the raw notes and reflection
// transcripts they type/speak — and distils a profile (style, vocabulary,
// language level) into coach_voice_profiles. Every other AI function then writes
// through that profile, so replies come back in the coach's language and at
// their level. Runs on a cadence (or after N new notes), like update-insights.
//
// Principle: "Mirror, not verdict" — extended to voice. We learn how the coach
// speaks so the app adapts to them, not the other way round.
//
// Body: { user_id?: string }  (defaults to the calling user)
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, recordLearning, resolveActor } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // A signed-in user learning from their own writing, or the nightly sweep
    // (run-learning) learning on a due user's behalf.
    const actor = await resolveActor(req);
    if (!actor) return jsonResponse({ error: "Not authenticated" }, 401);
    const { userId, read: supa, admin } = actor;

    // The coach's own words — raw (pre-cleaning) notes + reflection transcripts.
    const [{ data: obs }, { data: refs }] = await Promise.all([
      supa.from("observations").select("raw_note").eq("user_id", userId)
        .not("raw_note", "is", null).limit(120),
      supa.from("reflections").select("raw_transcript").eq("user_id", userId)
        .not("raw_transcript", "is", null).limit(40),
    ]);

    const samples = [
      ...(obs ?? []).map((o) => o.raw_note),
      ...(refs ?? []).map((r) => r.raw_transcript),
    ].filter(Boolean);

    if (samples.length < 5) {
      // Clear the pending flag so the sweep doesn't keep re-picking this user
      // before there's enough of their writing to learn from.
      await recordLearning(admin, {
        user_id: userId, kind: "voice", inputs_seen: samples.length,
        items_changed: 0, summary: "Not enough of their own writing to learn a voice yet.",
      });
      return jsonResponse({ ok: true, profile: null, reason: "not enough of the coach's own writing yet" });
    }

    const raw = await callClaude({
      system:
        "You analyse how a football coach writes, from samples of their own " +
        "notes and reflections, to build a VOICE PROFILE the app will use to " +
        "reply in their language. Judge their language, not their ability — this " +
        "is about matching how they speak, never grading them. Return ONLY JSON: " +
        '{"style_summary": string (2-3 sentences on their voice, tone and how ' +
        'plain or technical they are), "glossary": string[] (up to 20 terms/' +
        'phrases they actually use), "language_level": "plain"|"developing"|' +
        '"technical"}.',
      prompt: samples.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      maxTokens: 1024,
      model: MODELS.voiceProfile,
      feature: "update-voice-profile",
      log: { admin, userId },
    });

    const parsed = safeParse(raw);

    const { data: profile, error } = await admin
      .from("coach_voice_profiles")
      .upsert({
        user_id: userId,
        style_summary: parsed.style_summary ?? null,
        glossary: parsed.glossary ?? [],
        language_level: parsed.language_level ?? null,
        sample_count: samples.length,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select().single();
    if (error) return jsonResponse({ error: error.message }, 500);

    // Record what this pass learned (and clear the pending flag).
    await recordLearning(admin, {
      user_id: userId,
      kind: "voice",
      inputs_seen: samples.length,
      items_changed: samples.length,
      summary: `Refined their voice from ${samples.length} of their own notes/reflections` +
        (parsed.language_level ? ` (${parsed.language_level}).` : "."),
    });

    return jsonResponse({ ok: true, profile, learned_from: samples.length });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

function safeParse(raw: string): {
  style_summary?: string;
  glossary?: string[];
  language_level?: string;
} {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  } catch {
    return {};
  }
}
