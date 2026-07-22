# Component Inventory

Stand: 2026-07-21. Analysebasis sind die aktuellen HTML-Einstiegspunkte mit ihren externen CSS-/JS-Assets unter `frontend/app/`, `frontend/map/`, `frontend/login/` und `frontend/pages/mitmachen/`. Generierte `dist/`-Artefakte dürfen nicht als führende Quelle für neue UI-Entscheidungen dienen.

## Buttons

- Primäre App-Aktionen: `.action-button`, `.action-button--primary`, `.action-button--ghost`, `.action-button--danger`, später zusätzlich `.action-button--compact` und `.action-button--danger-soft`.
- Icon-/Menü-Buttons: `.menu-button`, `.icon-button`, `.table-row-menu`, `.detail-close`, `.import-close`, `.dashboard-close`, `.map-mode-close`, `.filter-panel-close`.
- Kontextbuttons: `.filter-panel-button`, `.filter-reset`, `.filter-panel-apply`, `.dashboard-control`, `.analytics-quality-link__button`, `.care-queue-open`, `.import-row-action`.
- Kartenbuttons: `.map-toggle`, `.map-toggle-active-home`, `.map-toggle-active-filter`, `.map-toggle-active-heat`, `.map-toggle-active-neutral`.
- Befund: Es gibt mehrere aktive Buttonsprachen. Die späte Konsolidierungsschicht normalisiert vieles, aber vorher existieren Gradient-Buttons, Pill-Buttons, Icon-Buttons, Textlinks und lokale Varianten mit eigenen Radien/Schatten.

## Badges

- Generisch: `.badge`, `.badge--high`, `.badge--medium`, `.badge--low`, `.badge--active`, `.badge--pending`, `.badge--quiet`, `.badge--new`, `.badge--status`.
- Rollen/Admin: `.account-role-pill`, `.account-role-pill--admin`, `.account-role-pill--editor`, `.account-role-pill--viewer`, `.permission-banner`.
- Import/Status: `.status-pill`, `.status-pill--ready`, `.status-pill--duplicate`, `.status-pill--review`, `.status-pill--error`, `.file-badge`.
- Kontakt-/Tabellenindikatoren: `.contact-owner-chip`, `.contact-sector-pill`, `.contact-priority-pill`, `.owner-badge`, `.role-badge`.
- Benachrichtigungszähler: `.notification-count-indicator` ist eine eigene Count-Primitive für ungelesene persönliche Benachrichtigungen in der Sidebar. Sie ist kein Status-Badge und darf nicht für Kategorien, Rollen oder Filter verwendet werden.
- Befund: Badges werden für Status, Rollen, Dateitypen, Sektoren, Prioritäten und dekorative Hinweise genutzt. Das erzeugt visuelles Rauschen. Badges dürfen künftig nur echte Status-/Kategoriewerte tragen.

## Chips

- Filterchips: `.active-filter-chip`, `.active-filter-more`, `.filter-option-chip`, `.mini-chip`, `.priority-chip`, `.category-chip`.
- Themenchips: `.theme-tag`, `.theme-tag--editable`, `.theme-tag--preset`, `.editor-chip`.
- Kartenchips: `.map-active-filter-chip`, `.sector-pill`.
- Befund: Chips sind semantisch vermischt: Filterauswahl, Tags, Legenden und Mini-Filters sehen ähnlich aus, verhalten sich aber unterschiedlich. Künftig wird zwischen Filter-Chip, Tag-Chip und Status-Badge getrennt.

## Cards

- Hauptcontainer: `.view-card`, `.summary-card`, `.dashboard-card`, `.profile-section`, `.account-profile-card`.
- Detailcontainer: `.detail-info-card`, `.detail-fact-card`, `.detail-card`, `.history-card`.
- Import/Workflow: `.import-format-card`, `.import-info-box`, `.import-file-card`, `.import-metric`, `.import-profile-card`, `.import-action-card`, `.import-defaults`, `.import-bulk-card`.
- Operative Karten: `.care-queue-card`, `.quality-row`, `.mobile-contact-card`.
- Befund: Viele Cards verwenden große Radien, Schatten und Gradients. Für CRM-UI sollen Cards flach, kompakt und als wiederholbare Informationscontainer eingesetzt werden, nicht als dekorative Seitenstruktur.

## Tabellen

- Kontaktliste: `.contacts-table`, `.thead`, `.row`, dynamisches Grid via `--contacts-grid-template`.
- Organisationen: `.organizations-table`, ähnlicher Tabellenaufbau.
- Import: `.import-preview-table`, `.import-review-table`, `.import-map-table`, `.import-entry-table`.
- Care Workbench: `.care-workbench-table`.
- Befund: Kontakt-/Organisationstabellen sind div-basierte Grids, Import/Care echte Tabellen. Beide Muster sind legitim, brauchen aber gleiche Headerhöhe, Zellpadding, Hover, Active-State, Checkbox- und Aktionsspalte.

## Drawer

- Lesedrawer: `.detail-drawer`, `.detail-panel`, `.detail-overlay`.
- Editor: `.editor-drawer`, `.editor-panel`, `.editor-overlay`, plus Organisationeneditor mit gleicher Klasse.
- Import: `.import-drawer`, `.import-panel`, `.import-overlay`.
- Dashboard/Karte als Vollflächenlayer: `.dashboard-drawer`, `.map-mode-drawer`.
- Befund: Drawer variieren stark in Breite, Overlay, Radius und Schatten. Künftig gibt es nur drei Drawer-Typen: Detail-Sidepanel, Editor-Sidepanel, Fullscreen-Workspace. Das Nutzerprofil ist kein Drawer.

## Modals

- Profilseite: `.profile-page`, `.profile-panel`, `.profile-section`.
- Profilfoto: `.profile-photo-modal`, `.profile-photo-panel`.
- Vollflächen-Workspaces sind technisch Drawer, UX-seitig aber modal: Import, Dashboard, Kartenmodus.
- Befund: Modals nutzen andere Radien und Schatten als Drawer. Künftig sind Modals selten und für Entscheidungen reserviert; Profilverwaltung bleibt als eigene App-Seite in der Shell.

## App-Shell und Navigation

- Sidebar-Hauptarbeit: Kontakte, Organisationen, Karte, Auswertung.
- Sidebar-Administration/Pflege: Datenqualität, Importe.
- Sidebar-Persönlich/System: Einstellungen; `Mein Profil` wird über den Nutzerbereich unten geöffnet.
- Topbar: ruhig halten. Kontextuelle Hauptaktionen wie `Neuer Kontakt`, `Organisation anlegen` und bei Bedarf Archiv liegen in den jeweiligen Workspace-/Tabellen-Command-Rows. Kein dauerhafter Kontaktimport in der Topbar.
- Import-Startseite: `.imports-workspace`, `.import-start-grid`, bestehende `.import-format-card` und `.import-profile-card`.

## Detailpanels

- App-Kontaktprofil: dynamisches Markup in `openDetail()`, Klassen `.detail-profile`, `.detail-tabs`, `.section-block`, `.detail-line-list`, `.detail-info-card`.
- Personenprofilseite: `.person-profile-page`, `.person-profile-shell`, `.person-profile-body`; nutzt dieselbe `.detail-profile`-/Zeilenstruktur wie der Detaildrawer, aber als kanonische App-Shell-Seite mit Routen `#person/contact/<id>`, `#person/expert/<id>` und `#person/stakeholder/<id>`.
- Organisationsprofilseite: `.organization-profile-page`, `.organization-profile-shell`, `.organization-profile-body`; nutzt dieselbe `.detail-profile`-/Zeilenstruktur wie der Detaildrawer, aber als kanonische App-Shell-Seite mit Routen `#organization/care/<id>`, `#organization/expert/<id>` und `#organization/stakeholder/<id>`.
- Kartenprofil: `.map-detail-panel`, `.map-detail-toolbar`, `.map-detail-line-list`.
- Sprint F: Kontaktprofile nutzen einen kompakten Profilkopf, Zeilenlisten für Stammdaten/Kontaktwege/Quelle und einen eigenen Abschnitt `Bild & Quelle`. Themen und Notizen sind im Lesemodus keine Inputs mehr; Bearbeitung läuft über explizite Profilbearbeitung mit Speichern/Abbrechen.
- Befund: Altfragmente wie `.detail-hero`, `.detail-grid`, `.detail-card` können noch im CSS vorhanden sein, dürfen aber nicht als neues Kontaktprofil-Muster verwendet werden. Lesemodus ist prioritär, Formulare sind sekundar.

## Filter

- Globale Suche: `.search-shell`, `#search-input`.
- Ansichts-Dropdown: `.view-select-shell`, `.view-select-button`, `.view-select-menu`, `.view-select-option` für gespeicherte und Standardansichten außerhalb des Filterpanels.
- Filterpanel: `.filter-panel`, `.filter-group`, `.filter-field`, `.filter-select`, `.filter-more`, `.filter-panel-footer`.
- Schnellfilter: Sektor, Bundesland, Fachrichtung, Owner. Organisationen können Fachrichtung/Owner durch Organisationstyp oder Kontaktbezug ersetzen, sobald stabile Datenlogik vorhanden ist.
- Weitere Filter: Priorität, Themen, Datenqualität, Quelle, Aktualität, fehlende Angaben, Archivstatus. Standardzustand geschlossen.
- Aktive Filterchips: `.active-filter-chip`, `.active-filter-more`; einheitliches Muster `Label: Wert`, mit X zum Entfernen.
- Header-/Spaltenfilter: `.header-filter`, `.filter-icon-button`, `.filter-menu`, `.filter-option`, `.filter-selected`.
- Kartenfilter: `.category-chip`, `.map-dropdown`, `.map-active-filter-chip`.
- Befund: Alte Chip-Wände, Filterpanel-Suche und gespeicherte Suchen im Filterpanel sind abgelöst. Künftig gilt: eine Suche pro Kontext; Zusatzfilter sind Facetten, gespeicherte Ansichten sind separat.

## Formulare

- Kontakteditor: `.editor-form`, `.contact-quick-form`, `.editor-section`, `.editor-accordion`, `.editor-field`, `.editor-input`, `.editor-textarea`, `.custom-select-trigger`.
- Detail-Inline-Edit: `.detail-edit-input`, `.detail-edit-select`, `.detail-note-input`, `.detail-theme-input`.
- Profilform: `.profile-field`, `.profile-switch`.
- Import-Formulare: `.import-entry-table input/select`, `.bulk-entry-table`, `.bulk-table-command-row`, `.import-defaults`, `.import-profile-card`.
- Befund: Formularmodus ist umfangreich und visuell schwer. Künftig zuerst lesbare CRM-Profile, dann expliziter Edit-Modus mit klaren Sektionen und einheitlichem Fokus-/Validierungsverhalten.

## Avatare und Kontaktbilder

- Avatarbasis: `.avatar`.
- Größen: `.avatar-sm` für Tabellen/Owner, `.avatar-md` für kompakte Profilkontexte, `.avatar-lg` für Detailprofil.
- Fallback: `.avatar-fallback` mit Initialen aus Kontakt- oder Profilname.
- Kontaktbild: `.contact-image` mit `object-fit: cover` und `object-position: center`.
- Bildquellenfelder werden nicht als Badges angezeigt, sondern als ruhige Zeilen im Abschnitt `Bild & Quelle`.

## Kontaktanlage Sprint E

- Einzelkontakt: rechter `.editor-drawer` mit Schnellerfassung und optionalen `.editor-accordion`-Bereichen.
- Bulk-Anlage: `Importe` -> `Bulk-Anlage per Online-Tabelle`; feste Spalten für Name, Organisation, Sektor, Fachrichtung, Ort, Bundesland, Owner, E-Mail, Telefon, Themen und Notiz.
- Dateiimport: eigener Dateiimport-Wizard mit Upload, Mapping und Review. Die Online-Tabelle darf nicht als CSV-Mapping-Schritt missbraucht werden.
- Validierung: `.bulk-cell--error`, `.bulk-cell--warning`, `.bulk-row--error`, `.bulk-row--review`, `.bulk-row--duplicate` für dezente Zell- und Zeilenhinweise.

## Aktuelle Konsolidierungsanker

- Asset-Grenze: Markup liegt in den HTML-Einstiegspunkten, Darstellung und Verhalten in den jeweils zugeordneten CSS-/JS-Dateien. Neue Inline-Stylesheets, Inline-Skripte und Inline-Event-Handler sind nicht zulässig.
- Tokens in `:root`: Farben, Radius, Shadow, Spacing und Typografie liegen in `frontend/app/versorgungs-kompass.css` und `frontend/map/versorgungs-kompass-map.css`.
- Verbleibende Konsolidierungsschuld: Die ehemalige `Design system consolidation layer` liegt jetzt in `frontend/app/versorgungs-kompass.css`; die Karten-CSS besitzt weiterhin späte Normalisierungen und `!important`-Regeln.
- Zielzustand: Externe CSS-/JS-Assets schrittweise nach Tokens, Primitives, Komponenten und fachlichen Views modularisieren. Bestehende späte Regeln dabei abbauen, nicht durch neue Override-Schichten ergänzen.
