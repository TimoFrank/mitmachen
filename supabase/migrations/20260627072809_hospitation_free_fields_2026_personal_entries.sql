begin;

alter table public.hospitation_slots add column if not exists contact_name text;
alter table public.hospitation_slots add column if not exists organization_name text;
alter table public.hospitation_slots add column if not exists city text;
alter table public.hospitation_slots add column if not exists federal_state text;
alter table public.hospitation_slots add column if not exists sector text;

alter table public.hospitations add column if not exists contact_name text;
alter table public.hospitations add column if not exists organization_name text;
alter table public.hospitations add column if not exists city text;
alter table public.hospitations add column if not exists federal_state text;
alter table public.hospitations add column if not exists sector text;

delete from public.hospitations
where id::text like '00000000-0000-4000-8000-0000000002%'
   or request_note ilike 'Demo:%';

delete from public.hospitation_slots
where id::text like '00000000-0000-4000-8000-0000000001%'
   or notes ilike 'Demo:%';

with personal_hospitations (
  slug,
  contact_name,
  location,
  city,
  starts_at,
  ends_at,
  request_note
) as (
  values
    (
      'hospitation-2026-01-27-malinckrodt',
      'Dr. Malinckrodt',
      'Hanau',
      'Hanau',
      '2026-01-27T09:00:00+01:00'::timestamptz,
      '2026-01-27T11:00:00+01:00'::timestamptz,
      'Hospitation bei Dr. Malinckrodt in Hanau. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-01-27-rothsching',
      'Dr. Marcus Rothsching',
      null,
      null,
      '2026-01-27T09:00:00+01:00'::timestamptz,
      '2026-01-27T11:00:00+01:00'::timestamptz,
      'Hospitation bei Dr. Marcus Rothsching. Ort und Kontaktprofil werden später ergänzt.'
    ),
    (
      'hospitation-2026-02-02-claus',
      'Christoph Claus',
      'Grebenstein',
      'Grebenstein',
      '2026-02-02T09:00:00+01:00'::timestamptz,
      '2026-02-02T11:00:00+01:00'::timestamptz,
      'Hospitation bei Christoph Claus in Grebenstein. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-02-16-walther',
      'Felix Walther',
      'Chemnitz',
      'Chemnitz',
      '2026-02-16T09:00:00+01:00'::timestamptz,
      '2026-02-16T11:00:00+01:00'::timestamptz,
      'Hospitation bei Felix Walther in Chemnitz. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-02-24-duderstadt',
      'Tilly Duderstadt',
      'Berlin',
      'Berlin',
      '2026-02-24T09:00:00+01:00'::timestamptz,
      '2026-02-24T11:00:00+01:00'::timestamptz,
      'Hospitation bei Tilly Duderstadt in Berlin. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-03-02-froehlich',
      'Dr. Jonas Fröhlich',
      'Kaiserslautern',
      'Kaiserslautern',
      '2026-03-02T09:00:00+01:00'::timestamptz,
      '2026-03-02T11:00:00+01:00'::timestamptz,
      'Hospitation bei Dr. Jonas Fröhlich in Kaiserslautern. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-03-12-rau',
      'Florian Rau',
      'Harsfeld',
      'Harsfeld',
      '2026-03-12T09:00:00+01:00'::timestamptz,
      '2026-03-12T11:00:00+01:00'::timestamptz,
      'Hospitation bei Florian Rau in Harsfeld. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-04-30-antje-weichard',
      'Dr. Antje Weichard',
      'Magdeburg',
      'Magdeburg',
      '2026-04-30T09:00:00+02:00'::timestamptz,
      '2026-04-30T11:00:00+02:00'::timestamptz,
      'Hospitation bei Dr. Antje Weichard in Magdeburg. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-06-10-deile',
      'Dr. Martin Deile',
      'Dresden',
      'Dresden',
      '2026-06-10T09:00:00+02:00'::timestamptz,
      '2026-06-10T11:00:00+02:00'::timestamptz,
      'Hospitation bei Dr. Martin Deile in Dresden. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-06-23-cornelia-weichard',
      'Dr. Cornelia Weichard',
      'Magdeburg',
      'Magdeburg',
      '2026-06-23T09:00:00+02:00'::timestamptz,
      '2026-06-23T11:00:00+02:00'::timestamptz,
      'Hospitation bei Dr. Cornelia Weichard in Magdeburg. Kontaktprofil wird später ergänzt.'
    ),
    (
      'hospitation-2026-06-24-zimmermann',
      'Dr. Lars Zimmermann',
      'Magdeburg',
      'Magdeburg',
      '2026-06-24T09:00:00+02:00'::timestamptz,
      '2026-06-24T11:00:00+02:00'::timestamptz,
      'Hospitation bei Dr. Lars Zimmermann in Magdeburg. Kontaktprofil wird später ergänzt.'
    )
)
insert into public.hospitations (
  id,
  contact_name,
  requester_profile_id,
  owner_id,
  status,
  requested_windows,
  starts_at,
  ends_at,
  location,
  city,
  goal,
  topics,
  request_note,
  created_at,
  created_by,
  updated_at,
  updated_by
)
select
  (
    substr(md5(slug), 1, 8) || '-' ||
    substr(md5(slug), 9, 4) || '-' ||
    substr(md5(slug), 13, 4) || '-' ||
    substr(md5(slug), 17, 4) || '-' ||
    substr(md5(slug), 21, 12)
  )::uuid,
  contact_name,
  '47d2c8f8-5ae0-4fbd-b135-fd72a02feeb0'::uuid,
  '47d2c8f8-5ae0-4fbd-b135-fd72a02feeb0'::uuid,
  'Durchgeführt',
  '[]'::jsonb,
  starts_at,
  ends_at,
  location,
  city,
  'Hospitationstermin aus persönlicher Liste.',
  array['Hospitation', 'Versorgungskontakt']::text[],
  request_note,
  now(),
  '47d2c8f8-5ae0-4fbd-b135-fd72a02feeb0'::uuid,
  now(),
  '47d2c8f8-5ae0-4fbd-b135-fd72a02feeb0'::uuid
from personal_hospitations
on conflict (id) do update
set
  contact_name = excluded.contact_name,
  requester_profile_id = excluded.requester_profile_id,
  owner_id = excluded.owner_id,
  status = excluded.status,
  requested_windows = excluded.requested_windows,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  location = excluded.location,
  city = excluded.city,
  goal = excluded.goal,
  topics = excluded.topics,
  request_note = excluded.request_note,
  updated_at = now(),
  updated_by = excluded.updated_by;

commit;
