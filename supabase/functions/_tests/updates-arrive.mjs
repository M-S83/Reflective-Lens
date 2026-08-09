// A fix has to reach the phone it was written for.
//
// The service worker is registered with autoUpdate, so a new one installs and
// claims the page on its own. What nothing did was RELOAD, so the tab carried on
// showing the assets the previous worker had already handed it and the fix only
// appeared on the visit after next. "Refresh twice" is not a fix, it is an
// instruction nobody follows and nobody should be given.
//
// It cost most of an evening: a shipped design, a repaired note and a button
// that was no longer black, all invisible on the phone in front of us while the
// code had been right for hours. Every tester would have hit the same thing
// after every push, and reported bugs that no longer existed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, "../../../web/src/main.tsx"), "utf8");
const vite = readFileSync(join(here, "../../../web/vite.config.ts"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

console.log("an update reaches the phone");

ok("the worker updates itself", /registerType: "autoUpdate"/.test(code(vite)));
ok("and the page listens for the handover", /addEventListener\("controllerchange"/.test(code(main)));
ok("and reloads when it happens", /window\.location\.reload\(\)/.test(code(main)));
// Two guards, both needed. Without the first, a brand new install reloads a page
// that has only just loaded, which reads as a fault. Without the second, a
// worker that changes twice can put the app in a reload loop.
ok("but not on a first ever install", /hadController/.test(code(main)));
ok("and never more than once", /reloaded = true/.test(code(main)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
