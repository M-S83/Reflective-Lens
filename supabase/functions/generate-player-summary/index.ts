// =============================================================================
// generate-player-summary
// Builds a player's story over time from their OWN reflections — a weekly,
// monthly or season summary, the player's equivalent of the coach's period
// report. Private to the player (event_id null, team_id null, created_by = them).
//
// Principle: "Mirror, not verdict" — it reflects the player's own reflections
// back as a story: what keeps coming up, what's shifted, what they keep saying
// they want to work on. In their voice. It never grades them.
//
// Body: {
//   report_type: "weekly_report" | "monthly_report" | "season_report",
//   period_start: "YYYY-MM-DD",
//   period_end: "YYYY-MM-DD",
//   title?: string
// }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, serviceClient, userClient } from "../_shared/clients.ts";
import { voiceInstruction } from "../_shared/voice.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = userClient(req);
    const { data: auth } = await supa.auth.getUser();
    if (!auth?.user) return jsonResponse({ error: "Not authenticated" }, 401);
    const userId = auth.user.id;

    // Optional team_id scopes the summary to one team the player plays for, so a
    // player at more than one club/team can reflect on each individually.
    const { report_type, period_start, period_end, team_id, title } = await req.json();
    if (!report_type || !period_start || !period_end) {
      return jsonResponse({ error: "Missing report_type / period_start / period_end" }, 400);
    }

    // The player's own reflections in the period (with their event dates).
    let refQuery = supa
      .from("reflections")
      .select(
        "summary, enriched_summary, what_went_well, what_did_not_work, " +
          "action_points, suggested_next_focus, events!inner(event_date, title, event_type, team_id)",
      )
      .eq("user_id", userId)
      .eq("reflection_type", "player")
      .gte("events.event_date", period_start)
      .lte("events.event_date", period_end);
    if (team_id) refQuery = refQuery.eq("events.team_id", team_id);
    const { data: reflections } = await refQuery
      .order("events(event_date)", { ascending: true });

    if (!reflections || reflections.length === 0) {
      return jsonResponse({ ok: true, report: null, reason: "no reflections in this period" });
    }

    // The reflective questions + the player's own answers across the period.
    const { data: refIds } = await supa
      .from("reflections").select("id")
      .eq("user_id", userId).eq("reflection_type", "player");
    const ids = (refIds ?? []).map((r) => r.id);
    const { data: qa } = ids.length
      ? await supa.from("followup_questions")
        .select("question_text, followup_answers(answer_text, selected_option)")
        .in("reflection_id", ids)
      : { data: [] };
    const answers = (qa ?? []).map((q: any) => ({
      question: q.question_text,
      answer: (q.followup_answers ?? [])[0]?.answer_text ??
        (q.followup_answers ?? [])[0]?.selected_option ?? null,
    })).filter((x) => x.answer);

    const payload = JSON.stringify({
      period: { start: period_start, end: period_end },
      reflection_count: reflections.length,
      reflections: reflections.map((r: any) => ({
        game: r.events?.title, date: r.events?.event_date,
        summary: r.enriched_summary ?? r.summary,
        went_well: r.what_went_well, didnt: r.what_did_not_work,
        focus: r.suggested_next_focus,
      })),
      my_answers: answers,
    });

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, userId);

    const periodLabel = report_type === "season_report"
      ? "season" : report_type === "weekly_report" ? "week" : "month";

    const raw = await callClaude({
      system:
        `You write a PLAYER's personal ${periodLabel} summary from THEIR OWN ` +
        "reflections over the period. Principle: MIRROR, NOT VERDICT — tell their " +
        "story back to them: what keeps coming up (as a strength they keep " +
        "showing, and as something they keep flagging), what has shifted over the " +
        "period, and the focus points THEY keep returning to. Ground everything in " +
        "what they actually wrote and answered — never add your own analysis, and " +
        "never grade them. Keep it personal and encouraging, in their words. " +
        'Return ONLY JSON with keys: "headline" (string), "story" (string, 2-4 ' +
        'sentences), "keeps_showing" (string[]), "keeps_working_on" (string[]), ' +
        '"whats_shifted" (string[]), "focus_ahead" (string[]).' +
        voice,
      prompt: `Summary type: ${report_type}\n\nMy reflections:\n${payload}`,
      maxTokens: 2048,
      model: MODELS.playerSummary,
      feature: "generate-player-summary",
      log: { admin, userId, teamId: team_id ?? null },
    });

    const content_json = safeParse(raw);
    const heading = title ??
      `My ${periodLabel[0].toUpperCase() + periodLabel.slice(1)} Reflections`;
    const content_markdown = toMarkdown(heading, content_json);

    const { data: report, error: insErr } = await admin.from("reports").insert({
      event_id: null,
      team_id: team_id ?? null, // set when the summary is scoped to one of the player's teams
      created_by: userId,
      report_type,
      title: heading,
      period_start,
      period_end,
      content_json,
      content_markdown,
    }).select().single();
    if (insErr) return jsonResponse({ error: insErr.message }, 500);

    return jsonResponse({ ok: true, report });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

function safeParse(raw: string): Record<string, unknown> {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  } catch {
    return {};
  }
}

function toMarkdown(title: string, c: any): string {
  const lines: string[] = [`# ${title}`];
  if (c.headline) lines.push(`\n_${c.headline}_`);
  if (c.story) lines.push(`\n${c.story}`);
  const block = (h: string, arr?: string[]) => {
    if (arr?.length) {
      lines.push(`\n## ${h}`);
      for (const p of arr) lines.push(`- ${p}`);
    }
  };
  block("What keeps showing in your game", c.keeps_showing);
  block("What you keep working on", c.keeps_working_on);
  block("What's shifted", c.whats_shifted);
  block("Focus ahead", c.focus_ahead);
  return lines.join("\n");
}
