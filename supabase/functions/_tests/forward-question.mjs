// generate-reflection-questions must turn toward next time, without ever
// crossing into advice.
//
// The gap: the prompt said "your ONLY job is to invite a bit more detail". It
// looked backwards and nowhere else, so a coach could write up every session for
// a season and never once be asked whether they would do anything differently.
// The reflective cycle stopped at describing what happened, which is the smaller
// half of reflecting.
//
// The line this sits on is narrow and worth stating: a QUESTION is not a
// verdict. "What would you want to see instead?" hands the thinking back to the
// coach. "Try a smaller pitch" does it for them. The first is the product; the
// second is the thing the product exists not to do. So the forward-looking job
// is added, and fenced with the distinction spelled out.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../generate-reflection-questions/index.ts"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// Read the prompt the model actually sees. Comments are stripped first: they
// quote both the good and the bad phrasing to explain the rule, so leaving them
// in would let a check pass on an explanation rather than on the instruction.
const block = src
  .slice(src.indexOf("    const system ="), src.indexOf("const raw = await callClaude"))
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const prompt = (block.match(/"(?:[^"\\]|\\.)*"/g) ?? [])
  .map((q) => q.slice(1, -1).replace(/\\"/g, '"'))
  .join("");

console.log("reflection questions: look forward, never advise");

// --- it turns forward at all -------------------------------------------------
ok("no longer claims detail is its ONLY job", !/ONLY job is to invite a bit more detail/.test(prompt));
ok("has a forward-looking job", /LOOKING FORWARD/.test(prompt));
ok("asks about next time", /turns toward next time/.test(prompt));
ok("covers what did not go their way", /what they would want to see instead/i.test(prompt));
ok("and what did, so it is not only about faults", /how they would keep it/i.test(prompt));

// --- and never becomes advice ------------------------------------------------
ok("states it asks questions and does not answer them", /You ask QUESTIONS\. You never answer them/.test(prompt));
ok("forbids suggesting what they should do next", /never suggest what they should have done or should do next/.test(prompt));
ok("has a rule for catching itself mid-advice", /turn it back into a question about what THEY/.test(prompt));
ok("asks about their intention rather than supplying it", /Ask about their intention, never supply it/.test(prompt));
ok("carries a worked example of the line", /what would you want to see instead\?" is right/i.test(prompt));
ok("names a suggestion as the wrong side of it", /you could shrink the pitch" is not/i.test(prompt));
ok("keeps the shared principle", /MIRROR_NOT_VERDICT/.test(src));

// --- restraint ---------------------------------------------------------------
// One forward question, last, and only when their own words support it. A
// reflection that already says what they want next time should be left alone.
ok("exactly one forward question", /ask ONE question that turns toward next time/.test(prompt));
ok("it comes last", /forward question is asked LAST/.test(prompt));
ok("it is grounded in what they raised", /tied to something THEY raised/.test(prompt));
ok("omitted when nothing supports it", /If nothing does, leave it out/.test(prompt));
ok("silent when they have already said it", /already says what they want next time, return an empty array/.test(prompt));
ok("still skippable", /always skippable/.test(prompt));

// --- house style -------------------------------------------------------------
ok("no em or en dashes in the prompt", !/[—–]/.test(prompt));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
