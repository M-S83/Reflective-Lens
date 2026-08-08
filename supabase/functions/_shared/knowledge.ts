// =============================================================================
// _shared/knowledge.ts
// Loaders for the coaching knowledge base (migration 0006), used to GROUND the
// AI in real coaching pedagogy:
//   • the reflective prompt bank grounds generate-reflection-questions
//   • the canonical tag taxonomy grounds clean-observation
//
// Both are stable reference data, so we cache them at module scope — a warm
// function instance reads the DB once and reuses it across invocations.
// =============================================================================
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

let tagCache: string[] | null = null;
let promptCache: { group_name: string; prompt: string }[] | null = null;

// The canonical observation tags. Cleaning snaps to these so the self-learning
// loop (insights, trends) speaks one consistent language.
export async function canonicalTags(admin: SupabaseClient): Promise<string[]> {
  if (tagCache) return tagCache;
  const { data } = await admin.from("coaching_tags").select("tag").order("tag");
  tagCache = (data ?? []).map((r) => r.tag as string);
  return tagCache;
}

// The coach reflective-prompt bank (excludes the scheduled 10-10-10 cadence
// prompts — those are surfaced by the frontend, not asked mid-reflection).
async function loadPrompts(admin: SupabaseClient) {
  if (promptCache) return promptCache;
  const { data } = await admin
    .from("reflection_prompts")
    .select("group_name, prompt")
    .is("cadence", null);
  promptCache = (data ?? []) as { group_name: string; prompt: string }[];
  return promptCache;
}

// A small, group-spread sample of the prompt bank, as a grounding instruction
// for the reflection-question generator. Varied per reflection (by `seed`) so a
// coach isn't shown the same handful every time. Returns "" if the bank is empty.
export async function reflectionGrounding(
  admin: SupabaseClient,
  seed: string,
  perGroup = 2,
): Promise<string> {
  const prompts = await loadPrompts(admin);
  if (prompts.length === 0) return "";

  // Group, then rotate a deterministic-but-varied window into each group.
  const byGroup = new Map<string, string[]>();
  for (const p of prompts) {
    let arr = byGroup.get(p.group_name);
    if (!arr) {
      arr = [];
      byGroup.set(p.group_name, arr);
    }
    arr.push(p.prompt);
  }
  let offset = 0;
  for (let i = 0; i < seed.length; i++) offset = (offset + seed.charCodeAt(i)) % 997;

  const picked: string[] = [];
  for (const list of byGroup.values()) {
    for (let k = 0; k < perGroup && k < list.length; k++) {
      picked.push(list[(offset + k) % list.length]);
    }
  }

  return (
    "GROUNDING (for you, the system — NOT to be taught back). These are real " +
    "coach-reflection questions from a coaching knowledge base. Use them to shape " +
    "a better OPEN question about what THIS coach actually wrote — draw on and " +
    "adapt the ones that fit, rephrased in their own voice. This app is a mirror, " +
    "not a teacher: never name a framework or model, never cite a source, never " +
    "tell the coach what good coaching is, and never turn a prompt into advice or " +
    "judgement. Only ask, in their terms, so they reflect on their own session:\n" +
    picked.map((p) => `- ${p}`).join("\n") +
    "\n"
  );
}

// Pick whole prompts from the bank to ASK, rather than to ground a model.
//
// The bank has always been used only as style guidance: the model read a sample
// and wrote its own questions in that shape. But these are curated, in house
// voice, written by people who know what a coach should be asked, and asking
// them directly is both better and free. Nothing can drift into advice when
// nothing is generating.
//
// One per group, so the set spans different kinds of thinking (where my eyes
// went, how I spoke, what I noticed about a player) rather than three angles on
// the same thing. The seed rotates the window, so a coach reflecting every week
// works through the bank instead of meeting the same question each time.
export async function reflectivePrompts(
  admin: SupabaseClient,
  seed: string,
  count = 2,
): Promise<string[]> {
  const prompts = await loadPrompts(admin);
  if (prompts.length === 0) return [];

  const byGroup = new Map<string, string[]>();
  for (const p of prompts) {
    let arr = byGroup.get(p.group_name);
    if (!arr) { arr = []; byGroup.set(p.group_name, arr); }
    arr.push(p.prompt);
  }

  let offset = 0;
  for (let i = 0; i < seed.length; i++) offset = (offset + seed.charCodeAt(i)) % 997;

  // Rotate which GROUPS are used as well as which prompt within one, so two
  // sessions in a row do not both open with self-awareness.
  const groups = [...byGroup.keys()].sort();
  const out: string[] = [];
  for (let i = 0; i < count && i < groups.length; i++) {
    const list = byGroup.get(groups[(offset + i) % groups.length])!;
    out.push(list[(offset + i) % list.length]);
  }
  return out;
}
