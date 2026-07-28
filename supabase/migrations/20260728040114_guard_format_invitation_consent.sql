begin;

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

  if not status_changed then
    return new;
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
