# GCP Organisations-IT Uebergabe

Stand: 2026-06-06

Archivhinweis: Diese Notiz beschreibt den frueheren privaten GCP-Demostand. Fuer den aktuellen Zielpfad zuerst `../../../DEPLOYMENT_GEMATIK_K8S.md` und `../../../DEPLOYMENT_UEBERSICHT.md` lesen.

Diese Notiz fasst den aktuellen privaten GCP-Demostand des Versorgungs-Kompass zusammen. Sie ist als Gespraechsgrundlage fuer die spaetere Ueberfuehrung in die Organisations-IT gedacht.

## Kurzfassung

Der Versorgungs-Kompass laeuft aktuell als schlanke Demo-App auf GCP Cloud Run. Die App nutzt kein Supabase, keine zentrale Datenbank, keine Nutzerkonten und kein echtes API-Backend. Personen-, Organisations- und Kartendaten werden als statische Dateien mit dem Frontend ausgeliefert. Demo-Aenderungen werden nur lokal im Browser gespeichert.

## Schrittweise Erweiterung zur Vollversion

Das Ziel ist, die Demo nicht in einem grossen Sprung zur Vollversion umzubauen, sondern in klaren Stufen. Dasselbe Vorgehen soll spaeter auch fuer die Ueberfuehrung in die interne IT genutzt werden.

### Schritt 1: Schlanke Demo deployen

Status: im privaten GCP-Test erfolgreich.

Ziel:

- Cloud-Run-Deployment funktioniert.
- Container-Build funktioniert.
- App ist ueber URL erreichbar.
- Kontakte, Organisationen und Karte laufen ohne Supabase.
- Demo-Aenderungen bleiben lokal im Browser.

Dieser Schritt beweist den technischen Deployment-Weg, aber noch keinen echten CRM-Betrieb.

### Schritt 2: Dieselbe Demo in der Organisations-IT deployen

Ziel:

- GitLab wird fuehrendes Repository.
- Jenkins baut und deployed die Demo.
- Artifact Registry speichert das Image.
- Cloud Run liefert die App intern aus.
- Interne FQDN ist erreichbar.
- Zugriffsschutz wird durch die Organisationsumgebung geklaert.

Wichtig: In diesem Schritt sollte fachlich moeglichst wenig geaendert werden. Erst soll der Organisations-Deployment-Weg stabil laufen.

### Schritt 3: Backend-Zielbild festlegen

Status: entschieden am 2026-06-06. Details stehen in `GCP_BACKEND_TARGET.md`.

Ziel:

- Entscheiden, ob Cloud SQL PostgreSQL oder Firestore fuer Kontakte und Organisationen genutzt wird.
- Entscheiden, ob eine eigene API auf Cloud Run dazwischenliegt.
- Klaeren, ob Auth ueber interne Umgebung, IAP, SSO oder spaeter App-Login erfolgt.
- Klaeren, wo Kontaktbilder und Importdateien liegen sollen.

Dieser Schritt ist eine Architekturentscheidung, noch kein grosser Funktionsausbau.

Entscheidung:

- Cloud SQL PostgreSQL ist Ziel-Datenhaltung fuer den privaten Step-4-Test.
- Cloud Run stellt eine API bereit und liefert fuer den privaten Test Frontend und API gemeinsam aus.
- Keine App-Auth im privaten Test; Zugriffsschutz wird fuer die Organisation separat ueber interne Umgebung, IAP, SSO oder App-Login entschieden.
- Kontaktbilder bleiben in Schritt 4 zunaechst als `image_url` gespeichert; Cloud Storage kommt erst bei echtem Upload/Dateibetrieb dazu.
- Firestore bleibt Fallback, falls Cloud SQL nicht bereitgestellt wird.

### Schritt 4: Zentrale Datenhaltung einfuehren

Status: privat umgesetzt am 2026-06-06. Details stehen in `GCP_STEP4_PRIVATE_TEST.md`.

Ziel:

- Kontakte und Organisationen aus `data/demo-data.js` in eine zentrale GCP-Datenhaltung ueberfuehren.
- Bearbeiten, Ownerwechsel und Aenderungsverlauf serverseitig speichern.
- Die Karte weiterhin mit derselben Logik betreiben, aber Marker aus der zentralen Datenquelle laden.

Ab diesem Schritt entsteht echter Mehrnutzerbetrieb.

Privater Teststand:

- Cloud Run Service: `versorgungs-kompass-gcp-demo`
- Cloud SQL Instanz: `versorgungs-kompass-gcp-demo-db`
- Datenbank: `versorgungs_kompass`
- Secret Manager: `versorgungs-kompass-gcp-demo-db-password`
- URL: `https://versorgungs-kompass-gcp-demo-qosoetrj7a-ey.a.run.app`
- Status: Kontakte, Organisationen, Bearbeiten, Aenderungsverlauf und Karte funktionieren gegen Cloud SQL.

### Schritt 5: Vollversion schrittweise reaktivieren

Status: startfaehig mit Bedingungen. Readiness steht in `GCP_STEP5_READINESS.md`.

Moegliche Ausbaustufen:

- Kontaktbilder zentral speichern.
- Importfunktion wieder einfuehren.
- Gespeicherte Ansichten wieder einfuehren.
- Nutzerprofile und Rollenmodell ergaenzen, falls benoetigt.
- Admin-Funktionen nur dann aktivieren, wenn Betrieb und Rechte geklaert sind.
- Monitoring, Backups und Betriebsprozesse ergaenzen.

Jede Funktion sollte einzeln deployt und getestet werden, statt alles gleichzeitig zu migrieren.

## Aktueller privater GCP-Demostand

```text
GCP Projekt: steam-capsule-341212
Region: europe-west3
Cloud Run Service: versorgungs-kompass-demo
Private Test-URL: https://versorgungs-kompass-demo-qosoetrj7a-ey.a.run.app/
Image Registry: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass
```

Wichtig: Diese Werte gehoeren zum privaten Testprojekt. Fuer die Organisation werden Projekt, Repository, Service-Name, FQDN, IAM und Pipeline durch die IT vorgegeben.

## Verwendete Dienste

Im aktuellen Demo-Setup werden verwendet:

- Cloud Run: liefert die App als Container aus.
- Cloud Build: baut und deployed die Demo aus dem lokalen Stand.
- Artifact Registry: speichert das Container-Image.
- IAM: regelt, wer die Cloud-Run-URL aufrufen darf.
- Cloud Build Staging Bucket: wird von Cloud Build fuer Build-Artefakte verwendet.
- Cloud SQL PostgreSQL: speichert im Step-4-Test Kontakte, Organisationen, Profile und Aenderungsverlauf.
- Secret Manager: speichert im Step-4-Test das Datenbankpasswort.

Aktuell nicht verwendet:

- Supabase
- Firestore
- Cloud Storage als App-Datenspeicher
- Identity Platform
- App-eigene Nutzerkonten
- API-Backend

## Voraussetzungen fuer das private Deployment

Damit das Deployment funktioniert hat, waren noetig:

- GCP-Projekt mit aktivem Billing.
- Lokaler Login ueber `gcloud auth login`.
- Projektkonfiguration ueber `gcloud config set project`.
- Aktivierte APIs: Cloud Build, Cloud Run, Artifact Registry.
- Artifact Registry Docker Repository.
- Berechtigungen fuer Build, Image Push, Cloud Run Deploy und IAM-Invoker-Anpassung.
- Deployment-Dateien im Repository: `Dockerfile.demo`, `nginx.demo.conf`, `cloudbuild.demo.yaml`.

## Datenspeicherung

Personen- und Organisationsdaten liegen aktuell in:

```text
data/demo-data.js
```

Diese Datei wird mit dem Frontend ausgeliefert und im Browser geladen. Sie ist Teil des Container-Images.

Lokale Demo-Aenderungen werden nur im Browser gespeichert:

```text
localStorage: versorgungs-kompass-demo-mode-contacts-v1
localStorage: versorgungs-kompass-demo-mode-changes-v1
localStorage: versorgungs-kompass-demo-mode-selected-contact-v1
```

Das bedeutet:

- Keine zentrale Speicherung.
- Keine Mehrnutzer-Synchronisation.
- Keine serverseitige Historie.
- Kein Backup der fachlichen Demo-Aenderungen.
- Jeder Browser hat seinen eigenen lokalen Stand.

## Kartendaten

Die Karte nutzt weiterhin die originale Kartenlogik aus:

```text
map/versorgungs-kompass-map.html
```

Die statischen geografischen Daten liegen in:

```text
map/data/de-geojson.js
map/data/state-polygons.js
map/data/city-labels.js
map/data/state-labels.js
```

Die Kontaktmarker auf der Karte kommen aus denselben Demo-Kontakten aus `data/demo-data.js` bzw. aus dem lokalen Browserstand, wenn Kontakte in der Demo bearbeitet wurden.

## Umfang des aktuellen Datensatzes

```text
Kontakte gesamt: 36
Aktive Kontakte: 35
Archivierter Kontakt: 1
Organisationen: 14
Demo-Profile/Owner: 3
Kontakte mit Kartenkoordinaten: 34
Kontakte mit Kontaktbild: 7
Seed-Eintraege im Aenderungsverlauf: 8
```

## Groessenordnung der Dateien

```text
data/demo-data.js: ca. 9 KB
demo/demo-app.js: ca. 27 KB
demo/demo.css: ca. 17 KB
map/versorgungs-kompass-map.html: ca. 156 KB
map/data/de-geojson.js: ca. 260 KB
map/data/state-polygons.js: ca. 88 KB
map/data/city-labels.js: ca. 43 KB
Zentrale App- und Karten-Dateien zusammen: ca. 650 KB
```

Das Container-Image ist groesser, weil es zusaetzlich den Nginx-Webserver und Basis-Layer enthaelt. Die fachlichen Demo-Daten selbst sind sehr klein.

## Backend-Einordnung

Im aktuellen Demo-Modus gibt es praktisch kein fachliches Backend. Cloud Run hostet einen Nginx-Container, der statische Dateien ausliefert.

Gespeichert wird in GCP:

- Container-Image in Artifact Registry.
- Cloud-Run-Service-Konfiguration und Revisionen.
- Cloud-Build-Logs und Build-Artefakte.
- IAM-Regeln fuer den Zugriff.

Nicht in GCP gespeichert werden aktuell:

- echte Kontakt-Aenderungen
- echte Organisations-Aenderungen
- Nutzerprofile
- Rollen
- Importdaten
- produktive Kontaktbilder
- serverseitiger Aenderungsverlauf

## Formulierung fuer den IT-Leiter

Kurz:

```text
Aktuell ist der Versorgungs-Kompass eine Demo-App auf Cloud Run. Die App hat noch kein echtes Backend und keine zentrale Datenbank. Kontakte, Organisationen und Kartendaten liegen als statische Demo-Dateien im Frontend. Aenderungen werden nur lokal im Browser gespeichert.
```

Zielbild:

```text
Wir moechten diesen privaten GCP-Demostand in eine kontrollierte Organisationsumgebung ueberfuehren: GitLab als Repository, Jenkins als Pipeline, Artifact Registry fuer Images und Cloud Run fuer den Betrieb.
```

Klaerung:

```text
Fuer echten Betrieb muessen wir entscheiden, ob die Daten weiterhin nur als Demo-Dateien laufen oder ob eine zentrale GCP-Datenhaltung mit API benoetigt wird.
```

## Naechste IT-Klaerungen

Fuer die Organisationsueberfuehrung sollten geklaert werden:

- Welches GCP-Projekt und welche Region werden verwendet?
- Gibt es ein Artifact Registry Repository?
- Wird Cloud Run bereitgestellt?
- Soll die App intern oder oeffentlich erreichbar sein?
- Welche FQDN wird genutzt?
- Laeuft Zugriffsschutz ueber interne Umgebung, Load Balancer, IAP oder App-Login?
- Wird fuer den ersten Test weiterhin die statische Demo-Version akzeptiert?
- Soll spaeter eine zentrale Datenbank genutzt werden, z. B. Cloud SQL oder Firestore?
- Wer betreibt Jenkinsfile, Service Account, Secrets und IAM?
- Welche GCP-Dienste und IAM-Rollen bekomme ich tatsaechlich selbst?
- Welche Schritte muss ich bei fehlenden Berechtigungen an die IT delegieren?

## Moegliche Einschraenkungen

Es ist offen, ob ich in der Organisationsumgebung Zugriff auf alle benoetigten GCP-Dienste und Funktionen bekomme. Falls Berechtigungen fehlen, muss gezielt bei der IT nachgefragt werden, z. B. fuer Cloud Run Deployments, Artifact Registry Push, Cloud Build, IAM-Invoker-Regeln, Service Accounts oder interne FQDN-/Load-Balancer-Konfiguration.

Es ist ebenfalls offen, ob eine lokale CLI-gestuetzte Arbeitsweise auf dem Firmenrechner genutzt werden kann. Falls die benoetigten CLI-Tools nicht laufen oder nicht freigegeben sind, braucht es einen alternativen Deployment-Weg:

- Deployment ueber GitLab und Jenkins als Standardweg der Organisation.
- Manuelles Deployment mit dokumentierten `gcloud`-Befehlen, sofern `gcloud` erlaubt ist.
- Ein einfaches Deployment-Skript, das die noetigen Befehle reproduzierbar ausfuehrt.
- Optional Cloud Shell oder eine freigegebene Build-Umgebung, falls lokale Tools nicht installiert werden duerfen.

Merksatz fuer die IT:

```text
Ich brauche entweder die noetigen Rechte und Tools, um das Deployment selbst auszufuehren, oder einen klaren Jenkins-/Skriptpfad, mit dem die IT den Build und das Cloud-Run-Deployment reproduzierbar uebernimmt.
```

## Abgrenzung zu aelteren Zielbildern

`DEPLOYMENT_GCP_GEMATIK.md` beschrieb damals das GCP/gematik-Zielbild mit Cloud-Run-Frontend, Cloud-Run-API, Cloud SQL, Cloud Storage und IAP/SSO. Diese Spur ist inzwischen archiviert; das aktive Zielbild steht in `../../../DEPLOYMENT_GEMATIK_K8S.md`.
