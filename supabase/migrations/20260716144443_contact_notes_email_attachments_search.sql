-- Issue #29: structured contact notes, documented e-mail text, private
-- attachments and permission-aware full-text search.

create or replace function public.immutable_text_array_join(values_to_join text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select coalesce(string_agg(value, ' ' order by ordinal), '')
  from unnest(coalesce(values_to_join, '{}'::text[])) with ordinality as item(value, ordinal);
$function$;

revoke all on function public.immutable_text_array_join(text[]) from public, anon;
grant execute on function public.immutable_text_array_join(text[]) to authenticated, service_role;

create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null references public.contacts(id) on delete cascade,
  content_type text not null default 'free_note'
    check (content_type in ('free_note', 'email_text')),
  body text not null,
  email_subject text,
  email_sender text,
  email_recipients text[] not null default '{}',
  email_occurred_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  search_vector tsvector generated always as (
    setweight(to_tsvector('german', coalesce(email_subject, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(email_sender, '') || ' ' || public.immutable_text_array_join(email_recipients)), 'C')
  ) stored,
  constraint contact_notes_body_length_check
    check (char_length(body) between 1 and 500000),
  constraint contact_notes_email_metadata_check
    check (
      content_type = 'email_text'
      or (
        email_subject is null
        and email_sender is null
        and cardinality(email_recipients) = 0
        and email_occurred_at is null
      )
    ),
  constraint contact_notes_contact_id_id_key unique (contact_id, id)
);

create table if not exists public.contact_note_attachments (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null references public.contacts(id) on delete cascade,
  note_id uuid not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  description text,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'complete', 'unsupported', 'failed')),
  extracted_text text,
  extraction_error text,
  uploaded_at timestamptz not null default now(),
  uploader_id uuid not null references public.profiles(id),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(file_name, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('german', coalesce(extracted_text, '')), 'C')
  ) stored,
  constraint contact_note_attachments_note_fkey
    foreign key (contact_id, note_id)
    references public.contact_notes(contact_id, id)
    on delete restrict,
  constraint contact_note_attachments_file_name_check
    check (char_length(btrim(file_name)) between 1 and 240),
  constraint contact_note_attachments_mime_type_check
    check (mime_type in (
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )),
  constraint contact_note_attachments_file_size_check
    check (file_size between 1 and 10485760),
  constraint contact_note_attachments_extracted_text_length_check
    check (extracted_text is null or char_length(extracted_text) <= 200000),
  constraint contact_note_attachments_extraction_state_check
    check (
      (extraction_status = 'complete' and extracted_text is not null and extraction_error is null)
      or (extraction_status = 'failed' and extraction_error is not null)
      or (extraction_status in ('pending', 'unsupported') and extracted_text is null)
    )
);

alter table public.contacts add column if not exists contact_search_vector tsvector
  generated always as (
    setweight(to_tsvector('german', coalesce(name, '') || ' ' || coalesce(organization, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(specialty, '') || ' ' || coalesce(sector, '') || ' ' || public.immutable_text_array_join(topics)), 'B') ||
    setweight(to_tsvector('simple', coalesce(city, '') || ' ' || coalesce(postal_code, '') || ' ' || coalesce(email, '')), 'C')
  ) stored;

create index if not exists contact_notes_contact_created_idx
  on public.contact_notes (contact_id, created_at desc);
create index if not exists contact_notes_created_by_idx
  on public.contact_notes (created_by);
create index if not exists contact_notes_search_idx
  on public.contact_notes using gin (search_vector);
create index if not exists contact_note_attachments_contact_note_idx
  on public.contact_note_attachments (contact_id, note_id, uploaded_at);
create index if not exists contact_note_attachments_uploader_idx
  on public.contact_note_attachments (uploader_id);
create index if not exists contact_note_attachments_search_idx
  on public.contact_note_attachments using gin (search_vector);
create index if not exists contacts_contact_search_idx
  on public.contacts using gin (contact_search_vector);

create or replace function public.prepare_contact_note_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
    if tg_op = 'INSERT' then
      new.created_by := (select auth.uid());
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.updated_by);
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$function$;

revoke all on function public.prepare_contact_note_write() from public, anon, authenticated;

drop trigger if exists contact_notes_prepare_write on public.contact_notes;
create trigger contact_notes_prepare_write
before insert or update on public.contact_notes
for each row execute function public.prepare_contact_note_write();

create or replace function public.log_contact_note_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  note_row public.contact_notes;
  contact_name text;
  event_key text;
  event_action text;
begin
  note_row := case when tg_op = 'DELETE' then old else new end;
  select c.name into contact_name from public.contacts c where c.id = note_row.contact_id;
  event_key := case
    when tg_op = 'INSERT' and note_row.content_type = 'email_text' then 'email.documented'
    when tg_op = 'INSERT' then 'note.created'
    when tg_op = 'UPDATE' then 'note.updated'
    else 'note.deleted'
  end;
  event_action := case when tg_op = 'INSERT' then case when note_row.content_type = 'email_text' then 'documented' else 'created' end
    when tg_op = 'UPDATE' then 'updated' else 'deleted' end;

  insert into public.activity_events (
    event_key, category, action, entity_type, entity_id, contact_id,
    actor_id, occurred_at, origin_type, correlation_id, "references", changes, metadata
  ) values (
    event_key,
    'note_document',
    event_action,
    'note',
    note_row.id::text,
    note_row.contact_id,
    coalesce((select auth.uid()), note_row.updated_by, note_row.created_by),
    statement_timestamp(),
    'manual',
    'contact:' || note_row.contact_id || ':note:' || note_row.id::text,
    jsonb_build_array(
      jsonb_build_object('type', 'contact', 'id', note_row.contact_id, 'label', coalesce(contact_name, 'Kontakt')),
      jsonb_build_object('type', 'note', 'id', note_row.id::text, 'label', case when note_row.content_type = 'email_text' then 'E-Mail-Text' else 'Notiz' end)
    ),
    case when tg_op = 'UPDATE'
      then jsonb_build_object('body', jsonb_build_object('before', old.body, 'after', new.body))
      else '{}'::jsonb
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'contact_name', contact_name,
      'content_type', note_row.content_type,
      'email_subject', note_row.email_subject
    ))
  );
  return note_row;
end;
$function$;

revoke all on function public.log_contact_note_activity() from public, anon, authenticated;

drop trigger if exists contact_notes_log_activity on public.contact_notes;
create trigger contact_notes_log_activity
after insert or update or delete on public.contact_notes
for each row execute function public.log_contact_note_activity();

create or replace function public.log_contact_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  attachment_row public.contact_note_attachments;
  contact_name text;
  event_key text;
  event_action text;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;
  attachment_row := case when tg_op = 'DELETE' then old else new end;
  select c.name into contact_name from public.contacts c where c.id = attachment_row.contact_id;
  event_key := case when tg_op = 'DELETE' then 'document.removed' else 'document.uploaded' end;
  event_action := case when tg_op = 'DELETE' then 'removed' else 'uploaded' end;

  insert into public.activity_events (
    event_key, category, action, entity_type, entity_id, contact_id,
    actor_id, occurred_at, origin_type, correlation_id, "references", changes, metadata
  ) values (
    event_key,
    'note_document',
    event_action,
    'document',
    attachment_row.id::text,
    attachment_row.contact_id,
    coalesce((select auth.uid()), attachment_row.uploader_id),
    statement_timestamp(),
    'manual',
    'contact:' || attachment_row.contact_id || ':note:' || attachment_row.note_id::text,
    jsonb_build_array(
      jsonb_build_object('type', 'contact', 'id', attachment_row.contact_id, 'label', coalesce(contact_name, 'Kontakt')),
      jsonb_build_object('type', 'note', 'id', attachment_row.note_id::text, 'label', 'Notiz'),
      jsonb_build_object('type', 'document', 'id', attachment_row.id::text, 'label', attachment_row.file_name)
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'contact_name', contact_name,
      'file_name', attachment_row.file_name,
      'mime_type', attachment_row.mime_type,
      'file_size', attachment_row.file_size,
      'extraction_status', attachment_row.extraction_status
    )
  );
  return attachment_row;
end;
$function$;

revoke all on function public.log_contact_attachment_activity() from public, anon, authenticated;

drop trigger if exists contact_note_attachments_log_activity on public.contact_note_attachments;
create trigger contact_note_attachments_log_activity
after insert or update or delete on public.contact_note_attachments
for each row execute function public.log_contact_attachment_activity();

alter table public.contact_notes enable row level security;
alter table public.contact_note_attachments enable row level security;

revoke all on public.contact_notes, public.contact_note_attachments from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.contact_notes to authenticated;
grant select, insert, update, delete on public.contact_note_attachments to authenticated;
grant select, insert, update, delete on public.contact_notes, public.contact_note_attachments to service_role;

drop policy if exists "contact notes team read" on public.contact_notes;
create policy "contact notes team read" on public.contact_notes for select to authenticated
using (
  (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact notes editor insert" on public.contact_notes;
create policy "contact notes editor insert" on public.contact_notes for insert to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (select 1 from public.contacts contact where contact.id = contact_id and contact.status <> 'archived')
);

drop policy if exists "contact notes author update" on public.contact_notes;
create policy "contact notes author update" on public.contact_notes for update to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and updated_by = (select auth.uid())
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
);

drop policy if exists "contact notes author delete" on public.contact_notes;
create policy "contact notes author delete" on public.contact_notes for delete to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
);

drop policy if exists "contact attachments team read" on public.contact_note_attachments;
create policy "contact attachments team read" on public.contact_note_attachments for select to authenticated
using (
  (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1 from public.contacts contact
    where contact.id = contact_id
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact attachments editor insert" on public.contact_note_attachments;
create policy "contact attachments editor insert" on public.contact_note_attachments for insert to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and uploader_id = (select auth.uid())
  and exists (select 1 from public.contacts contact where contact.id = contact_id and contact.status <> 'archived')
);

drop policy if exists "contact attachments uploader update" on public.contact_note_attachments;
create policy "contact attachments uploader update" on public.contact_note_attachments for update to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
)
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
);

drop policy if exists "contact attachments uploader delete" on public.contact_note_attachments;
create policy "contact attachments uploader delete" on public.contact_note_attachments for delete to authenticated
using (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-note-attachments',
  'contact-note-attachments',
  false,
  10485760,
  array[
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "contact note attachments team read" on storage.objects;
create policy "contact note attachments team read" on storage.objects for select to authenticated
using (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('viewer', 'editor', 'admin')
  and exists (
    select 1
    from public.contact_note_attachments attachment
    join public.contacts contact on contact.id = attachment.contact_id
    where attachment.storage_path = name
      and (contact.status <> 'archived' or (select public.current_profile_role()) = 'admin')
  )
);

drop policy if exists "contact note attachments editor insert" on storage.objects;
create policy "contact note attachments editor insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (
    select 1 from public.contacts contact
    where contact.id = (storage.foldername(name))[1]
      and contact.status <> 'archived'
  )
);

drop policy if exists "contact note attachments uploader delete" on storage.objects;
create policy "contact note attachments uploader delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'contact-note-attachments'
  and (select public.current_profile_role()) in ('editor', 'admin')
  and exists (
    select 1 from public.contact_note_attachments attachment
    where attachment.storage_path = name
      and (attachment.uploader_id = (select auth.uid()) or (select public.current_profile_role()) = 'admin')
  )
);

create or replace function public.search_contact_content(query_text text, result_limit integer default 40)
returns table (
  contact_id text,
  note_id uuid,
  attachment_id uuid,
  result_kind text,
  title text,
  snippet text,
  occurred_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with search_query as (
    select websearch_to_tsquery('german', btrim(query_text)) as query
  ), ranked as (
    select
      contact.id as contact_id,
      null::uuid as note_id,
      null::uuid as attachment_id,
      'contact'::text as result_kind,
      contact.name as title,
      concat_ws(' · ', nullif(contact.organization, ''), nullif(contact.specialty, ''), nullif(contact.city, '')) as snippet,
      contact.updated_at as occurred_at,
      (1.4 * ts_rank_cd(contact.contact_search_vector, search_query.query))::real as rank
    from public.contacts contact
    cross join search_query
    where contact.contact_search_vector @@ search_query.query

    union all

    select
      note.contact_id,
      note.id,
      null::uuid,
      note.content_type,
      coalesce(nullif(note.email_subject, ''), case when note.content_type = 'email_text' then 'E-Mail-Text' else 'Notiz' end),
      regexp_replace(
        ts_headline('german', note.body, search_query.query, 'MaxWords=24, MinWords=8, ShortWord=2'),
        '</?b>', '', 'gi'
      ),
      coalesce(note.email_occurred_at, note.created_at),
      ts_rank_cd(note.search_vector, search_query.query)::real
    from public.contact_notes note
    cross join search_query
    where note.search_vector @@ search_query.query

    union all

    select
      attachment.contact_id,
      attachment.note_id,
      attachment.id,
      'attachment'::text,
      attachment.file_name,
      regexp_replace(
        ts_headline(
          'german',
          concat_ws(' ', attachment.description, attachment.extracted_text),
          search_query.query,
          'MaxWords=24, MinWords=8, ShortWord=2'
        ),
        '</?b>', '', 'gi'
      ),
      attachment.uploaded_at,
      (0.85 * ts_rank_cd(attachment.search_vector, search_query.query))::real
    from public.contact_note_attachments attachment
    cross join search_query
    where attachment.search_vector @@ search_query.query
  )
  select ranked.contact_id, ranked.note_id, ranked.attachment_id, ranked.result_kind,
    ranked.title, ranked.snippet, ranked.occurred_at, ranked.rank
  from ranked
  where nullif(btrim(query_text), '') is not null
  order by ranked.rank desc, ranked.occurred_at desc
  limit greatest(1, least(coalesce(result_limit, 40), 100));
$function$;

revoke all on function public.search_contact_content(text, integer) from public, anon;
grant execute on function public.search_contact_content(text, integer) to authenticated, service_role;

comment on table public.contact_notes is 'Structured free notes and documented e-mail text attached to a care contact.';
comment on table public.contact_note_attachments is 'Metadata and extracted text for private contact-note documents; binary content lives in Storage.';
comment on column public.contact_note_attachments.storage_path is 'Private object path in the contact-note-attachments bucket; never a public URL.';
comment on column public.contact_note_attachments.extracted_text is 'Permission-aware, length-limited text extracted client-side from TXT, PDF or DOCX; OCR is out of scope.';
