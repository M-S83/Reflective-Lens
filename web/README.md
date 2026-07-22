# Reflective Lens — web app

A mobile-first, installable PWA for the coach reflection loop, wired to the
Supabase backend in `../supabase`. React + Vite + TypeScript, no heavy UI deps.

## Run it

```bash
cd web
cp .env.example .env      # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
                          # (Supabase → Project Settings → API; anon key only)
npm install
npm run dev               # http://localhost:5173
```

The backend must be live first — see `../docs/deploy.md`.

## Build / preview

```bash
npm run build             # tsc typecheck + vite build → dist/
npm run preview           # serve the production build locally
```

## What's here (the core coach loop)

- **Sign in** — email or mobile, one-time code (Supabase Auth). New details create
  an account. Prompts to install the PWA and allow the mic.
- **Teams** — add clubs/teams (with playing format) and squads. One account can own
  several clubs/teams.
- **New session** — training / match / tournament / other, with its intent
  (focus, purpose, "hoping to see").
- **Event** — three tabs:
  - **Notes** — capture by text or **voice** (recorded → uploaded → transcribed →
    tidied & tagged), across pre / live / post / ad-hoc phases.
  - **Reflect** — write or dictate your reflection; get optional, skippable
    context questions (grounded in FA/Coachcast pedagogy, re-voiced to you); weave
    your answers back in.
  - **Report** — generate a "mirror, not verdict" report from your notes and
    reflection.

### Player Mode (independent, private)

Toggle **Player mode** from the top bar — a separate, self-owned space (coach and
player reflections never mix):

- **Log a game** — match or training, with your own context: position(s), how you
  featured (started / came on / game changer), home/away, score, minutes, your
  goals/assists.
- **Reflect** — write or dictate what the game was like for you; get optional open
  questions drawn from your own account (including anything your coach said and
  what you made of it); draw out your focus for next.
- **My story** — weekly / monthly / season summaries of your own reflections.

## Structure

```
src/
  lib/         supabase client, typed data layer (db.ts), types, audio recorder
  auth/        session provider
  components/  UI primitives, record button, markdown
  screens/     SignIn, Home, Teams, TeamDetail, NewEvent, EventDetail
```

Player Mode, period reports, squad selection/match stats, and the admin dashboard
exist in the backend and are the natural next screens to add.
