-- Applies the activity-ledger security boundary to environments that may have
-- already executed the initial activity_events migration.
create or replace function public.activity_contact_references_match(
  p_references jsonb,
  p_contact_id text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select not exists (
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(p_references, '[]'::jsonb)) as item
    where item ->> 'type' = 'contact'
      and (
        p_contact_id is null
        or item ->> 'id' is distinct from p_contact_id
      )
  );
$function$;

revoke all on table public.activity_events from public, anon, authenticated, service_role;
grant select on table public.activity_events to authenticated;
grant select, insert on table public.activity_events to service_role;

revoke all on sequence public.activity_events_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.activity_events_id_seq to service_role;

drop policy if exists "activity events editor admin insert own" on public.activity_events;

alter table public.activity_events
  drop constraint if exists activity_events_contact_id_fkey;

alter table public.activity_events
  add constraint activity_events_contact_id_fkey
  foreign key (contact_id)
  references public.contacts(id)
  on delete restrict;

alter table public.changes
  add column if not exists activity_event_id bigint;

alter table public.changes
  add column if not exists canonicalized_at timestamptz;

alter table public.changes
  drop constraint if exists changes_activity_event_id_fkey;

alter table public.changes
  drop constraint if exists changes_activity_event_contact_fkey;

alter table public.activity_events
  drop constraint if exists activity_events_contact_id_id_key;

alter table public.activity_events
  add constraint activity_events_contact_id_id_key
  unique (contact_id, id);

alter table public.changes
  add constraint changes_activity_event_contact_fkey
  foreign key (contact_id, activity_event_id)
  references public.activity_events(contact_id, id)
  on delete restrict;

alter table public.changes
  drop constraint if exists changes_canonical_reference_pair_check;

alter table public.changes
  add constraint changes_canonical_reference_pair_check
  check (
    (activity_event_id is null and canonicalized_at is null)
    or (activity_event_id is not null and canonicalized_at is not null)
  );

create index if not exists changes_activity_event_idx
  on public.changes (activity_event_id)
  where activity_event_id is not null;

alter table public.activity_events
  drop constraint if exists activity_events_contact_entity_check;

alter table public.activity_events
  add constraint activity_events_contact_entity_check
  check (entity_type <> 'contact' or (contact_id is not null and contact_id = entity_id));

alter table public.activity_events
  drop constraint if exists activity_events_contact_reference_check;

alter table public.activity_events
  add constraint activity_events_contact_reference_check
  check (public.activity_contact_references_match("references", contact_id));

drop policy if exists "changes authenticated read" on public.changes;
create policy "changes authenticated read"
on public.changes for select
to authenticated
using (
  (select public.current_profile_role()) = 'admin'
  or (
    (select public.current_profile_role()) in ('viewer', 'editor')
    and exists (
      select 1
      from public.contacts c
      where c.id = contact_id
        and c.status <> 'archived'
    )
  )
);

drop policy if exists "changes editor admin insert" on public.changes;
create policy "changes editor admin insert"
on public.changes for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and changed_by = (select auth.uid())
  and activity_event_id is null
  and canonicalized_at is null
);

drop policy if exists "activity events active profiles read" on public.activity_events;
create policy "activity events active profiles read"
on public.activity_events for select
to authenticated
using (
  (select public.current_profile_role()) = 'admin'
  or (
    (select public.current_profile_role()) in ('viewer', 'editor')
    and (
      contact_id is null
      or exists (
        select 1
        from public.contacts c
        where c.id = contact_id
          and c.status <> 'archived'
      )
    )
  )
);
