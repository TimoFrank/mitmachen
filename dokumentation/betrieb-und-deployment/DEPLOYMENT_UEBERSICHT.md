# Deployment-Uebersicht

Diese Uebersicht klaert, welche Auslieferungswege aktiv sind und welche nur noch als historische Referenz im Repository liegen.

## Aktiver Standardpfad

Der einfache Standardpfad ist GitHub Pages:

```text
Quellordner -> scripts/sync_github_pages.sh -> docs/ -> GitHub Pages
```

`docs/` ist dabei eine Publish-Kopie. Gepflegt werden die Quellordner `app/`, `login/`, `map/`, `data/`, `public/`, `pages/` und `examples/`.

## Lokale Demo

Die Demo unter `examples/demo/` bleibt aktiv, aber nur als leichtgewichtige Ansicht mit fiktiven Daten. Sie ist hilfreich fuer README-Screenshots, technische Erstpruefung und Abstimmung.

Sie ist kein eigener GCP-Deploypfad mehr. Wenn GitHub Pages aktualisiert wird, kopiert `scripts/sync_github_pages.sh` die Demo nach `docs/demo/`.

## Neues gematik Kubernetes-Zielbild

Das neue Zielbild fuer die interne Infrastrukturuebernahme steht in `DEPLOYMENT_GEMATIK_K8S.md`.

Es nutzt:

- Software Factory / Jenkins
- Artifact Registry
- Kubernetes Namespace im Shared-Projekt
- Helm Chart unter `deploy/helm/versorgungs-kompass`
- Shared Postgres
- statisches Frontend-Hosting in einem separaten Bucket-/Hosting-Projekt

Cloud Run ist nicht mehr Zielarchitektur.

## Archivierter GCP-/Cloud-Run-Migrationsentwurf

Der fruehere GCP-Migrationsentwurf fuer Cloud Run ist in `DEPLOYMENT_GCP_GEMATIK.md` beschrieben. Er bleibt als technische Referenz erhalten, ist aber nicht mehr fuehrend.

Der aktuelle Root-`Jenkinsfile` folgt dem Kubernetes-Zielbild. Alte Cloud-Run-Kommandos und Prototyp-Dateien liegen im Archiv und duerfen nicht als aktueller Deploypfad gelesen werden.

## Archivierte GCP-Prototypen

Fruehere GCP-Demos liegen im Archiv:

- `archiv/gcp-prototypen/statische-demo/`: alter Cloud-Run-Container fuer die rein statische Demo `versorgungs-kompass-demo`.
- `archiv/gcp-prototypen/cloud-sql-prototyp/`: alter Cloud-SQL-Prototyp `versorgungs-kompass-gcp-demo` mit eigener Node-Laufzeit.
- `archiv/gcp-prototypen/protokoll/`: alte Schrittprotokolle des privaten GCP-Tests.
- `archiv/gcp-prototypen/uebergabe/`: alte Uebergabenotizen und GCP-Migrationspakete.

Diese Dateien bleiben zur Nachvollziehbarkeit erhalten, sind aber nicht Teil des normalen Build-, Check- oder Publish-Pfads.
