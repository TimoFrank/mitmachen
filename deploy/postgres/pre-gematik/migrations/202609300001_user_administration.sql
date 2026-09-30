-- Separater, minimaler Laufzeitzugang fuer die ausdruecklich aktivierte Nutzerverwaltung.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';
create schema if not exists user_administration;
revoke all on schema user_administration from public;
create table if not exists user_administration.invitations (
  id uuid primary key,
  uid text not null unique,
  profile_id text not null unique,
  input jsonb not null,
  status text not null check(status in ('preparing','ready','sending','accepted','sent','uncertain')),
  package jsonb,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index if not exists invitations_email_idx on user_administration.invitations(lower(input->>'email'));
create table if not exists user_administration.audit (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null,
  target_id text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
do $$ begin
  if not exists(select 1 from pg_roles where rolname='vk_user_admin_runtime') then
    create role vk_user_admin_runtime nologin noinherit;
  end if;
  if exists(select 1 from pg_roles where rolname='vk_user_admin_runtime' and
    (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then
    raise exception 'Unsafe user administration role';
  end if;
end $$;
revoke all on all tables in schema user_administration from public;
grant usage on schema public, user_administration to vk_user_admin_runtime;
grant select on public.profiles, public.identity_bindings to vk_user_admin_runtime;
grant select (request_id,subject,verified_email) on public.identity_enrollment_requests to vk_user_admin_runtime;
grant insert (id,email,display_name,role,active) on public.profiles to vk_user_admin_runtime;
grant update (role,active) on public.profiles to vk_user_admin_runtime;
grant insert (issuer,subject,profile_id,active,access_scope,scope_ref) on public.identity_bindings to vk_user_admin_runtime;
grant execute on function public.pre_gematik_touch_updated_at() to vk_user_admin_runtime;
grant select,insert,update on user_administration.invitations to vk_user_admin_runtime;
grant select,insert on user_administration.audit to vk_user_admin_runtime;
grant usage,select on sequence user_administration.audit_id_seq to vk_user_admin_runtime;
revoke update,delete,truncate on user_administration.audit from vk_user_admin_runtime;
commit;
