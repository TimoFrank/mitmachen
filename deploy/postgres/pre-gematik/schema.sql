-- Versorgungs-Kompass: PostgreSQL-16-Bootstrap fuer die befristete Pre-Integration.
-- Kein freigegebenes gematik-Zielschema. Keine automatische Anwendung beim App-Start.

begin;

set local lock_timeout = '10s';
set local search_path = public, pg_catalog;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-schema-v1', 0));

create or replace function public.pre_gematik_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.pre_gematik_text_array_join(values_to_join text[])
returns text
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(string_agg(item.value, ' ' order by item.ordinal), '')
  from unnest(coalesce(values_to_join, '{}'::text[])) with ordinality as item(value, ordinal);
$$;

create or replace function public.pre_gematik_activity_contact_references_match(
  reference_values jsonb,
  expected_contact_id text
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog, public
as $$
  select case
    when jsonb_typeof(coalesce(reference_values, '[]'::jsonb)) <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(coalesce(reference_values, '[]'::jsonb)) as item
      where item ->> 'type' = 'contact'
        and (expected_contact_id is null or item ->> 'id' is distinct from expected_contact_id)
    )
  end;
$$;

create table if not exists public.profiles (
  id text primary key,
  email text not null,
  display_name text not null,
  initials text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  active boolean not null default true,
  avatar_url text,
  team text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(id), '') is not null),
  check (position('@' in email) > 1)
);

create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(email));
create index if not exists profiles_active_role_idx
  on public.profiles (active, role);

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

create table if not exists public.organizations (
  id text primary key default gen_random_uuid()::text,
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
  member_count integer check (member_count is null or member_count >= 0),
  member_count_source_url text,
  member_count_source_label text,
  member_count_updated_at date,
  member_count_scope text,
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  check (nullif(btrim(name), '') is not null),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create index if not exists organizations_status_idx
  on public.organizations (status);
create index if not exists organizations_normalized_name_idx
  on public.organizations (normalized_name);
create index if not exists organizations_location_idx
  on public.organizations (federal_state, city);

create table if not exists public.contacts (
  id text primary key,
  name text not null,
  organization_id text references public.organizations(id) on delete set null,
  organization text,
  sector text,
  specialty text,
  role text,
  priority text not null default 'Mittel'
    check (priority in ('Hoch', 'Mittel', 'Niedrig', 'Keine / Unbekannt')),
  owner_id text references public.profiles(id) on delete set null,
  postal_code text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  email text,
  phone text,
  linkedin text,
  mitmachen_consent_status text not null default 'not_requested'
    check (mitmachen_consent_status in ('granted', 'not_requested', 'declined', 'withdrawn', 'clarification_needed')),
  mitmachen_consent_effective_at timestamptz,
  mitmachen_consent_source text
    check (mitmachen_consent_source is null or mitmachen_consent_source in ('online_form', 'email', 'written', 'verbal_confirmed', 'manual_transfer')),
  mitmachen_consent_text_version text,
  mitmachen_consent_recorded_by text references public.profiles(id) on delete restrict,
  mitmachen_consent_note text,
  topics text[] not null default '{}'::text[],
  notes text,
  source text,
  image_url text,
  image_source_url text,
  image_source_label text,
  image_rights_note text,
  image_updated_at timestamptz,
  image_updated_by text references public.profiles(id) on delete set null,
  image_storage_path text,
  image_kind text check (image_kind is null or image_kind in ('upload', 'external')),
  image_mime_type text,
  image_file_size bigint check (image_file_size is null or image_file_size between 1 and 5242880),
  image_width integer,
  image_height integer,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  contact_search_vector tsvector generated always as (
    setweight(to_tsvector('german'::regconfig, coalesce(name, '') || ' ' || coalesce(organization, '')), 'A') ||
    setweight(to_tsvector('german'::regconfig, coalesce(specialty, '') || ' ' || coalesce(sector, '') || ' ' || public.pre_gematik_text_array_join(topics)), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(city, '') || ' ' || coalesce(postal_code, '') || ' ' || coalesce(email, '')), 'C')
  ) stored,
  constraint contacts_mitmachen_required_fields_check check (
    mitmachen_consent_status <> 'granted'
    or (
      mitmachen_consent_effective_at is not null
      and mitmachen_consent_source is not null
      and mitmachen_consent_recorded_by is not null
    )
  ),
  constraint contacts_mitmachen_decision_time_check check (
    mitmachen_consent_status not in ('declined', 'withdrawn')
    or mitmachen_consent_effective_at is not null
  ),
  constraint contacts_mitmachen_evidence_note_check check (
    mitmachen_consent_source not in ('verbal_confirmed', 'manual_transfer')
    or length(btrim(coalesce(mitmachen_consent_note, ''))) > 0
  ),
  constraint contacts_image_dimensions_check check (
    (image_width is null and image_height is null)
    or (image_width between 1 and 4096 and image_height between 1 and 4096)
  ),
  check (nullif(btrim(id), '') is not null),
  check (nullif(btrim(name), '') is not null),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create index if not exists contacts_status_idx on public.contacts (status);
create index if not exists contacts_owner_idx on public.contacts (owner_id);
create index if not exists contacts_organization_idx on public.contacts (organization_id);
create index if not exists contacts_location_idx on public.contacts (federal_state, city);
create index if not exists contacts_updated_idx on public.contacts (updated_at desc);
create index if not exists contacts_search_gin on public.contacts using gin (contact_search_vector);

create table if not exists public.organization_primary_systems (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  system_type text not null
    check (system_type in ('PVS', 'KIS', 'AVS', 'ZPVS', 'LIS', 'HVS', 'PFLEGE', 'SONSTIGES')),
  vendor_name text,
  product_name text,
  source_url text,
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null
);

create index if not exists organization_primary_systems_organization_idx
  on public.organization_primary_systems (organization_id);
create unique index if not exists organization_primary_systems_natural_uidx
  on public.organization_primary_systems (
    organization_id,
    system_type,
    coalesce(vendor_name, ''),
    coalesce(product_name, '')
  );

create table if not exists public.contact_owners (
  contact_id text not null references public.contacts(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by text references public.profiles(id) on delete set null,
  primary key (contact_id, profile_id)
);

create index if not exists contact_owners_profile_idx
  on public.contact_owners (profile_id, assigned_at);

create table if not exists public.activity_events (
  id bigint generated by default as identity primary key,
  event_key text not null,
  category text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  contact_id text references public.contacts(id) on delete restrict,
  actor_id text references public.profiles(id) on delete set null,
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
  constraint activity_events_entity_check
    check (nullif(btrim(entity_type), '') is not null and nullif(btrim(entity_id), '') is not null),
  constraint activity_events_contact_entity_check
    check (entity_type <> 'contact' or (contact_id is not null and contact_id = entity_id)),
  constraint activity_events_contact_reference_check
    check (public.pre_gematik_activity_contact_references_match("references", contact_id)),
  constraint activity_events_origin_type_check
    check (origin_type in ('manual', 'data_import', 'public_registration', 'system', 'legacy')),
  constraint activity_events_references_type_check
    check (jsonb_typeof("references") = 'array'),
  constraint activity_events_changes_type_check
    check (jsonb_typeof(changes) = 'object'),
  constraint activity_events_metadata_type_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint activity_events_legacy_pair_check check (
    (legacy_source is null and legacy_id is null)
    or (nullif(btrim(legacy_source), '') is not null and nullif(btrim(legacy_id), '') is not null)
  ),
  unique (contact_id, id)
);

create unique index if not exists activity_events_legacy_uidx
  on public.activity_events (legacy_source, legacy_id)
  where legacy_source is not null and legacy_id is not null;
create index if not exists activity_events_timeline_idx
  on public.activity_events (occurred_at desc, id desc);
create index if not exists activity_events_contact_timeline_idx
  on public.activity_events (contact_id, occurred_at desc, id desc);
create index if not exists activity_events_actor_idx
  on public.activity_events (actor_id, occurred_at desc);
create index if not exists activity_events_entity_idx
  on public.activity_events (entity_type, entity_id, occurred_at desc);
create index if not exists activity_events_event_key_idx
  on public.activity_events (event_key, occurred_at desc);

create table if not exists public.changes (
  id bigint generated by default as identity primary key,
  contact_id text not null references public.contacts(id) on delete cascade,
  action text not null
    check (action in ('create', 'update', 'archive', 'restore', 'owner_change', 'seed', 'image_update', 'image_remove', 'import')),
  field_name text,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  changed_by text references public.profiles(id) on delete set null,
  activity_event_id bigint,
  canonicalized_at timestamptz,
  constraint changes_canonical_reference_pair_check check (
    (activity_event_id is null and canonicalized_at is null)
    or (activity_event_id is not null and canonicalized_at is not null)
  ),
  constraint changes_activity_event_contact_fkey
    foreign key (contact_id, activity_event_id)
    references public.activity_events(contact_id, id)
    on delete restrict
);

create index if not exists changes_timeline_idx
  on public.changes (changed_at desc, id desc);
create index if not exists changes_contact_timeline_idx
  on public.changes (contact_id, changed_at desc, id desc);
create index if not exists changes_actor_idx
  on public.changes (changed_by, changed_at desc);
create index if not exists changes_activity_event_idx
  on public.changes (activity_event_id)
  where activity_event_id is not null;

create table if not exists public.import_runs (
  id text primary key,
  file_name text,
  status text not null default 'completed'
    check (status in ('previewed', 'completed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  imported_contacts integer not null default 0 check (imported_contacts >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  report jsonb not null default '{}'::jsonb check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null
);

create index if not exists import_runs_created_idx
  on public.import_runs (created_at desc);

create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null references public.contacts(id) on delete cascade,
  content_type text not null default 'free_note'
    check (content_type in ('free_note', 'email_text')),
  body text not null,
  email_subject text,
  email_sender text,
  email_recipients text[] not null default '{}'::text[],
  email_occurred_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by text not null references public.profiles(id) on delete restrict,
  search_vector tsvector generated always as (
    setweight(to_tsvector('german'::regconfig, coalesce(email_subject, '')), 'A') ||
    setweight(to_tsvector('german'::regconfig, coalesce(body, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(email_sender, '') || ' ' || public.pre_gematik_text_array_join(email_recipients)), 'C')
  ) stored,
  constraint contact_notes_body_length_check check (char_length(body) between 1 and 500000),
  constraint contact_notes_email_metadata_check check (
    content_type = 'email_text'
    or (
      email_subject is null
      and email_sender is null
      and cardinality(email_recipients) = 0
      and email_occurred_at is null
    )
  ),
  unique (contact_id, id)
);

create index if not exists contact_notes_contact_idx
  on public.contact_notes (contact_id, created_at desc);
create index if not exists contact_notes_search_gin
  on public.contact_notes using gin (search_vector);

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
  uploader_id text not null references public.profiles(id) on delete restrict,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(file_name, '')), 'A') ||
    setweight(to_tsvector('german'::regconfig, coalesce(description, '')), 'B') ||
    setweight(to_tsvector('german'::regconfig, coalesce(extracted_text, '')), 'C')
  ) stored,
  constraint contact_note_attachments_note_fkey
    foreign key (contact_id, note_id)
    references public.contact_notes(contact_id, id)
    on delete restrict,
  constraint contact_note_attachments_name_check
    check (char_length(btrim(file_name)) between 1 and 240),
  constraint contact_note_attachments_mime_check
    check (mime_type in (
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )),
  constraint contact_note_attachments_size_check
    check (file_size between 1 and 10485760),
  constraint contact_note_attachments_text_length_check
    check (extracted_text is null or char_length(extracted_text) <= 200000),
  constraint contact_note_attachments_state_check check (
    (extraction_status = 'complete' and extracted_text is not null and extraction_error is null)
    or (extraction_status = 'failed' and extraction_error is not null)
    or (extraction_status in ('pending', 'unsupported') and extracted_text is null)
  )
);

create index if not exists contact_note_attachments_contact_idx
  on public.contact_note_attachments (contact_id, uploaded_at);
create index if not exists contact_note_attachments_note_idx
  on public.contact_note_attachments (note_id, uploaded_at);
create index if not exists contact_note_attachments_search_gin
  on public.contact_note_attachments using gin (search_vector);

create table if not exists public.saved_views (
  id text primary key default gen_random_uuid()::text,
  owner_id text not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  scope text not null default 'private' check (scope in ('private', 'team')),
  view_type text not null default 'contacts',
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  search_query text not null default '',
  sort_key text not null default 'updated_at',
  sort_direction text not null default 'desc' check (sort_direction in ('asc', 'desc')),
  page_size integer not null default 20 check (page_size between 1 and 500),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(name), '') is not null)
);

create index if not exists saved_views_owner_idx
  on public.saved_views (owner_id, view_type, updated_at desc);
create unique index if not exists saved_views_single_default_uidx
  on public.saved_views (owner_id, view_type)
  where is_default;

create table if not exists public.user_settings (
  user_id text primary key references public.profiles(id) on delete cascade,
  default_view_id text references public.saved_views(id) on delete set null,
  default_view_type text not null default 'contacts',
  table_density text not null default 'comfortable'
    check (table_density in ('compact', 'comfortable', 'spacious')),
  theme text not null default 'system'
    check (theme in ('system', 'light', 'contrast')),
  font_scale numeric not null default 1 check (font_scale between 0.5 and 2),
  page_size integer not null default 20 check (page_size between 1 and 500),
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.formats (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  format_type text not null default 'Roundtable',
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  goal text,
  owner_id text references public.profiles(id) on delete set null,
  status text not null default 'Planung'
    check (status in ('Planung', 'Aktiv', 'Abgeschlossen', 'Archiviert')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  check (nullif(btrim(title), '') is not null),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists formats_status_time_idx
  on public.formats (status, starts_at desc);
create index if not exists formats_owner_idx
  on public.formats (owner_id, updated_at desc);

create table if not exists public.format_participants (
  id text primary key default gen_random_uuid()::text,
  format_id text not null references public.formats(id) on delete cascade,
  contact_id text not null references public.contacts(id) on delete cascade,
  invitation_status text not null default 'Kandidat'
    check (invitation_status in ('Kandidat', 'Eingeladen', 'Zugesagt', 'Abgesagt', 'Keine Rückmeldung', 'Teilgenommen')),
  participant_role text,
  notes text,
  invited_at timestamptz,
  responded_at timestamptz,
  participated_at timestamptz,
  cancelled_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  unique (format_id, contact_id)
);

create index if not exists format_participants_contact_idx
  on public.format_participants (contact_id, updated_at desc);
create index if not exists format_participants_status_idx
  on public.format_participants (format_id, invitation_status);

create table if not exists public.hospitation_slots (
  id text primary key default gen_random_uuid()::text,
  contact_id text references public.contacts(id) on delete set null,
  contact_name text,
  organization_id text references public.organizations(id) on delete set null,
  organization_name text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  city text,
  federal_state text,
  sector text,
  capacity integer not null default 1 check (capacity >= 1),
  owner_id text references public.profiles(id) on delete set null,
  status text not null default 'Frei'
    check (status in ('Frei', 'Reserviert', 'Gebucht', 'Abgesagt', 'Archiviert')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists hospitation_slots_status_time_idx
  on public.hospitation_slots (status, starts_at);
create index if not exists hospitation_slots_contact_idx
  on public.hospitation_slots (contact_id, starts_at desc);
create index if not exists hospitation_slots_organization_idx
  on public.hospitation_slots (organization_id, starts_at desc);

create table if not exists public.hospitations (
  id text primary key default gen_random_uuid()::text,
  slot_id text references public.hospitation_slots(id) on delete set null,
  contact_id text references public.contacts(id) on delete set null,
  contact_name text,
  organization_id text references public.organizations(id) on delete set null,
  organization_name text,
  requester_profile_id text references public.profiles(id) on delete set null,
  owner_id text references public.profiles(id) on delete set null,
  status text not null default 'Angefragt'
    check (status in ('Entwurf', 'Angefragt', 'Angeboten', 'Gebucht', 'Abgelehnt', 'Abgesagt', 'Durchgeführt', 'Dokumentiert', 'Archiviert')),
  requested_windows jsonb not null default '[]'::jsonb check (jsonb_typeof(requested_windows) = 'array'),
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
  follow_up_owner_id text references public.profiles(id) on delete set null,
  follow_up_due_at date,
  documented_at timestamptz,
  documented_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists hospitations_status_time_idx
  on public.hospitations (status, starts_at desc, updated_at desc);
create index if not exists hospitations_slot_idx on public.hospitations (slot_id);
create index if not exists hospitations_contact_idx on public.hospitations (contact_id, updated_at desc);
create index if not exists hospitations_organization_idx on public.hospitations (organization_id, updated_at desc);
create index if not exists hospitations_owner_idx on public.hospitations (owner_id, updated_at desc);

create table if not exists public.hospitation_observations (
  id text primary key,
  hospitation_id text not null references public.hospitations(id) on delete cascade,
  sequence integer,
  title text not null default 'Beobachtung',
  situation text,
  description text,
  process_phase text,
  problem_type text,
  impact text,
  observation_type text,
  evidence_type text not null default 'interpreted'
    check (evidence_type in ('directly_observed', 'reported', 'interpreted')),
  relevance_score integer check (relevance_score between 1 and 5),
  usage_recommendation text,
  involved_roles text[] not null default '{}'::text[],
  affected_products text[] not null default '{}'::text[],
  topics text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  archived_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  check (nullif(btrim(id), '') is not null),
  check (nullif(btrim(title), '') is not null),
  check ((status = 'active' and archived_at is null) or status = 'archived')
);

create index if not exists hospitation_observations_hospitation_idx
  on public.hospitation_observations (hospitation_id, sequence, created_at);
create index if not exists hospitation_observations_status_idx
  on public.hospitation_observations (status, updated_at desc);
create index if not exists hospitation_observations_codes_idx
  on public.hospitation_observations (process_phase, problem_type);
create index if not exists hospitation_observations_roles_gin
  on public.hospitation_observations using gin (involved_roles);
create index if not exists hospitation_observations_products_gin
  on public.hospitation_observations using gin (affected_products);
create index if not exists hospitation_observations_payload_gin
  on public.hospitation_observations using gin (payload);

create table if not exists public.hospitation_observation_changes (
  id bigint generated by default as identity primary key,
  observation_id text not null references public.hospitation_observations(id) on delete cascade,
  hospitation_id text not null references public.hospitations(id) on delete cascade,
  action text not null check (action in ('create', 'update', 'archive', 'restore')),
  before_value jsonb,
  after_value jsonb,
  changed_at timestamptz not null default now(),
  changed_by text references public.profiles(id) on delete set null,
  check (before_value is not null or after_value is not null)
);

create index if not exists hospitation_observation_changes_observation_idx
  on public.hospitation_observation_changes (observation_id, changed_at desc);
create index if not exists hospitation_observation_changes_hospitation_idx
  on public.hospitation_observation_changes (hospitation_id, changed_at desc);

create table if not exists public.roadmap_items (
  id text primary key default gen_random_uuid()::text,
  slug text not null unique,
  roadmap_version text not null default 'OneRoadmap Q2/2026',
  source_url text,
  product_area text not null,
  product_name text not null,
  feature_name text not null,
  phase text,
  roadmap_status text not null default 'Unklar'
    check (roadmap_status in ('In Bearbeitung', 'In Planung', 'Offen', 'Im Backlog', 'Unklar')),
  timeline_label text,
  deadline_type text not null default 'Unklar'
    check (deadline_type in ('SGB V', 'EHDS', 'gematik Planung', 'Backlog', 'Technische Abhängigkeit', 'Keine Frist', 'Unklar')),
  legal_basis text,
  user_groups text[] not null default '{}'::text[],
  primary_systems text[] not null default '{}'::text[],
  description text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null
);

create index if not exists roadmap_items_active_order_idx
  on public.roadmap_items (active, sort_order, product_name);
create index if not exists roadmap_items_area_status_idx
  on public.roadmap_items (product_area, roadmap_status);

create table if not exists public.hospitation_roadmap_assessments (
  id text primary key default gen_random_uuid()::text,
  hospitation_id text not null references public.hospitations(id) on delete cascade,
  roadmap_item_id text not null references public.roadmap_items(id) on delete restrict,
  respondent_role text,
  respondent_sector text,
  care_relevance integer check (care_relevance between 1 and 5),
  patient_safety integer check (patient_safety between 1 and 5),
  process_relief integer check (process_relief between 1 and 5),
  urgency integer check (urgency between 1 and 5),
  implementation_feasibility integer check (implementation_feasibility between 1 and 5),
  adoption_likelihood integer check (adoption_likelihood between 1 and 5),
  confidence_score integer check (confidence_score between 1 and 5),
  comparison_role text not null default 'none'
    check (comparison_role in ('none', 'top_priority', 'low_priority')),
  evidence_note text,
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  unique (hospitation_id, roadmap_item_id)
);

create index if not exists hospitation_roadmap_assessments_item_idx
  on public.hospitation_roadmap_assessments (roadmap_item_id, updated_at desc);

create table if not exists public.hospitation_unmet_needs (
  id text primary key default gen_random_uuid()::text,
  hospitation_id text not null references public.hospitations(id) on delete cascade,
  related_roadmap_item_id text references public.roadmap_items(id) on delete set null,
  title text not null,
  problem text,
  affected_role text,
  affected_sector text,
  classification text not null default 'new_backlog_item'
    check (classification in ('existing_item_extension', 'new_backlog_item', 'legal_clarification', 'organizational_implementation', 'local_system_issue', 'communication_or_training')),
  expected_benefit integer check (expected_benefit between 1 and 5),
  urgency integer check (urgency between 1 and 5),
  implementation_feasibility integer check (implementation_feasibility between 1 and 5),
  confidence_score integer check (confidence_score between 1 and 5),
  current_workaround text,
  next_step text,
  status text not null default 'Neu'
    check (status in ('Neu', 'In Prüfung', 'Übernommen', 'Zurückgestellt', 'Erledigt', 'Archiviert')),
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  check (nullif(btrim(title), '') is not null)
);

create index if not exists hospitation_unmet_needs_hospitation_idx
  on public.hospitation_unmet_needs (hospitation_id, status, updated_at desc);
create index if not exists hospitation_unmet_needs_item_idx
  on public.hospitation_unmet_needs (related_roadmap_item_id);

create table if not exists public.expert_groups (
  id text primary key,
  name text not null unique,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expert_organizations (
  id text primary key default gen_random_uuid()::text,
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
  logo_url text,
  logo_source_url text,
  logo_source_label text,
  member_count integer check (member_count is null or member_count >= 0),
  member_count_source_url text,
  member_count_source_label text,
  member_count_updated_at date,
  member_count_scope text,
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(name), '') is not null)
);

create index if not exists expert_organizations_group_idx
  on public.expert_organizations (group_id, status);
create index if not exists expert_organizations_normalized_idx
  on public.expert_organizations (normalized_name);

create table if not exists public.expert_contacts (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  organization_id text references public.expert_organizations(id) on delete set null,
  organization text,
  group_id text references public.expert_groups(id) on delete restrict,
  group_name text,
  specialty text,
  role text,
  city text,
  federal_state text,
  email text,
  phone text,
  linkedin text,
  topics text[] not null default '{}'::text[],
  notes text,
  source text,
  profile_url text,
  owner_id text references public.profiles(id) on delete set null,
  owner_ids text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(name), '') is not null)
);

create index if not exists expert_contacts_group_idx
  on public.expert_contacts (group_id, status);
create index if not exists expert_contacts_owner_idx
  on public.expert_contacts (owner_id, status);
create index if not exists expert_contacts_owner_ids_gin
  on public.expert_contacts using gin (owner_ids);

create table if not exists public.expert_entity_links (
  id text primary key default gen_random_uuid()::text,
  link_type text not null check (link_type in ('contact', 'organization')),
  contact_id text references public.contacts(id) on delete cascade,
  expert_contact_id text references public.expert_contacts(id) on delete cascade,
  organization_id text references public.organizations(id) on delete cascade,
  expert_organization_id text references public.expert_organizations(id) on delete cascade,
  match_reason text,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now(),
  created_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references public.profiles(id) on delete set null,
  constraint expert_entity_links_shape_check check (
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

create unique index if not exists expert_entity_links_contact_uidx
  on public.expert_entity_links (contact_id, expert_contact_id)
  where link_type = 'contact';
create unique index if not exists expert_entity_links_organization_uidx
  on public.expert_entity_links (organization_id, expert_organization_id)
  where link_type = 'organization';

create table if not exists public.stakeholder_types (
  id text primary key,
  label text not null,
  description text,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(label), '') is not null)
);

create table if not exists public.stakeholder_organizations (
  id text primary key default gen_random_uuid()::text,
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
  member_count integer check (member_count is null or member_count >= 0),
  member_count_source_url text,
  member_count_source_label text,
  member_count_updated_at date,
  member_count_scope text,
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(name), '') is not null),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  constraint stakeholder_organizations_logo_url_private_check check (
    logo_url is null
    or (
      logo_url like 'private://stakeholder-logos/%'
      and length(logo_url) <= 1052
      and substring(logo_url from 29) ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
      and substring(logo_url from 29) not like '%//%'
      and right(substring(logo_url from 29), 1) <> '/'
      and substring(logo_url from 29) !~ '(^|/)[.]([.]?)($|/)'
    )
  )
);

create index if not exists stakeholder_organizations_type_idx
  on public.stakeholder_organizations (stakeholder_type_id, status);
create index if not exists stakeholder_organizations_normalized_idx
  on public.stakeholder_organizations (normalized_name);

create table if not exists public.stakeholder_people (
  id text primary key default gen_random_uuid()::text,
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
  map_position_source text
    check (map_position_source is null or map_position_source in ('person', 'organization', 'state')),
  email text,
  phone text,
  linkedin text,
  topics text[] not null default '{}'::text[],
  notes text,
  source text,
  profile_url text,
  is_representative_assembly_member boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(name), '') is not null),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create index if not exists stakeholder_people_type_idx
  on public.stakeholder_people (stakeholder_type_id, status);
create index if not exists stakeholder_people_organization_idx
  on public.stakeholder_people (organization_id, status);
create index if not exists stakeholder_people_topics_gin
  on public.stakeholder_people using gin (topics);

create table if not exists public.notification_events (
  id text primary key,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  actor_id text references public.profiles(id) on delete set null,
  title text not null,
  body text,
  occurred_at timestamptz not null default now(),
  route text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  check (nullif(btrim(event_type), '') is not null),
  check (nullif(btrim(entity_type), '') is not null),
  check (nullif(btrim(title), '') is not null)
);

create index if not exists notification_events_timeline_idx
  on public.notification_events (occurred_at desc, created_at desc);
create index if not exists notification_events_entity_idx
  on public.notification_events (entity_type, entity_id, occurred_at desc);

create table if not exists public.notification_recipients (
  event_id text not null references public.notification_events(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists notification_recipients_user_idx
  on public.notification_recipients (user_id, dismissed_at, read_at, created_at desc);

create or replace function public.pre_gematik_log_hospitation_observation_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  change_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.hospitation_observation_changes (
      observation_id,
      hospitation_id,
      action,
      after_value,
      changed_by
    ) values (
      new.id,
      new.hospitation_id,
      'create',
      to_jsonb(new),
      new.created_by
    );
    return new;
  end if;

  change_action := case
    when old.status <> new.status and new.status = 'archived' then 'archive'
    when old.status <> new.status and new.status = 'active' then 'restore'
    else 'update'
  end;

  insert into public.hospitation_observation_changes (
    observation_id,
    hospitation_id,
    action,
    before_value,
    after_value,
    changed_by
  ) values (
    new.id,
    new.hospitation_id,
    change_action,
    to_jsonb(old),
    to_jsonb(new),
    new.updated_by
  );
  return new;
end;
$$;

drop trigger if exists profiles_pre_gematik_touch_updated_at on public.profiles;
create trigger profiles_pre_gematik_touch_updated_at before update on public.profiles
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists identity_bindings_pre_gematik_touch_updated_at on public.identity_bindings;
create trigger identity_bindings_pre_gematik_touch_updated_at before update on public.identity_bindings
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists organizations_pre_gematik_touch_updated_at on public.organizations;
create trigger organizations_pre_gematik_touch_updated_at before update on public.organizations
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists contacts_pre_gematik_touch_updated_at on public.contacts;
create trigger contacts_pre_gematik_touch_updated_at before update on public.contacts
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists organization_primary_systems_pre_gematik_touch_updated_at on public.organization_primary_systems;
create trigger organization_primary_systems_pre_gematik_touch_updated_at before update on public.organization_primary_systems
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists contact_notes_pre_gematik_touch_updated_at on public.contact_notes;
create trigger contact_notes_pre_gematik_touch_updated_at before update on public.contact_notes
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists saved_views_pre_gematik_touch_updated_at on public.saved_views;
create trigger saved_views_pre_gematik_touch_updated_at before update on public.saved_views
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists user_settings_pre_gematik_touch_updated_at on public.user_settings;
create trigger user_settings_pre_gematik_touch_updated_at before update on public.user_settings
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists formats_pre_gematik_touch_updated_at on public.formats;
create trigger formats_pre_gematik_touch_updated_at before update on public.formats
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists format_participants_pre_gematik_touch_updated_at on public.format_participants;
create trigger format_participants_pre_gematik_touch_updated_at before update on public.format_participants
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists hospitation_slots_pre_gematik_touch_updated_at on public.hospitation_slots;
create trigger hospitation_slots_pre_gematik_touch_updated_at before update on public.hospitation_slots
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists hospitations_pre_gematik_touch_updated_at on public.hospitations;
create trigger hospitations_pre_gematik_touch_updated_at before update on public.hospitations
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists hospitation_observations_pre_gematik_touch_updated_at on public.hospitation_observations;
create trigger hospitation_observations_pre_gematik_touch_updated_at before update on public.hospitation_observations
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists roadmap_items_pre_gematik_touch_updated_at on public.roadmap_items;
create trigger roadmap_items_pre_gematik_touch_updated_at before update on public.roadmap_items
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists hospitation_roadmap_assessments_pre_gematik_touch_updated_at on public.hospitation_roadmap_assessments;
create trigger hospitation_roadmap_assessments_pre_gematik_touch_updated_at before update on public.hospitation_roadmap_assessments
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists hospitation_unmet_needs_pre_gematik_touch_updated_at on public.hospitation_unmet_needs;
create trigger hospitation_unmet_needs_pre_gematik_touch_updated_at before update on public.hospitation_unmet_needs
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists expert_groups_pre_gematik_touch_updated_at on public.expert_groups;
create trigger expert_groups_pre_gematik_touch_updated_at before update on public.expert_groups
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists expert_organizations_pre_gematik_touch_updated_at on public.expert_organizations;
create trigger expert_organizations_pre_gematik_touch_updated_at before update on public.expert_organizations
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists expert_contacts_pre_gematik_touch_updated_at on public.expert_contacts;
create trigger expert_contacts_pre_gematik_touch_updated_at before update on public.expert_contacts
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists expert_entity_links_pre_gematik_touch_updated_at on public.expert_entity_links;
create trigger expert_entity_links_pre_gematik_touch_updated_at before update on public.expert_entity_links
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists stakeholder_types_pre_gematik_touch_updated_at on public.stakeholder_types;
create trigger stakeholder_types_pre_gematik_touch_updated_at before update on public.stakeholder_types
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists stakeholder_organizations_pre_gematik_touch_updated_at on public.stakeholder_organizations;
create trigger stakeholder_organizations_pre_gematik_touch_updated_at before update on public.stakeholder_organizations
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists stakeholder_people_pre_gematik_touch_updated_at on public.stakeholder_people;
create trigger stakeholder_people_pre_gematik_touch_updated_at before update on public.stakeholder_people
for each row execute function public.pre_gematik_touch_updated_at();

drop trigger if exists hospitation_observations_pre_gematik_log_change on public.hospitation_observations;
create trigger hospitation_observations_pre_gematik_log_change
after insert or update on public.hospitation_observations
for each row execute function public.pre_gematik_log_hospitation_observation_change();

comment on table public.profiles is
  'Befristetes Pre-Integrationsschema; kein freigegebenes gematik-Zielschema.';

commit;
