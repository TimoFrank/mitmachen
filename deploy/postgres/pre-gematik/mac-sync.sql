begin;
create schema if not exists mac_sync;
revoke all on schema mac_sync from public;
create table if not exists mac_sync.devices (
  id uuid primary key,
  secret_hash text not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  code_hash text unique not null check (code_hash ~ '^[a-f0-9]{64}$'),
  label text not null check (length(label) between 1 and 80),
  profile_id text references public.profiles(id),
  issuer text, subject text, google_uid text,
  created_at timestamptz not null default now(),
  pair_expires_at timestamptz not null,
  paired_at timestamptz, expires_at timestamptz, revoked_at timestamptz,
  check ((paired_at is null) or (profile_id is not null and issuer is not null and subject is not null and google_uid is not null and expires_at is not null))
);
create index if not exists mac_sync_devices_profile on mac_sync.devices (profile_id) where revoked_at is null;
create table if not exists mac_sync.receipts (
  device_id uuid not null references mac_sync.devices(id),
  operation_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (device_id, operation_id)
);
revoke all on all tables in schema mac_sync from public;
grant usage on schema mac_sync to vk_app;
grant select, insert, update on mac_sync.devices to vk_app;
grant select, insert on mac_sync.receipts to vk_app;
commit;
