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

drop trigger if exists hospitation_slots_touch_updated_at on public.hospitation_slots;
create trigger hospitation_slots_touch_updated_at
before update on public.hospitation_slots
for each row execute function public.touch_updated_at();

drop trigger if exists hospitations_touch_updated_at on public.hospitations;
create trigger hospitations_touch_updated_at
before update on public.hospitations
for each row execute function public.touch_updated_at();

alter table public.hospitation_slots enable row level security;
alter table public.hospitations enable row level security;

grant select, insert, update on public.hospitation_slots to authenticated;
grant select, insert, update on public.hospitations to authenticated;
grant select, insert, update, delete on public.hospitation_slots to service_role;
grant select, insert, update, delete on public.hospitations to service_role;

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
