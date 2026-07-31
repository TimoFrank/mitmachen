# Bestehender Datenweg und Übernahme in den Gematik-PoC

Status: abgeschlossener Herkunfts- und Retirement-Nachweis
Stand: 31. Juli 2026

## Ausgangslage

Der fachliche Bestand von `mitmachen.timo-frank.de` wurde im persönlichen Pilot bereits aus Supabase nach Cloud SQL und in private Google-Cloud-Storage-Buckets übernommen. Die geschützte GCP-Anwendung ist seitdem der alleinige schreibführende Stand. Das frühere Projekt wurde am 31. Juli 2026 nach verifiziertem Archiv und Restore-Nachweis reversibel pausiert (`INACTIVE`), nicht gelöscht.

Für den gematik-PoC wird deshalb ein aktueller Snapshot aus Cloud SQL verwendet. Die frühere Supabase-Migration wird nicht erneut als aktuelle Quelle behandelt.

GitHub Pages bleibt vollständig getrennt und veröffentlicht synthetische CRM-/Fachdaten sowie ausschließlich im Politik-Modul den kuratierten öffentlichen Bundestags-Snapshot.

## Wiederverwendbarer Vertrag

Direkt wiederverwendbar sind:

- PostgreSQL-16-Schema, Laufzeitrolle und Grants,
- die folgende Allowlist der Fachtabellen,
- stabile Primär- und Fremdschlüssel,
- Tabellenmengen und inhaltsbasierte Fingerprints,
- der Ausschluss alter Anmeldezuordnungen und
- der Grundsatz, dass Datenimport und Software-Deployment getrennt laufen.

```text
profiles
organizations
contacts
organization_primary_systems
contact_owners
activity_events
changes
contact_notes
contact_note_attachments
saved_views
user_settings
formats
format_participants
hospitation_slots
hospitations
hospitation_observations
hospitation_observation_changes
roadmap_items
hospitation_roadmap_assessments
hospitation_unmet_needs
expert_groups
expert_organizations
expert_contacts
expert_entity_links
stakeholder_types
stakeholder_organizations
stakeholder_people
notification_events
notification_recipients
```

Nicht übernommen werden alte `identity_bindings`, Supabase-Auth- und Systemtabellen, Cloud-Rollen, Zugangsdaten, technische Kontrollarchive oder Demo-Zeilen. Der fachlich bestätigte Umfang darf die Allowlist weiter verkleinern.

## Plattformspezifische Grenze

Die einmaligen Quell-, Datenbank- und Storage-Importwerkzeuge wurden nach erfolgreicher Übernahme aus dem aktuellen Repository entfernt. Der verbleibende kurzlebige GKE-Operator unterstützt ausschließlich Google-/Cloud-SQL-Identity- und Guest-Access-Phasen. Für eine andere gematik-Plattform ist ein neuer, plattformspezifischer Importadapter erforderlich; die stillgelegten Werkzeuge werden nicht reaktiviert.

Für den Zielimport fehlt noch ein dünner Adapter für:

1. den read-only Snapshot der aktuellen Cloud-SQL-Quelle,
2. die direkte TLS-Verbindung zur gematik-PostgreSQL-Datenbank und
3. den von der IT gewählten privaten Objektspeicher.

Das Tabellenmodell, die Allowlist und die Prüfungen bleiben dabei erhalten. OIDC-Zuordnungen werden nach dem Import neu angelegt; sie werden nie aus E-Mail-Adressen oder alten IAP-Bindings abgeleitet.

## Dateien

Der aktuelle Bestand kann vier private Objektklassen enthalten:

| Datenklasse | Aktueller Speicher |
| --- | --- |
| Profilbilder | privater GCS-Bucket |
| Kontaktbilder | privater GCS-Bucket |
| Anhänge zu Kontaktnotizen | privater GCS-Bucket |
| Stakeholder-Logos | privater GCS-Bucket |

Die aktuelle API liest diese Objekte über die Google-Cloud-Storage-API. Wenn die gematik-Plattform GCS nicht kontrolliert anbinden kann, braucht die API vor einer vollständigen Dateiübernahme einen kleinen Storage-Adapter. Der erste strukturierte Datenimport kann ohne diese Dateien erfolgen; Datei-Verweise werden dann nicht als funktionsfähig übernommen. Neue Uploads bleiben im ersten PoC deaktiviert.

## Ablauf für den PoC

1. Im geschützten Ticket Datenumfang, Nutzergruppe, Start und Prüftermin bestätigen.
2. Aktuellen Cloud-SQL-Snapshot als Quelle festhalten.
3. Leere Ziel-Datenbank mit Schema und Laufzeitrolle vorbereiten.
4. Bestätigte Tabellen über den Zieladapter einmalig importieren.
5. Tabellenmengen, Fremdschlüssel und Fingerprint prüfen.
6. Gematik-OIDC-Subjects den vorgesehenen Profilen zuordnen.
7. Login sowie einen vereinbarten Lese- und Schreibablauf prüfen.
8. Kurzlebige Importzugänge entfernen.

Snapshot, Exporte, Subjects, Profilzuordnungen, Objektlisten und Zugangsdaten bleiben außerhalb von Git und Build-Artefakten. Im Repository stehen nur Schema, Allowlist, Werkzeuge und nicht personenbezogene Verträge.

Eine laufende Synchronisation ist nicht vorgesehen. Während des Testzeitraums ist der gematik-PoC der gemeinsame bearbeitbare Bestand; die persönliche Bereitstellung wird nicht parallel für dieselben fachlichen Änderungen genutzt.

## Nachweis

Für den kleinen PoC genügen im geschützten Ticket:

- Snapshot-Zeitpunkt,
- freigegebene Datenklassen,
- Importversion,
- Tabellenmengen und Fingerprint,
- Ergebnis der OIDC- und Rollenprüfung sowie
- Prüftermin für Weiterführung oder Löschung.

Die frühere persönliche Pilotentscheidung ist ein Herkunftsnachweis, aber keine Freigabe für den gematik-internen Nutzerkreis. Die kurze Entscheidung für diesen PoC wird deshalb separat im internen Ticket getroffen.

## Retirement-Nachweis

- Der aktive Repository-Stand enthält keinen `supabase/`-Quellbaum, keine Edge Functions und keine ausführbaren Supabase-Export-, Datenbank- oder Storage-Migrationsskripte mehr.
- Frontend, API, Helm, Terraform und laufendes GKE enthalten keine Supabase-URL, keinen Schlüssel, keine Projekt-Referenz und kein SDK. Negative Regressionstests bleiben bewusst erhalten.
- Das pausierte Providerprojekt ist keine Laufzeitabhängigkeit. Seine direkte Wiederherstellung ist nur innerhalb des von Supabase angegebenen 90-Tage-Fensters vorgesehen.
- Die langfristige Recovery-Basis liegt im separaten, zugriffsgeschützten Google-Archiv. Bei der letzten Prüfung waren 542 Objekte mit 14.090.082 Bytes vollständig per Event-Based Hold geschützt; automatische Lifecycle-Löschung ist deaktiviert.
- Ein koordinierter isolierter Restore von Cloud SQL und GCS wurde erfolgreich verifiziert. Die temporäre Restore-Instanz und der temporäre Bucket wurden nach gesicherter Evidenz wieder entfernt.
- Die Git-Historie wird nicht umgeschrieben. Frühere Quellen bleiben damit nachvollziehbar, ohne im aktuellen Build- oder Deploymentpfad zu liegen.
