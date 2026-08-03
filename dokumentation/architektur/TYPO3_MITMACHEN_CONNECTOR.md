# TYPO3-#Mitmachen-Connector

Stand: 30.07.2026

Dieses Dokument ist der technische Vertrag zwischen dem Powermail-Formular UID
`41` und dem Versorgungs-Kompass. Die TYPO3-Extension liegt unter
`deploy/typo3/mitmachen_connector`, der Empfänger unter
`api/typo3-registration-connector.mjs`.

## Komponenten

| Komponente | Verantwortung |
| --- | --- |
| Powermail-Event-Listener | Nur Formular UID `41` erkennen, stabile UUID erzeugen und technische Metadaten in die Outbox schreiben |
| TYPO3-Outbox | Zustellstatus und Referenz auf den vorhandenen Powermail-Datensatz halten; keine zweite Kopie von E-Mail, Namen oder Nachricht |
| TYPO3-CLI-Worker | Fällige Einträge sperren, Powermail-Antworten laden, kanonisches JSON bilden, signieren und mit Backoff zustellen |
| Node-API | HMAC, Zeitfenster, Größe, Feld-Allowlist, Versionen und Idempotenz prüfen |
| Cloud SQL | Ungeprüften Intake von aktivem Kontakt- und Organisationsbestand trennen |

Die Extension zielt auf PHP `8.2+`, TYPO3 `13.4` und Powermail `13`. Sie
verwendet das PSR-14-Ereignis
`FormControllerCreateActionAfterMailDbSavedEvent` nach der
Powermail-Persistierung sowie TYPO3s `RequestFactory` für den ausgehenden
HTTP-Aufruf.

## Powermail-Mapping

| Powermail-Marker | JSON-Feld | Pflicht |
| --- | --- | --- |
| `ihree_mail_adresse_01` | `email` | ja |
| `anrede_01` | `salutation` | nein |
| `titel_01` | `title` | nein |
| `vorname_01` | `first_name` | nein |
| `nachname_01` | `last_name` | nein |
| `namedereinrichtungfuerdiesieeinehospitationanbietenmoechten_01` | `organization` | nein |
| `bittewaehlensiedensektorausderaufihreeinrichtungzutrifft_01` | `sector` | nein |
| `ihrenachricht_01` | `message` | nein |
| `mitmachen_email_einwilligung` | `email_permission_requested` | nein, standardmäßig aus |

`datenschutzhinweis` ist absichtlich nicht gemappt. Fehlt der neue optionale
Marker oder enthält er keinen eindeutigen Wahr-Wert, wird
`email_permission_requested` als `false` übertragen.

## Request-Vertrag

```http
POST /api/connectors/typo3/mitmachen-registrations
Content-Type: application/json
X-Mitmachen-Key-Id: mitmachen-2026-07
X-Mitmachen-Timestamp: 1785405570
X-Mitmachen-Signature: sha256=<64 hex characters>
X-Request-Id: <new UUIDv4 for this delivery attempt>
```

Der Body ist auf 24.000 Byte begrenzt und enthält exakt:

```json
{
  "schema_version": "mitmachen-typo3-registration-v1",
  "submission_id": "970aeb47-0f17-4c22-a0bd-177557bad900",
  "submitted_at": "2026-07-30T09:59:30Z",
  "source_form_uid": 41,
  "source_record_uid": 12345,
  "source_url": "https://www.gematik.de/mitmachen/versorgungs-netzwerk",
  "form_version": "powermail-41-2026-07-30",
  "privacy_notice_version": "mitmachen-dse-2026-07-30",
  "privacy_notice_presented_at": "2026-07-30T09:59:30Z",
  "consent_text_version": null,
  "email_permission_requested": false,
  "email": "person@example.invalid",
  "salutation": null,
  "title": null,
  "first_name": null,
  "last_name": null,
  "organization": null,
  "sector": null,
  "message": null,
  "language": "de"
}
```

Leere optionale Formularwerte werden als JSON `null` übertragen. Unbekannte
oder fehlende Felder werden abgewiesen. `source_form_uid`, `source_url`,
Formularversion, Datenschutzhinweis-Version und gegebenenfalls
Einwilligungstext-Version müssen der serverseitigen Allowlist exakt
entsprechen.

## Signatur

Beide Seiten dekodieren dasselbe kanonisch base64-kodierte Secret mit
mindestens 32 zufälligen Byte. Signiert werden die unveränderten UTF-8-
Body-Bytes:

```text
body_sha256 = lowercase_hex(SHA-256(raw_body))
signing_input = "v1\n" + key_id + "\n" + unix_seconds + "\n" + body_sha256
signature = lowercase_hex(HMAC-SHA-256(secret_bytes, signing_input))
```

Die API akzeptiert nur Zeitstempel innerhalb von ±300 Sekunden und vergleicht
die Signatur in konstanter Zeit. Für eine Rotation kann sie gleichzeitig eine
aktuelle und eine vorherige Key-ID akzeptieren. TYPO3 signiert immer mit genau
dem aktuell konfigurierten Schlüssel.

Sichere Rotation:

1. neues Secret und neue Key-ID erzeugen,
2. API mit neuem aktuellen und altem vorherigen Schlüssel ausrollen,
3. TYPO3 auf neue Key-ID und neues Secret umstellen,
4. erfolgreiche Zustellung beobachten,
5. vorherigen Schlüssel nach mehr als maximalem Retry- und Rollout-Fenster aus
   der API entfernen.

## Installation in TYPO3

Die Extension wird als lokales Composer-Paket in das TYPO3-Projekt eingebunden:

```bash
composer config repositories.mitmachen-connector path /pfad/zu/mitmachen_connector
composer require gematik/mitmachen-connector:@dev
vendor/bin/typo3 extension:setup
```

Danach in der TYPO3-Extension-Konfiguration setzen:

- `enabled = 0` während Installation und Preflight,
- `endpoint` als vollständige HTTPS-URL mit dem exakten Connector-Pfad,
- `keyId`,
- `secretEnvVar`, standardmäßig
  `MITMACHEN_TYPO3_CONNECTOR_SECRET`,
- `sourceUrl`,
- `formVersion`, `privacyNoticeVersion` und `consentTextVersion`,
- optional Batchgröße, Request-Timeout und Lock-Timeout.

Das base64-kodierte Secret wird ausschließlich als Prozess-Secret unter dem in
`secretEnvVar` benannten Umgebungsvariablennamen gesetzt. Es gehört weder in
Extension Configuration noch TypoScript, Site Configuration, Git oder Logs.

Der Worker wird mindestens minütlich durch Scheduler, CronJob oder
Process-Manager gestartet:

```bash
vendor/bin/typo3 mitmachen:deliver-registrations --limit=25
```

Mehrere parallele Läufe sind zulässig. Optimistische Claims und auslaufende
Locks verhindern eine doppelte Verarbeitung und machen Abstürze
wiederaufnehmbar.

## API-Konfiguration

Der API-Prozess benötigt bei Aktivierung:

```dotenv
TYPO3_CONNECTOR_ENABLED=1
TYPO3_CONNECTOR_KEY_ID=mitmachen-2026-07
TYPO3_CONNECTOR_HMAC_SECRET_BASE64=<secret>
TYPO3_CONNECTOR_PREVIOUS_KEY_ID=
TYPO3_CONNECTOR_PREVIOUS_HMAC_SECRET_BASE64=
TYPO3_CONNECTOR_FORM_UID=41
TYPO3_CONNECTOR_SOURCE_URL=https://www.gematik.de/mitmachen/versorgungs-netzwerk
TYPO3_CONNECTOR_FORM_VERSION=powermail-41-2026-07-30
TYPO3_CONNECTOR_PRIVACY_NOTICE_VERSION=mitmachen-dse-2026-07-30
TYPO3_CONNECTOR_CONSENT_TEXT_VERSION=mitmachen-email-2026-07-30
TYPO3_CONNECTOR_BODY_LIMIT_BYTES=24000
TYPO3_CONNECTOR_CLOCK_SKEW_SECONDS=300
```

Ist `TYPO3_CONNECTOR_ENABLED` nicht exakt `1`, antwortet der Endpoint mit HTTP
`404`, ohne den Request-Body zu verarbeiten. Bei Aktivierung sind alle
Pflichtwerte erforderlich; ungültige oder zu kurze Secrets verhindern den
API-Start.

Im Kubernetes-Deployment werden dieselben Werte über den Helm-Block
`typo3Connector` gesetzt. `currentKey.secretName` und `secretKey` verweisen auf
ein vor dem Rollout durch den freigegebenen Secret-Controller bereitgestelltes
Kubernetes Secret; der Secret-Wert steht nie in den Values:

```yaml
typo3Connector:
  enabled: true
  formVersion: powermail-41-2026-07-30
  privacyNoticeVersion: mitmachen-dse-2026-07-30
  consentTextVersion: mitmachen-email-2026-07-30
  currentKey:
    id: mitmachen-2026-07
    secretName: vk-typo3-connector-hmac
    secretKey: current-hmac-secret-base64
  previousKey:
    enabled: false
    id: ""
    secretName: ""
    secretKey: hmac-secret-base64
```

Bei `enabled: true` rendert das Chart den exakten Ingress-Pfad zu einem
separaten Service und einer eigenen GKE-BackendConfig mit deaktiviertem IAP.
Der bestehende `/api`-Prefix bleibt auf dem ursprünglichen Service und dessen
IAP-BackendConfig. Das Chart verweigert eine Aktivierung ohne Versionswerte,
aktuellen Key, Secret-Referenz, Ingress oder getrennte BackendConfig.

## Zustell- und Fehlervertrag

| Ergebnis | TYPO3-Outbox |
| --- | --- |
| HTTP `201` | erstmalig zugestellt |
| HTTP `200` | idempotente Wiederholung zugestellt |
| HTTP `429` | `Retry-After` beachten, sonst Backoff |
| HTTP `500` bis `599` oder Netzwerkfehler | Backoff und Wiederholung mit derselben `submission_id` |
| sonstige HTTP `400` bis `499` | permanent fehlerhaft; Konfiguration oder Quelldaten prüfen |

Der Backoff wächst exponentiell und bleibt begrenzt. Jede
Zustellung verwendet dieselbe `submission_id`, aber eine neue `x-request-id`
und einen neuen Signaturzeitstempel. Redirects sind deaktiviert.

Die API speichert `not_requested` oder `pending`, nie direkt `granted`.
`received_at` entsteht ausschließlich serverseitig. Ein identischer Replay
liefert die bestehende Intake-ID; ein Idempotenzkonflikt liefert HTTP `409`.

## Abnahme

Vor `enabled = 1`:

1. Powermail-Formularänderung und alle drei Versionsbezeichner fachlich sowie
   datenschutzrechtlich freigeben.
2. Cloud-SQL-Migration und Runtime-Grants anwenden.
3. API mit Connector-Service, exaktem Ingress-Pfad und Secrets ausrollen.
4. TYPO3-Extension installieren, konfigurieren und Secret bereitstellen.
5. Mit einer synthetischen `example.invalid`-Adresse absenden.
6. Outbox-Status, HTTP `201`, genau eine Intake-Zeile und Status
   `not_requested` prüfen.
7. Dieselbe Zustellung wiederholen und HTTP `200` ohne zweite Zeile prüfen.
8. Optionales Feld auswählen und verifizieren, dass nur `pending` entsteht.
9. Manipulierte Signatur, alten Zeitstempel und falsche Formularversion
   negativ testen.
10. Erst danach beide Aktivierungsschalter kontrolliert setzen und
    Fehlerbestände überwachen.
