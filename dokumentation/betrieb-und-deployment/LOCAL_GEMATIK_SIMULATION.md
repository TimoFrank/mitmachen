# Lokale gematik Simulation

Diese Simulation prueft die gematik-Zielarchitektur privat, ohne gematik-IT-Systeme zu benoetigen.

Sie ist kein Produktivbetrieb und kein Ersatz fuer die gematik Software Factory. Sie ist ein nachvollziehbarer Probelauf, den IT-Kollegen spaeter auf echte Jenkins-, Kubernetes-, Registry-, Postgres- und Hosting-Ziele uebertragen koennen.

## Was wird simuliert?

| gematik-Ziel | Lokale Simulation |
| --- | --- |
| Jenkins Pipeline | `scripts/simulate_gematik_pipeline.sh` oder `Jenkinsfile.local-gematik` |
| Artifact Registry | lokale Docker Registry auf `localhost:5001` |
| Kubernetes Namespace | `kind`-Cluster mit Namespace `versorgungs-kompass-local` |
| Shared Postgres | lokaler Postgres auf `localhost:55432` |
| Statisches Frontend-Hosting | Nginx auf `http://localhost:8088` |
| Gateway-/SSO-Header | Test-Header `x-auth-request-email` / `x-auth-request-user` |
| Helm Deployment | Chart `deploy/helm/versorgungs-kompass` mit lokalen Values |

Cloud Run, Cloud SQL und IAP bleiben dabei bewusst aussen vor.

## Schnelltest ohne Jenkins

Der schnellste Probelauf nutzt das Shell-Script:

```bash
npm run simulate:gematik -- --dry-run
npm run simulate:gematik
```

Der normale Lauf macht:

1. `npm run check`
2. `docs/` erzeugen
3. ein Ziel-Frontend-Artefakt unter `.local-gematik/frontend-artifact` bauen
4. `dataMode: "api"`, `authMode: "trusted-header"` und `apiBaseUrl` im Artefakt setzen
5. API-Gateway-Audit auf dem Artefakt ausfuehren
6. das statische Artefakt nach `.local-gematik/published-frontend` kopieren

Optionale Stufen:

```bash
npm run simulate:gematik -- --with-helm
npm run simulate:gematik -- --with-docker --with-helm
npm run simulate:gematik -- --with-docker --push-image --with-helm --deploy-k8s
```

`--full` aktiviert alle schweren Stufen inklusive Security, Visual Tests, Docker, Trivy, Push, Helm und Kubernetes-Deploy.

## Lokale Dienste starten

```bash
docker compose -f docker-compose.local-gematik.yml up -d --build registry postgres frontend
```

Optional Jenkins lokal starten:

```bash
docker compose -f docker-compose.local-gematik.yml up -d --build jenkins
```

Jenkins laeuft dann unter:

```text
http://localhost:8082
```

## Lokales Kubernetes starten

Mit `kind`:

```bash
kind create cluster --config deploy/local/kind/cluster.yaml
```

Danach kann ein lokaler Deploy getestet werden:

```bash
npm run simulate:gematik -- --with-docker --push-image --with-helm --deploy-k8s --smoke
```

Hinweis: Die lokale Kubernetes-Simulation nutzt `host.docker.internal` fuer Postgres und Registry. Das ist auf macOS/Docker Desktop passend. In anderen Umgebungen kann ein anderer Hostname oder ein Postgres innerhalb des Clusters sinnvoll sein.

## Jenkins lokal testen

1. Jenkins unter `http://localhost:8082` oeffnen.
2. Neues Pipeline-Job anlegen.
3. Als Pipeline-Datei `Jenkinsfile.local-gematik` verwenden.
4. Zuerst ohne schwere Parameter laufen lassen.
5. Danach schrittweise `RUN_DOCKER`, `RUN_HELM`, `RUN_PUSH` und `DEPLOY_TO_K8S` aktivieren.

Die lokale Jenkins-Datei ist ein Harness. Die echte Zielpipeline bleibt die Root-`Jenkinsfile`.

## Wie wird das spaeter zur gematik migriert?

Die lokalen Werte werden durch echte Plattformwerte ersetzt:

| Lokal | gematik |
| --- | --- |
| `localhost:5001` | Artifact Registry |
| `.local-gematik/published-frontend` | gematik Frontend-Bucket-/Hosting-Pfad |
| `kind` Namespace | zugewiesener Kubernetes-Namespace |
| lokaler Postgres | gematik Shared Postgres |
| Test-Header | Gateway-/SSO-gepruefte Header |
| `Jenkinsfile.local-gematik` | Root-`Jenkinsfile` in der Software Factory |

Wichtig ist die Reihenfolge:

1. Pipeline lokal trocken laufen lassen.
2. Lokale Artefakte und Helm-Manifest pruefen.
3. Lokalen Kubernetes-Deploy testen.
4. Erst dann dieselben Werte in der gematik Software Factory als Credentials/Parameter abbilden.
5. Im gematik-Zielbetrieb nur die Root-`Jenkinsfile` verwenden.

## Ergebnisartefakte

Nach einem lokalen Lauf liegen die wichtigsten Ergebnisse hier:

- `.local-gematik/frontend-artifact/`: Ziel-Frontend mit API-Konfiguration
- `.local-gematik/published-frontend/`: statische Hosting-Kopie
- `.local-gematik/versorgungs-kompass-rendered.yaml`: gerendertes Helm-Manifest

Diese Dateien sind lokale Build-Artefakte und werden nicht versioniert.
