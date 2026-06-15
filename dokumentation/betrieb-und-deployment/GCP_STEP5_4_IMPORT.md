# GCP Step 5.4 Importvorbereitung

Stand: 2026-06-06

Status: privat umgesetzt, deployed und live getestet.

Live-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00009-7pn
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:2b94b7e4-8f60-43f2-ac0e-1e37799c5e14
```

## Ziel

Die private GCP-Demo bekommt eine schlanke Importfunktion fuer Kontakte. Supabase bleibt dabei ersetzt: Vorschau, Importlauf, Kontakte und Aenderungsverlauf laufen ueber Cloud Run und Cloud SQL.

## Umsetzung

Neue Datenhaltung:

- `import_runs`: speichert abgeschlossene Importlaeufe mit Datei, Zaehlern und Report.
- `changes.action = import`: markiert jeden per Import angelegten Kontakt im Aenderungsverlauf.

Neue API-Endpunkte:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `POST` | `/api/import/preview` | CSV pruefen, Dubletten und Fehler anzeigen |
| `POST` | `/api/import/commit` | importierbare Kontakte nach Export-Bestaetigung schreiben |
| `GET` | `/api/import/runs` | letzte Importlaeufe anzeigen |

Neue Demo-UI:

- Sidebar-Bereich `Importe`.
- CSV-Datei oder CSV-Text.
- Vorschau mit Fehlern, Dubletten, neuen Organisationen und importierbaren Zeilen.
- JSON-Export-Bestaetigung vor dem Schreiben.
- Importhistorie im rechten Detailbereich.

## Importregeln

- Maximal 100 Zeilen pro Demo-Import.
- CSV mit Komma oder Semikolon.
- Pflichtfeld: `name`.
- Bekannte Dubletten werden nicht importiert.
- Neue Organisationen werden automatisch angelegt.
- Unbekannte Owner werden als Warnung behandelt; die App nutzt dann den Demo-Akteur.
- Importierte Kontakte erhalten einen Eintrag im Aenderungsverlauf.

## Unterstuetzte Spalten

Wichtige Spalten:

- `name`
- `organization`
- `category`
- `specialty`
- `role`
- `priority`
- `owner`
- `email`
- `phone`
- `city`
- `state`
- `postalCode`
- `lat`
- `lon`
- `themes`
- `note`
- `nextStep`
- `image`
- `source`
- `status`

Deutsche Aliasnamen wie `Organisation`, `Telefon`, `Prioritaet`, `Ort`, `Bundesland`, `PLZ`, `Themen` und `Notiz` werden ebenfalls erkannt.

## Sicherheitsnetz

Vor dem Import muss in der UI `JSON exportieren` genutzt und `Export liegt vor` bestaetigt werden. Die API akzeptiert den Commit nur mit `exportConfirmed: true`.

Fuer den privaten Test reicht das als schlankes Rueckfallnetz, weil Step 5.2 bereits Cloud-SQL-Backups, PITR und Deletion Protection aktiviert hat.

## Noch offen fuer Organisationsbetrieb

- Zugriffsschutz vor Export- und Import-Endpunkten.
- Verbindlicher Rollback-/Restore-Test.
- Entscheidung, ob Importdateien dauerhaft in Cloud Storage archiviert werden sollen.
- Entscheidung, ob Excel-Dateien serverseitig direkt gelesen werden muessen oder CSV reicht.

## Testablauf

Lokal:

```bash
npm run check:gcp-demo
npm run check:demo
npm run check
git diff --check
```

Live-Smoke:

1. `POST /api/import/preview` mit einer kleinen CSV-Datei.
2. Pruefen, dass `canCommit` true ist.
3. `POST /api/import/commit` mit `exportConfirmed: true`.
4. Pruefen, dass Kontakt, Importlauf und Aenderungsverlauf geschrieben wurden.
5. Demo zuruecksetzen, damit der Live-Stand wieder sauber ist.

Ergebnis am 2026-06-06:

```text
Preview: canCommit=true, 1 importierbare Zeile, 1 neue Organisation
Commit: 1 Kontakt importiert
History: action=import vorhanden
Import runs: letzter Lauf gespeichert
Reset: Live-Demo zurueckgesetzt
Endstand: 35 aktive Kontakte, 1 archivierter Kontakt, 0 Importlaeufe, 8 Aenderungen
```

Visual QA:

```text
Desktop 1440x900: keine horizontale Ueberlaeufe, 2 Vorschauzeilen sichtbar
Mobile 390x844: keine horizontale Ueberlaeufe, Sidebar und Importbereich nutzbar
Browser-Konsole: keine Fehler
```
