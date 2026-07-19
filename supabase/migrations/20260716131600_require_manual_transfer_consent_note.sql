alter table public.contacts
  drop constraint if exists contacts_mitmachen_verbal_note_check;

alter table public.contacts
  drop constraint if exists contacts_mitmachen_evidence_note_check;

alter table public.contacts
  add constraint contacts_mitmachen_evidence_note_check
  check (
    mitmachen_consent_source not in ('verbal_confirmed', 'manual_transfer')
    or length(btrim(coalesce(mitmachen_consent_note, ''))) > 0
  ) not valid;
create or replace function public.prepare_contact_consent_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  consent_changed boolean;
begin
  consent_changed := case
    when tg_op = 'INSERT' then
      new.mitmachen_consent_status <> 'not_requested'
      or new.mitmachen_consent_effective_at is not null
      or new.mitmachen_consent_source is not null
      or new.mitmachen_consent_text_version is not null
      or new.mitmachen_consent_recorded_by is not null
      or new.mitmachen_consent_note is not null
    else
      row(
        old.mitmachen_consent_status,
        old.mitmachen_consent_effective_at,
        old.mitmachen_consent_source,
        old.mitmachen_consent_text_version,
        old.mitmachen_consent_recorded_by,
        old.mitmachen_consent_note
      ) is distinct from row(
        new.mitmachen_consent_status,
        new.mitmachen_consent_effective_at,
        new.mitmachen_consent_source,
        new.mitmachen_consent_text_version,
        new.mitmachen_consent_recorded_by,
        new.mitmachen_consent_note
      )
  end;

  if consent_changed then
    if new.updated_by is null then
      raise exception using
        errcode = '23502',
        message = 'Einwilligungsänderungen benötigen eine authentifizierte erfassende Person.';
    end if;

    new.mitmachen_consent_recorded_by := new.updated_by;

    if new.mitmachen_consent_status in ('granted', 'declined', 'withdrawn')
      and new.mitmachen_consent_effective_at > statement_timestamp()
    then
      raise exception using
        errcode = '23514',
        message = 'Der Wirksamkeitszeitpunkt einer #Mitmachen-Einwilligung darf nicht in der Zukunft liegen.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.prepare_contact_consent_write() from public, anon, authenticated;

drop trigger if exists contacts_prepare_mitmachen_consent_insert on public.contacts;
create trigger contacts_prepare_mitmachen_consent_insert
before insert on public.contacts
for each row
execute function public.prepare_contact_consent_write();

drop trigger if exists contacts_prepare_mitmachen_consent_update on public.contacts;
create trigger contacts_prepare_mitmachen_consent_update
before update of
  mitmachen_consent_status,
  mitmachen_consent_effective_at,
  mitmachen_consent_source,
  mitmachen_consent_text_version,
  mitmachen_consent_recorded_by,
  mitmachen_consent_note,
  updated_by
on public.contacts
for each row
execute function public.prepare_contact_consent_write();

create or replace function public.log_contact_consent_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.changes (
    contact_id,
    action,
    field_name,
    old_value,
    new_value,
    changed_at,
    changed_by
  )
  select
    new.id,
    'update',
    delta.field_name,
    coalesce(delta.old_value, ''),
    coalesce(delta.new_value, ''),
    coalesce(new.updated_at, statement_timestamp()),
    new.updated_by
  from (
    values
      ('mitmachen_consent_status', old.mitmachen_consent_status::text, new.mitmachen_consent_status::text),
      ('mitmachen_consent_effective_at', old.mitmachen_consent_effective_at::text, new.mitmachen_consent_effective_at::text),
      ('mitmachen_consent_source', old.mitmachen_consent_source::text, new.mitmachen_consent_source::text),
      ('mitmachen_consent_text_version', old.mitmachen_consent_text_version::text, new.mitmachen_consent_text_version::text),
      ('mitmachen_consent_recorded_by', old.mitmachen_consent_recorded_by::text, new.mitmachen_consent_recorded_by::text),
      ('mitmachen_consent_note', old.mitmachen_consent_note::text, new.mitmachen_consent_note::text)
  ) as delta(field_name, old_value, new_value)
  where delta.old_value is distinct from delta.new_value;

  return new;
end;
$function$;

revoke all on function public.log_contact_consent_changes() from public, anon, authenticated;

drop trigger if exists contacts_log_mitmachen_consent_changes on public.contacts;
create trigger contacts_log_mitmachen_consent_changes
after update of
  mitmachen_consent_status,
  mitmachen_consent_effective_at,
  mitmachen_consent_source,
  mitmachen_consent_text_version,
  mitmachen_consent_recorded_by,
  mitmachen_consent_note
on public.contacts
for each row
execute function public.log_contact_consent_changes();
