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

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  event_key text not null,
  category text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  contact_id text references public.contacts(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  origin_type text not null default 'manual',
  origin_ref text,
  correlation_id text,
  "references" jsonb not null default '[]'::jsonb,
  changes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_source text,
  legacy_id text,
  created_at timestamptz not null default now(),
  constraint activity_events_event_key_check
    check (event_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint activity_events_category_check
    check (category in ('master_data', 'ownership', 'consent', 'hospitation', 'format', 'note_document', 'unknown')),
  constraint activity_events_action_check
    check (action ~ '^[a-z][a-z0-9_]*$'),
  constraint activity_events_entity_type_check
    check (nullif(btrim(entity_type), '') is not null),
  constraint activity_events_entity_id_check
    check (nullif(btrim(entity_id), '') is not null),
  constraint activity_events_contact_entity_check
    check (entity_type <> 'contact' or (contact_id is not null and contact_id = entity_id)),
  constraint activity_events_contact_reference_check
    check (public.activity_contact_references_match("references", contact_id)),
  constraint activity_events_origin_type_check
    check (origin_type in ('manual', 'data_import', 'public_registration', 'system', 'legacy')),
  constraint activity_events_origin_ref_check
    check (origin_ref is null or nullif(btrim(origin_ref), '') is not null),
  constraint activity_events_correlation_id_check
    check (correlation_id is null or nullif(btrim(correlation_id), '') is not null),
  constraint activity_events_references_type_check
    check (jsonb_typeof("references") = 'array'),
  constraint activity_events_changes_type_check
    check (jsonb_typeof(changes) = 'object'),
  constraint activity_events_metadata_type_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint activity_events_legacy_reference_pair_check
    check (
      (legacy_source is null and legacy_id is null)
      or (
        nullif(btrim(legacy_source), '') is not null
        and nullif(btrim(legacy_id), '') is not null
      )
    ),
  constraint activity_events_contact_id_id_key unique (contact_id, id)
);

create index if not exists activity_events_occurred_at_idx
  on public.activity_events (occurred_at desc);

create index if not exists activity_events_category_occurred_at_idx
  on public.activity_events (category, occurred_at desc);

create index if not exists activity_events_contact_occurred_at_idx
  on public.activity_events (contact_id, occurred_at desc)
  where contact_id is not null;

create index if not exists activity_events_actor_occurred_at_idx
  on public.activity_events (actor_id, occurred_at desc)
  where actor_id is not null;

create index if not exists activity_events_entity_occurred_at_idx
  on public.activity_events (entity_type, entity_id, occurred_at desc);

create unique index if not exists activity_events_legacy_reference_unique_idx
  on public.activity_events (legacy_source, legacy_id)
  where legacy_source is not null and legacy_id is not null;

alter table public.activity_events enable row level security;

revoke all on table public.activity_events from public, anon, authenticated, service_role;
grant select on table public.activity_events to authenticated;
grant select, insert on table public.activity_events to service_role;

revoke all on sequence public.activity_events_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.activity_events_id_seq to service_role;

drop policy if exists "activity events active profiles read" on public.activity_events;
create policy "activity events active profiles read"
on public.activity_events for select
to authenticated
using (
  (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
);

drop policy if exists "activity events editor admin insert own" on public.activity_events;
