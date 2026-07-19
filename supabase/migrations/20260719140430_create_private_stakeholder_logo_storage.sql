-- Private archive for organization logos that must not be published with the
-- repository or either frontend artifact. Access is deliberately limited to
-- trusted server/administrative credentials; no anon/authenticated object
-- policy is created here.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'stakeholder-logos',
  'stakeholder-logos',
  false,
  5242880,
  array['application/xml', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp', 'text/xml']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
