import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { useAuth } from "../auth/AuthProvider";
import type { Mode } from "./mode";

// Which modes a user may use is decided by their subscription, and coach/player
// stay isolated. A user holds a role if they have a subscription for a plan
// tagged with that role (plans.features.role). It is "active" if the plan is
// paid-active or within an unexpired trial; otherwise it is "lapsed" (read-only).
interface Entitlements {
  loading: boolean;
  activeRoles: Mode[]; // usable now
  lapsedRoles: Mode[]; // held but expired -> read-only
  isAdmin: boolean; // owner: sees the operating dashboard
  refresh: () => Promise<void>;
  startTrial: (role: Mode) => Promise<void>;
}

const Ctx = createContext<Entitlements>({
  loading: true, activeRoles: [], lapsedRoles: [], isAdmin: false,
  refresh: async () => {}, startTrial: async () => {},
});

const ROLES: Mode[] = ["coach", "player"];

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeRoles, setActive] = useState<Mode[]>([]);
  const [lapsedRoles, setLapsed] = useState<Mode[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) { setActive([]); setLapsed([]); setIsAdmin(false); setLoading(false); return; }
    setLoading(true);
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));
    const { data } = await supabase
      .from("subscriptions")
      .select("status, trial_ends_at, plan:plans(features)");
    type PlanShape = { features: { role?: string } | null };
    const rows = (data ?? []) as unknown as Array<{
      status: string; trial_ends_at: string | null;
      plan: PlanShape | PlanShape[] | null;
    }>;
    const now = Date.now();
    const active = new Set<Mode>();
    const held = new Set<Mode>();
    for (const r of rows) {
      const planObj = Array.isArray(r.plan) ? r.plan[0] : r.plan;
      const role = planObj?.features?.role as Mode | undefined;
      if (role !== "coach" && role !== "player") continue;
      held.add(role);
      const usable = r.status === "active" ||
        (r.status === "trialing" &&
          (!r.trial_ends_at || new Date(r.trial_ends_at).getTime() >= now));
      if (usable) active.add(role);
    }
    setActive(ROLES.filter((r) => active.has(r)));
    setLapsed(ROLES.filter((r) => held.has(r) && !active.has(r)));
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  const startTrial = useCallback(async (role: Mode) => {
    const { error } = await supabase.rpc("start_trial", { p_role: role });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ loading, activeRoles, lapsedRoles, isAdmin, refresh, startTrial }}>
      {children}
    </Ctx.Provider>
  );
}

export const useEntitlements = () => useContext(Ctx);
