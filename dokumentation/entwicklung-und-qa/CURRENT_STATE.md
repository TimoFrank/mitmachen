# Current State

Stand: 2026-07-21.

## Aktiver Arbeitsmodus

- Fuehrende App-Quellen: `frontend/app/versorgungs-kompass.html` fuer das Markup sowie `frontend/app/versorgungs-kompass.css` und `frontend/app/versorgungs-kompass.js` fuer Darstellung und Verhalten. Karte, Login, Hospitation und oeffentliche #Mitmachen-Seiten folgen demselben Muster mit eigenen HTML-, CSS- und gegebenenfalls JS-Dateien.
- Produktive HTML-Einstiegspunkte enthalten keine Inline-Stylesheets, Inline-Skripte oder Inline-Event-Handler. `scripts/test_security_contracts.mjs` sichert diese CSP-relevante Grenze ab.
- GitHub Pages wird per GitHub Actions als reproduzierbares `dist/pages/`-Artefakt gebaut und veroeffentlicht. Das Artefakt nutzt die App-Quellen mit einem anonymen, rein synthetischen Demo-Datenadapter; es gibt keinen versionierten Publish-Spiegel.
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
- Die groessten UI-Dateien sind jetzt `frontend/app/versorgungs-kompass.css` und `frontend/app/versorgungs-kompass.js`. Bei kleinen Aenderungen im zustaendigen Selektor beziehungsweise Funktionsbereich arbeiten und keine neuen Inline-Bloecke in HTML einfuehren.
- `frontend/app/versorgungs-kompass.css` enthaelt noch die fruehere Konsolidierungsschicht und spaete, ansichtsbezogene Regeln. Diese technische Schuld ist in `../produkt-und-design/UI_TECH_DEBT.md` beschrieben; sie macht die HTML-Datei selbst nicht mehr override-lastig.

## Git-Status-Regel

- Nach Datei- oder Repo-Aenderungen im Abschluss immer sagen, ob die Aenderungen uncommitted oder ungepusht sind.
- Nicht automatisch committen oder pushen, ausser der Nutzer verlangt Push, Deploy, Live-Stellen, Veroeffentlichung oder GitHub-Pages-Aktualisierung.
- Bei jedem Push-/Live-/GitHub-Pages-Auftrag `npm run build:pages` lokal pruefen; generierte `dist/`-Artefakte niemals committen.
