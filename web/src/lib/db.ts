import { supabase } from "./supabase";
import type {
  AttendanceStatus, Club, EventRow, EventType, FollowupQuestion, MatchDetails, MatchStat,
  Observation, Player, Reflection, Report, SquadSelection,
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
    // Named columns, not "*". The superseded `position` is still on the table
    // and a screen that receives it is one interpolation away from showing a
    // coach a value that stopped being updated (0029).
    .from("players")
    .select("id, team_id, display_name, first_name, last_name, shirt_number, positions")
    .eq("team_id", teamId)
    .order("shirt_number", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Player[];
}

// A player can play more than one position (0029). Kept as the coach's own
// words in their own order: someone who says "left eight" means something by it
// and the app is not here to swap in a textbook term.
export function parsePositions(text: string): string[] {
  return text
    .split(/[,/]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function addPlayer(
  teamId: string, displayName: string, shirt: number | null, positions: string[],
): Promise<void> {
  const me = await uid();
  const { error } = await supabase.from("players").insert({
    team_id: teamId, display_name: displayName, shirt_number: shirt,
    positions, created_by: me,
  });
  if (error) throw error;
}

export async function updatePlayer(
  playerId: string,
  patch: { display_name?: string; shirt_number?: number | null; positions?: string[] },
): Promise<void> {
  const { error } = await supabase.from("players").update(patch).eq("id", playerId);
  if (error) throw error;
}

export async function removePlayer(playerId: string): Promise<void> {
  const { error } = await supabase.from("players").delete().eq("id", playerId);
  if (error) throw error;
}

export interface TeamInfo { id: string; name: string; age_group: string | null; format: TeamFormat; club_id: string; }
export async function getTeam(teamId: string): Promise<TeamInfo> {
  const { data, error } = await supabase
    .from("teams").select("id, name, age_group, format, club_id").eq("id", teamId).single();
  if (error) throw error;
  return data as TeamInfo;
}
export async function renameTeam(teamId: string, name: string): Promise<void> {
  const { error } = await supabase.from("teams").update({ name }).eq("id", teamId);
  if (error) throw error;
}
// Teams made before the age group became a picker hold whatever was typed, and
// anything unrecognised is treated as under-18. That is the right way to fail,
// but without this there is no way out of it: an adult team would be stuck on
// first names only with nothing on any screen to change.
export async function setTeamAgeGroup(teamId: string, ageGroup: string): Promise<void> {
  const { error } = await supabase.from("teams").update({ age_group: ageGroup }).eq("id", teamId);
  if (error) throw error;
}

// Deletes — an owner can remove their own data. Deleting an event cascades to its
// notes, reflection, follow-up questions and answers, squad, result and reports.
//
// The cascade is rows only. The recordings live in the audio-recordings bucket
// and nothing in Postgres knows about them, so without this a coach who deleted
// a session because of what they said in it would have deleted the transcript
// and kept the voice note. Account deletion already sweeps the bucket
// (purge-due-accounts); this does the same job for one session.
//
// Paths are gathered BEFORE the delete, because the rows that name them are
// about to go. Removing the files is best-effort and last: if it fails, the
// session is still gone, which is what was asked for, and the leftovers are no
// worse than what happened before this existed.
export async function deleteEvent(id: string): Promise<void> {
  const paths: string[] = [];
  const collect = (rows: { audio_path: string | null }[] | null) => {
    for (const r of rows ?? []) if (r.audio_path) paths.push(r.audio_path);
  };

  const [obs, refs] = await Promise.all([
    supabase.from("observations").select("audio_path").eq("event_id", id),
    supabase.from("reflections").select("id, audio_path").eq("event_id", id),
  ]);
  collect(obs.data as { audio_path: string | null }[] | null);
  collect(refs.data as { audio_path: string | null }[] | null);

  // Answers are not filed under the event (they live in <uid>/answers/), so the
  // only route to them is through the reflection that owns their question.
  const reflectionIds = (refs.data ?? []).map((r) => (r as { id: string }).id);
  if (reflectionIds.length) {
    const { data: qs } = await supabase
      .from("followup_questions").select("id").in("reflection_id", reflectionIds);
    const questionIds = (qs ?? []).map((q) => (q as { id: string }).id);
    if (questionIds.length) {
      const { data: answers } = await supabase
        .from("followup_answers").select("audio_path").in("question_id", questionIds);
      collect(answers as { audio_path: string | null }[] | null);
    }
  }

  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;

  if (paths.length) {
    try { await supabase.storage.from("audio-recordings").remove(paths); } catch { /* rows are gone */ }
  }
}
export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from("reports").delete().eq("id", id);
  if (error) throw error;
}
export async function deleteObservation(id: string): Promise<void> {
  const { error } = await supabase.from("observations").delete().eq("id", id);
  if (error) throw error;
}

// Account deletion has a 30-day recovery window. Requesting it schedules the
// deletion (returns the date it becomes permanent); the account stays live and
// usable until then, and cancel keeps it. A cron sweep does the hard delete once
// the date has passed. The caller must confirm before requesting.
export async function requestAccountDeletion(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("delete-account");
  if (error) throw error;
  return (data as { scheduled_for: string }).scheduled_for;
}

export async function cancelAccountDeletion(): Promise<void> {
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) throw error;
}

// The caller's own scheduled-deletion date, or null if the account is not
// scheduled for deletion. Reads the caller's own profile row (RLS: read self).
export async function getDeletionSchedule(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("profiles").select("deletion_scheduled_at").eq("id", uid).maybeSingle();
  if (error) throw error;
  return (data as { deletion_scheduled_at: string | null } | null)?.deletion_scheduled_at ?? null;
}

// ---- Events -----------------------------------------------------------------
export async function recentEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events").select("*").order("event_date", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

export async function createEvent(input: {
  // Both nullable: a session does not have to belong to a team (a one-to-one,
  // a goalkeeping block), and without a team there is no club either.
  team_id: string | null; club_id: string | null; event_type: EventType; title: string;
  custom_type?: string;
  event_date: string; opposition: string; focus_area: string; purpose: string;
  hoping_to_see: string[];
}): Promise<EventRow> {
  const me = await uid();
  const { data, error } = await supabase
    .from("events")
    .insert({
      user_id: me, team_id: input.team_id || null, club_id: input.club_id || null,
      event_type: input.event_type, title: input.title,
      // Only meaningful for 'other'; null everywhere else keeps the column honest.
      custom_type: input.event_type === "other" ? (input.custom_type?.trim() || null) : null,
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
  eventId: string | null, teamId: string | null, phase: CapturePhase, text: string,
): Promise<void> {
  const me = await uid();
  const { data, error } = await supabase
    .from("observations")
    .insert({
      event_id: eventId, user_id: me, team_id: teamId, capture_phase: phase,
      input_type: "text_note",
      // 'unknown', because it is. The coach types a sentence; nothing asks who
      // it was about and nothing works it out. This said "team" on every note
      // the app has ever saved, including notes from a 1v1 with one child, and
      // the report read that label and wrote about a team that did not exist.
      // A field nothing populates honestly should say so rather than guess, or
      // the next feature to read it repeats the same bug.
      subject_type: "unknown", raw_note: text,
    })
    .select("id").single();
  if (error) throw error;
  // Tidy + tag in the background (best-effort — the raw note is already saved).
  supabase.functions.invoke("clean-observation", { body: { observation_id: (data as any).id } })
    .catch(() => {});
}

// Upload a voice note, save the observation, transcribe, then clean.
export async function addVoiceNote(
  eventId: string | null, teamId: string | null, phase: CapturePhase, blob: Blob,
): Promise<void> {
  const me = await uid();
  // A thought has no event, so it files under "thoughts". The first path
  // segment stays the user id either way, which is what the storage policy
  // and the account-deletion purge both key off.
  const path = `${me}/${eventId ?? "thoughts"}/${crypto.randomUUID()}.webm`;
  const up = await supabase.storage.from("audio-recordings").upload(path, blob, {
    contentType: "audio/webm",
  });
  if (up.error) throw up.error;

  const { data: obs, error } = await supabase
    .from("observations")
    .insert({
      event_id: eventId, user_id: me, team_id: teamId, capture_phase: phase,
      input_type: "voice_note",
      // Same as the typed note above: not known, so not claimed.
      subject_type: "unknown", audio_path: path,
    })
    .select("id").single();
  if (error) throw error;

  try {
    await callFunction("transcribe-audio", {
      bucket: "audio-recordings", audio_path: path, target: "observation", target_id: (obs as any).id,
    });
  } catch {
    // The note and the recording are both saved by this point, so this is not
    // a lost thought, it is an unstarted job. Say so rather than leaving them
    // watching a word that will never change.
    throw new Error("Your recording is saved, but transcribing it could not start. Open the note and tap Try again.");
  }
  // Best effort: tidying and tagging can fail without costing anything, because
  // the raw transcript is already on screen.
  supabase.functions.invoke("clean-observation", { body: { observation_id: (obs as any).id } }).catch(() => {});
}

// Invoking an edge function and NOT looking at the answer.
//
// supabase.functions.invoke does not throw. It resolves with { data, error },
// so `await invoke(...)` on its own line succeeds no matter what happened, and
// every call below did exactly that. When transcription could not even be
// STARTED, because of a boot error, an auth problem, or the phone dropping
// signal between the upload and the call, the note was saved with no words, the
// app said nothing, and it read "Transcribing…" for the rest of its life.
//
// Nothing was logged anywhere either, because the function was never reached.
// The Supabase dashboard showed zero invocations and zero errors, which is the
// least helpful pair of numbers in software: it looks like nothing is wrong.
//
// So: look at the answer. A voice note is the one thing in this app a coach
// cannot retype from memory, and silently failing to process it is the worst
// thing it can do.
async function callFunction(name: string, body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error((error as Error).message ?? `Could not reach ${name}.`);
}

// Ask again for a voice note whose transcript never arrived.
//
// Transcription is fire and forget: the note row is saved first, the audio is
// uploaded, and the transcript is written back later by an edge function. When
// that function fails, nothing anywhere records that it failed, and the note
// sits reading "Transcribing…" for the rest of its life. The recording itself
// is safe in storage the whole time, which is what makes asking again a real
// fix rather than a hopeful button.
export async function retryTranscription(o: Observation): Promise<void> {
  if (!o.audio_path) throw new Error("There is no recording saved for this note.");
  await callFunction("transcribe-audio", {
    bucket: "audio-recordings",
    audio_path: o.audio_path,
    target: "observation",
    target_id: o.id,
  });
  supabase.functions.invoke("clean-observation", { body: { observation_id: o.id } }).catch(() => {});
}

// ---- Reflection -------------------------------------------------------------
export async function getReflection(eventId: string): Promise<Reflection | null> {
  const { data, error } = await supabase
    .from("reflections").select("*").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as Reflection) ?? null;
}

export async function saveTextReflection(
  eventId: string, text: string,
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
    .insert({ event_id: eventId, user_id: me, reflection_type: "coach", raw_transcript: text, summary: text })
    .select().single();
  if (error) throw error;
  return data as Reflection;
}

// Save a voice reflection: upload, insert/attach, transcribe.
export async function saveVoiceReflection(
  eventId: string, blob: Blob,
): Promise<Reflection> {
  const me = await uid();
  const path = `${me}/${eventId}/reflection-${crypto.randomUUID()}.webm`;
  const up = await supabase.storage.from("audio-recordings").upload(path, blob, { contentType: "audio/webm" });
  if (up.error) throw up.error;

  let ref = await getReflection(eventId);
  if (!ref) {
    const { data, error } = await supabase
      .from("reflections")
      .insert({ event_id: eventId, user_id: me, reflection_type: "coach", audio_path: path })
      .select().single();
    if (error) throw error;
    ref = data as Reflection;
  } else {
    await supabase.from("reflections").update({ audio_path: path }).eq("id", ref.id);
  }
  try {
    await callFunction("transcribe-audio", {
      bucket: "audio-recordings", audio_path: path, target: "reflection", target_id: ref.id,
    });
  } catch {
    throw new Error("Your reflection is recorded and saved, but transcribing it could not start. Try again in a moment.");
  }
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
  try {
    await callFunction("transcribe-audio", {
      bucket: "audio-recordings", audio_path: path, target: "answer", target_id: (data as { id: string }).id,
    });
  } catch {
    throw new Error("Your answer is recorded and saved, but transcribing it could not start. Try again in a moment.");
  }
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

// The player-mode helpers that used to sit here are gone. The journey was
// withdrawn in 0021 and nothing had called them since, but they were not inert:
// generatePlayerReport asked generate-report for a "player_report", and once
// that function stopped branching on the type it would have written a COACH
// report under a player label. createPlayerGame would still have written to
// player_game_log too, because the table's own policy is open. Dead code that
// still works is worse than dead code.

// ---- Period reports --------------------------------------------------------
// The weekly, monthly or season picture for one team. generate-period-report has
// been deployed since the beginning and nothing in the app ever called it, so a
// coach could reflect on eight sessions and only ever see eight separate
// reports. This is where the value compounds: the training-to-match comparison
// only exists here.

export type PeriodType = "weekly_report" | "monthly_report" | "season_report";

export async function generatePeriodReport(
  teamId: string, reportType: PeriodType, periodStart: string, periodEnd: string,
): Promise<Report | null> {
  const { data, error } = await supabase.functions.invoke("generate-period-report", {
    body: {
      team_id: teamId,
      report_type: reportType,
      period_start: periodStart,
      period_end: periodEnd,
    },
  });
  if (error) throw error;
  return (data?.report as Report) ?? null;
}

// Every report this coach has, session and period alike, newest first. RLS
// scopes it to their own (0015).
export async function allReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports").select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Report[];
}

// ---- Standalone thoughts ---------------------------------------------------
// A reflective thought that belongs to no session. Something occurs to a coach
// on the drive home, or three days later, and it should not have to be filed
// against a training session it was not really about.
//
// Stored as an observation with event_id null and capture_phase 'ad_hoc'. The
// schema has allowed exactly this since 0001 (the column comment reads "null for
// ad-hoc notes") and nothing had ever used it.

export async function addThought(text: string): Promise<void> {
  return addTextNote(null, null, "ad_hoc", text);
}

export async function addVoiceThought(blob: Blob): Promise<void> {
  return addVoiceNote(null, null, "ad_hoc", blob);
}

export async function myThoughts(limit = 20): Promise<Observation[]> {
  const { data, error } = await supabase
    .from("observations")
    .select("*")
    .is("event_id", null)
    .eq("capture_phase", "ad_hoc")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Observation[];
}

export async function deleteThought(id: string): Promise<void> {
  const { error } = await supabase.from("observations").delete().eq("id", id);
  if (error) throw error;
}
