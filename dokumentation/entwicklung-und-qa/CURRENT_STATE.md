# Current State

Stand: 2026-08-09.

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
- Der neue Produkt-Release-Vertrag gilt ab `v0.23.0`: Ein vollständiger,
  signierter Quelltag `vX.Y.Z` bezeichnet die gemeinsame Produktversion.
  „Release Candidate“ ist vor `v1.0.0` GitHub-Prerelease-Status und Titel, kein
  Tag-Suffix. Die bisherigen `poc-v…-rc.N`-Tags bleiben ausschließlich
  historische RC-Evidenz.
- Der sichtbare Titel von `v0.23.0` lautet
  `0.23.0-0 Release Candidate`; ein Patch heißt zum Beispiel
  `0.23.1 Release Candidate`. Das zusätzliche `-0` des Wochenrelease-Titels
  gehört weder zur Produktversion noch zum Git-Tag. Das Leitthema bleibt in
  Release Notes und Changelog.
- Die gemeinsame Version verbindet drei getrennte Kanäle: Pages-Demo
  (anonym/synthetisch), privates GKE (`pre-gematik`, IAP/GCP) und
  gematik-Target (`target`, OIDC/Software Factory). Gleiche Version bedeutet
  gleiche Quelle, nicht baugleiche oder gegenseitig promotierbare Artefakte.
- `config/release.json.productVersion` wird fail-closed in die vierteiligen
  Frontend-Build-Manifeste, die CycloneDX-Frontend-SBOM, alle drei
  Helm-Versionsfelder und die OCI-Metadaten der Anwendungsimages projiziert.
  Image-Digests und kanalspezifische Deployment-Manifeste bleiben zusätzliche,
  getrennte Identitäten.
- Das interne `target`-Profil baut mit `TARGET_AUTH_MODE=oidc` providerneutral und ohne GCP Identity Portal oder dessen Abhängigkeiten. Der getrennte `pre-gematik`-Pfad behält für `auth-mode=iap` sein eigenes Portal und die vollständigen GCP-/IAP-Regressionen.
- `npm run check:target-release` verwendet den OIDC-only-Artefaktvertrag und
  ist nach einem Root-`npm ci` ausführbar. `check:poc-rc` bleibt nur als
  historischer Alias. Der vollständige Deployment-Trennungstest benötigt
  zusätzlich `npm ci --prefix frontend/identity-portal`, weil er auch den
  getrennten IAP-Referenzpfad prüft.
- `main` und die GitHub-Pages-Demo dürfen nach der RC-Bildung weiterlaufen.
  Neue gematik-Releases bleiben auf einem unveränderlichen signierten Quelltag,
  exaktem Commit sowie nachgewiesenen API- und Frontend-Digests. Der aktuelle
  Legacy-RC.5 ist nur annotiert und bleibt unverändert unsigniert.
- Die geplante GitLab-Quellübergabe verwendet ein frisch verifiziertes,
  voraussetzungsfreies Git-Bundle mit genau `refs/heads/main` und allen Tags.
  `scripts/package_source_handoff.mjs` erzeugt Bundle, Manifest,
  Schlüsselkopie, `SHA256SUMS` und dessen abgetrennte Signatur
  `SHA256SUMS.asc`; `scripts/verify_source_handoff.mjs` authentisiert zuerst
  das Prüfsummenmanifest und prüft danach externen Vertrauensanker, exaktes
  Ref-Inventar, Prüfsummen, Bundle, `fsck`, Tagobjekt und Commit. Der private
  Signing-Subkey bleibt außerhalb des Pakets. Das operative Runbook ist
  [`../betrieb-und-deployment/GITLAB_SOFTWARE_FACTORY_UEBERGABE.md`](../betrieb-und-deployment/GITLAB_SOFTWARE_FACTORY_UEBERGABE.md).
- Die Übergabe ist noch nicht operativ ausgeführt: Es wurde dadurch kein
  GitLab-Projekt angelegt, kein Remote eingerichtet und nichts übertragen. Bis
  zum Cutover ist GitHub einziger Writer, danach GitLab; eine bidirektionale
  Synchronisation ist ausgeschlossen.
- Der aktuelle Target-Vertrag kennt ausschließlich einen signierten
  `vX.Y.Z`-Tag und einen frischen OIDC-Build. Pages-/GKE-Artefakte,
  persönliche Werte, Secrets, Daten und OIDC-Subjects sind keine zulässigen
  Übergabe- oder Build-Eingaben. RC.2 bis RC.5 und ihre Übergabenotiz bleiben
  historische Evidenz, nicht operativer Fallback.
- Die zentralen Target-Security-Gates werden zweiphasig und read-only aus
  `EXTERNAL_SECURITY_EVIDENCE_ROOT/<BUILD_TAG>` importiert. SonarQube, Snyk,
  Dependency-Track und Cosign-Bereitschaft binden den Build vor dem
  Registry-Push; die spätere Cosign-Attestation bindet zusätzlich den exakten
  Image-Digest. `not-run` ist nur lokale Vorprüfung. Ohne vollständige
  Build-/Digestbindung gibt es kein Target-Deployment.
- Die einfache Release-Automatisierung überspringt unveränderte Wochen und
  öffnet freitags nur einen Draft-PR mit Minor-Version, Leitthema, Changelog,
  Release Notes und Versionsprojektionen. Sie stößt die bestehenden
  Pflichtchecks auf dem exakten Draft-Head an, wartet aber nicht auf sie und
  darf weder mergen, taggen, veröffentlichen noch deployen.
- Review und Merge bleiben die bewusste manuelle Freigabe. Direkt nach dem
  Merge eines gültigen Release-PR startet die aktive Publish-Automatisierung
  für dessen exakten `main`-Commit: vollständige Release-QA, signierter Tag,
  unabhängige Tagprüfung, Pages-Deployment und unveränderliches GitHub
  Prerelease.
- Der Post-Merge-Trigger verlangt beide erfolgreichen Pflichtchecks auf dem
  exakten Release-PR-Head und denselben Dateistand im Merge-Commit; ein
  Admin-Bypass oder abweichender Merge-Inhalt bleibt gesperrt.
- Die Veröffentlichung ist fail-closed an
  `PRODUCT_RELEASE_PUBLISH_ENABLED`, das geschützte `release-signing`-Environment,
  Release-Immutability, das `v*`-Tag-Ruleset und den strikten Branchschutz mit
  den tatsächlichen Pflichtchecks `Minimal repository check` und
  `Target-Readiness` gebunden. Der Freitagsplan selbst erhält keinen Zugriff
  auf Signierschlüssel oder Governance-Token.
- Der manuelle Workflow `Release signing readiness` prüft Schlüssel,
  Passphrase und externe Governance vor der ersten Veröffentlichung ohne
  Checkout, Tag, Release oder Deployment. `Target-Readiness` ist für jeden PR
  gegen `main` präsent und nicht mehr pfadgefiltert.
- `v0.23.0` ist als signierter, annotierter Tag mit Tagobjekt
  `063f31ebe6021a6c2f101199480c19e8bba7b33f` auf dem Zielcommit
  `b007afab5b1e4296bddb919d8f4ac174092ce885` veröffentlicht. Das unveränderliche
  GitHub-Prerelease enthält genau `build-manifest.json`, `SHA256SUMS` und
  `versorgungs-kompass-v0.23.0-pages.zip`; der Pages-Lauf `31336724875` liefert
  dieselbe Produktversion und denselben Commit aus.
- Der erste Publikationslauf `31336153677` schloss Tag, unabhängige
  Signaturprüfung, Pages und die unveränderliche Veröffentlichung erfolgreich
  ab, meldete danach aber einen falschen Vergleich im Release-Nachweis: GitHub
  attestiert bei annotierten Tags das Tagobjekt, nicht dessen Zielcommit. Der
  Workflow prüft beide Identitäten nun getrennt und verbindet sie über den
  signierten Tag-Verifier.
- Private GKE- und Target-Deployments werden vom Produkt-Release nicht
  ausgelöst. GKE bleibt ein manuell freigegebener IAP-Referenzkanal. Solange der
  Workflow keinen eigenen Produkt-Tag-Eingang besitzt, darf ein Lauf nur dann
  einem Release Candidate zugeordnet werden, wenn sein Workflow-SHA exakt dem
  Zielcommit des signierten Tags entspricht.
- Die Pages-Demo ist an den Produkt-Release-Trigger gebunden; gewöhnliche
  `main`-Pushes deployen keinen beweglichen Zwischenstand mehr. Pages wird erst
  nach unabhängig verifiziertem signiertem Tag aus dessen exaktem Commit
  automatisch gebaut, deployed und geprüft.
- Unabhängig vom Freitagsplan bleibt die erste stabile Version `v1.0.0` eine
  ausdrückliche Folgeentscheidung: Erst ein erfolgreiches, verifiziertes
  Target-Deployment darf deren GitHub-Stable-Release freigeben. Quellübergabe
  oder Prerelease-Build allein reichen nicht aus.
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
