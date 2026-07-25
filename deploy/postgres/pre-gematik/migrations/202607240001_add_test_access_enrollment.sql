-- Adds scoped test access and the protected enrollment hand-off.
-- Apply as the existing schema owner, never as the application or access operator.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = public, pg_catalog;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-schema-v1', 0));

alter table public.identity_bindings
  add column if not exists access_scope text not null default 'standard',
  add column if not exists scope_ref text;

do $pre_gematik_identity_scope_constraints$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.identity_bindings'::pg_catalog.regclass
       and conname = 'identity_bindings_access_scope_value_check'
  ) then
    alter table public.identity_bindings
      add constraint identity_bindings_access_scope_value_check
      check (access_scope in ('standard', 'test_only'));
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.identity_bindings'::pg_catalog.regclass
       and conname = 'identity_bindings_access_scope_check'
  ) then
    alter table public.identity_bindings
      add constraint identity_bindings_access_scope_check check (
        (access_scope = 'standard' and scope_ref is null)
        or (
          access_scope = 'test_only'
          and nullif(btrim(scope_ref), '') is not null
          and length(scope_ref) <= 128
        )
      );
  end if;
end
$pre_gematik_identity_scope_constraints$;

create index if not exists identity_bindings_scope_idx
  on public.identity_bindings (access_scope, scope_ref)
  where active;

create table if not exists public.identity_enrollment_requests (
  request_id uuid primary key default gen_random_uuid(),
  issuer text not null,
  subject text not null,
  verified_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'rejected', 'expired')),
  requested_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  applied_profile_id text references public.profiles(id) on delete restrict,
  unique (issuer, subject),
  check (issuer ~ '^https://[^[:space:]]+$'),
  check (length(issuer) <= 2048),
  check (nullif(btrim(subject), '') is not null and length(subject) <= 512),
  check (
    verified_email = btrim(verified_email)
    and position('@' in verified_email) > 1
    and length(verified_email) <= 320
  ),
  check (last_seen_at >= requested_at),
  check (expires_at > requested_at),
  constraint identity_enrollment_requests_applied_profile_check check (
    (status = 'applied' and applied_profile_id is not null)
    or (status <> 'applied' and applied_profile_id is null)
  )
);

create index if not exists identity_enrollment_requests_status_expiry_idx
  on public.identity_enrollment_requests (status, expires_at);

create table if not exists public.test_access_objects (
  scope_ref text not null,
  entity_type text not null,
  entity_id text not null,
  created_by text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id),
  check (nullif(btrim(scope_ref), '') is not null and length(scope_ref) <= 128),
  check (
    entity_type = btrim(entity_type)
    and entity_type ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  check (nullif(btrim(entity_id), '') is not null and length(entity_id) <= 512)
);

create index if not exists test_access_objects_scope_idx
  on public.test_access_objects (scope_ref, entity_type, created_at);

drop trigger if exists test_access_objects_pre_gematik_touch_updated_at on public.test_access_objects;
create trigger test_access_objects_pre_gematik_touch_updated_at
before update on public.test_access_objects
for each row execute function public.pre_gematik_touch_updated_at();

revoke all on table
  public.identity_enrollment_requests,
  public.test_access_objects
from public;

revoke all privileges on table
  public.identity_enrollment_requests,
  public.test_access_objects
from vk_app_runtime;

grant select (request_id, issuer, subject, verified_email, status, expires_at)
  on public.identity_enrollment_requests to vk_app_runtime;
grant insert (issuer, subject, verified_email, expires_at)
  on public.identity_enrollment_requests to vk_app_runtime;
grant update (last_seen_at)
  on public.identity_enrollment_requests to vk_app_runtime;

grant select (scope_ref, entity_type, entity_id)
  on public.test_access_objects to vk_app_runtime;
grant insert (scope_ref, entity_type, entity_id, created_by)
  on public.test_access_objects to vk_app_runtime;

-- The v1 operator cannot represent access_scope or enrollment references in
-- its full-state fingerprint. Retain read-only diagnostics, but fail closed
-- for every legacy binding write after the v2 contract becomes available.
do $pre_gematik_disable_legacy_identity_writes$
begin
  if exists (
    select 1 from pg_catalog.pg_roles where rolname = 'vk_identity_admin'
  ) then
    execute 'revoke insert, update on table public.identity_bindings from vk_identity_admin';
  end if;
end
$pre_gematik_disable_legacy_identity_writes$;

commit;
