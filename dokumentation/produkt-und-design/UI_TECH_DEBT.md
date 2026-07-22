# Priorisierte UI-Schulden

Stand: 2026-07-21. Diese Liste beschreibt bestehende Designsystem-Verstöße und technische Schulden. Sie ist bewusst keine Featureliste.

## Erledigter Strukturumbau

- [x] Stylesheets und Anwendungscode wurden aus den produktiven HTML-Einstiegspunkten extrahiert.
- [x] Die Hauptanwendung verwendet `frontend/app/versorgungs-kompass.css` und `frontend/app/versorgungs-kompass.js`; Karte, Login, Hospitation und #Mitmachen-Seiten besitzen eigene Assets.
- [x] `scripts/test_security_contracts.mjs` verhindert neue Inline-Stylesheets, Inline-Skripte und Inline-Event-Handler.
- [x] `dist/pages/` und `dist/target/` werden aus den führenden Quellen gebaut; generierte Artefakte sind keine Bearbeitungsquelle.

## P0: Externe App-CSS in wartbare Module zerlegen

- Befund: Die Extraktion aus HTML ist abgeschlossen. `frontend/app/versorgungs-kompass.css` bündelt jedoch weiterhin Tokens, historische Komponentenregeln, die ehemalige `Design system consolidation layer` sowie späte View- und Mobile-Regeln in einer Datei.
- Risiko: Die Kaskade bleibt trotz sauberer HTML-/CSS-Trennung schwer vorhersehbar; neue Regeln können bestehende Varianten nur durch weitere späte Spezifität korrigieren.
- Nächster Schritt: Zuerst Tokens und Primitive, danach Shell, wiederverwendbare Komponenten und ansichtsbezogene Regeln in expliziter Ladereihenfolge trennen. Doppelte Altregeln beim Verschieben entfernen und beide Buildprofile sowie visuelle Tests nach jedem Schritt prüfen.

## P0: Externe App-JavaScript-Datei fachlich modularisieren

- Befund: Das Anwendungsverhalten liegt nicht mehr inline, aber noch weitgehend gesammelt in `frontend/app/versorgungs-kompass.js`. Datenzugriff, Routing, Rendering und Interaktionen teilen sich dadurch einen großen globalen Änderungsraum.
- Risiko: Kleine UI-Änderungen können unbeabsichtigt fachlich entfernte Flows beeinflussen; isolierte Tests und klare Abhängigkeiten bleiben schwierig.
- Nächster Schritt: Stabile Fachgrenzen wie Shell/Routing, Kontakte, Organisationen, Formate, Hospitationen und Team schrittweise in Module überführen. `frontend/data/` bleibt die Grenze für Datenadapter und fachliche Modelle.

## P0: Button-System bereinigen

- Befund: `.action-button`, `.filter-panel-button`, `.dashboard-control`, `.map-toggle`, `.import-row-action`, `.detail-link` und lokale Close-Buttons definieren eigene Höhen, Radien, Schatten und Farben.
- Verstoß: Mehrere Buttonsprachen, teils Gradients und große Hover-Schatten.
- Nächster Schritt: Button-Primitive `button`, `button--primary`, `button--secondary`, `button--ghost`, `button--danger`, `icon-button` festlegen und lokale Varianten ersetzen.

## P0: Badge/Chip-Semantik trennen

- Befund: `.badge`, `.status-pill`, `.account-role-pill`, `.contact-sector-pill`, `.theme-tag`, `.filter-option-chip`, `.mini-chip`, `.map-active-filter-chip` konkurrieren visuell.
- Verstoß: Badges werden für Status, Kategorie, Rollen, Filter, Tags und Dekoration gemischt.
- Nächster Schritt: `badge` nur Status/Kategorie, `chip` nur interaktive Auswahl/Tag, `pill` nur kompakte Metadaten. Unnötige Badges entfernen.

## P1: Detaildrawer als CRM-Profil konsolidieren

- Befund: Kontaktdetail enthält neue CRM-Profilstruktur, aber CSS-Altlasten wie `.detail-hero`, `.detail-card`, `.detail-grid`, `.detail-fact-card`.
- Verstoß: Mehrere Profilsprachen im gleichen Drawer.
- Nächster Schritt: Nur Lesemodus-Profil, Sektionen und Detailzeilen behalten; alte Hero-/Card-Varianten entfernen.

## P1: Filterarchitektur vereinheitlichen

- Befund: Globale Suche, Filterpanel-Suche, Headerfilter, Mini-Chips und Kartenfilter haben eigene UI-Regeln.
- Verstoß: Mehrere Such-/Filtermuster pro Kontext können wie doppelte Suche wirken.
- Nächster Schritt: Suche je Kontext dokumentieren, Filterpanel als Facettenquelle priorisieren, Spaltenfilter auf Spezialfälle begrenzen.

## P1: Drawer/Modal-System standardisieren

- Befund: Detail, Editor, Import, Profil, Dashboard und Kartenmodus nutzen unterschiedliche Overlay-, Radius-, Schatten- und Breitenregeln.
- Verstoß: Modale Flächen fühlen sich wie individuell gebaute Features an.
- Nächster Schritt: Drei Layer-Typen definieren und alte Einzelwerte ersetzen: Detail-Sidepanel, Editor-Sidepanel, Fullscreen-Workspace.

## P1: Dashboard-Cards entdramatisieren

- Befund: Dashboard nutzt viele Card-Varianten, Icons, Pills und Chart-Container.
- Verstoß: Gefahr einer dekorativen Analytics-Fläche statt operativer Auswertung.
- Nächster Schritt: Cards flacher machen, gleiche Headerstruktur, gleiche Chart-Abstände, weniger Zusatzbadges.

## P2: Tabellenmuster harmonisieren

- Befund: Kontakt/Organisation sind div-Grids, Import/Care echte Tabellen. Header, Zellpadding und Aktionsmuster unterscheiden sich.
- Verstoß: Tabellen fühlen sich je View anders an.
- Nächster Schritt: Gemeinsame Tabellenregeln für Header, Row, Cell, Checkbox, Actions, Empty-State und Pagination.

## P2: Karten-UI an App-System binden

- Befund: Die Karte besitzt mit `frontend/map/versorgungs-kompass-map.css` und `frontend/map/versorgungs-kompass-map.js` eigene Assets. Das Karten-CSS führt weiterhin eigene Tokens, späte responsive Regeln und zahlreiche `!important`-Deklarationen.
- Verstoß: Karte ist visuell nah dran, aber technisch eigenständig und override-lastig.
- Nächster Schritt: Gemeinsame Tokens nutzen, Kartencontrols als normale Buttons/Chips abbilden, `!important` reduzieren.

## P2: Login visuell an CRM-System andocken

- Befund: `frontend/login/login.css` nutzt eigene Tokens (`--page`, `--blue`, `--orange`, `--deep`), große Card-Radien und starken Schatten.
- Verstoß: Login wirkt markiger als die operative App.
- Nächster Schritt: Login darf etwas ruhiger/markenhaft bleiben, muss aber Tokens, Radius und Buttonregeln teilen.

## P3: Markup und dynamisches Rendering weiter entkoppeln

- Befund: `frontend/app/versorgungs-kompass.html` ist auf strukturelles Markup reduziert, enthält aber weiterhin viele Ansichten und Dialog-Shells. Zusätzliches dynamisches Markup entsteht in `frontend/app/versorgungs-kompass.js`.
- Risiko: Statische und dynamische Varianten derselben Komponente können auseinanderlaufen.
- Nächster Schritt: Wiederkehrende Markup-Strukturen über kleine Renderer oder Templates vereinheitlichen, ohne HTML erneut mit Styles oder Verhalten zu vermischen.

## P3: Playwright-Screenshot-Tests ausbauen

- Befund: Die Playwright-Suite deckt die zentralen Ansichten und mehrere Feature-Flows auf Desktop und Mobile ab; Screenshot-Artefakte dienen der visuellen Review.
- Nächster Schritt: Bei der CSS-Modularisierung gezielte stabile Baselines für App-Shell, Kontaktprofil, Karte und Hospitationsansichten festlegen. Andere Screenshots bleiben bewusst Review-Artefakte.
