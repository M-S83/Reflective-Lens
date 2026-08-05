// Shared helper appended to every AI system prompt. It carries four things:
//   1. HOUSE STYLE — always on (British-neutral punctuation rules).
//   2. LANGUAGE — the user's chosen output language (profiles.language, en-GB
//      default). Adding more languages later just means more labels here.
//   3. VOICE — when a coach has a learned voice profile, write in their words.
//   4. THEIR WORDS — the coach's declared glossary (0017), where they have told
//      us what their own terms mean.
//
// Two glossaries, deliberately. coach_voice_profiles.glossary is LEARNED: a bare
// list of terms update-voice-profile noticed the coach using. coach_glossary is
// DECLARED: term plus meaning, typed in by the coach. The declared one is worth
// more to a prompt because it carries the meaning, so the model can use the term
// correctly instead of parroting it, and it is the coach's own definition rather
// than one inferred for them.
//
// The line this must not cross: a glossary entry explains what the coach means.
// It is not permission to assess whether they are right, or to coach them with
// their own vocabulary. See _shared/principles.ts.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// A glossary is user-entered and unbounded, and this string is prepended to
// every AI call for that coach. Cap it so one enthusiastic afternoon of typing
// cannot quietly inflate the token cost of every report thereafter. Newest
// first, so recent additions win when a coach is over the cap.
const GLOSSARY_MAX_TERMS = 40;
const GLOSSARY_MAX_CHARS = 1200;

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
    "\n\nHOUSE STYLE: write in " + label + ". Do NOT use em dashes or en dashes " +
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

  // One round trip for both: the learned profile and the declared glossary are
  // independent, and this runs on every AI call.
  const [{ data }, { data: glossary }] = await Promise.all([
    admin.from("coach_voice_profiles")
      .select("style_summary, glossary, language_level")
      .eq("user_id", userId).maybeSingle(),
    admin.from("coach_glossary")
      .select("term, meaning")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(GLOSSARY_MAX_TERMS),
  ]);

  let out = base;

  if (data?.style_summary) {
    const terms = Array.isArray(data.glossary) ? data.glossary.join(", ") : "";
    out += "\n\nVOICE: write so it reads as THIS coach's own words, not a textbook. " +
      `Their style: ${data.style_summary} ` +
      (data.language_level ? `Language level: ${data.language_level}. ` : "") +
      (terms ? `Terms they actually use: ${terms}. ` : "") +
      "Match their vocabulary and level exactly: don't upgrade plain, everyday " +
      "coaching language into jargon, and don't talk down to an experienced coach. " +
      "Mirror how they speak.";
  }

  out += glossaryInstruction(glossary as GlossaryEntry[] | null);
  return out;
}

interface GlossaryEntry {
  term: string;
  meaning: string;
}

// The declared glossary, as a prompt section. Exported so the check can assert
// the wording and the cap without standing up a database.
export function glossaryInstruction(entries: GlossaryEntry[] | null | undefined): string {
  if (!entries?.length) return "";

  // Build up to the character cap rather than truncating mid-entry, so the model
  // never receives half a definition.
  const lines: string[] = [];
  let used = 0;
  for (const e of entries) {
    const term = (e.term ?? "").trim();
    const meaning = (e.meaning ?? "").trim();
    if (!term || !meaning) continue;
    const line = `"${term}" means ${meaning}`;
    if (used + line.length > GLOSSARY_MAX_CHARS) break;
    lines.push(line);
    used += line.length;
  }
  if (!lines.length) return "";

  return (
    "\n\nTHEIR WORDS: this coach has told us what their own terms mean: " +
    lines.join("; ") + ". " +
    "Use the coach's term when they used it, rather than swapping in a synonym " +
    "or a textbook equivalent. These definitions are here so you understand what " +
    "they meant, nothing more: do NOT assess whether their usage is correct, do " +
    "NOT explain a term back to the coach who defined it, and do NOT introduce a " +
    "term into a report unless the coach used it about this session."
  );
}
