# Hospitations-Framework: Einzelterminexport

Stand: 20.09.2026. Dieser Vertrag hält die abgestimmte Gestaltung und die
inhaltlichen Regeln für den Word- und PDF-Export einer Hospitation fest.

## Aufbau

- Titel „Hospitations-Framework“, Untertitel „Unknown Unknowns aus der Versorgung“
  und das vorhandene #Mitmachen-Logo.
- Ein kompakter Metadatenbereich: Termin, Organisation und weitere Angaben
  einmalig; Ziel und Kurzfassung stehen daneben.
- Jede Beobachtung beginnt mit einem farbigen Nummernfeld und ihrer Kurzfassung
  als Überschrift. Kein zusätzlicher vertikaler Balken.
- Uhrzeit, Quelle und Relevanz stehen als drei kleine Labels nebeneinander.
  Die dezente Uhrzeitbox steht direkt links neben der grünen Quelle.
  Die Relevanz verwendet fünf Punkte und bei vorhandener Bewertung den Wert
  von 1 bis 5. Ohne Bewertung bleiben fünf leere Punkte; kein Leerhinweis.
- Ein zusammenhängender Beobachtungstext enthält vorhandene Situations- und
  Zusatzangaben. Die drei Codefelder folgen in der Reihenfolge Prozessphase,
  Problemtyp, Auswirkung mit blauer, violetter und orangefarbener Zuordnung.
- Eine kompakte Codehilfe steht einmalig am Ende, mit denselben drei Spalten
  und einer schmalen Zeile für die Quellenarten.
- „Nächste Nutzung“ wird in dieser Dokumentart nicht ausgegeben. Gespeicherte
  Nutzungsangaben und die anderen Exportarten bleiben erhalten.

## Uhrzeit der Beobachtung

Jede Beobachtung erhält eine eigene Uhrzeitbox im Format `HH:MM Uhr`. Grundlage
ist `observedAt`; die bestehenden Aliasse `observed_at`, `observationTime` und
`observation_time` werden bei leerem Hauptfeld ebenfalls erkannt. Sekunden
werden ohne Rundung ausgeblendet. Der gespeicherte Wert bleibt unverändert.

Zeitangaben wie `9:14`, `09:14 Uhr` und `09:14:59` erscheinen als `09:14 Uhr`.
Ein ISO-Zeitstempel mit `Z` oder explizitem UTC-Offset wird wie die übrigen
Termindaten in `Europe/Berlin` dargestellt. Ohne Offset bleibt die dokumentierte
lokale Uhrzeit erhalten, unabhängig von der Zeitzone des ausführenden Rechners.

Bei fehlender, ungültiger oder ausschließlich als Datum erfasster Angabe steht
`Uhrzeit: -` in der Box. Weder Terminbeginn noch Exportzeitpunkt werden als
Beobachtungszeit eingesetzt. Die Regel gilt für alle künftigen Einzeltermin-
Frameworks in Word und PDF; die anderen Exportarten bleiben unverändert.

## Text und Quellen

Der exportierte Haupttext übernimmt Situation und Beschreibung aus der
gemeinsamen Textfunktion des Hospitationsmodells und bewahrt deren Absätze.
Auslöser, Handlungsschritte, unmittelbare Folge, Workaround und Rollen werden
ergänzt, soweit eine vollständige Aussage nicht bereits enthalten ist. Systeme,
Dokumente und Kommunikationskanäle werden als genannte Angaben aufgenommen; daraus wird weder eine tatsächliche Nutzung noch eine
Ursache abgeleitet. Bereits im Text enthaltene Begriffe werden nicht nochmals
aufgezählt. Ein vorhandener Quellenverweis erscheint in einer kleinen Zeile
„Quellenbezug“. Technische Erfassungskennungen sind kein Quellenbeleg.

Diese Aufbereitung verändert keine gespeicherten Felder. Sie ersetzt keine
fachliche Redaktion, Prüfung der Quelle oder Umcodierung.

## Codebuch 1.1 als Darstellungsvertrag

Der Einzelterminexport verwendet einen ausdrücklich versionierten, eingefrorenen
Katalog `1.1-erprobung`. Er enthält die abgestimmten Antwortmöglichkeiten und
Altwerte für Prozessphase, Problemtyp, Auswirkung und Quelle. Karten und Hilfe
verwenden dieselbe Beschriftungsfunktion.

Der versionierte Darstellungsvertrag liegt im Exportmodul und entspricht
dem führenden Modell-Codebuch 1.1.
Die Exporttests gleichen seine vier Dimensionen und historischen Werte mit
dem führenden Modell-Codebuch ab. Spätere Änderungen benötigen eine bewusste
Versionsentscheidung und Export-QA.
Die ausführlichen methodischen Definitionen gehören ins Codebuch, nicht in die
kleine Dokumenthilfe. „Erprobung“ bedeutet keine abgeschlossene Validierung.

- Aktuelle Werte und aktuelle sichtbare Bezeichnungen werden exakt erkannt.
- Bekannte Altwerte bleiben unverändert und erhalten `*`. Der Hinweis
  „Bisherige Codierung; unverändert übernommen“ erscheint einmal in der Hilfe.
- Andere Werte bleiben unverändert und erhalten `**` mit einem eigenen Hinweis
  „Außerhalb des Codebuchs 1.1; unverändert übernommen“.
- Groß-/Kleinschreibung ist fachlich relevant: Die bisherige „doppelte
  Dokumentation“ wird nicht zum neuen Wert „Doppelte Dokumentation“ umcodiert.
- Leere Werte bleiben leer. Insbesondere wird keine Quellenart erfunden und
  kein fehlender Relevanzwert als null von fünf ausgegeben.

## Erfassung, Herkunft und andere Exportarten

Der Export nutzt die integrierte Erfassungs- und Speicherlogik. Die ursprüngliche
Herkunft `originalEvidenceType: synthetic_source_based` bleibt in allen
Exportarten als synthetisches Beispiel sichtbar, auch wenn die aktuelle
Quellenwahl davon abweicht. Die bekannten Alias- und Payload-Felder bleiben
berücksichtigt. Kein Export verändert die gespeicherten Beobachtungen.

Gesamt- und Beobachtungsübersichten behalten ihre bestehende Darstellung,
Quellenbezüge und spätere Bewertung. Die kompakte Framework-Gestaltung gilt
ausschließlich für den Einzelterminexport.

## Ausfüllbare PDF-Vorlage

Im Bereich **Fragebogen** steht neben den bisherigen Word- und PDF-Vorlagen
der Download **Ausfüllbare PDF**. Er liefert das abgestimmte Hospitations-Framework
mit drei ausdrücklich fiktiven Beispielen und 39 editierbaren Feldern.
Die Datei enthält keine Daten des geöffneten Termins. Der persönliche
Einzelterminexport bleibt über dessen Word- und PDF-Schaltflächen erreichbar.

Die Vorlage enthält Freitextfelder, minutengenaue Uhrzeiten und Auswahllisten
für Codes, Quelle und Relevanz. Sie hat zwei feste Seiten und drei
Beobachtungsplätze; längere Texte erzeugen keine zusätzlichen Seiten.
Änderungen im heruntergeladenen Formular werden nicht in die Anwendung importiert.

Die unveränderte, visuell geprüfte AcroForm-Datei liegt unter
`public/hospitation/hospitations-framework-ausfuellbar.pdf`. Pages und das
geschützte Target einschließlich Google Hosting liefern dieselbe Vorlage aus.
Die Downloadprüfung weist ihre Formularfelder sowie das Speichern und erneute
Lesen geänderter Freitext- und Auswahlwerte nach.

Ein Exportadapter kann Informationen, die ein älterer Normalizer bereits
verworfen oder durch einen Standardwert ersetzt hat, nicht wiederherstellen.

## Prüfung

`npm run test:hospitation-export` prüft die Dokumentstruktur, Codebezeichnungen,
Altwerte, unbekannte und fehlende Werte, Quellenverweise, Zusammenführung ohne
Mutation, lange Inhalte und die Abgrenzung zu anderen Exportarten. Nach einer
sichtbaren Änderung beide Formate erzeugen, alle Seiten rendern und vollständig
auf Umbrüche, Kollisionen, Lesbarkeit und Vollständigkeit prüfen.

Für eine gemeinsame Integration zusätzlich Erstellen, Bearbeiten und Speichern
mit aktuellen sowie bisherigen Codes durch die tatsächliche Anwendung prüfen.
Eine geprüfte Exportdatei allein belegt diesen gesamten Ablauf nicht.
