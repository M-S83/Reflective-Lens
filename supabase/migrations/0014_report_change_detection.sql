-- =============================================================================
-- 0014_report_change_detection.sql
-- A coach report is regenerated only when its source (this session's aims, notes,
-- reflection and answers) has actually changed. generate-report stores a
-- fingerprint of that source; on a repeat request with an unchanged fingerprint
-- it returns the existing report instead of spending a model call and creating a
-- duplicate row. No heavy unique keys: one nullable column is enough at pilot
-- scale. (Player per-game reports are out of scope this pass and are unaffected.)
-- =============================================================================

alter table public.reports
  add column if not exists source_fingerprint text;
