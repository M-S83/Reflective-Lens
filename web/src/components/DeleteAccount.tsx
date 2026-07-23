import { useState } from "react";
import { deleteAccount } from "../lib/db";

// A guarded "danger zone" for erasing the account. Requires typing DELETE to
// confirm, since it permanently removes every reflection, note and report.
export function DeleteAccount() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    const typed = window.prompt(
      "This permanently deletes your account and every reflection, note, game and report. It cannot be undone.\n\nType DELETE to confirm.",
    );
    if (typed !== "DELETE") return;
    setBusy(true); setErr("");
    try {
      await deleteAccount();
      // Auth state change routes back to sign-in; reload to clear everything.
      window.location.reload();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--faint)", textAlign: "center" }}>
      <button className="btn ghost sm" style={{ color: "#c0492b" }} onClick={run} disabled={busy}>
        {busy ? "Deleting your account…" : "Delete my account and all my data"}
      </button>
      {err && <div className="muted small" style={{ color: "#c0492b", marginTop: 6 }}>{err}</div>}
    </div>
  );
}
