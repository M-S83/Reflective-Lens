# Staging run — coach subsystem end-to-end

One realistic scenario, run whole against a staging Supabase, to confirm the
coach subsystem works end to end and that quality did not slip on the prompt/
token changes from the consolidation tranche (F14, F24, F25, F26).

The scenario (seeded by `docs/staging-seed.sql`): a U12 team, a **training**
session on "playing out from the back" with one aim deliberately left un-noted,
and a **match** the same month that tests whether it carried into a game. Two
players are called "Jack" so the first-name rule has to disambiguate.

---

## 1. Deploy (in this order)

Prereqs: a staging Supabase project, the Supabase CLI logged in, and a `.env`
filled from `.env.example` (at minimum `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`LEARNING_CRON_SECRET`, `PURGE_CRON_SECRET`, `APP_URL`; Stripe optional).

```bash
supabase link --project-ref <STAGING_REF>

# a) schema: applies migrations 0001–0015
supabase db push

# b) secrets + c) all edge functions (JWT-protected loop, then the cron/webhook
#    group with --no-verify-jwt). scripts/deploy.sh does b) and c) from .env:
./scripts/deploy.sh
```

For this run you only exercise `generate-report` and `generate-period-report`
(plus, optionally, `generate-reflection-questions` and `enrich-reflection`), but
`deploy.sh` deploys the whole set. You do **not** need `go-live.sql` or the cron
schedules for the eyeball — skip them unless you also want to test the sweeps.

## 2. Create the coach and seed the scenario

1. In the app (or Supabase Auth), **sign up** as the coach with an email you
   control. This creates the `auth.users` row + profile.
2. Open `docs/staging-seed.sql`, set `v_email` to that address, and run it in the
   staging **SQL editor**. It is re-runnable (drops its own club first).
3. Grab the ids you'll need:

```sql
select id, event_type, title, event_date from public.events
  where team_id in (select id from public.teams where name = 'U12 Lions')
  order by event_date;              -- TRAINING id (07-07), MATCH id (07-14)
select id from public.teams where name = 'U12 Lions';   -- TEAM id
```

## 3. Get a coach JWT (to call the functions)

The report functions read as the caller (RLS), so you need the coach's token.
Easiest: sign in on the app, open devtools → Application → Local Storage → copy
`access_token` from the `sb-<ref>-auth-token` entry. Export it:

```bash
export SUPABASE_URL="https://<STAGING_REF>.supabase.co"
export ANON="<STAGING_ANON_KEY>"
export JWT="<coach access_token>"
```

## 4. Generate the two reports

```bash
# A) Per-session (training) report
curl -sS -X POST "$SUPABASE_URL/functions/v1/generate-report" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"event_id":"<TRAINING_ID>","report_type":"training_report"}' \
  | jq -r '.report.content_markdown'

# B) Period (monthly) report
curl -sS -X POST "$SUPABASE_URL/functions/v1/generate-period-report" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"team_id":"<TEAM_ID>","report_type":"monthly_report","period_start":"2026-07-01","period_end":"2026-07-31"}' \
  | jq -r '.report.content_markdown'
```

Model output is non-deterministic, so this is a qualitative eyeball: the goal is
to confirm the boundaries hold and the writing is specific, not to match a string.

---

## 5. What to eyeball

### A) Per-session (training) report — the aim-aware checklist and "only what was said"

- [ ] **All three aims are present** under "What you hoped to see", and
      **"Players scan before they receive" shows as `· … (nothing in your notes
      about this one)`** —
      no note touched scanning, so it must be **kept, not dropped**. (F4)
- [ ] "The keeper starts moves calmly" reads as "you wrote about this";
      "Full-backs get wide" as that or "your notes touch on this" (right side was
      noted, left was narrow).
- [ ] **Nothing reads as a mark.** No ticks, crosses or scores against an aim,
      and no heading that calls part of the session a failure. An aim the coach
      never came back to is described, not scored: the point is that they can see
      it, not that they are docked for it.
- [ ] **Only what was said**: every bullet traces to a seeded note or the coach's
      answer. **Red flags** = a verdict or characterisation the coach never made
      ("great session", "the team is progressing"), an invented detail, a player
      or moment not in the notes, or a coaching recommendation of the model's own.
      "Noted for next" should come from the coach's own "sort the timing of the
      first pass" and their answer — not invented advice. (F4)
- [ ] **No surnames** anywhere. (under-18 rule)
- [ ] Report is **not blank**. Re-run the exact same call → response has
      `"unchanged": true` and **no second `reports` row** is created; the same
      report comes back. (F11) Confirm:
      `select count(*) from reports where event_id = '<TRAINING_ID>';`  -- expect 1

### B) Period (monthly) report — the "not generic" bar (where F25 could bite)

- [ ] **Specific, not generic**: the report names the real themes — playing out
      from the back, going long when pressed, the gap between midfield and defence
      when the ball was lost — not vague filler that could describe any team. If it
      reads generic, F25's bucketing dropped the signal. (F25)
- [ ] **Training ↔ match** section says something real: playing-out was worked in
      training and showed in the match first half, then broke down under a hard
      press. (F25)
- [ ] **No theme missing**: every theme you seeded is representable — spot-check
      that "under pressure" and "compactness / the gap on losing it" both surface.
- [ ] **Record + highlights**: "Record: 1W 0D 0L · 2-1". Player highlights use
      **first names with disambiguation** — "Jack S" (2 goals) and "Jack B"
      (assist) distinguishable, "Oscar" (assist). **No surnames.** (under-18 rule)
- [ ] Not blank; single report on re-run.

### C) Optional — questions + enrich (exercises F26 and F14)

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/generate-reflection-questions" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"reflection_id":"<TRAINING_REFLECTION_ID>"}' | jq '.questions[].question_text'
```
- [ ] Questions are **specific to what the coach wrote** (the thin/broad spots),
      not repetitive or generic. No cross-session "recurring theme" prompts should
      appear — insights are disabled this dispatch. (F9, F26)
- [ ] `enrich-reflection` folds the answer into the summary **without adding a
      verdict**. (F14)

### D) Cost / model tiering sanity (F18)

```sql
select feature, model, input_tokens, output_tokens, round(cost_usd,5) cost
from public.usage_events where user_id = (select id from auth.users where email='<COACH_EMAIL>')
order by created_at desc limit 12;
```
- [ ] `generate-report` and `generate-period-report` ran on **Sonnet**;
      `clean-observation` / `generate-reflection-questions` on **Haiku**. (F18)
- [ ] Token counts look modest — the period report's `input_tokens` on this small
      scenario is well within budget (the F24/F25/F26 trims keep it small).

### E) Overall

- [ ] The whole flow completes with no 500s and both reports are viewable.

---

## Sign-off

These items being clean signs off the prompt/token changes (F14, F24, F25, F26)
that the node checks could only prove structurally. After this run and the F7
decision, the coach subsystem is dispatch-ready for a pilot. Remaining scoped
work: the player subsystem, and the linked-questions rebuild (the disabled
insights feature).
