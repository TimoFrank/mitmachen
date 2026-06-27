# Versorgungs-Kompass

Das gematik-Hospitationsnetzwerk sichtbar machen.

Der `Versorgungs-Kompass` ist ein interner Arbeits- und Orientierungskompass für das gematik-Hospitationsnetzwerk. Er bündelt Kontakte, Organisationen, Standorte und fachliche Einordnungen so, dass aus einzelnen Anknüpfungspunkten ein gemeinsames Lagebild entsteht: Wer gehört zu unserem Netzwerk? Wo sind Einrichtungen, Praxen, Kliniken, Kassen, Pflege- und Therapieangebote verortet? Welche Regionen sind bereits gut sichtbar und wo fehlen uns noch Perspektiven?

Im Mittelpunkt steht die `Karte`. Sie soll schnell erfassbar machen, wie unser Hospitations-Netzwerk im Raum verteilt ist. Statt Kontakte nur als Liste zu betrachten, zeigt die Karte Cluster, weiße Flecken, regionale Schwerpunkte und mögliche Nachbarschaften zwischen Akteuren. Damit wird sie zum Einstieg für Planung, Abstimmung und Reflexion: Wo können Hospitationen sinnvoll gebündelt werden? Welche Versorgungsbereiche sind in einer Region vertreten? Welche Kontakte liegen nahe beieinander und könnten gemeinsam gedacht werden?

Das Ziel ist eine lebendige Übersicht über unser Hospitations-Netzwerk: eine Karte, die Orientierung gibt, Gespräche vorbereitet, Lücken sichtbar macht und hilft, aus vielen Einzelkontakten ein belastbares Bild der Versorgungspraxis zu entwickeln.

<img src="dokumentation/assets/versorgungs-kompass-karte.png" alt="Kartenansicht des Versorgungs-Kompass" width="560">

## Aktueller Release

- Version: [v0.16.0](https://github.com/TimoFrank/mitmachen/releases/tag/v0.16.0)
- Stand: 27. Juni 2026
- Kurznotiz: Erstes GitHub Release, harmonisiert mit dem App-Changelog bis Version 0.16.
- Testumgebung: [GitHub Pages](https://timofrank.github.io/mitmachen/versorgungs-kompass.html)

## Schnellstart

Kurz erklärt:

Das Repository enthält die Weboberfläche, Kartenansichten, Datenadapter, Backend-Anbindung und Unterlagen für Übergabe und Betrieb. Produktive Netzwerkdaten liegen nicht im Repository, sondern in einem geschützten Backend.

- Der Versorgungs-Kompass ist eine interne Webanwendung für das gematik-Hospitationsnetzwerk.
- Die Karte ist der Einstieg: Sie zeigt Kontakte, Organisationen, Standorte und regionale Lücken.
- GitHub enthält Quellcode, Dokumentation und die [GitHub-Pages-Testumgebung](https://timofrank.github.io/mitmachen/versorgungs-kompass.html).
- Für Betrieb und Migration ist die [gematik-Deployment-Dokumentation](dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md) der wichtigste technische Startpunkt.

## Ordnerstruktur

- [`frontend/`](frontend/): führende Frontend-Quellen.
  - [`frontend/app/`](frontend/app/): Hauptanwendung des Versorgungs-Kompass.
  - [`frontend/login/`](frontend/login/): Login-Seite und Auth-Skripte.
  - [`frontend/map/`](frontend/map/): Kartenansichten, Mini-Karten und Kartendaten.
  - [`frontend/data/`](frontend/data/): Datenadapter, Backend-Konfiguration und leere Fallback-Dateien.
  - [`frontend/pages/`](frontend/pages/): einzelne statische Zusatzseiten, die nach [`docs/`](docs/) gespiegelt werden.
  - [`frontend/demo/`](frontend/demo/): statische Demo-Oberfläche mit fiktiven Daten.
- [`api/`](api/): REST-API für produktionsnahe Backend-Zugriffe im Zielbild.
- [`supabase/`](supabase/): Legacy-/Migrationsquelle bis zur abgeschlossenen Shared-Postgres-Datenmigration.
- [`public/`](public/): Logos, Icons und statische Assets.
- [`scripts/`](scripts/): Prüf-, Sync- und Importskripte.
- [`tests/`](tests/): Playwright-Smoke-Tests.
- [`docs/`](docs/): Publish-Kopie für GitHub Pages. Dieser Ordner wird aus den Quellordnern synchronisiert.
- [`dokumentation/`](dokumentation/): Architektur, Betrieb, Design, QA und Übergabeunterlagen.
  - [`dokumentation/README.md`](dokumentation/README.md): Einstieg und Wegweiser durch die Dokumentation.
  - [`dokumentation/produkt-und-design/`](dokumentation/produkt-und-design/): Designsystem, UX-Regeln und UI-Checklisten für die Oberfläche.
  - [`dokumentation/entwicklung-und-qa/`](dokumentation/entwicklung-und-qa/): Projektzustand, Prüfabläufe und Qualitätssicherung.
  - [`dokumentation/architektur/`](dokumentation/architektur/): API-Grenzen, Datenmodell und Schnittstellen.
  - [`dokumentation/betrieb-und-deployment/`](dokumentation/betrieb-und-deployment/): Betrieb, Deployment und gematik-Zielbild.

Die wichtigsten Quellpfade sind [`frontend/`](frontend/), [`api/`](api/), [`public/`](public/), [`scripts/`](scripts/), [`tests/`](tests/) und [`dokumentation/`](dokumentation/). [`supabase/`](supabase/) bleibt vorerst als Legacy- und Migrationsquelle erhalten. [`docs/`](docs/) ist ein Auslieferungsartefakt und sollte nicht direkt gepflegt werden.

## Daten und Backend

Produktive Daten werden im geschützten Backend geführt. So bleibt der gemeinsame Datenstand zentral, nachvollziehbar und unabhängig vom öffentlichen Quellcode.

Die Dateien in [`frontend/data/`](frontend/data/) bündeln Adapter, Laufzeitkonfiguration und schlanke Fallback-Dateien. Administrative Backend-Schlüssel und andere sensible Betriebszugriffe werden über das geschützte Secret-Management der jeweiligen Umgebung bereitgestellt. Frontend-Dateien wie [`frontend/data/supabase-config.js`](frontend/data/supabase-config.js) enthalten nur clientseitige Konfiguration.

Weitere Details:

- [`dokumentation/architektur/API_CONTRACT.md`](dokumentation/architektur/API_CONTRACT.md): API-Grenzen und Sicherheitsmodell.
- [`dokumentation/architektur/DATA_MODEL.md`](dokumentation/architektur/DATA_MODEL.md): fachliches Datenmodell.
- [`dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`](dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md): gematik-Zielbetrieb mit Jenkins, Kubernetes, Helm, Shared Postgres und statischem Frontend-Hosting.
- [`supabase/README.md`](supabase/README.md): aktuelles Legacy-Backend und Quelle für die Datenmigration.

## GitHub-Standardveröffentlichung

Die GitHub-Veröffentlichung ist der Standard für Testbetrieb, Vorführung und gemeinsame Sichtprüfung. Sie läuft über [GitHub Pages](https://timofrank.github.io/mitmachen/versorgungs-kompass.html) und den Ordner [`docs/`](docs/).

Diese Veröffentlichung ist nicht der gematik-Zielbetrieb. Sie zeigt die statische Oberfläche und nutzt die dafür vorgesehene Test- oder Demo-Konfiguration. Produktive Daten, produktive Berechtigungen und geschützte Betriebszugriffe gehören nicht in diese GitHub-Veröffentlichung.

Änderungen an der Oberfläche werden aus den Quellordnern nach [`docs/`](docs/) synchronisiert und danach über GitHub Pages sichtbar gemacht. [`docs/`](docs/) bleibt dabei ein Auslieferungsartefakt und wird nicht direkt gepflegt.

## Deployment im Zielbetrieb

Im Zielbetrieb wird der Versorgungs-Kompass in der gematik-Infrastruktur betrieben. Dafür wird das statische Frontend bereitgestellt, die API als Dienst im Kubernetes-Umfeld ausgerollt und das Backend an Shared Postgres, Secret-Management, internes SSO und Gateway oder Reverse Proxy angebunden.

Die Umsetzung folgt den Betriebs- und Deployment-Unterlagen. Der einfache Ablauf ist: Zielumgebung vorbereiten, Konfiguration und Secrets setzen, Datenbankmigration prüfen, Frontend und API bereitstellen, danach Anmeldung, Navigation, Kartenaufruf und Backend-Zugriffe testen.

Die technischen Detaildokumente für die Implementierung sind:

- [`dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md`](dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md)
- [`dokumentation/betrieb-und-deployment/BETRIEB.md`](dokumentation/betrieb-und-deployment/BETRIEB.md)
- [`dokumentation/betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md`](dokumentation/betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md)
- [`dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md`](dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md)

Die aktuelle Einordnung der Auslieferungswege steht in der [Deployment-Übersicht](dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md). Kurz gesagt: GitHub Pages zeigt die Testveröffentlichung der Oberfläche. Der Zielbetrieb umfasst zusätzlich die geschützte Datenbank und die interne API. Echte Netzwerkdaten werden deshalb in der Zielumgebung gepflegt oder importiert, nicht über einzelne Dateien im Repository.

## Prüfungen

Das Repository enthält automatisierte Prüfungen. Sie helfen dabei, einfache Fehler früh zu finden und Änderungen verlässlich zu überprüfen.

Die schnellen Prüfungen achten auf Syntax, fehlende Dateien und offensichtliche Formatprobleme. Die technischen Checks prüfen zum Beispiel öffentliche Assets, API-Regeln, wichtige Datenfelder und die Backend-Anbindung. Die Browser-Tests öffnen die Oberfläche wie ein Nutzer und prüfen typische Wege, etwa Navigation, Kartenaufruf, Tabellen, Detailansichten und mobile Ansichten.

Die detaillierten QA-Regeln stehen in [`dokumentation/entwicklung-und-qa/QA_WORKFLOW.md`](dokumentation/entwicklung-und-qa/QA_WORKFLOW.md).

## Lizenz

Der Quellcode und die technische Dokumentation dieses Repositorys stehen unter der [Apache License 2.0](LICENSE).

Die im Repository enthaltenen Demo- und Beispieldaten sind fiktiv und werden, sofern in einer Datei nicht anders angegeben, ebenfalls unter der Apache License 2.0 für Entwicklung, Tests und Demonstrationen bereitgestellt.

Produktive Daten, Kundendaten, externe Datenbanken, echte Kontakt- und Organisationsdaten, Marken, Logos, Profilbilder, Drittinhalte und andere externe Assets sind nicht Teil dieser Repository-Lizenz. Live- oder Produktionsdaten aus externen Systemen wie Supabase werden separat geregelt und nicht durch die Apache-2.0-Lizenz dieses Repositorys freigegeben.

Weitere Hinweise stehen in [NOTICE](dokumentation/rechtliches/NOTICE.md) und [DATA_NOTICE.md](dokumentation/rechtliches/DATA_NOTICE.md).
