# GCP Step 9 Formate und Expertenkreis in Cloud SQL

Stand: 2026-06-06

Status: privat umgesetzt, deployed und live geprueft.

## Ziel

Formate und Expertenkreis sollen im GCP-Modus nicht mehr aus `localStorage` oder statischen Fallbacks kommen, sondern echte Cloud-SQL-Tabellen nutzen.

## Umgesetzt

Neue Cloud-SQL-Tabellen:

- `formats`
- `format_participants`
- `expert_groups`
- `expert_contacts`
- `expert_organizations`
- `expert_entity_links`

Neue bzw. aktivierte GCP-API-Endpunkte:

- `GET/POST /api/formats`
- `GET/PATCH/DELETE /api/formats/:id`
- `POST /api/formats/:id/participants`
- `PATCH/DELETE /api/formats/:id/participants/:contactId`
- `GET /api/expert-groups`
- `GET/POST /api/expert-contacts`
- `GET/POST /api/expert-organizations`
- `GET/POST /api/expert-entity-links`
- `DELETE /api/expert-entity-links/:id`

Frontend:

- `data/data-service.js` nutzt im GCP-Modus fuer Formate und Expertenkreis jetzt die API.
- Der lokale Fallback bleibt nur fuer echten lokalen/Demo-Modus erhalten.
- Die Original-App-Oberflaeche bleibt unveraendert.

## Initialdaten

Expertenkreis:

- 8 Gruppen
- 268 Expertenkreis-Kontakte
- 220 Expertenkreis-Organisationen
- Quelle: `data/expertenkreis-data.js`

Formate:

- 3 initiale Pilot-Formate
- 9 Teilnehmerzuordnungen
- Kontakte stammen aus dem vorhandenen GCP-Demo-Kontaktdatensatz.

## Live-Stand

Cloud Run:

```text
Service: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00020-kag
Traffic: 100 Prozent
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:9bdf8bcf-d96a-4d0c-afa2-86ef8f516e4b
```

## Geprueft

API:

```text
GET /api/healthz -> ok, Revision 00020-kag
GET /api/ops/summary -> 3 Formate, 9 Format-Teilnehmer, 268 Expertenkreis-Kontakte, 220 Expertenkreis-Organisationen
GET /api/formats -> 3 Formate
GET /api/expert-contacts -> 268 Kontakte
GET /api/expert-organizations -> 220 Organisationen
```

Schreibtest:

- Testformat angelegt
- Teilnehmer hinzugefuegt
- Teilnehmerstatus aktualisiert
- Expertenkreis-Kontaktverknuepfung angelegt
- Expertenkreis-Kontaktverknuepfung geloescht
- Testformat geloescht

Browser-QA:

- Original-Formate-Tab zeigt 3 Formate.
- Jedes initiale Format zeigt 3 Teilnehmer.
- Original-Expertenkreis-Tab zeigt 268 von 268 Kontakten.
- Keine Browser-Konsolenfehler.

## Grenzen

Noch nicht produktionsreif:

- keine echte Authentifizierung
- keine serverseitige Rollenpruefung
- keine dedizierte Admin-Oberflaeche fuer Expertenkreis-Stammdatenpflege
- keine produktive Datenmigration aus Supabase

Fuer den Organisationsbetrieb muessen Zugriffsschutz, Restore-Test, Rollenpruefung und Monitoring-Alerts weiterhin final geklaert werden.
