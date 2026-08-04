# Zum Versorgungs-Kompass beitragen

Danke für dein Interesse. Kleine, gut erklärte Änderungen sind am leichtesten zu prüfen.

## Vor einer Änderung

- Prüfe zuerst, ob bereits ein passendes Issue existiert.
- Beschreibe größere Vorschläge vor der Umsetzung kurz in einem neuen Issue.
- Verwende nur fiktive Daten. Echte Kontakt- oder Betriebsdaten gehören nicht in das Repository.
- Melde Sicherheitslücken nach der [Sicherheitsrichtlinie](SECURITY.md), nicht als öffentliches Issue.

## Sprache für Pull Requests und Commits

Pull-Request-Titel, Pull-Request-Beschreibungen, Commit-Kurzbeschreibungen und
ausführliche Commit-Beschreibungen werden auf Deutsch verfasst. Technische
Eigennamen, Code-Bezeichner, Befehle, Protokolle und unverändert wiederzugebende
Meldungen dürfen englisch bleiben.

Lokale Zwischen-Commits benötigen noch keine PR-Nummer. Beim Squash-Merge folgt
der dauerhafte Commit-Titel auf `main` dem Format
`Deutscher PR-Titel (#123)`; GitHub erzeugt und verlinkt die Nummer. Automatisch
erzeugte englische Texte werden vor dem Merge übersetzt, wenn sie in die
dauerhafte Historie übernommen werden.

## Lokal starten

Vorausgesetzt werden Node.js und npm.

```bash
npm install
npm run build:pages
npm start
```

Danach sind die wichtigsten Einstiege erreichbar:

- App: `http://localhost:4173/frontend/app/versorgungs-kompass.html`
- Demo: `http://localhost:4173/dist/pages/`

Die beiden Einstiege verwenden dieselbe App-Oberfläche. Die gebaute Pages-Demo lädt ausschließlich `demo-data.js` und den lokalen `demo-api.js`-Adapter, hat keinen Login und sendet keine Fachdaten an ein externes API. Die App-Quelle benötigt dagegen die geschützte Target-Runtime und API-Konfiguration.

## Änderungen prüfen

```bash
npm run check
```

Bei sichtbaren Änderungen zusätzlich:

```bash
npm run test:visual
```

Bitte beachte die [Projektregeln](dokumentation/entwicklung-und-qa/PROJEKTREGELN.md), das [Designsystem](dokumentation/produkt-und-design/DESIGN_SYSTEM.md) und den [QA-Ablauf](dokumentation/entwicklung-und-qa/QA_WORKFLOW.md).

## Veröffentlichung

Die führenden Quellen liegen in `frontend/` und `public/`. GitHub Pages wird über GitHub Actions aus einem reproduzierbaren `dist/pages/`-Artefakt veröffentlicht; generierte Dateien werden nicht committed.

Vor einem Pull Request oder einer Veröffentlichung:

```bash
npm run check
npm run build:pages
```

Bei Änderungen am Produkt-Release-Prozess zusätzlich:

```bash
npm run test:release-automation
npm run check:deployment-governance
```

Pages wird ausschließlich aus einem verifizierten, signierten Produkt-Tag über
den Release-Workflow ausgeliefert. Ein gewöhnlicher Push auf `main` löst kein
Deployment aus. Das GKE-Deployment bleibt ein eigener, manueller und
geschützter Vorgang.

Bitte füge keine Zugangsdaten, Service-Role-Keys, produktiven Exporte oder personenbezogenen Daten hinzu.
