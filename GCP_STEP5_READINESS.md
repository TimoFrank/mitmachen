# GCP Step 5 Readiness

Stand: 2026-06-06

Diese Notiz bewertet, ob der Versorgungs-Kompass nach dem privaten Step-4-Test mit Schritt 5 starten kann.

## Ergebnis

```text
Status: GO mit Bedingungen
```

Schritt 5 kann technisch starten, weil die zentrale GCP-Datenhaltung funktioniert und die API stabil erreichbar ist. Schritt 5 sollte aber nur in klar getrennten Teilpaketen umgesetzt werden. Ein grosser Komplettumbau zur Vollversion waere zu riskant.

## Gepruefter Stand

Live-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00003-j9d
URL: https://versorgungs-kompass-gcp-demo-qosoetrj7a-ey.a.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:433b4a06-f29d-453f-a827-06d52efbc3fe
```

Live-Daten:

```text
Healthcheck: ok
Profile: 3
Organisationen: 14
Aktive Kontakte: 35
Seed-Aenderungen: 8
```

Stabilitaetscheck:

```text
10 parallele Healthchecks: 10/10 ok
10 parallele Bootstrap-Aufrufe: 10/10 ok
```

Lokale Checks:

```bash
npm run check:gcp-demo
npm run check:demo
npm run check
git diff --check
```

Ergebnis: alle gruen.

## Vor Schritt 5 klaeren

Vor der ersten groesseren Step-5-Umsetzung:

- Step-4-Code und Doku versionieren, damit es einen stabilen Rueckfallpunkt gibt.
- Entscheiden, welches Step-5-Teilpaket zuerst kommt.
- Fuer echte Live-Daten Backups und Deletion Protection aktivieren.
- Fuer Organisationsbetrieb Zugriffsschutz klaeren; `allUsers` ist nur fuer privaten Test geeignet.

## Empfohlene Step-5-Reihenfolge

### Schritt 5.1: Kern-CRM-API vervollstaendigen

Ziel:

- Kontakt anlegen.
- Organisation anlegen und bearbeiten.
- Kontakt archivieren/wiederherstellen.
- Aenderungsverlauf fuer diese Aktionen speichern.

Warum zuerst:

- Baut direkt auf Cloud SQL auf.
- Kein neuer GCP-Dienst notwendig.
- Erhoeht die fachliche Nutzbarkeit, ohne Import, Auth oder Storage-Komplexitaet.

### Schritt 5.2: Kontaktbilder zentralisieren

Ziel:

- Cloud Storage Bucket fuer Kontaktbilder.
- Bildpfad/URL in `contacts.image_url` speichern.
- Rechte- und Quellenfelder beibehalten.

Voraussetzung:

- Zugriffsschutz und Upload-Regeln klaeren.

### Schritt 5.3: Gespeicherte Ansichten

Ziel:

- Tabellen `saved_views` und optional `user_settings`.
- API-Endpunkte fuer Lesen/Speichern/Loeschen.

Voraussetzung:

- Nutzer-/Owner-Konzept muss mindestens technisch festgelegt sein.

### Schritt 5.4: Importfunktion

Ziel:

- CSV/Excel-Import kontrolliert wieder einfuehren.
- Importlauf im Aenderungsverlauf protokollieren.
- Vor Import Backup oder Export erzwingen.

Voraussetzung:

- Backups aktiv.
- Fehler-/Rollback-Konzept vorhanden.

### Schritt 5.5: Auth, Rollen und Admin

Ziel:

- Zugriffsschutz, Rollenmodell und Admin-Funktionen passend zur Organisations-IT.

Voraussetzung:

- Entscheidung zu IAP, SSO, interner Auth oder App-Login.

## No-Go fuer Schritt 5

Nicht starten mit:

- Importfunktion als erstem Step-5-Paket.
- Rollenmodell ohne geklaerten Auth-Weg.
- Bild-Upload ohne klares Storage-/Zugriffskonzept.
- echten produktiven Daten ohne Backup.
- parallelem Umbau von Demo-App, Datenmodell, Auth, Import und Storage.

## Empfehlung

Start mit Schritt 5.1. Danach erst Cloud Storage fuer Bilder oder gespeicherte Ansichten.
