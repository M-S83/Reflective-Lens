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
//   2 x reflective  taken verbatim from the curated bank, rotated per session
//   1 x forward     fixed text in code, always last, always asked
//
// The more of the set that is fixed, the less there is to drift into advice.
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

// --- they are now asked, not just shown to the model ------------------------
ok("a picker exists that returns whole prompts", /export async function reflectivePrompts/.test(kn));
ok("the function asks them", /for \(const prompt of await reflectivePrompts\(admin, reflection_id, 2\)\)/.test(fn));
ok("verbatim, not rewritten", /question_text: prompt,/.test(fn));
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
