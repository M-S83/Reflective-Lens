# Continuous learning — "the app learns from itself at all times"

The app improves from its own accumulating data without anyone asking it to. Three
loops make it self-teaching; migration `0005_continuous_learning.sql` makes them
run **continuously** instead of only when called.

## The loops

1. **It learns your voice.** `update-voice-profile` reads your *own* raw notes and
   reflection transcripts and distils how you write (`coach_voice_profiles`).
   Every generating function then writes back through that profile — the more you
   use it, the more it sounds like you.
2. **It learns your patterns.** `update-insights` buckets note-themes by week and,
   when one recurs (≥3 of the last 4 weeks), turns it into a forward-looking
   `reflective_prompt`.
3. **The loop closes.** Those prompts are pulled into your **next** reflection's
   questions (`generate-reflection-questions`); your answers are folded back in
   (`enrich-reflection`). Notes → insights → the next reflection → new notes.

And a fourth, quieter one: **it learns from its own behaviour.**
`generate-reflection-questions` looks at which question kinds you've answered vs
skipped and steers away from the ones you keep skipping — so the prompting itself
adapts, not just the content.

## What makes it continuous

Before, those passes only ran when something called them. Now:

- **Every new input marks learning as due.** Triggers on `observations` and
  `reflections` set a `*_pending_since` flag in `learning_state` (a note feeds
  both trend detection and voice; a reflection feeds voice).
- **A sweep processes only what changed.** `learning_due()` lists users with
  pending work, oldest first. The `run-learning` edge function walks that list and
  refreshes each user's voice + insights, then `clear_learning_pending()` resets
  the flag. Unchanged users are skipped, so the sweep is cheap at rest.
- **Every pass is recorded.** `learning_runs` logs what was learned (inputs seen,
  items changed, a one-line summary) — visible to the user and, in aggregate, on
  the admin dashboard (`analytics_learning_recent`).

## Scheduling the sweep

`run-learning` is protected by a shared secret (not a user endpoint):

```bash
supabase secrets set LEARNING_CRON_SECRET=$(openssl rand -hex 24)
# optional: FUNCTIONS_BASE_URL if your functions aren't at ${SUPABASE_URL}/functions/v1
```

Then schedule it with `pg_cron` + `pg_net` (enable both under Database → Extensions),
running the SQL once in the Supabase SQL editor. Nightly at 02:00:

```sql
select cron.schedule(
  'reflective-lens-learning',
  '0 2 * * *',
  $$
    select net.http_post(
      url     := 'https://<project-ref>.supabase.co/functions/v1/run-learning',
      headers := jsonb_build_object(
        'content-type',  'application/json',
        'x-cron-secret', '<LEARNING_CRON_SECRET>'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

For fresher "on new input" learning, run it more often (e.g. `'0 */3 * * *'` —
every three hours). Because the sweep only touches users with pending work, a
tighter cadence costs little. The front end can also call `update-insights` /
`update-voice-profile` opportunistically right after a reflection is saved — the
sweep then guarantees nothing is missed.

## Cost note

These passes are on the cheap tier (voice → Haiku; insight detection is pure SQL,
no model). Running them per changed user on a nightly-or-tighter cadence adds only
a few of the calls already counted in `docs/cost-model.md`.
