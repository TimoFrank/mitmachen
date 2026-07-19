-- Sprint 8: Nutzerprofil, Profilbilder und minimale Benachrichtigungsvorbereitung.
-- Additiv ausfuehren, bevor die neue Profil-UI produktiv genutzt wird.

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists team text;
alter table public.profiles add column if not exists bio text;

alter table public.user_settings drop constraint if exists user_settings_default_view_type_check;
alter table public.user_settings
  add constraint user_settings_default_view_type_check
  check (default_view_type in ('contacts', 'organizations', 'map', 'analytics'));

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

grant select on public.profiles to authenticated;
grant update (display_name, initials, avatar_url, team, bio, updated_at) on public.profiles to authenticated;

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update"
on public.profiles for update
to authenticated
using (id = auth.uid() and active = true)
with check (id = auth.uid() and active = true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile images public read" on storage.objects;
drop policy if exists "profile images team read" on storage.objects;
create policy "profile images team read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-images'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
);

drop policy if exists "profile images own insert" on storage.objects;
create policy "profile images own insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile images own update" on storage.objects;
create policy "profile images own update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-images'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile images own delete" on storage.objects;
create policy "profile images own delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and split_part(name, '/', 1) = auth.uid()::text
);
