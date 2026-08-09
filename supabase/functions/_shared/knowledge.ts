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
// ONLY THE OPEN ONES ARE ASKED. Two thirds of the bank is phrased as a yes/no
// against an implied standard: "Did I connect before I corrected?", "Did I
// listen, or just transmit?", "Was this a genuinely new session, or last week
// repeated?". Those are not questions, they are standards with a question mark
// on them, and asking one verbatim tells a coach what they should have done.
// That is teaching, which is the line this product does not cross.
//
// A question that opens with what / where / who / which / how / when asks the
// coach to describe. One that opens with did I / was I / am I asks them to
// judge themselves against something unstated. The rule is a heuristic rather
// than a truth, but it is applied consistently, it is visible here, and a prompt
// added to the bank later is screened by it automatically.
//
// The loaded ones are not wasted: reflectionGrounding still shows the WHOLE bank
// to the model, where they shape the style of a question about what the coach
// actually wrote. Fine as influence, not fine as an interrogation.
const OPENS_DESCRIPTIVELY = /^\s*(what|where|who|which|how|when)\b/i;

// A second screen, because opening descriptively is not enough. These are asked
// WORD FOR WORD, so anything in the bank that breaks the product's own rules
// reaches a coach unfiltered, and four of the thirteen that passed the opener
// did exactly that:
//
//   "What would players say if I asked them to score me 1-6 tonight?"
//     invites a coach to imagine being marked out of six, in the app whose
//     whole promise is that it never grades.
//   "...and why (the now what)?"  names a reflective model at them.
//   "How many of the six capabilities..."  is England Football jargon, taught
//     back rather than reflected.
//   "...did I ask is it me / my session? before blaming the player?"  presumes
//     they blame players, which is a verdict wearing a question mark.
//
// The grounding already tells the MODEL never to name a framework or teach; it
// says nothing about the prompts asked directly, because when that text was
// written none of them were.
const CROSSES_THE_LINE =
  /\bscore (me|you|them)\b|\b1-6\b|\bout of (six|6|ten|10)\b|\brate\b|\(the now what\)|\bsix capabilities\b|before blaming/i;

// The bank is written in the first person, as a coach's own journal prompt:
// "Where did my eyes go?". Asked alongside questions the app writes ("When you
// say you were pleased, what did that look like?"), the voices collide in one
// list. This converts, rather than rewrites: the curated wording survives, so
// nothing is being generated, and it is mechanical enough to test exhaustively.
//
// Order matters. "I was" has to be handled before a bare "I", or "what did I
// think I was teaching" becomes "what did you think you was teaching".
export function toSecondPerson(q: string): string {
  return q
    // House style, and these are shown to a coach exactly as stored.
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\bam I\b/g, "are you")
    .replace(/\bwas I\b/g, "were you")
    .replace(/\bI am\b/g, "you are")
    .replace(/\bI was\b/g, "you were")
    .replace(/\bI'm\b/g, "you are")
    .replace(/\bI've\b/g, "you have")
    .replace(/\bI'll\b/g, "you will")
    .replace(/\bI'd\b/g, "you would")
    .replace(/\bI\b/g, "you")
    .replace(/\bmyself\b/g, "yourself")
    .replace(/\bMyself\b/g, "Yourself")
    .replace(/\bmine\b/g, "yours")
    .replace(/\bmy\b/g, "your")
    .replace(/\bMy\b/g, "Your")
    .replace(/\bme\b/g, "you")
    .replace(/\bMe\b/g, "You");
}

// One per group, so the set spans different kinds of thinking (where my eyes
// went, how I spoke, what I noticed about a player) rather than several angles
// on the same thing. The seed rotates the window, so a coach reflecting every
// week works through the bank instead of meeting the same question each time.
export async function reflectivePrompts(
  admin: SupabaseClient,
  seed: string,
  count = 1,
): Promise<string[]> {
  const all = await loadPrompts(admin);
  const prompts = all.filter((p) =>
    OPENS_DESCRIPTIVELY.test(p.prompt) && !CROSSES_THE_LINE.test(p.prompt)
  );
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
    out.push(toSecondPerson(list[(offset + i) % list.length]));
  }
  return out;
}
