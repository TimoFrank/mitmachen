# Archiv: Statischer Frontend-Container

Dieser Ordner enthaelt den alten Nginx-Container fuer die Auslieferung des statischen `docs/`-Artefakts.

Der aktuelle gematik-Zielpfad nutzt kein Frontend-Container-Deployment mehr. Das Frontend wird als statisches Artefakt gebaut und in den vorgesehenen Bucket-/Hosting-Pfad ausgeliefert. Die API laeuft separat als Container im Kubernetes-Namespace.

Aktive Referenz: `../../DEPLOYMENT_GEMATIK_K8S.md`
