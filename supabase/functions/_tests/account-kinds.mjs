// What the app SAYS about someone's plan, per kind of account.
//
// The bug this locks shut: Account led with "Active: coach. Thank you." for
// anyone whose access was usable, and activeRoles includes an unexpired trial.
// So a coach on their free month was thanked as though they were paying, and
// the countdown written underneath it was unreachable. Nobody was ever told
// their trial was running out, which is the one thing a trial has to say.
//
// Reading a boolean could not have said anything else. Access is now a KIND,
// and each kind gets a sentence that is true of it:
//
//   trial   the free month, counting down
//   beta    granted, ends on a date, says which
//   comp    given for nothing, so nothing counts down and nothing is sold
//   paid    a real subscription
//   lapsed  read-only, and says the work is still there
//
// The comped line matters most. Someone you gave the app to must never be
// nagged about days left or asked to choose a plan.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = (p) => readFileSync(join(here, "../../../web/src", p), "utf8");
const acct = web("screens/Account.tsx");
const ent = web("lib/entitlements.tsx");
const dash = web("screens/Dashboard.tsx");
const lib = web("lib/accounts.ts");
const sql = readFileSync(join(here, "../../migrations/0022_account_kinds.sql"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// Comments quote the old wording to explain what was wrong, so reading them as
// code would let a check pass on an explanation of the bug rather than its fix.
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

console.log("beta, comped and paid accounts");

// --- the kinds exist ---------------------------------------------------------
ok("access is a kind, not a boolean", /export type AccessKind =/.test(ent));
for (const k of ["trial", "beta", "comp", "paid", "lapsed", "none"]) {
  ok(`  ${k} is one of them`, new RegExp(`"${k}"`).test(code(ent)));
}
ok("the kind comes from the plan, not from matching ids in the frontend",
  /features\?\.kind/.test(code(ent)));
ok("an untagged plan is treated as paying", /\?\? "paid"/.test(code(ent)));

// --- the old bug cannot come back --------------------------------------------
ok("Account no longer decides from activeRoles alone",
  !/activeRoles\.length > 0 \?/.test(code(acct)));
ok("and no longer thanks a trial for paying",
  !/Active: \{ent\.activeRoles/.test(code(acct)));
ok("the trial line actually counts down", /left of your free month/.test(acct));

// --- comped accounts are not sold to ----------------------------------------
const comp = (acct.match(/if \(kind === "comp"\)[\s\S]*?\n  \}/) ?? [""])[0];
ok("there is a line for complimentary access", comp.length > 0);
ok("it says there is no end date", /no end date/i.test(comp));
ok("it does not count days at them", !/days? left|daysLeft/.test(comp));
ok("it does not ask them to choose a plan", !/choose a plan/i.test(comp));
ok("and nothing is owed", /nothing to pay/i.test(comp));

// --- beta says when it ends --------------------------------------------------
const beta = (acct.match(/if \(kind === "beta"\)[\s\S]*?\n  \}/) ?? [""])[0];
ok("there is a line for beta", beta.length > 0);
ok("it names the end date", /\{on\}/.test(beta));
ok("British date format", /toLocaleDateString\("en-GB"/.test(acct));

// --- lapsing is not a punishment --------------------------------------------
const lapsed = (acct.match(/if \(kind === "lapsed"\)[\s\S]*?\n  \}/) ?? [""])[0];
ok("a lapsed account is told the work is still there", /read and export/i.test(lapsed));

// --- house style -------------------------------------------------------------
ok("no em or en dashes in Account", !/[—–]/.test(acct));
ok("no em or en dashes in the migration", !/[—–]/.test(sql.replace(/^--.*$/gm, "")));

// --- granting is admin-only, in the database --------------------------------
// Hiding the button is not access control: the check has to be somewhere a
// direct call cannot skip.
ok("grant_plan refuses non-admins", /if not public\.is_admin\(\) then\s*\n\s*raise exception 'grant_plan/.test(sql));
ok("revoke_plan refuses non-admins", /if not public\.is_admin\(\) then\s*\n\s*raise exception 'revoke_plan/.test(sql));
// Views carry no RLS, so without this the account list is every user's email
// address, readable by anyone signed in.
ok("the accounts view gates itself", /where public\.is_admin\(\);/.test(sql));

// --- the two granted plans cannot be bought ---------------------------------
ok("beta and comp are off the catalogue", /'coach_beta'[\s\S]{0,400}false[\s\S]{0,400}'coach_comp'[\s\S]{0,400}false/.test(sql));
ok("and priced at zero, so they are not revenue", /0, 'month', false/.test(sql));

// --- one clock ---------------------------------------------------------------
// The free month starts itself on first sign-in, so everyone granted anything
// already has a trial ticking. Two clocks means Account counts down the wrong one.
ok("granting retires the other trials", /set status = 'canceled'[\s\S]{0,200}status = 'trialing'/.test(sql));
ok("revoking keeps the row, so no second free month", /Cancels rather than deletes/.test(sql));
ok("trial_days_left is corrected for non-trial access", /when exists \(select 1 from public\.subscriptions s\s*\n\s*where s\.user_id = _user_id and s\.status = 'active'\) then 0/.test(sql));

// --- the owner can actually do it -------------------------------------------
ok("the dashboard has an accounts panel", /function AccountsPanel/.test(dash));
ok("it is on the owner screen", /<AccountsPanel \/>/.test(code(dash)));
ok("it can grant", /grantPlan\(/.test(code(dash)));
ok("and revoke", /revokePlan\(/.test(code(dash)));
// Sending days with a complimentary grant would give a gift a countdown.
ok("days are only sent for the timed plan", /timed \? days : null/.test(code(dash)));
ok("it reports back what actually happened", /setSaid\(await fn\(\)\)/.test(code(dash)));
ok("the lib reads the gated view", /from\("admin_accounts"\)/.test(code(lib)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
