# Supabase nach Cloud SQL: Migrations- und Freigabeplan

> [!NOTE]
> **Einordnung:** Diese Datenmigration gehoert nicht zum aktuellen
> gematik-internen PoC. Der PoC startet mit ausschliesslich synthetischen,
> verwerfbaren Testdaten. Dieses Dokument bleibt als Referenz fuer einen
> gesondert freizugebenden spaeteren Pilot erhalten; siehe
> [PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md).

Status: Persoenlicher Pilot-Cutover technisch abgeschlossen; Zielbetrieb weiterhin nicht institutionell freigegeben

Stand: 21. Juli 2026

## Ziel

Die geschuetzte Anwendung unter `https://mitmachen.timo-frank.de` soll den aktuellen fachlichen Supabase-Bestand uebernehmen. Die bisherige Adresse `https://pre-gematik.versorgungs-kompass.timo-frank.de` bleibt als Weiterleitung erhalten. GitHub Pages bleibt davon getrennt und zeigt weiterhin ausschliesslich synthetische Demo-Daten.

```text
oeffentlich                                  geschuetzt

GitHub Pages                                 GCP IAP
  -> dist/pages                                -> dist/target
  -> synthetische Demo                         -> Node.js API
                                                  -> Cloud SQL
                                                  -> private GCS-Buckets

                              einmalige, gepruefte Migration ^
aktueller Supabase-Livebestand -------------------------------+
```

Ein normales GKE-Deployment uebertraegt keine Daten. Daten- und Storage-Migration sind deshalb eigenstaendige, protokollierte Adminvorgaenge.

## Gepruefter Ausgangsbestand

Ein read-only Audit hat das aktive Supabase-Projekt als den zuletzt verwendeten Echtbestand bestaetigt. Der vollstaendige aggregierte Abgleich der unterstuetzten Fachtabellen und der geschuetzten historischen Kontrollmenge ist bestanden. Exakte Tabellenzahlen, Objektlisten, Fingerprints und Stichtagsdetails sind personenbezogen beziehungsweise betriebsintern und gehoeren ausschliesslich in das geschuetzte Abnahme-Ticket, nicht in dieses oeffentliche Repository.

Historische CSV-Dateien und `private.protected_source_snapshots` bleiben Kontroll- beziehungsweise Nachweisquellen, sind aber keine zweite Importquelle.

### Private Dateien

| Supabase-Bucket | Ziel |
| --- | --- |
| `profile-images` | privater GCS-Profilbild-Bucket |
| `stakeholder-logos` | privater GCS-Stakeholder-Logo-Bucket |
| `contact-images` | privater GCS-Kontaktbild-Bucket |
| `contact-note-attachments` | privater GCS-Anhang-Bucket |
| `protected-source-assets` | nicht in die Anwendung importieren; separat geschuetzt aufbewahren |

Objektzahlen, Quellpfade, Inhaltspruefsummen und Quarantaene-Befunde werden nur im geschuetzten Storage-Manifest und Abnahme-Ticket festgehalten. Die Anwendung liefert Stakeholder-Logos nur nach erfolgreicher IAP- und Rollenpruefung ueber `/api/stakeholder-logos/:id` aus. Der GCS-Bucket bleibt privat.

## Verbindlicher Importumfang

Die folgende Allowlist wird importiert, und nur diese:

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

Nicht importiert werden:

- `login_aliases`: Supabase-Login-Alias, im Ziel durch kontrollierte IAP-`identity_bindings` ersetzt,
- `network_registration_rate_limits` und `network_registrations`: kein freigegebener Zielprozess und derzeit keine fachliche Registrierung,
- `private.protected_source_snapshots`: separates Schutz-/Nachweisarchiv,
- Supabase-Systemschemata, Auth-User, Policies, Rollen und Storage-Metadaten,
- synthetische Zielzeilen: Sie werden nach bestaetigtem Vorimport-Backup vollstaendig ersetzt, nicht mit Echtdaten vermischt.

Stabile Primaer- und Fremdschluessel werden unveraendert uebernommen. UUID-Werte werden in den bewusst als `text` ausgelegten Zielspalten lediglich als Text gespeichert, nicht neu erzeugt. Supabase-Profilbild-URLs werden nur fuer den exakten Quellpfad `profile-images/<profil-id>/avatar.(jpg|png|webp)` akzeptiert; `<profil-id>` muss der ID derselben Profilzeile entsprechen. Datenbank- und Storage-Werkzeug verwenden damit denselben Zielpfad `profile-images/<profil-id>/avatar.<endung>` im privaten GCS-Bucket. Abweichende Dateinamen, zusaetzliche Pfadsegmente oder fremde Profil-IDs stoppen den Import. `private://stakeholder-logos/...` bleibt als geschuetzte logische Referenz erhalten.

## Freigabe-Gates

Der technische Auftrag zur Vorbereitung ersetzt keine organisatorische Echtdatenfreigabe. Vor dem ersten schreibenden Storage- oder Datenbankimport muessen G-01 bis G-03, G-04a sowie G-05 bis G-07 belegt sein. G-04b folgt bewusst erst nach dem Datenbankimport, solange der Dienst noch fuer Nutzer gesperrt ist: Erst dann existieren die importierten Zielprofile, auf die die Identity-Bindungen per Fremdschluessel verweisen.

| Gate | Zeitpunkt | Nachweis | Freigabe durch |
| --- | --- | --- | --- |
| G-01 Datenzweck | vor erstem Apply | Kontakte, Expertenkreis, Stakeholder, Historie und Profilbilder duerfen fuer den befristeten Pilotzweck in `pre-gematik` verarbeitet werden | Fachverantwortung und Datenschutz |
| G-02 Schutzbedarf | vor erstem Apply | GCP-Projekt, IAP, Cloud SQL, private Buckets, Logging und Restrisiken sind fuer diesen Umfang akzeptiert | Informationssicherheit |
| G-03 Zugriff | vor erstem Apply | Der ressourcenspezifische IAP-Principal ist geprueft; fuer den persoenlichen Pilot ist er exakt derselbe direkte Nutzer wie der projektweite Break-glass-Zugang, im Zielbetrieb eine administrierbare Gruppe. Joiner/Mover/Leaver und Break-glass sind benannt. | IAM-/Plattformverantwortung |
| G-04a Identitaetsplan | vor Datenimport | Eine geschuetzte, vollstaendige Soll-Liste ordnet die exakten IAP-Subjects den stabilen Quellprofil-IDs und Rollen zu. Im Zielbetrieb gilt das Vier-Augen-Prinzip. Fuer den persoenlichen Pilot ist die Abweichung gemaess Pilotentscheidung akzeptiert; zwei getrennte, identische Eigenpruefungs-Previews ersetzen keine unabhaengige Kontrolle. Es werden noch keine Zielbindungen geschrieben. | Fachverantwortung und IAM |
| G-04b Identitaetsbindung | nach Datenimport, vor Dienstoeffnung | Die freigegebene Soll-Liste ist vollstaendig auf die nun vorhandenen Zielprofile angewendet; mindestens ein aktiver Admin ist positiv sowie eine unbekannte Identitaet negativ getestet. Fuer den Einpersonen-Pilot gilt die dokumentierte Ausnahme: Mangels zweiter gueltig signierter Identitaet ersetzen automatisierte Autorisierungs- und Spoofing-Tests keinen spaeteren Live-Negativtest. | Fachverantwortung und IAM |
| G-05 Wiederherstellung | vor erstem Apply | erfolgreiche automatische Sicherung, konkreter Vorimport-Backup-Identifier und Restore-Verantwortung liegen vor. Fuer den Pilot genuegen die dokumentierten getrennten DB- und synthetischen Storage-Proben; vor institutionellem Zielbetrieb ist eine koordinierte Probe mit Reconciliation und gemessener RTO/RPO erforderlich. | DB-Verantwortung |
| G-06 Cutover | vor erstem Apply | Schreibfreeze oder nachweislich unveraenderter Quell-Fingerprint; Go/No-Go-Person ist erreichbar | Fach- und Service-Owner |
| G-07 Plattformrisiko | vor erstem Apply | Fuer die persoenliche, befristete Pre-Integration ist das zonale Risiko aus Kostengruenden ausdruecklich akzeptiert; Live-Instanz und Terraform-Pilotsoll bleiben `ZONAL`. Es besteht keine Hochverfuegbarkeitszusage. `REGIONAL` bleibt eine spaetere, separat freizugebende Zielbetriebsentscheidung. | Service-Owner und Plattformbetrieb |

Die nicht personenbezogene Selbstentscheidung fuer den persoenlichen Pilot steht in der [Echtdaten-Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md). Ausfuehrungsfreigaben gehoeren in das Abnahmeprotokoll oder ein verlinktes, zugriffsgeschuetztes Ticketsystem. Personenbezogene Inhalte, IAP-Subjects und Zugangsdaten gehoeren nicht in Git.

## Technischer Ablauf

### 1. Vorbereiten

1. Freigabe-Gates pruefen und Go/No-Go-Verantwortliche benennen.
2. Quellbestand read-only zaehlen und Fingerprints bilden.
3. Erfolgreiches Supabase-Quellbackup bestaetigen.
4. On-demand-Cloud-SQL-Backup unmittelbar vor der Zielaenderung anlegen und dessen ID protokollieren.
5. Die lokalen Operatorwerte nach [`config/pre-gematik/migration.env.example`](../../config/pre-gematik/migration.env.example) ausschliesslich in einer geschuetzten, kurzlebigen Session bereitstellen. Fuer den read-only GCP-Gate sind exakt `GCP_PROJECT_ID`, `GCP_REGION`, `GKE_CLUSTER_NAME`, `GKE_LOCATION`, `K8S_NAMESPACE`, `CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `PRE_GEMATIK_GCP_PROJECT_SHA256`, `PRE_IMPORT_BACKUP_ID` und optional `PRE_IMPORT_BACKUP_NOT_BEFORE` erforderlich. Der schreibende Datenbank- und Identity-Lauf verlangt ausserdem den absoluten Pfad `CLOUD_SQL_AUTH_PROXY_EXECUTABLE` und den unabhaengig gegen die offizielle Veroeffentlichung geprueften Binaer-Pin `CLOUD_SQL_AUTH_PROXY_SHA256`. Der Storage-Lauf verlangt zusaetzlich den unabhaengig freigegebenen Soll-Policy-Pin `PRE_GEMATIK_DATA_BUCKET_IAM_SHA256`. Diese Werte gehoeren nicht in GitHub-Environment-Variablen. Die aktuelle GCP-Gate-Liste kann ohne Cloud-Zugriff mit `node scripts/check_pre_gematik_migration_gcp.mjs --help` geprueft werden.
6. Unmittelbar vor Apply den read-only GCP-Gate mit `node scripts/check_pre_gematik_migration_gcp.mjs` ausfuehren. Er prueft ueber lesende `gcloud`-Aufrufe den unabhaengigen Projekt-Pin, GKE-/Namespace-Kontext, die konkrete Cloud-SQL-Instanz und das erfolgreiche konkrete Backup. Nur `GATE PASS` und dessen Fingerprint im geschuetzten Ticket dokumentieren. Ein Datenbankname allein oder eine syntaktisch gueltige Backup-ID genuegen nicht. Beim Storage- und Datenbank-Apply erzeugt das Werkzeug fuer den erneuten Gate eine unveraenderliche Umgebungskopie und setzt darin `PRE_IMPORT_BACKUP_ID` zwingend auf die exakt per CLI bestaetigte ID. Gate, Recovery-Journal und Importbericht koennen dadurch nicht auf verschiedene Sicherungen zeigen. Das nachgelagerte Identity-Apply verwendet dieselbe geschuetzte Backup-ID erneut.
7. Ziel-Datenbankverbindung nur als geschuetzte Prozessvariable bereitstellen; weder URL noch Passwort ausgeben. Fuer Apply ist sie ausschliesslich eine Loopback-Credential-Vorlage. Das Werkzeug prueft Pfad, Rechte und den unabhaengig freigegebenen SHA-256-Pin des offiziellen Cloud SQL Auth Proxy, startet diesen selbst mit exakt dem vom GCP-Gate bestaetigten `CLOUD_SQL_INSTANCE_CONNECTION_NAME` und verbindet PostgreSQL ueber einen neu erzeugten, privaten Unix-Socket sowie den authentifizierten SQL-Data-Tunnel des Proxy. Eine oeffentliche Datenbank-IP oder eine direkte VPC-Verbindung des Operatorgeraets ist dafuer nicht erforderlich. Unmittelbar vor dem ersten Schreibzugriff wird der Gate erneut gelesen und mit dem noch laufenden Proxy abgeglichen. Dadurch genuegen weder ein gleicher Datenbankname, eine gleiche private IP-Adresse, ein anderer lokaler PostgreSQL-Server noch ein bereits laufender Proxy zur falschen Instanz. Bei jeder Abweichung bricht auch das Identity-Apply fail-closed ab.
8. Fuer die Datenbankquelle einen kurzlebigen Supabase-Leser mit ausschliesslichen `SELECT`-Rechten bereitstellen. Weil alle Fachtabellen RLS verwenden, muss der Lauf zugleich nachweisen koennen, dass diese Rolle den vollstaendigen Bestand sieht; andernfalls bricht das Werkzeug ab. Die Rolle nach dem Lauf wieder sperren oder loeschen.
9. Im Supabase Dashboard unter **Database Settings -> SSL Configuration** das projektspezifische Server-Root-Zertifikat herunterladen. Das ist der von Supabase dokumentierte Weg fuer `verify-full`: [Postgres SSL Enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement) und [Connecting with PSQL](https://supabase.com/docs/guides/database/psql).
10. Die Quell-URL ausschliesslich mit `sslmode=verify-full` und einem absoluten, lokal lesbaren `sslrootcert`-Pfad setzen. `require`, `verify-ca`, eine fehlende CA oder deaktivierte Zertifikatspruefung werden vom Werkzeug abgelehnt. Beispiel ohne echte Zugangsdaten:

   ```text
   postgresql://<reader>.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/geschuetzter/pfad/supabase-ca.crt
   ```

   Quell-URL, Passwort und CA-Pfad nicht ausgeben und nicht in die Shell-Historie oder das Repository schreiben. Fuer IPv4 ist der Session Pooler geeignet. Ein read-only Preview darf einen separat kontrollierten lokalen Proxy verwenden; beim Apply wird der in der Ziel-URL genannte Loopback-Port ignoriert und durch den oben beschriebenen werkzeugverwalteten Unix-Socket ersetzt.

### 2. Preview

Das Datenwerkzeug laeuft standardmaessig read-only: Es prueft Quell- und Zielidentitaet, den unabhaengig freigegebenen Source/Target-Projekt-Pin, Quell-TLS, RLS-Vollsicht, Schema, Spalten, Typmod-Grenzen, generierte Felder, Zielbestand, Allowlist, Counts sowie kanonische SHA-256-Inhaltsfingerprints. Die Zieltransaktion wird zurueckgerollt. Das Storage-Werkzeug arbeitet ebenfalls standardmaessig im Preview-Modus.

```bash
node scripts/migrate_supabase_to_pre_gematik.mjs
node scripts/migrate_supabase_storage_to_gcs.mjs \
  --manifest-output '/geschuetzter/pfad/storage-preview-manifest.json'
```

Das Storage-Preview verlangt die geschuetzten Werte `EXPECTED_SOURCE_PROJECT_ID`, `EXPECTED_TARGET_PROJECT_ID`, den unabhaengig freigegebenen Paar-Pin `EXPECTED_STORAGE_PROJECT_PAIR_SHA256`, Region und Namespace sowie den separat freigegebenen Bucket-IAM-Pin. Es prueft fuer jeden Daten-Bucket die exakte Region, Uniform Bucket-Level Access, `publicAccessPrevention=enforced`, Versionierung und die autoritative Workload-only-IAM-Policy. Reale Projektkennungen stehen nicht im Repository. Vor dem Datenimport ist fuer G-04a nur die geschuetzte Soll-Liste der Identity-Bindungen fachlich und technisch zu pruefen. Das datenbankgestuetzte Identity-Preview wird absichtlich erst nach dem erfolgreichen Import unter G-04b ausgefuehrt, weil es die dann vorhandenen Zielprofile validiert.

Der derzeitige Zielbestand besteht aus dem bekannten synthetischen Seed und genau einem aktiven, ungebundenen Admin-Bootstrap-Profil. Dessen ID kommt in der Quelle nicht vor; die normalisierte E-Mail passt eindeutig zu genau einem aktiven Admin-Quellprofil. Diese E-Mail wird nur zur fail-closed Klassifikation gelesen und weder ausgegeben noch fuer eine Identity-Bindung verwendet. Der Preview gibt stattdessen einen `sha256:...`-Fingerprint des vollstaendigen Zielprofil-Datensatzes aus.

Der synthetische Zielbestand wird nicht anhand von `demo-*`-IDs, Markierungen oder Zeilenzahlen allein anerkannt. Das Werkzeug vergleicht den kanonischen Gesamtinhalt mit einer kleinen, versionierten Allowlist kryptografischer Seed-Manifeste fuer die nachweislich ausgerollten Repository-Staende. Fachfelder, Primaer- und Fremdschluessel sowie Audit-Payloads bleiben vollstaendig im Fingerprint. Normalisiert werden ausschliesslich die vom Observation-Trigger erzeugte Laufzeit und -- nur bei den drei exakten reservierten Profil-/Avatar-Paaren des versionierten Avatar-Patches -- die von der alten Touch-Trigger-Version ueberschriebene `updated_at`-Zeit. Der Preview nennt die erkannte Manifest-ID. Jede andere Abweichung, auch bei gleicher Zeilenzahl, klassifiziert das Ziel als `protected-non-synthetic` und blockiert Apply.

Apply erfordert die bestaetigte Umgebung, den unabhaengig freigegebenen Source/Target-Projekt-Pin, die Zielidentitaet, den im geschuetzten Ticket verifizierten Vorimport-Backup-Identifier, die ausgeschriebene Synthetic-Ersetzung und fuer diesen Sonderfall zusaetzlich exakt den aktuellen Bootstrap-Profil-Fingerprint. Zuerst muss der Storage-Apply vollstaendig beendet sein und ein create-only Manifest mit Modus `apply`, Dateimodus `0600` und bestaetigtem Fingerprint ausserhalb des Repositorys vorliegen:

```bash
node scripts/migrate_supabase_storage_to_gcs.mjs \
  --apply \
  --confirm-source-project '<source-project-id-aus-preview>' \
  --confirm-target-project '<target-project-id-aus-preview>' \
  --pre-import-backup-id '<cloud-sql-backup-id>' \
  --confirm-preview-fingerprint 'sha256:<fingerprint-aus-dem-storage-preview>' \
  --confirm-quarantined-object-count '<exakter-bestaetigter-count>' \
  --manifest-output '/geschuetzter/pfad/storage-apply-manifest.json' \
  --recovery-journal '/geschuetzter/pfad/storage-apply-recovery.ndjson' \
  --confirm-operation MIGRATE_ALLOWLISTED_SUPABASE_STORAGE_TO_GCS
```

Erst danach folgt der Datenbank-Apply:

```bash
node scripts/migrate_supabase_to_pre_gematik.mjs \
  --apply \
  --replace-synthetic-target \
  --confirm-replacement pre-gematik-synthetic-v1 \
  --pre-import-backup-id '<cloud-sql-backup-id>' \
  --target-profile-image-bucket '<privater-profilbild-bucket>' \
  --target-contact-image-bucket '<privater-kontaktbild-bucket>' \
  --target-contact-note-attachment-bucket '<privater-anhang-bucket>' \
  --target-stakeholder-logo-bucket '<privater-stakeholder-logo-bucket>' \
  --storage-manifest '/geschuetzter/pfad/storage-apply-manifest.json' \
  --confirm-storage-manifest-fingerprint 'sha256:<fingerprint-aus-dem-storage-apply>' \
  --confirm-source-snapshot-fingerprint 'sha256:<fingerprint-aus-dem-aktuellen-db-preview>' \
  --confirm-quarantined-object-count '<exakter-bestaetigter-count>' \
  --confirm-bootstrap-profile-fingerprint 'sha256:<fingerprint-aus-dem-aktuellen-preview>'
```

Eine Aenderung des Bootstrap-Profils oder des versionierten synthetischen Zielbestands zwischen Preview und Apply veraendert den Fingerprint und stoppt den Lauf. Der kanonische Gesamtfingerprint der transformierten Quelle muss exakt als `--confirm-source-snapshot-fingerprint` aus dem freigegebenen aktuellen Preview uebernommen werden; jede spaetere Quellaenderung blockiert Apply. Das Werkzeug bildet keine E-Mail-basierte IAP-Bindung. Referenzierte Profilbilder, Kontaktbilder, Kontaktnotiz-Anhaenge und Stakeholder-Logos muessen im verifizierten Manifest exakt von Quellobjekt zu Zielobjekt und SHA-256 gebunden sowie als `created` oder `verified-identical` markiert sein. Ein referenziertes Quarantaene-Objekt blockiert den Datenbankimport. Jeder schreibende Storage-, Datenbank- und Identity-Lauf ruft den GCP-/Backup-Gate im selben Prozess unmittelbar vor dem Schreibpfad erneut auf; ein zuvor nur manuell ausgefuehrter Check ersetzt diese Kopplung nicht.

### 3. Dateiimport und geschuetztes Manifest

1. Nur die vier App-Buckets aus der Allowlist lesen und deren Datenbankreferenzen vor und nach dem Snapshot identisch nachweisen.
2. Ausschliesslich aktuell von einer der vier freigegebenen Datenklassen referenzierte Objekte fuer den Upload zulassen; verwaiste Objekte separat quarantänisieren.
3. Objektpfade, MIME-Typen und Groessen fail-closed pruefen. PDF- und DOCX-Altdateien bleiben bis zur abgenommenen Malware-/CDR-Strecke vollstaendig in Quarantaene; initial ist bei Anhaengen nur streng validiertes UTF-8-TXT zulaessig.
4. Inhalte beim Transfer mit SHA-256 pruefen.
5. Zielobjekte nur neu anlegen oder bei identischer Pruefsumme als bereits vorhanden akzeptieren; nie still ueberschreiben oder loeschen.
6. SVG-Dateien zusaetzlich auf aktive Inhalte und externe Referenzen pruefen; die API liefert sie mit restriktiver CSP aus.
7. `protected-source-assets` nicht ueber diesen Pfad kopieren.
8. Vor dem ersten Upload ein owner-only Recovery-Journal ausserhalb des Repositorys oeffnen und jeden Versuch sowie jede erfolgreich verifizierte Anlage sofort per `fsync` protokollieren. Damit bleibt auch ein abgebrochener Teillauf revisionsfaehig und sicher wiederholbar.
9. Das Apply-Manifest create-only, ausserhalb des Repositorys und mit Dateimodus `0600` schreiben. Es bindet jede Quellreferenz an Zielobjekt, SHA-256, Status und gegebenenfalls Quarantaenegrund. Pfad, Einzelreferenzen und Fingerprint gehoeren ins geschuetzte Abnahme-Ticket.

### 4. Datenimport

1. Zielbestand erneut pruefen. Zulaessig sind nur der vollstaendig nachgewiesene synthetische Import und das separat gefingerprintte, ungebundene Admin-Bootstrap-Profil. Jede andere geschuetzte oder nicht als synthetisch belegte Zeile blockiert Apply.
2. Innerhalb einer Zieltransaktion 28 Fachtabellen -- alle Tabellen der Allowlist ausser `profiles` -- in umgekehrter Fremdschluesselreihenfolge leeren und danach in Fremdschluesselreihenfolge fuellen.
3. `profiles` nicht pauschal loeschen: Quellprofile anhand ihrer stabilen IDs upserten und ausschliesslich ungebundene Ziel-Extras entfernen. Dadurch verschwindet das bestaetigte Bootstrap-Profil und das echte Quellprofil bleibt unter seiner Supabase-ID erhalten.
4. `identity_bindings` unveraendert erhalten; sie werden weder aus Supabase noch aus einer E-Mail-Uebereinstimmung abgeleitet. Ein an eine nicht vorhandene Quellprofil-ID gebundenes Zielprofil blockiert die Migration.
5. Generierte Suchvektoren nicht importieren; PostgreSQL erzeugt sie neu.
6. Sequenzen an die uebernommenen numerischen IDs anpassen.
7. Fuer jede migrierte Tabelle Count, Primaerschluessel- und kanonischen Inhalts-SHA-256 nach der erlaubten Avatar-Transformation mit dem Ziel vergleichen. Numerische Verengungen und unpassende Typmods blockieren den Lauf.
8. Aggregiertes, nicht personenbezogenes Ergebnis samt Storage-Manifest-Fingerprint in `import_runs` dokumentieren.
9. Den read-only Quellsnapshot per Rollback beenden und erst danach die Zieltransaktion committen. So kann nach einem erfolgreichen Ziel-COMMIT kein separater Quell-COMMIT mehr fehlschlagen.
10. Bei jeder Abweichung vor dem Ziel-COMMIT Rollback der gesamten Zieltransaktion.

Wenn die Verbindung genau beim Ziel-COMMIT abbricht, ist dessen Ergebnis nicht sicher bekannt. Das Werkzeug nennt dann den Fehler `TARGET_COMMIT_OUTCOME_UNKNOWN` und die nicht personenbezogene Importlauf-ID. In diesem Fall keinen automatischen Retry und keinen zweiten Import starten. Zuerst mit einer neuen read-only Zielverbindung exakt diese ID in `public.import_runs` nachschlagen und den Zielbestand pruefen; danach entscheidet die DB-Verantwortung ueber Fortsetzen oder Restore.

### 5. Identitaeten binden und Dienst geschlossen halten

Nach dem erfolgreichen Datenbank-COMMIT bleibt der Dienst fuer Nutzer gesperrt. Nun wird G-04b gegen die importierten Zielprofile ausgefuehrt. Die geschuetzte Eingabedatei muss den vollstaendigen freigegebenen Sollzustand enthalten; unbekannte bestehende Bindungen blockieren Preview und Apply. Das Werkzeug akzeptiert ausschliesslich den IAP-Issuer `https://cloud.google.com/iap` und prueft das Datenbankziel gegen `PRE_GEMATIK_IDENTITY_TARGET_SHA256`.

Der Datenbanklogin ist dabei weder `postgres` noch `vk_app`: Verbindlich ist
das Verfahren im [Identity-Admin-Runbook](PRE_GEMATIK_IDENTITY_ADMIN.md). Eine
statische, geheimnisfreie Owner-Anwendung legt die `NOLOGIN`-Rolle
`vk_identity_admin` mit ausschließlich `SELECT` auf `profiles` sowie
`SELECT`/`INSERT`/`UPDATE` auf `identity_bindings` an. Ein kurzlebiger
Cloud-SQL-`BUILT_IN`-Login wird exakt dieser Custom-Rolle zugeordnet und nach
Abnahme gelöscht. Das Werkzeug verweigert `postgres`, `cloudsqlsuperuser`,
weitere Rollenmitglieder, DDL-, Delete- und sonstige Fachdatenrechte und setzt
innerhalb der Transaktion explizit `SET LOCAL ROLE vk_identity_admin`.

Zuerst erfolgt das transaktional zurueckgerollte Preview:

```bash
node scripts/provision_iap_identity_bindings.mjs \
  --input '/geschuetzter/pfad/bindings.json'
```

Nach Vier-Augen-Pruefung des aktuellen Fingerprints folgt der Apply. Ausschliesslich fuer den persoenlichen Pilot ist stattdessen die in der [Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md) dokumentierte Abweichung mit zwei getrennten identischen Eigenpruefungs-Previews zulaessig; sie gilt nicht als Vier-Augen-Erfuellung. `--allow-active-bindings` ist hier bewusst erforderlich, weil der freigegebene Sollzustand mindestens den aktiven Admin enthaelt:

```bash
node scripts/provision_iap_identity_bindings.mjs \
  --input '/geschuetzter/pfad/bindings.json' \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-database versorgungs_kompass \
  --confirm-operation UPSERT_IAP_IDENTITY_BINDINGS \
  --confirm-fingerprint 'sha256:<fingerprint-aus-dem-identity-preview>' \
  --confirm-binding-count 1 \
  --confirm-active-binding-count 1 \
  --allow-active-bindings
```

Die beiden Zähler bestätigen für den aktuellen persönlichen Pilot unabhängig
vom Fingerprint: exakt eine Bindung insgesamt und exakt eine aktive Bindung.
Eine abweichende Datei wird vor jedem Schreibzugriff abgewiesen.

Vor der Dienstoeffnung muessen mindestens der positive Test eines aktiven Admins und der negative `403`-Test einer unbekannten Identitaet dokumentiert sein.

### 6. Reconciliation und Abnahme

- aggregierter vollstaendiger Tabellen- und Kontrollmengenabgleich gemaess geschuetztem Abnahme-Ticket,
- keine synthetischen `demo-*`-Zeilen oder synthetischer `import_runs`-Marker mehr im fachlichen Zielbestand,
- alle Fremdschluesselpruefungen ohne Befund,
- Quell- und Ziel-Count, Primaerschluessel- sowie Inhalts-SHA-256 je Tabelle identisch nach dokumentierter Transformation,
- alle freigegebenen privaten Storage-Objekte gemaess geschuetztem Apply-Manifest vorhanden und mit identischer Inhaltspruefsumme; referenzierte Quarantaene-Befunde sind vor DB-Apply aufgeloest,
- unbekannte oder inaktive IAP-Identitaet erhaelt `403`, freigegebene Viewer-/Editor-/Admin-Identitaeten besitzen nur ihre Rolle,
- fachliche Stichproben fuer Kontakte, Karte, Organisationen, Expertenkreis, Stakeholder, Formate, Hospitationen, Beobachtungen und Historie,
- Browser-Netzwerkpruefung ohne Supabase-Aufrufe oder Supabase-Schluessel.

## Rollback

Vor der fachlichen Freigabe bleibt Supabase die fuehrende Quelle und `pre-gematik` gesperrt beziehungsweise im Abnahmemodus.

- Fehler waehrend des Imports: Zieltransaktion rollback; keine Teilmigration.
- Fehler vor ersten Zielschreibzugriffen: Cloud SQL auf den Vorimportpunkt wiederherstellen, vorherige Helm-Revision und Frontend-Revision aktivieren.
- Fehler nach Zielschreibzugriffen: beide Systeme schreibsperren; kein automatisches Zurueckschalten. Service- und Daten-Owner entscheiden zwischen Forward Fix, vollstaendiger Rueckmigration oder Restore gemaess beschlossenem RPO.
- Storage-Objekte werden im Import nicht geloescht oder ueberschrieben. Verwaiste neu angelegte Objekte werden erst nach Abgleich anhand des Laufmanifests kontrolliert bereinigt.

Supabase wird erst nach bestandener technischer Abnahme, bestaetigter Restore-Probe und eigener Abschaltentscheidung read-only gesetzt oder deaktiviert. Fuer den persoenlichen Nicht-Produktivpilot gibt es gemaess [Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md) keine gesonderte Hypercare-Phase.

## Aktueller Vorbereitungsstand

- [x] Quelle und gestriger Anwendungsbezug eindeutig bestaetigt.
- [x] Geschuetzte historische Kontrollmenge vollstaendig im aktuellen Bestand nachgewiesen; Detailnachweis nur im Abnahme-Ticket.
- [x] 29 gemeinsame Fachtabellen und alle Spalten im Zielschema abgedeckt.
- [x] Cloud SQL privat, PITR aktiv, Backup-Aufbewahrung auf 14 Sicherungen angehoben.
- [x] Privater, versionierter GCS-Bucket fuer Stakeholder-Logos angelegt.
- [x] Geschuetzte API-Auslieferung fuer Stakeholder-Logos vorbereitet.
- [x] Fail-closed IAP-Identity-Binding-Werkzeug vorbereitet.
- [x] Read-only GCP-Instanz-/Backup-Gate, werkzeugverwalteter und binaer gepinnter Auth Proxy fuer exakt diese Instanz sowie geschuetzter Storage-Manifest-Vertrag vorbereitet.
- [x] G-01, G-02 und G-07 als transparente persoenliche Pilot-Selbstentscheidung dokumentiert; keine institutionelle oder unabhaengige Freigabe behauptet.
- [x] G-03, G-04a und G-06 vor dem ersten Apply mit geschuetzten technischen Nachweisen vervollstaendigt; G-05 mit Vorimport-Backup und getrennten Restore-Proben belegt, koordinierte Probe mit gemessener RTO/RPO bleibt Pilotauflage.
- [x] On-demand-Vorimport-Backup mit konkreter ID angelegt.
- [x] GCP-Gate fuer konkrete Live-Instanz und Backup bestanden und im geschuetzten Ticket bestaetigt.
- [x] Referenzierte Storage-Quarantaene-Befunde fachlich und technisch aufgeloest; finaler Quarantaenebestand ist leer.
- [x] Dokumentierte Pilot-Eigenpruefungs-Ausnahme mit zwei getrennten byte-identischen Preview-Durchlaeufen erfuellt; keine unabhaengige Vier-Augen-Pruefung behauptet.
- [x] G-04b nach Datenimport und vor Dienstoeffnung angewendet: aktiver Admin live positiv; automatisierte Rollen- und Spoofing-Negativtests bestanden. Eine zweite gueltig signierte unbekannte Identitaet stand im Einpersonen-Pilot nicht zur Verfuegung und bleibt dokumentierte Pilotauflage.
- [x] Getrennte DB- und synthetische Storage-Restore-Proben sowie technische Browserabnahme im Auftrag durchgefuehrt; koordinierte gemeinsame Wiederherstellung und gemessene RTO/RPO bleiben Pilotauflage.
- [x] Echtdatenimport und anschliessender GKE-Rollout persoenlich freigegeben und technisch erfolgreich abgeschlossen.
- [x] Temporaere Import-Ressourcen, Rollen, lokale Klartext-Credentials und redundante Klartext-Preflight-Dumps nach bestandener Abnahme entfernt; der Dump-Schluessel ist von den verschluesselten Dumps getrennt und Supabase bleibt global read-only als geschuetzte Rueckfallquelle erhalten.

## Verwandte Dokumente

- [Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md)
- [GCP-Autopilot-Pre-Integration](DEPLOYMENT_GCP_AUTOPILOT.md)
- [Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md)
- [Geschuetzte lokale Operatorvariablen](../../config/pre-gematik/migration.env.example)
- [Kurzlebige Administration der IAP-Identity-Bindung](PRE_GEMATIK_IDENTITY_ADMIN.md)
- [Betriebsverantwortung/RACI](BETRIEBSVERANTWORTUNG_RACI.md)
- [PoC-Durchstich – ohne Datenmigration](POC_GEMATIK_DURCHSTICH.md)
- [Befristete Echtdaten-Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md)
