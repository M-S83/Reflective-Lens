// The report does not decide who the session was about.
//
// A real 1v1 session, about one boy, came back reading:
//
//     You noted the team had a bad at school.
//
// There is no team in a 1v1. The coach never wrote the word. It arrived because
// every note the app saves is stamped observation_type 'team_observation' and
// subject_type 'team', on every session, whatever it was, and the report payload
// forwarded those two constants to the model as if they meant something. It read
// subject: "team" and believed it.
//
// The prompt already said not to narrate the label ("do not write 'the team
// observation'"), and the model obeyed that to the letter while still taking the
// subject from it. A rule cannot out-argue a field that is simply wrong, so the
// field is gone and the rule now covers the invention rather than the phrasing.
//
// This matters more than a wording slip. The app's whole promise is that it
// reflects what the coach said. Putting words about a team into a session with
// one child is not a typo, it is the app making something up about a person.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fn = (p) => readFileSync(join(here, "..", p), "utf8");
const report = fn("generate-report/index.ts");
const clean = fn("clean-observation/index.ts");
const db = readFileSync(join(here, "../../../web/src/lib/db.ts"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// The comments here quote the bug, so reading them as code would pass checks
// that are meant to prove the bug is gone.
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

console.log("the report does not decide who it was about");

// --- the misleading labels are gone -----------------------------------------
// Both were constants on every note ever saved, so they told the model nothing
// it did not already have, and one of them told it something false.
ok("no subject label is sent with a note", !/subject: o\.subject_type/.test(code(report)));
ok("no type label either", !/type: o\.observation_type/.test(code(report)));
ok("the note itself is still sent", /note: o\.cleaned_note \?\? o\.raw_note/.test(code(report)));
ok("and so is what the coach tagged it with", /tags: o\.tags/.test(code(report)));

// --- and the rule covers the invention, not just the phrasing ----------------
ok("the model is told not to invent who it was about", /NEVER INVENT WHO IT WAS ABOUT/.test(code(report)));
// Checked one at a time. The prompt is built by concatenating string literals,
// so "the players" is split across a line break as `"the " + "players\"` and a
// single regex looking for the phrase intact matches nothing.
ok("the word that actually went wrong is named", /the team\\"/.test(code(report)));
ok("and the other collective nouns with it",
  ["players", "boys", "group"].every((w) => new RegExp(`${w}\\\\"`).test(code(report))));
ok("and the pronouns", /\\"he\\" or \\"she\\"/.test(code(report)));
ok("and told sessions are as often one player as a squad",
  /player as with a squad/.test(code(report)));
ok("the older rule about narrating the data is still there",
  /NEVER describe the data you were given/.test(code(report)));
ok("and the restate-only rule is still there",
  /RESTATE ONLY what the coach actually said/.test(code(report)));

// --- an aim with nothing written about it says so once -----------------------
// The suffix already says "(nothing in your notes about this one)". The model's
// note then said it again in its own words, on the same line.
ok("an unrecorded aim carries no note",
  /a\.status === "stated_not_recorded" \? undefined : a\.note/.test(code(report)));
ok("the suffix that says it once is still there",
  /nothing in your notes about this one/.test(code(report)));

// --- spelling may be fixed, sentences may not be finished --------------------
// "You noted alot to work on" reached a finished report. The fix has to be
// narrow: guessing the missing word in "had a bad at school" is the same
// instinct as filling an empty section, which is the thing this app must never
// do.
ok("obvious spelling is corrected", /Correct obvious spelling/.test(code(clean)));
ok("but an unfinished sentence is left alone",
  /Do NOT add words to complete a sentence/.test(code(clean)));
ok("and a missing word is not guessed at", /NOT guess at a word that is missing/.test(code(clean)));
ok("the coach's own terminology is still protected",
  /KEEP the coach's own words/.test(code(clean)));

// --- the label is not written in the first place -----------------------------
// Removing it from the payload fixed the report. It did not fix the table: the
// app was still stamping 'team' on every note it saved, and the next thing to
// read that column would have made the same mistake somewhere new.
ok("a note no longer claims it was about the team", !/subject_type: "team"/.test(code(db)));
ok("it says unknown, which is the truth",
  (code(db).match(/subject_type: "unknown"/g) ?? []).length === 2);
ok("and it no longer classifies the note either",
  !/observation_type: "team_observation"/.test(code(db)));

// --- the session says what it actually was -----------------------------------
// custom_type held "1 V 1" the whole time, was written since 0018, was read by
// the period report, and was never sent here. The single-session report saw
// type: "other" and nothing else.
ok("an 'other' session sends the coach's own name for it",
  /event\.custom_type\?\.trim\(\) \|\| "other"/.test(code(report)));
ok("and whether there is a squad behind it at all", /has_team: !!event\.team_id/.test(code(report)));

// --- house style -------------------------------------------------------------
ok("no em or en dashes in either", ![report, clean].some((s) => /[—–]/.test(s)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
