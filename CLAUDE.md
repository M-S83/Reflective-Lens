# CLAUDE.md — Reflective Lens

Project context for any Claude Code session working in this repo. Read this first.

## What this is

**Reflective Lens** is a reflection app for football coaches and players.
Tagline: _"See your coaching clearly."_ It helps coaches and players reflect on
sessions and games in their own words, and reflects them back. It never grades.

> **Core principle: mirror, not verdict.** The app organises and reflects what the
> user actually said. It never judges, grades, or teaches at them. If any output
> reads as instruction or a verdict, it has crossed the line.

Two independent, private journeys on one account: **Coach** and **Player**. Their
reflections never mix.

(This repo is Reflective Lens only. Everything under `supabase/`, `web/`, `docs/`,
`types/` is the app.)

## Where things are

- `supabase/migrations/` — Postgres schema + RLS, migrations `0001`–`0015`.
  Validated on PostgreSQL 16 (stubbed `auth`/`storage` schemas + a `test.uid` GUC).
- `supabase/functions/` — Deno/TypeScript edge functions. Shared helpers in
  `_shared/` (`clients.ts` = model tiering + Claude/usage helpers, `voice.ts` =
  house-style + language + coach voice, `knowledge.ts` = FA prompt/tag grounding,
  `principles.ts` = the mirror-not-verdict rule every prompt shares, `names.ts` =
  under-18 name privacy, `json.ts`, `markdown.ts`, `crypto.ts`).
- `supabase/functions/_tests/` — the verification suite. `*.mjs` are plain Node
  checks (`node <file>`); `*-db.sh` stand up a throwaway PG16 from
  `_tests/bootstrap.sql` and assert against real migrations + RLS.
- `web/` — React + Vite + TypeScript PWA (the app). `npm run build` must pass.
- `docs/` — `deploy.md`, `cost-model.md`, `analytics.md`, `continuous-learning.md`,
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
- **Voice or text everywhere** — notes, reflections, and follow-up answers can all
  be a voice note or typed.
- **Ownership-only access.** Users see only what they created. No in-app sharing
  (share by PDF export). One person can own several clubs/teams.
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
