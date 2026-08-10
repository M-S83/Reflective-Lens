import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { recentEvents } from "../lib/db";
import type { EventRow } from "../lib/types";
import { sessionLabel } from "../lib/types";
import { Thoughts } from "../components/Thoughts";
import { useAuth } from "../auth/AuthProvider";
import { ErrorText, Loading, TopBar, isStandalone } from "../components/ui";
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
        <button className="btn block" onClick={() => nav("/new")}>+ Start a session or match</button>

        {/* On /capture it is the page-specific version, because Safari can only
            add an icon for the page it is looking at.
            Everywhere else on Home it is the ordinary offer, and it belongs here
            rather than only on the Account tab. Getting the app onto the home
            screen is the single biggest thing between a coach and using it, and
            the card that offers it was two taps down a settings screen nobody
            opens. It hides itself once installed, and stays hidden once
            dismissed. */}
        {!isStandalone() && <QuickCapture onCapturePage={capture} />}

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
