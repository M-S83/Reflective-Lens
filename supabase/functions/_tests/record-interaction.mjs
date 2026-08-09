// Recording is a tap, not a hold, and it counts.
//
// Press and hold is the familiar gesture because messaging apps use it, and it
// is right for what they are for: two seconds of "on my way". A coach reflecting
// talks for thirty seconds to a minute and a half. Holding a button that long
// means holding the phone up the whole time, so they cannot walk to the car, put
// it on the bonnet, or set it down while they think, and a finger that slips
// ends the recording. The thing lost is the thing the app exists to keep.
//
// So: tap to start, tap to stop. That trade only works with a counter on screen.
// Without one the screen reads the same whether the microphone is running or the
// phone quietly refused it, and a coach can talk for a minute into nothing. A
// number climbing once a second is the proof that it is listening.
//
// This check exists because the copy drifted to "Hold to record" once already
// while the code underneath had always been a tap.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = (p) => readFileSync(join(here, "../../../web/src", p), "utf8");
const record = web("components/RecordButton.tsx");
const thoughts = web("components/Thoughts.tsx");
const eventDetail = web("screens/EventDetail.tsx");
const quick = web("components/QuickCapture.tsx");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// The comments here argue against the hold gesture by naming it, so reading them
// as code would fail every check that says the word is absent.
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

console.log("recording is a tap, and it counts");

// --- the gesture -------------------------------------------------------------
ok("starting and stopping hang off a tap", /onClick=\{toggle\}/.test(code(record)));
// A hold would arrive as one of these, and would not announce itself in review.
ok("no press and hold handlers",
  !/onPointerDown|onPointerUp|onMouseDown|onMouseUp|onTouchStart|onTouchEnd/.test(code(record)));
ok("one handler covers both directions", /const toggle = async \(\) =>/.test(code(record)));

// --- and the words match the gesture ----------------------------------------
ok("the recording label says tap to stop", /tap to stop/.test(record));
// Not the word on its own: QuickCapture tells an Android coach to press and hold
// the home screen ICON, which is Android's gesture and correct.
const labels = [...[thoughts, eventDetail].join("\n").matchAll(/label="([^"]*)"/g)].map((m) => m[1]);
ok("every record label offered to a coach exists", labels.length >= 3);
ok("and none of them says hold", !labels.some((l) => /hold/i.test(l)));
ok("nothing in the recorder tells anyone to hold", !/hold/i.test(code(record)));
// The rule above is about the RECORD button. Android's own gesture for a
// launcher shortcut is a long press, and scrubbing the word everywhere would
// take that instruction with it. Matched on the gesture rather than one
// phrasing of it, because the wording changed once already when the shortcut
// stopped being the headline advice.
ok("the home screen icon instruction still describes a long press",
  /long press|press and hold/i.test(quick) && /icon/i.test(quick));

// --- the counter -------------------------------------------------------------
ok("a second count is kept", /const \[secs, setSecs\] = useState\(0\)/.test(code(record)));
ok("the full button shows it", /Recording \$\{clock\(secs\)\}, tap to stop/.test(code(record)));
ok("so does the compact one", /`◼ \$\{clock\(secs\)\}`/.test(code(record)));
// A tick count drifts behind the audio it describes, because a phone with the
// screen off throttles timers. The wall clock does not care.
ok("it reads the wall clock rather than counting ticks",
  /Math\.floor\(\(Date\.now\(\) - from\) \/ 1000\)/.test(code(record)));
ok("it resets between recordings", /setSecs\(0\)/.test(code(record)));
ok("and the timer is cleared when recording stops", /return \(\) => clearInterval\(t\)/.test(code(record)));

// --- the formatting is right, by running it ---------------------------------
// Reading the source proves the counter is wired up. Running it proves 0:07 is
// not 0:7, which is the only part a coach actually reads.
const body = record.match(/function clock\(seconds: number\): string \{([\s\S]*?)\n\}/);
ok("clock() can be lifted out and run", !!body);
if (body) {
  const clock = new Function("seconds", body[1]);
  ok("zero reads as 0:00", clock(0) === "0:00");
  ok("seconds are padded", clock(7) === "0:07");
  ok("fifty nine stays in the first minute", clock(59) === "0:59");
  ok("sixty rolls over", clock(60) === "1:00");
  ok("a long reflection still reads plainly", clock(95) === "1:35");
  ok("and ten minutes does not break it", clock(605) === "10:05");
}

// --- house style -------------------------------------------------------------
ok("no em or en dashes", ![record, thoughts, quick].some((s) => /[—–]/.test(s)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
