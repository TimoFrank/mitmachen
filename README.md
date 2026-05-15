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

Wichtig: In diese Dateien duerfen keine echten Personen-, Kontakt-, E-Mail-, Telefon-, LinkedIn- oder CRM-Daten mehr committed werden. GitHub Pages ist oeffentliches statisches Hosting und kein sicherer Backend-Speicher.

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

## Lokale Nutzung

Du kannst den aktuellen Kompass direkt lokal oeffnen:

1. `login/login.html`
2. Passwort eingeben
3. Weiterleitung in den `Versorgungs-Kompass`

Wichtig:

- Fuer den Karten-Modus werden die Kartendateien aus `map/data/` benoetigt.
- Der Login ist bewusst einfach gehalten und fuer private, kontrollierte Nutzung gedacht.

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
