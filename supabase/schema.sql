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
create index if not exists expert_groups_status_idx on public.expert_groups(status);
create index if not exists expert_organizations_normalized_name_idx on public.expert_organizations(normalized_name);
create index if not exists expert_organizations_group_idx on public.expert_organizations(group_id);
create index if not exists expert_organizations_status_idx on public.expert_organizations(status);
create index if not exists expert_contacts_group_idx on public.expert_contacts(group_id);
create index if not exists expert_contacts_organization_idx on public.expert_contacts(organization_id);
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
alter table public.expert_groups enable row level security;
alter table public.expert_organizations enable row level security;
alter table public.expert_contacts enable row level security;
alter table public.expert_entity_links enable row level security;
alter table public.stakeholder_types enable row level security;
alter table public.stakeholder_organizations enable row level security;
alter table public.stakeholder_people enable row level security;
alter table public.changes enable row level security;
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
revoke all on public.expert_groups from anon, authenticated, service_role;
revoke all on public.expert_organizations from anon, authenticated, service_role;
revoke all on public.expert_contacts from anon, authenticated, service_role;
revoke all on public.expert_entity_links from anon, authenticated, service_role;
revoke all on public.stakeholder_types from anon, authenticated, service_role;
revoke all on public.stakeholder_organizations from anon, authenticated, service_role;
revoke all on public.stakeholder_people from anon, authenticated, service_role;
grant select on public.expert_groups to authenticated;
grant select on public.expert_organizations to authenticated;
grant select on public.expert_contacts to authenticated;
grant select, insert, update, delete on public.expert_entity_links to authenticated;
grant select, insert, update on public.stakeholder_types to authenticated;
grant select, insert, update on public.stakeholder_organizations to authenticated;
grant select, insert, update on public.stakeholder_people to authenticated;
grant select, insert on public.changes to authenticated;
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
grant select, insert, update, delete on public.expert_groups to service_role;
grant select, insert, update, delete on public.expert_organizations to service_role;
grant select, insert, update, delete on public.expert_contacts to service_role;
grant select, insert, update, delete on public.expert_entity_links to service_role;
grant select, insert, update, delete on public.stakeholder_types to service_role;
grant select, insert, update, delete on public.stakeholder_organizations to service_role;
grant select, insert, update, delete on public.stakeholder_people to service_role;
grant select, insert, update, delete on public.changes to service_role;
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
values (
  'kv',
  'Kassenärztliche Vereinigungen',
  'Regionale Kassenärztliche Vereinigungen als erster Stakeholder-Bereich.',
  10,
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
