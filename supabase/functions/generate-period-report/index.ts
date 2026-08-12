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
import { MIRROR_NOT_VERDICT } from "../_shared/principles.ts";

interface NoteEntry { note: string | null; tags: string[] | null; sentiment: string | null }
interface ThemeBucket {
  theme: string; count: number; positive: number; concern: number; neutral: number; examples: string[];
}

// What to call a session in the report. 'other' takes the coach's own name for
// it (0018); the rest get a plain label. Trimmed and capped in the database, so
// this only has to handle the empty case.
function sessionLabel(e: { event_type: string; custom_type?: string | null }): string {
  if (e.event_type === "other") return e.custom_type?.trim() || "Other session";
  if (e.event_type === "tournament") return "Tournament";
  if (e.event_type === "match") return "Match";
  if (e.event_type === "training_session") return "Training";
  return e.event_type.replace(/_/g, " ");
}

// Group notes by theme (tag). Every distinct theme is kept (nothing truncated);
// each carries a count, a sentiment split, and up to a few example notes. A note
// with several tags contributes to each theme. Untagged notes bucket together.
const MAX_EXAMPLES = 3;
function bucketByTheme(notes: NoteEntry[]): ThemeBucket[] {
  const map = new Map<string, ThemeBucket>();
  for (const n of notes) {
    const tags = (n.tags && n.tags.length) ? n.tags : ["(untagged)"];
    for (const t of tags) {
      let b = map.get(t);
      if (!b) { b = { theme: t, count: 0, positive: 0, concern: 0, neutral: 0, examples: [] }; map.set(t, b); }
      b.count++;
      if (n.sentiment === "positive") b.positive++;
      else if (n.sentiment === "concern") b.concern++;
      else b.neutral++;
      if (b.examples.length < MAX_EXAMPLES && n.note) b.examples.push(n.note);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

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
      .from("events").select("id, event_type, custom_type, title, event_date, opposition")
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
          .select("event_id, cleaned_note, raw_note, tags, sentiment")
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

    // Split the actual notes by context, then GROUP BY THEME so a long season
    // stays within the context budget without dropping any theme. Each theme
    // bucket carries a count, a sentiment split and a few example notes.
    const typeById = new Map((events ?? []).map((e) => [e.id, e.event_type]));
    // The session's label, which for 'other' is whatever the coach called it
    // (0018). This is what keeps a goalkeeping session's themes identifiable
    // instead of collapsing into an anonymous "other".
    const labelById = new Map((events ?? []).map((e) => [e.id, sessionLabel(e)]));

    const trainingRaw: NoteEntry[] = [];
    const matchRaw: NoteEntry[] = [];
    // Everything that is neither training nor a match, kept by its own label.
    // Previously these notes were silently discarded: the loop pushed only on
    // 'match' and 'training_session', so a tournament or a named session went
    // into neither bucket and vanished from the report. A coach who logged a
    // goalkeeping block saw no trace of it in their month.
    const otherRaw = new Map<string, NoteEntry[]>();
    const tagCounts: Record<string, number> = {};
    for (const o of observations ?? []) {
      for (const t of o.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      const entry: NoteEntry = { note: o.cleaned_note ?? o.raw_note, tags: o.tags, sentiment: o.sentiment };
      const type = typeById.get(o.event_id);
      if (type === "match") matchRaw.push(entry);
      else if (type === "training_session") trainingRaw.push(entry);
      else {
        const label = labelById.get(o.event_id) ?? "Other session";
        const list = otherRaw.get(label) ?? [];
        list.push(entry);
        otherRaw.set(label, list);
      }
    }
    const topThemes = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
    // Bucketed by theme (F25): every theme is represented, not every note sent.
    const trainingNotes = bucketByTheme(trainingRaw);
    const matchNotes = bucketByTheme(matchRaw);

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
      // The period's notes grouped by theme, split by context for comparison.
      training_notes: trainingNotes,
      match_notes: matchNotes,
      // Sessions that are neither training nor a match, each under the coach's
      // own name for it. Kept as a separate list rather than folded into
      // training_notes, because a goalkeeping block and a Tuesday session are
      // not the same context and their themes should not be read as one.
      other_sessions: [...otherRaw.entries()].map(([label, notes]) => ({
        label,
        sessions: (events ?? []).filter((e) => sessionLabel(e) === label).length,
        notes: bucketByTheme(notes),
      })),
      reflection_next_focus: (reflections ?? []).flatMap((r) => r.suggested_next_focus ?? []),
      hoped_to_see_review: (reflections ?? []).flatMap((r) => r.hoped_to_see_review ?? []),
    });

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, team.created_by);

    const raw = await callClaude({
      system:
        "You write a football team's period report (weekly, monthly or " +
        "end-of-season; a weekly report combines that week's training and match). " +
        "You are given the period's notes GROUPED BY THEME within each context: " +
        "training_notes and match_notes are arrays of {theme, count, positive, " +
        "concern, neutral, examples}. Every theme that came up is included, with " +
        "how often it appeared, its sentiment split, and a few example notes. " +
        "Read across all of them and combine them: do not just list " +
        "events. Be intelligent about context: compare what's noted in TRAINING " +
        "against what's noted in MATCHES and identify (a) themes that appear in " +
        "both — training work showing up on matchday; (b) themes worked in " +
        "training but not yet seen in matches — not transferring; (c) themes " +
        "emerging only in matches. Put these in \"training_to_match\". " +
        // Session-type scoping. Different kinds of session have different aims,
        // so a theme belongs to the context it was noted in. The training/match
        // comparison above is the one cross-context link that is always
        // legitimate, because it is the point of the report. Anything else has
        // to be earned by the coach's own notes rather than assumed by shape.
        "SESSION TYPES: other_sessions holds sessions that are neither training " +
        "nor matches, each under the name the coach gave it (for example a " +
        "goalkeeping session or a one-to-one), with its own themes grouped the " +
        "same way. Treat each as its OWN context. A theme from a named session " +
        "is a theme of THAT session, not of the team's training, and must be " +
        "attributed to it by name when you mention it. Do NOT merge its themes " +
        "into the training or match picture, and do NOT claim a connection " +
        "between two contexts unless the coach's own notes say so. Where a " +
        "session type had few notes, say less about it rather than inferring " +
        "more. " +
        MIRROR_NOT_VERDICT +
        // "focus_ahead" asked the model what the coach should work on next. Over
        // a season that is a bigger judgement than the one taken out of the
        // single-session report this morning, not a smaller one, so the app was
        // quietly more directive across a month than across an evening.
        // What replaces it restates only what the COACH said they would do, and
        // the reflecting is done by a fixed question added in code below.
        " NOTED FOR NEXT: restate only what the coach themselves wrote that they " +
        "would look at, try or change. Quote their intention, do not form one. " +
        "If they did not say, return an empty array: that is a normal outcome " +
        "and an empty section is better than an invented one. " +
        " Surface the patterns and connections across the notes. Return ONLY JSON with keys: " +
        '"headline" (string), "results_summary" (string), "sections" (array of ' +
        '{heading, points: string[]}), "player_highlights" (string[]), ' +
        '"recurring_themes" (string[]), "training_to_match" (string[]), ' +
        '"noted_for_next" (string[]).' +
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
      ? toMarkdown(heading, record, content_json, report_type)
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

function toMarkdown(title: string, record: any, c: any, reportType: string): string {
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
  // Their own stated intentions, not the app's advice. Falls back to the old
  // key so reports generated before this change still render.
  bl("What you said you would look at", c.noted_for_next ?? c.focus_ahead);

  // The report ends by asking, not by telling.
  //
  // A single session has always closed with an open question about doing it
  // again. A month or a season closed with "Focus ahead", which the model
  // wrote. So the longer the period, the more the app decided for the coach,
  // which is exactly the wrong way round: a season is where they most need to
  // reach their own conclusion.
  //
  // Fixed text in code, like the single-session one, for the same reasons. It
  // cannot drift into a suggestion, it costs nothing, it names no part of their
  // coaching, and it reads the same after every period, which is what a
  // reflective habit is made of.
  blocks.push({ t: "bullets", heading: "Looking back", items: [lookBack(reportType)] });
  return renderReport(title, c.headline, blocks);
}

// "if anything" is load-bearing. Without it the question presumes the period
// went badly, which is a verdict with a question mark on it.
// Match on the values this is actually CALLED with. It compared "weekly" while
// every caller passes "weekly_report" (see the report_type note at the top of
// this file), so no branch had ever matched and every period report ever
// generated closed with the generic fallback. A season never once said "the
// season". Trimming the suffix once here means a new period type cannot
// reintroduce it.
export function lookBack(reportType: string): string {
  const key = String(reportType ?? "").replace(/_report$/, "");
  const period = key === "weekly"
    ? "this week"
    : key === "monthly"
    ? "this month"
    : key === "season"
    ? "the season"
    : "this period";
  return `Looking back over ${period}, what would you do differently, if anything?`;
}
