# Deployment gematik Kubernetes

Status: fuehrende technische Zielbeschreibung; konkrete Software-Factory- und Plattformwerte offen

Stand: 18. Juli 2026

## Zweck und Abgrenzung

Dieses Dokument beschreibt, wie die uebernehmende IT den Versorgungs-Kompass in eine institutionelle Software Factory und einen Kubernetes-Namespace integriert. Es ist kein Runbook fuer GitHub Pages und uebernimmt keine persoenlichen Werte aus der GCP-Pre-Integration.

- GitHub Pages: ausschliesslich synthetische oeffentliche Demo, nicht Realanwendung und nicht Staging.
- `pre-gematik`: temporaerer GKE-Autopilot-/IAP-/Cloud-SQL-Test, nicht Produktion.
- Zielbetrieb: internes Hosting, freigegebenes Gateway/SSO, Kubernetes-API, Shared Postgres und institutioneller Betrieb.

Das fachlich-technische Zielbild steht in [Zielkonzept gematik Kubernetes](GEMATIK_K8S_ZIELKONZEPT.md). Ausfuehrbare Artefakte und ihre Uebergangsorte sind unter [deploy/README](../../deploy/README.md) erklaert.

## Ziel-Deployment

```text
Git Repo
-> Software Factory / Jenkins
-> Checks, Tests und Security Scans
-> dist/target/ + Buildmanifest
-> API-Image + Digest + SBOM/Provenance
-> Artifact Registry
-> Freigabe/Promotion
-> internes Frontend-Hosting + Helm/Kubernetes
-> Gateway/SSO -> /api -> Shared Postgres/Object Storage
```

`dist/pages/` und der gesamte GitHub-Pages-Lieferweg sind nicht Teil dieses Pfads.

## Uebergabegrenze

### Das Repository liefert

- Frontend- und API-Quellen,
- getrennten Target-Build nach `dist/target/`,
- Target-Konfigurations- und Security-Audits,
- API-Container aus `api/Dockerfile`,
- Helm-Referenzchart,
- Jenkins-Referenzpipeline,
- API- und Datenmodellvertraege,
- Migrationsanforderungen, Smoke Tests und Betriebsdokumentation.

### Die Zielplattform liefert oder bestaetigt

- Git-/Software-Factory-Projekt und geschuetzte Releasepfade,
- Artifact Registry und zulässige Image-/Attestierungsverfahren,
- Kubernetes-Namespace, Quoten, Policies und Zugriffe,
- internes Frontend-Hosting, DNS, TLS und Routing,
- Gateway/SSO mit OIDC oder gleichwertig signierter/verifizierter Plattformidentitaet,
- Shared Postgres, Object Storage und Secret Management,
- Logging, Monitoring, Alerting, Backup, Restore und Service Desk,
- Change-, Freigabe-, Incident- und Break-glass-Verfahren.

## Verbindlicher Build- und Releasevertrag

1. `npm ci` installiert exakt den Lockfile-Stand.
2. Repository-, Syntax-, API-, Zielkonfigurations- und relevante Browser-Tests laufen vor dem Artefaktbuild.
3. Der Target-Build schreibt in einen leeren Ordner `dist/target/`.
4. Die Zielkonfiguration setzt `dataMode: "api"`, im Zieldefault `authMode: "oidc"`, die freigegebene API-Basis und `requireApiGateway: true`.
5. Der Target-Audit bricht bei Supabase-URL, Supabase-Key, Supabase Browser SDK, direktem Supabase-Aufruf, Geheimnis oder produktivem Seed/Backup ab.
6. Der API-Container wird einmal gebaut, gescannt und per Digest identifiziert.
7. Target-Frontend, API-Digest, Helm-/Plattformmanifest und Migrationsversion erhalten eine gemeinsame Release-ID.
8. Promotion nutzt dieselben geprueften Artefakte. Ein Umgebungswechsel fuehrt keinen neuen Build aus.
9. Zieldeployment und Pages-Deployment besitzen getrennte Pipelines, Environments und Freigaben.

## Referenzpipeline

Die aktuelle Referenz liegt unter:

```text
deploy/jenkins/Jenkinsfile.gematik
```

Sie bleibt waehrend der Uebergangsphase dort, bis die Software Factory Zielpfade und Code Owner bestaetigt. Fachlich muessen folgende Stufen erhalten bleiben:

1. Checkout einer eindeutigen Revision.
2. `npm ci`.
3. Repository- und Contract-Checks.
4. Dependency Audit, SAST und Secret Scan.
5. relevante Playwright-Smoke-Tests.
6. Target-Build nach `dist/target/` und Target-Audit.
7. API-Image bauen und lokal per Health Check starten.
8. Image Scan, SBOM und Provenance/Attestierung.
9. Push in Registry und Digest-Aufloesung.
10. Helm-Lint/-Render beziehungsweise Plattformvalidierung.
11. kontrollierte Freigabe.
12. Target-Frontend und API-Digest deployen/promoten.
13. Rollout, Gatewaygrenze, Session und fachliche Kernpfade pruefen.
14. Release- und Abnahmenachweis ablegen.

Referenz fuer den Target-Build:

```bash
API_BASE_URL="https://<freigegebener-interner-origin>" \
TARGET_AUTH_MODE=oidc \
npm run build:target

node scripts/audit_public_assets.mjs --artifact-root dist/target
node scripts/audit_api_gateway.mjs \
  --production-config dist/target/data/runtime-config.js
```

Die Referenzpipeline staged das Target-Frontend absichtlich mit `promotionRequired: true`. Dieser Zustand markiert die Uebergabegrenze: Build, Versionierung und Releasepaket sind vorbereitet, die produktive Aktivierung muss aber durch den von der IT festgelegten Hosting-Promotionsmechanismus erfolgen. Die Pipeline darf einen gestagten Release nicht als produktiv veroeffentlicht melden.

Konkrete Jenkins-Libraries, Credentials-IDs und Scanner duerfen an den Plattformstandard angepasst werden. Die Sicherheits- und Nachweisziele bleiben erhalten.

## Benoetigte Software-Factory-Werte

| Semantischer Wert | Zweck | Zielwert |
| --- | --- | --- |
| `ARTIFACT_REGISTRY` | Registry-Pfad fuer API-Image | offen |
| `API_IMAGE_REPOSITORY` | Repository ohne veraenderlichen Tag | offen |
| `FRONTEND_BASE_URL` | interner Origin des Frontends | offen |
| `API_BASE_URL` | same-origin oder freigegebene interne API-Basis | offen |
| `FRONTEND_TARGET` | internes Hostingziel fuer `dist/target/` | offen |
| `K8S_NAMESPACE` | Zielnamespace | offen |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | Shared-Postgres-Verbindung ohne Passwort | offen |
| `DB_PASSWORD_SECRET_NAME` | Referenz auf zentral verwaltetes Secret | offen |
| `API_AUTH_MODE` | serverseitiger Identitaetsadapter | Zieldefault `oidc` |
| `OIDC_ISSUER` | exakt erwarteter Token-Issuer | offen |
| `OIDC_AUDIENCE` | erwartete Audience des Versorgungs-Kompass | offen |
| `OIDC_JWKS_URL` | HTTPS-JWKS fuer Signaturpruefung und Keyrotation | offen |
| `OIDC_EMAIL_CLAIM` | Claim fuer normalisierte E-Mail | offen; Default `email` |
| `OIDC_SUBJECT_CLAIM` | Claim fuer stabilen Nutzer-Identifier | offen; Default `sub` |
| `PROFILE_IMAGE_BUCKET` | privater Storage fuer Profilbilder | offen |
| `CONTACT_IMAGE_BUCKET` | privater Storage fuer Kontaktbilder | offen |
| `CONTACT_NOTE_ATTACHMENT_BUCKET` | privater Storage fuer Anhaenge | offen |

Geheimnisse, private Zertifikate und Tokens stehen weder in Git, Frontend-Artefakt, Buildmanifest noch Klartext-Helm-Values.

Die aktuelle Jenkins-Referenz verwendet fuer den Zieldefault `API_AUTH_MODE=oidc` die Credential-IDs `versorgungs-oidc-issuer`, `versorgungs-oidc-audience` und `versorgungs-oidc-jwks-url`. Das sind Referenznamen, keine freigegebenen Plattformwerte. Die Software Factory darf die IDs an ihren Standard anpassen, muss aber Issuer, Audience und JWKS-URL mit derselben Semantik bereitstellen. Die Claims bleiben standardmaessig `email` und `sub`, bis IAM und Anwendung andere freigegebene Claims vereinbaren.

## Target-Frontend

Verbindliche Eigenschaften:

```js
dataMode: "api",
authMode: "oidc",
apiBaseUrl: "https://<freigegebener-interner-origin>",
requireApiGateway: true
```

`authMode: "oidc"` ist der Target-Default. `authMode: "iap"` bleibt dem GCP-Pre-Integrationsoverlay vorbehalten. Ein unsignierter `trusted-header`-/`sso`-Modus ist nur als dokumentierte und durch Plattform sowie Informationssicherheit freigegebene Ausnahme zulaessig; der Produktionsdefault des Helm-Vertrags laesst ihn nicht zu.

Auslieferung:

- Target-Build nur aus fuehrenden Quellen, nie aus `dist/pages/`.
- vorzugsweise versionierte Releasepraefixe beziehungsweise atomarer Aktivwechsel,
- Cache-Regeln so, dass HTML/Config kontrolliert aktualisiert werden und gehashte Assets lange cachebar bleiben,
- vorherige freigegebene Revision fuer Rollback verfuegbar,
- Hash/Manifest und gemeinsame Release-ID im Abnahmeprotokoll.

In der Uebergangsphase wird das Frontend nur unter `releases/<git-sha-build>` gestaged; `promotionRequired: true` ist im Stagingmanifest verbindlich. Vor Produktivbetrieb ersetzt oder verarbeitet ein institutioneller Promotionsschritt diese Markierung nachvollziehbar; eine manuelle Bucket-Umschaltung ohne Freigabe- und Rollbacknachweis ist kein Zielverfahren.

## API und Runtime-Konfiguration

Die API laeuft aus `api/Dockerfile`. Beispielhafte Semantik, keine freigegebenen Produktivwerte:

```text
PORT=8080
DB_HOST=<shared-postgres-host>
DB_PORT=5432
DB_NAME=<database-name>
DB_USER=<runtime-user>
DB_PASSWORD=<aus Secret Store/Kubernetes Secret>
API_AUTH_MODE=oidc
OIDC_ISSUER=https://<freigegebener-issuer>
OIDC_AUDIENCE=<freigegebene-audience>
OIDC_JWKS_URL=https://<freigegebener-jwks-endpunkt>
OIDC_EMAIL_CLAIM=email
OIDC_SUBJECT_CLAIM=sub
ALLOWED_ORIGIN=https://<frontend-origin>
PROFILE_IMAGE_BUCKET=<private-storage>
CONTACT_IMAGE_BUCKET=<private-storage>
CONTACT_NOTE_ATTACHMENT_BUCKET=<private-storage>
```

Die API-Laufzeitrolle benoetigt DML nur fuer die fachlich erforderlichen Objekte. Sie darf weder Schemaobjekte anlegen/aendern noch Rollen, Extensions oder Backups verwalten.

## Helm-Referenzchart

Aktueller Uebergangspfad:

```text
deploy/helm/versorgungs-kompass
```

Das Chart enthaelt unter anderem API-Deployment, Service, optionale Ingress-/GCP-Adapter, ConfigMap, Secret-Referenz, Probes, Ressourcen und Security Context. Es legt im Zielvertrag keine Shared-Postgres-Datenbank und keinen Ziel-Storage an.

Vor Uebernahme prueft die IT:

- Plattformstandard fuer Ingress/Gateway und TLS,
- OIDC-Issuer/Audience/JWKS/Claims und Sperre unsignierter Produktionsmodi,
- Network Policies und Egressziele,
- Pod Security, Service Accounts und Workload Identity,
- Resource Requests/Limits, Replica-/Autoscalingstrategie und Disruption-Verhalten,
- Secret-Sync-/Rotation und notwendige Rollouts,
- Logs, Metriken, Traces, Alerts und Dashboards,
- Namespace-Quoten, Policies und Deploymentrechte.

Deployment wird per unveraenderlichem Image-Digest oder gleichwertiger revisionsfester Referenz ausgefuehrt. Ein veraenderlicher `latest`-Tag gilt nicht als Abnahmenachweis.

## Gateway-/SSO-Vertrag

Die vorgelagerte Schicht und die API muessen zusammen:

- TLS und interne Zugriffskontrolle durchsetzen,
- ein signiertes OIDC-/Plattformtoken mit festgelegtem Issuer und Audience bereitstellen,
- Signatur ueber den freigegebenen JWKS-Endpunkt sowie Issuer, Audience und Claims in der API pruefen,
- unauthentifizierte Requests vor der Anwendung abweisen,
- API und Frontend nach dem freigegebenen Routingvertrag bereitstellen.

Die API mappt die Identitaet auf `profiles`; unbekannte oder inaktive Profile erhalten `403`. Browserseitige Rollendarstellung ist keine Autorisierung.

Zu testen:

- oeffentlicher beziehungsweise unauthentifizierter Request,
- fehlende/ungueltige Signatur, falscher Issuer, falsche Audience und unbekannter Key,
- gueltige SSO-Identitaet ohne Profil,
- inaktives Profil,
- jede Zielrolle und verbotene Schreibaktion,
- Logout/Sessionablauf gemaess Plattformvertrag.

Falls ausnahmsweise ein unsignierter Trusted-Header-Adapter gefordert wird, benoetigt er eine eigene Architektur-/Security-Freigabe, nachgewiesene Headerbereinigung, eine nicht umgehbare private Vertrauensgrenze und gleichwertige negative Tests. Er ist nicht der vorbereitete Produktionsdefault.

## Shared Postgres und Migration

Shared Postgres wird durch die Plattform bereitgestellt. Das API-Deployment fuehrt keine implizite Produktionmigration beim Pod-Start aus.

Erforderlich sind:

- freigegebene Schema- und Erweiterungsversionen,
- separate Migrations- und Laufzeitrollen,
- TLS/Netzfreigabe und Connection-Management,
- Backup/PITR gemaess beschlossenem RPO,
- praktisch getesteter Restore gemaess beschlossenem RTO,
- versionierte Migrationen mit Review und Ausfuehrungsprotokoll,
- Reconciliation fuer Counts, Constraints und fachliche Stichproben.

Der vollstaendige Ablauf steht in [Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md). Alte Cloud-Run-/Cloud-SQL-Migrationsentwuerfe und das Pre-Integrationsschema sind keine fuehrende Produktionsmigration.

## Deployment-Ablauf

### 1. Validieren

- eindeutige Revision auschecken,
- Tests und Scans ausfuehren,
- `dist/target/` erzeugen und auditieren,
- API-Image bauen, starten und scannen,
- Helm/Plattformmanifest rendern,
- Releasemanifest erzeugen.

### 2. In Abnahme deployen

- exakt freigegebenes Releasepaar verwenden,
- Gateway-, DB-, Storage- und Rollenvertrag testen,
- technische und fachliche Smoke Tests ausfuehren,
- Monitoring-/Alert-Nachweis erzeugen,
- Rollback mit vorherigem Release praktisch testen.

### 3. Freigeben und promoten

- Definition of Ready bestaetigen,
- erforderliche Freigaben gemaess RACI einholen,
- denselben API-Digest und dasselbe Target-Artefakt promoten,
- Datenmigration im freigegebenen Fenster ausfuehren,
- Go/No-Go dokumentieren.

### 4. Nachweisen

- [Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md) ausfuellen,
- Release-ID, Revision, Digest, Artefakt-Hash und Migration festhalten,
- Smoke Tests, Counts, Freigaben und Abweichungen verlinken,
- Hypercare und Legacy-Endzustand nachverfolgen.

## Smoke Tests

Die tatsaechlichen URLs und Authentisierungsmittel folgen dem Plattformvertrag. Mindestens:

```text
GET /api/healthz
GET /api/session
GET /api/ops/checks     (nur gemaess freigegebenem Betriebszugriff)
```

Browserpruefung:

- internes Frontend ist erreichbar,
- SSO funktioniert ohne Supabase Auth,
- keine Supabase-URL, kein Supabase SDK und kein direkter Supabase-Request,
- Kontakte, Organisationen, Profile, Formate, Hospitationen, Stakeholder und Saved Views laden ueber `/api`,
- Rollen und Schreibpfade funktionieren erwartungsgemaess,
- unbekannte/inaktive Nutzer und Viewer-Schreibversuche werden abgewiesen,
- Karte, Auswertung, Datenqualitaet und Dateiabrufe sind plausibel.

## Rollback

- Frontend: vorherige versionierte Target-Revision atomar aktivieren.
- API: vorherigen schema-kompatiblen Digest beziehungsweise Helm-Release aktivieren.
- Datenbank: keine automatische Down-Migration. Restore oder Forward Fix nur nach freigegebenem Datenverfahren.
- Nach produktiven Zielschreibzugriffen: keine blosse Rueckschaltung auf Legacy; zuerst Datenstrategie und Reconciliation entscheiden.

Fuehrend ist [Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md).

## Definition of Ready und Done

Die uebergreifenden Kriterien stehen in [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md). Die [Deployment-Checkliste](DEPLOYMENT_CHECKLIST.md) operationalisiert sie fuer Releases.

## Offene Zielbetriebsentscheidungen

- Software-Factory-Projekt, Registry, Namespace und Zielpfade,
- internes Hosting, URL, DNS, TLS und Routing,
- Gateway-/SSO-Produkt, Header und Account-Lifecycle,
- Shared-Postgres-, Storage- und Secret-Management-Vertrag,
- Image-Signierung, Attestierung, SBOM-Ablage und Promotion,
- Logs, Monitoring, Alerts, Service Desk und Incident-Prozess,
- Datenklasse, Pilotumfang, Retention und Loeschung,
- SLO, RTO, RPO und Wartungsfenster,
- institutionelle Code Owner, Branchschutz und Freigaberegeln.

Diese Punkte werden im Entscheidungsregister der [IT-Uebergabe](IT_UEBERGABE_ZIELBETRIEB.md) gefuehrt und nicht aus `pre-gematik` abgeleitet.
