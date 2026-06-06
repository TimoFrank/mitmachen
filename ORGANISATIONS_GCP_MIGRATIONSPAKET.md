# Organisations-GCP Migrationspaket

Stand: 2026-06-06

Ziel: Dieses Paket beschreibt, wie der aktuelle private GCP-Stand des Versorgungs-Kompass in eine organisationsinterne GCP-Umgebung ueberfuehrt werden kann.

## Kurzfassung fuer IT

Der Versorgungs-Kompass ist aktuell als Cloud-Run-App mit integriertem Node.js-Backend umgesetzt. Die App nutzt im GCP-Modus kein Supabase.

```text
Browser
-> interne URL / Cloud Run
-> Node.js-App liefert Original-Frontend und /api-Endpunkte
-> Cloud SQL PostgreSQL fuer CRM-Daten
-> Cloud Storage fuer Kontaktbilder
-> Secret Manager fuer Datenbankpasswort
```

## Aktueller privater Referenzstand

```text
GCP Projekt: steam-capsule-341212
Region: europe-west3
Cloud Run Service: versorgungs-kompass-gcp-demo
Live-URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Aktive Revision: versorgungs-kompass-gcp-demo-00021-xvm
Datenbank: Cloud SQL PostgreSQL / versorgungs_kompass
Kontaktbild-Bucket: versorgungs-kompass-gcp-demo-images-765190393967
```

Dieser Stand ist die technische Vorlage, nicht die Zielkonfiguration fuer die Organisation.

## Was bereits GCP-basiert ist

- Original-App-Shell und Original-UI aus `app/versorgungs-kompass.html`
- Kontakte und Organisationen in Cloud SQL
- Profile und Rollenmodell light in Cloud SQL
- Aenderungsverlauf in Cloud SQL
- Importvorschau und Import-Commit ueber Cloud Run
- Kontaktbilder in Cloud Storage
- Formate und Teilnehmer in Cloud SQL
- Expertenkreis-Gruppen, -Kontakte, -Organisationen und Verknuepfungen in Cloud SQL
- Monitoring-light ueber `/api/ops/checks`
- Export ueber `/api/export`

## Noch nicht organisationsfertig

- echte Authentifizierung fehlt noch
- serverseitige Rollenpruefung fehlt noch
- Zugriffsschutz ist im privaten Test noch nicht intern/IAP/SSO-abgesichert
- Restore-Test ist noch nicht dokumentiert durchgefuehrt
- Cloud Monitoring Alerts sind noch nicht eingerichtet
- produktive Datenmigration aus Supabase oder anderen Quellen ist noch offen
- finaler Datenschutz-/Freigabeprozess fuer echte Kontaktdaten ist offen

## Benoetigte GCP-Dienste

Pflicht:

- Cloud Run
- Cloud SQL PostgreSQL
- Cloud Storage
- Secret Manager
- Artifact Registry
- IAM
- interne DNS/FQDN oder Load-Balancer-Anbindung

Empfohlen:

- Cloud Monitoring
- Cloud Logging
- Error Reporting
- Cloud SQL Backups und Point-in-Time-Recovery
- Identity-Aware Proxy oder organisationsinternes SSO/Zugriffsgateway

Nicht mehr erforderlich:

- Supabase
- GitHub Pages
- private persoenliche GCP-Ressourcen

## Zielnamen fuer die Organisation

Die IT kann Namen frei vergeben. Vorschlag:

```text
GCP Projekt: <org-project-id>
Region: europe-west3
Artifact Registry Repository: versorgungs-kompass
Cloud Run Service: versorgungs-kompass
Cloud SQL Instanz: versorgungs-kompass-db
Datenbank: versorgungs_kompass
DB User: vk_app
Secret: versorgungs-kompass-db-password
Storage Bucket: versorgungs-kompass-contact-images-<org-suffix>
Interne FQDN: ccc.gematik.solutions
```

## Repository und Build-Artefakte

Fuehrend fuer den GCP-Modus:

```text
Dockerfile.gcp-demo
gcp/server.mjs
gcp/cloudsql/step4_private_schema.sql
data/data-service.js
app/versorgungs-kompass.html
map/
data/
public/
```

Nicht fuer das aktuelle GCP-Backend-Ziel verwenden:

```text
Dockerfile.demo
cloudbuild.demo.yaml
Jenkinsfile.demo
```

Diese Dateien beschreiben den fruehen reduzierten Demo-Mode.

## Jenkins-Pipeline

Vorlage:

```text
Jenkinsfile.gcp-demo
```

Die Pipeline baut mit `Dockerfile.gcp-demo`, pusht in Artifact Registry und deployed nach Cloud Run mit Cloud-SQL-Anbindung.

Die Vorlage nutzt `--allow-unauthenticated` in Kombination mit internem Ingress. Das bedeutet: Cloud Run selbst verlangt keinen eigenen IAM-Login, der Zugriff muss dann ueber interne Erreichbarkeit, Load Balancer, IAP oder SSO begrenzt werden. Wenn die IT Cloud-Run-IAM direkt erzwingen moechte, muss diese Option in der Pipeline entfernt und der Smoke-Test mit Identity Token ausgefuehrt werden.

Erforderliche Jenkins-Credentials:

```text
gcp-project-id
gcp-db-password-secret-name
```

Optional koennen Projektwerte auch als Jenkins-Environment oder Pipeline-Parameter gesetzt werden.

## Cloud-Run-Umgebungsvariablen

```text
DB_HOST=/cloudsql/<project>:<region>:<cloud-sql-instance>
DB_NAME=versorgungs_kompass
DB_USER=vk_app
GCP_DEMO_AUTO_SCHEMA=1
GCP_DEMO_AUTO_SEED=1
CONTACT_IMAGE_BUCKET=<bucket-name>
```

Secret:

```text
DB_PASSWORD=<Secret Manager Secret>:latest
```

Hinweis: `GCP_DEMO_AUTO_SCHEMA=1` fuehrt beim Start die Schema-Datei aus. Fuer den ersten Organisationsaufbau ist das hilfreich. Fuer spaeteren produktiven Betrieb kann die IT entscheiden, ob Schema-Migrationen kontrolliert separat laufen sollen.

## Service Account / IAM

Der Jenkins- oder Cloud-Run-Deploy-Service-Account benoetigt mindestens:

- Artifact Registry Writer
- Cloud Run Developer oder passende Deploy-Rolle
- Service Account User fuer den Runtime-Service-Account
- Cloud SQL Client
- Secret Manager Secret Accessor fuer das DB-Passwort
- Storage Object Admin oder eingeschraenkte Objektrolle fuer den Kontaktbild-Bucket

Der Cloud-Run-Runtime-Service-Account benoetigt:

- Cloud SQL Client
- Secret Manager Secret Accessor fuer das DB-Passwort
- Storage Object Admin oder eingeschraenkte Objektrolle fuer Kontaktbilder

## Migrationsablauf

1. GitLab-Repo anlegen und aktuellen Stand importieren.
2. GCP-Projekt, Region und IAM klaeren.
3. Artifact Registry Repository anlegen.
4. Cloud SQL PostgreSQL Instanz anlegen.
5. Datenbank `versorgungs_kompass` und User `vk_app` anlegen.
6. DB-Passwort im Secret Manager speichern.
7. Cloud Storage Bucket fuer Kontaktbilder anlegen.
8. Jenkins Credentials hinterlegen.
9. `Jenkinsfile.gcp-demo` auf Organisationswerte anpassen.
10. Ersten Jenkins-Build ausfuehren.
11. Cloud Run Service pruefen.
12. Interne URL/FQDN anbinden.
13. Zugriffsschutz festlegen und aktivieren.
14. Datenmigration oder Import fachlich durchfuehren.
15. Backup/Restore und Monitoring testen.

## Abnahmetest nach Deployment

API:

```bash
curl -fsS https://<interne-url>/api/healthz
curl -fsS https://<interne-url>/api/ops/checks
curl -fsS https://<interne-url>/api/ops/summary
```

UI:

- App oeffnet unter interner URL
- Kontakte laden
- Organisationen laden
- Karte oeffnet
- Kontaktdetail oeffnet
- Kontakt bearbeiten und speichern
- Aenderungsverlauf wird geschrieben
- Kontaktbild anzeigen bzw. Upload testen
- Importvorschau testen
- Formate laden
- Format-Teilnehmer pflegen
- Expertenkreis laden
- Export nur fuer berechtigte Personen erreichbar machen

## Offene IT-Fragen

- Wird Cloud Run intern, ueber Load Balancer, IAP oder SSO geschuetzt?
- Gibt es echte Nutzeridentitaeten, die im Backend ausgewertet werden sollen?
- Sollen App-Rollen serverseitig hart durchgesetzt werden?
- Wer darf Export, Import und Admin-Funktionen nutzen?
- Welche Daten duerfen in den ersten Organisations-Piloten?
- Soll die Datenbank zonal oder HA/regional betrieben werden?
- Wie lange sollen Backups aufbewahrt werden?
- Wer bekommt Monitoring-Alerts?
- Darf die Karte externe Tile-/CDN-Ressourcen laden oder braucht es interne Freigaben?

## Minimaler Zielzustand fuer den ersten Organisationspilot

```text
GitLab + Jenkins funktionieren.
Cloud Run laeuft intern erreichbar.
Cloud SQL speichert Kontakte, Organisationen, Verlauf, Formate und Expertenkreis.
Cloud Storage speichert Kontaktbilder.
Secret Manager speichert DB-Passwort.
Backups sind aktiv.
Ops-Checks sind gruen.
Zugriff ist mindestens organisationsintern begrenzt.
```

## Formulierung fuer den IT-Leiter

```text
Wir haben den privaten Prototypen bereits von Supabase auf GCP umgestellt. Die aktuelle Referenzversion nutzt Cloud Run, Cloud SQL, Cloud Storage, Secret Manager und Artifact Registry. Fuer die Ueberfuehrung in die Organisations-IT brauchen wir jetzt vor allem Projekt, Jenkins/GitLab-Anbindung, IAM, interne URL und eine Entscheidung zum Zugriffsschutz.
```

```text
Fachlich ist der Pilot so weit, dass Kontakte, Organisationen, Verlauf, Import, Kontaktbilder, Formate und Expertenkreis zentral in GCP laufen. Was noch fehlt, sind die organisatorischen Betriebsentscheidungen: Auth, Rollen, Backup/Restore-Test, Monitoring und Datenfreigabe.
```
