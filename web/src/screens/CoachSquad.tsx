import { useCallback, useEffect, useState } from "react";
import { setAttendance, squad, type SquadRow } from "../lib/db";
import { ATTEND, SELECT, type AttendanceStatus, type SquadSelection } from "../lib/types";
import { ErrorText, Loading } from "../components/ui";

// Attendance for any event, plus squad selection (starter / game changer /
// unused) for matches. Each change saves immediately.
export function CoachSquad({ eventId, teamId, isMatch }: { eventId: string; teamId: string; isMatch: boolean }) {
  const [rows, setRows] = useState<SquadRow[] | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    squad(eventId, teamId).then(setRows).catch((e) => setErr((e as Error).message));
  }, [eventId, teamId]);
  useEffect(() => { load(); }, [load]);

  const update = async (playerId: string, status: AttendanceStatus, selection: SquadSelection | null) => {
    setRows((rs) => rs?.map((r) => r.player.id === playerId ? { ...r, status, selection } : r) ?? rs);
    try { await setAttendance(eventId, playerId, status, selection); }
    catch (e) { setErr((e as Error).message); }
  };

  if (rows === null) return <Loading />;
  if (rows.length === 0) {
    return <div className="card muted">No players in this team yet. Add your squad on the Teams tab first.</div>;
  }

  const present = rows.filter((r) => r.status === "present").length;

  return (
    <>
      <div className="card row">
        <span className="muted small">{present} of {rows.length} here</span>
        <div className="spacer" />
        {isMatch && <span className="muted small">{rows.filter((r) => r.selection === "starter").length} starters</span>}
      </div>
      <ErrorText>{err}</ErrorText>
      <div className="list">
        {rows.map((r) => {
          const st = r.status;
          return (
            <div key={r.player.id} className="card stack" style={{ gap: 8 }}>
              <div className="row">
                <span className="mono" style={{ width: 24, color: "var(--muted)" }}>{r.player.shirt_number ?? ""}</span>
                <strong>{r.player.display_name}</strong>
              </div>
              <div className="chipset">
                {ATTEND.map((a) => (
                  <button key={a.value}
                    className={`chip ${st === a.value ? "on" : ""}`}
                    onClick={() => update(r.player.id, a.value, a.value === "present" ? r.selection : null)}>
                    {a.label}
                  </button>
                ))}
              </div>
              {isMatch && st === "present" && (
                <div className="chipset">
                  {SELECT.map((s) => (
                    <button key={s.value}
                      className={`chip ${r.selection === s.value ? "on" : ""}`}
                      onClick={() => update(r.player.id, "present", s.value)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
