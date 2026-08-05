import { supabase } from "./supabase";

// Product analytics: which features people actually use (feature_events, 0017).
//
// Deliberately NOT the same thing as usage_events. That one is the cost ledger,
// written server side by callClaude, and carries tokens and money. This one
// answers "did anyone open this screen, press this button", is written from the
// client, and has no money in it. Keeping them apart means a product question
// never has to be asked of the billing data.
//
// Fire and forget, always. Analytics must never be able to break, block or slow
// down the thing the coach was actually doing, so every call swallows its own
// errors and nothing awaits it.

export const FEATURES = {
  glossaryTermAdded: "glossary_term_added",
  glossaryTermRemoved: "glossary_term_removed",
  reportGenerated: "report_generated",
  reflectionSaved: "reflection_saved",
  voiceNoteRecorded: "voice_note_recorded",
  periodReportGenerated: "period_report_generated",
  pdfExported: "pdf_exported",
  accountOpened: "account_opened",
  feedbackSent: "feedback_sent",
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

export function logFeature(
  feature: Feature,
  metadata: Record<string, unknown> = {},
  action = "used",
): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      // RLS requires user_id = auth.uid(), so an anonymous call would be
      // rejected anyway. Skip rather than send a request that cannot succeed.
      if (!userId) return;
      await supabase.from("feature_events").insert({
        user_id: userId,
        feature,
        action,
        metadata,
      });
    } catch {
      // Never surfaced. A failed analytics write is not the coach's problem.
    }
  })();
}
