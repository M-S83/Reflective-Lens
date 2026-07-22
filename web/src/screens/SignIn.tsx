import { useState } from "react";
import { supabase, isConfigured } from "../lib/supabase";
import { Brandmark, ErrorText, Spinner } from "../components/ui";

type Method = "email" | "phone";
type Stage = "enter" | "code";

export default function SignIn() {
  const [method, setMethod] = useState<Method>("email");
  const [stage, setStage] = useState<Stage>("enter");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const send = async () => {
    setErr(""); setBusy(true);
    try {
      const res = method === "email"
        ? await supabase.auth.signInWithOtp({ email: value.trim(), options: { shouldCreateUser: true } })
        : await supabase.auth.signInWithOtp({ phone: value.trim() });
      if (res.error) throw res.error;
      setSent(true);
      // Email sends a magic link AND a code; phone sends a code. Offer code entry.
      setStage("code");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setErr(""); setBusy(true);
    try {
      const res = method === "email"
        ? await supabase.auth.verifyOtp({ email: value.trim(), token: code.trim(), type: "email" })
        : await supabase.auth.verifyOtp({ phone: value.trim(), token: code.trim(), type: "sms" });
      if (res.error) throw res.error;
      // On success, AuthProvider picks up the session and routes onward.
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
          {stage === "enter" ? (
            <>
              <div className="chipset" role="tablist" aria-label="Sign-in method">
                <button className={`chip ${method === "email" ? "on" : ""}`} onClick={() => setMethod("email")}>Email</button>
                <button className={`chip ${method === "phone" ? "on" : ""}`} onClick={() => setMethod("phone")}>Mobile</button>
              </div>
              <div className="field">
                <label htmlFor="id">{method === "email" ? "Email address" : "Mobile number"}</label>
                <input
                  id="id"
                  type={method === "email" ? "email" : "tel"}
                  inputMode={method === "email" ? "email" : "tel"}
                  placeholder={method === "email" ? "you@example.com" : "+44…"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoComplete={method === "email" ? "email" : "tel"}
                />
              </div>
              <button className="btn block" onClick={send} disabled={busy || !value || !isConfigured}>
                {busy ? <Spinner /> : "Send me a code"}
              </button>
            </>
          ) : (
            <>
              <p className="small">
                {sent && method === "email"
                  ? "We emailed you a magic link and a 6-digit code. Tap the link, or enter the code."
                  : "We texted you a 6-digit code."}
              </p>
              <div className="field">
                <label htmlFor="code">Code</label>
                <input id="code" inputMode="numeric" placeholder="123456" value={code}
                  onChange={(e) => setCode(e.target.value)} />
              </div>
              <button className="btn block" onClick={verify} disabled={busy || code.length < 4}>
                {busy ? <Spinner /> : "Verify & sign in"}
              </button>
              <button className="btn ghost sm" onClick={() => { setStage("enter"); setCode(""); }}>
                Use a different {method === "email" ? "email" : "number"}
              </button>
            </>
          )}
          <ErrorText>{err}</ErrorText>
        </div>

        <p className="muted small center">
          New here? Entering your details creates your account. After signing in you can add the app to
          your phone or iPad, and allow the microphone to record your reflections.
        </p>
      </div>
    </div>
  );
}
