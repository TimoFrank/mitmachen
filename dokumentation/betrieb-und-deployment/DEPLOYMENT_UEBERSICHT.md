# Deployment-Uebersicht

Diese Uebersicht klaert, welche Auslieferungswege aktiv sind und welche nur noch als historische Referenz im Repository liegen.

## Aktiver Standardpfad

Der einfache Standardpfad ist GitHub Pages:

```text
Quellordner -> scripts/sync_github_pages.sh -> docs/ -> GitHub Pages
```

`docs/` ist dabei eine Publish-Kopie. Gepflegt werden die Quellordner `frontend/` und `public/`.

## Lokale Demo

Die Demo unter `frontend/demo/` bleibt aktiv, aber nur als leichtgewichtige Ansicht mit fiktiven Daten. Sie ist hilfreich fuer README-Screenshots, technische Erstpruefung und Abstimmung.

Sie ist kein eigener GCP-Deploypfad mehr. Wenn GitHub Pages aktualisiert wird, kopiert `scripts/sync_github_pages.sh` die Demo nach `docs/demo/`.

## Neues gematik Kubernetes-Zielbild

Das neue Zielbild fuer die interne Infrastrukturuebernahme steht in `DEPLOYMENT_GEMATIK_K8S.md`.
Die dazugehoerige kompakte Konzeption steht in `GEMATIK_K8S_ZIELKONZEPT.md`.
Der konkrete Uebergabeabschnitt fuer gematik IT heisst dort `Implementierung, Deployment und Migration fuer gematik IT`.

Es nutzt:

- Software Factory / Jenkins
- Artifact Registry
- Kubernetes Namespace im Shared-Projekt
- Helm Chart unter `dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass`
- Shared Postgres
- statisches Frontend-Hosting in einem separaten Bucket-/Hosting-Projekt

Cloud Run ist nicht mehr Zielarchitektur.
Ein lokaler Jenkins-/Docker-Compose-Simulator ist bewusst nicht Teil des aktiven Repos. Die konkrete Pipeline-Ausfuehrung soll in der gematik Software Factory angebunden werden.

## Archivierter GCP-/Cloud-Run-Migrationsentwurf

Der fruehere GCP-Migrationsentwurf fuer Cloud Run liegt unter `archiv/gcp-prototypen/uebergabe/DEPLOYMENT_GCP_GEMATIK.md`. Er bleibt als technische Referenz erhalten, ist aber nicht mehr fuehrend.

Die Jenkins-Referenzdatei liegt unter `artefakte/Jenkinsfile.gematik` und folgt dem Kubernetes-Zielbild. Alte Cloud-Run-Kommandos und Prototyp-Dateien liegen im Archiv und duerfen nicht als aktueller Deploypfad gelesen werden.

Der API-Container wird ueber `../../api/Dockerfile` beschrieben. Der fruehere statische Frontend-Container liegt unter `archiv/statischer-frontend-container/`.

## Archivierte GCP-Prototypen

Fruehere GCP-Demos liegen im Archiv:

- `archiv/gcp-prototypen/statische-demo/`: alter Cloud-Run-Container fuer die rein statische Demo `versorgungs-kompass-demo`.
- `archiv/gcp-prototypen/cloud-sql-prototyp/`: alter Cloud-SQL-Prototyp `versorgungs-kompass-gcp-demo` mit eigener Node-Laufzeit.
- `archiv/gcp-prototypen/iap-experiment/`: abgebrochener Cloud-Run/IAP-Versuch vom 26. Juni 2026 mit kombiniertem Frontend/API-Container.
- `archiv/gcp-prototypen/protokoll/`: alte Schrittprotokolle des privaten GCP-Tests.
- `archiv/gcp-prototypen/uebergabe/`: alte Uebergabenotizen und GCP-Migrationspakete.

Diese Dateien bleiben zur Nachvollziehbarkeit erhalten, sind aber nicht Teil des normalen Build-, Check- oder Publish-Pfads.

Insbesondere `iap-experiment/` ist kein Ersatz fuer das gematik Kubernetes-Zielbild. Fuer neue Zielarbeit gelten `DEPLOYMENT_GEMATIK_K8S.md`, das Helm Chart unter `dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass`, `api/Dockerfile` und das statische Frontend-Artefakt aus `docs/`.
