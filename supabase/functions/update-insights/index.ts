// =============================================================================
// update-insights
// The notes tell the story; this picks up the trend. It scans a user's
// observations, buckets each player/team theme BY WEEK, and when a theme recurs
// across several of the recent weeks it writes an insight carrying a sentiment
// (concern vs progress) and a reflective, forward-looking prompt, e.g.:
//   "“losing the ball under press” has come up in 3 of the last 4 weeks —
//    how do you plan to tackle it?"        (concern)
//   "Oscar — “scanning” has shown up in 3 of the last 4 weeks — what have you
//    done to let them know they've progressed?"   (progress)
//
// These prompts are surfaced back inside the reflection flow (see
// generate-reflection-questions), so the long-term trend influences reflection.
//
// Body: { user_id?: string }  (defaults to the calling user)
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { recordLearning, resolveActor } from "../_shared/clients.ts";

const WEEK_MS = 7 * 86_400_000;
const WINDOW_WEEKS = 4; // "3 of the last 4 weeks"
const RECUR_THRESHOLD = 3;

interface Bucket {
  player_id: string | null;
  name: string | null;
  tag: string;
  weeks: Set<number>;
  count: number;
  pos: number;
  con: number;
  team_id: string | null;
  club_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // A signed-in user recomputing their own insights, or the nightly sweep
    // (run-learning) recomputing a due user's — resolveActor handles both.
    const actor = await resolveActor(req);
    if (!actor) return jsonResponse({ error: "Not authenticated" }, 401);
    const { userId, read: supa, admin } = actor;

    // The notes, with the date + subject needed to spot a trend over time.
    const { data: observations, error } = await supa
      .from("observations")
      .select("player_id, tags, sentiment, players(display_name), events(event_date, team_id, club_id)")
      .eq("user_id", userId);
    if (error) return jsonResponse({ error: error.message }, 500);

    const buckets = new Map<string, Bucket>();
    let maxWeek = -Infinity;
    for (const o of observations ?? []) {
      const ev = (o as any).events ?? {};
      if (!ev.event_date) continue;
      const week = Math.floor(Date.parse(ev.event_date) / WEEK_MS);
      if (week > maxWeek) maxWeek = week;
      for (const tag of o.tags ?? []) {
        const key = `${o.player_id ?? "team"}::${tag}`;
        const b = buckets.get(key) ?? {
          player_id: o.player_id ?? null,
          name: (o as any).players?.display_name ?? null,
          tag, weeks: new Set<number>(), count: 0, pos: 0, con: 0,
          team_id: ev.team_id ?? null, club_id: ev.club_id ?? null,
        };
        b.weeks.add(week);
        b.count++;
        if (o.sentiment === "positive") b.pos++;
        else if (o.sentiment === "concern") b.con++;
        buckets.set(key, b);
      }
    }
    if (maxWeek === -Infinity) {
      // Nothing datable to learn from yet — still clear the pending flag so the
      // sweep doesn't keep re-picking this user until there's real input.
      await recordLearning(admin, {
        user_id: userId, kind: "insights", inputs_seen: observations?.length ?? 0,
        items_changed: 0, summary: "No dated notes to detect trends from yet.",
      });
      return jsonResponse({ ok: true, insights: [], scanned: 0 });
    }
    const windowStart = maxWeek - (WINDOW_WEEKS - 1);

    const created: unknown[] = [];

    for (const b of buckets.values()) {
      const weeksInWindow =
        [...b.weeks].filter((w) => w >= windowStart && w <= maxWeek).length;
      const recurringWeeks = weeksInWindow >= RECUR_THRESHOLD;
      // Fall back to plain frequency if there isn't enough spread across weeks.
      if (!recurringWeeks && b.count < 3) continue;

      const sentiment = b.con > b.pos ? "concern" : b.pos > b.con ? "positive" : "neutral";
      const who = b.player_id ? (b.name ?? "This player") : "The team";

      let prompt: string | null = null;
      if (recurringWeeks) {
        if (sentiment === "concern") {
          prompt = `${who}: “${b.tag}” has come up in ${weeksInWindow} of the last ` +
            `${WINDOW_WEEKS} weeks. How do you plan to tackle it?`;
        } else if (sentiment === "positive") {
          prompt = `${who}: “${b.tag}” has shown up in ${weeksInWindow} of the last ` +
            `${WINDOW_WEEKS} weeks. What have you done to let them know they've progressed?`;
        } else {
          prompt = `“${b.tag}” has recurred in ${weeksInWindow} of the last ` +
            `${WINDOW_WEEKS} weeks. Worth making it a focus?`;
        }
      }

      const description = recurringWeeks
        ? `Noted in ${weeksInWindow} of the last ${WINDOW_WEEKS} weeks (${b.count} notes in total).`
        : `${who} noted ${b.count} times in relation to “${b.tag}”.`;

      const { data } = await admin.from("insights").insert({
        user_id: userId,
        club_id: b.club_id, team_id: b.team_id, player_id: b.player_id,
        insight_type: b.player_id ? "player_pattern" : "recurring_theme",
        title: b.player_id ? `${who}: “${b.tag}”` : `Theme: “${b.tag}”`,
        description,
        sentiment,
        reflective_prompt: prompt,
        evidence_count: b.count,
        confidence_score: Math.min(1, recurringWeeks ? weeksInWindow / WINDOW_WEEKS : b.count / 10),
      }).select().single();
      if (data) created.push(data);
    }

    // Record what this pass learned (and clear the pending flag).
    await recordLearning(admin, {
      user_id: userId,
      kind: "insights",
      inputs_seen: observations?.length ?? 0,
      items_changed: created.length,
      summary: created.length
        ? `Picked up ${created.length} recurring theme${created.length === 1 ? "" : "s"} from ${observations?.length ?? 0} notes.`
        : `Scanned ${observations?.length ?? 0} notes, no new recurring theme yet.`,
    });

    return jsonResponse({ ok: true, insights: created, scanned: observations?.length ?? 0 });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
