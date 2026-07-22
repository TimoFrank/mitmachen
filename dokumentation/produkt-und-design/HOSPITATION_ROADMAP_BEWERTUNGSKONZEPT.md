# Konzept: Roadmap-Bewertung in Hospitationen

Stand: 01.07.2026

## Zielbild

Das Hospitations-Modul soll Versorgungskontakte nicht nur als Freitext dokumentieren, sondern als wiederholbare, auswertbare Evidenzquelle für die Bewertung der gematik-Roadmap nutzen. Die Bewertung soll zeigen, welche Produkte, Features oder Lücken aus Sicht verschiedener Nutzergruppen versorgungsrelevant, dringend, umsetzbar oder risikobehaftet sind.

Das Ziel ist nicht, gesetzliche Fristen oder Gesellschafterbeschlüsse durch Einzelmeinungen zu ersetzen. Das Ziel ist eine belastbare Argumentationsgrundlage für Roadmap-Diskussionen: Wo bestätigt die Versorgungspraxis die bestehende Priorisierung? Wo entsteht ein Spannungsfeld zwischen gesetzlicher Planung, technischer Roadmap und tatsächlichem Versorgungsbedarf? Wo werden Anforderungen sichtbar, die noch nicht sauber in ein Roadmap-Produkt passen?

## Ausgangslage

Die gematik beschreibt die OneRoadmap als zentrale, verbindliche Planungsgrundlage für Entwicklung und Einführung von Produkten und Lösungen der Telematikinfrastruktur. Sie wird quartalsweise fortgeschrieben und zeigt Funktionsumfänge, Release-Zeitpunkte und Produktentwicklungsphasen.

Für Q2/2026 liegt die Roadmap mit Datenstand 27.05.2026 vor. Die Übersicht enthält unter anderem:

- Anwendungen der TI: ePA, E-Rezept, MyHealth@EU, TI-Messenger, KIM, VSDM, Digitale Patientenrechnung.
- Basisinfrastruktur: Identitätsmanagement, Verzeichnisdienst, TI-Zugang, Smartcards/PoPP, Zero Trust Infrastructure.
- Technische Standards und Daten: ISiK, HDDT, ZTS, Identitätenherausgabe.
- Neue Nutzergruppen: Kostenträger- und Leistungserbringergruppen mit gesetzlichen Anschlusspflichten.

Die Filterversion der Roadmap enthält eine auswertbare Matrix mit Produkt/Initiative, aktueller Phase, Bezug zu Primärsystemen, Versicherten-Frontends, Monatsmeilensteinen, Ampelstatus, Nutzergruppen und Detailtexten. Diese Struktur eignet sich als Grundlage für einen Roadmap-Katalog im CRM.

Quellen:

- gematik Fachportal: https://fachportal.gematik.de/telematikinfrastruktur/roadmap
- OneRoadmap Q2/2026 PDF: https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_UEbersicht.pdf
- OneRoadmap Q2/2026 XLSX: https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx

## Governance und Fristen

Die Roadmap ist politisch und rechtlich vorgeprägt. Eine Bewertung aus der Versorgung kann deshalb nicht einfach eine Sortierung nach Beliebtheit sein.

Wichtige rechtliche Bezugspunkte:

- § 310 SGB V regelt die Gesellschaft für Telematik und die Geschäftsanteile. Der Bund, vertreten durch das BMG, hält 51 Prozent. Der GKV-Spitzenverband hält 24,5 Prozent. Die weiteren Spitzenorganisationen halten 24,5 Prozent.
- § 311 SGB V beschreibt Aufgaben der Gesellschaft für Telematik, insbesondere Vorgaben, Betrieb, Zulassung, Sicherheit und Weiterentwicklung der TI.
- § 312 SGB V enthält Aufträge an die gematik, unter anderem zu elektronischen Verordnungen, TI-Messenger, eMP und weiteren Umsetzungsschritten.
- § 291b SGB V enthält Vorgaben zum Online-Verfahren zur Nutzung der elektronischen Gesundheitskarte als Versicherungsnachweis.
- § 342 SGB V enthält Vorgaben zur ePA, unter anderem zur Bereitstellung und zu weiteren technischen Anforderungen.
- § 360 SGB V enthält Vorgaben zur elektronischen Übermittlung und Verarbeitung vertragsärztlicher Verordnungen, darunter Arzneimittel, Betäubungsmittel, häusliche Krankenpflege, Soziotherapie, Heilmittel und Hilfsmittel.

Zusätzlich wirken europäische Vorgaben, insbesondere der European Health Data Space. Die EHDS-Umsetzung setzt Fristen für grenzüberschreitende Datenkategorien, unter anderem Patient Summary und ePrescription/eDispensation ab 2029 sowie Laboratory Results, Discharge Reports und Imaging ab 2031.

Quellen:

- § 310 SGB V: https://www.gesetze-im-internet.de/sgb_5/__310.html
- § 311 SGB V: https://www.gesetze-im-internet.de/sgb_5/__311.html
- § 312 SGB V: https://www.gesetze-im-internet.de/sgb_5/__312.html
- § 291b SGB V: https://www.gesetze-im-internet.de/sgb_5/__291b.html
- § 342 SGB V: https://www.gesetze-im-internet.de/sgb_5/__342.html
- § 360 SGB V: https://www.gesetze-im-internet.de/sgb_5/__360.html
- EHDS: https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en

## Leitfrage

Die zentrale Auswertungsfrage lautet:

> Welche Roadmap-Produkte, Features oder neuen Anforderungen werden von welchen Nutzergruppen als versorgungsrelevant, dringend, umsetzbar und begründbar prioritär bewertet?

Daraus ergeben sich vier Unterfragen:

1. Welche Roadmap-Items haben aus Sicht einer konkreten Rolle hohen Versorgungseffekt?
2. Welche Roadmap-Items wirken im Alltag zwar relevant, sind aber in ihrer Einführung riskant oder aktuell schlecht umsetzbar?
3. Welche gesetzlich oder technisch priorisierten Items werden in der Versorgung als weniger dringlich erlebt?
4. Welche wiederkehrenden Anforderungen fehlen in der Roadmap oder sind nur indirekt in Backlog-Themen sichtbar?

## Nutzerperspektiven

Die Roadmap muss rollenbezogen bewertet werden. Ein einheitlicher Score für alle Nutzergruppen wäre methodisch schwach, weil Nutzen, Aufwand und Risiko je Rolle unterschiedlich verteilt sind.

Relevante Perspektiven:

- Vertragsärztinnen und Vertragsärzte: Praxisworkflow, Dokumentationsaufwand, Primärsystemintegration, Haftungs- und Verordnungssicherheit, Medikationssicherheit, Übergaben.
- Apotheken: Rezeptannahme, Abgabeprozess, BTM-Dokumentation, Korrekturen, Kommunikation mit Praxen und Kostenträgern.
- Pflegefachkräfte und Pflegedienste: mobile Versorgung, HKP-/AKI-Verordnungen, Kommunikationswege, Nachweise, Schnittstellen zu Ärzten und Kassen.
- Versicherte und Patientinnen/Patienten: Verständlichkeit, Zugang, Kontrolle, Nutzbarkeit der ePA-App, Rezept- und Rechnungsprozesse, Vertrauen.
- Krankenhäuser: Entlassmanagement, Laborbefunde, ISiK, ePA-Befüllung, Überleitungen.
- Kostenträger: Prüf- und Genehmigungsprozesse, Datenqualität, digitale Rechnungs- und Verordnungsprozesse.
- Hersteller/Primärsysteme: technische Machbarkeit, Spezifikationsreife, Testbarkeit, Migrationsaufwand.

## Theoretischer Rahmen

Die Bewertung sollte als Mixed-Methods-Design mit Multi-Criteria Decision Analysis verstanden werden. Drei Theorieanker sind besonders geeignet:

### Technology Acceptance Model und UTAUT

TAM und UTAUT helfen, Akzeptanz und Nutzungsabsicht zu erfassen. Für das Hospitations-Modul sind vor allem folgende Konstrukte relevant:

- wahrgenommener Nutzen
- wahrgenommene Einfachheit
- erwartete Leistungsverbesserung
- erwarteter Aufwand
- soziale und organisatorische Einbettung
- unterstützende Rahmenbedingungen

Quellen:

- Davis, F. D. (1989): Perceived Usefulness, Perceived Ease of Use, and User Acceptance of Information Technology. https://www.jstor.org/stable/249008
- UTAUT-Übersicht: https://open.ncl.ac.uk/theories/2/unified-theory-of-acceptance-and-use-of-technology/

### NASSS Framework

NASSS ist für Gesundheits- und Versorgungstechnologien besonders passend, weil es nicht nur Akzeptanz, sondern auch Nicht-Adoption, Abbruch, Skalierung, Verbreitung und Nachhaltigkeit betrachtet. Für Roadmap-Diskussionen ist das wichtig, weil ein Produkt fachlich sinnvoll sein kann, aber an Komplexität, organisatorischer Einbettung oder Systemabhengigkeiten scheitert.

Quelle:

- Greenhalgh et al. (2017): Beyond Adoption: NASSS Framework. https://www.jmir.org/2017/11/e367/

### Multi-Criteria Decision Analysis und Best-Worst Scaling

MCDA eignet sich, um unterschiedliche Bewertungskriterien transparent gegeneinander abzuwiegen. Best-Worst Scaling oder MaxDiff ist sinnvoll, wenn mehrere Roadmap-Items priorisiert werden sollen. Es zwingt Befragte zu relativen Entscheidungen und reduziert das Problem, dass in 5er-Skalen fast alles als wichtig bewertet wird.

Quelle:

- Best-Worst Scaling in Health. https://pmc.ncbi.nlm.nih.gov/articles/PMC9363399/

## Bewertungsdimensionen

Die Bewertung sollte nicht nur "Wie wichtig ist das?" fragen. Wichtigkeit alleine erzeugt wenig Priorisierungsqualität.

Empfohlene Dimensionen:

1. Versorgungsnutzen
   - Beitrag zu Patientensicherheit, Behandlungsqualität, Therapieentscheidung, Medikationssicherheit oder Versorgungskontinuität.

2. Prozessentlastung
   - Reduktion von Medienbrüchen, Papier, Doppelarbeit, Nachtelefonieren, manueller Datenerfassung oder unklaren Übergaben.

3. Dringlichkeit
   - Risiko oder Nachteil, wenn das Item später kommt oder in der Roadmap weniger Aufmerksamkeit erhält.

4. Umsetzbarkeit
   - Einschätzung, ob Einführung, Schulung, Primärsysteme, Infrastruktur und Support unter realen Bedingungen realistisch sind.

5. Akzeptanz und Nutzungswahrscheinlichkeit
   - Wahrscheinlichkeit, dass die Nutzergruppe das Produkt freiwillig oder im Pflichtkontext tatsächlich sinnvoll nutzt.

6. Vertrauen und Sicherheitswahrnehmung
   - Datenschutz, Datensicherheit, Nachvollziehbarkeit, Verantwortlichkeit und Fehlerrisiko.

7. Abhängigkeiten und Reifegrad
   - Roadmap-Phase, gesetzliche Frist, EHDS-Frist, Primärsystem-Abhängigkeit, Spezifikationsreife.

8. Evidenzqualität
   - Wie sicher ist die Einschätzung? Ein Einzelinterview ist anders zu gewichten als ein wiederkehrendes Muster über mehrere Sektoren.

## Erhebungsformat

Die beste Lösung ist ein gestuftes Design:

### 1. Hospitation als Kontextquelle

Während oder direkt nach einer Hospitation wird der konkrete Versorgungskontext dokumentiert:

- Rolle der befragten Person
- Sektor und Einrichtungstyp
- beobachteter Prozess
- betroffene Patientengruppe
- betroffene Anwendungen oder Roadmap-Items
- konkrete Reibungspunkte
- Zitate oder Beobachtungsnotizen

Diese Informationen sind qualitativ und erklären später, warum ein Score hoch oder niedrig ist.

### 2. Strukturierte Kurzbewertung

Direkt nach dem Gespräch werden die passenden Roadmap-Items bewertet. Nicht alle Items sollen immer abgefragt werden. Die Auswahl muss kontextsensitiv sein:

- Bei Praxis/Arzt: ePA, eRp, VSDM, KIM, TI-M, PoPP, eID-LE, ISiK je nach Anlass.
- Bei Apotheke: eRp, BTM, T-Rezepte, PoPP, KIM.
- Bei Pflege: HKP/AKI, TI-M, PoPP, eID-LE, KIM, mobile TI-Zugänge.
- Bei Patient: ePA, Medikationsplan, Push-Notifications, ZETA, GesundheitsID, DiPag.

### 3. Relative Priorisierung

Wenn mindestens drei Items relevant sind, sollte eine Best-Worst-Frage gestellt werden:

- "Welches dieser Themen hätte für Ihre Versorgung den größten Nutzen?"
- "Welches dieser Themen wäre im Vergleich am wenigsten dringlich?"

Alternativ kann eine einfache Top-3-Priorisierung genutzt werden, wenn das Interview kurz bleiben muss.

### 4. Neue Anforderungen

Nicht passende Anforderungen werden separat erfasst:

- Titel der Anforderung
- Problem, das gelöst werden soll
- betroffene Rolle
- bestehender Workaround
- potenziell passendes Roadmap-Produkt
- Bewertung, ob es Erweiterung, Backlog-Thema, gesetzlicher Klärungsbedarf oder lokales Implementierungsproblem ist

### 5. Validierung

Wiederkehrende Muster sollten in Gruppendiskussionen oder Expertenrunden validiert werden, bevor daraus Roadmap-Argumente entstehen. Eine Einzelhospitation liefert Hypothesen, mehrere konsistente Kontakte liefern Evidenz.

## Skalen und Frageform

5-Punkt-Skalen sind geeignet, wenn sie klar verankert sind und immer eine Option "nicht beurteilbar" vorhanden ist. Die Fragen sollten als Aussagen formuliert werden, weil das konsistenter und schneller beantwortbar ist.

Empfohlene Antwortskala:

1. stimme gar nicht zu
2. stimme eher nicht zu
3. teils/teils
4. stimme eher zu
5. stimme voll zu
N/A. kann ich nicht beurteilen

Beispielitems:

- "Diese Funktion würde in meinem Versorgungsalltag einen relevanten Beitrag zur Patientensicherheit leisten."
- "Diese Funktion würde Medienbrüche oder doppelte Dokumentation reduzieren."
- "Wenn diese Funktion später kommt, entsteht in unserem Prozess ein spürbarer Versorgungs- oder Koordinationsnachteil."
- "Die Einführung ist mit den heute verfügbaren Systemen und Abläufen realistisch umsetzbar."
- "Ich würde diese Funktion im Alltag regelmäßig nutzen oder aktiv einfordern."
- "Die Verantwortlichkeiten und Datenschutzfolgen dieser Funktion wären für mich nachvollziehbar."

Nicht geeignet wären sehr allgemeine Fragen wie "Wie wichtig ist ePA?" oder "Sollte die gematik das priorisieren?". Solche Fragen vermischen Nutzen, Frust, politische Haltung und technische Umsetzung.

## Scorelogik

Ein pragmatischer Auswertungsscore kann so aufgebaut werden:

- Versorgungswert = Durchschnitt aus Versorgungsnutzen, Prozessentlastung und Patientensicherheit.
- Dringlichkeit = direkte Dringlichkeitsskala plus Risiko bei Verzögerung.
- Umsetzungsrisiko = invertierte Umsetzbarkeit plus Einführungsaufwand.
- Akzeptanz = Nutzungswahrscheinlichkeit plus Vertrauen.
- Prioritätsindikator = hoher Versorgungswert + hohe Dringlichkeit + akzeptables Umsetzungsrisiko.

Wichtig: Der Score ist kein Automatismus. Er ist ein Sortier- und Diskussionssignal. Für Roadmap-Argumente sollten immer qualitative Belege und Fristkontext danebenstehen.

## Umgang mit gesetzlichen Fristen

Bei jedem Roadmap-Item sollte sichtbar sein:

- keine erkennbare gesetzliche Frist
- SGB-V-Frist
- EHDS-Frist
- Gesellschafter-/Roadmap-Plandatum
- technische Abhängigkeit oder Drittanbieterabhängigkeit

Damit lassen sich vier Fälle unterscheiden:

1. Hohe Versorgungsrelevanz und harte Frist
   - starkes Argument für Absicherung, Erprobung, Kommunikation und Umsetzungsunterstützung.

2. Hohe Versorgungsrelevanz ohne harte Frist
   - starkes Argument für Re-Priorisierung oder Aufnahme in Discovery.

3. Niedrige Versorgungsrelevanz, aber harte Frist
   - Argument für bessere Nutzenkommunikation, Pilotierung oder Entlastungsmassnahmen, nicht zwingend für Streichung.

4. Hohe Relevanz, aber geringe Umsetzbarkeit
   - Argument für Vorarbeiten, Abhängigkeiten, Primärsystemintegration und stufenweise Einführung.

## Umgang mit neuen Anforderungen

Neue Anforderungen sollen nicht in bestehende Roadmap-Items hineingezwungen werden. Sie brauchen eine eigene Kategorie.

Beispiele:

- Digitaler Impfpass: in der Q2/2026-Filterversion als ePA-Backlog-Thema "Impfpass (FHIR)" sichtbar. Die Bewertung sollte klären, ob das aus Versorgungssicht ein Randthema, ein dringender ePA-Inhalt oder eine eigene Kommunikations- und Erinnerungsfunktion ist.
- Elektronische Verordnung von Hilfsmitteln: in § 360 SGB V als Verpflichtungskontext angelegt und in Roadmap/Backlog-Texten erkennbar. Die Bewertung sollte unterscheiden, ob es um das reine Verordnen, Kostenträgerprozesse, Sanitätshausanbindung, Lieferstatus oder Patiententransparenz geht.

Klassifikation neuer Anforderungen:

- Erweiterung eines bestehenden Roadmap-Items
- eigenes Roadmap-/Backlog-Thema
- gesetzlicher Klärungsbedarf
- organisatorischer Implementierungsbedarf
- lokales Software-/Primärsystemproblem
- Kommunikations- oder Schulungsbedarf

## Wissenschaftliche Gütekriterien

Eine adäquate Bewertung sollte folgende Kriterien erfüllen:

- Transparente Stichprobe: Rolle, Sektor, Region, Einrichtungstyp, Erfahrung und Kontext werden dokumentiert.
- Kontextbindung: Bewertung wird an einen konkreten beobachteten Prozess gekoppelt.
- Standardisierte Skalen: gleiche Items, gleiche Antwortanker, N/A-Option.
- Qualitative Begründung: Scores werden mit Beobachtungen und Zitaten erklärt.
- Triangulation: Hospitation, Interview, Gruppendiskussion und ggf. Online-Umfrage werden kombiniert.
- Rollengetrennte Auswertung: keine ungewichtete Gesamtrangliste über ungleiche Nutzergruppen.
- Versionierung: Roadmap-Version und Datenstand werden gespeichert.
- Evidenzgewichtung: Einzelbefund, wiederkehrendes Muster und validierter Befund werden getrennt.
- Datenschutz: keine sensiblen Patientendaten, keine identifizierenden Fallinformationen.

## Umsetzung im Hospitations-Modul

### Datenobjekte

Empfohlen werden eigene Tabellen:

1. `roadmap_items`
   - Katalog der bewertbaren Roadmap-Produkte und Features.
   - Enthält Produktgruppe, Produkt, Feature, Roadmap-Version, Phase, Zeitraum, Fristtyp, Rechtsgrundlage, Zielgruppen und Quelle.

2. `hospitation_roadmap_assessments`
   - Bewertung eines Roadmap-Items im Kontext einer Hospitation.
   - Enthält Skalenwerte, Prioritätsrang, Best-Worst-Markierung, Freitextbegründung und Rollen-/Sektorkontext.

3. `hospitation_unmet_needs`
   - Neue Anforderungen oder Lücken, die nicht sauber in ein Roadmap-Item passen.
   - Enthält Bedarf, Problem, Workaround, erwarteten Nutzen, Dringlichkeit, potenziellen Roadmap-Bezug und Klassifikation.

Optional später:

4. `roadmap_pairwise_choices`
   - Für echte Best-Worst- oder Paarvergleichsdesigns mit Sets und Auswahlentscheidungen.

### UI im Dokumentationsformular

Das Dokumentationsformular sollte drei Abschnitte enthalten:

1. Beobachtung
   - bereits vorhandene Dokumentationsfelder bleiben erhalten.

2. Roadmap-Bewertung
   - Auswahl eines oder mehrerer Roadmap-Items.
   - Kompakte 5er-Skalen je Item.
   - Feld für Begründung.
   - Option "wichtigstes Item" und "am wenigsten dringlich".

3. Neue Anforderungen
   - Titel, Problem, betroffene Rolle, potenzieller Roadmap-Bezug, Dringlichkeit, Umsetzbarkeit, Freitext.

### Dashboard

Das Dashboard sollte nicht nur Anzahl der Hospitationen zeigen, sondern:

- Top Roadmap-Items nach Versorgungswert.
- Items mit hoher Dringlichkeit und später Roadmap-Phase.
- Items mit hoher Relevanz, aber geringer Umsetzbarkeit.
- Neue Anforderungen nach Häufigkeit und Sektor.
- Rollenvergleich: Arzt, Apotheke, Pflege, Versicherte, Kostenträger.
- Evidenzstatus: Einzelhinweis, wiederkehrendes Muster, validiert.

### Auswertungslogik

Minimal brauchbare Auswertungen:

- Durchschnittswerte je Roadmap-Item und Rolle.
- Anzahl Bewertungen je Item.
- Anzahl N/A-Werte je Item als Hinweis auf fehlende Beurteilbarkeit.
- Best-Worst-Saldo: Anzahl "wichtigstes Item" minus Anzahl "am wenigsten dringlich".
- Liste neuer Anforderungen mit betroffenen Sektoren und Wiederholungen.

## Roadmap für die Umsetzung

### Stufe 1: Struktur erfassen

- Tabellen für Roadmap-Items, Bewertungen und neue Anforderungen anlegen.
- Ausgewählte Q2/2026-Roadmap-Items als initialen Katalog seed-en.
- Dokumentationsformular um Roadmap-Bewertung und neue Anforderungen ergänzen.

### Stufe 2: Auswertung sichtbar machen

- Dashboard-Kennzahlen aus den neuen Tabellen berechnen.
- Detailansicht einer Hospitation zeigt Roadmap-Bewertungen und unmet needs.
- Filter nach Rolle, Sektor, Roadmap-Produkt und Fristtyp.

### Stufe 3: Wissenschaftliche Verfeinerung

- Best-Worst-Sets systematisch generieren.
- Export für Auswertung in R, Python oder Tabellenkalkulation.
- Pretest mit 5-10 Hospitationen.
- Itemformulierungen nach Pretest schärfen.

### Stufe 4: Roadmap-Argumentation

- Quartalsbericht je Roadmap-Version.
- Evidenzmatrix: Roadmap-Item x Nutzergruppe x Versorgungswert x Dringlichkeit x Umsetzbarkeit.
- Kurzsteckbriefe für Re-Priorisierungsvorschläge.

## Grenzen

Die Bewertung ist kein Ersatz für gesetzliche Planung, technische Spezifikation oder formale Gesellschafterentscheidungen. Sie ist auch keine repräsentative Befragung, solange die Stichprobe aus Hospitationen entsteht. Ihre Stärke liegt in der Verbindung aus realem Versorgungskontext, strukturierter Bewertung und wiederholbarer Dokumentation.

Gerade deshalb ist das Hospitations-Modul ein guter Ort für diese Logik: Es verbindet konkreten Kontakt, Rolle, Organisation, Datum, Beobachtung und Bewertung. Aus Freitext wird damit keine scheinbare Objektivität, sondern eine nachvollziehbare Evidenzspur.
