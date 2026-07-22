# Betrieb des geschützten Supabase-Übergangsbestands

Supabase ist derzeit Migrationsquelle und Schutzarchiv für den geschützten
Datenbestand. Es ist weder die Datenquelle der öffentlichen Pages-Demo noch ein
direkt aus dem Zielbrowser erreichbares Backend. Die Realanwendung greift nur
über die authentifizierte API auf Fachdaten zu.

## Grundregeln

- Keine Fachdaten, Datenexporte, Projektkoordinaten oder Schlüssel in Git.
- Kein Service-Role-, Publishable- oder Anon-Key im Browser-Artefakt.
- Keine Supabase-Auth-, Tabellen-, RPC- oder Storage-Aufrufe aus `dist/target/`.
- Geschützte Quellnachweise bleiben in `private.protected_source_snapshots`;
  RLS ist aktiviert und erzwungen, direkte Tabellenrechte sind entzogen.
- `stakeholder-logos`, `protected-source-assets` und `profile-images` bleiben
  privat. Die beiden Archiv-Buckets besitzen zusätzlich eine restriktive
  Browser-Deny-Policy.
- Migrationen zuerst sichern und prüfen; niemals ungeprüft `db push
  --include-all` verwenden, solange ältere History-Abweichungen bestehen.

## Regelmäßige Sicherheitsprüfung

Nach Schema-, Rollen- oder Storage-Änderungen:

1. `supabase db lint --linked` ausführen.
2. Security Advisor prüfen; Erwartung: keine ungeklärte Warnung.
3. Migration History lokal/remote vergleichen.
4. RLS, FORCE RLS, Grants, Funktionsrechte und feste `search_path` prüfen.
5. Als anonyme und authentifizierte Browserrolle negative Zugriffsproben auf
   Snapshots und Archiv-Buckets durchführen.
6. Zeilenzahl der geschützten Snapshots vor und nach reiner
   Sicherheitsmigration vergleichen.

Die wiederverwendbaren SQL-Abfragen stehen in
[`operations-checks.sql`](operations-checks.sql).

Aktueller bestätigter Stand vom 19. Juli 2026:

- 1.040 geschützte Snapshot-Zeilen unverändert,
- `private.protected_source_snapshots`: RLS und FORCE RLS aktiv,
- keine direkten Tabellenrechte für `anon`, `authenticated` oder
  `service_role`,
- öffentliche Funktions-Wrapper sind `SECURITY INVOKER`; privilegierte Helfer
  liegen im privaten Schema,
- drei betroffene Buckets sind privat,
- Datenbank-Lint ohne Fehler.

Offen bleibt die Aktivierung von „Prevent use of leaked passwords“ im Supabase
Dashboard, solange bestehende Übergangs-Auth-Konten noch benötigt werden. Nach
Aktivierung ist der Security Advisor erneut auszuführen.

## Backup

- Vor jeder Daten- oder Schemamigration einen verschlüsselten, zugriffsgeschützten
  Backup-/Dump-Stand außerhalb des Repositorys erstellen.
- Mindestens wöchentlich die Wiederherstellbarkeit des geschützten Bestands
  dokumentieren.
- Backup, Protokoll und Prüfsummen getrennt vom öffentlichen GitHub-Repository
  aufbewahren.
- Aufbewahrung und Löschfristen mit Datenschutz und Service Owner festlegen.

Beispiel bei kontrolliert gesetzter `DATABASE_URL`:

```bash
pg_dump "$DATABASE_URL" --format=custom --file /geschuetzter/pfad/versorgungs-kompass.dump
```

## Restore-Probe

1. Restore-Ziel und Verantwortliche festlegen; niemals ungeprüft in den
   Live-Bestand zurückspielen.
2. Frischen, isolierten Teststand anlegen.
3. Backup einspielen und Schema-/Migrationstand prüfen.
4. Anzahl und stabile IDs der 110 historischen Kontakte sowie Expertenkreis-,
   Stakeholder- und Asset-Klassen mit dem geschützten Nachweis vergleichen.
5. Rollenmatrix, API-Lese-/Schreibpfade und private Assets prüfen.
6. Laufzeit, Datenstand, Abweichungen und Ergebnis dokumentieren.
7. Teststand anschließend gemäß Schutz- und Löschkonzept entfernen.

## Migration in den Zielbetrieb

Der Cutover folgt dem
[Datenvertrag für den internen PoC](../dokumentation/betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md):

- freigegebenes Mapping von Supabase-Profilen auf stabile SSO-Subjects,
- vollständiger Export über einen geschützten Kanal,
- Import in Shared PostgreSQL/Object Storage,
- Zähl-, ID-, Pflichtfeld-, Asset- und Rollenabgleich,
- fachliche Abnahme,
- erst danach Entzug der nicht mehr benötigten Supabase-Zugriffe und
  datenschutzkonforme Löschung nach Aufbewahrungsbeschluss.

## Incident

Bei möglicher Offenlegung:

1. Zugriff und betroffenen Pfad sofort sperren.
2. Schlüssel oder Sitzungen rotieren/widerrufen, falls betroffen.
3. Logs und unveränderte Beweisspuren sichern.
4. Datenschutz, Informationssicherheit und Service Owner nach dem vereinbarten
   Meldeweg einbinden.
5. Git-Historie, Actions-Artefakte, Pages-Deployments und Caches separat
   bereinigen; ein normaler Folgecommit reicht nicht.
6. Negativtests und Advisor nach der Behebung wiederholen.
