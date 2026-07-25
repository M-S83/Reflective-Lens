// =============================================================================
// generate-period-report
// Aggregates a team's events over a date range into a weekly, monthly or
// end-of-season report — results, standout patterns, player highlights,
// development themes. A weekly report naturally combines that week's training
// and match. Stored in `reports` with event_id null and team_id + period set.
//
// Principle: "Mirror, not verdict." Summarise and surface patterns; do not grade.
//
// Body: {
//   team_id: string,
//   report_type: "weekly_report" | "monthly_report" | "season_report",
//   period_start: "YYYY-MM-DD",
//   period_end: "YYYY-MM-DD",
//   title?: string
// }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, serviceClient, userClient } from "../_shared/clients.ts";
import { voiceInstruction } from "../_shared/voice.ts";
import { isUnder18, safeNameMap } from "../_shared/names.ts";
import { firstJsonObject } from "../_shared/json.ts";
import { type MdBlock, renderReport } from "../_shared/markdown.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { team_id, report_type, period_start, period_end, title } = await req.json();
    if (!team_id || !report_type || !period_start || !period_end) {
      return jsonResponse({ error: "Missing team_id / report_type / period_start / period_end" }, 400);
    }

    // Caller must be able to see the team (RLS).
    const supa = userClient(req);
    const { data: team, error } = await supa
      .from("teams").select("*").eq("id", team_id).single();
    if (error || !team) return jsonResponse({ error: "Not found or not permitted" }, 403);

    // Events for this team within the period.
    const { data: events } = await supa
      .from("events").select("id, event_type, title, event_date, opposition")
      .eq("team_id", team_id)
      .gte("event_date", period_start).lte("event_date", period_end)
      .order("event_date", { ascending: true });

    const eventIds = (events ?? []).map((e) => e.id);
    if (eventIds.length === 0) {
      return jsonResponse({ ok: true, report: null, reason: "no events in this period" });
    }
    const matchIds = (events ?? []).filter((e) => e.event_type === "match").map((e) => e.id);

    // Pull the period's match results, per-player stats, reflections and note tags.
    const [{ data: results }, { data: stats }, { data: reflections }, { data: observations }] =
      await Promise.all([
        matchIds.length
          ? supa.from("match_details").select("*").in("event_id", matchIds)
          : Promise.resolve({ data: [] }),
        matchIds.length
          ? supa.from("match_stats")
            .select("*, players(id, first_name, last_name, display_name)").in("event_id", matchIds)
          : Promise.resolve({ data: [] }),
        supa.from("reflections")
          .select("summary, enriched_summary, suggested_next_focus, hoped_to_see_review")
          .in("event_id", eventIds),
        supa.from("observations")
          .select("event_id, cleaned_note, raw_note, tags, sentiment, capture_phase")
          .in("event_id", eventIds),
      ]);

    // Results tally (W/D/L, goals) and per-player totals for the period.
    const record = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
    for (const r of results ?? []) {
      if (r.result === "win") record.wins++;
      else if (r.result === "draw") record.draws++;
      else if (r.result === "loss") record.losses++;
      record.gf += r.goals_for ?? 0;
      record.ga += r.goals_against ?? 0;
    }
    // Under-18 privacy: label players by first name only (last initial to
    // disambiguate), keyed off the team age group.
    const under18 = isUnder18(team.age_group);
    const statPlayers = new Map<string, any>();
    for (const s of stats ?? []) {
      if (s.player_id && !statPlayers.has(s.player_id)) {
        statPlayers.set(s.player_id, { id: s.player_id, ...((s as any).players ?? {}) });
      }
    }
    const nameMap = safeNameMap([...statPlayers.values()], under18);
    const perPlayer: Record<string, { name: string; goals: number; assists: number; apps: number }> = {};
    for (const s of stats ?? []) {
      const name = nameMap[s.player_id] ?? "A player";
      const p = (perPlayer[s.player_id] ??= { name, goals: 0, assists: 0, apps: 0 });
      p.goals += s.goals ?? 0; p.assists += s.assists ?? 0; p.apps += 1;
    }

    // Split the actual notes by context so training and matches can be compared.
    const typeById = new Map((events ?? []).map((e) => [e.id, e.event_type]));
    const trainingNotes: unknown[] = [];
    const matchNotes: unknown[] = [];
    const tagCounts: Record<string, number> = {};
    for (const o of observations ?? []) {
      for (const t of o.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      const entry = { note: o.cleaned_note ?? o.raw_note, tags: o.tags, phase: o.capture_phase, sentiment: o.sentiment };
      if (typeById.get(o.event_id) === "match") matchNotes.push(entry);
      else if (typeById.get(o.event_id) === "training_session") trainingNotes.push(entry);
    }
    const topThemes = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);

    const payload = JSON.stringify({
      team: { name: team.name, age_group: team.age_group, format: team.format },
      period: { start: period_start, end: period_end },
      counts: {
        events: events?.length ?? 0,
        matches: matchIds.length,
        trainings: (events ?? []).filter((e) => e.event_type === "training_session").length,
      },
      record,
      players: Object.values(perPlayer),
      top_note_themes: topThemes,
      // Every note from the period, kept split by context for comparison.
      training_notes: trainingNotes,
      match_notes: matchNotes,
      reflection_next_focus: (reflections ?? []).flatMap((r) => r.suggested_next_focus ?? []),
      hoped_to_see_review: (reflections ?? []).flatMap((r) => r.hoped_to_see_review ?? []),
    });

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, team.created_by);

    const raw = await callClaude({
      system:
        "You write a football team's period report (weekly, monthly or " +
        "end-of-season; a weekly report combines that week's training and match). " +
        "You are given EVERY note from the period, split into training_notes and " +
        "match_notes. Read across all of them and combine them — do not just list " +
        "events. Be intelligent about context: compare what's noted in TRAINING " +
        "against what's noted in MATCHES and identify (a) themes that appear in " +
        "both — training work showing up on matchday; (b) themes worked in " +
        "training but not yet seen in matches — not transferring; (c) themes " +
        "emerging only in matches. Put these in \"training_to_match\". " +
        "Principle: MIRROR, NOT VERDICT — surface the patterns and connections; " +
        "do not grade the coach or players. Return ONLY JSON with keys: " +
        '"headline" (string), "results_summary" (string), "sections" (array of ' +
        '{heading, points: string[]}), "player_highlights" (string[]), ' +
        '"recurring_themes" (string[]), "training_to_match" (string[]), ' +
        '"focus_ahead" (string[]).' +
        voice,
      prompt: `Report type: ${report_type}\n\nData:\n${payload}`,
      maxTokens: 3072,
      model: MODELS.periodReport,
      feature: "generate-period-report",
      log: { admin, userId: team.created_by, clubId: team.club_id, teamId: team.id },
    });

    const content_json = firstJsonObject(raw);
    const periodLabel = report_type === "season_report"
      ? "Season"
      : report_type === "weekly_report"
      ? "Weekly"
      : "Monthly";
    const heading = title ?? `${team.name}: ${periodLabel} Report`;

    // Never store a blank report. If the model didn't return usable structured
    // JSON, surface its own text so the report is always viewable, and log the
    // failure (length only, no body: it would contain player content).
    const c = content_json as Record<string, unknown>;
    const structured = !!(
      (Array.isArray(c.sections) && c.sections.length) ||
      c.headline || c.results_summary ||
      (Array.isArray(c.recurring_themes) && c.recurring_themes.length)
    );
    const content_markdown = structured
      ? toMarkdown(heading, record, content_json)
      : `# ${heading}\n\n${(raw ?? "").trim() ||
          "_The report came back empty. Please try generating it again._"}`;
    if (!structured) {
      console.error("generate-period-report: unstructured model reply", {
        team_id, period_start, period_end, length: (raw ?? "").length,
      });
    }

    const { data: report, error: insErr } = await admin.from("reports").insert({
      event_id: null,
      team_id,
      created_by: team.created_by,
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

function toMarkdown(title: string, record: any, c: any): string {
  const blocks: MdBlock[] = [{
    t: "para",
    text: `**Record:** ${record.wins}W ${record.draws}D ${record.losses}L ` +
      `· ${record.gf}-${record.ga} goals`,
  }];
  if (c.results_summary) blocks.push({ t: "para", text: c.results_summary });
  blocks.push({ t: "sections", sections: c.sections ?? [] });
  const bl = (h: string, arr?: string[]) => {
    if (arr?.length) blocks.push({ t: "bullets", heading: h, items: arr });
  };
  bl("Player highlights", c.player_highlights);
  bl("Recurring themes", c.recurring_themes);
  bl("Training ↔ match", c.training_to_match);
  bl("Focus ahead", c.focus_ahead);
  return renderReport(title, c.headline, blocks);
}
