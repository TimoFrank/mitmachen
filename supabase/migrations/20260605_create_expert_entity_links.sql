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

drop trigger if exists expert_entity_links_touch_updated_at on public.expert_entity_links;
create trigger expert_entity_links_touch_updated_at
before update on public.expert_entity_links
for each row execute function public.touch_updated_at();

alter table public.expert_entity_links enable row level security;

revoke all on public.expert_entity_links from anon, authenticated, service_role;
grant select, insert, update, delete on public.expert_entity_links to authenticated;
grant select, insert, update, delete on public.expert_entity_links to service_role;

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
