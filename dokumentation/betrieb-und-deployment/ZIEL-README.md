# Zielbetrieb Versorgungs-Kompass

Status: Einstieg fuer IT-Uebergabe; Zielplattform und Betriebsfreigabe offen

Stand: 18. Juli 2026

## In 60 Sekunden

Der Versorgungs-Kompass verbindet Kontakte, Organisationen, Hospitationen und Beobachtungen zu gemeinsam nutzbarem Versorgungswissen. GitHub Pages zeigt ausschliesslich eine oeffentliche Demo mit synthetischen Daten. Die geschuetzte Realanwendung wird als eigenes Target-Frontend intern ausgeliefert. Der Browser spricht nur mit `/api`; eine Node.js API im Kubernetes-Namespace prueft ein signiertes OIDC-/Plattformtoken und Rollen serverseitig und greift auf Shared Postgres sowie privaten Object Storage zu. Releases werden reproduzierbar gebaut, gescannt, unveraenderlich promotet und koennen kontrolliert zurueckgerollt werden. Der Wechsel erfolgt erst nach geklaerten Verantwortlichkeiten, Migrationsgeneralprobe, Restore-Test und gemeinsamem Go/No-Go.

## Die wichtigste Trennung

```text
Oeffentliche Demo
frontend/app/ + frontend/map/ + public/
frontend/data/demo-data.js + demo-api.js -> dist/pages/ -> GitHub Pages

Pre-Integration/Zielbetrieb
dieselbe App-Oberflaeche + API-Runtime -> dist/target/ -> internes Target-Hosting
api/                                  -> Image-Digest -> Helm/Kubernetes
```

- GitHub Pages erhaelt ausschliesslich `dist/pages/`; GKE, Jenkins und Target-Hosting ausschliesslich die Target-Artefakte.
- Beide Frontends verwenden dieselbe Oberflaeche. Pages hat eine anonyme, lokale Demo-Runtime ohne Login oder externes Daten-API; das Target nutzt ausschliesslich geschuetzte API- und Authentisierungspfade.
- GitHub Pages ist kein Staging.
- `pre-gematik` ist keine Produktion.
- Target-Frontend und API-Image bilden ein gemeinsames, revisionsfestes Releasepaar.
- Umgebungen werden durch Pipelines, Konfiguration, Secrets und Freigaben getrennt, nicht durch langlebige Deployment-Branches.

## Umgebungen

| Umgebung | Rolle | Daten | Auth | Betriebsstatus |
| --- | --- | --- | --- | --- |
| GitHub Pages Demo | Produkt zeigen | fiktiv | Demo/keine | aktiv, keine Zielbetriebszusage |
| `pre-gematik` | technische GCP-Pre-Integration | synthetisch/anonymisiert | GCP IAP | temporaer, keine Produktivzusage |
| gematik Zielbetrieb | interner IT-Service | freigegebene Daten | gematik Gateway/SSO | Freigabe offen |

GKE Autopilot, Cloud SQL und IAP gehoeren ausschliesslich zur technischen Stufe `pre-gematik`. Projekt, Domain und Break-glass-/OAuth-Testnutzer werden ueber geschuetzte Umgebungswerte gesetzt und nicht als Zielvorgaben im Repository verankert.

## Zielarchitektur

```text
interne Nutzer
    |
Gateway / SSO / TLS -> signiertes OIDC-/Plattformtoken
    |-- / ----> statisches dist/target/
    `-- /api -> Node.js API im Kubernetes-Namespace
                    |-- Shared Postgres
                    `-- privater Object Storage

Software Factory -> Tests/Scans -> unveraenderliche Artefakte
                 -> Freigabe -> Promotion -> Betrieb/Monitoring
```

Im Target-Browser gibt es keine Supabase-Projekt-URL, keinen Supabase-Key, kein Supabase Auth, kein Supabase Browser SDK und keine direkten Tabellen-/Storage-Zugriffe. Die API prueft Signatur, Issuer, Audience und Claims des Tokens, mappt die Identitaet auf aktive Profile und setzt `viewer`, `editor` und `admin` serverseitig durch. Unsigned `trusted-header`/`sso` ist kein Zieldefault und benoetigt eine ausdrueckliche Plattform-/Security-Ausnahme.

## Bereits vorbereitet

- getrennte Pages- und Target-Buildausgaben,
- API-Container und fachlicher API-Vertrag,
- Helm-Referenzchart mit Digest-Unterstuetzung und Values-Schema,
- Jenkins-Referenzpipeline,
- Target-Konfigurations- und Security-Audits,
- GKE-Autopilot-Pre-Integration mit WIF, IAP, privaten Buckets und synthetischem PostgreSQL-Vertrag,
- versionierte Pre-GKE-Frontend-Releases ueber `releasePrefix`/`contentRevision`,
- Zielpipeline-Staging unter `releases/<git-sha-build>` mit `promotionRequired: true`, bis die IT den realen Hosting-Promotionsmechanismus festlegt,
- Readiness-, Contract-, Runtime- und Smoke-Tests,
- RACI-, Migrations-, Cutover-, Rollback- und Abnahmevorlagen,
- `dependabot.yml` sowie eine aktive `.github/CODEOWNERS` mit bestaetigtem Uebergangs-Owner; institutionelle Teamhandles folgen vor dem Pilotbetrieb.

Der stabile und einzige Einstieg fuer ausfuehrbare Artefakte steht in [deploy/README](../../deploy/README.md). Externe Jenkins-Jobs muessen ihren Script Path einmalig auf `deploy/jenkins/Jenkinsfile.gematik` umstellen; alte Deploymentpfade unter der Dokumentation werden nicht parallel weitergefuehrt.

## Von der IT zu entscheiden

1. Projekt/Namespace, Registry und Plattformpolicies.
2. internes Hosting, Ziel-URL, DNS, TLS und same-origin Routing.
3. Gateway-/SSO-Produkt, OIDC-Issuer, Audience, JWKS, Claims, Tokenweitergabe und Rotation.
4. Shared Postgres, Runtime-/Migrationsrollen, Backup und Restore.
5. Object Storage, Dateipruefung, Retention und Loeschung.
6. Software Factory, Frontend-Promotion, Signierung/Attestierung und Vier-Augen-Freigabe.
7. institutionelle Code Owner, Branchschutz und Changeverfahren.
8. Datenklasse, Pilotumfang und Governance-Freigaben.
9. Monitoring, Logs, Alerts, Service Desk und Eskalation.
10. Servicezeit, SLO, RTO, RPO und Wartungsfenster.
11. RACI, Cutover-Gremium und Abschaltung verbliebener Altzugriffe.

Das vollstaendige Register D-01 bis D-16 steht in [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md).

## Kein voreiliges Serviceversprechen

SLO, RTO, RPO, Supportzeit und Wartungsfenster bleiben offen, bis Fachbereich und IT sie beschlossen und durch Plattform-/Restore-Nachweise plausibilisiert haben. Ein erfolgreicher Pre-Integrationstest ist keine Hochverfuegbarkeits-, Datenschutz- oder Produktivzusage.

## Bereit fuer Migration, wenn

- Zielplattform und Sicherheitsgrenzen bestaetigt sind,
- alle kritischen RACI-Rollen benannt sind,
- Datenklasse und Pilotumfang freigegeben sind,
- Software Factory `dist/target/` und API-Digest reproduzierbar liefert,
- Frontend-Promotion nicht mehr nur als `promotionRequired: true` vorgemerkt, sondern institutionell implementiert ist,
- Gateway, DB, Storage, Monitoring und Service Desk integriert getestet sind,
- Migrationsgeneralprobe und Restore-Probe erfolgreich sind,
- SLO/RTO/RPO und Cutover-/Rollbackkriterien beschlossen sind.

## Betriebsuebernahme abgeschlossen, wenn

- Releasepaar, Migrationsversion und Freigaben nachgewiesen sind,
- Authentisierung, Rollen, Kernpfade und negative Sicherheitstests erfolgreich sind,
- Datenmigration/Reconciliation fachlich unterschrieben ist,
- Monitoring, Alerts, Backup, Restore und Rollback praktisch funktionieren,
- Service Desk, Eskalation, RACI und Hypercare aktiv sind,
- alle frueheren oeffentlichen Realzugriffe abgeschaltet und nur die synthetische Pages-Demo aktiv ist.

Das ausfuellbare [Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md) dokumentiert diesen Nachweis.

Ergaenzende Governance-Artefakte sind [Repository-Governance](REPOSITORY_GOVERNANCE.md), die aktive [CODEOWNERS-Datei](../../.github/CODEOWNERS), die [Dependabot-Konfiguration](../../.github/dependabot.yml) und der [Deployment-Einstieg](../../deploy/README.md). Der eingetragene Uebergangs-Owner nimmt keine institutionelle Team- oder Zielbetriebsfreigabe vorweg.

## Empfohlene Lesereihenfolge

1. [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md) - Pitch, Entscheidungsregister, Definition of Ready/Done.
2. [Deployment-Uebersicht](DEPLOYMENT_UEBERSICHT.md) - Umgebungs- und Buildtrennung.
3. [ADR 001](ADR_001_DEPLOYMENT_TRENNUNG.md) - begruendete Repo-Entscheidung.
4. [Zielkonzept gematik Kubernetes](GEMATIK_K8S_ZIELKONZEPT.md) - fachlich-technische Architektur.
5. [Deployment gematik Kubernetes](DEPLOYMENT_GEMATIK_K8S.md) - Software-Factory-/Kubernetes-Vertrag.
6. [Betriebsverantwortung/RACI](BETRIEBSVERANTWORTUNG_RACI.md) - institutionelle Ownership.
7. [Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md) - sicherer Wechsel.
8. [Betriebshandbuch](BETRIEB.md) und [Deployment-Checkliste](DEPLOYMENT_CHECKLIST.md) - Regelbetrieb und Releaseabnahme.
9. [GCP-Autopilot-Runbook](DEPLOYMENT_GCP_AUTOPILOT.md) - nur fuer die temporaere Pre-Integration.

## Vorgeschlagener naechster Schritt

Im ersten IT-Termin werden nicht alle technischen Details finalisiert. Stattdessen wird fuer jede offene Entscheidung ein institutioneller Owner und ein Zieldatum benannt. Danach folgen Plattform-Workshop, Migrationsgeneralprobe, Betriebsabnahme und ein bewusstes Go/No-Go.
