-- Ensure viewers can read active formats created by other users.
-- Archive visibility remains admin-only.

alter table public.formats enable row level security;
alter table public.format_participants enable row level security;

grant select on public.formats to authenticated;
grant select on public.format_participants to authenticated;

drop policy if exists "formats authenticated read active" on public.formats;
create policy "formats authenticated read active"
on public.formats for select
to authenticated
using (status <> 'Archiviert' or public.current_profile_role() = 'admin');

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
