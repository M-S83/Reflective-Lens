// =============================================================================
// generate-reflection-questions
// After a reflection is saved, gently nudge the coach to add a little context
// ONLY where the reflection reads as brief or broad. If it's already detailed,
// ask nothing. Every question is optional and skippable.
//
// Principle: "Mirror, not verdict." Questions invite a bit more detail — a
// concrete example, what something looked like, which player/moment — never
// analysis, judgement, or advice on what they should have done.
//
// Body: { reflection_id: string, max_questions?: number }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, serviceClient, userClient } from "../_shared/clients.ts";
import { voiceInstruction } from "../_shared/voice.ts";
import { reflectionGrounding } from "../_shared/knowledge.ts";

interface GeneratedQuestion {
  question_text: string;
  question_type: "multiple_choice" | "voice" | "text" | "rating";
  options: { value: string; label: string }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reflection_id, max_questions = 3 } = await req.json();
    if (!reflection_id) return jsonResponse({ error: "Missing reflection_id" }, 400);

    const supa = userClient(req);
    const { data: ref, error } = await supa
      .from("reflections").select("*").eq("id", reflection_id).single();
    if (error || !ref) return jsonResponse({ error: "Not found or not permitted" }, 403);

    // Give the model the whole reflection so it can judge where detail is thin.
    const context = JSON.stringify({
      raw_transcript: ref.raw_transcript,
      summary: ref.summary,
      what_went_well: ref.what_went_well,
      what_did_not_work: ref.what_did_not_work,
      learning_evidence: ref.learning_evidence,
      action_points: ref.action_points,
      suggested_next_focus: ref.suggested_next_focus,
    });

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, ref.user_id);

    // Learn from its OWN behaviour, not just what the coach writes: if they keep
    // skipping a kind of question, ask fewer of those and lean into what lands.
    // (followup_questions RLS already scopes this to the user's own history.)
    const { data: qHistory } = await supa
      .from("followup_questions").select("question_type, skipped").limit(300);
    const engagementHint = buildEngagementHint(qHistory ?? []);

    // Ground coach nudges in the curated reflective-prompt bank (players already
    // get their own open questions, so no coach-prompt grounding for them).
    const grounding = ref.reflection_type === "player"
      ? ""
      : await reflectionGrounding(admin, reflection_id);

    // Players and coaches get a different kind of question.
    //  • Player: open reflective questions ARE the point — always offer a few,
    //    grounded in what they wrote, to help them think it through.
    //  • Coach: a light nudge, only where the reflection is brief or broad.
    const playerSystem =
      "You help a PLAYER reflect on their own game, from what they wrote or said. " +
      "Principle: MIRROR, NOT VERDICT — never judge or tell them what to do. Ask a " +
      "few open, curious, personal questions grounded in THEIR account: what made a " +
      "moment feel the way it did, when they felt most/least themselves, what they'd " +
      "want from next time. Where it fits, you may also ask whether their coach said " +
      "anything to them about their game and what they made of it (the player reflects " +
      "on real feedback they were given — nothing is shared between accounts). " +
      "Questions open a door; they don't lead to an answer.\n" +
      `- Ask ${max_questions} short open questions, each tied to something they said.\n` +
      "- Every question is optional and skippable.\n";

    const coachSystem =
      "You help a coach add a little context to their own reflection. " +
      "Principle: MIRROR, NOT VERDICT — never judge, coach, or suggest what " +
      "they should have done. Your ONLY job is to invite a bit more detail " +
      "where the reflection reads as brief or broad: a concrete example, what " +
      "something looked like, which player or moment, or what a vague word " +
      "(\"chaotic\", \"good\", \"better\") actually meant here.\n" +
      "Rules:\n" +
      "- If a point is already specific and detailed, do NOT ask about it.\n" +
      "- If the whole reflection is already rich, return an empty array [].\n" +
      `- Ask AT MOST ${max_questions} short, gentle, open questions, each tied ` +
      "to one thin or broad spot.\n" +
      "- Questions invite context, not analysis or self-criticism, and are " +
      "always skippable.\n";

    const raw = await callClaude({
      system:
        (ref.reflection_type === "player" ? playerSystem : coachSystem) +
        grounding +
        engagementHint +
        'Return ONLY a JSON array of objects with keys: question_text (string), ' +
        'question_type ("text"|"voice"|"multiple_choice"|"rating"), options ' +
        "(array of {value,label}; [] unless multiple_choice)." +
        voice,
      prompt: context,
      model: MODELS.reflectionQuestions,
      feature: "generate-reflection-questions",
      log: { admin, userId: ref.user_id },
    });

    const questions = safeParse(raw).slice(0, max_questions);

    const rows = questions.map((q) => ({
      reflection_id,
      question_text: q.question_text,
      question_type: q.question_type ?? "text",
      options: q.options ?? [],
    }));

    // Let long-term trends influence the reflection: surface reflective prompts
    // from recurring insights on this event's team (up to 2), so a pattern the
    // notes have been telling gets asked about here too.
    const { data: ev } = await supa
      .from("events").select("team_id").eq("id", ref.event_id).single();
    if (ev?.team_id) {
      const { data: trends } = await supa
        .from("insights")
        .select("reflective_prompt")
        .eq("team_id", ev.team_id)
        .not("reflective_prompt", "is", null)
        .order("updated_at", { ascending: false })
        .limit(2);
      for (const t of trends ?? []) {
        rows.push({
          reflection_id,
          question_text: t.reflective_prompt as string,
          question_type: "text",
          options: [],
        });
      }
    }

    const { data: inserted, error: insErr } = rows.length
      ? await admin.from("followup_questions").insert(rows).select()
      : { data: [], error: null };
    if (insErr) return jsonResponse({ error: insErr.message }, 500);

    return jsonResponse({ ok: true, questions: inserted });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

function safeParse(raw: string): GeneratedQuestion[] {
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch {
    return [];
  }
}

// Turn the user's own answer-vs-skip history into a steer for the model. With
// enough samples, name the kinds they keep skipping (so we ask fewer) and the
// kind they engage with most (so we lean in). Silent until there's signal.
function buildEngagementHint(
  history: { question_type: string | null; skipped: boolean | null }[],
): string {
  const stat: Record<string, { n: number; skipped: number }> = {};
  for (const q of history) {
    const t = q.question_type ?? "text";
    const s = (stat[t] ??= { n: 0, skipped: 0 });
    s.n++;
    if (q.skipped) s.skipped++;
  }
  const seen = Object.entries(stat).filter(([, s]) => s.n >= 4);
  if (seen.length === 0) return "";

  const skipped = seen
    .filter(([, s]) => s.skipped / s.n >= 0.6)
    .map(([t]) => t);
  const engaged = seen
    .slice()
    .sort((a, b) => a[1].skipped / a[1].n - b[1].skipped / b[1].n)[0]?.[0];

  const parts: string[] = [];
  if (skipped.length) {
    parts.push(
      `This person usually skips ${skipped.join(" and ")} questions — ` +
        "ask very few or none of those.",
    );
  }
  if (engaged && !skipped.includes(engaged)) {
    parts.push(`They engage most with ${engaged} questions — prefer that kind.`);
  }
  return parts.length
    ? "Adapt to how they've engaged before: " + parts.join(" ") + " "
    : "";
}
