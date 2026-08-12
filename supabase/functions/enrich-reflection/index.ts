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
import { MIRROR_NOT_VERDICT } from "../_shared/principles.ts";

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
        // NOT "refine". The earlier wording was "you refine a coach's own
        // reflection", and the model dutifully returned "Here's a refined
        // version of your reflection: ...", which was then saved and shown back
        // to the coach under a heading that says "with your added context". Two
        // problems in one line: the model narrating its own job into the
        // artefact, and the word "refined" telling a coach their own words
        // needed improving. The app joins their sentences together; it does not
        // upgrade them.
        "A coach wrote a reflection, then answered some follow-up questions. " +
        "Join the two into one piece of writing, so what they said in the " +
        "answers sits naturally alongside what they wrote first. " +
        MIRROR_NOT_VERDICT +
        " Use ONLY what the coach actually wrote, in their voice and their " +
        "words. Do not invent detail, do not add advice, and do not improve " +
        "their phrasing for the sake of it: this is their reflection joined up, " +
        "not a better one. " +
        // Models reach for a preamble when asked to transform text, and this
        // output is stored and read as the coach's own writing.
        "Return ONLY the reflection itself, as plain text. No preamble, no " +
        "\"Here is\", no heading, no commentary about what you did, and no " +
        "sign-off. The first word of your reply is the first word of the " +
        "reflection." +
        voice,
      prompt: JSON.stringify({
        // A voice reflection has NO summary: transcribe-audio writes only
        // raw_transcript. Without the fallback this sent null, so the enriched
        // text was woven from the follow-up answers alone with the coach's
        // actual reflection missing, and that is the app's main way in.
        // generate-reflection-questions and generate-report both already read
        // it this way round.
        original_summary: ref.summary ?? ref.raw_transcript ?? "",
        what_went_well: ref.what_went_well,
        what_did_not_work: ref.what_did_not_work,
        added_context: answered,
      }),
      maxTokens: 1024,
      model: MODELS.enrichReflection,
      feature: "enrich-reflection",
      log: { admin, userId: ref.user_id },
    });

    // Backstop for the same failure. A prompt rule reduces the preamble but
    // does not remove it, and this text is stored and shown to the coach as
    // their own reflection, so one leaking through is worse than a little
    // defensiveness here. Narrow on purpose: it only fires on a short opening
    // clause that announces itself and ends in a colon, so a reflection that
    // genuinely begins "The thing is:" survives.
    const enriched_summary = stripPreamble(raw.trim());

    // A bad or empty model reply must never blank an existing enriched summary.
    // Keep whatever was there and report the no-op instead of overwriting.
    if (!enriched_summary) {
      console.error("enrich-reflection: empty model reply", { reflection_id });
      return jsonResponse({ ok: true, enriched: false, reason: "model returned nothing; kept previous" });
    }

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

// Remove an opening "Here's a refined version of your reflection:" style
// announcement, if the model added one despite being told not to. Requires all
// of: the very start of the text, one of a few announcing verbs, no more than
// 80 characters before the colon, and real content after it.
function stripPreamble(text: string): string {
  const m = text.match(
    /^\s*(?:here\s*(?:'|\u2019)?s|here is|this is|below is|the following is)\b[^:\n]{0,80}:\s*(?=\S)/i,
  );
  return m ? text.slice(m[0].length).trim() : text;
}
