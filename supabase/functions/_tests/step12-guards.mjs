// Runnable check for dispatch steps 1-2. Replicates the EXACT predicates/mappings
// added to the edge functions and asserts branch behaviour. Not a DB test; it
// verifies the decision logic (PII stripping, blank-guard, no-overwrite guards).
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("FAIL:", name); } };
const hasNameField = (o) => JSON.stringify(o).match(/display_name|player_name|"name"/) !== null;

// ---- F1: generate-report roster/stats anonymisation (coach vs player) --------
const sheetPlayers = [{ shirt_number: 9, player_name: "Oscar Smith", position: "ST", is_starter: true }];
const matchStats = [{ player_id: "p1", goals: 2, assists: 1, yellow_cards: 0, red_cards: 0, clean_sheet: false, players: { display_name: "Oscar Smith", shirt_number: 9 } }];
for (const isPlayer of [false, true]) {
  const roster = isPlayer ? sheetPlayers
    : sheetPlayers.map((p) => ({ shirt: p.shirt_number, position: p.position, starter: p.is_starter }));
  const match_stats = isPlayer ? matchStats
    : matchStats.map((s) => ({ shirt: s.players?.shirt_number ?? null, goals: s.goals, assists: s.assists, yellow_cards: s.yellow_cards, red_cards: s.red_cards, clean_sheet: s.clean_sheet }));
  if (!isPlayer) {
    ok("F1 coach roster has no names", !hasNameField(roster));
    ok("F1 coach stats have no names", !hasNameField(match_stats));
    ok("F1 coach roster keeps shirt", roster[0].shirt === 9);
    ok("F1 coach stats keep shirt", match_stats[0].shirt === 9);
  } else {
    ok("F1 player path unchanged (roster identical)", JSON.stringify(roster) === JSON.stringify(sheetPlayers));
    ok("F1 player path unchanged (stats identical)", JSON.stringify(match_stats) === JSON.stringify(matchStats));
  }
}

// ---- F1: generate-period-report perPlayer label + no age_group ---------------
const stats = [{ player_id: "p1", goals: 1, assists: 0, players: { shirt_number: 7 } }];
const perPlayer = {};
for (const s of stats) {
  const shirt = s.players?.shirt_number;
  const name = shirt != null ? `#${shirt}` : "Unknown";
  const p = (perPlayer[s.player_id] ??= { name, goals: 0, assists: 0, apps: 0 });
  p.goals += s.goals ?? 0; p.assists += s.assists ?? 0; p.apps += 1;
}
ok("F1 period perPlayer uses #shirt", perPlayer.p1.name === "#7");
// PII check: no display_name/player_name keys, and every label is a shirt (#n) or "Unknown".
ok("F1 period players has no real names",
  !/display_name|player_name/.test(JSON.stringify(Object.values(perPlayer))) &&
  Object.values(perPlayer).every((p) => /^#\d+$/.test(p.name) || p.name === "Unknown"));
const team = { name: "Eagles", format: "9v9" }; // age_group removed
ok("F1 period team payload has no age_group", !("age_group" in team));

// ---- F19: generate-period-report blank guard ---------------------------------
const structuredOf = (c) => !!((Array.isArray(c.sections) && c.sections.length) || c.headline || c.results_summary || (Array.isArray(c.recurring_themes) && c.recurring_themes.length));
const markdownFor = (heading, raw, c) => structuredOf(c)
  ? `# ${heading}\n\n[structured]`
  : `# ${heading}\n\n${(raw ?? "").trim() || "_The report came back empty. Please try generating it again._"}`;
ok("F19 structured -> structured md", structuredOf({ headline: "x", sections: [] }) === true);
ok("F19 empty json + raw text -> raw fallback (not blank)", markdownFor("H", "some prose", {}).includes("some prose"));
ok("F19 empty json + empty raw -> retry message (never blank body)", markdownFor("H", "", {}).includes("came back empty"));
ok("F19 garbage never yields body-only-heading", markdownFor("H", "", {}) !== "# H\n\n");

// ---- F20: enrich-reflection empty guard --------------------------------------
const enrichWrites = (raw) => { const s = (raw ?? "").trim(); return s ? { write: true } : { write: false }; };
ok("F20 empty reply -> no write", enrichWrites("   ").write === false);
ok("F20 real reply -> write", enrichWrites("A tidy enriched summary.").write === true);

// ---- F21: review-intent empty guard ------------------------------------------
const reviewWrites = (review) => review.length === 0 ? { write: false } : { write: true };
ok("F21 empty review (parse fail) -> no write", reviewWrites([]).write === false);
ok("F21 real review -> write", reviewWrites([{ item: "press", status: "showed_up", evidence: "note" }]).write === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
