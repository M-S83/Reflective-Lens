import { supabase } from "./supabase";
import type {
  AttendanceStatus, Club, EventRow, EventType, FollowupQuestion, HomeAway, MatchDetails, MatchStat,
  Observation, Player, PlayerGameLog, PlayerMatchRole, Reflection, Report, SquadSelection,
  TeamFormat, CapturePhase,
} from "./types";

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

// ---- Teams & players --------------------------------------------------------
export interface TeamWithClub {
  id: string; name: string; age_group: string | null; format: TeamFormat;
  club_id: string; club: { name: string } | null;
}

export async function myTeams(): Promise<TeamWithClub[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, age_group, format, club_id, club:clubs(name)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TeamWithClub[];
}

export async function createClubAndTeam(
  clubName: string, teamName: string, format: TeamFormat, ageGroup: string,
): Promise<TeamWithClub> {
  const me = await uid();
  const { data: club, error: e1 } = await supabase
    .from("clubs").insert({ name: clubName, created_by: me }).select().single();
  if (e1) throw e1;
  const { data: team, error: e2 } = await supabase
    .from("teams")
    .insert({
      club_id: (club as Club).id, name: teamName, format,
      age_group: ageGroup || null, created_by: me,
    })
    .select("id, name, age_group, format, club_id").single();
  if (e2) throw e2;
  return { ...(team as any), club: { name: clubName } };
}

export async function addTeamToClub(
  clubId: string, teamName: string, format: TeamFormat, ageGroup: string,
): Promise<void> {
  const me = await uid();
  const { error } = await supabase.from("teams").insert({
    club_id: clubId, name: teamName, format, age_group: ageGroup || null, created_by: me,
  });
  if (error) throw error;
}

export async function players(teamId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from("players").select("*").eq("team_id", teamId)
    .order("shirt_number", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Player[];
}

export async function addPlayer(
  teamId: string, displayName: string, shirt: number | null, position: string,
): Promise<void> {
  const me = await uid();
  const { error } = await supabase.from("players").insert({
    team_id: teamId, display_name: displayName, shirt_number: shirt,
    position: position || null, created_by: me,
  });
  if (error) throw error;
}

// ---- Events -----------------------------------------------------------------
export async function recentEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events").select("*").order("event_date", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

export async function createEvent(input: {
  team_id: string; club_id: string; event_type: EventType; title: string;
  event_date: string; opposition: string; focus_area: string; purpose: string;
  hoping_to_see: string[];
}): Promise<EventRow> {
  const me = await uid();
  const { data, error } = await supabase
    .from("events")
    .insert({
      user_id: me, team_id: input.team_id, club_id: input.club_id,
      event_type: input.event_type, title: input.title,
      event_date: input.event_date || null, opposition: input.opposition || null,
      focus_area: input.focus_area || null, purpose: input.purpose || null,
      hoping_to_see: input.hoping_to_see, status: "draft",
    })
    .select().single();
  if (error) throw error;
  return data as EventRow;
}

export async function getEvent(id: string): Promise<EventRow> {
  const { data, error } = await supabase.from("events").select("*").eq("id", id).single();
  if (error) throw error;
  return data as EventRow;
}

// ---- Squad, attendance & match record ---------------------------------------
export interface SquadRow {
  player: Player;
  status: AttendanceStatus | null;
  selection: SquadSelection | null;
}

export async function squad(eventId: string, teamId: string): Promise<SquadRow[]> {
  const [pl, att] = await Promise.all([
    players(teamId),
    supabase.from("event_attendance").select("player_id, status, selection").eq("event_id", eventId),
  ]);
  const by = new Map((att.data ?? []).map((a: any) => [a.player_id, a]));
  return pl.map((p) => ({
    player: p,
    status: by.get(p.id)?.status ?? null,
    selection: by.get(p.id)?.selection ?? null,
  }));
}

export async function setAttendance(
  eventId: string, playerId: string, status: AttendanceStatus, selection: SquadSelection | null,
): Promise<void> {
  const { error } = await supabase.from("event_attendance")
    .upsert({ event_id: eventId, player_id: playerId, status, selection }, { onConflict: "event_id,player_id" });
  if (error) throw error;
}

export async function getMatchDetails(eventId: string): Promise<MatchDetails | null> {
  const { data, error } = await supabase.from("match_details").select("*").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as MatchDetails) ?? null;
}

export async function saveMatchDetails(d: MatchDetails): Promise<void> {
  const { error } = await supabase.from("match_details").upsert({
    event_id: d.event_id, home_away: d.home_away, formation: d.formation,
    goals_for: d.goals_for, goals_against: d.goals_against, man_of_the_match: d.man_of_the_match,
  }, { onConflict: "event_id" });
  if (error) throw error;
}

export async function getMatchStats(eventId: string): Promise<MatchStat[]> {
  const { data, error } = await supabase.from("match_stats").select("*").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as MatchStat[];
}

export async function setMatchStat(s: MatchStat): Promise<void> {
  const { error } = await supabase.from("match_stats").upsert({
    event_id: s.event_id, player_id: s.player_id, goals: s.goals, assists: s.assists,
    yellow_cards: s.yellow_cards, red_cards: s.red_cards, clean_sheet: s.clean_sheet,
  }, { onConflict: "event_id,player_id" });
  if (error) throw error;
}

// ---- Observations (notes) ---------------------------------------------------
export async function observations(eventId: string): Promise<Observation[]> {
  const { data, error } = await supabase
    .from("observations").select("*").eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Observation[];
}

export async function addTextNote(
  eventId: string, teamId: string | null, phase: CapturePhase, text: string,
): Promise<void> {
  const me = await uid();
  const { data, error } = await supabase
    .from("observations")
    .insert({
      event_id: eventId, user_id: me, team_id: teamId, capture_phase: phase,
      input_type: "text_note", observation_type: "team_observation",
      subject_type: "team", raw_note: text,
    })
    .select("id").single();
  if (error) throw error;
  // Tidy + tag in the background (best-effort — the raw note is already saved).
  supabase.functions.invoke("clean-observation", { body: { observation_id: (data as any).id } })
    .catch(() => {});
}

// Upload a voice note, save the observation, transcribe, then clean.
export async function addVoiceNote(
  eventId: string, teamId: string | null, phase: CapturePhase, blob: Blob,
): Promise<void> {
  const me = await uid();
  const path = `${me}/${eventId}/${crypto.randomUUID()}.webm`;
  const up = await supabase.storage.from("audio-recordings").upload(path, blob, {
    contentType: "audio/webm",
  });
  if (up.error) throw up.error;

  const { data: obs, error } = await supabase
    .from("observations")
    .insert({
      event_id: eventId, user_id: me, team_id: teamId, capture_phase: phase,
      input_type: "voice_note", observation_type: "team_observation",
      subject_type: "team", audio_path: path,
    })
    .select("id").single();
  if (error) throw error;

  await supabase.functions.invoke("transcribe-audio", {
    body: { bucket: "audio-recordings", audio_path: path, target: "observation", target_id: (obs as any).id },
  });
  await supabase.functions.invoke("clean-observation", { body: { observation_id: (obs as any).id } });
}

// ---- Reflection -------------------------------------------------------------
export async function getReflection(eventId: string): Promise<Reflection | null> {
  const { data, error } = await supabase
    .from("reflections").select("*").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as Reflection) ?? null;
}

export async function saveTextReflection(
  eventId: string, text: string, kind: "coach" | "player" = "coach",
): Promise<Reflection> {
  const me = await uid();
  const existing = await getReflection(eventId);
  if (existing) {
    const { data, error } = await supabase
      .from("reflections").update({ raw_transcript: text, summary: text })
      .eq("id", existing.id).select().single();
    if (error) throw error;
    return data as Reflection;
  }
  const { data, error } = await supabase
    .from("reflections")
    .insert({ event_id: eventId, user_id: me, reflection_type: kind, raw_transcript: text, summary: text })
    .select().single();
  if (error) throw error;
  return data as Reflection;
}

// Save a voice reflection: upload, insert/attach, transcribe.
export async function saveVoiceReflection(
  eventId: string, blob: Blob, kind: "coach" | "player" = "coach",
): Promise<Reflection> {
  const me = await uid();
  const path = `${me}/${eventId}/reflection-${crypto.randomUUID()}.webm`;
  const up = await supabase.storage.from("audio-recordings").upload(path, blob, { contentType: "audio/webm" });
  if (up.error) throw up.error;

  let ref = await getReflection(eventId);
  if (!ref) {
    const { data, error } = await supabase
      .from("reflections")
      .insert({ event_id: eventId, user_id: me, reflection_type: kind, audio_path: path })
      .select().single();
    if (error) throw error;
    ref = data as Reflection;
  } else {
    await supabase.from("reflections").update({ audio_path: path }).eq("id", ref.id);
  }
  await supabase.functions.invoke("transcribe-audio", {
    body: { bucket: "audio-recordings", audio_path: path, target: "reflection", target_id: ref.id },
  });
  return ref;
}

export async function generateQuestions(reflectionId: string): Promise<void> {
  await supabase.functions.invoke("generate-reflection-questions", { body: { reflection_id: reflectionId } });
}

export async function questions(reflectionId: string): Promise<FollowupQuestion[]> {
  const { data, error } = await supabase
    .from("followup_questions").select("*").eq("reflection_id", reflectionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FollowupQuestion[];
}

export async function answerQuestion(questionId: string, text: string): Promise<void> {
  const { error } = await supabase.from("followup_answers").insert({ question_id: questionId, answer_text: text });
  if (error) throw error;
}

// Answer a follow-up question by voice: upload, save, transcribe to answer_text.
export async function answerQuestionVoice(questionId: string, blob: Blob): Promise<void> {
  const me = await uid();
  const path = `${me}/answers/${crypto.randomUUID()}.webm`;
  const up = await supabase.storage.from("audio-recordings").upload(path, blob, { contentType: "audio/webm" });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from("followup_answers").insert({ question_id: questionId, audio_path: path }).select("id").single();
  if (error) throw error;
  await supabase.functions.invoke("transcribe-audio", {
    body: { bucket: "audio-recordings", audio_path: path, target: "answer", target_id: (data as { id: string }).id },
  });
}

export async function enrich(reflectionId: string): Promise<void> {
  await supabase.functions.invoke("enrich-reflection", { body: { reflection_id: reflectionId } });
}

// ---- Reports ----------------------------------------------------------------
export async function reports(eventId: string): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports").select("*").eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Report[];
}

export async function generateReport(eventId: string, eventType: EventType): Promise<Report | null> {
  const reportType = eventType === "match" ? "match_report"
    : eventType === "tournament" ? "tournament_report"
    : eventType === "training_session" ? "training_report" : "other_report";
  const { data, error } = await supabase.functions.invoke("generate-report", {
    body: { event_id: eventId, report_type: reportType },
  });
  if (error) throw error;
  return (data?.report as Report) ?? null;
}

// =============================================================================
// PLAYER MODE — a private, self-owned reflection space (independent of coaches).
// =============================================================================
export interface PlayerGameRow extends PlayerGameLog {
  events: { id: string; title: string; event_type: EventType; event_date: string | null } | null;
}

export async function playerGames(): Promise<PlayerGameRow[]> {
  const me = await uid();
  const { data, error } = await supabase
    .from("player_game_log")
    .select("*, events(id, title, event_type, event_date)")
    .eq("user_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PlayerGameRow[];
}

export async function createPlayerGame(input: {
  is_match: boolean; title: string; event_date: string; opposition: string;
  home_away: HomeAway | null; positions: string[]; role: PlayerMatchRole | null;
  goals_for: number | null; goals_against: number | null; minutes: number | null;
  my_goals: number; my_assists: number;
}): Promise<string> {
  const me = await uid();
  const { data: ev, error: e1 } = await supabase
    .from("events")
    .insert({
      user_id: me, team_id: null, club_id: null,
      event_type: input.is_match ? "match" : "training_session",
      title: input.title, event_date: input.event_date || null,
      opposition: input.opposition || null, status: "completed",
    })
    .select("id").single();
  if (e1) throw e1;
  const eventId = (ev as { id: string }).id;

  const { error: e2 } = await supabase.from("player_game_log").insert({
    event_id: eventId, user_id: me, positions: input.positions,
    role: input.role, home_away: input.home_away, opposition: input.opposition || null,
    goals_for: input.goals_for, goals_against: input.goals_against,
    minutes_played: input.minutes, my_goals: input.my_goals, my_assists: input.my_assists,
  });
  if (e2) throw e2;
  return eventId;
}

export async function getPlayerGame(eventId: string): Promise<PlayerGameLog | null> {
  const { data, error } = await supabase
    .from("player_game_log").select("*").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as PlayerGameLog) ?? null;
}

export async function generatePlayerReport(eventId: string): Promise<Report | null> {
  const { data, error } = await supabase.functions.invoke("generate-report", {
    body: { event_id: eventId, report_type: "player_report" },
  });
  if (error) throw error;
  return (data?.report as Report) ?? null;
}

export async function playerSummaries(): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports").select("*").is("event_id", null).is("team_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Report[];
}

export async function generatePlayerSummary(
  reportType: "weekly_report" | "monthly_report" | "season_report",
  periodStart: string, periodEnd: string,
): Promise<Report | null> {
  const { data, error } = await supabase.functions.invoke("generate-player-summary", {
    body: { report_type: reportType, period_start: periodStart, period_end: periodEnd },
  });
  if (error) throw error;
  return (data?.report as Report) ?? null;
}
