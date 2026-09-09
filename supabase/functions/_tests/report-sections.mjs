// One report shape, said once (the 9 Sep 2026 review, items 3, 4, 5 and 6).
//
// Four rules the test reports were caught breaking, now held here:
//
//   3. the same bullet must not appear in two sections. The 6 Aug report
//      carried "understood the key players that needed to be positioned
//      correctly" in both What went well and Evidence of learning, with the
//      prompt already forbidding it, so the output is deduplicated in code
//      and this file proves the code.
//   4. Evidence of learning means evidence of learning. The League report
//      listed the thing that did not work there.
//   5. one fixed set of section names in one fixed order, absent only when
//      empty. "What did not work" vs "What got in the way", and Action points
//      alongside Noted for next, read as a different app day to day.
//   6. spelling only. "alot" in a finished report looks careless in front of
//      a county officer; fixing it changes nothing the coach meant. Anything
//      past spelling (guessing a missing word, rewording) stays forbidden.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fn = (p) => readFileSync(join(here, "..", p), "utf8");
const report = fn("generate-report/index.ts");
const dedupe = fn("_shared/dedupe.ts");
const eventDetail = readFileSync(join(here, "../../../web/src/screens/EventDetail.tsx"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

console.log("one report shape, said once");

// --- 3. the dedup pass, behaviourally ----------------------------------------
// Lift the real function and run the real failures through it.
const dedupeSections = eval(`(() => {${
  code(dedupe)
    .replace(/export function/g, "function")
    .replace(/: string\[\]\[\]/g, "").replace(/: string\[\]/g, "").replace(/: Set<string>/g, "")
    .replace(/: boolean/g, "").replace(/\(s: string\)/g, "(s)")
    .replace(/\(a: string, b: string\)/g, "(a, b)")
}; return dedupeSections; })()`);

{
  // The two real duplicates from the 6 Aug test report. Sections are passed in
  // render order, so the copy in Evidence of learning (the mislabelled one,
  // both times) is the one that goes.
  const [well, notWork, , learning] = dedupeSections([
    ["understood the key players that needed to be positioned correctly"],
    ["instigated the press a little early"],
    [],
    [
      "understood the key players that needed to be positioned correctly",
      "instigated the press a little early",
    ],
  ]);
  ok("the went-well copy survives", well.length === 1);
  ok("the did-not-work copy survives", notWork.length === 1);
  ok("both later copies go", learning.length === 0);
}
{
  // Reworded, not copied, because rewording is exactly how the duplicates got
  // past the prompt rule.
  const [a, b] = dedupeSections([
    ["understood the key players that needed to be positioned correctly"],
    ["understood the key players that had to be positioned correctly"],
  ]);
  ok("a reworded near-duplicate is caught", a.length === 1 && b.length === 0);
}
{
  // Two different points must both survive: a false positive silently deletes
  // something the coach said, which is the worse failure.
  const [a, b] = dedupeSections([
    ["kept the width on the left all half"],
    ["the press fired too early in the first phase"],
  ]);
  ok("different points are both kept", a.length === 1 && b.length === 1);
}
{
  const [a] = dedupeSections([["same point twice", "same point twice", "  ", ""]]);
  ok("repeats and blanks within one section go too", a.length === 1);
}

ok("generate-report runs the pass", /dedupeSections\(/.test(code(report)));
ok("in render order, so the first section keeps the point",
  /"what_went_well", "what_did_not_work", "session_patterns",\s*\n?\s*"learning_evidence", "about_you", "noted_for_next"/.test(code(report)));
ok("the prompt rule is still asked as well", /EACH POINT APPEARS ONCE/.test(code(report)));

// --- 4. evidence of learning means evidence of learning ----------------------
ok("the section is defined by what it is",
  /learning_evidence is ONLY for evidence of learning/.test(code(report)));
ok("could not do before, or did better", /could not do before, or do it better/.test(code(report)));
ok("a difficulty never belongs there", /did not work NEVER belongs there/.test(code(report)));
ok("empty rather than borrowed",
  /empty array rather than moving/.test(code(report)));

// --- 5. one fixed set of names, one fixed order -------------------------------
{
  const md = code(report).match(/function coachMarkdown[\s\S]*?\nfunction selfMarkdown/)?.[0] ?? "";
  ok("the renderer exists", md.length > 0);
  const order = [
    '"What you hoped to see"', '"What went well"', '"What got in the way"',
    '"In this session"', '"Evidence of learning"', '"What you said about yourself"',
    '"Noted for next"',
  ].map((h) => md.indexOf(h));
  ok("every fixed section is present once",
    order.every((i) => i >= 0) &&
    order.every((i, n) => md.indexOf([
      '"What you hoped to see"', '"What went well"', '"What got in the way"',
      '"In this session"', '"Evidence of learning"', '"What you said about yourself"',
      '"Noted for next"',
    ][n], i + 1) === -1));
  ok("and in one fixed order", order.every((i, n) => n === 0 || i > order[n - 1]));
  ok("Action points is gone: Noted for next is the one name for it",
    !/Action points/.test(md) && !/action_points/.test(code(report)));
  ok("What did not work is not a heading here",
    !/"What did not work"/.test(code(report)));
}

// --- 6. spelling only ---------------------------------------------------------
// The decision from the review: fixing spelling is not a mirror violation,
// because the word the coach meant is not in doubt. Everything past spelling
// still is one, and the report now carries the same narrow line the clean
// step already had.
ok("the report may correct obvious spelling", /correct obvious spelling/i.test(code(report)));
ok("but never rewords", /Never reword their/.test(code(report)));
ok("never guesses a missing word", /never guess at a word that is missing/.test(code(report)));
ok("never finishes their sentence", /never finish a\s*\n?\s*"\s*\+\s*"sentence they left unfinished/.test(code(report)) ||
  /never finish a[\s\S]{0,40}sentence they left unfinished/.test(code(report)));

// --- and every stored report picks all of this up -----------------------------
ok("the logic version was bumped",
  Number(code(report).match(/const REPORT_LOGIC_VERSION = (\d+)/)[1]) >= 3);

// --- 7. delete lives in one place ---------------------------------------------
// It sat at the bottom of every tab: "Delete this session, there is no undo",
// one thumb-slip away on each of the six screens a coach works through
// mid-session.
ok("delete renders only on the final tab",
  /active === "report" && <DeleteSession/.test(code(eventDetail)));
ok("still behind a confirm that names what goes",
  /window\.confirm/.test(code(eventDetail)) && /It cannot be undone/.test(code(eventDetail)));
ok("and nowhere else",
  (code(eventDetail).match(/<DeleteSession/g) ?? []).length === 1);

// --- house style ----------------------------------------------------------------
ok("no em or en dashes", ![report, dedupe].some((s) => /[—–]/.test(s)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
