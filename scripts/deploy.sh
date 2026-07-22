#!/usr/bin/env bash
# =============================================================================
# Deploy the Reflective Lens backend to a linked Supabase project.
#
# One-time before first run:
#   supabase login
#   supabase link --project-ref <your-project-ref>
#   cp .env.example .env   # then fill it in
#
# Then: ./scripts/deploy.sh
# Re-runnable — pushes migrations, sets secrets, redeploys all functions.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

command -v supabase >/dev/null || { echo "supabase CLI not found — install it first"; exit 1; }
[ -f .env ] || { echo "Missing .env — copy .env.example to .env and fill it in"; exit 1; }

# shellcheck disable=SC1091
set -a; . ./.env; set +a

echo "==> Pushing database migrations (0001–0006)"
supabase db push

echo "==> Setting function secrets"
supabase secrets set \
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY in .env}" \
  OPENAI_API_KEY="${OPENAI_API_KEY:?set OPENAI_API_KEY in .env}" \
  LEARNING_CRON_SECRET="${LEARNING_CRON_SECRET:?set LEARNING_CRON_SECRET in .env}" \
  APP_URL="${APP_URL:-}"

if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
  echo "==> Setting Stripe secrets"
  supabase secrets set \
    STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
    STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
fi

echo "==> Deploying edge functions (JWT-protected)"
for fn in transcribe-audio process-team-sheet clean-observation \
          generate-reflection-questions enrich-reflection review-intent \
          generate-report generate-period-report generate-player-summary \
          update-insights update-voice-profile create-checkout; do
  supabase functions deploy "$fn"
done

echo "==> Deploying edge functions (public — secret/signature-authenticated)"
supabase functions deploy run-learning   --no-verify-jwt
supabase functions deploy billing-webhook --no-verify-jwt

echo ""
echo "==> Done. Next:"
echo "    1. Sign up once in your app, then run supabase/go-live.sql (make yourself admin)."
echo "    2. Enable pg_cron + pg_net and schedule the learning sweep (see supabase/go-live.sql)."
echo "    3. Smoke test:  ./scripts/smoke-test.sh https://<project-ref>.supabase.co"
