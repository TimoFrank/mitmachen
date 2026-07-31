# Deployment der GCP-Pre-Integration mit GKE Autopilot

Status: 18. Juli 2026 - temporäre Pre-Integration, ausdrücklich kein Zielbetriebs-Runbook

Dieses Runbook bereitet eine zeitlich begrenzte Umgebung `pre-gematik` vor. Sie erprobt den Anwendungsvertrag mit statischem Frontend, Kubernetes-API, PostgreSQL, Object Storage, Registry und vorgelagerter Identität. Das GitHub-Pages-Deployment bleibt als öffentliche Demo mit synthetischen CRM-/Fachdaten und kuratiertem Bundestags-Snapshot getrennt. GitHub Pages ist kein Staging für diese Umgebung.

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
       Apex /, Identity-Portal und freigegebene Assets (Exact) -> minimales öffentliches Einstiegs-/Identity-Frontend
       Apex /__/auth/ (Prefix)                                -> tokenloser, fester Firebase-Auth-Helper-Proxy
       www / (Exact)                                         -> öffentliches Einstiegs-Frontend
       /api (Prefix)                                         -> IAP-geschützte Node.js API
       / (Prefix/Catch-all, auch übrige Alias-Pfade)          -> IAP-geschütztes vollständiges Frontend
  -> private Cloud-SQL-Instanz
  -> private Daten-Buckets

GitHub Actions
  -> erzeugt statisches dist/target/-Artefakt
  -> synchronisiert genau dieses Artefakt in den privaten Frontend-Bucket
```

`dist/pages/` gehört ausschließlich zum GitHub-Pages-Pfad und wird von dieser Pre-Integration weder gelesen noch verändert. Eine versionierte `docs/`-Publish-Kopie existiert nicht mehr.

Weder ein Service-Account-JSON-Key noch Datenbankpasswort oder OAuth-Credentials liegen in GitHub. GKE Secret Sync liest das Passwort mit der API-Workload-Identity direkt aus Secret Manager und erzeugt das vom Deployment referenzierte Kubernetes Secret. Der Deploy-Workflow liest den getrennten OAuth-Bootstrap ausschließlich aus Secret Manager und materialisiert ihn ohne Inhaltsausgabe. Eine getrennte Frontend-Workload-Identity darf ausschließlich das statische Zielartefakt aus dem privaten Frontend-Bucket lesen. Der öffentliche Einstieg nutzt dagegen eine eigene Kubernetes Service Account ohne Cloud-IAM-Bindung und eine NetworkPolicy ohne Egress. Der zusätzliche Auth-Helper-Proxy besitzt ebenfalls eine eigene tokenlose Kubernetes Service Account ohne Cloud-IAM-Bindung oder Secretzugriff; seine NetworkPolicy erlaubt ausgehend nur DNS und HTTPS zum festen, TLS-verifizierten Upstream.

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
9. Kann die echte Audience nicht bestimmt oder IAP nicht auf API und vollständigem Frontend als aktiv bestätigt werden, endet das Deployment fehlerhaft. Es wird kein erfolgreicher geschützter Anwendungszustand ohne signierte IAP-JWT-Prüfung gemeldet.
10. Ein benannter direkter Nutzer kann ausschließlich in dieser befristeten Pre-Integration projektweiter Break-glass-Zugang sein. Die Identität wird nicht im Repository dokumentiert. Die reguläre Testgruppe wird erst nach eindeutiger Zuordnung ausschließlich an die beiden vom gemeinsamen Ingress erzeugten geschützten API- und Frontend-Backend-Services gebunden. Public-Entry- und Auth-Helper-Backend besitzen keine IAP-Resource-Policy. Das Public-Entry-Image enthält ausschließlich den geprüften Einstieg, die zwei gebrandeten Identity-Seiten und deren exakt allowlistete lokale Assets. Der Auth-Helper ist ein token- und secretfreier Festziel-Proxy ohne Zugriffslogging. Diese Zugänge dürfen nicht in den Zielbetrieb übernommen werden.

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

Das vollständige Frontend wird nicht direkt aus einem öffentlichen Bucket ausgeliefert. Ein Init-Container liest das Zielartefakt per Workload Identity aus dem privaten `FRONTEND_BUCKET` in ein Volume; ein unprivilegierter nginx-Container stellt es ausschließlich hinter IAP bereit. Der öffentliche Einstieg läuft in einem getrennten, digest-gepinnten Container-Image, dessen Webroot beim Build nachweislich exakt zehn Dateien enthält: den Einstieg, zwei gebrandete Identity-Seiten, deren sechs lokale Konfigurations-/Code-/Style-/Markenassets sowie das für Teams- und WhatsApp-Vorschauen freigegebene PNG. Dieser Pod besitzt weder GCS-Zugriff noch ausgehenden Netzwerkzugriff. nginx liefert nur die explizit gerouteten GET-/HEAD-Pfade aus: Apex `/`, `/anmelden`, `/konto/passwort-festlegen`, sechs exakte `/public/auth/…`-Assets und das Share-PNG. Auf `www.versorgungs-kompass.de` ist nur Exact `/` öffentlich. Alle anderen `www`-Pfade und sämtliche Catch-alls der übrigen Alias-Hosts bleiben beim IAP-geschützten Frontend; codierte oder normalisierte Alias-Pfade enden mit 404 oder an IAP.

Zusätzlich veröffentlicht der Ingress ausschließlich am Apex und vor dem
geschützten Catch-all den Prefix `/__/auth/` auf einem vierten, dedizierten
Backend. Dessen unprivilegierter nginx akzeptiert nur GET, HEAD und POST,
allowlistet minimale Request-Header, entfernt Cookies, Authorization- und
IAP-Identity-Header und leitet Pfad und Query ohne
Redirect an den festen HTTPS-Upstream
`steam-capsule-341212.firebaseapp.com` weiter. SNI, Zertifikatsprüfung und
TLS 1.2/1.3 sind erzwungen; nginx- und Backend-Zugriffslogging sind
deaktiviert. Ein Upstream-`Set-Cookie`-Header wird nicht auf den gemeinsamen
Apex übertragen; der Helper verwendet Browser-Web-Storage. Der nackte Pfad
`/__/auth`, andere Methoden, Near-Misses,
normalisierte Varianten und jeder Alias-Host sind nicht öffentlich.
`/api` und der kanonische `/`-Catch-all bleiben auf zwei getrennten
IAP-Backend-Services.

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

Vor dem Public-Entry-Cutover muss dieser Terraform-Stand erneut angewendet sein: Er ergänzt beim bereits ausgerollten Deployer die rein lesende Berechtigung `compute.urlMaps.get` und die separate, auf den Cutover begrenzte Rolle mit `compute.backendServices.update` sowie `compute.healthChecks.useReadOnly`. Der Anwendungs-Workflow prüft die URL-Map-Berechtigung anhand der bestehenden GKE URL Map, bevor Phase A den Ingress verändert. Die Update-Berechtigung wird ausschließlich dafür verwendet, IAP am bereits eindeutig aufgelösten Public-Backend zu deaktivieren; `compute.healthChecks.useReadOnly` erlaubt dabei nur, den bereits gebundenen Health Check unverändert weiterzuverwenden. `gcloud --iap=disabled` erhält den vorhandenen Custom-OAuth-Client. Ein bloßer App-Workflow-Lauf ersetzt dieses Infrastruktur-Update nicht.

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

Der Workflow hält während und nach dem Cutover drei getrennte Google Managed Certificates am selben Ingress: `versorgungs-kompass-domain` für Apex und `www`, `versorgungs-kompass-mitmachen` für die bisherige Hauptdomain und `versorgungs-kompass-api` für den älteren Pre-gematik-Host. Im Vorbereitungsmodus bleibt `mitmachen.timo-frank.de` kanonisch und die neuen Hosts leiten dorthin um. Erst nachdem das neue Zertifikat `Active` ist, wechseln `API_BASE_URL` und `FRONTEND_BASE_URL` gemeinsam auf `https://versorgungs-kompass.de`. Danach liefert Exact `/` auf `www` den öffentlichen Einstieg direkt; alle übrigen `www`-Pfade und die Catch-alls beider alter Hosts bleiben IAP-geschützt und können erst hinter dieser Grenze auf den neuen Origin weiterleiten.

1. Die in `CLOUD_DNS_MANAGED_ZONE` angegebene Zone wird als Data Source gelesen; Terraform hält den A-Record für den bisherigen Legacy-Host aus `PUBLIC_HOSTNAME` auf der reservierten globalen Ingress-IP.
2. Falls eine Subzone verwendet wird, delegiert der zuständige DNS-Betrieb sie einmalig an die von Cloud DNS ausgewiesenen Nameserver. Andere Zonen und Records bleiben unberührt.
3. Delegation und A-Record prüfen, bevor ein aktives Google Managed Certificate erwartet wird.
4. Die OAuth-Audience bleibt bewusst `External / Testing`. Der am 24. Juli 2026 geprüfte Stand ist `1 / 100` eingetragene Testnutzer. Eine IAP-Gruppenmitgliedschaft allein reicht für diesen Pilotvertrag nicht: Dieser Release lässt ausschließlich Personen zu, deren stabile Google-Subject-Bindung auf ein aktives Profil bereits vorliegt. Eine neue Bindung benötigt einen separaten, requestfreien und erneut geprüften Admin-Prozess und ist kein Teil dieses Login-Deployments. E-Mail-Adressen dienen nicht als Berechtigungsschlüssel. Google dokumentiert für den Publishing-Status `Testing` höchstens 100 Testnutzer; diese Konfiguration ist ein Testprovisorium und keine Vorlage für Ziel-SSO oder Ziel-Support: <https://support.google.com/cloud/answer/15549945>.
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
| `GCP_PROJECT_NUMBER` | numerischer Terraform-Output `GCP_PROJECT_NUMBER`; wird gegen das authentifizierte Projekt und `WIF_PROVIDER` verifiziert |
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
| `IAP_RESOURCE_ACCESS_PRINCIPAL` | für den Testnutzer-Pilot exakt `group:versorgungs-kompass-pre-gematik-access@googlegroups.com`; nur an die zwei erzeugten Backend Services gebunden |
| `IAP_RESOURCE_ACCESS_EXPIRES_AT` | für den Gruppenbetrieb verpflichtend exakt `2026-09-30T16:00:00Z`; für einen kontrollierten direkten `user:`-Rollback leer |
| `API_BASE_URL` | gemeinsamer HTTPS-Origin; `https://mitmachen.timo-frank.de` nur zur Zertifikatsvorbereitung, danach `https://versorgungs-kompass.de` |
| `FRONTEND_BASE_URL` | exakt derselbe gemeinsame HTTPS-Origin wie `API_BASE_URL` |

`GCP_PROJECT_NUMBER` und die Projektnummer in `WIF_PROVIDER` müssen exakt übereinstimmen. `WIF_PROVIDER` ist der volle Ressourcenname mit numerischer Projektnummer. `GAR_REPOSITORY` hat die Form `REGION-docker.pkg.dev/PROJECT/REPOSITORY`. Bucket-Werte enthalten nur den Namen, kein `gs://`. Der Workflow bricht ab, wenn `API_BASE_URL` und `FRONTEND_BASE_URL` nicht exakt denselben Origin bezeichnen oder der Origin außerhalb der beiden freigegebenen Cutover-Zustände liegt.

Zusätzlich liegen zwei geschützte Environment-Secrets vor. `IAP_PROJECT_BREAK_GLASS_SHA256` ist der SHA-256-Pin der kanonisch sortierten, projektweiten IAP-Break-glass-Nutzerliste und kein Zugangswert. `HOSPITATION_IMPORT_OWNER_PROFILE_ID` enthält ausschließlich die stabile produktive Profil-ID von Timo Frank; sie wird nicht im Repository hinterlegt und durch den Workflow in die geschützte API-Konfiguration übernommen. Der Workflow liest die Projekt-IAM-Policy nur als Metadatum, verlangt genau eine unbedingte, ausschließlich aus `user:`-Mitgliedern bestehende Break-glass-Bindung und stoppt bei jeder Mitgliedschaftsänderung. Der Gruppen-Cutover verändert diese projektweite Bindung nicht. Der Klartext der Nutzerliste wird weder in Git noch in der Actions-Zusammenfassung ausgegeben.

### Testnutzerzugang über die private Gruppe

Regulärer Testzugang läuft über die bestehende private Gruppe `versorgungs-kompass-pre-gematik-access@googlegroups.com`. Die Gruppe selbst ist kein Berechtigungs-Roster: Maßgeblich bleibt das personenbezogene, genehmigte Voll-Soll-Dokument im geschützten Plattformkontext. Zusätzlich muss vor dem ersten Login bereits eine aktive `(issuer, subject)`-Bindung auf ein aktives Profil bestehen. Weder Namen noch E-Mail-Adressen, IAP-Subjects oder Profil-IDs werden in Git abgelegt.

`test_only` isoliert schreibende Änderungen, nicht den lesenden Pilotumfang. Jeder Roster-Eintrag ist deshalb ausdrücklich eine personenbezogene Freigabe zum Lesen des aktuellen geschützten Pilotbestands und darf nicht wie ein unverbindlicher Demo-Zugang behandelt werden. Wer nur synthetische Daten sehen darf, wird nicht für diese Umgebung vorgemerkt.

Vor der ersten Einladung wird die Gruppe in Google Groups wie folgt gehärtet:

- Beitritt ausschließlich für eingeladene Nutzer; direktes Hinzufügen ist deaktiviert.
- Gruppe, Unterhaltungen und Mitgliederliste sind nur für Mitglieder beziehungsweise bei der Mitgliederliste nur für Owner sichtbar.
- Nur der Pilot-Owner verwaltet Mitglieder und Einstellungen; Tester sind ausschließlich `Member`, niemals `Manager` oder `Owner`.
- Keine Untergruppen, kein externer Posting-Kanal und kein für den Zugriff benötigtes Nachrichtenarchiv.
- Die aktive Mitgliedschaft wird vor jeder App-Bindung und bei jedem Offboarding gegen das geschützte Roster geprüft.

Google beschreibt die Einstellung `Only invited users` und die getrennten Sichtbarkeitsrechte unter <https://support.google.com/groups/answer/2464926>. Für `@googlegroups.com` können Personen ohne Google-Konto nur eingeladen, aber nicht als nutzbare IAP-Identität direkt hinzugefügt werden. Ein Tester ohne Gmail legt deshalb ein persönliches Google-Konto mit seiner bestehenden E-Mail-Adresse an; gemeinsam genutzte Konten und geteilte Passwörter sind unzulässig. Hinweise dazu stehen unter <https://support.google.com/accounts/answer/176347>.

Das individuelle Onboarding wird in dieser Reihenfolge ausgeführt:

1. Zweck, Viewer- oder `test_only`-Editor-Rolle, Pilotkohorte und Ende im geschützten Roster genehmigen.
2. Vor jeder OAuth- oder Gruppenzulassung bestätigen, dass bereits genau eine aktive Google-Subject-Bindung mit dem genehmigten Profil, der Rolle und dem Scope besteht. Fehlt sie, endet dieses Release-Onboarding; eine neue Bindung ist eine separate, erneut zu prüfende Admin-Änderung.
3. Persönliches Google-Konto und aktivierten zweiten Faktor bestätigen.
4. Die primäre Konto-Adresse in Google Auth Platform als OAuth-Testnutzer eintragen.
5. Dieselbe Adresse zur privaten Gruppe einladen; erst nach Annahme und sichtbarer aktiver Mitgliedschaft fortfahren. Roster, Gruppe, OAuth-Zulassung, Subject und Rolle anschließend getrennt gegenprüfen.
6. Auf der öffentlichen Hauptseite `Mit Google anmelden` wählen. Der IAP-Bootstrap prüft nach der Google-Anmeldung die vorhandene aktive Bindung; er erzeugt keine Identität und mutiert keine Berechtigungsdaten.
7. Viewer- beziehungsweise Editor-Grenzen positiv und negativ testen und erst danach den Eintrag im Roster auf aktiv setzen.

Ohne eindeutige aktive Bindung wird nichts aktiviert. Die Anwendung führt neutral zu `/#zugriff-verweigert`. Die ehemaligen Self-Service-Endpunkte `/api/auth/auto-enrollment` und `/api/auth/enrollment` sind aus der API-Policy entfernt; ein Runtime-Schalter zur Reaktivierung existiert nicht. Eine Gruppenmitgliedschaft allein erzeugt zu keinem Zeitpunkt eine App-Bindung.

IAP verlangt auf API und geschütztem Frontend `ENROLLED_SECOND_FACTORS` mit `maxAge: 28800s` und `policyType: MINIMUM`. Der Workflow liest zunächst beide ressourcenspezifischen IAM-Policies vollständig. Zulässig sind nur zwei leere Policies oder bereits exakt das Soll: Policy-Version 3, genau eine Gruppenbindung und die Bedingung `request.time < timestamp("2026-09-30T16:00:00Z")`. Erst nach erfolgreicher Prüfung beider Backends setzt und verifiziert er Reauthentication und anschließend die Policies. Eine vorhandene direkte Nutzerbindung wird nicht automatisch ersetzt. Das separate Public-Entry-Backend wird nie in diese IAM- oder Reauthentication-Schleifen aufgenommen.

Der kontrollierte Wechsel von der bisherigen direkten Ressourcenbindung zur Gruppe erfolgt deshalb in einem Wartungsfenster:

1. Projektweite Break-glass-Policy und ihren geschützten Pin prüfen; sie werden nicht geändert.
2. Backendnamen frisch über die API- und Frontend-NEGs ermitteln und beide aktuellen Resource-Policies mit ETag geschützt sichern.
3. Deployment-Freeze setzen und beide Resource-Policies kontrolliert leeren. Ist nur eine leer oder enthält eine Policy einen unbekannten Eintrag, keinen Workflow starten.
4. GitHub-Variablen auf die exakte Gruppe und `2026-09-30T16:00:00Z` setzen.
5. Workflow ausführen. Nach dessen Vorprüfung werden API und danach Frontend gebunden; anschließend werden beide Policies und beide Reauthentication-Einstellungen erneut gelesen.
6. Zuerst einen Viewer vollständig abnehmen, danach höchstens einen `test_only`-Editor; weitere Personen folgen einzeln.

Gruppenänderungen sind nicht sofort konsistent. Vor einem positiven Zugriffstest wird deshalb auf die sichtbare aktive Mitgliedschaft und IAM-Propagation gewartet; die App-Bindung bleibt bis dahin deaktiviert.

### Offboarding, Rollback und spätere Cloud-Identity-Option

Bei individuellem Offboarding wird zuerst ein noch nicht verbrauchter Allowlist-Eintrag widerrufen beziehungsweise eine bereits erzeugte App-Bindung deaktiviert. Danach wird die Person aus der Gruppe und aus der OAuth-Testnutzerliste entfernt. Der negative Zugriffstest wird geschützt dokumentiert. Das `expires_at` eines Allowlist-Eintrags beendet nur die Möglichkeit des erstmaligen Bindings; einen bereits aktivierten Zugang beendet es nicht. Diese Sperre übernehmen die deaktivierte App-Bindung und die zeitlich bedingte IAP-Gruppenpolicy. Am 30. September 2026 um 18:00 Uhr CEST sperrt die IAM-Bedingung zusätzlich technisch; danach werden alle offenen Allowlist-Einträge widerrufen, alle Testerbindungen deaktiviert und Gruppen- sowie OAuth-Mitgliedschaften bereinigt.

Bei einem Zugriffs- oder Policyvorfall werden die Resource-Policies in der Reihenfolge Frontend, dann API auf den zuvor gesicherten direkten `user:`-Sollzustand zurückgeführt; `IAP_RESOURCE_ACCESS_EXPIRES_AT` bleibt dabei leer. Der projektweite Break-glass-Pin darf sich nicht ändern. Ein teilweise ausgeführter Gruppen-Cutover wird nicht durch Hinzufügen weiterer Mitglieder repariert, sondern geschlossen und aus dem gesicherten Soll neu aufgebaut.

Option 2 bleibt eine spätere, getrennte Entscheidung: Nach Einrichtung einer verifizierten Domain und Cloud Identity Free werden individuelle verwaltete Konten und eine administrierbare Cloud-Identity-Gruppe angelegt. Cloud Identity Free stellt standardmäßig 50 Lizenzen bereit: <https://cloud.google.com/identity/pricing>. Der Wechsel ersetzt nur den konfigurierten ressourcenspezifischen `group:`-Principal in einem erneuten kontrollierten Leeren-und-Setzen-Cutover. Enrollment, stabile Subject-Bindung, Rollen, `test_only`-Scope und Projekt-Break-glass bleiben unverändert. Die heutige `@googlegroups.com`-Gruppe wird nicht als verwaltete Cloud-Identity-Gruppe umgedeutet.

## Phase 5: Workflow ausführen

### Validierung ohne Cloud-Zugriff

In GitHub unter `Actions -> Deploy pre-gematik (GKE Autopilot) -> Run workflow` zuerst ausführen mit:

- `validate_only`: aktiviert; dies ist aus Sicherheitsgründen der Default,
- `image_tag`: leer,
- `require_external_smoke`: aktiviert; bei realen Deployments wird der externe Boundary-Test unabhängig vom Kompatibilitätswert immer ausgeführt.

Die Validierung führt Repository-Checks, Helm-Lint und -Render, Ziel-Frontend-Erzeugung sowie echten Containerstart mit Health Check aus. Sie fordert weder Environment-Freigabe noch GCP-Credentials an.

### Domain-Cutover zu versorgungs-kompass.de

Der Domainwechsel ist für diese Umgebung abgeschlossen. Vor jedem weiteren echten Public-Entry-Cutover müssen DNS und alle vier verwendeten Zertifikatsnamen bereits erreichbar sein; der Workflow öffnet den Einstieg nicht ohne erfolgreichen externen Boundary-Test.

1. `API_BASE_URL` und `FRONTEND_BASE_URL` auf `https://versorgungs-kompass.de` belassen.
2. Bei ALL-INKL den Apex-A-Record auf `GKE_INGRESS_IP_ADDRESS` und `www` als CNAME auf `versorgungs-kompass.de.` setzen. MX- und TXT-Records bleiben unverändert.
3. Vor dem Deployment bestätigen, dass `kubectl -n pre-gematik get managedcertificate versorgungs-kompass-domain` den Status `Active` für beide Domains meldet.
4. Den Workflow mit `validate_only=false` und Environment-Freigabe ausführen; der externe Smoke ist verpflichtend.
5. Apex `/` und `www /` müssen anschließend denselben öffentlichen Einstieg liefern; die gebrandeten Identity-Seiten und ihre lokalen Assets sind ausschließlich unter den allowlisteten Apex-Pfaden öffentlich. Prefix `/__/auth/` ist nur am Apex für den festen Auth-Helper freigegeben. Alle übrigen `www`-Pfade sowie alle Pfade der beiden alten Hosts bleiben an der IAP-Grenze; die alten Zertifikate bleiben dafür aktiv.

### Erstes Deployment

Danach denselben Workflow mit `validate_only` deaktiviert ausführen. Der Deploy-Job:

1. wartet auf die Freigabe des Environments `pre-gematik`,
2. tauscht das GitHub-OIDC-Token per WIF gegen kurzlebige GCP-Credentials und prüft Projekt, Region, Registry, Cloud SQL, private Buckets sowie den gepinnten Break-glass-Sollzustand,
3. verbindet sich über den GKE-DNS-Endpunkt,
4. liest das JSON-formatierte OAuth-Bootstrap-Secret aus Secret Manager ohne Inhaltsausgabe, materialisiert daraus exakt `client_id` und `client_secret` im Kubernetes Secret und validiert dessen Form,
5. baut und pusht ein unveränderlich getaggtes API-Image inklusive Provenance und SBOM,
6. erzeugt `dist/target/` mit `dataMode: "api"`, `authMode: "iap"` und `requireApiGateway: true`,
7. synchronisiert den exklusiven privaten Frontend-Bucket unter ein versioniertes `releasePrefix`; `contentRevision` bindet den Frontend-Rollout an genau diesen unveränderlichen Inhalt,
8. baut zusätzlich ein unveränderliches, separat gescanntes Public-Entry-Image mit exakt zehn geprüften Dateien für Einstieg, Identity-Portal und lokale Assets, prüft vor jeder Routing-Änderung den Lesezugriff des Deployers auf die bestehende GKE URL Map und erzwingt auch bei Folge-Releases vor jedem Ingress-Reconcile zunächst IAP auf dem Public-Backend. Das kann die expliziten öffentlichen Apex-Routen und Exact `/` auf `www` während des Deployments kurz an die Google-Anmeldung umleiten; ein unterbrechungsfreier Wechsel würde ein separates Canary-Backend erfordern und ist nicht Teil dieses temporären Piloten,
9. identifiziert anhand aller zonalen NEGs exakt vier unterschiedliche Backend-Services und beweist pollend in der realen GCE URL Map, dass am Apex nur die allowlisteten Exact-Pfade auf das Public-Backend und nur Prefix `/__/auth/` auf das Auth-Helper-Backend zeigen. Auf `www` bleibt nur Exact `/` öffentlich. Alle anderen Alias-Pfade müssen beim geschützten Frontend bleiben; alle gemeldeten Endpoints müssen gesund sein,
10. ermittelt die reale API-IAP-Audience, reconciled Helm und startet die API kontrolliert neu, damit der per `envFrom` geladene Wert aktiv wird,
11. prüft Image-Digest, den exakten Zehn-Dateien-Inhalt, beide Identity-Seiten, die lokalen Assets, die Bildantwort, rohe URI-Deny-Matrix und leere Public-Resource-Policy vor der Öffnung; erst die letzte Helm-Mutation deaktiviert IAP für genau das Public-Backend. Bei jedem späteren Fehler stellt ein zweistufiger Restore IAP wieder her,
12. liest und validiert die zwei geschützten Resource-Policies vollständig, setzt und verifiziert dort `ENROLLED_SECOND_FACTORS / 28800s / MINIMUM` und bindet erst danach die zeitlich begrenzte reguläre Testgruppe an genau diese zwei Services,
13. bestätigt per echtem `SELECT 1` im API-Container Cloud SQL Auth Proxy, Workload Identity, DB-Nutzer und Secret sowie Existenz und Leserecht für alle fachlichen Tabellen des Pre-Integration-Vertrags; die API-Readiness prüft zusätzlich die aktive Bindungstabelle `identity_bindings` und die weiterhin für bestehende `test_only`-Konten benötigte Objektgrenze `test_access_objects`,
14. bestätigt Rollout und Health aller vier Workloads, die Zehn-Dateien-Grenze des Public-Deployments, den festen TLS-Auth-Helper samt verbotenen Methoden/Near-Misses sowie die vollständige App-Konfiguration,
15. prüft, dass gefälschte, unsignierte IAP-Identity-Header mit HTTP 401 abgewiesen werden.

Jeder echte Lauf führt den externen Boundary-Test aus. Nach dem Compute-Cutover wartet er begrenzt auf die Edge-Propagation und erwartet anschließend HTTP 200 für Apex `/`, `www /`, die gebrandete Anmeldung, die Passwortsetzseite, ihre exakten lokalen Assets und das byte-identische PNG. Die HTML- und PNG-Abrufe werden zusätzlich mit repräsentativen Microsoft-Teams- und offiziellen WhatsApp-User-Agent-Mustern wiederholt; IAP-Redirects, Cookies oder abweichende Inhalte brechen das Deployment ab. Der Test verlangt außerdem, dass `/__/auth/handler` am Apex für GET, HEAD und POST ohne Redirect den echten Firebase-Helper liefert, während nicht erlaubte Methoden, der nackte Pfad, Near-Misses, normalisierte Varianten und alle Alias-Hosts geschlossen bleiben. `/start`, `/enrollment.html`, `/login.html`, `/api/*`, Runtime-Assets, andere `www`-Pfade und Near-Misses wie `/anmelden/` müssen entweder an der IAP-Grenze stoppen oder vom minimalen Backend mit 404 abgewiesen werden; sie dürfen nie öffentlichen Identity- oder Auth-Helper-Inhalt liefern. POST auf die statischen Portal-/Assetpfade bleibt 403. Die bestehenden Near-Miss-, Matrix- und Dot-Segment-Prüfungen bleiben fail-closed. Erst nach erfolgreichem externem Test wird ein Cutover als abgeschlossen markiert; andernfalls aktiviert der Workflow IAP auf dem Public-Backend erneut.

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
- [ ] Die ausgerollten Deployer-Rollen enthalten `compute.urlMaps.get` sowie die separaten Cutover-Berechtigungen `compute.backendServices.update` und `compute.healthChecks.useReadOnly`; der Public-Entry-Cutover wurde nicht vor diesem Terraform-Update gestartet.
- [ ] Falls `BILLING_ACCOUNT_ID` gesetzt ist, existiert das projektbezogene Warnbudget; allen Beteiligten ist bekannt, dass es kein Ausgabenlimit ist.
- [ ] GKE nutzt Autopilot, private Nodes und ausschließlich den extern erreichbaren DNS-Control-Plane-Endpunkt.
- [ ] Artifact Registry, Cloud SQL, Secret Manager und alle vier Buckets liegen in der vorgesehenen Region.
- [ ] Der gemeinsame Frontend-/API-DNS-Name zeigt auf `GKE_INGRESS_IP_ADDRESS`.
- [ ] Google Managed Certificate meldet `Active`.
- [ ] Der GKE Ingress routet am Apex ausschließlich die allowlisteten Exact-Pfade für Einstieg, Identity-Portal und lokale Assets zum Public-Entry-Backend sowie Prefix `/__/auth/` zum Auth-Helper-Backend. Auf `www` zeigt ausschließlich Exact `/` zum Public-Entry-Backend; alle anderen Alias-Pfade bleiben beim IAP-geschützten Frontend. `/api` und der kanonische `/`-Catch-all zeigen auf die zwei IAP-geschützten Backends.
- [ ] Das Public-Entry-Backend besitzt `iap.enabled: false`, eine leere Resource-Policy und im Webroot physisch exakt die zehn geprüften Dateien; `/anmelden` und `/konto/passwort-festlegen` liefern die jeweils gebrandete Seite.
- [ ] Das Auth-Helper-Backend besitzt `iap.enabled: false`, deaktiviertes Load-Balancer-Zugriffslogging und eine leere Resource-Policy. Der Proxy akzeptiert ausschließlich GET/HEAD/POST unter dem rohen Prefix `/__/auth/`, allowlistet minimale Request-Header, entfernt Cookies und Authorization-/IAP-Identity-Header und verwendet nur den festen TLS-verifizierten Firebase-Upstream ohne Redirect.
- [ ] Beide Resource-Policies stehen auf Version 3 und enthalten ausschließlich `group:versorgungs-kompass-pre-gematik-access@googlegroups.com` mit Ablaufbedingung `2026-09-30T16:00:00Z`.
- [ ] API- und geschütztes Frontend-Backend erzwingen jeweils `ENROLLED_SECOND_FACTORS / 28800s / MINIMUM`.
- [ ] Projektweiter IAP-Zugriff enthält unverändert nur den gepinnten Break-glass-Nutzer; die Testgruppe ist ausschließlich auf API- und geschützten Frontend-Backend-Service gebunden.

### Identität und Secrets

- [ ] Im Repository und in GitHub existiert kein Service-Account-JSON-Key.
- [ ] Der WIF-Provider ist auf Repository und Environment eingeschränkt.
- [ ] `pre-gematik` verlangt Freigabe und beschränkt Deployment-Branches.
- [ ] OAuth steht weiterhin auf `External / Testing`; jeder aktive Tester ist einzeln in OAuth, privater Gruppe und geschütztem Voll-Soll-Roster enthalten.
- [ ] Die private Gruppe ist nur per Einladung zugänglich; Tester besitzen ausschließlich die Rolle `Member`.
- [ ] Secret Manager enthält mindestens eine aktive Passwortversion.
- [ ] `vk-pre-gematik-iap-oauth-bootstrap` enthält gültiges JSON mit nicht leeren `client_id`- und `client_secret`-Strings; der Deployer darf nur dieses Bootstrap-Secret lesen.
- [ ] Für Passwortrotation ist der anschließende API-Rollout dokumentiert und getestet.
- [ ] Der API-Workload-Principal darf nur das benötigte Secret, Cloud SQL und die drei Daten-Buckets verwenden.
- [ ] Der getrennte Frontend-Workload-Principal darf nur das statische Artefakt aus dem Frontend-Bucket lesen.
- [ ] Die Public-Entry-KSA besitzt keine Cloud-IAM-Bindung; der Public-Pod hat `egress: []` und verwendet ausschließlich das digest-gepinnte Zehn-Dateien-Image.
- [ ] Die Auth-Helper-KSA besitzt keine Cloud-IAM-Bindung, kein Token und keine Secrets; ihre NetworkPolicy erlaubt ausgehend nur DNS und HTTPS und nginx schreibt keine Zugriffslogs.
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
- [ ] Externer Smoke liefert auch mit Teams- und WhatsApp-Crawler-User-Agent HTTP 200 für Apex `/`, `www /` und das byte-identische PNG am exakten kanonischen Share-Pfad; Anmeldung, Passwortsetzseite und lokale Assets sind ausschließlich unter den allowlisteten Apex-Pfaden erreichbar.
- [ ] Der kanonische Auth-Helper liefert am Apex für GET/HEAD/POST HTTP 200 ohne Redirect und mit echtem Firebase-Helper-Marker. Nicht erlaubte Methoden, Root/Near-Misses, normalisierte Varianten und alle Alias-Hosts liefern ausschließlich eine sichere 404/403/405- oder IAP-Antwort und niemals Auth-Helper-Inhalt.
- [ ] IAP-Login einer freigegebenen Testperson funktioniert.
- [ ] Ein aktives `profiles`-Mapping liefert die erwartete Rolle; unbekannte Personen erhalten 403.
- [ ] Viewer können den freigegebenen Bestand lesen und keine Fachobjekte verändern.
- [ ] `test_only`-Editor können ausschließlich markierte Objekte ihrer Pilotkohorte anlegen, ändern und zurücksetzen; Bestand und fremde Kohorten bleiben unveränderbar.
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
- IAP-Zugriff: bei einem Vorfall zuerst Frontend, dann API auf den gesicherten direkten Ressourcen-Principal zurückführen; Gruppenablaufvariable für `user:` leer lassen und den unveränderten Projekt-Break-glass-Pin erneut prüfen.
- Auth-Helper: zuerst `authDomain` und den primären Google-OAuth-Redirect gemeinsam auf den gesicherten Firebase-Rollbackwert zurückstellen und den Google-Login nachweisen; erst danach `frontend.authProxy.enabled=false` ausrollen. Niemals nur die öffentliche Route entfernen, solange Browserkonfiguration oder OAuth noch den kanonischen Callback verwenden.
- Nach Abschluss benötigte Testergebnisse exportieren, Testzugriffe entziehen, Deletion Protection bewusst und separat aufheben und die temporären Ressourcen über Terraform abbauen.

Ein Rollback ersetzt weder Schema-Kompatibilitätsprüfung noch Datenwiederherstellung. Bei fehlgeschlagenem Audience-Bootstrap bleibt die API absichtlich fail-closed; zuerst Ingress/IAP korrigieren und den Workflow erneut ausführen.

Nach Ende der Pre-Integration werden persönliche Break-glass-/OAuth-Zugänge, temporäre Gruppenbindungen, GitHub-Environment-Werte und GCP-Ressourcen entzogen beziehungsweise nach dokumentierter Ergebnissicherung abgebaut. Das Ergebnis gilt ausschließlich für den beschriebenen Testumfang.
