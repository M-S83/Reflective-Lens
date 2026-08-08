// The legal pages name a real person or company, or they must not ship.
//
// A coach signing up is handing over notes about children they coach. The
// privacy notice is where they find out who holds that, and how to get it back
// or get it deleted. One that says "The data controller is YOUR_LEGAL_ENTITY"
// is worse than none at all: it tells them nobody thought about the question.
//
// The details used to sit in the prose in five places across three pages, which
// is a good way to fill in four of them and publish the fifth. They are one
// block now, and this check fails while any is unfilled. It is meant to be red
// until they are answered: that is the point of it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../../web/src/screens/Legal.tsx"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// The comment above the block explains the placeholders by name, so reading it
// as code would report an unfilled value as filled, or the reverse.
const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const val = (name) => (code.match(new RegExp(`const ${name} = "([^"]*)"`)) ?? [])[1];

console.log("the legal pages name someone real");

// --- one place to fill in ----------------------------------------------------
ok("the details are in one block, not in the prose",
  ["CONTACT_EMAIL", "LEGAL_ENTITY", "JURISDICTION", "REGISTERED_ADDRESS"]
    .every((k) => val(k) !== undefined));
ok("nothing is written into the prose by hand",
  !/YOUR_[A-Z_]+/.test(code.replace(/const [A-Z_]+ = "[^"]*";/g, "")));

// --- and it is filled in -----------------------------------------------------
const email = val("CONTACT_EMAIL");
ok(`a contact address is set (${email})`, !!email && !email.startsWith("YOUR_"));
ok("it looks like an email address", /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? ""));

const entity = val("LEGAL_ENTITY");
ok(`a data controller is named (${entity})`, !!entity && !entity.startsWith("YOUR_"));

const juris = val("JURISDICTION");
ok(`a jurisdiction is set (${juris})`, !!juris && !juris.startsWith("YOUR_"));
// Separate legal systems, so this is not decoration.
ok("it is one of the UK legal systems",
  ["England and Wales", "Scotland", "Northern Ireland"].includes(juris ?? ""));

// A registered office is expected of a company and is not something to publish
// for a sole trader by default, so empty is a valid answer and must stay one.
ok("a missing address degrades rather than printing an empty gap",
  /REGISTERED_ADDRESS \? ` of \$\{REGISTERED_ADDRESS\}` : ""/.test(code));

// --- the pages say what is true right now ------------------------------------
// A tester on free beta reading "Plans are billed in advance" reasonably
// wonders what is about to come out of their account.
ok("there is a switch for whether anyone is being charged", /const CHARGING =/.test(code));
ok("and while it is off, both money pages say so",
  (code.match(/!CHARGING &&/g) ?? []).length >= 2);
ok("the refunds page is honest about having nothing to refund",
  /nothing to refund/i.test(src));

// --- and someone can actually get to them ------------------------------------
// The pages were routed and correct and reachable by nobody: no screen linked
// to them, and the routes sat behind the sign-in gate, so the one moment a
// coach most needs to read what happens to their notes about children, before
// handing any over, was the one moment the link bounced them to a sign-in form.
const app = readFileSync(join(here, "../../../web/src/App.tsx"), "utf8");
const signIn = readFileSync(join(here, "../../../web/src/screens/SignIn.tsx"), "utf8");
const account = readFileSync(join(here, "../../../web/src/screens/Account.tsx"), "utf8");
const appCode = app.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

ok("the legal routes are above the sign-in gate",
  appCode.indexOf('path="/privacy"') < appCode.indexOf("if (recovery)"));
ok("a signed-out visitor gets the page, not a sign-in form",
  /if \(!session\) \{[\s\S]{0,600}path="\/privacy"/.test(appCode));
ok("signing up links to them, which is when reading them matters",
  /to="\/privacy"/.test(signIn) && /to="\/terms"/.test(signIn));
ok("and Account links to all three",
  ["privacy", "terms", "refunds"].every((p) => new RegExp(`to="/${p}"`).test(account)));

// --- house style -------------------------------------------------------------
ok("no em or en dashes", !/[—–]/.test(src));
ok("the contact address is a live link, not text to retype",
  /href=\{`mailto:\$\{CONTACT_EMAIL\}`\}/.test(code));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(
    "\nThis check is SUPPOSED to fail until the block at the top of Legal.tsx is\n" +
    "filled in. It is the last thing standing between the app and real users.",
  );
}
process.exit(fail ? 1 : 0);
