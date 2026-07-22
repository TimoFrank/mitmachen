# Current State

Stand: 2026-07-21.

## Aktiver Arbeitsmodus

- Führende App-Quellen: `frontend/app/versorgungs-kompass.html` für das Markup sowie `frontend/app/versorgungs-kompass.css` und `frontend/app/versorgungs-kompass.js` für Darstellung und Verhalten. Karte, Login, Hospitation und öffentliche #Mitmachen-Seiten folgen demselben Muster mit eigenen HTML-, CSS- und gegebenenfalls JS-Dateien.
- Target-HTML-Einstiegspunkte dürfen keine Inline-Stylesheets, Inline-Skripte oder Inline-Event-Handler enthalten. `scripts/test_security_contracts.mjs` sichert diese CSP-relevante Grenze für jeden konkreten RC ab; es gibt keine pauschale Produktionsfreigabe des beweglichen Arbeitsstands.
- GitHub Pages wird per GitHub Actions als reproduzierbares `dist/pages/`-Artefakt gebaut und veröffentlicht. Das Artefakt nutzt die App-Quellen mit einem anonymen, rein synthetischen Demo-Datenadapter; es gibt keinen versionierten Publish-Spiegel.
- Kleine UI-Wünsche starten im Effizienzmodus aus `QA_WORKFLOW.md`.
- Bei sichtbaren UI-Änderungen bleiben `../produkt-und-design/DESIGN_SYSTEM.md`, `../produkt-und-design/UX_PRINCIPLES.md`, `../produkt-und-design/COMPONENT_INVENTORY.md`, `../produkt-und-design/UI_TECH_DEBT.md` und `../produkt-und-design/VISUAL_QA_CHECKLIST.md` die relevanten Leitplanken.

## QA-Standard

- Kleine Änderung: `npm run qa:small`.
- Fokussierte UI-/Flow-Änderung: `npm run check` plus gezielter Playwright-Test mit `-g`.
- Größere Änderung oder Push-/Deploy-Auftrag: `npm run qa:full`.
- Vollständige Regeln stehen in `QA_WORKFLOW.md`.

## Release Candidate und parallele Entwicklung

- Führendes Vorgehen: [`../betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md`](../betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md).
- `main` und die GitHub-Pages-Demo dürfen nach der RC-Bildung weiterlaufen. Der gematik-PoC bleibt auf einem unveränderlichen RC-Tag, exaktem Commit sowie nachgewiesenen API- und Frontend-Digests.
- Der freigegebene PoC-Datenstand wird separat aus der geschützten Anwendung übernommen. Während des Piloten ist die gematik-Kopie der gemeinsame bearbeitbare Bestand; eine automatische Synchronisation mit `mitmachen.timo-frank.de`, lokalen Varianten oder GitHub Pages existiert nicht.
- Der RC wird in einem sauberen, separaten Checkout geprüft. Lokale uncommittete Dateien oder ein ZIP des Arbeitsordners sind kein Releaseartefakt.
- Die private Hospitationsvariante wird mit `npm run start:local-hospitation` aus
  der aktuellen App-Shell in einen vollständig ignorierten lokalen Einstieg
  erzeugt. Gemeinsame App-/Auth-Quellen und Pages-/Target-Artefakte enthalten
  keinen lokalen Bypass und keine privaten Pfade.
- Änderungen am Sektormodell werden atomar mit Registry, Docker-Buildkontext, Tests und Containerstart behandelt.

## Auth-Testmodus

- Gemeinsamer Playwright-Helper: `tests/helpers/app-test-session.js`.
- Neue Playwright-Tests sollen `gotoAuthenticated(page, path, options)` nutzen.
- Der Helper stubbt Auth-Guard und Demo-Konfiguration und ersetzt lokale Browser-Storage-Workarounds.

## Bekannte Stolperstellen

- `api/care-sector-model.mjs` importiert `frontend/data/sector-registry.js`. Docker-Buildkontext, explizite `COPY`-Regel und Runtime-Vertragstest müssen diese Abhängigkeit gemeinsam enthalten; einzelne Dateien des Sektormodells dürfen nicht selektiv in einen RC übernommen werden.
- Target-Readiness und Jenkins-Referenzpipeline bauen und starten das API-Image als Non-Root-Container und prüfen `/api/healthz`. Der `validate_only`-Pfad der Pre-gematik-Pipeline enthält denselben Pflicht-Smoke für einen manuell ausgelösten RC-Nachweis.
- Der In-App-Browser kann je nach Sitzung LocalStorage-Schreibzugriffe blockieren. Für reproduzierbare lokale QA daher Playwright mit `gotoAuthenticated` bevorzugen.
- `playwright.config.js` nutzt Port `4173` und darf bestehende lokale Server wiederverwenden. Bei merkwürdigen Testergebnissen prüfen, ob ein alter Server noch denselben Port belegt.
- Die größten UI-Dateien sind jetzt `frontend/app/versorgungs-kompass.css` und `frontend/app/versorgungs-kompass.js`. Bei kleinen Änderungen im zuständigen Selektor beziehungsweise Funktionsbereich arbeiten und keine neuen Inline-Blöcke in HTML einführen.
- `frontend/app/versorgungs-kompass.css` enthält noch die frühere Konsolidierungsschicht und späte, ansichtsbezogene Regeln. Diese technische Schuld ist in `../produkt-und-design/UI_TECH_DEBT.md` beschrieben; sie macht die HTML-Datei selbst nicht mehr override-lastig.

## Git-Status-Regel

- Nach Datei- oder Repo-Änderungen im Abschluss immer sagen, ob die Änderungen uncommitted oder ungepusht sind.
- Nicht automatisch committen oder pushen, außer der Nutzer verlangt Push, Deploy, Live-Stellen, Veröffentlichung oder GitHub-Pages-Aktualisierung.
- Bei jedem Push-/Live-/GitHub-Pages-Auftrag `npm run build:pages` lokal prüfen; generierte `dist/`-Artefakte niemals committen.
