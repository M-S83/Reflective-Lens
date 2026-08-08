import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { useAuth } from "../auth/AuthProvider";

// Whether the app is usable is decided by the subscription. A user holds the
// coach role if they have a subscription for a plan tagged with it
// (plans.features.role). It is "active" if the plan is paid-active or within an
// unexpired trial; otherwise it is "lapsed" (read-only).
//
// The player journey was removed, so this is now a one-role system. The shape is
// kept as arrays rather than a boolean because the entitlement model itself is
// unchanged (plans still carry a role tag) and a second journey, if one ever
// returns, should not need this rewritten.
type Mode = "coach";

// WHICH kind of access, not just whether there is any. Everything usable looked
// alike before, so Account thanked a coach on their free month as though they
// were paying, and the countdown underneath it was unreachable: nobody was ever
// told their trial was running out. A comped coach would have been thanked for
// paying too, and a beta tester never told when beta ends.
//
//   trial  the free month that starts itself on first sign-in
//   beta   granted, time-boxed, ends on a date
//   comp   granted, no end date
//   paid   a real subscription
//   lapsed held one of the above and it ran out: read-only
//   none   no subscription row at all
export type AccessKind = "trial" | "beta" | "comp" | "paid" | "lapsed" | "none";

export interface Access {
  kind: AccessKind;
  planName: string | null;
  endsAt: string | null;   // null when nothing is counting down
  daysLeft: number | null; // null when nothing is counting down
}

interface Entitlements {
  loading: boolean;
  activeRoles: Mode[]; // usable now
  lapsedRoles: Mode[]; // held but expired -> read-only
  access: Access;
  isAdmin: boolean; // owner: sees the operating dashboard
  refresh: () => Promise<void>;
  startTrial: (role: Mode) => Promise<void>;
}

const NO_ACCESS: Access = { kind: "none", planName: null, endsAt: null, daysLeft: null };

const Ctx = createContext<Entitlements>({
  loading: true, activeRoles: [], lapsedRoles: [], access: NO_ACCESS, isAdmin: false,
  refresh: async () => {}, startTrial: async () => {},
});

const ROLES: Mode[] = ["coach"];

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeRoles, setActive] = useState<Mode[]>([]);
  const [lapsedRoles, setLapsed] = useState<Mode[]>([]);
  const [access, setAccess] = useState<Access>(NO_ACCESS);
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) {
      setActive([]); setLapsed([]); setAccess(NO_ACCESS); setIsAdmin(false); setLoading(false);
      return;
    }
    setLoading(true);
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));
    const { data } = await supabase
      .from("subscriptions")
      .select("status, trial_ends_at, plan:plans(name, features)");
    type PlanShape = { name?: string; features: { role?: string; kind?: string } | null };
    const rows = (data ?? []) as unknown as Array<{
      status: string; trial_ends_at: string | null;
      plan: PlanShape | PlanShape[] | null;
    }>;
    const now = Date.now();
    const active = new Set<Mode>();
    const held = new Set<Mode>();
    // The subscription that actually governs them, matched to the admin_accounts
    // view: a usable one wins, and among those the one ending furthest out.
    let govern: { kind: AccessKind; planName: string | null; endsAt: string | null; usable: boolean } | null = null;
    for (const r of rows) {
      const planObj = Array.isArray(r.plan) ? r.plan[0] : r.plan;
      const role = planObj?.features?.role as Mode | undefined;
      if (role !== "coach") continue;
      held.add(role);
      const usable = r.status === "active" ||
        (r.status === "trialing" &&
          (!r.trial_ends_at || new Date(r.trial_ends_at).getTime() >= now));
      if (usable) active.add(role);

      // plans.features.kind is set by 0022. An untagged plan is a paying one,
      // and a trialing row on it is the self-serve free month.
      const tag = planObj?.features?.kind ?? "paid";
      const kind: AccessKind = !usable ? "lapsed"
        : tag === "beta" ? "beta"
        : tag === "comp" ? "comp"
        : r.status === "trialing" ? "trial"
        : "paid";
      const cand = { kind, planName: planObj?.name ?? null, endsAt: r.trial_ends_at, usable };
      const better = !govern
        || (cand.usable && !govern.usable)
        || (cand.usable === govern.usable
            && (govern.endsAt !== null && (cand.endsAt === null
                || new Date(cand.endsAt).getTime() > new Date(govern.endsAt).getTime())));
      if (better) govern = cand;
    }
    // A signed-in account with no subscription at all is brand new. There is no
    // role to choose any more, so the free month starts here rather than on a
    // screen the user has to get through first. start_trial is idempotent and
    // refuses to restart a lapsed trial, so this cannot hand out a second one.
    if (rows.length === 0) {
      const { error } = await supabase.rpc("start_trial", { p_role: "coach" });
      if (!error) {
        const { data: after } = await supabase
          .from("subscriptions").select("status, trial_ends_at").limit(1);
        const row = (after ?? [])[0] as { status: string; trial_ends_at: string | null } | undefined;
        const usable = row && (row.status === "active" ||
          (row.status === "trialing" &&
            (!row.trial_ends_at || new Date(row.trial_ends_at).getTime() >= now)));
        if (usable) {
          active.add("coach"); held.add("coach");
          // start_trial only ever writes a trialing row on the entry plan, so
          // this is the free month by construction.
          govern = { kind: "trial", planName: "Free month", endsAt: row!.trial_ends_at, usable: true };
        }
      }
      // A failure here is not fatal: the user lands read-only rather than
      // locked out, and the next refresh tries again.
    }

    setActive(ROLES.filter((r) => active.has(r)));
    setLapsed(ROLES.filter((r) => held.has(r) && !active.has(r)));
    setAccess(govern
      ? {
          kind: govern.kind,
          planName: govern.planName,
          // Only a date that is actually approaching is an end date. A comped or
          // paid account has none, and showing one would be a countdown nobody
          // is on.
          endsAt: govern.kind === "comp" || govern.kind === "paid" ? null : govern.endsAt,
          daysLeft: govern.kind === "comp" || govern.kind === "paid" || !govern.endsAt
            ? null
            : Math.max(0, Math.ceil((new Date(govern.endsAt).getTime() - now) / 86400000)),
        }
      : NO_ACCESS);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  const startTrial = useCallback(async (role: Mode) => {
    const { error } = await supabase.rpc("start_trial", { p_role: role });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ loading, activeRoles, lapsedRoles, access, isAdmin, refresh, startTrial }}>
      {children}
    </Ctx.Provider>
  );
}

export const useEntitlements = () => useContext(Ctx);
