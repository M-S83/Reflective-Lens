// =============================================================================
// clean-observation
// Cleans a raw live observation into a tidy note, suggests tags and sentiment,
// and (if a shirt number is present) attempts to attribute it to a player from
// the event's team sheet.
//
// Principle: "Mirror, not verdict." The cleaned note must restate what the user
// observed in clear language. It must NOT add judgement, praise or criticism.
//
// Body: { observation_id: string }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, serviceClient, userClient } from "../_shared/clients.ts";
import { voiceInstruction } from "../_shared/voice.ts";
import { canonicalTags } from "../_shared/knowledge.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { observation_id } = await req.json();
    if (!observation_id) return jsonResponse({ error: "Missing observation_id" }, 400);

    const supa = userClient(req);
    const { data: obs, error } = await supa
      .from("observations").select("*").eq("id", observation_id).single();
    if (error || !obs) return jsonResponse({ error: "Not found or not permitted" }, 403);
    if (!obs.raw_note) return jsonResponse({ error: "No raw_note to clean" }, 400);

    const admin = serviceClient();
    const voice = await voiceInstruction(admin, obs.user_id);

    // Snap tags to the canonical coaching taxonomy so trends/insights speak one
    // consistent language instead of drifting synonyms.
    const tags = await canonicalTags(admin);
    const tagHint = tags.length
      ? "When tagging, PREFER these canonical coaching tags where one fits (add a " +
        "specific extra tag only if none apply): " + tags.join(", ") + ". "
      : "";

    const raw = await callClaude({
      system:
        "You are a reflective assistant for football coaches and players. " +
        "Principle: MIRROR, NOT VERDICT. Tidy transcription slips and grammar, but " +
        "KEEP the coach's own words and terminology — do NOT rewrite their phrasing " +
        "into textbook language. Never add praise, criticism or judgement that " +
        "wasn't in the note. " +
        tagHint +
        'Return ONLY JSON: {"cleaned_note": string, "tags": string[], ' +
        '"sentiment": "positive"|"concern"|"neutral", "phase_of_play": string|null}.' +
        voice,
      prompt: obs.raw_note,
      model: MODELS.cleanObservation,
      feature: "clean-observation",
      log: { admin, userId: obs.user_id, teamId: obs.team_id },
    });

    const parsed = safeParse(raw);

    // Try to attribute by shirt number via the event's team sheet.
    let player_id = obs.player_id;
    if (!player_id && obs.shirt_number != null) {
      const { data: match } = await admin
        .from("team_sheet_players")
        .select("player_id, team_sheets!inner(event_id)")
        .eq("team_sheets.event_id", obs.event_id)
        .eq("shirt_number", obs.shirt_number)
        .not("player_id", "is", null)
        .limit(1).maybeSingle();
      if (match?.player_id) player_id = match.player_id;
    }

    const { error: upErr } = await admin.from("observations").update({
      cleaned_note: parsed.cleaned_note ?? obs.raw_note,
      tags: parsed.tags ?? obs.tags,
      sentiment: parsed.sentiment ?? obs.sentiment,
      phase_of_play: parsed.phase_of_play ?? obs.phase_of_play,
      player_id,
    }).eq("id", observation_id);
    if (upErr) return jsonResponse({ error: upErr.message }, 500);

    return jsonResponse({ ok: true, observation_id, ...parsed, player_id });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

function safeParse(raw: string): {
  cleaned_note?: string;
  tags?: string[];
  sentiment?: "positive" | "concern" | "neutral";
  phase_of_play?: string | null;
} {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  } catch {
    return {};
  }
}
