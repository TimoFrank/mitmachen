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
  topics text[] not null default '{}',
  notes text,
  source text,
  image_url text,
  image_source_url text,
  image_source_label text,
  image_rights_note text,
  image_updated_at timestamptz,
  image_updated_by uuid references public.profiles(id),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

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
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (format_id, contact_id)
);

create table if not exists public.hospitation_slots (
  id uuid primary key default gen_random_uuid(),
  contact_id text references public.contacts(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
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
  organization_id uuid references public.organizations(id) on delete set null,
  requester_profile_id uuid references public.profiles(id),
  owner_id uuid references public.profiles(id),
  status text not null default 'Angefragt' check (status in ('Entwurf', 'Angefragt', 'Angeboten', 'Gebucht', 'Abgelehnt', 'Abgesagt', 'Durchgeführt', 'Dokumentiert', 'Archiviert')),
  requested_windows jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
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

create table if not exists public.changes (
  id bigint generated always as identity primary key,
  contact_id text not null references public.contacts(id) on delete cascade,
  action text not null check (action in ('create', 'update', 'archive', 'import')),
  field_name text,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.profiles(id)
);

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
create index if not exists stakeholder_organizations_state_idx on public.stakeholder_organizations(federal_state);
create index if not exists stakeholder_organizations_status_idx on public.stakeholder_organizations(status);
create index if not exists stakeholder_people_type_idx on public.stakeholder_people(stakeholder_type_id);
create index if not exists stakeholder_people_organization_idx on public.stakeholder_people(organization_id);
create index if not exists stakeholder_people_representative_idx on public.stakeholder_people(is_representative_assembly_member);
create index if not exists stakeholder_people_status_idx on public.stakeholder_people(status);
create index if not exists changes_contact_idx on public.changes(contact_id);
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
alter table public.formats enable row level security;
alter table public.format_participants enable row level security;
alter table public.hospitation_slots enable row level security;
alter table public.hospitations enable row level security;
alter table public.expert_groups enable row level security;
alter table public.expert_organizations enable row level security;
alter table public.expert_contacts enable row level security;
alter table public.expert_entity_links enable row level security;
alter table public.stakeholder_types enable row level security;
alter table public.stakeholder_organizations enable row level security;
alter table public.stakeholder_people enable row level security;
alter table public.changes enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.saved_views enable row level security;
alter table public.user_settings enable row level security;
alter table public.login_aliases enable row level security;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, initials, avatar_url, team, bio, updated_at) on public.profiles to authenticated;
grant select, insert, update on public.contacts to authenticated;
grant select, insert, update, delete on public.contact_owners to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.formats to authenticated;
grant select, insert, update, delete on public.format_participants to authenticated;
grant select, insert, update on public.hospitation_slots to authenticated;
grant select, insert, update on public.hospitations to authenticated;
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
grant select, insert, update, delete on public.formats to service_role;
grant select, insert, update, delete on public.format_participants to service_role;
grant select, insert, update, delete on public.hospitation_slots to service_role;
grant select, insert, update, delete on public.hospitations to service_role;
grant select, insert, update, delete on public.expert_groups to service_role;
grant select, insert, update, delete on public.expert_organizations to service_role;
grant select, insert, update, delete on public.expert_contacts to service_role;
grant select, insert, update, delete on public.expert_entity_links to service_role;
grant select, insert, update, delete on public.stakeholder_types to service_role;
grant select, insert, update, delete on public.stakeholder_organizations to service_role;
grant select, insert, update, delete on public.stakeholder_people to service_role;
grant select, insert, update, delete on public.changes to service_role;
grant select, insert, update, delete on public.notification_events to service_role;
grant select, insert, update, delete on public.notification_recipients to service_role;
grant select, insert, update, delete on public.saved_views to service_role;
grant select, insert, update, delete on public.user_settings to service_role;
grant select, insert, update, delete on public.login_aliases to service_role;
grant usage, select on sequence public.changes_id_seq to service_role;

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
  public.current_profile_role() in ('editor', 'admin')
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "format participants editor admin update" on public.format_participants;
create policy "format participants editor admin update"
on public.format_participants for update
to authenticated
using (public.current_profile_role() in ('editor', 'admin'))
with check (public.current_profile_role() in ('editor', 'admin'));

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

drop policy if exists "changes authenticated read" on public.changes;
create policy "changes authenticated read"
on public.changes for select
to authenticated
using (true);

drop policy if exists "changes editor admin insert" on public.changes;
create policy "changes editor admin insert"
on public.changes for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and changed_by = auth.uid()
);

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

insert into public.stakeholder_types (id, label, description, sort_order, status)
values
  (
    'kv',
    'Kassenärztliche Vereinigungen',
    'Regionale Kassenärztliche Vereinigungen als erster Stakeholder-Bereich.',
    10,
    'active'
  ),
  (
    'health-insurance',
    'Krankenkassen',
    'Gesetzliche und weitere Krankenkassen als Stakeholder-Bereich.',
    20,
    'active'
  ),
  (
    'patient-associations',
    'Patientenverbände',
    'Patientenorganisationen und Patientenvertretungen als Stakeholder-Bereich.',
    30,
    'active'
  ),
  (
    'hospital-associations',
    'Krankenhausgesellschaften',
    'Bundes- und Landeskrankenhausgesellschaften als Stakeholder-Bereich.',
    40,
    'active'
  ),
  (
    'physician-associations',
    'Ärztliche Berufsverbände',
    'Ärztliche Berufs- und Fachverbände als Stakeholder-Bereich.',
    50,
    'active'
  )
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

insert into public.stakeholder_organizations
  (id, stakeholder_type_id, name, normalized_name, organization_type, city, federal_state, latitude, longitude, website, source, status)
values
  ('kv-baden-wuerttemberg', 'kv', 'Kassenärztliche Vereinigung Baden-Württemberg', 'kassenärztliche vereinigung baden-württemberg', 'Kassenärztliche Vereinigung', 'Stuttgart', 'Baden-Württemberg', 48.7758, 9.1829, 'https://www.kvbawue.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-bayern', 'kv', 'Kassenärztliche Vereinigung Bayerns', 'kassenärztliche vereinigung bayerns', 'Kassenärztliche Vereinigung', 'München', 'Bayern', 48.1351, 11.5820, 'https://www.kvb.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-berlin', 'kv', 'Kassenärztliche Vereinigung Berlin', 'kassenärztliche vereinigung berlin', 'Kassenärztliche Vereinigung', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.kvberlin.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-brandenburg', 'kv', 'Kassenärztliche Vereinigung Brandenburg', 'kassenärztliche vereinigung brandenburg', 'Kassenärztliche Vereinigung', 'Potsdam', 'Brandenburg', 52.3906, 13.0645, 'https://www.kvbb.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-bremen', 'kv', 'Kassenärztliche Vereinigung Bremen', 'kassenärztliche vereinigung bremen', 'Kassenärztliche Vereinigung', 'Bremen', 'Bremen', 53.0793, 8.8017, 'https://www.kvhb.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-hamburg', 'kv', 'Kassenärztliche Vereinigung Hamburg', 'kassenärztliche vereinigung hamburg', 'Kassenärztliche Vereinigung', 'Hamburg', 'Hamburg', 53.5511, 9.9937, 'https://www.kvhh.net', 'Öffentliche KV-Baseline', 'active'),
  ('kv-hessen', 'kv', 'Kassenärztliche Vereinigung Hessen', 'kassenärztliche vereinigung hessen', 'Kassenärztliche Vereinigung', 'Frankfurt am Main', 'Hessen', 50.1109, 8.6821, 'https://www.kvhessen.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-mecklenburg-vorpommern', 'kv', 'Kassenärztliche Vereinigung Mecklenburg-Vorpommern', 'kassenärztliche vereinigung mecklenburg-vorpommern', 'Kassenärztliche Vereinigung', 'Schwerin', 'Mecklenburg-Vorpommern', 53.6355, 11.4012, 'https://www.kvmv.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-niedersachsen', 'kv', 'Kassenärztliche Vereinigung Niedersachsen', 'kassenärztliche vereinigung niedersachsen', 'Kassenärztliche Vereinigung', 'Hannover', 'Niedersachsen', 52.3759, 9.7320, 'https://www.kvn.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-nordrhein', 'kv', 'Kassenärztliche Vereinigung Nordrhein', 'kassenärztliche vereinigung nordrhein', 'Kassenärztliche Vereinigung', 'Düsseldorf', 'Nordrhein-Westfalen', 51.2277, 6.7735, 'https://www.kvno.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-rheinland-pfalz', 'kv', 'Kassenärztliche Vereinigung Rheinland-Pfalz', 'kassenärztliche vereinigung rheinland-pfalz', 'Kassenärztliche Vereinigung', 'Mainz', 'Rheinland-Pfalz', 49.9929, 8.2473, 'https://www.kv-rlp.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-saarland', 'kv', 'Kassenärztliche Vereinigung Saarland', 'kassenärztliche vereinigung saarland', 'Kassenärztliche Vereinigung', 'Saarbrücken', 'Saarland', 49.2402, 6.9969, 'https://www.kvsaarland.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-sachsen', 'kv', 'Kassenärztliche Vereinigung Sachsen', 'kassenärztliche vereinigung sachsen', 'Kassenärztliche Vereinigung', 'Dresden', 'Sachsen', 51.0504, 13.7373, 'https://www.kvs-sachsen.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-sachsen-anhalt', 'kv', 'Kassenärztliche Vereinigung Sachsen-Anhalt', 'kassenärztliche vereinigung sachsen-anhalt', 'Kassenärztliche Vereinigung', 'Magdeburg', 'Sachsen-Anhalt', 52.1205, 11.6276, 'https://www.kvsa.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-schleswig-holstein', 'kv', 'Kassenärztliche Vereinigung Schleswig-Holstein', 'kassenärztliche vereinigung schleswig-holstein', 'Kassenärztliche Vereinigung', 'Bad Segeberg', 'Schleswig-Holstein', 53.9355, 10.3099, 'https://www.kvsh.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-thueringen', 'kv', 'Kassenärztliche Vereinigung Thüringen', 'kassenärztliche vereinigung thüringen', 'Kassenärztliche Vereinigung', 'Weimar', 'Thüringen', 50.9795, 11.3235, 'https://www.kv-thueringen.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-westfalen-lippe', 'kv', 'Kassenärztliche Vereinigung Westfalen-Lippe', 'kassenärztliche vereinigung westfalen-lippe', 'Kassenärztliche Vereinigung', 'Dortmund', 'Nordrhein-Westfalen', 51.5136, 7.4653, 'https://www.kvwl.de', 'Öffentliche KV-Baseline', 'active')
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    city = excluded.city,
    federal_state = excluded.federal_state,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    website = excluded.website,
    source = excluded.source,
    status = excluded.status;

with patient_organizations (
  id,
  name,
  normalized_name,
  postal_code,
  city,
  federal_state,
  website,
  notes,
  source
) as (
  values
    (
      'patient-dbr',
      'Deutscher Behindertenrat (DBR)',
      'deutscher behindertenrat (dbr)',
      '12107',
      'Berlin',
      'Berlin',
      'https://www.deutscher-behindertenrat.de',
      'Anerkannte maßgebliche Patientenorganisation nach § 140f SGB V/Patientenbeteiligungsverordnung; berechtigt zur Benennung von Patientenvertreterinnen und Patientenvertretern im G-BA.',
      'G-BA Patientenvertretung; offizieller DBR-Kontakt'
    ),
    (
      'patient-bagp',
      'BundesArbeitsGemeinschaft der PatientInnenstellen (BAGP)',
      'bundesarbeitsgemeinschaft der patientinnenstellen (bagp)',
      '80339',
      'München',
      'Bayern',
      'https://bagp.de',
      'Anerkannte maßgebliche Patientenorganisation nach § 140f SGB V/Patientenbeteiligungsverordnung; berechtigt zur Benennung von Patientenvertreterinnen und Patientenvertretern im G-BA.',
      'G-BA Patientenvertretung; offizieller BAGP-Kontakt'
    ),
    (
      'patient-dag-shg',
      'Deutsche Arbeitsgemeinschaft Selbsthilfegruppen e.V. (DAG SHG)',
      'deutsche arbeitsgemeinschaft selbsthilfegruppen e.v. (dag shg)',
      '10585',
      'Berlin',
      'Berlin',
      'https://www.dag-shg.de',
      'Anerkannte maßgebliche Patientenorganisation nach § 140f SGB V/Patientenbeteiligungsverordnung; berechtigt zur Benennung von Patientenvertreterinnen und Patientenvertretern im G-BA.',
      'G-BA Patientenvertretung; offizieller DAG-SHG-Kontakt'
    ),
    (
      'patient-vzbv',
      'Verbraucherzentrale Bundesverband e.V. (vzbv)',
      'verbraucherzentrale bundesverband e.v. (vzbv)',
      '10969',
      'Berlin',
      'Berlin',
      'https://www.vzbv.de',
      'Anerkannte maßgebliche Patientenorganisation nach § 140f SGB V/Patientenbeteiligungsverordnung; berechtigt zur Benennung von Patientenvertreterinnen und Patientenvertretern im G-BA.',
      'G-BA Patientenvertretung; offizielles vzbv-Impressum'
    )
)
insert into public.stakeholder_organizations (
  id,
  stakeholder_type_id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  website,
  notes,
  source,
  status
)
select
  patient_organizations.id,
  'patient-associations',
  patient_organizations.name,
  patient_organizations.normalized_name,
  'Maßgebliche Patientenorganisation',
  patient_organizations.postal_code,
  patient_organizations.city,
  patient_organizations.federal_state,
  patient_organizations.website,
  patient_organizations.notes,
  patient_organizations.source,
  'active'
from patient_organizations
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    postal_code = excluded.postal_code,
    city = excluded.city,
    federal_state = excluded.federal_state,
    website = excluded.website,
    notes = excluded.notes,
    source = excluded.source,
    status = excluded.status;

with additional_patient_organizations (
  id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  website,
  notes,
  source
) as (
  values
    (
      'patient-bag-selbsthilfe',
      'Bundesarbeitsgemeinschaft Selbsthilfe von Menschen mit Behinderung, chronischer Erkrankung und ihren Angehörigen e.V. (BAG SELBSTHILFE)',
      'bundesarbeitsgemeinschaft selbsthilfe von menschen mit behinderung, chronischer erkrankung und ihren angehörigen e.v. (bag selbsthilfe)',
      'Selbsthilfe-Dachverband',
      '40215',
      'Düsseldorf',
      'Nordrhein-Westfalen',
      'https://www.bag-selbsthilfe.de',
      'Koordinierungsstelle der maßgeblichen Patientenorganisationen im G-BA und Dachverband der Selbsthilfe chronisch kranker und behinderter Menschen.',
      'BAG SELBSTHILFE; DBR-Mitgliederliste'
    ),
    (
      'patient-sovd',
      'Sozialverband Deutschland e.V. (SoVD)',
      'sozialverband deutschland e.v. (sovd)',
      'Sozialverband/Patientenvertretung',
      '10179',
      'Berlin',
      'Berlin',
      'https://www.sovd.de',
      'Entsendet Patientinnen und Patientenvertreter in den G-BA über den Deutschen Behindertenrat.',
      'SoVD Patientenvertretungsseite; DBR-Mitgliederliste'
    ),
    (
      'patient-vdk',
      'Sozialverband VdK Deutschland e.V.',
      'sozialverband vdk deutschland e.v.',
      'Sozialverband/Patientenvertretung',
      '53175',
      'Bonn',
      'Nordrhein-Westfalen',
      'https://www.vdk.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; BMAS-Liste anerkannter Verbände'
    ),
    (
      'patient-isl',
      'Interessenvertretung Selbstbestimmt Leben in Deutschland e.V. (ISL)',
      'interessenvertretung selbstbestimmt leben in deutschland e.v. (isl)',
      'Selbstvertretungsverband',
      '10117',
      'Berlin',
      'Berlin',
      'https://www.isl-ev.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; BMAS-Liste anerkannter Verbände'
    ),
    (
      'patient-abid',
      'Allgemeiner Behindertenverband in Deutschland e.V. (ABiD)',
      'allgemeiner behindertenverband in deutschland e.v. (abid)',
      'Selbstvertretungsverband',
      '10117',
      'Berlin',
      'Berlin',
      'https://www.abid-ev.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizieller ABiD-Kontakt'
    ),
    (
      'patient-lebenshilfe',
      'Bundesvereinigung Lebenshilfe e.V.',
      'bundesvereinigung lebenshilfe e.v.',
      'Selbsthilfe-/Behindertenverband',
      '35043',
      'Marburg',
      'Hessen',
      'https://www.lebenshilfe.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizielles Lebenshilfe-Impressum'
    ),
    (
      'patient-achse',
      'Allianz Chronischer Seltener Erkrankungen e.V. (ACHSE)',
      'allianz chronischer seltener erkrankungen e.v. (achse)',
      'Patienten-/Selbsthilfe-Dachverband',
      '13359',
      'Berlin',
      'Berlin',
      'https://www.achse-online.de',
      'Dachverband und Netzwerk für Menschen mit seltenen chronischen Erkrankungen und ihre Angehörigen.',
      'DBR-Mitgliederliste; offizieller ACHSE-Kontakt'
    ),
    (
      'patient-deutsche-alzheimer-gesellschaft',
      'Deutsche Alzheimer Gesellschaft e.V. Selbsthilfe Demenz',
      'deutsche alzheimer gesellschaft e.v. selbsthilfe demenz',
      'Krankheitsbezogene Selbsthilfevertretung',
      '10787',
      'Berlin',
      'Berlin',
      'https://www.deutsche-alzheimer.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'BMAS-Liste anerkannter Verbände; offizielles Impressum'
    ),
    (
      'patient-rheuma-liga',
      'Deutsche Rheuma-Liga Bundesverband e.V.',
      'deutsche rheuma-liga bundesverband e.v.',
      'Krankheitsbezogene Selbsthilfevertretung',
      '53111',
      'Bonn',
      'Nordrhein-Westfalen',
      'https://www.rheuma-liga.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'BMAS-Liste anerkannter Verbände; offizieller Kontakt'
    ),
    (
      'patient-dmsg',
      'Deutsche Multiple Sklerose Gesellschaft, Bundesverband e.V. (DMSG)',
      'deutsche multiple sklerose gesellschaft, bundesverband e.v. (dmsg)',
      'Krankheitsbezogene Selbsthilfevertretung',
      '30171',
      'Hannover',
      'Niedersachsen',
      'https://www.dmsg.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizielles DMSG-Impressum'
    ),
    (
      'patient-dccv',
      'Deutsche Morbus Crohn / Colitis ulcerosa Vereinigung - DCCV - e.V.',
      'deutsche morbus crohn / colitis ulcerosa vereinigung - dccv - e.v.',
      'Krankheitsbezogene Selbsthilfevertretung',
      '10179',
      'Berlin',
      'Berlin',
      'https://www.dccv.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizielles DCCV-Impressum'
    ),
    (
      'patient-pro-retina',
      'PRO RETINA Deutschland e.V.',
      'pro retina deutschland e.v.',
      'Krankheitsbezogene Selbsthilfevertretung',
      '53115',
      'Bonn',
      'Nordrhein-Westfalen',
      'https://www.pro-retina.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizieller PRO-RETINA-Kontakt'
    ),
    (
      'patient-upd',
      'Stiftung Unabhängige Patientenberatung Deutschland (UPD)',
      'stiftung unabhängige patientenberatung deutschland (upd)',
      'Unabhängige Patientenberatung',
      '12161',
      'Berlin',
      'Berlin',
      'https://patientenberatung.de',
      'Gemeinnützige Stiftung zur unabhängigen Beratung in gesundheitlichen und gesundheitsrechtlichen Fragen.',
      'Offizielles UPD-Impressum'
    ),
    (
      'patient-aps',
      'Aktionsbündnis Patientensicherheit e.V. (APS)',
      'aktionsbündnis patientensicherheit e.v. (aps)',
      'Patientensicherheitsnetzwerk',
      '10179',
      'Berlin',
      'Berlin',
      'https://www.aps-ev.de',
      'Bundesweit relevantes Netzwerk für Patientensicherheit mit patientenorientierten Informationen und Empfehlungen.',
      'Offizielles APS-Impressum'
    ),
    (
      'patient-bpik',
      'Bundesverband Patientenfürsprecher in Krankenhäusern e.V. (BPiK)',
      'bundesverband patientenfürsprecher in krankenhäusern e.v. (bpik)',
      'Patientenfürsprache',
      '45147',
      'Essen',
      'Nordrhein-Westfalen',
      'https://bpik.de',
      'Bundesverband der Patientenfürsprecherinnen und Patientenfürsprecher in Krankenhäusern.',
      'Offizielle BPiK-Website'
    )
)
insert into public.stakeholder_organizations (
  id,
  stakeholder_type_id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  website,
  notes,
  source,
  status
)
select
  additional_patient_organizations.id,
  'patient-associations',
  additional_patient_organizations.name,
  additional_patient_organizations.normalized_name,
  additional_patient_organizations.organization_type,
  additional_patient_organizations.postal_code,
  additional_patient_organizations.city,
  additional_patient_organizations.federal_state,
  additional_patient_organizations.website,
  additional_patient_organizations.notes,
  additional_patient_organizations.source,
  'active'
from additional_patient_organizations
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    postal_code = excluded.postal_code,
    city = excluded.city,
    federal_state = excluded.federal_state,
    website = excluded.website,
    notes = excluded.notes,
    source = excluded.source,
    status = excluded.status;

with physician_associations (
  id,
  name,
  organization_type,
  postal_code,
  city,
  federal_state,
  latitude,
  longitude,
  website,
  phone,
  email,
  member_count,
  member_count_source_url,
  member_count_source_label,
  member_count_updated_at,
  member_count_scope
) as (
  values
    ('physician-spifa', 'Spitzenverband Fachärztinnen und Fachärzte Deutschlands e.V. (SpiFa)', 'Fachärztlicher Dachverband', '10115', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://spifa.de', '+49 30 40009631', 'info@spifa.de', 36, 'https://www.lobbyregister.bundestag.de/suche/R001177', 'Deutscher Bundestag Lobbyregister R001177, Stand 18.05.2026', date '2026-05-18', 'Ordentliche und assoziierte Mitgliedsverbände; der SpiFa repräsentiert über seine Verbände mehr als 160.000 Fachärztinnen und Fachärzte.'),
    ('physician-gfb', 'Gemeinschaft fachärztlicher Berufsverbände e.V. (GFB)', 'Fachärztlicher Dachverband', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.gfb-facharztverband.de', null, 'info@gfb-facharztverband.de', 11, 'https://www.lobbyregister.bundestag.de/suche/R001535', 'Deutscher Bundestag Lobbyregister R001535, Stand 31.05.2024', date '2024-05-31', 'Mitgliedsverbände bzw. juristische Personen; Dachvertretung fachärztlicher Berufsverbände.'),
    ('physician-marburger-bund', 'Marburger Bund - Verband der angestellten und beamteten Ärztinnen und Ärzte Deutschlands e.V.', 'Ärzteverband und Gewerkschaft', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.marburger-bund.de', '+49 30 746846-0', 'info@marburger-bund.de', 146221, 'https://www.lobbyregister.bundestag.de/suche/R003043', 'Deutscher Bundestag Lobbyregister R003043, Stand 01.01.2025', date '2025-01-01', 'Natürliche und juristische Mitglieder; berufspolitische und gewerkschaftliche Vertretung angestellter und beamteter Ärztinnen und Ärzte.'),
    ('physician-hartmannbund', 'Hartmannbund - Verband der Ärztinnen und Ärzte Deutschlands e.V.', 'Ärztlicher Berufsverband', '10785', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.hartmannbund.de', '+49 30 206208-0', 'hb-info@hartmannbund.de', 70000, 'https://www.hartmannbund.de/der-verband/historie/', 'Offizielle Verbandsseite, abgerufen 13.06.2026', date '2026-06-13', 'Öffentliche Verbandsangabe: mehr als 70.000 Mitglieder.'),
    ('physician-hausaerzteverband', 'Hausärztinnen- und Hausärzteverband e.V.', 'Hausärztlicher Berufsverband', '51149', 'Köln', 'Nordrhein-Westfalen', 50.9375, 6.9603, 'https://www.haev.de', '+49 2203 5756-0', 'info@haev.de', 32000, 'https://www.haev.de', 'Offizielle Verbandsseite, abgerufen 13.06.2026', date '2026-06-13', 'Öffentliche Verbandsangabe: mehr als 32.000 Mitglieder in 18 Landesverbänden.'),
    ('physician-virchowbund', 'Virchowbund - Verband der niedergelassenen Ärztinnen und Ärzte Deutschlands e.V.', 'Berufsverband niedergelassener Ärztinnen und Ärzte', '10115', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.virchowbund.de', '+49 30 288774-0', 'info@virchowbund.de', 11346, 'https://www.lobbyregister.bundestag.de/suche/R001900', 'Deutscher Bundestag Lobbyregister R001900, Stand 31.12.2023', date '2023-12-31', 'Persönliche Mitglieder; der Verband vertritt fachübergreifend Interessen niedergelassener und ambulant tätiger Ärztinnen und Ärzte.'),
    ('physician-medi-geno', 'MEDI GENO Deutschland e.V.', 'Bundesweiter Ärzteverbund', '10115', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.medi-verbund.de/medi-geno-deutschland-e-v/', '+49 30 887086-36', 'info@medi-verbund.de', 10000, 'https://www.medi-verbund.de/medi-geno-deutschland-e-v/', 'Offizielle Verbandsseite, abgerufen 13.06.2026', date '2026-06-13', 'Vertretene Ärztinnen, Ärzte und Psychotherapeutinnen und -therapeuten über regionale Mitgliedsorganisationen.'),
    ('physician-bdi', 'Berufsverband Deutscher Internistinnen und Internisten e.V. (BDI)', 'Fachärztlicher Berufsverband', '65193', 'Wiesbaden', 'Hessen', 50.0782, 8.2398, 'https://www.bdi.de', '+49 611 18133-0', 'info@bdi.de', 18898, 'https://www.lobbyregister.bundestag.de/suche/R001265', 'Deutscher Bundestag Lobbyregister R001265, Stand 01.01.2025', date '2025-01-01', 'Natürliche Mitglieder.'),
    ('physician-bvkj', 'Berufsverband der Kinder- und Jugendärzt*innen e.V. (BVKJ)', 'Fachärztlicher Berufsverband', '51069', 'Köln', 'Nordrhein-Westfalen', 50.9375, 6.9603, 'https://www.bvkj.de', '+49 221 68909-0', 'info@bvkj.de', 11611, 'https://www.lobbyregister.bundestag.de/suche/R000638', 'Deutscher Bundestag Lobbyregister R000638, Stand 01.04.2025', date '2025-04-01', 'Natürliche und juristische Mitglieder.'),
    ('physician-bvf', 'Berufsverband der Frauenärztinnen und Frauenärzte e.V. (BVF)', 'Fachärztlicher Berufsverband', '80003', 'München', 'Bayern', 48.1351, 11.5820, 'https://www.bvf.de', '+49 89 244466-0', 'bvf@bvf.de', 14306, 'https://www.lobbyregister.bundestag.de/suche/R002554', 'Deutscher Bundestag Lobbyregister R002554, Stand 31.12.2025', date '2025-12-31', 'Natürliche Mitglieder.'),
    ('physician-bva', 'Berufsverband der Augenärztinnen und Augenärzte Deutschlands e.V. (BVA)', 'Fachärztlicher Berufsverband', '40474', 'Düsseldorf', 'Nordrhein-Westfalen', 51.2277, 6.7735, 'https://www.augeninfo.de', '+49 211 43037-00', 'bva@augeninfo.de', 8060, 'https://www.lobbyregister.bundestag.de/suche/R002512', 'Deutscher Bundestag Lobbyregister R002512, Stand 31.12.2025', date '2025-12-31', 'Natürliche Mitglieder.'),
    ('physician-bda', 'Berufsverband Deutscher Anästhesistinnen und Anästhesisten e.V. (BDA)', 'Fachärztlicher Berufsverband', '90411', 'Nürnberg', 'Bayern', 49.4521, 11.0767, 'https://www.bda.de', '+49 911 93378-0', 'bda@bda-ev.de', 20264, 'https://www.lobbyregister.bundestag.de/suche/R005552', 'Deutscher Bundestag Lobbyregister R005552, Stand 03.06.2025', date '2025-06-03', 'Natürliche Mitglieder.'),
    ('physician-bdc', 'Berufsverband der Deutschen Chirurgie e.V. (BDC)', 'Fachärztlicher Berufsverband', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bdc.de', '+49 30 28004-100', 'mail@bdc.de', 17062, 'https://www.lobbyregister.bundestag.de/suche/R002104', 'Deutscher Bundestag Lobbyregister R002104, Stand 01.11.2023', date '2023-11-01', 'Natürliche Mitglieder.'),
    ('physician-bdr', 'Berufsverband der Deutschen Radiologie e.V. (BDR)', 'Fachärztlicher Berufsverband', '81245', 'München', 'Bayern', 48.1351, 11.5820, 'https://www.radiologenverband.de', '+49 89 89623610', 'info@radiologenverband.de', 1508, 'https://www.lobbyregister.bundestag.de/suche/R000618', 'Deutscher Bundestag Lobbyregister R000618, Stand 01.06.2024', date '2024-06-01', 'Natürliche und juristische Mitglieder.'),
    ('physician-bvdd', 'Berufsverband der Deutschen Dermatologen e.V. (BVDD)', 'Fachärztlicher Berufsverband', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bvdd.de', '+49 30 585840512', null, 3872, 'https://www.lobbyregister.bundestag.de/suche/R004362', 'Deutscher Bundestag Lobbyregister R004362, Stand 31.12.2024', date '2024-12-31', 'Natürliche Mitglieder.'),
    ('physician-bvdu', 'Berufsverband der Deutschen Urologie e.V. (BvDU)', 'Fachärztlicher Berufsverband', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://urologie-gestalten.de', '+49 30 8872255-0', 'info@urologie-gestalten.de', 2237, 'https://www.lobbyregister.bundestag.de/suche/R000470', 'Deutscher Bundestag Lobbyregister R000470, Stand 31.12.2024', date '2024-12-31', 'Natürliche Mitglieder.'),
    ('physician-bvou', 'Berufsverband für Orthopädie und Unfallchirurgie e.V. (BVOU)', 'Fachärztlicher Berufsverband', '10623', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bvou.net', '+49 30 79744444', 'office@bvou.net', 7744, 'https://www.lobbyregister.bundestag.de/suche/R004602', 'Deutscher Bundestag Lobbyregister R004602, Stand 31.12.2025', date '2025-12-31', 'Natürliche Mitglieder.'),
    ('physician-bvhno', 'Deutscher Berufsverband der Hals-Nasen-Ohrenärzte e.V. (BVHNO)', 'Fachärztlicher Berufsverband', '24539', 'Neumünster', 'Schleswig-Holstein', 54.0729, 9.9840, 'https://www.hno-aerzte.de', '+49 4321 97250', 'bv@hno-aerzte.de', 4647, 'https://www.lobbyregister.bundestag.de/suche/R000412', 'Deutscher Bundestag Lobbyregister R000412, Stand 02.06.2026', date '2026-06-02', 'Natürliche Mitglieder.'),
    ('physician-bdl', 'Berufsverband Deutscher Laborärzte e.V. (BDL)', 'Fachärztlicher Berufsverband', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bdlev.de', '+49 30 88621911', 'buero-berlin@bdlev.de', 1200, 'https://www.bdlev.de/', 'Offizielle Verbandsseite, abgerufen 13.06.2026', date '2026-06-13', 'Öffentliche Verbandsangabe: rund 1.200 Fachärztinnen und Fachärzte für Laboratoriumsmedizin.'),
    ('physician-bvoegd', 'Bundesverband der Ärztinnen und Ärzte des öffentlichen Gesundheitsdienstes e.V. (BVÖGD)', 'Ärztlicher Fachverband Öffentlicher Gesundheitsdienst', '10719', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bvoegd.de', '+49 30 887273755', 'info@bvoegd.de', 15, 'https://www.lobbyregister.bundestag.de/suche/R004037', 'Deutscher Bundestag Lobbyregister R004037, Stand 01.01.2025', date '2025-01-01', 'Landesverbände als juristische Mitglieder.'),
    ('physician-daeb', 'Deutscher Ärztinnenbund e.V. (DÄB)', 'Ärztlicher Berufsverband und Netzwerk', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.aerztinnenbund.de', '+49 30 54708635', 'gsdaeb@aerztinnenbund.de', 2542, 'https://www.lobbyregister.bundestag.de/suche/R006369', 'Deutscher Bundestag Lobbyregister R006369, Stand 16.06.2025', date '2025-06-16', 'Natürliche und juristische Mitglieder; Netzwerk für Ärztinnen und Zahnärztinnen aller Fachrichtungen sowie Medizinstudentinnen.'),
    ('physician-alm', 'ALM - Akkreditierte Labore in der Medizin e.V.', 'Labormedizinischer Interessenverband', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.alm-ev.de', '+49 30 4036884000', 'kontakt@alm-ev.de', 200, 'https://www.lobbyregister.bundestag.de/suche/R001160', 'Deutscher Bundestag Lobbyregister R001160, abgerufen 14.06.2026', date '2026-06-14', 'Über 200 medizinische Labore; zugleich etwa 900 Fachärztinnen und Fachärzte in vertretenen Laborstrukturen.'),
    ('physician-bao', 'Bundesverband Ambulantes Operieren e.V. (BAO)', 'Fachübergreifender Berufsverband Ambulantes Operieren', '10557', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.operieren.de', '+49 30 31958413', 'buero@bao.berlin', null, 'https://www.operieren.de/e42177/', 'Offizielles BAO-Impressum, abgerufen 14.06.2026', null, 'SpiFa-Mitgliedsverband; Interessenvertretung ambulanter operativer Versorgung.'),
    ('physician-bdb', 'Bundesverband der Belegärzte und Belegkrankenhäuser e.V. (BdB)', 'Fachübergreifender Berufsverband Belegarztwesen', '10557', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bundesverband-belegaerzte.de', null, 'buero@bundesverband-belegaerzte.de', null, 'https://www.lobbyregister.bundestag.de/suche/R001659', 'Deutscher Bundestag Lobbyregister R001659, abgerufen 14.06.2026', null, 'Berufspolitische Vertretung des Belegarztwesens und der Belegkrankenhäuser.'),
    ('physician-bdnc', 'Berufsverband Deutsche Neurochirurgie e.V. (BDNC)', 'Fachärztlicher Berufsverband', null, null, null, null, null, 'https://bdnc.de/app/', null, null, null, 'https://spifa.de/verband/', 'SpiFa-Mitgliedsverbände, abgerufen 14.06.2026', null, 'Ordentlicher SpiFa-Mitgliedsverband für berufspolitische Belange der Neurochirurgie.'),
    ('physician-bdn-nuklearmedizin', 'Berufsverband Deutscher Nuklearmediziner e.V. (BDN)', 'Fachärztlicher Berufsverband', '45136', 'Essen', 'Nordrhein-Westfalen', 51.4556, 7.0116, 'https://www.berufsverband-nuklearmedizin.de', '+49 201 251297', 'herzogenrath@berufsverband-nuklearmedizin.de', 486, 'https://www.lobbyregister.bundestag.de/suche/R005526', 'Deutscher Bundestag Lobbyregister R005526, Stand 30.06.2025', date '2025-06-30', 'Natürliche und juristische Mitglieder des Berufsverbands Deutscher Nuklearmediziner.'),
    ('physician-bdnr', 'Berufsverband Deutscher Neuroradiologen e.V. (BDNR)', 'Fachärztlicher Berufsverband', '10587', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://bdnr.de', '+49 30 91607019', 'bdnr@drg.de', null, 'https://bdnr.de/impressum/', 'Offizielles BDNR-Impressum, abgerufen 14.06.2026', null, 'Ordentlicher SpiFa-Mitgliedsverband; vertritt Neuroradiologinnen und Neuroradiologen in Berufs-, Kammer- und Gesundheitspolitik.'),
    ('physician-bdp-pneumologie', 'Bundesverband der Pneumologie, Schlaf- und Beatmungsmedizin e.V. (BdP)', 'Fachärztlicher Berufsverband', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.pneumologenverband.de', '+49 30 700140445', null, null, 'https://www.lobbyregister.bundestag.de/suche/R000575', 'Deutscher Bundestag Lobbyregister R000575, abgerufen 14.06.2026', null, 'Berufsverband der Pneumologie, Schlaf- und Beatmungsmedizin; bundesweite Vertretung gegenüber Selbstverwaltung, Kassen und Politik.'),
    ('physician-bdpm', 'Bundesverband Psychosomatische Medizin und Ärztliche Psychotherapie e.V. (BDPM)', 'Fachärztlicher Berufsverband', '10999', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bdpm-online.de', '+49 30 37918464', 'info@bdpm-online.de', null, 'https://www.bdpm-online.de/', 'Offizielle BDPM-Website, abgerufen 14.06.2026', null, 'SpiFa-Mitgliedsverband für Psychosomatische Medizin und Ärztliche Psychotherapie.'),
    ('physician-bnc', 'Berufsverband Niedergelassener Chirurgen e.V. (BNC)', 'Fachärztlicher Berufsverband', '22941', 'Jersbek', 'Schleswig-Holstein', 53.7410, 10.2190, 'https://www.bncev.de', '+49 4532 2687560', 'info@bncev.de', 1500, 'https://spifa.de/verband/', 'SpiFa-Mitgliedsverbände, abgerufen 14.06.2026', date '2026-06-14', 'Rund 1.500 freiberufliche Chirurginnen und Chirurgen laut SpiFa-Mitgliedsprofil.'),
    ('physician-bnk', 'Bundesverband Niedergelassener Kardiologen e.V. (BNK)', 'Fachärztlicher Berufsverband', '80805', 'München', 'Bayern', 48.1351, 11.5820, 'https://www.bnk.de', '+49 89 32357740', 'info@bnk.de', 1200, 'https://www.bnk.de/', 'Offizielle BNK-Website, abgerufen 14.06.2026', date '2026-06-14', 'Über 1.200 niedergelassene Fachärztinnen und Fachärzte mit Schwerpunkt Kardiologie.'),
    ('physician-bng', 'Berufsverband Niedergelassener Gastroenterologen Deutschlands e.V. (bng)', 'Fachärztlicher Berufsverband', '89081', 'Ulm', 'Baden-Württemberg', 48.4011, 9.9876, 'https://bng-gastro.de', '+49 731 7042718', 'kontakt@bng-gastro.de', 1300, 'https://bng-gastro.de/', 'Offizielle bng-Website, abgerufen 14.06.2026', date '2026-06-14', 'Mehr als 1.300 organisierte Ärztinnen und Ärzte; mehr als 90 Prozent der niedergelassenen Gastroenterologen.'),
    ('physician-bngo', 'Berufsverband Niedergelassener und ambulant tätiger Gynäkologischer Onkologen in Deutschland e.V. (BNGO)', 'Fachärztlicher Berufsverband', '15366', 'Neuenhagen bei Berlin', 'Brandenburg', 52.5290, 13.6890, 'https://bngo.de', '+49 3342 4268970', 'info@bngo.de', 123, 'https://bngo.de/', 'Offizielle BNGO-Website, abgerufen 14.06.2026', date '2026-06-14', 'Hochspezialisierte niedergelassene und ambulant tätige gynäkologische Onkologinnen und Onkologen.'),
    ('physician-bnho', 'Berufsverband der Niedergelassenen Ärztinnen und Ärzte für Hämatologie und Medizinische Onkologie in Deutschland e.V. (BNHO)', 'Fachärztlicher Berufsverband', '50677', 'Köln', 'Nordrhein-Westfalen', 50.9375, 6.9603, 'https://bnho.de', null, null, 590, 'https://bnho.de/', 'Offizielle BNHO-Website, abgerufen 14.06.2026', date '2026-06-14', 'Niedergelassene Fachärztinnen und Fachärzte für Hämatologie und Medizinische Onkologie.'),
    ('physician-brz', 'Bundesverband Reproduktionsmedizinischer Zentren Deutschlands e.V. (BRZ)', 'Fachärztlicher Berufsverband/Reproduktionsmedizinische Zentren', '66123', 'Saarbrücken', 'Saarland', 49.2402, 6.9969, 'https://repromed.de', '+49 681 373551', 'horstkamp@repromed.de', null, 'https://www.lobbyregister.bundestag.de/suche/R003685', 'Deutscher Bundestag Lobbyregister R003685, abgerufen 14.06.2026', null, 'Ordentlicher SpiFa-Mitgliedsverband für reproduktionsmedizinische Zentren.'),
    ('physician-bvad', 'Berufsverband der AngiologInnen Deutschlands e.V. (BVAD)', 'Fachärztlicher Berufsverband', '10437', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://berufsverbandangiologie.de', '+49 176 34383585', 'info@berufsverbandangiologie.de', null, 'https://www.lobbyregister.bundestag.de/suche/R005533', 'Deutscher Bundestag Lobbyregister R005533, abgerufen 14.06.2026', null, 'Berufs- und gesundheitspolitische Vertretung angiologisch tätiger Ärztinnen und Ärzte.'),
    ('physician-bvdh', 'Berufsverband Deutscher Humangenetiker e.V. (BVDH)', 'Fachärztlicher Berufsverband', '10115', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bvdh.de', '+49 30 55954411', 'info@bvdh.de', null, 'https://www.bvdh.de/', 'Offizielle BVDH-Website, abgerufen 14.06.2026', null, 'Vertretung von Fachärztinnen und Fachärzten für Humangenetik, Fachhumangenetikerinnen und Fachhumangenetikern sowie genetischen Laborstrukturen.'),
    ('physician-bvnd', 'Bundesverband Niedergelassener Diabetologen e.V. (BVND)', 'Fachärztlicher Berufsverband', '89522', 'Heidenheim an der Brenz', 'Baden-Württemberg', 48.6768, 10.1510, 'https://www.bvnd.de', '+49 7321 9469190', 'mail@bvnd.de', null, 'https://www.lobbyregister.bundestag.de/suche/R000516', 'Deutscher Bundestag Lobbyregister R000516, abgerufen 14.06.2026', null, 'Bundesweite berufspolitische Interessenvertretung niedergelassener Diabetologinnen und Diabetologen.'),
    ('physician-bvprm', 'Berufsverband für Physikalische und Rehabilitative Medizin e.V. (BVPRM)', 'Fachärztlicher Berufsverband', '04357', 'Leipzig', 'Sachsen', 51.3397, 12.3731, 'https://www.bvprm.de', '+49 341 60051350', null, null, 'https://www.lobbyregister.bundestag.de/suche/R006811', 'Deutscher Bundestag Lobbyregister R006811, abgerufen 14.06.2026', null, 'Bundesweite berufspolitische Interessenvertretung der Physikalischen und Rehabilitativen Medizin.'),
    ('physician-dbvpp', 'Deutscher Berufsverband der Fachärzte für Phoniatrie und Pädaudiologie e.V. (DBVPP)', 'Fachärztlicher Berufsverband', null, null, null, null, null, 'https://www.dbvpp.de', null, null, null, 'https://spifa.de/verband/', 'SpiFa-Mitgliedsverbände, abgerufen 14.06.2026', null, 'Ordentlicher SpiFa-Mitgliedsverband für Phoniatrie und Pädaudiologie.'),
    ('physician-dfv', 'Deutscher Facharztverband e.V. (DFV)', 'Fachärztlicher Berufsverband', '89129', 'Langenau', 'Baden-Württemberg', 48.4964, 10.1180, 'https://www.deutscher-facharztverband.de', '+49 7345 9336785', null, null, 'https://www.lobbyregister.bundestag.de/suche/R002987', 'Deutscher Bundestag Lobbyregister R002987, abgerufen 14.06.2026', null, 'Unabhängige berufspolitische Vertretung niedergelassener Fachärztinnen und Fachärzte.'),
    ('physician-dgmkg', 'Deutsche Gesellschaft für Mund-, Kiefer- und Gesichtschirurgie e.V. (DGMKG)', 'Berufsverband und Fachgesellschaft', '65719', 'Hofheim', 'Hessen', 50.0906, 8.4497, 'https://www.dgmkg.com', '+49 6192 206303', 'info@dgmkg.de', 1900, 'https://spifa.de/verband/', 'SpiFa-Mitgliedsverbände, abgerufen 14.06.2026', date '2026-06-14', 'Gesamtverband aller Fachärztinnen und Fachärzte für Mund-, Kiefer- und Gesichtschirurgie in Deutschland.'),
    ('physician-dgpraec', 'Deutsche Gesellschaft für Plastische, Rekonstruktive und Ästhetische Chirurgie e.V. (DGPRÄC)', 'Berufsverband und Fachgesellschaft', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.dgpraec.de', '+49 30 44017611', 'info@dgpraec.de', 2000, 'https://www.dgpraec.de/', 'Offizielle DGPRÄC-Website, abgerufen 14.06.2026', date '2026-06-14', 'Über 2.000 Mitglieder; Berufsverband und wissenschaftliche Fachgesellschaft der Plastischen Chirurgie.'),
    ('physician-dn', 'Berufsverband der Nephrologinnen und Nephrologen in Deutschland e.V. (DN)', 'Fachärztlicher Berufsverband', '40210', 'Düsseldorf', 'Nordrhein-Westfalen', 51.2277, 6.7735, 'https://www.dnev.de', '+49 211 1795790', 'info@dnev.de', 737, 'https://www.lobbyregister.bundestag.de/suche/R000362', 'Deutscher Bundestag Lobbyregister R000362, Stand 01.12.2025', date '2025-12-01', 'Natürliche Mitglieder; berufspolitische Vertretung der nephrologischen Versorgung.'),
    ('physician-vdro', 'Verband der in Deutschland niedergelassenen Radioonkologen e.V. (VDRO)', 'Fachärztlicher Berufsverband', null, null, null, null, null, 'https://vdro.de', null, null, null, 'https://www.lobbyregister.bundestag.de/suche/R007040', 'Deutscher Bundestag Lobbyregister R007040, abgerufen 14.06.2026', null, 'Neu aufgenommener SpiFa-Mitgliedsverband für niedergelassene Radioonkologinnen und Radioonkologen.'),
    ('physician-bdh', 'Berufsverband Deutscher Hygieniker e.V. (BDH)', 'Fachärztlicher Berufsverband', '69129', 'Heidelberg', 'Baden-Württemberg', 49.3988, 8.6724, 'https://www.hygiene-bv.de', '+49 6221 3432381', 'info@hygiene-bv.de', null, 'https://www.gfb-facharztverband.de/de/gfb/mitglieder/bdh.html', 'GFB-Mitgliedsverband, abgerufen 14.06.2026', null, 'GFB-Mitgliedsverband für Fachärztinnen und Fachärzte für Hygiene und Umweltmedizin.'),
    ('physician-bdp-pathologie', 'Berufsverband Deutscher Pathologinnen und Pathologen e.V. (BDP)', 'Fachärztlicher Berufsverband', '10115', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.pathologie.de', '+49 30 30881970', 'bv@pathologie.de', null, 'https://www.lobbyregister.bundestag.de/suche/R002120', 'Deutscher Bundestag Lobbyregister R002120, abgerufen 14.06.2026', null, 'Berufsständische Vertretung der Pathologie und Neuropathologie in Praxis, Krankenhaus und Universität.'),
    ('physician-bdrm', 'Berufsverband Deutscher Rechtsmediziner e.V. (BDRM)', 'Fachärztlicher Berufsverband', '55131', 'Mainz', 'Rheinland-Pfalz', 49.9929, 8.2473, 'https://bvd-rechtsmedizin.com', '+49 6131 179487', null, null, 'https://www.gfb-facharztverband.de/de/gfb/mitglieder/bdrm.html', 'GFB-Mitgliedsverband, abgerufen 14.06.2026', null, 'GFB-Mitgliedsverband für Rechtsmedizin.'),
    ('physician-bdn-neurologen', 'Berufsverband Deutscher Neurologen e.V. (BDN)', 'Fachärztlicher Berufsverband', '12165', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.berufsverband-neurologen.de', '+49 30 94878310', 'info@berufsverband-neurologen.de', null, 'https://www.gfb-facharztverband.de/de/gfb/mitglieder/bdn.html', 'GFB-Mitgliedsverband, abgerufen 14.06.2026', null, 'Zentrale Interessenvertretung für Fachärztinnen und Fachärzte der Neurologie in Deutschland.'),
    ('physician-bvdn', 'Berufsverband Deutscher Nervenärzte e.V. (BVDN)', 'Fachärztlicher Berufsverband', '12165', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.berufsverband-nervenaerzte.de', '+49 30 94878310', 'info@bvdn.de', null, 'https://www.gfb-facharztverband.de/de/gfb/mitglieder/bvdn.html', 'GFB-Mitgliedsverband, abgerufen 14.06.2026', null, 'GFB-Mitgliedsverband; bundesweite Interessenvertretung der Nervenärztinnen und Nervenärzte.'),
    ('physician-bvdp', 'Berufsverband Deutscher Fachärztinnen und Fachärzte für Psychiatrie und Psychotherapie e.V. (BVDP)', 'Fachärztlicher Berufsverband', '12165', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.berufsverband-psychiater.de', '+49 30 94878310', 'info@berufsverband-psychiater.de', null, 'https://www.gfb-facharztverband.de/de/gfb/mitglieder/bvdp.html', 'GFB-Mitgliedsverband, abgerufen 14.06.2026', null, 'GFB-Mitgliedsverband für Psychiatrie und Psychotherapie.'),
    ('physician-bkjpp', 'Berufsverband für Kinder- und Jugendpsychiatrie, Psychosomatik und Psychotherapie in Deutschland e.V. (BKJPP)', 'Fachärztlicher Berufsverband', '55116', 'Mainz', 'Rheinland-Pfalz', 49.9929, 8.2473, 'https://www.bkjpp.de', '+49 6131 6938070', null, null, 'https://www.lobbyregister.bundestag.de/suche/R007652', 'Deutscher Bundestag Lobbyregister R007652, abgerufen 14.06.2026', null, 'Berufsverband für Kinder- und Jugendpsychiatrie, Psychosomatik und Psychotherapie.'),
    ('physician-aeda', 'Ärzteverband Deutscher Allergologen e.V. (AeDA)', 'Ärztlicher Berufsverband', '65205', 'Wiesbaden', 'Hessen', 50.0782, 8.2398, 'https://aeda.de', '+49 611 95008000', 'info@aeda.de', null, 'https://www.gfb-facharztverband.de/de/gfb/mitglieder/aeda.html', 'GFB-Mitgliedsverband, abgerufen 14.06.2026', null, 'Berufsverband angewandt allergologisch tätiger Ärztinnen und Ärzte.'),
    ('physician-bdrh', 'Berufsverband Deutscher Rheumatologen e.V. (BDRh)', 'Fachärztlicher Berufsverband', '82031', 'Grünwald', 'Bayern', 48.0399, 11.5232, 'https://www.bdrh.de', '+49 89 904141413', 'kontakt@bdrh.de', null, 'https://www.lobbyregister.bundestag.de/suche/R000342', 'Deutscher Bundestag Lobbyregister R000342, abgerufen 14.06.2026', null, 'Berufspolitische Vertretung rheumatologisch tätiger Ärztinnen und Ärzte.'),
    ('physician-vlk', 'Verband leitender Krankenhausärztinnen und -ärzte e.V. (VLK)', 'Ärztlicher Berufsverband Krankenhausleitung', '40474', 'Düsseldorf', 'Nordrhein-Westfalen', 51.2277, 6.7735, 'https://vlk-online.de', '+49 211 454990', 'info@vlk-online.de', null, 'https://www.lobbyregister.bundestag.de/suche/R001393', 'Deutscher Bundestag Lobbyregister R001393, abgerufen 14.06.2026', null, 'Bundesweite Interessenvertretung leitender Krankenhausärztinnen und Krankenhausärzte mit 16 Landesverbänden.'),
    ('physician-bvsd', 'Berufsverband der Ärzte und Psychologischen Psychotherapeuten in der Schmerz- und Palliativmedizin in Deutschland e.V. (BVSD)', 'Ärztlicher Berufsverband Schmerz- und Palliativmedizin', '10711', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bvsd.de', '+49 30 28867260', 'bgst@bvsd.de', 600, 'https://www.bvsd.de/', 'Offizielle BVSD-Website, abgerufen 14.06.2026', date '2026-06-14', 'Rund 600 Mitglieder in der Schmerz- und Palliativmedizin; ärztlich-psychotherapeutischer Berufsverband.'),
    ('physician-freie-aerzteschaft', 'Freie Ärzteschaft e.V. (FÄ)', 'Ärztlicher Berufsverband', null, 'Essen', 'Nordrhein-Westfalen', 51.4556, 7.0116, 'https://freie-aerzteschaft.de', null, null, null, 'https://freie-aerzteschaft.de/', 'Offizielle Verbandsseite, abgerufen 14.06.2026', null, 'Fachübergreifender ärztlicher Berufsverband mit Schwerpunkt freie ärztliche Berufsausübung und ambulante Versorgung.'),
    ('physician-ada', 'AdA - Bundesverband der Arzt-, Praxis- und Gesundheitsnetze e.V.', 'Dachverband ärztlicher Praxis- und Gesundheitsnetze', '10117', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.arztnetze.info', '+49 30 403656700', null, 400, 'https://www.lobbyregister.bundestag.de/suche/R004210', 'Deutscher Bundestag Lobbyregister R004210, abgerufen 14.06.2026', date '2026-06-14', 'Rund 400 Arztnetze und Gesundheitsverbünde werden als bundesweite Netzwerkstruktur adressiert.')
)
insert into public.stakeholder_organizations (
  id,
  stakeholder_type_id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  latitude,
  longitude,
  website,
  phone,
  email,
  member_count,
  member_count_source_url,
  member_count_source_label,
  member_count_updated_at,
  member_count_scope,
  notes,
  source,
  status
)
select
  id,
  'physician-associations',
  name,
  lower(name),
  organization_type,
  postal_code,
  city,
  federal_state,
  latitude,
  longitude,
  website,
  phone,
  email,
  member_count,
  member_count_source_url,
  member_count_source_label,
  member_count_updated_at,
  member_count_scope,
  'Bundesweit relevante ärztliche Berufs-, Fach- oder Dachorganisation; Erweiterung nach SpiFa-/GFB-Mitgliedschaft, Lobbyregister-Relevanz, Versorgungspolitik und bundesweiter Kontaktierbarkeit.',
  'Recherche ärztliche Berufsverbände, Stand 14.06.2026',
  'active'
from physician_associations
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    postal_code = excluded.postal_code,
    city = excluded.city,
    federal_state = excluded.federal_state,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    website = excluded.website,
    phone = excluded.phone,
    email = excluded.email,
    member_count = excluded.member_count,
    member_count_source_url = excluded.member_count_source_url,
    member_count_source_label = excluded.member_count_source_label,
    member_count_updated_at = excluded.member_count_updated_at,
    member_count_scope = excluded.member_count_scope,
    notes = excluded.notes,
    source = excluded.source,
    status = excluded.status;

with physician_association_logo_metadata (id, logo_url, logo_source_url) as (
  values
    ('physician-spifa', 'public/stakeholder-logos/physician-associations/physician-spifa.png', 'https://spifa.de/wp-content/uploads/2021/07/SpiFa_Logo_2024_weiss.png'),
    ('physician-gfb', 'public/stakeholder-logos/physician-associations/physician-gfb.png', 'https://www.gfb-facharztverband.de/images/logo.png'),
    ('physician-marburger-bund', 'public/stakeholder-logos/physician-associations/physician-marburger-bund.svg', 'https://www.marburger-bund.de/themes/custom/mb/img/logo.svg'),
    ('physician-hartmannbund', 'public/stakeholder-logos/physician-associations/physician-hartmannbund.svg', 'https://www.hartmannbund.de/wp-content/uploads/2020/10/logocrop.svg'),
    ('physician-hausaerzteverband', 'public/stakeholder-logos/physician-associations/physician-hausaerzteverband.png', 'https://www.haev.de/typo3conf/ext/dhv_sitepackage/Resources/Public/Images/HAEV_Logo_Dachverband_rgb.png'),
    ('physician-virchowbund', 'public/stakeholder-logos/physician-associations/physician-virchowbund.svg', 'https://www.virchowbund.de/_assets/12ecccfe9186b84b10b2cda53d4b5e65/Icons/logo-virchowbund.svg'),
    ('physician-medi-geno', 'public/stakeholder-logos/physician-associations/physician-medi-geno.png', 'https://www.medi-verbund.de/wp-content/uploads/2020/11/logo@2x.png'),
    ('physician-bdi', 'public/stakeholder-logos/physician-associations/physician-bdi.svg', 'https://www.bdi.de/fileadmin/templates/gfx/bdi_logo.svg'),
    ('physician-bvkj', 'public/stakeholder-logos/physician-associations/physician-bvkj.svg', 'https://www.bvkj.de/fileadmin/templates/gfx/bvkj-logo.svg'),
    ('physician-bvf', 'public/stakeholder-logos/physician-associations/physician-bvf.svg', 'https://www.bvf.de/fileadmin/templates/gfx/BVF-Logo.svg'),
    ('physician-bva', 'public/stakeholder-logos/physician-associations/physician-bva.gif', 'https://www.augeninfo.de/bilder/bva_logo.gif'),
    ('physician-bda', 'public/stakeholder-logos/physician-associations/physician-bda.png', 'https://www.bda.de/images/BDA-Logo-150.png'),
    ('physician-bdc', 'public/stakeholder-logos/physician-associations/physician-bdc.webp', 'https://www.bdc.de/wp-content/themes/bdc/images/logo.png'),
    ('physician-bdr', 'public/stakeholder-logos/physician-associations/physician-bdr.png', 'https://www.radiologenverband.de/theme/site/logo.png'),
    ('physician-bvdd', 'public/stakeholder-logos/physician-associations/physician-bvdd.png', 'https://hilfe.bvdd.de/corporate-design/logo/'),
    ('physician-bvdu', 'public/stakeholder-logos/physician-associations/physician-bvdu.svg', 'https://urologie-gestalten.de/wp-content/uploads/2026/05/BvDU-Logo.svg'),
    ('physician-bvou', 'public/stakeholder-logos/physician-associations/physician-bvou.png', 'https://d38i6es1q63hoz.cloudfront.net/wp-content/themes/bvou/images/bvou-logo-desk-neu.png'),
    ('physician-bvhno', 'public/stakeholder-logos/physician-associations/physician-bvhno.svg', 'https://www.hno-aerzte.de/fileadmin/Bilder/CD-Elemente/HNO-Logo-white-on-orange.svg'),
    ('physician-bdl', 'public/stakeholder-logos/physician-associations/physician-bdl.png', 'https://layout.verwaltungsportal.de/10905/img/logo.png'),
    ('physician-bvoegd', 'public/stakeholder-logos/physician-associations/physician-bvoegd.svg', 'https://www.bvoegd.de/wp-content/themes/bvoegd/img/BVOEGD_Logo_1.svg'),
    ('physician-daeb', 'public/stakeholder-logos/physician-associations/physician-daeb.png', 'https://www.aerztinnenbund.de/pics/9/967.png'),
    ('physician-alm', 'public/stakeholder-logos/physician-associations/physician-alm.svg', 'https://www.alm-ev.de/wp-content/uploads/Media/ALM-Logos/alm-logo.svg'),
    ('physician-bao', 'public/stakeholder-logos/physician-associations/physician-bao.svg', 'https://www.operieren.de/common/img/Logo_BAO_n.svg'),
    ('physician-bdb', 'public/stakeholder-logos/physician-associations/physician-bdb.jpg', 'https://www.bundesverband-belegaerzte.de/fileadmin/vorlagen/bdb/logo-belegaerzte.jpg'),
    ('physician-bdnc', 'public/stakeholder-logos/physician-associations/physician-bdnc.png', 'https://commons.wikimedia.org/wiki/File:Bdnclogo.png'),
    ('physician-bdn-nuklearmedizin', 'public/stakeholder-logos/physician-associations/physician-bdn-nuklearmedizin.svg', 'https://www.berufsverband-nuklearmedizin.de/_assets/45db20552cef078ea65b34e606e1b5d6/Frontend/Images/bdn-logo.svg'),
    ('physician-bdnr', 'public/stakeholder-logos/physician-associations/physician-bdnr.svg', 'https://bdnr.de/themes/bdnr20/images/bdnr-logo-neu.svg'),
    ('physician-bdp-pneumologie', 'public/stakeholder-logos/physician-associations/physician-bdp-pneumologie.svg', 'https://www.pneumologenverband.de/build/img/bundesverband-pneumologie-schlaf-und-beatmungsmedizin-logo.6734c23e.svg'),
    ('physician-bdpm', 'public/stakeholder-logos/physician-associations/physician-bdpm.png', 'https://assets.coco-online.de/100601764588773_1lzRbZKb/logo-189-1658401122.png'),
    ('physician-bnc', 'public/stakeholder-logos/physician-associations/physician-bnc.svg', 'https://www.bncev.de/wp-content/themes/berufsverband-chirurgen-jersbek/src/img/logo-dark.svg'),
    ('physician-bnk', 'public/stakeholder-logos/physician-associations/physician-bnk.png', 'https://www.bnk.de/assets/images/0/bnk-ev_logo_2023-wmn8ee1k9yfm45c.png'),
    ('physician-bng', 'public/stakeholder-logos/physician-associations/physician-bng.png', 'https://bng-gastro.de/wp-content/uploads/2023/01/BNG-Logo-600.png'),
    ('physician-bngo', 'public/stakeholder-logos/physician-associations/physician-bngo.png', 'https://bngo.de/files/2021/11/Logo-BNGO-web.png'),
    ('physician-bnho', 'public/stakeholder-logos/physician-associations/physician-bnho.svg', 'https://bnho.de/wp-content/themes/bnho-fluxo-io/img/logos/logo-bnho-small.svg'),
    ('physician-brz', 'public/stakeholder-logos/physician-associations/physician-brz.png', 'https://repromed.org/wp-content/uploads/2017/05/cropped-logo.png'),
    ('physician-bvad', 'public/stakeholder-logos/physician-associations/physician-bvad.png', 'https://berufsverbandangiologie.de/wp-content/uploads/2020/07/LOGO_BVAD_01-1.png'),
    ('physician-bvdh', 'public/stakeholder-logos/physician-associations/physician-bvdh.png', 'https://www.bvdh.de/files/_theme_bvdh/img/BVDH/BVDH_LOGO_Web.png'),
    ('physician-bvnd', 'public/stakeholder-logos/physician-associations/physician-bvnd.png', 'https://www.bvnd.de/fileadmin/vorlagen/bvnd87/logo-bvnd.png'),
    ('physician-bvprm', 'public/stakeholder-logos/physician-associations/physician-bvprm.jpg', 'https://image.jimcdn.com/app/cms/image/transf/none/path/sc0e03c62217ca902/image/i5842f3a2b3800fd2/version/1641114701/image.jpg'),
    ('physician-dbvpp', 'public/stakeholder-logos/physician-associations/physician-dbvpp.jpg', 'https://www.dbvpp.de/logotxt.jpg'),
    ('physician-dfv', 'public/stakeholder-logos/physician-associations/physician-dfv.png', 'https://deutscher-facharztverband.de/wp-content/uploads/2022/09/cropped-cropped-logo-dfv.png'),
    ('physician-dgmkg', 'public/stakeholder-logos/physician-associations/physician-dgmkg.png', 'https://dgmkg.de/wp-content/uploads/2021/08/Logo_DGMKG_210x120.png'),
    ('physician-dgpraec', 'public/stakeholder-logos/physician-associations/physician-dgpraec.png', 'https://www.dgpraec.de/wp-content/uploads/2023/03/DGPRAeC_LOGO_128px_freigestellt.png'),
    ('physician-dn', 'public/stakeholder-logos/physician-associations/physician-dn.svg', 'https://www.dnev.de/site/templates/assets/img/core/dnev-signet-full-white.svg'),
    ('physician-vdro', 'public/stakeholder-logos/physician-associations/physician-vdro.svg', 'https://vdro.de/wp-content/uploads/sites/12/2024/01/vdro_logo_farbe_rgb.svg'),
    ('physician-bdh', 'public/stakeholder-logos/physician-associations/physician-bdh.png', 'https://www.hygiene-bv.de/daten/BDH_logo.png'),
    ('physician-bdp-pathologie', 'public/stakeholder-logos/physician-associations/physician-bdp-pathologie.png', 'https://www.pathologie.de/_Resources/Static/Packages/C4Csystems.Pathologie/GFX/logo-pathologie-175x50.png'),
    ('physician-bdrm', 'public/stakeholder-logos/physician-associations/physician-bdrm.png', 'https://bvd-rechtsmedizin.com/images/logo/LogoBVD_Transp.png'),
    ('physician-bdn-neurologen', 'public/stakeholder-logos/physician-associations/physician-bdn-neurologen.png', 'https://www.berufsverband-neurologen.de/wp-content/uploads/2020/09/BDN-Logo.png'),
    ('physician-bvdn', 'public/stakeholder-logos/physician-associations/physician-bvdn.png', 'https://www.berufsverband-nervenaerzte.de/wp-content/uploads/2021/04/BVDN-Logo.png'),
    ('physician-bvdp', 'public/stakeholder-logos/physician-associations/physician-bvdp.png', 'https://www.berufsverband-psychiater.de/wp-content/uploads/2021/03/BVDP-Logo_210219.png'),
    ('physician-bkjpp', 'public/stakeholder-logos/physician-associations/physician-bkjpp.jpg', 'https://www.bkjpp.de/wp-content/uploads/2024/03/logobkjjp60unten.jpg'),
    ('physician-aeda', 'public/stakeholder-logos/physician-associations/physician-aeda.svg', 'https://aeda.de/wp-content/uploads/2022/04/Aeda_Logo_lang.svg'),
    ('physician-bdrh', 'public/stakeholder-logos/physician-associations/physician-bdrh.svg', 'https://www.bdrh.de/wp-content/uploads/2021/12/BDRh_Logo_RGB_v1.svg'),
    ('physician-vlk', 'public/stakeholder-logos/physician-associations/physician-vlk.png', 'https://vlk-online.de/wp-content/uploads/thegem/logos/logo_6f12867f7839268a3c0b15b2f73017c0_3x.png'),
    ('physician-bvsd', 'public/stakeholder-logos/physician-associations/physician-bvsd.png', 'https://www.bvsd.de/wp-content/uploads/2019/05/bvsd_logo.png'),
    ('physician-freie-aerzteschaft', 'public/stakeholder-logos/physician-associations/physician-freie-aerzteschaft.png', 'https://freie-aerzteschaft.de/wp-content/uploads/2022/04/fa-logo-rgb-neu.png'),
    ('physician-ada', 'public/stakeholder-logos/physician-associations/physician-ada.png', 'https://www.arztnetze.info/images/logos/ada_logo.png')
)
update public.stakeholder_organizations as organization
set
  logo_url = physician_association_logo_metadata.logo_url,
  logo_source_url = physician_association_logo_metadata.logo_source_url,
  logo_source_label = 'Kuratiertes Logo-Asset: offizielles Header-/Logo-Asset; keine Favicon-/Social-Media-Quelle',
  updated_at = now()
from physician_association_logo_metadata
where organization.id = physician_association_logo_metadata.id;

with patient_contact_expansion (
  id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  website,
  phone,
  email,
  notes,
  source
) as (
  values
    ('patient-diabetesde', 'diabetesDE - Deutsche Diabetes-Hilfe e.V.', 'diabetesde - deutsche diabetes-hilfe e.v.', 'Krankheitsbezogene Patientenvertretung', '10117', 'Berlin', 'Berlin', 'https://www.diabetesde.org', '030 20167712', 'info@diabetesde.org', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles diabetesDE-Impressum'),
    ('patient-parkinson-vereinigung', 'Deutsche Parkinson Vereinigung e.V. (dPV)', 'deutsche parkinson vereinigung e.v. (dpv)', 'Krankheitsbezogene Selbsthilfevertretung', '41464', 'Neuss', 'Nordrhein-Westfalen', 'https://www.dpv-bundesverband.de', '02131 740270', null, 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielle dPV-Website'),
    ('patient-herzstiftung', 'Deutsche Herzstiftung e.V.', 'deutsche herzstiftung e.v.', 'Patientenorganisation/Patienteninformation', '60323', 'Frankfurt am Main', 'Hessen', 'https://herzstiftung.de', '069 955128-0', 'info@herzstiftung.de', 'Bundesweit sichtbare Patientenorganisation und Informationsanbieterin im Bereich Herz-Kreislauf-Erkrankungen.', 'Offizielles Herzstiftung-Impressum'),
    ('patient-daab', 'Deutscher Allergie- und Asthmabund e.V. (DAAB)', 'deutscher allergie- und asthmabund e.v. (daab)', 'Krankheitsbezogene Patientenvertretung', '41238', 'Mönchengladbach', 'Nordrhein-Westfalen', 'https://www.daab.de', '02166 6478820', 'info@daab.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles DAAB-Impressum'),
    ('patient-psoriasis-bund', 'Deutscher Psoriasis Bund e.V. (DPB)', 'deutscher psoriasis bund e.v. (dpb)', 'Krankheitsbezogene Selbsthilfevertretung', '20459', 'Hamburg', 'Hamburg', 'https://www.psoriasis-bund.de', '040 223399-0', 'info@psoriasis-bund.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles DPB-Impressum'),
    ('patient-frauenselbsthilfe-krebs', 'Frauenselbsthilfe Krebs - Bundesverband e.V.', 'frauenselbsthilfe krebs - bundesverband e.v.', 'Krebs-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://www.frauenselbsthilfe.de', '0228 338894-00', 'kontakt@frauenselbsthilfe.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles FSH-Impressum'),
    ('patient-prostatakrebs-bps', 'Bundesverband Prostatakrebs Selbsthilfe e.V. (BPS)', 'bundesverband prostatakrebs selbsthilfe e.v. (bps)', 'Krebs-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://prostatakrebs-bps.de', '0228 33889-500', 'info@prostatakrebs-bps.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles BPS-Impressum'),
    ('patient-ilco', 'Deutsche ILCO e.V.', 'deutsche ilco e.v.', 'Krebs-/Stoma-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://www.ilco.de', '0228 33889450', 'info@ilco.de', 'Selbsthilfevereinigung für Stomaträgerinnen und Stomaträger sowie Menschen mit Darmkrebs und ihre Angehörigen.', 'Haus der Krebs-Selbsthilfe; offizielle ILCO-Website'),
    ('patient-haus-der-krebs-selbsthilfe', 'Haus der Krebs-Selbsthilfe - Bundesverband e.V.', 'haus der krebs-selbsthilfe - bundesverband e.v.', 'Krebs-Selbsthilfe-Dachverband', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://hausderkrebsselbsthilfe.de', '0228 33889-540', 'info@hausderkrebsselbsthilfe.de', 'Dachstruktur mehrerer bundesweiter Krebs-Selbsthilfeorganisationen.', 'Offizielles HKSH-Impressum'),
    ('patient-dlh', 'Deutsche Leukämie- & Lymphom-Hilfe e.V. (DLH)', 'deutsche leukämie- & lymphom-hilfe e.v. (dlh)', 'Krebs-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://www.leukaemie-hilfe.de', '0228 33889200', 'info@leukaemie-hilfe.de', 'Bundesverband der Selbsthilfeorganisationen für Erwachsene mit Leukämien und Lymphomen.', 'Offizielles DLH-Impressum'),
    ('patient-schilddruesenkrebs', 'Bundesverband Schilddrüsenkrebs - Ohne Schilddrüse leben e.V.', 'bundesverband schilddrüsenkrebs - ohne schilddrüse leben e.v.', 'Krebs-Selbsthilfevertretung', '10179', 'Berlin', 'Berlin', 'https://www.sd-krebs.de', '030 27581146', 'info@sd-krebs.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Haus der Krebs-Selbsthilfe; offizielle Verbandsangaben'),
    ('patient-mukoviszidose', 'Mukoviszidose e.V. - Bundesverband Cystische Fibrose (CF)', 'mukoviszidose e.v. - bundesverband cystische fibrose (cf)', 'Krankheitsbezogene Selbsthilfevertretung', '53117', 'Bonn', 'Nordrhein-Westfalen', 'https://www.muko.info', '0228 98780-0', 'info@muko.info', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles Mukoviszidose-Impressum'),
    ('patient-kindernetzwerk', 'Kindernetzwerk e.V.', 'kindernetzwerk e.v.', 'Patienten-/Angehörigen-Dachverband', '63741', 'Aschaffenburg', 'Bayern', 'https://www.kindernetzwerk.de', '06021 454400', 'info@kindernetzwerk.de', 'Dachverband der Selbsthilfe von Familien mit Kindern und jungen Erwachsenen mit chronischen Erkrankungen und Behinderungen.', 'Offizielles Kindernetzwerk-Impressum'),
    ('patient-bvhk', 'Bundesverband Herzkranke Kinder e.V. (BVHK)', 'bundesverband herzkranke kinder e.v. (bvhk)', 'Patienten-/Angehörigenverband', '52074', 'Aachen', 'Nordrhein-Westfalen', 'https://bvhk.de', '0241 912332', 'info@bvhk.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles BVHK-Impressum'),
    ('patient-epilepsievereinigung', 'Deutsche Epilepsievereinigung e.V.', 'deutsche epilepsievereinigung e.v.', 'Krankheitsbezogene Selbsthilfevertretung', '10585', 'Berlin', 'Berlin', 'https://www.epilepsie-vereinigung.de', '030 3424414', null, 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizieller Epilepsievereinigung-Kontakt'),
    ('patient-depressionsliga', 'Deutsche DepressionsLiga e.V.', 'deutsche depressionsliga e.v.', 'Krankheitsbezogene Patientenvertretung', '53119', 'Bonn', 'Nordrhein-Westfalen', 'https://depressionsliga.de', '0228 24065772', 'kontakt@depressionsliga.de', 'Bundesweite Betroffenenorganisation für Menschen mit Depression und Angehörige.', 'Offizielles DepressionsLiga-Impressum'),
    ('patient-autismus-deutschland', 'autismus Deutschland e.V.', 'autismus deutschland e.v.', 'Patienten-/Angehörigenverband', '20148', 'Hamburg', 'Hamburg', 'https://www.autismus.de', '040 5115604', 'info@autismus.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles autismus.de-Impressum'),
    ('patient-adhs-deutschland', 'ADHS Deutschland e.V.', 'adhs deutschland e.v.', 'Krankheitsbezogene Selbsthilfevertretung', '13629', 'Berlin', 'Berlin', 'https://adhs-deutschland.de', null, 'info@adhs-deutschland.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles ADHS-Deutschland-Impressum'),
    ('patient-sarkom-stiftung', 'Deutsche Sarkom-Stiftung', 'deutsche sarkom-stiftung', 'Patienten-/Expertenorganisation', '61200', 'Wölfersheim', 'Hessen', 'https://www.sarkome.de', '0700 48840700', null, 'Gemeinsame Organisation von Patientinnen, Patienten und Expertinnen/Experten zur Verbesserung der Sarkomversorgung.', 'Offizielles Sarkom-Stiftung-Impressum'),
    ('patient-blasenkrebs-shb', 'Selbsthilfe-Bund Blasenkrebs e.V. (ShB)', 'selbsthilfe-bund blasenkrebs e.v. (shb)', 'Krebs-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://www.blasenkrebs-shb.de', '0228 33889152', 'info@blasenkrebs-shb.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles ShB-Impressum')
)
insert into public.stakeholder_organizations (
  id,
  stakeholder_type_id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  website,
  phone,
  email,
  notes,
  source,
  status
)
select
  patient_contact_expansion.id,
  'patient-associations',
  patient_contact_expansion.name,
  patient_contact_expansion.normalized_name,
  patient_contact_expansion.organization_type,
  patient_contact_expansion.postal_code,
  patient_contact_expansion.city,
  patient_contact_expansion.federal_state,
  patient_contact_expansion.website,
  patient_contact_expansion.phone,
  patient_contact_expansion.email,
  patient_contact_expansion.notes,
  patient_contact_expansion.source,
  'active'
from patient_contact_expansion
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    postal_code = excluded.postal_code,
    city = excluded.city,
    federal_state = excluded.federal_state,
    website = excluded.website,
    phone = excluded.phone,
    email = excluded.email,
    notes = excluded.notes,
    source = excluded.source,
    status = excluded.status;

with kv_metadata (id, logo_file, logo_source_url, member_count) as (
  values
    ('kv-baden-wuerttemberg', 'kv-baden-wuerttemberg.svg', 'https://www.kvbawue.de/fileadmin/templates/pics/LogoKVBW-Only.svg', 24324),
    ('kv-bayern', 'kv-bayern.svg', 'https://www.kvb.de/typo3conf/ext/sitepackage/Resources/Public/Img/Frontend/Icons/kvb_logo_L.svg', 30984),
    ('kv-berlin', 'kv-berlin.svg', 'https://www.kvberlin.de/die-kv-berlin/pressematerial', 11148),
    ('kv-brandenburg', 'kv-brandenburg.svg', 'https://www.kvbb.de/', 5099),
    ('kv-bremen', 'kv-bremen.svg', 'https://www.kvhb.de/fileadmin/templates/img/kvhb-logo_rgb.svg', 2127),
    ('kv-hamburg', 'kv-hamburg.svg', 'https://www.kvhh.net/_Resources/Static/Packages/Kvh.Shared/Images/logo.svg', 5873),
    ('kv-hessen', 'kv-hessen.svg', 'https://www.kvhessen.de/', 14849),
    ('kv-mecklenburg-vorpommern', 'kv-mecklenburg-vorpommern.png', 'https://www.kvmv.de/export/sites/default/.galleries/logos_kvmv/kvmv_logo_260x72_72dpi_neu.png_924116194.png', 3509),
    ('kv-niedersachsen', 'kv-niedersachsen.gif', 'https://www.kvn.de/media/Startseite/logo_kvn.gif?height=83&width=280', 17110),
    ('kv-nordrhein', 'kv-nordrhein.svg', 'https://www.kvno.de/_assets/1e9b4bda4188c921a5f70dd8e8f89d33/Default/Images/Frontend/KVNO_Logo_FIN_RGB.svg', 23809),
    ('kv-rheinland-pfalz', 'kv-rheinland-pfalz.svg', 'https://www.kv-rlp.de/', 8643),
    ('kv-saarland', 'kv-saarland.png', 'https://www.kvsaarland.de/wp-content/uploads/2021/11/cropped-layout_set_logo.png', 2272),
    ('kv-sachsen', 'kv-sachsen.svg', 'https://www.kvsachsen.de/_assets/52b99c8405b202148655db3504f4e336/Images/logo.svg', 9270),
    ('kv-sachsen-anhalt', 'kv-sachsen-anhalt.svg', 'https://www.kvsa.de/fileadmin/kvsa/kvsa-logo-positiv.svg', 4663),
    ('kv-schleswig-holstein', 'kv-schleswig-holstein.svg', 'https://www.kvsh.de/_assets/dc2a61922c9e4e40c3e5c4b5eb2f2579/Images/logo.svg', 6468),
    ('kv-thueringen', 'kv-thueringen.svg', 'https://www.kv-thueringen.de/', 4494),
    ('kv-westfalen-lippe', 'kv-westfalen-lippe.svg', 'https://www.kvwl.de/', 17233)
)
update public.stakeholder_organizations as org
set logo_url = 'public/stakeholder-logos/' || kv_metadata.logo_file,
    logo_source_url = kv_metadata.logo_source_url,
    logo_source_label = 'Offizielles Header-/Logo-Asset der Organisation',
    member_count = kv_metadata.member_count,
    member_count_source_url = 'https://www.kbv.de/documents/infothek/zahlen-und-fakten/Bundesarztregister/tabellen-statistische-informationen-bar-2025.xlsx',
    member_count_source_label = 'KBV Bundesarztregister, Tabelle 4, Stand 31.12.2025',
    member_count_updated_at = date '2025-12-31',
    member_count_scope = 'An der vertragsärztlichen Versorgung teilnehmende Ärztinnen und Ärzte, Psychotherapeutinnen und Psychotherapeuten (Zählung nach Personen)'
from kv_metadata
where org.id = kv_metadata.id;

with kv_board (id, organization_id, name, role, profile_url) as (
  values
    ('kv-baden-wuerttemberg-karsten-braun', 'kv-baden-wuerttemberg', 'Dr. Karsten Braun', 'Vorstandsvorsitzender', 'https://www.kvbawue.de/ueber-uns/vorstand'),
    ('kv-baden-wuerttemberg-doris-reinhardt', 'kv-baden-wuerttemberg', 'Dr. Doris Reinhardt', 'Stellvertretende Vorstandsvorsitzende', 'https://www.kvbawue.de/ueber-uns/vorstand'),
    ('kv-bayern-christian-pfeiffer', 'kv-bayern', 'Dr. Christian Pfeiffer', 'Vorstandsvorsitzender', 'https://www.kvb.de/ueber-uns/verwaltung'),
    ('kv-bayern-peter-heinz', 'kv-bayern', 'Dr. Peter Heinz', '1. Stv. Vorstandsvorsitzender', 'https://www.kvb.de/ueber-uns/verwaltung'),
    ('kv-bayern-claudia-ritter-rupp', 'kv-bayern', 'Dr. Claudia Ritter-Rupp', '2. Stv. Vorstandsvorsitzende', 'https://www.kvb.de/ueber-uns/verwaltung'),
    ('kv-berlin-burkhard-ruppert', 'kv-berlin', 'Dr. Burkhard Ruppert', 'Vorstandsvorsitzender', 'https://www.kvberlin.de/die-kv-berlin/organisation/vorstand'),
    ('kv-berlin-christiane-wessel', 'kv-berlin', 'Dr. Christiane Wessel', 'Stellvertretende Vorstandsvorsitzende', 'https://www.kvberlin.de/die-kv-berlin/organisation/vorstand'),
    ('kv-berlin-guenter-scherer', 'kv-berlin', 'Günter Scherer', 'Vorstandsmitglied', 'https://www.kvberlin.de/die-kv-berlin/organisation/vorstand'),
    ('kv-brandenburg-catrin-steiniger', 'kv-brandenburg', 'Catrin Steiniger', 'Vorsitzende des Vorstandes', 'https://www.kvbb.de/wir/unsere-struktur/vorstand'),
    ('kv-brandenburg-stefan-rossbach-kurschat', 'kv-brandenburg', 'Dr. med. Stefan Roßbach-Kurschat', 'Stellvertretender Vorsitzender des Vorstandes', 'https://www.kvbb.de/wir/unsere-struktur/vorstand'),
    ('kv-brandenburg-holger-rostek', 'kv-brandenburg', 'Holger Rostek', 'Stellvertretender Vorsitzender des Vorstandes', 'https://www.kvbb.de/wir/unsere-struktur/vorstand'),
    ('kv-bremen-bernhard-rochell', 'kv-bremen', 'Dr. Bernhard Rochell', 'Vorstandsvorsitzender', 'https://www.kvhb.de/ueber-uns/vorstand'),
    ('kv-bremen-peter-kurt-josenhans', 'kv-bremen', 'Peter Kurt Josenhans', 'Stv. Vorstandsvorsitzender', 'https://www.kvhb.de/ueber-uns/vorstand'),
    ('kv-bremen-martina-kemme', 'kv-bremen', 'Martina Kemme', 'Mitglied des Vorstands', 'https://www.kvhb.de/ueber-uns/vorstand'),
    ('kv-hamburg-john-afful', 'kv-hamburg', 'John Afful', 'Vorsitzender des Vorstandes', 'https://www.kvhh.net/de/ueber-uns/aufbau-vorstand.html'),
    ('kv-hamburg-caroline-roos', 'kv-hamburg', 'Caroline Roos', 'Stellv. Vorsitzende des Vorstandes', 'https://www.kvhh.net/de/ueber-uns/aufbau-vorstand.html'),
    ('kv-hessen-frank-dastych', 'kv-hessen', 'Frank Dastych', 'Vorstandsvorsitzender', 'https://www.kvhessen.de/ueber-uns/vorstand'),
    ('kv-hessen-armin-beck', 'kv-hessen', 'Armin Beck', 'Stellvertretender Vorstandsvorsitzender', 'https://www.kvhessen.de/ueber-uns/vorstand'),
    ('kv-mecklenburg-vorpommern-angelika-von-schuetz', 'kv-mecklenburg-vorpommern', 'Dipl.-Med. Angelika von Schütz', 'Vorsitzende', 'https://www.kvmv.de/ueber-uns/vorstand/'),
    ('kv-mecklenburg-vorpommern-tilo-schneider', 'kv-mecklenburg-vorpommern', 'Dr. med. Tilo Schneider', 'Stellvertretender Vorsitzender', 'https://www.kvmv.de/ueber-uns/vorstand/'),
    ('kv-mecklenburg-vorpommern-markolf-oelze', 'kv-mecklenburg-vorpommern', 'Dr. med. Markolf Oelze', 'Stellvertretender Vorsitzender', 'https://www.kvmv.de/ueber-uns/vorstand/'),
    ('kv-niedersachsen-mark-barjenbruch', 'kv-niedersachsen', 'Mark Barjenbruch', 'Vorsitzender', 'https://www.kvn.de/%C3%9Cber%2Buns/Organisation/Vorstand.html'),
    ('kv-niedersachsen-thorsten-schmidt', 'kv-niedersachsen', 'Thorsten Schmidt', 'Stellvertretender Vorsitzender', 'https://www.kvn.de/%C3%9Cber%2Buns/Organisation/Vorstand.html'),
    ('kv-niedersachsen-nicole-loehr', 'kv-niedersachsen', 'Nicole Löhr', 'Vorständin', 'https://www.kvn.de/%C3%9Cber%2Buns/Organisation/Vorstand.html'),
    ('kv-nordrhein-frank-bergmann', 'kv-nordrhein', 'Dr. med. Frank Bergmann', 'Vorstandsvorsitzender', 'https://www.kvno.de/ueber-uns/vorstand'),
    ('kv-nordrhein-carsten-koenig', 'kv-nordrhein', 'Dr. med. Carsten König, M. san.', 'Stellvertretender Vorstandsvorsitzender', 'https://www.kvno.de/ueber-uns/vorstand'),
    ('kv-rheinland-pfalz-peter-heinz', 'kv-rheinland-pfalz', 'San.-Rat Dr. Peter Heinz', 'Vorsitzender des Vorstands', 'https://www.kv-rlp.de/institution/aufgaben-und-organisation'),
    ('kv-rheinland-pfalz-andreas-bartels', 'kv-rheinland-pfalz', 'Dr. Andreas Bartels', 'Stellvertretender Vorsitzender des Vorstands', 'https://www.kv-rlp.de/institution/aufgaben-und-organisation'),
    ('kv-rheinland-pfalz-peter-andreas-staub', 'kv-rheinland-pfalz', 'Peter Andreas Staub', 'Mitglied des Vorstands', 'https://www.kv-rlp.de/institution/aufgaben-und-organisation'),
    ('kv-saarland-harry-derouet', 'kv-saarland', 'San.-Rat Prof. Dr. med. Harry Derouet', 'Vorsitzender des Vorstandes', 'https://www.kvsaarland.de/vorstand'),
    ('kv-saarland-thomas-rehlinger', 'kv-saarland', 'Thomas Rehlinger', 'Stellv. Vorsitzender des Vorstandes', 'https://www.kvsaarland.de/vorstand'),
    ('kv-sachsen-stefan-windau', 'kv-sachsen', 'Dr. med. Stefan Windau', 'Vorstandsvorsitzender', 'https://www.kvsachsen.de/kv-sachsen/organisation/verwaltung/vorstand'),
    ('kv-sachsen-manuela-sipli', 'kv-sachsen', 'Dr. med. Manuela Sipli', 'Stellvertretende Vorstandsvorsitzende', 'https://www.kvsachsen.de/kv-sachsen/organisation/verwaltung/vorstand'),
    ('kv-sachsen-anhalt-joerg-boehme', 'kv-sachsen-anhalt', 'Dr. med. Jörg Böhme', 'Vorsitzender des Vorstandes', 'https://www.kvsa.de/ueber-uns/ansprechpartner/vorstand'),
    ('kv-sachsen-anhalt-nadine-waldburg', 'kv-sachsen-anhalt', 'Dr. med. Nadine Waldburg', 'Stellvertretende Vorsitzende des Vorstandes', 'https://www.kvsa.de/ueber-uns/ansprechpartner/vorstand'),
    ('kv-sachsen-anhalt-mathias-tronnier', 'kv-sachsen-anhalt', 'Mathias Tronnier', 'Geschäftsführender Vorstand', 'https://www.kvsa.de/ueber-uns/ansprechpartner/vorstand'),
    ('kv-schleswig-holstein-bettina-schultz', 'kv-schleswig-holstein', 'Dr. med. Bettina Schultz', 'Vorstandsvorsitzende', 'https://www.kvsh.de/ueber-uns/organisation/vorstand'),
    ('kv-schleswig-holstein-karsten-brandstetter', 'kv-schleswig-holstein', 'Dipl.-Kfm. Karsten Brandstetter', 'Stellvertretender Vorstandsvorsitzender', 'https://www.kvsh.de/ueber-uns/organisation/vorstand'),
    ('kv-schleswig-holstein-alexander-paquet', 'kv-schleswig-holstein', 'Dipl.-Wirtschaftsinformatiker Alexander Paquet', 'Vorstandsmitglied', 'https://www.kvsh.de/ueber-uns/organisation/vorstand'),
    ('kv-thueringen-annette-rommel', 'kv-thueringen', 'Dr. med. Annette Rommel', '1. Vorsitzende', 'https://www.kv-thueringen.de/ueber-uns/vorstand'),
    ('kv-thueringen-thomas-schroeter', 'kv-thueringen', 'Dr. med. Thomas Schröter', '2. Vorsitzender', 'https://www.kv-thueringen.de/ueber-uns/vorstand'),
    ('kv-westfalen-lippe-dirk-spelmeyer', 'kv-westfalen-lippe', 'Dr. med. Dirk Spelmeyer', 'Vorstandsvorsitzender', 'https://www.kvwl.de/kvwl/selbstverwaltung/vorstand'),
    ('kv-westfalen-lippe-anke-richter-scheer', 'kv-westfalen-lippe', 'Anke Richter-Scheer', 'Stellv. Vorstandsvorsitzende', 'https://www.kvwl.de/kvwl/selbstverwaltung/vorstand')
)
insert into public.stakeholder_people (
  id,
  stakeholder_type_id,
  organization_id,
  organization,
  name,
  role,
  committee,
  city,
  federal_state,
  latitude,
  longitude,
  map_position_source,
  topics,
  source,
  profile_url,
  is_representative_assembly_member,
  status
)
select
  kv_board.id,
  'kv',
  kv_board.organization_id,
  org.name,
  kv_board.name,
  kv_board.role,
  'Vorstand',
  org.city,
  org.federal_state,
  org.latitude,
  org.longitude,
  'organization',
  array['Selbstverwaltung', 'KV-Vorstand']::text[],
  'Offizielle KV-Vorstandsseite',
  kv_board.profile_url,
  false,
  'active'
from kv_board
join public.stakeholder_organizations as org on org.id = kv_board.organization_id
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    organization_id = excluded.organization_id,
    organization = excluded.organization,
    name = excluded.name,
    role = excluded.role,
    committee = excluded.committee,
    city = excluded.city,
    federal_state = excluded.federal_state,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    map_position_source = excluded.map_position_source,
    topics = excluded.topics,
    source = excluded.source,
    profile_url = excluded.profile_url,
    is_representative_assembly_member = excluded.is_representative_assembly_member,
    status = excluded.status;

with patient_logo_metadata (id, logo_url, logo_source_url) as (
  values
    ('patient-dbr', 'public/stakeholder-logos/patient-associations/patient-dbr.gif', 'https://www.deutscher-behindertenrat.de/GroupSys/layout/25031/040714-logo-dbr-408x85.gif'),
    ('patient-bagp', 'public/stakeholder-logos/patient-associations/patient-bagp.png', 'https://bagp.de/templates/bagp/images/logo.png'),
    ('patient-dag-shg', 'public/stakeholder-logos/patient-associations/patient-dag-shg.png', 'https://www.dag-shg.de/images/logo.png'),
    ('patient-vzbv', 'public/stakeholder-logos/patient-associations/patient-vzbv.svg', 'https://www.vzbv.de/themes/custom/vzbv_rebrush2025/images/vzbv-logo.svg'),
    ('patient-bag-selbsthilfe', 'public/stakeholder-logos/patient-associations/patient-bag-selbsthilfe.svg', 'https://www.bag-selbsthilfe.de'),
    ('patient-sovd', 'public/stakeholder-logos/patient-associations/patient-sovd.svg', 'https://www.sovd.de/_assets/279cee4ecef4166e206be59121d7a13a/Images/Logo/SoVD.svg'),
    ('patient-vdk', 'public/stakeholder-logos/patient-associations/patient-vdk.svg', 'https://www.vdk.de/_assets/af9f607dc860719ef78163c597401b48/Frontend/Build/assets/images/Sozialverband_VdK_Deutschland_Logo.svg'),
    ('patient-isl', 'public/stakeholder-logos/patient-associations/patient-isl.svg', 'https://isl-ev.de/wp-content/themes/isl/assets/images/logo-isl.svg'),
    ('patient-abid', 'public/stakeholder-logos/patient-associations/patient-abid.png', 'https://www.abid-ev.de/wp-content/uploads/logo-neu-300x49.png'),
    ('patient-lebenshilfe', 'public/stakeholder-logos/patient-associations/patient-lebenshilfe.svg', 'https://www.lebenshilfe.de'),
    ('patient-achse', 'public/stakeholder-logos/patient-associations/patient-achse.svg', 'https://www.achse-online.de/typo3conf/ext/wd_template/Resources/Public/img/logo-achse.svg'),
    ('patient-deutsche-alzheimer-gesellschaft', 'public/stakeholder-logos/patient-associations/patient-deutsche-alzheimer-gesellschaft.svg', 'https://www.deutsche-alzheimer.de/typo3conf/ext/cm_site/Resources/Public/Images/DAlzG_Logo_lang.svg'),
    ('patient-rheuma-liga', 'public/stakeholder-logos/patient-associations/patient-rheuma-liga.png', 'https://www.rheuma-liga.de/typo3conf/ext/z35_project/Resources/Public/Images/logo.png'),
    ('patient-dmsg', 'public/stakeholder-logos/patient-associations/patient-dmsg.svg', 'https://www.dmsg.de/_assets/082b9181afcf7491747656c6ceddf510/_Customizations/Public_DMSG/Media/logo.svg'),
    ('patient-dccv', 'public/stakeholder-logos/patient-associations/patient-dccv.png', 'https://www.dccv.de/typo3conf/ext/dccv/Resources/Public/Img/dccv_logo.png'),
    ('patient-pro-retina', 'public/stakeholder-logos/patient-associations/patient-pro-retina.jpg', 'https://www.pro-retina.de/fileadmin/_processed_/b/d/csm_PRO-RETINA_2026_Logo_742d14f6b8.jpg'),
    ('patient-upd', 'public/stakeholder-logos/patient-associations/patient-upd.svg', 'https://patientenberatung.de/wp-content/uploads/2024/04/upd-logo-pos.svg'),
    ('patient-aps', 'public/stakeholder-logos/patient-associations/patient-aps.png', 'https://www.aps-ev.de/wp-content/uploads/2024/05/aps_logo_480.png'),
    ('patient-bpik', 'public/stakeholder-logos/patient-associations/patient-bpik.png', 'https://bpik.de/wp-content/uploads/2021/08/Logo-BPIK_web_klein.png'),
    ('patient-diabetesde', 'public/stakeholder-logos/patient-associations/patient-diabetesde.svg', 'https://www.diabetesde.org/themes/custom/diabetes/logo.svg'),
    ('patient-parkinson-vereinigung', 'public/stakeholder-logos/patient-associations/patient-parkinson-vereinigung.svg', 'https://www.dpv-bundesverband.de/_assets/45b0bf2660e159d4af5ba8f836de3394/Images/logo.svg'),
    ('patient-herzstiftung', 'public/stakeholder-logos/patient-associations/patient-herzstiftung.jpg', 'https://herzstiftung.de/themes/custom/dhs_front/dhs-logo.jpg'),
    ('patient-daab', 'public/stakeholder-logos/patient-associations/patient-daab.png', 'https://www.daab.de/fileadmin/templates/img/logo.png'),
    ('patient-psoriasis-bund', 'public/stakeholder-logos/patient-associations/patient-psoriasis-bund.png', 'https://www.psoriasis-bund.de/typo3conf/ext/user_psoriasis_bund/Resources/Public/Images/logo.png'),
    ('patient-frauenselbsthilfe-krebs', 'public/stakeholder-logos/patient-associations/patient-frauenselbsthilfe-krebs.png', 'https://www.frauenselbsthilfe.de/typo3conf/ext/dg_theme/Resources/Public/Logos/Logo-FSH.png'),
    ('patient-prostatakrebs-bps', 'public/stakeholder-logos/patient-associations/patient-prostatakrebs-bps.png', 'https://prostatakrebs-bps.de/wp-content/uploads/bps-logo-transparent-schriftzug-grau.png'),
    ('patient-ilco', 'public/stakeholder-logos/patient-associations/patient-ilco.jpg', 'https://www.ilco.de/fileadmin/theme_ilco_de/images/logo.jpg'),
    ('patient-haus-der-krebs-selbsthilfe', 'public/stakeholder-logos/patient-associations/patient-haus-der-krebs-selbsthilfe.svg', 'https://hausderkrebsselbsthilfe.de/wp-content/uploads/2025/08/logo_svg.svg'),
    ('patient-dlh', 'public/stakeholder-logos/patient-associations/patient-dlh.svg', 'https://www.leukaemie-hilfe.de/fileadmin/user_upload/logo.svg'),
    ('patient-schilddruesenkrebs', 'public/stakeholder-logos/patient-associations/patient-schilddruesenkrebs.svg', 'https://www.sd-krebs.de/wp-content/uploads/2020/09/logo-sd-krebs.svg'),
    ('patient-mukoviszidose', 'public/stakeholder-logos/patient-associations/patient-mukoviszidose.svg', 'https://www.muko.info/_assets/22cf45b1172aadb18e25b83cb2690c1d/Images/logo-mukoviszidose-ev.svg'),
    ('patient-kindernetzwerk', 'public/stakeholder-logos/patient-associations/patient-kindernetzwerk.svg', 'https://www.kindernetzwerk.de/dist/svg/logo.svg'),
    ('patient-bvhk', 'public/stakeholder-logos/patient-associations/patient-bvhk.svg', 'https://bvhk.de/wp-content/uploads/2022/11/Logo_BVHK.svg'),
    ('patient-epilepsievereinigung', 'public/stakeholder-logos/patient-associations/patient-epilepsievereinigung.png', 'https://www.epilepsie-vereinigung.de/wp-content/uploads/2020/05/deutsche-epilepsievereinigung.png'),
    ('patient-depressionsliga', 'public/stakeholder-logos/patient-associations/patient-depressionsliga.svg', 'https://depressionsliga.de/wp-content/uploads/2024/02/logo.svg'),
    ('patient-autismus-deutschland', 'public/stakeholder-logos/patient-associations/patient-autismus-deutschland.png', 'https://www.autismus.de/fileadmin/templates/images/autismus_logo290.png'),
    ('patient-adhs-deutschland', 'public/stakeholder-logos/patient-associations/patient-adhs-deutschland.svg', 'https://adhs-deutschland.de/themes/custom/adhs/logo.svg'),
    ('patient-sarkom-stiftung', 'public/stakeholder-logos/patient-associations/patient-sarkom-stiftung.jpg', 'https://www.sarkome.de/templates/sarkomstiftung2020/images/designer/2efb3b721710d19a95b802575f669e73_SARKOMEdelogo.jpg'),
    ('patient-blasenkrebs-shb', 'public/stakeholder-logos/patient-associations/patient-blasenkrebs-shb.jpg', 'https://www.blasenkrebs-shb.de/wp-content/uploads/bg-branding.jpg')
)
update public.stakeholder_organizations as organization
set
  logo_url = patient_logo_metadata.logo_url,
  logo_source_url = patient_logo_metadata.logo_source_url,
  logo_source_label = 'Offizielles Header-/Logo-Asset der Organisation; keine Favicon-/Social-Media-Quelle',
  updated_at = now()
from patient_logo_metadata
where organization.id = patient_logo_metadata.id;

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
values ('profile-images', 'profile-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile images public read" on storage.objects;
create policy "profile images public read"
on storage.objects for select
to public
using (bucket_id = 'profile-images');

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
