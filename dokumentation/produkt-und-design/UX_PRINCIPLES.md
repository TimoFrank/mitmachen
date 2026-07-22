# UX Principles

## CRM-App statt Landingpage

Der Versorgungs-Kompass ist ein Arbeitswerkzeug. Erste Priorität haben Kontaktliste, Profile, Filter, Karte und Auswertung. Keine Hero-Sektionen, keine Marketing-Komposition, keine übergroßen Headlines und keine dekorativen Card-Landschaften.

## Lesemodus vor Formularmodus

Kontakte und Organisationen werden zuerst als lesbare CRM-Profile angezeigt. Formularfelder erscheinen erst nach einer klaren Bearbeiten-Aktion oder in einem dedizierten Editor. Inline-Bearbeitung ist sparsam und nur dort erlaubt, wo sie die Arbeitsgeschwindigkeit klar erhöht.

## Admin-Hinweise dezent

Admin-, Rollen-, Deployment- und Berechtigungshinweise dürfen die fachliche Arbeit nicht dominieren. Sie stehen in Popover, Footer, kleinen Notices oder neutralen Banners. Nur blockierende Probleme dürfen prominent werden.

## Keine doppelten Titel

Ein View hat genau einen sichtbaren Haupttitel. Drawer und Detailpanels zeigen den konkreten Datensatz, nicht erneut den View-Titel. Karten- und Auswertungsmodi dürfen Untertitel nutzen, aber keine redundant benannten Headerketten.

## Sidebar vor Topbar

Die Sidebar ist die primäre Navigation der App. Die Topbar bleibt ruhig und zeigt nur die wichtigste kontextuelle Aktion. Import, Datenqualität, Einstellungen und Profil werden über ihre eigenen Bereiche erreicht, nicht als dauerhafte globale Zusatzbuttons.

## Keine unnötigen Badges

Badges markieren Status, Rollen, Prioritäten oder fachliche Kategorien. Sie sind kein Schmuck. Wenn eine Information bereits klar im Namen, in der Spalte oder im Header steht, wird kein zweites Badge dafür angezeigt.

## Eine Suche pro Kontext

Pro Kontext gibt es eine primäre Suche. In der Kontaktliste ist das die Kontakt-/Organisationssuche. Das Filterpanel selbst führt keine zweite Suchlogik für Kontakte. Karte und Auswertung sollen nicht gleichzeitig eine globale Suche und eine zweite Kartensuche zeigen; Filterchips und Filterbutton reichen dort für die Segmentierung.

## Filter Priorisieren

Filter starten immer mit wenigen Schnellfiltern: Sektor, Bundesland, Fachrichtung und Owner. Organisationen dürfen stattdessen Organisationstyp oder Kontaktbezug nutzen. Seltene, administrative oder qualitätsbezogene Filter liegen unter `Weitere Filter` und sind standardmäßig geschlossen. Gespeicherte Ansichten sind eine eigene Produktivitätsfunktion und gehören in ein Ansichts-Dropdown oder Einstellungen, niemals ins Filterpanel.

## Profil und Einstellungen trennen

Mein Profil ist ein persönlicher Bereich innerhalb der App-Shell mit Foto/Initialen, Anzeigename, Rolle, E-Mail und wenigen Nutzungseinstellungen. Es öffnet nie als Drawer, Pop-up oder temporäres Modal. Einstellungen sind für systemweite oder technische App-Konfiguration reserviert.

## Kontaktprofile als CRM-Profile

Kontaktprofile folgen einer festen Lesereihenfolge:

1. Identität: Name, Bild/Initialen, Organisation, Rolle.
2. Einordnung: Sektor, Fachrichtung, Ort/Bundesland, Priorität, Owner.
3. Kontaktwege: E-Mail, Telefon, LinkedIn, Website/Quellen.
4. Themen und Notizen.
5. Aktivität und Datenqualität.

Das Profil ist kein Mini-Landingpage-Layout. Es ist ein ruhiger Datensatz mit schnellen Aktionen.

Bearbeitung ist abschnittsweise erreichbar, aber nicht der Normalzustand. Lesemodus zeigt keine Inputs, Dropdowns oder leeren Formularflächen. Fehlende Werte erscheinen als dezentes `Nicht hinterlegt`, Quellen und Bildquellen bleiben fachlich getrennt von Notizen.

Kontaktbilder werden manuell gepflegt. Die App lädt keine Bilder automatisch aus dem Internet, dokumentiert aber Bildquelle, Quellen-URL und Rechtehinweis, wenn ein Bild verwendet wird. Ohne Bild bleibt der Initialen-Avatar ein vollwertiger Fallback.

## Dichte vor Dekoration

CRM-Nutzer scannen, vergleichen und pflegen. Layouts sollen kompakt, vorhersehbar und ruhig sein. Animationen, Schatten, Gradients und große visuelle Akzente brauchen eine funktionale Begründung.

## Karte als Orientierung

Die Karte beantwortet Standort-, Abdeckungs- und Verteilungsfragen. Sie soll nicht die Kontaktliste ersetzen. Detailinformationen auf der Karte bleiben kompakt und verlinken bei Bedarf ins Kontaktprofil.

## Auswertung als Entscheidungshilfe

Auswertung zeigt operative Fragen: Wo fehlen Kontakte? Welche Sektoren dominieren? Welche Datenqualität ist kritisch? Charts brauchen klare Labels, Legenden und Zahlen. Dekorative Visualisierung ohne Entscheidungskraft wird entfernt.

## Import als eigener Arbeitsbereich

Kontaktimport ist ein eigener Pflegebereich. Dateiimport, tabellarische Bulk-Anlage und Importhistorie werden unter `Importe` eingeordnet. Ein Import-Wizard darf aus diesem Bereich starten, aber der globale Kontaktbereich bleibt frei von permanenten Import-CTAs.

## Kontaktanlage

Einzelkontakt, Bulk-Anlage und Dateiimport sind unterschiedliche Arbeitsweisen:

1. Einzelkontakt: rechter Drawer `Neuen Kontakt anlegen`, nur Name als Pflichtfeld, optionale Details in Accordions.
2. Bulk-Anlage per Online-Tabelle: mehrere Kontakte direkt im Browser erfassen, feste Kontaktspalten, Validierung pro Zeile, gemeinsames Speichern.
3. Dateiimport: CSV/Excel hochladen, Mapping prüfen, Import starten.

Warnungen wie fehlende Organisation, fehlender Standort, fehlender Owner oder mögliche Dubletten helfen bei Datenqualität, blockieren aber keine validen Zeilen. Fehler wie fehlender Name oder ungültige E-Mail blockieren nur die betroffene Zeile.
