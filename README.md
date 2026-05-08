# Versorgungs-Kompass

Das gematik-Hospitationsnetzwerk

Privates Arbeits-Repository fuer den `Versorgungs-Kompass`, den Karten-Modus und die zugehoerige Datenbasis des `gematik-Hospitationsnetzwerks`.

Der Projektordner enthaelt aktuell zwei Arbeitsstraenge:

- einen **statischen Versorgungs-Kompass** auf HTML-/JS-Basis
- einen **Next.js CRM-Prototyp**, der perspektivisch als weiterentwickelte Anwendung dienen kann

## Einstieg

Fuer den aktuellen nutzbaren Stand sind diese Dateien relevant:

- `login.html`: vorgeschaltete Login-Seite
- `versorgungs-kompass.html`: Hauptansicht des Kompass
- `versorgungs-kompass-map.html`: Karten-Modus als Overlay-Inhalt
- `versorgungs-kompass-map-teaser.html`: Mini-Karten-Vorschau fuer die Login-Seite
- `auth-config.js`, `auth-guard.js`, `auth-login.js`: einfache Passwort-Schranke

## Daten

Die produktiven Seed-Daten fuer den Kompass liegen hier:

- `data/versorgungs-kompass-data.js`
- `data/versorgungs-kompass-data.csv`

Die Karten- und Masterdaten fuer das `Mitmachen`- / Versorgungs-Netzwerk liegen hier:

- `deutschlandkarte-project/data/locations-master.csv`
- `deutschlandkarte-project/data/locations.js`
- `deutschlandkarte-project/data/locations-public.js`

## Ordnerueberblick

- `data/`: Kompass-Daten, CSV-Import-/Exportbasis
- `deutschlandkarte-project/`: Deutschlandkarte, Referenzlayouts, Kartendaten und Importskripte
- `public/`: Logos und statische Assets
- `app/`, `components/`, `lib/`: Next.js CRM-Prototyp
- `scripts/`: Hilfsskripte fuer Seed und Smoke-Test

## Lokale Nutzung des statischen Kompass

Du kannst den aktuellen Kompass direkt lokal oeffnen:

1. `login.html`
2. Passwort eingeben
3. Weiterleitung in den `Versorgungs-Kompass`

Wichtig:

- Fuer den Karten-Modus werden zusaetzliche Kartendateien aus `deutschlandkarte-project/data/` benoetigt.
- Der Login ist bewusst einfach gehalten und fuer private, kontrollierte Nutzung gedacht.

## Lokaler Start des Next.js-Prototyps

### Voraussetzungen

- Node.js 22
- npm 10+

### Installation

```bash
npm install
```

### Umgebungsvariablen

```bash
cp .env.example .env.local
```

Beispiel:

```env
APP_URL=http://localhost:3000
SESSION_SECRET=ein-langer-zufaelliger-string
DATABASE_PATH=./data/crm.sqlite
```

### Start

```bash
npm run dev
```

Danach ist der Prototyp unter [http://localhost:3000](http://localhost:3000) erreichbar.

### Hilfreiche Checks

```bash
npm run typecheck
npm run lint
npm run smoke
```

## Zusammenarbeit im privaten GitHub-Repo

Empfohlenes Vorgehen:

1. `main` nur fuer stabile Staende nutzen
2. groessere Aenderungen in kurzen Feature-Branches bearbeiten
3. Datenpflege bevorzugt ueber die CSV-/Masterdateien dokumentieren
4. keine echten Zugangsdaten oder lokalen `.env`-Dateien committen

## Hinweise zum Commit-Umfang

Dieses Repo soll bewusst auch die statischen Daten des `Versorgungs-Kompass` enthalten. Deshalb wird `data/` **nicht** pauschal ignoriert. Ignoriert werden nur lokale SQLite-Dateien und Laufzeitartefakte.

## Deployment

Die bisherige Deploy-Notiz fuer den App-Prototyp liegt in [README.deploy.md](/Users/timofrank/Desktop/Versorgungs-CRM/README.deploy.md).
