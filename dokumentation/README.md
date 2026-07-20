# Dokumentation

Dieser Ordner buendelt die Unterlagen fuer Produktverstaendnis, technische Uebergabe, Betrieb und Weiterentwicklung. Die fuehrenden Frontend-Quellen liegen unter `../frontend/`; generierte Ausgaben sind keine Quellen.

## Einstieg fuer IT-Kollegen

1. [Zielbetriebs-Einstieg](betrieb-und-deployment/ZIEL-README.md) fuer den kompakten Ueberblick lesen.
2. [IT-Uebergabe Zielbetrieb](betrieb-und-deployment/IT_UEBERGABE_ZIELBETRIEB.md) fuer 60-Sekunden-Pitch, Architektur, Entscheidungen und Abnahmerahmen lesen.
3. [Deployment-Uebersicht](betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md) fuer die Trennung von oeffentlicher Demo, Pre-Integration und Zielbetrieb lesen.
4. [Zielkonzept gematik Kubernetes](betrieb-und-deployment/GEMATIK_K8S_ZIELKONZEPT.md) und [technisches Deployment](betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md) fuer die Zielplattform lesen.
5. Zuerst die [kompakte OWASP-Top-10:2025-Uebersicht](entwicklung-und-qa/OWASP_TOP_10_2025_KOMPAKTUEBERSICHT.md) fuer den gemeinsamen Status lesen; danach im [vollstaendigen Mitigations- und Abnahmenachweis](entwicklung-und-qa/OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md) nur nachgewiesene Haken bestaetigen.
6. [Betriebsverantwortung/RACI](betrieb-und-deployment/BETRIEBSVERANTWORTUNG_RACI.md) sowie [Migration, Cutover und Rollback](betrieb-und-deployment/MIGRATION_CUTOVER_ROLLBACK.md) gemeinsam mit den zustaendigen IT-Teams bestaetigen.

## Fuehrende Betriebsunterlagen

- [IT-Uebergabe Zielbetrieb](betrieb-und-deployment/IT_UEBERGABE_ZIELBETRIEB.md)
- [Deployment-Uebersicht](betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md)
- [Architekturentscheidung zur Deployment-Trennung](betrieb-und-deployment/ADR_001_DEPLOYMENT_TRENNUNG.md)
- [Betriebshandbuch](betrieb-und-deployment/BETRIEB.md)
- [Deployment-Checkliste](betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md)
- [Abnahmeprotokoll-Template](betrieb-und-deployment/ABNAHMEPROTOKOLL_TEMPLATE.md)
- [Repository-Governance vor Pilot und Zielbetrieb](betrieb-und-deployment/REPOSITORY_GOVERNANCE.md)
- [Datenschutz-Bereinigungsnachweis](betrieb-und-deployment/DATENSCHUTZ_BEREINIGUNGSNACHWEIS.md)
- [CODEOWNERS - aktiver Uebergangs-Owner](../.github/CODEOWNERS)
- [Dependabot-Konfiguration](../.github/dependabot.yml)
- [OWASP Top 10:2025 – kompakte Risiko- und Mitigationsuebersicht](entwicklung-und-qa/OWASP_TOP_10_2025_KOMPAKTUEBERSICHT.md)
- [OWASP Top 10:2025 – Mitigations- und Abnahmenachweis](entwicklung-und-qa/OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md)
- [Betriebsverantwortung/RACI](betrieb-und-deployment/BETRIEBSVERANTWORTUNG_RACI.md)
- [Migration, Cutover und Rollback](betrieb-und-deployment/MIGRATION_CUTOVER_ROLLBACK.md)
- [Supabase nach Cloud SQL: Migrations- und Freigabeplan](betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md)
- [Befristete Echtdaten-Pilotentscheidung fuer pre-gematik](betrieb-und-deployment/PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md)
- [GCP-Pre-Integration mit GKE Autopilot](betrieb-und-deployment/DEPLOYMENT_GCP_AUTOPILOT.md) - temporaeres Test-Runbook, kein Zielbetriebsstandard
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

- **GitHub Pages:** ausschliesslich oeffentliche Demo mit synthetischen Daten; nie Staging oder Realanwendung.
- **`pre-gematik`:** temporaere GCP-Pre-Integration, standardmaessig synthetisch; geschuetzte Echtdaten nur als zeitlich begrenzter Pilot nach den dokumentierten G-01-bis-G-07-Freigaben; nie Produktivbetrieb.
- **Zielbetrieb:** erst nach technischer, fachlicher, sicherheitsbezogener und betrieblicher Freigabe durch die zustaendigen Stellen.

Frontend-Buildausgaben sind getrennt: `dist/pages/` gehoert zum Pages-Pfad, `dist/target/` zum Kubernetes-Zielpfad. Beide sind reproduzierbar und nicht versioniert; GitHub Actions veroeffentlicht das Pages-Artefakt direkt.
