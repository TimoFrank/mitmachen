# Zum Versorgungs-Kompass beitragen

Danke für dein Interesse. Kleine, gut erklärte Änderungen sind am leichtesten zu prüfen.

## Vor einer Änderung

- Prüfe zuerst, ob bereits ein passendes Issue existiert.
- Beschreibe größere Vorschläge vor der Umsetzung kurz in einem neuen Issue.
- Verwende nur fiktive Daten. Echte Kontakt- oder Betriebsdaten gehören nicht in das Repository.
- Melde Sicherheitslücken nach der [Sicherheitsrichtlinie](SECURITY.md), nicht als öffentliches Issue.

## Lokal starten

Vorausgesetzt werden Node.js und npm.

```bash
npm install
npm start
```

Danach sind die wichtigsten Einstiege erreichbar:

- App: `http://localhost:4173/frontend/app/versorgungs-kompass.html`
- Demo: `http://localhost:4173/frontend/demo/`

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

Ein freigegebener Push auf `main` startet ausschließlich den Pages-Workflow. Das GKE-Deployment bleibt ein eigener, manueller und geschützter Vorgang.

Bitte füge keine Zugangsdaten, Service-Role-Keys, produktiven Exporte oder personenbezogenen Daten hinzu.
