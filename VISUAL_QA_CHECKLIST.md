# Visual QA Checklist

Diese Checkliste ist vor jeder groesseren UI-Aenderung durchzugehen. Screenshots sollen mindestens Desktop 1440px, Tablet ca. 1024px und Mobile 390px abdecken.

## Allgemein

- [ ] Es gibt keine neuen hart codierten Farben, Radien oder Schatten ausserhalb bestehender Tokens.
- [ ] Die App wirkt wie ein CRM-Arbeitswerkzeug, nicht wie eine Landingpage.
- [ ] Sidebar ist primaere Navigation und logisch gruppiert.
- [ ] Topbar enthaelt nur kontextuelle Hauptaktionen und keinen permanenten Importbutton.
- [ ] Text laeuft nicht aus Buttons, Chips, Cards, Tabellenzellen oder Panels.
- [ ] Keine UI-Elemente ueberlappen unlesbar.
- [ ] Fokuszustaende sind sichtbar und konsistent.
- [ ] Hover/Active-Zustaende veraendern Layoutgroessen nicht.
- [ ] Auf Mobile gibt es keine horizontale Seiten-Scrollleiste ausser bei bewusst scrollbaren Tabellen.

## Kontakte

- [ ] Kontaktliste ist die primaere Ansicht und scanbar.
- [ ] Suche ist eindeutig und pro Kontext nur einmal vorhanden.
- [ ] Filterbutton, aktive Filter und Ergebnisanzahl bilden eine ruhige Toolbar.
- [ ] Tabellenheader bleibt lesbar/sticky.
- [ ] Row Hover und aktive Row sind subtil, aber eindeutig.
- [ ] Badges/Chips wiederholen keine sichtbaren Spalteninformationen unnoetig.

## Kontaktprofil

- [ ] Profil oeffnet im Lesemodus.
- [ ] Name, Organisation, Rolle und Standort sind ohne Scrollen erfassbar.
- [ ] Bearbeiten/Speichern/Abbrechen sind eindeutig vom Lesen getrennt.
- [ ] Detailtabs verdoppeln keine sichtbaren Titel.
- [ ] Notizen, Themen und Aktivitaet wirken wie CRM-Daten, nicht wie dekorative Cards.
- [ ] Leere Werte sind dezent markiert und nicht alarmistisch.
- [ ] Kontaktbild ist rund, nicht verzerrt und nutzt `object-fit: cover`.
- [ ] Fehlendes oder kaputtes Kontaktbild zeigt Initialen-Fallback.
- [ ] `Bild & Quelle` ist sichtbar, aber nicht dominanter als Stammdaten oder Kontaktwege.
- [ ] Bildquelle, Quellen-URL und Rechtehinweis sind im Bearbeitungsmodus pflegbar.
- [ ] Themen und Notizen zeigen im Lesemodus keine Inputs oder Textareas.

## Organisationen

- [ ] Organisationsliste folgt denselben Tabellenregeln wie Kontakte.
- [ ] Kontaktanzahl ist als Aktion erkennbar, aber nicht dominanter als Name/Ort.
- [ ] Organisationsdetail nutzt dieselbe Profilstruktur wie Kontakte.

## Karte

- [ ] Kartencontrols sind kompakt und stoeren die Karte nicht.
- [ ] Legende und Markerfarben stimmen ueberein.
- [ ] Aktive Kartenfilter sind klar, aber nicht lauter als Karte und Liste.
- [ ] Mobile zeigt Karte und Liste ohne ueberlappende Controls.
- [ ] Karten-Detailpanel ist kompakt und verweist auf das CRM-Profil.

## Auswertung

- [ ] Dashboard-Cards sind flach, gleichmaessig und scanbar.
- [ ] Diagramme beantworten erkennbare operative Fragen.
- [ ] Legenden, Zahlen und Prozentwerte sind ausgerichtet.
- [ ] Keine dekorativen Charts ohne Entscheidungshilfe.
- [ ] Mobile blendet nicht kritische Charts nur aus, wenn Kerninformationen erhalten bleiben.

## Filter

- [ ] Filterpanel enthaelt nur Filter und keine gespeicherten Ansichten.
- [ ] Schnellfilter stehen zuerst: Sektor, Bundesland, Fachrichtung, Owner bzw. je Ansicht fachlich passende Entsprechungen.
- [ ] Weitere Filter sind erreichbar, aber standardmaessig geschlossen.
- [ ] Aktive Filter sind sichtbar und entfernbar.
- [ ] Zuruecksetzen und Anwenden sind an erwarteter Position.
- [ ] Gespeicherte Ansichten sind im separaten Ansichts-Dropdown oder Einstellungsbereich erreichbar.
- [ ] Mobile zeigt Filter als Bottom Sheet mit sticky Footer und ohne horizontales Brechen.

## Formulare und Import

- [ ] Labels sind kurz und einheitlich.
- [ ] Pflichtfelder, Fehler und Warnungen sind konsistent.
- [ ] Import ist ueber den Sidebar-Bereich `Importe` erreichbar.
- [ ] Wizard-Schritte im Import sind eindeutig.
- [ ] Formulare nutzen dieselbe Input-Hoehe, denselben Radius und dieselben Fokuszustaende.
- [ ] Neuer-Kontakt-Drawer zeigt initial nur Schnellerfassung plus eingeklappte optionale Bereiche.
- [ ] Im Drawer ist nur Name blockierend; empfohlene Felder erzeugen hoechstens dezente Hinweise.
- [ ] Bulk-Anlage per Online-Tabelle ist im Importbereich separat vom Dateiimport erreichbar.
- [ ] Online-Tabelle zeigt 5 leere Zeilen, feste Kontaktspalten, kompakte Zellinputs und eine Zusammenfassung.
- [ ] Fehlerhafte Bulk-Zeilen werden markiert und nicht gespeichert; valide Zeilen koennen trotz Warnungen gespeichert werden.
- [ ] Dateiimport bleibt als CSV/Excel-Upload mit Mapping erreichbar.

## Profil und Einstellungen

- [ ] Nutzerbereich in der Sidebar oeffnet `Mein Profil` als eigene Seite.
- [ ] Profil erscheint nicht als Drawer, Pop-up oder temporaeres Modal.
- [ ] Profilfoto/Initialen, Anzeigename, E-Mail und Rolle sind sichtbar.
- [ ] Rolle ist sichtbar, aber nicht selbst editierbar.
- [ ] Einstellungen sind fachlich vom Profil getrennt.

## Empfohlene Screenshot-Szenarien

- Kontakte: `app/versorgungs-kompass.html`, Default-Kontaktliste mit Filtertoolbar.
- Kontaktprofil: Kontakt oeffnen, Lesemodus und optional Edit-Modus.
- Karte: `map/versorgungs-kompass-map.html` oder eingebetteter Karten-View.
- Auswertung: Analytics-View mit aktiven Daten.
- Importe: Sidebar-Eintrag, Import-Startseite und Start des bestehenden Import-Wizards.
- Bulk-Anlage: Import-Startseite, Online-Tabelle, Validierung, Speichern fehlerfreier Zeilen.
- Profil/Einstellungen: Profilseite und Systembereich in der App-Shell.
- Mobile: Kontaktliste, Filterpanel, Detaildrawer, Karte, Profilseite.
