# Versorgungs-Kompass Demo Mode

Diese Anleitung beschreibt die schlanke Demo-Version des Versorgungs-Kompass fuer ein internes Test-Deployment auf GCP.

Fuer die spaetere Uebergabe an die Organisations-IT stehen Kurzfassung, Voraussetzungen, verwendete Dienste, Datenablage und Gespraechsformulierungen in `GCP_ORG_TRANSFER_NOTES.md`. Das GCP-Backend-Zielbild fuer die Erweiterung zur zentral gespeicherten Version steht in `GCP_BACKEND_TARGET.md`. Der privat umgesetzte Step-4-Test mit Cloud SQL steht in `GCP_STEP4_PRIVATE_TEST.md`. Der private Step-5.1-Ausbau steht in `GCP_STEP5_1_PRIVATE_TEST.md`. Die Betriebssicherheitsstufe steht in `GCP_STEP5_2_OPERATIONS.md`. Kontaktbilder in Cloud Storage stehen in `GCP_STEP5_3_CONTACT_IMAGES.md`. Die Importvorbereitung steht in `GCP_STEP5_4_IMPORT.md`. Profil und Rollenmodell light stehen in `GCP_STEP5_5_PROFILE_ROLES.md`. Monitoring und Betrieb light stehen in `GCP_STEP5_6_MONITORING.md`. Frontend-Paritaet zur Original-App steht in `GCP_STEP7_FRONTEND_PARITY.md`. Der aktuelle Original-UI-Port fuer GCP steht in `GCP_STEP8_ORIGINAL_UI_PORT.md`. Formate und Expertenkreis in Cloud SQL stehen in `GCP_STEP9_FORMATS_EXPERTS_TABLES.md`.

Hinweis: Diese Datei beschreibt weiterhin den reduzierten Demo Mode. Der aktuelle private Cloud-SQL-GCP-Service nutzt seit Step 8 die Original-App aus `app/versorgungs-kompass.html` und nicht mehr die separate Demo-Oberflaeche.

## Zweck

Der Demo Mode ist eine bewusst reduzierte Version:

- Kontakte anzeigen, suchen und filtern
- Organisationen anzeigen
- Original-Kartenmodus anzeigen
- Kontaktbilder anzeigen
- Kontakt bearbeiten simulieren
- Ownerwechsel simulieren
- Aenderungsverlauf lokal simulieren

Nicht enthalten:

- Supabase
- echte Nutzerkonten
- Rollenmodell
- Import
- gespeicherte Ansichten
- Nutzerprofil und Profilbild-Upload
- zentrale Datenbank

Wichtig: Bearbeitung und Aenderungsverlauf werden mit `localStorage` im Browser gespeichert. Das ist fuer Demo und interne Validierung geeignet, aber kein gemeinsamer CRM-Betrieb.

Hinweis: Die private Cloud-SQL-GCP-Demo geht weiter als diese lokale Demo. Dort sind zentrale Speicherung, Kontaktbilder, ein kontrollierter CSV-Import, Profil/Rollenmodell light sowie Monitoring light bereits schrittweise vorbereitet.

## Lokaler Test

Im Repository starten:

```bash
npm run check:demo
python3 -m http.server 4173
```

Dann im Browser oeffnen:

```text
http://127.0.0.1:4173/demo/index.html
```

Der Button `Demo zuruecksetzen` leert den lokalen Demo-Stand fuer diesen Browser.

## Minimal benoetigte Infrastruktur

Fuer diese Demo-Version reichen:

- GitLab Repo
- Jenkins Job oder manuelles Deployment
- Artifact Registry
- Cloud Run
- interne FQDN, z. B. `ccc.gematik.solutions`

Die Karte nutzt weiterhin die bestehende Kartenlogik aus `map/versorgungs-kompass-map.html`. Fuer die 1:1-Logik laedt sie aktuell Leaflet/CARTO-Ressourcen extern. Falls eure interne Umgebung externe CDNs oder Kartentiles blockiert, muss die IT spaeter eine freigegebene interne Tile-/Asset-Quelle bereitstellen.

Nicht erforderlich fuer die Demo:

- Cloud SQL
- Supabase
- Secret Manager
- Cloud Storage Bucket
- Identity Platform

Einschraenkung: Wenn keine Auth genutzt wird, muss der Zugriff ueber die interne Umgebung abgesichert sein. Eine interne FQDN allein ist keine Authentifizierung.

## Container lokal bauen

```bash
docker build -f Dockerfile.demo -t versorgungs-kompass-demo:local .
docker run --rm -p 8080:8080 versorgungs-kompass-demo:local
```

Danach:

```text
http://127.0.0.1:8080/
```

## GCP Deployment manuell

### Variante A: Cloud Build ohne lokalen Docker-Daemon

Fuer den privaten Test ist dieser Weg am einfachsten:

```bash
gcloud builds submit \
  --config cloudbuild.demo.yaml \
  --substitutions _REGION=europe-west3,_REPOSITORY=versorgungs-kompass,_SERVICE=versorgungs-kompass-demo,_INGRESS=all \
  .
```

Details stehen in `PRIVATE_GCP_TEST.md`.

### Variante B: Lokal mit Docker bauen

Platzhalter ersetzen:

```bash
PROJECT_ID="<gcp-project>"
REGION="europe-west3"
REPOSITORY="versorgungs-kompass"
SERVICE="versorgungs-kompass-demo"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$SERVICE:manual"
```

Artifact Registry anlegen, falls noch nicht vorhanden:

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --project "$PROJECT_ID" \
  --repository-format docker \
  --location "$REGION"
```

Image bauen und pushen:

```bash
gcloud auth configure-docker "$REGION-docker.pkg.dev"
docker build -f Dockerfile.demo -t "$IMAGE" .
docker push "$IMAGE"
```

Cloud Run deployen:

```bash
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --platform managed \
  --allow-unauthenticated \
  --ingress internal-and-cloud-load-balancing
```

Hinweis: `--allow-unauthenticated` erlaubt HTTP-Zugriff ohne Cloud-Run-IAM-Login. In Kombination mit `--ingress internal-and-cloud-load-balancing` bleibt der Dienst auf interne bzw. Load-Balancer-Zugriffe begrenzt. Die finale Einstellung muss eure IT passend zur internen FQDN vorgeben.

## Jenkins

Fuer Jenkins ist `Jenkinsfile.demo` vorbereitet.

Erforderliche Jenkins-Werte:

- Credential `gcp-project-id`
- GCP-Service-Account mit Rechten fuer Artifact Registry und Cloud Run Deploy
- Zugriff auf Docker und `gcloud`
- optional angepasste Werte fuer `REGION`, `REPOSITORY`, `DEMO_SERVICE`, `CLOUD_RUN_INGRESS`

Pipeline-Ablauf:

1. `npm ci`
2. `npm run check:demo`
3. Container mit `Dockerfile.demo` bauen
4. Image in Artifact Registry pushen
5. Cloud Run Service deployen

## Abnahmetest nach Deployment

- App oeffnet unter der internen URL
- Kontakte werden angezeigt
- Suche und Filter funktionieren
- Karte oeffnet und zeigt Demo-Kontakte mit Koordinaten
- Klick auf einen Kartenkontakt oeffnet den Kontakt in der Demo-App
- Kontaktbild oder Initialen-Fallback wird angezeigt
- Kontaktbearbeitung speichert lokal im Browser
- Ownerwechsel erzeugt einen Eintrag im Aenderungsverlauf
- `Demo zuruecksetzen` setzt den lokalen Browserstand zurueck

## Wenn daraus echter Betrieb werden soll

Dann reicht der Demo Mode nicht mehr. Fuer echten Mehrnutzerbetrieb braucht es mindestens:

- zentrale Datenbank, z. B. Cloud SQL PostgreSQL oder Firestore
- serverseitige API fuer Schreibzugriffe
- klares Zugriffskonzept
- Backup-/Restore-Konzept
- optional Cloud Storage fuer Bilder
