-- Privacy-by-design intake for the public #Mitmachen network registration.
-- Anonymous visitors may only create an unprocessed intake row. Only admins can
-- read, classify, link or delete registrations. No public SELECT policy exists.

create table if not exists public.network_registrations (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  status text not null default 'neu'
    check (status in ('neu', 'in_pruefung', 'zurueckgestellt', 'uebernommen', 'verknuepft', 'abgelehnt', 'widerrufen')),
  onboarding_stage text not null default 'registered'
    check (onboarding_stage in ('registered', 'profile_started', 'profile_complete', 'verified')),

  title text,
  first_name text not null,
  last_name text not null,
  email text not null,
  professional_group text,
  role text,
  employment_status text,
  years_in_profession_band text,
  age_group text,

  organization text,
  sector text,
  postal_code text,
  city text,
  federal_state text,
  employee_count_band text,

  primary_system_type text,
  primary_system_vendor text,
  primary_system_product text,
  ti_applications text[] not null default '{}'::text[],
  participation_formats text[] not null default '{}'::text[],
  interest_topics text[] not null default '{}'::text[],
  preferred_contact text not null default 'E-Mail',
  message text,

  eligibility_confirmed_at timestamptz not null,
  consent_processing_version text not null,
  consent_processing_accepted_at timestamptz not null,
  consent_contact_version text,
  consent_contact_accepted_at timestamptz,
  privacy_notice_version text not null,
  form_version text not null,
  language text not null default 'de',
  source_url text,
  privacy_check_status text not null default 'bereit_zur_pruefung',
  retention_review_at timestamptz not null default (now() + interval '6 months'),
  duplicate_hint text,

  contact_id text references public.contacts(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete set null,
  processing_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint network_registrations_name_length_check
    check (char_length(btrim(first_name)) between 1 and 120 and char_length(btrim(last_name)) between 1 and 120),
  constraint network_registrations_email_check
    check (char_length(email) between 3 and 320 and position('@' in email) > 1),
  constraint network_registrations_text_lengths_check
    check (
      char_length(coalesce(organization, '')) <= 240
      and char_length(coalesce(role, '')) <= 180
      and char_length(coalesce(message, '')) <= 3000
      and char_length(coalesce(processing_note, '')) <= 3000
    ),
  constraint network_registrations_postal_code_check
    check (postal_code is null or postal_code = '' or postal_code ~ '^[0-9]{5}$'),
  constraint network_registrations_contact_consent_check
    check (
      (consent_contact_accepted_at is null and nullif(btrim(coalesce(consent_contact_version, '')), '') is null)
      or (consent_contact_accepted_at is not null and nullif(btrim(coalesce(consent_contact_version, '')), '') is not null)
    ),
  constraint network_registrations_processing_state_check
    check (
      (status in ('neu', 'in_pruefung', 'zurueckgestellt') and processed_at is null)
      or (status in ('uebernommen', 'verknuepft', 'abgelehnt', 'widerrufen') and processed_at is not null)
  )
);

create table if not exists public.network_registration_rate_limits (
  fingerprint text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count between 1 and 1000),
  last_seen_at timestamptz not null default now()
);

create index if not exists network_registrations_status_submitted_idx
  on public.network_registrations(status, submitted_at desc);

create index if not exists network_registrations_email_normalized_idx
  on public.network_registrations(lower(btrim(email)));

create index if not exists network_registrations_organization_lookup_idx
  on public.network_registrations(lower(btrim(coalesce(organization, ''))), postal_code);

create index if not exists network_registrations_contact_id_idx
  on public.network_registrations(contact_id)
  where contact_id is not null;

create index if not exists network_registration_rate_limits_last_seen_idx
  on public.network_registration_rate_limits(last_seen_at);

drop trigger if exists network_registrations_touch_updated_at on public.network_registrations;
create trigger network_registrations_touch_updated_at
before update on public.network_registrations
for each row execute function public.touch_updated_at();

alter table public.network_registrations enable row level security;
alter table public.network_registration_rate_limits enable row level security;

revoke all on public.network_registrations from anon, authenticated, service_role;
grant select, update, delete on public.network_registrations to authenticated;
grant select, insert, update, delete on public.network_registrations to service_role;
revoke all on public.network_registration_rate_limits from anon, authenticated, service_role;
grant select, insert, update, delete on public.network_registration_rate_limits to service_role;

drop policy if exists "network registrations admin read" on public.network_registrations;
create policy "network registrations admin read"
on public.network_registrations for select
to authenticated
using ((select public.current_profile_role()) = 'admin');

drop policy if exists "network registrations admin update" on public.network_registrations;
create policy "network registrations admin update"
on public.network_registrations for update
to authenticated
using ((select public.current_profile_role()) = 'admin')
with check ((select public.current_profile_role()) = 'admin');

drop policy if exists "network registrations admin delete" on public.network_registrations;
create policy "network registrations admin delete"
on public.network_registrations for delete
to authenticated
using ((select public.current_profile_role()) = 'admin');

comment on table public.network_registrations is
  'Purpose-bound public #Mitmachen registration intake. Anonymous inserts are not publicly readable.';

-- Remove legacy table privileges that are outside the browser application's
-- CRUD contract. RLS does not protect TRUNCATE, so this is an explicit guard.
revoke all on public.contacts, public.organizations from anon;
revoke truncate, references, trigger, maintain on public.contacts, public.organizations from authenticated;

notify pgrst, 'reload schema';
