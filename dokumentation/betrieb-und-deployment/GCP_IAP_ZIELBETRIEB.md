# GCP-IAP-Zielbetrieb

Der Versorgungs-Kompass nutzt zwei bewusst getrennte Laufwege:

- GitHub Pages bleibt die persoenliche Testumgebung mit Supabase Auth und Supabase-Datenpfad.
- Cloud Run ist die Zukunftsvariante mit Cloud SQL/Postgres und Google Identity-Aware Proxy (IAP).

## Cloud Run

Der Zielbetrieb laeuft als kombinierter Dienst:

- Service: `versorgungs-kompass-frontend`
- Region: `europe-west3`
- Projekt: `steam-capsule-341212`
- Datenbank: Cloud SQL `versorgungs-kompass-gcp-demo-db`, Datenbank `versorgungs_kompass`
- Container: `Dockerfile.iap`
- Frontend-Artefakt: `.cloud-run-frontend/`, erzeugt aus `docs/` und danach auf `dataMode: "api"`, `authMode: "iap"` und same-origin API umgeschrieben

Der Browser ruft API und Frontend same-origin auf. Dadurch gibt es keine Cross-Origin-IAP-Probleme zwischen statischem Frontend und API.

## Aktueller IAP-Status

IAP ist am Cloud-Run-Service aktiviert:

```bash
gcloud run services describe versorgungs-kompass-frontend \
  --project steam-capsule-341212 \
  --region europe-west3 \
  --format='value(metadata.annotations.run.googleapis.com/iap-enabled)'
```

Der Zugriff fuer `timofrank@icloud.com` ist auf Projektebene gesetzt:

```bash
gcloud projects add-iam-policy-binding steam-capsule-341212 \
  --member='user:timofrank@icloud.com' \
  --role='roles/iap.httpsResourceAccessor'
```

Das Projekt liegt aktuell nicht in einer Google Organization. Google verlangt deshalb fuer IAP noch die einmalige OAuth-Client-Konfiguration in der Cloud Console. Bis diese Konfiguration abgeschlossen ist, antwortet IAP mit:

```text
502 Empty Google Account OAuth client ID(s)/secret(s).
```

Dieser Schritt ist nicht per `gcloud iap oauth-brands` moeglich, weil der Befehl fuer dieses Projekt `Project must belong to an organization` meldet.

## Accounts Anlegen

Ein Account besteht aus zwei Teilen:

1. Google-Zugriff auf die IAP-geschuetzte Cloud-Run-App.
2. App-Profil in Postgres fuer Rolle, Anzeige und Owner-Zuordnung.

Google-Zugriff:

```bash
gcloud projects add-iam-policy-binding steam-capsule-341212 \
  --member='user:name@example.org' \
  --role='roles/iap.httpsResourceAccessor'
```

App-Profil:

```sql
insert into profiles (id, email, display_name, initials, role, active)
values (
  gen_random_uuid()::text,
  'name@example.org',
  'Vorname Nachname',
  'VN',
  'editor',
  true
)
on conflict (id) do nothing;
```

Rollen:

- `viewer`: lesen
- `editor`: bearbeiten
- `admin`: administrieren

Die API ordnet IAP-Nutzer ueber die E-Mail-Adresse einem aktiven Eintrag in `profiles` zu. Ohne passendes aktives Profil liefert die API `403`.

## GitHub Pages Testumgebung

GitHub Pages wird aus `docs/` veroeffentlicht und nutzt wieder:

- `dataMode: "supabase"`
- Supabase URL und Publishable Key in `docs/data/supabase-config.js`
- Supabase Browser SDK in Login und App

Vor dem Push:

```bash
bash scripts/sync_github_pages.sh
npm run check
```

Nach dem Push:

```bash
SUPABASE_LIVE_STATUS=verified npm run verify:publication
```
