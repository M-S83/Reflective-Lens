import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isConfigured } from "../lib/supabase";
import { Brandmark, ErrorText, Spinner } from "../components/ui";
import { friendlyAuthError } from "../lib/authErrors";
import { normaliseEmail } from "../lib/email";

// Sign in with a password, so signing in costs no email.
//
// This screen used to be passwordless: every sign-in sent a magic link. That is
// pleasant with two users and unworkable with ten, because the email allowance
// is spent by people simply coming back. A coach who signs in on their phone at
// training and their laptop at home has cost two emails before writing a word,
// and when the allowance runs out the app looks broken to whoever is next.
//
// With a password there is exactly ONE email per person, ever: the confirmation
// at sign-up. Everything after that is free and instant.
//
// The magic link stays as the way back in when a password is forgotten, which is
// the moment it is genuinely the better tool.

type Mode = "in" | "up" | "forgot";

export default function SignIn() {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const submit = async () => {
    setErr(""); setDone(""); setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: normaliseEmail(email),
          password,
        });
        if (error) throw error;
        // AuthProvider picks up the session and routes onward.
      } else if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email: normaliseEmail(email),
          password,
          // Land them back wherever the app is actually running, rather than on
          // whichever single Site URL Supabase happens to hold.
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setDone(
          "Account created. Check your email and tap the confirmation link, then come back and sign in. That is the only email we will send you.",
        );
      } else {
        // A PATH, not the bare origin. Where the link lands is the only signal
        // about why someone arrived that survives everything: it does not depend
        // on the shape of the URL fragment, it is not lost to a reload, it works
        // the same under either auth flow, and when it goes wrong you can see it
        // in the address bar.
        //
        // Sniffing the URL and listening for PASSWORD_RECOVERY were both tried
        // and both let a real reset through to the home screen. The event is
        // emitted from a setTimeout while the Supabase client initialises, which
        // is at module load, before React has mounted anything to listen with,
        // so it fires into an empty room.
        const { error } = await supabase.auth.resetPasswordForEmail(normaliseEmail(email), {
          redirectTo: `${window.location.origin}/set-password`,
        });
        if (error) throw error;
        setDone("If that address has an account, we have emailed you a link to set a new password.");
      }
    } catch (e) {
      setErr(friendlyAuthError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const tooShort = mode !== "forgot" && password.length > 0 && password.length < 8;
  const canSubmit = !!email.trim() && (mode === "forgot" || password.length >= 8);

  return (
    <div className="app">
      <div className="screen stack" style={{ maxWidth: 420, margin: "0 auto", paddingTop: "8vh" }}>
        <div className="center stack" style={{ gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "center" }}><Brandmark size={54} /></div>
          <h1 className="serif" style={{ fontSize: 28, color: "var(--pitch)" }}>Reflective Lens</h1>
          <p className="muted">See your coaching clearly.</p>
        </div>

        {!isConfigured && (
          <div className="banner warn">
            Backend not configured. Set <span className="mono">VITE_SUPABASE_URL</span> and{" "}
            <span className="mono">VITE_SUPABASE_ANON_KEY</span> in <span className="mono">web/.env</span>.
          </div>
        )}

        <div className="card stack">
          <div className="chipset" role="tablist" aria-label="Sign in or create an account">
            <button
              className={`chip ${mode === "in" ? "on" : ""}`}
              onClick={() => { setMode("in"); setErr(""); setDone(""); }}
            >
              Sign in
            </button>
            <button
              className={`chip ${mode === "up" ? "on" : ""}`}
              onClick={() => { setMode("up"); setErr(""); setDone(""); }}
            >
              Create account
            </button>
          </div>

          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          {mode !== "forgot" && (
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
                // Tells a password manager to offer a new one on sign-up and the
                // saved one on sign-in, which is most of why passwords are
                // bearable at all.
                autoComplete={mode === "up" ? "new-password" : "current-password"}
              />
              {mode === "up" && (
                <div className="muted small" style={{ marginTop: 4 }}>
                  At least 8 characters. Your browser will offer to remember it.
                </div>
              )}
              {tooShort && <div className="muted small" style={{ marginTop: 4 }}>A bit longer, 8 characters or more.</div>}
            </div>
          )}

          <button className="btn block" onClick={submit} disabled={busy || !canSubmit || !isConfigured}>
            {busy ? <Spinner /> : mode === "in" ? "Sign in" : mode === "up" ? "Create my account" : "Email me a reset link"}
          </button>

          {done && <div className="banner">{done}</div>}
          <ErrorText>{err}</ErrorText>

          {mode === "in" && (
            <button className="btn ghost sm" onClick={() => { setMode("forgot"); setErr(""); setDone(""); }}>
              Forgotten your password?
            </button>
          )}
          {mode === "forgot" && (
            <button className="btn ghost sm" onClick={() => { setMode("in"); setErr(""); setDone(""); }}>
              Back to signing in
            </button>
          )}
        </div>

        <p className="muted small center">
          {mode === "up"
            ? "Creating an account sends one confirmation email. After that you sign in with your password and we will not email you again."
            : "After signing in you can add the app to your phone or iPad, and allow the microphone to record your reflections."}
        </p>

        {/* Readable BEFORE signing up, which is the only time reading them is
            any use. Someone about to write notes about the children they coach
            should be able to find out who holds that without first handing it
            over. */}
        <p className="muted small center">
          <a href="/walkthrough.html" target="_blank" rel="noreferrer">How it works</a>
          {" · "}
          <Link to="/privacy">Privacy</Link>
          {" · "}
          <Link to="/terms">Terms</Link>
        </p>
      </div>
    </div>
  );
}

