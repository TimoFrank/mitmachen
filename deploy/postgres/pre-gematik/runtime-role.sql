-- NOLOGIN-Laufzeitrolle fuer die befristete Pre-Integration.
-- Diese Rolle traegt ausschliesslich die in grants.sql dokumentierten App-Rechte.

\set ON_ERROR_STOP on

begin;

revoke create on schema public from public;

do $pre_gematik_runtime_role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'vk_app_runtime'
  ) then
    create role vk_app_runtime nologin;
  end if;
end
$pre_gematik_runtime_role$;

alter role vk_app_runtime nologin;

do $pre_gematik_runtime_role_safety$
begin
  if exists (
    select 1
      from pg_catalog.pg_roles
     where rolname = 'vk_app_runtime'
       and (
         rolcanlogin
         or rolsuper
         or rolcreatedb
         or rolcreaterole
         or rolreplication
         or rolbypassrls
       )
  ) then
    raise exception 'vk_app_runtime besitzt unzulaessige Login- oder Verwaltungsattribute';
  end if;
end
$pre_gematik_runtime_role_safety$;

commit;
