create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  initials text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  avatar_url text,
  team text,
  bio text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists team text;
alter table public.profiles add column if not exists bio text;

create table if not exists public.contacts (
  id text primary key,
  name text not null,
  organization_id uuid,
  organization text,
  sector text,
  specialty text,
  role text,
  priority text not null default 'Mittel' check (priority in ('Hoch', 'Mittel', 'Niedrig')),
  owner_id uuid references public.profiles(id),
  postal_code text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  email text,
  phone text,
  linkedin text,
  mitmachen_consent_status text not null default 'not_requested' check (mitmachen_consent_status in ('granted', 'not_requested', 'declined', 'withdrawn', 'clarification_needed')),
  mitmachen_consent_effective_at timestamptz,
  mitmachen_consent_source text check (mitmachen_consent_source is null or mitmachen_consent_source in ('online_form', 'email', 'written', 'verbal_confirmed', 'manual_transfer')),
  mitmachen_consent_text_version text,
  mitmachen_consent_recorded_by uuid references public.profiles(id),
  mitmachen_consent_note text,
  topics text[] not null default '{}',
  notes text,
  source text,
  image_url text,
  image_source_url text,
  image_source_label text,
  image_rights_note text,
  image_updated_at timestamptz,
  image_updated_by uuid references public.profiles(id),
  image_storage_path text,
  image_kind text check (image_kind is null or image_kind in ('upload', 'external')),
  image_mime_type text,
  image_file_size bigint check (image_file_size is null or image_file_size between 1 and 5242880),
  image_width integer,
  image_height integer,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.contacts add column if not exists mitmachen_consent_status text not null default 'not_requested';
alter table public.contacts add column if not exists mitmachen_consent_effective_at timestamptz;
alter table public.contacts add column if not exists mitmachen_consent_source text;
alter table public.contacts add column if not exists mitmachen_consent_text_version text;
alter table public.contacts add column if not exists mitmachen_consent_recorded_by uuid references public.profiles(id);
alter table public.contacts add column if not exists mitmachen_consent_note text;

alter table public.contacts drop constraint if exists contacts_mitmachen_consent_status_check;
alter table public.contacts
  add constraint contacts_mitmachen_consent_status_check
  check (mitmachen_consent_status in ('granted', 'not_requested', 'declined', 'withdrawn', 'clarification_needed'));

alter table public.contacts drop constraint if exists contacts_mitmachen_consent_source_check;
alter table public.contacts
  add constraint contacts_mitmachen_consent_source_check
  check (mitmachen_consent_source is null or mitmachen_consent_source in ('online_form', 'email', 'written', 'verbal_confirmed', 'manual_transfer'));

alter table public.contacts drop constraint if exists contacts_mitmachen_consent_required_fields_check;
alter table public.contacts
  add constraint contacts_mitmachen_consent_required_fields_check
  check (
    mitmachen_consent_status <> 'granted'
    or (mitmachen_consent_effective_at is not null and mitmachen_consent_source is not null and mitmachen_consent_recorded_by is not null)
  );

alter table public.contacts drop constraint if exists contacts_mitmachen_consent_decision_time_check;
alter table public.contacts
  add constraint contacts_mitmachen_consent_decision_time_check
  check (mitmachen_consent_status not in ('declined', 'withdrawn') or mitmachen_consent_effective_at is not null);

alter table public.contacts drop constraint if exists contacts_mitmachen_verbal_note_check;
alter table public.contacts drop constraint if exists contacts_mitmachen_evidence_note_check;
alter table public.contacts
  add constraint contacts_mitmachen_evidence_note_check
  check (
    mitmachen_consent_source not in ('verbal_confirmed', 'manual_transfer')
    or length(btrim(coalesce(mitmachen_consent_note, ''))) > 0
  );
create or replace function public.prepare_contact_consent_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  consent_changed boolean;
begin
  consent_changed := case
    when tg_op = 'INSERT' then
      new.mitmachen_consent_status <> 'not_requested'
      or new.mitmachen_consent_effective_at is not null
      or new.mitmachen_consent_source is not null
      or new.mitmachen_consent_text_version is not null
      or new.mitmachen_consent_recorded_by is not null
      or new.mitmachen_consent_note is not null
    else
      row(
        old.mitmachen_consent_status,
        old.mitmachen_consent_effective_at,
        old.mitmachen_consent_source,
        old.mitmachen_consent_text_version,
        old.mitmachen_consent_recorded_by,
        old.mitmachen_consent_note
      ) is distinct from row(
        new.mitmachen_consent_status,
        new.mitmachen_consent_effective_at,
        new.mitmachen_consent_source,
        new.mitmachen_consent_text_version,
        new.mitmachen_consent_recorded_by,
        new.mitmachen_consent_note
      )
  end;

  if consent_changed then
    if new.updated_by is null then
      raise exception using
        errcode = '23502',
        message = 'Einwilligungsänderungen benötigen eine authentifizierte erfassende Person.';
    end if;

    new.mitmachen_consent_recorded_by := new.updated_by;

    if new.mitmachen_consent_status in ('granted', 'declined', 'withdrawn')
      and new.mitmachen_consent_effective_at > statement_timestamp()
    then
      raise exception using
        errcode = '23514',
        message = 'Der Wirksamkeitszeitpunkt einer #Mitmachen-Einwilligung darf nicht in der Zukunft liegen.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.prepare_contact_consent_write() from public, anon, authenticated;

drop trigger if exists contacts_prepare_mitmachen_consent_insert on public.contacts;
create trigger contacts_prepare_mitmachen_consent_insert
before insert on public.contacts
for each row
execute function public.prepare_contact_consent_write();

drop trigger if exists contacts_prepare_mitmachen_consent_update on public.contacts;
create trigger contacts_prepare_mitmachen_consent_update
before update of
  mitmachen_consent_status,
  mitmachen_consent_effective_at,
  mitmachen_consent_source,
  mitmachen_consent_text_version,
  mitmachen_consent_recorded_by,
  mitmachen_consent_note,
  updated_by
on public.contacts
for each row
execute function public.prepare_contact_consent_write();

create or replace function public.log_contact_consent_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.changes (
    contact_id,
    action,
    field_name,
    old_value,
    new_value,
    changed_at,
    changed_by
  )
  select
    new.id,
    'update',
    delta.field_name,
    coalesce(delta.old_value, ''),
    coalesce(delta.new_value, ''),
    coalesce(new.updated_at, statement_timestamp()),
    new.updated_by
  from (
    values
      ('mitmachen_consent_status', old.mitmachen_consent_status::text, new.mitmachen_consent_status::text),
      ('mitmachen_consent_effective_at', old.mitmachen_consent_effective_at::text, new.mitmachen_consent_effective_at::text),
      ('mitmachen_consent_source', old.mitmachen_consent_source::text, new.mitmachen_consent_source::text),
      ('mitmachen_consent_text_version', old.mitmachen_consent_text_version::text, new.mitmachen_consent_text_version::text),
      ('mitmachen_consent_recorded_by', old.mitmachen_consent_recorded_by::text, new.mitmachen_consent_recorded_by::text),
      ('mitmachen_consent_note', old.mitmachen_consent_note::text, new.mitmachen_consent_note::text)
  ) as delta(field_name, old_value, new_value)
  where delta.old_value is distinct from delta.new_value;

  return new;
end;
$function$;

revoke all on function public.log_contact_consent_changes() from public, anon, authenticated;

drop trigger if exists contacts_log_mitmachen_consent_changes on public.contacts;
create trigger contacts_log_mitmachen_consent_changes
after update of
  mitmachen_consent_status,
  mitmachen_consent_effective_at,
  mitmachen_consent_source,
  mitmachen_consent_text_version,
  mitmachen_consent_recorded_by,
  mitmachen_consent_note
on public.contacts
for each row
execute function public.log_contact_consent_changes();


create table if not exists public.contact_owners (
  contact_id text not null references public.contacts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (contact_id, profile_id)
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  sector text,
  organization_type text,
  postal_code text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  website text,
  phone text,
  email text,
  logo_url text,
  logo_source_url text,
  logo_source_label text,
  member_count integer,
  member_count_source_url text,
  member_count_source_label text,
  member_count_updated_at date,
  member_count_scope text,
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.organization_primary_systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  system_type text not null check (system_type in ('PVS', 'KIS', 'AVS', 'ZPVS', 'LIS', 'HVS', 'PFLEGE', 'SONSTIGES')),
  vendor_name text,
  product_name text,
  source_url text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.network_registrations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  submitted_at timestamptz not null default now(),
  status text not null default 'neu' check (status in ('neu', 'in_pruefung', 'zurueckgestellt', 'uebernommen', 'verknuepft', 'abgelehnt', 'widerrufen')),
  onboarding_stage text not null default 'registered' check (onboarding_stage in ('registered', 'profile_started', 'profile_complete', 'verified')),
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
  email_confirmation_status text not null default 'pending',
  email_confirmation_sent_at timestamptz,
  email_confirmed_at timestamptz,
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
  constraint network_registrations_name_length_check check (char_length(btrim(first_name)) between 1 and 120 and char_length(btrim(last_name)) between 1 and 120),
  constraint network_registrations_email_check check (char_length(email) between 3 and 320 and position('@' in email) > 1),
  constraint network_registrations_text_lengths_check check (char_length(coalesce(organization, '')) <= 240 and char_length(coalesce(role, '')) <= 180 and char_length(coalesce(message, '')) <= 3000 and char_length(coalesce(processing_note, '')) <= 3000),
  constraint network_registrations_postal_code_check check (postal_code is null or postal_code = '' or postal_code ~ '^[0-9]{5}$'),
  constraint network_registrations_contact_consent_check check ((consent_contact_accepted_at is null and nullif(btrim(coalesce(consent_contact_version, '')), '') is null) or (consent_contact_accepted_at is not null and nullif(btrim(coalesce(consent_contact_version, '')), '') is not null)),
  constraint network_registrations_email_confirmation_check check ((email_confirmation_status = 'confirmed' and email_confirmed_at is not null) or (email_confirmation_status in ('pending', 'bounced', 'expired') and email_confirmed_at is null)),
  constraint network_registrations_processing_state_check check ((status in ('neu', 'in_pruefung', 'zurueckgestellt') and processed_at is null and processed_by is null) or (status in ('uebernommen', 'verknuepft', 'abgelehnt', 'widerrufen') and processed_at is not null and processed_by is not null)),
  constraint network_registrations_contact_link_check check (status not in ('uebernommen', 'verknuepft') or contact_id is not null)
);

create table if not exists public.network_registration_rate_limits (
  fingerprint text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count between 1 and 1000),
  last_seen_at timestamptz not null default now()
);

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
    request_count = case when limits.window_started_at < p_window_cutoff then 1 else least(limits.request_count + 1, 1000) end,
    window_started_at = case when limits.window_started_at < p_window_cutoff then p_now else limits.window_started_at end,
    last_seen_at = p_now
  returning request_count into next_count;

  return next_count;
end;
$$;

revoke all on function public.consume_network_registration_rate_limit(text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_network_registration_rate_limit(text, timestamptz, timestamptz)
  to service_role;

create table if not exists public.formats (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  format_type text not null default 'Roundtable',
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  goal text,
  owner_id uuid references public.profiles(id),
  status text not null default 'Planung' check (status in ('Planung', 'Aktiv', 'Abgeschlossen', 'Archiviert')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.format_participants (
  id uuid primary key default gen_random_uuid(),
  format_id uuid not null references public.formats(id) on delete cascade,
  contact_id text not null references public.contacts(id) on delete cascade,
  invitation_status text not null default 'Kandidat' check (invitation_status in ('Kandidat', 'Eingeladen', 'Zugesagt', 'Abgesagt', 'Keine Rückmeldung', 'Teilgenommen')),
  participant_role text,
  notes text,
  invited_at timestamptz,
  responded_at timestamptz,
  participated_at timestamptz,
  cancelled_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (format_id, contact_id)
);

create table if not exists public.hospitation_slots (
  id uuid primary key default gen_random_uuid(),
  contact_id text references public.contacts(id) on delete set null,
  contact_name text,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  city text,
  federal_state text,
  sector text,
  capacity integer not null default 1 check (capacity >= 1),
  owner_id uuid references public.profiles(id),
  status text not null default 'Frei' check (status in ('Frei', 'Reserviert', 'Gebucht', 'Abgesagt', 'Archiviert')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.hospitations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references public.hospitation_slots(id) on delete set null,
  contact_id text references public.contacts(id) on delete set null,
  contact_name text,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  requester_profile_id uuid references public.profiles(id),
  owner_id uuid references public.profiles(id),
  status text not null default 'Angefragt' check (status in ('Entwurf', 'Angefragt', 'Angeboten', 'Gebucht', 'Abgelehnt', 'Abgesagt', 'Durchgeführt', 'Dokumentiert', 'Archiviert')),
  requested_windows jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  city text,
  federal_state text,
  sector text,
  goal text,
  topics text[] not null default '{}'::text[],
  request_note text,
  documentation_summary text,
  documentation_outcome text,
  follow_up_note text,
  follow_up_owner_id uuid references public.profiles(id),
  follow_up_due_at date,
  documented_at timestamptz,
  documented_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  roadmap_version text not null default 'OneRoadmap Q2/2026',
  source_url text,
  product_area text not null,
  product_name text not null,
  feature_name text not null,
  phase text,
  roadmap_status text not null default 'Unklar' check (roadmap_status in ('In Bearbeitung', 'In Planung', 'Offen', 'Im Backlog', 'Unklar')),
  timeline_label text,
  deadline_type text not null default 'Unklar' check (deadline_type in ('SGB V', 'EHDS', 'gematik Planung', 'Backlog', 'Technische Abhängigkeit', 'Keine Frist', 'Unklar')),
  legal_basis text,
  user_groups text[] not null default '{}'::text[],
  primary_systems text[] not null default '{}'::text[],
  description text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.hospitation_roadmap_assessments (
  id uuid primary key default gen_random_uuid(),
  hospitation_id uuid not null references public.hospitations(id) on delete cascade,
  roadmap_item_id uuid not null references public.roadmap_items(id) on delete restrict,
  respondent_role text,
  respondent_sector text,
  care_relevance integer check (care_relevance between 1 and 5),
  patient_safety integer check (patient_safety between 1 and 5),
  process_relief integer check (process_relief between 1 and 5),
  urgency integer check (urgency between 1 and 5),
  implementation_feasibility integer check (implementation_feasibility between 1 and 5),
  adoption_likelihood integer check (adoption_likelihood between 1 and 5),
  confidence_score integer check (confidence_score between 1 and 5),
  comparison_role text not null default 'none' check (comparison_role in ('none', 'top_priority', 'low_priority')),
  evidence_note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (hospitation_id, roadmap_item_id)
);

create table if not exists public.hospitation_unmet_needs (
  id uuid primary key default gen_random_uuid(),
  hospitation_id uuid not null references public.hospitations(id) on delete cascade,
  related_roadmap_item_id uuid references public.roadmap_items(id) on delete set null,
  title text not null,
  problem text,
  affected_role text,
  affected_sector text,
  classification text not null default 'new_backlog_item' check (classification in ('existing_item_extension', 'new_backlog_item', 'legal_clarification', 'organizational_implementation', 'local_system_issue', 'communication_or_training')),
  expected_benefit integer check (expected_benefit between 1 and 5),
  urgency integer check (urgency between 1 and 5),
  implementation_feasibility integer check (implementation_feasibility between 1 and 5),
  confidence_score integer check (confidence_score between 1 and 5),
  current_workaround text,
  next_step text,
  status text not null default 'Neu' check (status in ('Neu', 'In Prüfung', 'Übernommen', 'Zurückgestellt', 'Erledigt', 'Archiviert')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.expert_groups (
  id text primary key,
  name text not null unique,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expert_organizations (
  id text primary key,
  name text not null,
  normalized_name text not null,
  group_id text references public.expert_groups(id) on delete set null,
  group_name text,
  organization_type text,
  city text,
  federal_state text,
  website text,
  phone text,
  email text,
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expert_contacts (
  id text primary key,
  name text not null,
  organization_id text references public.expert_organizations(id) on delete set null,
  organization text,
  group_id text not null references public.expert_groups(id) on delete restrict,
  group_name text not null,
  specialty text,
  role text,
  city text,
  federal_state text,
  email text,
  phone text,
  linkedin text,
  topics text[] not null default '{}',
  notes text,
  source text,
  profile_url text,
  owner_id uuid references public.profiles(id) on delete set null,
  owner_ids uuid[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expert_entity_links (
  id uuid primary key default gen_random_uuid(),
  link_type text not null check (link_type in ('contact', 'organization')),
  contact_id text references public.contacts(id) on delete cascade,
  expert_contact_id text references public.expert_contacts(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  expert_organization_id text references public.expert_organizations(id) on delete cascade,
  match_reason text,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  check (
    (
      link_type = 'contact'
      and contact_id is not null
      and expert_contact_id is not null
      and organization_id is null
      and expert_organization_id is null
    )
    or (
      link_type = 'organization'
      and organization_id is not null
      and expert_organization_id is not null
      and contact_id is null
      and expert_contact_id is null
    )
  )
);

create table if not exists public.stakeholder_types (
  id text primary key,
  label text not null,
  description text,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stakeholder_organizations (
  id text primary key,
  stakeholder_type_id text not null references public.stakeholder_types(id) on delete restrict,
  name text not null,
  normalized_name text not null,
  organization_type text,
  sector text,
  postal_code text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  website text,
  phone text,
  email text,
  logo_url text,
  logo_source_url text,
  logo_source_label text,
  member_count integer,
  member_count_source_url text,
  member_count_source_label text,
  member_count_updated_at date,
  member_count_scope text,
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stakeholder_people (
  id text primary key,
  stakeholder_type_id text not null references public.stakeholder_types(id) on delete restrict,
  organization_id text references public.stakeholder_organizations(id) on delete set null,
  organization text,
  name text not null,
  role text,
  committee text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  map_position_source text check (map_position_source is null or map_position_source in ('person', 'organization', 'state')),
  email text,
  phone text,
  linkedin text,
  topics text[] not null default '{}',
  notes text,
  source text,
  profile_url text,
  is_representative_assembly_member boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts
  drop constraint if exists contacts_organization_id_fkey,
  add constraint contacts_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete set null;

alter table public.contacts add column if not exists image_source_url text;
alter table public.contacts add column if not exists image_source_label text;
alter table public.contacts add column if not exists image_rights_note text;
alter table public.contacts add column if not exists image_updated_at timestamptz;
alter table public.contacts add column if not exists image_updated_by uuid references public.profiles(id);
alter table public.contacts add column if not exists image_storage_path text;
alter table public.contacts add column if not exists image_kind text;
alter table public.contacts add column if not exists image_mime_type text;
alter table public.contacts add column if not exists image_file_size bigint;
alter table public.contacts add column if not exists image_width integer;
alter table public.contacts add column if not exists image_height integer;

create index if not exists contacts_image_updated_by_idx
on public.contacts (image_updated_by)
where image_updated_by is not null;

alter table public.contacts drop constraint if exists contacts_image_kind_check;
alter table public.contacts add constraint contacts_image_kind_check
  check (image_kind is null or image_kind in ('upload', 'external'));
alter table public.contacts drop constraint if exists contacts_image_file_size_check;
alter table public.contacts add constraint contacts_image_file_size_check
  check (image_file_size is null or image_file_size between 1 and 5242880);
alter table public.contacts drop constraint if exists contacts_image_dimensions_check;
alter table public.contacts add constraint contacts_image_dimensions_check
  check ((image_width is null and image_height is null) or (image_width between 1 and 4096 and image_height between 1 and 4096));
alter table public.contacts drop constraint if exists contacts_image_reference_check;
alter table public.contacts add constraint contacts_image_reference_check
  check (
    (image_kind is null and image_url is null and image_storage_path is null)
    or (
      image_kind = 'upload'
      and image_storage_path is not null
      and image_url is null
      and image_mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and image_file_size between 1 and 5242880
      and image_width between 1 and 4096
      and image_height between 1 and 4096
    )
    or (
      image_kind = 'external'
      and image_url ~ '^https://'
      and image_storage_path is null
      and image_mime_type is null
      and image_file_size is null
      and image_width is null
      and image_height is null
    )
  );

create table if not exists public.changes (
  id bigint generated always as identity primary key,
  contact_id text not null references public.contacts(id) on delete cascade,
  action text not null check (action in ('create', 'update', 'archive', 'import')),
  field_name text,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.profiles(id),
  activity_event_id bigint,
  canonicalized_at timestamptz
);

create or replace function public.activity_contact_references_match(
  p_references jsonb,
  p_contact_id text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select not exists (
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(p_references, '[]'::jsonb)) as item
    where item ->> 'type' = 'contact'
      and (
        p_contact_id is null
        or item ->> 'id' is distinct from p_contact_id
      )
  );
$function$;

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  event_key text not null,
  category text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  contact_id text references public.contacts(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  origin_type text not null default 'manual',
  origin_ref text,
  correlation_id text,
  "references" jsonb not null default '[]'::jsonb,
  changes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_source text,
  legacy_id text,
  created_at timestamptz not null default now(),
  constraint activity_events_event_key_check
    check (event_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint activity_events_category_check
    check (category in ('master_data', 'ownership', 'consent', 'hospitation', 'format', 'note_document', 'unknown')),
  constraint activity_events_action_check
    check (action ~ '^[a-z][a-z0-9_]*$'),
  constraint activity_events_entity_type_check
    check (nullif(btrim(entity_type), '') is not null),
  constraint activity_events_entity_id_check
    check (nullif(btrim(entity_id), '') is not null),
  constraint activity_events_contact_entity_check
    check (entity_type <> 'contact' or (contact_id is not null and contact_id = entity_id)),
  constraint activity_events_contact_reference_check
    check (public.activity_contact_references_match("references", contact_id)),
  constraint activity_events_origin_type_check
    check (origin_type in ('manual', 'data_import', 'public_registration', 'system', 'legacy')),
  constraint activity_events_origin_ref_check
    check (origin_ref is null or nullif(btrim(origin_ref), '') is not null),
  constraint activity_events_correlation_id_check
    check (correlation_id is null or nullif(btrim(correlation_id), '') is not null),
  constraint activity_events_references_type_check
    check (jsonb_typeof("references") = 'array'),
  constraint activity_events_changes_type_check
    check (jsonb_typeof(changes) = 'object'),
  constraint activity_events_metadata_type_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint activity_events_legacy_reference_pair_check
    check (
      (legacy_source is null and legacy_id is null)
      or (
        nullif(btrim(legacy_source), '') is not null
        and nullif(btrim(legacy_id), '') is not null
      )
    ),
  constraint activity_events_contact_id_id_key unique (contact_id, id)
);

alter table public.changes
  add column if not exists activity_event_id bigint;

alter table public.changes
  add column if not exists canonicalized_at timestamptz;

alter table public.activity_events
  drop constraint if exists activity_events_contact_id_fkey;

alter table public.activity_events
  add constraint activity_events_contact_id_fkey
  foreign key (contact_id)
  references public.contacts(id)
  on delete restrict;

alter table public.changes
  drop constraint if exists changes_activity_event_id_fkey;

alter table public.changes
  drop constraint if exists changes_activity_event_contact_fkey;

alter table public.activity_events
  drop constraint if exists activity_events_contact_id_id_key;

alter table public.activity_events
  add constraint activity_events_contact_id_id_key
  unique (contact_id, id);

alter table public.changes
  add constraint changes_activity_event_contact_fkey
  foreign key (contact_id, activity_event_id)
  references public.activity_events(contact_id, id)
  on delete restrict;

alter table public.changes
  drop constraint if exists changes_canonical_reference_pair_check;

alter table public.changes
  add constraint changes_canonical_reference_pair_check
  check (
    (activity_event_id is null and canonicalized_at is null)
    or (activity_event_id is not null and canonicalized_at is not null)
  );

alter table public.activity_events
  drop constraint if exists activity_events_contact_entity_check;

alter table public.activity_events
  add constraint activity_events_contact_entity_check
  check (entity_type <> 'contact' or (contact_id is not null and contact_id = entity_id));

alter table public.activity_events
  drop constraint if exists activity_events_contact_reference_check;

alter table public.activity_events
  add constraint activity_events_contact_reference_check
  check (public.activity_contact_references_match("references", contact_id));

create or replace function public.prepare_format_participation_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  status_changed boolean;
  changed_at timestamptz := statement_timestamp();
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  elsif new.updated_by is null then
    new.updated_by := case when tg_op = 'UPDATE' then coalesce(old.updated_by, old.created_by) else new.created_by end;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.updated_by);
    status_changed := true;
  else
    status_changed := old.invitation_status is distinct from new.invitation_status;
  end if;

  if not status_changed then
    return new;
  end if;

  new.status_changed_at := changed_at;

  if new.invitation_status in ('Eingeladen', 'Keine Rückmeldung', 'Zugesagt', 'Teilgenommen', 'Abgesagt') then
    new.invited_at := coalesce(new.invited_at, new.created_at, changed_at);
  end if;

  if new.invitation_status in ('Zugesagt', 'Teilgenommen', 'Abgesagt') then
    new.responded_at := coalesce(new.responded_at, changed_at);
  end if;

  if new.invitation_status = 'Teilgenommen' then
    new.participated_at := coalesce(new.participated_at, changed_at);
  elsif new.invitation_status = 'Abgesagt' then
    new.cancelled_at := coalesce(new.cancelled_at, changed_at);
  end if;

  return new;
end;
$function$;

revoke all on function public.prepare_format_participation_write()
  from public, anon, authenticated;

drop trigger if exists format_participants_prepare_workflow on public.format_participants;
create trigger format_participants_prepare_workflow
before insert or update on public.format_participants
for each row
execute function public.prepare_format_participation_write();

create or replace function public.log_format_participation_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  format_title text;
  contact_name text;
  event_key text;
  event_action text;
begin
  if tg_op = 'UPDATE' and old.invitation_status is not distinct from new.invitation_status then
    return new;
  end if;

  event_key := case new.invitation_status
    when 'Eingeladen' then 'format.invitation.created'
    when 'Zugesagt' then 'format.invitation.accepted'
    when 'Teilgenommen' then 'format.participation.recorded'
    when 'Abgesagt' then 'format.invitation.declined'
    else null
  end;
  event_action := case new.invitation_status
    when 'Eingeladen' then 'invited'
    when 'Zugesagt' then 'accepted'
    when 'Teilgenommen' then 'participated'
    when 'Abgesagt' then 'declined'
    else null
  end;

  if event_key is null then
    return new;
  end if;

  select f.title, c.name
  into format_title, contact_name
  from public.formats f
  join public.contacts c on c.id = new.contact_id
  where f.id = new.format_id;

  insert into public.activity_events (
    event_key,
    category,
    action,
    entity_type,
    entity_id,
    contact_id,
    actor_id,
    occurred_at,
    origin_type,
    correlation_id,
    "references",
    changes,
    metadata
  ) values (
    event_key,
    'format',
    event_action,
    'format_participant',
    new.id::text,
    new.contact_id,
    coalesce(new.updated_by, new.created_by),
    coalesce(new.status_changed_at, statement_timestamp()),
    'manual',
    'format:' || new.format_id::text || ':contact:' || new.contact_id,
    jsonb_build_array(
      jsonb_build_object('type', 'contact', 'id', new.contact_id, 'label', coalesce(contact_name, 'Kontakt')),
      jsonb_build_object('type', 'format', 'id', new.format_id::text, 'label', coalesce(format_title, 'Format'))
    ),
    jsonb_build_object(
      'invitation_status', jsonb_build_object(
        'before', case when tg_op = 'UPDATE' then old.invitation_status else null end,
        'after', new.invitation_status
      )
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'format_title', format_title,
      'contact_name', contact_name,
      'participation_status', new.invitation_status,
      'participant_role', new.participant_role,
      'invited_at', new.invited_at,
      'responded_at', new.responded_at,
      'participated_at', new.participated_at,
      'cancelled_at', new.cancelled_at
    ))
  );

  return new;
end;
$function$;

revoke all on function public.log_format_participation_status_change()
  from public, anon, authenticated;

drop trigger if exists format_participants_log_status_change on public.format_participants;
create trigger format_participants_log_status_change
after insert or update of invitation_status on public.format_participants
for each row
execute function public.log_format_participation_status_change();

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id text,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text,
  occurred_at timestamptz not null default now(),
  route text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_recipients (
  event_id uuid not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  scope text not null default 'private' check (scope in ('private', 'team')),
  view_type text not null default 'contacts' check (view_type in ('contacts', 'organizations', 'experts', 'formats', 'map', 'analytics')),
  filters jsonb not null default '{}'::jsonb,
  search_query text not null default '',
  sort_key text not null default 'updated_at',
  sort_direction text not null default 'desc' check (sort_direction in ('asc', 'desc')),
  page_size integer not null default 20 check (page_size in (10, 20, 50, 100)),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_view_id uuid references public.saved_views(id) on delete set null,
  default_view_type text not null default 'contacts' check (default_view_type in ('contacts', 'organizations', 'experts', 'formats', 'map', 'analytics')),
  table_density text not null default 'comfortable' check (table_density in ('compact', 'comfortable', 'spacious')),
  theme text not null default 'system' check (theme in ('system', 'light', 'contrast')),
  font_scale numeric not null default 1 check (font_scale between 0.9 and 1.2),
  page_size integer not null default 20 check (page_size in (10, 20, 50, 100)),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.login_aliases (
  alias text primary key,
  email text not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (alias = lower(trim(alias))),
  check (alias ~ '^[a-z0-9._-]{2,32}$')
);

alter table public.saved_views drop constraint if exists saved_views_view_type_check;
alter table public.saved_views
  add constraint saved_views_view_type_check
  check (view_type in ('contacts', 'organizations', 'experts', 'stakeholders', 'formats', 'map', 'analytics'));

alter table public.user_settings drop constraint if exists user_settings_default_view_type_check;
alter table public.user_settings
  add constraint user_settings_default_view_type_check
  check (default_view_type in ('contacts', 'organizations', 'experts', 'stakeholders', 'formats', 'map', 'analytics'));

create index if not exists contacts_status_idx on public.contacts(status);
create index if not exists contacts_owner_idx on public.contacts(owner_id);
create index if not exists contact_owners_profile_idx on public.contact_owners(profile_id);
create index if not exists contact_owners_contact_idx on public.contact_owners(contact_id);
create index if not exists contacts_organization_id_idx on public.contacts(organization_id);
create index if not exists contacts_state_idx on public.contacts(federal_state);
create index if not exists organizations_normalized_name_idx on public.organizations(normalized_name);
create index if not exists organizations_sector_idx on public.organizations(sector);
create index if not exists organizations_state_idx on public.organizations(federal_state);
create index if not exists organizations_status_idx on public.organizations(status);
create index if not exists organization_primary_systems_organization_id_idx on public.organization_primary_systems(organization_id);
create unique index if not exists organization_primary_systems_unique_entry_idx
  on public.organization_primary_systems (
    organization_id,
    system_type,
    lower(coalesce(vendor_name, '')),
    lower(coalesce(product_name, ''))
  );
create index if not exists network_registrations_status_submitted_idx on public.network_registrations(status, submitted_at desc);
create index if not exists network_registrations_email_normalized_idx on public.network_registrations(lower(btrim(email)));
create index if not exists network_registrations_organization_lookup_idx on public.network_registrations(lower(btrim(coalesce(organization, ''))), postal_code);
create index if not exists network_registrations_contact_id_idx on public.network_registrations(contact_id) where contact_id is not null;
create index if not exists network_registration_rate_limits_last_seen_idx on public.network_registration_rate_limits(last_seen_at);
create index if not exists formats_owner_idx on public.formats(owner_id);
create index if not exists formats_status_idx on public.formats(status);
create index if not exists formats_starts_at_idx on public.formats(starts_at);
create index if not exists format_participants_format_idx on public.format_participants(format_id);
create index if not exists format_participants_contact_idx on public.format_participants(contact_id);
create index if not exists format_participants_status_idx on public.format_participants(invitation_status);
create index if not exists hospitation_slots_contact_idx on public.hospitation_slots(contact_id);
create index if not exists hospitation_slots_organization_idx on public.hospitation_slots(organization_id);
create index if not exists hospitation_slots_owner_idx on public.hospitation_slots(owner_id);
create index if not exists hospitation_slots_status_idx on public.hospitation_slots(status);
create index if not exists hospitation_slots_starts_at_idx on public.hospitation_slots(starts_at);
create index if not exists hospitations_slot_idx on public.hospitations(slot_id);
create index if not exists hospitations_contact_idx on public.hospitations(contact_id);
create index if not exists hospitations_organization_idx on public.hospitations(organization_id);
create index if not exists hospitations_owner_idx on public.hospitations(owner_id);
create index if not exists hospitations_status_idx on public.hospitations(status);
create index if not exists hospitations_starts_at_idx on public.hospitations(starts_at);
create index if not exists hospitations_follow_up_due_idx on public.hospitations(follow_up_due_at);
create index if not exists roadmap_items_active_idx on public.roadmap_items(active);
create index if not exists roadmap_items_product_area_idx on public.roadmap_items(product_area);
create index if not exists roadmap_items_status_idx on public.roadmap_items(roadmap_status);
create index if not exists roadmap_items_deadline_type_idx on public.roadmap_items(deadline_type);
create index if not exists roadmap_items_created_by_idx on public.roadmap_items(created_by);
create index if not exists roadmap_items_updated_by_idx on public.roadmap_items(updated_by);
create index if not exists hospitation_roadmap_assessments_hospitation_idx on public.hospitation_roadmap_assessments(hospitation_id);
create index if not exists hospitation_roadmap_assessments_item_idx on public.hospitation_roadmap_assessments(roadmap_item_id);
create index if not exists hospitation_roadmap_assessments_role_idx on public.hospitation_roadmap_assessments(respondent_role);
create index if not exists hospitation_roadmap_assessments_created_by_idx on public.hospitation_roadmap_assessments(created_by);
create index if not exists hospitation_roadmap_assessments_updated_by_idx on public.hospitation_roadmap_assessments(updated_by);
create index if not exists hospitation_unmet_needs_hospitation_idx on public.hospitation_unmet_needs(hospitation_id);
create index if not exists hospitation_unmet_needs_item_idx on public.hospitation_unmet_needs(related_roadmap_item_id);
create index if not exists hospitation_unmet_needs_status_idx on public.hospitation_unmet_needs(status);
create index if not exists hospitation_unmet_needs_classification_idx on public.hospitation_unmet_needs(classification);
create index if not exists hospitation_unmet_needs_created_by_idx on public.hospitation_unmet_needs(created_by);
create index if not exists hospitation_unmet_needs_updated_by_idx on public.hospitation_unmet_needs(updated_by);
create index if not exists expert_groups_status_idx on public.expert_groups(status);
create index if not exists expert_organizations_normalized_name_idx on public.expert_organizations(normalized_name);
create index if not exists expert_organizations_group_idx on public.expert_organizations(group_id);
create index if not exists expert_organizations_status_idx on public.expert_organizations(status);
create index if not exists expert_contacts_group_idx on public.expert_contacts(group_id);
create index if not exists expert_contacts_organization_idx on public.expert_contacts(organization_id);
create index if not exists expert_contacts_owner_idx on public.expert_contacts(owner_id);
create index if not exists expert_contacts_owner_ids_idx on public.expert_contacts using gin(owner_ids);
create index if not exists expert_contacts_status_idx on public.expert_contacts(status);
create unique index if not exists expert_entity_links_contact_unique
on public.expert_entity_links(contact_id, expert_contact_id)
where link_type = 'contact';
create unique index if not exists expert_entity_links_organization_unique
on public.expert_entity_links(organization_id, expert_organization_id)
where link_type = 'organization';
create index if not exists expert_entity_links_contact_idx on public.expert_entity_links(contact_id);
create index if not exists expert_entity_links_expert_contact_idx on public.expert_entity_links(expert_contact_id);
create index if not exists expert_entity_links_organization_idx on public.expert_entity_links(organization_id);
create index if not exists expert_entity_links_expert_organization_idx on public.expert_entity_links(expert_organization_id);
create index if not exists stakeholder_types_status_idx on public.stakeholder_types(status);
create index if not exists stakeholder_organizations_type_idx on public.stakeholder_organizations(stakeholder_type_id);
create index if not exists stakeholder_organizations_normalized_name_idx on public.stakeholder_organizations(normalized_name);
create index if not exists stakeholder_organizations_sector_idx on public.stakeholder_organizations(sector);
create index if not exists stakeholder_organizations_state_idx on public.stakeholder_organizations(federal_state);
create index if not exists stakeholder_organizations_status_idx on public.stakeholder_organizations(status);
create index if not exists stakeholder_people_type_idx on public.stakeholder_people(stakeholder_type_id);
create index if not exists stakeholder_people_organization_idx on public.stakeholder_people(organization_id);
create index if not exists stakeholder_people_representative_idx on public.stakeholder_people(is_representative_assembly_member);
create index if not exists stakeholder_people_status_idx on public.stakeholder_people(status);
create index if not exists changes_contact_idx on public.changes(contact_id);
create index if not exists changes_activity_event_idx
  on public.changes (activity_event_id)
  where activity_event_id is not null;
create index if not exists activity_events_occurred_at_idx
  on public.activity_events (occurred_at desc);
create index if not exists activity_events_category_occurred_at_idx
  on public.activity_events (category, occurred_at desc);
create index if not exists activity_events_contact_occurred_at_idx
  on public.activity_events (contact_id, occurred_at desc)
  where contact_id is not null;
create index if not exists activity_events_actor_occurred_at_idx
  on public.activity_events (actor_id, occurred_at desc)
  where actor_id is not null;
create index if not exists activity_events_entity_occurred_at_idx
  on public.activity_events (entity_type, entity_id, occurred_at desc);
create unique index if not exists activity_events_legacy_reference_unique_idx
  on public.activity_events (legacy_source, legacy_id)
  where legacy_source is not null and legacy_id is not null;
create index if not exists notification_events_occurred_idx on public.notification_events(occurred_at desc);
create index if not exists notification_events_entity_idx on public.notification_events(entity_type, entity_id);
create index if not exists notification_recipients_user_unread_idx on public.notification_recipients(user_id, read_at, dismissed_at, created_at desc);
create index if not exists saved_views_owner_idx on public.saved_views(owner_id);
create index if not exists saved_views_scope_idx on public.saved_views(scope);

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
before update on public.contacts
for each row execute function public.touch_updated_at();

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

drop trigger if exists organization_primary_systems_touch_updated_at on public.organization_primary_systems;
create trigger organization_primary_systems_touch_updated_at
before update on public.organization_primary_systems
for each row execute function public.touch_updated_at();

drop trigger if exists network_registrations_touch_updated_at on public.network_registrations;
create trigger network_registrations_touch_updated_at
before update on public.network_registrations
for each row execute function public.touch_updated_at();

drop trigger if exists formats_touch_updated_at on public.formats;
create trigger formats_touch_updated_at
before update on public.formats
for each row execute function public.touch_updated_at();

drop trigger if exists format_participants_touch_updated_at on public.format_participants;
create trigger format_participants_touch_updated_at
before update on public.format_participants
for each row execute function public.touch_updated_at();

drop trigger if exists hospitation_slots_touch_updated_at on public.hospitation_slots;
create trigger hospitation_slots_touch_updated_at
before update on public.hospitation_slots
for each row execute function public.touch_updated_at();

drop trigger if exists hospitations_touch_updated_at on public.hospitations;
create trigger hospitations_touch_updated_at
before update on public.hospitations
for each row execute function public.touch_updated_at();

drop trigger if exists roadmap_items_touch_updated_at on public.roadmap_items;
create trigger roadmap_items_touch_updated_at
before update on public.roadmap_items
for each row execute function public.touch_updated_at();

drop trigger if exists hospitation_roadmap_assessments_touch_updated_at on public.hospitation_roadmap_assessments;
create trigger hospitation_roadmap_assessments_touch_updated_at
before update on public.hospitation_roadmap_assessments
for each row execute function public.touch_updated_at();

drop trigger if exists hospitation_unmet_needs_touch_updated_at on public.hospitation_unmet_needs;
create trigger hospitation_unmet_needs_touch_updated_at
before update on public.hospitation_unmet_needs
for each row execute function public.touch_updated_at();

drop trigger if exists expert_groups_touch_updated_at on public.expert_groups;
create trigger expert_groups_touch_updated_at
before update on public.expert_groups
for each row execute function public.touch_updated_at();

drop trigger if exists expert_organizations_touch_updated_at on public.expert_organizations;
create trigger expert_organizations_touch_updated_at
before update on public.expert_organizations
for each row execute function public.touch_updated_at();

drop trigger if exists expert_contacts_touch_updated_at on public.expert_contacts;
create trigger expert_contacts_touch_updated_at
before update on public.expert_contacts
for each row execute function public.touch_updated_at();

drop trigger if exists expert_entity_links_touch_updated_at on public.expert_entity_links;
create trigger expert_entity_links_touch_updated_at
before update on public.expert_entity_links
for each row execute function public.touch_updated_at();

drop trigger if exists stakeholder_types_touch_updated_at on public.stakeholder_types;
create trigger stakeholder_types_touch_updated_at
before update on public.stakeholder_types
for each row execute function public.touch_updated_at();

drop trigger if exists stakeholder_organizations_touch_updated_at on public.stakeholder_organizations;
create trigger stakeholder_organizations_touch_updated_at
before update on public.stakeholder_organizations
for each row execute function public.touch_updated_at();

drop trigger if exists stakeholder_people_touch_updated_at on public.stakeholder_people;
create trigger stakeholder_people_touch_updated_at
before update on public.stakeholder_people
for each row execute function public.touch_updated_at();

drop trigger if exists saved_views_touch_updated_at on public.saved_views;
create trigger saved_views_touch_updated_at
before update on public.saved_views
for each row execute function public.touch_updated_at();

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
before update on public.user_settings
for each row execute function public.touch_updated_at();

drop trigger if exists login_aliases_touch_updated_at on public.login_aliases;
create trigger login_aliases_touch_updated_at
before update on public.login_aliases
for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_owners enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_primary_systems enable row level security;
alter table public.network_registrations enable row level security;
alter table public.network_registration_rate_limits enable row level security;
alter table public.formats enable row level security;
alter table public.format_participants enable row level security;
alter table public.hospitation_slots enable row level security;
alter table public.hospitations enable row level security;
alter table public.roadmap_items enable row level security;
alter table public.hospitation_roadmap_assessments enable row level security;
alter table public.hospitation_unmet_needs enable row level security;
alter table public.expert_groups enable row level security;
alter table public.expert_organizations enable row level security;
alter table public.expert_contacts enable row level security;
alter table public.expert_entity_links enable row level security;
alter table public.stakeholder_types enable row level security;
alter table public.stakeholder_organizations enable row level security;
alter table public.stakeholder_people enable row level security;
alter table public.changes enable row level security;
alter table public.activity_events enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.saved_views enable row level security;
alter table public.user_settings enable row level security;
alter table public.login_aliases enable row level security;

grant usage on schema public to authenticated;
revoke all on public.contacts, public.organizations from anon;
revoke truncate, references, trigger, maintain on public.contacts, public.organizations from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, initials, avatar_url, team, bio, updated_at) on public.profiles to authenticated;
grant select, insert, update on public.contacts to authenticated;
grant select, insert, update, delete on public.contact_owners to authenticated;
grant select, insert, update on public.organizations to authenticated;
revoke all on public.organization_primary_systems from anon, authenticated, service_role;
grant select, insert, update, delete on public.organization_primary_systems to authenticated;
revoke all on public.network_registrations from anon, authenticated, service_role;
grant select, delete on public.network_registrations to authenticated;
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
revoke all on public.network_registration_rate_limits from anon, authenticated, service_role;
grant select, insert, update, delete on public.formats to authenticated;
grant select, insert, update, delete on public.format_participants to authenticated;
grant select, insert, update on public.hospitation_slots to authenticated;
grant select, insert, update on public.hospitations to authenticated;
grant select on public.roadmap_items to authenticated;
grant select, insert, update, delete on public.hospitation_roadmap_assessments to authenticated;
grant select, insert, update, delete on public.hospitation_unmet_needs to authenticated;
revoke all on public.expert_groups from anon, authenticated, service_role;
revoke all on public.expert_organizations from anon, authenticated, service_role;
revoke all on public.expert_contacts from anon, authenticated, service_role;
revoke all on public.expert_entity_links from anon, authenticated, service_role;
revoke all on public.stakeholder_types from anon, authenticated, service_role;
revoke all on public.stakeholder_organizations from anon, authenticated, service_role;
revoke all on public.stakeholder_people from anon, authenticated, service_role;
grant select on public.expert_groups to authenticated;
grant select on public.expert_organizations to authenticated;
grant select, insert, update on public.expert_contacts to authenticated;
grant select, insert, update, delete on public.expert_entity_links to authenticated;
grant select, insert, update on public.stakeholder_types to authenticated;
grant select, insert, update on public.stakeholder_organizations to authenticated;
grant select, insert, update on public.stakeholder_people to authenticated;
grant select, insert on public.changes to authenticated;
revoke all on table public.activity_events from public, anon, authenticated, service_role;
grant select on table public.activity_events to authenticated;
revoke all on sequence public.activity_events_id_seq from public, anon, authenticated, service_role;
revoke all on public.notification_events from anon, authenticated;
revoke all on public.notification_recipients from anon, authenticated;
grant select on public.notification_events to authenticated;
grant select on public.notification_recipients to authenticated;
revoke update on public.notification_recipients from authenticated;
grant update (read_at, dismissed_at) on public.notification_recipients to authenticated;
grant select, insert, update, delete on public.saved_views to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant usage, select on sequence public.changes_id_seq to authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.contacts to service_role;
grant select, insert, update, delete on public.contact_owners to service_role;
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.organization_primary_systems to service_role;
grant select, insert, update, delete on public.network_registrations to service_role;
grant select, insert, update, delete on public.network_registration_rate_limits to service_role;
grant select, insert, update, delete on public.formats to service_role;
grant select, insert, update, delete on public.format_participants to service_role;
grant select, insert, update, delete on public.hospitation_slots to service_role;
grant select, insert, update, delete on public.hospitations to service_role;
grant select, insert, update, delete on public.roadmap_items to service_role;
grant select, insert, update, delete on public.hospitation_roadmap_assessments to service_role;
grant select, insert, update, delete on public.hospitation_unmet_needs to service_role;
grant select, insert, update, delete on public.expert_groups to service_role;
grant select, insert, update, delete on public.expert_organizations to service_role;
grant select, insert, update, delete on public.expert_contacts to service_role;
grant select, insert, update, delete on public.expert_entity_links to service_role;
grant select, insert, update, delete on public.stakeholder_types to service_role;
grant select, insert, update, delete on public.stakeholder_organizations to service_role;
grant select, insert, update, delete on public.stakeholder_people to service_role;
grant select, insert, update, delete on public.changes to service_role;
grant select, insert on table public.activity_events to service_role;
grant select, insert, update, delete on public.notification_events to service_role;
grant select, insert, update, delete on public.notification_recipients to service_role;
grant select, insert, update, delete on public.saved_views to service_role;
grant select, insert, update, delete on public.user_settings to service_role;
grant select, insert, update, delete on public.login_aliases to service_role;
grant usage, select on sequence public.changes_id_seq to service_role;
grant usage, select on sequence public.activity_events_id_seq to service_role;

drop policy if exists "profiles authenticated read" on public.profiles;
create policy "profiles authenticated read"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update"
on public.profiles for update
to authenticated
using (id = auth.uid() and active = true)
with check (id = auth.uid() and active = true);

drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write"
on public.profiles for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "contacts authenticated read active" on public.contacts;
create policy "contacts authenticated read active"
on public.contacts for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "contacts editor admin insert" on public.contacts;
create policy "contacts editor admin insert"
on public.contacts for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and status = 'active'
);

drop policy if exists "contacts editor admin update active" on public.contacts;
create policy "contacts editor admin update active"
on public.contacts for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and updated_by = auth.uid()
  and status <> 'archived'
);

drop policy if exists "contacts admin archive" on public.contacts;
create policy "contacts admin archive"
on public.contacts for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (
  public.current_profile_role() = 'admin'
  and updated_by = auth.uid()
);

drop policy if exists "contact owners authenticated read active contacts" on public.contact_owners;
create policy "contact owners authenticated read active contacts"
on public.contact_owners for select
to authenticated
using (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_id
      and (c.status <> 'archived' or public.current_profile_role() = 'admin')
  )
);

drop policy if exists "contact owners editor admin insert" on public.contact_owners;
create policy "contact owners editor admin insert"
on public.contact_owners for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and assigned_by = auth.uid()
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_id
      and c.status <> 'archived'
  )
  and exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.active = true
  )
);

drop policy if exists "contact owners editor admin update" on public.contact_owners;
create policy "contact owners editor admin update"
on public.contact_owners for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_id
      and c.status <> 'archived'
  )
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and assigned_by = auth.uid()
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_id
      and c.status <> 'archived'
  )
);

drop policy if exists "contact owners editor admin delete" on public.contact_owners;
create policy "contact owners editor admin delete"
on public.contact_owners for delete
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_id
      and c.status <> 'archived'
  )
);

drop policy if exists "organizations authenticated read active" on public.organizations;
create policy "organizations authenticated read active"
on public.organizations for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "organizations editor admin insert" on public.organizations;
create policy "organizations editor admin insert"
on public.organizations for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and status = 'active'
);

drop policy if exists "organizations editor admin update active" on public.organizations;
create policy "organizations editor admin update active"
on public.organizations for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and updated_by = auth.uid()
  and status <> 'archived'
);

drop policy if exists "organizations admin archive" on public.organizations;
create policy "organizations admin archive"
on public.organizations for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (
  public.current_profile_role() = 'admin'
  and updated_by = auth.uid()
);

drop policy if exists "organization primary systems authenticated read" on public.organization_primary_systems;
create policy "organization primary systems authenticated read"
on public.organization_primary_systems for select
to authenticated
using (
  exists (
    select 1
    from public.organizations organization
    where organization.id = organization_id
      and (organization.status <> 'archived' or public.current_profile_role() = 'admin')
  )
);

drop policy if exists "organization primary systems editor admin insert" on public.organization_primary_systems;
create policy "organization primary systems editor admin insert"
on public.organization_primary_systems for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and exists (
    select 1
    from public.organizations organization
    where organization.id = organization_id
      and organization.status <> 'archived'
  )
);

drop policy if exists "organization primary systems editor admin update" on public.organization_primary_systems;
create policy "organization primary systems editor admin update"
on public.organization_primary_systems for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and exists (
    select 1
    from public.organizations organization
    where organization.id = organization_id
      and organization.status <> 'archived'
  )
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and updated_by = auth.uid()
  and exists (
    select 1
    from public.organizations organization
    where organization.id = organization_id
      and organization.status <> 'archived'
  )
);

drop policy if exists "organization primary systems editor admin delete" on public.organization_primary_systems;
create policy "organization primary systems editor admin delete"
on public.organization_primary_systems for delete
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and exists (
    select 1
    from public.organizations organization
    where organization.id = organization_id
      and organization.status <> 'archived'
  )
);

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

drop policy if exists "expert groups authenticated read active" on public.expert_groups;
create policy "expert groups authenticated read active"
on public.expert_groups for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "expert organizations authenticated read active" on public.expert_organizations;
create policy "expert organizations authenticated read active"
on public.expert_organizations for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "expert contacts authenticated read active" on public.expert_contacts;
create policy "expert contacts authenticated read active"
on public.expert_contacts for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "expert contacts editor update active" on public.expert_contacts;
create policy "expert contacts editor update active"
on public.expert_contacts for update
to authenticated
using (
  public.current_profile_role() in ('admin', 'editor')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('admin', 'editor')
  and status <> 'archived'
);

drop policy if exists "expert entity links authenticated read" on public.expert_entity_links;
create policy "expert entity links authenticated read"
on public.expert_entity_links for select
to authenticated
using (true);

drop policy if exists "expert entity links admin insert" on public.expert_entity_links;
create policy "expert entity links admin insert"
on public.expert_entity_links for insert
to authenticated
with check (
  public.current_profile_role() = 'admin'
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "expert entity links admin update" on public.expert_entity_links;
create policy "expert entity links admin update"
on public.expert_entity_links for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (
  public.current_profile_role() = 'admin'
  and updated_by = auth.uid()
);

drop policy if exists "expert entity links admin delete" on public.expert_entity_links;
create policy "expert entity links admin delete"
on public.expert_entity_links for delete
to authenticated
using (public.current_profile_role() = 'admin');

drop policy if exists "stakeholder types authenticated read active" on public.stakeholder_types;
create policy "stakeholder types authenticated read active"
on public.stakeholder_types for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "stakeholder types editor admin insert" on public.stakeholder_types;
create policy "stakeholder types editor admin insert"
on public.stakeholder_types for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status = 'active'
);

drop policy if exists "stakeholder types editor admin update active" on public.stakeholder_types;
create policy "stakeholder types editor admin update active"
on public.stakeholder_types for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
);

drop policy if exists "stakeholder types admin archive" on public.stakeholder_types;
create policy "stakeholder types admin archive"
on public.stakeholder_types for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "stakeholder organizations authenticated read active" on public.stakeholder_organizations;
create policy "stakeholder organizations authenticated read active"
on public.stakeholder_organizations for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "stakeholder organizations editor admin insert" on public.stakeholder_organizations;
create policy "stakeholder organizations editor admin insert"
on public.stakeholder_organizations for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status = 'active'
);

drop policy if exists "stakeholder organizations editor admin update active" on public.stakeholder_organizations;
create policy "stakeholder organizations editor admin update active"
on public.stakeholder_organizations for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
);

drop policy if exists "stakeholder organizations admin archive" on public.stakeholder_organizations;
create policy "stakeholder organizations admin archive"
on public.stakeholder_organizations for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "stakeholder people authenticated read active" on public.stakeholder_people;
create policy "stakeholder people authenticated read active"
on public.stakeholder_people for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "stakeholder people editor admin insert" on public.stakeholder_people;
create policy "stakeholder people editor admin insert"
on public.stakeholder_people for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status = 'active'
);

drop policy if exists "stakeholder people editor admin update active" on public.stakeholder_people;
create policy "stakeholder people editor admin update active"
on public.stakeholder_people for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
);

drop policy if exists "stakeholder people admin archive" on public.stakeholder_people;
create policy "stakeholder people admin archive"
on public.stakeholder_people for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "formats authenticated read active" on public.formats;
create policy "formats authenticated read active"
on public.formats for select
to authenticated
using (status <> 'Archiviert' or public.current_profile_role() = 'admin');

drop policy if exists "formats editor admin insert" on public.formats;
create policy "formats editor admin insert"
on public.formats for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "formats editor admin update" on public.formats;
create policy "formats editor admin update"
on public.formats for update
to authenticated
using (public.current_profile_role() in ('editor', 'admin'))
with check (public.current_profile_role() in ('editor', 'admin'));

drop policy if exists "formats admin delete" on public.formats;
create policy "formats admin delete"
on public.formats for delete
to authenticated
using (public.current_profile_role() = 'admin');

drop policy if exists "format participants authenticated read" on public.format_participants;
create policy "format participants authenticated read"
on public.format_participants for select
to authenticated
using (
  exists (
    select 1 from public.formats
    where formats.id = format_participants.format_id
      and (formats.status <> 'Archiviert' or public.current_profile_role() = 'admin')
  )
);

drop policy if exists "format participants editor admin insert" on public.format_participants;
create policy "format participants editor admin insert"
on public.format_participants for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

drop policy if exists "format participants editor admin update" on public.format_participants;
create policy "format participants editor admin update"
on public.format_participants for update
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'))
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and updated_by = (select auth.uid())
);

drop policy if exists "format participants editor admin delete" on public.format_participants;
create policy "format participants editor admin delete"
on public.format_participants for delete
to authenticated
using (public.current_profile_role() in ('editor', 'admin'));

drop policy if exists "hospitation slots authenticated read active" on public.hospitation_slots;
create policy "hospitation slots authenticated read active"
on public.hospitation_slots for select
to authenticated
using (status <> 'Archiviert' or public.current_profile_role() = 'admin');

drop policy if exists "hospitation slots editor admin insert" on public.hospitation_slots;
create policy "hospitation slots editor admin insert"
on public.hospitation_slots for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'Archiviert'
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "hospitation slots editor admin update" on public.hospitation_slots;
create policy "hospitation slots editor admin update"
on public.hospitation_slots for update
to authenticated
using (public.current_profile_role() in ('editor', 'admin'))
with check (public.current_profile_role() in ('editor', 'admin'));

drop policy if exists "hospitations authenticated read active" on public.hospitations;
create policy "hospitations authenticated read active"
on public.hospitations for select
to authenticated
using (status <> 'Archiviert' or public.current_profile_role() = 'admin');

drop policy if exists "hospitations editor admin insert" on public.hospitations;
create policy "hospitations editor admin insert"
on public.hospitations for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'Archiviert'
  and (requester_profile_id is null or requester_profile_id = auth.uid())
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "hospitations editor admin update" on public.hospitations;
create policy "hospitations editor admin update"
on public.hospitations for update
to authenticated
using (public.current_profile_role() in ('editor', 'admin'))
with check (public.current_profile_role() in ('editor', 'admin'));

drop policy if exists "roadmap items authenticated read active" on public.roadmap_items;
create policy "roadmap items authenticated read active"
on public.roadmap_items for select
to authenticated
using (active or (select public.current_profile_role()) = 'admin');

drop policy if exists "roadmap assessments authenticated read" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments authenticated read"
on public.hospitation_roadmap_assessments for select
to authenticated
using (true);

drop policy if exists "roadmap assessments editor admin insert" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin insert"
on public.hospitation_roadmap_assessments for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by is null or created_by = (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "roadmap assessments editor admin update" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin update"
on public.hospitation_roadmap_assessments for update
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'))
with check ((select public.current_profile_role()) in ('editor', 'admin'));

drop policy if exists "roadmap assessments editor admin delete" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin delete"
on public.hospitation_roadmap_assessments for delete
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'));

drop policy if exists "unmet needs authenticated read" on public.hospitation_unmet_needs;
create policy "unmet needs authenticated read"
on public.hospitation_unmet_needs for select
to authenticated
using (status <> 'Archiviert' or (select public.current_profile_role()) = 'admin');

drop policy if exists "unmet needs editor admin insert" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin insert"
on public.hospitation_unmet_needs for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and status <> 'Archiviert'
  and (created_by is null or created_by = (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "unmet needs editor admin update" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin update"
on public.hospitation_unmet_needs for update
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'))
with check ((select public.current_profile_role()) in ('editor', 'admin'));

drop policy if exists "unmet needs editor admin delete" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin delete"
on public.hospitation_unmet_needs for delete
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'));

drop policy if exists "changes authenticated read" on public.changes;
create policy "changes authenticated read"
on public.changes for select
to authenticated
using (
  (select public.current_profile_role()) = 'admin'
  or (
    (select public.current_profile_role()) in ('viewer', 'editor')
    and exists (
      select 1
      from public.contacts c
      where c.id = contact_id
        and c.status <> 'archived'
    )
  )
);

drop policy if exists "changes editor admin insert" on public.changes;
create policy "changes editor admin insert"
on public.changes for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and changed_by = auth.uid()
  and activity_event_id is null
  and canonicalized_at is null
);

drop policy if exists "activity events active profiles read" on public.activity_events;
create policy "activity events active profiles read"
on public.activity_events for select
to authenticated
using (
  (select public.current_profile_role()) = 'admin'
  or (
    (select public.current_profile_role()) in ('viewer', 'editor')
    and (
      contact_id is null
      or exists (
        select 1
        from public.contacts c
        where c.id = contact_id
          and c.status <> 'archived'
      )
    )
  )
);

drop policy if exists "activity events editor admin insert own" on public.activity_events;

drop policy if exists "notification events read own recipients" on public.notification_events;
create policy "notification events read own recipients"
on public.notification_events for select
to authenticated
using (
  exists (
    select 1
    from public.notification_recipients r
    where r.event_id = id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "notification recipients read own" on public.notification_recipients;
create policy "notification recipients read own"
on public.notification_recipients for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "notification recipients update own" on public.notification_recipients;
create policy "notification recipients update own"
on public.notification_recipients for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.create_notification_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_actor_id uuid,
  p_title text,
  p_body text default null,
  p_route text default null,
  p_payload jsonb default '{}'::jsonb,
  p_recipient_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_event_id uuid;
  v_recipient_ids uuid[];
begin
  if v_actor is null then
    raise exception 'Notification actor is required.';
  end if;

  if p_actor_id is not null and p_actor_id <> v_actor then
    raise exception 'Notification actor must match the authenticated user.';
  end if;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
  into v_recipient_ids
  from public.profiles p
  where p.active = true
    and p.id = any(coalesce(p_recipient_ids, '{}'::uuid[]));

  if coalesce(array_length(v_recipient_ids, 1), 0) = 0 then
    return null;
  end if;

  insert into public.notification_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    title,
    body,
    route,
    payload
  )
  values (
    nullif(trim(p_event_type), ''),
    nullif(trim(p_entity_type), ''),
    nullif(trim(p_entity_id), ''),
    v_actor,
    nullif(trim(p_title), ''),
    nullif(trim(coalesce(p_body, '')), ''),
    nullif(trim(coalesce(p_route, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  insert into public.notification_recipients (event_id, user_id)
  select v_event_id, recipient_id
  from unnest(v_recipient_ids) as recipient_id
  on conflict (event_id, user_id) do nothing;

  return v_event_id;
end;
$$;

revoke all on function public.create_notification_event(text, text, text, uuid, text, text, text, jsonb, uuid[]) from public, anon;
grant execute on function public.create_notification_event(text, text, text, uuid, text, text, text, jsonb, uuid[]) to authenticated;

drop policy if exists "saved views read own or team" on public.saved_views;
create policy "saved views read own or team"
on public.saved_views for select
to authenticated
using (owner_id = auth.uid() or scope = 'team');

drop policy if exists "saved views insert own" on public.saved_views;
create policy "saved views insert own"
on public.saved_views for insert
to authenticated
with check (
  owner_id = auth.uid()
  and (
    scope = 'private'
    or public.current_profile_role() = 'admin'
  )
);

drop policy if exists "saved views update own or admin team" on public.saved_views;
create policy "saved views update own or admin team"
on public.saved_views for update
to authenticated
using (owner_id = auth.uid() or (scope = 'team' and public.current_profile_role() = 'admin'))
with check (owner_id = auth.uid() or (scope = 'team' and public.current_profile_role() = 'admin'));

drop policy if exists "saved views delete own or admin team" on public.saved_views;
create policy "saved views delete own or admin team"
on public.saved_views for delete
to authenticated
using (owner_id = auth.uid() or (scope = 'team' and public.current_profile_role() = 'admin'));

drop policy if exists "user settings own read" on public.user_settings;
create policy "user settings own read"
on public.user_settings for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user settings own insert" on public.user_settings;
create policy "user settings own insert"
on public.user_settings for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user settings own update" on public.user_settings;
create policy "user settings own update"
on public.user_settings for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user settings own delete" on public.user_settings;
create policy "user settings own delete"
on public.user_settings for delete
to authenticated
using (user_id = auth.uid());

-- Operational expert-circle and stakeholder records are maintained only in protected storage.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, initials, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'display_name', new.email, 'VK'), 2)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contact-images', 'contact-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "contact images team read" on storage.objects;
create policy "contact images team read" on storage.objects for select to authenticated
using (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1 from public.contacts contact
    where contact.id = (storage.foldername(name))[1]
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact images editor insert" on storage.objects;
create policy "contact images editor insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (select 1 from public.contacts contact where contact.id = (storage.foldername(name))[1])
);

drop policy if exists "contact images editor update" on storage.objects;
create policy "contact images editor update" on storage.objects for update to authenticated
using (bucket_id = 'contact-images' and (select public.current_profile_role()) in ('editor', 'admin'))
with check (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (select 1 from public.contacts contact where contact.id = (storage.foldername(name))[1])
);

drop policy if exists "contact images editor delete" on storage.objects;
create policy "contact images editor delete" on storage.objects for delete to authenticated
using (bucket_id = 'contact-images' and (select public.current_profile_role()) in ('editor', 'admin'));

drop policy if exists "profile images public read" on storage.objects;
drop policy if exists "profile images team read" on storage.objects;
create policy "profile images team read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-images'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
);

drop policy if exists "profile images own insert" on storage.objects;
create policy "profile images own insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile images own update" on storage.objects;
create policy "profile images own update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-images'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile images own delete" on storage.objects;
create policy "profile images own delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Structured contact notes, documented e-mail text and private attachments.
create or replace function public.immutable_text_array_join(values_to_join text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select coalesce(string_agg(value, ' ' order by ordinal), '')
  from unnest(coalesce(values_to_join, '{}'::text[])) with ordinality as item(value, ordinal);
$function$;

revoke all on function public.immutable_text_array_join(text[]) from public, anon;
grant execute on function public.immutable_text_array_join(text[]) to authenticated, service_role;

create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null references public.contacts(id) on delete cascade,
  content_type text not null default 'free_note'
    check (content_type in ('free_note', 'email_text')),
  body text not null,
  email_subject text,
  email_sender text,
  email_recipients text[] not null default '{}',
  email_occurred_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  search_vector tsvector generated always as (
    setweight(to_tsvector('german', coalesce(email_subject, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(email_sender, '') || ' ' || public.immutable_text_array_join(email_recipients)), 'C')
  ) stored,
  constraint contact_notes_body_length_check
    check (char_length(body) between 1 and 500000),
  constraint contact_notes_email_metadata_check
    check (
      content_type = 'email_text'
      or (
        email_subject is null
        and email_sender is null
        and cardinality(email_recipients) = 0
        and email_occurred_at is null
      )
    ),
  constraint contact_notes_contact_id_id_key unique (contact_id, id)
);

create table if not exists public.contact_note_attachments (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null references public.contacts(id) on delete cascade,
  note_id uuid not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  description text,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'complete', 'unsupported', 'failed')),
  extracted_text text,
  extraction_error text,
  uploaded_at timestamptz not null default now(),
  uploader_id uuid not null references public.profiles(id),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(file_name, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('german', coalesce(extracted_text, '')), 'C')
  ) stored,
  constraint contact_note_attachments_note_fkey
    foreign key (contact_id, note_id)
    references public.contact_notes(contact_id, id)
    on delete restrict,
  constraint contact_note_attachments_file_name_check
    check (char_length(btrim(file_name)) between 1 and 240),
  constraint contact_note_attachments_mime_type_check
    check (mime_type in (
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )),
  constraint contact_note_attachments_file_size_check
    check (file_size between 1 and 10485760),
  constraint contact_note_attachments_extracted_text_length_check
    check (extracted_text is null or char_length(extracted_text) <= 200000),
  constraint contact_note_attachments_extraction_state_check
    check (
      (extraction_status = 'complete' and extracted_text is not null and extraction_error is null)
      or (extraction_status = 'failed' and extraction_error is not null)
      or (extraction_status in ('pending', 'unsupported') and extracted_text is null)
    )
);

alter table public.contacts add column if not exists contact_search_vector tsvector
  generated always as (
    setweight(to_tsvector('german', coalesce(name, '') || ' ' || coalesce(organization, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(specialty, '') || ' ' || coalesce(sector, '') || ' ' || public.immutable_text_array_join(topics)), 'B') ||
    setweight(to_tsvector('simple', coalesce(city, '') || ' ' || coalesce(postal_code, '') || ' ' || coalesce(email, '')), 'C')
  ) stored;

create index if not exists contact_notes_contact_created_idx
  on public.contact_notes (contact_id, created_at desc);
create index if not exists contact_notes_created_by_idx
  on public.contact_notes (created_by);
create index if not exists contact_notes_search_idx
  on public.contact_notes using gin (search_vector);
create index if not exists contact_note_attachments_contact_note_idx
  on public.contact_note_attachments (contact_id, note_id, uploaded_at);
create index if not exists contact_note_attachments_uploader_idx
  on public.contact_note_attachments (uploader_id);
create index if not exists contact_note_attachments_search_idx
  on public.contact_note_attachments using gin (search_vector);
create index if not exists contacts_contact_search_idx
  on public.contacts using gin (contact_search_vector);

create or replace function public.prepare_contact_note_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
    if tg_op = 'INSERT' then
      new.created_by := (select auth.uid());
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.updated_by);
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$function$;

revoke all on function public.prepare_contact_note_write() from public, anon, authenticated;

drop trigger if exists contact_notes_prepare_write on public.contact_notes;
create trigger contact_notes_prepare_write
before insert or update on public.contact_notes
for each row execute function public.prepare_contact_note_write();

create or replace function public.log_contact_note_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  note_row public.contact_notes;
  contact_name text;
  event_key text;
  event_action text;
begin
  note_row := case when tg_op = 'DELETE' then old else new end;
  select c.name into contact_name from public.contacts c where c.id = note_row.contact_id;
  event_key := case
    when tg_op = 'INSERT' and note_row.content_type = 'email_text' then 'email.documented'
    when tg_op = 'INSERT' then 'note.created'
    when tg_op = 'UPDATE' then 'note.updated'
    else 'note.deleted'
  end;
  event_action := case when tg_op = 'INSERT' then case when note_row.content_type = 'email_text' then 'documented' else 'created' end
    when tg_op = 'UPDATE' then 'updated' else 'deleted' end;

  insert into public.activity_events (
    event_key, category, action, entity_type, entity_id, contact_id,
    actor_id, occurred_at, origin_type, correlation_id, "references", changes, metadata
  ) values (
    event_key,
    'note_document',
    event_action,
    'note',
    note_row.id::text,
    note_row.contact_id,
    coalesce((select auth.uid()), note_row.updated_by, note_row.created_by),
    statement_timestamp(),
    'manual',
    'contact:' || note_row.contact_id || ':note:' || note_row.id::text,
    jsonb_build_array(
      jsonb_build_object('type', 'contact', 'id', note_row.contact_id, 'label', coalesce(contact_name, 'Kontakt')),
      jsonb_build_object('type', 'note', 'id', note_row.id::text, 'label', case when note_row.content_type = 'email_text' then 'E-Mail-Text' else 'Notiz' end)
    ),
    case when tg_op = 'UPDATE'
      then jsonb_build_object('body', jsonb_build_object('before', old.body, 'after', new.body))
      else '{}'::jsonb
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'contact_name', contact_name,
      'content_type', note_row.content_type,
      'email_subject', note_row.email_subject
    ))
  );
  return note_row;
end;
$function$;

revoke all on function public.log_contact_note_activity() from public, anon, authenticated;

drop trigger if exists contact_notes_log_activity on public.contact_notes;
create trigger contact_notes_log_activity
after insert or update or delete on public.contact_notes
for each row execute function public.log_contact_note_activity();

create or replace function public.log_contact_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  attachment_row public.contact_note_attachments;
  contact_name text;
  event_key text;
  event_action text;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;
  attachment_row := case when tg_op = 'DELETE' then old else new end;
  select c.name into contact_name from public.contacts c where c.id = attachment_row.contact_id;
  event_key := case when tg_op = 'DELETE' then 'document.removed' else 'document.uploaded' end;
  event_action := case when tg_op = 'DELETE' then 'removed' else 'uploaded' end;

  insert into public.activity_events (
    event_key, category, action, entity_type, entity_id, contact_id,
    actor_id, occurred_at, origin_type, correlation_id, "references", changes, metadata
  ) values (
    event_key,
    'note_document',
    event_action,
    'document',
    attachment_row.id::text,
    attachment_row.contact_id,
    coalesce((select auth.uid()), attachment_row.uploader_id),
    statement_timestamp(),
    'manual',
    'contact:' || attachment_row.contact_id || ':note:' || attachment_row.note_id::text,
    jsonb_build_array(
      jsonb_build_object('type', 'contact', 'id', attachment_row.contact_id, 'label', coalesce(contact_name, 'Kontakt')),
      jsonb_build_object('type', 'note', 'id', attachment_row.note_id::text, 'label', 'Notiz'),
      jsonb_build_object('type', 'document', 'id', attachment_row.id::text, 'label', attachment_row.file_name)
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'contact_name', contact_name,
      'file_name', attachment_row.file_name,
      'mime_type', attachment_row.mime_type,
      'file_size', attachment_row.file_size,
      'extraction_status', attachment_row.extraction_status
    )
  );
  return attachment_row;
end;
$function$;

revoke all on function public.log_contact_attachment_activity() from public, anon, authenticated;

drop trigger if exists contact_note_attachments_log_activity on public.contact_note_attachments;
create trigger contact_note_attachments_log_activity
after insert or update or delete on public.contact_note_attachments
for each row execute function public.log_contact_attachment_activity();

alter table public.contact_notes enable row level security;
alter table public.contact_note_attachments enable row level security;

revoke all on public.contact_notes, public.contact_note_attachments from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.contact_notes to authenticated;
grant select, insert, update, delete on public.contact_note_attachments to authenticated;
grant select, insert, update, delete on public.contact_notes, public.contact_note_attachments to service_role;

drop policy if exists "contact notes team read" on public.contact_notes;
create policy "contact notes team read" on public.contact_notes for select to authenticated
using (
  (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact notes editor insert" on public.contact_notes;
create policy "contact notes editor insert" on public.contact_notes for insert to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (select 1 from public.contacts contact where contact.id = contact_id and contact.status <> 'archived')
);

drop policy if exists "contact notes author update" on public.contact_notes;
create policy "contact notes author update" on public.contact_notes for update to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and updated_by = (select auth.uid())
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
);

drop policy if exists "contact notes author delete" on public.contact_notes;
create policy "contact notes author delete" on public.contact_notes for delete to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
);

drop policy if exists "contact attachments team read" on public.contact_note_attachments;
create policy "contact attachments team read" on public.contact_note_attachments for select to authenticated
using (
  (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact attachments editor insert" on public.contact_note_attachments;
create policy "contact attachments editor insert" on public.contact_note_attachments for insert to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and uploader_id = (select auth.uid())
  and exists (select 1 from public.contacts contact where contact.id = contact_id and contact.status <> 'archived')
);

drop policy if exists "contact attachments uploader update" on public.contact_note_attachments;
create policy "contact attachments uploader update" on public.contact_note_attachments for update to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
);

drop policy if exists "contact attachments uploader delete" on public.contact_note_attachments;
create policy "contact attachments uploader delete" on public.contact_note_attachments for delete to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-note-attachments',
  'contact-note-attachments',
  false,
  10485760,
  array[
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "contact note attachments team read" on storage.objects;
create policy "contact note attachments team read" on storage.objects for select to authenticated
using (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1
    from public.contact_note_attachments attachment
    join public.contacts contact on contact.id = attachment.contact_id
    where attachment.storage_path = name
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact note attachments editor insert" on storage.objects;
create policy "contact note attachments editor insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (
    select 1 from public.contacts contact
    where contact.id = (storage.foldername(name))[1]
      and contact.status <> 'archived'
  )
);

drop policy if exists "contact note attachments uploader delete" on storage.objects;
create policy "contact note attachments uploader delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (
    select 1 from public.contact_note_attachments attachment
    where attachment.storage_path = name
      and (attachment.uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  )
);

create or replace function public.search_contact_content(query_text text, result_limit integer default 40)
returns table (
  contact_id text,
  note_id uuid,
  attachment_id uuid,
  result_kind text,
  title text,
  snippet text,
  occurred_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with search_query as (
    select websearch_to_tsquery('german', btrim(query_text)) as query
  ), ranked as (
    select
      contact.id as contact_id,
      null::uuid as note_id,
      null::uuid as attachment_id,
      'contact'::text as result_kind,
      contact.name as title,
      concat_ws(' · ', nullif(contact.organization, ''), nullif(contact.specialty, ''), nullif(contact.city, '')) as snippet,
      contact.updated_at as occurred_at,
      (1.4 * ts_rank_cd(contact.contact_search_vector, search_query.query))::real as rank
    from public.contacts contact
    cross join search_query
    where contact.contact_search_vector @@ search_query.query

    union all

    select
      note.contact_id,
      note.id,
      null::uuid,
      note.content_type,
      coalesce(nullif(note.email_subject, ''), case when note.content_type = 'email_text' then 'E-Mail-Text' else 'Notiz' end),
      regexp_replace(
        ts_headline('german', note.body, search_query.query, 'MaxWords=24, MinWords=8, ShortWord=2'),
        '</?b>', '', 'gi'
      ),
      coalesce(note.email_occurred_at, note.created_at),
      ts_rank_cd(note.search_vector, search_query.query)::real
    from public.contact_notes note
    cross join search_query
    where note.search_vector @@ search_query.query

    union all

    select
      attachment.contact_id,
      attachment.note_id,
      attachment.id,
      'attachment'::text,
      attachment.file_name,
      regexp_replace(
        ts_headline(
          'german',
          concat_ws(' ', attachment.description, attachment.extracted_text),
          search_query.query,
          'MaxWords=24, MinWords=8, ShortWord=2'
        ),
        '</?b>', '', 'gi'
      ),
      attachment.uploaded_at,
      (0.85 * ts_rank_cd(attachment.search_vector, search_query.query))::real
    from public.contact_note_attachments attachment
    cross join search_query
    where attachment.search_vector @@ search_query.query
  )
  select ranked.contact_id, ranked.note_id, ranked.attachment_id, ranked.result_kind,
    ranked.title, ranked.snippet, ranked.occurred_at, ranked.rank
  from ranked
  where nullif(btrim(query_text), '') is not null
  order by ranked.rank desc, ranked.occurred_at desc
  limit greatest(1, least(coalesce(result_limit, 40), 100));
$function$;

revoke all on function public.search_contact_content(text, integer) from public, anon;
grant execute on function public.search_contact_content(text, integer) to authenticated, service_role;

comment on table public.contact_notes is 'Structured free notes and documented e-mail text attached to a care contact.';
comment on table public.contact_note_attachments is 'Metadata and extracted text for private contact-note documents; binary content lives in Storage.';
comment on column public.contact_note_attachments.storage_path is 'Private object path in the contact-note-attachments bucket; never a public URL.';
comment on column public.contact_note_attachments.extracted_text is 'Permission-aware, length-limited text extracted client-side from TXT, PDF or DOCX; OCR is out of scope.';
