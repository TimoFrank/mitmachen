# Versorgungs-Kompass

Der Versorgungs-Kompass ist eine CRM-Anwendung fuer das gematik-Hospitationsnetzwerk.

Das Repository enthaelt die Weboberflaeche, die Datenadapter, die Supabase-Anbindung und die Unterlagen fuer Betrieb und Uebergabe. Die produktiven CRM-Daten liegen nicht im Repository, sondern in Supabase.

## Schnellstart

Abhaengigkeiten installieren:

```bash
npm install
```

Lokalen Webserver starten:

```bash
python3 -m http.server 4173
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:4173/login/login.html
```

Fuer den produktionsnahen Betrieb mit API-Schicht:

```bash
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_ANON_KEY="..." \
ALLOWED_ORIGIN="http://127.0.0.1:4173" \
npm run start:api
```

## Ordnerstruktur

- `app/`: Hauptanwendung des Versorgungs-Kompass.
- `login/`: Login-Seite und Auth-Skripte.
- `map/`: Kartenansichten und Kartendaten.
- `data/`: Datenadapter, Supabase-Konfiguration und leere Fallback-Dateien.
- `api/`: optionale REST-API fuer produktionsnahe Supabase-Zugriffe.
- `supabase/`: Schema, Migrationen, Rollen, Onboarding und Betriebsnotizen fuer Supabase.
- `public/`: Logos, Icons und statische Assets.
- `scripts/`: Pruef-, Sync- und Importskripte.
- `tests/`: Playwright-Smoke-Tests.
- `demo/`: einfache Demo-Ansicht.
- `gcp/`: GCP-nahe Backend-Variante fuer interne Tests.
- `docs/`: Publish-Kopie fuer GitHub Pages. Dieser Ordner wird aus den Quellordnern synchronisiert.
- `dokumentation/`: Architektur, Betrieb, Design, QA und historische Uebergabeunterlagen.

Die wichtigsten Quellpfade sind `app/`, `login/`, `map/`, `data/`, `api/`, `supabase/` und `public/`. `docs/` ist ein Auslieferungsartefakt und sollte nicht direkt gepflegt werden.

## Daten und Sicherheit

Produktive Kontakt-, Organisations- und CRM-Daten gehoeren nach Supabase. Sie werden nicht in GitHub gespeichert.

Die Dateien in `data/` halten nur Adapter, Konfiguration und leere Fallbacks bereit. Service-Role-Keys duerfen nie in Frontend-Dateien wie `data/supabase-config.js` eingetragen werden.

Weitere Details:

- `supabase/README.md`: Setup, SQL, Rollen und RLS.
- `supabase/onboarding.md`: neue Nutzer und Rollen.
- `supabase/operations.md`: Backups, Redirects und Sicherheitschecks.
- `dokumentation/architektur/API_CONTRACT.md`: API-Grenzen und Sicherheitsmodell.
- `dokumentation/architektur/DATA_MODEL.md`: fachliches Datenmodell.

## Deployment

GitHub Pages nutzt den Ordner `docs/`.

Vor einer Aktualisierung von GitHub Pages:

```bash
bash scripts/sync_github_pages.sh
```

Fuer Jenkins, GCP Cloud Run und API-Gateway siehe:

- `dokumentation/betrieb-und-deployment/DEPLOYMENT_GCP_GEMATIK.md`
- `dokumentation/betrieb-und-deployment/BETRIEB.md`
- `dokumentation/betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md`

Wichtig: Ein Git-Push veroeffentlicht keine Supabase-Migration. Wenn eine Aenderung Live-Daten betrifft, muss die passende Migration oder SQL-Aenderung zusaetzlich auf das verknuepfte Supabase-Projekt angewendet werden.

## Pruefungen

Kleine Text-, CSS- oder Doku-Aenderungen:

```bash
npm run qa:small
```

Technische Standardpruefung:

```bash
npm run check
```

Vollstaendige QA mit visuellen Smokes:

```bash
npm run qa:full
```

Die QA-Regeln stehen in `dokumentation/entwicklung-und-qa/QA_WORKFLOW.md`.

## Dokumentation

Die Detaildokumentation liegt gebuendelt unter `dokumentation/`:

- `dokumentation/README.md`: kurze Doku-Landkarte.
- `dokumentation/produkt-und-design/`: Designsystem, UX-Regeln und UI-Checklisten.
- `dokumentation/entwicklung-und-qa/`: aktueller Projektzustand und QA-Ablauf.
- `dokumentation/architektur/`: API-Kontrakt und Datenmodell.
- `dokumentation/betrieb-und-deployment/`: Betrieb, Deployment, GCP-Uebergabe und historische Schrittunterlagen.

## Arbeitsregel

Aktive Aenderungen passieren in den Quellordnern. Danach werden Tests ausgefuehrt und, falls GitHub Pages betroffen ist, `docs/` mit `scripts/sync_github_pages.sh` aktualisiert.
