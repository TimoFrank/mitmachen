<h1 align="center">Versorgungs-Kompass</h1>

<p align="center"><strong>Menschen vernetzen. Beobachtungen verstehen. Wissen gemeinsam nutzen.</strong></p>

<p align="center">
  <a href="https://timofrank.github.io/mitmachen/demo/"><strong>Oeffentliche Demo ansehen</strong></a>
  · <a href="dokumentation/betrieb-und-deployment/ZIEL-README.md">Zielbetrieb verstehen</a>
  · <a href="CHANGELOG.md">Aenderungshistorie</a>
</p>

<p align="center">
  <a href="README.md"><strong>Ueberblick</strong></a>
  · <a href="dokumentation/betrieb-und-deployment/DEMO.md">Demo</a>
  · <a href="dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md">Deployment</a>
  · <a href="dokumentation/betrieb-und-deployment/BETRIEB.md">Betrieb</a>
  · <a href="SECURITY.md">Security</a>
  · <a href="dokumentation/README.md">Dokumentation</a>
</p>

Der Versorgungs-Kompass macht Versorgung sichtbar. Er verbindet Kontakte, Organisationen, Hospitationen und Beobachtungen in einem gemeinsamen Arbeitsraum. So wird aus vielen einzelnen Informationen ein Bild, das Teams gemeinsam nutzen koennen.

## Was der Versorgungs-Kompass moeglich macht

- **Versorgung sehen:** Karte und Filter zeigen regionale Schwerpunkte, Luecken und nahe Kontakte.
- **Beziehungen verstehen:** Kontakte, Organisationen und Stakeholder bleiben mit ihrem fachlichen Kontext verbunden.
- **Gemeinsam arbeiten:** Profile, Teams, Zustaendigkeiten und Aktivitaeten machen Beitraege nachvollziehbar.
- **Hospitationen begleiten:** Termine, Kalender und Fragebogen fuehren von der Vorbereitung bis zur Dokumentation.
- **Wissen aufbauen:** Das Framework verdichtet Beobachtungen zu Mustern, Hypothesen und Evidenz.
- **Naechste Schritte gestalten:** Dashboards, Roundtables und Fachgespraeche bringen Erkenntnisse in die gemeinsame Arbeit.

## Zugaenge und Betriebsstatus

| Zugang | Status | Wofuer geeignet |
| --- | --- | --- |
| [Oeffentliche Demo](https://timofrank.github.io/mitmachen/demo/) | Demo | Schneller Einblick mit ausschliesslich fiktiven Daten. |
| Geschuetzte Realanwendung | Zielbetrieb in Vorbereitung | Interner IT-Service mit Gateway/SSO, API im Kubernetes-Namespace, Shared Postgres und kontrolliertem Betrieb. |

GitHub Pages liefert ausschliesslich die oeffentliche Demo mit synthetischen Daten. Die geschuetzte Realanwendung wird separat gebaut und greift ausschliesslich ueber `/api` auf geschuetzte Daten zu. Pages ist keine Vorstufe des GKE-Deployments. Die GCP-Autopilot-Umgebung `pre-gematik` ist eine temporaere technische Pre-Integration und keine Produktivumgebung.

Weitere Bilder und Hinweise stehen auf der Seite [Demo und Screenshots](dokumentation/betrieb-und-deployment/DEMO.md).

## Aktueller Stand

- Stand: 19. Juli 2026
- Oeffentlicher Kanal: [synthetische GitHub-Pages-Demo](https://timofrank.github.io/mitmachen/demo/)
- Geschuetzter Kanal: Realanwendung ueber Gateway, Anmeldung, API und private Datenspeicher
- Release-Historie: [CHANGELOG](CHANGELOG.md)

## Repository auf einen Blick

```text
.github/                  GitHub Actions, Dependabot und aktive CODEOWNERS-Regeln
api/                      serverseitige Logik fuer Pre-Integration und Zielbetrieb
config/
  pages-demo/             Vertrag fuer die oeffentliche Demo
  pre-gematik/            Vertrag und Variablennamen fuer die GKE-Pre-Integration
  target/                 Vertrag fuer den kuenftigen gematik-Zielbetrieb
  security/               Semgrep- und Gitleaks-Konfiguration
deploy/
  helm/                   Kubernetes-Ressourcen
  terraform/              temporaere GCP-Pre-Integrationsinfrastruktur
  jenkins/                Referenzpipeline fuer die Software Factory
  postgres/               Datenbankvertrag der Pre-Integration
dist/                     generierte, nicht versionierte Build- und Pruefergebnisse
dokumentation/            Produkt-, Architektur-, Betriebs- und QA-Unterlagen
frontend/                 gemeinsame fuehrende Browser-Quellen
public/                   gemeinsame statische Quellassets
scripts/                  Build-, Test- und Betriebswerkzeuge
supabase/                 geschuetztes Schema, Migrationen und Betriebsnachweise
tests/                    Browser- und Integrationspruefungen
```

`dist/` ist auf GitHub durch seine README sichtbar; alle erzeugten Inhalte darin bleiben ignoriert. Die fruehere versionierte `docs/`-Publish-Kopie ist entfallen, weil GitHub Actions das Pages-Artefakt direkt und reproduzierbar aus `frontend/` und `public/` baut. Lokale Codex-Pet-, Export-, Test- und Office-Dateien sind ebenfalls kein Teil des Produkt-Repositories.

### Warum einige Namen mit einem Punkt beginnen

| Eintrag | Warum er im Root bleibt |
| --- | --- |
| `.github/` | GitHub erwartet Workflows und Dependabot hier; auch die aktive CODEOWNERS-Datei liegt an diesem festen Ort. |
| `.gitignore` | verhindert repo-weit, dass lokale Builds, Secrets und Testausgaben committed werden. |
| `.gitattributes` | legt fuer Git die Behandlung von Binaerdateien und Vendor-Code fest. |
| `.dockerignore` | begrenzt den Inhalt von `docker build .` auf die fuer das API-Image benoetigten Dateien. |
| `.semgrepignore` | wird von Semgrep an diesem festen Projektort automatisch gelesen. |

Diese Dateien sind technische Steuerdateien, keine zusaetzlichen Anwendungen oder Umgebungen.

## Technik und Uebergabe

Die fuehrenden Frontend-Quellen liegen in `frontend/`. Builds erzeugen getrennte, nicht gegenseitig wiederverwendete Ausgaben:

- `dist/pages/` fuer GitHub Pages,
- `dist/target/` fuer Pre-Integration und Zielbetrieb.

GitHub Actions veroeffentlicht `dist/pages/` direkt. Das Kubernetes-Deployment baut ausschliesslich `dist/target/` und das API-Image; Zielartefakte verwenden `/api`, enthalten keine direkten Supabase-Zugriffe und werden unabhaengig vom Pages-Release freigegeben. Die verbindlichen Profile stehen unter [`config/`](config/README.md), die ausfuehrbaren Zielartefakte unter [`deploy/`](deploy/README.md).

Der Einstieg fuer IT-Kollegen steht in [IT-Uebergabe Zielbetrieb](dokumentation/betrieb-und-deployment/IT_UEBERGABE_ZIELBETRIEB.md). Vertiefend folgen [Deployment-Uebersicht](dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md), [Betrieb](dokumentation/betrieb-und-deployment/BETRIEB.md), [Security](SECURITY.md), [technische Dokumentation](dokumentation/README.md) und [Hinweise zum Mitwirken](CONTRIBUTING.md).

Historische lokale Kontakt- und Arbeitsdateien sind aus dem Hauptstand entfernt. `main` besitzt eine neue, datenschutzbereinigte Historie; alte normale Branches, Tags, Releases, Actions-Laeufe, Artefakte, Caches und Deployment-Datensaetze wurden entfernt und Pages wurde sauber neu veroeffentlicht. Fuer nicht selbst loeschbare GitHub-interne Pull-Request-Refs und alte Pages-Build-Datensaetze bleibt eine Betreiberanfrage erforderlich. Der genaue, bewusst vorsichtige Status steht im [Datenschutz-Bereinigungsnachweis](dokumentation/betrieb-und-deployment/DATENSCHUTZ_BEREINIGUNGSNACHWEIS.md) und im [Datenschutz-Runbook](dokumentation/betrieb-und-deployment/GIT_HISTORY_DATENSCHUTZBEREINIGUNG.md).

Der Quellcode und die technische Dokumentation stehen unter der [Apache License 2.0](LICENSE). Die Demo nutzt fiktive Daten. Fuer echte Daten und externe Inhalte gelten eigene Regeln; mehr dazu steht im [Data Notice](dokumentation/rechtliches/DATA_NOTICE.md).
