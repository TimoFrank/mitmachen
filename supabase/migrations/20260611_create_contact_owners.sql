create table if not exists public.contact_owners (
  contact_id text not null references public.contacts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (contact_id, profile_id)
);

insert into public.contact_owners (contact_id, profile_id, assigned_at, assigned_by)
select id, owner_id, coalesce(updated_at, created_at, now()), updated_by
from public.contacts
where owner_id is not null
on conflict (contact_id, profile_id) do nothing;

create index if not exists contact_owners_profile_idx on public.contact_owners(profile_id);
create index if not exists contact_owners_contact_idx on public.contact_owners(contact_id);

alter table public.contact_owners enable row level security;

grant select, insert, update, delete on public.contact_owners to authenticated;
grant select, insert, update, delete on public.contact_owners to service_role;

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
