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
import { reflectionGrounding, reflectivePrompts } from "../_shared/knowledge.ts";
import { firstJsonArray } from "../_shared/json.ts";
import { MIRROR_NOT_VERDICT } from "../_shared/principles.ts";

// The question that turns toward next time. Deliberately NOT written by the
// model, and deliberately the same every time.
//
// The model was writing it, tied to something from the reflection. But choosing
// WHICH thing to ask about is itself a judgement: it decides which part of the
// session deserved changing, which is a quieter version of the advice this
// product does not give. A fixed, open question decides nothing. The coach
// picks what to think about, or picks nothing.
//
// Written in code rather than prompted, so it cannot drift into a suggestion,
// cannot be skipped when the reflection looks complete, costs no tokens, and
// reads the same after every session, which is what a reflective habit is made
// of. "If at all" is load-bearing: it presumes nothing went wrong.
const FORWARD_QUESTION =
  "If you ran this session again, how would you change or improve it, if at all?";

interface GeneratedQuestion {
  question_text: string;
  question_type: "multiple_choice" | "voice" | "text" | "rating";
  options: { value: string; label: string }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Two generated, two curated, one fixed: five in total, from three sources.
    const { reflection_id, max_questions = 2 } = await req.json();
    if (!reflection_id) return jsonResponse({ error: "Missing reflection_id" }, 400);

    const supa = userClient(req);
    const { data: ref, error } = await supa
      .from("reflections").select("*").eq("id", reflection_id).single();
    if (error || !ref) return jsonResponse({ error: "Not found or not permitted" }, 403);

    // Idempotent: if questions were already generated for this reflection, return
    // them rather than inserting a duplicate set. These calls get retried, and a
    // reflection tool that asks the same thing twice reads as not listening.
    const { data: existingQ } = await supa
      .from("followup_questions").select("*").eq("reflection_id", reflection_id);
    if (existingQ && existingQ.length > 0) {
      return jsonResponse({ ok: true, questions: existingQ, deduped: true });
    }

    // Give the model the reflection so it can judge where detail is thin.
    // F26: for text reflections raw_transcript and summary are the identical
    // string, so the coach context sends the reflection text once. The player
    // context is left unchanged (byte-identical payload).
    const structured = {
      what_went_well: ref.what_went_well,
      what_did_not_work: ref.what_did_not_work,
      learning_evidence: ref.learning_evidence,
      action_points: ref.action_points,
      suggested_next_focus: ref.suggested_next_focus,
    };
    const context = JSON.stringify(
      { reflection: ref.summary ?? ref.raw_transcript ?? "", ...structured },
    );

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, ref.user_id);

    // Learn from its OWN behaviour, not just what the coach writes: if they keep
    // skipping a kind of question, ask fewer of those and lean into what lands.
    // (followup_questions RLS already scopes this to the user's own history.)
    const { data: qHistory } = await supa
      .from("followup_questions").select("question_type, skipped").limit(300);
    const engagementHint = buildEngagementHint(qHistory ?? []);

    // Ground the nudges in the curated reflective-prompt bank.
    const grounding = await reflectionGrounding(admin, reflection_id);

    const system =
      "You help a coach think about their own session, by asking about it. " +
      MIRROR_NOT_VERDICT +
      // The distinction the whole feature rests on. A question is not a verdict:
      // "what would you want to see instead?" invites the coach to think, while
      // "try a smaller pitch" decides for them. The first is reflection, the
      // second is the line this product does not cross.
      " You ask QUESTIONS. You never answer them, and you never suggest what " +
      "they should have done or should do next. If you find yourself about to " +
      "recommend something, turn it back into a question about what THEY " +
      "would want.\n" +
      "Your job is to invite a bit more detail where the reflection reads as " +
      "brief or broad. A concrete example, what something looked like, which " +
      "player or moment, or what a vague word (\"chaotic\", \"good\", " +
      "\"better\") actually meant here.\n" +
      // A question about next time IS asked, but not here: it is appended in
      // code below, identically every time. See FORWARD_QUESTION.
      "Do NOT ask anything about next time, about changing or improving the " +
      "session, or about what they would do differently. That question is " +
      "already asked separately and must not be duplicated here.\n" +
      // Without this the cycle stops at describing what happened. A coach can
      // write up every session for a season and never once be invited to think
      // about doing it differently, which is most of the value of reflecting.
      "Rules:\n" +
      "- If a point is already specific and detailed, do NOT ask about it.\n" +
      "- If the whole reflection is already specific and detailed, return an " +
      "empty array []. That is a fine outcome.\n" +
      `- Ask AT MOST ${max_questions} short, gentle, open questions.\n` +
      "- Questions invite context, not analysis or self-criticism, and are " +
      "always skippable.\n";

    const raw = await callClaude({
      system:
        system +
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

    const questions = firstJsonArray<GeneratedQuestion>(raw).slice(0, max_questions);

    const rows = questions
      // Belt and braces: if the model asks about next time anyway, drop it
      // rather than ask the same thing twice in different words.
      .filter((q) => !/next time|next session|differently|change or improve/i.test(q.question_text ?? ""))
      .map((q) => ({
        reflection_id,
        question_text: q.question_text,
        question_type: q.question_type ?? "text",
        options: q.options ?? [],
      }));

    // Curated reflective prompts, asked verbatim from the bank (0006). These are
    // the questions that open new thinking rather than filling gaps in what was
    // written: where your eyes went, whether you connected before you corrected,
    // whether you left space for players to decide. They were only ever used to
    // ground the model's style, never asked, which wasted the best questions in
    // the app. Seeded on the reflection so a coach works through the bank week by
    // week instead of meeting the same one every time.
    for (const prompt of await reflectivePrompts(admin, reflection_id, 2)) {
      rows.push({
        reflection_id,
        question_text: prompt,
        question_type: "text",
        options: [],
      });
    }

    // Always last, always asked, even when there are no detail questions at all.
    rows.push({
      reflection_id,
      question_text: FORWARD_QUESTION,
      question_type: "text",
      options: [],
    });

    // NOTE: insights are disabled for this dispatch (migration 0013). The old
    // wire that appended up to two cross-session "recurring theme" prompts here
    // has been removed: a per-session reflection draws only on THIS session.
    // Cross-time linked questions return as the post-dispatch insights rebuild.

    const { data: inserted, error: insErr } = rows.length
      ? await admin.from("followup_questions").insert(rows).select()
      : { data: [], error: null };
    if (insErr) return jsonResponse({ error: insErr.message }, 500);

    return jsonResponse({ ok: true, questions: inserted });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

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
