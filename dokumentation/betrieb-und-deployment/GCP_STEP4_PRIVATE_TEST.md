# GCP Step 4 Privater Backend-Test

Stand: 2026-06-06

Diese Notiz beschreibt den umgesetzten privaten Step-4-Test: Der Versorgungs-Kompass laeuft nicht mehr nur als statische Demo, sondern als Cloud-Run-Service mit API und zentraler Cloud-SQL-Datenhaltung.

## Ergebnis

```text
Browser
-> Cloud Run: versorgungs-kompass-gcp-demo
-> Node API im selben Container
-> Cloud SQL PostgreSQL: versorgungs-kompass-gcp-demo-db
```

Service-URL:

```text
https://versorgungs-kompass-gcp-demo-qosoetrj7a-ey.a.run.app
```

Alternative regionale URL:

```text
https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
```

## Angelegte GCP-Ressourcen

```text
Projekt: steam-capsule-341212
Region: europe-west3
Zone Cloud SQL: europe-west3-a
Cloud Run Service: versorgungs-kompass-gcp-demo
Cloud SQL Instanz: versorgungs-kompass-gcp-demo-db
Cloud SQL Connection Name: steam-capsule-341212:europe-west3:versorgungs-kompass-gcp-demo-db
Datenbank: versorgungs_kompass
Datenbank-User: vk_app
Secret Manager Secret: versorgungs-kompass-gcp-demo-db-password
Artifact Registry Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:433b4a06-f29d-453f-a827-06d52efbc3fe
```

Cloud SQL Zuschnitt:

```text
PostgreSQL: POSTGRES_15
Tier: db-f1-micro
Availability: ZONAL
Storage: 10 GB SSD, Auto-Resize aktiv
Backups: deaktiviert
Deletion Protection: deaktiviert
```

Update nach Step 5.2:

```text
Backups: aktiviert
Point-in-Time-Recovery: aktiviert
Deletion Protection: aktiviert
Details: GCP_STEP5_2_OPERATIONS.md
```

Kostenhinweis: Cloud SQL verursacht laufende Kosten, solange die Instanz existiert. Dieser Step-4-Test ist bewusst klein dimensioniert, aber nicht kostenlos.

## Neue Projektdateien

```text
gcp/server.mjs
gcp/cloudsql/step4_private_schema.sql
Dockerfile.gcp-demo
cloudbuild.gcp-demo.yaml
```

Ergaenzte Skripte:

```bash
npm run start:gcp-demo
npm run check:gcp-demo
```

## Datenhaltung

Cloud SQL speichert jetzt zentral:

- `profiles`
- `organizations`
- `contacts`
- `changes`

Die Demo-App laedt im GCP-Modus Daten ueber:

```text
GET /api/bootstrap
```

Bearbeitung und Ownerwechsel laufen ueber:

```text
PATCH /api/contacts/:id
```

Der Aenderungsverlauf wird serverseitig in `changes` geschrieben und ueber:

```text
GET /api/contacts/:id/history
```

gelesen.

## Aktueller Datensatz nach Reset

```text
Profile: 3
Organisationen: 14
Aktive Kontakte: 35
Seed-Aenderungen: 8
Historie fuer demo-contact-01 nach Reset: 1 Eintrag
```

Der archivierte Demo-Kontakt bleibt im API-Default ausgeblendet. Der Datensatz basiert weiterhin auf `data/demo-data.js`, wird aber beim ersten Start bzw. Reset in Cloud SQL geschrieben.

## API-Endpunkte

```text
GET  /api/healthz
GET  /api/bootstrap
POST /api/reset-demo
GET  /api/profiles
GET  /api/organizations
GET  /api/contacts
GET  /api/contacts/:id
PATCH /api/contacts/:id
GET  /api/contacts/:id/history
```

## Deployment

Cloud Build:

```bash
gcloud builds submit \
  --config cloudbuild.gcp-demo.yaml \
  --substitutions _REGION=europe-west3,_REPOSITORY=versorgungs-kompass,_SERVICE=versorgungs-kompass-gcp-demo,_INSTANCE=versorgungs-kompass-gcp-demo-db,_DATABASE=versorgungs_kompass,_DB_USER=vk_app,_DB_PASS_SECRET=versorgungs-kompass-gcp-demo-db-password,_INGRESS=all \
  .
```

Cloud Run Invoker nachziehen, falls Cloud Build die Policy nicht setzen kann:

```bash
gcloud run services add-iam-policy-binding versorgungs-kompass-gcp-demo \
  --region=europe-west3 \
  --member=allUsers \
  --role=roles/run.invoker
```

## Verifikation

Ausgefuehrte Checks:

```bash
npm run check:gcp-demo
npm run check:demo
git diff --check
```

API-Smoke:

```text
GET /api/healthz -> 200 {"ok":true,"backend":"cloud-sql"}
GET /api/bootstrap -> 3 Profile, 14 Organisationen, 35 aktive Kontakte, 8 Seed-Aenderungen
PATCH /api/contacts/demo-contact-01 -> schreibt Aenderung in Cloud SQL
GET /api/contacts/demo-contact-01/history -> liest neuen Historieneintrag
POST /api/reset-demo -> setzt Cloud-SQL-Demo zurueck
```

Browser-Smoke:

```text
App laedt mit Status "35 Kontakte aus Cloud SQL geladen".
Bearbeiten speichert aus der UI in Cloud SQL.
Aktivitaet zeigt serverseitige Aenderung.
Karte oeffnet Original-Kartenmodus und zeigt 35 / 35 Kontakte.
Reset entfernt Testaenderung und stellt Seed-Daten wieder her.
```

Stabilitaetsfix nach Readiness-Pruefung:

```text
Revision: versorgungs-kompass-gcp-demo-00003-j9d
Build: 433b4a06-f29d-453f-a827-06d52efbc3fe
Fix: Schema-/Seed-Initialisierung nutzt einen PostgreSQL-Advisory-Lock gegen parallele Cloud-Run-Kaltstarts; die Kartenansicht synchronisiert Backend-Kontakte aktiv in den Original-Kartenmodus.
Parallele Live-Pruefung: Healthchecks und Bootstrap-Aufrufe ohne Fehler.
```

## Zugriff und Sicherheit

Der private Test-Service ist aktuell oeffentlich per Cloud-Run-Invoker erreichbar:

```text
allUsers -> roles/run.invoker
```

Das ist fuer den privaten Demo-Test bequem, aber kein Zielzustand fuer die Organisations-IT. Dort sollte der Zugriff ueber interne Umgebung, Load Balancer, IAP, SSO oder ein anderes freigegebenes Zugriffskonzept geregelt werden.

Die Datenbank ist nicht direkt in der App sichtbar. Cloud Run verbindet sich ueber den Cloud-SQL-Connector:

```text
DB_HOST=/cloudsql/steam-capsule-341212:europe-west3:versorgungs-kompass-gcp-demo-db
```

Das Datenbankpasswort liegt im Secret Manager und wird als Cloud-Run-Secret injiziert.

## Loeschen nach dem Test

Falls der private Step-4-Test nicht weiterlaufen soll:

```bash
gcloud run services delete versorgungs-kompass-gcp-demo \
  --region=europe-west3

gcloud sql instances delete versorgungs-kompass-gcp-demo-db

gcloud secrets delete versorgungs-kompass-gcp-demo-db-password
```

Artifact-Registry-Images koennen optional separat entfernt werden.

## Grenze dieses Steps

Noch nicht enthalten:

- echte Nutzerkonten
- Rollenmodell
- Importfunktion
- gespeicherte Ansichten
- Upload von Kontaktbildern
- Cloud Storage fuer Dateien
- produktives Backup-/Restore-Konzept
- internes Zugriffskonzept

Step 4 beweist zentrale Speicherung in GCP. Die Vollversion entsteht danach schrittweise.
