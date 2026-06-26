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
| API | `Dockerfile.api`, Node.js Server fuer `/api/...` |
| Datenbank | gematik Shared Postgres |
| Container Registry | Artifact Registry |
| Deployment | Jenkins + Helm |
| Auth | interne Gateway-/SSO-Identitaet per vertrauenswuerdigem Header |
| Storage | Object Storage fuer Profil- und Kontaktbilder |

## Jenkins-Pipeline

Die Root-`Jenkinsfile` fuehrt aus:

1. `npm ci`
2. `npm run check`
3. `npm run security:audit`
4. Semgrep SAST
5. Gitleaks Secret Scan
6. Playwright Visual Smoke Tests
7. `bash scripts/sync_github_pages.sh`
8. `scripts/prepare_target_frontend_config.mjs` fuer `dataMode: "api"`, `authMode: "trusted-header"`, `apiBaseUrl` und `requireApiGateway: true`
9. API-Gateway-Produktionsaudit
10. API-Image aus `Dockerfile.api` bauen
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
deploy/helm/versorgungs-kompass
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
