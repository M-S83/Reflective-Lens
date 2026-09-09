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
import { dedupeSections } from "../_shared/dedupe.ts";

// How a report is written, as opposed to what it is written from. Part of the
// change-detection fingerprint, so bumping it retires every stored report and
// the next open rewrites it under the current rules.
//
//   1  the original
//   2  never invent who the session was about (a 1v1 came back describing "the
//      team"); an aim with nothing written about it stops saying so twice; the
//      session sends the coach's own name for it rather than just "other"
//   3  the 9 Sep 2026 review: a coach-self section (what the coach said about
//      themselves, honest when empty); one fixed set of section names in one
//      fixed order, with Action points folded into Noted for next; a dedup
//      pass so the same point cannot appear in two sections; Evidence of
//      learning tightened to actual evidence of learning; spelling-only
//      correction when restating the coach's words; the self-reflection
//      report variant
const REPORT_LOGIC_VERSION = 3;

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
          .select("status, selection, players(id, first_name, last_name, display_name, shirt_number, positions)")
          .eq("event_id", event_id),
        supa.from("match_details").select("*").eq("event_id", event_id).maybeSingle(),
        supa.from("match_stats").select("*, players(display_name)").eq("event_id", event_id),
      ]);

    // The reflective open questions + the person's own answers, the focus for
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
        // custom_type was written by the app since 0018 and read by the period
        // report, and never once sent here. So a coach's 1v1 arrived as
        // type: "other", which tells the model nothing at all, and it filled the
        // gap the way models do. The screen header said "1 V 1" the whole time,
        // from a column this payload was not passing on.
        type: event.event_type === "other"
          ? (event.custom_type?.trim() || "other")
          : event.event_type,
        title: event.title, date: event.event_date,
        opposition: event.opposition, focus_area: event.focus_area,
        purpose: event.purpose,
        // Whether there is a squad behind this at all. A session with no team
        // is one player or a small group, and the report has no other way to
        // know that.
        has_team: !!event.team_id,
      },
      // What the coach hoped to see up front, and how the notes matched it.
      hoping_to_see: event.hoping_to_see ?? [],
      hoped_to_see_review: reflections?.[0]?.hoped_to_see_review ?? [],
      // No `type` or `subject`. Both were sent on every note and both were
      // CONSTANTS: the app writes observation_type 'team_observation' and
      // subject_type 'team' on every note it has ever saved, whatever the
      // session was. So they carried no information, and they cost accuracy.
      //
      // A real 1v1 session, about one boy, came back as "You noted the team had
      // a bad at school". There is no team in a 1v1. The coach never wrote the
      // word. The model read subject: "team" off the label and believed it.
      //
      // The existing rule told it not to narrate the label ("do not write 'the
      // team observation'"), which it obeyed to the letter while still taking
      // the subject from it. Rules do not beat a field that is simply wrong, so
      // the field goes.
      observations: (observations ?? []).map((o) => ({
        minute: o.match_minute,
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
        // Every position they play, in the coach's own words and their own
        // order (0029). A player who covers right back and plays in midfield is
        // two entries, not the string "CM, RB", which the model read as one
        // thing nobody says.
        positions: a.players?.positions ?? [],
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
    //
    // ...plus the version below, which was the missing half. The fingerprint
    // assumed the coach's input was the only thing that decides what a report
    // says. It is not: the prompt and the payload decide it too. So a report
    // written under a rule we have since fixed stayed exactly as it was, for
    // ever, and asking for it again cheerfully returned the old one.
    //
    // That was not theoretical. A 1v1 came back saying "you noted the team had a
    // bad at school", the cause was found and fixed, and regenerating would have
    // handed back the same sentence and looked like the fix had failed.
    //
    // BUMP THIS whenever the prompt, the payload or the block-building changes,
    // and every stored report regenerates the next time it is opened. The cost
    // of a bump is one model call per report that someone actually looks at,
    // which is the right price for not showing a coach something we know is
    // wrong.
    const sourceForHash = JSON.stringify({
      logic: REPORT_LOGIC_VERSION,
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

    // A self reflection is not a session: there is no squad, no aims checklist
    // and no practice to report on. Its report takes the coach shape below
    // rather than the session shape.
    const isSelf = event.event_type === "self_reflection";

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
        "(e.g. don't call it 'a sharp game' unless they did, 'felt sharp' is " +
        "about them, not the match). " +
        // A real report opened "The team observation noted real bravery from the
        // boys". The payload labels each note with subject_type, and the model
        // narrated the label instead of the coach. It is a small thing that
        // makes the whole report sound like a system describing a record rather
        // than a person reading their own evening back.
        "NEVER describe the data you were given. Do not write \"the team " +
        "observation\", \"the note says\", \"the reflection states\", \"per the " +
        "record\", or name any field you were passed. The coach said it: write " +
        "\"you said\", \"you noticed\", \"you wrote\", or simply say the thing. " +
        // The 1v1 that came back as "you noted the team had a bad at school".
        // The label that caused it is gone from the payload now, so this is the
        // belt to that braces: a session may be with one player, a small group,
        // or a squad, and the report has no way to know which unless the coach
        // said so.
        "NEVER INVENT WHO IT WAS ABOUT. Do not introduce \"the team\", \"the " +
        "players\", \"the boys\", \"the group\", \"he\" or \"she\" unless the " +
        "coach used that word themselves. Sessions here are as often with one " +
        "player as with a squad. If they did not say who, do not decide for " +
        "them: restate what they wrote and leave the subject exactly as vague " +
        "as they left it. " +
        // The spelling decision from the 9 Sep review. Faithful mirroring was
        // passing "alot" and "a bad at school" into finished reports, which
        // looks careless in front of a county officer. Fixing SPELLING is not a
        // mirror violation: the word the coach meant is not in doubt, so
        // nothing of theirs is changed by writing it correctly. Everything past
        // spelling still is a violation, and the same narrow line as
        // clean-observation holds: a missing word is a gap the coach left, and
        // guessing it is the instinct that fills empty sections.
        "When you restate or quote the coach's words, correct obvious spelling " +
        "only (alot -> a lot, definately -> definitely). Never reword their " +
        "phrasing, never guess at a word that is missing, never finish a " +
        "sentence they left unfinished. " +
        (isSelf
          // The self-reflection report: no session behind it, so no aims
          // checklist, no squad and no session-shaped sections. Its whole
          // subject is the coach, in their own words.
          ? "This is a COACH'S SELF-REFLECTION: not a session, a match or a " +
            "practice, but the coach thinking about themselves (how they " +
            "handled something, how they behave, what kind of coach they want " +
            "to be). Draw ONLY on what they wrote or said in this reflection " +
            "and their answers to the reflective questions. If something was " +
            "not raised, do NOT mention it; a field with no support MUST be an " +
            "empty array. " +
            "EACH POINT APPEARS ONCE, in one section only. Empty is always " +
            "better than repeated. " +
            "what_you_said organises the substance of the reflection in their " +
            "own words. noted_for_next is ONLY what they themselves said they " +
            "would do, try or watch for: add no recommendations of your own. " +
            'Return ONLY JSON with keys: "headline" (string), "what_you_said" ' +
            '(string[]), "noted_for_next" (string[]).'
          : "This is a COACH'S single-session report. Draw ONLY on what the coach " +
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
            "reflect back only what the coach noted for next time, anything they " +
            "said they would do or act on, and their own answers: add no " +
            "recommendations of your own. " +
            // With a handful of notes the model fills every section by
            // rewording the same two observations, which turns a thin session
            // into something that looks like a form being completed. Real output
            // carried one note verbatim in both what_went_well and
            // learning_evidence, and another in three sections at once. The
            // prompt rule alone did not stop it (the 6 Aug test report repeated
            // two bullets across sections regardless), so the output is also
            // deduplicated in code below. The rule stays: fewer repeats in is
            // still better than repeats caught after.
            "EACH POINT APPEARS ONCE. Every section must earn its content: do NOT " +
            "restate a point that already appears elsewhere, even reworded. A " +
            "short session should produce a short report with several EMPTY " +
            "arrays, and that is the correct outcome, not a failure. Empty is " +
            "always better than repeated. " +
            // The 9 Sep review, item 1: the questions ask the coach about
            // themselves and the report folded those answers into
            // session-shaped sections, so every report read as being about the
            // players and the practice. The FA's line between reflecting on
            // the practices you provide and reflecting on yourself is drawn
            // here as its own field.
            "about_you is what the coach said ABOUT THEMSELVES: their choices, " +
            "when they stepped in and what they said, how they behaved or felt " +
            "as the coach, what they would do differently as the coach. Source " +
            "it ONLY from their reflection and their answers to the questions, " +
            "never from the pitch-side notes, and NEVER invent it: if they said " +
            "nothing about themselves, return an empty array. A point about " +
            "players or the practice does not belong there. " +
            // Tightened after the League test report listed the thing that did
            // not work ("calls of 'man on' made when the player had more time
            // than the call suggested") as evidence of learning. A coach
            // developer reading that catches it at once.
            "learning_evidence is ONLY for evidence of learning: the coach saw " +
            "a player do something they could not do before, or do it better " +
            "than before, and said so. A difficulty, a mistake or a thing that " +
            "did not work NEVER belongs there, whatever was learned from it. " +
            "If nothing qualifies, return an empty array rather than moving " +
            "something in from another section. " +
            "session_patterns is only for " +
            "something recurring ACROSS several notes in this session; with one " +
            "or two notes it must be empty rather than a summary of what is " +
            "already written above. " +
            'Return ONLY JSON with keys: "headline" (string), "aims_review" (array ' +
            'of {aim, status, note}), "what_went_well" (string[]), ' +
            '"what_did_not_work" (string[]), "about_you" (string[]), ' +
            '"noted_for_next" (string[]), "learning_evidence" (string[]), ' +
            '"session_patterns" (string[], patterns WITHIN this one session only).') +
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

    // One point, one section, enforced on the OUTPUT as well as asked of the
    // model (see _shared/dedupe.ts for the two real reports that made this a
    // code path). Sections are passed in render order, so a repeated point
    // stays where the reader meets it first, which resolved both real cases
    // the right way: the mislabelled copy in Evidence of learning was the
    // later one.
    {
      const order = isSelf
        ? ["what_you_said", "noted_for_next"]
        : ["what_went_well", "what_did_not_work", "session_patterns",
          "learning_evidence", "about_you", "noted_for_next"];
      const deduped = dedupeSections(
        order.map((k) => Array.isArray(c[k]) ? c[k] as string[] : []),
      );
      order.forEach((k, i) => {
        if (Array.isArray(c[k])) c[k] = deduped[i];
      });
    }

    // Never store a blank report.
    const structured = isSelf
      ? !!(
        c.headline ||
        (Array.isArray(c.what_you_said) && c.what_you_said.length) ||
        (Array.isArray(c.noted_for_next) && c.noted_for_next.length)
      )
      : !!(
        c.headline ||
        (Array.isArray(c.aims_review) && c.aims_review.length) ||
        (Array.isArray(c.what_went_well) && c.what_went_well.length) ||
        (Array.isArray(c.what_did_not_work) && c.what_did_not_work.length) ||
        (Array.isArray(c.about_you) && c.about_you.length) ||
        (Array.isArray(c.noted_for_next) && c.noted_for_next.length)
      );
    const content_markdown = !structured
      ? `# ${heading}\n\n${(raw ?? "").trim() ||
          "_The report came back empty. Please try generating it again._"}`
      : isSelf
      ? selfMarkdown(heading, content_json)
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
    //
    // action_points is no longer written: the report stopped asking for it
    // when the 9 Sep review fixed the section set (Action points and Noted
    // for next were two names for one thing, and noted_for_next is the one
    // that stays; it already feeds suggested_next_focus here). Nothing reads
    // the column, and rows written before this keep their values.
    if (structured && reflections?.[0]?.id) {
      await admin.from("reflections").update(
        isSelf
          // A self reflection has no session-shaped fields; only what the
          // coach said they would do next carries forward.
          ? {
            suggested_next_focus: Array.isArray(c.noted_for_next) ? c.noted_for_next : [],
          }
          : {
            what_went_well: Array.isArray(c.what_went_well) ? c.what_went_well : [],
            what_did_not_work: Array.isArray(c.what_did_not_work) ? c.what_did_not_work : [],
            suggested_next_focus: Array.isArray(c.noted_for_next) ? c.noted_for_next : [],
            learning_evidence: Array.isArray(c.learning_evidence) ? c.learning_evidence : [],
            hoped_to_see_review: Array.isArray(c.aims_review) ? c.aims_review : [],
          },
      ).eq("id", reflections[0].id);
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
        // No mark at all. "·" on every line was the same character each time, so
        // it distinguished nothing, and the bullet already there rendered it as
        // a second one: "• · Players that tend to only use their strong foot".
        label: a.aim,
        suffix: ` (${said(a.status)})`,
        // An aim with nothing written about it says so in the suffix already.
        // The model's note then said it a second time, in its own words, and a
        // real report read: "different techniques to get away from defenders
        // (nothing in your notes about this one): No note directly relates to
        // this aim." Twice, in one line, for no gain.
        //
        // There is also nothing else it COULD say. The note is meant to point at
        // the notes that touched the aim, and by definition there are none, so
        // anything written there is either a restatement or an invention.
        note: a.status === "stated_not_recorded" ? undefined : a.note,
      })),
    });
  }
  // ONE fixed set of section names, in ONE fixed order, and a section is only
  // ever absent because it is empty. The test reports drifted ("What did not
  // work" in some, "What got in the way" in others; "Noted for next" and
  // "Action points" both existing), which reads as inconsistent day to day and
  // makes the period report's aggregation job harder. The names are decided
  // here, once: prompts may change what goes IN a section, never what it is
  // called. Action points did not survive the decision: it and Noted for next
  // were two names for the coach's own "what I'll do about it", so the mirror
  // wording stays and the other goes.
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
  bl("Evidence of learning", c.learning_evidence);
  // The coach-self section (9 Sep review, item 1). The pitch says "looking at
  // yourself as a coach" and every test report read as being about the players
  // and the practice, because the answers about the coach were folded into the
  // session sections. This is where they live now.
  //
  // ALWAYS rendered, on the same honesty rule as the hoped-to-see checklist:
  // when the coach said nothing about themselves, the section says so rather
  // than disappearing. An empty section here is information (the FA's line
  // between reflecting on your practices and reflecting on yourself, made
  // visible), and it is never filled by the model inventing something.
  blocks.push({
    t: "bullets",
    heading: "What you said about yourself",
    items: Array.isArray(c.about_you) ? c.about_you : [],
    empty: "You didn't say anything about yourself this time.",
  });
  bl("Noted for next", c.noted_for_next);
  return renderReport(title, c.headline, blocks);
}

// The self-reflection report (9 Sep review, item 2). No aims checklist, no
// squad, no session-shaped sections: the whole report is the coach, so it does
// not need an "about you" section either. Two sections, both theirs: what they
// said, organised, and what they said they would do.
function selfMarkdown(title: string, c: any): string {
  const blocks: MdBlock[] = [];
  const bl = (h: string, arr?: string[]) => {
    if (arr?.length) blocks.push({ t: "bullets", heading: h, items: arr });
  };
  bl("What you said", c.what_you_said);
  bl("Noted for next", c.noted_for_next);
  return renderReport(title, c.headline, blocks);
}

