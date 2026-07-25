// F17: one constant-time compare, used everywhere. Asserts (a) the shared
// timingSafeEqual returns the same boolean as a plain === for all inputs, and
// (b) run-learning and purge-due-accounts now use it instead of plain !==.
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };

// shared impl (verbatim from _shared/crypto.ts)
const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const pairs = [
  ["", ""], ["a", "a"], ["a", "b"], ["abc", "abc"], ["abc", "abd"],
  ["short", "longer"], ["secret123", "secret123"], ["secret123", "secret124"],
  ["café ✓", "café ✓"], ["café ✓", "café ✗"], ["x", ""], ["", "y"],
  ["a".repeat(64), "a".repeat(64)], ["a".repeat(64), "a".repeat(63) + "b"],
];
for (const [i, [a, b]] of pairs.entries()) {
  ok(`F17 equivalence to === (#${i})`, timingSafeEqual(a, b) === (a === b));
}

// call-site verification
const runLearning = readFileSync("supabase/functions/run-learning/index.ts", "utf8");
const purge = readFileSync("supabase/functions/purge-due-accounts/index.ts", "utf8");
const clients = readFileSync("supabase/functions/_shared/clients.ts", "utf8");
const billing = readFileSync("supabase/functions/billing-webhook/index.ts", "utf8");

ok("F17 run-learning uses timingSafeEqual", runLearning.includes("timingSafeEqual(provided, secret)"));
ok("F17 run-learning no plain '!== secret'", !runLearning.includes("provided !== secret"));
ok("F17 purge-due-accounts uses timingSafeEqual", purge.includes("timingSafeEqual(provided, secret)"));
ok("F17 purge-due-accounts no plain '!== secret'", !purge.includes("provided !== secret"));
ok("F17 clients.ts imports shared compare", clients.includes('from "./crypto.ts"') && !clients.includes("function constantTimeEqual"));
ok("F17 billing-webhook imports shared compare", billing.includes('from "../_shared/crypto.ts"') && !billing.includes("function timingSafeEqual"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
