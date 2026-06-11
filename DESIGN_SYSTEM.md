# Design System

Der Versorgungs-Kompass ist eine operative CRM-App. Das Designsystem priorisiert Lesbarkeit, Vergleichbarkeit, schnelle Wiederholungshandlungen und ruhige Datenpflege. Keine Landingpage-Aesthetik, keine dekorativen Kartenstapel, keine punktuellen Sonderstile.

## Farben

### Tokens

- `--primary: #155fe4` fuer primaere Aktion, aktive Navigation und Links.
- `--primary-hover: #0d4fc4` nur fuer Hover/Pressed primaerer Aktionen.
- `--primary-soft: #eaf1ff` fuer ausgewaehlte Filter, ruhige Infoflaechen und sekundare Icon-Hintergruende.
- `--background: #f5f7fb` fuer App-Hintergrund.
- `--surface: #ffffff` fuer Panels, Tabellen, Cards, Drawers und Popover.
- `--surface-muted: #f8faff` fuer Headerzeilen, Hover und subtile Bereiche.
- `--border: #dce3f5`, `--border-strong: #b8c7e8`.
- `--text-primary: #17275f`, `--text-secondary: #334155`, `--text-muted: #64748b`.
- Status: `--success: #16a34a`, `--warning: #b7791f`, `--danger: #dc2626`, `--info: #2563eb`.

### Regeln

- Primaerblau ist die einzige dominante Aktionsfarbe.
- Gradients sind fuer CRM-Komponenten nicht erlaubt, ausser in bestehenden Markenassets. Primaerbuttons sind flach `--primary`.
- Statusfarben werden nur fuer Status, Datenqualitaet, Gefahr oder Validierung genutzt.
- Admin-/Betriebshinweise sind neutral oder dezent blau, nie dominant.
- Kartenfarben duerfen fachliche Kategorien abbilden, muessen aber in Legende und Listen gleich bleiben.

## Typografie

- Font: `Inter, "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Basisschrift: `--font-size-md: 0.94rem`.
- Kleine Metadaten: `--font-size-sm: 0.84rem`, `--font-size-xs: 0.74rem`.
- Ueberschriften in Arbeitsflaechen: maximal `--font-size-xl: 1.42rem`.
- Keine Hero-Typografie innerhalb der CRM-App.
- Letter-spacing standardmaessig `0`; nur kleine Uppercase-Labels duerfen `0.03em` bis `0.06em` verwenden.
- Tabellen, Badges und Metriken nutzen tabular-numeric, wenn Zahlen verglichen werden.

## Spacing

- Basisraster: 4px.
- Dichte CRM-Flaechen: 8px, 12px, 16px.
- Seitenpadding Desktop: `--page-padding: 22px`; mobil 12-16px.
- Card-Padding: `--card-padding: 16px`.
- Abschnittsabstand: `--section-gap: 16px`.
- Tabellenzeilen: `--row-height: 44px`, kompakt 40px.
- Keine grossen Marketing-Leerraeume zwischen Arbeitsbereichen.

## Radius

- `--radius-sm: 6px` fuer kompakte Controls in Toolbars.
- `--radius-md: 8px` Standard fuer Buttons, Cards, Panels, Inputs.
- `--radius-lg: 12px` fuer Popover oder groessere Eingaben.
- `--radius-xl: 16px` nur fuer grosse Modals/Legacy-Uebergang.
- `999px` nur fuer Avatare, echte Pills/Chips und Toggles.
- Neue Cards sollen 8px Radius nutzen.

## Schatten

- `--shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.05)` Standard.
- `--shadow-md: 0 8px 24px rgba(15, 23, 42, 0.08)` nur fuer Popover/Dropdowns.
- `--shadow-lg: 0 18px 48px rgba(15, 23, 42, 0.12)` nur fuer modale Layer.
- Keine schwebenden Schatten auf normalen Inhaltskarten.
- Hover darf nicht durch grosse Schatten dramatisiert werden.

## Komponentenregeln

### Buttons

- Primaer: eine Hauptaktion pro Kontext, flach blau, 38-42px hoch.
- Sekundaer: weisse Flaeche, Border, primaere Textfarbe.
- Gefahr: `--danger-soft` plus `--danger`, nur fuer destructive actions.
- Icon-Buttons: quadratisch, 38px, mit `aria-label`.
- Keine neuen Gradient-Buttons.

### Tabs und Navigation

- Hauptnavigation bleibt links als Sidebar oder mobile Tabbar.
- Die Sidebar ist die primaere App-Navigation. Neue Funktionen werden zuerst dort fachlich eingeordnet: Hauptarbeit, Administration/Pflege oder Persoenlich/System.
- Tabs sind segmentierte Kontextwechsel, nicht dekorative Pills.
- Aktiver Zustand ist eindeutig: `--primary` Hintergrund oder linke aktive Kante, nicht beides plus Schatten.
- Nutzerprofil und Einstellungen sind getrennt: Profil ist persoenlich, Einstellungen sind System-/App-Konfiguration.

### Badges und Chips

- Badge = Status/Kategorie, nicht CTA.
- Chip = interaktive Auswahl oder Tag.
- Count-Indicator = ungelesene Anzahl oder technische Menge an einer Navigation/Aktion. Er ist keine Status- oder Kategorieauszeichnung und wird sparsam eingesetzt.
- Filterchips duerfen entfernt werden; Tagchips nicht automatisch.
- Keine Badge-Dopplung, wenn die gleiche Information schon im Tabellenfeld oder Profilheader steht.

### Cards

- Cards sind wiederholbare Einheiten oder klar gerahmte Werkzeuge.
- Keine Cards in Cards.
- Dashboard-Cards sind dicht, scanbar und flach.
- Summary-Cards duerfen nicht visuell wichtiger sein als die Kontaktliste.

### Tabellen

- Tabellen sind Primaeransicht fuer Kontakte und Organisationen.
- Header: sticky, 44px, `--surface-muted`, Uppercase klein.
- Rows: 44-48px, Hover `--surface-muted`, Active mit subtiler linker Kante.
- Actions bleiben in einer festen Aktionsspalte.
- Zellen duerfen ellipsieren, aber Detaildaten muessen im Profil voll lesbar sein.

### Drawer, Modals, Detailpanels

- Detail-Sidepanel: Lesemodus, rechts, 420-520px, kein Overlay auf Desktop.
- Editor-Sidepanel: expliziter Formularmodus, rechts, bis 820px.
- Fullscreen-Workspace: Import, Karte, Auswertung nur wenn die Aufgabe Platz braucht.
- Modals: nur fuer Bestaetigungen oder isolierte kleine Entscheidungen. Das Nutzerprofil ist eine eigene Seite innerhalb der App-Shell, kein Drawer und kein temporaeres Pop-up.
- Detailpanel-Titel darf nicht mit Seitentitel oder Tabtitel doppeln.

### Filter und Suche

- Eine Suche pro Kontext.
- Filterpanel ist die zentrale Facettensteuerung und enthaelt nur Filter, keine gespeicherten Ansichten.
- Primaere Filter stehen zuerst: Kontakte/Karte/Auswertung nutzen Sektor, Bundesland, Fachrichtung und Owner; Organisationen nutzen Sektor, Bundesland, Organisationstyp bzw. Kontaktbezug, sofern vorhanden.
- Weitere Filter liegen in einem standardmaessig geschlossenen Bereich `Weitere Filter`; dazu zaehlen Prioritaet, Themen, Datenqualitaet, Quelle, Aktualitaet, fehlende Angaben und Archivstatus.
- Datenqualitaet ist kein dominanter Alltagsfilter und wird nur nachrangig bzw. rollenabhaengig sichtbar.
- Spaltenfilter sind Zusatzfacetten, keine zweite globale Suche.
- Aktive Filter werden einheitlich als entfernbare Chips im Muster `Label: Wert` gezeigt und auf eine sinnvolle Anzahl begrenzt.
- Filter-Popover auf Desktop hat Header, Schnellfilter, geschlossenes `Weitere Filter` und Footer mit `Zuruecksetzen`/`Anwenden`; Mobile nutzt ein Bottom Sheet mit gleichem Inhalt und sticky Footer.
- Gespeicherte Ansichten sind Arbeitsansichten, keine Filteroption. Sie sitzen separat im Ansichts-Dropdown oder im Einstellungsbereich.

### Formulare

- Default ist Lesemodus.
- Bearbeiten ist ein bewusster Modus mit Speichern/Abbrechen.
- Labels kurz, Hilfetexte sparsam.
- Validierung direkt am Feld, Statusmeldung oben nur fuer zusammenfassende Fehler.
- Pflichtfelder werden sachlich markiert, nicht alarmistisch.
- Kontaktanlage nutzt den Quick-Add-Grundsatz: Im Drawer ist nur `Name` Pflicht, Organisation/Sektor/Standort/Owner sind empfohlen und duerfen nicht blockieren.
- Optionale Formularbereiche werden als kompakte Accordions gefuehrt. Sie nutzen dieselben Inputs, Selects, Textareas, Fehler- und Fokuszustaende wie Bearbeitungsformulare.
- Prioritaeten werden deutsch angezeigt: `Hoch`, `Mittel`, `Niedrig`, `Keine / Unbekannt`; rohe Werte wie `medium` erscheinen nicht im UI.

### Kontaktprofil und Medien

- Kontaktprofile nutzen einen ruhigen Profilkopf mit Bild/Initialen, Name, Organisation, Sektor, Fachrichtung, Ort und dezenten Schnellaktionen.
- Stammdaten, Kontaktwege, Themen, Notizen, Quelle sowie `Bild & Quelle` erscheinen im Lesemodus als kompakte Zeilen oder Chips.
- Keine alten Fact-Card-Muster fuer einzelne Felder; Profilsektionen nutzen flache Cards mit Zeilenstruktur.
- Kontaktbilder nutzen zentrale Avatar-Klassen: `.avatar`, `.avatar-sm`, `.avatar-md`, `.avatar-lg`, `.avatar-fallback`, `.contact-image`.
- Kontaktbilder muessen `object-fit: cover` und `object-position: center` nutzen. Bei fehlender oder kaputter URL erscheint ein Initialen-Fallback.
- Bildquellen sind dokumentierbar, aber nicht prominent im Profilkopf. Hinweise zu fehlender Bildquelle bleiben dezent und adminnah.

### Topbar und globale Aktionen

- Die Topbar bleibt ruhig; primaere Arbeitsaktionen wie Kontakt oder Organisation anlegen sollen im jeweiligen Workspace bzw. in der Tabellen-Command-Row stehen.
- Kontaktimport gehoert in den Bereich `Importe`, nicht dauerhaft in die globale Topbar.
- Profilzugang erfolgt ueber den Nutzerbereich der Sidebar; keine zweite prominente Nutzeranzeige, wenn die Sidebar sichtbar ist.

### Kontaktanlage und Bulk-Anlage

- Es gibt drei getrennte Wege: Einzelkontakt per Drawer, Bulk-Anlage per Online-Tabelle und Dateiimport per CSV/Excel.
- Die Online-Tabelle gehoert in den Bereich `Importe`, ist aber kein Dateiimport und nutzt kein CSV-Mapping.
- Die Bulk-Tabelle orientiert sich visuell an der Kontaktliste: kompakte Tabellenheader, ruhige Zellinputs, fixe Spalten und eine knappe Statuszusammenfassung.

## UX-Muster

- Kontaktprofil als CRM-Profil: Name, Organisation, Rolle, Ort, Kontaktwege, Themen, Notizen, Aktivitaet.
- Nutzerprofil als eigene App-Seite: Anzeigename, Rolle, E-Mail, Foto/Initialen und wenige persoenliche Einstellungen.
- Admin-Hinweise dezent: keine dominanten Banner, solange keine Aktion erforderlich ist.
- Kartenmodus ist Analyse-/Orientierungsmodus, nicht zweite Kontaktverwaltung.
- Auswertung ist operativ: Zahlen helfen Entscheidungen, keine dekorativen Charts.
- Import ist Wizard/Workflow, darf visuell dichter und gefuehrter sein, muss aber dieselben Controls nutzen.

## Verstosskriterien

Eine UI-Aenderung verstoesst gegen dieses Designsystem, wenn sie:

- neue Farben, Schatten, Radien oder Gradients hart codiert, obwohl Tokens existieren,
- neue Button-/Badge-/Card-Varianten ohne Designsystem-Erweiterung einfuehrt,
- eine zweite Suche im gleichen Kontext erzeugt,
- Lesemodus durch Formularfelder ersetzt,
- Admin-/Systemhinweise prominenter macht als fachliche CRM-Daten,
- Titel oder Statusinformationen doppelt anzeigt,
- Cards als dekorative Layoutsektionen statt als Inhaltseinheiten nutzt.
