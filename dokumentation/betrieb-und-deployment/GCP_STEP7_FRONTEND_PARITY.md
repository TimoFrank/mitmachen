# GCP Step 7 Frontend-Paritaet zur Original-App

Stand: 2026-06-06

Status: erster Frontend-Paritaets-Slice privat umgesetzt, deployed und live getestet. Seit Step 8 ist dieser Ansatz durch den Original-UI-Port abgeloest; Details stehen in `GCP_STEP8_ORIGINAL_UI_PORT.md`.

## Ziel

Die GCP-Version soll nicht wie eine separat gebaute Demo wirken. Sie soll sichtbar naeher an die bestehende Original-App ruecken, ohne Supabase wieder einzufuehren.

## Entscheidung

Nicht die alte Supabase-App 1:1 nach GCP kopieren.

Stattdessen:

- Frontend-Muster aus der Original-App uebernehmen.
- Supabase-Aufrufe nicht uebernehmen.
- Bestehende GCP-API weiter nutzen.
- Frontend-only Funktionen wie Spaltenauswahl lokal speichern.

## Umgesetzt in diesem Slice

Kontaktansicht:

- neue Command-Row nach Original-Muster
- Suche als ruhige Search-Shell
- Filterbutton mit Popover
- aktive Filterchips
- Filter zuruecksetzen
- Spaltenbutton `Spalten`
- sichtbare Kontaktspalten per localStorage
- dynamische Kontakt-Tabelle mit Fachrichtung, Ort, Owner, Prioritaet und optional weiteren Spalten

Kontaktprofil:

- Profilkopf naeher an Original-Drawer
- Bild/Initialen, Name, Rolle, Organisation und Standort im Kopf
- Prioritaet und Owner als kompakte Metadaten
- klare Profilaktionen
- CRM-Zeilenlisten fuer Einordnung, Kontaktwege und Bildquelle
- Notiz und naechster Schritt als Lesemodus

App-Wording:

- sichtbares Demo-Wording reduziert
- GCP-Oberflaeche spricht von `GCP Pilot`
- Reset heisst `Testdaten zuruecksetzen`

Mobile:

- Filter und Spaltenmenue laufen auf kleinen Screens als festes, scrollbares Sheet
- Kontaktzeilen zeigen mobile Feldlabels statt horizontaler Tabelle

## Bewusst nicht uebernommen

- Supabase Auth
- Supabase RLS
- gespeicherte Ansichten
- grosse Admin- oder Nutzerverwaltung
- alte UI-Altlasten wie dekorative Cards, Gradients und mehrere Buttonsprachen

## Naechste Frontend-Paritaets-Kandidaten

- Organisationenliste mit Spaltenauswahl
- Organisationendetail naeher an Original-Profil
- Importstartseite naeher an Original-Workflow
- mobile Detailnavigation weiter verbessern
- weitere Demo-/Pilot-Wording-Stellen pruefen

## Live-Stand

Cloud Run:

```text
Service: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00017-g9q
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:696b508e-885a-4967-b5e0-bc5382a034ab
```

Wichtig fuer kuenftige Deployments: fuer die GCP-Backend-Version immer `cloudbuild.gcp-demo.yaml` bzw. `Dockerfile.gcp-demo` verwenden. Der normale `Dockerfile` ist der statische `docs/`-Spiegel und nicht der Cloud-SQL-Backend-Service.

```bash
gcloud builds submit --project steam-capsule-341212 --config cloudbuild.gcp-demo.yaml .
```

## Testablauf und Ergebnis

Lokal:

```bash
npm run check:gcp-demo
npm run check:demo
git diff --check
```

Live-Smoke:

```text
GET /api/healthz: ok, backend cloud-sql, Revision 00017-g9q
GET /api/session: Pilot-Profil ohne Login
GET /api/ops/checks: status ok
Cloud Run Traffic: 100 Prozent auf 00017-g9q
```

Visual QA:

```text
Desktop 1440x900: Kontaktliste, Suche, Filter, Spaltenmenue und Kontaktprofil ok; keine horizontale Seitenscrollbar
Tablet 1024x768: Kontaktliste und Detailprofil ohne Layoutbruch; Tabelle scrollt intern
Mobile 390x844: Kontaktkarten mit Feldlabels, Filter-Sheet, Spalten-Sheet und Kontaktprofil ohne horizontale Seitenscrollbar
Browser-Konsole: keine Fehler
```
