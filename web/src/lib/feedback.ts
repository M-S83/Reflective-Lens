import { supabase } from "./supabase";

// Feedback from inside the app (0019). The point is that a tester can say
// something the moment they hit it, rather than having to remember it later,
// because most of what they would have told you is lost in between.

export type FeedbackKind = "suggestion" | "issue" | "confusing" | "praise";

export const FEEDBACK_KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "issue", label: "Something is broken" },
  { value: "confusing", label: "Something is confusing" },
  { value: "suggestion", label: "An idea" },
  { value: "praise", label: "Something good" },
];

export interface FeedbackRow {
  id: string;
  kind: string;
  message: string;
  status: string;
  context: Record<string, unknown>;
  owner_note: string | null;
  created_at: string;
  user_id: string;
}

export async function sendFeedback(kind: FeedbackKind, message: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { error } = await supabase.from("feedback").insert({
    user_id: userId,
    kind,
    message: message.trim(),
    // Where they were when they said it. A vague "this bit was confusing" is
    // still actionable if you know which screen it was. Nothing here is
    // anything the tester did not already give us by being on the page.
    context: {
      path: window.location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      user_agent: navigator.userAgent,
    },
  });
  if (error) throw error;
}

// What this user has already sent, so the form can show it back to them.
export async function myFeedback(): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("id, kind, message, status, context, owner_note, created_at, user_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeedbackRow[];
}

// Owner only: everything, newest first. RLS returns just the caller's own rows
// to a non-admin, so this is safe to call either way.
export async function allFeedback(): Promise<FeedbackRow[]> {
  return myFeedback();
}

export async function setFeedbackStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  if (error) throw error;
}
