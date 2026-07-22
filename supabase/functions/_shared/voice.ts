// Shared helper appended to every AI system prompt. It carries three things:
//   1. HOUSE STYLE — always on (British-neutral punctuation rules).
//   2. LANGUAGE — the user's chosen output language (profiles.language, en-GB
//      default). Adding more languages later just means more labels here.
//   3. VOICE — when a coach has a learned voice profile, write in their words.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Map a stored language tag to a plain instruction label. Extend this as more
// languages are offered — nothing else needs to change.
const LANGUAGE_LABELS: Record<string, string> = {
  "en-GB": "British English",
  "en-US": "American English",
  "en-AU": "Australian English",
  // Future: "es": "Spanish", "fr": "French", "de": "German", ...
};

function houseStyle(language: string | null | undefined): string {
  const label = LANGUAGE_LABELS[language ?? "en-GB"] ?? "British English";
  return (
    "\n\nHOUSE STYLE — write in " + label + ". Do NOT use em dashes or en dashes " +
    "(— or –): use commas, full stops, colons, or brackets instead. Keep " +
    "punctuation simple and human. Never invent facts or statistics."
  );
}

export async function voiceInstruction(
  admin: SupabaseClient,
  userId: string | null | undefined,
): Promise<string> {
  // Language + house style apply even before a voice profile exists.
  let language = "en-GB";
  if (userId) {
    const { data: prof } = await admin
      .from("profiles").select("language").eq("id", userId).maybeSingle();
    if (prof?.language) language = prof.language as string;
  }
  const base = houseStyle(language);

  if (!userId) return base;
  const { data } = await admin
    .from("coach_voice_profiles")
    .select("style_summary, glossary, language_level")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.style_summary) return base;
  const terms = Array.isArray(data.glossary) ? data.glossary.join(", ") : "";

  return (
    base +
    "\n\nVOICE — write so it reads as THIS coach's own words, not a textbook. " +
    `Their style: ${data.style_summary} ` +
    (data.language_level ? `Language level: ${data.language_level}. ` : "") +
    (terms ? `Terms they actually use: ${terms}. ` : "") +
    "Match their vocabulary and level exactly: don't upgrade plain, everyday " +
    "coaching language into jargon, and don't talk down to an experienced coach. " +
    "Mirror how they speak."
  );
}
