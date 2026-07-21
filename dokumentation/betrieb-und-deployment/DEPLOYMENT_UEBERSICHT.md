# Deployment-Uebersicht

Status: 19. Juli 2026

Diese Uebersicht ist die fuehrende Abgrenzung der Auslieferungswege. Sie verhindert, dass GitHub Pages als Staging fuer Kubernetes verstanden oder ein Pages-Artefakt in den Zielbetrieb uebernommen wird.

## Kurzentscheidung

- Ein gemeinsames Repository bleibt zulaessig, solange Quellen, Buildausgaben, Konfiguration, Pipelines, Daten und Freigaben getrennt sind.
- GitHub Pages ist ausschliesslich eine oeffentliche Demo mit synthetischen Daten. Es ist weder Realanwendung noch Staging.
- `pre-gematik` ist eine temporaere technische Pre-Integration auf GCP. Sie ist keine Produktivumgebung und definiert keine gematik-Plattformwerte.
- Der Zielbetrieb ist ein interner IT-Service hinter Gateway/SSO mit API im Kubernetes-Namespace und freigegebenen Plattformdiensten.
- Umgebungen werden nicht durch langlebige `pages`-, `gke`- oder `production`-Branches modelliert. Ein Commit wird einmal geprueft; getrennte Artefakte werden ueber getrennte Freigabekanaele ausgeliefert.

Die Entscheidung ist in [ADR 001](ADR_001_DEPLOYMENT_TRENNUNG.md) dokumentiert.

## Architektur- und Umgebungsmatrix

| Dimension | GitHub Pages Demo | `pre-gematik` | gematik Zielbetrieb |
| --- | --- | --- | --- |
| Zweck | Produkt zeigen | Zielvertrag technisch erproben | interner IT-Service |
| Betriebsstatus | aktiv | temporaer, nicht produktiv | Freigabe offen |
| Frontend-Artefakt | `dist/pages/` | `dist/target/` | `dist/target/` |
| Auslieferung | direktes Actions-Artefakt | privates Target-Artefakt | freigegebenes Target-Artefakt |
| Daten | ausschliesslich fiktiv | standardmaessig synthetisch/anonymisiert; Echtdaten-Pilot nur nach den dokumentierten G-01-bis-G-07-Freigaben | nur freigegebene Datenklassen |
| Browser-Datenzugriff | lokaler, speicherbasierter Demo-Adapter | ausschliesslich `/api` | ausschliesslich `/api` |
| Identitaet | anonyme, sichtbare Demo-Identitaet; kein Login | signiertes GCP-IAP-JWT als Pre-Integrationsadapter | OIDC oder gleichwertig signierte/verifizierte Plattformidentitaet; Anbieter offen |
| Backend | kein produktives Backend | Node.js API auf GKE + temporaeres Cloud SQL | Node.js API im Namespace + Shared Postgres |
| Storage | synthetische Demo-Assets | private GCS-Buckets | freigegebener Object Storage, Auspraegung offen |
| Pipeline | Pages-Pipeline | GitHub Actions/WIF | Software Factory/Jenkins, konkrete Anbindung offen |
| Freigabe | Produkt-/Demo-Verantwortung | Pre-Integration-Reviewer | RACI und Change-Verfahren zu bestaetigen |
| SLO/RTO/RPO | keine Zielbetriebszusage | keine Produktivzusage | vor Go-live zu beschliessen |

## Verbindlicher Buildvertrag

```text
frontend/ + public/ + Buildskripte
  |-- Pages-Build  ------> dist/pages/  ------> GitHub Pages
  |
  `-- Target-Build -----> dist/target/ -----> Pre-Integration oder Ziel-Hosting
                              `--------------> Zielaudit und Deployment
```

Regeln:

1. `frontend/` und `public/` sind fuehrende Quellen; `dist/` wird reproduzierbar erzeugt und nicht manuell gepflegt.
2. `dist/pages/` enthaelt dieselbe vollstaendige App-Oberflaeche wie das Target, aber nur die lokale Demo-Runtime, synthetische Daten und oeffentliche Assets; Login, Supabase, externe Fach-APIs und geschuetzte Daten sind ausgeschlossen.
3. `dist/target/` setzt `dataMode: "api"`, im Zieldefault `authMode: "oidc"` und `requireApiGateway: true`; `iap` bleibt dem Pre-GKE-Overlay vorbehalten.
4. `dist/target/` darf keine Supabase-Projekt-URL, keinen Supabase-Key, kein Supabase Browser SDK, keinen direkten Tabellenzugriff und keinen Registrierungsaufruf an Supabase enthalten.
5. Eine versionierte `docs/`-Publish-Kopie existiert nicht mehr. GitHub Actions veroeffentlicht `dist/pages/` direkt.
6. Beide Builds laufen in sauberen Zielordnern. Ein Build darf die Ausgabe des anderen nicht als Eingabe verwenden.
7. API-Image und Target-Frontend erhalten dieselbe Git-Revision beziehungsweise Release-ID und werden als zusammengehoeriges Release nachgewiesen.
8. Zieldeployments verwenden ein unveraenderliches API-Image per Digest oder gleichwertiger, revisionsfester Referenz. Eine erneute Promotion baut den Quellstand nicht neu.

Repo-Kommandos fuer die getrennten Builds:

```bash
npm run build:pages

API_BASE_URL="https://<freigegebener-interner-origin>" \
TARGET_AUTH_MODE=oidc \
npm run build:target
```

`scripts/build_static_frontend.sh` erzwingt die Profil-/Ausgabegrenze und darf nur unter `dist/` schreiben.

## Getrennte Releasekanaele

| Kanal | Trigger und Schutz | Veraendert |
| --- | --- | --- |
| Pages | eigener Workflow und Environment `github-pages` | ausschliesslich Pages-Artefakt/Pages-Veröffentlichung |
| Pre-Integration | eigener Workflow und Environment `pre-gematik` mit Freigabe | ausschliesslich temporaere GCP-Ressourcen und `dist/target/` |
| Zielbetrieb | Software Factory/Jenkins mit Change- und Zielbetriebsfreigabe | freigegebenes Hosting, Namespace und Zielplattformdienste |

Direkte Bot-Commits nach `main` sind kein Zielverfahren fuer Zielbetriebsreleases. Release-Aenderungen sollen als nachvollziehbarer Pull Request oder unveraenderlicher Release-Kandidat geprueft werden. Pages- und Zieldeployment koennen denselben freigegebenen Commit verwenden, bleiben aber unabhaengige Deployments.

## Aktive technische Pfade

### GitHub Pages

Der Pages-Pfad baut `dist/pages/` und uebergibt genau dieses Verzeichnis als GitHub-Actions-Artefakt an GitHub Pages. Er verwendet die gemeinsame Oberfläche aus `frontend/app/` und schaltet ausschließlich fuer Pages `frontend/data/demo-data.js` und `frontend/data/demo-api.js` vor. Der lokale Einstieg ist `dist/pages/`; die eigentliche App liegt unter `dist/pages/versorgungs-kompass.html`.

### GCP-Pre-Integration

Das Runbook [Deployment GCP Autopilot](DEPLOYMENT_GCP_AUTOPILOT.md) beschreibt `pre-gematik`. GKE Autopilot, Cloud SQL, IAP, private Buckets, persoenliche Projektwerte und der persoenliche Break-glass-Zugang sind ausschliesslich temporaere Pre-Integrationsentscheidungen. Aus ihnen folgt keine Vorgabe fuer den Zielbetrieb. Der [Supabase-Cloud-SQL-Migrationsplan](SUPABASE_CLOUD_SQL_MIGRATION.md) ist das zusaetzliche Pflichtverfahren, wenn diese geschuetzte Zwischenumgebung zeitlich begrenzt mit freigegebenen Echtdaten erprobt werden soll.

### gematik Zielbetrieb

Das [Zielkonzept](GEMATIK_K8S_ZIELKONZEPT.md) und das [technische Deployment](DEPLOYMENT_GEMATIK_K8S.md) beschreiben den Zielvertrag: internes Frontend, same-origin `/api`, Kubernetes-API, Shared Postgres, Object Storage, signierte OIDC-/Plattformidentitaet und kontrollierte Software Factory. Konkrete Namen, Regionen, URLs, OIDC-Werte, SLOs, RTO/RPO und Verantwortlichkeiten muessen durch die zustaendigen IT-Stellen bestaetigt werden.

Der stabile Einstieg [deploy/README](../../deploy/README.md) enthaelt die jeweils fuehrenden operativen Artefakte. Es werden keine parallelen Kopien gepflegt.

## Historische Pfade

Die frueheren Cloud-Run-, Cloud-SQL- und IAP-Prototypen wurden aus dem Produkt-Repository entfernt. Unter `archiv/` bleibt nur ein klar markierter, nicht ausfuehrbarer Architekturbeleg fuer den frueheren statischen Frontend-Container. Der IAP-Einsatz in `pre-gematik` ist ein aktueller Pre-Integrationsadapter, aber keine Architekturvorgabe fuer gematik.

Der historische Cloud-Run-Stack wurde am 20. Juli 2026 gemaess [Cloud-Run-Abschalt-Runbook](CLOUD_RUN_ABSCHALTUNG.md) reversibel auf Scaling `0` gesetzt; seine alte Cloud-SQL-Instanz ist gestoppt und loeschgeschuetzt. Der Change hat keine GKE-, Terraform- oder Zielbetriebsressource veraendert. Die endgueltige Bereinigung bleibt ein [separater gesperrter Folge-Change](CLOUD_RUN_LOESCHUNG.md).

## Nachweise pro Zielrelease

Ein Zielrelease soll mindestens festhalten:

- Git-Revision und Release-ID,
- Digest des API-Images,
- Hash oder Manifest des `dist/target/`-Artefakts,
- Ergebnisse von Build, Tests, SAST, Secret Scan, Dependency Scan und Image Scan,
- Helm-Render beziehungsweise Plattform-Deploymentmanifest,
- angewendete Datenbank-Migrationsversion,
- Freigaben gemaess RACI,
- Smoke-Test- und Rollbacknachweis.

Die vollstaendige Abnahme steht in der [Deployment-Checkliste](DEPLOYMENT_CHECKLIST.md). Der organisatorische Einstieg steht in [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md).
