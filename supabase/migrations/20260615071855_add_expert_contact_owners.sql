alter table public.expert_contacts
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

alter table public.expert_contacts
  add column if not exists owner_ids uuid[] not null default '{}';

-- Existing owner assignments are maintained only in protected storage.

create index if not exists expert_contacts_owner_idx
on public.expert_contacts(owner_id);

create index if not exists expert_contacts_owner_ids_idx
on public.expert_contacts using gin(owner_ids);

grant update on public.expert_contacts to authenticated;

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
