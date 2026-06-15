# UX Principles

## CRM-App statt Landingpage

Der Versorgungs-Kompass ist ein Arbeitswerkzeug. Erste Prioritaet haben Kontaktliste, Profile, Filter, Karte und Auswertung. Keine Hero-Sektionen, keine Marketing-Komposition, keine uebergrossen Headlines und keine dekorativen Card-Landschaften.

## Lesemodus vor Formularmodus

Kontakte und Organisationen werden zuerst als lesbare CRM-Profile angezeigt. Formularfelder erscheinen erst nach einer klaren Bearbeiten-Aktion oder in einem dedizierten Editor. Inline-Bearbeitung ist sparsam und nur dort erlaubt, wo sie die Arbeitsgeschwindigkeit klar erhoeht.

## Admin-Hinweise dezent

Admin-, Rollen-, Deployment- und Berechtigungshinweise duerfen die fachliche Arbeit nicht dominieren. Sie stehen in Popover, Footer, kleinen Notices oder neutralen Banners. Nur blockierende Probleme duerfen prominent werden.

## Keine doppelten Titel

Ein View hat genau einen sichtbaren Haupttitel. Drawer und Detailpanels zeigen den konkreten Datensatz, nicht erneut den View-Titel. Karten- und Auswertungsmodi duerfen Untertitel nutzen, aber keine redundant benannten Headerketten.

## Sidebar vor Topbar

Die Sidebar ist die primaere Navigation der App. Die Topbar bleibt ruhig und zeigt nur die wichtigste kontextuelle Aktion. Import, Datenqualitaet, Einstellungen und Profil werden ueber ihre eigenen Bereiche erreicht, nicht als dauerhafte globale Zusatzbuttons.

## Keine unnoetigen Badges

Badges markieren Status, Rollen, Prioritaeten oder fachliche Kategorien. Sie sind kein Schmuck. Wenn eine Information bereits klar im Namen, in der Spalte oder im Header steht, wird kein zweites Badge dafuer angezeigt.

## Eine Suche pro Kontext

Pro Kontext gibt es eine primaere Suche. In der Kontaktliste ist das die Kontakt-/Organisationssuche. Das Filterpanel selbst fuehrt keine zweite Suchlogik fuer Kontakte. Karte und Auswertung sollen nicht gleichzeitig eine globale Suche und eine zweite Kartensuche zeigen; Filterchips und Filterbutton reichen dort fuer die Segmentierung.

## Filter Priorisieren

Filter starten immer mit wenigen Schnellfiltern: Sektor, Bundesland, Fachrichtung und Owner. Organisationen duerfen stattdessen Organisationstyp oder Kontaktbezug nutzen. Seltene, administrative oder qualitaetsbezogene Filter liegen unter `Weitere Filter` und sind standardmaessig geschlossen. Gespeicherte Ansichten sind eine eigene Produktivitaetsfunktion und gehoeren in ein Ansichts-Dropdown oder Einstellungen, niemals ins Filterpanel.

## Profil und Einstellungen trennen

Mein Profil ist ein persoenlicher Bereich innerhalb der App-Shell mit Foto/Initialen, Anzeigename, Rolle, E-Mail und wenigen Nutzungseinstellungen. Es oeffnet nie als Drawer, Pop-up oder temporaeres Modal. Einstellungen sind fuer systemweite oder technische App-Konfiguration reserviert.

## Kontaktprofile als CRM-Profile

Kontaktprofile folgen einer festen Lesereihenfolge:

1. Identitaet: Name, Bild/Initialen, Organisation, Rolle.
2. Einordnung: Sektor, Fachrichtung, Ort/Bundesland, Prioritaet, Owner.
3. Kontaktwege: E-Mail, Telefon, LinkedIn, Website/Quellen.
4. Themen und Notizen.
5. Aktivitaet und Datenqualitaet.

Das Profil ist kein Mini-Landingpage-Layout. Es ist ein ruhiger Datensatz mit schnellen Aktionen.

Bearbeitung ist abschnittsweise erreichbar, aber nicht der Normalzustand. Lesemodus zeigt keine Inputs, Dropdowns oder leeren Formularflaechen. Fehlende Werte erscheinen als dezentes `Nicht hinterlegt`, Quellen und Bildquellen bleiben fachlich getrennt von Notizen.

Kontaktbilder werden manuell gepflegt. Die App laedt keine Bilder automatisch aus dem Internet, dokumentiert aber Bildquelle, Quellen-URL und Rechtehinweis, wenn ein Bild verwendet wird. Ohne Bild bleibt der Initialen-Avatar ein vollwertiger Fallback.

## Dichte vor Dekoration

CRM-Nutzer scannen, vergleichen und pflegen. Layouts sollen kompakt, vorhersehbar und ruhig sein. Animationen, Schatten, Gradients und grosse visuelle Akzente brauchen eine funktionale Begruendung.

## Karte als Orientierung

Die Karte beantwortet Standort-, Abdeckungs- und Verteilungsfragen. Sie soll nicht die Kontaktliste ersetzen. Detailinformationen auf der Karte bleiben kompakt und verlinken bei Bedarf ins Kontaktprofil.

## Auswertung als Entscheidungshilfe

Auswertung zeigt operative Fragen: Wo fehlen Kontakte? Welche Sektoren dominieren? Welche Datenqualitaet ist kritisch? Charts brauchen klare Labels, Legenden und Zahlen. Dekorative Visualisierung ohne Entscheidungskraft wird entfernt.

## Import als eigener Arbeitsbereich

Kontaktimport ist ein eigener Pflegebereich. Dateiimport, tabellarische Bulk-Anlage und Importhistorie werden unter `Importe` eingeordnet. Ein Import-Wizard darf aus diesem Bereich starten, aber der globale Kontaktbereich bleibt frei von permanenten Import-CTAs.

## Kontaktanlage

Einzelkontakt, Bulk-Anlage und Dateiimport sind unterschiedliche Arbeitsweisen:

1. Einzelkontakt: rechter Drawer `Neuen Kontakt anlegen`, nur Name als Pflichtfeld, optionale Details in Accordions.
2. Bulk-Anlage per Online-Tabelle: mehrere Kontakte direkt im Browser erfassen, feste Kontaktspalten, Validierung pro Zeile, gemeinsames Speichern.
3. Dateiimport: CSV/Excel hochladen, Mapping pruefen, Import starten.

Warnungen wie fehlende Organisation, fehlender Standort, fehlender Owner oder moegliche Dubletten helfen bei Datenqualitaet, blockieren aber keine validen Zeilen. Fehler wie fehlender Name oder ungueltige E-Mail blockieren nur die betroffene Zeile.
