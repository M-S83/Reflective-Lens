import { useEffect, useState } from "react";
import { TopBar, ErrorText, Loading } from "../components/ui";
import { DeleteAccount } from "../components/DeleteAccount";
import { FeedbackForm } from "../components/Feedback";
import { SetPasswordForm } from "../components/SetPassword";
import { useEntitlements } from "../lib/entitlements";
import { FEATURES, logFeature } from "../lib/features";
import {
  myGlossary,
  saveGlossaryTerm,
  removeGlossaryTerm,
  trialDaysLeft,
  type GlossaryEntry,
} from "../lib/account";

// One place for everything about the account rather than the person: the free
// month, the coach's own vocabulary, and the danger zone. DeleteAccount used to
// sit at the bottom of the home screen, which put "erase everything" one
// scroll below the day's work.
export default function Account() {
  const ent = useEntitlements();
  const [days, setDays] = useState<number | null>(null);
  const [terms, setTerms] = useState<GlossaryEntry[] | null>(null);
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    logFeature(FEATURES.accountOpened);
    trialDaysLeft().then(setDays).catch(() => {});
    myGlossary().then(setTerms).catch((e) => {
      setErr(e.message ?? "Could not load your words.");
      setTerms([]);
    });
  }, []);

  const add = async () => {
    const t = term.trim(), m = meaning.trim();
    if (!t || !m) return;
    setBusy(true);
    setErr("");
    try {
      await saveGlossaryTerm(t, m);
      logFeature(FEATURES.glossaryTermAdded, { term_length: t.length });
      setTerm("");
      setMeaning("");
      setTerms(await myGlossary());
    } catch (e) {
      setErr((e as Error).message ?? "Could not save that.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await removeGlossaryTerm(id);
      logFeature(FEATURES.glossaryTermRemoved);
      setTerms(await myGlossary());
    } catch (e) {
      setErr((e as Error).message ?? "Could not remove that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <TopBar title="Account" eyebrow="Your plan and your words" />
      <div className="screen stack">
        <ErrorText>{err}</ErrorText>

        {/* --- The free month ------------------------------------------- */}
        <div className="card stack">
          <strong>Your plan</strong>
          {ent.loading ? (
            <Loading />
          ) : ent.activeRoles.length > 0 ? (
            <div className="muted small">
              Active: {ent.activeRoles.join(" and ")}. Thank you.
            </div>
          ) : days === null ? (
            <div className="muted small">No plan yet.</div>
          ) : days > 0 ? (
            <div className="muted small">
              You have {days} {days === 1 ? "day" : "days"} left of your free month.
              Everything you have written stays yours either way.
            </div>
          ) : (
            <div className="muted small">
              Your free month has ended. You can still read and export everything
              you have written. Choose a plan to add new reflections and reports.
            </div>
          )}
        </div>

        {/* --- Signing in ------------------------------------------------ */}
        {/* Costs nothing and sends nothing. Anyone who joined before passwords
            existed has no working one, and this is how they get one without
            going out through an email to come back in again. */}
        <div className="card stack">
          <strong>Your password</strong>
          <div className="muted small">
            Set or change the password you sign in with. Signing in with a
            password sends no email, so you can come back as often as you like.
          </div>
          <SetPasswordForm />
        </div>

        {/* --- The coach's own words ------------------------------------ */}
        <div className="card stack">
          <strong>Your words</strong>
          <div className="muted small">
            If you have a term you use with your players, tell us what you mean by
            it. Your reports will use your word rather than swapping in a textbook
            one. This is only so the writing sounds like you: nothing here is
            marked, checked or corrected.
          </div>

          <div className="field">
            <label htmlFor="gl-term">Term</label>
            <input
              id="gl-term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="the pocket"
              maxLength={60}
            />
          </div>
          <div className="field">
            <label htmlFor="gl-meaning">What you mean by it</label>
            <textarea
              id="gl-meaning"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              placeholder="the space between their midfield and back line"
              rows={2}
              maxLength={240}
            />
          </div>
          <button
            className="btn"
            onClick={add}
            disabled={busy || !term.trim() || !meaning.trim()}
          >
            {busy ? "Saving" : "Add word"}
          </button>

          {terms === null ? (
            <Loading />
          ) : terms.length === 0 ? (
            <div className="muted small">
              Nothing yet. This is optional: reports read fine without it.
            </div>
          ) : (
            <div className="list">
              {terms.map((t) => (
                <div key={t.id} className="card">
                  <div className="row">
                    <strong>{t.term}</strong>
                    <div className="spacer" />
                    <button
                      className="btn small"
                      onClick={() => remove(t.id)}
                      disabled={busy}
                      aria-label={`Remove ${t.term}`}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>{t.meaning}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Beta feedback ------------------------------------------- */}
        <div className="card stack">
          <strong>Tell me something</strong>
          <div className="muted small">
            This is a beta, so what does not work is as useful to me as what
            does. Anything at all: a bug, a bit that made no sense, an idea.
          </div>
          <FeedbackForm />
        </div>

        <DeleteAccount />
      </div>
    </div>
  );
}
