# Versorgungs-Kompass API-Kontrakt

Diese API-Schicht kapselt produktive Backend-Zugriffe für den Browser. Das Frontend sendet im Zielmodus nur fachliche REST-Aufrufe an `/api/...`; Tabellenfelder, SQL-Filter, Storage-Pfade und Rollenlogik bleiben serverseitig in `api/server.mjs`.

Die technische Deployment-Doku für Jenkins, Kubernetes, Helm und gematik-Zielbetrieb steht in `../betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`.

## Zwei getrennte Anwendungen

| Anwendung | Auslieferung und Daten | Authentisierung | Backendgrenze |
| --- | --- | --- | --- |
| Öffentliche Produktdemo | GitHub Pages unter dem Profil `pages-demo`; ausschließlich gebündelte, synthetische Demo-Daten | `anonymous-demo`, keine echte Benutzeridentität | Keine Verbindung zur Fach-API, zu Supabase oder zu einem Registrierungsbackend |
| Geschützte Realanwendung | Eigenständiges Target-Artefakt für GKE-Pre-Integration beziehungsweise gematik-Zielbetrieb; nur freigegebene Fachdatenklassen | IAP im GKE-Vorbereitungspfad, OIDC im Zielbetrieb | Alle fachlichen Browserzugriffe ausschließlich über same-origin `/api/...` |

GitHub Pages bleibt als öffentliche Demo bestehen. Es ist weder ein vorgeschaltetes Frontend der Realanwendung noch ein Ausweichbetrieb für deren Daten. Die beiden Buildprofile dürfen keine Laufzeitdaten, Konfigurationen oder Authentisierungssitzungen miteinander teilen.

## Authentifizierung

Das Zielbild nutzt eine interne Gateway-/Identity-Schicht vor Frontend und API. Der Browser verwaltet keine Supabase-Session und sendet keine Supabase-Access-Tokens. Produktiv sind ausschließlich `authMode: "oidc"` oder `authMode: "iap"` zulässig; der unsignierte Entwicklungsadapter `trusted-header` wird bei `NODE_ENV=production` abgewiesen.

Die API vertraut keinem bloßen Identitätsheader. Sie akzeptiert nur ein signiertes JWT, dessen Signatur gegen die konfigurierte HTTPS-JWKS-Quelle geprüft wurde. `issuer`, `audience`, Signaturalgorithmus, Schlüsseltyp, `exp`, `nbf`, `iat` und ein stabiles `sub` müssen exakt dem konfigurierten Vertrag entsprechen. Das Paar `(issuer, subject)` wird anschließend über `public.identity_bindings` auf genau ein aktives internes Profil abgebildet; E-Mail oder frei gesetzte Token-Metadaten verleihen keine Rolle. Fehlende, inaktive, mehrdeutige oder technisch nicht prüfbare Bindungen enden fail-closed mit `401`, `403` beziehungsweise `503`.

Im IAP-Pilot wird nur das bereits signaturgeprüfte Google-Subject kanonisiert:
Der feste Namespace `accounts.google.com:` wird ausschließlich vor einer
vollständig numerischen Google-Konto-ID entfernt. Dadurch entspricht der Wert
der geschützten, namespace-losen Google-ID in `identity_bindings`. OIDC-
Subjects und externe IAP-/Identity-Platform-Namespaces bleiben bytegenau
erhalten; insbesondere gibt es kein Mapping über E-Mail-Adressen.

Am Gateway müssen eingehende Identitäts- und Autorisierungsheader entfernt und nach erfolgreicher Tokenprüfung neu gesetzt werden. Die API darf netzseitig nur über diesen Gatewaypfad erreichbar sein. Die Plattformabnahme muss Header-Stripping, TLS, exakte Issuer-/Audience-/JWKS-Werte, Schlüsselrotation sowie die Netzwerkisolation nachweisen. Schreibende und administrative Endpunkte prüfen `viewer`, `editor` und `admin` zusätzlich serverseitig über die zentrale Route-Policy.

## Endpunkte

Alle Antworten sind JSON. Listen liefern `{ "items": [...] }`.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/healthz` | Lokaler Healthcheck für Container und Jenkins-Smoke |
| `GET` | `/readyz` | Readiness mit Datenbank- und `identity_bindings`-Prüfung |
| `GET` | `/api/session` | Aktuelles Gateway-/SSO-Profil, Rollenmatrix und Auth-Modus laden |
| `GET` | `/api/organization-primary-systems?organizationIds=:ids` | Primärsysteme für eine oder mehrere Organisationen laden |
| `POST` | `/api/organization-primary-systems` | Primärsystem einer Organisation anlegen |
| `PATCH` | `/api/organization-primary-systems/:id` | Primärsystem aktualisieren |
| `DELETE` | `/api/organization-primary-systems/:id` | Primärsystem löschen |
| `GET` | `/api/contacts` | Kontakte laden, optional `includeArchived=true`, `status=...` |
| `POST` | `/api/contacts` | Kontakt anlegen |
| `GET` | `/api/contacts/:id` | Einzelkontakt laden |
| `PATCH` | `/api/contacts/:id` | Kontakt aktualisieren, inklusive Archivieren/Wiederherstellen über `status` |
| `GET` | `/api/contacts/:id/history` | Kanonische Ereignisse und kompatible Änderungshistorie eines Kontakts zusammengeführt laden, optional `action=...` |
| `GET` | `/api/activities` | Kanonische Aktivitätsereignisse und kompatible Kontakt-Änderungen zusammengeführt laden, optional `limit`, `offset`, `cursor`, `eventKey`, `category`, `origin`, `action`/`kind`, `changedBy`, `from`, `to`, `q` |
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
| `GET` | `/api/profile-avatar/:id` | Profilbild über API aus privatem Object Storage ausliefern |
| `GET` | `/api/stakeholder-logos/:id` | Stakeholder-Logo nach IAP-, Rollen-, Pfad-, MIME- und Inhaltsprüfung aus privatem Object Storage ausliefern |
| `GET` | `/api/saved-views` | Gespeicherte Ansichten laden |
| `POST` | `/api/saved-views` | Gespeicherte Ansicht anlegen |
| `PATCH` | `/api/saved-views/:id` | Gespeicherte Ansicht aktualisieren |
| `DELETE` | `/api/saved-views/:id` | Gespeicherte Ansicht löschen |
| `GET` | `/api/user-settings` | Einstellungen des angemeldeten Nutzers laden |
| `PUT` | `/api/user-settings` | Einstellungen des angemeldeten Nutzers upserten |
| `GET` | `/api/formats` | Formate mit Teilnehmern laden, optional `includeArchived=true` |
| `POST` | `/api/formats` | Format anlegen |
| `GET` | `/api/formats/:id` | Einzelformat mit Teilnehmern laden |
| `PATCH` | `/api/formats/:id` | Format aktualisieren, inklusive Archivieren über `status` |
| `DELETE` | `/api/formats/:id` | Format löschen |
| `POST` | `/api/formats/:id/participants` | Kontakt als Teilnehmer hinzufügen |
| `PATCH` | `/api/formats/:id/participants/:contactId` | Teilnehmerstatus, Rolle oder Notiz aktualisieren |
| `DELETE` | `/api/formats/:id/participants/:contactId` | Teilnehmer aus Format entfernen |
| `GET` | `/api/hospitation-slots` | Interne Hospitationstermine laden, optional `includeArchived=true` |
| `POST` | `/api/hospitation-slots` | Internen Hospitationstermin anbieten |
| `PATCH` | `/api/hospitation-slots/:id` | Hospitationstermin aktualisieren |
| `GET` | `/api/hospitations` | Hospitationen laden, optional `includeArchived=true` |
| `POST` | `/api/hospitations` | Hospitation anfragen oder direkt buchen |
| `GET` | `/api/hospitations/:id` | Einzelne Hospitation laden |
| `PATCH` | `/api/hospitations/:id` | Hospitation aktualisieren, durchführen, dokumentieren oder archivieren |
| `GET` | `/api/hospitation-observations` | Beobachtungsobjekte laden; optional `hospitationId` und `includeArchived=true` |
| `PATCH` | `/api/hospitation-observations/:id` | Kanonische Beobachtung mit optionalem `expectedUpdatedAt` bearbeiten oder archivieren |
| `PUT` | `/api/hospitations/:id/observations/sync` | Beobachtungen eines Quellformulars per stabiler ID upserten und entfernte Objekte archivieren |
| `POST` | `/api/admin/hospitation-import/preview` | Schreibfreie Vorschau eines lokalen Hospitations-Staging-Manifests; nur `admin` |
| `POST` | `/api/admin/hospitation-import/apply` | Exakt bestätigte und erneut geprüfte Vorschau transaktional übernehmen; nur `admin` |

## Hospitations-Staging-Import

Der Importvertrag ist ausschließlich für den kontrollierten Übergang vom lokalen Hospitations-Staging in das geschützte Produktivsystem vorgesehen. Beide Routen sind in der zentralen Route-Policy ausdrücklich auf `admin` begrenzt. Der Browser erhält weder Datenbankzugang noch frei wählbare Tabellen-, Owner- oder Bildfelder.

### Manifest `hospitation-staging/v1`

`POST /api/admin/hospitation-import/preview` erwartet `{ "manifest": { ... } }`. Das Manifest ist auf höchstens 1 MB begrenzt und hat exakt diese Top-Level-Felder:

```json
{
  "schemaVersion": "hospitation-staging/v1",
  "snapshot": {
    "id": "snapshot-2026-07-22T120000Z",
    "createdAt": "2026-07-22T12:00:00.000Z",
    "source": "local-hospitation"
  },
  "ownerRef": "timo-frank",
  "organizations": [],
  "contacts": [],
  "hospitations": [],
  "observations": []
}
```

Zulässige Fachfelder:

- Organisation: `id`, `name`, `sector`, `organizationType`, `postalCode`, `city`, `state`, `website`, `phone`, `email`, `notes`, `source`, `status`
- Kontakt: `id`, `name`, `organizationId`, `organization`, `sector`, `specialty`, `contactRole`, `priority`, `postalCode`, `city`, `state`, `email`, `phone`, `linkedin`, `topics`, `notes`, `source`, `status`
- Hospitation: `id`, `contactId`, `contactName`, `organizationId`, `organizationName`, `status`, `startsAt`, `endsAt`, `location`, `city`, `state`, `sector`, `goal`, `topics`, `requestNote`, `documentationSummary`, `documentationOutcome`, `followUpNote`, `followUpDueAt`, `documentedAt`
- Beobachtung: `id`, `hospitationId`, `sequence`, `title`, `situation`, `situationContext`, `description`, `observed`, `observedAt`, `immediateConsequence`, `processPhase`, `problemType`, `impact`, `observationType`, `evidenceType`, `relevanceScore`, `usageRecommendation`, `nextUse`, `involvedRoles`, `affectedRoles`, `affectedProducts`, `topics`, `themes`, `theme`, `sourceType`, `sourceReference`, `uncertainty`, `limitations`, `source`, `settingType`, `internalUseAllowed`, `externalUseAllowed`, `status`, `createdAt`, `updatedAt`

Alle IDs müssen im Snapshot eindeutig und stabil sein. Kontakt-, Organisations- und Hospitationsreferenzen dürfen nur auf Einträge desselben Snapshots zeigen. Organisationen werden fachlich über normalisierten Namen und Ort, Kontakte über normalisierten Namen, gemappte Organisation und Ort sowie Hospitationen über Zeitpunkt und gemappte Kontakt-/Organisationsreferenzen abgeglichen. Eine Beobachtung wird ausschließlich über ihre globale stabile ID aktualisiert. Existiert dieselbe Kombination aus Hospitation, Reihenfolge und Titel unter einer anderen ID, meldet die Vorschau einen Konflikt und überschreibt nichts.

Bild-, Avatar- und Logofelder sind verboten. Ebenso akzeptiert der Vertrag keine Profil-, Owner-, Auth-, Einstellungs- oder beliebigen `payload`-Felder. `ownerRef` ist kein Profil-Identifier aus dem Browser, sondern ausschließlich das Alias `timo-frank`. Die API löst es serverseitig auf genau ein aktives Profil auf. Der produktive Deployment-Workflow verlangt `HOSPITATION_IMPORT_OWNER_PROFILE_ID` als geschütztes Environment-Secret und setzt es auf die stabile Profil-ID von Timo Frank. Außerhalb dieses Deployments bleibt der fail-closed Fallback erhalten: Ohne Konfiguration ist nur ein eindeutig aktives Profil mit dem exakten Anzeigenamen `Timo Frank` zulässig.

### Vorschau und Bestätigung

Die Vorschau mutiert keine Daten. Ihre Antwort lautet:

```json
{
  "schemaVersion": "hospitation-staging/v1",
  "snapshot": { "id": "...", "createdAt": "...", "source": "local-hospitation" },
  "owner": { "id": "production-profile-id", "displayName": "Timo Frank" },
  "manifestFingerprint": "sha256:...",
  "targetFingerprint": "sha256:...",
  "summary": {
    "organizations": { "total": 1, "create": 1, "update": 0, "unchanged": 0, "conflict": 0 },
    "contacts": { "total": 1, "create": 1, "update": 0, "unchanged": 0, "conflict": 0 },
    "hospitations": { "total": 1, "create": 1, "update": 0, "unchanged": 0, "conflict": 0 },
    "observations": { "total": 1, "create": 1, "update": 0, "unchanged": 0, "conflict": 0 },
    "total": { "total": 4, "create": 4, "update": 0, "unchanged": 0, "conflict": 0 }
  },
  "items": {
    "organizations": [{ "entityType": "organization", "sourceId": "...", "targetId": "...", "action": "create", "changedFields": ["name", "normalized_name"] }],
    "contacts": [], "hospitations": [], "observations": []
  },
  "conflicts": [{ "entityType": "observation", "sourceId": "...", "code": "...", "message": "..." }],
  "canApply": true
}
```

`action` ist `create`, `update`, `unchanged` oder `conflict`. Die Zuordnungsobjekte enthalten bewusst weder Anzeigenamen noch Referenztexte oder Beobachtungstitel. `canApply` ist nur wahr, wenn keine Konflikte und mindestens eine Änderung vorliegen.

Preview und Apply akzeptieren jeweils ein Manifest mit höchstens 1 MB; größere Manifeste werden mit HTTP `413` abgewiesen. Der umgebende JSON-Request bleibt zusätzlich durch das allgemeine Request-Body-Limit begrenzt.

Apply erwartet erneut das vollständige Manifest und beide unveränderten Fingerprints:

```json
{
  "manifest": {},
  "manifestFingerprint": "sha256:...",
  "targetFingerprint": "sha256:...",
  "confirmation": "HOSPITATIONEN IMPORTIEREN",
  "backupConfirmed": true
}
```

`backupConfirmed: true` bestätigt ausdrücklich, dass unmittelbar vor dem Apply ein wiederherstellbarer Backup- beziehungsweise PITR-Punkt geprüft wurde. Fehlt diese Bestätigung, antwortet die API mit HTTP `400` und schreibt nichts. Die API normalisiert das Manifest erneut, startet eine Fachtransaktion, bezieht einen transaktionalen Advisory Lock und sperrt die betroffenen Tabellen gegen konkurrierende Schreibvorgänge. Danach liest und fingerprintet sie den Zielbestand erneut. Abweichende Manifest- oder Ziel-Fingerprints, neue Konflikte und nicht eindeutige Owner-Zuordnungen enden mit HTTP `409`; es erfolgt kein Teilimport.

Der Writer arbeitet ergänzend und source-sparse: Bei bestehenden Organisationen, Kontakten und Hospitationen werden nur im Manifest inhaltlich gesetzte und tatsächlich geänderte Felder geschrieben. Fehlende, leere oder als leere Liste gelieferte optionale Felder löschen keine Produktionsinhalte. Feldlöschungen sind über diesen Import bewusst nicht möglich. Bestehende Organisations- und Kontaktstatus werden nicht verändert. Bei Hospitationen bleiben Archivierung, Wiederherstellung, Rückstufungen und das Überschreiben terminaler Zustände einem separaten Vorgang vorbehalten; ausschließlich normale Vorwärtsbewegungen `Entwurf` → `Angefragt` → `Angeboten` → `Gebucht` → `Durchgeführt` → `Dokumentiert` werden übernommen. Kontakte erhalten das serverseitig gemappte Timo-Profil zusätzlich in `contact_owners`, vorhandene Primär- und weitere Owner bleiben erhalten. Beobachtungen im Manifest werden einzeln per stabiler ID angelegt oder aktualisiert; zusätzliche vorhandene `payload`-Felder werden beim Merge bewahrt. Der Exportstatus `active` reaktiviert keine in Produktion archivierte Beobachtung; eine Wiederherstellung benötigt einen separaten, ausdrücklich freigegebenen Vorgang. Nicht im Manifest enthaltene Produktionsbeobachtungen bleiben unverändert; insbesondere wird der archivierende Formular-Sync nicht verwendet.

Ein erfolgreicher Lauf schreibt eine deterministische Zeile in `import_runs`, ein zentrales Aktivitätsereignis mit Ursprung `data_import` und über den Datenbank-Trigger die jeweiligen Beobachtungsänderungen. Der Bericht enthält nur Snapshot-ID, Fingerprints, Owner-ID und Summen, keine Beobachtungstexte. Nach erfolgreichem Apply liefert eine zweite Vorschau ausschließlich `unchanged` und `canApply: false`.

Dasselbe bereits protokollierte Manifest darf nach späteren Änderungen am Zielbestand nicht erneut mutierend angewendet werden. Ein solcher Versuch endet mit HTTP `409`, damit kein erfolgreicher Lauf ohne eigene Auditzeile bleibt. Für einen fachlich gewollten erneuten Abgleich ist ein neuer lokaler Snapshot mit neuer Snapshot-ID zu exportieren und vollständig vorzuschauen.

## Registrierungs-Intake

Die synthetische GitHub-Pages-Demo sendet keine Registrierungen und enthält weder Projekt-URL noch Backend-Key. Die separate #Mitmachen-Konzeptdemo bleibt auch im Target technisch inert: Sie ruft keine Intake-Route auf, speichert keine Eingaben und ist keine produktive Dateneingangsstrecke.

`POST /api/network-registrations` ist nur ein dokumentiertes Vorbereitungsgate für einen möglichen späteren geschützten Intake, kein freigegebener Backendvertrag. Die aktuelle Konzeptdemo baut diesen Request ausdrücklich nicht auf; automatisierte Tests sichern null Netzwerkaufrufe ab. Ein Handler darf erst zusammen mit einem realen, ausdrücklich freigegebenen Prozess implementiert und aktiviert werden. Es gibt weder einen Supabase-, LocalStorage- noch Demo-Daten-Fallback und auch keine lokale Warteschlange.

Vor einer Aktivierung müssen API-Handler und Route-Policy gemeinsam implementiert und abgenommen werden. Dazu gehören mindestens Feld- und Längen-Allowlisten, serverseitige Formular- und Einwilligungsversionen, Idempotenz über `submission_id`, Rate Limit und Missbrauchsschutz, Auditierung ohne Klartext-PII in Logs sowie eine festgelegte Betriebs- und Datenschutzverantwortung. Der Browser erhält keine Tabellen- oder Storage-Rechte. Die interne Admin-App darf Registrierungen ebenfalls nur über geschützte `/api/...`-Routen und mit der erforderlichen Rolle lesen oder bearbeiten.

## DTO-Richtung

### Sektorvertrag für Kontakte und Organisationen

`contact.category` und `organization.sector` verwenden den kanonischen Katalog aus `frontend/data/sector-registry.js`; die serverseitige Durchsetzung liegt in `api/care-sector-model.mjs`. Die vollständige Werteliste und Aliaszuordnung ist im [Datenmodell](./DATA_MODEL.md#fachmodell-versorgungssektoren) dokumentiert.

Bei schreibenden Kontakt- und Organisationsendpunkten werden bekannte Aliase kanonisiert. Ein leerer Wert wird als `null` gespeichert. Unbekannte Werte sowie `Digital Health` werden mit HTTP `400` abgelehnt; es gibt keinen impliziten Fallback auf `Praxis`. Beim Lesen wird ein bestehender Wert `Digital Health` nicht als Sektor an den Browser ausgeliefert. Die UI erzeugt Sektoroptionen aus dem Katalog und nicht aus den aktuell vorhandenen Datensätzen.

Die API gibt Frontend-DTOs zurück, keine Supabase-Rohzeilen. Beispiele:

- Kontaktfelder wie `organizationId`, `postalCode`, `themes`, `owner`, `ownerId`, `mitmachenConsentStatus`, `mitmachenConsentEffectiveAt`, `mitmachenConsentSource`, `mitmachenConsentTextVersion`, `mitmachenConsentRecordedBy`, `mitmachenConsentNote`
- Organisationsfelder wie `organizationType`, `postalCode`, `contactCount`
- Expertenkreis-Felder wie `groupId`, `group`, `category`, `organizationId`, `themes`, `sourceUrl`, `ownerId`, `ownerIds`
- Profilfelder bleiben kompatibel zur bestehenden Profilseite, z.B. `display_name`, `avatar_url`, `team`, `bio`, `role`
- Formatfelder wie `formatType`, `startsAt`, `owner`, `participants`
- Teilnehmerfelder wie `contactId`, `invitationStatus`, `participantRole`
- Hospitationsfelder wie `slotId`, `contactId`, `organizationId`, `startsAt`, `status`, `goal`, `topics`, `documentationSummary`, `followUpDueAt`
- Beobachtungsfelder wie `hospitationId`, `situation`, `description`, `processPhase`, `problemType`, `evidenceType`, `involvedRoles`, `affectedProducts`, `status` und `updatedAt`
- Hospitationstermin-Felder wie `contactId`, `organizationId`, `startsAt`, `capacity`, `ownerId`, `status`
- Aktivitätsfelder wie `eventKey`, `categoryKey`, `actionKey`, `objectType`, `objectId`, `contactId`, `actorId`, `occurredAt`, `origin`, `references`, `changes`, `metadata`, `details` und `title`

DB-Spalten wie `organization_id`, `postal_code`, `format_type`, `invitation_status` oder `follow_up_due_at` werden nur im API-Server gemappt.

Bei Einwilligungsupdates setzt die API `mitmachen_consent_recorded_by` serverseitig auf das angemeldete Profil. `granted` erfordert Zeitpunkt, Quelle und erfassende Person; `declined` und `withdrawn` erfordern einen Zeitpunkt. `verbal_confirmed` ist nur mit Status `granted` und Nachweisvermerk zulässig.

### Aktivitätsereignisse

Für Aktivitätsereignisse gibt es bewusst keinen generischen schreibenden Browser- oder HTTP-Endpunkt. `POST`, `PUT`, `PATCH` und `DELETE` auf `/api/activities` sind nicht Teil des Vertrags. Fachliche Servermutationen können künftig den privaten internen Writer aufrufen; Ereignisschlüssel, Objektbezug und Änderungsdetails werden dabei aus dem bereits validierten Domainvorgang erzeugt. Der Akteur stammt ausschließlich aus der serverseitig authentifizierten Session. Browserdaten werden nicht als frei formulierbare Audit-Ereignisse übernommen.

Die Supabase-Policies für `activity_events` bleiben als Defense-in-Depth und Migrationsnachweis erhalten, bilden aber keinen Browser-Laufzeitmodus. `authenticated` besitzt dort nur `SELECT`, keine Sequenzrechte und keine Insert-Policy. Nur der privilegierte Serverdienst darf neue Zeilen und die Identity-Sequenz verwenden. Update und Delete bleiben auch für diesen Writer gesperrt, damit das Ledger append-only ist.

`GET /api/activities` führt serverseitig neue Zeilen aus `activity_events` und bestehende Zeilen aus `changes` chronologisch zusammen. Historische Änderungen werden konservativ fachlich dekoriert; nicht eindeutig ableitbare Einträge bleiben als klar gekennzeichnete Legacy-Datensätze lesbar. Solange die Migration für `activity_events` in einer Umgebung noch fehlt, kann die API den bisherigen `changes`-Verlauf bereitstellen. Das ist eine serverseitige Datenkompatibilität und kein Browser-Fallback.

Wenn ein Fachvorgang sowohl Audit-Zeilen als auch ein kanonisches Ereignis erzeugt, müssen Ereignis, `changes` und deren Verknüpfung in derselben Datenbanktransaktion geschrieben werden. `changes.activity_event_id` darf nur auf ein Ereignis desselben Kontakts zeigen; `canonicalized_at` wird gemeinsam mit der Referenz gesetzt. Kontaktbezogene Ereignisse müssen ihren Kontakt in `contact_id` tragen; jede zusätzliche Kontakt-ID in `references` muss exakt damit übereinstimmen. So können Rollen- und Archivregeln an einer eindeutigen Spalte durchgesetzt werden.

Die Listenantwort lautet `{ "items": [...], "nextOffset": 30, "hasMore": true, "nextCursor": "..." }`. `offset` und `nextOffset` bleiben für bestehende Clients kompatibel. Für Folgeseiten soll bevorzugt der opake Cursor der Version 3 zusammen mit dem unveränderten Filtersatz verwendet werden. Er enthält getrennte Lesepositionen und monotone Max-ID-High-Water-Marks für `changes` und `activity_events`, den globalen Folge-Offset, einen Ausstellungszeitpunkt und eine Filtersignatur. Die Event-Watermark entscheidet zugleich, ob eine verknüpfte Legacy-Zeile oder bereits ihr kanonisches Ereignis zum Snapshot gehört. Dadurch beginnen Folgeseiten nicht erneut bei Zeile 0; auch nachträglich eingefügte, rückdatierte oder während einer Seitensequenz kanonisierte Ereignisse erzeugen weder Lücken noch Duplikate. Die Entscheidung ist unabhängig von Client- und Datenbankuhr. Ein Cursor mit abweichenden Filtern oder widersprüchlichem `offset` wird mit Status 400 abgelehnt. `nextCursor` ist `null`, sobald keine weitere Aktivität vorhanden ist.

Der globale Verlauf und der Kontaktverlauf liefern Aktivitäten archivierter Kontakte nur an Admins. Für Viewer und Editoren verhält sich der direkte Aufruf einer archivierten Kontakthistorie wie ein nicht vorhandener Kontakt (404); im globalen Verlauf werden entsprechende Zeilen herausgefiltert. Datenbank-RLS sichert diese API-Regel zusätzlich ab, ohne einen direkten Browserzugriff zu eröffnen.

## Produktivmodus

`frontend/data/runtime-config.js` konfiguriert ausschließlich das Target-Artefakt der Realanwendung:

- `dataMode: "api"` und `authMode: "oidc"` oder `"iap"`: fachliche Datenpfade laufen über die Ziel-API; die API verifiziert das signierte Gateway-Token.
- `apiBaseUrl: "https://..."`: Basis-Origin der geschützten API; fachliche Routen liegen unter `/api/...`.
- `requireApiGateway: true`: jeder fachliche Browserpfad muss die Gatewaygrenze verwenden.

`demo` ist ein separates Buildprofil für das Pages-Artefakt, kein zur Laufzeit wählbarer Fallback der Realanwendung. `local`, `gcp` und `supabase` sind keine zulässigen Target-Datenmodi. Fehler bei Session, Gateway oder API dürfen daher weder gebündelte Demo-Daten aktivieren noch Fachdaten in LocalStorage schreiben oder einen direkten Supabase-Client starten.

Für internes gematik-Hosting müssen `dataMode: "api"`, `authMode: "oidc"`, eine freigegebene HTTPS-`apiBaseUrl` und `requireApiGateway: true` gesetzt sein. Frontend und API müssen denselben Origin verwenden; dies entspricht der produktiven CSP (`connect-src 'self'`) und verhindert eine unbeabsichtigte Ausweitung der Browser-Vertrauensgrenze. `iap` bleibt ausschließlich für den getrennten GKE-Pre-Integrationspfad verfügbar und ist kein Bestandteil der gematik-Identity-Abnahme. Jenkins prüft diese Trennung im Produktionsartefakt. Danach ist ein separater API-Modus-Test nötig: Kontakte, Organisationen, Profile, private Profilbilder, gespeicherte Ansichten, User Settings, Formate und Hospitationen müssen im Browser über `/api/...` laufen.

## Browser-Abgrenzung

Im Zielbild ist im Browser weder Supabase Auth noch ein Supabase-Datenclient aktiv. Nicht vorhanden sein dürfen direkte fachliche Aufrufe wie `from("contacts").select(...)`, `from("organizations")`, `from("saved_views")`, `from("formats")`, `from("hospitations")`, `from("hospitation_slots")` oder direkte Storage-Zugriffe für Profilbilder. LocalStorage darf weder Fachdaten noch eine Ersatzsitzung oder eine Offline-Warteschlange enthalten. Test-Harnesses mit synthetischen Daten sind keine auslieferbare Laufzeitfunktion.

## Jenkins-Absicherung

`npm run check` führt `scripts/audit_api_gateway.mjs` für die serverinterne Activity-Writer-Grenze aus. Mit `--production-config` prüft der Audit das auszuliefernde Target-Artefakt hart; diese Artefaktprüfung ist für eine Produktionsfreigabe maßgeblich.

Nach dem Erzeugen des Frontend-Artefakts setzt Jenkins `dataMode: "api"`, `authMode: "oidc"`, die produktive `apiBaseUrl` und `requireApiGateway: true`. Anschließend läuft:

```bash
npm run security:api-gateway -- --production-config dist/target/data/runtime-config.js
```

Damit prüft Jenkins zusätzlich, dass das auszuliefernde Artefakt eine HTTPS-API-URL nutzt, nicht auf localhost zeigt, `dataMode: "api"`, einen freigegebenen `authMode` und `requireApiGateway: true` setzt und kein Supabase-Browser-SDK ausliefert.

## Input-Validierung

Schreibende Endpunkte akzeptieren nur definierte JSON-Felder pro fachlichem DTO. Unbekannte Felder werden mit HTTP `400` abgewiesen, bevor die API Daten in Postgres schreibt. Dadurch können Clients keine freien DB-Spalten, Filter oder Query-Bestandteile in den Request schmuggeln.

`npm run check` startet zusätzlich `scripts/test_api_validation.mjs`. Dieser Negativtest prüft, dass ein unbekanntes JSON-Feld in einem API-Request abgewiesen wird.
