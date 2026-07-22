# Versorgungs-Netzwerk – Konzeptdemo und möglicher späterer Intake

Stand: 20.07.2026

Die Repo-Seite `frontend/pages/mitmachen/versorgungs-netzwerk.html` ist ausschließlich eine technisch inerte Konzeptdemo. Sie zeigt ein mögliches zukünftiges Wunschszenario, bildet den realen Prozess auf der gematik-Website nicht ab und übermittelt oder speichert keine Formulardaten.

Der nachfolgende Vertrag dokumentiert nur eine mögliche spätere Kopplung der geschützten Realanwendung. Er ist weder ein freigegebener Live-Intake noch der aktuelle öffentliche Registrierungsweg der gematik. Aktuelle Beteiligungsmöglichkeiten liegen unter <https://www.gematik.de/mitmachen>.

## Zwei-App-Abgrenzung

- Die öffentliche GitHub-Pages-Anwendung ist eine dauerhaft bestehende Produktdemo. Sie verwendet ausschließlich synthetische, im Demo-Artefakt gebündelte Daten und sendet keine Registrierung.
- Die #Mitmachen- und Versorgungs-Netzwerk-Seiten im Repo sind davon getrennte Konzeptdemos. Auch im Target-Artefakt bleiben ihre Formulare inert, bis ein realer Prozess fachlich ersetzt und ausdrücklich freigegeben wurde.
- Die Realanwendung ist ein separates Target-Artefakt. Sie authentisiert im GKE-Vorbereitungspfad über IAP und im gematik-Zielbetrieb über OIDC. Jeder fachliche Browserzugriff läuft ausschließlich über `/api/...`.
- Pages und Realanwendung teilen weder Laufzeitkonfiguration noch Sitzung, Supabase-Client, Backend-Key oder persistente Browserdaten.

## Zielbild

Ein institutionell betriebenes Formular kann später über die geschützte API an einen freigegebenen Intake-Service gekoppelt werden. Das Formular schreibt nie direkt in den produktiven CRM-Bestand. Führende Eingangsschicht ist die Target-API; eine Anbindung an ein nachgelagertes gematik Backend erfolgt ausschließlich serverseitig.

Die Realanwendung zeigt neue Registrierungen nach Freigabe im Bereich `Importe` als Prüf-Inbox. Erst die Übernahme durch einen Admin legt einen aktiven Kontakt und optional eine Organisation an.

## Aktueller Route-Status: nicht an die Konzeptdemo gekoppelt

Die Konzeptdemo ruft `POST /api/network-registrations` nicht auf. Ein möglicher späterer Handler bleibt ein separates Freigabegate und darf erst nach Austausch der Demo durch einen fachlich, rechtlich, sicherheitsbezogen und betrieblich freigegebenen Prozess aktiviert werden.

Insbesondere unzulässig sind:

- direkter Browserzugriff auf Supabase, Tabellen, Storage oder einen externen Intake-Service,
- Speicherung der Eingabe in LocalStorage, IndexedDB oder einer Browser-Warteschlange,
- Umschalten auf synthetische Demo-Daten nach einem API- oder Authentisierungsfehler,
- eine Erfolgsmeldung, bevor das Backend die Registrierung bestätigt hat.

## Minimaler Server-zu-Server-Vertrag nach Freigabe

Die folgenden `/versorgungs-netzwerk/...`-Pfade beschreiben eine mögliche nachgelagerte Backendkopplung. Sie sind kein Browservertrag. Die Target-API kapselt sie hinter `/api/...`, setzt Authentisierung und Rollen durch und gibt nur validierte DTOs zurück.

### Öffentlicher Eingang

`POST /versorgungs-netzwerk/registrierungen`

Pflichtlogik im Backend:

- Pflichtfelder, E-Mail-Format und Datenschutzeinwilligung validieren.
- Honeypot/Captcha, Rate-Limit und erlaubte Herkunft prüfen.
- Rohmeldung, Formularversion, Quelle und Consent-Zeitpunkt speichern.
- Dublettenhinweise berechnen, aber noch keinen CRM-Kontakt erzeugen.
- `submission_id` idempotent verarbeiten und Nachweiszeitpunkte serverseitig setzen.
- Keine Klartext-PII, Tokens oder Request-Bodies in Sicherheits- und Zugriffslogs schreiben.

### Interner Abruf für den Versorgungs-Kompass

`GET /versorgungs-netzwerk/registrierungen?status=neu`

Antwortform:

```json
{
  "items": [
    {
      "id": "reg_123",
      "submitted_at": "2026-05-20T10:15:00Z",
      "status": "neu",
      "email": "kontakt@example.org",
      "salutation": "Frau",
      "title": "Dr. med.",
      "first_name": "Lea",
      "last_name": "Muster",
      "organization": "Hausarztpraxis Musterstadt",
      "sector": "Praxis",
      "city": "Musterstadt",
      "federal_state": "Nordrhein-Westfalen",
      "role": "Praxisinhaberin",
      "message": "Wir möchten Einblicke geben.",
      "consent_text_version": "mitmachen-versorgungs-netzwerk-v1",
      "consent_accepted_at": "2026-05-20T10:15:00Z",
      "source_url": "https://www.gematik.de/mitmachen/versorgungs-netzwerk",
      "duplicate_hint": ""
    }
  ]
}
```

### Statusänderung

`PATCH /versorgungs-netzwerk/registrierungen/{id}`

Der Versorgungs-Kompass sendet mindestens:

```json
{
  "status": "uebernommen",
  "processed_at": "2026-05-20T10:30:00Z",
  "processed_by": "admin@example.invalid",
  "contact_id": "contact-local-example"
}
```

Unterstützte Statuswerte für V1:

- `neu`
- `uebernommen`
- `verknuepft`
- `zurueckgestellt`
- `abgelehnt`

## Frontend-Konfiguration

Nur das geschützte Target-Artefakt erhält eine Runtime-Konfiguration für die Realanwendung:

```js
window.VERSORGUNGS_COMPASS_CONFIG = {
  dataMode: "api",
  authMode: "oidc", // "iap" nur für die getrennte GKE-Pre-Integration
  apiBaseUrl: "https://target.example.invalid",
  apiCredentials: "include",
  requireApiGateway: true
};
```

Die Pages-Demo erhält diese Konfiguration nicht. Auch die im Target enthaltene Konzeptseite bleibt technisch inert und nutzt die Runtime-Konfiguration nicht für eine Registrierung. Die Konfiguration gilt ausschließlich für die geschützte interne Anwendung und einen später separat freigegebenen Intake-Vertrag; Registrierungen und Statusänderungen werden weder synthetisch ersetzt noch lokal im Browser gespeichert.

## Freigabegate

Vor Aktivierung von `POST /api/network-registrations` sind mindestens nachzuweisen:

- Route-Policy, OIDC-/IAP-Authentisierung und erforderliche Fachrolle,
- Request-Allowlist, Längen- und Mengenlimits sowie ein generisches Fehlerschema,
- Idempotenz, Rate Limit, Missbrauchsschutz und sichere Wiederholbarkeit,
- versionierter Datenschutztext, Einwilligungsnachweis und festgelegte Aufbewahrung,
- serverseitige Auditierung, Betriebsmonitoring und Alarmierung ohne PII-Leakage,
- Negativtests für fehlende Route, fehlende Session, falsche Rolle, unbekannte Felder, Wiederholung und Backendausfall.
