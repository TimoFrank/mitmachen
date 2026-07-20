# Deployment der GCP-Pre-Integration mit GKE Autopilot

Status: 18. Juli 2026 - temporaere Pre-Integration, ausdruecklich kein Zielbetriebs-Runbook

Dieses Runbook bereitet eine zeitlich begrenzte Umgebung `pre-gematik` vor. Sie erprobt den Anwendungsvertrag mit statischem Frontend, Kubernetes-API, PostgreSQL, Object Storage, Registry und vorgelagerter Identitaet. Das GitHub-Pages-Deployment bleibt als rein synthetische oeffentliche Demo getrennt. GitHub Pages ist kein Staging fuer diese Umgebung.

> **Uebergabehinweis:** GKE Autopilot, Cloud SQL, GCP IAP, die persoenliche Domain, das persoenliche GCP-Projekt und persoenliche Break-glass-/OAuth-Testnutzer sind ausschliesslich Adapter der Pre-Integration. Sie sind weder Zielarchitektur noch freigegebene Produktivwerte. Die gematik IT ersetzt sie durch institutionelle Plattformdienste, Konten, Domains und Betriebsverfahren.

## Nicht auf den Zielbetrieb uebertragbare Werte

| Pre-Integrationswert | Bedeutung hier | Erforderliche Zielentscheidung |
| --- | --- | --- |
| `GCP_PROJECT_ID` | befristetes Pre-Integrationsprojekt aus dem geschuetzten Environment | institutionelles Projekt beziehungsweise Plattformmandant |
| `FRONTEND_BASE_URL` | temporaerer Test-Origin aus dem geschuetzten Environment | interne Ziel-URL, DNS und TLS |
| GKE Autopilot | technische Testplattform | freigegebene Kubernetes-Auspraegung |
| Cloud SQL | temporaere PostgreSQL-Implementierung | Shared-Postgres-Vertrag |
| GCP IAP | temporaerer Gateway-/Identitaetsadapter | gematik Gateway/SSO-Vertrag |
| `IAP_ACCESS_MEMBERS` | temporaere direkte Test-/Break-glass-Nutzer ausserhalb des Repositorys | institutionelles Break-glass-Verfahren mit Owner und Audit |
| GitHub Actions Environment `pre-gematik` | Pre-Integrationsfreigabe | Software-Factory-/Change-Verfahren |

Keine dieser Zeilen darf durch blosses Kopieren der Pre-Integrationskonfiguration als entschieden gelten.

## Ziel und Grenzen

Die Pre-Integration prueft:

- reproduzierbaren Container-Build und Push in Artifact Registry,
- das Helm-Referenzchart, das vor Zielbetrieb durch die Plattformverantwortung abgenommen und angepasst wird,
- GKE Autopilot, Workload Identity und GKE Secret Sync,
- Cloud SQL ueber private IP und TLS,
- private Cloud-Storage-Buckets,
- IAP als vorgelagerte Identitaetsgrenze,
- Rollout, Health Check und Ablehnung gefaelschter Identity-Header.

Sie ist keine Produktivumgebung und hat keine Hochverfuegbarkeitszusage. `DB_AVAILABILITY_TYPE` steht fuer diesen persoenlichen, kostenbegrenzten Pilot bewusst auf `ZONAL`; `REGIONAL` wird erst durch eine separate Zielbetriebsentscheidung aktiviert. Standardmaessig enthaelt die Umgebung nur synthetische oder belastbar anonymisierte Testdaten. Ein zeitlich begrenzter Echtdaten-Pilot ist ausschliesslich nach den dokumentierten Fach-, Datenschutz-, Security-, Zugriffs-, Backup- und Cutover-Freigaben im [Supabase-Cloud-SQL-Migrationsplan](SUPABASE_CLOUD_SQL_MIGRATION.md) zulaessig. Das Deployment installiert das mitgelieferte Pre-Integration-Schema nicht automatisch, erstellt keine Testnutzer und migriert keine Supabase-Daten. Das Schema ist ein ausdruecklich temporaerer API-Vertrag und keine Freigabe fuer den spaeteren gematik-Zielbetrieb.

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

`dist/pages/` gehoert ausschliesslich zum GitHub-Pages-Pfad und wird von dieser Pre-Integration weder gelesen noch veraendert. Eine versionierte `docs/`-Publish-Kopie existiert nicht mehr.

Weder ein Service-Account-JSON-Key noch Datenbankpasswort oder OAuth-Credentials liegen in GitHub. GKE Secret Sync liest das Passwort mit der API-Workload-Identity direkt aus Secret Manager und erzeugt das vom Deployment referenzierte Kubernetes Secret. Der Deploy-Workflow liest den getrennten OAuth-Bootstrap ausschliesslich aus Secret Manager und materialisiert ihn ohne Inhaltsausgabe. Eine getrennte Frontend-Workload-Identity darf ausschliesslich das statische Zielartefakt aus dem privaten Frontend-Bucket lesen.

Die API verbindet sich im Pod mit `127.0.0.1:5432` zum Cloud SQL Auth Proxy. Deshalb ist der lokale PostgreSQL-TLS-Modus `disable`; der Proxy authentifiziert sich per Workload Identity und baut die verschluesselte private Verbindung zur Cloud-SQL-Instanz auf. Eine direkte unverschluesselte Netzwerkverbindung der API zur Datenbank ist nicht vorgesehen.

## Repository-Artefakte

| Artefakt | Zweck |
| --- | --- |
| `.github/workflows/deploy-pre-gematik.yml` | manuelles und wiederverwendbares Validate-/Deploy-Workflow |
| `config/pre-gematik/variables.env.example` | vollstaendige Liste der GitHub-Environment-Variablen ohne Geheimnisse |
| `deploy/terraform/gcp-autopilot/` | GCP-Projektressourcen auf Basis eines vorhandenen, billing-faehigen Projekts |
| `deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml` | GKE-/IAP-/Secret-Sync-Overlay |
| `deploy/postgres/pre-gematik/` | idempotentes PostgreSQL-16-Zwischenschema und lokaler Vertragscheck |
| `api/Dockerfile` | API-Container |
| `scripts/build_static_frontend.sh` | getrennten Target-Build nach `dist/target/` erzeugen |
| `scripts/prepare_target_frontend_config.mjs` | Frontend auf `api` und `iap` umstellen |

Alle Repository-Pfade in diesem Dokument beginnen im Repository-Root.

## Sicherheitsentscheidungen

1. Das GitHub Environment heisst fest `pre-gematik`. Es ist ein zusaetzliches Environment neben `github-pages`.
2. Der Deploy-Job erhaelt `id-token: write`, aber keine langlebigen GCP-Credentials.
3. Der WIF-Provider akzeptiert nur OIDC-Tokens aus `TimoFrank/mitmachen` und dem Environment `pre-gematik`.
4. Artifact Registry verwendet unveraenderliche Tags. Der Standardtag enthaelt Commit, Workflow-Run und Versuch.
5. Alle verwendeten GitHub Actions sind auf konkrete Commit-SHAs festgelegt; Versionskommentare erleichtern kontrollierte Updates.
6. Der Frontend-Sync darf nur auf einen exklusiv fuer dieses Artefakt bestimmten Bucket zeigen, weil nicht mehr vorhandene Zieldateien geloescht werden.
7. Das erste Helm-Reconcile verwendet absichtlich eine ungueltige, aber nicht leere IAP-Audience. Die API bleibt damit waehrend des Load-Balancer-Bootstraps fail-closed.
8. Der Workflow liest danach den von GKE erzeugten Backend Service, bestimmt dessen numerische ID und setzt die erwartete Audience im Format `/projects/PROJECT_NUMBER/global/backendServices/BACKEND_SERVICE_ID`.
9. Kann die echte Audience nicht bestimmt oder IAP nicht als aktiv bestaetigt werden, endet das Deployment fehlerhaft. Es wird kein erfolgreicher Zustand ohne signierte IAP-JWT-Pruefung gemeldet.
10. Ein benannter direkter Nutzer kann ausschliesslich in dieser befristeten Pre-Integration projektweiter Break-glass-Zugang sein. Die Identitaet wird nicht im Repository dokumentiert. Die regulaere Testgruppe wird erst nach eindeutiger Zuordnung ausschliesslich an die beiden vom gemeinsamen Ingress erzeugten API- und Frontend-Backend-Services gebunden. Dieser Zugang darf nicht in den Zielbetrieb uebernommen werden.

Google beschreibt Workload Identity Federation fuer Deployment-Pipelines unter <https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines>. Das Format und die Pflicht zur Pruefung der signierten IAP-Header sind unter <https://cloud.google.com/iap/docs/signed-headers-howto> dokumentiert.

## Phase 1: Voraussetzungen

Vor Terraform muessen vorhanden sein:

- ein abrechnungsaktives, ausdruecklich freigegebenes Pre-Integrationsprojekt; dessen ID steht nur im geschuetzten Environment,
- Berechtigung zum Aktivieren der benoetigten APIs und Anlegen der Terraform-Ressourcen,
- Terraform in der vom Scaffold geforderten Version,
- ein privater, versionierter Terraform-State-Bucket, dessen Name beim `terraform init` geschuetzt uebergeben wird,
- ein freigegebener HTTPS-Origin aus `FRONTEND_BASE_URL`,
- Festlegung, welche Google-Nutzer oder -Gruppen ueber IAP zugreifen duerfen,
- fuer die Zwischenumgebung eine bewusste Freigabe des mitgelieferten Pre-Integration-Schemas; standardmaessig werden ausschliesslich synthetische Daten eingespielt. Ein zeitlich begrenzter Echtdaten-Pilot folgt zusaetzlich und ausschliesslich den Gates G-01 bis G-07 im [Supabase-Cloud-SQL-Migrationsplan](SUPABASE_CLOUD_SQL_MIGRATION.md). Das spaetere gematik-Schema bleibt davon getrennt.

Das Frontend wird nicht direkt aus einem oeffentlichen Bucket ausgeliefert. Ein Init-Container liest das Zielartefakt per Workload Identity aus dem privaten `FRONTEND_BUCKET` in ein gemeinsames Volume; ein unprivilegierter nginx-Container stellt es intern bereit. Der gemeinsame GKE Ingress routet `/api` zur API und `/` zum Frontend. IAP schuetzt beide Pfade am selben Origin.

Das persoenlich verantwortete Pre-Integrationsprojekt ist nur fuer diese Zwischenumgebung akzeptabel. Alle neuen Ressourcen tragen `pre-gematik` beziehungsweise `vk-pre-gematik` im Namen. Das bestehende Artifact Registry Repository, eine fruehere Demo-Cloud-SQL-Instanz, Demo-Secrets und Default Service Accounts werden nicht wiederverwendet. Echtdaten bleiben im Standardbetrieb ausgeschlossen; eine befristete Ausnahme ist nur nach G-01 bis G-07 und mit dokumentiertem Go/No-Go zulaessig. IAM, Quoten, Billing und Projektloeschung bleiben trotzdem eine gemeinsame Fehlerdomaene; deshalb ist diese Ausnahme nicht auf den Zielbetrieb uebertragbar.

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

Vor `apply` die Zielwerte in `terraform.tfvars.example` pruefen und als lokale `terraform.tfvars` uebernehmen. Insbesondere muss die private Google Group bereits existieren und fuer IAM sichtbar sein. Sie steht nicht in `IAP_ACCESS_MEMBERS`, sondern wird spaeter vom Workflow an die beiden konkreten Backend Services gebunden. `terraform.tfvars`, Plan-Dateien, State, der reale State-Bucket-Name und lokale Credentials bleiben ausserhalb von Git. Das eingecheckte `backend.tf` enthaelt nur das stabile State-Praefix.

Relevante Outputs:

```bash
terraform output
terraform output -json
```

Der Cluster stellt nur den IAM-geschuetzten DNS-Control-Plane-Endpunkt bereit. Fuer Administration und CI ist deshalb zwingend `gcloud container clusters get-credentials ... --dns-endpoint` zu verwenden. Der Deployment-Workflow setzt genau diesen Pfad ein.

### Optionale Kostenwarnung

Wenn `BILLING_ACCOUNT_ID` gesetzt wird, legt Terraform ein auf dieses Projekt gefiltertes Monatsbudget an. Der vorbereitete Standard sind 100 EUR mit Warnungen bei 50, 80 und 100 Prozent Istkosten sowie bei prognostizierten 100 Prozent. `BUDGET_CURRENCY_CODE` muss zur Waehrung des Billing Accounts passen. Das ausfuehrende Konto benoetigt die noetigen Billing-Budget-Rechte.

Ein Cloud-Billing-Budget ist nur eine Warnung und kein hartes Ausgabenlimit. Insbesondere Load Balancer, Cloud NAT, Cloud SQL, Artifact Storage und Autopilot-Workloads koennen auch nach Erreichen des Schwellwerts weiter Kosten verursachen. Fuer eine temporaere Umgebung deshalb zusaetzlich das Enddatum im Kalender festhalten und den Terraform-Abbau im Abschnitt "Rollback und Ende der vier Wochen" verbindlich einplanen.

## Phase 3: DNS, OAuth und Secret Manager

1. Die in `CLOUD_DNS_MANAGED_ZONE` angegebene Zone wird als Data Source gelesen; Terraform legt den A-Record fuer `PUBLIC_HOSTNAME` auf die reservierte globale Ingress-IP.
2. Falls eine Subzone verwendet wird, delegiert der zustaendige DNS-Betrieb sie einmalig an die von Cloud DNS ausgewiesenen Nameserver. Andere Zonen und Records bleiben unberuehrt.
3. Delegation und A-Record pruefen, bevor ein aktives Google Managed Certificate erwartet wird.
4. Wenn die Pre-Integration externe Google-Konten benoetigt, bleibt die OAuth-Audience bewusst `External / Test`. Support-, Kontakt- und Testnutzer werden nur im geschuetzten Plattformkontext gepflegt. Eine IAP-Gruppenmitgliedschaft allein kann in diesem Status unzureichend sein; weitere Personen muessen gemaess OAuth-Testnutzerverfahren freigegeben werden. Diese Konfiguration ist ein Testprovisorium und keine Vorlage fuer Ziel-SSO oder Ziel-Support.
5. Einen dedizierten Web-OAuth-Client anlegen und anschliessend die Redirect URI `https://iap.googleapis.com/v1/oauth/clientIds/CLIENT_ID:handleRedirect` eintragen. Client-ID und Client-Secret weder in Git, Terraform-State noch GitHub speichern.
6. Client-ID und Client-Secret liegen als JSON-Objekt mit den beiden nicht leeren String-Feldern `client_id` und `client_secret` in der aktiven Version des bereits angelegten Secret-Manager-Secrets `vk-pre-gematik-iap-oauth-bootstrap`. Der GitHub-Deployer erhaelt `roles/secretmanager.secretAccessor` nur auf diesem Secret. Der Workflow liest die Version ohne Log-Ausgabe, erstellt oder aktualisiert daraus das Kubernetes Secret `versorgungs-kompass-iap-oauth` mit exakt diesen beiden Keys und loescht seine restriktiv berechtigten Temporaerdateien anschliessend. Credential-Werte liegen weder in GitHub-Variablen noch in Terraform-State.
7. Einen starken, nur fuer diese Umgebung genutzten PostgreSQL-Wert erzeugen.
8. Das idempotente Zwischenschema aus `deploy/postgres/pre-gematik/schema.sql` einmal mit `ON_ERROR_STOP` ueber eine kontrollierte PostgreSQL-16-Administrationsverbindung anwenden.
9. `runtime-role.sql` anwenden und danach `grants.sql` mit der verpflichtenden Variable `runtime_role=vk_app_runtime` ausfuehren. Damit liegen die Laufzeitrechte ausschliesslich auf der festen `NOLOGIN`-Rolle; `PUBLIC` darf im Schema `public` keine Objekte erstellen.
10. Den Cloud-SQL-`BUILT_IN`-User aus `DB_USER` ueber die Admin-API mit `databaseRoles=[vk_app_runtime]` anlegen. Bei einer vorhandenen Rolle mit `gcloud sql users assign-roles "$DB_USER" --type=BUILT_IN --database-roles=vk_app_runtime --revoke-existing-roles` die Rollenliste auf genau diesen Wert abgleichen; dadurch wird insbesondere eine fruehere Cloud-SQL-Administrationsrolle entfernt. Passwort und Request-Body nur aus restriktiv berechtigten Temporaerdateien lesen, denselben Passwortwert als Secret-Manager-Version unter `DB_PASSWORD_SECRET_NAME` speichern und die Rollenmitgliedschaft vor dem Deployment abfragen. Die genauen Befehle und Grenzen stehen in `deploy/postgres/pre-gematik/README.md`.
11. Den lokalen Vertragscheck ausfuehren; er wendet Schema und Laufzeitrolle in einem temporaeren PostgreSQL-16-Container zweimal an, verbindet sich ueber ein separates Login-Mitglied, prueft effektive Laufzeit- und fehlende DDL-Rechte und fuehrt einen relationalen Smoke-Test ueber alle Tabellen aus.
12. Erst danach den dokumentierten synthetischen Ausgangsbestand anlegen; der Repository-Seed ist nur eine Vorlage und wird nicht automatisch ausgefuehrt. Eine spaetere Echtdatenuebernahme ist ein separater Adminvorgang nach dem [Migrationsplan](SUPABASE_CLOUD_SQL_MIGRATION.md), kein Teil dieses Infrastruktur-Deployments.

Terraform erstellt fuer die Datenbank bewusst nur das Secret-Objekt, nicht dessen geheime Version, die `NOLOGIN`-Laufzeitrolle oder den eingeschraenkten Datenbank-Login. Diese Schritte sind vor dem ersten vollstaendigen Deployment Pflicht. GKE Secret Sync materialisiert danach das Datenbank-Kubernetes-Secret mit demselben Namen und dem Key `password`. Das separate IAP-OAuth-Bootstrap-Secret existiert bereits ausserhalb dieses Terraform-Roots; Terraform verwaltet daran nur die secret-spezifische Leseberechtigung des Deployers.

Bei einer Passwortrotation aktualisiert GKE Secret Sync zwar das Kubernetes Secret, `DB_PASSWORD` wird von der API aber nur beim Pod-Start als Umgebungsvariable gelesen. Nachdem Cloud-SQL-Nutzer und Secret-Manager-Version konsistent aktualisiert wurden, ist deshalb ein kontrollierter Neustart erforderlich:

```bash
kubectl -n pre-gematik rollout restart deployment/versorgungs-kompass-api
kubectl -n pre-gematik rollout status deployment/versorgungs-kompass-api --timeout=10m
```

## Phase 4: GitHub Environment einrichten

Das zusaetzliche GitHub Environment `pre-gematik` ist bereits angelegt. Aktueller Schutzstand:

| Einstellung | Ist-Stand |
| --- | --- |
| Deployment-Branches | Custom Policy, ausschliesslich `main` |
| Required Reviewer | `TimoFrank` |
| Self-Review | erlaubt (`prevent_self_review=false`), weil derzeit nur ein Maintainer freigeben kann |
| Ziel-URL | wird vom Deploy-Job aus `FRONTEND_BASE_URL` an das GitHub Deployment gemeldet |
| Environment-Secrets | keine GCP-Keys, kein PostgreSQL-Passwort und keine OAuth-Credentials |
| `github-pages` | unveraendert und weiterhin parallel |

Die Environment-Variablen werden erst nach `terraform apply` mit den realen Outputs eingetragen. Wenn spaeter ein zweiter Reviewer zur Verfuegung steht, sollte Self-Review deaktiviert werden.

Die Namen stehen in `config/pre-gematik/variables.env.example`. Werte aus Terraform werden wie folgt zugeordnet:

| GitHub-Variable | Quelle |
| --- | --- |
| `GCP_PROJECT_ID` | Terraform-Output `GCP_PROJECT_ID` |
| `GCP_REGION` | Terraform-Output `GCP_REGION` |
| `GKE_CLUSTER_NAME` | Terraform-Output `GKE_CLUSTER_NAME` |
| `GKE_LOCATION` | Terraform-Output `GKE_LOCATION` |
| `WIF_PROVIDER` | Terraform-Output `WIF_PROVIDER` |
| `DEPLOYER_SERVICE_ACCOUNT` | Terraform-Output `DEPLOYER_SERVICE_ACCOUNT` |
| `GAR_REPOSITORY` | vollstaendiger Terraform-Output `GAR_REPOSITORY`, ohne Image-Namen |
| `FRONTEND_BUCKET` | Terraform-Output `FRONTEND_BUCKET` |
| `DB_NAME` | Terraform-Output `DB_NAME` |
| `DB_USER` | Terraform-Output `DB_USER` |
| `DB_PASSWORD_SECRET_NAME` | Terraform-Output `DB_PASSWORD_SECRET_NAME` |
| `IAP_OAUTH_BOOTSTRAP_SECRET_NAME` | Terraform-Output `IAP_OAUTH_BOOTSTRAP_SECRET_NAME`; enthaelt nur den Secret-Namen |
| `PROFILE_IMAGE_BUCKET` | Terraform-Output `PROFILE_IMAGE_BUCKET` |
| `CONTACT_IMAGE_BUCKET` | Terraform-Output `CONTACT_IMAGE_BUCKET` |
| `CONTACT_NOTE_ATTACHMENT_BUCKET` | Terraform-Output `CONTACT_NOTE_ATTACHMENT_BUCKET` |
| `STAKEHOLDER_LOGO_BUCKET` | Terraform-Output `STAKEHOLDER_LOGO_BUCKET` |
| `CLOUD_SQL_INSTANCE_CONNECTION_NAME` | Terraform-Output `CLOUD_SQL_INSTANCE_CONNECTION_NAME` |
| `GKE_INGRESS_IP_NAME` | Terraform-Output `GKE_INGRESS_IP_NAME` |
| `K8S_NAMESPACE` | Terraform-Output `K8S_NAMESPACE` |
| `IAP_OAUTH_CLIENT_CREDENTIALS_SECRET_NAME` | fester Kubernetes-Secret-Name `versorgungs-kompass-iap-oauth`; keine Credential-Werte |
| `IAP_RESOURCE_ACCESS_GROUP` | Terraform-Output `IAP_RESOURCE_ACCESS_GROUP`; Gruppe wird nur an die zwei erzeugten Backend Services gebunden |
| `API_BASE_URL` | gemeinsamer HTTPS-Origin, ohne abschliessenden Slash oder Pfad |
| `FRONTEND_BASE_URL` | exakt derselbe gemeinsame HTTPS-Origin |

`WIF_PROVIDER` ist der volle Ressourcenname mit numerischer Projektnummer. `GAR_REPOSITORY` hat die Form `REGION-docker.pkg.dev/PROJECT/REPOSITORY`. Bucket-Werte enthalten nur den Namen, kein `gs://`. Der Workflow bricht ab, wenn `API_BASE_URL` und `FRONTEND_BASE_URL` nicht exakt denselben Origin bezeichnen.

Zusaetzlich liegt `IAP_PROJECT_BREAK_GLASS_SHA256` als geschuetztes Environment-Secret vor. Es ist der SHA-256-Pin der kanonisch sortierten, projektweiten IAP-Break-glass-Nutzerliste und kein Zugangswert. Der Workflow liest die Projekt-IAM-Policy nur als Metadatum, verlangt genau eine unbedingte, ausschliesslich aus `user:`-Mitgliedern bestehende Break-glass-Bindung und stoppt bei jeder Mitgliedschaftsaenderung. Der Klartext der Nutzerliste wird weder in Git noch in der Actions-Zusammenfassung ausgegeben.

## Phase 5: Workflow ausfuehren

### Validierung ohne Cloud-Zugriff

In GitHub unter `Actions -> Deploy pre-gematik (GKE Autopilot) -> Run workflow` zuerst ausfuehren mit:

- `validate_only`: aktiviert; dies ist aus Sicherheitsgruenden der Default,
- `image_tag`: leer,
- `require_external_smoke`: deaktiviert.

Die Validierung fuehrt Repository-Checks, Helm-Lint und -Render, Ziel-Frontend-Erzeugung sowie echten Containerstart mit Health Check aus. Sie fordert weder Environment-Freigabe noch GCP-Credentials an.

### Erstes Deployment

Danach denselben Workflow mit `validate_only` deaktiviert ausfuehren. Der Deploy-Job:

1. wartet auf die Freigabe des Environments `pre-gematik`,
2. tauscht das GitHub-OIDC-Token per WIF gegen kurzlebige GCP-Credentials und prueft Projekt, Region, Registry, Cloud SQL, private Buckets sowie den gepinnten Break-glass-Sollzustand,
3. verbindet sich ueber den GKE-DNS-Endpunkt,
4. liest das JSON-formatierte OAuth-Bootstrap-Secret aus Secret Manager ohne Inhaltsausgabe, materialisiert daraus exakt `client_id` und `client_secret` im Kubernetes Secret und validiert dessen Form,
5. baut und pusht ein unveraenderlich getaggtes API-Image inklusive Provenance und SBOM,
6. erzeugt `dist/target/` mit `dataMode: "api"`, `authMode: "iap"` und `requireApiGateway: true`,
7. synchronisiert den exklusiven privaten Frontend-Bucket unter ein versioniertes `releasePrefix`; `contentRevision` bindet den Frontend-Rollout an genau diesen unveraenderlichen Inhalt,
8. deployt das GCP-Helm-Overlay, uebergibt den Frontend-Bucket und wartet auf GKE Secret Sync,
9. ermittelt die reale IAP-Audience, reconciled Helm ein zweites Mal und startet die API kontrolliert neu, damit der per `envFrom` geladene Wert aktiv wird,
10. identifiziert die unterschiedlichen API- und Frontend-Backend-Services anhand ihrer NEGs, bestaetigt IAP auf beiden und bindet die regulaere Testgruppe ressourcenspezifisch an genau diese zwei Services,
11. bestaetigt per echtem `SELECT 1` im API-Container Cloud SQL Auth Proxy, Workload Identity, DB-Nutzer und Secret sowie Existenz und Leserecht fuer alle 30 Tabellen des Pre-Integration-Vertrags,
12. bestaetigt Rollout, IAP-Aktivierung sowie API- und Frontend-Health,
13. prueft, dass gefaelschte, unsignierte IAP-Identity-Header mit HTTP 401 abgewiesen werden.

`require_external_smoke` beim allerersten Lauf deaktiviert lassen, weil DNS und Google Managed Certificate noch konvergieren koennen. Sobald Zertifikat und DNS aktiv sind, erneut mit aktiviertem externem Boundary-Test fuer `/` und `/api/healthz` ausfuehren. Ohne Benutzer- oder Service-Account-IAP-Token ist dies kein Anwendungs-Healthcheck: Eine nicht angemeldete Anfrage muss durch IAP mit 302, 401 oder 403 abgefangen werden; ein oeffentliches HTTP 200 gilt als Fehler. Den eigentlichen Healthcheck fuehrt der Workflow clusterintern aus.

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

Der aufrufende Workflow kann die Rechte nicht ueber die im wiederverwendbaren Workflow definierten Rechte hinaus erhoehen. Environment-Werte stammen weiterhin ausschliesslich aus `pre-gematik`.

## Abnahmecheckliste

### Infrastruktur

- [ ] Terraform-Plan wurde geprueft und in das richtige GCP-Projekt angewendet.
- [ ] Falls `BILLING_ACCOUNT_ID` gesetzt ist, existiert das projektbezogene Warnbudget; allen Beteiligten ist bekannt, dass es kein Ausgabenlimit ist.
- [ ] GKE nutzt Autopilot, private Nodes und ausschliesslich den extern erreichbaren DNS-Control-Plane-Endpunkt.
- [ ] Artifact Registry, Cloud SQL, Secret Manager und alle vier Buckets liegen in der vorgesehenen Region.
- [ ] Der gemeinsame Frontend-/API-DNS-Name zeigt auf `GKE_INGRESS_IP_ADDRESS`.
- [ ] Google Managed Certificate meldet `Active`.
- [ ] Der GKE Ingress routet `/` zum Frontend und `/api` zur API; beide Backends sind durch IAP geschuetzt.
- [ ] IAP-Zugriff ist nur den benannten Testpersonen oder -gruppen gewaehrt.
- [ ] Projektweiter IAP-Zugriff enthaelt nur den Break-glass-Nutzer; die Testgruppe ist separat auf API- und Frontend-Backend-Service gebunden.

### Identitaet und Secrets

- [ ] Im Repository und in GitHub existiert kein Service-Account-JSON-Key.
- [ ] Der WIF-Provider ist auf Repository und Environment eingeschraenkt.
- [ ] `pre-gematik` verlangt Freigabe und beschraenkt Deployment-Branches.
- [ ] Secret Manager enthaelt mindestens eine aktive Passwortversion.
- [ ] `vk-pre-gematik-iap-oauth-bootstrap` enthaelt gueltiges JSON mit nicht leeren `client_id`- und `client_secret`-Strings; der Deployer darf nur dieses Bootstrap-Secret lesen.
- [ ] Fuer Passwortrotation ist der anschliessende API-Rollout dokumentiert und getestet.
- [ ] Der API-Workload-Principal darf nur das benoetigte Secret, Cloud SQL und die drei Daten-Buckets verwenden.
- [ ] Der getrennte Frontend-Workload-Principal darf nur das statische Artefakt aus dem Frontend-Bucket lesen.
- [ ] Der GitHub-Deployer darf Registry, Frontend-Bucket, Cluster-Deployment und nur lesend Backend-Service/Projektmetadaten verwenden.

### Anwendung

- [ ] Validate-only-Workflow ist gruen.
- [ ] API-Image-Digest und Git-Revision stehen in der Workflow-Zusammenfassung.
- [ ] Helm Release `versorgungs-kompass` ist im Namespace `pre-gematik` deployed.
- [ ] Das Datenbank-Kubernetes-Secret wurde von GKE Secret Sync angelegt; das getrennte OAuth-Kubernetes-Secret wurde vom Workflow ohne Inhaltsausgabe materialisiert und auf exakt zwei Keys geprueft.
- [ ] Der Datenbank-Smoke `SELECT 1` ueber den Cloud SQL Auth Proxy ist gruen.
- [ ] Der Datenbank-Vertragscheck bestaetigt alle 30 Pre-Integration-Tabellen und deren Leserecht fuer den App-Nutzer; ein unvollstaendiges Schema bricht das Deployment ab.
- [ ] `IAP_JWT_AUDIENCE` entspricht dem tatsaechlichen GKE Backend Service.
- [ ] Interner `/api/healthz`-Smoke Test ist gruen.
- [ ] Unsigned-Header-Test liefert 401.
- [ ] Externer unauthentifizierter Smoke Test liefert keinen oeffentlichen 200-Status.
- [ ] IAP-Login einer freigegebenen Testperson funktioniert.
- [ ] Ein aktives `profiles`-Mapping liefert die erwartete Rolle; unbekannte Personen erhalten 403.
- [ ] Lesen, Anlegen, Aendern und Zuruecksetzen eines synthetischen Kontakts funktionieren.
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

- API: vorherigen unveraenderlichen GAR-Tag erneut deployen oder kontrolliert `helm rollback` verwenden.
- Frontend: eine vorherige Objektgeneration des versionierten Buckets wiederherstellen; API und `dist/target/` immer als zusammengehoeriges Release behandeln.
- Datenbank: vor Migrationen und groesseren Tests einen Cloud-SQL-Backup-/PITR-Punkt pruefen.
- Nach Abschluss benoetigte Testergebnisse exportieren, Testzugriffe entziehen, Deletion Protection bewusst und separat aufheben und die temporaeren Ressourcen ueber Terraform abbauen.

Ein Rollback ersetzt weder Schema-Kompatibilitaetspruefung noch Datenwiederherstellung. Bei fehlgeschlagenem Audience-Bootstrap bleibt die API absichtlich fail-closed; zuerst Ingress/IAP korrigieren und den Workflow erneut ausfuehren.

Nach Ende der Pre-Integration werden persoenliche Break-glass-/OAuth-Zugaenge, temporaere Gruppenbindungen, GitHub-Environment-Werte und GCP-Ressourcen entzogen beziehungsweise nach dokumentierter Ergebnissicherung abgebaut. Ein erfolgreicher Test ist ein technischer Nachweis, aber keine implizite Betriebs-, Security-, Datenschutz- oder Produktivfreigabe.
