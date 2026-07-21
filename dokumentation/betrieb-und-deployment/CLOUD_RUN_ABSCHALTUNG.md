# Kontrollierte Abschaltung des historischen Cloud-Run-Stacks

Status: am 20. Juli 2026 kontrolliert außer Betrieb genommen und verifiziert

Stand: 20. Juli 2026

## Ziel und Sicherheitsgrenze

Dieser Change nimmt den historischen Cloud-Run-Stack im Projekt `steam-capsule-341212` reversibel außer Betrieb. Er sichert zuerst Daten und Wiederherstellungsinformationen, erzwingt danach Cloud Run Manual Scaling `0` und stoppt die alte Cloud-SQL-Instanz mit `activationPolicy=NEVER`.

Der Change löscht keine Cloud-Run-Services, Revisionen, Datenbanken, Backups, Buckets, Objekte, Secrets, Images, IAM-Service-Accounts oder Zielbetriebsressourcen. Die endgültige Bereinigung ist ein eigener späterer Change im [Lösch-Runbook](CLOUD_RUN_LOESCHUNG.md).

## Ausführungsnachweis

| Feld | Ergebnis |
| --- | --- |
| Snapshot gestartet | 20. Juli 2026, 13:36:23 UTC |
| Finaler Datenstand gesichert | 20. Juli 2026, 14:16:52 UTC; Cloud Run war davor bereits deaktiviert |
| Offline final verifiziert | 20. Juli 2026, 14:19:13 UTC |
| Read-only erneut verifiziert | 20. Juli 2026, Evidence-Lauf `verify/20260720T151604Z`, alle Kriterien bestanden |
| Evidence lokal | `.gcp-decommission-evidence/20260720T133623Z` (Git-ignored, Modus `0700`) |
| Evidence archiviert | `gs://versorgungs-kompass-migrations-765190393967/decommission/20260720T133623Z/` |
| Manifest SHA-256 | `453c430b520ee3942cf308180853f2bf5c2290a15a58cce2857dd116dcf6655f` |
| Initiales On-Demand-Backup | ID `1784554627279`, `SUCCESSFUL` |
| Initialer SQL-Export | `gs://versorgungs-kompass-migrations-765190393967/decommission/20260720T133623Z/sql/versorgungs_kompass-20260720T133623Z.sql.gz`, 134.034 Byte, MD5/CRC32C erfasst, Temporary Hold aktiv |
| Finales On-Demand-Backup | ID `1784556843744`, `SUCCESSFUL`, nach dem Cloud-Run-Disable |
| Finaler SQL-Export | `gs://versorgungs-kompass-migrations-765190393967/decommission/20260720T133623Z/final/20260720T141401Z/versorgungs_kompass.sql.gz`, 134.041 Byte, MD5/CRC32C erfasst, Temporary Hold aktiv |
| Aufbewahrung | nicht vor 19. August 2026; Holds bleiben bis zum separaten Lösch-Change aktiv |
| Evidence-Schutz | Uniform Bucket-Level Access und Public Access Prevention `enforced`; keine öffentlichen Bucket-IAM-Mitglieder |
| Cloud Run | vier Services vorhanden, unveränderte Ready-Revisionen, Manual Scaling `0`, keine Traffic-Tags, keine öffentlichen Invoker |
| Legacy-SQL | `STOPPED`, `activationPolicy=NEVER`, Deletion Protection aktiv |
| URL-Proben | API `503`, Demo `503`, Frontend `502`, GCP-Demo `503`; kein erfolgreicher Anwendungsstatus |
| Geschützte Ziele | GKE `RUNNING`, Ziel-SQL `ALWAYS` und löschgeschützt, Pages HTTP `200` |
| Löschungen | keine Ressource des historischen Decommission-Scopes; Evidence und Audit-Log-Prüfung bestätigen dies |
| Delete-Audit | `0` passende Delete-Einträge seit `2026-07-20T13:30:00Z` für die Legacy-Ressourcen in Cloud Run, Cloud SQL, Secret Manager, Storage und Artifact Registry |

Alle drei Bilderobjekte und alle 87 Objektgenerationen im Migrations-Bucket besitzen bei der finalen Prüfung einen Temporary Hold. Davon liegen 84 unter dem abgeschotteten Evidence-Präfix. Temporary Holds laufen nicht automatisch ab.

Ausführungsabweichungen: Ein erster Offline-Aufruf endete wegen einer Bash-3-Kompatibilitätsstelle vor jeder Mutation. Nach der eigentlichen Abschaltung bewertete die erste automatische Probe den erwartbaren Frontend-Status `502` zu eng als Fehler; die Konfigurations-, IAM-, SQL- und Zielschutzprüfungen waren bereits erfolgreich. Die Statusregel wurde auf alle nicht erfolgreichen `4xx/5xx` korrigiert. Anschließend wurde bei weiterhin deaktivierten Cloud-Run-Services ein finales Backup samt Export erstellt, Legacy-SQL erneut gestoppt und der Nachzustand vollständig archiviert. Keine Abweichung führte zur Löschung einer Ressource des historischen Scopes.

## Bestätigter Live-Bestand

Inventarstichtag: 20. Juli 2026

| Ressource | ID / Zustand vor Abschaltung | Behandlung |
| --- | --- | --- |
| Cloud Run | `versorgungs-kompass-api` | Konfiguration/IAM/Revisionen sichern, danach Scaling `0` |
| Cloud Run | `versorgungs-kompass-demo` | wie oben; vorab öffentlich über `allUsers` |
| Cloud Run | `versorgungs-kompass-frontend` | wie oben; vorab IAP-Service-Agent als Invoker |
| Cloud Run | `versorgungs-kompass-gcp-demo` | wie oben; vorab öffentlich über `allUsers` |
| Cloud SQL | `versorgungs-kompass-gcp-demo-db`, PostgreSQL 15, `ALWAYS`, Deletion Protection aktiv | On-Demand-Backup plus SQL-Export, danach `NEVER` |
| Cloud Storage | `versorgungs-kompass-gcp-demo-images-765190393967`, 3 Objekte / 689.995 Byte | Generationen und Checksummen sichern, Temporary Holds setzen |
| Cloud Storage | `versorgungs-kompass-migrations-765190393967`, vorab 3 Objekte / 1.932.716 Byte | SQL-Export und Evidence ablegen, Temporary Holds setzen |
| Secret Manager | `versorgungs-kompass-gcp-demo-db-password`, eine aktive Version | Metadaten/IAM sichern, nicht lesen, nicht löschen |
| Artifact Registry | `versorgungs-kompass`, ca. 439 MB / 68 Image-Versionen | Digests/Tags sichern, Repository und Images behalten |

Die Default-Compute-Service-Account wird von allen vier alten Diensten verwendet und besitzt projektweite Rechte. Sie wird in diesem Change weder deaktiviert noch gelöscht.

## Geschützte Ressourcen außerhalb des Scopes

Unverändert bleiben insbesondere:

- GKE Autopilot `versorgungs-kompass-pre-gematik`,
- Cloud SQL `vk-pre-gematik-postgres`,
- Artifact Registry `versorgungs-kompass-pre-gematik`,
- die beiden `vk-pre-gematik`-Secrets,
- alle sechs `steam-capsule-341212-vk-pre-gematik-*`-Buckets,
- `vk-pre-gematik-vpc`, Subnetz, GKE-IAP und Load Balancer,
- der Cloud-Build-Systembucket,
- die GitHub-Pages-Demo.

Die Live-Prüfung fand keine Cloud-Run-Jobs, Domain Mappings, serverlosen NEGs, Pub/Sub-Topics oder -Subscriptions. Scheduler und Eventarc sind im Projekt deaktiviert und wurden für das Inventar nicht aktiviert. Der einzige HTTPS-Load-Balancer gehört zum geschützten GKE-Stack.

## Nutzungsbefund und Entscheidung

`versorgungs-kompass-gcp-demo` erhielt zuletzt am 19. Juli gegen 22:37–22:38 CEST App-/API-GETs und am 20. Juli gegen 07:09 CEST weitere GETs. In den geprüften 30 Tagen wurden keine schreibenden HTTP-Methoden gefunden. Die Abschaltung wird deshalb nicht mit „ungenutzt“ begründet, sondern mit der ausdrücklichen Ablösung durch die synthetische Pages-Demo und die getrennte GKE-Pre-Integration.

## Phase 1: Read-only-Plan

Der Standardaufruf ändert weder lokale Evidence noch Cloud-Ressourcen:

```bash
scripts/decommission_gcp_cloud_run_demo.sh \
  --project steam-capsule-341212 \
  --region europe-west3
```

Er prüft fail-closed den Projektzugriff und zeigt die vier Services, IAM-Invoker, SQL- und Backupzustand, beide Legacy-Buckets, Secret-/Repository-Metadaten, Jobs/Domain Mappings sowie die geschützten GKE-/SQL-Ressourcen. Berechtigungs-, API-, Netzwerk- und Regionsfehler werden nicht als „nicht vorhanden“ behandelt.

## Phase 2: Datensicherung und Aufbewahrung

Für diesen Change gilt ein Mindest-Rollbackfenster; eine Löschprüfung ist nicht vor dem 19. August 2026 zulässig. Das Snapshot-Gate:

1. legt lokale Evidence mit `umask 077` unter `.gcp-decommission-evidence/` ab;
2. exportiert Cloud-Run-Konfiguration, IAM, Revisionen, Image-Digests sowie SQL-, Storage-, Secret- und geschützte Zielmetadaten;
3. erstellt ein frisches erfolgreiches On-Demand-Backup von `versorgungs-kompass-gcp-demo-db`;
4. exportiert `versorgungs_kompass` als portablen komprimierten SQL-Dump in den privaten Migrations-Bucket;
5. setzt Temporary Holds auf den SQL-Export und alle sechs vorgefundenen Legacy-Objekte;
6. bestätigt Cloud-SQL-Deletion-Protection;
7. bindet festen Projekt-/Regions-Scope, Objektgenerationen, Inventar-Prüfsummen, Backup-ID, Export-URI und `retainUntil` in ein Manifest;
8. archiviert die Evidence in einem Bucket mit Uniform Bucket-Level Access und erzwungener Public Access Prevention und setzt Temporary Holds.

```bash
scripts/decommission_gcp_cloud_run_demo.sh \
  --project steam-capsule-341212 \
  --region europe-west3 \
  --snapshot \
  --retain-until 2026-08-19 \
  --confirm steam-capsule-341212:765190393967:europe-west3:snapshot-cloud-run
```

Das Snapshot-Gate nimmt keinen Service offline. Vor einer späteren Mutation müssen nicht nur lokale Marker, sondern auch das archivierte Manifest, Inventar-Prüfsummen, exakte Exportgenerationen und die Holds des Remote-Evidence-Präfixes übereinstimmen. Temporary Holds laufen nicht automatisch ab; sie dürfen nur im getrennten Lösch-Change aufgehoben werden. Der bisherige Default-Soft-Delete von sieben Tagen ist damit nicht die einzige Schutzmaßnahme. Neue Mutationsläufe verlangen Manifest-Schema 2; die bereits abgeschlossene Evidence mit Schema 1 bleibt einschließlich ihrer erfassten Generationen und MD5-/CRC32C-Werte read-only prüfbar, autorisiert aber keine erneute Mutation.

## Phase 3: Reversible Abschaltung

Der Offline-Schritt verlangt den exakten lokalen Evidence-Pfad und den ausgegebenen SHA-256-Wert des Manifests. Vor jeder Mutation prüft er den festen Projekt-/Nummer-/Regions-Scope, Manifest und Inventar-Prüfsummen, Objektgenerationen und Holds, Backupstatus, SQL-Export, Deletion Protection, die private Evidence-Ablage sowie die Löschgrenze im Manifest.

```bash
scripts/decommission_gcp_cloud_run_demo.sh \
  --project steam-capsule-341212 \
  --region europe-west3 \
  --offline \
  --evidence-dir .gcp-decommission-evidence/<timestamp> \
  --manifest-sha256 <sha256> \
  --confirm steam-capsule-341212:765190393967:europe-west3:offline-cloud-run
```

Danach führt das Skript nur folgende Änderungen aus:

- vorhandene Traffic-Tags entfernen, weil getaggte Revisionen den Service-Level-Stopp umgehen können;
- Invoker-IAM-Check für alle vier Services aktivieren;
- `allUsers` und `allAuthenticatedUsers` aus serviceeigenen `roles/run.invoker`-Bindings entfernen;
- alle vier Cloud-Run-Services mit `--scaling=0` deaktivieren;
- bei bereits deaktivierten Services einen finalen Datenstand als zweites On-Demand-Backup und portablen SQL-Export sichern;
- `versorgungs-kompass-gcp-demo-db` mit Deletion Protection auf `activationPolicy=NEVER` setzen.

Der finale Ready-Marker wird erst nach erfolgreichem SQL-Stopp, Remote-Archiv, Hashvergleich und Holds übernommen. Ein Exit-, Interrupt- oder Terminate-Handler wartet bei einem vorherigen Abbruch laufende serverseitige SQL-Operationen ab und fordert den Stopp asynchron wiederholt an; erfolgreich ist der Cleanup erst beim live nachgewiesenen Zustand `STOPPED`/`NEVER`. Unmittelbar vor Backup und Export wird außerdem der Disable-/IAM-Zustand aller vier Cloud-Run-Services neu gelesen und fail-closed geprüft.

Cloud Run unterstützt Manual Scaling `0` als reversiblen Disable-Zustand. Die Services und Revisionen bleiben dadurch für Rollback und spätere, separat genehmigte Löschung erhalten. Sie werden im Abschalt-Change nicht mit `gcloud run services delete` entfernt.

## Phase 4: Verifikation

Der Offline-Schritt verifiziert automatisch und archiviert den Nachzustand. Zusätzlich kann die Prüfung jederzeit read-only wiederholt werden:

```bash
scripts/decommission_gcp_cloud_run_demo.sh \
  --project steam-capsule-341212 \
  --region europe-west3 \
  --verify \
  --evidence-dir .gcp-decommission-evidence/20260720T133623Z
```

Mit `--evidence-dir` werden zusätzlich beide Backups/Exporte, Manifest-/Datei-Prüfsummen und die unveränderten Ready-Revisionen gegen den Vorzustand geprüft; die neue Prüfevidence wird nur lokal unter `verify/<timestamp>` geschrieben. Ohne den Parameter bleibt es bei einer rein lesenden Live-Zustandsprüfung.

Abnahmekriterien:

- alle vier Cloud-Run-Services existieren weiterhin, zeigen Manual Scaling `0`, besitzen keine Traffic-Tags und keinen öffentlichen Invoker;
- Ready-Revision und Revisionsmenge entsprechen dem gesicherten Vorzustand;
- ihre unauthentifizierten `run.app`-URLs liefern keinen erfolgreichen Anwendungsstatus;
- Legacy-SQL zeigt `activationPolicy=NEVER` und aktive Deletion Protection;
- initiales und finales Backup sind `SUCCESSFUL`, beide SQL-Exporte sind vorhanden, nicht leer und gehalten;
- alle Objektgenerationen beider Legacy-Buckets sind gehalten; der Evidence-Bucket bleibt privat;
- GKE `versorgungs-kompass-pre-gematik` ist `RUNNING`;
- `vk-pre-gematik-postgres` bleibt `ALWAYS` und löschgeschützt;
- die GitHub-Pages-Demo liefert HTTP `200`;
- der ausgeführte Nachweis enthält `resourcesDeleted: []`; die gehärtete Fassung schreibt zusätzlich `decommissionScopeResourcesDeleted: []`. Ergänzend wurde im Audit Log nach Delete-Operationen des historischen Scopes gesucht.

Nach der technischen Abnahme folgt ein Beobachtungsfenster bis mindestens zum Aufbewahrungsdatum. Unerwartete Aufrufe oder ein fachlich begründeter Rückholbedarf lösen die Rollback-Entscheidung aus, nicht automatisch eine Löschung.

## Rollback innerhalb des Aufbewahrungsfensters

1. Legacy-SQL wieder starten:

   ```bash
   gcloud sql instances patch versorgungs-kompass-gcp-demo-db \
     --project=steam-capsule-341212 \
     --activation-policy=ALWAYS
   ```

2. Für jeden Service den vorab gesicherten Scaling-Zustand wiederherstellen; vor diesem Change war er `auto`:

   ```bash
   gcloud run services update <service> \
     --project=steam-capsule-341212 \
     --region=europe-west3 \
     --scaling=auto
   ```

3. Zuerst mit gezielt autorisiertem Tester und ohne öffentlichen Invoker prüfen.
4. Nur nach fachlicher Freigabe die gesicherte IAM-Policy gezielt wiederherstellen. `allUsers` wird nicht automatisch reaktiviert.
5. Datenbank, Kernpfade und Logs prüfen; erst danach einen öffentlichen Link erneut kommunizieren.

Die Temporary Holds, Backups und Evidence bleiben auch bei einem Service-Rollback erhalten.

## Offizielle Verfahrensgrundlagen

- [Cloud Run Services verwalten und mit Manual Scaling 0 deaktivieren](https://docs.cloud.google.com/run/docs/managing/services)
- [Cloud Run Traffic-Tags entfernen](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Cloud SQL starten und stoppen](https://docs.cloud.google.com/sql/docs/postgres/start-stop-restart-instance)
- [Cloud SQL Backups](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/backups)
- [Cloud SQL als SQL-Dump exportieren](https://cloud.google.com/sql/docs/postgres/import-export/import-export-sql)
- [Cloud Storage Object Holds](https://docs.cloud.google.com/storage/docs/holding-objects)
