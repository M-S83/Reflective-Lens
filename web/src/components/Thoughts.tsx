import { useEffect, useState } from "react";
import { RecordButton } from "./RecordButton";
import { ErrorText, Loading } from "./ui";
import { addThought, addVoiceThought, myThoughts, deleteThought } from "../lib/db";
import { FEATURES, logFeature } from "../lib/features";
import type { Observation } from "../lib/types";

// A thought that belongs to no session.
//
// This used to be a fourth chip inside a session's Notes, alongside Before, Live
// and After, which made it the odd one out: the other three are moments in a
// session, and a thought is precisely the thing that is not. It also meant a
// coach who had a realisation on the drive home had to open some session it was
// not really about in order to write it down, which is enough friction to lose
// the thought.
//
// So it lives on the home screen now, always available, attached to nothing.
// Stored with event_id null and capture_phase 'ad_hoc', which the schema has
// allowed since 0001 and nothing had ever used.
// `arriving` means the coach came here to record and nothing else: from the
// home screen shortcut, or a phone's action button. The panel opens itself and
// leads with the microphone, because at that point a textarea is in the way.
//
// A locked phone cannot be given a record button by a web app: no browser will
// open a microphone from the lock screen, on either platform, and that is the
// platform's decision rather than ours. What IS possible is removing every step
// between the icon and recording, which is what this does.
export function Thoughts({ arriving = false }: { arriving?: boolean }) {
  const [items, setItems] = useState<Observation[] | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(arriving);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => myThoughts().then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const v = text.trim();
    if (!v) return;
    setBusy(true); setErr("");
    try {
      await addThought(v);
      logFeature(FEATURES.thoughtCaptured, { length: v.length });
      setText("");
      // Cleaning and tagging happen in the background, so give it a moment
      // before reloading or the note comes back raw.
      setTimeout(load, 600);
    } catch (e) { setErr((e as Error).message ?? "Could not save that."); }
    finally { setBusy(false); }
  };

  const saveVoice = async (blob: Blob) => {
    setBusy(true); setErr("");
    try {
      await addVoiceThought(blob);
      logFeature(FEATURES.thoughtCaptured, { voice: true });
      setTimeout(load, 1200);
    } catch (e) { setErr((e as Error).message ?? "Could not save that."); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await deleteThought(id); load(); } catch { /* leave it on screen */ }
  };

  return (
    <div className="card stack">
      <button className="row" onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", width: "100%" }}>
        <strong>A thought</strong>
        <div className="spacer" />
        <span className="muted small">{open ? "Hide" : items?.length ? `${items.length} saved` : "Add one"}</span>
      </button>

      {open && (
        <>
          <div className="muted small">
            Anything that comes to you away from a session. It is not filed
            against a game, and nothing is asked of you: write it and leave it.
          </div>
          <ErrorText>{err}</ErrorText>
          {/* Arriving to record, the microphone comes first and the typing is
              the alternative. Otherwise the other way round, which is right for
              someone who opened the app to read and then thought of something. */}
          {arriving && <RecordButton onComplete={saveVoice} label="Tap to record" />}

          <div className="field">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Something that has been on your mind"
              rows={3}
              aria-label="Your thought"
            />
          </div>
          <button className="btn" onClick={save} disabled={busy || !text.trim()}>
            {busy ? "Saving" : "Save thought"}
          </button>
          {!arriving && <RecordButton onComplete={saveVoice} label="…or say it out loud" />}

          {items === null ? (
            <Loading />
          ) : items.length === 0 ? null : (
            <div className="list" style={{ marginTop: 4 }}>
              {items.map((o) => (
                <div key={o.id} className="card">
                  <div className="row">
                    <span className="muted small">
                      {new Date(o.created_at).toLocaleDateString("en-GB")}
                    </span>
                    <div className="spacer" />
                    <button className="btn small" onClick={() => remove(o.id)} aria-label="Remove thought">
                      Remove
                    </button>
                  </div>
                  <div className="yours" style={{ marginTop: 4 }}>{o.cleaned_note ?? o.raw_note}</div>
                  {o.tags?.length > 0 && (
                    <div className="tags" style={{ marginTop: 6 }}>
                      {o.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
