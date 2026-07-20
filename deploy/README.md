# Deployment-Einstieg

Dieser Ordner enthaelt die einzigen fuehrenden, ausfuehrbaren Zielbetriebsartefakte. Die frueheren GCP-Prototypen wurden aus dem Produkt-Repository entfernt. Ein kleiner, ausdruecklich als historisch markierter statischer Frontend-Container bleibt nur als Architekturbeleg unter `dokumentation/betrieb-und-deployment/archiv/` und darf nicht deployed werden.

| Zweck | Fuehrender Pfad |
| --- | --- |
| Jenkins-Referenzpipeline | [`jenkins/Jenkinsfile.gematik`](jenkins/Jenkinsfile.gematik) |
| Helm-Chart | [`helm/versorgungs-kompass/`](helm/versorgungs-kompass/) |
| GCP-Pre-Integrations-Terraform | [`terraform/gcp-autopilot/`](terraform/gcp-autopilot/) |
| Temporaerer Pre-Integrations-Postgresvertrag | [`postgres/pre-gematik/`](postgres/pre-gematik/) |
| Einmaliger privater Datenmigrationspfad | [`migration-operator/`](migration-operator/) |

Die zugehoerigen, maschinenlesbaren Umgebungsvertraege stehen unter [`config/`](../config/README.md). Es gibt keine parallelen Kopien der Deployment-Artefakte.

## Verbindliche Buildgrenze

```text
Pages-Demo:         frontend/ + public/ -> dist/pages  -> GitHub Pages
Zielpfad:           frontend/ + public/ -> dist/target -> Pre-Integration/Zielhosting
API-Zielpfad:       api/                -> Image-Digest -> Helm/GKE
```

GKE, Jenkins und Zielhosting duerfen weder `dist/pages/` noch den Pages-/Supabase-Pfad als Eingabe verwenden. Der Terraform-Remote-State bleibt durch seinen konfigurierten Backend-Praefix stabil; eine Verzeichnisverschiebung fuehrt niemals automatisch ein `terraform apply` aus.

## Einmalige Anpassungen ausserhalb des Repositorys

- Ein externer Jenkins-Job muss seinen **Script Path** auf `deploy/jenkins/Jenkinsfile.gematik` umstellen.
- Externe Terraform- oder CI-Jobs müssen ihr **Working Directory** auf `deploy/terraform/gcp-autopilot` umstellen. Vor dem ersten Plan am neuen Ort ist dort `terraform init -reconfigure` auszuführen und zu bestätigen, dass Bucket und Präfix weiterhin auf denselben Remote State zeigen. Das ändert keinen Cloud-Zustand und führt kein `terraform apply` aus.

## Pages-Rollback

Der Actions-Build aus `frontend/` und `public/` ist der einzige gepflegte Pages-Weg. Ein fehlerhaftes Pages-Release wird durch einen Revert auf `main` zurückgenommen; der Pages-Workflow baut und veröffentlicht anschließend den vorherigen Quellstand neu. Die frühere `docs/`-Kopie ist bewusst stillgelegt und kein paralleler Fallback. Ihre Reaktivierung wäre eine gesonderte Notfallmigration mit Commit-Revert und Änderung der Pages-Repository-Einstellung.
