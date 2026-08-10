// Getting the app onto the home screen, which is the step everything else waits
// behind. Until it is an icon it is a tab among fifty tabs, and a thought in a
// car park does not survive being looked for.
//
// Two faults made the offer effectively invisible:
//
//   The browser fires `beforeinstallprompt` ONCE, about a second after load.
//   The listener sat in a useEffect inside a card on the Account tab, so it only
//   began listening if a coach opened that tab, minutes too late. The button
//   existed in the code and almost nobody could ever have seen it.
//
//   And the card was only on the Account tab and /capture. Nobody looking for
//   it would find it, and nobody who was not looking would meet it at all.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = (p) => readFileSync(join(here, "../../../web/src", p), "utf8");
const install = web("lib/install.ts");
const main = web("main.tsx");
const ui = web("components/ui.tsx");
const card = web("components/QuickCapture.tsx");
const home = web("screens/Home.tsx");
const cssCode = readFileSync(join(here, "../../../web/src/index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

console.log("the offer to install actually reaches people");

// --- caught, not missed ------------------------------------------------------
ok("something listens for the browser's offer", /beforeinstallprompt/.test(code(install)));
ok("and it starts before React renders", /watchForInstallPrompt\(\)/.test(code(main)));
ok("the hook reads that store rather than listening late",
  /useSyncExternalStore\(subscribeToInstall/.test(code(ui)));
ok("no component starts its own listener",
  !/addEventListener\("beforeinstallprompt"/.test(code(ui) + code(card) + code(home)));
// Chrome's own banner arrives on its own schedule and cannot be put next to an
// explanation, so the event is taken over rather than left alone.
ok("the browser's own banner is suppressed", /e\.preventDefault\(\)/.test(code(install)));
// The event is single use. Left in place it becomes a button that silently does
// nothing the second time it is pressed.
ok("the offer is spent once used", /deferred = null/.test(code(install)));
ok("and cleared if they install another way", /appinstalled/.test(code(install)));

// --- and it is somewhere people are -----------------------------------------
ok("the card is on the home screen, not just Account", /QuickCapture/.test(code(home)));
// Gated on not being installed, however the markup around it is arranged. The
// previous version of this matched one line of JSX and broke the moment the
// floating variant needed a ternary, which is the test being brittle rather
// than the code being wrong.
ok("it hides itself once installed",
  /!isStandalone\(\) &&[\s\S]{0,120}QuickCapture/.test(code(home)));
// Two offers on one screen disagree with each other and both read as nagging.
ok("there is only one install offer on Home",
  (code(home).match(/canInstall/g) ?? []).length === 0);

// --- it arrives rather than waiting to be noticed ----------------------------
// What a coach remembers from other apps is a prompt that comes to them. Chrome
// would do that itself, but only if the event is left alone, and then it turns
// up on its own schedule with no room to say why the icon matters. So the offer
// is taken over and delivered as a sheet above the tab bar instead.
ok("the offer floats on the home screen", /<QuickCapture floating \/>/.test(code(home)));
ok("and the sheet sits above the tab bar", /\.install-sheet \{[^}]*position: fixed/.test(cssCode));
ok("clear of it, never over it", /\.install-sheet \{[^}]*bottom: calc\(58px/.test(cssCode));
// Motion is what makes it read as arriving rather than as something that was
// always there and missed. Off for anyone who has asked for less of it.
ok("it slides in", /animation: rise/.test(cssCode));
ok("unless motion is unwelcome", /prefers-reduced-motion[\s\S]{0,80}\.install-sheet \{ animation: none/.test(cssCode));
// A sheet with nothing to press is a nag. On Android that means waiting for the
// browser's offer; on an installed iPhone there is no Share menu in here at all.
ok("it stays away when there is nothing to press",
  /if \(floating && !\(canInstall \|\| \(ios && !installed\)\)\) return null;/.test(code(card)));
// The detailed Safari steps need room to be read, so /capture keeps the card.
ok("but /capture still gets the full card", /capture \? <QuickCapture onCapturePage \/>/.test(code(home)));

// --- the button says what it does -------------------------------------------
ok("there is a real button", /Add Reflective Lens to my home screen/.test(card));
// A button that would do nothing is worse than a sentence saying where to look.
ok("and a fallback when the browser makes no offer",
  /canInstall \?/.test(code(card)) && /Install app/.test(card));

// --- not now means not now ---------------------------------------------------
ok("dismissal survives a reload", /localStorage\.setItem\(HIDDEN/.test(code(card)));
ok("and is read back on the next visit", /localStorage\.getItem\(HIDDEN\)/.test(code(card)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
