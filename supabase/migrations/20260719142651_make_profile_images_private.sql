-- Profilbilder gehoeren zum geschuetzten Datenbestand und duerfen nicht anonym
-- aus Supabase Storage gelesen werden. Der Zielbetrieb liefert sie ueber die
-- authentifizierte API; der auslaufende Direktzugriff kann Signed URLs nutzen.

update storage.buckets
set public = false
where id = 'profile-images';

drop policy if exists "profile images public read" on storage.objects;
drop policy if exists "profile images team read" on storage.objects;

create policy "profile images team read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-images'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
);
