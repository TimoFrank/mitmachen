-- Adds the fail-closed IAP/OIDC subject mapping required by the current API.
-- Apply with a short-lived schema-administration account, never vk_app.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = public, pg_catalog;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-schema-v1', 0));

create table if not exists public.identity_bindings (
  issuer text not null,
  subject text not null,
  profile_id text not null references public.profiles(id) on delete cascade,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (issuer, subject),
  unique (issuer, profile_id),
  check (issuer ~ '^https://[^[:space:]]+$'),
  check (length(issuer) <= 2048),
  check (nullif(btrim(subject), '') is not null and length(subject) <= 512)
);

create index if not exists identity_bindings_active_profile_idx
  on public.identity_bindings (profile_id, active);

drop trigger if exists identity_bindings_pre_gematik_touch_updated_at on public.identity_bindings;
create trigger identity_bindings_pre_gematik_touch_updated_at
before update on public.identity_bindings
for each row execute function public.pre_gematik_touch_updated_at();

revoke all on table public.identity_bindings from public;
grant select on table public.identity_bindings to vk_app_runtime;

commit;
