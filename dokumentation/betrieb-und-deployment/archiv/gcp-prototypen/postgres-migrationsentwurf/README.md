# Archiv: Postgres-Migrationsentwurf

Dieser Ordner enthaelt einen alten Postgres-/Importentwurf aus der GCP-/Cloud-SQL-Experimentierphase.

Er ist nicht Teil des aktiven Root-Setups, kein freigegebenes gematik-Schema und kein aktueller Deployment-Pfad. Fuer das Kubernetes-Zielbild muessen Schema, Migration und Betriebsverfahren gemeinsam mit der gematik-IT abgestimmt werden.

Enthalten:

- `schema.sql`: historischer, idempotenter Schemaentwurf.
- `migrations/`: alte Einzelmigrationen und Daten-Seed-Entwuerfe.

Zugehoeriges historisches Skript:

- `../../../../../scripts/archiv/build_postgres_import_from_supabase.mjs`: alter Importgenerator aus Supabase-Daten.
