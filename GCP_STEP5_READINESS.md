# GCP Step 5 Readiness

Stand: 2026-06-06

Diese Notiz bewertet, ob der Versorgungs-Kompass nach dem privaten Step-4-Test mit Schritt 5 starten kann.

Update nach Start von Schritt 5.1: Die Kern-CRM-API wurde am 2026-06-06 privat umgesetzt und live getestet. Details stehen in `GCP_STEP5_1_PRIVATE_TEST.md`.

Update nach Start von Schritt 5.2: Betriebssicherheit wurde als naechster Schritt gewaehlt. Details stehen in `GCP_STEP5_2_OPERATIONS.md`.

Update nach Start von Schritt 5.3: Kontaktbilder werden ueber Cloud Storage vorbereitet. Details stehen in `GCP_STEP5_3_CONTACT_IMAGES.md`.

Update nach Entscheidung zu Schritt 5.4: Gespeicherte Ansichten werden uebersprungen, weil das Feature im aktuellen Frontend nicht genutzt wird. Schritt 5.4 ist stattdessen die kontrollierte Importvorbereitung. Details stehen in `GCP_STEP5_4_IMPORT.md`.

Update nach Umsetzung von Schritt 5.4: Importvorbereitung wurde privat live deployed und getestet. Live-Revision: `versorgungs-kompass-gcp-demo-00009-7pn`.

Update nach Start von Schritt 5.5: Profil und Rollenmodell werden als Light-Variante umgesetzt. Kein echtes Login, keine Nutzerverwaltung, keine serverseitige Rollenpruefung. Details stehen in `GCP_STEP5_5_PROFILE_ROLES.md`.

Update nach Umsetzung von Schritt 5.5: Profil und Rollenmodell light wurden privat live deployed und getestet. Live-Revision: `versorgungs-kompass-gcp-demo-00012-8kz`.

## Ergebnis

```text
Status: GO mit Bedingungen
```

Schritt 5 kann technisch starten, weil die zentrale GCP-Datenhaltung funktioniert und die API stabil erreichbar ist. Schritt 5 sollte aber nur in klar getrennten Teilpaketen umgesetzt werden. Ein grosser Komplettumbau zur Vollversion waere zu riskant.

## Gepruefter Stand

Live-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00012-8kz
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:17df1434-cd9c-49ba-a1f5-fa8175a97299
```

Live-Daten:

```text
Healthcheck: ok
Profile: 3
Organisationen: 14
Aktive Kontakte: 35
Archivierte Kontakte: 1
Importlaeufe: 0
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
npm run security:audit
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

Status:

- Privat umgesetzt und live getestet.
- Details: `GCP_STEP5_3_CONTACT_IMAGES.md`.

Ziel:

- Cloud Storage Bucket fuer Kontaktbilder.
- Bildpfad/URL in `contacts.image_url` speichern.
- Rechte- und Quellenfelder beibehalten.
- Upload, Auslieferung und Entfernen ueber Cloud Run bereitstellen.

Voraussetzung:

- Zugriffsschutz und Upload-Regeln klaeren.

### Schritt 5.4: Importfunktion vorbereiten

Status:

- Privat umgesetzt und live getestet.
- Details: `GCP_STEP5_4_IMPORT.md`.

Ziel:

- CSV-Import kontrolliert wieder einfuehren.
- Importvorschau vor dem Schreiben.
- Importlauf in `import_runs` speichern.
- Je importiertem Kontakt einen Aenderungsverlaufseintrag schreiben.
- Vor Import JSON-Export bestaetigen.

Voraussetzung:

- Backups aktiv.
- Export-Sicherheitsnetz aktiv.
- Fehler-/Dublettenpruefung vorhanden.

### Schritt 5.5: Profil und Rollenmodell light

Status:

- Privat umgesetzt und live getestet.
- Details: `GCP_STEP5_5_PROFILE_ROLES.md`.

Ziel:

- Demo-Akteur sichtbar machen.
- Rollenmodell read-only anzeigen.
- `Mein Profil` als eigene App-Seite bereitstellen.
- Spaeteren Auth-Anschluss vorbereiten, ohne ihn vorwegzunehmen.

Voraussetzung:

- Keine neue GCP-Komponente.
- Echte Auth bleibt spaeter zu klaeren.

### Uebersprungen: Gespeicherte Ansichten

Grund:

- Feature wird im aktuellen Frontend nicht aktiv verwendet.
- Buttons sind ausgeblendet bzw. spielen fuer Demo und Pitch keine Rolle.
- Umsetzung wuerde Nutzer-/Scope-Fragen aufwerfen, ohne direkten Nutzen fuer den naechsten Test.

Moegliche spaetere Rueckkehr:

- Wenn gespeicherte Filter wieder sichtbar genutzt werden.
- Wenn Team-/Privat-Scope und Nutzeridentitaet festgelegt sind.

## No-Go fuer Schritt 5

Nicht starten mit:

- Importfunktion als erstem Step-5-Paket.
- Rollenmodell ohne geklaerten Auth-Weg.
- Bild-Upload ohne klares Storage-/Zugriffskonzept.
- echten produktiven Daten ohne Backup.
- parallelem Umbau von Demo-App, Datenmodell, Auth, Import und Storage.

## Empfehlung

Nach 5.3 zuerst Import kontrolliert vorbereiten. Gespeicherte Ansichten bleiben bis auf Weiteres uebersprungen.
