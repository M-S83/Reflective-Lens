import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TopBar, ErrorText, Loading } from "../components/ui";
import { DeleteAccount } from "../components/DeleteAccount";
import { FeedbackForm } from "../components/Feedback";
import { SetPasswordForm } from "../components/SetPassword";
import { QuickCapture } from "../components/QuickCapture";
import { useEntitlements } from "../lib/entitlements";
import { FEATURES, logFeature } from "../lib/features";
import {
  myGlossary,
  saveGlossaryTerm,
  removeGlossaryTerm,
  type GlossaryEntry,
} from "../lib/account";

// One sentence per kind of access, and each one true. The rule underneath: say
// what they have, say when it ends if it ends, and never nag someone who was
// given the app for nothing.
function PlanLine() {
  const { access } = useEntitlements();
  const { kind, daysLeft, endsAt } = access;
  const on = endsAt
    ? new Date(endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const left = daysLeft === null ? "" : `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;

  if (kind === "comp") {
    return (
      <div className="muted small">
        Complimentary access, with no end date. Nothing to pay and nothing to renew.
      </div>
    );
  }
  if (kind === "beta") {
    return (
      <div className="muted small">
        You are on the beta, free until {on}{daysLeft !== null ? ` (${left})` : ""}.
        Everything you write stays yours, and we will tell you before anything changes.
      </div>
    );
  }
  if (kind === "paid") {
    return <div className="muted small">Your subscription is active. Thank you.</div>;
  }
  if (kind === "trial") {
    return (
      <div className="muted small">
        {daysLeft === null
          ? "You are on your free month."
          : `You have ${left} left of your free month${on ? `, ending ${on}` : ""}.`}{" "}
        Everything you have written stays yours either way.
      </div>
    );
  }
  if (kind === "lapsed") {
    return (
      <div className="muted small">
        Your free access has ended. You can still read and export everything you
        have written. Choose a plan to add new reflections and reports.
      </div>
    );
  }
  return <div className="muted small">No plan yet.</div>;
}

// One place for everything about the account rather than the person: the plan,
// the password, the coach's own vocabulary, and the danger zone. DeleteAccount
// used to sit at the bottom of the home screen, which put "erase everything"
// one scroll below the day's work.
export default function Account() {
  const ent = useEntitlements();
  const [terms, setTerms] = useState<GlossaryEntry[] | null>(null);
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    logFeature(FEATURES.accountOpened);
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

        {/* --- What you are on ------------------------------------------ */}
        {/* This used to lead with "Active: coach. Thank you." for anyone with
            usable access, which includes an unexpired trial. So a coach on their
            free month was thanked as though they were paying, and the countdown
            below it could never be reached: nobody was ever told their trial was
            running out. Reading the KIND of access rather than a boolean is what
            fixes it, and it is also what lets beta and comped accounts say
            something true. */}
        <div className="card stack">
          <strong>Your plan</strong>
          {ent.loading ? <Loading /> : <PlanLine />}
        </div>

        {/* --- Getting to the microphone --------------------------------- */}
        <QuickCapture />

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

        {/* The pages exist and are routed; without this nobody could reach them
            without typing the URL. */}
        <p className="muted small center">
          <a href="/walkthrough.html" target="_blank" rel="noreferrer">How it works</a>
          {" · "}
          <Link to="/privacy">Privacy</Link>
          {" · "}
          <Link to="/terms">Terms</Link>
          {" · "}
          <Link to="/refunds">Refunds</Link>
        </p>
      </div>
    </div>
  );
}
