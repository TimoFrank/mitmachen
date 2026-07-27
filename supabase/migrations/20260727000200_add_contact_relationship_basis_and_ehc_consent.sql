begin;

alter table public.contacts
  add column if not exists relationship_basis text not null default 'review_required',
  add column if not exists relationship_basis_effective_at timestamptz,
  add column if not exists relationship_basis_recorded_by uuid references public.profiles(id),
  add column if not exists relationship_basis_note text,
  add column if not exists ehc_consent_status text not null default 'not_requested',
  add column if not exists ehc_consent_effective_at timestamptz,
  add column if not exists ehc_consent_source text,
  add column if not exists ehc_consent_text_version text,
  add column if not exists ehc_consent_recorded_by uuid references public.profiles(id),
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

create or replace function public.prepare_contact_consent_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
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
$function$;

revoke all on function public.log_contact_consent_changes() from public, anon, authenticated;

drop trigger if exists contacts_log_mitmachen_consent_changes on public.contacts;
create trigger contacts_log_mitmachen_consent_changes
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
for each row
execute function public.log_contact_consent_changes();

create or replace function public.can_access_ehc_contact(target_contact_id text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select coalesce((
    select
      not (
        contact.ehc_consent_status = 'granted'
        and contact.mitmachen_consent_status <> 'granted'
      )
      or public.current_profile_role() = 'admin'
      or contact.owner_id = auth.uid()
      or exists (
        select 1
        from public.contact_owners contact_owner
        where contact_owner.contact_id = contact.id
          and contact_owner.profile_id = auth.uid()
      )
    from public.contacts contact
    where contact.id = target_contact_id
  ), false);
$function$;

create or replace function public.can_write_ehc_contact(
  target_contact_id text,
  target_ehc_status text,
  target_mitmachen_status text,
  target_owner_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select
    not (
      target_ehc_status = 'granted'
      and target_mitmachen_status <> 'granted'
    )
    or public.current_profile_role() = 'admin'
    or target_owner_id = auth.uid()
    or exists (
      select 1
      from public.contact_owners contact_owner
      where contact_owner.contact_id = target_contact_id
        and contact_owner.profile_id = auth.uid()
    );
$function$;

create or replace function public.can_access_contact_reference(target_contact_id text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select target_contact_id is null or public.can_access_ehc_contact(target_contact_id);
$function$;

create or replace function public.can_access_contact_activity(
  target_contact_id text,
  target_entity_type text,
  target_entity_id text
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select case
    when target_contact_id is not null
      then public.can_access_ehc_contact(target_contact_id)
    when target_entity_type = 'hospitation'
      then coalesce((
        select public.can_access_contact_reference(hospitation.contact_id)
        from public.hospitations hospitation
        where hospitation.id::text = target_entity_id
      ), true)
    when target_entity_type = 'hospitation_slot'
      then coalesce((
        select public.can_access_contact_reference(slot.contact_id)
        from public.hospitation_slots slot
        where slot.id::text = target_entity_id
      ), true)
    else true
  end;
$function$;

revoke all on function public.can_access_ehc_contact(text) from public, anon;
revoke all on function public.can_write_ehc_contact(text, text, text, uuid) from public, anon;
revoke all on function public.can_access_contact_reference(text) from public, anon;
revoke all on function public.can_access_contact_activity(text, text, text) from public, anon;
grant execute on function public.can_access_ehc_contact(text) to authenticated, service_role;
grant execute on function public.can_write_ehc_contact(text, text, text, uuid) to authenticated, service_role;
grant execute on function public.can_access_contact_reference(text) to authenticated, service_role;
grant execute on function public.can_access_contact_activity(text, text, text) to authenticated, service_role;

drop policy if exists "contacts authenticated read active" on public.contacts;
create policy "contacts authenticated read active"
on public.contacts for select
to authenticated
using (
  (status <> 'archived' or public.current_profile_role() = 'admin')
  and public.can_access_ehc_contact(id)
);

drop policy if exists "contacts editor admin insert" on public.contacts;
create policy "contacts editor admin insert"
on public.contacts for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and status = 'active'
  and public.can_write_ehc_contact(id, ehc_consent_status, mitmachen_consent_status, owner_id)
);

drop policy if exists "contacts editor admin update active" on public.contacts;
create policy "contacts editor admin update active"
on public.contacts for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
  and public.can_access_ehc_contact(id)
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and updated_by = auth.uid()
  and status <> 'archived'
  and public.can_write_ehc_contact(id, ehc_consent_status, mitmachen_consent_status, owner_id)
);

drop policy if exists "contact owners authenticated read active contacts" on public.contact_owners;
create policy "contact owners authenticated read active contacts"
on public.contact_owners for select
to authenticated
using (
  public.can_access_ehc_contact(contact_id)
  and exists (
    select 1
    from public.contacts contact
    where contact.id = contact_id
      and (contact.status <> 'archived' or public.current_profile_role() = 'admin')
  )
);

drop policy if exists "contact owners editor admin insert" on public.contact_owners;
create policy "contact owners editor admin insert"
on public.contact_owners for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and assigned_by = auth.uid()
  and public.can_access_ehc_contact(contact_id)
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id and contact.status <> 'archived'
  )
  and exists (
    select 1 from public.profiles profile
    where profile.id = profile_id and profile.active = true
  )
);

drop policy if exists "contact owners editor admin update" on public.contact_owners;
create policy "contact owners editor admin update"
on public.contact_owners for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and public.can_access_ehc_contact(contact_id)
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and assigned_by = auth.uid()
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "contact owners editor admin delete" on public.contact_owners;
create policy "contact owners editor admin delete"
on public.contact_owners for delete
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "expert entity links authenticated read" on public.expert_entity_links;
create policy "expert entity links authenticated read"
on public.expert_entity_links for select
to authenticated
using (contact_id is null or public.can_access_ehc_contact(contact_id));

drop policy if exists "format participants authenticated read" on public.format_participants;
create policy "format participants authenticated read"
on public.format_participants for select
to authenticated
using (
  public.can_access_ehc_contact(contact_id)
  and exists (
    select 1 from public.formats
    where formats.id = format_participants.format_id
      and (formats.status <> 'Archiviert' or public.current_profile_role() = 'admin')
  )
);

drop policy if exists "format participants editor admin insert" on public.format_participants;
create policy "format participants editor admin insert"
on public.format_participants for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "format participants editor admin update" on public.format_participants;
create policy "format participants editor admin update"
on public.format_participants for update
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_ehc_contact(contact_id)
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and updated_by = (select auth.uid())
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "format participants editor admin delete" on public.format_participants;
create policy "format participants editor admin delete"
on public.format_participants for delete
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "hospitation slots authenticated read active" on public.hospitation_slots;
create policy "hospitation slots authenticated read active"
on public.hospitation_slots for select
to authenticated
using (
  (status <> 'Archiviert' or public.current_profile_role() = 'admin')
  and public.can_access_contact_reference(contact_id)
);

drop policy if exists "hospitation slots editor admin insert" on public.hospitation_slots;
create policy "hospitation slots editor admin insert"
on public.hospitation_slots for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'Archiviert'
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
  and public.can_access_contact_reference(contact_id)
);

drop policy if exists "hospitation slots editor admin update" on public.hospitation_slots;
create policy "hospitation slots editor admin update"
on public.hospitation_slots for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and public.can_access_contact_reference(contact_id)
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and public.can_access_contact_reference(contact_id)
);

drop policy if exists "hospitations authenticated read active" on public.hospitations;
create policy "hospitations authenticated read active"
on public.hospitations for select
to authenticated
using (
  (status <> 'Archiviert' or public.current_profile_role() = 'admin')
  and public.can_access_contact_reference(contact_id)
);

drop policy if exists "hospitations editor admin insert" on public.hospitations;
create policy "hospitations editor admin insert"
on public.hospitations for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'Archiviert'
  and (requester_profile_id is null or requester_profile_id = auth.uid())
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
  and public.can_access_contact_reference(contact_id)
);

drop policy if exists "hospitations editor admin update" on public.hospitations;
create policy "hospitations editor admin update"
on public.hospitations for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and public.can_access_contact_reference(contact_id)
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and public.can_access_contact_reference(contact_id)
);

drop policy if exists "roadmap assessments authenticated read" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments authenticated read"
on public.hospitation_roadmap_assessments for select
to authenticated
using (public.can_access_contact_activity(null, 'hospitation', hospitation_id::text));

drop policy if exists "roadmap assessments editor admin insert" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin insert"
on public.hospitation_roadmap_assessments for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by is null or created_by = (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
);

drop policy if exists "roadmap assessments editor admin update" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin update"
on public.hospitation_roadmap_assessments for update
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
);

drop policy if exists "roadmap assessments editor admin delete" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin delete"
on public.hospitation_roadmap_assessments for delete
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
);

drop policy if exists "unmet needs authenticated read" on public.hospitation_unmet_needs;
create policy "unmet needs authenticated read"
on public.hospitation_unmet_needs for select
to authenticated
using (
  (status <> 'Archiviert' or (select public.current_profile_role()) = 'admin')
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
);

drop policy if exists "unmet needs editor admin insert" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin insert"
on public.hospitation_unmet_needs for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and status <> 'Archiviert'
  and (created_by is null or created_by = (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
);

drop policy if exists "unmet needs editor admin update" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin update"
on public.hospitation_unmet_needs for update
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
);

drop policy if exists "unmet needs editor admin delete" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin delete"
on public.hospitation_unmet_needs for delete
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_contact_activity(null, 'hospitation', hospitation_id::text)
);

drop policy if exists "changes authenticated read" on public.changes;
create policy "changes authenticated read"
on public.changes for select
to authenticated
using (
  (select public.current_profile_role()) = 'admin'
  or (
    (select public.current_profile_role()) in ('viewer', 'editor')
    and public.can_access_ehc_contact(contact_id)
    and exists (
      select 1 from public.contacts contact
      where contact.id = contact_id and contact.status <> 'archived'
    )
  )
);

drop policy if exists "changes editor admin insert" on public.changes;
create policy "changes editor admin insert"
on public.changes for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and changed_by = auth.uid()
  and activity_event_id is null
  and canonicalized_at is null
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "activity events active profiles read" on public.activity_events;
create policy "activity events active profiles read"
on public.activity_events for select
to authenticated
using (
  (select public.current_profile_role()) = 'admin'
  or (
    (select public.current_profile_role()) in ('viewer', 'editor')
    and public.can_access_contact_activity(contact_id, entity_type, entity_id)
    and (
      contact_id is null
      or exists (
        select 1 from public.contacts contact
        where contact.id = contact_id and contact.status <> 'archived'
      )
    )
  )
);

drop policy if exists "contact notes team read" on public.contact_notes;
create policy "contact notes team read"
on public.contact_notes for select
to authenticated
using (
  (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and public.can_access_ehc_contact(contact_id)
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact notes editor insert" on public.contact_notes;
create policy "contact notes editor insert"
on public.contact_notes for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and public.can_access_ehc_contact(contact_id)
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id and contact.status <> 'archived'
  )
);

drop policy if exists "contact notes author update" on public.contact_notes;
create policy "contact notes author update"
on public.contact_notes for update
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  and public.can_access_ehc_contact(contact_id)
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and updated_by = (select auth.uid())
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "contact notes author delete" on public.contact_notes;
create policy "contact notes author delete"
on public.contact_notes for delete
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "contact attachments team read" on public.contact_note_attachments;
create policy "contact attachments team read"
on public.contact_note_attachments for select
to authenticated
using (
  (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and public.can_access_ehc_contact(contact_id)
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact attachments editor insert" on public.contact_note_attachments;
create policy "contact attachments editor insert"
on public.contact_note_attachments for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and uploader_id = (select auth.uid())
  and public.can_access_ehc_contact(contact_id)
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id and contact.status <> 'archived'
  )
);

drop policy if exists "contact attachments uploader update" on public.contact_note_attachments;
create policy "contact attachments uploader update"
on public.contact_note_attachments for update
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  and public.can_access_ehc_contact(contact_id)
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "contact attachments uploader delete" on public.contact_note_attachments;
create policy "contact attachments uploader delete"
on public.contact_note_attachments for delete
to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  and public.can_access_ehc_contact(contact_id)
);

drop policy if exists "contact images team read" on storage.objects;
create policy "contact images team read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and public.can_access_ehc_contact((storage.foldername(name))[1])
  and exists (
    select 1 from public.contacts contact
    where contact.id = (storage.foldername(name))[1]
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact images editor insert" on storage.objects;
create policy "contact images editor insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_ehc_contact((storage.foldername(name))[1])
);

drop policy if exists "contact images editor update" on storage.objects;
create policy "contact images editor update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_ehc_contact((storage.foldername(name))[1])
)
with check (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_ehc_contact((storage.foldername(name))[1])
);

drop policy if exists "contact images editor delete" on storage.objects;
create policy "contact images editor delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'contact-images'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_ehc_contact((storage.foldername(name))[1])
);

drop policy if exists "contact note attachments team read" on storage.objects;
create policy "contact note attachments team read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1
    from public.contact_note_attachments attachment
    join public.contacts contact on contact.id = attachment.contact_id
    where attachment.storage_path = name
      and public.can_access_ehc_contact(contact.id)
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact note attachments editor insert" on storage.objects;
create policy "contact note attachments editor insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and public.can_access_ehc_contact((storage.foldername(name))[1])
);

drop policy if exists "contact note attachments uploader delete" on storage.objects;
create policy "contact note attachments uploader delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (
    select 1 from public.contact_note_attachments attachment
    where attachment.storage_path = name
      and public.can_access_ehc_contact(attachment.contact_id)
      and (attachment.uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  )
);

commit;
