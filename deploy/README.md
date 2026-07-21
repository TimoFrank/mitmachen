# Deployment-Einstieg

Dieser Ordner enthaelt die einzigen fuehrenden, ausfuehrbaren Artefakte fuer den
gematik-PoC und einen moeglichen spaeteren Zielpfad. Der aktuelle Auftrag ist ein
befristeter Non-Prod-Durchstich mit synthetischen Daten, keine Produktivsetzung.
Scope und Ressourcen stehen im
[PoC-Einstieg](../dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md),
die revisionsfeste Uebergabe in der
[Release-Candidate-Strategie](../dokumentation/betrieb-und-deployment/RELEASE_CANDIDATE_STRATEGIE.md).

Die frueheren GCP-Prototypen wurden aus dem Produkt-Repository entfernt. Ein kleiner, ausdruecklich als historisch markierter statischer Frontend-Container bleibt nur als Architekturbeleg unter `dokumentation/betrieb-und-deployment/archiv/` und darf nicht deployed werden.

| Zweck | Fuehrender Pfad |
| --- | --- |
| Jenkins-Referenzpipeline fuer Software-Factory-Anbindung | [`jenkins/Jenkinsfile.gematik`](jenkins/Jenkinsfile.gematik) |
| Helm-Chart | [`helm/versorgungs-kompass/`](helm/versorgungs-kompass/) |
| Minimales gematik-PoC-Overlay | [`helm/versorgungs-kompass/values-poc-gematik.yaml`](helm/versorgungs-kompass/values-poc-gematik.yaml) |
| Disponibler synthetischer PoC-Datenbank-Bootstrap | [`postgres/poc-gematik/`](postgres/poc-gematik/) |
| GCP-Pre-Integrations-Terraform | [`terraform/gcp-autopilot/`](terraform/gcp-autopilot/) |
| Temporaerer Pre-Integrations-Postgresvertrag | [`postgres/pre-gematik/`](postgres/pre-gematik/) |
| Einmaliger privater Datenmigrationspfad | [`migration-operator/`](migration-operator/) |

Die zugehoerigen, maschinenlesbaren Umgebungsvertraege stehen unter [`config/`](../config/README.md). Es gibt keine parallelen Kopien der Deployment-Artefakte.

Das neutrale PoC-Overlay laesst den plattformspezifischen Ingress und das
GCS-basierte Frontend-Sync bewusst deaktiviert. Die gematik-Plattform bindet den
API-`ClusterIP`-Service und das statische Target-Frontend hinter ihrer internen
same-origin Route an; dafuer muessen keine GCS-Buckets in den ersten PoC
uebernommen werden. Ohne optionalen `FRONTEND_BUCKET_URI` archiviert die
Jenkins-Referenz `dist/target/` mit Manifest und Fingerprint direkt als
Buildartefakt.

Die Anwendung verwendet derzeit fest `public.*`. Fuer den PoC ist deshalb eine
kleine dedizierte PostgreSQL-Datenbank erforderlich, deren `public`-Schema
vollstaendig verworfen und neu aufgebaut werden darf. Das
[PoC-Datenbank-Runbook](postgres/poc-gematik/README.md) verwendet nur den
versionierten synthetischen Seed und bindet die vereinbarten OIDC-Testidentitaeten;
es ist keine Datenmigration und kein Schema fuer einen spaeteren Regelbetrieb.

## Verbindliche Buildgrenze

```text
Pages-Demo:         frontend/ + public/ -> dist/pages  -> GitHub Pages
Target-Pfad:        frontend/ + public/ -> dist/target -> Pre-Integration/PoC
API-Target-Pfad:    api/                -> Image-Digest -> Helm/Kubernetes
```

GKE, Jenkins und PoC-Hosting duerfen weder `dist/pages/` noch den Pages-/Supabase-Pfad als Eingabe verwenden. Der PoC wird aus einem unveraenderlichen RC-Tag gebaut; spaetere Commits auf `main` veraendern ihn nicht. Der Terraform-Remote-State bleibt durch seinen konfigurierten Backend-Praefix stabil; eine Verzeichnisverschiebung fuehrt niemals automatisch ein `terraform apply` aus.

Vor einem RC muss das API-Image nicht nur bauen, sondern als Non-Root-Container
starten und `/api/healthz` beantworten. Target-Readiness und der `validate_only`-
Pfad der bestehenden Pre-gematik-Pipeline bilden diesen Smoke-Test ab. Der
aktuelle Vertrag ist in
[Current State](../dokumentation/entwicklung-und-qa/CURRENT_STATE.md) festgehalten.

## Einmalige Anpassungen ausserhalb des Repositorys

- Ein externer Jenkins-Job muss seinen **Script Path** auf `deploy/jenkins/Jenkinsfile.gematik` umstellen.
- Externe Terraform- oder CI-Jobs müssen ihr **Working Directory** auf `deploy/terraform/gcp-autopilot` umstellen. Vor dem ersten Plan am neuen Ort ist dort `terraform init -reconfigure` auszuführen und zu bestätigen, dass Bucket und Präfix weiterhin auf denselben Remote State zeigen. Das ändert keinen Cloud-Zustand und führt kein `terraform apply` aus.

## Pages-Rollback

Der Actions-Build aus `frontend/` und `public/` ist der einzige gepflegte Pages-Weg. Ein fehlerhaftes Pages-Release wird durch einen Revert auf `main` zurückgenommen; der Pages-Workflow baut und veröffentlicht anschließend den vorherigen Quellstand neu. Die frühere `docs/`-Kopie ist bewusst stillgelegt und kein paralleler Fallback. Ihre Reaktivierung wäre eine gesonderte Notfallmigration mit Commit-Revert und Änderung der Pages-Repository-Einstellung.
