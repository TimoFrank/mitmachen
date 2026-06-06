# GCP Step 5 Readiness

Stand: 2026-06-06

Diese Notiz bewertet, ob der Versorgungs-Kompass nach dem privaten Step-4-Test mit Schritt 5 starten kann.

Update nach Start von Schritt 5.1: Die Kern-CRM-API wurde am 2026-06-06 privat umgesetzt und live getestet. Details stehen in `GCP_STEP5_1_PRIVATE_TEST.md`.

Update nach Start von Schritt 5.2: Betriebssicherheit wurde als naechster Schritt gewaehlt. Details stehen in `GCP_STEP5_2_OPERATIONS.md`.

## Ergebnis

```text
Status: GO mit Bedingungen
```

Schritt 5 kann technisch starten, weil die zentrale GCP-Datenhaltung funktioniert und die API stabil erreichbar ist. Schritt 5 sollte aber nur in klar getrennten Teilpaketen umgesetzt werden. Ein grosser Komplettumbau zur Vollversion waere zu riskant.

## Gepruefter Stand

Live-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00005-gnd
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:4a31a53b-5c33-4876-8517-e2d248d7865b
```

Live-Daten:

```text
Healthcheck: ok
Profile: 3
Organisationen: 14
Aktive Kontakte: 35
Archivierte Kontakte: 1
Aenderungen: 8
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

Status:

- Privat umgesetzt und live getestet.
- Details: `GCP_STEP5_1_PRIVATE_TEST.md`.

Ziel:

- Kontakt anlegen.
- Organisation anlegen und bearbeiten.
- Kontakt archivieren/wiederherstellen.
- Aenderungsverlauf fuer diese Aktionen speichern.

Warum zuerst:

- Baut direkt auf Cloud SQL auf.
- Kein neuer GCP-Dienst notwendig.
- Erhoeht die fachliche Nutzbarkeit, ohne Import, Auth oder Storage-Komplexitaet.

### Schritt 5.2: Betriebssicherheit

Status:

- Privat umgesetzt und live getestet.
- Details: `GCP_STEP5_2_OPERATIONS.md`.

Ziel:

- Backups aktivieren.
- Point-in-Time-Recovery aktivieren.
- Deletion Protection aktivieren.
- Betriebsstatus und Export ergaenzen.

Warum vor Kontaktbildern/Import:

- Ab Step 5.1 schreibt die Demo echte Daten in Cloud SQL.
- Import und Uploads sollten erst nach Backup- und Export-Sicherheitsnetz kommen.

### Schritt 5.3: Kontaktbilder zentralisieren

Ziel:

- Cloud Storage Bucket fuer Kontaktbilder.
- Bildpfad/URL in `contacts.image_url` speichern.
- Rechte- und Quellenfelder beibehalten.

Voraussetzung:

- Zugriffsschutz und Upload-Regeln klaeren.

### Schritt 5.4: Gespeicherte Ansichten

Ziel:

- Tabellen `saved_views` und optional `user_settings`.
- API-Endpunkte fuer Lesen/Speichern/Loeschen.

Voraussetzung:

- Nutzer-/Owner-Konzept muss mindestens technisch festgelegt sein.

### Schritt 5.5: Importfunktion

Ziel:

- CSV/Excel-Import kontrolliert wieder einfuehren.
- Importlauf im Aenderungsverlauf protokollieren.
- Vor Import Backup oder Export erzwingen.

Voraussetzung:

- Backups aktiv.
- Fehler-/Rollback-Konzept vorhanden.

### Schritt 5.6: Auth, Rollen und Admin

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

Nach 5.1 zuerst Betriebssicherheit. Danach erst Cloud Storage fuer Bilder oder gespeicherte Ansichten.
