# Deployment gematik Kubernetes

> [!NOTE]
> **Einordnung:** Fuer den aktuellen PoC sind die Abschnitte zu Build,
> Target-Frontend, API-Container, Helm, OIDC und Smoke Tests anwendbar. Migration,
> produktive Promotion, Backup/Restore, Servicewerte und Betriebsuebernahme
> beschreiben einen spaeteren Ausbau und sind keine Freigabetore des
> [PoC-Durchstichs](POC_GEMATIK_DURCHSTICH.md).

Status: technische Referenz fuer den PoC; langfristige Plattform- und Betriebswerte offen

Stand: 21. Juli 2026

## Zweck und Abgrenzung

Dieses Dokument beschreibt, wie die IT den Versorgungs-Kompass fuer den ersten befristeten PoC in eine institutionelle Software Factory und einen Kubernetes-Namespace integriert. Es ist kein Runbook fuer GitHub Pages und uebernimmt keine persoenlichen Werte aus der GCP-Pre-Integration. Produktionsnahe Ausbauschritte sind als spaetere Referenz erhalten.

- GitHub Pages: ausschliesslich synthetische oeffentliche Demo, nicht Realanwendung und nicht Staging.
- `pre-gematik`: temporaerer GKE-Autopilot-/IAP-/Cloud-SQL-Test, nicht Produktion.
- gematik-PoC: befristetes internes Hosting, Gateway/SSO, Kubernetes-API und kleine PostgreSQL-Ressource mit synthetischen Daten.
- spaeterer Regelbetrieb: eigene Freigabestufe; nicht Gegenstand des aktuellen Deployments.

Das fachlich-technische Zielbild steht in [Zielkonzept gematik Kubernetes](GEMATIK_K8S_ZIELKONZEPT.md). Ausfuehrbare Artefakte und ihre Uebergangsorte sind unter [deploy/README](../../deploy/README.md) erklaert.

## Ziel-Deployment

```text
Git Repo
-> Software Factory / Jenkins
-> Checks, Tests und Security Scans
-> dist/target/ + Buildmanifest
-> API-Image + Digest + SBOM
-> Artifact Registry
-> Freigabe/Promotion
-> internes Frontend-Hosting + Helm/Kubernetes
-> Gateway/SSO -> /api -> kleine PostgreSQL-Ressource
```

Fachlicher Object Storage wird erst in einem spaeteren Ausbau ergaenzt.

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
- disponiblen synthetischen PoC-Datenbank-Bootstrap, Smoke Tests und
  technische Dokumentation.

### Die Zielplattform liefert oder bestaetigt fuer den PoC

- Git-/Software-Factory-Projekt und geschuetzte Releasepfade,
- Artifact Registry und fuer den PoC zulaessiges Imageverfahren,
- Kubernetes-Namespace, Quoten, Policies und Zugriffe,
- internes Frontend-Hosting, DNS, TLS und Routing,
- Gateway/SSO mit OIDC oder gleichwertig signierter/verifizierter Plattformidentitaet,
- kleine PostgreSQL-Ressource und Secret Management,
- Standard-Containerlogs und technische Ansprechpartner.

Object Storage fuer Nutzdaten, zentrales Alerting, Backup-/Restore-Proben,
Service Desk und vollstaendige Change-/Incident-Verfahren gehoeren erst zu einem
moeglichen spaeteren Ausbau.

## Verbindlicher Build- und Releasevertrag

1. `npm ci` installiert exakt den Lockfile-Stand.
2. Repository-, Syntax-, API-, Zielkonfigurations- und relevante Browser-Tests laufen vor dem Artefaktbuild.
3. Der Target-Build schreibt in einen leeren Ordner `dist/target/`.
4. Die Zielkonfiguration setzt `dataMode: "api"`, im Zieldefault `authMode: "oidc"`, die freigegebene API-Basis und `requireApiGateway: true`.
5. Der Target-Audit bricht bei Supabase-URL, Supabase-Key, Supabase Browser SDK, direktem Supabase-Aufruf, Geheimnis oder produktivem Seed/Backup ab.
6. Der API-Container wird einmal gebaut, gescannt und per Digest identifiziert.
7. Target-Frontend, API-Digest, Helm-/Plattformmanifest sowie Schema- und
   Seed-Digests erhalten eine gemeinsame Release-ID.
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
8. Image Scan und SBOM; optionale Plattform-Attestierung nur, wenn der
   vorhandene Software-Factory-Standard sie ohne neuen PoC-Sonderprozess liefert.
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

node scripts/audit_target_assets.mjs --artifact-root dist/target
node scripts/audit_api_gateway.mjs \
  --production-config dist/target/data/runtime-config.js
```

Die Referenzpipeline staged das Target-Frontend absichtlich mit `promotionRequired: true`. Dieser Zustand markiert die Uebergabegrenze: Build, Versionierung und Releasepaket sind vorbereitet, die PoC-Aktivierung muss aber durch den von der IT festgelegten Hosting-Mechanismus erfolgen. Die Pipeline darf einen gestagten Release nicht als bereitgestellt melden.

Konkrete Jenkins-Libraries, Credentials-IDs und Scanner duerfen an den Plattformstandard angepasst werden. Die Sicherheits- und Nachweisziele bleiben erhalten.

Der Jenkins-Agent muss durch den Plattformstandard bereits fuer die ausgewaehlte
Registry authentisiert sein, etwa ueber Credential Helper, Robot Account oder
Workload Identity. Die Referenzpipeline fuehrt bewusst keinen
registryspezifischen Login aus und liest den unveraenderlichen Digest nach dem
Push aus Dockers `RepoDigests` aus. Nur das optionale `gs://`-Frontend-Staging
ist weiterhin ein ausdruecklich gekennzeichneter GCP-Adapter.

## Benoetigte Software-Factory-Werte

| Semantischer Wert | Zweck | Zielwert |
| --- | --- | --- |
| `ARTIFACT_REGISTRY` | Registry-Pfad fuer API-Image | offen |
| `API_IMAGE_REPOSITORY` | Repository ohne veraenderlichen Tag | offen |
| `FRONTEND_BASE_URL` | interner Origin des Frontends | offen |
| `API_BASE_URL` | same-origin oder freigegebene interne API-Basis | offen |
| `FRONTEND_TARGET` | internes Hostingziel fuer `dist/target/` | offen |
| `K8S_NAMESPACE` | Zielnamespace | offen |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | dedizierte, disponible PoC-Datenbank ohne Passwort | offen |
| `database.sslCaSecretName`, `database.sslCaSecretKey` | optionales Kubernetes-Secret mit PostgreSQL-CA | leer bei System-Truststore |
| `database.sslServerName` | optionaler TLS-Servername, falls abweichend von `DB_HOST` | offen |
| `DB_PASSWORD_SECRET_NAME` | Referenz auf zentral verwaltetes Secret | offen |
| `API_AUTH_MODE` | serverseitiger Identitaetsadapter | Zieldefault `oidc` |
| `OIDC_ISSUER` | exakt erwarteter Token-Issuer | offen |
| `OIDC_AUDIENCE` | erwartete Audience des Versorgungs-Kompass | offen |
| `OIDC_JWKS_URL` | HTTPS-JWKS fuer Signaturpruefung und Keyrotation | offen |
| `OIDC_EMAIL_CLAIM` | Claim fuer normalisierte E-Mail | offen; Default `email` |
| `OIDC_SUBJECT_CLAIM` | Claim fuer stabilen Nutzer-Identifier | offen; Default `sub` |
| `PROFILE_IMAGE_BUCKET` | privater Storage fuer Profilbilder | im PoC leer; spaeter offen |
| `CONTACT_IMAGE_BUCKET` | privater Storage fuer Kontaktbilder | im PoC leer; spaeter offen |
| `CONTACT_NOTE_ATTACHMENT_BUCKET` | privater Storage fuer Anhaenge | im PoC leer; spaeter offen |

Der erste PoC setzt diese drei Werte leer und laesst beide Uploadmodi deaktiviert.
Die folgenden Storage-Regeln gelten erst, wenn ein spaeterer Pilot Uploads
ausdruecklich aufnimmt: Die drei semantischen Werte verlangen dann nicht
zwingend drei physische Buckets. Stellt die Zielplattform genau einen privaten
Anwendungs-Bucket bereit, duerfen alle drei Werte auf denselben Bucket zeigen;
die Anwendung trennt Profilbilder, Kontaktbilder und Anhaenge ueber disjunkte
Objektpfade. Aufbewahrung, Verschluesselung, Malware-Pruefung, Quoten und
Berechtigungen muessen dann fuer den gemeinsamen Bucket beziehungsweise ueber
freigegebene Praefixregeln passen.

Der Frontend-Artefaktpfad darf dadurch keinen pauschalen Lesezugriff auf die privaten Uploads erhalten. Bei nur einem fachlichen Daten-Bucket wird das Frontend deshalb ueber den vorgesehenen Plattform-Host, einen getrennten Artefaktbereich mit wirksamer Praefixberechtigung oder ein freigegebenes Frontend-Containerverfahren ausgeliefert.

Geheimnisse, private Zertifikate und Tokens stehen weder in Git, Frontend-Artefakt, Buildmanifest noch Klartext-Helm-Values.

Die aktuelle Jenkins-Referenz verwendet fuer den Zieldefault `API_AUTH_MODE=oidc` die Credential-IDs `versorgungs-oidc-issuer`, `versorgungs-oidc-audience` und `versorgungs-oidc-jwks-url`. Das sind Referenznamen, keine freigegebenen Plattformwerte. Die Software Factory darf die IDs an ihren Standard anpassen, muss aber Issuer, Audience und JWKS-URL mit derselben Semantik bereitstellen. Die Claims bleiben standardmaessig `email` und `sub`, bis IAM und Anwendung andere freigegebene Claims vereinbaren.

`FRONTEND_BUCKET_URI` ist in der Jenkins-Referenz optional. Ohne Wert archiviert
Jenkins `dist/target/` samt Manifest und Fingerprint als PoC-Buildartefakt. Nur
wenn ausdruecklich eine `gs://`-URI gesetzt wird, nutzt die Referenz das
versionierte GCS-Staging. Das neutrale gematik-PoC-Setup benoetigt keinen
GCS-Bucket.

## Target-Frontend

Verbindliche Eigenschaften:

```js
dataMode: "api",
authMode: "oidc",
apiBaseUrl: "https://<freigegebener-interner-origin>",
requireApiGateway: true
```

`authMode: "oidc"` ist der Target-Default. `authMode: "iap"` bleibt dem GCP-Pre-Integrationsoverlay vorbehalten. Ein unsignierter `trusted-header`-/`sso`-Modus ist nur als dokumentierte und durch Plattform sowie Informationssicherheit freigegebene Ausnahme zulaessig; der Target-Default des Helm-Vertrags laesst ihn nicht zu.

Auslieferung:

- Target-Build nur aus fuehrenden Quellen, nie aus `dist/pages/`.
- vorzugsweise versionierte Releasepraefixe beziehungsweise atomarer Aktivwechsel,
- Cache-Regeln so, dass HTML/Config kontrolliert aktualisiert werden und gehashte Assets lange cachebar bleiben,
- vorherige freigegebene Revision fuer Rollback verfuegbar,
- Hash/Manifest und gemeinsame Release-ID im Abnahmeprotokoll.

Die Jenkins-Referenz kann das Frontend unter `releases/<git-sha-build>` stagen;
`promotionRequired: true` markiert dann die Uebergabegrenze. Fuer den ersten PoC
darf die Software Factory `dist/target/` stattdessen als unveraenderliches
Buildartefakt an das vorhandene statische Hosting uebergeben. Eine GCS-spezifische
Stagingloesung ist keine PoC-Voraussetzung.

## API und Runtime-Konfiguration

Die API laeuft aus `api/Dockerfile`. Beispielhafte Semantik, keine freigegebenen Produktivwerte:

```text
PORT=8080
DB_HOST=<poc-postgres-host>
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

Das Chart enthaelt unter anderem API-Deployment, Service, optionale
Ingress-/GCP-Adapter, ConfigMap, Secret-Referenzen, einen optionalen
PostgreSQL-CA-Mount, Probes, Ressourcen und Security Context. Es legt selbst
keine PostgreSQL-Datenbank und keinen Ziel-Storage an.

Fuer den PoC bestaetigt die IT nur die unmittelbar benoetigten
Plattformdefaults:

- Plattformstandard fuer Ingress/Gateway und TLS,
- OIDC-Issuer/Audience/JWKS/Claims und Sperre unsignierter Modi,
- vorhandene Network Policies, Pod Security und Service-Account-Vorgaben,
- die kleinen Resource Requests/Limits aus dem PoC-Overlay; kein HPA/PDB,
- Secret-Injection und Standard-Containerlogs,
- Namespace-Quoten, Policies und Deploymentrechte.

Eine eigene Autoscalingstrategie, Traces, Alerts, Dashboards,
Secret-Rotationsprozesse und besondere Disruption-Regeln werden fuer diesen
Durchstich nicht ausgearbeitet. Sie gehoeren bei Bedarf zum spaeteren Ausbau.

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

Falls ausnahmsweise ein unsignierter Trusted-Header-Adapter gefordert wird,
benoetigt er eine eigene Architektur-/Security-Entscheidung, nachgewiesene
Headerbereinigung, eine nicht umgehbare private Vertrauensgrenze und
gleichwertige negative Tests. Er ist nicht der vorbereitete PoC-Default.

## PostgreSQL fuer den aktuellen PoC

Die Plattform stellt eine **dedizierte kleine Datenbank** bereit, deren
`public`-Schema fuer diesen PoC vollstaendig kontrolliert, verworfen und neu
aufgebaut werden darf. Ein beliebiges separates Schema in einer gemeinsam
genutzten Bestandsdatenbank reicht derzeit nicht aus, weil API und SQL-Vertrag
fest `public.*` verwenden.

Der einmalige, manuelle Ablauf steht im
[PoC-Datenbank-Bootstrap](../../deploy/postgres/poc-gematik/README.md):

1. Schema, `NOLOGIN`-Runtime-Rolle und explizite Grants anwenden,
2. ausschliesslich `pre-gematik-synthetic-v1` einspielen,
3. zwei bis fuenf OIDC-Subjects an die vorgesehenen synthetischen Profile binden,
4. erst danach API-Readiness, Login sowie einen Lese- und Schreibpfad pruefen.

Der Owner-/Bootstrap-Zugang ist kein Laufzeit-Secret der Anwendung. Die
Runtime-Rolle besitzt kein DDL-Recht. Bei direkter PostgreSQL-Verbindung bleibt
`verify-full` aktiv. Entweder liegt die Plattform-CA bereits im
System-Truststore oder die IT setzt `database.sslCaSecretName`,
`database.sslCaSecretKey` und bei Bedarf `database.sslServerName` im
Plattform-Overlay.

Der API-Pod fuehrt keinen Bootstrap beim Start aus. Fuer diesen disponiblen,
rein synthetischen Bestand sind Bestandsmigration, Backup-/Restore-Generalprobe,
PITR und Reconciliation **keine PoC-Freigabetore**.

## Deployment-Ablauf fuer den ersten PoC

### 1. Plattformgrundlage klaeren

- Namespace, Registry, statisches Hosting, same-origin URL und OIDC festlegen,
- dedizierte PoC-Datenbank, TLS-Vertrauen, Secrets und Logs bereitstellen,
- End-, Review- oder Verlaengerungstermin festhalten.

### 2. Release Candidate validieren

- exakt einen annotierten `poc-v<semver>-rc.<n>`-Tag auschecken,
- `npm run check:poc-rc`, Scans und den vereinbarten Desktop-Smoke ausfuehren,
- `dist/target/` erzeugen und auditieren,
- API-Image bauen, als Non-Root-Container starten, scannen und per Digest fixieren,
- Helm-Manifest mit dem PoC-Overlay rendern,
- Releasemanifest mit Tag, SHA, Digests und Testergebnissen erzeugen.

### 3. Disponible Datenbank vorbereiten

- Bootstrap-Runbook mit kontrollierter Owner-Verbindung anwenden,
- synthetische Seed-Version und Testbindungen dokumentieren,
- Owner-Zugang wieder aus dem Ausfuehrungskontext entfernen.

### 4. Bereitstellen und nachweisen

- exakt das gepruefte Releasepaar deployen,
- Gateway/SSO, `/api/healthz`, `/api/readyz` und `/api/session` pruefen,
- einen synthetischen Lese- und Schreibpfad ausfuehren,
- denselben RC erneut bereitstellen oder dessen Reproduzierbarkeit nachweisen,
- Ergebnis, Abweichungen und Ende/Verlaengerung der Umgebung kurz festhalten.

## Spaeterer Ausbau – nicht PoC-gating

Bestandsmigration, HA, Backup/PITR, Restore-Probe, ausgearbeitete
SLO/RTO/RPO, vollstaendiges Monitoring/Alerting, RACI-Freigaben, produktive
Promotion, Cutover, Rollback-Generalprobe und Hypercare werden erst fuer einen
moeglichen spaeteren Pilot- oder Regelbetrieb bewertet. Die Referenzen dazu sind
[Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md),
[Betrieb](BETRIEB.md) und
[Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md).

## Smoke Tests

Die tatsaechlichen URLs und Authentisierungsmittel folgen dem Plattformvertrag. Mindestens:

```text
GET /api/healthz
GET /api/readyz
GET /api/session
```

Browserpruefung:

- internes Frontend ist erreichbar,
- SSO funktioniert ohne Supabase Auth,
- keine Supabase-URL, kein Supabase SDK und kein direkter Supabase-Request,
- ein vereinbarter synthetischer Kernbestand laedt ueber `/api`,
- mindestens eine Lese- und eine Schreibrolle funktionieren erwartungsgemaess,
- unbekannte/inaktive Nutzer und Viewer-Schreibversuche werden abgewiesen,
- keine Upload- oder Echtdatenpfade sind aktiviert.

## Abbruch und Wiederholung im PoC

- Frontend und API: unveraendertes RC-Artefakt erneut bereitstellen oder die
  befristete Umgebung entfernen.
- Datenbank: bei inkonsistentem Bootstrap die disponible PoC-Datenbank verwerfen
  und nach Runbook neu aufbauen; keine Echtdaten muessen gerettet werden.
- Ein neuer Codefix erhaelt einen neuen RC-Tag; ein vorhandener Tag oder Digest
  wird nicht verschoben.

Ein produktionsnahes Rollbackverfahren ist erst Teil eines spaeteren Ausbaus.

## Definition of Ready und Done

Die uebergreifenden PoC-Kriterien stehen im [PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md) und in der [IT-Uebergabe](IT_UEBERGABE_ZIELBETRIEB.md). Die [Deployment-Checkliste](DEPLOYMENT_CHECKLIST.md) operationalisiert sie fuer Releases.

## Spaetere Zielbetriebsentscheidungen – nicht PoC-gating

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
