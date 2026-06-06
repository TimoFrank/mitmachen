# GCP Step 8 Original-UI-Port

Stand: 2026-06-06

Status: privat umgesetzt, deployed und live gegen Cloud Run geprueft.

## Ziel

Die GCP-Version soll nicht mehr wie eine nachgebaute Demo wirken, sondern die Original-Oberflaeche des Versorgungs-Kompass verwenden.

Das Frontend aus `app/versorgungs-kompass.html` ist ab diesem Schritt die fuehrende UI. GCP ersetzt Supabase nur als Daten- und Betriebsplattform.

## Entscheidung

Kein weiterer Demo-UI-Nachbau.

Stattdessen:

- Original-App-Shell aus `app/versorgungs-kompass.html` ausliefern.
- Original-Kontaktliste mit Mehrfachauswahl, Badges, Spaltenauswahl und Filterlogik verwenden.
- Original-Kontakt- und Organisations-Drawer verwenden.
- Original-Kartenlogik ueber die eingebettete Karte weiterverwenden.
- Supabase-Skripte und Auth-Guard beim GCP-Serving entfernen.
- Datenzugriff ueber `data/data-service.js` auf GCP-Modus umschalten.

## Umgesetzt

Cloud Run liefert fuer die GCP-Demo jetzt die Original-App aus:

```text
/, /index.html, /demo/, /demo/index.html, /versorgungs-kompass.html, /app/versorgungs-kompass.html
-> app/versorgungs-kompass.html mit GCP-Konfiguration
```

Der Server schreibt die Original-HTML beim Ausliefern gezielt um:

- `dataMode: "gcp"`
- API-Aufrufe same-origin ueber `/api`
- keine Supabase-JS-CDN-Einbindung
- kein `auth-guard.js`
- Karten- und Public-Assets auf Cloud-Run-Pfade umgeschrieben
- sichtbares Supabase-Wording in der GCP-Auslieferung ersetzt

Der GCP-Datenadapter kann nun:

- Kontakte aus Cloud SQL laden, anlegen und bearbeiten.
- Organisationen aus Cloud SQL laden, anlegen und bearbeiten.
- Owner/Profile ueber `/api/session` und `/api/profiles` nutzen.
- Aenderungsverlauf ueber die bestehende GCP-API anzeigen.
- Kontaktbilder ueber den Cloud-Run-Bildendpunkt nutzen.
- Gespeicherte Ansichten, Formate und Expertenkreis vorerst lokal bzw. aus Demo-Daten bedienen, bis echte GCP-Tabellen dafuer entstehen.

## Live-Stand

Cloud Run:

```text
Service: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00019-dnx
Traffic: 100 Prozent
Nutzer-URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Service-URL laut Cloud Run: https://versorgungs-kompass-gcp-demo-qosoetrj7a-ey.a.run.app
Image digest: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo@sha256:3b8bee3a784ba3a1c9d068264e147b24bd7eb8bd5e56f4f7f218011c21cafe0e
```

Wichtig: Revision `00018-25r` war ein Zwischenstand mit `Service Unavailable`, weil das Dockerfile die Original-App-Dateien noch nicht kopiert hatte. Das ist in Revision `00019-dnx` korrigiert.

## Gepruefter UI-Stand

Desktop 1440x900:

- Original-App-Shell sichtbar.
- Kein alter Demo-Shell-Container.
- Kontaktliste mit Originalspalten: Auswahl, Name, Organisation, Sektor, Fachrichtung, Ort, Owner, Aktualisiert.
- Mehrfachauswahl vorhanden.
- Fachrichtung/Sektor und Owner als farbliche Badges sichtbar.
- `Spalten anpassen` und Filterlogik vorhanden.
- Kontakt-Drawer mit Originaltabs: Ueberblick, Kontakt, Themen, Notizen, Aktivitaeten.
- Organisations-Tab mit Original-Organisationsprofil und Kontaktliste nutzbar.
- Keine Browser-Konsolenfehler.

Mobile 390x844:

- Original-Shell ohne horizontale Seitenscrollbar.
- Kontaktliste rendert als mobile Original-Karten.
- Detail-Drawer oeffnet per Tastatur auf Kontaktkarten.
- Originaltabs und Stammdaten sind im Drawer sichtbar.
- Keine Browser-Konsolenfehler.

API-Smoke:

```text
GET /api/healthz -> ok, backend cloud-sql, Revision 00019-dnx
GET /api/session -> Pilot-Profil ohne Login
GET /api/contacts -> 35 Kontakte
GET /api/organizations -> 14 Organisationen
```

## Grenzen

Weiterhin nicht produktionsreif:

- keine echte Authentifizierung
- keine serverseitige Rollenpruefung
- keine GCP-Persistenz fuer gespeicherte Ansichten
- keine GCP-Persistenz fuer Formate und Expertenkreis
- Profilfoto-Upload fuer das eigene Nutzerprofil noch nicht aktiv

Fuer den Organisationsbetrieb muessen Zugriffsschutz, Rollenpruefung, Monitoring-Alerts und Restore-Test vor Go-live festgelegt werden.

## Deploy-Hinweis

Fuer diese Version immer den GCP-Backend-Build verwenden:

```bash
gcloud builds submit --project steam-capsule-341212 --config cloudbuild.gcp-demo.yaml .
```

`Dockerfile.gcp-demo` muss die Original-App-Verzeichnisse enthalten:

```text
app/
data/
gcp/
login/
map/
mitmachen/
public/
```
