# Versorgungs-Kompass

Der Versorgungs-Kompass macht das gematik-Hospitationsnetzwerk sichtbar.

Im Mittelpunkt steht die Karte: Sie zeigt, wo relevante Einrichtungen, Organisationen und Ansprechpersonen im Netzwerk verortet sind. So entsteht schnell ein gemeinsames Bild davon, welche Hospitationsorte bereits bekannt sind, wo Schwerpunkte liegen und welche Regionen oder Versorgungskontexte noch gezielt erschlossen werden koennen.

Die Anwendung hilft dabei, ein wachsendes Netzwerk nicht nur als Liste zu verwalten, sondern raeumlich zu verstehen. Teams koennen Kontakte, Organisationen und fachliche Hinweise entlang der Karte einordnen, vergleichen und fuer die weitere Planung nutzen. Ziel ist eine uebersichtliche, nachvollziehbare Arbeitsgrundlage fuer Hospitationen, Austauschformate und den spaeteren internen Betrieb.

Das Repository enthaelt die Weboberflaeche, Kartenansichten, Datenadapter, Backend-Anbindung und Unterlagen fuer Uebergabe und Betrieb. Produktive Netzwerkdaten liegen nicht im Repository, sondern in einem geschuetzten Backend.

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

Fuer den produktionsnahen Betrieb kann die API-Schicht mit den Backend-Zugangsdaten der Zielumgebung gestartet werden:

```bash
ALLOWED_ORIGIN="http://127.0.0.1:4173" \
npm run start:api
```

Die konkreten Backend-Variablen haengen von der Zielplattform ab. Details stehen in der Deployment-Dokumentation.

## Ordnerstruktur

- `app/`: Hauptanwendung des Versorgungs-Kompass.
- `login/`: Login-Seite und Auth-Skripte.
- `map/`: Kartenansichten, Mini-Karten und Kartendaten.
- `data/`: Datenadapter, Backend-Konfiguration und leere Fallback-Dateien.
- `api/`: optionale REST-API fuer produktionsnahe Backend-Zugriffe.
- `supabase/`: aktuelle Backend-Migrationen, Rollen, Onboarding und Betriebsnotizen.
- `public/`: Logos, Icons und statische Assets.
- `scripts/`: Pruef-, Sync- und Importskripte.
- `tests/`: Playwright-Smoke-Tests.
- `demo/`: einfache Demo-Ansicht.
- `gcp/`: GCP-nahe Backend-Variante fuer interne Tests.
- `docs/`: Publish-Kopie fuer GitHub Pages. Dieser Ordner wird aus den Quellordnern synchronisiert.
- `dokumentation/`: Architektur, Betrieb, Design, QA und historische Uebergabeunterlagen.

Die wichtigsten Quellpfade sind `app/`, `login/`, `map/`, `data/`, `api/`, `supabase/` und `public/`. `docs/` ist ein Auslieferungsartefakt und sollte nicht direkt gepflegt werden.

## Daten und Backend

Produktive Kontakt-, Organisations- und Netzwerkdaten gehoeren in ein geschuetztes Backend. Sie werden nicht in GitHub gespeichert.

Die Dateien in `data/` halten Adapter, Konfiguration und leere Fallbacks bereit. Geheimnisse oder administrative Backend-Schluessel duerfen nie in Frontend-Dateien wie `data/supabase-config.js` eingetragen werden.

Weitere Details:

- `supabase/README.md`: aktuelles Backend-Setup, SQL, Rollen und Zugriffsschutz.
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

Wichtig: Ein Git-Push aktualisiert nur den Git-Stand. Wenn eine Aenderung produktive Backend-Daten betrifft, muss sie zusaetzlich in der Zielumgebung angewendet werden.

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
