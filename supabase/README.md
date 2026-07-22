# Reflective Lens — Coaching & Player Reflection Backend

> **Reflective Lens** — *see your coaching clearly.*

Supabase backend for a football **coaching and player reflection** app focused
on analysing your **own team** and recording notes. User roles — **Coach**,
**Player**, **Coach developer** (plus `admin`) — share one event-centric data
model.

> **Product principle: “Mirror, not verdict.”**
> The AI helps users reflect, organise and surface patterns. It never judges.
> This is enforced in the Edge Function prompts (`clean-observation`,
> `generate-reflection-questions`, `generate-report`).

## Layout

```
supabase/
  config.toml                      Local project + function config
  migrations/
    0001_initial_schema.sql        Enums + tables + triggers
    0002_rls_policies.sql          Row Level Security + helper functions
    0003_storage_buckets.sql       Buckets + storage.objects policies
    0004_usage_analytics.sql       usage_events + analytics views + plans/subscriptions
    0005_continuous_learning.sql   learning_state + learning_runs + due/clear + triggers
    0006_coaching_knowledge.sql    frameworks + reflective prompt bank + tag taxonomy (grounding)
  seed.sql                         Example data (club, team, players, events…)
  functions/
    _shared/                       CORS + Supabase/Claude client helpers (models, pricing, usage logging, knowledge base)
    transcribe-audio/              Audio → transcript (+ logs Whisper cost)
    process-team-sheet/            Team sheet → extracted players
    clean-observation/             Raw note → cleaned note + tags + sentiment
    generate-reflection-questions/ Reflection → optional context-nudge questions
    review-intent/                 hoping_to_see vs notes → review + gap questions
    enrich-reflection/             Answers → reflection.enriched_summary
    generate-report/               Event → structured report (JSON + markdown)
    generate-period-report/        Team + date range → weekly/monthly/season report
    update-insights/               Observations → long-term pattern insights
    update-voice-profile/          Coach's own writing → learned voice profile
    run-learning/                  Scheduled sweep → refresh voice + insights for changed users
    create-checkout/               Plan → Stripe Checkout Session (start a subscription)
    billing-webhook/               Stripe events → subscriptions (entitlement source of truth)
types/database.ts                  TypeScript interfaces for the main objects
../docs/cost-model.md              Cost-to-run per user (week/month/season) + levers
../docs/analytics.md               Usage analytics + monetisation reference
../docs/continuous-learning.md     How the app learns from itself, continuously
../docs/coaching-knowledge.md      Coachcast pedagogy that grounds the reflection prompts + tags
```

## Going live

To stand up a real, hosted backend (Supabase project + functions + secrets) so
you can start using the app, follow **`docs/deploy.md`** — it's a ~15-minute
copy-paste runbook (`scripts/deploy.sh` does the heavy lifting).

## Quick start (local)

```bash
supabase start          # boots local Postgres, Auth, Storage, etc.
supabase db reset       # applies migrations/*.sql then seed.sql
supabase functions serve

# Generate fully-typed client types (optional, complements types/database.ts):
supabase gen types typescript --local > types/supabase.ts
```

Edge Function secrets:

```bash
supabase secrets set ANTHROPIC_API_KEY=...   # clean/questions/report/team-sheet
supabase secrets set OPENAI_API_KEY=...       # transcribe-audio (Whisper STT)
supabase secrets set STRIPE_SECRET_KEY=...    # create-checkout
supabase secrets set STRIPE_WEBHOOK_SECRET=... # billing-webhook (signature verification)
supabase secrets set APP_URL=...              # checkout success/cancel redirects
supabase secrets set LEARNING_CRON_SECRET=...  # run-learning (scheduled sweep auth)
# SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.
```

AI model choice is centralised in `functions/_shared/clients.ts` (`MODELS`):
high-volume work runs on **Haiku**, reader-facing reports on **Sonnet**, nothing
on Opus. Each call records its token cost to `usage_events`. See
`docs/cost-model.md`.

**Output language & house style** are centralised in `functions/_shared/voice.ts`,
appended to every generation prompt: British English by default (from
`profiles.language`, so more languages are a small change later) and no em
dashes. Any user-facing text the code emits itself (report titles, insight
prompts) is written the same way.

## Data model at a glance

`clubs → teams → players` is the org hierarchy (each team sets its playing
`format` — `3v3` … `11v11`), with `competitions` (leagues / cups) alongside. **Everything else hangs off an `event`** (training session,
match, tournament, other, coach observation or player reflection). An event carries its intent up
front — a `focus_area` (short theme), a `purpose` (the aim) and `hoping_to_see`
(a JSONB list of observable things you hope to see) — and owns its `team_sheets`
(+ `team_sheet_players`), `observations` (each phased `pre_event` / `live` /
`post_event` / `ad_hoc`), `event_attendance`, `reflections` and `reports`; match
events also own `match_details` and `match_stats`. Reflections own
`followup_questions`, which own `followup_answers`. `insights` aggregate patterns
over time and can be scoped to a user, club, team or player.

## How the backend supports each capability

### Coach Mode
A coach creates `events` of type `training_session` / `match` / `coach_observation`,
captures live `observations`, records a `coach` reflection, and generates a
`coach_reflection` report. Access is **ownership-only**: a coach sees exactly what
they created, which also lets one person own several clubs/teams and reflect on
each individually (see the Security model below).

### Player Mode
Player Mode is **independent of Coach Mode** — a player's reflection space is
entirely their own, with no link to a coach or roster. A player (role `player`)
creates their **own** `player_reflection` events and `player` reflections about
their performance, answers optional follow-up questions, and gets a
`player_report`. The player flow is personal and question-led: the player
**writes or dictates what the game was like for them** (their own account, kept
in their words); `generate-reflection-questions` then asks a few **open
reflective questions grounded in what they wrote** (for a player these are the
point, always offered — not just a brevity nudge); and the report's focus-for-next
is **drawn from the player's own answers**, never invented. `generate-report`
restates only what the player actually said — it never adds a characterisation of
the game they didn't make. Alongside the reflection the player logs their own
**game context** in `player_game_log` (independent of any coach data): the
position(s) they played, whether they `started` / were a `substitute` / a
`game_changer`, and the match details (home/away, score with a generated
win/draw/loss `result`, minutes, their goals/assists). Private to them. It runs on the same primitives as Coach Mode
(reflections, follow-ups, reports, voice profile, insights) — no extra tables. Because
the player owns their event and reflection, ownership RLS makes it private by
construction: `player` reflections are visible only to their author, and a coach
never sees them (nor the player the coach's world). Coach and player reflection
are two separate, self-contained loops.

Over time a player builds a **story of their reflections**, just like the coach's
period reports: `generate-player-summary` aggregates the player's **own**
reflections across a week / month / season into a personal summary — what keeps
showing in their game, what they keep working on, what's shifted, and the focus
they keep returning to — grounded only in what they wrote, in their voice, and
private to them (a `reports` row with `event_id` and `team_id` both null).

### Coach-developer Mode
A coach developer supports and observes coaches. They create `coach_observation`
events, record `coach_developer` reflections, and their insights are typed
`coach_development`. As club staff they can read their club’s events, teams and
players (RLS helper `is_club_staff`); anything they author stays theirs.

### Capturing notes (any time)
`observations` are atomic notes captured across the whole timeline. A
`capture_phase` marks when: `pre_event` (planning thoughts), `live` (during a
session/match), `post_event` (a quick thought right after), or `ad_hoc` (a
thought at any time, with `event_id` null). Each note stores `timestamp_seconds`
+ `match_minute`, an `input_type` (`voice_note` / `text_note` / `tag_only`), a
rich `observation_type`, `tags[]`, `sentiment` and the tactical `phase_of_play`.
Ad-hoc notes carry no event but can still be scoped to a `team_id` and/or
`player_id`. Voice notes go to the `audio-recordings` bucket and are transcribed
by `transcribe-audio`; raw notes are tidied by `clean-observation` (mirror, not
verdict). The deeper structured post-event write-up lives in `reflections`.

### Team sheet upload (optional)
Selecting from the squad list is the primary path. Snapping a team sheet is an
optional alternative — handy for bulk-adding players or working from a paper
sheet. A `team_sheets` row points at a file in the `uploads` bucket;
`process-team-sheet` extracts the roster into `team_sheet_players`, linking shirt
numbers to canonical `players`. Either way, `clean-observation` auto-attributes a
note like “Number 8 scans before receiving” to the right player by shirt number.

### Squad selection, attendance & match record
For a match, the coach picks the matchday squad straight from the team's player
list: `event_attendance` holds one row per player with a `status` (`present` /
`absent` / `injured` / `unavailable`), a `selection` (`starter` / `substitute` /
`unused_substitute`) and a lineup `position` for that match (e.g. `CM`, `LW`).
The match's shape is stored as `match_details.formation` (e.g. `4-3-3`). For
training the same table just records who turned up (`selection`/`position` null).
Matches also record results — `match_details` stores `home_away`, `formation`,
`goals_for` / `goals_against` (with a **generated** `result` of win/draw/loss),
`man_of_the_match` and notes; `match_stats` holds per-player `goals`, `assists`, `yellow_cards`,
`red_cards`, `clean_sheet` and `minutes_played` (so "who scored / assisted" falls
straight out). A match's `event.competition_id` links it to a `competitions` row
— a league or cup with an **editable** name (e.g. rename "Cup 1" to "County Cup").

### Player profile — stats & development notes
A player's profile pulls together the data already captured about them. The
`player_stats` view rolls up career totals per player — appearances, goals,
assists, yellow/red cards, clean sheets, minutes, and trainings attended — from
`match_stats` and `event_attendance` (it's a `security_invoker` view, so the
querying user's RLS applies; nothing is duplicated). Alongside it,
`player_development_notes` is a running coaching log per player — categorised
`strength` / `development_area` / `target` / `general` — kept separate from
in-session observations. The author writes them; club staff can read them.

### Closing the intent loop
`review-intent` takes the event's `hoping_to_see` list and checks each item
against the notes actually captured, writing `reflections.hoped_to_see_review`
(`showed_up` / `partly` / `not_observed`, with the note as evidence). Every
**not-observed** aim becomes a gentle, skippable follow-up — "you hoped to see X,
nothing was noted on it — did it not come up, or did you not get to look?" — so
the gap becomes part of the reflection. `generate-report` then renders a "what
you hoped to see → what showed up" section. Mirror, not verdict: it only reports
whether the notes touched each aim, never whether the team was good at it.

### Post-event reflection
`reflections` hold the `raw_transcript`, a `summary`, and JSONB lists
(`what_went_well`, `what_did_not_work`, `learning_evidence`, `action_points`,
`suggested_next_focus`). `generate-reflection-questions` reads the reflection and,
**only where it's brief or broad**, offers a light nudge to add a bit of context
(a concrete example, which player/moment, what a vague word meant) — if the
reflection is already detailed it asks nothing. Questions are optional and
always-skippable (`followup_questions`); answers land in `followup_answers`.
Any answers the coach does add are then folded back into the reflection by
`enrich-reflection`, which writes an `enriched_summary` (the original `summary`
is left untouched, and it no-ops if everything was skipped). Reflections and
notes can be captured by **text or by voice** — voice recordings go to
`audio-recordings` and `transcribe-audio` fills in the transcript / answer text.
`generate-report` prefers the `enriched_summary` when one exists.

### Report generation (per-event and period)
Reports come at several cadences (`report_type`):
- **Per-event** — `match_report` / `training_report` / `tournament_report` /
  `other_report`: `generate-report` aggregates one event’s observations +
  reflection (+ squad roster; match result and per-player stats for matches)
  into a `reports` row (`event_id` set).
- **Period** — `weekly_report` / `monthly_report` / `season_report`:
  `generate-period-report` combines *every note* from *all* of a team’s events
  across a date range (a weekly report combines that week’s training and match)
  — results (W/D/L, goals), player highlights, recurring themes and development
  threads — into a `reports` row with `event_id` null and `team_id` +
  `period_start` / `period_end` set. It reads notes **split by context** and
  reasons across them: what’s worked in training that’s now showing up in
  matches, what isn’t transferring yet, and what’s emerging only on matchday
  (the report’s "Training ↔ match" section).

Both write `content_json` + `content_markdown` (optional PDF to the `reports`
bucket). Reports are visible **only to their creator** — there is no in-app
sharing yet; to share, export the PDF and send it.

### Long-term insight tracking (and how it feeds reflection)
The notes tell the story; `update-insights` picks up the trend. It buckets each
player/team theme **by week** and, when a theme recurs across several of the
recent weeks (≥3 of the last 4), writes an `insight` carrying a `sentiment`
(concern vs progress) and a forward-looking `reflective_prompt` — e.g.
“*middle-third organisation* has come up in 3 of the last 4 weeks — how do you
plan to tackle it?” (concern), or “*scanning* has shown up in 3 of the last 4
weeks — what have you done to let them know they’ve progressed?” (progress).

These prompts don’t just sit in a list: `generate-reflection-questions` surfaces
the team’s recurring-insight prompts inside the next reflection (skippable), so
the long-term trend the notes have been telling **influences the reflection**.
Mirror, not verdict throughout — it reflects the pattern back and asks; it never
judges.

### Adapting to each coach's voice
The app learns how each coach writes and replies in *their* language, at *their*
level — so it works for a grassroots volunteer and a UEFA-badged coach alike.
`update-voice-profile` reads a coach's **own** raw notes and reflection
transcripts and distils a `coach_voice_profiles` row: a `style_summary`, a
`glossary` of the terms they actually use, and a `language_level` (plain /
developing / technical — a read on their *language*, never their ability). A
shared helper (`_shared/voice.ts`) turns that profile into a prompt instruction
that every generating function appends, so `clean-observation`,
`generate-reflection-questions`, `review-intent`, `enrich-reflection`,
`generate-report` and `generate-period-report` all write back in the coach's
voice. Notably, `clean-observation` now *preserves* the coach's own terminology
rather than upgrading it to textbook language. This is "mirror, not verdict"
taken all the way — the app mirrors not just what a coach saw, but how they say it.

### Grounded in real coaching pedagogy
The reflection isn't generic. Migration `0006` seeds a curated knowledge base
distilled from England Football's *Coachcast* (paraphrased, non-verbatim): ~50
coaching **frameworks**, a grouped bank of open **reflective prompts** (plus a
10-10-10 cadence), and a canonical **tag taxonomy**. `generate-reflection-questions`
draws coach nudges from the prompt bank (re-voiced through the coach's own voice
profile, still only where the reflection is thin), and `clean-observation` snaps
note tags to the taxonomy so trend detection speaks one consistent coaching
language. Reference data: every coach reads it, only an admin edits it. Detail in
`docs/coaching-knowledge.md`.

### Learning from itself, continuously
The app improves from its own accumulating data without being asked. It learns a
coach's **voice** (`update-voice-profile`), the recurring **patterns** in their
notes (`update-insights`, whose prompts flow back into the next reflection), and
even from its **own behaviour** — `generate-reflection-questions` steers away from
question kinds the user keeps skipping. Migration `0005` makes these run
**continuously**: triggers mark a user's learning "pending" on every new note or
reflection (`learning_state`), a scheduled sweep (`run-learning`, driven by
`pg_cron`) refreshes only the users who changed, and every pass is written to a
visible `learning_runs` ledger (surfaced in the dashboard via
`analytics_learning_recent`). Full detail in `docs/continuous-learning.md`.

### Usage analytics & monetisation
For monitoring usage (and, in future, selling the product), every meaningful
action appends a row to `usage_events` — AI calls and transcriptions with their
**cost stored per event**, plus engagement events written automatically by
triggers. `is_admin()`-gated analytics views roll it up (active users, cost per
feature, cost per user, MRR). To charge, `plans` + `subscriptions` describe what a
user pays and their entitlement (`has_active_subscription()`); `create-checkout`
starts a Stripe Checkout, and `billing-webhook` (verified by Stripe signature) is
the **only** writer of paid status. Full reference in `docs/analytics.md`; the
per-user cost breakdown behind the model tiering is in `docs/cost-model.md`.

## Security model (RLS)

At this stage access is **ownership-only** — each user sees and edits only what
they created, with **no in-app sharing** between users. RLS is enabled on every
table; SECURITY DEFINER helpers (`can_access_event()`, `can_access_report()`)
avoid recursive lookups.

- Users read/write their **own** records — clubs, teams, players, competitions,
  events, observations, reflections, reports, insights, everything.
- Because access is purely by ownership, **one person can own many clubs and
  teams** (a coach at two clubs, a player at two teams) and reflect on each
  individually — nothing is tied to a single "home" club. `profiles.club_id` is
  just an optional default.
- **Player** reflections and their `player_game_log` are private to the player;
  a coach never sees them (and vice-versa).
- **Reports** are visible only to their creator. **To share, export the PDF** —
  there is no in-app sharing. (`report_access` is kept, dormant, so per-report
  sharing can be switched on later without a migration.)
- **Storage** objects are namespaced under `<auth.uid()>/…`; each user can manage
  only their own folder in every bucket.
