create extension if not exists pgcrypto;

create table if not exists profiles (
  id text primary key,
  email text not null,
  display_name text not null,
  initials text,
  role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  avatar_url text,
  team text,
  bio text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organizations (
  id text primary key,
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
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null
);

create table if not exists contacts (
  id text primary key,
  name text not null,
  organization_id text references organizations(id) on delete set null,
  organization text,
  sector text,
  specialty text,
  role text,
  priority text not null default 'Mittel' check (priority in ('Hoch', 'Mittel', 'Niedrig', 'Keine / Unbekannt')),
  owner_id text references profiles(id) on delete set null,
  postal_code text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  email text,
  phone text,
  linkedin text,
  topics text[] not null default '{}',
  notes text,
  next_step text,
  source text,
  image_url text,
  image_source_url text,
  image_source_label text,
  image_rights_note text,
  image_updated_at timestamptz,
  image_updated_by text references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null
);

create table if not exists changes (
  id bigint generated always as identity primary key,
  contact_id text not null references contacts(id) on delete cascade,
  action text not null check (action in ('create', 'update', 'archive', 'restore', 'owner_change', 'seed')),
  field_name text,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  changed_by text references profiles(id) on delete set null
);

alter table changes drop constraint if exists changes_action_check;
alter table changes
  add constraint changes_action_check
  check (action in ('create', 'update', 'archive', 'restore', 'owner_change', 'seed', 'image_update', 'image_remove', 'import'));

create table if not exists import_runs (
  id text primary key,
  file_name text,
  status text not null default 'completed' check (status in ('previewed', 'completed', 'failed')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  imported_contacts integer not null default 0,
  skipped_rows integer not null default 0,
  error_count integer not null default 0,
  warning_count integer not null default 0,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null
);

create table if not exists contact_owners (
  contact_id text not null references contacts(id) on delete cascade,
  profile_id text not null references profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by text references profiles(id) on delete set null,
  primary key (contact_id, profile_id)
);

create table if not exists saved_views (
  id text primary key default ('saved-view-' || gen_random_uuid()::text),
  owner_id text not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  scope text not null default 'private' check (scope in ('private', 'team')),
  view_type text not null default 'contacts',
  filters jsonb not null default '{}'::jsonb,
  search_query text not null default '',
  sort_key text not null default 'updated_at',
  sort_direction text not null default 'desc' check (sort_direction in ('asc', 'desc')),
  page_size integer not null default 20,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_settings (
  user_id text primary key references profiles(id) on delete cascade,
  default_view_id text references saved_views(id) on delete set null,
  default_view_type text not null default 'contacts',
  table_density text not null default 'comfortable',
  theme text not null default 'system',
  font_scale numeric not null default 1,
  page_size integer not null default 20,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists login_aliases (
  alias text primary key,
  email text not null,
  profile_id text not null references profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (alias = lower(trim(alias))),
  check (alias ~ '^[a-z0-9._-]{2,32}$')
);

create table if not exists notification_events (
  id text primary key,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  actor_id text references profiles(id) on delete set null,
  title text not null,
  body text,
  occurred_at timestamptz not null default now(),
  route text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notification_recipients (
  event_id text not null references notification_events(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists formats (
  id text primary key,
  title text not null,
  format_type text not null default 'Roundtable',
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  goal text,
  owner_id text references profiles(id) on delete set null,
  status text not null default 'Planung' check (status in ('Planung', 'Aktiv', 'Abgeschlossen', 'Archiviert')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null
);

create table if not exists format_participants (
  id text primary key,
  format_id text not null references formats(id) on delete cascade,
  contact_id text not null references contacts(id) on delete cascade,
  invitation_status text not null default 'Kandidat' check (invitation_status in ('Kandidat', 'Eingeladen', 'Zugesagt', 'Abgesagt', 'Keine Rückmeldung', 'Teilgenommen')),
  participant_role text,
  notes text,
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null,
  unique (format_id, contact_id)
);

create table if not exists hospitation_slots (
  id text primary key,
  contact_id text references contacts(id) on delete set null,
  contact_name text,
  organization_id text references organizations(id) on delete set null,
  organization_name text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  city text,
  federal_state text,
  sector text,
  capacity integer not null default 1 check (capacity >= 1),
  owner_id text references profiles(id) on delete set null,
  status text not null default 'Frei' check (status in ('Frei', 'Reserviert', 'Gebucht', 'Abgesagt', 'Archiviert')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null
);

create table if not exists hospitations (
  id text primary key,
  slot_id text references hospitation_slots(id) on delete set null,
  contact_id text references contacts(id) on delete set null,
  contact_name text,
  organization_id text references organizations(id) on delete set null,
  organization_name text,
  requester_profile_id text references profiles(id) on delete set null,
  owner_id text references profiles(id) on delete set null,
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
  follow_up_owner_id text references profiles(id) on delete set null,
  follow_up_due_at date,
  documented_at timestamptz,
  documented_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null
);

create table if not exists expert_groups (
  id text primary key,
  name text not null unique,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expert_organizations (
  id text primary key,
  name text not null,
  normalized_name text not null,
  group_id text references expert_groups(id) on delete set null,
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

create table if not exists expert_contacts (
  id text primary key,
  name text not null,
  organization_id text references expert_organizations(id) on delete set null,
  organization text,
  group_id text not null references expert_groups(id) on delete restrict,
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
  owner_id text references profiles(id) on delete set null,
  owner_ids text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expert_entity_links (
  id text primary key,
  link_type text not null check (link_type in ('contact', 'organization')),
  contact_id text references contacts(id) on delete cascade,
  expert_contact_id text references expert_contacts(id) on delete cascade,
  organization_id text references organizations(id) on delete cascade,
  expert_organization_id text references expert_organizations(id) on delete cascade,
  match_reason text,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null,
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

create table if not exists stakeholder_types (
  id text primary key,
  label text not null,
  description text,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stakeholder_organizations (
  id text primary key,
  stakeholder_type_id text not null references stakeholder_types(id) on delete restrict,
  name text not null,
  normalized_name text not null,
  organization_type text,
  postal_code text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  website text,
  phone text,
  email text,
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stakeholder_people (
  id text primary key,
  stakeholder_type_id text not null references stakeholder_types(id) on delete restrict,
  organization_id text references stakeholder_organizations(id) on delete set null,
  organization text,
  name text not null,
  role text,
  committee text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  map_position_source text,
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

-- Existing private demo databases may predate later Step 5/9 columns.
-- Keep this schema file idempotent for both fresh creates and in-place deploys.
alter table if exists profiles add column if not exists initials text;
alter table if exists profiles add column if not exists role text not null default 'editor';
alter table if exists profiles add column if not exists avatar_url text;
alter table if exists profiles add column if not exists team text;
alter table if exists profiles add column if not exists bio text;
alter table if exists profiles add column if not exists active boolean not null default true;
alter table if exists profiles add column if not exists created_at timestamptz not null default now();
alter table if exists profiles add column if not exists updated_at timestamptz not null default now();

alter table if exists organizations add column if not exists normalized_name text;
alter table if exists organizations add column if not exists sector text;
alter table if exists organizations add column if not exists organization_type text;
alter table if exists organizations add column if not exists postal_code text;
alter table if exists organizations add column if not exists city text;
alter table if exists organizations add column if not exists federal_state text;
alter table if exists organizations add column if not exists latitude double precision;
alter table if exists organizations add column if not exists longitude double precision;
alter table if exists organizations add column if not exists website text;
alter table if exists organizations add column if not exists phone text;
alter table if exists organizations add column if not exists email text;
alter table if exists organizations add column if not exists notes text;
alter table if exists organizations add column if not exists source text;
alter table if exists organizations add column if not exists status text not null default 'active';
alter table if exists organizations add column if not exists created_at timestamptz not null default now();
alter table if exists organizations add column if not exists created_by text references profiles(id) on delete set null;
alter table if exists organizations add column if not exists updated_at timestamptz not null default now();
alter table if exists organizations add column if not exists updated_by text references profiles(id) on delete set null;

alter table if exists contacts add column if not exists organization_id text references organizations(id) on delete set null;
alter table if exists contacts add column if not exists organization text;
alter table if exists contacts add column if not exists sector text;
alter table if exists contacts add column if not exists specialty text;
alter table if exists contacts add column if not exists role text;
alter table if exists contacts add column if not exists priority text not null default 'Mittel';
alter table if exists contacts add column if not exists owner_id text references profiles(id) on delete set null;
alter table if exists contacts add column if not exists postal_code text;
alter table if exists contacts add column if not exists city text;
alter table if exists contacts add column if not exists federal_state text;
alter table if exists contacts add column if not exists latitude double precision;
alter table if exists contacts add column if not exists longitude double precision;
alter table if exists contacts add column if not exists email text;
alter table if exists contacts add column if not exists phone text;
alter table if exists contacts add column if not exists linkedin text;
alter table if exists contacts add column if not exists topics text[] not null default '{}';
alter table if exists contacts add column if not exists notes text;
alter table if exists contacts add column if not exists next_step text;
alter table if exists contacts add column if not exists source text;
alter table if exists contacts add column if not exists image_url text;
alter table if exists contacts add column if not exists image_source_url text;
alter table if exists contacts add column if not exists image_source_label text;
alter table if exists contacts add column if not exists image_rights_note text;
alter table if exists contacts add column if not exists image_updated_at timestamptz;
alter table if exists contacts add column if not exists image_updated_by text references profiles(id) on delete set null;
alter table if exists contacts add column if not exists status text not null default 'active';
alter table if exists contacts add column if not exists created_at timestamptz not null default now();
alter table if exists contacts add column if not exists created_by text references profiles(id) on delete set null;
alter table if exists contacts add column if not exists updated_at timestamptz not null default now();
alter table if exists contacts add column if not exists updated_by text references profiles(id) on delete set null;

alter table if exists organizations add column if not exists logo_url text;
alter table if exists organizations add column if not exists logo_source_url text;
alter table if exists organizations add column if not exists logo_source_label text;
alter table if exists organizations add column if not exists member_count integer;
alter table if exists organizations add column if not exists member_count_source_url text;
alter table if exists organizations add column if not exists member_count_source_label text;
alter table if exists organizations add column if not exists member_count_updated_at timestamptz;
alter table if exists organizations add column if not exists member_count_scope text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'owner'
  ) then
    execute $migrate_owner$
      update contacts
      set owner_id = profiles.id
      from profiles
      where contacts.owner_id is null
        and lower(trim(contacts.owner)) = lower(trim(profiles.display_name))
    $migrate_owner$;
  end if;
end;
$$;

alter table if exists changes add column if not exists field_name text;
alter table if exists changes add column if not exists old_value text;
alter table if exists changes add column if not exists new_value text;
alter table if exists changes add column if not exists changed_at timestamptz not null default now();
alter table if exists changes add column if not exists changed_by text references profiles(id) on delete set null;

alter table if exists import_runs add column if not exists file_name text;
alter table if exists import_runs add column if not exists status text not null default 'completed';
alter table if exists import_runs add column if not exists total_rows integer not null default 0;
alter table if exists import_runs add column if not exists valid_rows integer not null default 0;
alter table if exists import_runs add column if not exists imported_contacts integer not null default 0;
alter table if exists import_runs add column if not exists skipped_rows integer not null default 0;
alter table if exists import_runs add column if not exists error_count integer not null default 0;
alter table if exists import_runs add column if not exists warning_count integer not null default 0;
alter table if exists import_runs add column if not exists report jsonb not null default '{}'::jsonb;
alter table if exists import_runs add column if not exists created_at timestamptz not null default now();
alter table if exists import_runs add column if not exists created_by text references profiles(id) on delete set null;

alter table if exists formats add column if not exists format_type text not null default 'Roundtable';
alter table if exists formats add column if not exists starts_at timestamptz;
alter table if exists formats add column if not exists ends_at timestamptz;
alter table if exists formats add column if not exists location text;
alter table if exists formats add column if not exists goal text;
alter table if exists formats add column if not exists owner_id text references profiles(id) on delete set null;
alter table if exists formats add column if not exists status text not null default 'Planung';
alter table if exists formats add column if not exists notes text;
alter table if exists formats add column if not exists created_at timestamptz not null default now();
alter table if exists formats add column if not exists created_by text references profiles(id) on delete set null;
alter table if exists formats add column if not exists updated_at timestamptz not null default now();
alter table if exists formats add column if not exists updated_by text references profiles(id) on delete set null;

alter table if exists format_participants add column if not exists invitation_status text not null default 'Kandidat';
alter table if exists format_participants add column if not exists participant_role text;
alter table if exists format_participants add column if not exists notes text;
alter table if exists format_participants add column if not exists created_at timestamptz not null default now();
alter table if exists format_participants add column if not exists created_by text references profiles(id) on delete set null;
alter table if exists format_participants add column if not exists updated_at timestamptz not null default now();
alter table if exists format_participants add column if not exists updated_by text references profiles(id) on delete set null;

alter table if exists expert_contacts add column if not exists owner_id text references profiles(id) on delete set null;
alter table if exists expert_contacts add column if not exists owner_ids text[] not null default '{}';
alter table if exists expert_organizations add column if not exists logo_url text;
alter table if exists expert_organizations add column if not exists logo_source_url text;
alter table if exists expert_organizations add column if not exists logo_source_label text;
alter table if exists expert_organizations add column if not exists member_count integer;
alter table if exists expert_organizations add column if not exists member_count_source_url text;
alter table if exists expert_organizations add column if not exists member_count_source_label text;
alter table if exists expert_organizations add column if not exists member_count_updated_at timestamptz;
alter table if exists expert_organizations add column if not exists member_count_scope text;
alter table if exists expert_entity_links add column if not exists created_by text references profiles(id) on delete set null;
alter table if exists expert_entity_links add column if not exists updated_at timestamptz not null default now();
alter table if exists expert_entity_links add column if not exists updated_by text references profiles(id) on delete set null;

alter table if exists stakeholder_organizations add column if not exists logo_url text;
alter table if exists stakeholder_organizations add column if not exists logo_source_url text;
alter table if exists stakeholder_organizations add column if not exists logo_source_label text;
alter table if exists stakeholder_organizations add column if not exists member_count integer;
alter table if exists stakeholder_organizations add column if not exists member_count_source_url text;
alter table if exists stakeholder_organizations add column if not exists member_count_source_label text;
alter table if exists stakeholder_organizations add column if not exists member_count_updated_at timestamptz;
alter table if exists stakeholder_organizations add column if not exists member_count_scope text;
alter table if exists stakeholder_people add column if not exists map_position_source text;
alter table if exists stakeholder_people add column if not exists is_representative_assembly_member boolean not null default false;

create index if not exists profiles_active_idx on profiles(active);
create index if not exists organizations_status_idx on organizations(status);
create index if not exists organizations_normalized_name_idx on organizations(normalized_name);
create index if not exists organizations_sector_idx on organizations(sector);
create index if not exists organizations_state_idx on organizations(federal_state);
create index if not exists contacts_status_idx on contacts(status);
create index if not exists contacts_owner_idx on contacts(owner_id);
create index if not exists contacts_organization_id_idx on contacts(organization_id);
create index if not exists contacts_state_idx on contacts(federal_state);
create index if not exists contacts_priority_idx on contacts(priority);
create index if not exists changes_contact_idx on changes(contact_id);
create index if not exists changes_changed_at_idx on changes(changed_at desc);
create index if not exists import_runs_created_at_idx on import_runs(created_at desc);
create index if not exists contact_owners_profile_idx on contact_owners(profile_id);
create index if not exists contact_owners_contact_idx on contact_owners(contact_id);
create index if not exists saved_views_owner_idx on saved_views(owner_id);
create index if not exists saved_views_scope_idx on saved_views(scope);
create index if not exists login_aliases_profile_idx on login_aliases(profile_id);
create index if not exists notification_events_occurred_idx on notification_events(occurred_at desc);
create index if not exists notification_events_entity_idx on notification_events(entity_type, entity_id);
create index if not exists notification_recipients_user_unread_idx on notification_recipients(user_id, read_at, dismissed_at, created_at desc);
create index if not exists formats_owner_idx on formats(owner_id);
create index if not exists formats_status_idx on formats(status);
create index if not exists formats_starts_at_idx on formats(starts_at);
create index if not exists format_participants_format_idx on format_participants(format_id);
create index if not exists format_participants_contact_idx on format_participants(contact_id);
create index if not exists format_participants_status_idx on format_participants(invitation_status);
create index if not exists hospitation_slots_contact_idx on hospitation_slots(contact_id);
create index if not exists hospitation_slots_organization_idx on hospitation_slots(organization_id);
create index if not exists hospitation_slots_owner_idx on hospitation_slots(owner_id);
create index if not exists hospitation_slots_status_idx on hospitation_slots(status);
create index if not exists hospitation_slots_starts_at_idx on hospitation_slots(starts_at);
create index if not exists hospitations_slot_idx on hospitations(slot_id);
create index if not exists hospitations_contact_idx on hospitations(contact_id);
create index if not exists hospitations_organization_idx on hospitations(organization_id);
create index if not exists hospitations_owner_idx on hospitations(owner_id);
create index if not exists hospitations_status_idx on hospitations(status);
create index if not exists hospitations_starts_at_idx on hospitations(starts_at);
create index if not exists hospitations_follow_up_due_idx on hospitations(follow_up_due_at);
create index if not exists expert_groups_status_idx on expert_groups(status);
create index if not exists expert_organizations_normalized_name_idx on expert_organizations(normalized_name);
create index if not exists expert_organizations_group_idx on expert_organizations(group_id);
create index if not exists expert_organizations_status_idx on expert_organizations(status);
create index if not exists expert_contacts_group_idx on expert_contacts(group_id);
create index if not exists expert_contacts_organization_idx on expert_contacts(organization_id);
create index if not exists expert_contacts_owner_idx on expert_contacts(owner_id);
create index if not exists expert_contacts_owner_ids_idx on expert_contacts using gin(owner_ids);
create index if not exists expert_contacts_status_idx on expert_contacts(status);
create unique index if not exists expert_entity_links_contact_unique
on expert_entity_links(contact_id, expert_contact_id)
where link_type = 'contact';
create unique index if not exists expert_entity_links_organization_unique
on expert_entity_links(organization_id, expert_organization_id)
where link_type = 'organization';
create index if not exists expert_entity_links_contact_idx on expert_entity_links(contact_id);
create index if not exists expert_entity_links_expert_contact_idx on expert_entity_links(expert_contact_id);
create index if not exists expert_entity_links_organization_idx on expert_entity_links(organization_id);
create index if not exists expert_entity_links_expert_organization_idx on expert_entity_links(expert_organization_id);
create index if not exists stakeholder_types_status_idx on stakeholder_types(status);
create index if not exists stakeholder_organizations_type_idx on stakeholder_organizations(stakeholder_type_id);
create index if not exists stakeholder_organizations_normalized_name_idx on stakeholder_organizations(normalized_name);
create index if not exists stakeholder_organizations_state_idx on stakeholder_organizations(federal_state);
create index if not exists stakeholder_organizations_status_idx on stakeholder_organizations(status);
create index if not exists stakeholder_people_type_idx on stakeholder_people(stakeholder_type_id);
create index if not exists stakeholder_people_organization_idx on stakeholder_people(organization_id);
create index if not exists stakeholder_people_representative_idx on stakeholder_people(is_representative_assembly_member);
create index if not exists stakeholder_people_status_idx on stakeholder_people(status);

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at
before update on profiles
for each row execute function touch_updated_at();

drop trigger if exists organizations_touch_updated_at on organizations;
create trigger organizations_touch_updated_at
before update on organizations
for each row execute function touch_updated_at();

drop trigger if exists contacts_touch_updated_at on contacts;
create trigger contacts_touch_updated_at
before update on contacts
for each row execute function touch_updated_at();

drop trigger if exists formats_touch_updated_at on formats;
create trigger formats_touch_updated_at
before update on formats
for each row execute function touch_updated_at();

drop trigger if exists format_participants_touch_updated_at on format_participants;
create trigger format_participants_touch_updated_at
before update on format_participants
for each row execute function touch_updated_at();

drop trigger if exists hospitation_slots_touch_updated_at on hospitation_slots;
create trigger hospitation_slots_touch_updated_at
before update on hospitation_slots
for each row execute function touch_updated_at();

drop trigger if exists hospitations_touch_updated_at on hospitations;
create trigger hospitations_touch_updated_at
before update on hospitations
for each row execute function touch_updated_at();

drop trigger if exists expert_groups_touch_updated_at on expert_groups;
create trigger expert_groups_touch_updated_at
before update on expert_groups
for each row execute function touch_updated_at();

drop trigger if exists expert_organizations_touch_updated_at on expert_organizations;
create trigger expert_organizations_touch_updated_at
before update on expert_organizations
for each row execute function touch_updated_at();

drop trigger if exists expert_contacts_touch_updated_at on expert_contacts;
create trigger expert_contacts_touch_updated_at
before update on expert_contacts
for each row execute function touch_updated_at();

drop trigger if exists expert_entity_links_touch_updated_at on expert_entity_links;
create trigger expert_entity_links_touch_updated_at
before update on expert_entity_links
for each row execute function touch_updated_at();

drop trigger if exists stakeholder_types_touch_updated_at on stakeholder_types;
create trigger stakeholder_types_touch_updated_at
before update on stakeholder_types
for each row execute function touch_updated_at();

drop trigger if exists stakeholder_organizations_touch_updated_at on stakeholder_organizations;
create trigger stakeholder_organizations_touch_updated_at
before update on stakeholder_organizations
for each row execute function touch_updated_at();

drop trigger if exists stakeholder_people_touch_updated_at on stakeholder_people;
create trigger stakeholder_people_touch_updated_at
before update on stakeholder_people
for each row execute function touch_updated_at();

drop trigger if exists saved_views_touch_updated_at on saved_views;
create trigger saved_views_touch_updated_at
before update on saved_views
for each row execute function touch_updated_at();

drop trigger if exists user_settings_touch_updated_at on user_settings;
create trigger user_settings_touch_updated_at
before update on user_settings
for each row execute function touch_updated_at();

drop trigger if exists login_aliases_touch_updated_at on login_aliases;
create trigger login_aliases_touch_updated_at
before update on login_aliases
for each row execute function touch_updated_at();
