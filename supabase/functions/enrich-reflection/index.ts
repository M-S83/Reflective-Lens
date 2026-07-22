// =============================================================================
// enrich-reflection
// Folds the coach's follow-up answers back into the reflection as an enriched
// narrative (written to reflections.enriched_summary). The original summary and
// sections are left untouched.
//
// Adding context is always optional: if the coach skipped every question (no
// answers), this no-ops and the reflection is unchanged. Because the enriched
// summary is always rebuilt from the original summary + current answers, it is
// safe to re-run.
//
// Principle: "Mirror, not verdict." Integrate only what the coach actually said
// — never invent, judge, or add advice.
//
// Body: { reflection_id: string }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, serviceClient, userClient } from "../_shared/clients.ts";
import { voiceInstruction } from "../_shared/voice.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reflection_id } = await req.json();
    if (!reflection_id) return jsonResponse({ error: "Missing reflection_id" }, 400);

    const supa = userClient(req);
    const { data: ref, error } = await supa
      .from("reflections").select("*").eq("id", reflection_id).single();
    if (error || !ref) return jsonResponse({ error: "Not found or not permitted" }, 403);

    // Gather answered follow-ups (question text + the coach's answer).
    const { data: questions } = await supa
      .from("followup_questions")
      .select("question_text, followup_answers(answer_text, selected_option)")
      .eq("reflection_id", reflection_id);

    const answered = (questions ?? [])
      .map((q: any) => {
        const a = (q.followup_answers ?? [])[0];
        const answer = a?.answer_text ?? a?.selected_option;
        return answer ? { q: q.question_text, a: answer } : null;
      })
      .filter(Boolean);

    // Option not to add context: nothing answered → leave the reflection as is.
    if (answered.length === 0) {
      return jsonResponse({ ok: true, enriched: false, reason: "no context added" });
    }

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, ref.user_id);

    const raw = await callClaude({
      system:
        "You refine a football coach's own session reflection by folding in the " +
        "extra context they added when answering follow-up questions. " +
        "Principle: MIRROR, NOT VERDICT — integrate ONLY what the coach actually " +
        "wrote, in their voice. Do not invent detail, judge, praise, criticise, " +
        "or add advice. Keep it concise and faithful. Return ONLY the enriched " +
        "summary as plain text." +
        voice,
      prompt: JSON.stringify({
        original_summary: ref.summary,
        what_went_well: ref.what_went_well,
        what_did_not_work: ref.what_did_not_work,
        added_context: answered,
      }),
      maxTokens: 1024,
      model: MODELS.enrichReflection,
      feature: "enrich-reflection",
      log: { admin, userId: ref.user_id },
    });

    const enriched_summary = raw.trim();

    const { error: upErr } = await admin
      .from("reflections")
      .update({ enriched_summary })
      .eq("id", reflection_id);
    if (upErr) return jsonResponse({ error: upErr.message }, 500);

    return jsonResponse({ ok: true, enriched: true, enriched_summary });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
