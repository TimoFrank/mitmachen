# Privater GCP-Testpfad

Diese Notiz beschreibt den privaten Testlauf fuer den `Versorgungs-Kompass Demo Mode` ohne GitHub Pages, ohne Supabase und ohne Jenkins.

Ziel:

```text
lokaler Code
-> gcloud builds submit
-> Cloud Build
-> Artifact Registry
-> Cloud Run
```

Das ist die Generalprobe fuer den spaeteren Organisationspfad:

```text
GitLab
-> Jenkins
-> Artifact Registry
-> Cloud Run
```

## 1. Voraussetzungen

Lokal:

```bash
gcloud auth login
gcloud config set project steam-capsule-341212
gcloud config set run/region europe-west3
```

Aktueller lokaler Stand in diesem Projekt:

```text
GCP Account: timofrank@icloud.com
GCP Project: steam-capsule-341212
Region: europe-west3
```

## 2. Benoetigte GCP APIs

Einmalig aktivieren:

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com
```

## 3. Artifact Registry Repository

Einmalig anlegen, falls es noch nicht existiert:

```bash
gcloud artifacts repositories create versorgungs-kompass \
  --repository-format docker \
  --location europe-west3 \
  --description "Versorgungs-Kompass Container Images"
```

Existenz pruefen:

```bash
gcloud artifacts repositories list --location europe-west3
```

## 4. Demo Mode deployen

Aus dem Repository-Root:

```bash
gcloud builds submit \
  --config cloudbuild.demo.yaml \
  --substitutions _REGION=europe-west3,_REPOSITORY=versorgungs-kompass,_SERVICE=versorgungs-kompass-demo,_INGRESS=all \
  .
```

Danach Service-URL anzeigen:

```bash
gcloud run services describe versorgungs-kompass-demo \
  --region europe-west3 \
  --format "value(status.url)"
```

Aktueller privater Test-Service:

```text
https://versorgungs-kompass-demo-qosoetrj7a-ey.a.run.app/
```

Falls der Service nach dem Deploy `403 Forbidden` liefert, die Invoker-Berechtigung setzen:

```bash
gcloud run services add-iam-policy-binding versorgungs-kompass-demo \
  --region europe-west3 \
  --member allUsers \
  --role roles/run.invoker
```

## 5. Was dieser Test beweist

- Cloud Build kann das Projekt bauen.
- `Dockerfile.demo` ist cloudfaehig.
- Artifact Registry nimmt das Image an.
- Das Image wird mit der Cloud-Build-ID getaggt.
- Cloud Run kann die Demo ausliefern.
- Der Demo Mode funktioniert ohne Supabase.
- Der spaetere Jenkins-Pfad ist fachlich vorbereitet.

## 6. Abnahmetest

Im Browser pruefen:

- Kontakte laden.
- Organisationen laden.
- Karte laedt im Original-Kartenmodus.
- Klick auf Kartenkontakt oeffnet den Kontakt.
- Bearbeiten speichert lokal im Browser.
- Ownerwechsel schreibt lokalen Aenderungsverlauf.
- `Demo zuruecksetzen` setzt den lokalen Browserstand zurueck.

## 7. Grenze dieses privaten Tests

Dieser Test ersetzt noch keinen echten CRM-Betrieb.

Nicht enthalten:

- zentrale Datenbank
- Mehrnutzer-Speicherung
- echte Authentifizierung
- Cloud SQL
- Cloud Storage fuer Kontaktbilder
- serverseitiger Aenderungsverlauf

Das ist absichtlich so. Erst wird der Deployment-Weg stabilisiert, danach wird die Backend-Migration geplant.

## 8. Spaeterer Organisationspfad

Wenn GitLab und Jenkins in der Organisation bereitstehen:

```text
cloudbuild.demo.yaml wird nicht mehr benoetigt.
Jenkins nutzt Jenkinsfile.demo oder spaeter Jenkinsfile.
GitLab wird das fuehrende Repository.
Cloud Run und Artifact Registry bleiben dieselben Zielbausteine.
```
