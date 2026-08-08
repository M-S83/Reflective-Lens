// =============================================================================
// generate-report
// Aggregates an event's observations + reflection (+ team sheet roster)
// into a structured report (JSON + markdown) and stores it in `reports`.
//
// Principle: "Mirror, not verdict." The report organises and surfaces patterns;
// it does not grade or pass judgement on the user or players.
//
// Body: { event_id: string, report_type: ReportType, title?: string }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, serviceClient, userClient } from "../_shared/clients.ts";
import { voiceInstruction } from "../_shared/voice.ts";
import { isUnder18, safeName, safeNameMap } from "../_shared/names.ts";
import { firstJsonObject } from "../_shared/json.ts";
import { type MdBlock, renderReport } from "../_shared/markdown.ts";
import { MIRROR_NOT_VERDICT } from "../_shared/principles.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { event_id, report_type, title } = await req.json();
    if (!event_id || !report_type) {
      return jsonResponse({ error: "Missing event_id / report_type" }, 400);
    }

    // Caller must be able to access the event (RLS).
    const supa = userClient(req);
    const { data: event, error } = await supa
      .from("events").select("*").eq("id", event_id).single();
    if (error || !event) return jsonResponse({ error: "Not found or not permitted" }, 403);

    const [{ data: observations }, { data: reflections }, { data: squad },
           { data: matchDetails }, { data: matchStats }] =
      await Promise.all([
        supa.from("observations").select("*").eq("event_id", event_id)
          .order("timestamp_seconds", { ascending: true }),
        supa.from("reflections").select("*").eq("event_id", event_id),
        // Canonical squad: event_attendance joined to players (not team_sheets).
        supa.from("event_attendance")
          .select("status, selection, players(id, first_name, last_name, display_name, shirt_number, position)")
          .eq("event_id", event_id),
        supa.from("match_details").select("*").eq("event_id", event_id).maybeSingle(),
        supa.from("match_stats").select("*, players(display_name)").eq("event_id", event_id),
      ]);

    // The reflective open questions + the person's own answers — the focus for
    // next is drawn from these, not invented.
    const reflectionId = reflections?.[0]?.id;
    const { data: qa } = reflectionId
      ? await supa.from("followup_questions")
        .select("question_text, followup_answers(answer_text, selected_option)")
        .eq("reflection_id", reflectionId)
      : { data: [] };
    const reflective_qa = (qa ?? []).map((q: any) => ({
      question: q.question_text,
      answer: (q.followup_answers ?? [])[0]?.answer_text ??
        (q.followup_answers ?? [])[0]?.selected_option ?? null,
    })).filter((x) => x.answer);


    // Under-18 name privacy: players are referred to by first name only (last
    // initial to disambiguate), keyed off the team age group. No names beyond
    // this reach the model via the roster or stats.
    const { data: team } = event.team_id
      ? await supa.from("teams").select("age_group").eq("id", event.team_id).maybeSingle()
      : { data: null };
    const under18 = isUnder18((team as { age_group?: string } | null)?.age_group);
    const squadPlayers = (squad ?? []).map((a: any) => a.players).filter(Boolean);
    const nameMap = safeNameMap(squadPlayers, under18);
    const statName = (s: any) =>
      nameMap[s.player_id] ?? safeName({ display_name: s.players?.display_name }, under18);


    const payload = JSON.stringify({
      event: {
        type: event.event_type, title: event.title, date: event.event_date,
        opposition: event.opposition, focus_area: event.focus_area,
        purpose: event.purpose,
      },
      // What the coach hoped to see up front, and how the notes matched it.
      hoping_to_see: event.hoping_to_see ?? [],
      hoped_to_see_review: reflections?.[0]?.hoped_to_see_review ?? [],
      observations: (observations ?? []).map((o) => ({
        minute: o.match_minute, type: o.observation_type, subject: o.subject_type,
        note: o.cleaned_note ?? o.raw_note, tags: o.tags, sentiment: o.sentiment,
        phase: o.phase_of_play,
      })),
      // F24: the report needs only the reflection TEXT (enriched summary, else
      // summary, else the raw transcript for voice reflections). The whole row,
      // a duplicate transcript plus the AI-generated fields written back by a
      // prior report plus ids and timestamps, is not sent.
      reflection: reflections?.[0]
        ? {
          summary: reflections[0].enriched_summary ?? reflections[0].summary ??
            reflections[0].raw_transcript ?? null,
        }
        : null,
      // The reflective questions and the person's own answers.
      reflective_qa,
      // Included for match reports (null/empty for training). Player labelled by
      // first name only (under-18 privacy).
      match_result: matchDetails ?? null,
      match_stats: (matchStats ?? []).map((s: any) => ({
        player: statName(s), goals: s.goals, assists: s.assists,
        yellow_cards: s.yellow_cards, red_cards: s.red_cards, clean_sheet: s.clean_sheet,
      })),
      // Squad from event_attendance (status + selection). First name only.
      roster: (squad ?? []).map((a: any) => ({
        name: a.players?.id ? nameMap[a.players.id] : safeName(a.players ?? {}, under18),
        shirt: a.players?.shirt_number ?? null,
        position: a.players?.position ?? null,
        status: a.status, selection: a.selection,
      })),
    });

    // Step 6 runs on a COMPLETE session only. A coach report needs a reflection
    // with content: never generate on partial input (aims and notes alone).
    {
      const r = reflections?.[0];
      const hasReflection = !!(r && (((r.summary ?? "") as string).trim() ||
        ((r.raw_transcript ?? "") as string).trim()));
      if (!hasReflection) {
        return jsonResponse(
          { error: "A reflection is needed before a report. Add your reflection first." },
          422,
        );
      }
    }

    // Change-detection: fingerprint ONLY what the coach
    // supplied (aims, notes, reflection, answers, result), not any AI-derived
    // field, so folding the structured summary back into the reflection does not
    // itself count as a change. Unchanged source returns the existing report;
    // changed regenerates in place.
    const sourceForHash = JSON.stringify({
      aims: event.hoping_to_see ?? [],
      focus: event.focus_area ?? null,
      purpose: event.purpose ?? null,
      notes: (observations ?? []).map((o) => o.cleaned_note ?? o.raw_note),
      reflection: reflections?.[0]?.raw_transcript ?? reflections?.[0]?.summary ?? null,
      answers: reflective_qa,
      result: matchDetails ?? null,
    });
    const fingerprint = await sha256(sourceForHash);
    let prior: { id: string; source_fingerprint: string | null } | null = null;
    {
      const { data } = await supa
        .from("reports").select("id, source_fingerprint")
        .eq("event_id", event_id).eq("report_type", report_type)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      prior = (data as typeof prior) ?? null;
      if (prior && prior.source_fingerprint === fingerprint) {
        return jsonResponse({ ok: true, report: prior, unchanged: true });
      }
    }

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, event.user_id);

    const raw = await callClaude({
      system:
        "You produce football reflection reports. " +
        // Repointed to the shared principle. This function was deliberately left
        // on its own inline copy during the F14 consolidation, as a "mixed"
        // caller serving both coach and player. That deferral had a cost: the
        // inline wording said only "do not grade or judge", never mentioning
        // praise, and a real report came back describing something the coach had
        // merely recounted as "which was impressive". The shared text now spells
        // the praise rule out concretely, and this is the function that most
        // needed it.
        MIRROR_NOT_VERDICT + " " +
        "RESTATE ONLY what the coach actually said: never add a " +
        "characterisation of the game or a person they did not make themselves " +
        "(e.g. don't call it 'a sharp game' unless they did — 'felt sharp' is " +
        "about them, not the match). " +
        "This is a COACH'S single-session report. Draw ONLY on what the coach " +
            "provided for THIS session: the aims, the notes captured, their " +
            "reflection, and their answers to the reflective questions. If " +
            "something was not raised, do NOT mention it. Any field with no " +
            "support MUST be an empty array: never infer, never invent, never fill " +
            "a gap. This is a SINGLE session: do not reference other sessions, " +
            "form over time, or trends (those belong in the period reports). " +
            "Review each aim the coach hoped to see against the notes and give it " +
            "a status: \"recorded\" (a note clearly relates), \"partly\" (only " +
            "loosely), or \"stated_not_recorded\" (no note touches it). Keep EVERY " +
            "aim, including stated_not_recorded; never drop one. For noted_for_next, " +
            "reflect back only what the coach noted for next time and their own " +
            "answers: add no recommendations of your own. " +
            // With a handful of notes the model fills every section by
            // rewording the same two observations, which turns a thin session
            // into something that looks like a form being completed. Real output
            // carried one note verbatim in both what_went_well and
            // learning_evidence, and another in three sections at once.
            "EACH POINT APPEARS ONCE. Every section must earn its content: do NOT " +
            "restate a point that already appears elsewhere, even reworded. A " +
            "short session should produce a short report with several EMPTY " +
            "arrays, and that is the correct outcome, not a failure. Empty is " +
            "always better than repeated. " +
            "learning_evidence is specifically for a moment where something was " +
            "understood or taken on: it is not a second home for a difficulty, " +
            "and a shortcoming never belongs there. session_patterns is only for " +
            "something recurring ACROSS several notes in this session; with one " +
            "or two notes it must be empty rather than a summary of what is " +
            "already written above. " +
            'Return ONLY JSON with keys: "headline" (string), "aims_review" (array ' +
            'of {aim, status, note}), "what_went_well" (string[]), ' +
            '"what_did_not_work" (string[]), "action_points" (string[]), ' +
            '"noted_for_next" (string[]), "learning_evidence" (string[]), ' +
            '"session_patterns" (string[], patterns WITHIN this one session only).' +
        voice,
      prompt: `Report type: ${report_type}\n\nData:\n${payload}`,
      maxTokens: 4096,
      model: MODELS.report,
      feature: "generate-report",
      log: { admin, userId: event.user_id, clubId: event.club_id, teamId: event.team_id },
    });

    const content_json = firstJsonObject(raw);
    const c = content_json as Record<string, unknown>;
    const heading = title ?? `${event.title}: Report`;

    // Never store a blank report.
    const structured = !!(
        c.headline ||
        (Array.isArray(c.aims_review) && c.aims_review.length) ||
        (Array.isArray(c.what_went_well) && c.what_went_well.length) ||
        (Array.isArray(c.what_did_not_work) && c.what_did_not_work.length) ||
        (Array.isArray(c.noted_for_next) && c.noted_for_next.length)
      );
    const content_markdown = !structured
      ? `# ${heading}\n\n${(raw ?? "").trim() ||
          "_The report came back empty. Please try generating it again._"}`
      : coachMarkdown(heading, content_json);
    if (!structured) {
      // Never log the reply body: it contains player names and note text (youth
      // PII). Length + event id are enough to spot and investigate the failure.
      console.error("generate-report: unstructured model reply", {
        event_id,
        length: (raw ?? "").length,
      });
    }

    // F4: fold the structured summary back into the reflection so the period
    // report (which aggregates these fields) has real data. Only when the reply
    // was usable, so good content is never overwritten with empty.
    if (structured && reflections?.[0]?.id) {
      await admin.from("reflections").update({
        what_went_well: Array.isArray(c.what_went_well) ? c.what_went_well : [],
        what_did_not_work: Array.isArray(c.what_did_not_work) ? c.what_did_not_work : [],
        action_points: Array.isArray(c.action_points) ? c.action_points : [],
        suggested_next_focus: Array.isArray(c.noted_for_next) ? c.noted_for_next : [],
        learning_evidence: Array.isArray(c.learning_evidence) ? c.learning_evidence : [],
        hoped_to_see_review: Array.isArray(c.aims_review) ? c.aims_review : [],
      }).eq("id", reflections[0].id);
    }

    const row = {
      event_id,
      created_by: event.user_id,
      report_type,
      title: heading,
      content_json,
      content_markdown,
      source_fingerprint: fingerprint,
    };

    // Coach report whose source changed: regenerate in place, no duplicate row.
    // No prior (or player report): insert as before.
    let report: unknown;
    if (prior) {
      const { data, error: upErr } = await admin.from("reports")
        .update(row).eq("id", prior.id).select().single();
      if (upErr) return jsonResponse({ error: upErr.message }, 500);
      report = data;
    } else {
      const { data, error: insErr } = await admin.from("reports")
        .insert(row).select().single();
      if (insErr) return jsonResponse({ error: insErr.message }, 500);
      report = data;
    }

    return jsonResponse({ ok: true, report });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

// Stable content hash of the report's source, used for change-detection.
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Coach single-session report (F4). Aims kept in full, including "stated, not
// recorded", and every section drawn only from what the coach actually said.
function coachMarkdown(title: string, c: any): string {
  const blocks: MdBlock[] = [];
  if (c.aims_review?.length) {
    // No ticks, no crosses, no empty circles.
    //
    // This used to render as a checklist marked "✓ ~ ○", with an aim the coach
    // never came back to shown as an empty circle labelled "(stated, not
    // recorded)". However it was meant, that is a scorecard: a tick for the ones
    // they managed and a blank for the one they did not. A coach reading their
    // own session back should not find it marked out of three.
    //
    // The information is worth keeping, and it is the reason this section
    // exists: an aim you set and never wrote anything about is the single most
    // useful thing a reflection can show you. So it still appears, in the same
    // position, described rather than scored. The neutral bullet gives every aim
    // the same weight on the page, and the words say what happened without
    // saying how it went.
    const said = (st: string) =>
      st === "recorded"
        ? "you wrote about this"
        : st === "partly"
        ? "your notes touch on this"
        : "nothing in your notes about this one";
    blocks.push({
      t: "checklist",
      heading: "What you hoped to see",
      items: c.aims_review.map((a: any) => ({
        mark: "·",
        label: a.aim,
        suffix: ` (${said(a.status)})`,
        note: a.note,
      })),
    });
  }
  const bl = (h: string, arr?: string[]) => {
    if (arr?.length) blocks.push({ t: "bullets", heading: h, items: arr });
  };
  bl("What went well", c.what_went_well);
  // "What did not work" is the app's word for the coach's session, and it lands
  // as a verdict on a page they are reading about their own evening. In testing
  // the section held "you didn't have the numbers you wanted and were missing
  // key defenders", which is not something that failed, it is what they were up
  // against. This heading holds both that and a genuine "this did not work"
  // without the app being the one calling it a failure.
  bl("What got in the way", c.what_did_not_work);
  bl("In this session", c.session_patterns);
  bl("Action points", c.action_points);
  bl("Noted for next", c.noted_for_next);
  bl("Evidence of learning", c.learning_evidence);
  return renderReport(title, c.headline, blocks);
}

