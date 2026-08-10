// Chalk: the rules that stop it becoming a dark theme with a yellow accent.
//
// A palette is easy to keep. A SYSTEM is easy to lose, one reasonable-sounding
// exception at a time, and every exception below has already been argued for
// somewhere by somebody:
//
//   "just this one button in yellow, it needs to stand out"
//   "a subtle shadow would lift the cards"
//   "the ticks should be green, everyone knows green means done"
//
// Each of those is small and each of them dissolves the idea, because the idea
// is not the colours, it is that every colour has exactly one job. Yellow means
// the coach said this. The day it also means "tap here", a coach can no longer
// tell their own words from ours at a glance, and the design has stopped
// carrying the product's one promise.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = (p) => readFileSync(join(here, "../../../web", p), "utf8");
const css = web("src/index.css");
const ui = web("src/components/ui.tsx");
const evt = web("src/screens/EventDetail.tsx");
const thoughts = web("src/components/Thoughts.tsx");
const favicon = web("public/favicon.svg");
const pwa = web("public/pwa-icon.svg");
const vite = web("vite.config.ts");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// Comments here name the things being banned, so reading them as code would
// fail every check that says the thing is absent.
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

console.log("chalk: one job per colour");

// --- the one rule ------------------------------------------------------------
ok("the coach has a colour of their own", /--yours:\s*#e3c567/i.test(cssCode));
ok("and a class that applies it", /\.yours \{[^}]*color: var\(--yours\)/.test(cssCode));
// The whole system rests on this. A button wearing --yours means a coach can no
// longer tell their words from the app's, which is the one thing it exists for.
const buttons = cssCode.split("\n").filter((l) => /^\.btn|^\.chip|^\.pill|^\.tabbar|^\.tag/.test(l.trim()));
ok("no button, chip, pill or tag is ever --yours",
  !buttons.some((l) => /var\(--yours\)/.test(l) && !/outline/.test(l)));

// --- where the coach's words actually appear ---------------------------------
ok("a note in a session is in their colour", /className="yours"/.test(code(evt)));
ok("so is a thought", /className="yours"/.test(code(thoughts)));
ok("and every restated line in a report", /\.md li \{[^}]*var\(--yours\)/.test(cssCode));
// The frame around the quotes is the app talking and must not wear their colour,
// or the distinction the whole design exists to draw disappears.
ok("but a report's headings are not", !/\.md h2 \{[^}]*var\(--yours\)/.test(cssCode));
ok("nor is the question it asks at the end", /\.md p\s+\{[^}]*var\(--muted\)/.test(cssCode));
// "Transcribing..." is the app, not the coach. Nothing is theirs until it is,
// and a note that never arrives must not sit there wearing their colour as if
// it had. Written against the intent rather than the exact markup: this broke
// once already when the pending state grew a retry button, which was the test
// doing its job badly, not the code.
ok("a note still on its way is the app talking", /className="muted">Transcribing/.test(evt));
ok("and one that never arrived says so, also in the app's voice",
  /did not come back/.test(evt) && /Your recording is saved/.test(evt));
ok("neither is ever in the coach's colour",
  !/className="yours"[\s\S]{0,40}(Transcribing|did not come back)/.test(evt));

// --- the record button, where the rule does real work ------------------------
ok("the recorder is blue until it listens", /\.record \{[^}]*var\(--grass\)/.test(cssCode));
ok("and turns to the coach's colour once it does", /\.record\.on \{[^}]*var\(--yours\)/.test(cssCode));

// --- lines, not cards --------------------------------------------------------
// The single restriction that stops this being an ordinary dark interface,
// because rounded cards floating on soft shadows are exactly what those are.
ok("shadows are off at the token", /--shadow:\s*none/.test(cssCode));
ok("and a card does not set one", !/\.card \{[^}]*box-shadow/.test(cssCode));
ok("nor does the record button", !/\.record \{[^}]*box-shadow/.test(cssCode));
// The pulse ring is the one exception: it is motion, not depth, and it stops.
ok("the only box-shadow left is the recording pulse",
  (cssCode.match(/box-shadow/g) ?? []).length === 2 && /@keyframes pulse/.test(cssCode));
ok("nothing is a lozenge any more", !/border-radius:\s*999px/.test(cssCode));

// --- green is gone -----------------------------------------------------------
// Someone will want a green tick. Blue and yellow already carry every state.
const OLD = ["#2f8a57", "#123a2a", "#1f6b41", "#5cbb84", "#8fd6ac", "#3a9b68", "#e7f0e8", "#f6f5ef"];
ok("no pitch green anywhere in the stylesheet", !OLD.some((c) => cssCode.toLowerCase().includes(c)));
ok("nor in the icons", !OLD.some((c) => (favicon + pwa).toLowerCase().includes(c)));

// --- the mark ----------------------------------------------------------------
ok("the crosshair is gone", !/<line /.test(code(ui)));
ok("two circles, off centre", /cx="15"[\s\S]{0,120}cx="25"/.test(code(ui)));
// Two colours is not decoration. In one colour this is a Venn diagram.
ok("one filled with the coach's colour", /fill="var\(--yours\)"/.test(code(ui)));
ok("one drawn in chalk", /stroke="var\(--ink\)"/.test(code(ui)));
ok("the favicon matches", /#e3c567/i.test(favicon) && !/<line/.test(favicon));
ok("and so does the home screen icon", /#e3c567/i.test(pwa) && !/<line/.test(pwa));

// --- an unstyled button is not black -----------------------------------------
// Browsers set `color: buttontext` on a button, which is black and beats
// anything the page inherits. Half a dozen buttons in this app are plain
// tappable rows with no class of their own, so on a slate board the report
// titles and the "A thought" heading came out black while the muted date beside
// them looked right, because .muted set a colour explicitly. It reads as a
// theme that only half applied, and it is invisible in review because the
// markup says nothing about colour at all.
ok("a button inherits its colour", /^button \{[^}]*color: inherit/m.test(cssCode));
ok("and its font", /^button \{[^}]*font: inherit/m.test(cssCode));
// Element selector on purpose: every class that wants its own colour still wins.
ok("but the solid button keeps its own", /\.btn \{[^}]*color: var\(--ink\)/.test(cssCode));

// --- nothing on this board is dark text --------------------------------------
// Everything here is light on dark. One patch of near-black type on a pale fill
// fights the eye every time it lands there, and the solid button was exactly
// that: a pale blue slab carrying --paper. The fill went darker so the text
// could be chalk like everything else.
ok("the solid button carries chalk, not near-black", /\.btn \{[^}]*color: var\(--ink\)/.test(cssCode));
ok("and nothing anywhere uses the board colour as text",
  !/color: var\(--paper\)/.test(cssCode));

// --- the home screen icon is something a launcher can draw -------------------
// Android rasterises manifest icons itself and silently drops an entry whose
// icon it cannot render. Every icon here was an SVG, so the "Capture a thought"
// shortcut existed in the manifest and never once appeared on a phone.
ok("the manifest offers PNG icons", /pwa-icon-512\.png/.test(vite) && /pwa-icon-192\.png/.test(vite));
ok("including a maskable one", /pwa-icon-maskable\.png[\s\S]{0,80}maskable/.test(vite));
ok("and the shortcut icon is a PNG too", /shortcuts:[\s\S]{0,400}pwa-icon-96\.png/.test(vite));
ok("the service worker actually caches them", /globPatterns[^\]]*png/.test(vite));

// --- two voices --------------------------------------------------------------
// Colour alone was carrying the whole distinction, and colour is the thing that
// fails first: on a bright pitch, on a cheap screen, and for the one man in
// twelve who cannot separate yellow from grey-blue at all. Shape does not fail.
ok("the coach's words are set in a serif", /\.yours \{[^}]*Iowan Old Style/.test(cssCode));
ok("and so are the lines quoted back in a report", /\.md li \{[^}]*Iowan Old Style/.test(cssCode));
// The frame stays in the app's voice, or there are no longer two voices.
ok("a report's headings are not", !/\.md h2 \{[^}]*Iowan/.test(cssCode));
ok("nor is the question it ends on", !/\.md p\s+\{[^}]*Iowan/.test(cssCode));
// Georgia is the floor, not the choice. Iowan is on every Mac and iPhone.
ok("the serif stack prefers something better than Georgia",
  /Iowan Old Style[^;]*Palatino[^;]*Georgia/.test(cssCode));
// Not licensed, on purpose: a font that has not downloaded yet is invisible
// text on the screen someone opened to capture a thought in eight seconds.
ok("no web font is fetched", !/@font-face|fonts\.googleapis|fonts\.gstatic/.test(cssCode));
ok("and the reason is written down", /wrong one this month|invisible text/.test(css));
// The board label: how the app names things, small and spaced and never louder
// than what the coach wrote.
ok("the app labels things in small spaced capitals",
  /\.eyebrow \{[^}]*text-transform: uppercase/.test(cssCode) && /\.md h2 \{[^}]*text-transform: uppercase/.test(cssCode));

// --- one theme, deliberately -------------------------------------------------
// Not an oversight. Chalk is a slate board; a light variant is a different idea
// wearing the same name. Recorded so nobody "fixes" it by adding one quietly.
ok("there is no second theme", !/prefers-color-scheme/.test(cssCode));
ok("and the reason is written down", /ONE THEME, ON PURPOSE/.test(css));
ok("including what would change the decision", /direct\s*\n?\s*sunlight/.test(css));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
