# Current State

Stand: 2026-07-19.

## Aktiver Arbeitsmodus

- Fuehrende App-Dateien: `frontend/app/versorgungs-kompass.html`, `frontend/map/versorgungs-kompass-map.html`, `frontend/login/login.html`.
- GitHub Pages wird per GitHub Actions aus `dist/pages/` veroeffentlicht; es gibt keinen versionierten Publish-Spiegel.
- Kleine UI-Wuensche starten im Effizienzmodus aus `QA_WORKFLOW.md`.
- Bei sichtbaren UI-Aenderungen bleiben `../produkt-und-design/DESIGN_SYSTEM.md`, `../produkt-und-design/UX_PRINCIPLES.md`, `../produkt-und-design/COMPONENT_INVENTORY.md`, `../produkt-und-design/UI_TECH_DEBT.md` und `../produkt-und-design/VISUAL_QA_CHECKLIST.md` die relevanten Leitplanken.

## QA-Standard

- Kleine Aenderung: `npm run qa:small`.
- Fokussierte UI-/Flow-Aenderung: `npm run check` plus gezielter Playwright-Test mit `-g`.
- Groessere Aenderung oder Push-/Deploy-Auftrag: `npm run qa:full`.
- Vollstaendige Regeln stehen in `QA_WORKFLOW.md`.

## Auth-Testmodus

- Gemeinsamer Playwright-Helper: `tests/helpers/app-test-session.js`.
- Neue Playwright-Tests sollen `gotoAuthenticated(page, path, options)` nutzen.
- Der Helper stubbt Auth-Guard und Demo-Konfiguration und ersetzt lokale Browser-Storage-Workarounds.

## Bekannte Stolperstellen

- Der In-App-Browser kann je nach Sitzung LocalStorage-Schreibzugriffe blockieren. Fuer reproduzierbare lokale QA daher Playwright mit `gotoAuthenticated` bevorzugen.
- `playwright.config.js` nutzt Port `4173` und darf bestehende lokale Server wiederverwenden. Bei merkwuerdigen Testergebnissen pruefen, ob ein alter Server noch denselben Port belegt.
- `frontend/app/versorgungs-kompass.html` ist weiterhin gross und override-lastig. Bei kleinen Aenderungen gezielt suchen und patchen, nicht breit refactoren.

## Git-Status-Regel

- Nach Datei- oder Repo-Aenderungen im Abschluss immer sagen, ob die Aenderungen uncommitted oder ungepusht sind.
- Nicht automatisch committen oder pushen, ausser der Nutzer verlangt Push, Deploy, Live-Stellen, Veroeffentlichung oder GitHub-Pages-Aktualisierung.
- Bei jedem Push-/Live-/GitHub-Pages-Auftrag `npm run build:pages` lokal pruefen; generierte `dist/`-Artefakte niemals committen.
