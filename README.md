# Versorgungs-Kompass

Das gematik-Hospitationsnetzwerk sichtbar machen.

Der `Versorgungs-Kompass` ist ein interner Arbeits- und Orientierungskompass für das gematik-Hospitationsnetzwerk. Er bündelt Kontakte, Organisationen, Standorte und fachliche Einordnungen so, dass aus einzelnen Anknüpfungspunkten ein gemeinsames Lagebild entsteht: Wer gehört zu unserem Netzwerk? Wo sind Einrichtungen, Praxen, Kliniken, Kassen, Pflege- und Therapieangebote verortet? Welche Regionen sind bereits gut sichtbar und wo fehlen uns noch Perspektiven?

Im Mittelpunkt steht die `Karte`. Sie soll schnell erfassbar machen, wie unser Hospitations-Netzwerk im Raum verteilt ist. Statt Kontakte nur als Liste zu betrachten, zeigt die Karte Cluster, weiße Flecken, regionale Schwerpunkte und mögliche Nachbarschaften zwischen Akteuren. Damit wird sie zum Einstieg für Planung, Abstimmung und Reflexion: Wo können Hospitationen sinnvoll gebündelt werden? Welche Versorgungsbereiche sind in einer Region vertreten? Welche Kontakte liegen nahe beieinander und könnten gemeinsam gedacht werden?

Das Ziel ist eine lebendige Übersicht über unser Hospitations-Netzwerk: eine Karte, die Orientierung gibt, Gespräche vorbereitet, Lücken sichtbar macht und hilft, aus vielen Einzelkontakten ein belastbares Bild der Versorgungspraxis zu entwickeln.

![Kartenansicht des Versorgungs-Kompass mit fiktiven Demo-Daten](dokumentation/assets/versorgungs-kompass-karte.png)

_Demo-Snapshot mit fiktiven Daten._

Das Repository enthält die Weboberfläche, Kartenansichten, Datenadapter, Backend-Anbindung und Unterlagen für Übergabe und Betrieb. Produktive Netzwerkdaten liegen nicht im Repository, sondern in einem geschützten Backend.

## Schnellstart

Kurz erklärt:

- Der Versorgungs-Kompass ist eine interne Webanwendung für das gematik-Hospitationsnetzwerk.
- Die Karte ist der Einstieg: Sie zeigt Kontakte, Organisationen, Standorte und regionale Lücken.
- GitHub enthält Quellcode, Dokumentation und die GitHub-Pages-Testumgebung.
- Produktive Daten werden im geschützten Backend geführt.
- Für Betrieb und Migration ist die gematik-Deployment-Dokumentation der wichtigste technische Startpunkt.

## Ordnerstruktur

- `frontend/`: führende Frontend-Quellen.
  - `frontend/app/`: Hauptanwendung des Versorgungs-Kompass.
  - `frontend/login/`: Login-Seite und Auth-Skripte.
  - `frontend/map/`: Kartenansichten, Mini-Karten und Kartendaten.
  - `frontend/data/`: Datenadapter, Backend-Konfiguration und leere Fallback-Dateien.
  - `frontend/pages/`: einzelne statische Zusatzseiten, die nach `docs/` gespiegelt werden.
  - `frontend/demo/`: statische Demo-Oberfläche mit fiktiven Daten.
- `api/`: REST-API für produktionsnahe Backend-Zugriffe im Zielbild.
- `supabase/`: Legacy-/Migrationsquelle bis zur abgeschlossenen Shared-Postgres-Datenmigration.
- `public/`: Logos, Icons und statische Assets.
- `scripts/`: Prüf-, Sync- und Importskripte.
- `tests/`: Playwright-Smoke-Tests.
- `docs/`: Publish-Kopie für GitHub Pages. Dieser Ordner wird aus den Quellordnern synchronisiert.
- `dokumentation/`: Architektur, Betrieb, Design, QA und Übergabeunterlagen.

Die wichtigsten Quellpfade sind `frontend/`, `api/`, `public/`, `scripts/`, `tests/` und `dokumentation/`. `supabase/` bleibt vorerst als Legacy- und Migrationsquelle erhalten. `docs/` ist ein Auslieferungsartefakt und sollte nicht direkt gepflegt werden.

## Daten und Backend

Produktive Kontakt-, Organisations- und Netzwerkdaten werden im geschützten Backend geführt. So bleibt der gemeinsame Datenstand zentral, nachvollziehbar und unabhängig vom öffentlichen Quellcode.

Die Dateien in `frontend/data/` bündeln Adapter, Laufzeitkonfiguration und schlanke Fallback-Dateien. Administrative Backend-Schlüssel und andere sensible Betriebszugriffe werden über das geschützte Secret-Management der jeweiligen Umgebung bereitgestellt; Frontend-Dateien wie `frontend/data/supabase-config.js` enthalten nur clientseitige Konfiguration.

Weitere Details:

- `dokumentation/architektur/API_CONTRACT.md`: API-Grenzen und Sicherheitsmodell.
- `dokumentation/architektur/DATA_MODEL.md`: fachliches Datenmodell.
- `dokumentation/architektur/VERSORGUNGS_NETZWERK_REGISTRIERUNG.md`: Schnittstellenbeschreibung für die Registrierungs-Inbox.
- `dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`: gematik-Zielbetrieb mit Jenkins, Kubernetes, Helm, Shared Postgres und statischem Frontend-Hosting.
- `supabase/README.md`: aktuelles Legacy-Backend und Quelle für die Datenmigration.

## Deployment

Die klare Standardveröffentlichung läuft über GitHub Pages und nutzt den Ordner `docs/`.

Vor einer Aktualisierung von GitHub Pages:

```bash
bash scripts/sync_github_pages.sh
```

Für das interne gematik Kubernetes-Zielbild mit Jenkins, Helm und API-Gateway siehe:

- `dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`
- `dokumentation/betrieb-und-deployment/BETRIEB.md`
- `dokumentation/betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md`
- `dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md`

Die aktuelle Einordnung der Auslieferungswege steht in der Deployment-Übersicht.

Wichtig: Ein Git-Push aktualisiert nur den Git-Stand. Wenn eine Änderung produktive Backend-Daten betrifft, muss sie zusätzlich in der Zielumgebung angewendet werden.

Wichtig für die Sichtbarkeit: GitHub Pages veröffentlicht nur statische Dateien. Die statische Demo bleibt für fiktive Daten geeignet; produktive Daten brauchen im Zielbild die Kubernetes-API und Shared Postgres. Ein Commit und Push einer SQL-Datei macht eine Migration nur als Datei sichtbar, wendet sie aber nicht auf Shared Postgres oder einen Legacy-Supabase-Datenstand an.

## Prüfungen

Für kleine Text-, CSS- oder Dokumentationsänderungen reicht meistens die schnelle Prüfung. Sie prüft Syntax, offensichtliche Datei-Probleme und Formatfehler, ohne die vollständige Browser-QA zu starten.

```bash
npm run qa:small
```

Die technische Standardprüfung ist der normale Qualitätscheck vor einem Commit. Sie prüft öffentliche Assets, API-Gateway-Regeln, zentrale Datenfelder und API-Validierung.

```bash
npm run check
```

Die vollständige QA ist für größere UI-, Navigations- oder Datenflussänderungen gedacht. Sie kombiniert die technischen Checks mit Playwright-Smoke-Tests im Browser.

```bash
npm run qa:full
```

Die detaillierten QA-Regeln stehen in `dokumentation/entwicklung-und-qa/QA_WORKFLOW.md`.

## Dokumentation

Die Detaildokumentation liegt gebündelt unter `dokumentation/`. Für den ersten Einstieg reicht meistens diese README; die Unterlagen im Dokumentationsordner erklären danach die fachliche Struktur, die technische Architektur und den Betrieb genauer.

- `dokumentation/README.md`: Einstieg und Wegweiser durch die Dokumentation.
- `dokumentation/produkt-und-design/`: Designsystem, UX-Regeln und UI-Checklisten für die Oberfläche.
- `dokumentation/entwicklung-und-qa/`: Projektzustand, Prüfabläufe und Qualitätssicherung.
- `dokumentation/architektur/`: API-Grenzen, Datenmodell und Schnittstellen.
- `dokumentation/betrieb-und-deployment/`: Betrieb, Deployment und gematik-Zielbild.

## Arbeitsregel

Aktive Änderungen passieren in den Quellordnern. Danach werden Tests ausgeführt und, falls GitHub Pages betroffen ist, `docs/` mit `scripts/sync_github_pages.sh` aktualisiert.
