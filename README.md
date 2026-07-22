<p align="center">
  <img src="dokumentation/assets/readme/versorgungs-kompass-header-v2.svg" alt="#Mitmachen und Versorgungs-Kompass mit den Modulen Versorgung, Stakeholder, Hospitation und Formate" width="100%" />
</p>

<p align="center">
  <a href="https://timofrank.github.io/mitmachen/demo/"><strong>Öffentliche Demo ansehen</strong></a>
  · <a href="dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md">Gematik-PoC</a>
  · <a href="dokumentation/produkt-und-design/MARKENARCHITEKTUR.md">Markenkit</a>
  · <a href="CHANGELOG.md">Änderungshistorie</a>
</p>

<p align="center">
  <a href="README.md"><strong>Überblick</strong></a>
  · <a href="dokumentation/betrieb-und-deployment/DEMO.md">Demo</a>
  · <a href="dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md">Deployment</a>
  · <a href="SECURITY.md">Security</a>
  · <a href="dokumentation/README.md">Dokumentation</a>
</p>

> [!IMPORTANT]
> Die öffentliche Demo arbeitet ausschließlich mit fiktiven Beispieldaten. Verbindliche Informationen zu [#Mitmachen](https://www.gematik.de/mitmachen) und dem [Versorgungs-Netzwerk](https://www.gematik.de/mitmachen/versorgungs-netzwerk) stehen auf gematik.de.

<p align="center">
  <img src="dokumentation/assets/readme/versorgungs-kompass-module-collage-v2.png" alt="Die vier Module Versorgung, Stakeholder, Hospitation und Formate im Versorgungs-Kompass" width="100%" />
</p>

<p align="center"><sub>Vier Module, ein gemeinsamer Arbeitsraum. Sämtliche dargestellten Personen, Organisationen und Fachdaten sind fiktiv.</sub></p>

**Versorgungs-Kompass** verbindet Kontakte, Organisationen, Hospitationen und Formate in einem gemeinsamen Arbeitsraum. So werden regionale Perspektiven sichtbar, Erfahrungen nachvollziehbar und Erkenntnisse für die gemeinsame Arbeit nutzbar.

Die Markenarchitektur ist mehrstufig: **gematik** ist der institutionelle Absender, **#Mitmachen** das Beteiligungsdach und **Versorgungs-Kompass** die Produktmarke. Verbindliche Texte, Logoquellen, Modulfarben und Demo-Begriffe stehen im [Markenkit](dokumentation/produkt-und-design/MARKENARCHITEKTUR.md).

## Funktionsumfang

- **Versorgung sehen:** Karte und Filter zeigen regionale Schwerpunkte, Lücken und Kontakte.
- **Beziehungen verstehen:** Kontakte, Organisationen und Stakeholder bleiben mit ihrem fachlichen Kontext verbunden.
- **Gemeinsam arbeiten:** Profile, Teams, Zuständigkeiten und Aktivitäten machen Beiträge nachvollziehbar.
- **Hospitationen begleiten:** Termine, Kalender und Fragebogen führen von der Vorbereitung bis zur Dokumentation.
- **Wissen aufbauen:** Beobachtungen werden zu Mustern, Hypothesen und Evidenz verdichtet.
- **Nächste Schritte gestalten:** Dashboards, Roundtables und Fachgespräche unterstützen die gemeinsame Arbeit.

## Zugänge und aktueller Stand

| Zugang | Status | Inhalt |
| --- | --- | --- |
| [Öffentliche Demo](https://timofrank.github.io/mitmachen/demo/) | Demo | Produkteinblick mit fiktiven Beispieldaten |
| [#Mitmachen Modulstart](frontend/pages/mitmachen/index.html) | Anwendungsstart | Einstieg in die vier Module |
| [Demo zum Versorgungs-Netzwerk](frontend/pages/mitmachen/versorgungs-netzwerk.html) | Demo | Eigenständige Interaktionsidee ohne Datenübermittlung |
| Gematik-interner Versorgungs-Kompass | PoC in Vorbereitung | Befristeter technischer Durchstich mit SSO, API, Kubernetes und einer kleinen PostgreSQL-Datenbank |

GitHub Pages veröffentlicht die Demo. Der interne PoC wird separat aus einem festgelegten Release Candidate gebaut und übernimmt einen freigegebenen Datenstand aus der geschützten Anwendung. Echtdaten sind weder Teil des Repositories noch der Release-Artefakte. Beide Veröffentlichungswege können unabhängig voneinander weiterentwickelt werden. Der aktuelle PoC-Umfang und die benötigten Ressourcen stehen im [PoC-Durchstich](dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md).

## Repository

```text
.github/                  GitHub Actions, Dependabot und CODEOWNERS
api/                      serverseitige Logik für Pre-Integration und PoC
config/
  pages-demo/             Konfiguration der öffentlichen Demo
  pre-gematik/            Konfiguration der GCP-Pre-Integration
  target/                 Buildprofil für den Gematik-PoC
  security/               Semgrep- und Gitleaks-Konfiguration
deploy/
  helm/                   Kubernetes-Ressourcen
  jenkins/                Referenzpipeline für die Software Factory
  postgres/               Datenbank-Runbooks
  terraform/              GCP-Pre-Integrationsinfrastruktur
dokumentation/            Produkt-, Architektur-, Deployment- und QA-Unterlagen
frontend/                 führende Browser-Quellen
public/                   gemeinsame statische Quellassets
scripts/                  Build-, Test- und Betriebswerkzeuge
supabase/                 Schema, Migrationen und Betriebsnachweise
tests/                    Browser- und Integrationsprüfungen
```

## Build- und Release-Trennung

```text
Pages:   frontend/ + public/ -> dist/pages/  -> GitHub Pages
PoC:     frontend/ + public/ -> dist/target/ -> internes Hosting
API:     api/                -> Image-Digest -> Kubernetes
```

Ein PoC-Release wird durch einen unveränderlichen RC-Tag festgelegt. Weitere Änderungen auf `main`, in lokalen Arbeitsständen oder für GitHub Pages verändern diesen Stand nicht. Ein Fehler wird in einem neuen RC behoben; bestehende Tags und Image-Digests bleiben unverändert.

Öffentliche Produkt-Releases werden freitags automatisiert über [GitHub Releases](https://github.com/TimoFrank/mitmachen/releases) bereitgestellt, sofern seit dem letzten Stand Änderungen vorliegen. Ablauf, Versionsregeln, Artefakte und Benachrichtigung beschreibt der [Produkt-Release-Prozess](dokumentation/betrieb-und-deployment/PRODUKT_RELEASE_PROZESS.md).

Der technische Ablauf des PoC steht im [Deployment-Runbook](dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md). Ausführbare Artefakte sind unter [`deploy/`](deploy/README.md) beschrieben. Weitere Referenzen: [Security](SECURITY.md), [Dokumentationsindex](dokumentation/README.md) und [Mitwirken](CONTRIBUTING.md).

Der Quellcode und die technische Dokumentation stehen unter der [Apache License 2.0](LICENSE). Für Daten und externe Inhalte gelten die Hinweise im [Data Notice](dokumentation/rechtliches/DATA_NOTICE.md).
