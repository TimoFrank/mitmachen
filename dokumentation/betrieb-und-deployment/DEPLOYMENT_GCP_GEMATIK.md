# Deployment GCP/gematik

Diese Notiz beschreibt den Zielbetrieb des Versorgungs-Kompass fuer ein internes Deployment auf Google Cloud mit Jenkins-Pipeline und API-Gateway-Schicht.

## Zielarchitektur

Der produktive Betrieb besteht aus zwei Containern:

| Komponente | Container | Aufgabe |
| --- | --- | --- |
| Frontend | `Dockerfile` | Liefert die statische CRM-App aus `docs/` per Nginx aus. |
| API | `Dockerfile.api` | Kapselt fachliche Supabase-Tabellen- und Storage-Zugriffe hinter `/api/...`. |

Der Browser spricht fuer fachliche Daten nur mit der API:

```text
Browser -> Frontend -> /api/... -> API-Container -> Supabase REST/Storage
```

Supabase Auth bleibt im Browser. Nach dem Login sendet der Browser den Supabase Access Token als `Authorization: Bearer <token>` an die API. Die API reicht diesen Token zusammen mit dem Supabase Anon Key an Supabase weiter. Dadurch bleiben Row Level Security (RLS) und Nutzerkontext erhalten.

## Warum keine sichtbaren Supabase-Selects mehr im Browser auftauchen

Im API-Modus ruft das Frontend nur eigene REST-Endpunkte auf, zum Beispiel:

```text
GET /api/contacts
PATCH /api/contacts/:id
GET /api/organizations
POST /api/formats
```

Tabellen, Spaltenlisten und Supabase-REST-Details liegen serverseitig in `api/server.mjs`. Browser-URLs enthalten dadurch keine `select=...`-Listen wie `linkedin`, `topics`, `postal_code` oder andere fachliche Felder.

## Frontend-Konfiguration

Die Frontend-Konfiguration liegt in:

- `data/supabase-config.js` fuer die lokale Quelle
- `docs/data/supabase-config.js` fuer das auszuliefernde Frontend-Artefakt

Fuer das Produktionsartefakt setzt Jenkins:

```js
apiBaseUrl: "https://<api-service-url>",
requireApiGateway: true
```

`requireApiGateway: true` bedeutet: fachliche Datenpfade duerfen nicht auf direkte Supabase-Fallbacks zurueckfallen.

## API-Environment-Variablen

Der API-Container benoetigt:

| Variable | Zweck |
| --- | --- |
| `SUPABASE_URL` | Supabase-Projekt-URL, z. B. `https://PROJECT.supabase.co`. |
| `SUPABASE_ANON_KEY` | Supabase Anon/Publishable Key. Kein Service-Role-Key. |
| `ALLOWED_ORIGIN` | Erlaubter Frontend-Origin fuer CORS, z. B. Cloud-Run-Frontend-URL. |
| `PORT` | Optional. Cloud Run setzt den Port ueblicherweise selbst. |

Der Service-Role-Key gehoert nicht in Frontend, API-Env oder Repository, solange die API im Nutzerkontext ueber RLS arbeitet.

## Jenkins-Pipeline

Die Pipeline in `Jenkinsfile` fuehrt aus:

1. `npm ci`
2. `npm run check`
3. `npm run security:audit`
4. Semgrep SAST
5. Gitleaks Secret Scan
6. Playwright Visual Smoke Tests
7. `scripts/sync_github_pages.sh`
8. Injektion von `apiBaseUrl` und `requireApiGateway: true` in `docs/data/supabase-config.js`
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

- direkte fachliche Supabase-Zugriffe im Browser-Code gefunden werden
- `apiBaseUrl` im Produktionsartefakt fehlt
- `apiBaseUrl` nicht HTTPS ist
- `apiBaseUrl` auf localhost zeigt
- `requireApiGateway: true` fehlt

## API-Input-Validierung

Schreibende API-Endpunkte akzeptieren nur definierte JSON-Felder. Unbekannte Felder werden mit HTTP `400` abgewiesen, bevor Daten an Supabase weitergereicht werden.

Der Negativtest laeuft in `npm run check` und separat per:

```bash
npm run test:api-validation
```

Damit ist pruefbar, dass Clients keine freien Supabase-Spalten, Filter oder Query-Bestandteile in API-Requests einschleusen.

## GCP Cloud Run Zielbild

Empfohlene Services:

| Service | Image | Oeffentlich erreichbar | Hinweise |
| --- | --- | --- | --- |
| `versorgungs-kompass-api` | API-Image | Ja, mit CORS auf Frontend-Origin begrenzt | Erwartet Supabase Bearer Token pro Request. |
| `versorgungs-kompass-frontend` | Frontend-Image | Ja | Liefert statische App und Config-Artefakt aus. |

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
- Kontakte laden.
- Organisationen laden.
- Formate laden.
- Profil laedt und speichert.
- Profilbild-Upload funktioniert.
- Netzwerk-Tab zeigt fachliche Datenaufrufe an `/api/...`, nicht direkt an Supabase REST.

## Abgrenzung

Dieses Dokument beschreibt das technische Deployment. Fachlicher Betrieb, Rollen, Backups und Notfallablaeufe stehen in `BETRIEB.md`. Der API-Kontrakt und die Security-Abgrenzung stehen in `../architektur/API_CONTRACT.md`.
