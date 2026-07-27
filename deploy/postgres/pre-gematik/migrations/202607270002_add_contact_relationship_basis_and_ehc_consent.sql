begin;

alter table public.contacts
  add column if not exists relationship_basis text not null default 'review_required',
  add column if not exists relationship_basis_effective_at timestamptz,
  add column if not exists relationship_basis_recorded_by text references public.profiles(id) on delete restrict,
  add column if not exists relationship_basis_note text,
  add column if not exists ehc_consent_status text not null default 'not_requested',
  add column if not exists ehc_consent_effective_at timestamptz,
  add column if not exists ehc_consent_source text,
  add column if not exists ehc_consent_text_version text,
  add column if not exists ehc_consent_recorded_by text references public.profiles(id) on delete restrict,
  add column if not exists ehc_consent_note text;

alter table public.contacts
  drop constraint if exists contacts_relationship_basis_check,
  drop constraint if exists contacts_relationship_basis_required_fields_check,
  drop constraint if exists contacts_relationship_basis_verbal_note_check,
  drop constraint if exists contacts_ehc_consent_status_check,
  drop constraint if exists contacts_ehc_consent_source_check,
  drop constraint if exists contacts_ehc_required_fields_check,
  drop constraint if exists contacts_ehc_decision_time_check,
  drop constraint if exists contacts_ehc_evidence_note_check;

alter table public.contacts
  add constraint contacts_relationship_basis_check check (
    relationship_basis in (
      'review_required',
      'public_task',
      'self_submitted',
      'active_collaboration',
      'verbal_contact',
      'public_professional_source'
    )
  ),
  add constraint contacts_relationship_basis_required_fields_check check (
    relationship_basis = 'review_required'
    or (
      relationship_basis_effective_at is not null
      and relationship_basis_recorded_by is not null
    )
  ),
  add constraint contacts_relationship_basis_verbal_note_check check (
    relationship_basis <> 'verbal_contact'
    or length(btrim(coalesce(relationship_basis_note, ''))) > 0
  ),
  add constraint contacts_ehc_consent_status_check check (
    ehc_consent_status in ('granted', 'not_requested', 'declined', 'withdrawn', 'clarification_needed')
  ),
  add constraint contacts_ehc_consent_source_check check (
    ehc_consent_source is null
    or ehc_consent_source in ('online_form', 'email', 'written', 'verbal_confirmed', 'manual_transfer', 'survalyzer_ehc')
  ),
  add constraint contacts_ehc_required_fields_check check (
    ehc_consent_status <> 'granted'
    or (
      ehc_consent_effective_at is not null
      and ehc_consent_source is not null
      and ehc_consent_recorded_by is not null
    )
  ),
  add constraint contacts_ehc_decision_time_check check (
    ehc_consent_status not in ('declined', 'withdrawn')
    or ehc_consent_effective_at is not null
  ),
  add constraint contacts_ehc_evidence_note_check check (
    ehc_consent_source not in ('verbal_confirmed', 'manual_transfer')
    or length(btrim(coalesce(ehc_consent_note, ''))) > 0
  );

create index if not exists contacts_ehc_only_idx
  on public.contacts (status, ehc_consent_status, mitmachen_consent_status, updated_at desc)
  where ehc_consent_status = 'granted' and mitmachen_consent_status <> 'granted';

create or replace function public.pre_gematik_prepare_contact_purpose_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  relationship_changed boolean;
  mitmachen_changed boolean;
  ehc_changed boolean;
begin
  relationship_changed := case
    when tg_op = 'INSERT' then
      new.relationship_basis <> 'review_required'
      or new.relationship_basis_effective_at is not null
      or new.relationship_basis_recorded_by is not null
      or new.relationship_basis_note is not null
    else
      row(
        old.relationship_basis,
        old.relationship_basis_effective_at,
        old.relationship_basis_recorded_by,
        old.relationship_basis_note
      ) is distinct from row(
        new.relationship_basis,
        new.relationship_basis_effective_at,
        new.relationship_basis_recorded_by,
        new.relationship_basis_note
      )
  end;

  mitmachen_changed := case
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

  ehc_changed := case
    when tg_op = 'INSERT' then
      new.ehc_consent_status <> 'not_requested'
      or new.ehc_consent_effective_at is not null
      or new.ehc_consent_source is not null
      or new.ehc_consent_text_version is not null
      or new.ehc_consent_recorded_by is not null
      or new.ehc_consent_note is not null
    else
      row(
        old.ehc_consent_status,
        old.ehc_consent_effective_at,
        old.ehc_consent_source,
        old.ehc_consent_text_version,
        old.ehc_consent_recorded_by,
        old.ehc_consent_note
      ) is distinct from row(
        new.ehc_consent_status,
        new.ehc_consent_effective_at,
        new.ehc_consent_source,
        new.ehc_consent_text_version,
        new.ehc_consent_recorded_by,
        new.ehc_consent_note
      )
  end;

  if relationship_changed or mitmachen_changed or ehc_changed then
    if new.updated_by is null then
      raise exception using
        errcode = '23502',
        message = 'Einwilligungs- und Beziehungsänderungen benötigen eine authentifizierte erfassende Person.';
    end if;
  end if;

  if relationship_changed then
    new.relationship_basis_recorded_by := new.updated_by;
    if new.relationship_basis <> 'review_required'
      and new.relationship_basis_effective_at > statement_timestamp()
    then
      raise exception using
        errcode = '23514',
        message = 'Der Wirksamkeitszeitpunkt der Beziehungsgrundlage darf nicht in der Zukunft liegen.';
    end if;
  end if;

  if mitmachen_changed then
    new.mitmachen_consent_recorded_by := new.updated_by;
    if new.mitmachen_consent_status in ('granted', 'declined', 'withdrawn')
      and new.mitmachen_consent_effective_at > statement_timestamp()
    then
      raise exception using
        errcode = '23514',
        message = 'Der Wirksamkeitszeitpunkt einer #Mitmachen-Einwilligung darf nicht in der Zukunft liegen.';
    end if;
  end if;

  if ehc_changed then
    new.ehc_consent_recorded_by := new.updated_by;
    if new.ehc_consent_status in ('granted', 'declined', 'withdrawn')
      and new.ehc_consent_effective_at > statement_timestamp()
    then
      raise exception using
        errcode = '23514',
        message = 'Der Wirksamkeitszeitpunkt einer EHC-Einwilligung darf nicht in der Zukunft liegen.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.pre_gematik_prepare_contact_purpose_write() from public;

create or replace function public.pre_gematik_log_contact_purpose_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
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
      ('relationship_basis', old.relationship_basis::text, new.relationship_basis::text),
      ('relationship_basis_effective_at', old.relationship_basis_effective_at::text, new.relationship_basis_effective_at::text),
      ('relationship_basis_recorded_by', old.relationship_basis_recorded_by::text, new.relationship_basis_recorded_by::text),
      ('relationship_basis_note', old.relationship_basis_note::text, new.relationship_basis_note::text),
      ('mitmachen_consent_status', old.mitmachen_consent_status::text, new.mitmachen_consent_status::text),
      ('mitmachen_consent_effective_at', old.mitmachen_consent_effective_at::text, new.mitmachen_consent_effective_at::text),
      ('mitmachen_consent_source', old.mitmachen_consent_source::text, new.mitmachen_consent_source::text),
      ('mitmachen_consent_text_version', old.mitmachen_consent_text_version::text, new.mitmachen_consent_text_version::text),
      ('mitmachen_consent_recorded_by', old.mitmachen_consent_recorded_by::text, new.mitmachen_consent_recorded_by::text),
      ('mitmachen_consent_note', old.mitmachen_consent_note::text, new.mitmachen_consent_note::text),
      ('ehc_consent_status', old.ehc_consent_status::text, new.ehc_consent_status::text),
      ('ehc_consent_effective_at', old.ehc_consent_effective_at::text, new.ehc_consent_effective_at::text),
      ('ehc_consent_source', old.ehc_consent_source::text, new.ehc_consent_source::text),
      ('ehc_consent_text_version', old.ehc_consent_text_version::text, new.ehc_consent_text_version::text),
      ('ehc_consent_recorded_by', old.ehc_consent_recorded_by::text, new.ehc_consent_recorded_by::text),
      ('ehc_consent_note', old.ehc_consent_note::text, new.ehc_consent_note::text)
  ) as delta(field_name, old_value, new_value)
  where delta.old_value is distinct from delta.new_value;

  return new;
end;
$$;

revoke all on function public.pre_gematik_log_contact_purpose_change() from public;

drop trigger if exists contacts_pre_gematik_prepare_contact_purpose_insert on public.contacts;
create trigger contacts_pre_gematik_prepare_contact_purpose_insert
before insert on public.contacts
for each row execute function public.pre_gematik_prepare_contact_purpose_write();

drop trigger if exists contacts_pre_gematik_prepare_contact_purpose_update on public.contacts;
create trigger contacts_pre_gematik_prepare_contact_purpose_update
before update of
  relationship_basis,
  relationship_basis_effective_at,
  relationship_basis_recorded_by,
  relationship_basis_note,
  mitmachen_consent_status,
  mitmachen_consent_effective_at,
  mitmachen_consent_source,
  mitmachen_consent_text_version,
  mitmachen_consent_recorded_by,
  mitmachen_consent_note,
  ehc_consent_status,
  ehc_consent_effective_at,
  ehc_consent_source,
  ehc_consent_text_version,
  ehc_consent_recorded_by,
  ehc_consent_note,
  updated_by
on public.contacts
for each row execute function public.pre_gematik_prepare_contact_purpose_write();

drop trigger if exists contacts_pre_gematik_log_contact_purpose_update on public.contacts;
create trigger contacts_pre_gematik_log_contact_purpose_update
after update of
  relationship_basis,
  relationship_basis_effective_at,
  relationship_basis_recorded_by,
  relationship_basis_note,
  mitmachen_consent_status,
  mitmachen_consent_effective_at,
  mitmachen_consent_source,
  mitmachen_consent_text_version,
  mitmachen_consent_recorded_by,
  mitmachen_consent_note,
  ehc_consent_status,
  ehc_consent_effective_at,
  ehc_consent_source,
  ehc_consent_text_version,
  ehc_consent_recorded_by,
  ehc_consent_note
on public.contacts
for each row execute function public.pre_gematik_log_contact_purpose_change();

commit;
