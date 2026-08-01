# TYPO3 #Mitmachen Connector

Installierbare TYPO3-v13-Extension für das serverseitige Powermail-Formular
„Versorgungs-Netzwerk“ (Formular-UID `41`). Nach erfolgreicher
Powermail-Persistenz wird ausschließlich eine Referenz auf die Powermail-Mail in
eine lokale Outbox geschrieben. Ein CLI-Command lädt die Originalantworten erst
zum Zustellzeitpunkt, baut den fest definierten JSON-Vertrag und sendet ihn
HMAC-signiert an den Versorgungskompass.

Die Extension verändert weder das Formular noch TYPO3-Frontend-Markup. Sie
enthält keine Browser- oder JavaScript-Kopplung.

## Sicherheitszustand nach der Installation

Die Extension ist standardmäßig mit `enabled = 0` **inert**:

- der Powermail-Listener kehrt vor dem Lesen weiterer Konfiguration zurück;
- es werden keine Outbox-Einträge angelegt;
- der CLI-Command claimt keine Einträge und führt keinen Netzwerkzugriff aus;
- der CLI-Command gibt lediglich `{"status":"disabled","claimed":0}` aus.

Erst aktivieren, nachdem Zielsystem, Versionswerte und Secret vollständig
bereitstehen. Es gibt keinen automatischen Backfill für Formulareingänge aus
der Zeit, in der die Extension deaktiviert war.

## Voraussetzungen

- PHP `^8.2`
- TYPO3 Core `^13.4`
- TYPO3 Extbase `^13.4`
- Powermail `^13.0`
- aktivierte Powermail-Datenbankpersistenz für Formular UID `41`
- HTTPS-Zielroute
  `/api/connectors/typo3/mitmachen-registrations`
- optional `typo3/cms-scheduler ^13.4` für die zeitgesteuerte Ausführung

## Installation

Die Extension kann als lokales Composer-Paket eingebunden werden. Beispiel für
ein TYPO3-Projekt, in dem dieses Repository unter `integrations/` verfügbar ist:

```json
{
  "repositories": [
    {
      "type": "path",
      "url": "integrations/typo3/mitmachen_connector",
      "options": {
        "symlink": true
      }
    }
  ]
}
```

Danach:

```bash
composer require gematik/mitmachen-connector:@dev
vendor/bin/typo3 extension:setup
vendor/bin/typo3 cache:flush
```

Alternativ kann der Ordner als Composer-Paket in das TYPO3-Deployment
übernommen werden. Nach jeder Installation oder Schemaänderung muss der
TYPO3-Datenbankschema-Abgleich ausgeführt werden. Die neue Tabelle heißt
`tx_mitmachenconnector_outbox`.

## Aktivierungsreihenfolge

1. Extension installieren und `enabled = 0` unverändert lassen.
2. Datenbankschema aktualisieren.
3. Formular UID `41` wie unten beschrieben korrigieren und die Marker prüfen.
4. In der ExtensionConfiguration alle Quell-, Versions- und
   Transportparameter setzen.
5. Das base64-kodierte Secret ausschließlich als Umgebungsvariable in den
   PHP-/CLI-Containern bereitstellen.
6. Im Zielsystem denselben Schlüssel unter der konfigurierten Key-ID
   freischalten.
7. Sicherstellen, dass Web-PHP und CLI/Scheduler dieselbe
   ExtensionConfiguration sehen.
8. Erst dann `enabled = 1` setzen, TYPO3-Caches leeren und langlebige
   PHP-/Scheduler-Prozesse neu starten.
9. Einen kontrollierten Testeintrag absenden und anschließend den CLI-Command
   ausführen.

Eine unvollständige Konfiguration nach der Aktivierung ist absichtlich ein
Fehler. Insbesondere werden keine erfundenen Versionswerte und kein
Konfigurations-Secret als Fallback verwendet.

## Erforderliche Änderung an Powermail-Formular UID 41

Diese Extension führt die Änderung nicht selbst aus. Die Redaktion muss sie im
TYPO3-Backend vornehmen:

1. E-Mail bleibt Pflichtfeld.
2. Anrede, Titel, Vorname, Nachname, Einrichtung, Sektor und Nachricht bleiben
   optional.
3. Das bisherige Pflicht-Checkboxfeld mit Marker `datenschutzhinweis`
   vollständig als Einwilligungsfeld entfernen.
4. Die notwendige Datenschutzinformation als reinen Hinweis ohne Checkbox
   anzeigen.
5. Eine neue, standardmäßig nicht ausgewählte und nicht verpflichtende
   Checkbox mit Marker `mitmachen_email_einwilligung` anlegen.
6. Das Formular muss ohne Auswahl dieser Checkbox erfolgreich absendbar sein.
7. In Powermail muss die Datenbankpersistenz aktiv sein; ohne persistierte
   Powermail-Mail gibt es bewusst keinen Connector-Eintrag.

Das produktive Marker-Mapping ist fest im Connector verankert:

| Powermail-Marker | JSON-Feld |
|---|---|
| `ihree_mail_adresse_01` | `email` |
| `anrede_01` | `salutation` |
| `titel_01` | `title` |
| `vorname_01` | `first_name` |
| `nachname_01` | `last_name` |
| `namedereinrichtungfuerdiesieeinehospitationanbietenmoechten_01` | `organization` |
| `bittewaehlensiedensektorausderaufihreeinrichtungzutrifft_01` | `sector` |
| `ihrenachricht_01` | `message` |
| `mitmachen_email_einwilligung` | `email_permission_requested` |

`datenschutzhinweis` wird unabhängig von seinem historischen Wert immer
ignoriert. Ausschließlich eine Auswahl von
`mitmachen_email_einwilligung` erzeugt
`email_permission_requested = true` und friert die konfigurierte
`consentTextVersion` ein. Dies bedeutet im Zielsystem zunächst „pending“; es ist
keine bestätigte Einwilligung. Double-Opt-in und dessen Bestätigung liegen im
Zielsystem.

## ExtensionConfiguration

| Schlüssel | Bedeutung |
|---|---|
| `enabled` | Explizite Aktivierung; Standard `0` |
| `endpoint` | Vollständige HTTPS-URL mit exakt der Route `/api/connectors/typo3/mitmachen-registrations`; keine Credentials, Query oder Fragment |
| `keyId` | Öffentliche ID des aktiven HMAC-Schlüssels, maximal 64 Zeichen |
| `secretEnvVar` | Name der Umgebungsvariable, niemals das Secret selbst |
| `sourceUrl` | Öffentliche HTTPS-URL des Formulars |
| `formVersion` | Version der veröffentlichten Formfassung |
| `privacyNoticeVersion` | Version der beim Absenden sichtbaren Datenschutzinformation |
| `consentTextVersion` | Version des Textes der neuen optionalen Checkbox |
| `batchSize` | Maximal 1–100 Einträge pro Lauf; Standard `25` |
| `requestTimeoutSeconds` | HTTP-Timeout 1–30 Sekunden; Standard `10` |
| `lockTimeoutSeconds` | Wiederaufnahme abgestürzter Worker nach 60–3600 Sekunden; Standard `900` |

`formVersion`, `privacyNoticeVersion` und – nur bei ausgewählter optionaler
Checkbox – `consentTextVersion` werden beim Enqueue in der Outbox eingefroren.
Copy-Änderungen müssen deshalb vor ihrer Veröffentlichung eine neue Version in
der ExtensionConfiguration erhalten.

Beispielwerte:

```text
formVersion = mitmachen-versorgungsnetzwerk-2026-07-30
privacyNoticeVersion = versorgungsnetzwerk-datenschutz-2026-07-30
consentTextVersion = mitmachen-email-einwilligung-2026-07-30
keyId = typo3-prod-2026-07
secretEnvVar = MITMACHEN_TYPO3_CONNECTOR_SECRET
```

## Secret

Das Secret wird ausschließlich aus der konfigurierten Umgebungsvariable
gelesen. Der Wert muss striktes Base64 von mindestens 32 zufälligen Bytes sein:

```bash
openssl rand -base64 32
```

Beispiel für die Laufzeitumgebung:

```text
MITMACHEN_TYPO3_CONNECTOR_SECRET=<base64-wert-aus-secret-store>
```

Den Wert nicht in `ext_conf_template.txt`, TYPO3-Systemkonfiguration,
Deployment-Values im Git-Repository, Logs oder Command-Ausgaben schreiben.
Web-PHP und CLI/Scheduler benötigen dieselbe Variable.

## CLI und Scheduler

Manueller Lauf:

```bash
vendor/bin/typo3 mitmachen:deliver-registrations
vendor/bin/typo3 mitmachen:deliver-registrations --limit=10
```

Die Ausgabe enthält ausschließlich Zähler, keine Formulardaten:

```json
{"status":"ok","claimed":3,"delivered":2,"retried":1,"failed":0}
```

Empfohlen ist ein Lauf pro Minute. Je nach TYPO3-Installation kann der Command
über die Scheduler-Aufgabe „Execute console commands“ gewählt oder per Cron
ausgeführt werden:

```cron
* * * * * cd /var/www/typo3 && vendor/bin/typo3 mitmachen:deliver-registrations
```

Parallele Läufe sind durch konditionale Outbox-Claims geschützt. Ein Eintrag
wird nur vom Besitzer seines zufälligen Lock-Tokens abgeschlossen. Verwaiste
`processing`-Locks werden nach `lockTimeoutSeconds` erneut fällig.

## JSON-Vertrag

Pro Outbox-Eintrag wird genau ein flaches JSON-Objekt gesendet:

```json
{
  "schema_version": "mitmachen-typo3-registration-v1",
  "submission_id": "80c8b525-7a88-4b52-87b0-a67f522bb38d",
  "submitted_at": "2026-07-30T16:00:00Z",
  "source_form_uid": 41,
  "source_record_uid": 9876,
  "source_url": "https://www.gematik.de/mitmachen/versorgungs-netzwerk",
  "form_version": "mitmachen-versorgungsnetzwerk-2026-07-30",
  "privacy_notice_version": "versorgungsnetzwerk-datenschutz-2026-07-30",
  "privacy_notice_presented_at": "2026-07-30T16:00:00Z",
  "consent_text_version": null,
  "email_permission_requested": false,
  "email": "person@example.org",
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

`submission_id` ist UUIDv4 und bleibt über alle Wiederholungen stabil.
`submitted_at` und `privacy_notice_presented_at` sind identische kanonische
UTC-Werte. Leere optionale Strings werden als JSON `null` übertragen.

## HMAC-Vertrag

Für den unveränderten UTF-8-Request-Body wird zunächst der hexadezimale
SHA-256-Hash gebildet. Der zu signierende String lautet bytegenau:

```text
v1\n<key-id>\n<unix-seconds>\n<sha256(raw-body)>
```

Danach wird HMAC-SHA256 mit dem dekodierten Secret berechnet. Jeder
Zustellversuch erhält einen neuen Timestamp und eine neue UUIDv4 als
Request-ID:

```text
x-mitmachen-key-id: <key-id>
x-mitmachen-timestamp: <unix-seconds>
x-mitmachen-signature: sha256=<hex-hmac>
x-request-id: <uuid-v4-pro-zustellversuch>
content-type: application/json
```

Der Connector verwendet TYPO3 `RequestFactory`, folgt keinen Redirects und
überlässt die TLS-Zertifikatsprüfung den sicheren Standardwerten des TYPO3-HTTP-
Clients.

## Outbox, Datenschutz und Zustellergebnis

Die Outbox dupliziert keine Payload und keine personenbezogenen Formularfelder.
Sie enthält nur:

- stabile Submission-ID und Powermail-Mail-UID;
- Formular-UID, Absendezeit und öffentliche Quell-URL;
- eingefrorene Form-/Datenschutz-/gegebenenfalls Consent-Version;
- technischen Status, Versuchs-/Lock-Zähler, HTTP-Status und kontrollierten
  Fehlercode.

Die Original-Powermail-Mail und ihre Antworten müssen deshalb mindestens bis
zum Zustand `delivered` oder einer fachlich geprüften permanenten Behandlung
erhalten bleiben. Wird sie vorher gelöscht, endet der Outbox-Eintrag kontrolliert
mit `source_record_unavailable`. Response-Bodies werden weder ausgewertet noch
gespeichert; Logs und CLI-Ausgaben enthalten keine Payload.

Ergebnisbehandlung:

| Ergebnis | Outbox-Verhalten |
|---|---|
| HTTP `2xx` | `delivered` |
| HTTP `400`–`499`, außer `429` | permanent `failed` |
| HTTP `429` | Retry; `Retry-After` wird berücksichtigt |
| HTTP `500`–`599` | Retry |
| Netzwerk-/Timeoutfehler | Retry |
| Redirects und sonstige Statuscodes | permanent `failed` |

Retries verwenden exponentielles Backoff ab 60 Sekunden, gedeckelt auf sechs
Stunden. Ein valides `Retry-After` kann bis zu 24 Stunden berücksichtigt
werden. Es werden keine Response-Texte in der Outbox gespeichert.

Ein datensparsamer Monitoring-Check ist beispielsweise:

```sql
SELECT status, COUNT(*) AS entries, MAX(attempt_count) AS max_attempts
FROM tx_mitmachenconnector_outbox
GROUP BY status;
```

Permanente Fehler sollten anhand von `last_http_status` und
`last_error_code` betrieblich geprüft werden. Ein automatisches Requeue
permanenter `4xx` ist absichtlich nicht enthalten.

## Secret-Rotation

1. Im Zielsystem einen zweiten Schlüssel mit neuer Key-ID zusätzlich
   freischalten; den alten noch akzeptieren.
2. Neues Secret im Secret-Store bereitstellen und unter einem neuen
   Umgebungsvariablennamen oder als neue Version der bestehenden Variable in
   Web-PHP und CLI/Scheduler ausrollen.
3. `keyId` und gegebenenfalls `secretEnvVar` gemeinsam umstellen.
4. Langlebige PHP-/Scheduler-Prozesse neu starten.
5. Einen Zustelllauf beobachten. Neue Versuche werden mit der neuen Key-ID
   signiert; stabile `submission_id`-Werte sichern die Idempotenz.
6. Den alten Schlüssel erst entfernen, wenn keine Instanz mehr mit der alten
   Konfiguration laufen kann und das vereinbarte Überlappungsfenster abgelaufen
   ist.

Die Outbox enthält kein Secret und muss bei einer Rotation nicht umgeschrieben
werden.

## Tests und Release-Gate

Vom Repository-Root wird derselbe fail-closed Gate wie in der
Target-Readiness-CI ausgeführt:

```bash
npm run test:typo3-php
```

Der Gate benötigt einen erreichbaren Docker-Daemon und überspringt die Prüfung
bei fehlendem Docker absichtlich nicht. Aus digest-gepinnten offiziellen
Composer- und PHP-Basis-Images wird die in `Dockerfile.test` definierte
PHP-8.2.29-Umgebung gebaut. In einem frischen Arbeitsverzeichnis folgen
nacheinander:

1. `composer validate --strict` gegen den eingecheckten `composer.lock`;
2. ein ausschließlich aus dem Lock ausgeführtes `composer install`;
3. `composer check-platform-reqs` einschließlich Powermail-`ext-gd` und
   TYPO3-`ext-intl`;
4. `composer audit --locked` gegen bekannte Sicherheitsmeldungen; verwaiste
   transitive Pakete werden berichtet, Sicherheitsmeldungen brechen ab;
5. PHP-Lint aller Extension- und Testdateien;
6. die vollständige PHPUnit-Suite.

Abhängigkeitsänderungen erfordern eine bewusste Aktualisierung des Lockfiles mit
derselben Toolchain. Ein fehlender, veralteter oder auf PHP 8.2 nicht
installierbarer Lock bricht Root-Gate und CI ab.

Die Unit-Tests decken insbesondere ab:

- das exakte Live-Marker-Mapping und den flachen JSON-Vertrag;
- die strikte Nichtbeachtung von `datenschutzhinweis`;
- die ausschließliche Consent-Wirkung von
  `mitmachen_email_einwilligung`;
- JSON-`null` für optionale Namen und weitere Leerwerte;
- den bytegenauen HMAC-SHA256-Testvektor;
- Backoff, `Retry-After` und HTTP-Klassifikation;
- den expliziten, fail-closed Aktivierungszustand;
- Listener-Enqueue und eingefrorene Consent-Metadaten;
- reale Outbox-Claims, Lock-Ownership, Idempotenz und Statusübergänge auf dem
  TYPO3-QueryBuilder;
- Powermail-Hydrierung einschließlich lokalisierter Marker;
- signierte Zustellung, permanente Quellfehler und `429`-Retry.
