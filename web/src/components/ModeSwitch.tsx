import { useNavigate } from "react-router-dom";
import { useMode } from "../lib/mode";
import { useEntitlements } from "../lib/entitlements";

// Switch between coach and player experiences. Only shown when the user actually
// holds BOTH roles (subscribed to both). With a single role the modes stay
// isolated and there is nothing to switch to, so this renders nothing.
export function ModeSwitch() {
  const { mode, setMode } = useMode();
  const { activeRoles, lapsedRoles } = useEntitlements();
  const nav = useNavigate();

  const held = [...new Set([...activeRoles, ...lapsedRoles])];
  if (held.length < 2) return null;

  const target = mode === "coach" ? "player" : "coach";
  return (
    <button
      className="btn ghost sm"
      onClick={() => { setMode(target); nav(target === "player" ? "/player" : "/"); }}
    >
      {target === "player" ? "Player mode" : "Coach mode"}
    </button>
  );
}
