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
}

export const PLAN_BETA = "coach_beta";
export const PLAN_COMP = "coach_comp";

export async function listAccounts(): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from("admin_accounts")
    .select("*")
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
