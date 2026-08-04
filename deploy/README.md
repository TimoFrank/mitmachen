# Deployment-Artefakte

Dieser Ordner enthält die ausführbaren Artefakte für Pre-Integration und Gematik-PoC.

| Zweck | Führender Pfad |
| --- | --- |
| Jenkins-Referenzpipeline | [`jenkins/Jenkinsfile.gematik`](jenkins/Jenkinsfile.gematik) |
| Helm-Chart | [`helm/versorgungs-kompass/`](helm/versorgungs-kompass/) |
| Operatives Target-Overlay | [`helm/versorgungs-kompass/values-target-gematik.yaml`](helm/versorgungs-kompass/values-target-gematik.yaml) |
| Historisches RC.5-/PoC-Overlay | [`helm/versorgungs-kompass/values-poc-gematik.yaml`](helm/versorgungs-kompass/values-poc-gematik.yaml) |
| PoC-Datenbank | [`postgres/poc-gematik/`](postgres/poc-gematik/) |
| GCP-Pre-Integration | [`terraform/gcp-autopilot/`](terraform/gcp-autopilot/) |
| Pre-Integrationsdatenbank | [`postgres/pre-gematik/`](postgres/pre-gematik/) |
| Datenmigrationswerkzeug | [`migration-operator/`](migration-operator/) |
| TYPO3-#Mitmachen-Connector | [`typo3/mitmachen_connector/`](typo3/mitmachen_connector/) |

## Release-Grenze

```text
Pages-Demo:      frontend/ + public/ -> dist/pages/  -> GitHub Pages
PoC-Frontend:    frontend/ + public/ -> dist/target/ -> internes Hosting
PoC-API:         api/                -> Image-Digest -> Helm/Kubernetes
```

Ein aktueller PoC-Release wird ausschließlich aus einem unveränderlichen,
signierten und annotierten Produkt-Tag `vX.Y.Z` frisch gebaut. Vor dem Build
werden autoritative Quell-URL, geschützter `main`, Tagobjekt, Zielcommit,
Signer-Fingerprint und Produktversion gemeinsam geprüft. Target-Frontend und
API-Image stammen aus demselben Commit; ihre Digests werden gemeinsam
protokolliert. Spätere Änderungen auf `main`, in lokalen Varianten oder auf
GitHub Pages verändern den RC nicht. Eine PoC-Korrektur erhöht den Patchstand
und erhält einen eigenen signierten Tag.

RC.2 bis RC.5 bleiben unveränderte historische Evidenz und sind kein
operativer Pipeline-Eingang. Ebenso werden weder Pages- noch private
GKE-Artefakte in den Target-Pfad promotet. Die Software Factory baut mit OIDC;
IAP- oder persönliche GCP-Werte sind keine Build-Eingaben.

Das PoC-Overlay lässt plattformspezifisches Routing und Frontend-Hosting offen. Die Zielplattform bindet den API-`ClusterIP`-Service und `dist/target/` unter derselben internen HTTPS-Adresse ein. Ohne einen konfigurierten Frontend-Adapter archiviert Jenkins das Target-Frontend als Buildartefakt.

Die Anwendung verwendet derzeit feste `public.*`-Objekte. Deshalb nutzt der PoC eine kleine dedizierte PostgreSQL-Datenbank. Das [Datenbank-Runbook](postgres/poc-gematik/README.md) trennt Schema, geschützte Datenübernahme und die Zuordnung der vereinbarten OIDC-Identitäten. Der Datenstand wird nicht mit dem RC gebaut oder in Jenkins archiviert.

Die einmalige Quellübernahme und der Single-Writer-Cutover stehen im
[GitLab-/Software-Factory-Übergaberunbook](../dokumentation/betrieb-und-deployment/GITLAB_SOFTWARE_FACTORY_UEBERGABE.md).
Der vollständige Build- und Deploymentablauf steht im
[Deployment-Runbook](../dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md).
Umfang und Ressourcen beschreibt der
[PoC-Durchstich](../dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md).
