import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Mode = "coach" | "player";

const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "coach",
  setMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem("rl-mode") as Mode) || "coach",
  );
  useEffect(() => { localStorage.setItem("rl-mode", mode); }, [mode]);
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useMode = () => useContext(Ctx);
