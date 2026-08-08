import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  // Surfaced clearly rather than a cryptic runtime failure deep in a call.
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy web/.env.example to web/.env and fill them in.",
  );
}

// Read BEFORE the client is created. `detectSessionInUrl` consumes the hash and
// clears it, so by the time any screen renders there is nothing left to read.
// The PASSWORD_RECOVERY event covers the same ground, but only fires once: this
// survives the reload that a coach fumbling with a new password may well do.
export const arrivedOnRecoveryLink =
  typeof window !== "undefined" && /(\?|#|&)type=recovery(&|$)/.test(window.location.hash + window.location.search);

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const isConfigured = Boolean(url && anon);
