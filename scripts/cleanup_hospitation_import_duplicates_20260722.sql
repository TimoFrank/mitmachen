-- Bereinigt ausschliesslich die durch den Hospitations-Staging-Import
-- hospitation-staging-9748a7ea68cf3d698eddee0ab17d9eb0c934a236
-- am 2026-07-22 erzeugten Kontakt-, Organisations- und Termin-Dubletten.
--
-- Das Skript ist absichtlich konservativ:
--   * Standard ist ein assertions-gesicherter Dry-run mit ROLLBACK.
--   * Der Apply-Pfad muss explizit mit -v apply_cleanup=true aktiviert werden.
--   * Jede bekannte Abhaengigkeit wird vor dem Schreiben geprueft.
--   * Alle 44 Detailbeobachtungen und ihre 44 bisherigen Aenderungseintraege
--     werden vor dem Loeschen der Termin-Dubletten auf kanonische Termine verschoben.
--   * Bestehende, reichhaltigere Kontaktdaten bleiben kanonisch. Quellen werden
--     verlustfrei vereinigt. Sektor, Ort, Owner, Organisation und Bildmetadaten
--     werden aus der Dublette nur uebernommen, wenn sie kanonisch fehlen.
--   * contact-115 bleibt die kanonische technische ID und wird fachlich korrekt
--     auf den Namen Cornelia Weichard gesetzt.
--   * Beobachtungs-IDs, Inhalte und Codierungen werden per Fingerprint vor und
--     nach dem Merge auf unveraenderte Werte geprueft.
--
-- Voraussetzung vor Apply:
--   1. frisches erfolgreiches Cloud-SQL-On-Demand-Backup dokumentieren;
--   2. korrigierten Importer deployen oder den Import-Endpunkt bis dahin sperren;
--   3. Dry-run unmittelbar vor Apply ohne Fehler ausfuehren.
--
-- Dry-run (Default):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/cleanup_hospitation_import_duplicates_20260722.sql
--
-- Apply:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v apply_cleanup=true \
--     -f scripts/cleanup_hospitation_import_duplicates_20260722.sql

\set ON_ERROR_STOP on
\pset pager off

\if :{?apply_cleanup}
\else
  \set apply_cleanup false
\endif

\if :apply_cleanup
  \echo 'APPLY: Hospitations-Import-Dubletten werden nach erfolgreichem Preflight bereinigt.'
\else
  \echo 'DRY-RUN: Es werden keine dauerhaften Aenderungen vorgenommen.'
\endif

begin isolation level serializable;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

\if :apply_cleanup
  select pg_advisory_xact_lock(
    hashtextextended('versorgungs-kompass:hospitation-import-cleanup:20260722', 0)
  );

  lock table
    public.import_runs,
    public.organizations,
    public.organization_primary_systems,
    public.contacts,
    public.contact_owners,
    public.contact_notes,
    public.contact_note_attachments,
    public.changes,
    public.activity_events,
    public.format_participants,
    public.expert_entity_links,
    public.hospitation_slots,
    public.hospitations,
    public.hospitation_observations,
    public.hospitation_observation_changes,
    public.hospitation_roadmap_assessments,
    public.hospitation_unmet_needs
  in share row exclusive mode;
\endif

create temporary table _cleanup_constants (
  import_run_id text primary key,
  snapshot_id text not null,
  import_timestamp timestamptz not null,
  actor_id text not null
) on commit drop;

insert into _cleanup_constants values (
  'hospitation-staging-9748a7ea68cf3d698eddee0ab17d9eb0c934a236',
  '1406524f-4e60-40b4-86e9-fbbcad634737',
  timestamptz '2026-07-22 18:09:03.464+00',
  '47d2c8f8-5ae0-4fbd-b135-fd72a02feeb0'
);

create temporary table _cleanup_contact_map (
  duplicate_id text primary key,
  canonical_id text not null unique,
  canonical_organization_id text not null,
  label text not null
) on commit drop;

insert into _cleanup_contact_map (
  duplicate_id,
  canonical_id,
  canonical_organization_id,
  label
) values
  ('local-contact-dr-malinckrodt-1', 'contact-053', 'a6eddb10-0cc2-471b-8927-20b1690e0ae7', 'Christian von Mallinckrodt'),
  ('local-contact-dr-marcus-rothsching-2', 'contact-030', 'fd790f99-b6d3-4773-8d9b-2f6d27dda2fd', 'Marcus Rothsching'),
  ('local-contact-tilly-duderstadt-5', 'contact-106', 'a460cfbd-0aff-43aa-bb7b-508ad12743c1', 'Tilly Duderstadt'),
  ('local-contact-dr-jonas-frohlich-6', 'contact-035', '3c41bd77-5d25-413d-9b1a-9542c0ae5aa2', 'Jonas Froehlich'),
  ('local-contact-dr-antje-weichard-8', 'contact-114', 'b6e66a60-edeb-4610-a2b9-af42a291f085', 'Antje Weichard'),
  ('local-contact-dr-martin-deile-9', 'contact-021', '0ce65558-7445-4f72-b21d-7a3087c97de7', 'Martin Deile'),
  ('local-contact-dr-cornelia-weichard-10', 'contact-115', 'b6e66a60-edeb-4610-a2b9-af42a291f085', 'Cornelia Weichard'),
  ('local-contact-dr-lars-zimmermann-11', 'contact-126', '4daa4d52-ee82-4d29-ae09-ee20f795444c', 'Lars Zimmermann'),
  ('local-contact-dr-christian-koehler-12', 'contact-062', '8e947bbb-df3a-458c-8889-0725d729a7d8', 'Christian Koehler');

create temporary table _cleanup_hospitation_map (
  duplicate_id text primary key,
  canonical_id text not null unique,
  label text not null,
  expected_duplicate_observations integer not null,
  expected_canonical_observations_before integer not null
) on commit drop;

insert into _cleanup_hospitation_map (
  duplicate_id,
  canonical_id,
  label,
  expected_duplicate_observations,
  expected_canonical_observations_before
) values
  ('hospitation-2026-01-27-malinckrodt', 'c044ca8b-456c-9a2f-0895-3b4b4147a24d', 'Christian von Mallinckrodt', 0, 0),
  ('hospitation-2026-01-27-rothsching', '20f864c5-2742-c576-4a9d-8b2dad3e69ee', 'Marcus Rothsching', 0, 0),
  ('hospitation-2026-02-24-duderstadt', 'd0bd85d7-0d52-3a94-2f76-a23a96e6e90f', 'Tilly Duderstadt', 11, 0),
  ('hospitation-2026-03-02-froehlich', 'a5543c5a-7cd6-d039-57a3-484823bcfdd2', 'Jonas Froehlich', 0, 0),
  ('hospitation-2026-04-30-antje-weichard', 'a7ac358f-075f-f5e5-9a15-2fe145c5932f', 'Antje Weichard', 0, 0),
  ('hospitation-2026-06-10-deile', '332ed35e-7faa-8846-71c9-ed449e05108b', 'Martin Deile', 11, 1),
  ('hospitation-2026-06-23-cornelia-weichard', 'e5c0dccb-07ae-9d4f-e7cd-a273fb90662b', 'Cornelia/Caroline Weichard', 22, 1),
  ('hospitation-2026-06-24-zimmermann', '728bdaad-daa7-bc71-fa07-9d1815757857', 'Lars Zimmermann', 0, 1);

create temporary table _cleanup_organization_map (
  duplicate_id text primary key,
  canonical_id text not null unique,
  label text not null
) on commit drop;

insert into _cleanup_organization_map (duplicate_id, canonical_id, label) values
  ('local-organization-hausarzt-dr-martin-deile', '0ce65558-7445-4f72-b21d-7a3087c97de7', 'Hausarztpraxis Dr. Martin Deile'),
  ('local-organization-nordring-apotheke-apotheken-mit-herz', 'a460cfbd-0aff-43aa-bb7b-508ad12743c1', 'Nordring Apotheke'),
  ('local-organization-praxis-dr-jonas-frohlich-annika-walk-sina-danko', '3c41bd77-5d25-413d-9b1a-9542c0ae5aa2', 'Praxis Dr. Froehlich');

-- Diese fuenf vor dem Staging-Import vorhandenen generischen Beobachtungen
-- werden nicht verschoben oder geloescht. Drei liegen bereits auf den
-- kanonischen Merge-Zielen, zwei auf unabhaengigen Terminen.
create temporary table _cleanup_legacy_observation_expectations (
  observation_id text primary key,
  hospitation_id text not null
) on commit drop;

insert into _cleanup_legacy_observation_expectations (
  observation_id,
  hospitation_id
) values
  ('legacy-observation-332ed35e-7faa-8846-71c9-ed449e05108b', '332ed35e-7faa-8846-71c9-ed449e05108b'),
  ('legacy-observation-728bdaad-daa7-bc71-fa07-9d1815757857', '728bdaad-daa7-bc71-fa07-9d1815757857'),
  ('legacy-observation-e5c0dccb-07ae-9d4f-e7cd-a273fb90662b', 'e5c0dccb-07ae-9d4f-e7cd-a273fb90662b'),
  ('legacy-observation-unspecified', '82e81169-e90a-4b46-85b3-c47c1253ec44'),
  ('legacy-observation-73fffb72-d9ec-4b1b-872d-f748f9877ba5', '73fffb72-d9ec-4b1b-872d-f748f9877ba5');

create temporary table _cleanup_baseline on commit drop as
select
  (select count(*) from public.contacts) as contacts,
  (select count(*) from public.contact_owners) as contact_owners,
  (select count(*) from public.organizations) as organizations,
  (select count(*) from public.hospitations) as hospitations,
  (select count(*) from public.hospitation_observations) as observations,
  (select count(*) from public.hospitation_observation_changes) as observation_changes;

create temporary table _cleanup_contact_enrichment_baseline on commit drop as
select
  mapping.canonical_id,
  mapping.canonical_organization_id,
  duplicate_contact.sector as duplicate_sector,
  duplicate_contact.city as duplicate_city,
  duplicate_contact.federal_state as duplicate_federal_state,
  duplicate_contact.postal_code as duplicate_postal_code,
  duplicate_contact.owner_id as duplicate_owner_id,
  duplicate_contact.image_url as duplicate_image_url,
  duplicate_contact.image_storage_path as duplicate_image_storage_path
from _cleanup_contact_map mapping
join public.contacts duplicate_contact on duplicate_contact.id = mapping.duplicate_id;

-- Fachliche Fingerprints aller 44 zu verschiebenden Beobachtungen. Ausgenommen
-- sind nur die technisch zwingend zu aendernden Referenz- und Auditfelder.
create temporary table _cleanup_observation_baseline on commit drop as
select
  observation.id,
  md5((
    (
      to_jsonb(observation)
      - array['hospitation_id', 'payload', 'updated_at', 'updated_by']
    ) || jsonb_build_object(
      'payload', observation.payload - 'hospitationId'
    )
  )::text) as content_fingerprint
from public.hospitation_observations observation
join _cleanup_hospitation_map mapping
  on mapping.duplicate_id = observation.hospitation_id;

-- Harte Preflight-Pruefungen. Jeder Drift bricht das Skript vor dem ersten
-- dauerhaften Write ab.
do $cleanup_preflight$
declare
  expected_import_timestamp constant timestamptz := timestamptz '2026-07-22 18:09:03.464+00';
begin
  if (
    select count(*)
    from public.import_runs run
    join _cleanup_constants constants on constants.import_run_id = run.id
    where run.status = 'completed'
      and run.created_at = expected_import_timestamp
      and run.report->>'snapshotId' = constants.snapshot_id
      and run.report->>'manifestFingerprint' = 'sha256:9748a7ea68cf3d698eddee0ab17d9eb0c934a23677ad84a5d880c89446abbbdb'
  ) <> 1 then
    raise exception 'Preflight: der erwartete abgeschlossene Importlauf ist nicht eindeutig vorhanden.';
  end if;

  if (select count(*) from _cleanup_contact_map) <> 9 then
    raise exception 'Preflight: Kontakt-Mapping enthaelt nicht exakt 9 Eintraege.';
  end if;

  if (select count(*) from _cleanup_contact_enrichment_baseline) <> 9 then
    raise exception 'Preflight: Kontakt-Anreicherungsbasis enthaelt nicht exakt 9 Eintraege.';
  end if;

  if (
    select count(*)
    from public.contacts contact
    join _cleanup_contact_map mapping on mapping.duplicate_id = contact.id
    where contact.created_at = expected_import_timestamp
      and contact.updated_at = expected_import_timestamp
      and contact.status = 'active'
  ) <> 9 then
    raise exception 'Preflight: nicht alle 9 Kontakt-Dubletten sind unveraendert seit dem Import vorhanden.';
  end if;

  if (
    select count(*)
    from public.contacts contact
    join _cleanup_contact_map mapping on mapping.canonical_id = contact.id
    where contact.status <> 'archived'
      and (
        contact.organization_id is null
        or contact.organization_id = mapping.canonical_organization_id
      )
  ) <> 9 then
    raise exception 'Preflight: kanonische Kontakte fehlen, sind archiviert oder haben eine unerwartete Organisation.';
  end if;

  if (
    select count(*)
    from public.organizations organization
    join _cleanup_contact_map mapping
      on mapping.canonical_organization_id = organization.id
    where organization.status <> 'archived'
  ) <> 9 then
    raise exception 'Preflight: nicht alle kanonischen Kontaktorganisationen sind aktiv und eindeutig vorhanden.';
  end if;

  if (
    select count(*)
    from public.contact_owners owner_relation
    join _cleanup_contact_map mapping on mapping.duplicate_id = owner_relation.contact_id
    join _cleanup_constants constants on constants.actor_id = owner_relation.profile_id
  ) <> 9 then
    raise exception 'Preflight: die 9 erwarteten Owner-Relationen der Kontakt-Dubletten fehlen oder sind mehrdeutig.';
  end if;

  if (
    select count(*)
    from public.contact_owners owner_relation
    join _cleanup_contact_map mapping on mapping.duplicate_id = owner_relation.contact_id
  ) <> 9 then
    raise exception 'Preflight: mindestens eine Kontakt-Dublette hat eine unerwartete weitere Owner-Relation.';
  end if;

  if (
    select count(*)
    from public.contact_owners owner_relation
    join _cleanup_contact_map mapping on mapping.canonical_id = owner_relation.contact_id
    join _cleanup_constants constants on constants.actor_id = owner_relation.profile_id
  ) <> 9 then
    raise exception 'Preflight: Timo Frank ist nicht bei allen 9 kanonischen Kontakten bereits Owner.';
  end if;

  if (
    select count(*)
    from public.hospitations hospitation
    join _cleanup_contact_map mapping on mapping.duplicate_id = hospitation.contact_id
  ) <> 9 then
    raise exception 'Preflight: die Kontakt-Dubletten werden nicht von exakt 9 erwarteten Hospitationen referenziert.';
  end if;

  if exists (
    select 1 from public.contact_notes note
    join _cleanup_contact_map mapping on mapping.duplicate_id = note.contact_id
  ) or exists (
    select 1 from public.contact_note_attachments attachment
    join _cleanup_contact_map mapping on mapping.duplicate_id = attachment.contact_id
  ) or exists (
    select 1 from public.changes change_entry
    join _cleanup_contact_map mapping on mapping.duplicate_id = change_entry.contact_id
  ) or exists (
    select 1 from public.activity_events event
    join _cleanup_contact_map mapping on mapping.duplicate_id = event.contact_id
  ) or exists (
    select 1 from public.format_participants participant
    join _cleanup_contact_map mapping on mapping.duplicate_id = participant.contact_id
  ) or exists (
    select 1 from public.expert_entity_links entity_link
    join _cleanup_contact_map mapping on mapping.duplicate_id = entity_link.contact_id
  ) or exists (
    select 1 from public.hospitation_slots slot
    join _cleanup_contact_map mapping on mapping.duplicate_id = slot.contact_id
  ) then
    raise exception 'Preflight: mindestens eine Kontakt-Dublette hat inzwischen unerwartete fachliche Abhaengigkeiten.';
  end if;

  if (select count(*) from _cleanup_hospitation_map) <> 8 then
    raise exception 'Preflight: Hospitations-Mapping enthaelt nicht exakt 8 Eintraege.';
  end if;

  if (
    select count(*)
    from public.hospitations hospitation
    join _cleanup_hospitation_map mapping on mapping.duplicate_id = hospitation.id
    where hospitation.created_at = expected_import_timestamp
      and hospitation.updated_at = expected_import_timestamp
      and hospitation.status <> 'Archiviert'
  ) <> 8 then
    raise exception 'Preflight: nicht alle 8 Termin-Dubletten sind unveraendert seit dem Import vorhanden.';
  end if;

  if (
    select count(*)
    from public.hospitations hospitation
    join _cleanup_hospitation_map mapping on mapping.canonical_id = hospitation.id
    where hospitation.status <> 'Archiviert'
  ) <> 8 then
    raise exception 'Preflight: nicht alle 8 kanonischen Termine sind aktiv vorhanden.';
  end if;

  if exists (
    select 1
    from _cleanup_hospitation_map mapping
    where (
      select count(*)
      from public.hospitation_observations observation
      where observation.hospitation_id = mapping.duplicate_id
    ) <> mapping.expected_duplicate_observations
  ) then
    raise exception 'Preflight: die Beobachtungszahlen der Termin-Dubletten weichen vom Audit ab.';
  end if;

  if exists (
    select 1
    from _cleanup_hospitation_map mapping
    where (
      select count(*)
      from public.hospitation_observations observation
      where observation.hospitation_id = mapping.canonical_id
    ) <> mapping.expected_canonical_observations_before
  ) then
    raise exception 'Preflight: die Beobachtungszahlen der kanonischen Termine weichen vom Audit ab.';
  end if;

  if (
    select count(*)
    from public.hospitations hospitation
    join (
      values
        ('d0bd85d7-0d52-3a94-2f76-a23a96e6e90f'::text, 'Durchgefuehrt'::text),
        ('332ed35e-7faa-8846-71c9-ed449e05108b'::text, 'Dokumentiert'::text),
        ('e5c0dccb-07ae-9d4f-e7cd-a273fb90662b'::text, 'Dokumentiert'::text)
    ) expected(id, status_ascii)
      on expected.id = hospitation.id
    where case expected.status_ascii
      when 'Durchgefuehrt' then hospitation.status = 'Durchgeführt'
      else hospitation.status = expected.status_ascii
    end
  ) <> 3 then
    raise exception 'Preflight: die drei Beobachtungs-Zieltermine haben nicht die erwarteten Ausgangsstati.';
  end if;

  if (
    select count(*)
    from public.hospitation_observations observation
    join _cleanup_hospitation_map mapping on mapping.duplicate_id = observation.hospitation_id
    where observation.updated_at = expected_import_timestamp
      and observation.status = 'active'
  ) <> 44 then
    raise exception 'Preflight: nicht exakt 44 unveraenderte aktive Import-Beobachtungen gefunden.';
  end if;

  if (select count(*) from _cleanup_observation_baseline) <> 44 then
    raise exception 'Preflight: Beobachtungs-Fingerprintbasis enthaelt nicht exakt 44 IDs.';
  end if;

  if (
    select count(*)
    from _cleanup_legacy_observation_expectations expected
    join public.hospitation_observations observation
      on observation.id = expected.observation_id
     and observation.hospitation_id = expected.hospitation_id
    where observation.status = 'active'
  ) <> 5 then
    raise exception 'Preflight: die 5 bestehenden Legacy-Beobachtungen sind nicht unveraendert zugeordnet.';
  end if;

  if (
    select count(*)
    from public.hospitation_observation_changes change_entry
    join _cleanup_hospitation_map mapping on mapping.duplicate_id = change_entry.hospitation_id
    where change_entry.action = 'create'
  ) <> 44 then
    raise exception 'Preflight: nicht exakt 44 Create-Historieneintraege der Import-Beobachtungen gefunden.';
  end if;

  if exists (
    select 1
    from public.hospitation_observations duplicate_observation
    join _cleanup_hospitation_map mapping
      on mapping.duplicate_id = duplicate_observation.hospitation_id
    join public.hospitation_observations canonical_observation
      on canonical_observation.hospitation_id = mapping.canonical_id
     and coalesce(canonical_observation.sequence, -1) = coalesce(duplicate_observation.sequence, -1)
     and lower(regexp_replace(canonical_observation.title, '[^[:alnum:]]', '', 'g'))
       = lower(regexp_replace(duplicate_observation.title, '[^[:alnum:]]', '', 'g'))
  ) then
    raise exception 'Preflight: eine Import-Beobachtung kollidiert fachlich mit einer kanonischen Beobachtung.';
  end if;

  if exists (
    select 1 from public.hospitation_roadmap_assessments assessment
    join _cleanup_hospitation_map mapping on mapping.duplicate_id = assessment.hospitation_id
  ) or exists (
    select 1 from public.hospitation_unmet_needs unmet_need
    join _cleanup_hospitation_map mapping on mapping.duplicate_id = unmet_need.hospitation_id
  ) then
    raise exception 'Preflight: eine Termin-Dublette hat inzwischen Roadmap- oder Bedarfseintraege.';
  end if;

  if (
    select count(*)
    from public.hospitations hospitation
    where hospitation.id = 'hospitation-2026-07-16-koehler'
      and hospitation.contact_id = 'local-contact-dr-christian-koehler-12'
      and hospitation.organization_id = '8e947bbb-df3a-458c-8889-0725d729a7d8'
      and hospitation.created_at = expected_import_timestamp
  ) <> 1 then
    raise exception 'Preflight: der eindeutige Koehler-Termin ist nicht im erwarteten Zustand.';
  end if;

  if (
    select count(*)
    from public.hospitation_observations observation
    where observation.hospitation_id = 'hospitation-2026-07-16-koehler'
      and observation.status = 'active'
  ) <> 11 then
    raise exception 'Preflight: der eindeutige Koehler-Termin hat nicht exakt 11 aktive Beobachtungen.';
  end if;

  if (select count(*) from _cleanup_organization_map) <> 3 then
    raise exception 'Preflight: Organisations-Mapping enthaelt nicht exakt 3 Eintraege.';
  end if;

  if (
    select count(*)
    from public.organizations organization
    join _cleanup_organization_map mapping on mapping.duplicate_id = organization.id
    where organization.created_at = expected_import_timestamp
      and organization.updated_at = expected_import_timestamp
      and organization.status = 'active'
  ) <> 3 then
    raise exception 'Preflight: nicht alle 3 Organisations-Dubletten sind unveraendert seit dem Import vorhanden.';
  end if;

  if (
    select count(*)
    from public.organizations organization
    join _cleanup_organization_map mapping on mapping.canonical_id = organization.id
    where organization.status <> 'archived'
  ) <> 3 then
    raise exception 'Preflight: nicht alle 3 kanonischen Organisationen sind aktiv vorhanden.';
  end if;

  if (
    select count(*) from public.contacts contact
    join _cleanup_organization_map mapping on mapping.duplicate_id = contact.organization_id
  ) <> 3 or (
    select count(*) from public.hospitations hospitation
    join _cleanup_organization_map mapping on mapping.duplicate_id = hospitation.organization_id
  ) <> 3 then
    raise exception 'Preflight: Organisations-Dubletten haben nicht die erwarteten 3 Kontakt- und 3 Terminverweise.';
  end if;

  if exists (
    select 1 from public.organization_primary_systems primary_system
    join _cleanup_organization_map mapping on mapping.duplicate_id = primary_system.organization_id
  ) or exists (
    select 1 from public.expert_entity_links entity_link
    join _cleanup_organization_map mapping on mapping.duplicate_id = entity_link.organization_id
  ) or exists (
    select 1 from public.hospitation_slots slot
    join _cleanup_organization_map mapping on mapping.duplicate_id = slot.organization_id
  ) then
    raise exception 'Preflight: mindestens eine Organisations-Dublette hat unerwartete fachliche Abhaengigkeiten.';
  end if;
end
$cleanup_preflight$;

-- Sichtbare Dry-run-Ausgabe fuer die manuelle Freigabe.
select
  mapping.label,
  mapping.duplicate_id as contact_delete_id,
  duplicate_contact.name as contact_delete_name,
  mapping.canonical_id as contact_keep_id,
  canonical_contact.name as contact_keep_name,
  duplicate_contact.organization as duplicate_organization,
  canonical_contact.organization as canonical_organization
from _cleanup_contact_map mapping
join public.contacts duplicate_contact on duplicate_contact.id = mapping.duplicate_id
join public.contacts canonical_contact on canonical_contact.id = mapping.canonical_id
order by mapping.label;

select
  mapping.label,
  mapping.duplicate_id as hospitation_delete_id,
  mapping.canonical_id as hospitation_keep_id,
  duplicate_hospitation.starts_at,
  mapping.expected_duplicate_observations as observations_to_move,
  mapping.expected_canonical_observations_before as existing_canonical_observations
from _cleanup_hospitation_map mapping
join public.hospitations duplicate_hospitation on duplicate_hospitation.id = mapping.duplicate_id
order by duplicate_hospitation.starts_at, mapping.label;

select
  mapping.label,
  mapping.duplicate_id as organization_delete_id,
  mapping.canonical_id as organization_keep_id
from _cleanup_organization_map mapping
order by mapping.label;

select
  baseline.contacts as contacts_before,
  baseline.contacts - 9 as contacts_expected_after,
  baseline.organizations as organizations_before,
  baseline.organizations - 3 as organizations_expected_after,
  baseline.hospitations as hospitations_before,
  baseline.hospitations - 8 as hospitations_expected_after,
  baseline.observations as observations_before_and_after,
  baseline.observation_changes as observation_changes_before,
  baseline.observation_changes + 44 as observation_changes_expected_after
from _cleanup_baseline baseline;

\if :apply_cleanup

  -- Quellen der geloeschten Kontakte verlustfrei in den kanonischen Kontakten
  -- vereinigen. Alle reichhaltigeren kanonischen Fachfelder bleiben unberuehrt.
  with source_tokens as (
    select
      mapping.canonical_id,
      0 as source_priority,
      token.ordinality as token_order,
      btrim(token.value) as value
    from _cleanup_contact_map mapping
    join public.contacts canonical_contact on canonical_contact.id = mapping.canonical_id
    cross join lateral regexp_split_to_table(
      coalesce(canonical_contact.source, ''),
      '[[:space:]]*;[[:space:]]*'
    )
      with ordinality as token(value, ordinality)
    union all
    select
      mapping.canonical_id,
      1 as source_priority,
      token.ordinality as token_order,
      btrim(token.value) as value
    from _cleanup_contact_map mapping
    join public.contacts duplicate_contact on duplicate_contact.id = mapping.duplicate_id
    cross join lateral regexp_split_to_table(
      coalesce(duplicate_contact.source, ''),
      '[[:space:]]*;[[:space:]]*'
    )
      with ordinality as token(value, ordinality)
  ), ranked_tokens as (
    select
      canonical_id,
      source_priority,
      token_order,
      value,
      row_number() over (
        partition by canonical_id, value
        order by source_priority, token_order
      ) as duplicate_rank
    from source_tokens
    where value <> ''
  ), combined_sources as (
    select
      canonical_id,
      string_agg(value, '; ' order by source_priority, token_order) as source
    from ranked_tokens
    where duplicate_rank = 1
    group by canonical_id
  )
  update public.contacts canonical_contact
  set
    source = combined_sources.source,
    name = case
      when canonical_contact.id = 'contact-115' then 'Cornelia Weichard'
      else canonical_contact.name
    end,
    organization_id = mapping.canonical_organization_id,
    organization = case
      when nullif(btrim(canonical_contact.organization), '') is null
        then canonical_organization.name
      else canonical_contact.organization
    end,
    sector = coalesce(
      nullif(btrim(canonical_contact.sector), ''),
      nullif(btrim(duplicate_contact.sector), '')
    ),
    city = coalesce(
      nullif(btrim(canonical_contact.city), ''),
      nullif(btrim(duplicate_contact.city), '')
    ),
    federal_state = coalesce(
      nullif(btrim(canonical_contact.federal_state), ''),
      nullif(btrim(duplicate_contact.federal_state), '')
    ),
    postal_code = coalesce(
      nullif(btrim(canonical_contact.postal_code), ''),
      nullif(btrim(duplicate_contact.postal_code), '')
    ),
    owner_id = coalesce(
      nullif(btrim(canonical_contact.owner_id), ''),
      nullif(btrim(duplicate_contact.owner_id), ''),
      constants.actor_id
    ),
    image_url = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_url
      else canonical_contact.image_url
    end,
    image_source_url = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_source_url
      else canonical_contact.image_source_url
    end,
    image_source_label = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_source_label
      else canonical_contact.image_source_label
    end,
    image_rights_note = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_rights_note
      else canonical_contact.image_rights_note
    end,
    image_storage_path = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_storage_path
      else canonical_contact.image_storage_path
    end,
    image_kind = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_kind
      else canonical_contact.image_kind
    end,
    image_mime_type = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_mime_type
      else canonical_contact.image_mime_type
    end,
    image_file_size = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_file_size
      else canonical_contact.image_file_size
    end,
    image_width = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_width
      else canonical_contact.image_width
    end,
    image_height = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_height
      else canonical_contact.image_height
    end,
    image_updated_at = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_updated_at
      else canonical_contact.image_updated_at
    end,
    image_updated_by = case
      when nullif(btrim(canonical_contact.image_url), '') is null
       and nullif(btrim(canonical_contact.image_storage_path), '') is null
        then duplicate_contact.image_updated_by
      else canonical_contact.image_updated_by
    end,
    updated_at = clock_timestamp(),
    updated_by = constants.actor_id
  from combined_sources
  join _cleanup_contact_map mapping
    on mapping.canonical_id = combined_sources.canonical_id
  join public.contacts duplicate_contact
    on duplicate_contact.id = mapping.duplicate_id
  join public.organizations canonical_organization
    on canonical_organization.id = mapping.canonical_organization_id
  cross join _cleanup_constants constants
  where canonical_contact.id = combined_sources.canonical_id;

  -- Dasselbe fuer die drei eindeutig doppelten Organisationen.
  with source_tokens as (
    select
      mapping.canonical_id,
      0 as source_priority,
      token.ordinality as token_order,
      btrim(token.value) as value
    from _cleanup_organization_map mapping
    join public.organizations canonical_organization on canonical_organization.id = mapping.canonical_id
    cross join lateral regexp_split_to_table(
      coalesce(canonical_organization.source, ''),
      '[[:space:]]*;[[:space:]]*'
    )
      with ordinality as token(value, ordinality)
    union all
    select
      mapping.canonical_id,
      1 as source_priority,
      token.ordinality as token_order,
      btrim(token.value) as value
    from _cleanup_organization_map mapping
    join public.organizations duplicate_organization on duplicate_organization.id = mapping.duplicate_id
    cross join lateral regexp_split_to_table(
      coalesce(duplicate_organization.source, ''),
      '[[:space:]]*;[[:space:]]*'
    )
      with ordinality as token(value, ordinality)
  ), ranked_tokens as (
    select
      canonical_id,
      source_priority,
      token_order,
      value,
      row_number() over (
        partition by canonical_id, value
        order by source_priority, token_order
      ) as duplicate_rank
    from source_tokens
    where value <> ''
  ), combined_sources as (
    select
      canonical_id,
      string_agg(value, '; ' order by source_priority, token_order) as source
    from ranked_tokens
    where duplicate_rank = 1
    group by canonical_id
  )
  update public.organizations organization
  set
    source = combined_sources.source,
    updated_at = clock_timestamp(),
    updated_by = constants.actor_id
  from combined_sources
  cross join _cleanup_constants constants
  where organization.id = combined_sources.canonical_id
    and organization.source is distinct from combined_sources.source;

  -- Zuerst die bisherige Beobachtungshistorie umhaengen. Die historischen
  -- before_value/after_value-Snapshots bleiben absichtlich unveraendert und
  -- dokumentieren den urspruenglichen Importzustand wahrheitsgetreu.
  update public.hospitation_observation_changes change_entry
  set hospitation_id = mapping.canonical_id
  from _cleanup_hospitation_map mapping
  where change_entry.hospitation_id = mapping.duplicate_id;

  -- Danach die 44 Detailbeobachtungen verschieben. Der bestehende Trigger legt
  -- fuer jede Beobachtung einen neuen Update-Historieneintrag am kanonischen
  -- Termin an. Die stabile Beobachtungs-ID bleibt erhalten.
  update public.hospitation_observations observation
  set
    hospitation_id = mapping.canonical_id,
    payload = jsonb_set(
      observation.payload,
      '{hospitationId}',
      to_jsonb(mapping.canonical_id),
      true
    ),
    updated_at = clock_timestamp(),
    updated_by = constants.actor_id
  from _cleanup_hospitation_map mapping
  cross join _cleanup_constants constants
  where observation.hospitation_id = mapping.duplicate_id;

  -- Die drei Termine, die 44 Detailbeobachtungen erhalten, sind danach fachlich
  -- dokumentiert. Bestehende Dokumentationszeitpunkte werden bewahrt; fuer den
  -- bisher nur durchgefuehrten Duderstadt-Termin gilt der Importzeitpunkt.
  update public.hospitations canonical_hospitation
  set
    status = 'Dokumentiert',
    documented_at = coalesce(
      canonical_hospitation.documented_at,
      duplicate_hospitation.documented_at,
      constants.import_timestamp
    ),
    documented_by = coalesce(
      canonical_hospitation.documented_by,
      duplicate_hospitation.documented_by,
      constants.actor_id
    ),
    owner_id = coalesce(
      canonical_hospitation.owner_id,
      duplicate_hospitation.owner_id,
      constants.actor_id
    ),
    sector = coalesce(
      nullif(btrim(canonical_hospitation.sector), ''),
      nullif(btrim(duplicate_hospitation.sector), '')
    ),
    city = coalesce(
      nullif(btrim(canonical_hospitation.city), ''),
      nullif(btrim(duplicate_hospitation.city), '')
    ),
    location = coalesce(
      nullif(btrim(canonical_hospitation.location), ''),
      nullif(btrim(duplicate_hospitation.location), '')
    ),
    updated_at = clock_timestamp(),
    updated_by = constants.actor_id
  from _cleanup_hospitation_map mapping
  join public.hospitations duplicate_hospitation
    on duplicate_hospitation.id = mapping.duplicate_id
  cross join _cleanup_constants constants
  where canonical_hospitation.id = mapping.canonical_id
    and mapping.expected_duplicate_observations > 0;

  -- Eindeutige sachliche Korrekturen aus den Import-Dubletten. Andere
  -- Freitexte, Stati und Dokumentationen der kanonischen Termine bleiben stehen.
  update public.hospitations hospitation
  set
    location = 'Rüsselsheim',
    updated_at = clock_timestamp(),
    updated_by = constants.actor_id
  from _cleanup_constants constants
  where hospitation.id = 'c044ca8b-456c-9a2f-0895-3b4b4147a24d'
    and hospitation.city = 'Rüsselsheim'
    and hospitation.location = 'Hanau';

  update public.hospitations hospitation
  set
    location = 'Hanau',
    updated_at = clock_timestamp(),
    updated_by = constants.actor_id
  from _cleanup_constants constants
  where hospitation.id = '20f864c5-2742-c576-4a9d-8b2dad3e69ee'
    and hospitation.city = 'Hanau'
    and hospitation.location is null;

  update public.hospitations hospitation
  set
    contact_id = 'contact-126',
    organization_id = '4daa4d52-ee82-4d29-ae09-ee20f795444c',
    organization_name = 'GastroPraxis Magdeburg',
    federal_state = 'Sachsen-Anhalt',
    updated_at = clock_timestamp(),
    updated_by = constants.actor_id
  from _cleanup_constants constants
  where hospitation.id = '728bdaad-daa7-bc71-fa07-9d1815757857'
    and hospitation.contact_id is null
    and hospitation.organization_id is null;

  -- Der Koehler-Termin ist kein doppelter Termin. Er bleibt mit allen 11
  -- Beobachtungen erhalten und wird nur auf den vorhandenen Kontakt umgehaengt.
  update public.hospitations hospitation
  set
    contact_id = 'contact-062',
    updated_at = clock_timestamp(),
    updated_by = constants.actor_id
  from _cleanup_constants constants
  where hospitation.id = 'hospitation-2026-07-16-koehler'
    and hospitation.contact_id = 'local-contact-dr-christian-koehler-12';

  -- Kein Termin darf jetzt noch eine zu loeschende Kontakt- oder
  -- Organisations-ID referenzieren.
  do $cleanup_before_delete$
  begin
    if exists (
      select 1 from public.hospitations hospitation
      join _cleanup_contact_map mapping on mapping.duplicate_id = hospitation.contact_id
    ) then
      raise exception 'Cleanup: mindestens ein Termin verweist noch auf eine Kontakt-Dublette.';
    end if;

    if exists (
      select 1 from public.hospitation_observations observation
      join _cleanup_hospitation_map mapping on mapping.duplicate_id = observation.hospitation_id
    ) or exists (
      select 1 from public.hospitation_observation_changes change_entry
      join _cleanup_hospitation_map mapping on mapping.duplicate_id = change_entry.hospitation_id
    ) then
      raise exception 'Cleanup: Beobachtungen oder Historie verweisen noch auf eine Termin-Dublette.';
    end if;

    if (
      select count(*)
      from public.hospitation_observations observation
      join _cleanup_hospitation_map mapping on mapping.canonical_id = observation.hospitation_id
      where mapping.expected_duplicate_observations > 0
    ) <> 46 then
      -- 44 verschobene Detailbeobachtungen plus zwei bestehende Legacy-Rows
      -- bei Deile und Weichard.
      raise exception 'Cleanup: die erwarteten 46 Beobachtungen liegen nicht auf den drei kanonischen Zielterminen.';
    end if;
  end
  $cleanup_before_delete$;

  delete from public.hospitations duplicate_hospitation
  using _cleanup_hospitation_map mapping
  where duplicate_hospitation.id = mapping.duplicate_id;

  delete from public.contacts duplicate_contact
  using _cleanup_contact_map mapping
  where duplicate_contact.id = mapping.duplicate_id;

  delete from public.organizations duplicate_organization
  using _cleanup_organization_map mapping
  where duplicate_organization.id = mapping.duplicate_id;

  do $cleanup_postflight$
  declare
    baseline record;
  begin
    select * into strict baseline from _cleanup_baseline;

    if exists (
      select 1 from public.contacts contact
      join _cleanup_contact_map mapping on mapping.duplicate_id = contact.id
    ) or exists (
      select 1 from public.hospitations hospitation
      join _cleanup_hospitation_map mapping on mapping.duplicate_id = hospitation.id
    ) or exists (
      select 1 from public.organizations organization
      join _cleanup_organization_map mapping on mapping.duplicate_id = organization.id
    ) then
      raise exception 'Postflight: mindestens eine explizite Dubletten-ID ist noch vorhanden.';
    end if;

    if exists (
      select 1 from public.hospitations hospitation
      join _cleanup_contact_map mapping on mapping.duplicate_id = hospitation.contact_id
    ) or exists (
      select 1 from public.hospitation_slots slot
      join _cleanup_contact_map mapping on mapping.duplicate_id = slot.contact_id
    ) or exists (
      select 1 from public.contacts contact
      join _cleanup_organization_map mapping on mapping.duplicate_id = contact.organization_id
    ) or exists (
      select 1 from public.hospitations hospitation
      join _cleanup_organization_map mapping on mapping.duplicate_id = hospitation.organization_id
    ) or exists (
      select 1 from public.hospitation_slots slot
      join _cleanup_organization_map mapping on mapping.duplicate_id = slot.organization_id
    ) or exists (
      select 1 from public.hospitation_observations observation
      join _cleanup_hospitation_map mapping on mapping.duplicate_id = observation.hospitation_id
    ) or exists (
      select 1 from public.hospitation_observation_changes change_entry
      join _cleanup_hospitation_map mapping on mapping.duplicate_id = change_entry.hospitation_id
    ) then
      raise exception 'Postflight: mindestens eine alte ID wird noch fachlich referenziert.';
    end if;

    if (select count(*) from public.contacts) <> baseline.contacts - 9 then
      raise exception 'Postflight: Kontaktzahl hat sich nicht exakt um 9 reduziert.';
    end if;

    if (select count(*) from public.contact_owners) <> baseline.contact_owners - 9 then
      raise exception 'Postflight: Owner-Relationen haben sich nicht exakt um 9 reduziert.';
    end if;

    if (select count(*) from public.organizations) <> baseline.organizations - 3 then
      raise exception 'Postflight: Organisationszahl hat sich nicht exakt um 3 reduziert.';
    end if;

    if (select count(*) from public.hospitations) <> baseline.hospitations - 8 then
      raise exception 'Postflight: Terminzahl hat sich nicht exakt um 8 reduziert.';
    end if;

    if (select count(*) from public.hospitation_observations) <> baseline.observations then
      raise exception 'Postflight: Beobachtungszahl wurde unerwartet veraendert.';
    end if;

    if (
      select count(*)
      from _cleanup_observation_baseline saved
      join public.hospitation_observations observation on observation.id = saved.id
      where md5((
        (
          to_jsonb(observation)
          - array['hospitation_id', 'payload', 'updated_at', 'updated_by']
        ) || jsonb_build_object(
          'payload', observation.payload - 'hospitationId'
        )
      )::text) = saved.content_fingerprint
    ) <> 44 then
      raise exception 'Postflight: ID, Inhalt oder Codierung mindestens einer Import-Beobachtung wurde veraendert.';
    end if;

    if (
      select count(*)
      from _cleanup_legacy_observation_expectations expected
      join public.hospitation_observations observation
        on observation.id = expected.observation_id
       and observation.hospitation_id = expected.hospitation_id
      where observation.status = 'active'
    ) <> 5 then
      raise exception 'Postflight: mindestens eine der 5 bestehenden Legacy-Beobachtungen wurde veraendert oder verschoben.';
    end if;

    if (select count(*) from public.hospitation_observation_changes) <> baseline.observation_changes + 44 then
      raise exception 'Postflight: es wurden nicht exakt 44 neue Merge-Historieneintraege erzeugt.';
    end if;

    if exists (
      select 1
      from _cleanup_hospitation_map mapping
      where (
        select count(*)
        from public.hospitation_observations observation
        where observation.hospitation_id = mapping.canonical_id
      ) <> mapping.expected_duplicate_observations + mapping.expected_canonical_observations_before
    ) then
      raise exception 'Postflight: mindestens ein kanonischer Termin hat nicht die erwartete Beobachtungszahl.';
    end if;

    if (
      select count(*)
      from public.hospitations hospitation
      where hospitation.id in (
        'd0bd85d7-0d52-3a94-2f76-a23a96e6e90f',
        '332ed35e-7faa-8846-71c9-ed449e05108b',
        'e5c0dccb-07ae-9d4f-e7cd-a273fb90662b'
      )
        and hospitation.status = 'Dokumentiert'
        and hospitation.documented_at is not null
        and hospitation.documented_by is not null
        and hospitation.owner_id is not null
        and nullif(btrim(hospitation.sector), '') is not null
        and nullif(btrim(hospitation.city), '') is not null
        and nullif(btrim(hospitation.location), '') is not null
    ) <> 3 then
      raise exception 'Postflight: die drei Beobachtungs-Zieltermine sind nicht vollstaendig als Dokumentiert angereichert.';
    end if;

    if (
      select count(*)
      from public.hospitations hospitation
      where hospitation.id = 'hospitation-2026-07-16-koehler'
        and hospitation.contact_id = 'contact-062'
        and hospitation.organization_id = '8e947bbb-df3a-458c-8889-0725d729a7d8'
    ) <> 1 or (
      select count(*)
      from public.hospitation_observations observation
      where observation.hospitation_id = 'hospitation-2026-07-16-koehler'
        and observation.status = 'active'
    ) <> 11 then
      raise exception 'Postflight: Koehler-Termin oder seine 11 Beobachtungen wurden nicht korrekt erhalten.';
    end if;

    if (
      select count(*)
      from public.contact_owners owner_relation
      join _cleanup_contact_map mapping on mapping.canonical_id = owner_relation.contact_id
      join _cleanup_constants constants on constants.actor_id = owner_relation.profile_id
    ) <> 9 then
      raise exception 'Postflight: Owner-Zuordnung der kanonischen Kontakte ist nicht vollstaendig.';
    end if;

    if exists (
      select 1
      from _cleanup_contact_map mapping
      join public.contacts canonical_contact on canonical_contact.id = mapping.canonical_id
      where canonical_contact.organization_id is distinct from mapping.canonical_organization_id
        or nullif(btrim(canonical_contact.sector), '') is null
        or nullif(btrim(canonical_contact.city), '') is null
        or canonical_contact.owner_id is null
    ) then
      raise exception 'Postflight: Organisation, Sektor, Ort oder Owner eines kanonischen Kontakts fehlt.';
    end if;

    if exists (
      select 1
      from _cleanup_contact_enrichment_baseline saved
      join public.contacts canonical_contact on canonical_contact.id = saved.canonical_id
      where (
        nullif(btrim(saved.duplicate_image_url), '') is not null
        or nullif(btrim(saved.duplicate_image_storage_path), '') is not null
      ) and (
        nullif(btrim(canonical_contact.image_url), '') is null
        and nullif(btrim(canonical_contact.image_storage_path), '') is null
      )
    ) then
      raise exception 'Postflight: ein vorhandenes Import-Kontaktbild wurde nicht in den kanonischen Kontakt uebernommen.';
    end if;

    if (
      select count(*)
      from public.contacts contact
      where contact.id = 'contact-115'
        and contact.name = 'Cornelia Weichard'
    ) <> 1 then
      raise exception 'Postflight: contact-115 hat nicht den fachlich korrekten Namen Cornelia Weichard.';
    end if;
  end
  $cleanup_postflight$;

  commit;
  \echo 'APPLY erfolgreich: 9 Kontakte, 8 Termine und 3 Organisationen konsolidiert; Beobachtungszahl unveraendert.'

\else

  rollback;
  \echo 'DRY-RUN erfolgreich: alle Preflight-Assertions bestanden; keine Aenderungen gespeichert.'

\endif
