-- Adds exact-email, one-time allowlist consumption for test-user auto-enrollment.
-- Apply as the existing schema owner; runtime access is granted only after the
-- dedicated SECURITY DEFINER owner role has been bootstrapped and verified.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = public, pg_catalog;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-schema-v1', 0));

create table if not exists public.test_access_allowlist (
  allowlist_id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  profile_id text not null unique,
  display_name text not null,
  initials text,
  role text not null check (role in ('viewer', 'editor')),
  team text,
  bio text,
  scope_ref text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_issuer text,
  consumed_subject text,
  consumed_request_id uuid references public.identity_enrollment_requests(request_id) on delete restrict,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    email_normalized = translate(
      btrim(email_normalized),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz'
    )
    and email_normalized ~ '^[!-~]+@[!-~]+$'
    and email_normalized !~ '@.*@'
    and length(email_normalized) <= 320
    and position('*' in email_normalized) = 0
    and position('%' in email_normalized) = 0
  ),
  check (
    profile_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  ),
  check (nullif(btrim(display_name), '') is not null and length(display_name) <= 256),
  check (initials is null or (nullif(btrim(initials), '') is not null and length(initials) <= 16)),
  check (team is null or (nullif(btrim(team), '') is not null and length(team) <= 256)),
  check (bio is null or (nullif(btrim(bio), '') is not null and length(bio) <= 2048)),
  check (
    nullif(btrim(scope_ref), '') is not null
    and length(scope_ref) <= 128
    and scope_ref ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  check (expires_at > created_at),
  constraint test_access_allowlist_consumption_check check (
    (
      consumed_at is null
      and consumed_issuer is null
      and consumed_subject is null
      and consumed_request_id is null
    )
    or (
      consumed_at is not null
      and consumed_issuer is not null
      and consumed_subject is not null
      and consumed_request_id is not null
    )
  ),
  constraint test_access_allowlist_revocation_check check (
    (revoked_at is null and revoke_reason is null)
    or (
      revoked_at is not null
      and nullif(btrim(revoke_reason), '') is not null
      and length(revoke_reason) <= 512
    )
  ),
  check (not (consumed_at is not null and revoked_at is not null))
);

create unique index if not exists test_access_allowlist_active_email_uidx
  on public.test_access_allowlist (email_normalized)
  where consumed_at is null and revoked_at is null;

create index if not exists test_access_allowlist_state_expiry_idx
  on public.test_access_allowlist (expires_at, allowlist_id)
  where consumed_at is null and revoked_at is null;

create or replace function public.pre_gematik_consume_test_access_allowlist(
  p_request_id uuid,
  p_issuer text,
  p_subject text,
  p_verified_email text,
  p_requested_at timestamptz,
  p_request_expires_at timestamptz
)
returns table (
  request_id uuid,
  status text,
  expires_at timestamptz,
  allowlist_id uuid,
  profile_id text,
  role text,
  access_scope text,
  scope_ref text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $pre_gematik_consume_allowlist$
declare
  normalized_email text;
  matched_allowlist public.test_access_allowlist%rowtype;
  existing_request public.identity_enrollment_requests%rowtype;
  effective_request_id uuid;
  effective_request_expiry timestamptz;
  affected_rows integer;
begin
  normalized_email := translate(
    btrim(coalesce(p_verified_email, '')),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz'
  );

  if p_request_id is null
     or p_issuer is distinct from 'https://cloud.google.com/iap'
     or nullif(btrim(coalesce(p_subject, '')), '') is null
     or length(p_subject) > 512
     or p_subject ~ '[[:cntrl:]]'
     or normalized_email !~ '^[!-~]+@[!-~]+$'
     or normalized_email ~ '@.*@'
     or length(normalized_email) > 320
     or position('*' in normalized_email) > 0
     or position('%' in normalized_email) > 0
     or p_requested_at is null
     or p_request_expires_at is null
     or p_requested_at < pg_catalog.clock_timestamp() - interval '5 minutes'
     or p_requested_at > pg_catalog.clock_timestamp() + interval '5 minutes'
     or p_request_expires_at <= pg_catalog.clock_timestamp()
     or p_request_expires_at > p_requested_at + interval '25 hours' then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('versorgungs-kompass:pre-gematik:identity-bindings')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_issuer || chr(31) || p_subject, 0)
  );

  if exists (
    select 1
      from public.identity_bindings binding
     where binding.issuer = p_issuer
       and binding.subject = p_subject
  ) then
    return;
  end if;

  select allowlist.*
    into matched_allowlist
    from public.test_access_allowlist allowlist
   where allowlist.email_normalized = normalized_email
     and allowlist.consumed_at is null
     and allowlist.revoked_at is null
     and allowlist.expires_at > pg_catalog.clock_timestamp()
   for update;

  if not found then
    return;
  end if;

  if exists (
    select 1 from public.profiles profile where profile.id = matched_allowlist.profile_id
  ) or exists (
    select 1
      from public.identity_bindings binding
     where binding.issuer = p_issuer
       and binding.profile_id = matched_allowlist.profile_id
  ) then
    return;
  end if;

  select enrollment.*
    into existing_request
    from public.identity_enrollment_requests enrollment
   where enrollment.issuer = p_issuer
     and enrollment.subject = p_subject
   for update;

  if found then
    if existing_request.status <> 'pending'
       or existing_request.applied_profile_id is not null
       or existing_request.expires_at <= pg_catalog.clock_timestamp()
       or translate(
         btrim(existing_request.verified_email),
         'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
         'abcdefghijklmnopqrstuvwxyz'
       ) <> normalized_email then
      return;
    end if;
    effective_request_id := existing_request.request_id;
    effective_request_expiry := existing_request.expires_at;
  else
    if exists (
      select 1
        from public.identity_enrollment_requests enrollment
       where enrollment.request_id = p_request_id
    ) then
      return;
    end if;
    effective_request_id := p_request_id;
    effective_request_expiry := p_request_expires_at;
  end if;

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
    matched_allowlist.profile_id,
    matched_allowlist.email_normalized,
    matched_allowlist.display_name,
    matched_allowlist.initials,
    matched_allowlist.role,
    true,
    matched_allowlist.team,
    matched_allowlist.bio
  );

  if existing_request.request_id is null then
    insert into public.identity_enrollment_requests (
      request_id,
      issuer,
      subject,
      verified_email,
      status,
      requested_at,
      last_seen_at,
      expires_at
    ) values (
      effective_request_id,
      p_issuer,
      p_subject,
      normalized_email,
      'pending',
      p_requested_at,
      p_requested_at,
      effective_request_expiry
    );
  end if;

  insert into public.identity_bindings (
    issuer,
    subject,
    profile_id,
    active,
    access_scope,
    scope_ref
  ) values (
    p_issuer,
    p_subject,
    matched_allowlist.profile_id,
    true,
    'test_only',
    matched_allowlist.scope_ref
  );

  update public.identity_enrollment_requests enrollment
     set status = 'applied',
         applied_profile_id = matched_allowlist.profile_id
   where enrollment.request_id = effective_request_id
     and enrollment.status = 'pending'
     and enrollment.applied_profile_id is null;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'allowlist enrollment request invariant failed'
      using errcode = '55000';
  end if;

  update public.test_access_allowlist allowlist
     set consumed_at = pg_catalog.clock_timestamp(),
         consumed_issuer = p_issuer,
         consumed_subject = p_subject,
         consumed_request_id = effective_request_id
   where allowlist.allowlist_id = matched_allowlist.allowlist_id
     and allowlist.consumed_at is null
     and allowlist.revoked_at is null;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'allowlist consumption invariant failed'
      using errcode = '55000';
  end if;

  return query
  select
    effective_request_id,
    'applied'::text,
    effective_request_expiry,
    matched_allowlist.allowlist_id,
    matched_allowlist.profile_id,
    matched_allowlist.role,
    'test_only'::text,
    matched_allowlist.scope_ref;
end
$pre_gematik_consume_allowlist$;

revoke all on function public.pre_gematik_consume_test_access_allowlist(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public;

drop trigger if exists test_access_allowlist_pre_gematik_touch_updated_at
  on public.test_access_allowlist;
create trigger test_access_allowlist_pre_gematik_touch_updated_at
before update on public.test_access_allowlist
for each row execute function public.pre_gematik_touch_updated_at();

revoke all on table public.test_access_allowlist from public;
revoke all on table public.test_access_allowlist from vk_app_runtime;
revoke all on function public.pre_gematik_consume_test_access_allowlist(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from vk_app_runtime;

commit;
