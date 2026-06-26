# Versorgungs-Netzwerk Registrierung

Dieses Dokument beschreibt die einfache V1-Kopplung zwischen dem oeffentlichen
TYPO3-Formular, einem gematik Backend und dem Versorgungs-Kompass.

## Zielbild

TYPO3 bleibt Ausspielung und Formularoberflaeche. Das Formular schreibt nicht
direkt in den produktiven CRM-Bestand und versendet E-Mails hoechstens als
Benachrichtigung. Fuehrende Eingangsschicht ist ein gematik Backend.

Der Versorgungs-Kompass liest neue Registrierungen aus diesem Backend und zeigt
sie im Bereich `Importe` als Pruef-Inbox. Erst die Uebernahme durch einen Admin
legt einen aktiven Kontakt und optional eine Organisation an.

## Minimaler Backend-Vertrag

### Oeffentlicher Eingang

`POST /versorgungs-netzwerk/registrierungen`

Pflichtlogik im Backend:

- Pflichtfelder, E-Mail-Format und Datenschutzeinwilligung validieren.
- Honeypot/Captcha, Rate-Limit und erlaubte Herkunft pruefen.
- Rohmeldung, Formularversion, Quelle und Consent-Zeitpunkt speichern.
- Dublettenhinweise berechnen, aber noch keinen CRM-Kontakt erzeugen.

### Interner Abruf fuer den Versorgungs-Kompass

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
      "message": "Wir moechten Einblicke geben.",
      "consent_text_version": "mitmachen-versorgungs-netzwerk-v1",
      "consent_accepted_at": "2026-05-20T10:15:00Z",
      "source_url": "https://www.gematik.de/mitmachen/versorgungs-netzwerk",
      "duplicate_hint": ""
    }
  ]
}
```

### Statusaenderung

`PATCH /versorgungs-netzwerk/registrierungen/{id}`

Der Versorgungs-Kompass sendet mindestens:

```json
{
  "status": "uebernommen",
  "processed_at": "2026-05-20T10:30:00Z",
  "processed_by": "admin@gematik.de",
  "contact_id": "contact-local-example"
}
```

Unterstuetzte Statuswerte fuer V1:

- `neu`
- `uebernommen`
- `verknuepft`
- `zurueckgestellt`
- `abgelehnt`

## Frontend-Konfiguration

Der Versorgungs-Kompass nutzt die bestehende `frontend/data/supabase-config.js` als
allgemeine Runtime-Konfiguration. Fuer ein echtes gematik Backend koennen
folgende Werte ergaenzt werden:

```js
window.VERSORGUNGS_COMPASS_CONFIG = {
  dataMode: "supabase",
  supabaseUrl: "...",
  supabaseAnonKey: "...",
  gematikBackendUrl: "https://backend.example.gematik.de",
  gematikBackendCredentials: "include"
};
```

Wenn keine Backend-URL konfiguriert ist oder die App im Demo-Modus laeuft,
zeigt die Inbox Demo-Registrierungen und speichert Statusaenderungen lokal im
Browser. So bleibt die UI testbar, ohne ein oeffentliches CRM-Schreibrecht zu
simulieren.
