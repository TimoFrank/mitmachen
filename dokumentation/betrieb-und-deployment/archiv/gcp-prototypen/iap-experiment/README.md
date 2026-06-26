# Cloud-Run-IAP-Experiment

Status: archiviert, nicht Zielarchitektur.

Dieses Experiment entstand am 26. Juni 2026 beim Versuch, den Versorgungs-Kompass als kombinierten Cloud-Run-Dienst mit statischem Frontend, Node-API, Cloud SQL/Postgres und Google Identity-Aware Proxy zu betreiben.

Es ist fachlich und technisch nicht der gematik-Zielpfad. Die gueltige Zielarchitektur steht in:

- `../../../DEPLOYMENT_GEMATIK_K8S.md`
- `../../../DEPLOYMENT_UEBERSICHT.md`
- `../../../../../ZIEL-README.md`

## Warum archiviert?

Die ZIEL-README legt fest, dass Cloud Run fuer das gematik Setup vom Tisch ist. Das Zielbild ist stattdessen:

```text
Software Factory / Git Repo
-> Jenkins Pipeline
-> Artifact Registry
-> Helm Chart
-> Kubernetes Namespace
-> Node.js API
-> Shared Postgres
```

Das Frontend wird dabei nicht als Cloud-Run-Service betrieben. Jenkins erzeugt das statische `docs/`-Artefakt und synchronisiert es in den gematik Bucket-/Hosting-Pfad. Die API laeuft als Container im Kubernetes-Namespace.

## Experimentstand

- Cloud-Run-Service: `versorgungs-kompass-frontend`
- Region: `europe-west3`
- Projekt: `steam-capsule-341212`
- Datenbank-Experiment: Cloud SQL `versorgungs-kompass-gcp-demo-db`, Datenbank `versorgungs_kompass`
- Container-Experiment: `Dockerfile.iap` in diesem Archivordner
- Frontend-Artefakt: `.cloud-run-frontend/`, lokal generiert und nicht versioniert

IAP war am Cloud-Run-Service aktiviert, der Zugriff blieb aber durch fehlende OAuth-Client-Konfiguration blockiert:

```text
502 Empty Google Account OAuth client ID(s)/secret(s).
```

## Abgrenzung

Dieses Experiment darf nicht als aktueller Deploymentpfad, Zielbetrieb oder Migrationsplan gelesen werden. Es bleibt nur als technische Nachvollziehbarkeit erhalten.

Aktuell gilt:

- GitHub Pages + Supabase bleiben die laufende Test-/Ist-Umgebung.
- Cloud-Run-/Cloud-SQL-Prototypen bleiben Archivmaterial.
- Das neue Zielbild ist gematik Kubernetes mit Helm, Shared Postgres, statischem Frontend-Hosting und Gateway-/SSO-Headern.
