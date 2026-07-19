alter table public.contacts drop constraint if exists contacts_image_reference_check;
alter table public.contacts add constraint contacts_image_reference_check
  check (
    (image_kind is null and image_url is null and image_storage_path is null)
    or (
      image_kind = 'upload'
      and image_storage_path is not null
      and image_url is null
      and image_mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and image_file_size between 1 and 5242880
      and image_width between 1 and 4096
      and image_height between 1 and 4096
    )
    or (
      image_kind = 'external'
      and image_url ~ '^https://'
      and image_storage_path is null
      and image_mime_type is null
      and image_file_size is null
      and image_width is null
      and image_height is null
    )
  );
