-- Adds the authenticated TYPO3/Powermail #Mitmachen intake staging table.
-- Apply as the existing schema owner, never as the application login.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = public, pg_catalog;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-schema-v1', 0));

create table if not exists public.network_registrations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  schema_version text not null,
  source_system text not null,
  source_form_uid integer not null,
  source_record_uid bigint not null,
  source_payload_sha256 text not null,
  received_at timestamptz not null default now(),
  submitted_at timestamptz not null,
  status text not null default 'neu'
    check (status in ('neu', 'in_pruefung', 'uebernommen', 'abgelehnt')),
  onboarding_stage text not null default 'registered'
    check (onboarding_stage in ('registered', 'reviewed', 'linked', 'closed')),
  salutation text,
  title text,
  first_name text,
  last_name text,
  email text not null,
  organization text,
  sector text,
  message text,
  email_permission_status text not null default 'not_requested'
    check (
      email_permission_status in (
        'not_requested',
        'pending',
        'granted',
        'withdrawn',
        'blocked',
        'expired'
      )
    ),
  email_permission_requested_at timestamptz,
  consent_contact_version text,
  email_permission_confirmed_at timestamptz,
  email_permission_evidence_ref text,
  privacy_notice_version text not null,
  privacy_notice_presented_at timestamptz not null,
  form_version text not null,
  language text not null default 'de',
  source_url text not null,
  privacy_check_status text not null default 'bereit_zur_pruefung'
    check (privacy_check_status in ('bereit_zur_pruefung', 'freigegeben', 'gesperrt')),
  retention_review_at timestamptz not null default (now() + interval '6 months'),
  duplicate_hint text,
  contact_id text references public.contacts(id) on delete set null,
  organization_id text references public.organizations(id) on delete set null,
  processed_at timestamptz,
  processed_by text references public.profiles(id) on delete set null,
  processing_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint network_registrations_submission_id_key unique (submission_id),
  constraint network_registrations_source_record_key
    unique (source_system, source_form_uid, source_record_uid),
  constraint network_registrations_submission_uuid_v4_check check (
    submission_id::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  ),
  constraint network_registrations_schema_version_check
    check (schema_version = 'mitmachen-typo3-registration-v1'),
  constraint network_registrations_source_system_check
    check (source_system = 'typo3_powermail'),
  constraint network_registrations_source_identifiers_check check (
    source_form_uid = 41
    and source_record_uid between 1 and 9007199254740991
  ),
  constraint network_registrations_source_payload_sha256_check check (
    source_payload_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint network_registrations_submission_timeline_check check (
    received_at >= submitted_at - interval '15 minutes'
    and privacy_notice_presented_at <= submitted_at
    and privacy_notice_presented_at >= submitted_at - interval '24 hours'
    and retention_review_at > received_at
  ),
  constraint network_registrations_email_check check (
    email = lower(btrim(email))
    and length(email) <= 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint network_registrations_optional_text_check check (
    (salutation is null or (salutation = btrim(salutation) and nullif(salutation, '') is not null and length(salutation) <= 80))
    and (title is null or (title = btrim(title) and nullif(title, '') is not null and length(title) <= 80))
    and (first_name is null or (first_name = btrim(first_name) and nullif(first_name, '') is not null and length(first_name) <= 120))
    and (last_name is null or (last_name = btrim(last_name) and nullif(last_name, '') is not null and length(last_name) <= 120))
    and (organization is null or (organization = btrim(organization) and nullif(organization, '') is not null and length(organization) <= 240))
    and (sector is null or (sector = btrim(sector) and nullif(sector, '') is not null and length(sector) <= 120))
    and (message is null or (message = btrim(message) and nullif(message, '') is not null and length(message) <= 3000))
  ),
  constraint network_registrations_version_and_source_check check (
    nullif(btrim(form_version), '') is not null
    and length(form_version) <= 120
    and nullif(btrim(privacy_notice_version), '') is not null
    and length(privacy_notice_version) <= 120
    and (consent_contact_version is null or (
      consent_contact_version = btrim(consent_contact_version)
      and nullif(consent_contact_version, '') is not null
      and length(consent_contact_version) <= 120
    ))
    and language = 'de'
    and source_url = 'https://www.gematik.de/mitmachen/versorgungs-netzwerk'
  ),
  constraint network_registrations_email_permission_request_check check (
    (
      email_permission_status = 'not_requested'
      and email_permission_requested_at is null
      and consent_contact_version is null
    )
    or (
      email_permission_status <> 'not_requested'
      and email_permission_requested_at = submitted_at
      and consent_contact_version is not null
    )
  ),
  constraint network_registrations_email_permission_evidence_pair_check check (
    (email_permission_confirmed_at is null and email_permission_evidence_ref is null)
    or (
      email_permission_confirmed_at is not null
      and email_permission_requested_at is not null
      and email_permission_confirmed_at >= email_permission_requested_at
      and email_permission_evidence_ref = btrim(email_permission_evidence_ref)
      and nullif(btrim(email_permission_evidence_ref), '') is not null
      and length(email_permission_evidence_ref) <= 500
    )
  ),
  constraint network_registrations_email_permission_doi_check check (
    (
      email_permission_status = 'granted'
      and email_permission_confirmed_at is not null
      and email_permission_evidence_ref is not null
    )
    or (
      email_permission_status in ('pending', 'expired')
      and email_permission_confirmed_at is null
      and email_permission_evidence_ref is null
    )
    or email_permission_status in ('not_requested', 'withdrawn', 'blocked')
  ),
  constraint network_registrations_processing_check check (
    (processed_at is null and processed_by is null)
    or (processed_at is not null and processed_by is not null)
  ),
  check (duplicate_hint is null or length(btrim(duplicate_hint)) between 1 and 500),
  check (processing_note is null or length(btrim(processing_note)) between 1 and 2000)
);

create index if not exists network_registrations_status_submitted_idx
  on public.network_registrations (status, submitted_at desc);
create index if not exists network_registrations_email_lower_idx
  on public.network_registrations (lower(email));
create index if not exists network_registrations_permission_status_idx
  on public.network_registrations (email_permission_status, submitted_at desc);
create index if not exists network_registrations_retention_review_idx
  on public.network_registrations (retention_review_at, id)
  where status <> 'uebernommen';

drop trigger if exists network_registrations_pre_gematik_touch_updated_at on public.network_registrations;
create trigger network_registrations_pre_gematik_touch_updated_at
before update on public.network_registrations
for each row execute function public.pre_gematik_touch_updated_at();

revoke all on table public.network_registrations from public;
revoke all privileges on table public.network_registrations from vk_app_runtime;
grant select, insert on table public.network_registrations to vk_app_runtime;

commit;
