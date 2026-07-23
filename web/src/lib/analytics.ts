import { supabase } from "./supabase";

// Owner-only reads of the admin analytics views (each gated by is_admin() in the
// view itself, so a non-admin simply gets no rows). See migration 0004.

export const USD_TO_GBP = 1 / 1.27; // provider prices are USD; revenue is GBP

export interface Overview {
  total_users: number; active_7d: number; active_30d: number;
  cost_30d_usd: number; reflections_30d: number; reports_30d: number;
  paying_or_trialing: number;
}
export interface Mrr { mrr_gbp: number; active_subscriptions: number; }
export interface FeatureUsage { feature: string; uses: number; users: number; cost_usd: number; }
export interface UserCost { user_id: string; month: string; ai_calls: number; audio_minutes: number; cost_usd: number; }
export interface CostDay { day: string; ai_cost_usd: number; transcription_cost_usd: number; total_cost_usd: number; }

export async function getOverview(): Promise<Overview | null> {
  const { data, error } = await supabase.from("analytics_overview").select("*").maybeSingle();
  if (error) throw error;
  return (data as Overview | null) ?? null;
}
export async function getMrr(): Promise<Mrr | null> {
  const { data, error } = await supabase.from("analytics_mrr").select("*").maybeSingle();
  if (error) throw error;
  return (data as Mrr | null) ?? null;
}
export async function getFeatureUsage(): Promise<FeatureUsage[]> {
  const { data, error } = await supabase
    .from("analytics_feature_usage").select("feature,uses,users,cost_usd");
  if (error) throw error;
  return (data ?? []) as FeatureUsage[];
}
export async function getUserCosts(): Promise<UserCost[]> {
  const { data, error } = await supabase
    .from("analytics_user_cost_monthly")
    .select("user_id,month,ai_calls,audio_minutes,cost_usd").limit(50);
  if (error) throw error;
  return (data ?? []) as UserCost[];
}
export async function getCostDaily(): Promise<CostDay[]> {
  const { data, error } = await supabase
    .from("analytics_cost_daily")
    .select("day,ai_cost_usd,transcription_cost_usd,total_cost_usd").limit(14);
  if (error) throw error;
  return (data ?? []) as CostDay[];
}

// ---- Owner-adjustable model tiering ----------------------------------------
export interface ModelRow { feature: string; model: string; over_budget_model: string | null; }
export const MODEL_CHOICES = [
  { id: "claude-haiku-4-5", label: "Haiku", note: "cheap" },
  { id: "claude-sonnet-5", label: "Sonnet", note: "quality" },
];

export async function getModelConfig(): Promise<ModelRow[]> {
  const { data, error } = await supabase
    .from("model_config").select("feature, model, over_budget_model").order("feature");
  if (error) throw error;
  return (data ?? []) as ModelRow[];
}

// ---- Cost guard: users over their plan budget this month -------------------
export interface BudgetFlag {
  user_id: string; cost_this_month_usd: number; budget_usd: number; over_budget: boolean;
}
export async function getBudgetFlags(): Promise<BudgetFlag[]> {
  const { data, error } = await supabase
    .from("analytics_user_budget")
    .select("user_id, cost_this_month_usd, budget_usd, over_budget").limit(50);
  if (error) throw error;
  return (data ?? []) as BudgetFlag[];
}
export async function setModel(feature: string, model: string): Promise<void> {
  const { error } = await supabase.from("model_config").update({ model }).eq("feature", feature);
  if (error) throw error;
}
