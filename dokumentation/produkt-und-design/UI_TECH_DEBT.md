# Priorisierte UI-Schulden

Stand: 2026-07-21. Diese Liste beschreibt bestehende Designsystem-Verstoesse und technische Schulden. Sie ist bewusst keine Featureliste.

## Erledigter Strukturumbau

- [x] Stylesheets und Anwendungscode wurden aus den produktiven HTML-Einstiegspunkten extrahiert.
- [x] Die Hauptanwendung verwendet `frontend/app/versorgungs-kompass.css` und `frontend/app/versorgungs-kompass.js`; Karte, Login, Hospitation und #Mitmachen-Seiten besitzen eigene Assets.
- [x] `scripts/test_security_contracts.mjs` verhindert neue Inline-Stylesheets, Inline-Skripte und Inline-Event-Handler.
- [x] `dist/pages/` und `dist/target/` werden aus den fuehrenden Quellen gebaut; generierte Artefakte sind keine Bearbeitungsquelle.

## P0: Externe App-CSS in wartbare Module zerlegen

- Befund: Die Extraktion aus HTML ist abgeschlossen. `frontend/app/versorgungs-kompass.css` buendelt jedoch weiterhin Tokens, historische Komponentenregeln, die ehemalige `Design system consolidation layer` sowie spaete View- und Mobile-Regeln in einer Datei.
- Risiko: Die Kaskade bleibt trotz sauberer HTML-/CSS-Trennung schwer vorhersehbar; neue Regeln koennen bestehende Varianten nur durch weitere spaete Spezifitaet korrigieren.
- Naechster Schritt: Zuerst Tokens und Primitive, danach Shell, wiederverwendbare Komponenten und ansichtsbezogene Regeln in expliziter Ladereihenfolge trennen. Doppelte Altregeln beim Verschieben entfernen und beide Buildprofile sowie visuelle Tests nach jedem Schritt pruefen.

## P0: Externe App-JavaScript-Datei fachlich modularisieren

- Befund: Das Anwendungsverhalten liegt nicht mehr inline, aber noch weitgehend gesammelt in `frontend/app/versorgungs-kompass.js`. Datenzugriff, Routing, Rendering und Interaktionen teilen sich dadurch einen grossen globalen Aenderungsraum.
- Risiko: Kleine UI-Aenderungen koennen unbeabsichtigt fachlich entfernte Flows beeinflussen; isolierte Tests und klare Abhaengigkeiten bleiben schwierig.
- Naechster Schritt: Stabile Fachgrenzen wie Shell/Routing, Kontakte, Organisationen, Formate, Hospitationen und Team schrittweise in Module ueberfuehren. `frontend/data/` bleibt die Grenze fuer Datenadapter und fachliche Modelle.

## P0: Button-System bereinigen

- Befund: `.action-button`, `.filter-panel-button`, `.dashboard-control`, `.map-toggle`, `.import-row-action`, `.detail-link` und lokale Close-Buttons definieren eigene Hoehen, Radien, Schatten und Farben.
- Verstoss: Mehrere Buttonsprachen, teils Gradients und grosse Hover-Schatten.
- Naechster Schritt: Button-Primitive `button`, `button--primary`, `button--secondary`, `button--ghost`, `button--danger`, `icon-button` festlegen und lokale Varianten ersetzen.

## P0: Badge/Chip-Semantik trennen

- Befund: `.badge`, `.status-pill`, `.account-role-pill`, `.contact-sector-pill`, `.theme-tag`, `.filter-option-chip`, `.mini-chip`, `.map-active-filter-chip` konkurrieren visuell.
- Verstoss: Badges werden fuer Status, Kategorie, Rollen, Filter, Tags und Dekoration gemischt.
- Naechster Schritt: `badge` nur Status/Kategorie, `chip` nur interaktive Auswahl/Tag, `pill` nur kompakte Metadaten. Unnoetige Badges entfernen.

## P1: Detaildrawer als CRM-Profil konsolidieren

- Befund: Kontaktdetail enthaelt neue CRM-Profilstruktur, aber CSS-Altlasten wie `.detail-hero`, `.detail-card`, `.detail-grid`, `.detail-fact-card`.
- Verstoss: Mehrere Profilsprachen im gleichen Drawer.
- Naechster Schritt: Nur Lesemodus-Profil, Sektionen und Detailzeilen behalten; alte Hero-/Card-Varianten entfernen.

## P1: Filterarchitektur vereinheitlichen

- Befund: Globale Suche, Filterpanel-Suche, Headerfilter, Mini-Chips und Kartenfilter haben eigene UI-Regeln.
- Verstoss: Mehrere Such-/Filtermuster pro Kontext koennen wie doppelte Suche wirken.
- Naechster Schritt: Suche je Kontext dokumentieren, Filterpanel als Facettenquelle priorisieren, Spaltenfilter auf Spezialfaelle begrenzen.

## P1: Drawer/Modal-System standardisieren

- Befund: Detail, Editor, Import, Profil, Dashboard und Kartenmodus nutzen unterschiedliche Overlay-, Radius-, Schatten- und Breitenregeln.
- Verstoss: Modale Flaechen fuehlen sich wie individuell gebaute Features an.
- Naechster Schritt: Drei Layer-Typen definieren und alte Einzelwerte ersetzen: Detail-Sidepanel, Editor-Sidepanel, Fullscreen-Workspace.

## P1: Dashboard-Cards entdramatisieren

- Befund: Dashboard nutzt viele Card-Varianten, Icons, Pills und Chart-Container.
- Verstoss: Gefahr einer dekorativen Analytics-Flaeche statt operativer Auswertung.
- Naechster Schritt: Cards flacher machen, gleiche Headerstruktur, gleiche Chart-Abstaende, weniger Zusatzbadges.

## P2: Tabellenmuster harmonisieren

- Befund: Kontakt/Organisation sind div-Grids, Import/Care echte Tabellen. Header, Zellpadding und Aktionsmuster unterscheiden sich.
- Verstoss: Tabellen fuehlen sich je View anders an.
- Naechster Schritt: Gemeinsame Tabellenregeln fuer Header, Row, Cell, Checkbox, Actions, Empty-State und Pagination.

## P2: Karten-UI an App-System binden

- Befund: Die Karte besitzt mit `frontend/map/versorgungs-kompass-map.css` und `frontend/map/versorgungs-kompass-map.js` eigene Assets. Das Karten-CSS fuehrt weiterhin eigene Tokens, spaete responsive Regeln und zahlreiche `!important`-Deklarationen.
- Verstoss: Karte ist visuell nah dran, aber technisch eigenstaendig und override-lastig.
- Naechster Schritt: Gemeinsame Tokens nutzen, Kartencontrols als normale Buttons/Chips abbilden, `!important` reduzieren.

## P2: Login visuell an CRM-System andocken

- Befund: `frontend/login/login.css` nutzt eigene Tokens (`--page`, `--blue`, `--orange`, `--deep`), grosse Card-Radien und starken Schatten.
- Verstoss: Login wirkt markiger als die operative App.
- Naechster Schritt: Login darf etwas ruhiger/markenhaft bleiben, muss aber Tokens, Radius und Buttonregeln teilen.

## P3: Markup und dynamisches Rendering weiter entkoppeln

- Befund: `frontend/app/versorgungs-kompass.html` ist auf strukturelles Markup reduziert, enthaelt aber weiterhin viele Ansichten und Dialog-Shells. Zusaetzliches dynamisches Markup entsteht in `frontend/app/versorgungs-kompass.js`.
- Risiko: Statische und dynamische Varianten derselben Komponente koennen auseinanderlaufen.
- Naechster Schritt: Wiederkehrende Markup-Strukturen ueber kleine Renderer oder Templates vereinheitlichen, ohne HTML erneut mit Styles oder Verhalten zu vermischen.

## P3: Playwright-Screenshot-Tests ausbauen

- Befund: Die Playwright-Suite deckt die zentralen Ansichten und mehrere Feature-Flows auf Desktop und Mobile ab; Screenshot-Artefakte dienen der visuellen Review.
- Naechster Schritt: Bei der CSS-Modularisierung gezielte stabile Baselines fuer App-Shell, Kontaktprofil, Karte und Hospitationsansichten festlegen. Andere Screenshots bleiben bewusst Review-Artefakte.
