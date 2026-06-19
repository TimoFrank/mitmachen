# ZIEL-README: Migration auf das gematik Kubernetes Setup

Diese Datei ersetzt nicht die aktuelle `README.md`.

Sie beschreibt den Zielpfad fuer die Migration des Versorgungs-Kompass weg von Supabase und weg vom frueheren Cloud-Run-Entwurf. Der aktuelle Betrieb ueber GitHub Pages und Supabase bleibt bestehen, bis die gematik-Zielumgebung fachlich, technisch und betrieblich abgenommen ist.

## Kurzfassung

Aktuell gilt:

- GitHub Pages bleibt die laufende Veroeffentlichung fuer die Haupt-App.
- Supabase bleibt vorerst Backend fuer Auth, Datenbank und Storage-nahe Funktionen.
- Die bestehende GCP-/Cloud-Run-Demo bleibt als Referenz erhalten, ist aber nicht mehr Zielarchitektur.
- Cloud Run ist fuer das gematik Setup vom Tisch.
- Das neue Zielbild ist Software Factory + Jenkins + Artifact Registry + Kubernetes + Helm + Shared Postgres + statisches Frontend-Hosting.

Das Ziel ist nicht, Supabase sofort zu entfernen. Das Ziel ist, den produktiven Pfad kontrolliert in die gematik-Infrastruktur zu ueberfuehren, ohne die heutige nutzbare App zu zerlegen.

## Zielbild

```text
Browser
-> internes Frontend-Hosting / Bucket / Load Balancer
-> /api/...
-> Kubernetes Ingress / Gateway mit interner Zugriffsbeschraenkung
-> Node.js API im zugewiesenen Namespace
-> gematik Shared Postgres
-> Object Storage fuer Profil- und Kontaktbilder
```

Der Browser soll im Zielbetrieb keine Supabase-Projekt-URL, keinen Supabase-Key, kein Supabase Auth und keine direkten Tabellen- oder Storage-Zugriffe mehr enthalten. Fachliche Daten laufen ueber stabile `/api/...`-Endpunkte.

## Was ersetzt wird

| Heute | Ziel |
| --- | --- |
| GitHub Pages fuer die laufende App | bleibt bis zur Umschaltung bestehen |
| Supabase Auth | internes SSO, Entra/gemIAM, Reverse-Proxy-Auth oder vergleichbare Gateway-Identitaet |
| Supabase Postgres | gematik Shared Postgres |
| Supabase RLS | serverseitige Rollenpruefung in der API |
| Supabase Storage / oeffentliche Bild-URLs | Object Storage, ueber API oder freigegebene interne Objektpfade |
| Direkte Supabase-Zugriffe im Browser | `/api/...` ueber API-Gateway |
| Cloud-Run-Entwurf | Kubernetes Namespace + Helm Chart |

## Zielarchitektur

### Software Factory und Kubernetes

Die gematik-IT stellt ein Software-Factory-Projekt mit Repository, Jenkins View, Artifact-Registry-Repository und Kubernetes-Zugang bereit. Die App bekommt keinen eigenen Kubernetes-Cluster, sondern einen Namespace im Shared-Projekt.

Deployment-Prinzip:

```text
Git Repo
-> Jenkins Pipeline
-> npm checks / SAST / Secret Scan / Trivy
-> API-Container bauen
-> Image in Artifact Registry ablegen
-> Helm Chart rendern und deployen
-> Kubernetes startet den API-Pod im Namespace
```

Das Helm Chart liegt im Repo unter `deploy/helm/versorgungs-kompass`.

### Frontend

Das Frontend bleibt statisch. Jenkins erzeugt aus den Quellordnern das `docs/`-Artefakt, setzt die Zielkonfiguration und synchronisiert das Ergebnis in den von der gematik bereitgestellten Bucket-/Hosting-Pfad.

Zielkonfiguration:

```js
dataMode: "api",
authMode: "trusted-header",
apiBaseUrl: "https://<interne-api-url>",
requireApiGateway: true
```

`dataMode: "gcp"` bleibt nur als Kompatibilitaetsalias fuer alte Tests und Referenzen erhalten.

### API

Die API laeuft als Node.js Container aus `Dockerfile.api`. Sie kapselt Datenbank, Rollen, Storage und fachliche Validierung. Der Browser spricht nur mit `/api/...`.

Wichtige Runtime-Variablen:

| Variable | Zweck |
| --- | --- |
| `DATABASE_URL` oder `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` | Shared-Postgres-Zugriff |
| `API_AUTH_MODE=trusted-header` | Identitaet kommt vom vorgelagerten Gateway |
| `AUTH_EMAIL_HEADER` | Header mit gepruefter Nutzer-E-Mail, z. B. `x-auth-request-email` |
| `AUTH_SUBJECT_HEADER` | optionaler Header mit stabiler Nutzer-ID |
| `ALLOWED_ORIGIN` | erlaubter Frontend-Origin |
| `PROFILE_IMAGE_BUCKET`, `CONTACT_IMAGE_BUCKET` | Object-Storage-Ziele fuer Bilder |

Wichtig: Der Ingress oder Proxy muss eingehende Identity-Header aus dem Client entfernen und nur selbst gepruefte Header an die API weiterreichen.

## Auth und Zugriff

Die Anwendung ist intern. Externe Kontakte werden in der App verwaltet, sollen aber nicht selbst auf die App zugreifen.

Fuer einen reinen Pilot mit fiktiven oder unkritischen Daten kann eine interne Netz-/Z-Scaler-Beschraenkung reichen. Fuer echte Daten ist ein unauthentifizierter Public-Zugriff nicht akzeptabel. Ziel ist eine zentrale Zugriffsschicht mit Entra/gemIAM, Reverse-Proxy-SSO oder einer gleichwertigen Gateway-Identitaet.

Die Rollen `viewer`, `editor` und `admin` werden in der API serverseitig gegen `profiles` geprueft. Der Browser darf Rollen anzeigen, aber nicht allein durchsetzen.

## Migrationsplan

### Phase 0: Ist-Zustand sichern

- GitHub Pages + Supabase weiter betreiben.
- Bestehende Supabase-Migrationen, Exporte und Fallbacks nicht loeschen.
- Cloud-Run-Demo als Referenz behalten, aber nicht mehr als Ziel verkaufen.

### Phase 1: Plattform-Onboarding

- Software-Factory-Hauptgruppe und Git-Repo klaeren.
- Jenkins View und Pipeline-Rechte klaeren.
- Artifact-Registry-Repository fuer API-Images anlegen.
- Kubernetes-Namespace und Zugriffe bereitstellen.
- Shared-Postgres-Datenbank und App-User bereitstellen.
- Frontend-Bucket-/Hosting-Projekt klaeren.
- Interne URL, DNS, Ingress und Zugriffsschutz klaeren.
- OLA, Owner-Modell und MyService-/Projektberechtigungen klaeren.

### Phase 2: Repo auf Zielbetrieb vorbereiten

- `DEPLOYMENT_GEMATIK_K8S.md` als fuehrende technische Deployment-Doku nutzen.
- Jenkinsfile auf Build, Scan, Artifact Registry, Helm und Bucket-Sync ausrichten.
- Helm Chart fuer API-Deployment pflegen.
- Frontend-Config-Script auf `dataMode: "api"` und `authMode: "trusted-header"` setzen.
- Preflight- und Audit-Skripte auf neutrale Zielbegriffe umstellen.
- Aktives Postgres-Schema unter `db/postgres/schema.sql` fuehren.

### Phase 3: Auth und Daten vorbereiten

- Gateway-/SSO-Header festlegen.
- Profile mit gematik E-Mail oder stabiler Nutzer-ID in `profiles` vorbereiten.
- Rollenmatrix fuer Pilotnutzer pruefen.
- Supabase-Daten exportieren.
- Shared Postgres mit stabilen IDs importieren.
- Counts und Stichproben fuer Kontakte, Organisationen, Profile, Formate, Hospitationen, Stakeholder, Saved Views und Bilder pruefen.

### Phase 4: Parallelbetrieb und Abnahme

- Ziel-Frontend gegen Ziel-API testen.
- Browser-Netzwerk pruefen: keine Supabase Auth/REST/Storage-Aufrufe.
- `/api/healthz`, `/api/session`, `/api/ops/checks` und Kernpfade pruefen.
- Rollen, Schreibpfade, Import, Export und Bildzugriff testen.
- Backup, Restore-Probe, Logging und Monitoring pruefen.

### Phase 5: Umschalten

- Finalen Supabase-Export ziehen.
- Ziel-Datenbank importieren und zaehlen.
- Supabase-Schreibpfade stoppen.
- Frontend-Bucket und API produktiv freigeben.
- Live-Datenstatus ueber API- oder DB-Stichprobe pruefen.
- Danach Supabase-Fallbacks schrittweise archivieren.

## Entscheidungsfragen

Vor echtem Produktivbetrieb muessen diese Punkte verbindlich sein:

1. Welche interne URL und welches Ingress-/Gateway-Setup wird genutzt?
2. Ist der Pilot nur intern netzbeschraenkt oder schon per Entra/gemIAM/SSO geschuetzt?
3. Welche Header liefern E-Mail und stabile Nutzer-ID?
4. Wer pflegt `profiles` und Rollen?
5. Wer verantwortet Shared-Postgres-Backup, Restore und Monitoring?
6. Wo liegen Profil- und Kontaktbilder?
7. Welche Daten duerfen im Pilot enthalten sein?
8. Wer unterschreibt OLA und fachlichen Betrieb?
9. Wie wird der finale Cutover freigegeben?

## Empfehlung fuer jetzt

Jetzt nicht Supabase loeschen und nicht den aktuellen GitHub-Pages-Pfad aufgeben.

Der naechste sinnvolle Schritt ist die technische Zielspur im Repo: Kubernetes-Doku, Jenkinsfile, Helm Chart, neutrales API-Config-Script und Postgres-Schema vorbereiten. Danach kann die gematik-IT Namespace, Datenbank, Bucket, Ingress und Berechtigungen konkret anschliessen.
