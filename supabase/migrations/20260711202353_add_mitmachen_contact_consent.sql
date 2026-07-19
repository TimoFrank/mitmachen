do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'mitmachen_consent_status'
  ) then
    alter table public.contacts
      add column mitmachen_consent_status text not null default 'not_requested';

    update public.contacts
    set mitmachen_consent_status = 'clarification_needed';
  end if;
end
$$;

alter table public.contacts add column if not exists mitmachen_consent_effective_at timestamptz;
alter table public.contacts add column if not exists mitmachen_consent_source text;
alter table public.contacts add column if not exists mitmachen_consent_text_version text;
alter table public.contacts add column if not exists mitmachen_consent_recorded_by uuid references public.profiles(id);
alter table public.contacts add column if not exists mitmachen_consent_note text;

alter table public.contacts drop constraint if exists contacts_mitmachen_consent_status_check;
alter table public.contacts
  add constraint contacts_mitmachen_consent_status_check
  check (mitmachen_consent_status in ('granted', 'not_requested', 'declined', 'withdrawn', 'clarification_needed'));

alter table public.contacts drop constraint if exists contacts_mitmachen_consent_source_check;
alter table public.contacts
  add constraint contacts_mitmachen_consent_source_check
  check (
    mitmachen_consent_source is null
    or mitmachen_consent_source in ('online_form', 'email', 'written', 'verbal_confirmed', 'manual_transfer')
  );

alter table public.contacts drop constraint if exists contacts_mitmachen_consent_required_fields_check;
alter table public.contacts
  add constraint contacts_mitmachen_consent_required_fields_check
  check (
    mitmachen_consent_status <> 'granted'
    or (
      mitmachen_consent_effective_at is not null
      and mitmachen_consent_source is not null
      and mitmachen_consent_recorded_by is not null
    )
  );

alter table public.contacts drop constraint if exists contacts_mitmachen_consent_decision_time_check;
alter table public.contacts
  add constraint contacts_mitmachen_consent_decision_time_check
  check (
    mitmachen_consent_status not in ('declined', 'withdrawn')
    or mitmachen_consent_effective_at is not null
  );

alter table public.contacts drop constraint if exists contacts_mitmachen_verbal_note_check;
alter table public.contacts
  add constraint contacts_mitmachen_verbal_note_check
  check (
    mitmachen_consent_source <> 'verbal_confirmed'
    or (
      mitmachen_consent_status = 'granted'
      and length(btrim(coalesce(mitmachen_consent_note, ''))) > 0
    )
  );
