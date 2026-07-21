# Versorgungs-Kompass API-Kontrakt

Diese API-Schicht kapselt produktive Backend-Zugriffe fuer den Browser. Das Frontend sendet im Zielmodus nur fachliche REST-Aufrufe an `/api/...`; Tabellenfelder, SQL-Filter, Storage-Pfade und Rollenlogik bleiben serverseitig in `api/server.mjs`.

Die technische Deployment-Doku fuer Jenkins, Kubernetes, Helm und gematik-Zielbetrieb steht in `../betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`.

## Zwei getrennte Anwendungen

| Anwendung | Auslieferung und Daten | Authentisierung | Backendgrenze |
| --- | --- | --- | --- |
| Oeffentliche Produktdemo | GitHub Pages unter dem Profil `pages-demo`; ausschliesslich gebuendelte, synthetische Demo-Daten | `anonymous-demo`, keine echte Benutzeridentitaet | Keine Verbindung zur Fach-API, zu Supabase oder zu einem Registrierungsbackend |
| Geschuetzte Realanwendung | Eigenstaendiges Target-Artefakt fuer GKE-Pre-Integration beziehungsweise gematik-Zielbetrieb; nur freigegebene Fachdatenklassen | IAP im GKE-Vorbereitungspfad, OIDC im Zielbetrieb | Alle fachlichen Browserzugriffe ausschliesslich ueber same-origin `/api/...` |

GitHub Pages bleibt als oeffentliche Demo bestehen. Es ist weder ein vorgeschaltetes Frontend der Realanwendung noch ein Ausweichbetrieb fuer deren Daten. Die beiden Buildprofile duerfen keine Laufzeitdaten, Konfigurationen oder Authentisierungssitzungen miteinander teilen.

## Authentifizierung

Das Zielbild nutzt eine interne Gateway-/Identity-Schicht vor Frontend und API. Der Browser verwaltet keine Supabase-Session und sendet keine Supabase-Access-Tokens. Produktiv sind ausschliesslich `authMode: "oidc"` oder `authMode: "iap"` zulaessig; der unsignierte Entwicklungsadapter `trusted-header` wird bei `NODE_ENV=production` abgewiesen.

Die API vertraut keinem blossen Identitaetsheader. Sie akzeptiert nur ein signiertes JWT, dessen Signatur gegen die konfigurierte HTTPS-JWKS-Quelle geprueft wurde. `issuer`, `audience`, Signaturalgorithmus, Schluesseltyp, `exp`, `nbf`, `iat` und ein stabiles `sub` muessen exakt dem konfigurierten Vertrag entsprechen. Das Paar `(issuer, subject)` wird anschliessend ueber `public.identity_bindings` auf genau ein aktives internes Profil abgebildet; E-Mail oder frei gesetzte Token-Metadaten verleihen keine Rolle. Fehlende, inaktive, mehrdeutige oder technisch nicht pruefbare Bindungen enden fail-closed mit `401`, `403` beziehungsweise `503`.

Im IAP-Pilot wird nur das bereits signaturgepruefte Google-Subject kanonisiert:
Der feste Namespace `accounts.google.com:` wird ausschliesslich vor einer
vollstaendig numerischen Google-Konto-ID entfernt. Dadurch entspricht der Wert
der geschuetzten, namespace-losen Google-ID in `identity_bindings`. OIDC-
Subjects und externe IAP-/Identity-Platform-Namespaces bleiben bytegenau
erhalten; insbesondere gibt es kein Mapping ueber E-Mail-Adressen.

Am Gateway muessen eingehende Identitaets- und Autorisierungsheader entfernt und nach erfolgreicher Tokenpruefung neu gesetzt werden. Die API darf netzseitig nur ueber diesen Gatewaypfad erreichbar sein. Die Plattformabnahme muss Header-Stripping, TLS, exakte Issuer-/Audience-/JWKS-Werte, Schluesselrotation sowie die Netzwerkisolation nachweisen. Schreibende und administrative Endpunkte pruefen `viewer`, `editor` und `admin` zusaetzlich serverseitig ueber die zentrale Route-Policy.

## Endpunkte

Alle Antworten sind JSON. Listen liefern `{ "items": [...] }`.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/healthz` | Lokaler Healthcheck fuer Container und Jenkins-Smoke |
| `GET` | `/readyz` | Readiness mit Datenbank- und `identity_bindings`-Pruefung |
| `GET` | `/api/session` | Aktuelles Gateway-/SSO-Profil, Rollenmatrix und Auth-Modus laden |
| `GET` | `/api/organization-primary-systems?organizationIds=:ids` | Primärsysteme für eine oder mehrere Organisationen laden |
| `POST` | `/api/organization-primary-systems` | Primärsystem einer Organisation anlegen |
| `PATCH` | `/api/organization-primary-systems/:id` | Primärsystem aktualisieren |
| `DELETE` | `/api/organization-primary-systems/:id` | Primärsystem löschen |
| `GET` | `/api/contacts` | Kontakte laden, optional `includeArchived=true`, `status=...` |
| `POST` | `/api/contacts` | Kontakt anlegen |
| `GET` | `/api/contacts/:id` | Einzelkontakt laden |
| `PATCH` | `/api/contacts/:id` | Kontakt aktualisieren, inklusive Archivieren/Wiederherstellen ueber `status` |
| `GET` | `/api/contacts/:id/history` | Kanonische Ereignisse und kompatible Aenderungshistorie eines Kontakts zusammengefuehrt laden, optional `action=...` |
| `GET` | `/api/activities` | Kanonische Aktivitaetsereignisse und kompatible Kontakt-Aenderungen zusammengefuehrt laden, optional `limit`, `offset`, `cursor`, `eventKey`, `category`, `origin`, `action`/`kind`, `changedBy`, `from`, `to`, `q` |
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
| `GET` | `/api/stakeholder-logos/:id` | Stakeholder-Logo nach IAP-, Rollen-, Pfad-, MIME- und Inhaltspruefung aus privatem Object Storage ausliefern |
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
| `GET` | `/api/hospitation-observations` | Beobachtungsobjekte laden; optional `hospitationId` und `includeArchived=true` |
| `PATCH` | `/api/hospitation-observations/:id` | Kanonische Beobachtung mit optionalem `expectedUpdatedAt` bearbeiten oder archivieren |
| `PUT` | `/api/hospitations/:id/observations/sync` | Beobachtungen eines Quellformulars per stabiler ID upserten und entfernte Objekte archivieren |

## Registrierungs-Intake

Die synthetische GitHub-Pages-Demo sendet keine Registrierungen und enthaelt weder Projekt-URL noch Backend-Key. Die separate #Mitmachen-Konzeptdemo bleibt auch im Target technisch inert: Sie ruft keine Intake-Route auf, speichert keine Eingaben und ist keine produktive Dateneingangsstrecke.

`POST /api/network-registrations` ist nur ein dokumentiertes Vorbereitungsgate fuer einen möglichen späteren geschützten Intake, kein freigegebener Backendvertrag. Die aktuelle Konzeptdemo baut diesen Request ausdrücklich nicht auf; automatisierte Tests sichern null Netzwerkaufrufe ab. Ein Handler darf erst zusammen mit einem realen, ausdrücklich freigegebenen Prozess implementiert und aktiviert werden. Es gibt weder einen Supabase-, LocalStorage- noch Demo-Daten-Fallback und auch keine lokale Warteschlange.

Vor einer Aktivierung muessen API-Handler und Route-Policy gemeinsam implementiert und abgenommen werden. Dazu gehoeren mindestens Feld- und Laengen-Allowlisten, serverseitige Formular- und Einwilligungsversionen, Idempotenz ueber `submission_id`, Rate Limit und Missbrauchsschutz, Auditierung ohne Klartext-PII in Logs sowie eine festgelegte Betriebs- und Datenschutzverantwortung. Der Browser erhaelt keine Tabellen- oder Storage-Rechte. Die interne Admin-App darf Registrierungen ebenfalls nur ueber geschuetzte `/api/...`-Routen und mit der erforderlichen Rolle lesen oder bearbeiten.

## DTO-Richtung

### Sektorvertrag fuer Kontakte und Organisationen

`contact.category` und `organization.sector` verwenden den kanonischen Katalog aus `frontend/data/sector-registry.js`; die serverseitige Durchsetzung liegt in `api/care-sector-model.mjs`. Die vollstaendige Werteliste und Aliaszuordnung ist im [Datenmodell](./DATA_MODEL.md#fachmodell-versorgungssektoren) dokumentiert.

Bei schreibenden Kontakt- und Organisationsendpunkten werden bekannte Aliase kanonisiert. Ein leerer Wert wird als `null` gespeichert. Unbekannte Werte sowie `Digital Health` werden mit HTTP `400` abgelehnt; es gibt keinen impliziten Fallback auf `Praxis`. Beim Lesen wird ein bestehender Wert `Digital Health` nicht als Sektor an den Browser ausgeliefert. Die UI erzeugt Sektoroptionen aus dem Katalog und nicht aus den aktuell vorhandenen Datensaetzen.

Die API gibt Frontend-DTOs zurueck, keine Supabase-Rohzeilen. Beispiele:

- Kontaktfelder wie `organizationId`, `postalCode`, `themes`, `owner`, `ownerId`, `mitmachenConsentStatus`, `mitmachenConsentEffectiveAt`, `mitmachenConsentSource`, `mitmachenConsentTextVersion`, `mitmachenConsentRecordedBy`, `mitmachenConsentNote`
- Organisationsfelder wie `organizationType`, `postalCode`, `contactCount`
- Expertenkreis-Felder wie `groupId`, `group`, `category`, `organizationId`, `themes`, `sourceUrl`, `ownerId`, `ownerIds`
- Profilfelder bleiben kompatibel zur bestehenden Profilseite, z.B. `display_name`, `avatar_url`, `team`, `bio`, `role`
- Formatfelder wie `formatType`, `startsAt`, `owner`, `participants`
- Teilnehmerfelder wie `contactId`, `invitationStatus`, `participantRole`
- Hospitationsfelder wie `slotId`, `contactId`, `organizationId`, `startsAt`, `status`, `goal`, `topics`, `documentationSummary`, `followUpDueAt`
- Beobachtungsfelder wie `hospitationId`, `situation`, `description`, `processPhase`, `problemType`, `evidenceType`, `involvedRoles`, `affectedProducts`, `status` und `updatedAt`
- Hospitationstermin-Felder wie `contactId`, `organizationId`, `startsAt`, `capacity`, `ownerId`, `status`
- Aktivitaetsfelder wie `eventKey`, `categoryKey`, `actionKey`, `objectType`, `objectId`, `contactId`, `actorId`, `occurredAt`, `origin`, `references`, `changes`, `metadata`, `details` und `title`

DB-Spalten wie `organization_id`, `postal_code`, `format_type`, `invitation_status` oder `follow_up_due_at` werden nur im API-Server gemappt.

Bei Einwilligungsupdates setzt die API `mitmachen_consent_recorded_by` serverseitig auf das angemeldete Profil. `granted` erfordert Zeitpunkt, Quelle und erfassende Person; `declined` und `withdrawn` erfordern einen Zeitpunkt. `verbal_confirmed` ist nur mit Status `granted` und Nachweisvermerk zulaessig.

### Aktivitaetsereignisse

Fuer Aktivitaetsereignisse gibt es bewusst keinen generischen schreibenden Browser- oder HTTP-Endpunkt. `POST`, `PUT`, `PATCH` und `DELETE` auf `/api/activities` sind nicht Teil des Vertrags. Fachliche Servermutationen koennen kuenftig den privaten internen Writer aufrufen; Ereignisschluessel, Objektbezug und Aenderungsdetails werden dabei aus dem bereits validierten Domainvorgang erzeugt. Der Akteur stammt ausschliesslich aus der serverseitig authentifizierten Session. Browserdaten werden nicht als frei formulierbare Audit-Ereignisse uebernommen.

Die Supabase-Policies fuer `activity_events` bleiben als Defense-in-Depth und Migrationsnachweis erhalten, bilden aber keinen Browser-Laufzeitmodus. `authenticated` besitzt dort nur `SELECT`, keine Sequenzrechte und keine Insert-Policy. Nur der privilegierte Serverdienst darf neue Zeilen und die Identity-Sequenz verwenden. Update und Delete bleiben auch fuer diesen Writer gesperrt, damit das Ledger append-only ist.

`GET /api/activities` fuehrt serverseitig neue Zeilen aus `activity_events` und bestehende Zeilen aus `changes` chronologisch zusammen. Historische Aenderungen werden konservativ fachlich dekoriert; nicht eindeutig ableitbare Eintraege bleiben als klar gekennzeichnete Legacy-Datensaetze lesbar. Solange die Migration fuer `activity_events` in einer Umgebung noch fehlt, kann die API den bisherigen `changes`-Verlauf bereitstellen. Das ist eine serverseitige Datenkompatibilitaet und kein Browser-Fallback.

Wenn ein Fachvorgang sowohl Audit-Zeilen als auch ein kanonisches Ereignis erzeugt, muessen Ereignis, `changes` und deren Verknuepfung in derselben Datenbanktransaktion geschrieben werden. `changes.activity_event_id` darf nur auf ein Ereignis desselben Kontakts zeigen; `canonicalized_at` wird gemeinsam mit der Referenz gesetzt. Kontaktbezogene Ereignisse muessen ihren Kontakt in `contact_id` tragen; jede zusaetzliche Kontakt-ID in `references` muss exakt damit uebereinstimmen. So koennen Rollen- und Archivregeln an einer eindeutigen Spalte durchgesetzt werden.

Die Listenantwort lautet `{ "items": [...], "nextOffset": 30, "hasMore": true, "nextCursor": "..." }`. `offset` und `nextOffset` bleiben fuer bestehende Clients kompatibel. Fuer Folgeseiten soll bevorzugt der opake Cursor der Version 3 zusammen mit dem unveraenderten Filtersatz verwendet werden. Er enthaelt getrennte Lesepositionen und monotone Max-ID-High-Water-Marks fuer `changes` und `activity_events`, den globalen Folge-Offset, einen Ausstellungszeitpunkt und eine Filtersignatur. Die Event-Watermark entscheidet zugleich, ob eine verknuepfte Legacy-Zeile oder bereits ihr kanonisches Ereignis zum Snapshot gehoert. Dadurch beginnen Folgeseiten nicht erneut bei Zeile 0; auch nachtraeglich eingefuegte, rueckdatierte oder waehrend einer Seitensequenz kanonisierte Ereignisse erzeugen weder Luecken noch Duplikate. Die Entscheidung ist unabhaengig von Client- und Datenbankuhr. Ein Cursor mit abweichenden Filtern oder widerspruechlichem `offset` wird mit Status 400 abgelehnt. `nextCursor` ist `null`, sobald keine weitere Aktivitaet vorhanden ist.

Der globale Verlauf und der Kontaktverlauf liefern Aktivitaeten archivierter Kontakte nur an Admins. Fuer Viewer und Editoren verhaelt sich der direkte Aufruf einer archivierten Kontakthistorie wie ein nicht vorhandener Kontakt (404); im globalen Verlauf werden entsprechende Zeilen herausgefiltert. Datenbank-RLS sichert diese API-Regel zusaetzlich ab, ohne einen direkten Browserzugriff zu eroeffnen.

## Produktivmodus

`frontend/data/runtime-config.js` konfiguriert ausschliesslich das Target-Artefakt der Realanwendung:

- `dataMode: "api"` und `authMode: "oidc"` oder `"iap"`: fachliche Datenpfade laufen ueber die Ziel-API; die API verifiziert das signierte Gateway-Token.
- `apiBaseUrl: "https://..."`: Basis-Origin der geschuetzten API; fachliche Routen liegen unter `/api/...`.
- `requireApiGateway: true`: jeder fachliche Browserpfad muss die Gatewaygrenze verwenden.

`demo` ist ein separates Buildprofil fuer das Pages-Artefakt, kein zur Laufzeit waehlbarer Fallback der Realanwendung. `local`, `gcp` und `supabase` sind keine zulaessigen Target-Datenmodi. Fehler bei Session, Gateway oder API duerfen daher weder gebuendelte Demo-Daten aktivieren noch Fachdaten in LocalStorage schreiben oder einen direkten Supabase-Client starten.

Fuer internes gematik-Hosting muessen `dataMode: "api"`, `authMode: "oidc"`, eine freigegebene HTTPS-`apiBaseUrl` und `requireApiGateway: true` gesetzt sein. Frontend und API muessen denselben Origin verwenden; dies entspricht der produktiven CSP (`connect-src 'self'`) und verhindert eine unbeabsichtigte Ausweitung der Browser-Vertrauensgrenze. `iap` bleibt ausschliesslich fuer den getrennten GKE-Pre-Integrationspfad verfuegbar und ist kein Bestandteil der gematik-Identity-Abnahme. Jenkins prueft diese Trennung im Produktionsartefakt. Danach ist ein separater API-Modus-Test noetig: Kontakte, Organisationen, Profile, private Profilbilder, gespeicherte Ansichten, User Settings, Formate und Hospitationen muessen im Browser ueber `/api/...` laufen.

## Browser-Abgrenzung

Im Zielbild ist im Browser weder Supabase Auth noch ein Supabase-Datenclient aktiv. Nicht vorhanden sein duerfen direkte fachliche Aufrufe wie `from("contacts").select(...)`, `from("organizations")`, `from("saved_views")`, `from("formats")`, `from("hospitations")`, `from("hospitation_slots")` oder direkte Storage-Zugriffe fuer Profilbilder. LocalStorage darf weder Fachdaten noch eine Ersatzsitzung oder eine Offline-Warteschlange enthalten. Test-Harnesses mit synthetischen Daten sind keine auslieferbare Laufzeitfunktion.

## Jenkins-Absicherung

`npm run check` fuehrt `scripts/audit_api_gateway.mjs` fuer die serverinterne Activity-Writer-Grenze aus. Mit `--production-config` prueft der Audit das auszuliefernde Target-Artefakt hart; diese Artefaktpruefung ist fuer eine Produktionsfreigabe massgeblich.

Nach dem Erzeugen des Frontend-Artefakts setzt Jenkins `dataMode: "api"`, `authMode: "oidc"`, die produktive `apiBaseUrl` und `requireApiGateway: true`. Anschliessend laeuft:

```bash
npm run security:api-gateway -- --production-config dist/target/data/runtime-config.js
```

Damit prueft Jenkins zusaetzlich, dass das auszuliefernde Artefakt eine HTTPS-API-URL nutzt, nicht auf localhost zeigt, `dataMode: "api"`, einen freigegebenen `authMode` und `requireApiGateway: true` setzt und kein Supabase-Browser-SDK ausliefert.

## Input-Validierung

Schreibende Endpunkte akzeptieren nur definierte JSON-Felder pro fachlichem DTO. Unbekannte Felder werden mit HTTP `400` abgewiesen, bevor die API Daten in Postgres schreibt. Dadurch koennen Clients keine freien DB-Spalten, Filter oder Query-Bestandteile in den Request schmuggeln.

`npm run check` startet zusaetzlich `scripts/test_api_validation.mjs`. Dieser Negativtest prueft, dass ein unbekanntes JSON-Feld in einem API-Request abgewiesen wird.
