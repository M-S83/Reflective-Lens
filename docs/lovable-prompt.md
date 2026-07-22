# Lovable build prompt — Reflective Lens frontend

Use this to build the **Reflective Lens** frontend in [Lovable](https://lovable.dev)
against the existing Supabase backend (schema, RLS, Auth, Storage and Edge
Functions in `../supabase`).

## Before you paste the prompt

1. **Connect Lovable to your Supabase project first** (Lovable → Settings →
   Supabase integration). This makes Lovable build against the real schema
   instead of inventing its own.
2. **Do not let Lovable recreate the schema.** The migrations in
   `supabase/migrations/` are the source of truth. The prompt instructs it to
   read/write only through existing tables, policies and buckets.
3. **Keep field names aligned with the schema.** Point Lovable at
   `types/database.ts` (or paste it), and have it run
   `supabase gen types typescript` against the project so generated queries
   match the real columns.
4. **Build mode-by-mode** (Coach first). Lovable does better with one flow at a
   time than the whole app in one shot.

## The prompt

> Build a mobile-first web app called **Reflective Lens** (tagline: "see your
> coaching clearly") — a football **coaching and
> player reflection** tool for analysing your **own team** and recording notes.
> The Supabase backend (Postgres schema, RLS, Auth, Storage, Edge Functions)
> already exists and is connected — **do not create or modify tables, policies,
> or buckets; only read/write through the existing ones.**
>
> **Product principle: "Mirror, not verdict."** The app helps users reflect,
> organise and spot patterns — it never judges them. Keep all AI-facing copy
> neutral and curious, never evaluative. It also mirrors the coach's **own voice**:
> `update-voice-profile` learns each coach's language from their writing, and every
> AI response comes back in their words and at their level (grassroots → badged),
> so never impose textbook jargon — reflect how the coach actually speaks.
>
> **Auth:** Supabase Auth — users sign in with **email and/or mobile number**
> (email magic-link/OTP and phone SMS OTP; both enabled). On signup a `profiles`
> row is auto-created (with `email`, `phone`, `role`). Route the user by
> `profiles.role`: `coach`, `player`, `coach_developer`, `admin`. Let users pick
> their role + optional default club during onboarding.
>
> **Installable app (PWA):** build the app as an installable PWA (web app
> manifest + icon + service worker). Right after signup, show a step that helps
> the user **add the app to their home screen** on phone/iPad — trigger the
> `beforeinstallprompt` flow on Android/Chrome, and show clear "Add to Home
> Screen" instructions (Share → Add to Home Screen) on iOS/Safari. Use the
> Reflective Lens mark as the icon.
>
> **Microphone:** recording live notes, reflections and answers needs mic access
> — request the microphone permission at the moment the user first taps record
> (getUserMedia), with a friendly explainer, and fall back to text if declined.
>
> **Access & sharing (important):** access is **ownership-only** — a user sees and
> edits ONLY what they created; there is **no in-app sharing** between users. To
> share a report, the user **exports the PDF** and sends it themselves. A user can
> own **multiple clubs and teams** — support "add another club / team" and let
> them switch between them and reflect on each **individually** (coaches at more
> than one club, players at more than one team). Never build UI that exposes one
> user's data to another.
>
> **Roles / modes (driven by role):**
> - **Coach Mode** — manage clubs/teams/players (each team requires a playing
>   **format**: `3v3` / `5v5` / `6v6` / `7v7` / `9v9` / `11v11`, on `teams.format`);
>   create events — **match / training / tournament / other** (plus
>   `coach_observation`); capture live
>   observations on their own squad; write a coach reflection; generate a report.
> - **Player Mode** — a self-contained, **independent** reflection space (no
>   coach/roster link). It's personal and question-led: the player (1) writes or
>   dictates **what the game was like for them** (their own account, in their
>   words) and logs their own **game context** in `player_game_log` — position(s)
>   played, whether they `started` / `substitute` / `game_changer`, and match
>   details (home/away, score → generated result, minutes, their goals/assists);
>   (2) answers a few **open reflective questions** the app draws from
>   what they wrote (`generate-reflection-questions` — for a player these are the
>   point, always offered), and (3) gets a **player report** whose focus-for-next
>   is drawn from **their own answers**. Never editorialise or add analysis they
>   didn't raise. A player only sees their own data; a coach never sees it.
>   Over time the player also gets **weekly / monthly / season summaries of their
>   own reflections** via `generate-player-summary` (their equivalent of the
>   coach's period reports) — the story of what keeps showing, what they keep
>   working on, and what's shifted — private to them.
> - **Coach-developer Mode** — create `coach_observation` events to observe and
>   support coaches; record `coach_developer` reflections; their insights track
>   coach development over time.
>
> **Core screens:**
> 1. **Home / dashboard** — recent events, quick "Start live capture", recent
>    insights.
> 2. **Event list + create event** — the event **type** is one of **match /
>    training / tournament / other** (`event_type`: `match` / `training_session`
>    / `tournament` / `other`). Fields: title, type, date, opposition,
>    venue, team, and its **intent**: a `focus_area` (short theme), a `purpose`
>    (the aim of the session), and `hoping_to_see` (a list of observable things
>    you hope to see — render as add-able bullets). Status `draft → live →
>    completed`. For a match,
>    also pick a **competition** (a `competitions` row — league or cup, with
>    editable names, managed in team settings) and set **home / away / neutral**.
> 2b. **Squad selection / attendance** — pick the matchday squad from the team's
>    player list: mark each **starter** / **substitute** / **unused_substitute**
>    (`event_attendance.selection`), give starters a lineup **position** (e.g.
>    `CM`, `LW`, in `event_attendance.position`), and pick a **formation** (e.g.
>    `4-3-3`, stored in `match_details.formation`). Availability is `status`
>    (`present` / `absent` / `injured` / `unavailable`). For training, just tick
>    who turned up (selection/position left null).
> 2c. **Match record** (match events) — enter the score (`goals_for` /
>    `goals_against`; `result` win/draw/loss is derived automatically), the
>    formation, pick **man of the match**, and per player log goals, assists,
>    yellow/red cards, clean sheet and minutes (`match_details` + `match_stats`).
> 3. **Note capture** (the centrepiece) — an `observation` is a note that can be
>    taken at any point, marked by `capture_phase`: `pre_event` (planning notes
>    before training/a match), `live` (rapid-fire during it), `post_event` (a
>    quick thought right after), or `ad_hoc` (a thought any time, with no event —
>    optionally scoped to a team/player). Capture as a big record button (voice),
>    a text field, or quick tag chips. Each note stores match minute, observation
>    type, subject type (player/team/coach/unit), optional shirt number, tags,
>    sentiment (positive/concern/neutral) and tactical phase of play. Voice notes
>    upload to `audio-recordings`. Show live notes as a timeline; surface a
>    quick "capture a thought" entry point everywhere for ad-hoc notes — which,
>    like any note, can be **voice or text** (voice → transcribed just the same).
> 4. **Team sheet upload (optional)** — squad selection above is the main path;
>    this is an optional alternative for bulk-adding players or a paper sheet.
>    Upload an image/PDF to the `uploads` bucket (or enter manually); show
>    extracted players (shirt number → name) so observations auto-attribute by
>    shirt number.
> 5. **Post-event reflection** — record a reflection **by text or by voice**
>    (voice → `audio-recordings` bucket → `transcribe-audio` fills the
>    transcript), with structured sections: what went well, what didn't work,
>    learning evidence, action points, suggested next focus. Then, **only where
>    the reflection is brief or broad**, show a light nudge (1–3 **optional,
>    always-skippable** questions) inviting a bit more context — a concrete
>    example, which player/moment, what a vague word meant. If it's already
>    detailed, show none. Answers can also be text or voice. When the coach adds
>    any context, call `enrich-reflection` to fold it back into the reflection
>    (shown as `enriched_summary`); skipping is always fine and changes nothing.
>    The nudge questions are grounded in a curated England-Football coach-reflection
>    bank (`reflection_prompts`) yet re-voiced to the coach — you don't build these,
>    the function does. Optionally offer the **10-10-10 cadence**: the three
>    `reflection_prompts` rows where `cadence` is set (`10m`/`10h`/`10d`) can be
>    scheduled as light reflection touch-points 10 minutes, 10 hours and 10 days
>    after an event.
> 5b. **What you hoped to see** — call `review-intent`, then show each
>    `hoping_to_see` item with a ✓ showed_up / ~ partly / ✗ not_observed status
>    and its evidence note (`reflections.hoped_to_see_review`). Each not-observed
>    item also appears as a skippable "why wasn't this seen?" follow-up question.
> 6. **Reports** — generated at several cadences: per-event `training_report` /
>    `match_report` (via `generate-report`, `event_id` set), and period
>    `weekly_report` / `monthly_report` / `season_report` (via
>    `generate-period-report` with `team_id` + `period_start`/`period_end`; a
>    weekly report combines that week's training and match). Period reports read
>    every note across the range, split by context, and compare training vs match
>    (what's transferring, what isn't) — surfaced in a "Training ↔ match" section.
>    View
>    `content_markdown` rendered nicely + optional PDF from the `reports` bucket.
>    Reports are **private to their creator**; there's no in-app sharing yet —
>    sharing is by **PDF export** only.
> 7. **Insights** — long-term pattern cards from `update-insights`, which buckets
>    themes by week and flags anything recurring in ≥3 of the last 4 weeks with a
>    `sentiment` (concern/progress) and a `reflective_prompt`. Show the prompt on
>    the card (e.g. "come up 3 of the last 4 weeks — how will you tackle it?").
>    These same prompts also appear inside the next reflection's follow-ups, so
>    the trend influences reflection — surface them there too.
> 8. **Player profile** — per player, show accumulated stats from the
>    `player_stats` view (appearances, goals, assists, cards, clean sheets,
>    minutes, trainings attended) and a running development log
>    (`player_development_notes`, categorised strength / development_area /
>    target / general). Do not re-enter stats — they roll up from match data.
> 9. **Subscription / plans** — read the `plans` table (public catalogue) and show
>    the plans for the user's role (`coach_monthly` / `coach_season`, or
>    `player_monthly` / `player_season`; `free` is the trial). "Subscribe" calls
>    `create-checkout` with the `plan_id` and redirects to the returned Stripe
>    URL. Show current status from the user's `subscriptions` row; gate paid
>    features on `has_active_subscription()` (free trial → soft paywall). Never
>    write subscription status from the client — Stripe's webhook owns it.
> 10. **Admin analytics dashboard** — a **hidden link**: a usage-monitoring view
>    for the product owner only. It must NOT appear in any nav, menu, footer, or
>    profile — no visible entry point anywhere in the app. It lives at one
>    unlisted, hard-to-guess route (e.g. `/studio`, not `/admin`) reachable only
>    by typing the URL. Gate it three ways, belt-and-braces: (a) the route redirects
>    away unless `profiles.role = 'admin'`; (b) nothing links to it; (c) it reads
>    entirely from the `analytics_*` views, which **return zero rows to a
>    non-admin** — so even if someone finds the URL, the page shows nothing.
>    Show: the `analytics_overview` snapshot (total
>    users, 7/30-day actives, 30-day provider cost, reflections & reports,
>    paying/trialing) as headline cards; a DAU line chart from
>    `analytics_daily_active_users`; a feature table from `analytics_feature_usage`
>    (uses, users, **cost per feature**); a daily cost split from
>    `analytics_cost_daily` (AI vs transcription); per-user cost from
>    `analytics_user_cost_monthly`; **MRR** from `analytics_mrr`; and **what the
>    app has been learning** from `analytics_learning_recent` (voice/insight
>    passes per day). This is the "how is it used / what does it cost / what does
>    it earn / how is it improving" screen for a future sale — kept off the map,
>    for the owner's eyes only.
>
> **Edge Functions to call (already deployed):** `transcribe-audio`,
> `process-team-sheet`, `clean-observation`, `generate-reflection-questions`,
> `review-intent`, `enrich-reflection`, `generate-report`,
> `generate-period-report`, `generate-player-summary`, `update-insights`,
> `update-voice-profile`, `run-learning` (scheduled sweep — not called from the
> UI), `create-checkout`, `billing-webhook` (Stripe → server). The app learns
> continuously on its own (see `docs/continuous-learning.md`); you may also call
> `update-insights` + `update-voice-profile` opportunistically right after a
> reflection is saved, and can show a small "what your Lens has picked up lately"
> note from the user's own `learning_runs` rows.
> Invoke via
> `supabase.functions.invoke(...)` and reflect their results in the UI (e.g.
> show the cleaned note after `clean-observation`, or the enriched summary after
> `enrich-reflection`).
>
> **Storage buckets:** `audio-recordings`, `uploads`, `reports`. Upload files
> under a path prefixed with the user's id (`<user_id>/...`) — RLS requires this.
>
> **Design:** clean, calm, sporty, mobile-first. Reflective and supportive tone,
> not analytical/scoreboard-like. Fast one-handed live capture (big tap targets).
> Light + dark mode. Follow the **Design language** below exactly.
>
> Build the auth flow, role-based routing, and the Coach Mode flow end-to-end
> first (event → live capture → reflection → report), then Player and
> Coach-developer modes.

## Design language

The look to build toward (taken from the workflow mockups — the client likes it).
It's a calm, Scandinavian "pitch" aesthetic: reflective, not scoreboard.

**Palette** — a green-biased neutral ground with one muted pitch-green accent.
Design both themes; the viewer's toggle stamps `data-theme` on the root, which
must win over `prefers-color-scheme`.

| Token | Light | Dark |
|---|---|---|
| `--bg` (page) | `#EDF1EF` | `#0C120F` |
| `--surface` (cards) | `#FFFFFF` | `#141C18` |
| `--surface-2` (insets) | `#F5F8F6` | `#101712` |
| `--ink` (text) | `#14201B` | `#E7EEEA` |
| `--muted` | `#56675E` | `#9AABA1` |
| `--line` (borders) | `#DBE3DE` | `#24302A` |
| `--accent` (pitch green) | `#2F6F5B` | `#55A587` |
| `--accent-soft` (chips) | `#E1EDE7` | `#17241E` |

Semantic colours are separate from the accent: **positive** `#38875F`/`#5DB88C`,
**concern** `#B5842A`/`#D6A748`, **neutral** `#5C7385`/`#8AA0B0`. Use ▲/▼ or ✓/~/✗
marks alongside colour, never colour alone.

**Type** — three roles:
- **Display / headings:** a serif (Georgia stack) — carries the reflective voice.
- **Body / UI:** system sans (`system-ui`).
- **Data & micro-labels:** `ui-monospace` — for table/field identifiers, minutes,
  scores, stats, and uppercase eyebrow labels (`letter-spacing: ~.1em`).

**Components & feel:**
- Rounded cards (`~12–14px`) on the surface colour with a soft shadow and a hairline border.
- **Pill chips** for statuses/tags (`starter`, `live`, `4-3-3`, sentiment) — mono, small, `--accent-soft` fill.
- Uppercase mono eyebrow labels above groups (e.g. `HOPING TO SEE`, `PER PLAYER`).
- Big primary buttons in solid `--accent`; ghost buttons are bordered/transparent.
- Generous spacing, `gap`-based layout, `tabular-nums` wherever digits align.
- Mobile-first, one-handed: large tap targets, a persistent "capture a thought" affordance.
- Respect `prefers-reduced-motion`; keep motion subtle (small hover lifts at most).

The published mockups are the reference for spacing, hierarchy and tone — match them.

## Reference

- Schema & enums: `supabase/migrations/0001_initial_schema.sql`
- RLS rules: `supabase/migrations/0002_rls_policies.sql`
- Buckets: `supabase/migrations/0003_storage_buckets.sql`
- TypeScript object shapes: `types/database.ts`
- Backend overview & per-mode notes: `supabase/README.md`
