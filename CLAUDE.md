# CLAUDE.md — Reflective Lens

Project context for any Claude Code session working in this repo. Read this first.

## What this is

**Reflective Lens** is a reflection app for football coaches and players.
Tagline: _"See your coaching clearly."_ It helps coaches and players reflect on
sessions and games in their own words, and reflects them back. It never grades.

> **Core principle: mirror, not verdict.** The app organises and reflects what the
> user actually said. It never judges, grades, or teaches at them. If any output
> reads as instruction or a verdict, it has crossed the line.

**One journey: the coach.** The player journey was withdrawn (migration `0021`).
Its screens, the role chooser, the mode switch and `generate-player-summary` are
gone; the dormant tables and enum values are left in place because dropping them
is irreversible and buys nothing. "Player" now means only a member of a coach's
squad, never an account.

(This repo is Reflective Lens only. Everything under `supabase/`, `web/`, `docs/`,
`types/` is the app.)

## Where things are

- `supabase/migrations/` — Postgres schema + RLS, migrations `0001`-`0028`.
  Validated on PostgreSQL 16 (stubbed `auth`/`storage` schemas + a `test.uid` GUC).
- `supabase/functions/` — Deno/TypeScript edge functions. Shared helpers in
  `_shared/` (`clients.ts` = model tiering + Claude/usage helpers, `voice.ts` =
  house-style + language + coach voice, `knowledge.ts` = FA prompt/tag grounding,
  `principles.ts` = the mirror-not-verdict rule every prompt shares, `names.ts` =
  under-18 name privacy, `email.ts` = transactional email via Resend, `json.ts`,
  `markdown.ts`, `crypto.ts`).
- `supabase/functions/_tests/` — the verification suite. `*.mjs` are plain Node
  checks (`node <file>`); `*-db.sh` stand up a throwaway PG16 from
  `_tests/bootstrap.sql` and assert against real migrations + RLS.
- `web/` — React + Vite + TypeScript PWA (the app). `npm run build` must pass.
- `docs/` — `beta-launch.md` (the ordered checklist to go live), `deploy.md`, `accounts.md`, `cost-model.md`, `analytics.md`, `continuous-learning.md`,
  `coaching-knowledge.md`, `lovable-prompt.md`, `system-audit.md`, `staging-run.md`
  (+ `staging-seed.sql`), `handoff-to-cowork.md` (inventory of the coach subsystem
  work and what is still to deploy).
- `web/public/walkthrough.html` — self-contained client walkthrough (also a PDF).
- `README.md` — product overview (non-technical, shareable).

## Conventions (important, keep consistent)

- **British English. No em dashes or en dashes** anywhere user-facing (use commas,
  full stops, colons, brackets). Enforced for AI output in `_shared/voice.ts`
  (house style), and applies to UI microcopy and docs too.
- **"Game changer"** is the word for a substitute who comes off the bench. Never
  "sub" or "came on".
- **Signing in costs no email.** Email and password: one confirmation at sign-up
  and nothing after. It was passwordless, and every sign-in sent a magic link,
  which spent the project's hourly allowance on people simply returning. A reset
  link must always END in a password (`App.tsx` routes recovery to a set-password
  screen), or it becomes an email per visit again. `Account` can set one with no
  email at all, which is the only route in for accounts made before passwords.
  Held by `_tests/sign-in-cost.mjs`.
- **One account per address.** Two accounts existed for `coachmsmith19@gmail.com`
  and `Coachmsmith19@gmail.com`: one inbox, two sets of sessions. Every address
  the app sends is lowercased (`web/src/lib/email.ts`), and `0024` makes
  `grant_plan` / `revoke_plan` RAISE on a case-pair rather than let `select into`
  pick a row at random. `admin_duplicate_emails` lists any that exist.
- **Voice or text everywhere** — notes, reflections, and follow-up answers can all
  be a voice note or typed.
- **Patterns never cross a session boundary.** A theme belongs to the team AND
  the kind of session it was noted in: a goalkeeping session's findings are not
  the team's training picture. Period reports are already filtered by `team_id`;
  `0018` adds `events.custom_type` so a coach names an "other" session, and
  `generate-period-report` groups by it. The training-to-match comparison is the
  ONE cross-context link that is always legitimate. Anything else must be
  supported by the coach's own notes. This is the rule the insights rebuild has
  to honour (see `_tests/session-scope.mjs`).
- **Views run as their caller** (migration `0025`). Every `analytics_*` and
  `admin_*` view gates itself with `is_admin()` in its body, which worked and was
  the ONLY guard: one view added later without the where clause and there was
  nothing underneath, because a view reads past RLS by default. They are all
  `security_invoker = true` now, so the tables' own policies apply as well and a
  forgotten gate leaks nothing. `profiles` gained an admin read to make that
  possible (it was self-only); writing is still self-only and `0016`'s trigger
  still refuses self-granted admin.
- **Ownership-only access.** Users see only what they created. No in-app sharing
  (share by PDF export). One person can own several clubs/teams. The owner is the
  one exception and only for COUNTING: `admin_activity()` (`0026`) returns how
  many sessions and notes a coach has and when they were last in, never a word of
  content, because the Owner dashboard has to be able to see who is using the app.
- **A new function is callable by everyone until you say otherwise** (migration
  `0027`). Postgres grants `EXECUTE` to `PUBLIC` by default and Supabase publishes
  every function in `public` at `/rest/v1/rpc/<name>`, behind the anon key that
  ships inside the frontend bundle. Nobody wrote a grant opening `learning_due()`
  to the world; the default did, and it listed the user ids of the whole user
  base. `clear_learning_pending(target, which)` was worse: any signed-in coach
  could write to any other coach's row. So a new `SECURITY DEFINER` function ends
  with an explicit `revoke execute ... from public, anon, authenticated` and a
  grant to exactly the role that calls it. The exception is a function named
  inside an RLS policy (`is_admin`, `active_roles`, `has_role`,
  `has_active_subscription`, `can_access_event`, `can_access_report`): a policy is
  evaluated as the querying role, so revoking those refuses every read that
  touches them. `who-may-call-db.sh` holds both halves.
- **Three kinds of account, one mechanism** (migration `0022`). `active_roles()`
  grants access when a subscription is `active`, or `trialing` and unexpired, and
  never asks why. So beta is `coach_beta` trialing with an end date, complimentary
  is `coach_comp` active with none, and paid is the monthly or annual plan. Both
  granted plans are `is_active = false` (off the catalogue, not buyable) and
  priced at 0 (never revenue); access does not read `is_active`, and
  `account-kinds-db.sh` proves it. A granted plan is `is_active = false`, and
  `0004`'s catalogue policy hid it from the coach on it, so the client's
  `plan:plans(...)` embed came back null and every beta tester landed read-only.
  `0023` lets you read a plan you hold. The lesson is in the test now: prove the
  RLS path the app uses, not only the `SECURITY DEFINER` function. Hand them out with `grant_plan(email, plan,
  days)` / `revoke_plan(email, plan)`, which raise unless `is_admin()`; the Owner
  dashboard drives them. Granting cancels the coach's other trials so there is
  one clock. Never nag a comped coach: the Account copy is per kind, and a test
  asserts the complimentary line neither counts down nor sells.
- **Admin lives in `user_roles`, never `profiles.role`** (migration `0016`). A
  user can update their own profile row, so a privilege sitting on it was one
  `update` away from being self-granted. `profiles.role` is now only the journey
  (coach or player) and raises if set to `admin`. Grant admin by inserting into
  `user_roles`; check it with `is_admin()` / `has_role()` as before.
- **Yellow is the coach, and nothing else is ever yellow.** The design is Chalk
  (a tactics board, not a pitch): one theme, slate, no light variant. `--yours`
  marks what the coach wrote or said and marks nothing else, so the difference
  between their words and the app's is visible before a word is read. That is
  what makes mirror-not-verdict structural rather than a promise, and it is why
  the answer is no when a button wants that colour. `--grass` is chalk blue and
  means "you can tap this"; `--muted` is the app talking. No shadows anywhere: a
  board has no depth, regions are divided by a drawn line, and that one rule is
  most of what stops Chalk collapsing into an ordinary dark theme. The mark is
  the offset, two circles out of true, one filled (the coach) and one drawn
  (what came back). Reasoning, the rejected alternatives and what would ruin it
  are in `docs/brand-direction.md`. Type is still Georgia and the system sans,
  deliberately not done yet.
- **Output language** comes from `profiles.language` (default `en-GB`); more
  languages later = add labels in `_shared/voice.ts` + a picker. UI is English now.

## AI / cost

- The `model_config` table (migration `0010`) is authoritative at runtime and can
  be retuned without a redeploy. `_shared/clients.ts` `MODELS` is the fallback and
  must stay in sync with the `0010` seed (checked by `_tests/f18-model-config.mjs`).
  Either way: Haiku for high-volume work, Sonnet for reader-facing reports, never
  Opus. Each call logs token cost to `usage_events`. See `docs/cost-model.md`.
- A per-user cost guard (migration `0011`) can force the cheap tier when a user is
  over budget.
- The coach glossary (`coach_glossary`, `0017`) reaches every prompt through
  `_shared/voice.ts`. It is capped (40 terms, 1200 chars) because it is prepended
  to every AI call for that coach. It explains the coach's own words; it never
  licenses the model to assess their usage.

## Build & verify

- Frontend: `cd web && npm install && npm run build` (tsc + vite). Must be clean.
- Edge functions: run the checks in `supabase/functions/_tests/`. Node checks are
  `for f in supabase/functions/_tests/*.mjs; do node "$f"; done`; the DB checks are
  `bash supabase/functions/_tests/<name>-db.sh` and need PostgreSQL 16 plus `sudo`.
  Each prints `ALL PASS`.
- Migrations: validate on a throwaway PG16 before committing schema changes. The
  `*-db.sh` scripts already do this (`_tests/bootstrap.sql` stubs `auth`/`storage`
  and wires `auth.uid()` to the `test.uid` GUC, so RLS really applies). Do not
  assume; run it.
- Do not commit `node_modules`, `dist`, `.env`, or `*.tsbuildinfo` (gitignored).

## Deploy

See `docs/deploy.md`. `scripts/deploy.sh` pushes migrations, sets function
secrets, and deploys all functions to a linked Supabase project. `supabase/go-live.sql`
grants admin + schedules the learning sweep.

## Working branch

`claude/nordic-updates-reflective-lens-vl99wg`. Develop here; commit with clear
messages; push with `git push -u origin <branch>`. Do not open a PR unless asked.

Note: some earlier work was committed to the unrelated `M-S83/Nordic` repo by
mistake and has since been cherry-picked here. This repo is the only source of
truth. Do not push app changes to `Nordic`.
