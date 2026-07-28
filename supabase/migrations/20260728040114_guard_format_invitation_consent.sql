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
as $function$
declare
  status_changed boolean;
  invitation_allowed boolean;
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
$function$;

revoke all on function public.prepare_format_participation_write()
  from public, anon, authenticated;

commit;
