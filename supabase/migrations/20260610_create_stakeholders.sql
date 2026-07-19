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

alter table public.saved_views drop constraint if exists saved_views_view_type_check;
alter table public.saved_views
  add constraint saved_views_view_type_check
  check (view_type in ('contacts', 'organizations', 'experts', 'stakeholders', 'formats', 'map', 'analytics'));

alter table public.user_settings drop constraint if exists user_settings_default_view_type_check;
alter table public.user_settings
  add constraint user_settings_default_view_type_check
  check (default_view_type in ('contacts', 'organizations', 'experts', 'stakeholders', 'formats', 'map', 'analytics'));

create index if not exists stakeholder_types_status_idx on public.stakeholder_types(status);
create index if not exists stakeholder_organizations_type_idx on public.stakeholder_organizations(stakeholder_type_id);
create index if not exists stakeholder_organizations_normalized_name_idx on public.stakeholder_organizations(normalized_name);
create index if not exists stakeholder_organizations_state_idx on public.stakeholder_organizations(federal_state);
create index if not exists stakeholder_organizations_status_idx on public.stakeholder_organizations(status);
create index if not exists stakeholder_people_type_idx on public.stakeholder_people(stakeholder_type_id);
create index if not exists stakeholder_people_organization_idx on public.stakeholder_people(organization_id);
create index if not exists stakeholder_people_representative_idx on public.stakeholder_people(is_representative_assembly_member);
create index if not exists stakeholder_people_status_idx on public.stakeholder_people(status);

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

alter table public.stakeholder_types enable row level security;
alter table public.stakeholder_organizations enable row level security;
alter table public.stakeholder_people enable row level security;

revoke all on public.stakeholder_types from anon, authenticated, service_role;
revoke all on public.stakeholder_organizations from anon, authenticated, service_role;
revoke all on public.stakeholder_people from anon, authenticated, service_role;

grant select, insert, update on public.stakeholder_types to authenticated;
grant select, insert, update on public.stakeholder_organizations to authenticated;
grant select, insert, update on public.stakeholder_people to authenticated;

grant select, insert, update, delete on public.stakeholder_types to service_role;
grant select, insert, update, delete on public.stakeholder_organizations to service_role;
grant select, insert, update, delete on public.stakeholder_people to service_role;

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


-- Operational records are maintained only in protected storage.
