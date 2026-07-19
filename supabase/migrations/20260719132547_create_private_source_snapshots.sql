-- Protected, non-API source snapshots used to prove lossless removal of
-- historical contact and stakeholder seed data from the public repository.

create schema if not exists private;

-- Keep schema USAGE for the authenticated helper functions introduced by the
-- preceding OWASP migration. The snapshot table itself remains inaccessible.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists private.protected_source_snapshots (
  dataset text not null,
  record_id text not null,
  source_ref text not null,
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  primary key (dataset, record_id)
);

alter table private.protected_source_snapshots enable row level security;
alter table private.protected_source_snapshots force row level security;

revoke all on table private.protected_source_snapshots from public, anon, authenticated, service_role;

comment on table private.protected_source_snapshots is
  'Non-API migration evidence for source records removed from public Git history.';
