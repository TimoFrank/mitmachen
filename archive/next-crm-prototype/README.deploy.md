# Deploy in 10 Minuten

## Ziel

Ein Render-Deploy per Blueprint mit persistenter SQLite-Datei und sofort sichtbaren Seed-Daten.

## 1. Repository zu GitHub pushen

Das Render-Blueprint liest `render.yaml` direkt aus dem Repo.

## 2. In Render neues Blueprint-Deploy anlegen

In Render:

1. `New +`
2. `Blueprint`
3. GitHub-Repository verbinden
4. Branch waehlen

Render erkennt automatisch [render.yaml](/Users/timofrank/Desktop/Versorgungs-CRM/render.yaml).

## 3. Umgebungsvariablen pruefen

Im Blueprint sind bereits gesetzt:

- `NODE_VERSION=22.14.0`
- `DATABASE_PATH=/var/data/crm.sqlite`
- `SESSION_SECRET` wird automatisch generiert

Manuell setzen:

- `APP_URL=https://<deine-render-domain>`

## 4. Deploy starten

Render fuehrt aus:

```bash
npm install && npm run build
npm run start
```

Beim ersten Request:

- wird die SQLite-Datei unter `/var/data/crm.sqlite` angelegt
- das Schema initialisiert
- die Demo-Daten automatisch geseedet

## 5. Login testen

Nach dem Deploy:

1. `/login` aufrufen
2. Mit einem Demo-User einloggen:
   - `anna@versorgungscrm.local` / `demo1234`
   - `marc@versorgungscrm.local` / `demo1234`

## Demo-Daten spaeter erweitern

Wenn du spaeter weitere Demo-Daten in dieselbe SQLite-Datei schreiben willst, oeffne in Render die Shell und fuehre aus:

```bash
npm run seed:demo
```

Optional mit zusaetzlichen Datensaetzen:

```bash
npm run seed:demo -- --add-people=20 --add-organizations=5
```

Fuer einen grossen Schwung neuer Demo-Daten:

```bash
npm run seed:demo:large
```

Das Script loescht keine bestehenden Daten. Es ergaenzt den Basiskatalog idempotent und kann die bestehende Datenbank gezielt weiter auffuellen.

## 6. Was direkt funktioniert

- Dashboard mit Kennzahlen
- Listen fuer Personen und Organisationen
- Detailseiten mit Bearbeitung
- Notizstream pro Person und Organisation
- Owner-Zuordnung ueber User

## Render-Hinweis

SQLite ist hier absichtlich maximal einfach gehalten. Die Datei liegt auf dem persistenten Render-Disk-Mount. Fuer dieses MVP ist das passend; fuer groessere Teams oder Write-Last sollte spaeter auf Postgres gewechselt werden.
