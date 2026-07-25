-- =============================================================================
-- 0015_reports_owner_only.sql — reports are private to their coach.
-- The previous read policy allowed access to a report via an explicit
-- report_access grant (an in-app sharing path). For this dispatch there is NO
-- club or third-party access: a coach reads only reports they created. Sharing is
-- by PDF export only (see CLAUDE.md, "ownership-only access. No in-app sharing").
-- The report_access table is left in place but no longer grants read access.
-- =============================================================================

drop policy if exists "reports: read" on public.reports;

create policy "reports: read own" on public.reports for select
  using (created_by = auth.uid());
