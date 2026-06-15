# AGENTS.md

Diese Regeln gelten fuer Codex- und Agentenarbeit im Versorgungs-Kompass.

## Produkt- und UX-Leitplanken

- Der Versorgungs-Kompass ist eine CRM-App, keine Landingpage.
- Vor neuen Features erst pruefen, ob sie zu `dokumentation/produkt-und-design/DESIGN_SYSTEM.md`, `dokumentation/produkt-und-design/UX_PRINCIPLES.md` und `dokumentation/produkt-und-design/VISUAL_QA_CHECKLIST.md` passen.
- Lesemodus kommt vor Formularmodus. Kontakt- und Organisationsdetails werden als CRM-Profile behandelt.
- Admin-, Rollen-, Deployment- und Betriebshinweise bleiben dezent.
- Keine doppelten Titel, keine unnoetigen Badges, eine Suche pro Kontext.
- Sidebar ist primaere Navigation; Topbar bleibt auf kontextuelle Hauptaktionen beschraenkt.
- Nutzerprofil ist eine eigene Seite in der App-Shell, kein Drawer, Pop-up oder Modal.
- Kontaktimport gehoert in den Bereich `Importe`, nicht dauerhaft in die globale Topbar.
- Profil und Einstellungen sind fachlich getrennt.

## Designsystem-Regeln

- Neue UI muss die Tokens und Regeln aus `dokumentation/produkt-und-design/DESIGN_SYSTEM.md` verwenden.
- Keine neuen hart codierten Farben, Gradients, Schatten oder Radien, wenn ein Token existiert.
- Neue Komponentenvarianten nur einfuehren, wenn sie im Designsystem dokumentiert werden.
- Buttons, Badges, Chips, Cards, Tabellen, Drawer, Modals, Detailpanels, Filter und Formulare gegen `dokumentation/produkt-und-design/COMPONENT_INVENTORY.md` pruefen.
- Keine Card-in-Card-Layouts. Cards sind wiederholbare Inhaltseinheiten oder echte Werkzeuge, keine dekorativen Seitencontainer.

## Arbeitsweise

- Bei UI-Aenderungen zuerst bestehende Klassen und Muster suchen, dann erweitern.
- Neue Funktionen zuerst in die Navigationsstruktur einordnen, bevor Topbar- oder Zusatzaktionen entstehen.
- `app/versorgungs-kompass.html`, `map/versorgungs-kompass-map.html` und `login/login.html` sind fuehrende Quellen.
- Wenn Aenderungen auf GitHub/GitHub Pages live gehen sollen, immer `bash scripts/sync_github_pages.sh` ausfuehren und die aktualisierten `docs/`-Artefakte mitcommitten; der Nutzer muss das nicht extra anfordern.
- Bestehende uncommitted Aenderungen nicht zuruecksetzen.
- Keine grossen neuen Features waehrend eines Design-System-Konsolidierungssprints.
- Nach sichtbaren UI-Aenderungen die `dokumentation/produkt-und-design/VISUAL_QA_CHECKLIST.md` abarbeiten.

## Git-, Commit- und Push-Regeln

- Begriffe strikt trennen:
  - `commit` = lokaler Git-Snapshot.
  - `push` = Git-Commit ist auf GitHub/Remote-Branch.
  - `GitHub Pages veroeffentlicht` = `docs/` wurde synchronisiert, gepusht und eine betroffene oeffentliche GitHub-Pages-URL wurde nach dem Push geprueft.
  - `Live-Daten veroeffentlicht` = der produktive Supabase-Datenstand wurde aktualisiert oder eine Migration wurde auf das verknuepfte Supabase-Projekt angewendet.
- Nie schreiben oder implizieren, dass etwas "live", "sichtbar" oder "veroeffentlicht" ist, wenn nur ein Git-Push erfolgt ist.
- Nach jeder Aufgabe mit Datei- oder Repo-Aenderungen immer sagen, ob Aenderungen noch uncommitted oder ungepusht sind.
- Wenn neue Aenderungen fertig sind und noch nicht gepusht wurden, den Nutzer aktiv fragen, ob sie sofort committed und gepusht werden sollen.
- Automatisch committen und pushen, wenn der Nutzer ausdruecklich `push`, `commit und push`, `deploy`, `live stellen`, `veroeffentlichen` oder `GitHub Pages aktualisieren` verlangt.
- Bei Push-/Deploy-Auftraegen immer alle zum Projekt gehoerenden Aenderungen einbeziehen, inklusive aktualisierter `docs/`-Artefakte und Supabase-Migrationen, sofern der Nutzer nicht ausdruecklich einen kleineren Umfang nennt.
- Wenn eine Aenderung Supabase-Live-Daten betrifft, reicht das Committen/Pushen einer Migration nicht aus. Dann muss im Abschluss klar stehen:
  - Migration/SQL-Datei: committed/gepusht oder nicht.
  - Supabase-Live-Daten: angewendet oder nicht angewendet.
  - Falls nicht angewendet: warum nicht und welche konkrete Aktion noch fehlt.
- Bei `dataMode: "supabase"` ist eine GitHub-Pages-Dateipruefung keine Sichtbarkeitspruefung fuer App-Daten. Nach Push-/Deploy-Auftraegen muss `npm run verify:publication` laufen; fuer Supabase-betroffene Aenderungen erst nach einer SQL-/REST-/MCP-Stichprobe mit `SUPABASE_LIVE_STATUS=verified`, fuer reine Static/UI-Aenderungen mit `SUPABASE_LIVE_STATUS=not_affected`.
- Nie "sichtbar", "verfuegbar", "live" oder "oeffentlich geprueft" fuer Supabase-gestuetzte Daten schreiben, wenn nur `docs/` oder eine GitHub-Pages-URL geprueft wurde. Dann lautet der Status "GitHub Pages aktualisiert, Supabase-Live-Daten nicht verifiziert".
- Bei `deploy`, `live stellen` oder `veroeffentlichen` gehoert die Supabase-Anwendung zur Aufgabe, wenn die Aenderung ohne Live-Datenupdate in der App nicht sichtbar waere. Wenn die Anwendung nicht sicher oder nicht moeglich ist, vor dem Abschluss aktiv stoppen und den fehlenden Schritt benennen.
- Bei einem reinen `push` muss trotzdem ausdruecklich gesagt werden, ob dieser Push die sichtbare App bereits aktualisiert oder ob zusaetzlich GitHub-Pages-Build, Cache, Supabase-Migration oder ein anderer Deployment-Schritt fehlt.
- Nach jedem Push-/Deploy-Auftrag im Abschluss eine kurze Statusmatrix ausgeben:
  - Git commit: ja/nein, Commit-SHA.
  - Git push: ja/nein, Branch.
  - GitHub Pages: `docs/` synchronisiert ja/nein; oeffentliche URL geprueft ja/nein.
  - Supabase/Live-Daten: Migration angewendet ja/nein/nicht betroffen.
  - Sichtbarkeit: jetzt erwartbar, noch ausstehend oder nicht verifiziert.
- Nicht automatisch pushen bei explorativen Analysen, Reviews, lokalen Experimenten, fehlgeschlagenen Checks, unklarer fachlicher Freigabe oder wenn der Nutzer nur eine Planung/Recherche ohne Umsetzung angefragt hat.
- Vor einem Push die relevanten Checks ausfuehren; wenn Checks nicht laufen oder fehlschlagen, den Nutzer informieren und nur nach ausdruecklicher Bestaetigung trotzdem pushen.
- Bestehende uncommitted Aenderungen anderer Bearbeiter nicht verwerfen; bei einem ausdruecklichen "alle Aenderungen pushen" werden sie mitgenommen.

## Priorisierte technische UI-Schulden

- Vor selektiven UI-Verbesserungen zuerst `dokumentation/produkt-und-design/UI_TECH_DEBT.md` lesen.
- P0-Schulden haben Vorrang vor neuen kosmetischen Einzelkorrekturen.
- Die bestehende CSS-Override-Schicht ist Uebergang, nicht Zielarchitektur.

## Review-Fragen fuer neue UI

- Nutzt die Aenderung bestehende Tokens?
- Entfernt oder reduziert sie Varianten statt neue einzufuehren?
- Verbessert sie CRM-Lesbarkeit und wiederholte Arbeit?
- Bleibt der Kontext frei von doppelter Suche, doppelten Titeln und unnoetigen Badges?
- Ist Mobile ohne Ueberlappung und horizontales Layoutbrechen nutzbar?
