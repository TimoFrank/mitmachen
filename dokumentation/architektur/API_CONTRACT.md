# Versorgungs-Kompass API-Kontrakt

Diese API-Schicht kapselt produktive Backend-Zugriffe fuer den Browser. Das Frontend sendet im Zielmodus nur fachliche REST-Aufrufe an `/api/...`; Tabellenfelder, SQL-Filter, Storage-Pfade und Rollenlogik bleiben serverseitig in `api/server.mjs`.

Die technische Deployment-Doku fuer Jenkins, Kubernetes, Helm und gematik-Zielbetrieb steht in `../betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`.

## Authentifizierung

Das Zielbild nutzt eine interne Gateway-/SSO-Schicht vor Frontend und API. Der Browser verwaltet keine Supabase-Session und sendet keine Supabase-Access-Tokens.

Der API-Server liest die vom Gateway gesetzte Identitaet aus konfigurierten Request-Headern, mappt E-Mail oder Subject auf `profiles` und liefert diese Session ueber `GET /api/session`. Schreibende und administrative Endpunkte pruefen `viewer`, `editor` und `admin` serverseitig.

## Endpunkte

Alle Antworten sind JSON. Listen liefern `{ "items": [...] }`.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/healthz` | Lokaler Healthcheck fuer Container und Jenkins-Smoke |
| `GET` | `/api/healthz` | API-Healthcheck fuer Kubernetes-Readiness und Smoke-Tests |
| `GET` | `/api/session` | Aktuelles Gateway-/SSO-Profil, Rollenmatrix und Auth-Modus laden |
| `GET` | `/api/contacts` | Kontakte laden, optional `includeArchived=true`, `status=...` |
| `POST` | `/api/contacts` | Kontakt anlegen |
| `GET` | `/api/contacts/:id` | Einzelkontakt laden |
| `PATCH` | `/api/contacts/:id` | Kontakt aktualisieren, inklusive Archivieren/Wiederherstellen ueber `status` |
| `GET` | `/api/contacts/:id/history` | Aenderungshistorie laden, optional `action=...` |
| `GET` | `/api/activities` | Globalen Kontakt-Aenderungsverlauf laden, optional `limit`, `offset`, `action`/`kind`, `changedBy`, `from`, `to`, `q` |
| `GET` | `/api/organizations` | Organisationen laden, optional `includeArchived=true` |
| `POST` | `/api/organizations` | Organisation anlegen |
| `GET` | `/api/organizations/:id` | Einzelorganisation laden |
| `PATCH` | `/api/organizations/:id` | Organisation aktualisieren |
| `GET` | `/api/expert-groups` | Expertenkreis-Gruppen laden, optional `includeArchived=true` |
| `GET` | `/api/expert-contacts` | Expertenkreis-Kontakte laden, optional `includeArchived=true`, `status=...` |
| `PATCH` | `/api/expert-contacts/:id` | Expertenkreis-Kontakt aktualisieren, inklusive Ownern, Themen und Notizen |
| `GET` | `/api/expert-organizations` | Expertenkreis-Organisationen laden, optional `includeArchived=true` |
| `GET` | `/api/profiles` | Aktive Teamprofile laden |
| `GET` | `/api/profile` | Profil des angemeldeten Nutzers laden |
| `PATCH` | `/api/profile` | Profil des angemeldeten Nutzers aktualisieren |
| `POST` | `/api/profile/avatar` | Profilbild des angemeldeten Nutzers in Object Storage hochladen |
| `DELETE` | `/api/profile/avatar` | Profilbild-Dateien entfernen und `avatar_url` leeren |
| `GET` | `/api/profile-avatar/:id` | Profilbild ueber API aus privatem Object Storage ausliefern |
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
| `GET` | `/api/hospitation-slots` | Interne Hospitationstermine laden, optional `includeArchived=true` |
| `POST` | `/api/hospitation-slots` | Internen Hospitationstermin anbieten |
| `PATCH` | `/api/hospitation-slots/:id` | Hospitationstermin aktualisieren |
| `GET` | `/api/hospitations` | Hospitationen laden, optional `includeArchived=true` |
| `POST` | `/api/hospitations` | Hospitation anfragen oder direkt buchen |
| `GET` | `/api/hospitations/:id` | Einzelne Hospitation laden |
| `PATCH` | `/api/hospitations/:id` | Hospitation aktualisieren, durchfuehren, dokumentieren oder archivieren |

## DTO-Richtung

Die API gibt Frontend-DTOs zurueck, keine Supabase-Rohzeilen. Beispiele:

- Kontaktfelder wie `organizationId`, `postalCode`, `themes`, `owner`, `ownerId`
- Organisationsfelder wie `organizationType`, `postalCode`, `contactCount`
- Expertenkreis-Felder wie `groupId`, `group`, `category`, `organizationId`, `themes`, `sourceUrl`, `ownerId`, `ownerIds`
- Profilfelder bleiben kompatibel zur bestehenden Profilseite, z.B. `display_name`, `avatar_url`, `team`, `bio`, `role`
- Formatfelder wie `formatType`, `startsAt`, `owner`, `participants`
- Teilnehmerfelder wie `contactId`, `invitationStatus`, `participantRole`
- Hospitationsfelder wie `slotId`, `contactId`, `organizationId`, `startsAt`, `status`, `goal`, `topics`, `documentationSummary`, `followUpDueAt`
- Hospitationstermin-Felder wie `contactId`, `organizationId`, `startsAt`, `capacity`, `ownerId`, `status`

DB-Spalten wie `organization_id`, `postal_code`, `format_type`, `invitation_status` oder `follow_up_due_at` werden nur im API-Server gemappt.

## Produktivmodus

`data/supabase-config.js` steuert den Modus:

- `dataMode: "local"` oder `"demo"`: Demo-/Local-Daten bleiben im Browser verfuegbar.
- `dataMode: "api"` und `authMode: "trusted-header"` oder `"sso"`: fachliche Datenpfade laufen ueber die Ziel-API; Identitaet kommt vom internen Gateway.
- `dataMode: "gcp"` bleibt als Kompatibilitaetsalias fuer alte Referenzen erhalten.
- `apiBaseUrl: "https://..."`: fachliche Datenpfade laufen ueber die API-Schicht.
- `requireApiGateway: true`: fachliche Datenpfade muessen ueber `/api/...` laufen. Wenn `apiBaseUrl` leer ist, nutzt der Browser same-origin `/api/...`.
- `dataMode: "supabase"` ohne API-Gateway ist kein produktiver Datenmodus mehr. Das Frontend bricht fachliche Datenpfade mit einer klaren Fehlermeldung ab, statt direkte Supabase-Tabellen- oder Storage-Queries auszufuehren.

Fuer internes gematik-Hosting muessen `dataMode: "api"`, `authMode: "trusted-header"` oder `"sso"`, `apiBaseUrl` und `requireApiGateway: true` gesetzt sein. Jenkins prueft das im Produktionsartefakt. Danach ist ein separater API-Modus-Test noetig: Kontakte, Organisationen, Profile, Profilbild-Storage, gespeicherte Ansichten, User Settings, Formate und Hospitationen muessen im Browser ueber `/api/...` laufen.

## Browser-Abgrenzung

Im Zielbild ist im Browser weder Supabase Auth noch ein Supabase-Datenclient aktiv. Nicht mehr im Browser vorhanden sein duerfen direkte fachliche Aufrufe wie `from("contacts").select(...)`, `from("organizations")`, `from("saved_views")`, `from("formats")`, `from("hospitations")`, `from("hospitation_slots")` oder direkte Storage-Zugriffe fuer Profilbilder.

## Jenkins-Absicherung

`npm run check` fuehrt `scripts/audit_api_gateway.mjs` aus. Ohne Produktionsartefakt ist der Audit lokal tolerant, damit der alte Supabase-Fallback bis zur vollstaendigen Datenmigration noch im Code liegen darf. Mit `--production-config` prueft der Audit das auszuliefernde Ziel-Artefakt hart.

Nach dem Erzeugen des Frontend-Artefakts setzt Jenkins `dataMode: "api"`, `authMode: "trusted-header"`, die produktive `apiBaseUrl` und `requireApiGateway: true`. Anschliessend laeuft:

```bash
npm run security:api-gateway -- --production-config docs/data/supabase-config.js
```

Damit prueft Jenkins zusaetzlich, dass das auszuliefernde Artefakt eine HTTPS-API-URL nutzt, nicht auf localhost zeigt, `dataMode: "api"`, einen freigegebenen `authMode` und `requireApiGateway: true` setzt und kein Supabase-Browser-SDK ausliefert.

## Input-Validierung

Schreibende Endpunkte akzeptieren nur definierte JSON-Felder pro fachlichem DTO. Unbekannte Felder werden mit HTTP `400` abgewiesen, bevor die API Daten in Postgres schreibt. Dadurch koennen Clients keine freien DB-Spalten, Filter oder Query-Bestandteile in den Request schmuggeln.

`npm run check` startet zusaetzlich `scripts/test_api_validation.mjs`. Dieser Negativtest prueft, dass ein unbekanntes JSON-Feld in einem API-Request abgewiesen wird.
