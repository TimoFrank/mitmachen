# Dokumentation

Dieser Ordner buendelt die Unterlagen fuer Produktverstaendnis, technische Uebergabe, Betrieb und Weiterentwicklung. Die fuehrenden Frontend-Quellen liegen unter `../frontend/`; generierte Ausgaben sind keine Quellen.

## Einstieg fuer IT-Kollegen

1. [gematik-interner PoC-Durchstich](betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md) fuer Ziel, Grenzen, benoetigte Ressourcen und Erfolgskriterien lesen.
2. [Release-Candidate-Strategie](betrieb-und-deployment/RELEASE_CANDIDATE_STRATEGIE.md) fuer die parallele Arbeit auf `main`, Pages und einem unveraenderlichen PoC-RC lesen.
3. [IT-Uebergabe fuer den gematik-PoC](betrieb-und-deployment/IT_UEBERGABE_ZIELBETRIEB.md) als kurzes Ressourcengespraech verwenden.
4. [Deployment-Uebersicht](betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md) und [Deployment-Einstieg](../deploy/README.md) fuer Artefakt- und Plattformpfade lesen.
5. Bei technischer Umsetzung das [Deployment gematik Kubernetes](betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md), den [API-Vertrag](architektur/API_CONTRACT.md) und die [Sicherheitsrichtlinie](../SECURITY.md) heranziehen.

## Fuehrende Unterlagen fuer den aktuellen PoC

- [gematik-interner PoC-Durchstich](betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md)
- [Release-Candidate-Strategie](betrieb-und-deployment/RELEASE_CANDIDATE_STRATEGIE.md)
- [IT-Uebergabe fuer den gematik-PoC](betrieb-und-deployment/IT_UEBERGABE_ZIELBETRIEB.md)
- [Deployment-Uebersicht](betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md)
- [Architekturentscheidung zur Deployment-Trennung](betrieb-und-deployment/ADR_001_DEPLOYMENT_TRENNUNG.md)
- [Deployment-Checkliste](betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md)
- [Repository-Governance vor PoC und spaeterem Regelbetrieb](betrieb-und-deployment/REPOSITORY_GOVERNANCE.md)
- [Datenschutz-Bereinigungsnachweis](betrieb-und-deployment/DATENSCHUTZ_BEREINIGUNGSNACHWEIS.md)
- [CODEOWNERS - aktiver Uebergangs-Owner](../.github/CODEOWNERS)
- [Dependabot-Konfiguration](../.github/dependabot.yml)
- [OWASP Top 10:2025 – kompakte Risiko- und Mitigationsuebersicht](entwicklung-und-qa/OWASP_TOP_10_2025_KOMPAKTUEBERSICHT.md)

## Spaeterer Pilot- oder Regelbetrieb – nicht PoC-gating

Diese Unterlagen bleiben als Ausbau- und Produktionsreferenz erhalten. Offene
Punkte darin verhindern den befristeten, synthetischen PoC nicht:

- [Zielkonzept gematik Kubernetes](betrieb-und-deployment/GEMATIK_K8S_ZIELKONZEPT.md)
- [Betriebshandbuch](betrieb-und-deployment/BETRIEB.md)
- [Abnahmeprotokoll-Template](betrieb-und-deployment/ABNAHMEPROTOKOLL_TEMPLATE.md)
- [OWASP Top 10:2025 – vollstaendiger Mitigations- und Abnahmenachweis](entwicklung-und-qa/OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md)
- [Betriebsverantwortung/RACI](betrieb-und-deployment/BETRIEBSVERANTWORTUNG_RACI.md)
- [Migration, Cutover und Rollback](betrieb-und-deployment/MIGRATION_CUTOVER_ROLLBACK.md)
- [Supabase nach Cloud SQL: Migrations- und Freigabeplan](betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md)

## Weitere Betriebs- und Historienunterlagen

- [Kurzlebige Administration der IAP-Identity-Bindung](betrieb-und-deployment/PRE_GEMATIK_IDENTITY_ADMIN.md)
- [Befristete Echtdaten-Pilotentscheidung fuer pre-gematik](betrieb-und-deployment/PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md)
- [GCP-Pre-Integration mit GKE Autopilot](betrieb-und-deployment/DEPLOYMENT_GCP_AUTOPILOT.md) - temporaeres Test-Runbook, kein Zielbetriebsstandard
- [Abschaltung des historischen GCP-Cloud-Run-Stacks](betrieb-und-deployment/CLOUD_RUN_ABSCHALTUNG.md) - ausgefuehrter, verifizierter Ablauf mit read-only Plan und Rollbackfenster
- [Spaetere Loeschung des historischen GCP-Cloud-Run-Stacks](betrieb-und-deployment/CLOUD_RUN_LOESCHUNG.md) - gesperrter Folge-Change nach Aufbewahrungsfrist
- [Stabiler Einstieg fuer ausfuehrbare Deployment-Artefakte](../deploy/README.md)

## Fachliche und technische Referenzen

- [Markenarchitektur und Markenkit](produkt-und-design/MARKENARCHITEKTUR.md)
- [Demo und Screenshots](betrieb-und-deployment/DEMO.md)
- [API-Vertrag](architektur/API_CONTRACT.md)
- [Datenmodell](architektur/DATA_MODEL.md)
- [Versorgungs-Netzwerk-Registrierung](architektur/VERSORGUNGS_NETZWERK_REGISTRIERUNG.md)
- [Sicherheitsrichtlinie](../SECURITY.md)
- [Hinweise zum Mitwirken](../CONTRIBUTING.md)
- `../supabase/README.md` fuer geschuetzte Datenbank-, Storage- und Migrationsdetails

## Bereiche

- `architektur/`: API-Vertrag, Datenmodell und Schnittstellenbeschreibungen.
- `betrieb-und-deployment/`: Betriebsmodell, Deployments, Uebergabe und Migration.
- `entwicklung-und-qa/`: Projektzustand, QA-Ablauf und Nachweise.
- `produkt-und-design/`: Markenarchitektur, Designsystem, UX-Leitplanken und UI-Inventar.

## Dokumentationsregel fuer Umgebungen

Die Begriffe sind verbindlich:

- **Lokale Entwicklung:** bewegliche Arbeitsstaende und Feature-Branches; kein freigegebenes Deploymentartefakt.
- **GitHub Pages:** ausschliesslich oeffentliche Demo mit synthetischen Daten; nie Staging oder Realanwendung.
- **`pre-gematik`:** temporaere GCP-Pre-Integration, standardmaessig synthetisch; geschuetzte Echtdaten nur als zeitlich begrenzter Pilot nach den dokumentierten G-01-bis-G-07-Freigaben; nie Produktivbetrieb.
- **gematik-interner PoC:** befristeter Non-Prod-Durchstich aus einem unveraenderlichen RC, ausschliesslich mit synthetischen Daten; keine Produktivfreigabe.
- **Spaeterer Regelbetrieb:** erst nach gesonderter technischer, fachlicher, sicherheitsbezogener und betrieblicher Freigabe durch die zustaendigen Stellen.

Frontend-Buildausgaben sind getrennt: `dist/pages/` gehoert zum Pages-Pfad, `dist/target/` zum Kubernetes-Zielpfad. `target` bezeichnet ein technisches Buildprofil und keine bereits erreichte Produktionsreife. Beide Ausgaben sind reproduzierbar und nicht versioniert; GitHub Actions veroeffentlicht das Pages-Artefakt direkt.
