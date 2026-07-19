-- Versionierter Avatar-Patch fuer den synthetischen Pre-Integrationsbestand.
-- Er veraendert ausschliesslich die drei reservierten Demo-Profile und ist wiederholbar.

begin;

select pg_advisory_xact_lock(hashtextextended('pre-gematik-synthetic-profile-avatars-v1', 0));

do $avatar_preflight$
declare
  actual integer;
begin
  select count(*) into actual
    from public.profiles profile
    join (values
      ('demo-profile-admin', 'admin@versorgungs-kompass.example.invalid', '/public/demo-profile-admin.svg'),
      ('demo-profile-editor', 'redaktion@versorgungs-kompass.example.invalid', '/public/demo-profile-editor.svg'),
      ('demo-profile-viewer', 'lesekonto@versorgungs-kompass.example.invalid', '/public/demo-profile-viewer.svg')
    ) expected(id, email, avatar_url)
      on expected.id = profile.id
     and expected.email = profile.email
   where position('pre-gematik-synthetic-v1' in coalesce(profile.bio, '')) > 0
     and (profile.avatar_url is null or profile.avatar_url = expected.avatar_url);

  if actual <> 3 then
    raise exception 'Synthetic profile-avatar preflight failed: expected 3 protected demo profiles, got %.', actual;
  end if;

  select count(*) into actual
    from public.profiles profile
   where profile.avatar_url in (
     '/public/demo-profile-admin.svg',
     '/public/demo-profile-editor.svg',
     '/public/demo-profile-viewer.svg'
   )
     and profile.id not in ('demo-profile-admin', 'demo-profile-editor', 'demo-profile-viewer');

  if actual <> 0 then
    raise exception 'Synthetic profile-avatar preflight failed: reserved avatar paths are used by % unexpected profiles.', actual;
  end if;
end
$avatar_preflight$;

update public.profiles profile
   set avatar_url = expected.avatar_url,
       updated_at = '2026-07-18T14:00:00.000Z'::timestamptz
  from (values
    ('demo-profile-admin', '/public/demo-profile-admin.svg'),
    ('demo-profile-editor', '/public/demo-profile-editor.svg'),
    ('demo-profile-viewer', '/public/demo-profile-viewer.svg')
  ) expected(id, avatar_url)
 where profile.id = expected.id
   and profile.avatar_url is null;

do $avatar_verify$
declare
  actual integer;
begin
  select count(*) into actual
    from public.profiles profile
    join (values
      ('demo-profile-admin', '/public/demo-profile-admin.svg'),
      ('demo-profile-editor', '/public/demo-profile-editor.svg'),
      ('demo-profile-viewer', '/public/demo-profile-viewer.svg')
    ) expected(id, avatar_url)
      on expected.id = profile.id
     and expected.avatar_url = profile.avatar_url;

  if actual <> 3 then
    raise exception 'Synthetic profile-avatar verification failed: expected 3 avatars, got %.', actual;
  end if;
end
$avatar_verify$;

commit;
