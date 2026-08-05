import { supabase } from "./supabase";

// Account-level reads and writes: the coach's glossary (0017) and their free
// month. Owner-only by RLS, so none of these need a user id passed in.

export interface GlossaryEntry {
  id: string;
  term: string;
  meaning: string;
  created_at: string;
}

export async function myGlossary(): Promise<GlossaryEntry[]> {
  const { data, error } = await supabase
    .from("coach_glossary")
    .select("id, term, meaning, created_at")
    .order("term", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GlossaryEntry[];
}

// Upsert on (user_id, term): re-adding a term the coach already has updates the
// meaning rather than failing on the unique constraint, which is what someone
// correcting a definition expects to happen.
export async function saveGlossaryTerm(term: string, meaning: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { error } = await supabase
    .from("coach_glossary")
    .upsert(
      { user_id: userId, term: term.trim(), meaning: meaning.trim() },
      { onConflict: "user_id,term" },
    );
  if (error) throw error;
}

export async function removeGlossaryTerm(id: string): Promise<void> {
  const { error } = await supabase.from("coach_glossary").delete().eq("id", id);
  if (error) throw error;
}

// Days left in the free month, from the one definition in the database
// (trial_days_left, 0017), so this can never disagree with the reminder emails.
export async function trialDaysLeft(): Promise<number | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase.rpc("trial_days_left", { _user_id: userId });
  if (error) return null; // not worth failing a screen over
  return typeof data === "number" ? data : null;
}
