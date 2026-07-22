#!/usr/bin/env bash
# =============================================================================
# Quick reachability check that the edge functions are deployed and responding.
# Sends a CORS preflight (OPTIONS) — no auth needed — to a sample of functions.
# A 200 means the function is live. (Real calls need a user JWT.)
#
# Usage: ./scripts/smoke-test.sh https://<project-ref>.supabase.co
# =============================================================================
set -euo pipefail
URL="${1:?usage: smoke-test.sh https://<project-ref>.supabase.co}"

echo "Checking edge functions at ${URL}/functions/v1/ ..."
for fn in clean-observation generate-report run-learning billing-webhook; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "${URL}/functions/v1/${fn}" || echo "000")
  if [ "$code" = "200" ]; then
    echo "  ✓ ${fn}  (${code})"
  else
    echo "  ? ${fn}  (${code}) — deployed functions return 200 to OPTIONS; 000 = unreachable"
  fi
done
