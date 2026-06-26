# Current State

Stand: 2026-06-26.

## Aktiver Arbeitsmodus

- Fuehrende App-Dateien: `frontend/app/versorgungs-kompass.html`, `frontend/map/versorgungs-kompass-map.html`, `frontend/login/login.html`.
- `docs/` ist der GitHub-Pages-Spiegel und wird nur bei Push-/Live-/GitHub-Pages-Auftraegen synchronisiert.
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
- Bei jedem Commit-/Push-/Live-Auftrag `docs/` automatisch mit `bash scripts/sync_github_pages.sh` synchronisieren und die resultierenden Publish-Artefakte mit einbeziehen, ohne vorher noch einmal nachzufragen.
