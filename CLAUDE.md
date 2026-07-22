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

- `supabase/migrations/` — Postgres schema + RLS, migrations `0001`–`0007`.
  Validated on PostgreSQL 16 (stubbed `auth`/`storage` schemas + a `test.uid` GUC).
- `supabase/functions/` — Deno/TypeScript edge functions. Shared helpers in
  `_shared/` (`clients.ts` = model tiering + Claude/usage helpers, `voice.ts` =
  house-style + language + coach voice, `knowledge.ts` = FA prompt/tag grounding).
- `web/` — React + Vite + TypeScript PWA (the app). `npm run build` must pass.
- `docs/` — `deploy.md`, `cost-model.md`, `analytics.md`, `continuous-learning.md`,
  `coaching-knowledge.md`, `lovable-prompt.md`.
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

- Model choice is centralised in `_shared/clients.ts` `MODELS`: Haiku for
  high-volume work, Sonnet for reader-facing reports, never Opus. Each call logs
  token cost to `usage_events`. See `docs/cost-model.md`.

## Build & verify

- Frontend: `cd web && npm install && npm run build` (tsc + vite). Must be clean.
- Migrations: validate on a throwaway PG16 before committing schema changes
  (create a cluster, apply `bootstrap` stubs + `000*.sql`, check RLS with the
  `test.uid` GUC). Do not assume; run it.
- Do not commit `node_modules`, `dist`, `.env`, or `*.tsbuildinfo` (gitignored).

## Deploy

See `docs/deploy.md`. `scripts/deploy.sh` pushes migrations, sets function
secrets, and deploys all functions to a linked Supabase project. `supabase/go-live.sql`
grants admin + schedules the learning sweep.

## Working branch

`claude/football-coaching-backend-ami7cf`. Develop here; commit with clear
messages; push with `git push -u origin <branch>`. Do not open a PR unless asked.
