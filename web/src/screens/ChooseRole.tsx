import { useState } from "react";
import { useEntitlements } from "../lib/entitlements";
import { useMode } from "../lib/mode";
import { Brandmark, ErrorText, Spinner } from "../components/ui";

// Shown to a signed-in user who holds no role yet. They pick coach or player,
// which starts a 14-day trial in that mode. They can add the other later by
// subscribing to it. Coach and player never mix.
export default function ChooseRole() {
  const { startTrial } = useEntitlements();
  const { setMode } = useMode();
  const [busy, setBusy] = useState<"coach" | "player" | null>(null);
  const [err, setErr] = useState("");

  const choose = async (role: "coach" | "player") => {
    setErr(""); setBusy(role);
    try {
      await startTrial(role);
      setMode(role);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="app">
      <div className="screen stack" style={{ maxWidth: 460, margin: "0 auto", paddingTop: "7vh" }}>
        <div className="center stack" style={{ gap: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "center" }}><Brandmark size={54} /></div>
          <h1 className="serif" style={{ fontSize: 26, color: "var(--pitch)" }}>Welcome to Reflective Lens</h1>
          <p className="muted">How will you use it? You can add the other later.</p>
        </div>

        <div className="card stack">
          <button className="btn block" disabled={!!busy} onClick={() => choose("coach")}>
            {busy === "coach" ? <Spinner /> : "I'm a coach"}
          </button>
          <p className="muted small">Reflect on your sessions and matches, and get reports that mirror your own notes back to you.</p>
          <hr />
          <button className="btn block" disabled={!!busy} onClick={() => choose("player")}>
            {busy === "player" ? <Spinner /> : "I'm a player"}
          </button>
          <p className="muted small">Log your own games and build a private reflection story across the season.</p>
          <ErrorText>{err}</ErrorText>
        </div>

        <p className="muted small center">Starts a one-month free trial. It continues as a monthly subscription unless you cancel, or you can pay yearly and save 25%.</p>
      </div>
    </div>
  );
}
