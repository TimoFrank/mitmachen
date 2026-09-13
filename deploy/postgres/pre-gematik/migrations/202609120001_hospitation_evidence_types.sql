-- Nur Schemaänderung: bestehende Einordnungen und Quellen bleiben unverändert.
-- Vor Freigabe mit PostgreSQL 16 in einer isolierten Abnahmeinstanz prüfen.
begin;

alter table public.hospitation_observations
  alter column evidence_type set default '';

alter table public.hospitation_observations
  drop constraint if exists hospitation_observations_evidence_type_check;

alter table public.hospitation_observations
  add constraint hospitation_observations_evidence_type_check
  check (evidence_type in ('', 'directly_observed', 'source_bound', 'synthetic_source_based', 'reported', 'interpreted'));

commit;

-- Rücknahme ist ohne Datenänderung möglich, solange keine neuen Quellenarten
-- gespeichert wurden. Die alte CHECK-Bedingung muss zuerst erfolgreich sein;
-- andernfalls wird die gesamte Rücknahme abgebrochen. Keine Werte umcodieren.
-- begin;
-- alter table public.hospitation_observations
--   add constraint hospitation_observations_evidence_type_rollback_check
--   check (evidence_type in ('directly_observed', 'reported', 'interpreted'));
-- alter table public.hospitation_observations
--   drop constraint hospitation_observations_evidence_type_check;
-- alter table public.hospitation_observations
--   rename constraint hospitation_observations_evidence_type_rollback_check
--   to hospitation_observations_evidence_type_check;
-- alter table public.hospitation_observations
--   alter column evidence_type set default 'interpreted';
-- commit;
