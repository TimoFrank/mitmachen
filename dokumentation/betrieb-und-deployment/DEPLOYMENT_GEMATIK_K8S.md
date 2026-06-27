# Deployment gematik Kubernetes

Dieses Dokument ist die fuehrende technische Zielbeschreibung fuer das neue gematik Setup. Der fruehere Cloud-Run-Entwurf bleibt als Referenz erhalten, ist aber nicht mehr Zielarchitektur.

## Zielbild

```text
Software Factory / Git Repo
-> Jenkins Pipeline
-> Artifact Registry
-> Helm Chart
-> Kubernetes Namespace
-> Node.js API
-> Shared Postgres
```

Das Frontend wird nicht als Cloud-Run-Service betrieben. Jenkins erzeugt das statische `docs/`-Artefakt und synchronisiert es in den gematik Bucket-/Hosting-Pfad. Die API laeuft als Container im Kubernetes-Namespace.

## Komponenten

| Komponente | Ziel |
| --- | --- |
| Frontend | statisches Artefakt aus `docs/`, ausgeliefert ueber gematik Hosting/Bucket |
| API | `api/Dockerfile`, Node.js Server fuer `/api/...` |
| Datenbank | gematik Shared Postgres |
| Container Registry | Artifact Registry |
| Deployment | Jenkins + Helm |
| Auth | interne Gateway-/SSO-Identitaet per vertrauenswuerdigem Header |
| Storage | Object Storage fuer Profil- und Kontaktbilder |

## Jenkins-Pipeline

Die Jenkins-Referenzdatei `artefakte/Jenkinsfile.gematik` fuehrt aus:

1. `npm ci`
2. `npm run check`
3. `npm run security:audit`
4. Semgrep SAST
5. Gitleaks Secret Scan
6. Playwright Visual Smoke Tests
7. `bash scripts/sync_github_pages.sh`
8. `scripts/prepare_target_frontend_config.mjs` fuer `dataMode: "api"`, `authMode: "trusted-header"`, `apiBaseUrl` und `requireApiGateway: true`
9. API-Gateway-Produktionsaudit
10. API-Image aus `api/Dockerfile` bauen
11. Trivy Image Scan
12. API-Image in Artifact Registry pushen
13. `helm lint` und `helm template`
14. Frontend-Artefakt in den Bucket-/Hosting-Pfad synchronisieren
15. `helm upgrade --install` in den Kubernetes-Namespace
16. Rollout- und Health-Smoke-Test

## Erwartete Jenkins-Werte

| Wert | Zweck |
| --- | --- |
| `versorgungs-artifact-registry` | Registry-Pfad ohne Image-Namen |
| `versorgungs-api-base-url` | interne HTTPS-URL der API |
| `versorgungs-frontend-base-url` | interne HTTPS-URL des Frontends |
| `versorgungs-frontend-bucket-uri` | Bucket-/Hosting-Ziel fuer `docs/` |
| `versorgungs-k8s-namespace` | Kubernetes-Namespace |
| `versorgungs-postgres-host` | Host der Shared-Postgres-Datenbank |
| `versorgungs-postgres-password-secret-name` | Kubernetes Secret mit DB-Passwort |
| `versorgungs-profile-image-bucket` | Object-Storage-Ziel fuer Profilbilder |
| `versorgungs-contact-image-bucket` | Object-Storage-Ziel fuer Kontaktbilder |

Die konkrete Credential-Benennung kann in der Software Factory angepasst werden; die Werte muessen aber dieselbe Semantik behalten.

## Helm Chart

Das Chart liegt unter:

```text
dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass
```

Es definiert:

- API-Deployment mit zwei Replicas als Default
- ClusterIP-Service
- optionalen Ingress
- ConfigMap fuer nicht geheime Runtime-Werte
- Secret-Referenz fuer `DB_PASSWORD`
- Readiness-Probe `/api/healthz`
- Liveness-Probe `/healthz`
- Ressourcenrequests und -limits
- Security Context ohne Privilege Escalation

Das Chart legt keine Datenbank und keinen Bucket an. Diese Ressourcen kommen aus der gematik-Plattform.

## Runtime-Konfiguration

API:

```text
PORT=8080
DB_HOST=<shared-postgres-host>
DB_PORT=5432
DB_NAME=versorgungs_kompass
DB_USER=vk_app
DB_PASSWORD=<aus Kubernetes Secret>
API_AUTH_MODE=trusted-header
AUTH_EMAIL_HEADER=x-auth-request-email
AUTH_SUBJECT_HEADER=x-auth-request-user
ALLOWED_ORIGIN=https://<frontend-url>
PROFILE_IMAGE_BUCKET=<bucket-name>
CONTACT_IMAGE_BUCKET=<bucket-name>
```

Frontend:

```js
dataMode: "api",
authMode: "trusted-header",
apiBaseUrl: "https://<interne-api-url>",
requireApiGateway: true
```

## Auth und Sicherheit

Die API vertraut im Modus `trusted-header` nur der vorgelagerten Gateway-/Ingress-Schicht. Diese Schicht muss:

- den Zugriff auf interne Nutzer begrenzen,
- optional Entra/gemIAM/SSO durchsetzen,
- eingehende Identity-Header aus Browser-Requests entfernen,
- gepruefte Nutzeridentitaet in `AUTH_EMAIL_HEADER` und optional `AUTH_SUBJECT_HEADER` setzen.

Die API mappt E-Mail oder Subject auf `profiles` und prueft `viewer`, `editor` und `admin` serverseitig.

## Datenbank und Migration

Shared Postgres wird nicht automatisch von der App angelegt. Schema- und Datenmigrationen muessen kontrolliert durch Jenkins, ein separates DB-Migrationsticket oder ein freigegebenes Betriebsverfahren angewendet werden. Ein alter GCP-/Cloud-SQL-Migrationsentwurf liegt nur noch im Archiv und ist nicht Teil des aktiven Zielpfads.

Vor einer Umschaltung:

- Supabase exportieren.
- abgestimmtes Schema in Shared Postgres anwenden.
- Daten mit stabilen IDs importieren.
- Counts und Stichproben vergleichen.
- Rollen, Owner, Historie, Formate, Hospitationen, Stakeholder, Saved Views und Bilder pruefen.

## Implementierung, Deployment und Migration fuer gematik IT

Dieser Abschnitt beschreibt den empfohlenen Uebergabeablauf fuer die Inbetriebnahme in der gematik Umgebung. Die Dateien im Repository sind bewusst als Referenz- und Startpunkt gedacht; konkrete Registry-Namen, Namespace-Namen, Ingress-Klassen, Secret-Namen und Bucket-Ziele koennen an die gematik Software Factory angepasst werden.

### 1. Voraussetzungen bereitstellen

Vor dem ersten Pipeline-Lauf benoetigt die gematik IT folgende Zielressourcen:

| Ressource | Erwartung |
| --- | --- |
| Kubernetes Namespace | eigener Namespace fuer API-Deployment, Service, optional Ingress und Secrets |
| Artifact Registry | Ziel fuer das API-Container-Image |
| Shared Postgres | Datenbank `versorgungs_kompass`, technischer App-User, TLS/Netzfreigabe nach gematik Standard |
| Kubernetes Secret | Secret mit `DB_PASSWORD`, referenziert ueber `secrets.databasePasswordSecretName` im Helm Chart |
| Frontend Hosting | internes statisches Hosting oder Bucket-Ziel fuer das erzeugte `docs/`-Artefakt |
| Gateway/Ingress/SSO | interne Authentifizierung und Setzen vertrauenswuerdiger Identity-Header |
| Object Storage | Ziel fuer Profil- und Kontaktbilder, falls Bilder nicht direkt aus der Datenbank bzw. bestehenden URLs gelesen werden |

Die Anwendung legt diese Ressourcen nicht selbst an. Sie erwartet, dass Netzwerk, DNS, TLS, Secret-Verwaltung, Registry-Zugriff und SSO/Gateway durch die Plattform bereitgestellt werden.

### 2. Repository und Build in Jenkins anbinden

Die Referenzpipeline liegt unter:

```text
dokumentation/betrieb-und-deployment/artefakte/Jenkinsfile.gematik
```

Die Pipeline kann 1:1 uebernommen oder in eine bestehende gematik Pipeline-Library uebersetzt werden. Fachlich muessen diese Schritte erhalten bleiben:

1. Abhaengigkeiten installieren: `npm ci`.
2. Statische Checks ausfuehren: `npm run check`.
3. Security Checks ausfuehren: Dependency Audit, Secret Scan, SAST und Image Scan.
4. Optionalen visuellen Smoke Test ausfuehren: `npm run test:visual`.
5. Statisches Frontend-Artefakt erzeugen: `bash scripts/sync_github_pages.sh`.
6. Frontend fuer Zielbetrieb umschreiben:

```bash
node scripts/prepare_target_frontend_config.mjs \
  docs/data/supabase-config.js \
  "$API_BASE_URL" \
  api \
  trusted-header
```

7. API-Image bauen:

```bash
docker build -f api/Dockerfile -t "$API_IMAGE" .
```

8. Image in die Artifact Registry pushen.
9. Helm Chart validieren und in den Namespace deployen.
10. Frontend-Artefakt in das interne Hosting-Ziel synchronisieren.
11. Rollout und Health-Endpunkte pruefen.

Das Skript `scripts/preflight_target_deployment.mjs` kann vor der Pipeline-Anbindung lokal oder in einer fruehen Jenkins-Stufe laufen. Es prueft, ob die wichtigsten Dateien, Tools und Ziel-Umgebungsvariablen vorhanden sind.

### 3. Jenkins-Credentials und Umgebungswerte setzen

Die Referenzpipeline erwartet sprechende Credentials. Die Namen duerfen in der gematik Software Factory abweichen, die Bedeutung sollte aber gleich bleiben:

| Wert | Beispielhafte Bedeutung |
| --- | --- |
| `ARTIFACT_REGISTRY` | Registry-Pfad ohne Image-Namen |
| `API_BASE_URL` | interne HTTPS-URL der API, z. B. `https://versorgungs-kompass-api.example.internal` |
| `FRONTEND_BASE_URL` | interne HTTPS-URL des Frontends |
| `FRONTEND_BUCKET_URI` | Ziel fuer die statischen `docs/`-Dateien |
| `K8S_NAMESPACE` | Kubernetes Namespace |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | Shared-Postgres-Verbindung ohne Passwort |
| `DB_PASSWORD_SECRET_NAME` | Name des Kubernetes Secrets mit dem DB-Passwort |
| `API_AUTH_MODE` | fuer das Zielbild `trusted-header` |
| `AUTH_EMAIL_HEADER` | Header mit gepruefter Nutzer-E-Mail, z. B. `x-auth-request-email` |
| `AUTH_SUBJECT_HEADER` | optionaler Header mit stabiler Nutzer-ID |
| `PROFILE_IMAGE_BUCKET`, `CONTACT_IMAGE_BUCKET` | Object-Storage-Ziele fuer Bilder |

Wichtig: DB-Passwort, Registry-Credentials, Tokens und private Zertifikate duerfen nicht in das Repository, nicht in das Frontend-Artefakt und nicht in Helm Values im Klartext geschrieben werden.

### 4. API per Helm deployen

Das Helm Chart liegt unter:

```text
dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass
```

Minimaler Deployment-Aufruf:

```bash
helm upgrade --install versorgungs-kompass \
  dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass \
  --namespace "$K8S_NAMESPACE" \
  --atomic \
  --wait \
  --timeout 10m \
  --set image.repository="$API_IMAGE_REPOSITORY" \
  --set image.tag="$BUILD_NUMBER" \
  --set ingress.host="$API_HOST" \
  --set config.allowedOrigin="$FRONTEND_BASE_URL" \
  --set config.apiAuthMode="trusted-header" \
  --set config.authEmailHeader="$AUTH_EMAIL_HEADER" \
  --set config.authSubjectHeader="$AUTH_SUBJECT_HEADER" \
  --set database.host="$DB_HOST" \
  --set database.port="$DB_PORT" \
  --set database.name="$DB_NAME" \
  --set database.user="$DB_USER" \
  --set secrets.databasePasswordSecretName="$DB_PASSWORD_SECRET_NAME"
```

Die gematik IT sollte vor Produktivsetzung mindestens pruefen:

- Ingress-Annotationen und Ingress-Klasse nach Plattformstandard.
- TLS-Terminierung und Zertifikatsbezug.
- Network Policies zwischen API, Gateway, Registry und Shared Postgres.
- Resource Requests und Limits passend zur erwarteten Nutzung.
- Logging-, Monitoring- und Alerting-Anbindung.
- Backup- und Restore-Verfahren der Shared-Postgres-Datenbank.

### 5. Daten aus Supabase migrieren

Die Migration sollte als eigener, freigegebener Betriebsablauf geplant werden. Der sichere Ablauf ist:

1. Migrationsfenster festlegen und Schreibzugriffe im bisherigen Supabase-Betrieb einfrieren.
2. Vollstaendigen Export aus Supabase erstellen.
3. Ziel-Schema in Shared Postgres anwenden. Grundlage ist das freigegebene Datenmodell des Versorgungs-Kompass; alte GCP-/Cloud-SQL-Dateien im Archiv sind nicht fuehrend.
4. Daten mit stabilen IDs importieren, insbesondere Kontakte, Organisationen, Profile, Owner, Aenderungshistorie, Formate, Hospitationen, Expertenkreis, Stakeholder, Saved Views und Nutzereinstellungen.
5. Profil- und Kontaktbilder in das gematik Object Storage ueberfuehren oder bestehende Bildreferenzen bewusst beibehalten.
6. Tabellen-Counts, Pflichtfelder, Fremdschluessel, Rollen und Stichproben vergleichen.
7. API gegen Shared Postgres starten und Lesezugriffe testen.
8. Schreibpfade mit Admin, Editor und Viewer pruefen.
9. Erst nach fachlicher Abnahme das Frontend im Zielbetrieb fuer Nutzer freigeben.

Wichtig fuer die Datenqualitaet: IDs und Zeitstempel sollten nicht neu erzeugt werden, wenn sie bereits fachliche Verknuepfungen tragen. Das betrifft unter anderem Kontakt-Organisation-Verweise, Owner-Zuordnungen, Aenderungshistorie, Format-Teilnahmen und Hospitationen.

### 6. Umschaltung vom bisherigen Betrieb

Bis zur freigegebenen Umschaltung bleibt der heutige GitHub-Pages-/Supabase-Pfad bestehen. Die gematik Variante sollte parallel vorbereitet und intern getestet werden.

Empfohlener Cutover:

1. Letztes Supabase-Backup erstellen.
2. Supabase-Schreibzugriffe sperren oder fachlich pausieren.
3. Delta-Daten seit dem Testimport uebertragen.
4. Jenkins-Deployment fuer API und Frontend ausloesen.
5. Smoke Tests und fachliche Stichproben ausfuehren.
6. Interne Ziel-URL kommunizieren.
7. Alten Pfad nur noch lesend oder als Fallback behalten, bis die Abnahme abgeschlossen ist.

Rollback:

- Vor fachlicher Freigabe: Nutzer bleiben auf GitHub Pages/Supabase.
- Nach Frontend-Fehler: letztes funktionierendes Frontend-Artefakt erneut ausliefern.
- Nach API-Fehler: `helm rollback` auf die vorherige Release-Revision.
- Nach Datenfehler: keine Schnellkorrektur im laufenden System; Ziel-Datenbank aus Backup wiederherstellen oder korrigierte Migration in einem neuen Fenster fahren.

### 7. Abnahme fuer Betrieb

Die Inbetriebnahme gilt technisch als erfolgreich, wenn:

- `kubectl rollout status deployment/versorgungs-kompass-api` erfolgreich ist.
- `/api/healthz` und `/api/ops/checks` erfolgreich antworten.
- `/api/session` nur mit gepruefter Gateway-Identitaet funktioniert.
- Das Frontend keine Supabase-Projekt-URL und kein Supabase Browser SDK mehr nutzt.
- Kontakte, Organisationen, Profile, Karte, Formate, Hospitationen, Stakeholder und Saved Views ueber `/api/...` laden.
- Admin, Editor und Viewer ihre erwarteten Rechte haben.
- Schreiben, Lesen, Rollenpruefung und Aenderungshistorie fachlich plausibel sind.
- Monitoring, Logs, Backup und Restore-Ansprechpartner dokumentiert sind.

## Smoke Tests

Nach Deployment:

```bash
curl -fsS https://<api-url>/api/healthz
curl -fsS https://<api-url>/api/ops/checks
curl -fsS https://<api-url>/api/session
```

`/api/session` braucht eine gepruefte Gateway-Identitaet. Ein nackter Public-Request darf im Zielbetrieb nicht erfolgreich sein.

Im Browser pruefen:

- Frontend oeffnet intern.
- Login/SSO leitet nicht auf Supabase Auth.
- Kontakte, Organisationen, Profile, Formate, Hospitationen und Stakeholder laden ueber `/api/...`.
- Schreibpfade funktionieren fuer berechtigte Rollen.
- Netzwerk-Tab zeigt keine Supabase-Projekt-URL und kein Supabase Browser SDK im Zielartefakt.

## Abgrenzung

Nicht Teil dieses Deployments:

- Cloud Run Services
- Cloud SQL spezifische Attachments
- IAP als zwingende Vorgabe
- oeffentliche unauthentifizierte Bereitstellung
- automatische Anlage von Shared-Postgres oder Buckets

Der aktuelle GitHub-Pages- und Supabase-Pfad bleibt bis zur freigegebenen Umschaltung bestehen.
