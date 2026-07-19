begin;

-- Narrow reconciliation for the temporary Supabase operating mode. It changes
-- no business rows and leaves existing application-table RLS policies intact.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active = true
    and p.role in ('viewer', 'editor', 'admin')
$function$;

create or replace function private.is_active_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.current_profile_role() is not null
$function$;

revoke all on function private.current_profile_role() from public, anon, authenticated, service_role;
revoke all on function private.is_active_profile() from public, anon, authenticated, service_role;
grant execute on function private.current_profile_role(), private.is_active_profile()
  to authenticated, service_role;

create or replace function public.current_profile_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.current_profile_role()
$function$;

revoke all on function public.current_profile_role() from public, anon, authenticated, service_role;
grant execute on function public.current_profile_role() to authenticated, service_role;

-- The auth trigger remains unchanged; only direct RPC-style execution is
-- removed and its object lookup is made deterministic.
alter function public.handle_new_user() set search_path = '';
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

-- Preserve notification behaviour through an invoker wrapper while the
-- privileged implementation stays outside the exposed API schema.
create or replace function private.create_notification_event(
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
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_event_id uuid;
  v_recipient_ids uuid[];
begin
  if v_actor is null or private.current_profile_role() is null then
    raise exception using errcode = '42501', message = 'An active notification actor is required.';
  end if;

  if p_actor_id is not null and p_actor_id <> v_actor then
    raise exception using errcode = '42501', message = 'Notification actor must match the authenticated user.';
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
end
$function$;

revoke all on function private.create_notification_event(text, text, text, uuid, text, text, text, jsonb, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function private.create_notification_event(text, text, text, uuid, text, text, text, jsonb, uuid[])
  to authenticated, service_role;

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
language sql
security invoker
set search_path = ''
as $function$
  select private.create_notification_event(
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_actor_id,
    p_title,
    p_body,
    p_route,
    p_payload,
    p_recipient_ids
  )
$function$;

revoke all on function public.create_notification_event(text, text, text, uuid, text, text, text, jsonb, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.create_notification_event(text, text, text, uuid, text, text, text, jsonb, uuid[])
  to authenticated, service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$function$;

revoke all on function public.touch_updated_at()
  from public, anon, authenticated, service_role;

do $block$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'alter function public.rls_auto_enable() set search_path = pg_catalog';
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end
$block$;

-- Preserve helper access without exposing the protected evidence table.
do $block$
begin
  if to_regclass('private.protected_source_snapshots') is not null then
    execute 'alter table private.protected_source_snapshots enable row level security';
    execute 'alter table private.protected_source_snapshots force row level security';
    execute 'revoke all on table private.protected_source_snapshots from public, anon, authenticated, service_role';
  end if;
end
$block$;

update storage.buckets
set public = false
where id in ('stakeholder-logos', 'protected-source-assets', 'profile-images');

-- A restrictive policy prevents later permissive policies from accidentally
-- exposing either archive bucket to browser roles.
drop policy if exists "protected archives deny browser access" on storage.objects;
create policy "protected archives deny browser access"
on storage.objects as restrictive for all
to anon, authenticated
using (bucket_id not in ('stakeholder-logos', 'protected-source-assets'))
with check (bucket_id not in ('stakeholder-logos', 'protected-source-assets'));

drop policy if exists "profile images public read" on storage.objects;
drop policy if exists "profile images team read" on storage.objects;
create policy "profile images team read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-images'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
);

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
