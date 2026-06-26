# Lokale gematik Simulation

Dieser Ordner enthaelt Hilfsdateien fuer einen privaten Probelauf der gematik-Zielarchitektur.

Die Simulation ist kein gematik-Betrieb. Sie prueft nur, ob Repo, Pipeline, Frontend-Artefakt, API-Container, Helm Chart und Kubernetes-Deploy logisch zusammenpassen.

## Dateien

- `kind/cluster.yaml`: optionaler lokaler Kubernetes-Cluster fuer `kind`.
- `helm-values.local.yaml`: Helm-Overrides fuer den lokalen API-Deploy.
- `jenkins/`: lokales Jenkins-Testimage und Hinweise.

Der schnelle Pipeline-Lauf liegt in `scripts/simulate_gematik_pipeline.sh`.
