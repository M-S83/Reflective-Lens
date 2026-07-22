// =============================================================================
// types/database.ts
// TypeScript interfaces for the main backend objects.
// Mirrors the SQL schema in supabase/migrations/0001_initial_schema.sql.
//
// These are hand-written for clarity. For a fully generated, end-to-end typed
// client you can additionally run:
//   supabase gen types typescript --local > types/supabase.ts
// =============================================================================

// ---- Enums ------------------------------------------------------------------

export type UserRole =
  | "coach"
  | "player"
  | "coach_developer"
  | "admin";

export type EventType =
  | "training_session"
  | "match"
  | "tournament"
  | "other"
  | "coach_observation"
  | "player_reflection";

export type EventStatus = "draft" | "live" | "completed";

export type AttendanceStatus = "present" | "absent" | "injured" | "unavailable";

export type SquadSelection = "starter" | "substitute" | "unused_substitute";

export type MatchResult = "win" | "draw" | "loss";

export type TeamFormat = "3v3" | "5v5" | "6v6" | "7v7" | "9v9" | "11v11";

export type DevNoteCategory =
  | "strength"
  | "development_area"
  | "target"
  | "general";

export type CompetitionKind = "league" | "cup";

export type HomeAway = "home" | "away" | "neutral";

// How a player featured in their own game (Player Mode self-log).
export type PlayerMatchRole = "started" | "substitute" | "game_changer";

export type TeamSheetSource = "image" | "pdf" | "manual";

export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

export type ObservationInputType = "voice_note" | "text_note" | "tag_only";

export type ObservationType =
  | "player_observation"
  | "team_observation"
  | "tactical_pattern"
  | "technical_action"
  | "physical_action"
  | "psychological_behavioural"
  | "set_piece"
  | "moment_of_quality"
  | "concern_risk"
  | "follow_up_later";

export type SubjectType = "player" | "team" | "coach" | "unit" | "unknown";

export type Sentiment = "positive" | "concern" | "neutral";

// When a note was captured, relative to its event. 'ad_hoc' = a thought at any
// time, which may not belong to an event at all.
export type CapturePhase = "pre_event" | "live" | "post_event" | "ad_hoc";

export type ReflectionType = "coach" | "player" | "coach_developer";

export type QuestionType = "multiple_choice" | "voice" | "text" | "rating";

export type ReportType =
  | "training_report"
  | "match_report"
  | "tournament_report"
  | "other_report"
  | "weekly_report"
  | "monthly_report"
  | "season_report"
  | "player_report"
  | "coach_observation";

export type InsightType =
  | "player_pattern"
  | "team_pattern"
  | "coach_development"
  | "recurring_theme";

// ---- Core tables ------------------------------------------------------------

export interface Club {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface Profile {
  id: string; // == auth.users.id
  email: string | null; // email sign-in
  phone: string | null; // mobile sign-in
  full_name: string | null;
  role: UserRole;
  club_id: string | null;
  language: string; // BCP-47-ish tag driving AI output language (default 'en-GB')
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  club_id: string;
  name: string;
  age_group: string | null;
  format: TeamFormat; // 3v3 … 11v11
  created_by: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  team_id: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  shirt_number: number | null;
  position: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Competition {
  id: string;
  club_id: string;
  team_id: string | null;
  name: string; // editable
  kind: CompetitionKind;
  created_by: string | null;
  created_at: string;
}

// Learned from the coach's own writing; every AI reply is written through it.
export interface CoachVoiceProfile {
  id: string;
  user_id: string;
  style_summary: string | null;
  glossary: string[]; // characteristic terms/phrases the coach uses
  language_level: string | null; // 'plain' | 'developing' | 'technical' (language, not skill)
  sample_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlayerDevelopmentNote {
  id: string;
  player_id: string;
  user_id: string;
  category: DevNoteCategory;
  note: string;
  created_at: string;
  updated_at: string;
}

// Read-only rollup (the `player_stats` view) shown on a player's profile.
export interface PlayerStats {
  player_id: string;
  team_id: string | null;
  appearances: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  clean_sheets: number;
  minutes_played: number;
  trainings_attended: number;
}

export interface Event {
  id: string;
  user_id: string;
  club_id: string | null;
  team_id: string | null;
  competition_id: string | null; // matches only
  event_type: EventType;
  title: string;
  event_date: string | null; // ISO date
  opposition: string | null;
  venue: string | null;
  focus_area: string | null; // short theme tag
  purpose: string | null; // the aim of the session/match
  hoping_to_see: string[]; // observable things you hope to see
  status: EventStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventAttendance {
  id: string;
  event_id: string;
  player_id: string;
  status: AttendanceStatus;
  selection: SquadSelection | null; // starter / substitute / unused_substitute (matches)
  position: string | null; // lineup position for this match, e.g. 'CM', 'LW'
  created_at: string;
}

export interface MatchDetails {
  id: string;
  event_id: string;
  home_away: HomeAway | null;
  formation: string | null; // e.g. '4-3-3'
  goals_for: number;
  goals_against: number;
  result: MatchResult; // generated: win / draw / loss
  man_of_the_match: string | null; // player id
  notes: string | null;
  created_at: string;
}

export interface MatchStats {
  id: string;
  event_id: string;
  player_id: string;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  clean_sheet: boolean;
  minutes_played: number | null;
  created_at: string;
}

// Player Mode: the player's own record of a game, logged with their reflection.
export interface PlayerGameLog {
  id: string;
  event_id: string;
  user_id: string;
  positions: string[]; // position(s) they played, e.g. ['CM','LW']
  role: PlayerMatchRole | null; // started / substitute / game_changer
  home_away: HomeAway | null;
  opposition: string | null;
  goals_for: number | null;
  goals_against: number | null;
  result: MatchResult | null; // generated from the score
  minutes_played: number | null;
  my_goals: number;
  my_assists: number;
  created_at: string;
}

export interface TeamSheet {
  id: string;
  event_id: string;
  uploaded_by: string | null;
  source: TeamSheetSource;
  file_path: string | null;
  extracted_text: string | null;
  processing_status: ProcessingStatus;
  created_at: string;
}

export interface TeamSheetPlayer {
  id: string;
  team_sheet_id: string;
  player_id: string | null;
  shirt_number: number | null;
  player_name: string | null;
  position: string | null;
  team_name: string | null;
  is_starter: boolean;
  confidence_score: number | null;
  created_at: string;
}

export interface Observation {
  id: string;
  event_id: string | null; // null for ad-hoc notes
  user_id: string;
  team_id: string | null; // for scoping ad-hoc notes
  capture_phase: CapturePhase;
  timestamp_seconds: number | null;
  match_minute: number | null;
  input_type: ObservationInputType;
  observation_type: ObservationType;
  subject_type: SubjectType;
  player_id: string | null;
  shirt_number: number | null;
  raw_note: string | null;
  cleaned_note: string | null;
  tags: string[];
  sentiment: Sentiment;
  phase_of_play: string | null;
  confidence_score: number | null;
  audio_path: string | null;
  created_at: string;
}

export interface Reflection {
  id: string;
  event_id: string;
  user_id: string;
  reflection_type: ReflectionType;
  raw_transcript: string | null; // text typed, or transcript of a voice reflection
  summary: string | null;
  enriched_summary: string | null; // summary re-woven with follow-up context
  what_went_well: string[];
  what_did_not_work: string[];
  learning_evidence: string[];
  action_points: string[];
  suggested_next_focus: string[];
  hoped_to_see_review: HopedToSeeReviewItem[];
  audio_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface HopedToSeeReviewItem {
  item: string;
  status: "showed_up" | "partly" | "not_observed";
  evidence: string;
}

export interface FollowupQuestion {
  id: string;
  reflection_id: string;
  question_text: string;
  question_type: QuestionType;
  options: QuestionOption[];
  skipped: boolean;
  created_at: string;
}

export interface QuestionOption {
  value: string;
  label: string;
}

export interface FollowupAnswer {
  id: string;
  question_id: string;
  answer_text: string | null;
  selected_option: string | null;
  audio_path: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  event_id: string | null; // null for period (monthly/season) reports
  team_id: string | null; // set for period reports
  created_by: string | null;
  report_type: ReportType;
  title: string;
  period_start: string | null; // monthly/season reports
  period_end: string | null;
  content_json: Record<string, unknown>;
  content_markdown: string | null;
  pdf_path: string | null;
  created_at: string;
}

export interface ReportAccess {
  id: string;
  report_id: string;
  user_id: string;
  granted_by: string | null;
  created_at: string;
}

export interface Insight {
  id: string;
  user_id: string;
  club_id: string | null;
  team_id: string | null;
  player_id: string | null;
  insight_type: InsightType;
  title: string;
  description: string | null;
  sentiment: Sentiment | null; // concern vs progress
  reflective_prompt: string | null; // forward-looking nudge for a recurring theme
  evidence_count: number;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
}

// ---- Usage analytics --------------------------------------------------------

// One append-only row per tracked action. AI/transcription rows carry a cost;
// engagement rows (written by DB triggers) don't. See migration 0004.
export interface UsageEvent {
  id: string;
  user_id: string;
  event_name: string; // 'ai_call' | 'transcription' | 'reflection_created' | ...
  feature: string | null;
  model: string | null; // Claude model id, for ai_call
  input_tokens: number | null;
  output_tokens: number | null;
  audio_seconds: number | null;
  cost_usd: number; // provider cost of this event
  club_id: string | null;
  team_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---- Continuous learning ----------------------------------------------------

// Per-user "what's waiting to be learned" + last-run bookkeeping (migration 0005).
// A `*_pending_since` is non-null when there's new input the app hasn't learned
// from yet; the nightly sweep clears it and stamps the matching last_*_run.
export interface LearningState {
  user_id: string;
  voice_pending_since: string | null;
  insights_pending_since: string | null;
  last_voice_run: string | null;
  last_insights_run: string | null;
  updated_at: string;
}

// The visible ledger of what the app taught itself, and when.
export interface LearningRun {
  id: string;
  user_id: string;
  kind: "voice" | "insights";
  inputs_seen: number;
  items_changed: number; // insights created, or voice sample_count
  summary: string | null;
  metadata: Record<string, unknown>;
  ran_at: string;
}

// ---- Monetisation -----------------------------------------------------------

export type PlanInterval = "month" | "season" | "once" | "free";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface Plan {
  id: string; // 'free' | 'coach_monthly' | ...
  name: string;
  description: string | null;
  price_pence: number; // minor units
  currency: string; // 'gbp'
  interval: PlanInterval;
  ai_budget_usd: number | null; // soft monthly AI-cost ceiling (margin monitoring)
  is_active: boolean;
  sort_order: number;
  features: Record<string, unknown>;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

// ---- Coaching knowledge base (reference data) -------------------------------

// A named coaching model/framework (Four Corners, STEP, the £10 challenge, …).
export interface CoachingFramework {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

// A curated open reflective prompt. `cadence` is set ('10m'|'10h'|'10d') only for
// the 10-10-10 scheduled-reflection prompts; null for the in-reflection bank.
export interface ReflectionPrompt {
  id: string;
  group_name: string; // 'Self-awareness', 'Communication & language', ...
  prompt: string;
  cadence: "10m" | "10h" | "10d" | null;
  created_at: string;
}

// A canonical observation tag (the taxonomy note-cleaning snaps to).
export interface CoachingTag {
  tag: string;
}

// ---- Storage bucket names ---------------------------------------------------

export const BUCKETS = {
  audio: "audio-recordings",
  uploads: "uploads",
  reports: "reports",
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];
