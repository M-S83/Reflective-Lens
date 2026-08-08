// enrich-reflection: the enriched summary must be the coach's reflection and
// nothing else.
//
// Found in the live app rather than by a test. The stored summary read:
//
//   "Here's a refined version of your reflection: You felt the session went
//    really well, and you were happy with the players you had..."
//
// Two failures in one line. The model narrated its own job into an artefact the
// coach reads as their own writing, and it called their reflection "refined",
// which tells a coach their words needed improving. The app joins their
// sentences up. It does not upgrade them.
//
// Root cause was the prompt: it said "You refine a coach's own session
// reflection", so "refined version" came straight back. Fixed at the wording,
// with a narrow strip in code as a backstop, since a prompt rule reduces a
// preamble without removing it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../enrich-reflection/index.ts"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));
const eq = (n, got, want) => ok(`${n} (got ${JSON.stringify(got)})`, got === want);

console.log("enriched summary: no preamble, no condescension");

// --- the prompt --------------------------------------------------------------
// Assert on the text the MODEL sees, not on the source file. The source also
// contains a comment explaining this very bug, which mentions "refine", and the
// prompt is built by concatenating string literals across several lines, so
// phrases straddle the joins. Pull the quoted literals out of the system block
// and stitch them back into the actual prompt.
const systemBlock = src
  .slice(src.indexOf("      system:"), src.indexOf("      prompt:"))
  // Drop comment lines first. The comment above this prompt quotes the old
  // wording verbatim to explain the bug, so leaving it in would pull "you
  // refine a coach's own reflection" straight back into the extracted prompt
  // and make this check pass or fail on the wrong text entirely.
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const prompt = (systemBlock.match(/"(?:[^"\\]|\\.)*"/g) ?? [])
  .map((q) => q.slice(1, -1).replace(/\\"/g, '"'))
  .join("");

ok("the prompt never calls the coach's writing 'refined'", !/\brefine[sd]?\b/i.test(prompt));
ok("frames the job as joining, not improving", /Join the two into one piece of writing/.test(prompt));
ok("says outright it is not a better reflection", /not a better one/.test(prompt));
ok("forbids a preamble", /No preamble/.test(prompt));
ok("names the exact failure it keeps hitting", /no "Here is"/.test(prompt));
ok("pins the first word", /first word of your reply is the first word/.test(prompt));

// --- the backstop ------------------------------------------------------------
const body = src.match(/function stripPreamble\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
if (!body) throw new Error("stripPreamble not found");
const strip = new Function("text", body[1].replace(/: string/g, ""));

const REAL = "You felt the session went really well, and you were happy with the players you had.";

eq("strips the exact preamble seen in the app",
  strip("Here's a refined version of your reflection: " + REAL), REAL);
eq("strips a curly apostrophe too",
  strip("Here’s your reflection with the extra context: " + REAL), REAL);
eq("strips 'This is'", strip("This is the combined reflection: " + REAL), REAL);
eq("strips 'Below is'", strip("Below is your reflection: " + REAL), REAL);
eq("leading whitespace does not defeat it",
  strip("\n  Here's a refined version: " + REAL), REAL);

// --- and does not eat real writing -------------------------------------------
// The strip is narrow on purpose. A coach's own sentence can start with almost
// anything, and losing their first line is far worse than leaving a preamble.
const keep = [
  ["a colon mid-sentence", "The thing is: we had no defenders and it showed."],
  ["a plain reflection", REAL],
  ["a colon after a long clause", "What I keep coming back to after watching that session again is this: patience."],
  ["'here' used naturally", "Here the players finally started scanning before receiving."],
  ["a question", "Did they actually understand the trigger, or were they copying each other?"],
];
for (const [name, text] of keep) eq(`leaves ${name} alone`, strip(text), text);

eq("a preamble with nothing after it is left alone (nothing to keep)",
  strip("Here's your reflection:"), "Here's your reflection:");

// --- it is actually wired in --------------------------------------------------
ok("the stored summary goes through it", /stripPreamble\(raw\.trim\(\)\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
