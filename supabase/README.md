# Geschuetzter Datenbestand und Migrationen

Dieser Ordner enthaelt das Datenbankschema, additive Migrationen und Betriebsanleitungen fuer den geschuetzten Backend-Datenbestand. Er ist keine Quelle fuer GitHub Pages. Die oeffentliche Demo besitzt ausschliesslich synthetische Daten; die Realanwendung greift nur ueber die authentifizierte API auf Fachdaten zu.

## Sicherheitsgrenze

- Keine Service-Role-Keys, Projektkoordinaten, Backups oder Fachdaten in diesem Repository ablegen.
- Frontend-Quellen enthalten keine direkte produktive Supabase-Konfiguration.
- `contacts`, Expertenkreis und Stakeholder bleiben in geschuetzten Tabellen mit RLS beziehungsweise hinter der Ziel-API.
- Quellnachweise liegen in `private.protected_source_snapshots`. `anon`, `authenticated` und `service_role` besitzen keine Tabellenrechte; RLS ist aktiviert und erzwungen. `authenticated` erhaelt auf dem Schema nur `USAGE`, damit eng begrenzte Rollen-Hilfsfunktionen ausgefuehrt werden koennen.
- Kontakt-, Profil-, Stakeholder- und Quellassets liegen in privaten Storage-Buckets. Die Archiv-Buckets verweigern Browserrollen den Zugriff auch bei spaeter hinzukommenden permissiven Policies; Profilbilder bleiben authentifizierten Teamrollen beziehungsweise der Ziel-API vorbehalten.

## Schema und Migrationen

`schema.sql` beschreibt einen frischen Sollstand. Bestehende Umgebungen werden ausschliesslich ueber die Dateien in `migrations/` weiterentwickelt. Migrationen sind vor Anwendung zu sichern, in einer Testumgebung zu pruefen und nach Anwendung mit Schema-, RLS- und Storage-Abfragen zu verifizieren.

Die historischen Daten-Seeds wurden zu dokumentierten No-ops bereinigt. Operative Kontakte, Expertenkreis- und Stakeholder-Zeilen werden nicht mehr aus dem Git-Repository aufgebaut. Eine Wiederherstellung erfolgt aus dem freigegebenen geschuetzten Backup-/Migrationsweg.

Die Migration `20260719154214_reconcile_security_and_protected_storage.sql` ist die fuehrende, idempotente Supabase-Sicherheits-Reconciliation. Sie trennt exponierte `SECURITY INVOKER`-Wrapper von privilegierten Implementierungen, entzieht Browserrollen die direkte Ausfuehrung von Triggerfunktionen und sichert die privaten Storage-Grenzen ab. `20260718165854_owasp_security_hardening_2025.sql` ist ein bewusst leerer, als angewandt markierter Vorgaengereintrag; seine bestaetigten, eng abgegrenzten Wirkungen sind in der Reconciliation enthalten.

## Rollen und Zugriff

Anwendungsrollen sind `viewer`, `editor` und `admin`. Profile werden administrativ aktiviert; Beispielwerte verwenden keine realen Personen:

```sql
update public.profiles
set role = 'admin', display_name = 'Administrationsprofil', initials = 'AP'
where email = 'admin@example.invalid';
```

RLS und die API muessen mindestens nachweisen:

1. Ohne gueltige Sitzung sind keine Fachdaten oder privaten Assets lesbar.
2. `viewer` darf lesen, aber nicht schreiben.
3. `editor` darf die freigegebenen Fachablaeufe bearbeiten.
4. `admin` besitzt nur die explizit vorgesehenen administrativen Rechte.
5. Aenderungen werden im vorgesehenen Auditpfad nachvollziehbar erfasst.

## Betriebliche Pruefung

Backup, Restore, Rotation, Monitoring und Incident-Ablauf stehen in [operations.md](operations.md). Vor Migration oder Cutover sind zusaetzlich das [Migrations-/Rollback-Runbook](../dokumentation/betrieb-und-deployment/MIGRATION_CUTOVER_ROLLBACK.md) und das [Abnahmeprotokoll](../dokumentation/betrieb-und-deployment/ABNAHMEPROTOKOLL_TEMPLATE.md) anzuwenden.
