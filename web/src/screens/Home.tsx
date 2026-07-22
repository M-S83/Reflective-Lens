import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { recentEvents } from "../lib/db";
import type { EventRow } from "../lib/types";
import { useAuth } from "../auth/AuthProvider";
import { ErrorText, Loading, TopBar, isIOS, useInstallPrompt } from "../components/ui";
import { ModeSwitch } from "../components/ModeSwitch";

function fmtDate(d: string | null) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); }
  catch { return d; }
}

export default function Home() {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [err, setErr] = useState("");
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissInstall, setDismissInstall] = useState(false);

  useEffect(() => {
    recentEvents().then(setEvents).catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <div className="app">
      <TopBar
        title="Reflective Lens"
        eyebrow="Coach"
        right={<div className="row" style={{ gap: 6 }}><ModeSwitch /><button className="btn ghost sm" onClick={() => signOut()}>Sign out</button></div>}
      />
      <div className="screen stack">
        {(canInstall || isIOS()) && !dismissInstall && (
          <div className="banner row" style={{ justifyContent: "space-between" }}>
            <span>
              {canInstall
                ? "Add Reflective Lens to your home screen for one-tap access."
                : "Add to your iPad/iPhone: tap Share, then “Add to Home Screen”."}
            </span>
            <span className="row" style={{ gap: 6 }}>
              {canInstall && <button className="btn sm" onClick={promptInstall}>Add</button>}
              <button className="btn ghost sm" onClick={() => setDismissInstall(true)}>Dismiss</button>
            </span>
          </div>
        )}

        <button className="btn block" onClick={() => nav("/new")}>+ Start a session or match</button>

        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 className="serif" style={{ fontSize: 16, color: "var(--pitch)" }}>Recent</h2>
          </div>
          <ErrorText>{err}</ErrorText>
          {events === null ? (
            <Loading />
          ) : events.length === 0 ? (
            <div className="card muted">
              Nothing yet. Set up a <Link to="/teams">team</Link>, then start your first session. Capture a
              few notes, then reflect.
            </div>
          ) : (
            <div className="list">
              {events.map((ev) => (
                <button key={ev.id} className="card tap" onClick={() => nav(`/events/${ev.id}`)}>
                  <div className="row">
                    <strong>{ev.title}</strong>
                    <div className="spacer" />
                    <span className={`pill ${ev.status === "completed" ? "good" : ""}`}>{ev.status}</span>
                  </div>
                  <div className="muted small row" style={{ gap: 8, marginTop: 4 }}>
                    <span>{ev.event_type.replace("_", " ")}</span>
                    {ev.opposition && <span>· vs {ev.opposition}</span>}
                    {ev.event_date && <span>· {fmtDate(ev.event_date)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
