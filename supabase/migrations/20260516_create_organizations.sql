-- Sprint 4: Organisationen als zweite CRM-Hauptsicht.
-- Idempotent und nicht destruktiv: contacts.organization bleibt als Freitext erhalten.

create extension if not exists pgcrypto;

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

alter table public.contacts
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

alter table public.saved_views
  drop constraint if exists saved_views_view_type_check,
  add constraint saved_views_view_type_check check (view_type in ('contacts', 'organizations', 'map', 'analytics'));

alter table public.user_settings
  drop constraint if exists user_settings_default_view_type_check,
  add constraint user_settings_default_view_type_check check (default_view_type in ('contacts', 'organizations', 'map', 'analytics'));

create index if not exists organizations_normalized_name_idx on public.organizations(normalized_name);
create index if not exists organizations_sector_idx on public.organizations(sector);
create index if not exists organizations_state_idx on public.organizations(federal_state);
create index if not exists organizations_status_idx on public.organizations(status);
create index if not exists contacts_organization_id_idx on public.contacts(organization_id);

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

insert into public.organizations (
  name,
  normalized_name,
  sector,
  postal_code,
  city,
  federal_state,
  latitude,
  longitude,
  source,
  status,
  created_by,
  updated_by
)
select
  org.name,
  org.normalized_name,
  org.sector,
  org.postal_code,
  org.city,
  org.federal_state,
  org.latitude,
  org.longitude,
  'Aus bestehenden Kontakten abgeleitet',
  'active',
  org.created_by,
  org.updated_by
from (
  select distinct on (lower(regexp_replace(trim(c.organization), '\s+', ' ', 'g')))
    trim(c.organization) as name,
    lower(regexp_replace(trim(c.organization), '\s+', ' ', 'g')) as normalized_name,
    nullif(trim(c.sector), '') as sector,
    nullif(trim(c.postal_code), '') as postal_code,
    nullif(trim(c.city), '') as city,
    nullif(trim(c.federal_state), '') as federal_state,
    c.latitude,
    c.longitude,
    c.created_by,
    c.updated_by,
    c.updated_at
  from public.contacts c
  where c.organization is not null
    and trim(c.organization) <> ''
    and trim(c.organization) !~* '^(noch ergänzen|noch ergaenzen|keine organisation|privat|unbekannt)$'
  order by lower(regexp_replace(trim(c.organization), '\s+', ' ', 'g')), c.updated_at desc nulls last
) org
where not exists (
  select 1
  from public.organizations existing
  where existing.normalized_name = org.normalized_name
);

update public.contacts c
set organization_id = o.id
from public.organizations o
where c.organization_id is null
  and c.organization is not null
  and lower(regexp_replace(trim(c.organization), '\s+', ' ', 'g')) = o.normalized_name;

alter table public.organizations enable row level security;

grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organizations to service_role;

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
