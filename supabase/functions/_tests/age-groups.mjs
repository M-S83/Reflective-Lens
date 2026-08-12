// What a team's age group is allowed to be, and what happens when it is
// something else.
//
// This is the field that decides whether a child's surname leaves the app. It
// drives isUnder18, which drives safeNameMap and stripSurnames, which are the
// only things standing between a squad list and two third-party processors.
//
// It used to be free text with a "U12" placeholder, read by pulling the first
// one or two digits out of whatever was typed. Two ordinary team names turned
// the protection off without saying anything:
//
//   "U19"   -> 19 -> adult. U19 squads routinely contain 17-year-olds.
//   "2013s" -> 20 -> adult. Birth-year naming is normal in grassroots.
//
// So it is a picker now, and the rule is inverted: name the adult case and
// protect everything else. This test reads the REAL source of both halves
// rather than a copy of the logic, because a test that mirrors the function it
// is checking passes just as happily when the function is wrong.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const namesSrc = readFileSync(join(here, "../_shared/names.ts"), "utf8");
const typesSrc = readFileSync(join(here, "../../../web/src/lib/types.ts"), "utf8");
const teamsSrc = readFileSync(join(here, "../../../web/src/screens/Teams.tsx"), "utf8");
const detailSrc = readFileSync(join(here, "../../../web/src/screens/TeamDetail.tsx"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

console.log("age groups: the picker and the protection agree");

// --- lift the real isUnder18 out of _shared/names.ts ------------------------
// Deno-flavoured TypeScript, so it cannot be imported. Strip the types and
// evaluate the actual text of the function that ships.
// The string const first: matching the function pattern first makes the lazy
// body match run straight past it and swallow whatever follows.
const liftConst = (src, name) => {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*"[^"]*";`));
  if (!m) throw new Error(`could not lift const ${name}`);
  return m[0].replace("export ", "");
};
const liftFn = (src, name) => {
  const m = src.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`could not lift function ${name}`);
  return m[0].replace("export ", "").replace(/: string \| null \| undefined/g, "").replace(/\): boolean/g, ")");
};
const adultSrc = liftConst(namesSrc, "ADULT_AGE_GROUP");
const under18Src = liftFn(namesSrc, "isUnder18");
// Guard the lift itself. A regex that quietly captured nothing useful would
// make every assertion below pass against a stub.
if (adultSrc.includes("function")) throw new Error("const lift swallowed the function");
if (!/isUnder18/.test(under18Src) || under18Src.length < 40) throw new Error("function lift is too thin");
const ADULT_AGE_GROUP = eval(`${adultSrc} ADULT_AGE_GROUP`);
const isUnder18 = eval(`${adultSrc} ${under18Src} isUnder18`);

// --- the two lists, from their real files -----------------------------------
const AGE_GROUPS = eval(
  typesSrc.match(/export const AGE_GROUPS: string\[\] = \[[\s\S]*?\];/)[0]
    .replace("export const AGE_GROUPS: string[] =", "")
    .replace(/ADULT_AGE_GROUP/g, JSON.stringify(ADULT_AGE_GROUP))
    .replace(/;$/, ""),
);

// --- the picker and the protection are the same set -------------------------
ok("web and edge agree on the adult label", typesSrc.includes(`export const ADULT_AGE_GROUP = "${ADULT_AGE_GROUP}"`));
ok("the adult label is in the picker", AGE_GROUPS.includes(ADULT_AGE_GROUP));
ok("exactly one picker option is adult", AGE_GROUPS.filter((a) => !isUnder18(a)).length === 1);
ok("every other picker option is protected",
  AGE_GROUPS.filter((a) => a !== ADULT_AGE_GROUP).every((a) => isUnder18(a)));
ok("the picker covers U6 to U18", ["U6", "U10", "U12", "U16", "U18"].every((a) => AGE_GROUPS.includes(a)));

// --- the two names that used to break it ------------------------------------
ok("U19 is protected (a U19 squad contains 17-year-olds)", isUnder18("U19") === true);
ok("2013s is protected (birth-year naming, used to parse as 20)", isUnder18("2013s") === true);
ok("07s is protected", isUnder18("07s") === true);
ok("21s is protected (nothing recognises it)", isUnder18("21s") === true);
ok("U21 is protected (not an option, so it can only be legacy text)", isUnder18("U21") === true);

// --- unknown, empty and junk all fall the safe way --------------------------
ok("null is protected", isUnder18(null) === true);
ok("undefined is protected", isUnder18(undefined) === true);
ok("empty string is protected", isUnder18("") === true);
ok("Youth is protected", isUnder18("Youth") === true);
ok("Open is protected", isUnder18("Open") === true);
ok("a stray four-digit year is protected", isUnder18("2013") === true);

// --- the adult case still works, and is forgiving about case and spacing -----
ok("the adult label is adult", isUnder18(ADULT_AGE_GROUP) === false);
ok("adult label, lowercased", isUnder18(ADULT_AGE_GROUP.toLowerCase()) === false);
ok("adult label, padded", isUnder18(`  ${ADULT_AGE_GROUP}  `) === false);

// --- nothing infers an age from a number any more ---------------------------
ok("isUnder18 does not parse digits", !/parseInt|match\(\/|\\d/.test(under18Src));

// --- the screen actually uses the picker ------------------------------------
ok("Teams.tsx renders a select over AGE_GROUPS",
  /AGE_GROUPS\.map/.test(teamsSrc) && /<select[\s\S]*?value=\{age\}/.test(teamsSrc));
ok("Teams.tsx no longer has a free-text age input", !/placeholder="U12"/.test(teamsSrc));
ok("age group must be chosen before a team can be made", /disabled=\{busy[^}]*!age\}/.test(teamsSrc));

// --- and it can be changed afterwards -----------------------------------------
// Teams made before the picker hold free text, which now reads as under-18.
// That is the safe way to fail, but only if there is a way out: without an edit
// surface an adult squad is stuck on first names for good.
ok("TeamDetail can set the age group", /setTeamAgeGroup\(/.test(detailSrc));
ok("TeamDetail offers the same list", /AGE_GROUPS\.map/.test(detailSrc));
ok("unrecognised legacy text is shown as unrecognised rather than hidden",
  /not recognised/.test(detailSrc));
ok("the screen says what the setting does",
  /first name only/i.test(detailSrc) && /named in full/i.test(detailSrc));

// --- house style --------------------------------------------------------------
ok("no em or en dashes in the picker", !AGE_GROUPS.some((a) => /[—–]/.test(a)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
