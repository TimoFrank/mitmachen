# Visual QA Checklist

Diese Checkliste ist vor jeder größeren UI-Änderung durchzugehen. Screenshots sollen mindestens Desktop 1440px, Tablet ca. 1024px und Mobile 390px abdecken.

## Allgemein

- [ ] Es gibt keine neuen hart codierten Farben, Radien oder Schatten außerhalb bestehender Tokens.
- [ ] Die App wirkt wie ein CRM-Arbeitswerkzeug, nicht wie eine Landingpage.
- [ ] Sidebar ist primäre Navigation und logisch gruppiert.
- [ ] Topbar enthält nur kontextuelle Hauptaktionen und keinen permanenten Importbutton.
- [ ] Text läuft nicht aus Buttons, Chips, Cards, Tabellenzellen oder Panels.
- [ ] Keine UI-Elemente überlappen unlesbar.
- [ ] Fokuszustände sind sichtbar und konsistent.
- [ ] Hover/Active-Zustände verändern Layoutgrößen nicht.
- [ ] Auf Mobile gibt es keine horizontale Seiten-Scrollleiste außer bei bewusst scrollbaren Tabellen.

## Kontakte

- [ ] Kontaktliste ist die primäre Ansicht und scanbar.
- [ ] Suche ist eindeutig und pro Kontext nur einmal vorhanden.
- [ ] Filterbutton, aktive Filter und Ergebnisanzahl bilden eine ruhige Toolbar.
- [ ] Tabellenheader bleibt lesbar/sticky.
- [ ] Row Hover und aktive Row sind subtil, aber eindeutig.
- [ ] Badges/Chips wiederholen keine sichtbaren Spalteninformationen unnötig.

## Kontaktprofil

- [ ] Profil öffnet im Lesemodus.
- [ ] Name, Organisation, Rolle und Standort sind ohne Scrollen erfassbar.
- [ ] Bearbeiten/Speichern/Abbrechen sind eindeutig vom Lesen getrennt.
- [ ] Detailtabs verdoppeln keine sichtbaren Titel.
- [ ] Notizen, Themen und Aktivität wirken wie CRM-Daten, nicht wie dekorative Cards.
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

- [ ] Kartencontrols sind kompakt und stören die Karte nicht.
- [ ] Legende und Markerfarben stimmen überein.
- [ ] Aktive Kartenfilter sind klar, aber nicht lauter als Karte und Liste.
- [ ] Mobile zeigt Karte und Liste ohne überlappende Controls.
- [ ] Karten-Detailpanel ist kompakt und verweist auf das CRM-Profil.

## Auswertung

- [ ] Dashboard-Cards sind flach, gleichmäßig und scanbar.
- [ ] Diagramme beantworten erkennbare operative Fragen.
- [ ] Legenden, Zahlen und Prozentwerte sind ausgerichtet.
- [ ] Keine dekorativen Charts ohne Entscheidungshilfe.
- [ ] Mobile blendet nicht kritische Charts nur aus, wenn Kerninformationen erhalten bleiben.

## Filter

- [ ] Filterpanel enthält nur Filter und keine gespeicherten Ansichten.
- [ ] Schnellfilter stehen zuerst: Sektor, Bundesland, Fachrichtung, Owner bzw. je Ansicht fachlich passende Entsprechungen.
- [ ] Weitere Filter sind erreichbar, aber standardmäßig geschlossen.
- [ ] Aktive Filter sind sichtbar und entfernbar.
- [ ] Zurücksetzen und Anwenden sind an erwarteter Position.
- [ ] Gespeicherte Ansichten sind im separaten Ansichts-Dropdown oder Einstellungsbereich erreichbar.
- [ ] Mobile zeigt Filter als Bottom Sheet mit sticky Footer und ohne horizontales Brechen.

## Formulare und Import

- [ ] Labels sind kurz und einheitlich.
- [ ] Pflichtfelder, Fehler und Warnungen sind konsistent.
- [ ] Import ist über den Sidebar-Bereich `Importe` erreichbar.
- [ ] Wizard-Schritte im Import sind eindeutig.
- [ ] Formulare nutzen dieselbe Input-Höhe, denselben Radius und dieselben Fokuszustände.
- [ ] Neuer-Kontakt-Drawer zeigt initial nur Schnellerfassung plus eingeklappte optionale Bereiche.
- [ ] Im Drawer ist nur Name blockierend; empfohlene Felder erzeugen höchstens dezente Hinweise.
- [ ] Bulk-Anlage per Online-Tabelle ist im Importbereich separat vom Dateiimport erreichbar.
- [ ] Online-Tabelle zeigt 5 leere Zeilen, feste Kontaktspalten, kompakte Zellinputs und eine Zusammenfassung.
- [ ] Fehlerhafte Bulk-Zeilen werden markiert und nicht gespeichert; valide Zeilen können trotz Warnungen gespeichert werden.
- [ ] Dateiimport bleibt als CSV/Excel-Upload mit Mapping erreichbar.

## Profil und Einstellungen

- [ ] Nutzerbereich in der Sidebar öffnet `Mein Profil` als eigene Seite.
- [ ] Profil erscheint nicht als Drawer, Pop-up oder temporäres Modal.
- [ ] Profilfoto/Initialen, Anzeigename, E-Mail und Rolle sind sichtbar.
- [ ] Rolle ist sichtbar, aber nicht selbst editierbar.
- [ ] Einstellungen sind fachlich vom Profil getrennt.

## Empfohlene Screenshot-Szenarien

- Kontakte: `frontend/app/versorgungs-kompass.html`, Default-Kontaktliste mit Filtertoolbar.
- Kontaktprofil: Kontakt öffnen, Lesemodus und optional Edit-Modus.
- Karte: `frontend/map/versorgungs-kompass-map.html` oder eingebetteter Karten-View.
- Auswertung: Analytics-View mit aktiven Daten.
- Importe: Sidebar-Eintrag, Import-Startseite und Start des bestehenden Import-Wizards.
- Bulk-Anlage: Import-Startseite, Online-Tabelle, Validierung, Speichern fehlerfreier Zeilen.
- Profil/Einstellungen: Profilseite und Systembereich in der App-Shell.
- Mobile: Kontaktliste, Filterpanel, Detaildrawer, Karte, Profilseite.
