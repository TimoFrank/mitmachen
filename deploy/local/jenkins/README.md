# Lokaler Jenkins Harness

Dieser Harness testet die Pipeline-Logik privat. Er ersetzt nicht den gematik-Jenkins.

## Start

```bash
docker compose -f docker-compose.local-gematik.yml up -d --build jenkins registry postgres frontend
```

Jenkins oeffnet lokal unter:

```text
http://localhost:8082
```

Das Testimage deaktiviert den Setup-Wizard und laeuft lokal mit Docker-Socket-Zugriff, damit API-Images aus Jenkins gebaut werden koennen. Fuer echte Umgebungen muss Jenkins normal gehaertet und mit echten Credentials betrieben werden.

## Pipeline anlegen

1. In Jenkins ein neues Pipeline-Job anlegen.
2. Repository auschecken lassen oder `/workspace/versorgungs-crm` nutzen.
3. Als Pipeline-Datei `Jenkinsfile.local-gematik` verwenden.
4. Erst ohne Docker/Kubernetes laufen lassen.
5. Danach `RUN_DOCKER`, `RUN_HELM` und optional `DEPLOY_TO_K8S` aktivieren.

## Lokale Dienste

- Registry: `localhost:5001`
- Postgres: `localhost:55432`
- Statisches Frontend: `http://localhost:8088`

Die echte gematik-Pipeline nutzt spaeter andere Credentials und Zielsysteme, aber dieselben Stufen: Checks, Frontend-Artefakt, API-Image, Helm, Deploy und Smoke Test.
