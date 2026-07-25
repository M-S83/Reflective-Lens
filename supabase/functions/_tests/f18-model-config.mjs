// F18: model_config (migration 0010) is authoritative at runtime; the MODELS map
// in clients.ts is the fallback. This asserts (a) resolveModel picks model_config
// over the passed default, and (b) the MODELS fallback matches the 0010 seed for
// every feature, so the two sources cannot drift.
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };

// (a) runtime authority — resolveModel logic (verbatim from clients.ts).
const resolveModel = (feature, fallback, entry, over, userIsOverBudget) => {
  if (!feature) return fallback;
  const base = entry ?? fallback;
  if (over && over !== base && userIsOverBudget) return over;
  return base;
};
ok("F18 model_config wins over the passed default", resolveModel("generate-report", "claude-opus-4-8", "claude-sonnet-5") === "claude-sonnet-5");
ok("F18 fallback used when model_config has no row", resolveModel("x", "claude-haiku-4-5", undefined) === "claude-haiku-4-5");
ok("F18 over-budget model used only when over budget", resolveModel("enrich-reflection", "x", "claude-sonnet-5", "claude-haiku-4-5", true) === "claude-haiku-4-5");
ok("F18 base model used when under budget", resolveModel("enrich-reflection", "x", "claude-sonnet-5", "claude-haiku-4-5", false) === "claude-sonnet-5");

// (b) anti-drift — MODELS (clients.ts) vs the 0010 seed.
const clients = readFileSync("supabase/functions/_shared/clients.ts", "utf8");
const seed = readFileSync("supabase/migrations/0010_model_config.sql", "utf8");

// MODELS camelCase key -> model_config feature string.
const KEY_TO_FEATURE = {
  cleanObservation: "clean-observation",
  reflectionQuestions: "generate-reflection-questions",
  reviewIntent: "review-intent",
  voiceProfile: "update-voice-profile",
  teamSheet: "process-team-sheet",
  enrichReflection: "enrich-reflection",
  report: "generate-report",
  periodReport: "generate-period-report",
  playerSummary: "generate-player-summary",
};

// Parse MODELS map entries: `key: "model", ...` inside the MODELS block.
const modelsBlock = clients.slice(clients.indexOf("export const MODELS = {"), clients.indexOf("} as const;"));
const modelsMap = {};
for (const m of modelsBlock.matchAll(/(\w+):\s*"([^"]+)"/g)) modelsMap[m[1]] = m[2];

// Parse 0010 seed rows: ('feature', 'model')
const seedMap = {};
for (const m of seed.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)) seedMap[m[1]] = m[2];

ok("F18 MODELS has all 9 features", Object.keys(KEY_TO_FEATURE).every((k) => modelsMap[k]));
ok("F18 seed has all 9 features", Object.values(KEY_TO_FEATURE).every((f) => seedMap[f]));
for (const [key, feature] of Object.entries(KEY_TO_FEATURE)) {
  ok(`F18 no drift: ${feature}`, modelsMap[key] === seedMap[feature]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
