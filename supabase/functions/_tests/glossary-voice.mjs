// Checks the declared glossary (0017) as it reaches a prompt, via
// _shared/voice.ts glossaryInstruction(). No database: the function is pure, so
// the wording, the cap and the mirror-not-verdict boundary can all be asserted
// directly.
//
// Why the boundary matters enough to test: a glossary is the one place a coach
// hands the model a definition. That is exactly the input that could tip a
// report from mirroring into teaching ("you have used 'the pocket' loosely
// here"). The instruction has to keep saying it is for comprehension only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../_shared/voice.ts"), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond) => cond ? (pass++, console.log(`  ok  ${name}`)) : (fail++, console.log(`  FAIL ${name}`));
const eq = (name, got, want) => ok(`${name} (got ${JSON.stringify(got)})`, got === want);

// Lift the pure function out of the TypeScript source. It has no imports of its
// own and no types in the body, so stripping the interface and the type
// annotations is enough to run it as JavaScript.
function loadGlossaryInstruction() {
  const caps = src.match(/const GLOSSARY_MAX_TERMS = (\d+);[\s\S]*?const GLOSSARY_MAX_CHARS = (\d+);/);
  if (!caps) throw new Error("could not find the glossary caps in voice.ts");
  const body = src.match(/export function glossaryInstruction\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  if (!body) throw new Error("could not find glossaryInstruction in voice.ts");
  const js = body[1]
    .replace(/const lines: string\[\] = \[\];/, "const lines = [];")
    .replace(/: string/g, "");
  return new Function("entries", "GLOSSARY_MAX_TERMS", "GLOSSARY_MAX_CHARS", js)
    .bind(null);
}
const raw = loadGlossaryInstruction();
const MAX_TERMS = Number(src.match(/GLOSSARY_MAX_TERMS = (\d+)/)[1]);
const MAX_CHARS = Number(src.match(/GLOSSARY_MAX_CHARS = (\d+)/)[1]);
const gloss = (entries) => raw(entries, MAX_TERMS, MAX_CHARS);

console.log("glossary -> prompt");

// --- nothing in, nothing out ------------------------------------------------
eq("no glossary adds nothing", gloss(null), "");
eq("empty glossary adds nothing", gloss([]), "");
eq("a term with no meaning is skipped", gloss([{ term: "x", meaning: "  " }]), "");
eq("a meaning with no term is skipped", gloss([{ term: "", meaning: "y" }]), "");

// --- the coach's own words --------------------------------------------------
const one = gloss([{ term: "the pocket", meaning: "the space between their midfield and back line" }]);
ok("includes the term", one.includes('"the pocket"'));
ok("includes the meaning", one.includes("the space between their midfield and back line"));
ok("tells the model to use the coach's term", /rather than swapping in a synonym/i.test(one));

// --- mirror, not verdict ----------------------------------------------------
ok("forbids assessing the coach's usage", /do NOT assess whether their usage is correct/i.test(one));
ok("forbids explaining a term back to its author", /do NOT explain a term back/i.test(one));
ok("forbids importing a term the coach did not use", /unless the coach used it about this session/i.test(one));

// --- house style ------------------------------------------------------------
ok("no em or en dashes in the instruction", !/[—–]/.test(one));

// --- the cap ----------------------------------------------------------------
// Many long entries: the output must stay bounded, and must never cut an entry
// in half, because half a definition is worse than none.
const many = Array.from({ length: 200 }, (_, i) => ({
  term: `term-${i}`,
  meaning: `a fairly wordy definition number ${i} that goes on for a while to eat characters`,
}));
const capped = gloss(many);
ok(`stays within the ${MAX_CHARS} char cap (body ${capped.length})`, capped.length < MAX_CHARS + 600);
const quoted = (capped.match(/"term-\d+"/g) ?? []).length;
ok(`includes some but not all entries (${quoted} of 200)`, quoted > 0 && quoted < 200);
ok("never truncates an entry mid-definition", !/\.\.\.$|[a-z]$/.test(capped.trim().slice(-1) === "." ? "." : capped.trim()));
for (const line of capped.split("; ")) {
  if (line.includes('"term-')) {
    ok(`entry is whole: ${line.slice(0, 28)}...`, /means .+/.test(line));
    break;
  }
}

// --- newest first -----------------------------------------------------------
// voice.ts orders by created_at desc, so when a coach is over the cap it is the
// recent terms that survive. Assert the query says so.
ok("query takes newest first", /order\("created_at", \{ ascending: false \}\)/.test(src));
ok(`query limits to the term cap`, new RegExp(`limit\\(GLOSSARY_MAX_TERMS\\)`).test(src));

// --- it is actually reachable ------------------------------------------------
ok("voiceInstruction appends the glossary section", /out \+= glossaryInstruction\(/.test(src));
ok("glossary is fetched alongside the voice profile, not serially", /Promise\.all\(/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
