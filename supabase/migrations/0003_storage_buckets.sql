-- =============================================================================
-- 0003_storage_buckets.sql
-- Storage buckets + access policies.
--
-- Buckets (all private):
--   audio-recordings : live observations, reflections, follow-up answers
--   uploads          : team sheets (images / PDFs) and supporting files
--   reports          : generated PDFs and exported reports
--
-- Convention: objects are stored under a path prefixed by the owning user's id,
-- e.g.  audio-recordings/<auth.uid()>/<event_id>/<file>.webm
-- This lets a simple, safe RLS policy key off the first path segment.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('audio-recordings', 'audio-recordings', false),
  ('uploads',          'uploads',          false),
  ('reports',          'reports',          false)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Policies on storage.objects
-- Each authenticated user can manage objects under their own user-id folder.
-- (storage.foldername(name))[1] is the first path segment.
-- -----------------------------------------------------------------------------

create policy "audio: owner read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio: owner write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "uploads: owner read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "uploads: owner write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "uploads: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "uploads: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "reports: owner read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "reports: owner write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "reports: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "reports: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
