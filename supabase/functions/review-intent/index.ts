// =============================================================================
// review-intent
// Checks what the coach hoped to see (event.hoping_to_see) against the notes
// actually captured for the event. Writes the result to
// reflections.hoped_to_see_review, and turns every "not observed" item into a
// gentle, skippable follow-up question — "you hoped to see X, nothing was noted
// on it — why?" — so it becomes part of the reflection.
//
// Principle: "Mirror, not verdict." This only reports whether the notes touched
// on each aim — it does not grade whether the team was good at it.
//
// Body: { reflection_id: string }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, serviceClient, userClient } from "../_shared/clients.ts";
import { voiceInstruction } from "../_shared/voice.ts";

interface ReviewItem {
  item: string;
  status: "showed_up" | "partly" | "not_observed";
  evidence: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reflection_id } = await req.json();
    if (!reflection_id) return jsonResponse({ error: "Missing reflection_id" }, 400);

    const supa = userClient(req);
    const { data: ref, error } = await supa
      .from("reflections").select("id, event_id, user_id").eq("id", reflection_id).single();
    if (error || !ref) return jsonResponse({ error: "Not found or not permitted" }, 403);

    // The event's up-front intent + the notes actually taken.
    const { data: event } = await supa
      .from("events").select("hoping_to_see").eq("id", ref.event_id).single();
    const hoping: string[] = event?.hoping_to_see ?? [];
    if (hoping.length === 0) {
      return jsonResponse({ ok: true, review: [], reason: "nothing was set to look for" });
    }

    const { data: observations } = await supa
      .from("observations")
      .select("capture_phase, cleaned_note, raw_note, tags")
      .eq("event_id", ref.event_id);

    const notes = (observations ?? []).map((o) => ({
      phase: o.capture_phase,
      note: o.cleaned_note ?? o.raw_note,
      tags: o.tags,
    }));

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, ref.user_id);

    const raw = await callClaude({
      system:
        "You compare what a football coach hoped to see in a session against the " +
        "notes they actually captured. Principle: MIRROR, NOT VERDICT — report " +
        "ONLY whether the notes touched on each aim, never whether the team did " +
        "it well. For each hoped-for item return: item (verbatim), status " +
        '("showed_up" if a note clearly relates, "partly" if only loosely, ' +
        '"not_observed" if no note touches it), and evidence (quote/paraphrase ' +
        "the relevant note, or empty if none). Return ONLY a JSON array." +
        voice,
      prompt: JSON.stringify({ hoping_to_see: hoping, notes }),
      maxTokens: 1024,
      model: MODELS.reviewIntent,
      feature: "review-intent",
      log: { admin, userId: ref.user_id },
    });

    const review: ReviewItem[] = safeParse(raw);

    await admin.from("reflections")
      .update({ hoped_to_see_review: review }).eq("id", reflection_id);

    // Each unobserved aim becomes a "why wasn't this seen?" prompt (skippable).
    const gaps = review.filter((r) => r.status === "not_observed");
    let questions: unknown[] = [];
    if (gaps.length) {
      const rows = gaps.map((g) => ({
        reflection_id,
        question_text:
          `You hoped to see “${g.item}”, but none of your notes touched on it. ` +
          "Did it not come up, or did you not get a chance to look?",
        question_type: "text",
        options: [],
      }));
      const { data } = await admin.from("followup_questions").insert(rows).select();
      questions = data ?? [];
    }

    return jsonResponse({ ok: true, review, gap_questions: questions });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

function safeParse(raw: string): ReviewItem[] {
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch {
    return [];
  }
}
