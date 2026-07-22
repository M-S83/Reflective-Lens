import { useNavigate } from "react-router-dom";
import { useMode } from "../lib/mode";

// Toggle between the coach and player experiences. They're independent spaces on
// the same account — coach reflections and player reflections never mix.
export function ModeSwitch() {
  const { mode, setMode } = useMode();
  const nav = useNavigate();
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
