// The question that turns toward next time is FIXED, and written in code.
//
// The gap it fills: the prompt said "your ONLY job is to invite a bit more
// detail", so a coach could write up every session for a season and never once
// be asked whether they would do anything differently. The reflective cycle
// stopped at describing what happened, which is the smaller half of reflecting.
//
// Why not let the model write it. The first attempt did, tied to something from
// the reflection. But choosing WHICH thing to ask about is itself a judgement:
// it decides which part of the session deserved changing, which is a quieter
// version of the advice this product does not give. A fixed, open question
// decides nothing.
//
// In code rather than prompted, it cannot drift into a suggestion, cannot be
// skipped when the reflection looks complete, costs no tokens, and reads the
// same after every session, which is what a reflective habit is made of.
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

console.log("the forward question: fixed, always asked, never advice");

// --- the question itself -----------------------------------------------------
const q = (src.match(/const FORWARD_QUESTION =\s*\n?\s*"([^"]+)"/) ?? [])[1] ?? "";
ok(`it exists (${JSON.stringify(q)})`, q.length > 0);
ok("it is a question", q.trim().endsWith("?"));
ok("it invites change or improvement", /change or improve/i.test(q));
// "if at all" is load-bearing: without it the question presumes something went
// wrong, which is a verdict wearing a question mark.
ok("it presumes nothing went wrong", /if at all/i.test(q));
ok("it names no part of the session for them", !/press|player|shape|drill|pitch/i.test(q));
ok("it suggests nothing", !/\b(try|should|could|consider|recommend|maybe)\b/i.test(q));
ok("no em or en dashes", !/[—–]/.test(q));

// --- always asked, in code, last ---------------------------------------------
ok("appended in code, not left to the model", /rows\.push\(\{[\s\S]{0,200}FORWARD_QUESTION/.test(src));
ok("pushed after the generated ones, so it comes last",
  src.indexOf("rows.push({") > src.indexOf("const rows = questions"));
// The array can no longer be empty, so this is asked even when the reflection
// needed no detail questions at all.
ok("survives an empty model reply", /rows\.length\s*\n?\s*\? await admin/.test(src));

// --- and is not duplicated ---------------------------------------------------
ok("the model is told not to ask about next time", /Do NOT ask anything about next time/.test(prompt));
ok("and a duplicate is filtered out if it does anyway",
  /\.filter\(\(q\) => !\/next time\|next session\|differently\|change or improve\/i/.test(src));

// --- the detail questions stay backward-looking ------------------------------
ok("no longer claims detail is its ONLY job", !/ONLY job is to invite a bit more detail/.test(prompt));
ok("still invites concrete detail", /concrete example, what something looked like/i.test(prompt));
ok("empty is a fine outcome for the detail questions", /return an empty array \[\]\. That is a fine outcome/.test(prompt));
ok("keeps the shared principle", /MIRROR_NOT_VERDICT/.test(src));
ok("still skippable", /always skippable/.test(prompt));

// --- house style -------------------------------------------------------------
ok("no em or en dashes in the prompt", !/[—–]/.test(prompt));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
