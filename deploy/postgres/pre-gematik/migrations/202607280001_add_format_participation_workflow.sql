begin;

do $format_consent_preflight$
declare
  blocked_count bigint;
  blocked_examples text[];
begin
  select count(*)
    into blocked_count
    from public.format_participants participant
    left join public.contacts contact on contact.id = participant.contact_id
   where participant.invitation_status in ('Eingeladen', 'Zugesagt', 'Teilgenommen')
     and (
       contact.id is null
       or contact.status = 'archived'
       or contact.mitmachen_consent_status is distinct from 'granted'
     );

  if blocked_count > 0 then
    select array_agg(sample.example order by sample.example)
      into blocked_examples
      from (
        select participant.format_id::text || '/' || participant.contact_id::text
          || ' (' || participant.invitation_status || ')' as example
          from public.format_participants participant
          left join public.contacts contact on contact.id = participant.contact_id
         where participant.invitation_status in ('Eingeladen', 'Zugesagt', 'Teilgenommen')
           and (
             contact.id is null
             or contact.status = 'archived'
             or contact.mitmachen_consent_status is distinct from 'granted'
           )
         order by participant.format_id, participant.contact_id
         limit 20
      ) sample;

    raise exception using
      errcode = '23514',
      constraint = 'format_participants_invitation_consent_preflight',
      message = format(
        'Formatbeteiligungs-Migration abgebrochen: %s bestehende geschützte Beteiligung(en) ohne aktive #Mitmachen-Einwilligung.',
        blocked_count
      ),
      detail = 'Beispiele (maximal 20): ' || array_to_string(blocked_examples, ', '),
      hint = 'Einwilligung und Kontaktstatus fachlich klären oder den Beteiligungsstatus auf Kandidat/Abgesagt setzen; die Migration ändert keine Bestandsdaten.';
  end if;
end;
$format_consent_preflight$;

create or replace function public.prepare_format_participation_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  status_changed boolean;
  invitation_allowed boolean;
  changed_at timestamptz := statement_timestamp();
begin
  if new.updated_by is null then
    new.updated_by := case
      when tg_op = 'UPDATE' then coalesce(old.updated_by, old.created_by)
      else new.created_by
    end;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.updated_by);
    status_changed := true;
  else
    status_changed := old.invitation_status is distinct from new.invitation_status;
  end if;

  if new.invitation_status in ('Eingeladen', 'Zugesagt', 'Teilgenommen') then
    select exists (
      select 1
        from public.contacts contact
       where contact.id = new.contact_id
         and contact.status <> 'archived'
         and contact.mitmachen_consent_status = 'granted'
    ) into invitation_allowed;
    if not invitation_allowed then
      raise exception using
        errcode = '23514',
        constraint = 'format_participants_invitation_consent_check',
        message = 'Für Eingeladen, Zugesagt oder Teilgenommen muss eine gültige Mitmachen-Einwilligung vorliegen.';
    end if;
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
$$;

revoke all on function public.prepare_format_participation_write() from public;

create or replace function public.log_format_participation_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  select format.title, contact.name
    into format_title, contact_name
    from public.formats format
    join public.contacts contact on contact.id = new.contact_id
   where format.id = new.format_id;

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
$$;

revoke all on function public.log_format_participation_status_change() from public;

drop trigger if exists format_participants_prepare_workflow on public.format_participants;
create trigger format_participants_prepare_workflow
before insert or update on public.format_participants
for each row execute function public.prepare_format_participation_write();

drop trigger if exists format_participants_log_status_change on public.format_participants;
create trigger format_participants_log_status_change
after insert or update of invitation_status on public.format_participants
for each row execute function public.log_format_participation_status_change();

commit;
