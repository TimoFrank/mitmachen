# Design System

Der Versorgungs-Kompass ist eine operative CRM-App. Das Designsystem priorisiert Lesbarkeit, Vergleichbarkeit, schnelle Wiederholungshandlungen und ruhige Datenpflege. Keine Landingpage-Ästhetik, keine dekorativen Kartenstapel, keine punktuellen Sonderstile.

## Farben

### Tokens

- `--primary: #155fe4` für primäre Aktion, aktive Navigation und Links.
- `--primary-hover: #0d4fc4` nur für Hover/Pressed primärer Aktionen.
- `--primary-soft: #eaf1ff` für ausgewählte Filter, ruhige Infoflächen und sekundare Icon-Hintergründe.
- `--background: #f5f7fb` für App-Hintergrund.
- `--surface: #ffffff` für Panels, Tabellen, Cards, Drawers und Popover.
- `--surface-muted: #f8faff` für Headerzeilen, Hover und subtile Bereiche.
- `--border: #dce3f5`, `--border-strong: #b8c7e8`.
- `--text-primary: #17275f`, `--text-secondary: #334155`, `--text-muted: #64748b`.
- Status: `--success: #16a34a`, `--warning: #b7791f`, `--danger: #dc2626`, `--info: #2563eb`.

### Regeln

- Primärblau ist die einzige dominante Aktionsfarbe.
- Gradients sind für CRM-Komponenten nicht erlaubt, außer in bestehenden Markenassets. Primärbuttons sind flach `--primary`.
- Statusfarben werden nur für Status, Datenqualität, Gefahr oder Validierung genutzt.
- Admin-/Betriebshinweise sind neutral oder dezent blau, nie dominant.
- Kartenfarben dürfen fachliche Kategorien abbilden, müssen aber in Legende und Listen gleich bleiben.

## Typografie

- Font: `Inter, "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Basisschrift: `--font-size-md: 0.94rem`.
- Kleine Metadaten: `--font-size-sm: 0.84rem`, `--font-size-xs: 0.74rem`.
- Überschriften in Arbeitsflächen: maximal `--font-size-xl: 1.42rem`.
- Keine Hero-Typografie innerhalb der CRM-App.
- Letter-spacing standardmäßig `0`; nur kleine Uppercase-Labels dürfen `0.03em` bis `0.06em` verwenden.
- Tabellen, Badges und Metriken nutzen tabular-numeric, wenn Zahlen verglichen werden.

## Spacing

- Basisraster: 4px.
- Dichte CRM-Flächen: 8px, 12px, 16px.
- Seitenpadding Desktop: `--page-padding: 22px`; mobil 12-16px.
- Card-Padding: `--card-padding: 16px`.
- Abschnittsabstand: `--section-gap: 16px`.
- Tabellenzeilen: `--row-height: 44px`, kompakt 40px.
- Keine großen Marketing-Leerräume zwischen Arbeitsbereichen.

## Radius

- `--radius-sm: 6px` für kompakte Controls in Toolbars.
- `--radius-md: 8px` Standard für Buttons, Cards, Panels, Inputs.
- `--radius-lg: 12px` für Popover oder größere Eingaben.
- `--radius-xl: 16px` nur für große Modals/Legacy-Übergang.
- `999px` nur für Avatare, echte Pills/Chips und Toggles.
- Neue Cards sollen 8px Radius nutzen.

## Schatten

- `--shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.05)` Standard.
- `--shadow-md: 0 8px 24px rgba(15, 23, 42, 0.08)` nur für Popover/Dropdowns.
- `--shadow-lg: 0 18px 48px rgba(15, 23, 42, 0.12)` nur für modale Layer.
- Keine schwebenden Schatten auf normalen Inhaltskarten.
- Hover darf nicht durch große Schatten dramatisiert werden.

## Komponentenregeln

### Buttons

- Primär: eine Hauptaktion pro Kontext, flach blau, 38-42px hoch.
- Sekundär: weiße Fläche, Border, primäre Textfarbe.
- Gefahr: `--danger-soft` plus `--danger`, nur für destructive actions.
- Icon-Buttons: quadratisch, 38px, mit `aria-label`.
- Keine neuen Gradient-Buttons.

### Tabs und Navigation

- Hauptnavigation bleibt links als Sidebar oder mobile Tabbar.
- Die Sidebar ist die primäre App-Navigation. Neue Funktionen werden zuerst dort fachlich eingeordnet: Hauptarbeit, Administration/Pflege oder Persönlich/System.
- Tabs sind segmentierte Kontextwechsel, nicht dekorative Pills.
- Aktiver Zustand ist eindeutig: `--primary` Hintergrund oder linke aktive Kante, nicht beides plus Schatten.
- Nutzerprofil und Einstellungen sind getrennt: Profil ist persönlich, Einstellungen sind System-/App-Konfiguration.

### Badges und Chips

- Badge = Status/Kategorie, nicht CTA.
- Chip = interaktive Auswahl oder Tag.
- Count-Indicator = ungelesene Anzahl oder technische Menge an einer Navigation/Aktion. Er ist keine Status- oder Kategorieauszeichnung und wird sparsam eingesetzt.
- Filterchips dürfen entfernt werden; Tagchips nicht automatisch.
- Keine Badge-Dopplung, wenn die gleiche Information schon im Tabellenfeld oder Profilheader steht.

### Cards

- Cards sind wiederholbare Einheiten oder klar gerahmte Werkzeuge.
- Keine Cards in Cards.
- Dashboard-Cards sind dicht, scanbar und flach.
- Summary-Cards dürfen nicht visuell wichtiger sein als die Kontaktliste.

### Tabellen

- Tabellen sind Primäransicht für Kontakte und Organisationen.
- Header: sticky, 44px, `--surface-muted`, Uppercase klein.
- Rows: 44-48px, Hover `--surface-muted`, Active mit subtiler linker Kante.
- Actions bleiben in einer festen Aktionsspalte.
- Zellen dürfen ellipsieren, aber Detaildaten müssen im Profil voll lesbar sein.

### Drawer, Modals, Detailpanels

- Detail-Sidepanel: Lesemodus, rechts, 420-520px, kein Overlay auf Desktop.
- Editor-Sidepanel: expliziter Formularmodus, rechts, bis 820px.
- Personen- und Organisationsprofilseiten: kanonische CRM-Profile innerhalb der App-Shell, deeplinkbar und für längere Lese-/Pflegearbeit. Der rechte Detaildrawer bleibt nur kompakte Vorschau.
- Fullscreen-Workspace: Import, Karte, Auswertung nur wenn die Aufgabe Platz braucht.
- Modals: nur für Bestätigungen oder isolierte kleine Entscheidungen. Das Nutzerprofil ist eine eigene Seite innerhalb der App-Shell, kein Drawer und kein temporäres Pop-up.
- Detailpanel-Titel darf nicht mit Seitentitel oder Tabtitel doppeln.

### Filter und Suche

- Eine Suche pro Kontext.
- Filterpanel ist die zentrale Facettensteuerung und enthält nur Filter, keine gespeicherten Ansichten.
- Primäre Filter stehen zuerst: Kontakte/Karte/Auswertung nutzen Sektor, Bundesland, Fachrichtung und Owner; Organisationen nutzen Sektor, Bundesland, Organisationstyp bzw. Kontaktbezug, sofern vorhanden.
- Weitere Filter liegen in einem standardmäßig geschlossenen Bereich `Weitere Filter`; dazu zählen Priorität, Themen, Datenqualität, Quelle, Aktualität, fehlende Angaben und Archivstatus.
- Datenqualität ist kein dominanter Alltagsfilter und wird nur nachrangig bzw. rollenabhängig sichtbar.
- Spaltenfilter sind Zusatzfacetten, keine zweite globale Suche.
- Aktive Filter werden einheitlich als entfernbare Chips im Muster `Label: Wert` gezeigt und auf eine sinnvolle Anzahl begrenzt.
- Filter-Popover auf Desktop hat Header, Schnellfilter, geschlossenes `Weitere Filter` und Footer mit `Zurücksetzen`/`Anwenden`; Mobile nutzt ein Bottom Sheet mit gleichem Inhalt und sticky Footer.
- Gespeicherte Ansichten sind Arbeitsansichten, keine Filteroption. Sie sitzen separat im Ansichts-Dropdown oder im Einstellungsbereich.

### Formulare

- Default ist Lesemodus.
- Bearbeiten ist ein bewusster Modus mit Speichern/Abbrechen.
- Labels kurz, Hilfetexte sparsam.
- Validierung direkt am Feld, Statusmeldung oben nur für zusammenfassende Fehler.
- Pflichtfelder werden sachlich markiert, nicht alarmistisch.
- Kontaktanlage nutzt den Quick-Add-Grundsatz: Im Drawer ist nur `Name` Pflicht, Organisation/Sektor/Standort/Owner sind empfohlen und dürfen nicht blockieren.
- Optionale Formularbereiche werden als kompakte Accordions geführt. Sie nutzen dieselben Inputs, Selects, Textareas, Fehler- und Fokuszustände wie Bearbeitungsformulare.
- Prioritäten werden deutsch angezeigt: `Hoch`, `Mittel`, `Niedrig`, `Keine / Unbekannt`; rohe Werte wie `medium` erscheinen nicht im UI.

### Kontaktprofil und Medien

- Kontaktprofile nutzen einen ruhigen Profilkopf mit Bild/Initialen, Name, Organisation, Sektor, Fachrichtung, Ort und dezenten Schnellaktionen.
- Stammdaten, Kontaktwege, Themen, Notizen, Quelle sowie `Bild & Quelle` erscheinen im Lesemodus als kompakte Zeilen oder Chips.
- Vollständige Personenprofile nutzen eigene Routen wie `#person/contact/<id>`, `#person/expert/<id>` und `#person/stakeholder/<id>`. Vollständige Organisationsprofile nutzen `#organization/care/<id>`, `#organization/expert/<id>` und `#organization/stakeholder/<id>`. Tabellen- und Kartenkontexte dürfen auf Desktop vorher eine kompakte Vorschau zeigen.
- Keine alten Fact-Card-Muster für einzelne Felder; Profilsektionen nutzen flache Cards mit Zeilenstruktur.
- Kontaktbilder nutzen zentrale Avatar-Klassen: `.avatar`, `.avatar-sm`, `.avatar-md`, `.avatar-lg`, `.avatar-fallback`, `.contact-image`.
- Kontaktbilder müssen `object-fit: cover` und `object-position: center` nutzen. Bei fehlender oder kaputter URL erscheint ein Initialen-Fallback.
- Bildquellen sind dokumentierbar, aber nicht prominent im Profilkopf. Hinweise zu fehlender Bildquelle bleiben dezent und adminnah.

### Topbar und globale Aktionen

- Die Topbar bleibt ruhig; primäre Arbeitsaktionen wie Kontakt oder Organisation anlegen sollen im jeweiligen Workspace bzw. in der Tabellen-Command-Row stehen.
- Kontaktimport gehört in den Bereich `Importe`, nicht dauerhaft in die globale Topbar.
- Profilzugang erfolgt über den Nutzerbereich der Sidebar; keine zweite prominente Nutzeranzeige, wenn die Sidebar sichtbar ist.

### Kontaktanlage und Bulk-Anlage

- Es gibt drei getrennte Wege: Einzelkontakt per Drawer, Bulk-Anlage per Online-Tabelle und Dateiimport per CSV/Excel.
- Die Online-Tabelle gehört in den Bereich `Importe`, ist aber kein Dateiimport und nutzt kein CSV-Mapping.
- Die Bulk-Tabelle orientiert sich visuell an der Kontaktliste: kompakte Tabellenheader, ruhige Zellinputs, fixe Spalten und eine knappe Statuszusammenfassung.

## UX-Muster

- Kontaktprofil als CRM-Profil: Name, Organisation, Rolle, Ort, Kontaktwege, Themen, Notizen, Aktivität.
- Nutzerprofil als eigene App-Seite: Anzeigename, Rolle, E-Mail, Foto/Initialen und wenige persönliche Einstellungen.
- Admin-Hinweise dezent: keine dominanten Banner, solange keine Aktion erforderlich ist.
- Kartenmodus ist Analyse-/Orientierungsmodus, nicht zweite Kontaktverwaltung.
- Auswertung ist operativ: Zahlen helfen Entscheidungen, keine dekorativen Charts.
- Import ist Wizard/Workflow, darf visuell dichter und geführter sein, muss aber dieselben Controls nutzen.

## Verstoßkriterien

Eine UI-Änderung verstößt gegen dieses Designsystem, wenn sie:

- neue Farben, Schatten, Radien oder Gradients hart codiert, obwohl Tokens existieren,
- neue Button-/Badge-/Card-Varianten ohne Designsystem-Erweiterung einführt,
- eine zweite Suche im gleichen Kontext erzeugt,
- Lesemodus durch Formularfelder ersetzt,
- Admin-/Systemhinweise prominenter macht als fachliche CRM-Daten,
- Titel oder Statusinformationen doppelt anzeigt,
- Cards als dekorative Layoutsektionen statt als Inhaltseinheiten nutzt.
