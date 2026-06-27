# Versorgungs-Kompass

Das gematik-Hospitationsnetzwerk sichtbar machen.

Der `Versorgungs-Kompass` ist ein interner Arbeits- und Orientierungskompass fuer das gematik-Hospitationsnetzwerk. Er buendelt Kontakte, Organisationen, Standorte und fachliche Einordnungen so, dass aus einzelnen Anknuepfungspunkten ein gemeinsames Lagebild entsteht: Wer gehoert zu unserem Netzwerk? Wo sind Einrichtungen, Praxen, Kliniken, Kassen, Pflege- und Therapieangebote verortet? Welche Regionen sind bereits gut sichtbar und wo fehlen uns noch Perspektiven?

Im Mittelpunkt steht die `Karte`. Sie soll schnell erfassbar machen, wie unser Hospitations-Netzwerk im Raum verteilt ist. Statt Kontakte nur als Liste zu betrachten, zeigt die Karte Cluster, weisse Flecken, regionale Schwerpunkte und moegliche Nachbarschaften zwischen Akteuren. Damit wird sie zum Einstieg fuer Planung, Abstimmung und Reflexion: Wo koennen Hospitationen sinnvoll gebuendelt werden? Welche Versorgungsbereiche sind in einer Region vertreten? Welche Kontakte liegen nahe beieinander und koennten gemeinsam gedacht werden?

Das Ziel ist eine lebendige Uebersicht ueber unser Hospitations-Netzwerk: eine Karte, die Orientierung gibt, Gespraeche vorbereitet, Luecken sichtbar macht und hilft, aus vielen Einzelkontakten ein belastbares Bild der Versorgungspraxis zu entwickeln.

![Kartenansicht des Versorgungs-Kompass mit fiktiven Demo-Daten](dokumentation/assets/versorgungs-kompass-karte.png)

_Demo-Snapshot mit fiktiven Daten._

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
http://127.0.0.1:4173/frontend/login/login.html
```

Fuer den produktionsnahen Betrieb kann die API-Schicht mit den Backend-Zugangsdaten der Zielumgebung gestartet werden:

```bash
ALLOWED_ORIGIN="http://127.0.0.1:4173" \
npm run start:api
```

Die konkreten Backend-Variablen haengen von der Zielplattform ab. Details stehen in der Deployment-Dokumentation.

## Ordnerstruktur

- `frontend/`: fuehrende Frontend-Quellen.
  - `frontend/app/`: Hauptanwendung des Versorgungs-Kompass.
  - `frontend/login/`: Login-Seite und Auth-Skripte.
  - `frontend/map/`: Kartenansichten, Mini-Karten und Kartendaten.
  - `frontend/data/`: Datenadapter, Backend-Konfiguration und leere Fallback-Dateien.
  - `frontend/pages/`: einzelne statische Zusatzseiten, die nach `docs/` gespiegelt werden.
  - `frontend/demo/`: statische Demo-Oberflaeche mit fiktiven Daten.
- `api/`: REST-API fuer produktionsnahe Backend-Zugriffe im Zielbild.
- `supabase/`: Legacy-/Migrationsquelle bis zur abgeschlossenen Shared-Postgres-Datenmigration.
- `public/`: Logos, Icons und statische Assets.
- `scripts/`: Pruef-, Sync- und Importskripte.
- `tests/`: Playwright-Smoke-Tests.
- `docs/`: Publish-Kopie fuer GitHub Pages. Dieser Ordner wird aus den Quellordnern synchronisiert.
- `dokumentation/`: Architektur, Betrieb, Design, QA und Uebergabeunterlagen.

Die wichtigsten Quellpfade sind `frontend/`, `api/`, `public/`, `scripts/`, `tests/` und `dokumentation/`. `supabase/` bleibt vorerst als Legacy- und Migrationsquelle erhalten. `docs/` ist ein Auslieferungsartefakt und sollte nicht direkt gepflegt werden.

## Daten und Backend

Produktive Kontakt-, Organisations- und Netzwerkdaten werden im geschuetzten Backend gefuehrt. So bleibt der gemeinsame Datenstand zentral, nachvollziehbar und unabhaengig vom oeffentlichen Quellcode.

Die Dateien in `frontend/data/` buendeln Adapter, Laufzeitkonfiguration und schlanke Fallback-Dateien. Administrative Backend-Schluessel und andere sensible Betriebszugriffe werden ueber das geschuetzte Secret-Management der jeweiligen Umgebung bereitgestellt; Frontend-Dateien wie `frontend/data/supabase-config.js` enthalten nur clientseitige Konfiguration.

Weitere Details:

- `dokumentation/architektur/API_CONTRACT.md`: API-Grenzen und Sicherheitsmodell.
- `dokumentation/architektur/DATA_MODEL.md`: fachliches Datenmodell.
- `dokumentation/architektur/VERSORGUNGS_NETZWERK_REGISTRIERUNG.md`: Schnittstellenbeschreibung fuer die Registrierungs-Inbox.
- `dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`: gematik-Zielbetrieb mit Jenkins, Kubernetes, Helm, Shared Postgres und statischem Frontend-Hosting.
- `supabase/README.md`: aktuelles Legacy-Backend und Quelle fuer die Datenmigration.

## Deployment

Die klare Standardveroeffentlichung laeuft ueber GitHub Pages und nutzt den Ordner `docs/`.

Vor einer Aktualisierung von GitHub Pages:

```bash
bash scripts/sync_github_pages.sh
```

Fuer das interne gematik Kubernetes-Zielbild mit Jenkins, Helm und API-Gateway siehe:

- `dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`
- `dokumentation/betrieb-und-deployment/BETRIEB.md`
- `dokumentation/betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md`
- `dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md`

Die aktuelle Einordnung der Auslieferungswege steht in der Deployment-Uebersicht.

Wichtig: Ein Git-Push aktualisiert nur den Git-Stand. Wenn eine Aenderung produktive Backend-Daten betrifft, muss sie zusaetzlich in der Zielumgebung angewendet werden.

Wichtig fuer die Sichtbarkeit: GitHub Pages veroeffentlicht nur statische Dateien. Die statische Demo bleibt fuer fiktive Daten geeignet; produktive Daten brauchen im Zielbild die Kubernetes-API und Shared Postgres. Ein Commit und Push einer SQL-Datei macht eine Migration nur als Datei sichtbar, wendet sie aber nicht auf Shared Postgres oder einen Legacy-Supabase-Datenstand an.

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
- `dokumentation/betrieb-und-deployment/`: Betrieb, Deployment, gematik-Zielbild und historische Schrittunterlagen.

## Arbeitsregel

Aktive Aenderungen passieren in den Quellordnern. Danach werden Tests ausgefuehrt und, falls GitHub Pages betroffen ist, `docs/` mit `scripts/sync_github_pages.sh` aktualisiert.
