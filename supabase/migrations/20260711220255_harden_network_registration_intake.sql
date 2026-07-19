-- Hardening for public network intake: idempotent submissions, explicit
-- e-mail verification state, immutable evidence columns and an atomic limiter.

alter table public.network_registrations
  add column if not exists submission_id uuid,
  add column if not exists email_confirmation_status text not null default 'pending',
  add column if not exists email_confirmation_sent_at timestamptz,
  add column if not exists email_confirmed_at timestamptz;

update public.network_registrations
set submission_id = gen_random_uuid()
where submission_id is null;

alter table public.network_registrations
  alter column submission_id set not null;

create unique index if not exists network_registrations_submission_id_key
  on public.network_registrations(submission_id);

alter table public.network_registrations
  drop constraint if exists network_registrations_email_confirmation_check;
alter table public.network_registrations
  add constraint network_registrations_email_confirmation_check
  check (
    (email_confirmation_status = 'confirmed' and email_confirmed_at is not null)
    or (email_confirmation_status in ('pending', 'bounced', 'expired') and email_confirmed_at is null)
  );

alter table public.network_registrations
  drop constraint if exists network_registrations_processing_state_check;
alter table public.network_registrations
  add constraint network_registrations_processing_state_check
  check (
    (status in ('neu', 'in_pruefung', 'zurueckgestellt') and processed_at is null and processed_by is null)
    or (status in ('uebernommen', 'verknuepft', 'abgelehnt', 'widerrufen') and processed_at is not null and processed_by is not null)
  );

alter table public.network_registrations
  drop constraint if exists network_registrations_contact_link_check;
alter table public.network_registrations
  add constraint network_registrations_contact_link_check
  check (status not in ('uebernommen', 'verknuepft') or contact_id is not null);

-- Admins may change only workflow state. Contact data, profile answers and
-- consent evidence remain immutable after the server-side intake insert.
revoke update on public.network_registrations from authenticated;
grant update (
  status,
  email_confirmation_status,
  email_confirmation_sent_at,
  email_confirmed_at,
  privacy_check_status,
  duplicate_hint,
  contact_id,
  organization_id,
  processed_at,
  processed_by,
  processing_note,
  updated_at
) on public.network_registrations to authenticated;

create or replace function public.consume_network_registration_rate_limit(
  p_fingerprint text,
  p_window_cutoff timestamptz,
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  next_count integer;
begin
  if nullif(btrim(p_fingerprint), '') is null then
    raise exception 'rate-limit fingerprint is required';
  end if;

  insert into public.network_registration_rate_limits as limits (
    fingerprint,
    window_started_at,
    request_count,
    last_seen_at
  ) values (
    p_fingerprint,
    p_now,
    1,
    p_now
  )
  on conflict (fingerprint) do update
  set
    request_count = case
      when limits.window_started_at < p_window_cutoff then 1
      else least(limits.request_count + 1, 1000)
    end,
    window_started_at = case
      when limits.window_started_at < p_window_cutoff then p_now
      else limits.window_started_at
    end,
    last_seen_at = p_now
  returning request_count into next_count;

  return next_count;
end;
$$;

revoke all on function public.consume_network_registration_rate_limit(text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_network_registration_rate_limit(text, timestamptz, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
