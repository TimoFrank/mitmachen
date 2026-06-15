# GCP Step 5.6 Monitoring und Betrieb light

Stand: 2026-06-06

Status: privat umgesetzt, deployed und live getestet.

Live-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00013-l6j
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:6c191f3c-0dde-400f-9017-91dffac8ae1b
```

## Ziel

Die private GCP-Demo bekommt eine einfache Betriebsdiagnose direkt in der App. Damit kann beim Test schnell gezeigt werden, ob Cloud Run, Cloud SQL, Kern-Daten, Aenderungsverlauf, Export, Kontaktbilder und Backup-Basis plausibel erreichbar sind.

## Umsetzung

Neue API:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/ops/checks` | Kompakte Diagnose fuer Cloud Run, Cloud SQL, Datenbestand und offene Betriebspunkte |

Erweiterte API:

- `GET /api/export` enthaelt zusaetzlich `opsChecks`.

Erweiterte Demo-UI:

- Sidebar-Zeile `GCP Demo` oeffnet weiterhin die Betriebsseite.
- Die Betriebsseite zeigt jetzt einen Systemstatus.
- Einzelchecks werden als `OK`, `Warnung`, `Fehler` oder `Info` angezeigt.
- Der Detailbereich zeigt `Monitoring light`, Revision, Diagnosezeit, Backup-/PITR-Status und offene Punkte.

## Gepruefte Punkte

Der neue Check prueft bzw. dokumentiert:

- Cloud Run API antwortet.
- Cloud SQL antwortet und liefert Latenz.
- Kern-Daten sind vorhanden.
- Aenderungsverlauf enthaelt Ereignisse.
- Kontaktbild-Bucket ist konfiguriert.
- JSON-Export ist verfuegbar.
- Backups, PITR und Deletion Protection sind als Schutzbasis dokumentiert.
- Zugriffsschutz ist fuer Organisationsbetrieb noch offen.
- Echte Cloud Monitoring Alerts sind noch offen.

## Was 5.6 nicht macht

- keine Cloud Monitoring Alert Policy
- kein Benachrichtigungskanal
- kein Restore-Test
- kein IAP/SSO
- keine echte Uptime-SLA
- keine produktive Security-Freigabe

## Warum so

Fuer den privaten Test ist ein App-naher Status sinnvoller als ein sofortiger Vollausbau von Cloud Monitoring. Echte Alerts brauchen spaeter freigegebene Benachrichtigungskanaele, Verantwortlichkeiten und Organisationszugriff.

## Naechster Ausbauschritt

Vor Live-Betrieb in der Organisation sollten folgen:

1. Zugriffsschutz klaeren: IAP, SSO oder interne Zugriffsschicht.
2. Benachrichtigungskanal fuer Cloud Monitoring festlegen.
3. Restore-Test aus Cloud-SQL-Backup dokumentieren.
4. Entscheiden, ob Cloud SQL regional/HA betrieben werden soll.

## Testablauf

Lokal:

```bash
npm run check:gcp-demo
npm run check:demo
npm run check
npm run security:audit
git diff --check
```

Live-Smoke:

```text
GET /api/healthz: ok, Revision versorgungs-kompass-gcp-demo-00013-l6j
GET /api/ops/checks: Status OK, 9 Checks, 7 OK, 2 Info
GET /api/export: opsChecks enthalten
10 parallele Healthchecks: 10/10 ok
10 parallele Bootstrap-Aufrufe: 10/10 ok
10 parallele Ops-Checks: 10/10 ok
Cloud Run Traffic: 100 Prozent auf Revision 00013-l6j
```

Visual QA:

```text
Desktop 1440x900: Betriebsseite ohne horizontale Ueberlaeufe
Mobile 390x844: Betriebsseite ohne horizontale Ueberlaeufe
Statusbadges: OK, Info, Warnung, Fehler lesbar
Browser-Konsole: keine Fehler
```
