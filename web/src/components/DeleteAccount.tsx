import { useEffect, useState } from "react";
import { requestAccountDeletion, cancelAccountDeletion, getDeletionSchedule } from "../lib/db";

// A guarded "danger zone" for erasing the account, with a 30-day recovery window.
// Requesting deletion schedules it (does not wipe immediately); until the date
// the user can undo and keep everything. Requires typing DELETE to confirm.
export function DeleteAccount() {
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getDeletionSchedule()
      .then(setScheduledFor)
      .catch(() => {}) // a read failure just falls back to the delete button
      .finally(() => setLoaded(true));
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const request = async () => {
    const typed = window.prompt(
      "This schedules your account for deletion in 30 days. Every reflection, note, game and report will be permanently removed on that date. You can undo any time before then.\n\nType DELETE to confirm.",
    );
    if (typed !== "DELETE") return;
    setBusy(true); setErr("");
    try {
      setScheduledFor(await requestAccountDeletion());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true); setErr("");
    try {
      await cancelAccountDeletion();
      setScheduledFor(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  // Pending state: scheduled, but still recoverable until the date.
  if (scheduledFor) {
    return (
      <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--faint)" }}>
        <div className="banner warn">
          Your account is scheduled for deletion on <strong>{fmt(scheduledFor)}</strong>. Until then
          everything you saved is still here, and you can keep your account.
        </div>
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button className="btn" onClick={cancel} disabled={busy}>
            {busy ? "Keeping your account…" : "Keep my account"}
          </button>
        </div>
        {err && <div className="muted small" style={{ color: "#c0492b", marginTop: 6, textAlign: "center" }}>{err}</div>}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--faint)", textAlign: "center" }}>
      <button className="btn ghost sm" style={{ color: "#c0492b" }} onClick={request} disabled={busy}>
        {busy ? "Scheduling…" : "Delete my account and all my data"}
      </button>
      <div className="muted small" style={{ marginTop: 6 }}>You will have 30 days to change your mind.</div>
      {err && <div className="muted small" style={{ color: "#c0492b", marginTop: 6 }}>{err}</div>}
    </div>
  );
}
