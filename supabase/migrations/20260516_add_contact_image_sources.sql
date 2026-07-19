-- Sprint F: add optional contact image source metadata.
-- Non-destructive: keeps existing image_url values and only adds nullable fields.

alter table public.contacts add column if not exists image_source_url text;
alter table public.contacts add column if not exists image_source_label text;
alter table public.contacts add column if not exists image_rights_note text;
alter table public.contacts add column if not exists image_updated_at timestamptz;
alter table public.contacts add column if not exists image_updated_by uuid references public.profiles(id);

comment on column public.contacts.image_url is 'Optional contact image URL. Images are documented manually and not scraped automatically.';
comment on column public.contacts.image_source_url is 'URL of the documented source for image_url.';
comment on column public.contacts.image_source_label is 'Human-readable label for the image source, e.g. practice website.';
comment on column public.contacts.image_rights_note is 'Short note about checked source/usage context. No automated legal assessment.';
comment on column public.contacts.image_updated_at is 'Timestamp of the latest manual image metadata update.';
comment on column public.contacts.image_updated_by is 'Profile that last updated the contact image metadata.';
