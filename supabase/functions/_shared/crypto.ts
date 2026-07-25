// =============================================================================
// _shared/crypto.ts — constant-time string comparison.
// Comparing a secret with `===`/`!==` can leak its length and content through
// timing. This compares in time independent of where the first difference is.
// Single source for the cron shared-secret checks and the Stripe webhook
// signature check (previously duplicated as constantTimeEqual / timingSafeEqual).
// =============================================================================

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
