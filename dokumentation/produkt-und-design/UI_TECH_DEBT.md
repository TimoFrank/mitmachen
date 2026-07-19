# Priorisierte UI-Schulden

Stand: 2026-05-16. Diese Liste beschreibt bestehende Designsystem-Verstoesse und technische Schulden. Sie ist bewusst keine Featureliste.

## P0: Designsystem aus Override-Schicht in echte Primitive ueberfuehren

- Befund: `frontend/app/versorgungs-kompass.html` enthaelt zuerst viele lokale Komponentenstile und ab ca. Zeile 8244 eine `Design system consolidation layer`, die per spaetem CSS normalisiert.
- Risiko: Neue Aenderungen kopieren weiterhin alte Stile, weil die "richtigen" Regeln nicht als primitive Klassen/Dateien sichtbar sind.
- Naechster Schritt: Token- und Primitive-CSS auslagern, alte Varianten abbauen und beide `dist/`-Profile danach neu bauen und pruefen.

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

- Befund: `frontend/map/versorgungs-kompass-map.html` hat eigene Tokens und am Ende eigene Normalisierung mit `!important`.
- Verstoss: Karte ist visuell nah dran, aber technisch eigenstaendig und override-lastig.
- Naechster Schritt: Gemeinsame Tokens nutzen, Kartencontrols als normale Buttons/Chips abbilden, `!important` reduzieren.

## P2: Login visuell an CRM-System andocken

- Befund: `frontend/login/login.html` nutzt eigene Tokens (`--page`, `--blue`, `--orange`, `--deep`), grosse Card-Radien und starken Schatten.
- Verstoss: Login wirkt markiger als die operative App.
- Naechster Schritt: Login darf etwas ruhiger/markenhaft bleiben, muss aber Tokens, Radius und Buttonregeln teilen.

## P3: CSS-Dateistruktur schaffen

- Befund: Sehr grosse Inline-CSS-Bloecke in HTML-Dateien erschweren Review und Wiederverwendung.
- Risiko: Jede UI-Aenderung wird lokal und schwer vergleichbar.
- Naechster Schritt: `styles/tokens.css`, `styles/components.css`, `styles/layout.css`, `styles/views.css` oder aehnliche Struktur einfuehren.

## P3: Playwright-Screenshot-Tests ausbauen

- Befund: Ein erstes Playwright-Smoke-Setup existiert fuer Kontakte, Kontaktprofil, Karte und Auswertung. Es erzeugt Screenshot-Artefakte und prueft Desktop/Mobile-Rendering.
- Naechster Schritt: Nach der CSS-Konsolidierung entscheiden, welche Screenshots als stabile Baselines versioniert werden und welche nur als Review-Artefakte dienen.
