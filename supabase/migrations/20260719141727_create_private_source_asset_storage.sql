-- Quarantine for historical source images that must leave Git history but may
-- still be needed for an authorized data review. No browser-read policy is
-- created; access stays limited to trusted server/administrative credentials.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'protected-source-assets',
  'protected-source-assets',
  false,
  5242880,
  array['image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
