# GCP Step 5.2 Betriebssicherheit

Stand: 2026-06-06

Diese Notiz beschreibt Step 5.2 der privaten GCP-Ueberfuehrung. Ziel ist ein belastbarerer Demo-Betrieb, bevor weitere Funktionen wie Kontaktbilder, gespeicherte Ansichten oder Import reaktiviert werden.

## Ergebnis

```text
Status: umgesetzt und live getestet
```

Step 5.2 fuegt kein neues fachliches CRM-Modul hinzu. Der Schritt sichert die bestehende Cloud-SQL-Demo gegen Datenverlust und macht den Betriebszustand einfacher pruefbar.

Umgesetzt:

- Cloud SQL Backups aktiviert.
- Point-in-Time-Recovery fuer 7 Tage aktiviert.
- Deletion Protection fuer die Cloud-SQL-Instanz aktiviert.
- API-Betriebsstatus ergaenzt.
- JSON-Export des aktuellen Demo-Datenstands ergaenzt.
- Dezente Betriebsansicht in der Demo-Shell ergaenzt.

Nicht enthalten:

- Hochverfuegbarkeit / regionale Cloud-SQL-Instanz.
- Auth, Rollenmodell oder IAP.
- Cloud Monitoring Alert Policies.
- Cloud Storage fuer Kontaktbilder.
- Importfunktion.

## Cloud-SQL-Schutz

Live-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00005-gnd
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:4a31a53b-5c33-4876-8517-e2d248d7865b
```

Zielzustand:

```text
Instanz: versorgungs-kompass-gcp-demo-db
Region: europe-west3
Backups: aktiviert
Backup-Startzeit: 02:00 UTC
Retained Backups: 7
Point-in-Time-Recovery: aktiviert
Transaction Log Retention: 7 Tage
Deletion Protection: aktiviert
Availability: ZONAL
Tier: db-f1-micro
```

Rueckgelesener GCP-Status nach Patch:

```text
Cloud SQL State: RUNNABLE
Backups enabled: true
Point-in-Time-Recovery enabled: true
Replication Log Archiving: true
Transactional Log Storage State: CLOUD_STORAGE
Retained Backups: 7
Transaction Log Retention: 7 Tage
Deletion Protection: true
Availability: ZONAL
Tier: db-f1-micro
Storage: 10 GB, Auto-Resize aktiv
```

Ausgefuehrter Befehl:

```bash
gcloud sql instances patch versorgungs-kompass-gcp-demo-db \
  --backup-start-time=02:00 \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7 \
  --enable-point-in-time-recovery \
  --deletion-protection \
  --quiet
```

Bewusste Nicht-Aenderung:

- Keine Umstellung auf `REGIONAL`, weil das fuer den privaten Test deutlich teurer waere.
- Keine groessere Maschine, weil Performance aktuell nicht der Engpass ist.
- Kein eigener Backup-Bucket, weil Cloud SQL verwaltete Backups fuer diesen Stand ausreichen.

## API-Erweiterungen

Neue oder erweiterte Endpunkte:

```text
GET /api/healthz
GET /api/ops/summary
GET /api/export
```

`GET /api/healthz` prueft weiterhin, ob Schema/Seed/DB-Zugriff bereit sind, und liefert zusaetzlich Runtime-Metadaten.

`GET /api/ops/summary` liefert:

- Cloud-SQL-Backendstatus.
- Cloud-Run-Service und Revision.
- Anzahl Profile.
- Anzahl aktiver und archivierter Organisationen.
- Anzahl aktiver und archivierter Kontakte.
- Anzahl Aenderungen.
- Zeitpunkte der letzten Kontakt- und Verlaufsaktualisierung.

`GET /api/export` liefert einen JSON-Export:

- `profiles`
- `organizations`
- `contacts`
- `changes`
- `summary`

Der Export ist ein Demo-Rueckfallpunkt vor groesseren Tests, Imports oder Reset-Aktionen. Fuer echten Organisationsbetrieb muss dieser Endpunkt hinter internen Zugriffsschutz oder Auth.

## UI-Erweiterung

Die bestehende Sidebar-Zeile `GCP Demo / Cloud SQL Backend` oeffnet jetzt eine dezente Betriebsansicht.

Die Ansicht zeigt:

- aktive Kontakte
- archivierte Kontakte
- Organisationen
- Aenderungen
- Backendstatus
- letzte Aenderung
- Cloud-Run-Revision
- Button `Status aktualisieren`
- Button `JSON exportieren`

## Verifikation

Lokal:

```bash
npm run check:gcp-demo
npm run check:demo
npm run check
git diff --check
```

Live:

```text
GET /api/healthz -> ok, Revision versorgungs-kompass-gcp-demo-00005-gnd
GET /api/ops/summary -> 35 aktive Kontakte, 1 archiviert, 14 Organisationen, 8 Aenderungen
GET /api/export -> JSON Attachment, 3 Profile, 14 Organisationen, 36 Kontakte, 8 Aenderungen
Browser-Check Betriebsansicht -> sichtbar mit Status aktualisieren und JSON exportieren
```

Cloud SQL Operationen:

```text
UPDATE -> DONE
BACKUP_VOLUME -> DONE
```

Ausgefuehrte Checks:

```text
GET /api/ops/summary
GET /api/export
Browser-Check Betriebsansicht
```

## Naechster sinnvoller Schritt

Nach Step 5.2 ist der naechste fachliche Schritt:

```text
Step 5.3 Kontaktbilder ueber Cloud Storage vorbereiten
```

Import sollte weiterhin erst nach Backup-/Export-Sicherheitsnetz umgesetzt werden.

Step 5.3 wurde danach gestartet. Details: `GCP_STEP5_3_CONTACT_IMAGES.md`.

Update: Step 5.6 erweitert diese einfache Betriebsansicht um Monitoring light und `GET /api/ops/checks`. Details stehen in `GCP_STEP5_6_MONITORING.md`.
