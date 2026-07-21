-- Bindet genau eine OIDC-Testidentitaet an ein synthetisches PoC-Profil.
-- Ausschliesslich fuer die dedizierte, disponibel neu aufbaubare PoC-Datenbank.
-- Pflichtvariablen: issuer, subject, profile_id

\set ON_ERROR_STOP on

\if :{?issuer}
\else
  \echo 'FEHLER: Pflichtvariable issuer fehlt.'
  select 1 / 0 as poc_binding_aborted;
\endif

\if :{?subject}
\else
  \echo 'FEHLER: Pflichtvariable subject fehlt.'
  select 1 / 0 as poc_binding_aborted;
\endif

\if :{?profile_id}
\else
  \echo 'FEHLER: Pflichtvariable profile_id fehlt.'
  select 1 / 0 as poc_binding_aborted;
\endif

select
  nullif(btrim(:'issuer'), '') is not null
  and :'issuer' ~ '^https://[^[:space:]]+$'
  and length(:'issuer') <= 2048
  as poc_issuer_is_valid
\gset

\if :poc_issuer_is_valid
\else
  \echo 'FEHLER: issuer muss eine nicht-leere HTTPS-URL mit hoechstens 2048 Zeichen sein.'
  select 1 / 0 as poc_binding_aborted;
\endif

select
  nullif(btrim(:'subject'), '') is not null
  and length(:'subject') <= 512
  as poc_subject_is_valid
\gset

\if :poc_subject_is_valid
\else
  \echo 'FEHLER: subject muss nicht leer und hoechstens 512 Zeichen lang sein.'
  select 1 / 0 as poc_binding_aborted;
\endif

select :'profile_id' = any (array[
  'demo-profile-admin',
  'demo-profile-editor',
  'demo-profile-viewer',
  'demo-profile-hospitation',
  'demo-profile-formate'
]::text[]) as poc_profile_id_is_allowed
\gset

\if :poc_profile_id_is_allowed
\else
  \echo 'FEHLER: profile_id ist kein freigegebenes synthetisches PoC-Profil.'
  select 1 / 0 as poc_binding_aborted;
\endif

begin;

set local lock_timeout = '10s';
set local search_path = public, pg_catalog;

select pg_advisory_xact_lock(
  hashtextextended('versorgungs-kompass-poc-gematik-test-identity-v1', 0)
);

select
  to_regclass('public.profiles') is not null
  and to_regclass('public.identity_bindings') is not null
  as poc_identity_schema_is_present
\gset

\if :poc_identity_schema_is_present
\else
  \echo 'FEHLER: Das erwartete PoC-Schema ist nicht vollstaendig vorhanden.'
  select 1 / 0 as poc_binding_aborted;
\endif

select exists (
  select 1
    from public.profiles profile
   where profile.id = :'profile_id'
     and profile.active is true
     and profile.id = any (array[
       'demo-profile-admin',
       'demo-profile-editor',
       'demo-profile-viewer',
       'demo-profile-hospitation',
       'demo-profile-formate'
     ]::text[])
     and position('pre-gematik-synthetic-v1' in coalesce(profile.bio, '')) > 0
) as poc_seed_profile_is_valid
\gset

\if :poc_seed_profile_is_valid
\else
  \echo 'FEHLER: Das Profil fehlt, ist inaktiv oder traegt nicht den Seed-Marker pre-gematik-synthetic-v1.'
  select 1 / 0 as poc_binding_aborted;
\endif

select not exists (
  select 1
    from public.identity_bindings binding
   where binding.issuer = :'issuer'
     and binding.subject = :'subject'
     and binding.profile_id is distinct from :'profile_id'
) as poc_identity_assignment_is_safe
\gset

\if :poc_identity_assignment_is_safe
\else
  \echo 'FEHLER: Diese Issuer-/Subject-Identitaet ist bereits einem anderen Profil zugeordnet; Neuzuordnung wird verweigert.'
  select 1 / 0 as poc_binding_aborted;
\endif

select not exists (
  select 1
    from public.identity_bindings binding
   where binding.issuer = :'issuer'
     and binding.profile_id = :'profile_id'
     and binding.subject is distinct from :'subject'
) as poc_profile_assignment_is_safe
\gset

\if :poc_profile_assignment_is_safe
\else
  \echo 'FEHLER: Dieses Profil ist beim angegebenen Issuer bereits einer anderen Testidentitaet zugeordnet.'
  select 1 / 0 as poc_binding_aborted;
\endif

with applied as (
  insert into public.identity_bindings as current_binding (
    issuer,
    subject,
    profile_id,
    active
  ) values (
    :'issuer',
    :'subject',
    :'profile_id',
    true
  )
  on conflict (issuer, subject) do update
     set active = true,
         updated_at = now()
   where current_binding.profile_id = excluded.profile_id
  returning 1
)
select count(*) = 1 as poc_binding_was_applied
  from applied
\gset

\if :poc_binding_was_applied
\else
  \echo 'FEHLER: Die Bindung konnte nicht sicher angelegt oder aktiviert werden.'
  select 1 / 0 as poc_binding_aborted;
\endif

select exists (
  select 1
    from public.identity_bindings binding
   where binding.issuer = :'issuer'
     and binding.subject = :'subject'
     and binding.profile_id = :'profile_id'
     and binding.active is true
) as poc_binding_is_verified
\gset

\if :poc_binding_is_verified
\else
  \echo 'FEHLER: Die abschliessende Binding-Pruefung ist fehlgeschlagen.'
  select 1 / 0 as poc_binding_aborted;
\endif

commit;

\echo 'OK: Die synthetische PoC-Testidentitaet ist aktiv und unveraendert zugeordnet.'
