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

alter table public.saved_views drop constraint if exists saved_views_view_type_check;
alter table public.saved_views
  add constraint saved_views_view_type_check
  check (view_type in ('contacts', 'organizations', 'formats', 'map', 'analytics'));

alter table public.user_settings drop constraint if exists user_settings_default_view_type_check;
alter table public.user_settings
  add constraint user_settings_default_view_type_check
  check (default_view_type in ('contacts', 'organizations', 'formats', 'map', 'analytics'));

create index if not exists formats_owner_idx on public.formats(owner_id);
create index if not exists formats_status_idx on public.formats(status);
create index if not exists formats_starts_at_idx on public.formats(starts_at);
create index if not exists format_participants_format_idx on public.format_participants(format_id);
create index if not exists format_participants_contact_idx on public.format_participants(contact_id);
create index if not exists format_participants_status_idx on public.format_participants(invitation_status);

drop trigger if exists formats_touch_updated_at on public.formats;
create trigger formats_touch_updated_at
before update on public.formats
for each row execute function public.touch_updated_at();

drop trigger if exists format_participants_touch_updated_at on public.format_participants;
create trigger format_participants_touch_updated_at
before update on public.format_participants
for each row execute function public.touch_updated_at();

alter table public.formats enable row level security;
alter table public.format_participants enable row level security;

grant select, insert, update, delete on public.formats to authenticated;
grant select, insert, update, delete on public.format_participants to authenticated;
grant select, insert, update, delete on public.formats to service_role;
grant select, insert, update, delete on public.format_participants to service_role;

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
  public.current_profile_role() in ('admin', 'editor')
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "formats editor admin update" on public.formats;
create policy "formats editor admin update"
on public.formats for update
to authenticated
using (public.current_profile_role() in ('admin', 'editor'))
with check (public.current_profile_role() in ('admin', 'editor'));

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
  public.current_profile_role() in ('admin', 'editor')
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "format participants editor admin update" on public.format_participants;
create policy "format participants editor admin update"
on public.format_participants for update
to authenticated
using (public.current_profile_role() in ('admin', 'editor'))
with check (public.current_profile_role() in ('admin', 'editor'));

drop policy if exists "format participants editor admin delete" on public.format_participants;
create policy "format participants editor admin delete"
on public.format_participants for delete
to authenticated
using (public.current_profile_role() in ('admin', 'editor'));
