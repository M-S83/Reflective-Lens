// The coach appears in their own reports (the 9 Sep 2026 review, items 1, 2
// and 8).
//
// The questions already asked the coach about themselves ("how did this
// session feel, for you") and the report folded those answers into
// session-shaped sections, so every test report read as being about the
// players and the practice. The FA's 24 Aug material draws exactly this line:
// reflecting on the practices you provide vs reflecting on yourself. The pitch
// says "looking at yourself as a coach"; the output has to show it.
//
// Three parts, one thread:
//   1. every session and match report carries a coach-self section, sourced
//      only from the reflection and the answers, honest when empty, never
//      invented;
//   2. "Self" is a session type of its own, for the reflection that has no
//      session to hang on (handling a parent, Saturday's temper), with a
//      report shaped for the coach and its own strand in the period report;
//   3. one trial question collects concrete material about the coach's own
//      interventions, so the section has something to mirror.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fn = (p) => readFileSync(join(here, "..", p), "utf8");
const report = fn("generate-report/index.ts");
const period = fn("generate-period-report/index.ts");
const questions = fn("generate-reflection-questions/index.ts");
const markdown = fn("_shared/markdown.ts");
const migration = readFileSync(join(here, "../../migrations/0030_self_as_a_session_type.sql"), "utf8");
const webTypes = readFileSync(join(here, "../../../web/src/lib/types.ts"), "utf8");
const webDb = readFileSync(join(here, "../../../web/src/lib/db.ts"), "utf8");
const newEvent = readFileSync(join(here, "../../../web/src/screens/NewEvent.tsx"), "utf8");
const eventDetail = readFileSync(join(here, "../../../web/src/screens/EventDetail.tsx"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// Comments quote the failures the rules exist to stop, so match on code only.
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

console.log("the coach appears in their own reports");

// --- 1. the coach-self section ----------------------------------------------
ok("the prompt asks for what the coach said about themselves",
  /about_you is what the coach said ABOUT THEMSELVES/.test(code(report)));
ok("sourced only from the reflection and the answers",
  /ONLY from their reflection and their answers/.test(code(report)));
ok("never from the pitch-side notes", /never from the pitch-side notes/.test(code(report)));
ok("never invented: empty when they said nothing",
  /NEVER invent it/.test(code(report)) && /nothing about themselves, return an empty array/.test(code(report)));
ok("about_you is in the JSON contract", /"about_you" \(string\[\]\)/.test(code(report)));
ok("and counts toward a usable report",
  /Array\.isArray\(c\.about_you\) && c\.about_you\.length/.test(code(report)));

// Rendered under a mirror-faithful name, and ALWAYS rendered: an empty section
// says so, on the same honesty rule as the hoped-to-see checklist, rather than
// disappearing (or worse, being filled).
ok("the section renders as the coach's own words",
  /heading: "What you said about yourself"/.test(code(report)));
ok("and says so honestly when empty",
  /empty: "You didn't say anything about yourself this time\."/.test(code(report)));

// The renderer's empty-state support, behaviourally. Lifted from the shared
// renderer the same way the other tests lift functions, so this proves output,
// not wording.
{
  const body = markdown.match(/export function renderReport[\s\S]*?\n\}/)?.[0] ?? "";
  const renderReport = eval(`(${
    body.replace("export function", "function")
      .replace(/: string \| undefined \| null/g, "").replace(/: MdBlock\[\]/g, "")
      .replace(/: string\[\]/g, "").replace(/: string/g, "")
  })`);
  const empty = renderReport("T", null, [
    { t: "bullets", heading: "What you said about yourself", items: [], empty: "You didn't say anything about yourself this time." },
  ]);
  ok("empty section keeps its heading", /## What you said about yourself/.test(empty));
  ok("and carries the honest line, not bullets",
    /_You didn't say anything about yourself this time\._/.test(empty) && !/\n- /.test(empty));
  const full = renderReport("T", null, [
    { t: "bullets", heading: "What you said about yourself", items: ["I stepped in too early"], empty: "You didn't say anything about yourself this time." },
  ]);
  ok("a section with content shows the content, never the line",
    /- I stepped in too early/.test(full) && !/didn't say anything/.test(full));
  const plain = renderReport("T", "h", [{ t: "bullets", heading: "A", items: ["x"] }]);
  ok("blocks without an empty text render exactly as before",
    plain === "# T\n\n_h_\n\n## A\n- x");
}

// --- 2. Self as a session type ------------------------------------------------
ok("0030 adds the event type", /alter type public\.event_type add value if not exists 'self_reflection'/.test(migration));
ok("and its report type", /alter type public\.report_type add value if not exists 'self_report'/.test(migration));
ok("the new values are not used in the adding migration",
  !/insert|update |create table/i.test(code(migration).replace(/--.*/g, "")));

ok("the web offers Self on the new-session screen",
  /\{ value: "self_reflection", label: "Self" \}/.test(code(webTypes)));
ok("the label matches the period report's, string for string",
  /return "Self reflection"/.test(code(webTypes)) && /return "Self reflection"/.test(code(period)));
ok("the client asks for the self report kind",
  /eventType === "self_reflection" \? "self_report"/.test(code(webDb)));

// The capture: no hoped-to-see checklist to set, because there is no session
// to observe; reflection and report are the whole journey.
ok("hoping-to-see is not asked for a self reflection", /\{!isSelf && <div className="field">/.test(code(newEvent)));
ok("a self session is two steps, reflect and report",
  /isSelf\s*\?\s*\[\s*\{ key: "reflect"/.test(code(eventDetail)));

// The report variant: shaped for the coach, not the session.
ok("the self prompt exists", /COACH'S SELF-REFLECTION/.test(code(report)));
ok("with its own keys", /"what_you_said"/.test(code(report)));
ok("noted_for_next stays the coach's own intention",
  /noted_for_next is ONLY what they themselves said they/.test(code(report)));
const selfMd = code(report).match(/function selfMarkdown[\s\S]*?\n\}/)?.[0] ?? "";
ok("a self renderer exists", selfMd.length > 0);
ok("it has no aims checklist and no squad", !/hoped to see|aims_review|roster/.test(selfMd));
ok("its sections are What you said and Noted for next",
  /"What you said"/.test(selfMd) && /"Noted for next"/.test(selfMd));

// The period report keeps Self as its own strand about the coach.
ok("the period report labels the strand",
  /event_type === "self_reflection"/.test(code(period)));
ok("and is told what the label means",
  /the coach reflecting/.test(code(period)) && /never merge it into the team's training/.test(code(period)));

// --- 3. the trial question -----------------------------------------------------
const q = (questions.match(/const STEP_IN_QUESTION =\s*\n?\s*"([^"]+)"/) ?? [])[1] ?? "";
ok(`the step-in question exists (${JSON.stringify(q)})`, q.length > 0);
ok("it asks what the coach actually said", /what did you say/i.test(q));
ok("it is a question", q.trim().endsWith("?"));
ok("it suggests nothing", !/\b(try|should|could|consider|recommend)\b/i.test(q));
ok("fixed in code, like the forward question",
  /rows\.push\(\{[\s\S]{0,200}STEP_IN_QUESTION/.test(code(questions)));
ok("asked before the forward question, which stays last",
  code(questions).indexOf("STEP_IN_QUESTION,") < code(questions).indexOf("FORWARD_QUESTION,") &&
  code(questions).indexOf("question_text: FORWARD_QUESTION") > code(questions).indexOf("question_text: STEP_IN_QUESTION"));
ok("not asked on a self reflection, which has no session to step into",
  /refEvent\?\.event_type !== "self_reflection"/.test(code(questions)));

// --- house style ----------------------------------------------------------------
// Whole-file for the files this change wrote or that were already clean;
// targeted for the two files that carry older dashes elsewhere.
const selfStrand = period.slice(period.indexOf('"Self reflection\\" is'), period.indexOf("MIRROR_NOT_VERDICT"));
ok("no em or en dashes in the changed sources",
  ![report, migration].some((s) => /[—–]/.test(s)) &&
  !/[—–]/.test(selfStrand) &&
  !/[—–]/.test((questions.match(/const STEP_IN_QUESTION =\s*\n?\s*"([^"]+)"/) ?? ["", ""])[1]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
