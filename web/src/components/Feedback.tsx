import { useState } from "react";
import { ErrorText } from "./ui";
import { FEEDBACK_KINDS, sendFeedback, type FeedbackKind } from "../lib/feedback";
import { FEATURES, logFeature } from "../lib/features";

// The beta feedback form, as a panel on the Account screen and as a floating
// button everywhere else.
//
// Two things drive the design. It has to be reachable AT the moment something
// goes wrong, because a tester who has to navigate somewhere to complain mostly
// will not bother. And it has to ask almost nothing: one choice, one box. Every
// extra field is another reason to close it.
export function FeedbackForm({ onDone }: { onDone?: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("issue");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await sendFeedback(kind, message);
      logFeature(FEATURES.feedbackSent, { kind });
      setSent(true);
      setMessage("");
      onDone?.();
    } catch (e) {
      setErr((e as Error).message ?? "Could not send that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="stack">
        <div className="banner">Thank you, that has reached me.</div>
        <button className="btn" onClick={() => setSent(false)}>Say something else</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <ErrorText>{err}</ErrorText>
      <div className="chipset">
        {FEEDBACK_KINDS.map((k) => (
          <button
            key={k.value}
            className={`chip ${kind === k.value ? "on" : ""}`}
            onClick={() => setKind(k.value)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="field">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What happened, or what would make this better?"
          rows={4}
          maxLength={2000}
          aria-label="Your feedback"
        />
      </div>
      <button className="btn block" onClick={submit} disabled={busy || !message.trim()}>
        {busy ? "Sending" : "Send"}
      </button>
      <div className="muted small">
        This goes straight to me. It records which screen you were on so I can
        find it, and nothing else about what you were writing.
      </div>
    </div>
  );
}

// The floating button. Present on every signed-in screen so feedback is always
// one tap away, and it sits above the tab bar rather than over it.
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        className="btn feedback-fab"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        title="Send feedback"
      >
        Feedback
      </button>
    );
  }

  return (
    <div className="feedback-sheet" role="dialog" aria-label="Send feedback">
      <div className="card stack">
        <div className="row">
          <strong>Tell me something</strong>
          <div className="spacer" />
          <button className="btn small" onClick={() => setOpen(false)} aria-label="Close">Close</button>
        </div>
        <FeedbackForm />
      </div>
    </div>
  );
}
