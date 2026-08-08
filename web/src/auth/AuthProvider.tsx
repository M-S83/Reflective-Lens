import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, arrivedOnRecoveryLink } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
  // True when this visit began with a password-reset link. A recovery link
  // signs the coach in, which means without this flag they would land on Home
  // with the same unusable password and have to ask for another email. It stays
  // set until they have actually saved a new one.
  recovery: boolean;
  passwordSet: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  session: null, loading: true, recovery: false, passwordSet: () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(arrivedOnRecoveryLink);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s);
      if (e === "PASSWORD_RECOVERY") setRecovery(true);
      if (e === "SIGNED_OUT") setRecovery(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ session, loading, recovery, passwordSet: () => setRecovery(false), signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
