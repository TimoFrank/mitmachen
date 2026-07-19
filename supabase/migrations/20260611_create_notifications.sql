create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id text,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text,
  occurred_at timestamptz not null default now(),
  route text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_recipients (
  event_id uuid not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists notification_events_occurred_idx on public.notification_events(occurred_at desc);
create index if not exists notification_events_entity_idx on public.notification_events(entity_type, entity_id);
create index if not exists notification_recipients_user_unread_idx on public.notification_recipients(user_id, read_at, dismissed_at, created_at desc);

alter table public.notification_events enable row level security;
alter table public.notification_recipients enable row level security;

revoke all on public.notification_events from anon, authenticated;
revoke all on public.notification_recipients from anon, authenticated;
grant select on public.notification_events to authenticated;
grant select on public.notification_recipients to authenticated;
revoke update on public.notification_recipients from authenticated;
grant update (read_at, dismissed_at) on public.notification_recipients to authenticated;
grant select, insert, update, delete on public.notification_events to service_role;
grant select, insert, update, delete on public.notification_recipients to service_role;

drop policy if exists "notification events read own recipients" on public.notification_events;
create policy "notification events read own recipients"
on public.notification_events for select
to authenticated
using (
  exists (
    select 1
    from public.notification_recipients r
    where r.event_id = id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "notification recipients read own" on public.notification_recipients;
create policy "notification recipients read own"
on public.notification_recipients for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "notification recipients update own" on public.notification_recipients;
create policy "notification recipients update own"
on public.notification_recipients for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.create_notification_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_actor_id uuid,
  p_title text,
  p_body text default null,
  p_route text default null,
  p_payload jsonb default '{}'::jsonb,
  p_recipient_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_event_id uuid;
  v_recipient_ids uuid[];
begin
  if v_actor is null then
    raise exception 'Notification actor is required.';
  end if;

  if p_actor_id is not null and p_actor_id <> v_actor then
    raise exception 'Notification actor must match the authenticated user.';
  end if;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
  into v_recipient_ids
  from public.profiles p
  where p.active = true
    and p.id = any(coalesce(p_recipient_ids, '{}'::uuid[]));

  if coalesce(array_length(v_recipient_ids, 1), 0) = 0 then
    return null;
  end if;

  insert into public.notification_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    title,
    body,
    route,
    payload
  )
  values (
    nullif(trim(p_event_type), ''),
    nullif(trim(p_entity_type), ''),
    nullif(trim(p_entity_id), ''),
    v_actor,
    nullif(trim(p_title), ''),
    nullif(trim(coalesce(p_body, '')), ''),
    nullif(trim(coalesce(p_route, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  insert into public.notification_recipients (event_id, user_id)
  select v_event_id, recipient_id
  from unnest(v_recipient_ids) as recipient_id
  on conflict (event_id, user_id) do nothing;

  return v_event_id;
end;
$$;

revoke all on function public.create_notification_event(text, text, text, uuid, text, text, text, jsonb, uuid[]) from public, anon;
grant execute on function public.create_notification_event(text, text, text, uuid, text, text, text, jsonb, uuid[]) to authenticated;
