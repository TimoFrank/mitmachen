# Deployment der GCP-Pre-Integration mit GKE Autopilot

Status: 18. Juli 2026 - temporäre Pre-Integration, ausdrücklich kein Zielbetriebs-Runbook

Dieses Runbook bereitet eine zeitlich begrenzte Umgebung `pre-gematik` vor. Sie erprobt den Anwendungsvertrag mit statischem Frontend, Kubernetes-API, PostgreSQL, Object Storage, Registry und vorgelagerter Identität. Das GitHub-Pages-Deployment bleibt als rein synthetische öffentliche Demo getrennt. GitHub Pages ist kein Staging für diese Umgebung.

> **Übergabehinweis:** GKE Autopilot, Cloud SQL, GCP IAP, die persönliche Domain, das persönliche GCP-Projekt und persönliche Break-glass-/OAuth-Testnutzer sind ausschließlich Adapter der Pre-Integration. Sie sind weder Zielarchitektur noch freigegebene Produktivwerte. Die gematik IT ersetzt sie durch institutionelle Plattformdienste, Konten, Domains und Betriebsverfahren.

## Nicht auf den Zielbetrieb übertragbare Werte

| Pre-Integrationswert | Bedeutung hier | Erforderliche Zielentscheidung |
| --- | --- | --- |
| `GCP_PROJECT_ID` | befristetes Pre-Integrationsprojekt aus dem geschützten Environment | institutionelles Projekt beziehungsweise Plattformmandant |
| `FRONTEND_BASE_URL` | temporärer Test-Origin aus dem geschützten Environment | interne Ziel-URL, DNS und TLS |
| GKE Autopilot | technische Testplattform | freigegebene Kubernetes-Ausprägung |
| Cloud SQL | temporäre PostgreSQL-Implementierung | Shared-Postgres-Vertrag |
| GCP IAP | temporärer Gateway-/Identitätsadapter | gematik Gateway/SSO-Vertrag |
| `IAP_ACCESS_MEMBERS` | temporäre direkte Test-/Break-glass-Nutzer außerhalb des Repositorys | institutionelles Break-glass-Verfahren mit Owner und Audit |
| GitHub Actions Environment `pre-gematik` | Pre-Integrationsfreigabe | Software-Factory-/Change-Verfahren |

Keine dieser Zeilen darf durch bloßes Kopieren der Pre-Integrationskonfiguration als entschieden gelten.

## Ziel und Grenzen

Die Pre-Integration prüft:

- reproduzierbaren Container-Build und Push in Artifact Registry,
- das Helm-Referenzchart, das vor Zielbetrieb durch die Plattformverantwortung abgenommen und angepasst wird,
- GKE Autopilot, Workload Identity und GKE Secret Sync,
- Cloud SQL über private IP und TLS,
- private Cloud-Storage-Buckets,
- IAP als vorgelagerte Identitätsgrenze,
- Rollout, Health Check und Ablehnung gefälschter Identity-Header.

Sie ist keine Produktivumgebung und hat keine Hochverfügbarkeitszusage. `DB_AVAILABILITY_TYPE` steht für diesen persönlichen, kostenbegrenzten Pilot bewusst auf `ZONAL`. Der Umgang mit dem dortigen Datenstand ist in der [persönlichen Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md) dokumentiert. Das Deployment installiert das mitgelieferte Pre-Integration-Schema nicht automatisch, erstellt keine Testnutzer und migriert keine Supabase-Daten.

## Zielbild

```text
GitHub Environment pre-gematik
  -> GitHub OIDC / Workload Identity Federation
  -> Artifact Registry
  -> GKE Autopilot / Helm / gemeinsamer GKE Ingress / IAP
       /api -> Node.js API
       /    -> internes Frontend aus privatem GCS-Bucket
  -> private Cloud-SQL-Instanz
  -> private Daten-Buckets

GitHub Actions
  -> erzeugt statisches dist/target/-Artefakt
  -> synchronisiert genau dieses Artefakt in den privaten Frontend-Bucket
```

`dist/pages/` gehört ausschließlich zum GitHub-Pages-Pfad und wird von dieser Pre-Integration weder gelesen noch verändert. Eine versionierte `docs/`-Publish-Kopie existiert nicht mehr.

Weder ein Service-Account-JSON-Key noch Datenbankpasswort oder OAuth-Credentials liegen in GitHub. GKE Secret Sync liest das Passwort mit der API-Workload-Identity direkt aus Secret Manager und erzeugt das vom Deployment referenzierte Kubernetes Secret. Der Deploy-Workflow liest den getrennten OAuth-Bootstrap ausschließlich aus Secret Manager und materialisiert ihn ohne Inhaltsausgabe. Eine getrennte Frontend-Workload-Identity darf ausschließlich das statische Zielartefakt aus dem privaten Frontend-Bucket lesen.

Die API verbindet sich im Pod mit `127.0.0.1:5432` zum Cloud SQL Auth Proxy. Deshalb ist der lokale PostgreSQL-TLS-Modus `disable`; der Proxy authentifiziert sich per Workload Identity und baut die verschlüsselte private Verbindung zur Cloud-SQL-Instanz auf. Eine direkte unverschlüsselte Netzwerkverbindung der API zur Datenbank ist nicht vorgesehen.

## Repository-Artefakte

| Artefakt | Zweck |
| --- | --- |
| `.github/workflows/deploy-pre-gematik.yml` | manuelles und wiederverwendbares Validate-/Deploy-Workflow |
| `config/pre-gematik/variables.env.example` | vollständige Liste der GitHub-Environment-Variablen ohne Geheimnisse |
| `deploy/terraform/gcp-autopilot/` | GCP-Projektressourcen auf Basis eines vorhandenen, billing-fähigen Projekts |
| `deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml` | GKE-/IAP-/Secret-Sync-Overlay |
| `deploy/postgres/pre-gematik/` | idempotentes PostgreSQL-16-Zwischenschema und lokaler Vertragscheck |
| `api/Dockerfile` | API-Container |
| `scripts/build_static_frontend.sh` | getrennten Target-Build nach `dist/target/` erzeugen |
| `scripts/prepare_target_frontend_config.mjs` | Frontend auf `api` und `iap` umstellen |

Alle Repository-Pfade in diesem Dokument beginnen im Repository-Root.

## Sicherheitsentscheidungen

1. Das GitHub Environment heißt fest `pre-gematik`. Es ist ein zusätzliches Environment neben `github-pages`.
2. Der Deploy-Job erhält `id-token: write`, aber keine langlebigen GCP-Credentials.
3. Der WIF-Provider akzeptiert nur OIDC-Tokens aus `TimoFrank/mitmachen` und dem Environment `pre-gematik`.
4. Artifact Registry verwendet unveränderliche Tags. Der Standardtag enthält Commit, Workflow-Run und Versuch.
5. Alle verwendeten GitHub Actions sind auf konkrete Commit-SHAs festgelegt; Versionskommentare erleichtern kontrollierte Updates.
6. Der Frontend-Sync darf nur auf einen exklusiv für dieses Artefakt bestimmten Bucket zeigen, weil nicht mehr vorhandene Zieldateien gelöscht werden.
7. Das erste Helm-Reconcile verwendet absichtlich eine ungültige, aber nicht leere IAP-Audience. Die API bleibt damit während des Load-Balancer-Bootstraps fail-closed.
8. Der Workflow liest danach den von GKE erzeugten Backend Service, bestimmt dessen numerische ID und setzt die erwartete Audience im Format `/projects/PROJECT_NUMBER/global/backendServices/BACKEND_SERVICE_ID`.
9. Kann die echte Audience nicht bestimmt oder IAP nicht als aktiv bestätigt werden, endet das Deployment fehlerhaft. Es wird kein erfolgreicher Zustand ohne signierte IAP-JWT-Prüfung gemeldet.
10. Ein benannter direkter Nutzer kann ausschließlich in dieser befristeten Pre-Integration projektweiter Break-glass-Zugang sein. Die Identität wird nicht im Repository dokumentiert. Die reguläre Testgruppe wird erst nach eindeutiger Zuordnung ausschließlich an die beiden vom gemeinsamen Ingress erzeugten API- und Frontend-Backend-Services gebunden. Dieser Zugang darf nicht in den Zielbetrieb übernommen werden.

Google beschreibt Workload Identity Federation für Deployment-Pipelines unter <https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines>. Das Format und die Pflicht zur Prüfung der signierten IAP-Header sind unter <https://cloud.google.com/iap/docs/signed-headers-howto> dokumentiert.

## Phase 1: Voraussetzungen

Vor Terraform müssen vorhanden sein:

- ein abrechnungsaktives, ausdrücklich freigegebenes Pre-Integrationsprojekt; dessen ID steht nur im geschützten Environment,
- Berechtigung zum Aktivieren der benötigten APIs und Anlegen der Terraform-Ressourcen,
- Terraform in der vom Scaffold geforderten Version,
- ein privater, versionierter Terraform-State-Bucket, dessen Name beim `terraform init` geschützt übergeben wird,
- ein freigegebener HTTPS-Origin aus `FRONTEND_BASE_URL`,
- Festlegung, welche Google-Nutzer oder -Gruppen über IAP zugreifen dürfen,
- für die Zwischenumgebung eine bewusste Freigabe des mitgelieferten Pre-Integration-Schemas; die historische Datenentscheidung steht in der [persönlichen Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md). Das gematik-Schema bleibt davon getrennt.

Das Frontend wird nicht direkt aus einem öffentlichen Bucket ausgeliefert. Ein Init-Container liest das Zielartefakt per Workload Identity aus dem privaten `FRONTEND_BUCKET` in ein gemeinsames Volume; ein unprivilegierter nginx-Container stellt es intern bereit. Der gemeinsame GKE Ingress routet `/api` zur API und `/` zum Frontend. IAP schützt beide Pfade am selben Origin.

Das persönlich verantwortete Pre-Integrationsprojekt ist nur für diese Zwischenumgebung akzeptabel. Alle neuen Ressourcen tragen `pre-gematik` beziehungsweise `vk-pre-gematik` im Namen. Das bestehende Artifact Registry Repository, eine frühere Demo-Cloud-SQL-Instanz, Demo-Secrets und Default Service Accounts werden nicht wiederverwendet. Die dortige persönliche Datenentscheidung ist nicht auf den gematik-PoC übertragbar.

## Phase 2: Infrastruktur anwenden

```bash
cd deploy/terraform/gcp-autopilot
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config="bucket=<privater-pre-gematik-state-bucket>"
terraform fmt -check
terraform validate
terraform plan -out=pre-gematik.tfplan
terraform apply pre-gematik.tfplan
```

Vor `apply` die Zielwerte in `terraform.tfvars.example` prüfen und als lokale `terraform.tfvars` übernehmen. Insbesondere muss die private Google Group bereits existieren und für IAM sichtbar sein. Sie steht nicht in `IAP_ACCESS_MEMBERS`, sondern wird später vom Workflow an die beiden konkreten Backend Services gebunden. `terraform.tfvars`, Plan-Dateien, State, der reale State-Bucket-Name und lokale Credentials bleiben außerhalb von Git. Das eingecheckte `backend.tf` enthält nur das stabile State-Präfix.

Relevante Outputs:

```bash
terraform output
terraform output -json
```

Der Cluster stellt nur den IAM-geschützten DNS-Control-Plane-Endpunkt bereit. Für Administration und CI ist deshalb zwingend `gcloud container clusters get-credentials ... --dns-endpoint` zu verwenden. Der Deployment-Workflow setzt genau diesen Pfad ein.

### Optionale Kostenwarnung

Wenn `BILLING_ACCOUNT_ID` gesetzt wird, legt Terraform ein auf dieses Projekt gefiltertes Monatsbudget an. Der vorbereitete Standard sind 100 EUR mit Warnungen bei 50, 80 und 100 Prozent Istkosten sowie bei prognostizierten 100 Prozent. `BUDGET_CURRENCY_CODE` muss zur Währung des Billing Accounts passen. Das ausführende Konto benötigt die nötigen Billing-Budget-Rechte.

Ein Cloud-Billing-Budget ist nur eine Warnung und kein hartes Ausgabenlimit. Insbesondere Load Balancer, Cloud NAT, Cloud SQL, Artifact Storage und Autopilot-Workloads können auch nach Erreichen des Schwellwerts weiter Kosten verursachen. Für eine temporäre Umgebung deshalb zusätzlich das Enddatum im Kalender festhalten und den Terraform-Abbau im Abschnitt "Rollback und Ende der vier Wochen" verbindlich einplanen.

## Phase 3: DNS, OAuth und Secret Manager

Die kanonische Domain `versorgungs-kompass.de` bleibt bei ALL-INKL autoritativ. Ihr Apex-A-Record zeigt auf den Terraform-Output `GKE_INGRESS_IP_ADDRESS`; `www.versorgungs-kompass.de` ist ein CNAME auf `versorgungs-kompass.de.`. Es wird keine AAAA-Adresse veröffentlicht, solange der Ingress keine entsprechende statische IPv6-Adresse besitzt. MX-, SPF-, DKIM- und DMARC-Einträge bei ALL-INKL bleiben unverändert. Ein vorhandener Wildcard-Record wird nicht auf den GKE-Ingress umgebogen; nicht benötigte Wildcards werden entfernt, bevor HSTS mit `includeSubDomains` auf der Apex-Domain aktiv wird.

Der Workflow hält während und nach dem Cutover drei getrennte Google Managed Certificates am selben Ingress: `versorgungs-kompass-domain` für Apex und `www`, `versorgungs-kompass-mitmachen` für die bisherige Hauptdomain und `versorgungs-kompass-api` für den älteren Pre-gematik-Host. Im Vorbereitungsmodus bleibt `mitmachen.timo-frank.de` kanonisch und die neuen Hosts leiten dorthin um. Erst nachdem das neue Zertifikat `Active` ist, wechseln `API_BASE_URL` und `FRONTEND_BASE_URL` gemeinsam auf `https://versorgungs-kompass.de`; danach leiten `www` und beide alten Hosts auf den neuen Origin um.

1. Die in `CLOUD_DNS_MANAGED_ZONE` angegebene Zone wird als Data Source gelesen; Terraform hält den A-Record für den bisherigen Legacy-Host aus `PUBLIC_HOSTNAME` auf der reservierten globalen Ingress-IP.
2. Falls eine Subzone verwendet wird, delegiert der zuständige DNS-Betrieb sie einmalig an die von Cloud DNS ausgewiesenen Nameserver. Andere Zonen und Records bleiben unberührt.
3. Delegation und A-Record prüfen, bevor ein aktives Google Managed Certificate erwartet wird.
4. Wenn die Pre-Integration externe Google-Konten benötigt, bleibt die OAuth-Audience bewusst `External / Test`. Support-, Kontakt- und Testnutzer werden nur im geschützten Plattformkontext gepflegt. Eine IAP-Gruppenmitgliedschaft allein kann in diesem Status unzureichend sein; weitere Personen müssen gemäß OAuth-Testnutzerverfahren freigegeben werden. Diese Konfiguration ist ein Testprovisorium und keine Vorlage für Ziel-SSO oder Ziel-Support.
5. Einen dedizierten Web-OAuth-Client anlegen und anschließend die Redirect URI `https://iap.googleapis.com/v1/oauth/clientIds/CLIENT_ID:handleRedirect` eintragen. Client-ID und Client-Secret weder in Git, Terraform-State noch GitHub speichern.
6. Client-ID und Client-Secret liegen als JSON-Objekt mit den beiden nicht leeren String-Feldern `client_id` und `client_secret` in der aktiven Version des bereits angelegten Secret-Manager-Secrets `vk-pre-gematik-iap-oauth-bootstrap`. Der GitHub-Deployer erhält `roles/secretmanager.secretAccessor` nur auf diesem Secret. Der Workflow liest die Version ohne Log-Ausgabe, erstellt oder aktualisiert daraus das Kubernetes Secret `versorgungs-kompass-iap-oauth` mit exakt diesen beiden Keys und löscht seine restriktiv berechtigten Temporärdateien anschließend. Credential-Werte liegen weder in GitHub-Variablen noch in Terraform-State.
7. Einen starken, nur für diese Umgebung genutzten PostgreSQL-Wert erzeugen.
8. Das idempotente Zwischenschema aus `deploy/postgres/pre-gematik/schema.sql` einmal mit `ON_ERROR_STOP` über eine kontrollierte PostgreSQL-16-Administrationsverbindung anwenden.
9. `runtime-role.sql` anwenden und danach `grants.sql` mit der verpflichtenden Variable `runtime_role=vk_app_runtime` ausführen. Damit liegen die Laufzeitrechte ausschließlich auf der festen `NOLOGIN`-Rolle; `PUBLIC` darf im Schema `public` keine Objekte erstellen.
10. Den Cloud-SQL-`BUILT_IN`-User aus `DB_USER` über die Admin-API mit `databaseRoles=[vk_app_runtime]` anlegen. Bei einer vorhandenen Rolle mit `gcloud sql users assign-roles "$DB_USER" --type=BUILT_IN --database-roles=vk_app_runtime --revoke-existing-roles` die Rollenliste auf genau diesen Wert abgleichen; dadurch wird insbesondere eine frühere Cloud-SQL-Administrationsrolle entfernt. Passwort und Request-Body nur aus restriktiv berechtigten Temporärdateien lesen, denselben Passwortwert als Secret-Manager-Version unter `DB_PASSWORD_SECRET_NAME` speichern und die Rollenmitgliedschaft vor dem Deployment abfragen. Die genauen Befehle und Grenzen stehen in `deploy/postgres/pre-gematik/README.md`.
11. Den lokalen Vertragscheck ausführen; er wendet Schema und Laufzeitrolle in einem temporären PostgreSQL-16-Container zweimal an, verbindet sich über ein separates Login-Mitglied, prüft effektive Laufzeit- und fehlende DDL-Rechte und führt einen relationalen Smoke-Test über alle Tabellen aus.
12. Erst danach den vorgesehenen Ausgangsbestand anlegen; der Repository-Seed ist nur eine Testvorlage und wird nicht automatisch ausgeführt. Eine Datenübernahme bleibt ein separater Adminvorgang nach dem [Datenvertrag](SUPABASE_CLOUD_SQL_MIGRATION.md), kein Teil dieses Infrastruktur-Deployments.

Terraform erstellt für die Datenbank bewusst nur das Secret-Objekt, nicht dessen geheime Version, die `NOLOGIN`-Laufzeitrolle oder den eingeschränkten Datenbank-Login. Diese Schritte sind vor dem ersten vollständigen Deployment Pflicht. GKE Secret Sync materialisiert danach das Datenbank-Kubernetes-Secret mit demselben Namen und dem Key `password`. Das separate IAP-OAuth-Bootstrap-Secret existiert bereits außerhalb dieses Terraform-Roots; Terraform verwaltet daran nur die secret-spezifische Leseberechtigung des Deployers.

Bei einer Passwortrotation aktualisiert GKE Secret Sync zwar das Kubernetes Secret, `DB_PASSWORD` wird von der API aber nur beim Pod-Start als Umgebungsvariable gelesen. Nachdem Cloud-SQL-Nutzer und Secret-Manager-Version konsistent aktualisiert wurden, ist deshalb ein kontrollierter Neustart erforderlich:

```bash
kubectl -n pre-gematik rollout restart deployment/versorgungs-kompass-api
kubectl -n pre-gematik rollout status deployment/versorgungs-kompass-api --timeout=10m
```

## Phase 4: GitHub Environment einrichten

Das zusätzliche GitHub Environment `pre-gematik` ist bereits angelegt. Aktueller Schutzstand:

| Einstellung | Ist-Stand |
| --- | --- |
| Deployment-Branches | Custom Policy, ausschließlich `main` |
| Required Reviewer | `TimoFrank` |
| Self-Review | erlaubt (`prevent_self_review=false`), weil derzeit nur ein Maintainer freigeben kann |
| Ziel-URL | wird vom Deploy-Job aus `FRONTEND_BASE_URL` an das GitHub Deployment gemeldet |
| Environment-Secrets | keine GCP-Keys, kein PostgreSQL-Passwort und keine OAuth-Credentials; nur Policy-Pin und geschützte Owner-Profil-ID |
| `github-pages` | unverändert und weiterhin parallel |

Die Environment-Variablen werden erst nach `terraform apply` mit den realen Outputs eingetragen. Wenn später ein zweiter Reviewer zur Verfügung steht, sollte Self-Review deaktiviert werden.

Die Namen stehen in `config/pre-gematik/variables.env.example`. Werte aus Terraform werden wie folgt zugeordnet:

| GitHub-Variable | Quelle |
| --- | --- |
| `GCP_PROJECT_ID` | Terraform-Output `GCP_PROJECT_ID` |
| `GCP_REGION` | Terraform-Output `GCP_REGION` |
| `GKE_CLUSTER_NAME` | Terraform-Output `GKE_CLUSTER_NAME` |
| `GKE_LOCATION` | Terraform-Output `GKE_LOCATION` |
| `WIF_PROVIDER` | Terraform-Output `WIF_PROVIDER` |
| `DEPLOYER_SERVICE_ACCOUNT` | Terraform-Output `DEPLOYER_SERVICE_ACCOUNT` |
| `GAR_REPOSITORY` | vollständiger Terraform-Output `GAR_REPOSITORY`, ohne Image-Namen |
| `FRONTEND_BUCKET` | Terraform-Output `FRONTEND_BUCKET` |
| `DB_NAME` | Terraform-Output `DB_NAME` |
| `DB_USER` | Terraform-Output `DB_USER` |
| `DB_PASSWORD_SECRET_NAME` | Terraform-Output `DB_PASSWORD_SECRET_NAME` |
| `IAP_OAUTH_BOOTSTRAP_SECRET_NAME` | Terraform-Output `IAP_OAUTH_BOOTSTRAP_SECRET_NAME`; enthält nur den Secret-Namen |
| `PROFILE_IMAGE_BUCKET` | Terraform-Output `PROFILE_IMAGE_BUCKET` |
| `CONTACT_IMAGE_BUCKET` | Terraform-Output `CONTACT_IMAGE_BUCKET` |
| `CONTACT_NOTE_ATTACHMENT_BUCKET` | Terraform-Output `CONTACT_NOTE_ATTACHMENT_BUCKET` |
| `STAKEHOLDER_LOGO_BUCKET` | Terraform-Output `STAKEHOLDER_LOGO_BUCKET` |
| `CLOUD_SQL_INSTANCE_CONNECTION_NAME` | Terraform-Output `CLOUD_SQL_INSTANCE_CONNECTION_NAME` |
| `GKE_INGRESS_IP_NAME` | Terraform-Output `GKE_INGRESS_IP_NAME` |
| `K8S_NAMESPACE` | Terraform-Output `K8S_NAMESPACE` |
| `IAP_OAUTH_CLIENT_CREDENTIALS_SECRET_NAME` | fester Kubernetes-Secret-Name `versorgungs-kompass-iap-oauth`; keine Credential-Werte |
| `IAP_RESOURCE_ACCESS_PRINCIPAL` | Terraform-Output `IAP_RESOURCE_ACCESS_PRINCIPAL`; im Zielbetrieb eine Gruppe, im befristeten Einpersonen-Pilot ausnahmsweise der direkt prüfbare Pilot-Owner; nur an die zwei erzeugten Backend Services gebunden |
| `API_BASE_URL` | gemeinsamer HTTPS-Origin; `https://mitmachen.timo-frank.de` nur zur Zertifikatsvorbereitung, danach `https://versorgungs-kompass.de` |
| `FRONTEND_BASE_URL` | exakt derselbe gemeinsame HTTPS-Origin wie `API_BASE_URL` |

`WIF_PROVIDER` ist der volle Ressourcenname mit numerischer Projektnummer. `GAR_REPOSITORY` hat die Form `REGION-docker.pkg.dev/PROJECT/REPOSITORY`. Bucket-Werte enthalten nur den Namen, kein `gs://`. Der Workflow bricht ab, wenn `API_BASE_URL` und `FRONTEND_BASE_URL` nicht exakt denselben Origin bezeichnen oder der Origin außerhalb der beiden freigegebenen Cutover-Zustände liegt.

Zusätzlich liegen zwei geschützte Environment-Secrets vor. `IAP_PROJECT_BREAK_GLASS_SHA256` ist der SHA-256-Pin der kanonisch sortierten, projektweiten IAP-Break-glass-Nutzerliste und kein Zugangswert. `HOSPITATION_IMPORT_OWNER_PROFILE_ID` enthält ausschließlich die stabile produktive Profil-ID von Timo Frank; sie wird nicht im Repository hinterlegt und durch den Workflow in die geschützte API-Konfiguration übernommen. Der Workflow liest die Projekt-IAM-Policy nur als Metadatum, verlangt genau eine unbedingte, ausschließlich aus `user:`-Mitgliedern bestehende Break-glass-Bindung und stoppt bei jeder Mitgliedschaftsänderung. Der Klartext der Nutzerliste wird weder in Git noch in der Actions-Zusammenfassung ausgegeben.

## Phase 5: Workflow ausführen

### Validierung ohne Cloud-Zugriff

In GitHub unter `Actions -> Deploy pre-gematik (GKE Autopilot) -> Run workflow` zuerst ausführen mit:

- `validate_only`: aktiviert; dies ist aus Sicherheitsgründen der Default,
- `image_tag`: leer,
- `require_external_smoke`: deaktiviert.

Die Validierung führt Repository-Checks, Helm-Lint und -Render, Ziel-Frontend-Erzeugung sowie echten Containerstart mit Health Check aus. Sie fordert weder Environment-Freigabe noch GCP-Credentials an.

### Domain-Cutover zu versorgungs-kompass.de

Der Wechsel erfolgt in zwei vollständigen Deployments, damit `mitmachen.timo-frank.de` während der Zertifikatsbereitstellung erreichbar bleibt:

1. `API_BASE_URL` und `FRONTEND_BASE_URL` zunächst auf `https://mitmachen.timo-frank.de` belassen und den Workflow mit `validate_only=false`, `require_external_smoke=false` ausführen. Dieses Vorbereitungsdeployment ergänzt Apex und `www` als Redirect-Hosts und hängt das neue Zertifikat zusätzlich an den Ingress.
2. Bei ALL-INKL den Apex-A-Record auf `GKE_INGRESS_IP_ADDRESS` und `www` als CNAME auf `versorgungs-kompass.de.` setzen. MX- und TXT-Records bleiben unverändert.
3. Warten, bis `kubectl -n pre-gematik get managedcertificate versorgungs-kompass-domain` den Status `Active` für beide Domains meldet. Bis dahin bleibt die alte Domain kanonisch.
4. `API_BASE_URL` und `FRONTEND_BASE_URL` gemeinsam auf `https://versorgungs-kompass.de` ändern und den Workflow erneut mit `validate_only=false`, `require_external_smoke=true` ausführen.
5. Apex muss anschließend die IAP-Grenze erreichen. `www`, `mitmachen.timo-frank.de` und `pre-gematik.versorgungs-kompass.timo-frank.de` müssen Pfad und Query per HTTP 308 auf den neuen Origin übernehmen. Die alten Zertifikate bleiben für diese Redirects aktiv.

### Erstes Deployment

Danach denselben Workflow mit `validate_only` deaktiviert ausführen. Der Deploy-Job:

1. wartet auf die Freigabe des Environments `pre-gematik`,
2. tauscht das GitHub-OIDC-Token per WIF gegen kurzlebige GCP-Credentials und prüft Projekt, Region, Registry, Cloud SQL, private Buckets sowie den gepinnten Break-glass-Sollzustand,
3. verbindet sich über den GKE-DNS-Endpunkt,
4. liest das JSON-formatierte OAuth-Bootstrap-Secret aus Secret Manager ohne Inhaltsausgabe, materialisiert daraus exakt `client_id` und `client_secret` im Kubernetes Secret und validiert dessen Form,
5. baut und pusht ein unveränderlich getaggtes API-Image inklusive Provenance und SBOM,
6. erzeugt `dist/target/` mit `dataMode: "api"`, `authMode: "iap"` und `requireApiGateway: true`,
7. synchronisiert den exklusiven privaten Frontend-Bucket unter ein versioniertes `releasePrefix`; `contentRevision` bindet den Frontend-Rollout an genau diesen unveränderlichen Inhalt,
8. deployt das GCP-Helm-Overlay, übergibt den Frontend-Bucket und wartet auf GKE Secret Sync,
9. ermittelt die reale IAP-Audience, reconciled Helm ein zweites Mal und startet die API kontrolliert neu, damit der per `envFrom` geladene Wert aktiv wird,
10. identifiziert die unterschiedlichen API- und Frontend-Backend-Services anhand ihrer NEGs, bestätigt IAP auf beiden und bindet die reguläre Testgruppe ressourcenspezifisch an genau diese zwei Services,
11. bestätigt per echtem `SELECT 1` im API-Container Cloud SQL Auth Proxy, Workload Identity, DB-Nutzer und Secret sowie Existenz und Leserecht für alle 30 Tabellen des Pre-Integration-Vertrags,
12. bestätigt Rollout, IAP-Aktivierung sowie API- und Frontend-Health,
13. prüft, dass gefälschte, unsignierte IAP-Identity-Header mit HTTP 401 abgewiesen werden.

`require_external_smoke` beim allerersten Lauf deaktiviert lassen, weil DNS und Google Managed Certificate noch konvergieren können. Sobald Zertifikat und DNS aktiv sind, erneut mit aktiviertem externem Boundary-Test für `/` und `/api/healthz` ausführen. Ohne Benutzer- oder Service-Account-IAP-Token ist dies kein Anwendungs-Healthcheck: Eine nicht angemeldete Anfrage muss durch IAP mit 302, 401 oder 403 abgefangen werden; ein öffentliches HTTP 200 gilt als Fehler. Den eigentlichen Healthcheck führt der Workflow clusterintern aus.

### Wiederverwendbarer Aufruf

Ein Workflow in demselben Repository kann die Datei ohne Secrets aufrufen:

```yaml
jobs:
  deploy-pre-gematik:
    permissions:
      contents: read
      id-token: write
    uses: ./.github/workflows/deploy-pre-gematik.yml
    with:
      validate_only: false
      require_external_smoke: true
```

Der aufrufende Workflow kann die Rechte nicht über die im wiederverwendbaren Workflow definierten Rechte hinaus erhöhen. Environment-Werte stammen weiterhin ausschließlich aus `pre-gematik`.

## Abnahmecheckliste

### Infrastruktur

- [ ] Terraform-Plan wurde geprüft und in das richtige GCP-Projekt angewendet.
- [ ] Falls `BILLING_ACCOUNT_ID` gesetzt ist, existiert das projektbezogene Warnbudget; allen Beteiligten ist bekannt, dass es kein Ausgabenlimit ist.
- [ ] GKE nutzt Autopilot, private Nodes und ausschließlich den extern erreichbaren DNS-Control-Plane-Endpunkt.
- [ ] Artifact Registry, Cloud SQL, Secret Manager und alle vier Buckets liegen in der vorgesehenen Region.
- [ ] Der gemeinsame Frontend-/API-DNS-Name zeigt auf `GKE_INGRESS_IP_ADDRESS`.
- [ ] Google Managed Certificate meldet `Active`.
- [ ] Der GKE Ingress routet `/` zum Frontend und `/api` zur API; beide Backends sind durch IAP geschützt.
- [ ] IAP-Zugriff ist nur den benannten Testpersonen oder -gruppen gewährt.
- [ ] Projektweiter IAP-Zugriff enthält nur den Break-glass-Nutzer; die Testgruppe ist separat auf API- und Frontend-Backend-Service gebunden.

### Identität und Secrets

- [ ] Im Repository und in GitHub existiert kein Service-Account-JSON-Key.
- [ ] Der WIF-Provider ist auf Repository und Environment eingeschränkt.
- [ ] `pre-gematik` verlangt Freigabe und beschränkt Deployment-Branches.
- [ ] Secret Manager enthält mindestens eine aktive Passwortversion.
- [ ] `vk-pre-gematik-iap-oauth-bootstrap` enthält gültiges JSON mit nicht leeren `client_id`- und `client_secret`-Strings; der Deployer darf nur dieses Bootstrap-Secret lesen.
- [ ] Für Passwortrotation ist der anschließende API-Rollout dokumentiert und getestet.
- [ ] Der API-Workload-Principal darf nur das benötigte Secret, Cloud SQL und die drei Daten-Buckets verwenden.
- [ ] Der getrennte Frontend-Workload-Principal darf nur das statische Artefakt aus dem Frontend-Bucket lesen.
- [ ] Der GitHub-Deployer darf Registry, Frontend-Bucket, Cluster-Deployment und nur lesend Backend-Service/Projektmetadaten verwenden.

### Anwendung

- [ ] Validate-only-Workflow ist grün.
- [ ] API-Image-Digest und Git-Revision stehen in der Workflow-Zusammenfassung.
- [ ] Helm Release `versorgungs-kompass` ist im Namespace `pre-gematik` deployed.
- [ ] Das Datenbank-Kubernetes-Secret wurde von GKE Secret Sync angelegt; das getrennte OAuth-Kubernetes-Secret wurde vom Workflow ohne Inhaltsausgabe materialisiert und auf exakt zwei Keys geprüft.
- [ ] Der Datenbank-Smoke `SELECT 1` über den Cloud SQL Auth Proxy ist grün.
- [ ] Der Datenbank-Vertragscheck bestätigt alle 30 Pre-Integration-Tabellen und deren Leserecht für den App-Nutzer; ein unvollständiges Schema bricht das Deployment ab.
- [ ] `IAP_JWT_AUDIENCE` entspricht dem tatsächlichen GKE Backend Service.
- [ ] Interner `/api/healthz`-Smoke Test ist grün.
- [ ] Unsigned-Header-Test liefert 401.
- [ ] Externer unauthentifizierter Smoke Test liefert keinen öffentlichen 200-Status.
- [ ] IAP-Login einer freigegebenen Testperson funktioniert.
- [ ] Ein aktives `profiles`-Mapping liefert die erwartete Rolle; unbekannte Personen erhalten 403.
- [ ] Lesen, Anlegen, Ändern und Zurücksetzen eines synthetischen Kontakts funktionieren.
- [ ] Profilbild, Kontaktbild und Notizanhang funktionieren in den jeweils privaten Buckets.
- [ ] Keine echten Kontakt-, Telefon-, E-Mail- oder Gesundheitsdaten wurden verwendet.

## Diagnose

```bash
gcloud container clusters get-credentials "$GKE_CLUSTER_NAME" \
  --project "$GCP_PROJECT_ID" \
  --location "$GKE_LOCATION" \
  --dns-endpoint

kubectl -n pre-gematik get deployment,pod,service,ingress
kubectl -n pre-gematik describe deployment versorgungs-kompass-api
kubectl -n pre-gematik logs deployment/versorgungs-kompass-api --tail=200
kubectl -n pre-gematik get configmap versorgungs-kompass-api \
  -o jsonpath='{.data.IAP_JWT_AUDIENCE}'
helm -n pre-gematik history versorgungs-kompass
```

Keine Secret-Inhalte mit `kubectl get secret -o yaml`, `gcloud secrets versions access` oder Debug-Ausgaben in Tickets und Workflow-Logs kopieren.

## Rollback und Ende der vier Wochen

- API: vorherigen unveränderlichen GAR-Tag erneut deployen oder kontrolliert `helm rollback` verwenden.
- Frontend: eine vorherige Objektgeneration des versionierten Buckets wiederherstellen; API und `dist/target/` immer als zusammengehöriges Release behandeln.
- Datenbank: vor Migrationen und größeren Tests einen Cloud-SQL-Backup-/PITR-Punkt prüfen.
- Nach Abschluss benötigte Testergebnisse exportieren, Testzugriffe entziehen, Deletion Protection bewusst und separat aufheben und die temporären Ressourcen über Terraform abbauen.

Ein Rollback ersetzt weder Schema-Kompatibilitätsprüfung noch Datenwiederherstellung. Bei fehlgeschlagenem Audience-Bootstrap bleibt die API absichtlich fail-closed; zuerst Ingress/IAP korrigieren und den Workflow erneut ausführen.

Nach Ende der Pre-Integration werden persönliche Break-glass-/OAuth-Zugänge, temporäre Gruppenbindungen, GitHub-Environment-Werte und GCP-Ressourcen entzogen beziehungsweise nach dokumentierter Ergebnissicherung abgebaut. Das Ergebnis gilt ausschließlich für den beschriebenen Testumfang.
