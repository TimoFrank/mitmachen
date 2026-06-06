# GCP Backend-Zielbild

Stand: 2026-06-06

Dieses Dokument schliesst Schritt 3 der GCP-Ueberfuehrung ab. Es legt fest, wie der Versorgungs-Kompass nach der statischen Demo schrittweise zu einer echten GCP-basierten Version erweitert werden soll.

Umsetzungsstand: Schritt 4 wurde privat am 2026-06-06 umgesetzt. Details stehen in `GCP_STEP4_PRIVATE_TEST.md`.

## Entscheidung

Fuer den privaten Step-4-Test wird dieses Zielbild gewaehlt:

```text
Browser
-> Cloud Run Service mit Frontend und API
-> Cloud SQL PostgreSQL
```

Die bestehende statische Demo bleibt als stabile Baseline erhalten. Fuer Schritt 4 entsteht zusaetzlich eine backend-faehige Demo-Version, die Kontakte, Organisationen und Aenderungsverlauf nicht mehr im Browser, sondern zentral in Cloud SQL speichert.

Aktueller Step-4-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Cloud SQL: versorgungs-kompass-gcp-demo-db
URL: https://versorgungs-kompass-gcp-demo-qosoetrj7a-ey.a.run.app
```

## Warum Cloud SQL PostgreSQL

Cloud SQL PostgreSQL ist fuer den Versorgungs-Kompass die beste GCP-nahe Supabase-Ersatzkomponente, weil das bestehende Produktmodell bereits relational ist:

- Kontakte gehoeren optional zu Organisationen.
- Kontakte haben Owner/Profile.
- Kontakte haben einen Aenderungsverlauf.
- Die Karte braucht filterbare Kontakt- und Standortdaten.
- Ein spaeterer Import, Export, Backup und Audit ist in PostgreSQL einfacher nachvollziehbar.
- Das bisherige Supabase-Modell basiert ebenfalls auf PostgreSQL und kann dadurch spaeter leichter migriert werden.

Firestore bleibt eine Ausweichoption, falls Cloud SQL in der Organisation nicht bereitgestellt wird. Fuer den geplanten privaten Step-4-Test wird Firestore aber nicht gewaehlt, weil das CRM-Modell mit Beziehungen, Historie und spaeteren Abfragen in PostgreSQL sauberer abbildbar ist.

## Services fuer Schritt 4 privat

Pflicht:

- Cloud Run: fuehrt die backend-faehige Demo aus.
- Cloud SQL PostgreSQL: zentrale Datenbank fuer Kontakte, Organisationen, Profile und Aenderungsverlauf.
- Artifact Registry: speichert das Container-Image.
- Cloud Build: baut und deployed den privaten Test.
- IAM: erlaubt Cloud Run den Zugriff auf Cloud SQL und regelt den App-Zugriff.

Empfohlen:

- Secret Manager: speichert das Datenbankpasswort.

Optional spaeter:

- Cloud Storage: Kontaktbilder, Importdateien und Backup-Artefakte.
- Identity-Aware Proxy oder interne Zugriffsschicht: Zugriffsschutz ohne eigene App-Accounts.
- Cloud Monitoring: Alerting fuer produktionsnahen Betrieb.

Nicht fuer Schritt 4 privat geplant:

- Supabase
- App-eigene Nutzerkonten
- Rollenmodell
- Importfunktion
- gespeicherte Ansichten
- Profilbild-Upload
- Admin-Konsole

## Service-Schnitt

Fuer den privaten Test wird ein einzelner neuer Cloud-Run-Service empfohlen:

```text
versorgungs-kompass-gcp-demo
```

Dieser Service soll statische Demo-Dateien und API-Endpunkte gemeinsam ausliefern. Das vermeidet fuer den privaten Test CORS, zweite FQDNs und zwei getrennte Deployments.

Die bestehende statische Demo bleibt separat:

```text
versorgungs-kompass-demo
```

Spaeter in der Organisations-IT kann die IT entscheiden, ob Frontend und API weiterhin gemeinsam laufen oder in zwei Cloud-Run-Services getrennt werden.

## Datenhaltung

In Cloud SQL werden fuer Schritt 4 nur die Kernobjekte gespeichert:

- `profiles`: feste Demo-Owner und spaeter optional echte Nutzer-/IAP-Zuordnung.
- `organizations`: Organisationen/Einrichtungen.
- `contacts`: Personen/Kontakte mit Standort, Owner, Prioritaet, Bild-URL und Themen.
- `changes`: Aenderungsverlauf je Kontakt.

Das konkrete Startschema liegt in:

```text
gcp/cloudsql/step4_private_schema.sql
```

## Kontaktbilder

Fuer Schritt 4 werden Kontaktbilder noch nicht hochgeladen. Es wird nur ein Textfeld `image_url` gespeichert.

Moegliche Quellen:

- lokale Demo-Assets aus dem Repository
- freigegebene Bild-URLs
- spaeter Cloud Storage URLs

Update nach Step 5.3: Fuer Kontaktbilder wurde ein privater Cloud Storage Bucket vorbereitet. Die App speichert `gs://`-Objektpfade in `contacts.image_url` und liefert Bilder ueber Cloud Run aus. Details stehen in `GCP_STEP5_3_CONTACT_IMAGES.md`.

## Kartendaten

Die geografischen Kartendaten bleiben statisch im Repository:

```text
map/data/de-geojson.js
map/data/state-polygons.js
map/data/city-labels.js
map/data/state-labels.js
```

Die Marker kommen in Schritt 4 nicht mehr aus `localStorage`, sondern aus der API bzw. Cloud SQL. Die Kartenlogik selbst bleibt 1:1 erhalten.

## Auth und Zugriff

Fuer den privaten Step-4-Test wird keine App-Authentifizierung eingefuehrt.

Private Testannahme:

- Zugriff ueber Cloud Run URL.
- Schreibende Aktionen werden technisch erlaubt.
- `changed_by` wird ueber einen festen Demo-Akteur oder den ausgewaehlten Owner geschrieben.

Organisationsziel:

- Zugriffsschutz wird ueber interne Umgebung, Load Balancer, IAP oder SSO geklaert.
- Erst wenn echte Nutzerverantwortung noetig ist, werden Nutzeridentitaet und Rollenmodell wieder eingefuehrt.

## Betriebssicherheit

Seit Step 5.2 ist fuer den privaten GCP-Test aktiviert:

- Cloud SQL Backups.
- Point-in-Time-Recovery fuer 7 Tage.
- Deletion Protection fuer die Cloud-SQL-Instanz.
- API-Betriebsstatus ueber `GET /api/ops/summary`.
- JSON-Export ueber `GET /api/export`.

Seit Step 5.3 ist fuer den privaten GCP-Test vorbereitet:

- Privater Cloud Storage Bucket fuer Kontaktbilder.
- Upload, Auslieferung und Entfernen ueber Cloud Run.
- Speicherung privater `gs://`-Objektpfade in `contacts.image_url`.

Fuer echten Organisationsbetrieb fehlen noch:

- Zugriffsschutz vor Export und schreibenden Endpunkten.
- Monitoring Alerts.
- Restore-Test mit dokumentiertem Ablauf.
- Entscheidung, ob Cloud SQL regional/HA betrieben werden soll.

## API fuer Schritt 4

Minimal benoetigte Endpunkte:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/healthz` | Backend-Healthcheck |
| `GET` | `/api/bootstrap` | Profile, Organisationen, Kontakte und initiale Historie laden |
| `GET` | `/api/contacts` | Kontakte laden |
| `GET` | `/api/contacts/:id` | Einzelkontakt laden |
| `PATCH` | `/api/contacts/:id` | Kontakt bearbeiten, inklusive Ownerwechsel |
| `GET` | `/api/contacts/:id/history` | Aenderungsverlauf laden |
| `GET` | `/api/organizations` | Organisationen laden |
| `GET` | `/api/profiles` | Demo-Owner laden |

Noch nicht notwendig:

- `POST /api/contacts`
- Import-Endpunkte
- Saved-Views-Endpunkte
- Profil-/Avatar-Endpunkte
- Rollen-/Admin-Endpunkte

## Schritt 4 Umsetzung privat

Empfohlene Reihenfolge:

1. Cloud SQL PostgreSQL Instanz im privaten GCP-Projekt anlegen. Erledigt.
2. Datenbank und App-User anlegen. Erledigt.
3. `gcp/cloudsql/step4_private_schema.sql` anwenden. Erledigt durch App-Start.
4. Demo-Daten aus `data/demo-data.js` nach Cloud SQL seeden. Erledigt durch App-Start und Reset-Endpunkt.
5. Neue Cloud-Run-App mit statischem Frontend und API bauen. Erledigt.
6. Cloud Run mit Cloud SQL verbinden. Erledigt.
7. Datenbankzugang ueber Secret Manager bereitstellen. Erledigt.
8. Demo-App so umstellen, dass sie API-Daten nutzt statt `localStorage` als primaere Quelle. Erledigt.
9. Bearbeiten, Ownerwechsel und Aenderungsverlauf gegen Cloud SQL testen. Bearbeiten und Historie getestet.
10. Karte pruefen: Marker muessen aus den API-Kontakten kommen. Kartenliste mit 35 / 35 Kontakten getestet.

## Fallbacks bei fehlenden GCP-Rechten

Falls Cloud SQL nicht bereitgestellt wird:

- Firestore als GCP-native NoSQL-Ausweichoption pruefen.
- Funktionalitaet auf Kontakte, Organisationen und einfache Historie begrenzen.
- Spaetere relationale Features waeren dann aufwendiger.

Falls keine Datenbank bereitgestellt wird:

- Schritt 4 ist nicht sinnvoll umsetzbar.
- Dann bleibt nur die statische Demo mit `localStorage`.

Falls Secret Manager fehlt:

- Privater Test kann temporaer mit Cloud-Run-Env-Variablen arbeiten.
- Fuer Organisationsbetrieb sollte Secret Manager oder ein organisationsinterner Secret-Mechanismus genutzt werden.

Falls Codex oder CLI auf dem Firmenrechner nicht erlaubt ist:

- Deployment ueber GitLab/Jenkins bevorzugen.
- Alternativ dokumentierte `gcloud`-Befehle oder Cloud Shell nutzen, sofern freigegeben.

## Quellen

- Cloud Run fuehrt Container als HTTPS-Service aus: https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run
- Cloud Run Deployment nutzt Container-Images, ueblicherweise aus Artifact Registry: https://docs.cloud.google.com/run/docs/deploying
- Cloud SQL PostgreSQL ist ein verwalteter PostgreSQL-Dienst: https://docs.cloud.google.com/sql/docs/postgres
- Cloud Run kann mit Cloud SQL verbunden werden: https://docs.cloud.google.com/sql/docs/postgres/connect-run
- Cloud Storage speichert Objekte in Buckets und ist spaeter fuer Bilder/Dateien geeignet: https://cloud.google.com/storage
- IAP kann Cloud Run-Zugriff schuetzen, benoetigt aber eigene Rollen und Konfiguration: https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run
