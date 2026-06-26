# Deployment GCP/gematik

Archivhinweis: Dieses Dokument beschreibt den frueheren Cloud-Run-Entwurf. Die aktuelle Zielarchitektur fuer die gematik-Migration steht in `../../../DEPLOYMENT_GEMATIK_K8S.md`.

Diese Notiz beschreibt einen moeglichen Migrationsentwurf fuer ein internes Deployment auf Google Cloud mit Jenkins-Pipeline, Cloud SQL, Cloud Storage und IAP/SSO.

Hinweis: Das ist ein offener Architekturentwurf, kein beschlossener gematik-Zielbetrieb. Der aktuelle GitHub-Pages-Pfad mit Supabase bleibt bis zu einer freigegebenen Migration bestehen. Die aktive/archivierte Einordnung steht in `../../../DEPLOYMENT_UEBERSICHT.md`.

## Moeglicher Zielentwurf

Der produktive Betrieb besteht aus zwei Containern:

| Komponente | Container | Aufgabe |
| --- | --- | --- |
| Frontend | `archiv/statischer-frontend-container/Dockerfile` | Alter Entwurf fuer die statische CRM-App aus `docs/` per Nginx. |
| API | `Dockerfile.api` | Liefert `/api/...`, kapselt Cloud-SQL-PostgreSQL, Cloud Storage und serverseitige Rollenpruefung. |

Der Browser spricht fuer fachliche Daten nur mit der API:

```text
Browser -> IAP/SSO -> Frontend -> /api/... -> API-Container -> Cloud SQL PostgreSQL + Cloud Storage
```

Der Browser nutzt kein Supabase Auth mehr. Die API liest die von IAP gesetzte Identitaet, mappt die E-Mail auf `profiles`, liefert `GET /api/session` und prueft Rollen serverseitig (`admin`, `editor`, `viewer`).

## Warum keine sichtbaren Backend-Details mehr im Browser auftauchen

Im API-Modus ruft das Frontend nur eigene REST-Endpunkte auf, zum Beispiel:

```text
GET /api/contacts
PATCH /api/contacts/:id
GET /api/organizations
POST /api/formats
```

Tabellen, Spaltenlisten, SQL-Filter und Storage-Pfade liegen serverseitig in `api/server.mjs`. Browser-URLs enthalten dadurch keine Datenbank- oder Bucket-Details.

## Frontend-Konfiguration

Die Frontend-Konfiguration liegt in:

- `data/supabase-config.js` fuer die lokale Quelle
- `docs/data/supabase-config.js` fuer das auszuliefernde Frontend-Artefakt

Fuer das Produktionsartefakt setzt Jenkins:

```js
dataMode: "gcp",
authMode: "iap",
apiBaseUrl: "https://<api-service-url>",
requireApiGateway: true
```

`requireApiGateway: true` bedeutet: fachliche Datenpfade muessen ueber `/api/...` laufen. Im GCP-Zielbild duerfen keine oeffentlichen Supabase-Keys im Frontend-Artefakt stehen.

## API-Environment-Variablen

Der API-Container benoetigt:

| Variable | Zweck |
| --- | --- |
| `DB_HOST` | Cloud-SQL-Verbindungspfad, z. B. `/cloudsql/<project>:<region>:<instance>`. |
| `DB_NAME` | PostgreSQL-Datenbank, Standard `versorgungs_kompass`. |
| `DB_USER` | PostgreSQL-App-User, Standard `vk_app`. |
| `DB_PASSWORD` | Datenbankpasswort aus Secret Manager. |
| `API_AUTH_MODE` | `iap` fuer das Zielbild. |
| `IAP_JWT_AUDIENCE` | Erwartete Audience des signierten IAP-JWT, z. B. `/projects/<project-number>/locations/<region>/services/<api-service>`. |
| `PROFILE_IMAGE_BUCKET` | Privater Cloud-Storage-Bucket fuer Profilbilder. |
| `CONTACT_IMAGE_BUCKET` | Privater Cloud-Storage-Bucket fuer Kontaktbilder. |
| `ALLOWED_ORIGIN` | Erlaubter Frontend-Origin fuer CORS, z. B. Cloud-Run-Frontend-URL. |
| `PORT` | Optional. Cloud Run setzt den Port ueblicherweise selbst. |

Supabase-Keys gehoeren nicht mehr in Frontend, API-Env oder Repository. Der produktive Datenpfad ist Cloud SQL plus Cloud Storage.

## Jenkins-Pipeline

Die Pipeline in `Jenkinsfile` fuehrt aus:

1. `npm ci`
2. `npm run check`
3. `npm run security:audit`
4. Semgrep SAST
5. Gitleaks Secret Scan
6. Playwright Visual Smoke Tests
7. `scripts/sync_github_pages.sh`
8. Injektion von `dataMode: "gcp"`, `authMode: "iap"`, `apiBaseUrl` und `requireApiGateway: true` in `docs/data/supabase-config.js`
9. API-Gateway-Produktionspruefung
10. Docker-Build fuer Frontend und API
11. Push in Google Artifact Registry
12. Deploy API nach Cloud Run
13. Deploy Frontend nach Cloud Run

Die API-Gateway-Produktionspruefung lautet:

```bash
npm run security:api-gateway -- --production-config docs/data/supabase-config.js
```

Sie bricht ab, wenn:

- im GCP-Produktionsartefakt Supabase-Browser-SDK oder Supabase-Projekt-URLs gefunden werden
- `apiBaseUrl` im Produktionsartefakt fehlt
- `apiBaseUrl` nicht HTTPS ist
- `apiBaseUrl` auf localhost zeigt
- `requireApiGateway: true` fehlt
- `dataMode: "gcp"` ohne `authMode: "iap"` gesetzt ist

## API-Input-Validierung

Schreibende API-Endpunkte akzeptieren nur definierte JSON-Felder. Unbekannte Felder werden mit HTTP `400` abgewiesen, bevor Daten in Cloud SQL geschrieben werden.

Der Negativtest laeuft in `npm run check` und separat per:

```bash
npm run test:api-validation
```

Damit ist pruefbar, dass Clients keine freien DB-Spalten, Filter oder Query-Bestandteile in API-Requests einschleusen.

## GCP Cloud Run Zielbild

Empfohlene Services:

| Service | Image | Oeffentlich erreichbar | Hinweise |
| --- | --- | --- | --- |
| `versorgungs-kompass-api` | API-Image | Nein, IAP und interner/LB-Ingress | Erwartet IAP-Identitaet und prueft Rollen serverseitig. |
| `versorgungs-kompass-frontend` | Frontend-Image | Nein, IAP und interner/LB-Ingress | Liefert statische App und Config-Artefakt aus. |

Die Jenkinsfile nutzt als Standardregion `europe-west3`. Projekt, Repository, Service-Namen und URLs werden ueber Jenkins-Credentials und Environment-Variablen gesetzt.

## Deployment-Check

Vor einem produktiven Deployment:

```bash
npm run check
npm run security:audit
npm run deploy:preflight
npm run test:visual
docker build -t versorgungs-kompass-frontend:test .
docker build -f Dockerfile.api -t versorgungs-kompass-api:test .
```

`npm run deploy:preflight` prueft lokal, ob die benoetigten Dateien, Tools, Docker, `gcloud` und die wichtigsten Deployment-Environment-Variablen vorhanden sind. In Jenkins kommen diese Werte aus Credentials und Pipeline-Environment.

Nach dem Deployment im Browser pruefen:

- API-Healthcheck liefert `{"ok": true}`:

```bash
curl -i https://<api-service-url>/api/healthz
```

- Login funktioniert.
- `GET /api/session` liefert IAP/SSO-Profil und Rollenmatrix.
- Kontakte laden.
- Organisationen laden.
- Formate laden.
- Profil laedt und speichert.
- Profilbild-Upload funktioniert.
- Netzwerk-Tab zeigt fachliche Datenaufrufe an `/api/...`, nicht direkt an Supabase REST oder Supabase Auth.

## Abgrenzung

Dieses Dokument beschreibt das technische Deployment. Fachlicher Betrieb, Rollen, Backups und Notfallablaeufe stehen in `BETRIEB.md`. Der API-Kontrakt und die Security-Abgrenzung stehen in `../architektur/API_CONTRACT.md`.
