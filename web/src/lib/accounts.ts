import { supabase } from "./supabase";
import { normaliseEmail } from "./email";

// Admin: who is on what, and handing out access.
//
// Everything here is gated in the database rather than by hiding the UI:
// admin_accounts filters on is_admin() inside the view (views carry no RLS), and
// grant_plan / revoke_plan raise unless is_admin(). A non-admin who called these
// directly would get an empty list and an error, which is the point.

export type AccountKind = "beta" | "comp" | "paid";

export interface AccountRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  joined_at: string;
  plan_id: string | null;
  plan_name: string | null;
  kind: AccountKind;
  status: string | null;
  trial_ends_at: string | null;
  usable: boolean;
  days_left: number | null;
  // 0026. Counts and a date, never content: the owner can see that a coach
  // wrote four sessions and was last in on Tuesday, and still cannot read a
  // word of what they wrote.
  sessions: number;
  notes: number;
  reflections: number;
  reports: number;
  last_active: string | null;
}

// "Last seen four days ago" is the number the beta decision gets made on, so it
// is worth reading at a glance rather than working out from a date.
export function lastSeen(iso: string | null): string {
  if (!iso) return "never opened it";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export const PLAN_BETA = "coach_beta";
export const PLAN_COMP = "coach_comp";

// Ordered by who was here most recently, not by who joined first. The question
// this list has to answer during the beta is "who is actually using it", and
// sorted by join date the answer is scattered down the page. Nulls last, so the
// people who signed up and never came back sit at the bottom where they belong.
export async function listAccounts(): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from("admin_accounts")
    .select("*")
    .order("last_active", { ascending: false, nullsFirst: false })
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AccountRow[];
}

// days null = active with no end date (comp). days given = a trial ending then
// (beta). The function returns a sentence describing what it did, which is worth
// showing rather than a generic "saved": granting the wrong plan to the wrong
// person is easy and silent.
export async function grantPlan(email: string, plan: string, days: number | null): Promise<string> {
  const { data, error } = await supabase.rpc("grant_plan", {
    p_email: normaliseEmail(email),
    p_plan: plan,
    p_days: days,
  });
  if (error) throw error;
  return (data as string) ?? "Done.";
}

export async function revokePlan(email: string, plan: string): Promise<string> {
  const { data, error } = await supabase.rpc("revoke_plan", {
    p_email: normaliseEmail(email),
    p_plan: plan,
  });
  if (error) throw error;
  return (data as string) ?? "Done.";
}
