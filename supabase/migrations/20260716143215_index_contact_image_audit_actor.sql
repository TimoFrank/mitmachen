create index if not exists contacts_image_updated_by_idx
on public.contacts (image_updated_by)
where image_updated_by is not null;
