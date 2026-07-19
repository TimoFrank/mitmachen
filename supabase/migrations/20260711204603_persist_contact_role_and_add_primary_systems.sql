-- P0 field model: persist the existing contact role and capture the
-- primary systems used by an organization. Consent and privacy data are
-- deliberately outside this migration.

alter table public.contacts
  add column if not exists role text;

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

create index if not exists organization_primary_systems_organization_id_idx
  on public.organization_primary_systems(organization_id);

create unique index if not exists organization_primary_systems_unique_entry_idx
  on public.organization_primary_systems (
    organization_id,
    system_type,
    lower(coalesce(vendor_name, '')),
    lower(coalesce(product_name, ''))
  );

drop trigger if exists organization_primary_systems_touch_updated_at on public.organization_primary_systems;
create trigger organization_primary_systems_touch_updated_at
before update on public.organization_primary_systems
for each row execute function public.touch_updated_at();

alter table public.organization_primary_systems enable row level security;

revoke all on public.organization_primary_systems from anon, authenticated, service_role;
grant select, insert, update, delete on public.organization_primary_systems to authenticated;
grant select, insert, update, delete on public.organization_primary_systems to service_role;

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
