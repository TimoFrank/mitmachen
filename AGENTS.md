# AGENTS.md

Diese Regeln gelten fuer Codex- und Agentenarbeit im Versorgungs-Kompass.

## Produkt- und UX-Leitplanken

- Der Versorgungs-Kompass ist eine CRM-App, keine Landingpage.
- Vor neuen Features erst pruefen, ob sie zu `DESIGN_SYSTEM.md`, `UX_PRINCIPLES.md` und `VISUAL_QA_CHECKLIST.md` passen.
- Lesemodus kommt vor Formularmodus. Kontakt- und Organisationsdetails werden als CRM-Profile behandelt.
- Admin-, Rollen-, Deployment- und Betriebshinweise bleiben dezent.
- Keine doppelten Titel, keine unnoetigen Badges, eine Suche pro Kontext.
- Sidebar ist primaere Navigation; Topbar bleibt auf kontextuelle Hauptaktionen beschraenkt.
- Nutzerprofil ist eine eigene Seite in der App-Shell, kein Drawer, Pop-up oder Modal.
- Kontaktimport gehoert in den Bereich `Importe`, nicht dauerhaft in die globale Topbar.
- Profil und Einstellungen sind fachlich getrennt.

## Designsystem-Regeln

- Neue UI muss die Tokens und Regeln aus `DESIGN_SYSTEM.md` verwenden.
- Keine neuen hart codierten Farben, Gradients, Schatten oder Radien, wenn ein Token existiert.
- Neue Komponentenvarianten nur einfuehren, wenn sie im Designsystem dokumentiert werden.
- Buttons, Badges, Chips, Cards, Tabellen, Drawer, Modals, Detailpanels, Filter und Formulare gegen `COMPONENT_INVENTORY.md` pruefen.
- Keine Card-in-Card-Layouts. Cards sind wiederholbare Inhaltseinheiten oder echte Werkzeuge, keine dekorativen Seitencontainer.

## Arbeitsweise

- Bei UI-Aenderungen zuerst bestehende Klassen und Muster suchen, dann erweitern.
- Neue Funktionen zuerst in die Navigationsstruktur einordnen, bevor Topbar- oder Zusatzaktionen entstehen.
- `app/versorgungs-kompass.html`, `map/versorgungs-kompass-map.html` und `login/login.html` sind fuehrende Quellen.
- Wenn Aenderungen auf GitHub/GitHub Pages live gehen sollen, immer `bash scripts/sync_github_pages.sh` ausfuehren und die aktualisierten `docs/`-Artefakte mitcommitten; der Nutzer muss das nicht extra anfordern.
- Bestehende uncommitted Aenderungen nicht zuruecksetzen.
- Keine grossen neuen Features waehrend eines Design-System-Konsolidierungssprints.
- Nach sichtbaren UI-Aenderungen die `VISUAL_QA_CHECKLIST.md` abarbeiten.

## Priorisierte technische UI-Schulden

- Vor selektiven UI-Verbesserungen zuerst `UI_TECH_DEBT.md` lesen.
- P0-Schulden haben Vorrang vor neuen kosmetischen Einzelkorrekturen.
- Die bestehende CSS-Override-Schicht ist Uebergang, nicht Zielarchitektur.

## Review-Fragen fuer neue UI

- Nutzt die Aenderung bestehende Tokens?
- Entfernt oder reduziert sie Varianten statt neue einzufuehren?
- Verbessert sie CRM-Lesbarkeit und wiederholte Arbeit?
- Bleibt der Kontext frei von doppelter Suche, doppelten Titeln und unnoetigen Badges?
- Ist Mobile ohne Ueberlappung und horizontales Layoutbrechen nutzbar?
