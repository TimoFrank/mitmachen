# Deployment-Uebersicht

Status: 21. Juli 2026

Diese Uebersicht ist die fuehrende Abgrenzung der Auslieferungswege. Sie verhindert, dass GitHub Pages als Staging fuer Kubernetes verstanden oder ein Pages-Artefakt in den gematik-PoC uebernommen wird.

Der aktuell angefragte naechste Schritt ist ein befristeter, synthetischer
[gematik-interner PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md), keine
Produktivsetzung. Wie ein stabiler PoC-Stand bei paralleler Weiterentwicklung
gebildet wird, steht in der
[Release-Candidate-Strategie](RELEASE_CANDIDATE_STRATEGIE.md).

## Kurzentscheidung

- Ein gemeinsames Repository bleibt zulaessig, solange Quellen, Buildausgaben, Konfiguration, Pipelines, Daten und Freigaben getrennt sind.
- GitHub Pages ist ausschliesslich eine oeffentliche Demo mit synthetischen Daten. Es ist weder Realanwendung noch Staging.
- `pre-gematik` ist eine temporaere technische Pre-Integration auf GCP. Sie ist keine Produktivumgebung und definiert keine gematik-Plattformwerte.
- Der naechste Zielschritt ist ein kleiner interner PoC hinter Gateway/SSO mit API im Non-Prod-Kubernetes-Namespace und ausschliesslich synthetischen Daten.
- Ein moeglicher spaeterer Regelbetrieb ist eine eigene, derzeit nicht beantragte Freigabestufe.
- Umgebungen werden nicht durch langlebige `pages`-, `gke`- oder `production`-Branches modelliert. Der PoC wird aus einem unveraenderlichen RC-Tag gebaut; `main` und Pages duerfen danach weiterlaufen.

Die Entscheidung ist in [ADR 001](ADR_001_DEPLOYMENT_TRENNUNG.md) dokumentiert.

## Architektur- und Umgebungsmatrix

| Umgebung | Zweck | Artefakt | Daten/Auth | Status |
| --- | --- | --- | --- | --- |
| lokale Entwicklung | Features und Experimente | lokaler Arbeitsstand | lokal/synthetisch | beweglich, kein Release |
| GitHub Pages Demo | Produkt zeigen | `dist/pages/` aus `main` | fiktiv, ohne Ziel-SSO | aktiv, kein Staging |
| `pre-gematik` | GCP-Pre-Integration | `dist/target/` + API-Image | standardmaessig synthetisch, GCP IAP | temporaer, keine Produktivzusage |
| gematik-interner PoC | Infrastruktur-Durchstich | `dist/target/` + API-Image aus festem RC | ausschliesslich synthetisch, OIDC/SSO | naechster Schritt, befristet |
| spaeterer Regelbetrieb | moegliche Produktivstufe | gesondert freigegebenes Releasepaar | freigegebene Daten und Betriebswerte | nicht Teil des aktuellen PoC |

## Verbindlicher Buildvertrag

```text
frontend/ + public/ + Buildskripte
  |-- Pages-Build  ------> dist/pages/  ------> GitHub Pages
  |
  `-- Target-Build -----> dist/target/ -----> Pre-Integration oder PoC-Hosting
                              `--------------> Target-Audit und Deployment
```

Regeln:

1. `frontend/` und `public/` sind fuehrende Quellen; `dist/` wird reproduzierbar erzeugt und nicht manuell gepflegt.
2. `dist/pages/` enthaelt dieselbe vollstaendige App-Oberflaeche wie das Target, aber nur die lokale Demo-Runtime, synthetische Daten und oeffentliche Assets; Login, Supabase, externe Fach-APIs und geschuetzte Daten sind ausgeschlossen.
3. `dist/target/` setzt `dataMode: "api"`, im Zieldefault `authMode: "oidc"` und `requireApiGateway: true`; `iap` bleibt dem Pre-GKE-Overlay vorbehalten.
4. `dist/target/` darf keine Supabase-Projekt-URL, keinen Supabase-Key, kein Supabase Browser SDK, keinen direkten Tabellenzugriff und keinen Registrierungsaufruf an Supabase enthalten.
5. Eine versionierte `docs/`-Publish-Kopie existiert nicht mehr. GitHub Actions veroeffentlicht `dist/pages/` direkt.
6. Beide Builds laufen in sauberen Zielordnern. Ein Build darf die Ausgabe des anderen nicht als Eingabe verwenden.
7. API-Image und Target-Frontend erhalten dieselbe Git-Revision beziehungsweise Release-ID und werden als zusammengehoeriges Release nachgewiesen.
8. PoC-Deployments verwenden ein unveraenderliches API-Image per Digest oder gleichwertiger, revisionsfester Referenz. Eine erneute Bereitstellung baut keinen neueren Quellstand.

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
| gematik-PoC | Software Factory/Jenkins aus unveraenderlichem RC-Tag | befristetes Hosting, Non-Prod-Namespace und kleine Plattformdienste |
| spaeterer Regelbetrieb | gesondertes Change- und Betriebsverfahren | erst nach eigener Freigabe |

Direkte Bot-Commits nach `main` sind kein Verfahren fuer PoC-Releases. Release-Aenderungen sollen als nachvollziehbarer Pull Request oder unveraenderlicher Release Candidate geprueft werden. Pages kann bereits einen neueren `main`-Stand zeigen, waehrend der PoC unveraendert auf seinem RC-Tag und Image-Digest bleibt.

## Aktive technische Pfade

### GitHub Pages

Der Pages-Pfad baut `dist/pages/` und uebergibt genau dieses Verzeichnis als GitHub-Actions-Artefakt an GitHub Pages. Er verwendet die gemeinsame Oberfläche aus `frontend/app/` und schaltet ausschließlich fuer Pages `frontend/data/demo-data.js` und `frontend/data/demo-api.js` vor. Der lokale Einstieg ist `dist/pages/`; die eigentliche App liegt unter `dist/pages/versorgungs-kompass.html`.

### GCP-Pre-Integration

Das Runbook [Deployment GCP Autopilot](DEPLOYMENT_GCP_AUTOPILOT.md) beschreibt `pre-gematik`. GKE Autopilot, Cloud SQL, IAP, private Buckets, persoenliche Projektwerte und der persoenliche Break-glass-Zugang sind ausschliesslich temporaere Pre-Integrationsentscheidungen. Aus ihnen folgt keine Vorgabe fuer den Zielbetrieb. Der [Supabase-Cloud-SQL-Migrationsplan](SUPABASE_CLOUD_SQL_MIGRATION.md) ist das zusaetzliche Pflichtverfahren, wenn diese geschuetzte Zwischenumgebung zeitlich begrenzt mit freigegebenen Echtdaten erprobt werden soll.

### gematik-interner PoC und spaeterer Zielpfad

Fuer den PoC gelten internes Frontend, same-origin `/api`, Kubernetes-API, kleine PostgreSQL-Ressource, signierte OIDC-/Plattformidentitaet und kontrollierte Software Factory. Konkrete Namen, URL und OIDC-Werte werden mit der IT geklaert. Object Storage, Migration, Hochverfuegbarkeit, SLOs und RTO/RPO gehoeren erst zu einem moeglichen spaeteren Ausbau. Das [technische Deployment](DEPLOYMENT_GEMATIK_K8S.md) enthaelt die nutzbaren Build-, Helm-, OIDC- und Smoke-Test-Pfade; das [Zielkonzept](GEMATIK_K8S_ZIELKONZEPT.md) bleibt eine langfristige Referenz.

Der stabile Einstieg [deploy/README](../../deploy/README.md) enthaelt die jeweils fuehrenden operativen Artefakte. Es werden keine parallelen Kopien gepflegt.

## Historische Pfade

Die frueheren Cloud-Run-, Cloud-SQL- und IAP-Prototypen wurden aus dem Produkt-Repository entfernt. Unter `archiv/` bleibt nur ein klar markierter, nicht ausfuehrbarer Architekturbeleg fuer den frueheren statischen Frontend-Container. Der IAP-Einsatz in `pre-gematik` ist ein aktueller Pre-Integrationsadapter, aber keine Architekturvorgabe fuer gematik.

Der historische Cloud-Run-Stack wurde am 20. Juli 2026 gemaess [Cloud-Run-Abschalt-Runbook](CLOUD_RUN_ABSCHALTUNG.md) reversibel auf Scaling `0` gesetzt; seine alte Cloud-SQL-Instanz ist gestoppt und loeschgeschuetzt. Der Change hat keine GKE-, Terraform- oder Zielbetriebsressource veraendert. Die endgueltige Bereinigung bleibt ein [separater gesperrter Folge-Change](CLOUD_RUN_LOESCHUNG.md).

## Minimalnachweise pro PoC-RC

Ein PoC-RC soll mindestens festhalten:

- unveraenderlichen RC-Tag, Git-Revision und Release-ID,
- Digest des API-Images,
- Hash oder Manifest des `dist/target/`-Artefakts,
- Ergebnisse der vereinbarten Build-, Security- und Scan-Gates,
- erfolgreichen Containerstart und `/api/healthz`,
- Helm-Render mit kleinen PoC-Werten,
- Version des synthetischen Schemas/Seeds,
- SSO-, Session-, DB- und synthetischen CRUD-Smoke.

Die kleine Abnahme steht am Anfang der [Deployment-Checkliste](DEPLOYMENT_CHECKLIST.md). Der organisatorische Einstieg ist der [gematik-interne PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md); die [IT-Uebergabe](IT_UEBERGABE_ZIELBETRIEB.md) dient als Gespraechs- und Ticketvorlage.
