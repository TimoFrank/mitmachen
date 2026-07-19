-- Ausschliesslich synthetisches Beispielprofil fuer die lokale Pre-Integration.
-- Vor realer Nutzung bewusst ersetzen; niemals echte Identitaeten in Git eintragen.

begin;

insert into public.profiles (
  id,
  email,
  display_name,
  initials,
  role,
  active,
  team,
  bio
) values (
  'pre-gematik-admin',
  'admin@example.invalid',
  'Pre-Integration Admin',
  'PA',
  'admin',
  true,
  'Synthetische Testdaten',
  'Kein echtes Nutzerprofil; nur fuer den befristeten PostgreSQL-Contract-Test.'
)
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name,
  initials = excluded.initials,
  role = excluded.role,
  active = excluded.active,
  team = excluded.team,
  bio = excluded.bio;

commit;
