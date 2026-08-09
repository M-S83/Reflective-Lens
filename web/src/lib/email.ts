// One spelling of an email address, everywhere the app sends one.
//
// Two accounts were created for coachmsmith19@gmail.com and
// Coachmsmith19@gmail.com. Gmail delivers both to the same inbox, so it is one
// person with one mailbox and two separate sets of sessions, and no sign that
// anything is wrong until they type it the other way one evening and find an
// empty app. The reset link would then hand them the second account rather than
// their work.
//
// The local part of an address is case-sensitive in the RFC and case-insensitive
// at every mail provider a coach will actually use. Following the RFC here would
// be correct and useless.
//
// Lowercasing at the point of sending is what stops the pair existing. It is not
// a substitute for the database refusing to guess between two that already do,
// which is what 0024 is for: this prevents, that copes.
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
