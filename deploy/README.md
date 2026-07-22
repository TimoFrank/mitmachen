# Deployment-Artefakte

Dieser Ordner enthält die ausführbaren Artefakte für Pre-Integration und Gematik-PoC.

| Zweck | Führender Pfad |
| --- | --- |
| Jenkins-Referenzpipeline | [`jenkins/Jenkinsfile.gematik`](jenkins/Jenkinsfile.gematik) |
| Helm-Chart | [`helm/versorgungs-kompass/`](helm/versorgungs-kompass/) |
| PoC-Overlay | [`helm/versorgungs-kompass/values-poc-gematik.yaml`](helm/versorgungs-kompass/values-poc-gematik.yaml) |
| PoC-Datenbank | [`postgres/poc-gematik/`](postgres/poc-gematik/) |
| GCP-Pre-Integration | [`terraform/gcp-autopilot/`](terraform/gcp-autopilot/) |
| Pre-Integrationsdatenbank | [`postgres/pre-gematik/`](postgres/pre-gematik/) |
| Datenmigrationswerkzeug | [`migration-operator/`](migration-operator/) |

## Release-Grenze

```text
Pages-Demo:      frontend/ + public/ -> dist/pages/  -> GitHub Pages
PoC-Frontend:    frontend/ + public/ -> dist/target/ -> internes Hosting
PoC-API:         api/                -> Image-Digest -> Helm/Kubernetes
```

Ein PoC-Release wird aus einem unveränderlichen RC-Tag gebaut. Target-Frontend und API-Image stammen aus demselben Commit. Der Image-Digest und das Frontend-Manifest werden gemeinsam protokolliert. Spätere Änderungen auf `main`, in lokalen Varianten oder auf GitHub Pages verändern den RC nicht; eine PoC-Korrektur erhält einen neuen Tag.

Das PoC-Overlay lässt plattformspezifisches Routing und Frontend-Hosting offen. Die Zielplattform bindet den API-`ClusterIP`-Service und `dist/target/` unter derselben internen HTTPS-Adresse ein. Ohne einen konfigurierten Frontend-Adapter archiviert Jenkins das Target-Frontend als Buildartefakt.

Die Anwendung verwendet derzeit feste `public.*`-Objekte. Deshalb nutzt der PoC eine kleine dedizierte PostgreSQL-Datenbank. Das [Datenbank-Runbook](postgres/poc-gematik/README.md) trennt Schema, geschützte Datenübernahme und die Zuordnung der vereinbarten OIDC-Identitäten. Der Datenstand wird nicht mit dem RC gebaut oder in Jenkins archiviert.

Der vollständige Ablauf steht im [Deployment-Runbook](../dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md). Umfang und Ressourcen beschreibt der [PoC-Durchstich](../dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md).
