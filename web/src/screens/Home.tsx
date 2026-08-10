import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { recentEvents } from "../lib/db";
import type { EventRow } from "../lib/types";
import { sessionLabel } from "../lib/types";
import { Thoughts } from "../components/Thoughts";
import { useAuth } from "../auth/AuthProvider";
import { ErrorText, Loading, TopBar, isIOS, isStandalone, useInstallPrompt } from "../components/ui";
import { QuickCapture } from "../components/QuickCapture";

function fmtDate(d: string | null) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); }
  catch { return d; }
}

export default function Home({ capture = false }: { capture?: boolean }) {
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
        right={<button className="btn ghost sm" onClick={() => signOut()}>Sign out</button>}
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

        {/* Shown on /capture when they are still in a browser, because Safari
            can only add a home screen icon for the page it is looking at. Put
            anywhere else, the instruction is one nobody can follow. */}
        {capture && !isStandalone() && <QuickCapture onCapturePage />}

        <Thoughts arriving={capture} />

        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 className="serif" style={{ fontSize: 16, color: "var(--pitch)" }}>Recent</h2>
            <div className="spacer" />
            {/* Findable after the first session, not only before it. This link
                used to live inside the empty state below, so it vanished the
                moment a coach created anything, and the questions it answers
                ("what is it doing with my notes", "what will the report say")
                are ones nobody has on day one. From then on the only route to it
                was the Account tab, underneath the button that deletes your
                account. */}
            <a className="muted small" href="/walkthrough.html" target="_blank" rel="noreferrer">
              How it works
            </a>
          </div>
          <ErrorText>{err}</ErrorText>
          {events === null ? (
            <Loading />
          ) : events.length === 0 ? (
            <div className="card muted stack">
              <div>
                Nothing yet. Set up a <Link to="/teams">team</Link>, then start your first session. Capture a
                few notes, then reflect.
              </div>
              {/* The moment a coach most needs this is the moment they have
                  nothing, which is also the only moment this card is on screen.
                  A plain anchor, not a Link: the walkthrough is a standalone page
                  in /public, so routing it through the app would hit the
                  catch-all and bounce them home. */}
              <a href="/walkthrough.html" target="_blank" rel="noreferrer">
                See how it works, step by step
              </a>
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
                    <span>{sessionLabel(ev)}</span>
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
