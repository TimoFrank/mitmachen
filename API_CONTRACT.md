# Versorgungs-Kompass API-Kontrakt

Diese API-Schicht kapselt produktive Supabase-Tabellenzugriffe fuer den Browser. Das Frontend sendet im API-Modus nur fachliche REST-Aufrufe an `/api/...`; Tabellenfelder, `select=...`-Listen und Supabase-REST-URLs bleiben serverseitig in `api/server.mjs`.

Die technische Deployment-Doku fuer Jenkins, GCP Cloud Run und gematik-Zielbetrieb steht in `DEPLOYMENT_GCP_GEMATIK.md`.

## Authentifizierung

Der Browser nutzt weiterhin Supabase Auth fuer Login und Session. Bei API-Aufrufen sendet `data/data-service.js` den Supabase Access Token als `Authorization: Bearer <token>`.

Der API-Server reicht den Token zusammen mit dem Supabase Anon Key an Supabase REST weiter. Dadurch bleiben Supabase RLS-Regeln wirksam, ohne dass das Frontend direkte Tabellen-Queries formuliert.

## Endpunkte

Alle Antworten sind JSON. Listen liefern `{ "items": [...] }`.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/healthz` | Lokaler Healthcheck fuer Container und Jenkins-Smoke |
| `GET` | `/api/healthz` | Cloud-Run-kompatibler API-Healthcheck |
| `GET` | `/api/contacts` | Kontakte laden, optional `includeArchived=true`, `status=...` |
| `POST` | `/api/contacts` | Kontakt anlegen |
| `GET` | `/api/contacts/:id` | Einzelkontakt laden |
| `PATCH` | `/api/contacts/:id` | Kontakt aktualisieren, inklusive Archivieren/Wiederherstellen ueber `status` |
| `GET` | `/api/contacts/:id/history` | Aenderungshistorie laden, optional `action=...` |
| `GET` | `/api/organizations` | Organisationen laden, optional `includeArchived=true` |
| `POST` | `/api/organizations` | Organisation anlegen |
| `GET` | `/api/organizations/:id` | Einzelorganisation laden |
| `PATCH` | `/api/organizations/:id` | Organisation aktualisieren |
| `GET` | `/api/expert-groups` | Expertenkreis-Gruppen laden, optional `includeArchived=true` |
| `GET` | `/api/expert-contacts` | Expertenkreis-Kontakte laden, optional `includeArchived=true`, `status=...` |
| `GET` | `/api/expert-organizations` | Expertenkreis-Organisationen laden, optional `includeArchived=true` |
| `GET` | `/api/profiles` | Aktive Teamprofile laden |
| `GET` | `/api/profile` | Profil des angemeldeten Nutzers laden |
| `PATCH` | `/api/profile` | Profil des angemeldeten Nutzers aktualisieren |
| `POST` | `/api/profile/avatar` | Profilbild des angemeldeten Nutzers in Supabase Storage hochladen |
| `DELETE` | `/api/profile/avatar` | Profilbild-Dateien entfernen und `avatar_url` leeren |
| `GET` | `/api/saved-views` | Gespeicherte Ansichten laden |
| `POST` | `/api/saved-views` | Gespeicherte Ansicht anlegen |
| `PATCH` | `/api/saved-views/:id` | Gespeicherte Ansicht aktualisieren |
| `DELETE` | `/api/saved-views/:id` | Gespeicherte Ansicht loeschen |
| `GET` | `/api/user-settings` | Einstellungen des angemeldeten Nutzers laden |
| `PUT` | `/api/user-settings` | Einstellungen des angemeldeten Nutzers upserten |
| `GET` | `/api/formats` | Formate mit Teilnehmern laden, optional `includeArchived=true` |
| `POST` | `/api/formats` | Format anlegen |
| `GET` | `/api/formats/:id` | Einzelformat mit Teilnehmern laden |
| `PATCH` | `/api/formats/:id` | Format aktualisieren, inklusive Archivieren ueber `status` |
| `DELETE` | `/api/formats/:id` | Format loeschen |
| `POST` | `/api/formats/:id/participants` | Kontakt als Teilnehmer hinzufuegen |
| `PATCH` | `/api/formats/:id/participants/:contactId` | Teilnehmerstatus, Rolle oder Notiz aktualisieren |
| `DELETE` | `/api/formats/:id/participants/:contactId` | Teilnehmer aus Format entfernen |

## DTO-Richtung

Die API gibt Frontend-DTOs zurueck, keine Supabase-Rohzeilen. Beispiele:

- Kontaktfelder wie `organizationId`, `postalCode`, `themes`, `owner`, `ownerId`
- Organisationsfelder wie `organizationType`, `postalCode`, `contactCount`
- Expertenkreis-Felder wie `groupId`, `group`, `category`, `organizationId`, `themes`, `sourceUrl`
- Profilfelder bleiben kompatibel zur bestehenden Profilseite, z.B. `display_name`, `avatar_url`, `team`, `bio`, `role`
- Formatfelder wie `formatType`, `startsAt`, `owner`, `participants`
- Teilnehmerfelder wie `contactId`, `invitationStatus`, `participantRole`

Supabase-Spalten wie `organization_id`, `postal_code`, `format_type` oder `invitation_status` werden nur im API-Server gemappt.

## Produktivmodus

`data/supabase-config.js` steuert den Modus:

- `dataMode: "local"` oder `"demo"`: Demo-/Local-Daten bleiben im Browser verfuegbar.
- `apiBaseUrl: "https://..."`: fachliche Datenpfade laufen ueber die API-Schicht.
- `requireApiGateway: true`: fachliche Datenpfade muessen ueber `/api/...` laufen. Wenn `apiBaseUrl` leer ist, nutzt der Browser same-origin `/api/...`.
- `dataMode: "supabase"` ohne API-Gateway ist kein produktiver Datenmodus mehr. Das Frontend bricht fachliche Datenpfade mit einer klaren Fehlermeldung ab, statt direkte Supabase-Tabellen- oder Storage-Queries auszufuehren.

Fuer internes GCP/gematik-Hosting muessen `apiBaseUrl` und `requireApiGateway: true` gesetzt sein. Jenkins prueft das im Produktionsartefakt. Danach ist ein separater API-Modus-Test noetig: Kontakte, Organisationen, Profile, Profilbild-Storage, gespeicherte Ansichten, User Settings und Formate muessen im Browser ueber `/api/...` laufen.

## Browser-Abgrenzung

Erlaubt im Browser bleibt Supabase Auth, weil der API-Server den angemeldeten Nutzer ueber den Access Token identifiziert und RLS weiterhin greift. Nicht mehr im Browser vorhanden sind direkte fachliche Aufrufe wie `from("contacts").select(...)`, `from("organizations")`, `from("saved_views")`, `from("formats")` oder Supabase Storage-Zugriffe fuer Profilbilder.

## Jenkins-Absicherung

`npm run check` fuehrt `scripts/audit_api_gateway.mjs` aus. Das Skript scannt Browser-Artefakte in `app/`, `data/`, `login/`, `map/`, `mitmachen/` und `docs/` und bricht den Build ab, wenn direkte fachliche Supabase-Tabellen- oder Storage-Aufrufe gefunden werden.

Nach dem Erzeugen des Frontend-Artefakts setzt Jenkins die produktive `apiBaseUrl` und `requireApiGateway: true`. Anschliessend laeuft:

```bash
npm run security:api-gateway -- --production-config docs/data/supabase-config.js
```

Damit prueft Jenkins zusaetzlich, dass das auszuliefernde Artefakt eine HTTPS-API-URL nutzt, nicht auf localhost zeigt und den API-Gateway-Modus erzwingt.

## Input-Validierung

Schreibende Endpunkte akzeptieren nur definierte JSON-Felder pro fachlichem DTO. Unbekannte Felder werden mit HTTP `400` abgewiesen, bevor die API Daten an Supabase weiterreicht. Dadurch koennen Clients keine freien Supabase-Spalten, Filter oder Query-Bestandteile in den Request schmuggeln.

`npm run check` startet zusaetzlich `scripts/test_api_validation.mjs`. Dieser Negativtest prueft, dass ein unbekanntes JSON-Feld in einem API-Request abgewiesen wird.
