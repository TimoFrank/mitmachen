-- Expertenkreis: schema, constraints and access controls only.

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

create index if not exists expert_groups_status_idx on public.expert_groups(status);
create index if not exists expert_organizations_normalized_name_idx on public.expert_organizations(normalized_name);
create index if not exists expert_organizations_group_idx on public.expert_organizations(group_id);
create index if not exists expert_organizations_status_idx on public.expert_organizations(status);
create index if not exists expert_contacts_group_idx on public.expert_contacts(group_id);
create index if not exists expert_contacts_organization_idx on public.expert_contacts(organization_id);
create index if not exists expert_contacts_status_idx on public.expert_contacts(status);

alter table public.saved_views drop constraint if exists saved_views_view_type_check;
alter table public.saved_views
  add constraint saved_views_view_type_check
  check (view_type in ('contacts', 'organizations', 'experts', 'formats', 'map', 'analytics'));

alter table public.user_settings drop constraint if exists user_settings_default_view_type_check;
alter table public.user_settings
  add constraint user_settings_default_view_type_check
  check (default_view_type in ('contacts', 'organizations', 'experts', 'formats', 'map', 'analytics'));

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

alter table public.expert_groups enable row level security;
alter table public.expert_organizations enable row level security;
alter table public.expert_contacts enable row level security;

revoke all on public.expert_groups from anon, authenticated, service_role;
revoke all on public.expert_organizations from anon, authenticated, service_role;
revoke all on public.expert_contacts from anon, authenticated, service_role;

grant select on public.expert_groups to authenticated;
grant select on public.expert_organizations to authenticated;
grant select on public.expert_contacts to authenticated;
grant select, insert, update, delete on public.expert_groups to service_role;
grant select, insert, update, delete on public.expert_organizations to service_role;
grant select, insert, update, delete on public.expert_contacts to service_role;

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


-- Operational records are maintained only in protected storage.
