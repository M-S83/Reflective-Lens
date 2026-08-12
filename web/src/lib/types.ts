// Frontend view of the backend rows we touch (subset of ../../types/database.ts).
export type EventType = "training_session" | "match" | "tournament" | "other";
export type TeamFormat = "3v3" | "5v5" | "6v6" | "7v7" | "9v9" | "11v11";
export type CapturePhase = "pre_event" | "live" | "post_event" | "ad_hoc";
export type Sentiment = "positive" | "concern" | "neutral";

export interface Club { id: string; name: string; created_at: string; }
export interface Team {
  id: string; club_id: string; name: string; age_group: string | null; format: TeamFormat;
}
export interface Player {
  id: string; team_id: string | null; display_name: string | null;
  first_name: string | null; last_name: string | null; shirt_number: number | null; position: string | null;
}
export type AttendanceStatus = "present" | "absent" | "injured" | "unavailable";
export type SquadSelection = "starter" | "substitute" | "unused_substitute";

export interface EventAttendance {
  id?: string; event_id: string; player_id: string;
  status: AttendanceStatus; selection: SquadSelection | null; position: string | null;
}
export interface MatchDetails {
  id?: string; event_id: string; home_away: HomeAway | null; formation: string | null;
  goals_for: number; goals_against: number; result?: MatchResult; man_of_the_match: string | null; notes: string | null;
}
export interface MatchStat {
  id?: string; event_id: string; player_id: string;
  goals: number; assists: number; yellow_cards: number; red_cards: number;
  clean_sheet: boolean; minutes_played: number | null;
}

export const ATTEND: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Here" },
  { value: "absent", label: "Absent" },
  { value: "injured", label: "Injured" },
];
// "Game changer" is the positive framing for a substitute (the coach's word for it).
export const SELECT: { value: SquadSelection; label: string }[] = [
  { value: "starter", label: "Starter" },
  { value: "substitute", label: "Game changer" },
  { value: "unused_substitute", label: "Unused" },
];

export interface EventRow {
  id: string; team_id: string | null; club_id: string | null; event_type: EventType;
  custom_type: string | null;
  title: string; event_date: string | null; opposition: string | null;
  focus_area: string | null; purpose: string | null; hoping_to_see: string[];
  status: "draft" | "live" | "completed"; created_at: string;
}
export interface Observation {
  id: string; event_id: string | null; capture_phase: CapturePhase;
  input_type: "voice_note" | "text_note" | "tag_only";
  raw_note: string | null; cleaned_note: string | null; tags: string[];
  sentiment: Sentiment; audio_path: string | null; created_at: string;
}
export interface Reflection {
  // reflection_type stays in the schema (the enum has a player value) but the
  // player journey was removed, so everything this app writes is a coach's.
  id: string; event_id: string; reflection_type: "coach";
  raw_transcript: string | null; summary: string | null; enriched_summary: string | null;
  audio_path: string | null; created_at: string;
}
export interface FollowupQuestion {
  id: string; reflection_id: string; question_text: string; question_type: string; skipped: boolean;
}
export interface Report {
  id: string; event_id: string | null; report_type: string; title: string;
  content_markdown: string | null; created_at: string;
}

// ---- Match result ------------------------------------------------------------
// Coach-side, for the result a coach enters against a match. The player-journey
// types that used to share this section (PlayerMatchRole, PlayerGameLog and its
// own ROLES list) went with 0021. The "Game changer" wording they carried lives
// on where it is actually used, in ATTENDANCE above.
export type HomeAway = "home" | "away" | "neutral";
export type MatchResult = "win" | "draw" | "loss";

export const HOME_AWAY: { value: HomeAway; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "neutral", label: "Neutral" },
];

export const FORMATS: TeamFormat[] = ["3v3", "5v5", "6v6", "7v7", "9v9", "11v11"];

// A chooser, not a text box. This was a free-text field whose only guidance was
// a "U12" placeholder, and the under-18 name protection was decided by reading
// the first digits out of whatever went in. "U19" and "2013s" both came back as
// an adult squad, which quietly sent children's surnames out to the
// transcription and writing services.
//
// So the age group is a stored fact now rather than something parsed. Only the
// last entry counts as adult, and it has to match ADULT_AGE_GROUP in
// supabase/functions/_shared/names.ts exactly. They cannot import each other,
// so _tests/age-groups.mjs holds them together.
export const ADULT_AGE_GROUP = "Adult / open age";
export const AGE_GROUPS: string[] = [
  "U6", "U7", "U8", "U9", "U10", "U11", "U12",
  "U13", "U14", "U15", "U16", "U17", "U18",
  ADULT_AGE_GROUP,
];
export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "training_session", label: "Training" },
  { value: "match", label: "Match" },
  { value: "tournament", label: "Tournament" },
  { value: "other", label: "Other" },
];
// A label for every phase, INCLUDING ones that can no longer be created, so a
// note captured under an older version of the app still renders with its name
// rather than a blank.
export const PHASE_LABELS: Record<CapturePhase, string> = {
  pre_event: "Before",
  live: "During",
  post_event: "After",
  ad_hoc: "Thought",
};

// The phases a coach can still capture into.
//
// "post_event" is deliberately absent. A note written after the session and a
// reflection written after the session are the same act, and offering both left
// no way to know which box to use: in practice the same thought got written
// twice and the report then had to reconcile two versions of it. Reflect is the
// after.
//
// "ad_hoc" is absent for a different reason: a thought belongs to no session at
// all, so it lives on the home screen (components/Thoughts.tsx).
export const PHASES: { value: CapturePhase; label: string }[] = [
  { value: "pre_event", label: "Before" },
  { value: "live", label: "During" },
];

// What to call a session on screen. An "other" session takes the coach's own
// name for it (migration 0018), so a goalkeeping block reads as theirs rather
// than as "other". Mirrors sessionLabel() in generate-period-report: the label a
// coach sees and the one the report groups by must be the same string.
export const CUSTOM_TYPE_MAX = 60;
export function sessionLabel(e: { event_type: EventType; custom_type?: string | null }): string {
  if (e.event_type === "other") return e.custom_type?.trim() || "Other session";
  const found = EVENT_TYPES.find((t) => t.value === e.event_type);
  return found?.label ?? e.event_type.replace(/_/g, " ");
}
