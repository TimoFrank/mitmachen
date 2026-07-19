-- Some SVG files are detected as XML by the storage gateway. Keep the bucket
-- private while accepting both standards-compliant MIME classifications.
update storage.buckets
set allowed_mime_types = array[
  'application/xml',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'text/xml'
]
where id = 'stakeholder-logos';
