alter table public.format_participants
  add column if not exists invited_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists participated_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists status_changed_at timestamptz not null default now();

-- Preserve every existing relationship and derive the best available historic
-- timestamps from its existing audit columns. No participant row is replaced.
update public.format_participants
set
  invited_at = case
    when invitation_status in ('Eingeladen', 'Keine Rückmeldung', 'Zugesagt', 'Teilgenommen', 'Abgesagt')
      then coalesce(invited_at, created_at)
    else invited_at
  end,
  responded_at = case
    when invitation_status in ('Zugesagt', 'Teilgenommen', 'Abgesagt')
      then coalesce(responded_at, updated_at, created_at)
    else responded_at
  end,
  participated_at = case
    when invitation_status = 'Teilgenommen'
      then coalesce(participated_at, updated_at, created_at)
    else participated_at
  end,
  cancelled_at = case
    when invitation_status = 'Abgesagt'
      then coalesce(cancelled_at, updated_at, created_at)
    else cancelled_at
  end,
  status_changed_at = coalesce(updated_at, created_at, status_changed_at);

create or replace function public.prepare_format_participation_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  status_changed boolean;
  changed_at timestamptz := statement_timestamp();
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  elsif new.updated_by is null then
    new.updated_by := case when tg_op = 'UPDATE' then coalesce(old.updated_by, old.created_by) else new.created_by end;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.updated_by);
    status_changed := true;
  else
    status_changed := old.invitation_status is distinct from new.invitation_status;
  end if;

  if not status_changed then
    return new;
  end if;

  new.status_changed_at := changed_at;

  if new.invitation_status in ('Eingeladen', 'Keine Rückmeldung', 'Zugesagt', 'Teilgenommen', 'Abgesagt') then
    new.invited_at := coalesce(new.invited_at, new.created_at, changed_at);
  end if;

  if new.invitation_status in ('Zugesagt', 'Teilgenommen', 'Abgesagt') then
    new.responded_at := coalesce(new.responded_at, changed_at);
  end if;

  if new.invitation_status = 'Teilgenommen' then
    new.participated_at := coalesce(new.participated_at, changed_at);
  elsif new.invitation_status = 'Abgesagt' then
    new.cancelled_at := coalesce(new.cancelled_at, changed_at);
  end if;

  return new;
end;
$function$;

revoke all on function public.prepare_format_participation_write()
  from public, anon, authenticated;

drop trigger if exists format_participants_prepare_workflow on public.format_participants;
create trigger format_participants_prepare_workflow
before insert or update on public.format_participants
for each row
execute function public.prepare_format_participation_write();

create or replace function public.log_format_participation_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  format_title text;
  contact_name text;
  event_key text;
  event_action text;
begin
  if tg_op = 'UPDATE' and old.invitation_status is not distinct from new.invitation_status then
    return new;
  end if;

  event_key := case new.invitation_status
    when 'Eingeladen' then 'format.invitation.created'
    when 'Zugesagt' then 'format.invitation.accepted'
    when 'Teilgenommen' then 'format.participation.recorded'
    when 'Abgesagt' then 'format.invitation.declined'
    else null
  end;
  event_action := case new.invitation_status
    when 'Eingeladen' then 'invited'
    when 'Zugesagt' then 'accepted'
    when 'Teilgenommen' then 'participated'
    when 'Abgesagt' then 'declined'
    else null
  end;

  if event_key is null then
    return new;
  end if;

  select f.title, c.name
  into format_title, contact_name
  from public.formats f
  join public.contacts c on c.id = new.contact_id
  where f.id = new.format_id;

  insert into public.activity_events (
    event_key,
    category,
    action,
    entity_type,
    entity_id,
    contact_id,
    actor_id,
    occurred_at,
    origin_type,
    correlation_id,
    "references",
    changes,
    metadata
  ) values (
    event_key,
    'format',
    event_action,
    'format_participant',
    new.id::text,
    new.contact_id,
    coalesce(new.updated_by, new.created_by),
    coalesce(new.status_changed_at, statement_timestamp()),
    'manual',
    'format:' || new.format_id::text || ':contact:' || new.contact_id,
    jsonb_build_array(
      jsonb_build_object('type', 'contact', 'id', new.contact_id, 'label', coalesce(contact_name, 'Kontakt')),
      jsonb_build_object('type', 'format', 'id', new.format_id::text, 'label', coalesce(format_title, 'Format'))
    ),
    jsonb_build_object(
      'invitation_status', jsonb_build_object(
        'before', case when tg_op = 'UPDATE' then old.invitation_status else null end,
        'after', new.invitation_status
      )
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'format_title', format_title,
      'contact_name', contact_name,
      'participation_status', new.invitation_status,
      'participant_role', new.participant_role,
      'invited_at', new.invited_at,
      'responded_at', new.responded_at,
      'participated_at', new.participated_at,
      'cancelled_at', new.cancelled_at
    ))
  );

  return new;
end;
$function$;

revoke all on function public.log_format_participation_status_change()
  from public, anon, authenticated;

drop trigger if exists format_participants_log_status_change on public.format_participants;
create trigger format_participants_log_status_change
after insert or update of invitation_status on public.format_participants
for each row
execute function public.log_format_participation_status_change();

drop policy if exists "format participants editor admin insert" on public.format_participants;
create policy "format participants editor admin insert"
on public.format_participants for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

drop policy if exists "format participants editor admin update" on public.format_participants;
create policy "format participants editor admin update"
on public.format_participants for update
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'))
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and updated_by = (select auth.uid())
);
