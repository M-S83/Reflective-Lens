// Runnable check for the under-18 name-privacy helper (_shared/names.ts).
// The module is Deno-flavoured (.ts, no Node imports), so this test mirrors its
// exact logic and asserts the rules: first-name-only for U18, last initial only
// to disambiguate, protective default, display_name fallback, surname strip.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };

const isUnder18 = (ag) => { if (!ag) return true; const m = String(ag).match(/(\d{1,2})/); if (!m) return true; return parseInt(m[1], 10) <= 18; };
const parts = (p) => {
  let first = (p.first_name ?? "").trim(); let last = (p.last_name ?? "").trim();
  if (!first && p.display_name) { const t = String(p.display_name).trim().split(/\s+/); first = t[0] ?? ""; if (!last && t.length > 1) last = t[t.length - 1]; }
  return { first, last };
};
const safeNameMap = (players, under18) => {
  const map = {};
  if (!under18) { for (const p of players) if (p.id) { const { first, last } = parts(p); map[p.id] = (p.display_name ?? [first, last].filter(Boolean).join(" ")) || "A player"; } return map; }
  const fc = {}; for (const p of players) { const f = parts(p).first.toLowerCase(); if (f) fc[f] = (fc[f] ?? 0) + 1; }
  for (const p of players) { if (!p.id) continue; const { first, last } = parts(p); if (!first) { map[p.id] = "A player"; continue; } const li = last.slice(0, 1); map[p.id] = (fc[first.toLowerCase()] > 1 && li) ? `${first} ${li}` : first; }
  return map;
};
const stripSurnames = (text, players) => {
  const s = new Set(); for (const p of players) { const l = parts(p).last; if (l && l.length >= 2) s.add(l); }
  let out = text; for (const x of s) { const e = x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); out = out.replace(new RegExp(`\\s*\\b${e}\\b`, "gi"), ""); }
  return out.replace(/\s{2,}/g, " ").trim();
};

// isUnder18
ok("U12 -> under 18", isUnder18("U12") === true);
ok("U18 -> under 18 (age group of minors)", isUnder18("U18") === true);
ok("U16 -> under 18", isUnder18("U16") === true);
ok("U21 -> adult group", isUnder18("U21") === false);
ok("Open -> non-numeric -> protective", isUnder18("Open") === true);
ok("null age -> protective (under 18)", isUnder18(null) === true);
ok("Adults 21s -> not under 18", isUnder18("21s") === false);

// first-name-only, disambiguation
{
  const squad = [
    { id: "a", first_name: "Michael", last_name: "Smith" },
    { id: "b", first_name: "Michael", last_name: "Brown" },
    { id: "c", first_name: "Oscar", last_name: "Jones" },
  ];
  const m = safeNameMap(squad, true);
  ok("U18 unique first name -> first only", m.c === "Oscar");
  ok("U18 duplicate first -> first + last initial (Smith)", m.a === "Michael S");
  ok("U18 duplicate first -> first + last initial (Brown)", m.b === "Michael B");
  ok("U18 no surnames leaked in map", !JSON.stringify(m).match(/Smith|Brown|Jones/));
}

// display_name-only players (app-created) still get first-name-only
{
  const squad = [{ id: "a", display_name: "Oscar Smith" }, { id: "b", display_name: "Leo Brown" }];
  const m = safeNameMap(squad, true);
  ok("U18 display_name fallback -> first token", m.a === "Oscar" && m.b === "Leo");
}

// adults get full names
{
  const m = safeNameMap([{ id: "a", first_name: "John", last_name: "Doe", display_name: "John Doe" }], false);
  ok("adult -> full name", m.a === "John Doe");
}

// surname strip on a transcript
{
  const squad = [{ first_name: "Oscar", last_name: "Smith" }, { first_name: "Leo", last_name: "Brown" }];
  const out = stripSurnames("Oscar Smith pressed well and Leo Brown tracked back", squad);
  ok("strip removes surnames, keeps first names", out === "Oscar pressed well and Leo tracked back");
  ok("strip leaves no surname behind", !/Smith|Brown/.test(out));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
