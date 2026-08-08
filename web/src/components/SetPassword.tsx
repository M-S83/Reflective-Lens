import { useState } from "react";
import { supabase } from "../lib/supabase";
import { ErrorText, Spinner } from "./ui";

// Setting a password, used in the two places it is needed:
//
//   • after a reset link, where the coach is signed in but has no working
//     password yet
//   • in Account, where a coach who signed up in the passwordless days can give
//     themselves one without spending an email at all
//
// The second is not a nicety. Everyone who joined before this change has no
// password, so without it "Sign in" fails for every existing account and the
// only way back in is another email, which is the thing we are trying to stop.
export function SetPasswordForm({ onDone, cta = "Save password" }: {
  onDone?: () => void;
  cta?: string;
}) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = again.length > 0 && again !== password;
  const canSubmit = password.length >= 8 && again === password;

  const save = async () => {
    setErr("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setPassword("");
      setAgain("");
      onDone?.();
    } catch (e) {
      setErr((e as Error).message ?? "Could not save that password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setDone(false); }}
          autoComplete="new-password"
        />
        <div className="muted small" style={{ marginTop: 4 }}>
          At least 8 characters. Your browser will offer to remember it.
        </div>
        {tooShort && <div className="muted small">A bit longer, 8 characters or more.</div>}
      </div>

      <div className="field">
        <label htmlFor="new-password-again">Type it again</label>
        <input
          id="new-password-again"
          type="password"
          value={again}
          onChange={(e) => { setAgain(e.target.value); setDone(false); }}
          onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) save(); }}
          autoComplete="new-password"
        />
        {mismatch && <div className="muted small" style={{ marginTop: 4 }}>These two do not match yet.</div>}
      </div>

      <button className="btn block" onClick={save} disabled={busy || !canSubmit}>
        {busy ? <Spinner /> : cta}
      </button>

      {done && <div className="banner">Password saved. You can sign in with it from now on.</div>}
      <ErrorText>{err}</ErrorText>
    </div>
  );
}
