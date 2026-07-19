-- Issue #26: private uploads or explicit external HTTPS links for contact portraits.
-- Uploads are referenced by a stable object path. External URLs remain direct
-- links so operators can make the privacy/tracking trade-off explicitly in UI.

alter table public.contacts add column if not exists image_source_url text;
alter table public.contacts add column if not exists image_source_label text;
alter table public.contacts add column if not exists image_rights_note text;
alter table public.contacts add column if not exists image_updated_at timestamptz;
alter table public.contacts add column if not exists image_updated_by uuid references public.profiles(id);
alter table public.contacts add column if not exists image_storage_path text;
alter table public.contacts add column if not exists image_kind text;
alter table public.contacts add column if not exists image_mime_type text;
alter table public.contacts add column if not exists image_file_size bigint;
alter table public.contacts add column if not exists image_width integer;
alter table public.contacts add column if not exists image_height integer;

alter table public.contacts drop constraint if exists contacts_image_kind_check;
alter table public.contacts add constraint contacts_image_kind_check
  check (image_kind is null or image_kind in ('upload', 'external'));
alter table public.contacts drop constraint if exists contacts_image_file_size_check;
alter table public.contacts add constraint contacts_image_file_size_check
  check (image_file_size is null or image_file_size between 1 and 5242880);
alter table public.contacts drop constraint if exists contacts_image_dimensions_check;
alter table public.contacts add constraint contacts_image_dimensions_check
  check ((image_width is null and image_height is null) or (image_width between 1 and 4096 and image_height between 1 and 4096));
alter table public.contacts drop constraint if exists contacts_image_reference_check;
alter table public.contacts add constraint contacts_image_reference_check
  check (
    (image_kind is null and image_url is null and image_storage_path is null)
    or (image_kind = 'upload' and image_storage_path is not null and image_url is null)
    or (image_kind = 'external' and image_url ~ '^https://' and image_storage_path is null)
  ) not valid;

update public.contacts set image_kind = 'external' where image_url is not null and image_kind is null;
alter table public.contacts validate constraint contacts_image_reference_check;

comment on column public.contacts.image_url is 'Direct external HTTPS contact image URL. Loading it can disclose request metadata to the source host.';
comment on column public.contacts.image_storage_path is 'Object path in the private contact-images bucket; never a public URL.';
comment on column public.contacts.image_kind is 'Image source: private upload or direct external HTTPS link.';
comment on column public.contacts.image_mime_type is 'Validated MIME type for uploaded contact images.';
comment on column public.contacts.image_file_size is 'Validated upload size in bytes (maximum 5 MB).';
comment on column public.contacts.image_width is 'Validated image width in pixels (maximum 4096).';
comment on column public.contacts.image_height is 'Validated image height in pixels (maximum 4096).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contact-images', 'contact-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "contact images team read" on storage.objects;
create policy "contact images team read" on storage.objects for select to authenticated
using (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1 from public.contacts contact
    where contact.id = (storage.foldername(name))[1]
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact images editor insert" on storage.objects;
create policy "contact images editor insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (select 1 from public.contacts contact where contact.id = (storage.foldername(name))[1])
);

drop policy if exists "contact images editor update" on storage.objects;
create policy "contact images editor update" on storage.objects for update to authenticated
using (bucket_id = 'contact-images' and (select public.current_profile_role()) in ('editor', 'admin'))
with check (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (select 1 from public.contacts contact where contact.id = (storage.foldername(name))[1])
);

drop policy if exists "contact images editor delete" on storage.objects;
create policy "contact images editor delete" on storage.objects for delete to authenticated
using (bucket_id = 'contact-images' and (select public.current_profile_role()) in ('editor', 'admin'));
