import { useEffect, useRef, useState } from "react";
import { Recorder, micSupported } from "../lib/recorder";
import { Spinner } from "./ui";

// Tap to start, tap to stop; on stop, hands the audio blob to onComplete
// (which uploads + transcribes). Shows a clear message if the mic is blocked.
//
// Deliberately NOT press and hold. A coach reflecting talks for thirty seconds
// to a minute and a half, and holding a button for that long means holding the
// phone up the whole time, so they cannot walk, drive off, or put it on the
// bonnet while they think. Worse, a finger that slips ends the recording, and
// the recording is the thing they were trying not to lose. Hold is right for a
// two second "on my way", which is why messaging apps use it, and wrong here.
//
// The counter is what makes tap to stop safe. Without it the screen says the
// same thing whether the microphone is running or the phone quietly denied it,
// and a coach who talks for a minute into nothing has lost exactly what this
// app exists to keep. A number climbing once a second is proof.
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RecordButton({
  onComplete, label = "Record a thought", compact = false,
}: { onComplete: (blob: Blob) => Promise<void>; label?: string; compact?: boolean }) {
  const rec = useRef(new Recorder());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [secs, setSecs] = useState(0);

  // Counts off the wall clock rather than counting ticks, because a phone with
  // the screen off throttles timers and a tick count would drift behind the
  // audio it claims to describe.
  useEffect(() => {
    if (!on) return;
    const from = Date.now();
    setSecs(0);
    const t = setInterval(() => setSecs(Math.floor((Date.now() - from) / 1000)), 250);
    return () => clearInterval(t);
  }, [on]);

  if (!micSupported()) {
    return compact ? null
      : <p className="muted small">Voice recording isn’t supported on this device. Type your note instead.</p>;
  }

  const toggle = async () => {
    setErr("");
    if (!on) {
      try { await rec.current.start(); setOn(true); }
      catch { setErr("Microphone blocked. Allow mic access in your browser settings to record."); }
    } else {
      setOn(false); setBusy(true);
      try {
        const blob = await rec.current.stop();
        await onComplete(blob);
      } catch (e) { setErr((e as Error).message); }
      finally { setBusy(false); }
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        className={`btn ${on ? "danger" : "subtle"} sm`}
        onClick={toggle}
        disabled={busy}
        aria-label={on ? "Stop recording" : "Answer by voice"}
        style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}
      >
        {busy ? <Spinner /> : on ? `◼ ${clock(secs)}` : "🎙 Speak"}
      </button>
    );
  }

  return (
    <div className="stack" style={{ alignItems: "center", gap: 8 }}>
      <button className={`record ${on ? "on" : ""}`} onClick={toggle} disabled={busy} aria-label={on ? "Stop" : "Record"}>
        {busy ? <Spinner /> : on ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
          </svg>
        )}
      </button>
      <span className="muted small" aria-live="off">
        {busy ? "Transcribing…" : on ? `Recording ${clock(secs)}, tap to stop` : label}
      </span>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
