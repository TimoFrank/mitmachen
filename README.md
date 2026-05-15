# Versorgungs-Kompass

Das gematik-Hospitationsnetzwerk

Privates Arbeits-Repository fuer den `Versorgungs-Kompass`, den Karten-Modus und die zugehoerige Datenbasis des `gematik-Hospitationsnetzwerks`.

Der aktive Projektstand ist der statische `Versorgungs-Kompass` auf HTML-/JS-Basis. Aeltere CRM-, Mitmachen- und Karten-Prototypen wurden unter `archive/` abgelegt.

## Einstieg

Fuer den aktuellen nutzbaren Stand sind diese Dateien relevant:

- `login/login.html`: vorgeschaltete Login-Seite
- `login/auth-config.js`, `login/auth-guard.js`, `login/auth-login.js`: einfache Passwort-Schranke
- `app/versorgungs-kompass.html`: Hauptansicht des Kompass
- `map/versorgungs-kompass-map.html`: Karten-Modus als Overlay-Inhalt
- `map/versorgungs-kompass-map-teaser.html`: Mini-Karten-Vorschau fuer die Login-Seite
- `map/versorgungs-kompass-contact-mini-map.html`: kompakte Kontaktkarte

## Daten

Die produktiven Kompass-Daten liegen hier:

- `data/versorgungs-kompass-data.js`
- `data/versorgungs-kompass-data.csv`
- `data/fachrichtungen-bereinigung.md`
- `data/fachrichtungen-zielkatalog.json`

### Prioritaet und Owner dauerhaft pflegen

Prioritaet und Owner gehoeren in den Datensatz, wenn sie dauerhaft Teil der Demo-Daten sein sollen.

Der kanonische Pflegeweg ist:

1. `data/versorgungs-kompass-data.csv` bearbeiten.
2. Die Spalten `priority` und `owner` pflegen.
   - `priority`: `Hoch`, `Mittel` oder `Niedrig`
   - `owner`: z. B. `Timo Frank`, `Mirjam Scholz`, `Max Fröhlich`, `Johanna Ludwig`, `Laila Wahle`, `Thomas Kostera`
3. `node scripts/sync_contact_data.js` ausfuehren.
4. Die geaenderten Dateien committen und deployen.

Das Sync-Skript validiert die CSV, schreibt `data/versorgungs-kompass-data.js` neu und spiegelt CSV und JS nach `docs/data/`.

Wichtig: Die Benutzeroberflaeche ist aktuell eine Demo ohne Datenbank. Aenderungen direkt in der App koennen deshalb nur im lokalen Browser-Speicher abgelegt werden. Das ist im Moment die einzige Speicherfunktion der App. Andere Nutzer, andere Browser oder andere Geraete sehen diese lokalen Aenderungen nicht. Fuer eine dauerhafte Aenderung im Demo-Datensatz kann die App eine CSV exportieren; diese CSV muss danach manuell in den Projekt-Datensatz uebernommen und deployed werden.

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
- `archive/`: archivierte Altstaende und Experimente

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

Archivierte Projektteile:

- `archive/next-crm-prototype/`: ehemaliger Next.js-/TypeScript-CRM-Prototyp inklusive Render-Deployment und SQLite-Logik
- `archive/mitmachen-crm/`: ehemalige Mitmachen-/Versorgungsnetzwerk-Staende, Importskripte und Masterdaten
- `archive/map-experiments/`: alte Deutschlandkarten-Experimente aus dem Projekt-Root

Diese Archivordner dienen nur als Rueckgriff. Der aktive Kompass sollte nicht von Dateien daraus abhaengen.
