# Versorgungs-Kompass

Das gematik-Hospitationsnetzwerk

Privates Arbeits-Repository fuer den `Versorgungs-Kompass`, den Karten-Modus und die zugehoerige Datenbasis des `gematik-Hospitationsnetzwerks`.

Der aktive Projektstand ist der statische `Versorgungs-Kompass` auf HTML-/JS-Basis mit Supabase als Backend.

## Einstieg

Fuer den aktuellen nutzbaren Stand sind diese Dateien relevant:

- `login/login.html`: vorgeschaltete Login-Seite
- `login/auth-config.js`, `login/auth-guard.js`, `login/auth-login.js`: Login-Einstieg; mit Supabase-Konfiguration E-Mail/Passwort, sonst lokale Passwort-Schranke
- `app/versorgungs-kompass.html`: Hauptansicht des Kompass
- `data/supabase-config.js`, `data/data-service.js`: Supabase-Konfiguration und Data-Service-Layer
- `api/server.mjs`, `API_CONTRACT.md`: optionale REST-API-Schicht zur Kapselung produktiver Supabase-Tabellenzugriffe
- `DEPLOYMENT_GCP_GEMATIK.md`: Deployment-Doku fuer Jenkins, GCP Cloud Run und API-Gateway-Zielbetrieb
- `map/versorgungs-kompass-map.html`: Karten-Modus als Overlay-Inhalt
- `map/versorgungs-kompass-map-teaser.html`: Mini-Karten-Vorschau fuer die Login-Seite
- `map/versorgungs-kompass-contact-mini-map.html`: kompakte Kontaktkarte

## Daten

Die produktiven Kompass-Daten liegen nicht mehr im GitHub-Repository, sondern in Supabase.

Die frueheren statischen Seed-Dateien bleiben nur als leere Fallback-Schnittstelle erhalten, damit lokale Entwicklungs- und Kartenpfade nicht brechen:

- `data/versorgungs-kompass-data.js`
- `data/versorgungs-kompass-data.csv`
- `data/fachrichtungen-bereinigung.md`
- `data/fachrichtungen-zielkatalog.json`
- `data/expertenkreis-data.js`: separater oeffentlicher Seed fuer den INA-Expertenkreis, nicht fuer Versorgungskontakte

Wichtig: In die Versorgungskontakt-Dateien duerfen keine echten Personen-, Kontakt-, E-Mail-, Telefon-, LinkedIn- oder CRM-Daten mehr committed werden. GitHub Pages ist oeffentliches statisches Hosting und kein sicherer Backend-Speicher. Der Expertenkreis-Seed ist davon getrennt und enthaelt nur strukturierte oeffentliche INA-Fakten wie Name, Gruppe, Organisation, Profil-URL und Expertise-Tags.

### Prioritaet und Owner dauerhaft pflegen

Prioritaet und Owner werden im Supabase-Datenbestand gepflegt. Der alte CSV-Pflegeweg ist nicht mehr produktiv.

Der fruehere CSV-Sync-Pfad ist nur noch fuer lokale Migrations- oder Demo-Experimente gedacht:

1. `data/versorgungs-kompass-data.csv` bearbeiten.
2. Die Spalten `priority` und `owner` pflegen.
   - `priority`: `Hoch`, `Mittel` oder `Niedrig`
   - `owner`: z. B. `Timo Frank`, `Mirjam Scholz`, `Max Fröhlich`, `Johanna Ludwig`, `Laila Wahle`, `Thomas Kostera`
3. `node scripts/sync_contact_data.js` ausfuehren.
4. Die geaenderten Dateien committen und deployen.

Das Sync-Skript validiert die CSV, schreibt `data/versorgungs-kompass-data.js` neu und spiegelt CSV und JS nach `docs/data/`. Es darf nicht mit echten Kontaktdaten fuer GitHub Pages genutzt werden.

Der Zielbetrieb nutzt Supabase als gemeinsamen Datenstand. Die statische Oberflaeche bleibt erhalten und greift ueber `window.dataService` auf Supabase zu. Service-Role-Keys duerfen nie in `data/supabase-config.js` oder andere Frontend-Dateien eingetragen werden.

Fuer Setup, SQL, Rollen, RLS und Import siehe `supabase/README.md`. Fuer neue Nutzer:innen und Rollen-Onboarding siehe `supabase/onboarding.md`. Fuer Regelbetrieb, Backups, Redirects und Sicherheitschecks siehe `supabase/operations.md`.

Fuer den Karten-Modus werden diese Kartendateien benoetigt:

- `map/data/de-geojson.js`
- `map/data/city-labels.js`
- `map/data/state-labels.js`
- `map/data/state-polygons.js`
- `map/data/state-polygons.geojson`

## Ordnerueberblick

- `app/`: Hauptanwendung des Versorgungs-Kompass
- `login/`: Login-Seite und Auth-Skripte
- `map/`: Kartenmodus, Mini-Karten und Kartendaten
- `data/`: Kompass-Daten und fachliche Bereinigungstabellen
- `docs/`: GitHub-Pages-Publish-Ordner
- `public/`: Logos und statische Assets
- `scripts/`: Hilfsskripte fuer den statischen Kompass

## API-Gateway-Check

Fachliche Supabase-Tabellen- und Storage-Zugriffe duerfen im Browser nicht direkt stattfinden. Der Check laeuft lokal und in Jenkins:

```bash
npm run security:api-gateway
```

Im Produktionsartefakt prueft Jenkins zusaetzlich, dass `docs/data/supabase-config.js` eine HTTPS-`apiBaseUrl` enthaelt und `requireApiGateway: true` gesetzt ist.

Die technische Deployment-Doku fuer GCP/gematik steht in `DEPLOYMENT_GCP_GEMATIK.md`.

Die API-Input-Validierung laesst sich separat testen:

```bash
npm run test:api-validation
```

Der lokale GCP/Jenkins-Preflight laeuft mit:

```bash
npm run deploy:preflight
```

## Lokale Nutzung

Der aktuelle Kompass nutzt Supabase als produktiven Datenstand. Starte lokal am besten einen kleinen Webserver aus dem Repository:

```bash
python3 -m http.server 4173
```

Danach oeffnen:

1. `http://127.0.0.1:4173/login/login.html`
2. Mit Supabase-E-Mail und Passwort anmelden.
3. Weiterleitung in den `Versorgungs-Kompass`.

Wichtig:

- Fuer den Karten-Modus werden die Kartendateien aus `map/data/` benoetigt.
- `file:///.../app/versorgungs-kompass.html` ist fuer den Supabase-Betrieb nicht der empfohlene Einstieg. Wenn dort noch eine alte lokale Passwort-Session liegt, kann die Oberflaeche ohne echte Supabase-Session leer wirken.
- Ohne gueltige Supabase-Session duerfen `profiles` und `contacts` wegen RLS nicht gelesen werden.

### Produktionsnahe lokale Nutzung

Fuer eine Entwicklungsumgebung, die naeher an GCP/Live liegt, laufen Frontend und API lokal getrennt:

```bash
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_ANON_KEY="..." \
ALLOWED_ORIGIN="http://127.0.0.1:4173" \
npm run start:api
```

In einem zweiten Terminal:

```bash
python3 -m http.server 4173
```

Dann `data/supabase-config.js` fuer diese lokale Session auf die API setzen:

```js
apiBaseUrl: "http://127.0.0.1:8081",
requireApiGateway: true
```

Live setzt Jenkins dieselben Schalter im `docs/`-Artefakt, aber mit HTTPS-API-URL.

## GitHub Pages

Fuer eine einfache Web-Version des statischen `Versorgungs-Kompass` wird der Publish-Ordner `docs/` verwendet.

- Einstieg fuer GitHub Pages: `docs/index.html`
- Login-Seite: `docs/login.html`
- Publish-Assets lassen sich mit `scripts/sync_github_pages.sh` aus dem aktuellen Projektstand aktualisieren

`docs/` ist eine Publish-Kopie. Aktive Bearbeitung findet in `app/`, `login/`, `map/`, `data/` und `public/` statt.

Fuer GitHub Pages in GitHub:

1. `Settings`
2. `Pages`
3. Source: `Deploy from a branch`
4. Branch: `main`
5. Folder: `/docs`

## Archiv

Alte Archivordner wurden aus dem GitHub-Repository entfernt, weil sie fuer den Supabase-Betrieb nicht benoetigt werden und alte Kontakt-, Demo- oder Importdaten enthalten konnten. Lokale Backups liegen ausserhalb des Repositorys.
