# Projektarbeitsregeln

Diese Regeln gelten für assistierte und manuelle Arbeit im Versorgungs-Kompass.

## Produkt- und UX-Leitplanken

- Der Versorgungs-Kompass ist eine CRM-App, keine Landingpage.
- Vor neuen Features erst prüfen, ob sie zu `dokumentation/produkt-und-design/DESIGN_SYSTEM.md`, `dokumentation/produkt-und-design/UX_PRINCIPLES.md` und `dokumentation/produkt-und-design/VISUAL_QA_CHECKLIST.md` passen.
- Lesemodus kommt vor Formularmodus. Kontakt- und Organisationsdetails werden als CRM-Profile behandelt.
- Admin-, Rollen-, Deployment- und Betriebshinweise bleiben dezent.
- Keine doppelten Titel, keine unnötigen Badges, eine Suche pro Kontext.
- Sidebar ist primäre Navigation; Topbar bleibt auf kontextuelle Hauptaktionen beschränkt.
- Nutzerprofil ist eine eigene Seite in der App-Shell, kein Drawer, Pop-up oder Modal.
- Kontaktimport gehört in den Bereich `Importe`, nicht dauerhaft in die globale Topbar.
- Profil und Einstellungen sind fachlich getrennt.

## Designsystem-Regeln

- Neue UI muss die Tokens und Regeln aus `dokumentation/produkt-und-design/DESIGN_SYSTEM.md` verwenden.
- Keine neuen hart codierten Farben, Gradients, Schatten oder Radien, wenn ein Token existiert.
- Neue Komponentenvarianten nur einführen, wenn sie im Designsystem dokumentiert werden.
- Buttons, Badges, Chips, Cards, Tabellen, Drawer, Modals, Detailpanels, Filter und Formulare gegen `dokumentation/produkt-und-design/COMPONENT_INVENTORY.md` prüfen.
- Keine Card-in-Card-Layouts. Cards sind wiederholbare Inhaltseinheiten oder echte Werkzeuge, keine dekorativen Seitencontainer.

## Arbeitsweise

- Bei UI-Änderungen zuerst bestehende Klassen und Muster suchen, dann erweitern.
- Neue Funktionen zuerst in die Navigationsstruktur einordnen, bevor Topbar- oder Zusatzaktionen entstehen.
- `frontend/app/versorgungs-kompass.html`, `frontend/map/versorgungs-kompass-map.html` und `frontend/login/login.html` sind führende Quellen.
- Wenn Änderungen auf GitHub/GitHub Pages live gehen sollen, immer `npm run build:pages` und die passenden Checks ausführen. Das generierte `dist/pages/`-Artefakt wird vom Workflow gebaut und nicht committed.
- Bestehende uncommitted Änderungen nicht zurücksetzen.
- Keine großen neuen Features während eines Design-System-Konsolidierungssprints.
- Nach sichtbaren UI-Änderungen die `dokumentation/produkt-und-design/VISUAL_QA_CHECKLIST.md` abarbeiten.

## Git-, Commit- und Push-Regeln

- Begriffe strikt trennen:
  - `commit` = lokaler Git-Snapshot.
  - `push` = Git-Commit ist auf GitHub/Remote-Branch.
  - `GitHub Pages veröffentlicht` = der Pages-Actions-Workflow für den erwarteten Commit war erfolgreich und eine betroffene öffentliche URL wurde danach geprüft.
  - `Geschützter Datenstand aktualisiert` = eine freigegebene Migration oder Datenoperation wurde auf den geschützten Backend-Dienst angewendet und dort geprüft.
- Nie schreiben oder implizieren, dass etwas "live", "sichtbar" oder "veröffentlicht" ist, wenn nur ein Git-Push erfolgt ist.
- Nach jeder Aufgabe mit Datei- oder Repo-Änderungen immer sagen, ob Änderungen noch uncommitted oder ungepusht sind.
- Wenn neue Änderungen fertig sind und noch nicht gepusht wurden, den Nutzer aktiv fragen, ob sie sofort committed und gepusht werden sollen.
- Automatisch committen und pushen, wenn der Nutzer ausdrücklich `push`, `commit und push`, `deploy`, `live stellen`, `veröffentlichen` oder `GitHub Pages aktualisieren` verlangt.
- Bei Push-/Deploy-Aufträgen immer alle zum Projekt gehörenden Quell- und Migrationsänderungen einbeziehen, aber keine generierten `dist/`-Artefakte, sofern der Nutzer nicht ausdrücklich einen kleineren Umfang nennt.
- Wenn eine Änderung den geschützten Backend-Datenstand betrifft, reicht das Committen/Pushen einer Migration nicht aus. Dann muss im Abschluss klar stehen:
  - Migration/SQL-Datei: committed/gepusht oder nicht.
  - Geschützter Datenstand: angewendet und geprüft oder nicht angewendet.
  - Falls nicht angewendet: warum nicht und welche konkrete Aktion noch fehlt.
- Bei `dataMode: "api"` ist eine GitHub-Pages-Dateiprüfung keine Sichtbarkeitsprüfung für geschützte App-Daten. Nach Push-/Deploy-Aufträgen muss `npm run verify:publication` laufen; für Backend-betroffene Änderungen erst nach einer autorisierten API-/DB-Stichprobe, für reine Static-/UI-Änderungen mit dokumentiertem Status `not_affected`.
- Nie "sichtbar", "verfügbar", "live" oder "öffentlich geprüft" für geschützte Daten schreiben, wenn nur das statische Pages-Artefakt oder eine GitHub-Pages-URL geprüft wurde. Pages belegt ausschließlich die synthetische Demo; die Realanwendung benötigt eine getrennte Target-, API- und Identity-Abnahme.
- Bei `deploy`, `live stellen` oder `veröffentlichen` gehört die betroffene Backend-Migration zur Aufgabe, wenn die Änderung ohne sie in der geschützten Anwendung nicht funktionieren würde. Wenn die Anwendung nicht sicher oder nicht möglich ist, vor dem Abschluss aktiv stoppen und den fehlenden Schritt benennen.
- Bei einem reinen `push` muss trotzdem ausdrücklich gesagt werden, ob dieser Push die sichtbare App bereits aktualisiert oder ob zusätzlich GitHub-Pages-Build, Cache, Backend-Migration oder ein anderer Deployment-Schritt fehlt.
- Nach jedem Push-/Deploy-Auftrag im Abschluss eine kurze Statusmatrix ausgeben:
  - Git commit: ja/nein, Commit-SHA.
  - Git push: ja/nein, Branch.
  - GitHub Pages: Actions-Workflow erfolgreich ja/nein; öffentliche URL geprüft ja/nein.
  - Geschütztes Backend: Migration/Datenoperation angewendet ja/nein/nicht betroffen.
  - Sichtbarkeit: jetzt erwartbar, noch ausstehend oder nicht verifiziert.
- Nicht automatisch pushen bei explorativen Analysen, Reviews, lokalen Experimenten, fehlgeschlagenen Checks, unklarer fachlicher Freigabe oder wenn der Nutzer nur eine Planung/Recherche ohne Umsetzung angefragt hat.
- Vor einem Push die relevanten Checks ausführen; wenn Checks nicht laufen oder fehlschlagen, den Nutzer informieren und nur nach ausdrücklicher Bestätigung trotzdem pushen.
- Bestehende uncommitted Änderungen anderer Bearbeiter nicht verwerfen; bei einem ausdrücklichen "alle Änderungen pushen" werden sie mitgenommen.

## Priorisierte technische UI-Schulden

- Vor selektiven UI-Verbesserungen zuerst `dokumentation/produkt-und-design/UI_TECH_DEBT.md` lesen.
- P0-Schulden haben Vorrang vor neuen kosmetischen Einzelkorrekturen.
- Die produktiven HTML-Einstiegspunkte bleiben frei von Inline-Stylesheets, Inline-Skripten und Inline-Event-Handlern.
- Die ehemalige CSS-Konsolidierungsschicht liegt in `frontend/app/versorgungs-kompass.css` und ist Übergang, nicht Zielarchitektur. Neue UI-Regeln gehören in das zuständige externe Stylesheet und sollen bestehende Varianten reduzieren.

## Review-Fragen für neue UI

- Nutzt die Änderung bestehende Tokens?
- Entfernt oder reduziert sie Varianten statt neue einzuführen?
- Verbessert sie CRM-Lesbarkeit und wiederholte Arbeit?
- Bleibt der Kontext frei von doppelter Suche, doppelten Titeln und unnötigen Badges?
- Ist Mobile ohne Überlappung und horizontales Layoutbrechen nutzbar?
