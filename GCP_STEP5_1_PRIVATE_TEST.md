# GCP Step 5.1 Privater Test

Stand: 2026-06-06

Diese Notiz beschreibt den umgesetzten privaten Step-5.1-Test. Ziel war nicht die volle Produktversion, sondern die naechste fachliche Ausbaustufe auf der bestehenden Cloud-Run- und Cloud-SQL-Basis.

## Ergebnis

```text
Status: umgesetzt und live getestet
```

Step 5.1 erweitert die GCP-Demo um zentrale Schreibfunktionen:

- Kontakt anlegen.
- Organisation anlegen.
- Organisation bearbeiten.
- Kontakt archivieren.
- Kontakt wiederherstellen.
- Aenderungsverlauf fuer Anlegen, Archivieren und Wiederherstellen schreiben.

Nicht enthalten:

- Importfunktion.
- Auth/Rollenmodell.
- Upload von Kontaktbildern.
- gespeicherte Ansichten.
- Admin-Konsole.

## Live-Service

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00004-2x7
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:035a02fa-45f3-4399-8f8a-09b1c8fa196a
```

## API-Erweiterungen

Neue oder erweiterte Endpunkte:

```text
GET  /api/bootstrap?includeArchived=true
POST /api/organizations
GET  /api/organizations?includeArchived=true
GET  /api/organizations/:id
PATCH /api/organizations/:id
POST /api/contacts
PATCH /api/contacts/:id
GET  /api/contacts/:id/history
```

`PATCH /api/contacts/:id` kann jetzt neben Bearbeitung und Ownerwechsel auch Statuswechsel protokollieren:

```text
active -> archived = archive
archived -> active = restore
```

## UI-Erweiterungen

In der GCP-Demo sind jetzt sichtbar:

- Button `Kontakt anlegen`.
- Button `Archiv anzeigen`.
- Archiv-/Wiederherstellen-Aktion im Kontaktdetail.
- Button `Organisation anlegen`.
- Organisationsdetail mit Bearbeitungsmodus.
- Karte bleibt als Original-Kartenmodus eingebunden.

## Datensatz

Nach Reset:

```text
Profile: 3
Organisationen: 14
Kontakte inkl. Archiv: 36
Aktive Kontakte in der Liste: 35
Archivierte Kontakte: 1
```

Die Testdaten aus dem Smoke-Test wurden per `POST /api/reset-demo` wieder entfernt.

## Gepruefte Funktionen

Live-API-Smoke-Test:

```text
GET /api/healthz -> ok
POST /api/reset-demo -> ok
POST /api/organizations -> ok
PATCH /api/organizations/:id -> ok
POST /api/contacts -> ok
PATCH /api/contacts/:id status archived -> ok
PATCH /api/contacts/:id status active -> ok
GET /api/contacts/:id/history -> restore, archive, create vorhanden
POST /api/reset-demo -> Seed-Zustand wiederhergestellt
```

Browser-Check Cloud Run:

```text
Kontaktansicht: 35 aktive Kontakte, Kontakt anlegen sichtbar, Archiv anzeigen (1) sichtbar
Organisationsansicht: 14 Organisationen, Organisation anlegen sichtbar, Detailpanel sichtbar
Kartenansicht: Original-Karte per /map/versorgungs-kompass-map.html?embed=1&demo=1 eingebunden
```

Lokale Checks:

```bash
npm run check:gcp-demo
npm run check:demo
npm run check
git diff --check
```

Ergebnis: alle gruen.

## Naechster sinnvoller Schritt

Step 5.2 sollte separat entschieden werden:

- Kontaktbilder ueber Cloud Storage zentralisieren, oder
- gespeicherte Ansichten in Cloud SQL einfuehren.

Vor echten Live-Daten sollten Backups und Deletion Protection fuer Cloud SQL aktiviert werden.
