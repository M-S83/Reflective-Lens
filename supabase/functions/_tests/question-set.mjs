// The set of follow-up questions a coach is asked, and where each one comes
// from.
//
// It used to be up to three questions, all written by the model, all about gaps
// in what the coach had already said. That treats a reflection as a form to
// finish rather than thinking to deepen, and it left the best questions in the
// app unused: the bank of 40 curated coach-reflection prompts seeded in 0006 was
// only ever shown to the model as a style example, never actually asked.
//
// Now there are three sources, and only one of them is generated:
//
//   2 x detail      written by the model, only where the reflection is thin
//   1 x reflective  verbatim from the OPEN part of the curated bank, rotated
//   1 x forward     fixed text in code, always last, always asked
//
// The more of the set that is fixed, the less there is to drift into advice.
//
// Only one curated prompt, and only an openly-phrased one. Two thirds of the
// bank reads as a yes/no against an implied standard ("Did I connect before I
// corrected?", "Did I listen, or just transmit?"), which is a verdict with a
// question mark on it. And it is the only question in the set that raises a
// subject the coach did not, so it takes up as little room as it can while
// still being there.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fn = readFileSync(join(here, "../generate-reflection-questions/index.ts"), "utf8");
const kn = readFileSync(join(here, "../_shared/knowledge.ts"), "utf8");
const seed = readFileSync(join(here, "../../migrations/0006_coaching_knowledge.sql"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

console.log("the question set: three sources, one generated");

// --- the bank exists and is worth asking ------------------------------------
const prompts = [...seed.matchAll(/\{"group":"([^"]+)","prompt":"((?:[^"\\]|\\.)*)"\}/g)]
  .map((m) => ({ group: m[1], text: m[2] }));
const groups = [...new Set(prompts.map((p) => p.group))];
ok(`the bank has real content (${prompts.length} prompts)`, prompts.length >= 30);
ok(`spread across groups (${groups.length})`, groups.length >= 5);
ok("they are questions", prompts.filter((p) => p.text.trim().endsWith("?")).length > prompts.length * 0.8);

// They must not tell a coach what good coaching is. A curated prompt is asked
// verbatim, so anything advisory in the bank reaches the coach unfiltered.
const advisory = prompts.filter((p) => /\byou should\b|\btry to\b|\bmake sure\b|\bremember to\b/i.test(p.text));
ok(`none of the bank gives instructions (${advisory.length} found)`, advisory.length === 0);

// --- only the open ones are asked -------------------------------------------
// The screen that matters. "Where did my eyes go?" asks a coach to describe.
// "Did I connect before I corrected?" asks them to judge themselves against a
// standard nobody stated, which is teaching wearing a question mark.
const rule = kn.match(/const OPENS_DESCRIPTIVELY = \/(.+?)\/i;/);
ok("there is a screen on what may be asked", !!rule);
const OPEN = new RegExp(rule[1], "i");

// A second screen, because opening descriptively is not enough. These are asked
// word for word, so a prompt that breaks the product's own rules reaches a coach
// unfiltered, and four that passed the opener did: one invited them to imagine
// being scored 1-6, one named a reflective model, one taught England Football
// jargon back at them, and one presumed they blame players.
const lineRule = kn.match(/const CROSSES_THE_LINE =\s*\n?\s*\/(.+?)\/i;/);
ok("there is a second screen on what it may say", !!lineRule);
const BAD = new RegExp(lineRule[1], "i");

const askable = prompts.filter((p) => OPEN.test(p.text) && !BAD.test(p.text));
const screened = prompts.filter((p) => !OPEN.test(p.text) || BAD.test(p.text));

// The one that matters most: this app does not grade, so it must not ask a
// coach to picture being graded.
ok("nothing askable invites a score",
  !askable.some((p) => /score me|1-6|out of six/i.test(p.text)));
ok("nothing askable names a model", !askable.some((p) => /\(the now what\)/i.test(p.text)));
ok("nothing askable teaches jargon", !askable.some((p) => /six capabilities/i.test(p.text)));
ok("the loaded ones ARE caught", prompts.some((p) => BAD.test(p.text)));
ok(`a real share is screened out (${screened.length} of ${prompts.length})`, screened.length > prompts.length / 3);
ok(`enough survive to rotate (${askable.length})`, askable.length >= 8);
ok("nothing askable opens with 'did I'", !askable.some((p) => /^\s*did i\b/i.test(p.text)));
ok("nothing askable opens with 'was I'", !askable.some((p) => /^\s*was i\b/i.test(p.text)));
ok("the loaded ones ARE screened", screened.some((p) => /^did i connect before i corrected/i.test(p.text)));
ok("askable ones span groups", new Set(askable.map((p) => p.group)).size >= 4);
// The screened ones still ground the model's style, they are just never asked.
ok("the whole bank still grounds the generated questions", /reflectionGrounding/.test(fn));

// --- and they are asked in the app's voice ----------------------------------
// The bank is written in the first person, as a coach's own journal prompt.
// Asked next to questions the app writes ("When you say you were pleased..."),
// the two voices collided in one list. Converting rather than rewriting keeps
// the curated wording, so nothing is generated, and makes it testable against
// every prompt that can actually be asked.
const tsFn = kn.match(/export function toSecondPerson[\s\S]*?\n\}/)?.[0] ?? "";
ok("there is a conversion", tsFn.length > 0);
const toSecondPerson = eval(`(${tsFn.replace("export function", "function").replace(/: string/g, "")})`);

for (const p of askable) {
  const out = toSecondPerson(p.text);
  ok(`no "I" left in: ${out.slice(0, 46)}...`, !/\bI\b|\bmy\b|\bme\b|\bmyself\b/i.test(out));
  ok(`  and it still ends as a question`, out.trim().endsWith("?"));
  ok(`  and carries no em or en dash`, !/[—–]/.test(out));
}
// Order matters in the transform: "I was" has to go before a bare "I", or
// "what did I think I was teaching" becomes "you was teaching".
ok("verb agreement survives",
  toSecondPerson("What did I think I was teaching?") === "What did you think you were teaching?");
ok("am I becomes are you", toSecondPerson("Where am I looking?") === "Where are you looking?");
ok("contractions too", toSecondPerson("What's one thing I'll change?") === "What's one thing you will change?");

// --- they are now asked, not just shown to the model ------------------------
ok("a picker exists that returns whole prompts", /export async function reflectivePrompts/.test(kn));
ok("the function asks one of them", /for \(const prompt of await reflectivePrompts\(admin, reflection_id, 1\)\)/.test(fn));
ok("asked as written, only the voice turned", /question_text: prompt,/.test(fn));
ok("grounding is still used for the generated ones", /reflectionGrounding/.test(fn));

// --- variety ----------------------------------------------------------------
// A coach reflecting every week must not meet the same question each time, and
// two prompts in one set should come from different kinds of thinking.
ok("one per group, so the set spans different angles", /groups\[\(offset \+ i\) % groups\.length\]/.test(kn));
ok("seeded per reflection, so it rotates between sessions", /reflectivePrompts\(admin, reflection_id/.test(fn));
ok("groups sorted first, so rotation is stable not random", /\[\.\.\.byGroup\.keys\(\)\]\.sort\(\)/.test(kn));

// --- the shape of the whole set ---------------------------------------------
ok("generated questions cut to two", /max_questions = 2/.test(fn));
const iCurated = fn.indexOf("reflectivePrompts(admin");
const iForward = fn.indexOf("question_text: FORWARD_QUESTION");
const iGenerated = fn.indexOf("const rows = questions");
ok("generated first, then curated, then forward",
  iGenerated < iCurated && iCurated < iForward);
ok("the forward question is still fixed in code", /const FORWARD_QUESTION =/.test(fn));
ok("all of them stay skippable", /always skippable/.test(fn));

// Worth stating outright: only one of the three sources involves a model.
const generatedSources = [/const rows = questions/].filter((r) => r.test(fn)).length;
ok(`only one source is generated (${generatedSources} of 3)`, generatedSources === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
