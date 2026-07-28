# Versorgungskompass: Datenschutz- und Einwilligungsmanagement

**Juristische Recherche und umsetzungsorientierte Entscheidungsvorlage**

**Stand:** 27. Juli 2026

**Status:** Nicht freigegebener Arbeits- und Prüfstand für Fachbereich, Legal und Datenschutzbeauftragte:n

> **Prüfhinweis:** Die Ausarbeitung dokumentiert eine Arbeitshypothese und ersetzt weder die organisationsinterne Aufgaben- und Erforderlichkeitsprüfung noch eine rechtliche Freigabe. Zeitabhängige Ist-Befunde, Rechtsgrundlagen, Empfänger, Fristen und Systemgrenzen sind vor einer Entscheidung erneut zu verifizieren.

**Konkrete Umsetzung:** [Copy-ready Datenschutzerklärung, Formularspezifikation, Double-Opt-in und Zugriffsmatrix](VERSORGUNGSKOMPASS_UMSETZUNGSPLAN_DATENSCHUTZ.md)

> **Kurz vorweg:** Der Betrieb eines internen CRM für das Versorgungsnetzwerk ist nach der hier geprüften Sachlage grundsätzlich DSGVO-konform gestaltbar. Er sollte nicht von einer pauschalen Einwilligung abhängig gemacht werden. Für die gematik spricht viel dafür, die operative Kontakt- und Beziehungsverwaltung primär auf Art. 6 Abs. 1 lit. e DSGVO in Verbindung mit § 3 BDSG und einer konkret dokumentierten Aufgabe aus § 311 SGB V zu stützen. Ergänzend braucht es eine gesonderte freiwillige Einwilligung für weitergehende E-Mail-Einladungen und einen transparenten, minimierten Prozess für beruflich-öffentliche Quellen. Der unmittelbarste Korrekturbedarf liegt im aktuellen Formular: Die dort technisch zwingende #Mitmachen-Einwilligung widerspricht der Datenschutzerklärung, die sie als freiwillig und nicht formularnotwendig beschreibt.

## 1. Ergebnis in zehn Punkten

1. **CRM ist kein eigener Erlaubnistatbestand und auch kein Verbotsgrund.** Rechtlich entscheidend sind die einzelnen Zwecke und Datenoperationen, nicht die Bezeichnung „CRM“ oder „Versorgungskompass“. Für den aufgabengebundenen Versorgungskompass ist voraussichtlich Art. 6 Abs. 1 lit. e DSGVO in Verbindung mit § 3 BDSG und einer konkret benannten Aufgabe aus § 311 SGB V das stärkste Fundament. Art. 6 Abs. 1 lit. b kann konkrete, von der Person angefragte Vorgänge tragen; lit. f bleibt für klar nicht-öffentliche beziehungsweise wettbewerbliche Tätigkeiten zu prüfen. Eine Einwilligung ist für das Kern-CRM nicht automatisch erforderlich. [Art. 5 und 6 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679), [§ 3 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__3.html), [§ 311 SGB V](https://www.gesetze-im-internet.de/sgb_5/__311.html)

2. **Berufliche und öffentliche Angaben bleiben personenbezogen.** Name, dienstliche E-Mail-Adresse, Praxisanschrift, Rolle, öffentliches Profil und Kontaktverlauf beziehen sich weiterhin auf natürliche Personen. Die berufliche Öffentlichkeit ist aber ein wichtiges Abwägungskriterium: Bei funktionsbezogenen, wenig eingriffsintensiven Angaben, einem bestehenden Kontakt und einem eng verwandten Zweck sprechen vernünftige Erwartungen deutlich eher für die Zulässigkeit als bei privaten, sensiblen oder überraschend zusammengeführten Angaben. Erwägungsgrund 14 nimmt nur Daten rein juristischer Personen aus, nicht automatisch deren natürliche Ansprechpartner:innen. [DSGVO, Erwägungsgründe 14 und 47](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

3. **Das bestehende Formular enthält bereits eine brauchbare Zwecktrennung.** Die gematik-Datenschutzerklärung unterscheidet die Bearbeitung eines Hospitationsangebots von weitergehenden #Mitmachen-E-Mails. Genau diese Architektur sollte beibehalten und technisch sauber umgesetzt werden. Das BayLDA weist ausdrücklich darauf hin, dass ein Kontaktformular grundsätzlich keine Einwilligung benötigt und nur tatsächlich notwendige Angaben Pflichtfelder sein sollten. [Aktuelle Datenschutzerklärung der gematik](https://www.gematik.de/datenschutz), [BayLDA, 8. Tätigkeitsbericht, S. 56–57](https://lda.bayern.de/media/baylda_report_08.pdf)

4. **Die Checkbox war im technischen Ist-Befund vom 27. Juli 2026 nicht optional; die Freiwilligkeit war damit angreifbar.** Zu diesem Prüfzeitpunkt war die #Mitmachen-Checkbox im Live-Formular mit `required="required"` versehen. Ohne sie konnte das Hospitationsangebot nicht regulär abgesendet werden. Die Datenschutzerklärung erklärte dieselbe Einwilligung dagegen als freiwillig und als keine Voraussetzung für das Formular. Das war ein konkreter Transparenz- und Kopplungsmangel; Art. 7 Abs. 4 DSGVO und die EDPB-Hinweise verlangen eine echte Wahl. Der Live-Zustand muss vor Umsetzung erneut geprüft werden. [Formular Versorgungsnetzwerk](https://www.gematik.de/mitmachen/versorgungs-netzwerk), [Art. 7 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679), [EDPB-Zusammenfassung zur Einwilligung, Mai 2026](https://www.edpb.europa.eu/system/files/2026-04/edpb-summary-consent_en.pdf)

5. **Double-Opt-in ist kein allgemeines Formerfordernis der DSGVO.** Erforderlich sind eine freiwillige, informierte, bestimmte und unmissverständliche Einwilligung sowie deren Nachweis. Für elektronisch erklärte Werbeeinwilligungen bezeichnet die DSK Double-Opt-in zur Verifikation als „geboten“; der BGH hält es für E-Mail-Einwilligungen zur Beweiserleichterung geeignet und verlangt die vollständige Dokumentation der konkreten Erklärung. Das ist ein starkes Nachweisgebot, aber kein Grund, auch die bloße Registrierung oder das Kern-CRM von DOI abhängig zu machen. [BGH, Urteil vom 10.02.2011 – I ZR 164/09](https://juris.bundesgerichtshof.de/cgi-bin/bgh_notp/document.py?Art=en&Datum=2011-2&Gericht=bgh&Sort=1024&anz=294&pos=30), [DSK-Orientierungshilfe Direktwerbung, S. 11–12](https://www.datenschutzkonferenz-online.de/media/oh/OH-Werbung_Februar%202022_final.pdf)

6. **E-Mail-Recht und CRM-Speicherung sind auseinanderzuhalten.** Eine Person kann der weitergehenden E-Mail-Kommunikation widersprechen oder eine Einwilligung widerrufen, ohne dass deshalb jede rechtmäßig geführte operative Kontaktdokumentation gelöscht werden muss. Umgekehrt berechtigt eine zulässige interne Speicherung nicht automatisch zum Versand beliebiger Einladungen. Für Werbung per elektronischer Post verlangt § 7 Abs. 2 Nr. 2 UWG grundsätzlich eine vorherige ausdrückliche Einwilligung – auch im B2B-Bereich; ob jede einzelne #Mitmachen-Nachricht bereits Werbung beziehungsweise eine geschäftliche Handlung ist, hängt von Inhalt und Kontext ab. Für weitergehende Serien- und Format-Einladungen ist deshalb die Einwilligungslösung die belastbarste Linie. [§ 7 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html), [DSK-Orientierungshilfe Direktwerbung](https://www.datenschutzkonferenz-online.de/media/oh/OH-Werbung_Februar%202022_final.pdf)

7. **Öffentliche Berufsquellen dürfen nicht unterschiedslos kopiert werden.** Eine gezielte Ergänzung um Funktion, Einrichtung, Praxisanschrift, Sektor und unmittelbar relevante Fachthemen ist auf der dokumentierten Aufgabenbasis beziehungsweise – außerhalb davon – nach einer Interessenabwägung grundsätzlich vertretbar, sofern Art. 14 DSGVO erfüllt, die Quelle dokumentiert und eine einfache Widerspruchsmöglichkeit angeboten wird. „Im Internet auffindbar“ ist jedoch keine eigene Rechtsgrundlage. Das BVerwG verneinte 2025 bei aus Verzeichnissen gewonnenen Zahnarztkontakten die Nutzung für sachfremde Telefonwerbung; die Veröffentlichung diente dort der Erreichbarkeit für Patient:innen, nicht dem beworbenen Zweck oder Kanal. [Art. 14 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679), [BVerwG, Urteil vom 29.01.2025 – 6 C 3.23](https://www.bverwg.de/de/290125U6C3.23.0)

8. **Notizen sind zulässig, wenn sie professionell geführt werden.** Gesprächsergebnisse, Interessen an gematik-Formaten, vereinbarte Folgeschritte und Teilnahmehistorien können für ein funktionierendes Netzwerk erforderlich sein. Nicht in das CRM gehören Patientendaten, Gesundheitsangaben über Ansprechpartner:innen, politische oder private Informationen, Gerüchte, abwertende Wertungen und nicht nachvollziehbare Scores. Art. 5 DSGVO verlangt Zweckbindung, Datenminimierung, Richtigkeit und begrenzte Speicherung. [Art. 5 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

9. **Profilbilder sind möglich, aber nicht notwendig für den Start.** Ein normales Foto ist personenbezogen, wird aber erst bei besonderer technischer Verarbeitung zur eindeutigen Identifizierung zu einer besonderen Kategorie biometrischer Daten. Unabhängig von der DSGVO ist das Kopieren eines fremden Fotos eine urheberrechtliche Vervielfältigung; die bloße Auffindbarkeit auf einer Website oder in Google Maps ist keine Nutzungslizenz. Deshalb: Initialen als Standard, Foto nur aus freigegebener Quelle oder mit dokumentierter Berechtigung, kein Face Matching. [EDPB: Grundlagen des Datenschutzes](https://www.edpb.europa.eu/sme/learn-the-basics/data-protection-basics_en), [§ 16 UrhG](https://www.gesetze-im-internet.de/urhg/__16.html), [§ 22 KunstUrhG](https://www.gesetze-im-internet.de/kunsturhg/__22.html)

10. **Empfehlung: Go mit klaren Leitplanken.** Vor dem Regelbetrieb sollten Formular, Datenschutzhinweis, Verzeichnis der Verarbeitungstätigkeiten, Aufgaben-/Erforderlichkeitsprüfung, gegebenenfalls Interessenabwägung, Löschkonzept, Rollenrechte sowie Notiz- und Fotoregeln konsistent gemacht werden. Eine kurze dokumentierte DSFA-Schwellenprüfung ist sinnvoll; ein normales B2B-/Stakeholder-CRM ohne Patientendaten, großskalige sensible Daten, systematische Überwachung oder Entscheidungen mit erheblicher Wirkung löst nicht allein wegen der Bezeichnung CRM zwingend eine vollständige Datenschutz-Folgenabschätzung aus. [Art. 35 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679), [DSK-Muss-Liste zur DSFA](https://www.datenschutzkonferenz-online.de/media/ah/20181017_ah_DSK_DSFA_Muss-Liste_Version_1.1_Deutsch.pdf)

## 2. Auftrag, Methode und Grenzen

### 2.1 Geprüfte Fragen

Die Recherche untersucht:

- welche Rechtsgrundlagen die heutige Registrierung und die spätere CRM-Verarbeitung tragen können;
- ob Single- oder Double-Opt-in erforderlich ist;
- wie mit zusätzlich erfassten Notizen, Terminen, Einladungen, Teilnahmeinformationen, öffentlichen Berufsangaben und Profilbildern umzugehen ist;
- welche Informations-, Nachweis-, Lösch-, Sicherheits- und Governance-Pflichten entstehen;
- wie vergleichbare Organisationen CRM- und Stakeholderdaten rechtlich strukturieren;
- wie eine lösungsorientierte Vorlage für das Gespräch mit der beziehungsweise dem Datenschutzbeauftragten aussehen kann.

### 2.2 Quellen- und Prüfmethodik

Die Untersuchung beruht auf:

1. einer technischen und inhaltlichen Live-Prüfung des gematik-Formulars und der gematik-Datenschutzerklärung am 27. Juli 2026;
2. dem Ziel-Datenmodell und den Einwilligungsfeldern im lokalen Versorgungskompass-Konzept, insbesondere [DATA_MODEL.md](../architektur/DATA_MODEL.md) und [FELDENTSCHEIDUNGSMATRIX_KONTAKTE_ORGANISATIONEN.md](../architektur/FELDENTSCHEIDUNGSMATRIX_KONTAKTE_ORGANISATIONEN.md);
3. DSGVO, UWG, SGB V, UrhG und KunstUrhG als Primärrecht;
4. Rechtsprechung des EuGH und BGH;
5. Orientierungshilfen von EDPB, DSK, BfDI und BayLDA;
6. ausgewählten Datenschutzhinweisen vergleichbarer CRM-/Stakeholder-Verarbeitungen.

Es wurde keine Testregistrierung abgesendet, weil dies personenbezogene Testdaten und eine externe Folgeverarbeitung ausgelöst hätte. Nicht geprüft werden konnten daher das Empfängerpostfach, die Powermail- beziehungsweise TYPO3-Backend-Speicherung, eine etwaige nachgelagerte Bestätigungsmail, tatsächliche Protokolle, bestehende Auftragsverarbeitungsverträge, internationale Transfers, aktuelle Berechtigungen sowie die Qualität realer CRM-Notizen. Aussagen zum Ist-System sind insoweit auf den öffentlich sichtbaren Stand und das lokale Zielmodell beschränkt.

## 3. Tatsächlicher Ist-Befund

### 3.1 Formular und Technik

Die im Auftrag genannte URL ohne Bindestrich (`/versorgungsnetzwerk`) endet derzeit nach Weiterleitung auf einer 404-Seite. Die aktive Seite ist [gematik.de/mitmachen/versorgungs-netzwerk](https://www.gematik.de/mitmachen/versorgungs-netzwerk).

Die Seite wirbt um Einrichtungen, die Hospitationen ermöglichen können. Sie beschreibt ausdrücklich eine langfristige Kontaktpflege, eine bedarfsabhängige Auswahl und das Ziel, unterschiedliche Versorgungssituationen abzubilden. Damit ist ein dauerhaftes, strukturiertes Kontaktmanagement dem erkennbaren Grundkonzept nicht fremd.

Technisch handelt es sich nicht um Microsoft Power Forms, sondern um ein serverseitig eingebettetes TYPO3-Powermail-Formular (`tx-powermail`, `powermail_form_41`). Öffentlich sichtbar sind:

| Feld | Ist-Status |
|---|---|
| E-Mail-Adresse | Pflicht |
| Anrede, Titel, Vorname, Nachname | freiwillig |
| Einrichtung, Einrichtungssektor | freiwillig |
| Freitextnachricht | freiwillig |
| #Mitmachen-Einwilligung | technisch Pflicht (`required`) |
| Profilbild, Telefon, Anschrift, Datei | nicht erhoben |

Der Kern der Checkbox lautet:

> „Ich willige ein, dass die gematik GmbH meine Kontaktdaten verwendet, um mich per E-Mail über weitere Mitmach-Möglichkeiten (#mitmachen) zu informieren und einzuladen.“

Danach folgen Widerrufshinweis und Link zur Datenschutzerklärung. Öffentlich erkennbar ist damit ein Checkbox-Single-Opt-in; ein Bestätigungslink wird für #Mitmachen nicht beschrieben. Dass nach dem Absenden intern doch eine Bestätigungsmail versendet wird, lässt sich ohne reale Registrierung nicht vollständig ausschließen.

### 3.2 Aktuelle Datenschutzerklärung

Die [gematik-Datenschutzerklärung](https://www.gematik.de/datenschutz) unterscheidet:

- **Hospitationsangebot:** Prüfung und Bearbeitung des Angebots sowie Kontaktaufnahme in diesem Zusammenhang; angegeben ist Art. 6 Abs. 1 lit. b DSGVO.
- **#Mitmachen:** weitere E-Mail-Kommunikation zu Hospitationen, Austauschformaten, Online-Kommentierungen, Veranstaltungen, Angeboten und Testimonial-Anfragen; angegeben ist Art. 6 Abs. 1 lit. a DSGVO.

Die Erklärung sagt ausdrücklich, nur die E-Mail-Adresse sei im Versorgungsnetzwerk-Formular verpflichtend und die zusätzliche #Mitmachen-Einwilligung sei freiwillig sowie keine Voraussetzung für die Nutzung des Formulars. Das widerspricht der tatsächlichen `required`-Konfiguration der Checkbox.

Positiv ist, dass der aktuelle Hinweis bereits Folgendes erklärt:

- unterschiedliche Zwecke und Rechtsgrundlagen;
- den Widerruf über Abmeldelink oder `datenschutz@gematik.de`;
- die Trennung zwischen Widerruf aus dem #Mitmachen-Verteiler und Fortführung des ursprünglichen Formularzwecks;
- grundsätzlich interne Zuständigkeit und mögliche allgemeine Kategorien von IT-Dienstleistern.

Nicht hinreichend konkret beschrieben sind:

- Betrieb eines internen Versorgungskompass-/CRM-Systems;
- Interaktions-, Termin-, Teilnahme- und Einladungshistorien;
- interne Notizen und Interessen-/Themenkennzeichen;
- Anreicherung aus öffentlichen beruflichen Quellen;
- Quellen und Informationsprozess nach Art. 14 DSGVO;
- Profilbilder und deren Herkunft;
- etwaige Segmentierung, Priorisierung oder automatisierte Auswertung;
- feld- beziehungsweise ereignisbezogene Prüf- und Löschregeln;
- konkret mit dem CRM befasste Auftragsverarbeiter;
- Versionierung des Einwilligungstextes und Umfang des Nachweisprotokolls.

### 3.3 Geplanter Versorgungskompass

Das lokale [Datenmodell](../architektur/DATA_MODEL.md) sieht unter anderem Kontaktstammdaten, Organisation, Sektor, Fachgebiet, Rolle, Priorität, Zuständigkeit, dienstliche Kontaktdaten, LinkedIn, Themen, Quelle, Notizen, Profilbildquelle, Einwilligungsstatus und Auditinformationen vor. Hinzu kommen Formate und Einladungen, Hospitationen, Beobachtungen, Aktivitäten und Termine.

Die Modellierung enthält bereits gute Voraussetzungen:

- Einwilligungsstatus einschließlich „erteilt“, „abgelehnt“, „widerrufen“ und „Klärung erforderlich“;
- Zeitpunkt, Quelle, Textversion und dokumentierende Person;
- getrennte Registrierungs- und Bestätigungszeitpunkte in der neueren Netzwerkanmeldung;
- geschützte Bildablage statt frei erreichbarer Dateipfade;
- Status- und Auditfelder.

Für eine belastbare Produktivnutzung fehlen im rechtlichen Fachkonzept vor allem eine feinere Trennung von **Beziehungsgrundlage**, **E-Mail-Berechtigung**, **Adressverifikation**, **Datenquelle** und **Widerspruch** sowie konkrete Regeln für Notizen, öffentliche Anreicherung, Fotos, Altbestände und Löschung.

## 4. Rechtliche Leitplanken

### 4.1 Geschäftsdaten können personenbezogene Daten sein

Die DSGVO schützt Informationen über identifizierte oder identifizierbare natürliche Personen. Eine namentlich zugeordnete dienstliche E-Mail-Adresse, ein Praxisprofil einer Einzelärztin, eine Rolle in einem Krankenhaus oder eine Gesprächsnotiz sind deshalb personenbezogen. Reine Angaben zu einer juristischen Person – etwa allgemeine Krankenhausanschrift und Funktionspostfach ohne Personenbezug – können außerhalb des Anwendungsbereichs liegen. In gemischten CRM-Datensätzen sollte aus Praktikabilitäts- und Sicherheitsgründen trotzdem einheitlich DSGVO-konform gearbeitet werden. [Art. 4 Nr. 1 und Erwägungsgrund 14 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

Der Gesundheitssektor macht die Kontaktdaten der dort arbeitenden Personen nicht zu Gesundheitsdaten. „Ärztin“, „Apotheker“, „Pflegedienstleitung“ oder „Krankenhaus“ beschreibt regelmäßig die berufliche Funktion, nicht den Gesundheitszustand der Kontaktperson. Das Risiko besonderer Kategorien nach Art. 9 entsteht vor allem durch unkontrollierte Freitexte, etwa wenn Mitarbeitende Krankheit, politische Einstellung, Gewerkschaftszugehörigkeit, Religion oder konkrete Patient:innenfälle notieren. [Art. 9 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

### 4.2 Nicht eine Rechtsgrundlage für alles, sondern Zweck für Zweck

Eine rechtssichere CRM-Architektur ordnet jeder Verarbeitung ihren konkreten Zweck zu. Einwilligung ist eine von sechs Grundlagen und nicht pauschal „die sicherste“. Sie ist ungeeignet, wenn eine Verarbeitung organisatorisch notwendig ist und nach Widerruf trotzdem fortgesetzt werden müsste. Der EDPB betont, dass Einwilligung eine echte Wahl, ausreichende Information und folgenlosen Widerruf voraussetzt. [EDPB: Personenbezogene Daten rechtmäßig verarbeiten](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_de), [EDPB-Zusammenfassung zur Einwilligung](https://www.edpb.europa.eu/system/files/2026-04/edpb-summary-consent_en.pdf)

Für den Versorgungskompass sind vier Grundlagen besonders relevant:

- **Art. 6 Abs. 1 lit. b DSGVO:** für eine von der betroffenen Person gewünschte konkrete Bearbeitung oder vorvertragliche Maßnahme. Die aktuelle gematik-Erklärung nutzt diese Grundlage für das Hospitationsangebot. Ist die Kontaktperson allerdings nur Vertreter:in einer juristischen Person und nicht selbst Vertragspartei, trägt lit. b nicht ohne Weiteres alle Verarbeitungen; dann ist lit. e oder f häufig passender.
- **Art. 6 Abs. 1 lit. e DSGVO:** für eine Verarbeitung, die zur Wahrnehmung einer im Unions- oder Mitgliedstaatenrecht verankerten Aufgabe im öffentlichen Interesse beziehungsweise öffentlicher Gewalt erforderlich ist. Bei der gematik ist die konkrete Aufgabe zuzuordnen.
- **Art. 6 Abs. 1 lit. f DSGVO:** für ein rechtmäßiges, reales und gegenwärtiges Interesse, wenn die Verarbeitung notwendig ist und die Rechte der betroffenen Person nicht überwiegen. Der EuGH lässt auch kommerzielle Interessen grundsätzlich als legitime Interessen zu, verlangt aber den vollständigen Dreistufentest. [EuGH, C-621/22 – KNLTB](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX%3A62022CJ0621), [EDPB-Leitfaden zu berechtigten Interessen](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_de)
- **Art. 6 Abs. 1 lit. a DSGVO:** für freiwillige weitergehende E-Mail-Kommunikation, soweit keine andere belastbare Kanalgrundlage greift.

Wichtig ist: Ein berechtigtes Interesse darf nicht erst nach einem Widerruf als nachträgliche „Ersatzgrundlage“ für denselben Einwilligungszweck erfunden werden. Zulässig ist dagegen, von Beginn an verschiedene Zwecke getrennt zu führen: beispielsweise operative Beziehungspflege auf lit. e/f und optionale Serien-Einladungen auf lit. a.

### 4.3 Besonderheit der gematik: GmbH und gesetzliche Aufgaben

Die gematik ist gesellschaftsrechtlich eine GmbH; der Bund hält nach § 310 Abs. 2 Nr. 1 SGB V 51 Prozent der Geschäftsanteile. § 311 SGB V überträgt ihr bundesweite gesetzliche Aufgaben. Nach § 2 Abs. 3 BDSG gelten privatrechtliche Vereinigungen öffentlicher Stellen, die Aufgaben öffentlicher Verwaltung wahrnehmen, als öffentliche Stellen des Bundes, wenn sie länderübergreifend tätig sind oder dem Bund die absolute Anteils- beziehungsweise Stimmenmehrheit gehört. Beides spricht beim aufgabengebundenen Versorgungskompass deutlich für die Behandlung als öffentliche Stelle des Bundes. [§ 2 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__2.html), [§ 310 SGB V](https://www.gesetze-im-internet.de/sgb_5/__310.html), [§ 311 SGB V](https://www.gesetze-im-internet.de/sgb_5/__311.html)

Bestimmte Zulassungs-, Festlegungs-, Bestätigungs- und Gefahrenabwehraufgaben werden nach § 311 Abs. 1a zusätzlich ausdrücklich als hoheitliche Aufgaben des Bundes durch die gematik als Beliehene wahrgenommen. Art. 6 Abs. 1 lit. e setzt jedoch keine Beleihung voraus; er umfasst auch andere gesetzlich übertragene Aufgaben im öffentlichen Interesse. § 3 BDSG erlaubt öffentlichen Stellen die erforderliche Verarbeitung zur Erfüllung der in ihrer Zuständigkeit liegenden Aufgabe beziehungsweise in Ausübung übertragener öffentlicher Gewalt. [§ 3 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__3.html)

Art. 6 Abs. 1 lit. f DSGVO gilt nicht für Behörden, soweit sie personenbezogene Daten in Erfüllung ihrer Aufgaben verarbeiten. Für den aufgabengebundenen Versorgungskompass ist deshalb voraussichtlich folgende Kette vorzugswürdig:

> **Art. 6 Abs. 1 lit. e DSGVO in Verbindung mit § 3 BDSG und der konkret dokumentierten Aufgabe aus § 311 SGB V.**

Als mögliche, intern fachlich zu belegende Anknüpfungen kommen insbesondere § 311 Abs. 1 Nr. 13 – Planung, Durchführung und Unterstützung von Erprobungs- und Einführungsphasen – und gegebenenfalls Nr. 17 – Unterstützung der Digitalisierungsstrategie des Bundesministeriums für Gesundheit – in Betracht. § 311 Abs. 4 begrenzt die Aufgabenerfüllung auf das für eine interoperable, kompatible und sichere Telematikinfrastruktur Erforderliche. Der Projektzweck darf deshalb nicht nur allgemein mit „Netzwerk“ beschrieben, sondern muss nachvollziehbar mit der konkreten Aufgabe verbunden werden.

Vor der endgültigen Festlegung ist ein kurzes **Aufgaben-Mapping** erforderlich:

1. Dient das Versorgungsnetzwerk unmittelbar einer gesetzlichen öffentlichen Aufgabe, etwa der Planung, Erprobung, Einführung oder Weiterentwicklung der Telematikinfrastruktur?
2. Welche konkrete Nummer des § 311 SGB V trägt welchen Zweck und welche Datenfelder?
3. Ist die jeweilige Verarbeitung zur Aufgabenerfüllung erforderlich, oder gibt es ein gleich wirksames milderes Mittel?
4. Handelt die gematik in einem abgrenzbaren Teil außerhalb ihrer öffentlichen Aufgabe beziehungsweise als Unternehmen im Wettbewerb, sodass Art. 6 Abs. 1 lit. f und die Wettbewerbsausnahme des § 2 Abs. 5 BDSG zu prüfen sind?

Diese institutionelle Zuordnung kann ohne interne Mandats- und Prozessunterlagen nicht abschließend entschieden werden. Sie ist aber kein Argument gegen das CRM: Sie legt das operative Fundament richtig fest. Für eine konkrete, selbst angefragte Hospitationsbearbeitung kann daneben lit. b einschlägig sein, sofern die betroffene natürliche Person selbst Vertragspartei ist oder auf eigenen Wunsch vorvertraglich handelt. Vertritt sie nur eine Klinik oder Praxis als juristische Person, ist lit. e regelmäßig belastbarer. Die optionale E-Mail-Einwilligung bleibt davon unabhängig.

### 4.4 Berechtigtes Interesse: die ergänzende Prüfung außerhalb der öffentlichen Aufgabe

Soweit eine konkrete Tätigkeit nicht in Erfüllung der öffentlichen Aufgaben erfolgt beziehungsweise wirksam als wettbewerbliche Tätigkeit eingeordnet wird, kann Art. 6 Abs. 1 lit. f zu prüfen sein. Er verlangt drei kumulative Schritte: legitimes Interesse, Erforderlichkeit und Interessenabwägung. Der EDPB bezeichnet ein Interesse als tragfähig, wenn es rechtmäßig, klar, real und gegenwärtig ist; außerdem müssen weniger eingriffsintensive, gleich wirksame Alternativen und die vernünftigen Erwartungen geprüft werden. Die 2024 angenommenen EDPB Guidelines 1/2024 liegen auf der EDPB-Seite zum Stichtag weiterhin nur als „Version 1.0“ nach öffentlicher Konsultation vor; das EDPB-Arbeitsprogramm 2026–2027 kündigt die Arbeit an der Endfassung noch an. Ergänzend veröffentlichte der EDPB im März 2026 einen Fallpraxis-Digest zum Dreistufentest. [EDPB Guidelines 1/2024](https://www.edpb.europa.eu/public-consultations/guidelines-12024-on-processing-of-personal-data-based-on-article-61f-gdpr_en), [EDPB-Arbeitsprogramm 2026–2027](https://www.edpb.europa.eu/system/files/2026-02/edpb_work-programme_2026-2027_en.pdf), [EDPB One-Stop-Shop Case Digest vom 26.03.2026](https://www.edpb.europa.eu/documents/support-pool-of-experts/one-stop-shop-case-digest-on-the-legal-basis-of-legitimate_en)

**Legitimes Interesse:** Aufbau und Pflege eines arbeitsfähigen Netzes von Leistungserbringern, Vermeidung doppelter oder unkoordinierter Ansprache, Zuordnung verantwortlicher gematik-Mitarbeitender, Nachhalten vereinbarter Termine und Auswahl fachlich passender Einrichtungen.

**Erforderlichkeit:** Eine gemeinsame, zugriffsgesteuerte Kontaktdokumentation ist gegenüber verstreuten persönlichen Tabellen, Postfächern und Gedächtnisnotizen regelmäßig mindestens ebenso datensparsam und sicher. Erforderlich ist aber nicht jedes technisch mögliche Feld. Private Details, flächendeckende Fotos oder ein undurchsichtiges Personenscoring sind für diese Zwecke nicht notwendig.

**Abwägung:** Für die gematik sprechen insbesondere:

- die Eigeninitiative vieler Kontakte über das Formular;
- die auf der Seite angekündigte langfristige Kontaktpflege;
- der enge berufliche Bezug;
- überwiegend dienstliche Kontaktwege und Einrichtungsanschriften;
- keine beabsichtigte Verarbeitung von Patientendaten;
- erwartbare organisatorische Folgeinformationen wie Termine, Zuständigkeit und Gesprächsergebnisse;
- geringe Folgen einer internen, rollenbeschränkten Dokumentation;
- transparente Information, Widerspruch, Löschung und Zugriffsschutz als Garantien.

Gegen die gematik würden insbesondere sprechen:

- überraschende Zusammenführung vieler Quellen;
- private oder sensible Informationen;
- subjektive Bewertungen ohne Sachbezug;
- dauerhafte Speicherung ohne Kontakt oder Prüfung;
- Weitergabe an Dritte;
- automatisierte Ranglisten oder Entscheidungen über Personen;
- massenhafte Ansprache aus öffentlich gesammelten E-Mail-Adressen;
- Übernahme von Bildern ohne Rechts- und Quellenprüfung.

Die Bilanz ist daher – soweit lit. f überhaupt anwendbar ist – **für ein minimiertes professionelles Beziehungs-CRM positiv**, nicht aber für ein unbegrenztes „Alles, was auffindbar ist“-Dossier. Dieselben Tatsachen stützen unter lit. e die Erforderlichkeits- und Verhältnismäßigkeitsprüfung.

### 4.5 E-Mail-Einladungen, Einwilligung und Double-Opt-in

Datenschutzrecht und Wettbewerbsrecht prüfen unterschiedliche Fragen:

- Die DSGVO fragt, ob personenbezogene Daten für einen bestimmten Kommunikationszweck verarbeitet werden dürfen.
- § 7 UWG schützt im Rahmen geschäftlicher Handlungen den Kommunikationskanal vor unzumutbarer Belästigung. Bei Werbung per elektronischer Post verlangt § 7 Abs. 2 Nr. 2 grundsätzlich vorherige ausdrückliche Einwilligung. Die Bestandskundenausnahme des § 7 Abs. 3 setzt unter anderem einen Verkauf und Werbung für eigene ähnliche Waren oder Dienstleistungen voraus und passt auf die Hospitationsregistrierung regelmäßig nicht ohne Weiteres. [§ 2 UWG](https://www.gesetze-im-internet.de/uwg_2004/__2.html), [§ 7 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html)

Nicht jede sachbezogene E-Mail ist Werbung. Eine Antwort auf ein selbst eingereichtes Hospitationsangebot, eine konkrete Terminabstimmung oder die organisatorische Durchführung einer bereits vereinbarten Teilnahme ist funktionale Kommunikation zum angefragten beziehungsweise laufenden Vorgang. Eine breit versendete Einladung zu weiteren Formaten, Image- oder Testimonial-Anfragen kann dagegen unter den weiten datenschutzrechtlichen Werbebegriff fallen; die DSK zählt hierzu auch die unmittelbare Ansprache, mit der Verbände, Vereine oder soziale Organisationen ihre Ziele bekannt machen oder fördern. Ob § 7 UWG zusätzlich greift, hängt auch davon ab, ob eine geschäftliche Handlung mit Markt-, Absatz-, Bezugs- oder Vertragsbezug vorliegt; eine rein öffentlich-aufgabenbezogene, unentgeltliche Stakeholder-Einladung kann außerhalb des UWG liegen. Weil die Grenzziehung vom Inhalt abhängt und die gematik bereits eine Einwilligungslösung gewählt hat, sollte für **weitergehende wiederkehrende #Mitmachen-E-Mails** dennoch an der ausdrücklichen Einwilligung festgehalten werden. [DSK-Orientierungshilfe Direktwerbung, S. 3](https://www.datenschutzkonferenz-online.de/media/oh/OH-Werbung_Februar%202022_final.pdf)

Eine gesetzlich besonders klare Grenze gilt für den elektronischen Verzeichnisdienst der Telematikinfrastruktur: Nach § 313 Abs. 3 SGB V dürfen dessen Daten bei Nutzung eines sicheren Übermittlungsverfahrens ohne vorherige ausdrückliche Einwilligung nicht für Werbenachrichten verwendet werden. Daten aus diesem Verzeichnis dürfen deshalb nicht mit allgemeinen Praxiswebsites oder Krankenhausverzeichnissen gleichgesetzt und ohne gesonderte Prüfung für Einladungswerbung übernommen werden. [§ 313 SGB V](https://www.gesetze-im-internet.de/sgb_5/__313.html)

Die Einwilligung braucht:

- eine nicht vorangekreuzte und wirklich optionale Checkbox;
- verständlich benannte Formate beziehungsweise eine hinreichend bestimmte Reichweite;
- gematik als Absenderin;
- den Kanal E-Mail;
- jederzeitigen einfachen Widerruf ohne Nachteil;
- protokollierten Wortlaut beziehungsweise Textversion, Zeitpunkt, Quelle und Status;
- eine Sperrlogik, die Versand nach Widerruf oder Widerspruch verhindert.

Ein Double-Opt-in wird weder in Art. 7 DSGVO noch in § 7 UWG als zwingende technische Form genannt. Die beweisbelastete Organisation muss die konkrete Einwilligung aber vollständig dokumentieren; die DSK bezeichnet Double-Opt-in für elektronisch erklärte Werbeeinwilligungen zur Verifikation als geboten. Es bestätigt außerdem, dass der Zugriff auf das angegebene Postfach besteht, und verhindert weitgehend, dass Dritte fremde Adressen anmelden. Deshalb lautet die Empfehlung:

> **Double-Opt-in für die optionale künftige #Mitmachen-Kommunikation; kein Double-Opt-in als Voraussetzung für die Bearbeitung des eingereichten Hospitationsangebots und kein Double-Opt-in als Voraussetzung für die interne CRM-Dokumentation.**

Die Bestätigungsmail sollte neutral sein und vor Bestätigung keine weitergehende Werbung enthalten. Adressverifikation und rechtliche Einwilligung bleiben zwei getrennte Felder: Eine verifizierte Adresse ist nicht automatisch eine Werbeeinwilligung, und eine Checkbox ohne Verifikation lässt die Beweisfrage der Adressinhaberschaft offen.

Für auf Art. 6 Abs. 1 lit. e oder f gestützte Verarbeitungen besteht nach Art. 21 Abs. 1 ein situationsbezogenes Widerspruchsrecht; die Fortsetzung verlangt dann zwingende vorrangige Gründe oder Rechtsverteidigung. Gegen Direktwerbung kann jederzeit ohne Begründung widersprochen werden, danach ist die Verarbeitung zu diesem Zweck zu beenden. Dieses absolute Stopprecht sollte spätestens in der ersten einschlägigen Kommunikation deutlich hervorgehoben und technisch durch eine Sperrkennung umgesetzt werden. [Art. 21 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

### 4.6 Öffentliche Quellen und Art. 14

Bei Angaben aus Praxiswebsites, Krankenhausverzeichnissen, offiziellen Berufsverzeichnissen oder beruflichen Profilseiten werden die Daten nicht bei der Person selbst erhoben. Art. 14 DSGVO verlangt dann grundsätzlich Informationen über Zwecke, Rechtsgrundlage, Kategorien, Empfänger, Speicherdauer, Rechte sowie die Quelle – gegebenenfalls einschließlich des Hinweises, ob sie öffentlich zugänglich war. Die Information muss grundsätzlich spätestens innerhalb eines Monats, bei der ersten Kommunikation oder vor der ersten Offenlegung erfolgen. [Art. 14 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679), [BfDI-Basiswissen zu Informationspflichten](https://www.bfdi.bund.de/DE/Buerger/Inhalte/Allgemein/Datenschutz/Informationspflichten.html)

Ein öffentliches Profil senkt die Eingriffsintensität, hebt die Pflichten aber nicht auf. Sinnvolle Grenzen sind:

- nur seriöse berufsbezogene Quellen;
- nur Felder, die für Versorgungssituation, Zuständigkeit und passende Zusammenarbeit benötigt werden;
- Quell-URL, Abrufdatum und Kategorie dokumentieren;
- keine automatisierte Massenanreicherung aus sozialen Netzwerken ohne gesonderte Prüfung;
- Nutzungsbedingungen, robots-Regeln, Datenbank- und Urheberrechte beachten;
- keine privaten Telefonnummern, Privatanschriften oder privaten Social-Media-Inhalte;
- Daten bei Kontaktaufnahme transparent machen und Korrektur/Widerspruch einfach ermöglichen;
- Richtigkeit regelmäßig prüfen, weil öffentliche Angaben veralten können.

Auch eine „öffentliche Person“ verliert den DSGVO-Schutz nicht. Für die Bewertung ist günstiger, wenn sich die gespeicherte Angabe gerade auf ihre öffentliche beziehungsweise berufliche Funktion bezieht und aus einer dafür bestimmten Quelle stammt. Die Privatadresse, Familienumstände oder ein privates Foto derselben Person würden dadurch nicht erwartbar.

Das BVerwG hat diese Grenze 2025 für Telefonwerbung an Zahnarztpraxen konkretisiert: Die Veröffentlichung von Praxisnummern in allgemein zugänglichen Verzeichnissen ließ nicht auf ein Interesse am sachfremden Ankauf von Edelmetallresten und gerade auch nicht auf den telefonischen Werbekanal schließen. Die Entscheidung spricht gegen „öffentlich = frei für Ansprache“, nicht gegen einen transparenten, zwecknahen Stakeholder-Stammsatz und interne Koordination. Auch die DSK hält das Auslesen eines gesetzlich vorgeschriebenen Impressums für Werbezwecke regelmäßig nicht für erwartbar. [BVerwG 6 C 3.23](https://www.bverwg.de/de/290125U6C3.23.0), [DSK-Orientierungshilfe Direktwerbung, S. 15](https://www.datenschutzkonferenz-online.de/media/oh/OH-Werbung_Februar%202022_final.pdf)

Die CNIL kommt in ihrer europäischen Vergleichspraxis zu dem Ergebnis, dass B2B-Wiederverwendung beruflicher Angaben auf berechtigte Interessen gestützt werden kann, wenn Zweck, Erwartbarkeit, Datenart, Quellbedingungen, Widerspruch und Eingriffsintensität geprüft werden. Ihre Empfehlungen sind für deutsche Behörden nicht bindend, stützen aber die hier vorgeschlagene risikobasierte Linie. [CNIL, Empfehlungen für Weiterverwender veröffentlichter Internetdaten](https://www.cnil.fr/fr/recommandations-reutilisateurs-donnees-internet), [CNIL, Rechte bei kommerzieller Wiederverwendung](https://cnil.fr/fr/reutilisation-de-vos-donnees-publiees-sur-internet-des-fins-commerciales-quels-sont-vos-droits)

### 4.7 Interne Notizen, Termine und Einladungen

Ein CRM darf mehr enthalten als die ursprünglich in ein Webformular eingetragenen Stammdaten, wenn die Zusatzinformationen für den transparent beschriebenen Zweck erforderlich oder damit vereinbar sind. Art. 6 Abs. 4 DSGVO nennt für eine Zweckvereinbarkeitsprüfung unter anderem Zusammenhang der Zwecke, Erhebungskontext, Art der Daten, mögliche Folgen und Garantien. Ein Termin, die Information „Einladung versendet“, die Teilnahme an einer Hospitation und ein sachliches Gesprächsergebnis stehen typischerweise in engem Zusammenhang mit dem Aufbau und Betrieb des angekündigten Versorgungsnetzwerks. [Art. 6 Abs. 4 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

Empfohlene Notizregel:

> Es werden nur überprüfbare berufliche Tatsachen, von der Person geäußerte fachliche Interessen, vereinbarte nächste Schritte und für die Zusammenarbeit erforderliche Einschätzungen dokumentiert. Jede Notiz hat Autor:in und Datum. Patient:inneninformationen, besondere Kategorien personenbezogener Daten, private Lebensumstände, Gerüchte, abwertende Formulierungen und sachfremde Bewertungen sind unzulässig.

Eine praktikable Struktur ist:

- **Kontaktanlass:** Quelle beziehungsweise Gespräch;
- **Fakt:** beobachtbar oder von der Person mitgeteilt;
- **fachliches Interesse:** nur mit Bezug zu gematik-Aufgaben und Formaten;
- **vereinbarter Folgeschritt:** Aufgabe, Verantwortliche:r, Termin;
- **Teilnahmestatus:** eingeladen, zugesagt, abgesagt, teilgenommen;
- **interne Arbeitsbewertung:** nur begründet, knapp, überprüfbar und nicht als verdecktes Persönlichkeitsprofil.

Auch interne Notizen können Gegenstand eines Auskunftsersuchens sein. Professionelle Formulierungen sind deshalb nicht nur datenschutzrechtlich, sondern auch organisatorisch sinnvoll.

Die CNIL bestätigt als europäische Vergleichspraxis, dass Freitextfelder zur Vorgangs- und Beziehungsbetreuung nicht grundsätzlich verboten sind. Sie empfiehlt Information, objektive und nicht exzessive Sprache, Verzicht auf unnötige sensible Angaben, Schulung, Stichproben und möglichst strukturierte Auswahlfelder. [CNIL: Regeln für Freitext- und Kommentarfelder](https://cnil.fr/fr/zones-bloc-note-et-commentaires-les-bons-reflexes-pour-ne-pas-deraper)

### 4.8 Priorisierung, Matching und Profiling

Eine manuelle Auswahl nach Sektor, Region, Fachgebiet, Versorgungssituation und bekundetem Interesse ist für das Netzwerk naheliegend. „Profiling“ im Sinne von Art. 4 Nr. 4 setzt eine automatisierte Verarbeitung zur Bewertung persönlicher Aspekte voraus. Ein automatisches Personen-Scoring, das Verhalten, Zuverlässigkeit oder Einfluss bewertet, wäre deshalb rechtlich anders zu behandeln als eine schlichte Filterung nach Organisationsmerkmalen. Art. 22 wird insbesondere relevant, wenn ausschließlich automatisierte Entscheidungen rechtliche oder ähnlich erhebliche Wirkungen entfalten. [Art. 4 Nr. 4 und Art. 22 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

Empfehlung für Stufe 1:

- Matching vorrangig auf Ebene von Einrichtung, Sektor, Region und Formatbedarf;
- keine verdeckten Persönlichkeits- oder „Influence“-Scores;
- Priorität nur als operative Teamkennzeichnung mit klaren Kriterien;
- finale Auswahl durch Mitarbeitende;
- keine Benachteiligung oder Entscheidung mit erheblicher Wirkung;
- spätere Automatisierung vorab separat auf Transparenz, Art. 22 und DSFA prüfen.

### 4.9 Profilbilder

Für eine interne visuelle Wiedererkennung kann ein berechtigtes organisatorisches Interesse bestehen. Gegen die Erforderlichkeit spricht, dass derselbe Zweck meist mit Name, Rolle, Organisation und Initialen erreichbar ist. Bilder sollten deshalb ein optionales Zusatzmerkmal sein, nicht Voraussetzung des CRM.

Zulässige Quellen können beispielsweise sein:

- ein von der Kontaktperson selbst übermitteltes Bild mit passender Nutzungserlaubnis;
- ein gematik-eigenes Veranstaltungsfoto, dessen Einwilligung beziehungsweise Nutzungszweck die interne CRM-Nutzung umfasst;
- ein ausdrücklich zur entsprechenden Wiederverwendung lizenziertes Presse-/Profilbild.

Nicht als Freigabe genügen:

- „bei Google gefunden“ oder Anzeige in Google Maps;
- bloße öffentliche Sichtbarkeit auf einer Website;
- ein Social-Media-Profil ohne Prüfung der Plattformbedingungen und Rechte;
- Screenshot oder Download ohne dokumentierte Rechtekette.

Auch wenn § 22 KunstUrhG unmittelbar das Verbreiten und öffentliche Zurschaustellen von Bildnissen regelt und die rein interne Anzeige davon zu unterscheiden ist, bleiben DSGVO, allgemeines Persönlichkeitsrecht und Urheberrecht zu beachten. Die pragmatische Startlösung lautet daher: **Initialen als Default, Foto nur nach Quellen- und Rechtefreigabe, interner Zugriff, keine biometrische Analyse.**

## 5. Empfohlene Zweck- und Rechtsgrundlagenmatrix

Die folgende Matrix ist eine Entscheidungsvorlage. Die Zuordnung lit. e versus lit. f muss die gematik anhand des konkreten gesetzlichen Aufgabenbezugs finalisieren.

| Verarbeitung | Zweck | Primäre Grundlage | Einwilligung/DOI? | Leitplanken |
|---|---|---|---|---|
| Eingereichtes Hospitationsangebot und erste Antwort | Anfrage prüfen, passende Hospitation vorbereiten | Art. 6 Abs. 1 lit. e + § 3 BDSG + § 311 SGB V; lit. b, wenn die Person selbst anfragt/Vertragspartei ist | Nein | Nur angefragter Vorgang; aktuelle Information nach Art. 13 |
| Kontaktstammdaten im CRM | Kontakt auffindbar halten, Doppelansprache vermeiden, Zuständigkeit klären | Primär e + § 3 BDSG + konkrete §-311-Aufgabe; f nur außerhalb öffentlicher Aufgabenerfüllung | Nein | Aufgaben-Mapping; bei f zusätzlich LIA; minimale Felder |
| Organisation, Sektor, Rolle, dienstliche Anschrift | Versorgungssituation und Ansprechpartner:in zuordnen | primär e; gegebenenfalls f | Nein | Beruflicher Bezug; Quellennachweis |
| Kontakt- und Gesprächshistorie | Kontinuität, Nachhalten von Vereinbarungen | primär e; teilweise b; gegebenenfalls f | Nein | sachlich, zugriffsbeschränkt, zeitlich überprüft |
| Termine, Hospitationen, Formatteilnahme | vereinbarte Zusammenarbeit organisieren | e; gegebenenfalls b/f | Nein | keine überflüssigen Kalenderinhalte |
| Planung, wen man zu einem Format einladen könnte | relevante Zielgruppe bestimmen | primär e; gegebenenfalls f | Nein, solange noch kein einwilligungspflichtiger Versand erfolgt | transparente Kriterien, keine sensiblen Scores |
| Operative E-Mail zu angefragtem/laufendem Vorgang | Rückfrage, Termin, Durchführung | e; gegebenenfalls b/f | Nein | Inhalt eng am Vorgang |
| Wiederkehrende E-Mail zu weiteren #Mitmachen-Formaten | weitergehende Einladung/Ansprache | Art. 6 Abs. 1 lit. a; zusätzlich § 7 UWG prüfen | **Ja, empfohlen mit DOI** | Kanal, Absenderin, Zwecke, Widerruf; Versand-Sperre |
| Dokumentation von Einwilligung, Widerruf und Widerspruch | Nachweis und Unterdrückung weiterer Sendungen | Art. 6 Abs. 1 lit. c i. V. m. Art. 5 Abs. 2, Art. 7 Abs. 1 und Art. 21; ergänzend aufgaben-/rechtsverteidigungsbezogene Grundlage | Nein | minimaler Nachweis getrennt vom aktiven Marketingprofil |
| Ergänzung aus Praxiswebsite/offiziellem Verzeichnis | Rolle, Erreichbarkeit und Versorgungsbezug aktuell halten | e bei nachgewiesener Aufgabenerforderlichkeit; sonst f | Nein | Art. 14, Quelle/Abrufdatum, Erwartbarkeit, Widerspruch; § 313-Verzeichnis gesondert |
| LinkedIn-/Social-Profil | berufliche Zuordnung | e/f nur nach strenger Prüfung | Nein | keine Massenextraktion; Plattformregeln; optional |
| Internes Profilbild | Wiedererkennung | e nur bei nachgewiesener Erforderlichkeit; f nur außerhalb der öffentlichen Aufgabe; alternativ Einwilligung | Kein DOI; dokumentierte Bildberechtigung | Initialen als Standard, Rechteprüfung |
| Objektive interne Notizen | Zusammenarbeit koordinieren | primär e; gegebenenfalls f | Nein | Notizrichtlinie, keine Art.-9-/Patientendaten |
| Automatisches Personen-Scoring | Priorisierung/Bewertung | gesondert zu bestimmen | nicht im Startumfang | Profiling-, Transparenz- und DSFA-Prüfung |
| Statistik über Formate | Steuerung und Evaluation | e/f; möglichst aggregiert/anonymisiert | Nein | personenbezogene Rohdaten nur soweit nötig |

## 6. Bewertung des heutigen Zustands

### 6.1 Was bereits tragfähig ist

- Der öffentlich beschriebene Zweck enthält langfristige Kontaktpflege und bedarfsbezogene Auswahl.
- Hospitationsbearbeitung und weitergehende #Mitmachen-Kommunikation sind in der Datenschutzerklärung bereits getrennt.
- Das Formular verlangt eine aktive Checkbox und verwendet keine vorangekreuzte Option.
- Widerrufskanäle und die Fortgeltung des ursprünglichen Formularzwecks werden erläutert.
- Das Ziel-Datenmodell kann Textversion, Zeitpunkt, Quelle, Widerruf und Auditinformationen abbilden.
- Das CRM zielt auf berufliche Stakeholderkontakte, nicht auf Patient:innenakten.

### 6.2 Was vor Regelbetrieb korrigiert werden sollte

**Sofort und mit geringem Aufwand**

1. `required` von der #Mitmachen-Checkbox entfernen.
2. Formular auch ohne weitergehende Einwilligung absendbar machen.
3. „Datenschutzhinweis“ nicht als scheinbare Pflichtbestätigung formulieren; Datenschutzhinweise werden bereitgestellt, nicht „akzeptiert“.
4. Checkboxtext, Datenschutzhinweis-Version, Zeitstempel und Quelle beweisbar speichern.
5. Beim Versand weitergehender #Mitmachen-E-Mails Double-Opt-in und verlässliche Sperrlogik einführen.

**Vor produktiver CRM-Anreicherung**

6. Datenschutzerklärung um Versorgungskompass, Datenkategorien, Interaktionsdaten, öffentliche Quellen, Notizen, Empfänger und Löschlogik ergänzen.
7. Art.-13-/Art.-14-Prozess für Eigenangaben und öffentliche Quellen festlegen.
8. Aufgaben-Mapping für lit. e und – nur falls lit. f einschlägig ist – eine Interessenabwägung dokumentieren.
9. VVT, Rollen-/Berechtigungskonzept, Auftragsverarbeiter und Drittlandtransfers prüfen.
10. Notiz-, Foto-, Quellen- und Löschrichtlinie verabschieden.
11. DSFA-Schwellenprüfung dokumentieren.

## 7. Konkretes Zielbild

### 7.1 Formulartext

**Hinweis direkt am Absende-Button, ohne Pflicht-Checkbox**

> Mit dem Absenden verarbeiten wir Ihre Angaben, um Ihr Angebot als möglichen Hospitationsort zu prüfen, hierzu Kontakt aufzunehmen und die weitere Zusammenarbeit im Versorgungsnetzwerk zu organisieren. Einzelheiten, auch zum Versorgungskompass und zu Ihren Rechten, finden Sie in unseren Datenschutzhinweisen.

**Optionale, nicht vorangekreuzte Checkbox**

> [ ] Ich möchte zusätzlich per E-Mail über fachlich passende #Mitmachen-Möglichkeiten der gematik – insbesondere Hospitationen, Austausch- und Kommentierungsformate sowie Veranstaltungen – informiert und eingeladen werden. Ich kann diese Einwilligung jederzeit mit Wirkung für die Zukunft über den Abmeldelink oder an datenschutz@gematik.de widerrufen. Weitere Informationen stehen in den Datenschutzhinweisen.

Dieser Text ist ein Arbeitsvorschlag. Legal und Datenschutz sollten insbesondere prüfen, ob „Veranstaltungen“ und „Testimonial-Anfragen“ weiter getrennt werden müssen, wenn Häufigkeit, Erwartbarkeit oder Ziel deutlich auseinanderfallen.

### 7.2 Double-Opt-in-Ablauf

1. Das Hospitationsangebot wird unabhängig von der optionalen Checkbox entgegengenommen.
2. Bei gesetzter Checkbox entsteht der Status `opt_in_unverified`.
3. Eine neutrale Bestätigungsmail enthält Zweck, gematik als Absenderin und einen zeitlich begrenzten Link.
4. Erst nach Bestätigung entsteht `opt_in_verified`.
5. Protokolliert werden mindestens:
   - E-Mail-Adresse;
   - Formular und Quelle;
   - exakter Einwilligungstext beziehungsweise unveränderliche Textversion;
   - Zeitpunkt der Erklärung;
   - Zeitpunkt der Bestätigung;
   - Status und Statusänderungen;
   - Zeitpunkt und Quelle eines Widerrufs/Widerspruchs.
6. Nicht bestätigte Anmeldungen werden nach kurzer technischer Frist gelöscht; sie werden nie in einen #Mitmachen-Versand aufgenommen.
7. Jeder Versand prüft den aktuellen Status, enthält einen einfachen Abmeldemechanismus und erzeugt keine neue Einwilligung durch Inaktivität.

Eine dauerhafte Speicherung voller IP-Adressen ist nicht automatisch erforderlich. Wenn sie aus Nachweisgründen erwogen wird, sind Notwendigkeit, Kürzung, Zugriff und Löschfrist gesondert festzulegen. Der BGH verlangt vor allem die konkrete, vollständig dokumentierte Erklärung; eine bloße IP-Liste oder ein leeres Musterformular genügte im entschiedenen Fall gerade nicht. [BGH I ZR 164/09](https://juris.bundesgerichtshof.de/cgi-bin/bgh_notp/document.py?Art=en&Datum=2011-2&Gericht=bgh&Sort=1024&anz=294&pos=30)

### 7.3 Empfohlenes Datenmodell für Berechtigung und Herkunft

Ein einziges Feld `consent = true/false` ist zu grob. Empfohlen werden mindestens:

```text
relationship_basis
  self_submitted_offer | active_collaboration | public_professional_source | other

operational_legal_basis
  art_6_1_b | art_6_1_e | art_6_1_f | review_required

public_task_reference
  sg_v_311_1_no_13 | sg_v_311_1_no_17 | other_reference | not_applicable

email_permission
  operational_only | opt_in_unverified | opt_in_verified | withdrawn | objected | unknown

email_verified_at
consent_given_at
consent_confirmed_at
consent_withdrawn_at
consent_text_version
consent_source

source_type
  data_subject | colleague_referral | practice_website | official_directory | event | other

source_url
source_checked_at
art_14_notice_sent_at
last_meaningful_interaction_at
review_due_at
suppression_reason
```

Damit wird sichtbar:

- warum ein Kontakt im CRM steht;
- ob operative E-Mail möglich ist;
- ob weitergehende #Mitmachen-E-Mail erlaubt und die Adresse bestätigt ist;
- wo Zusatzdaten herkommen;
- ob Art. 14 erfüllt ist;
- wann der Datensatz überprüft oder gelöscht werden muss.

### 7.4 Entwurf für einen Datenschutzhinweis „Versorgungskompass“

Der folgende Baustein ist als Ergänzung der bestehenden globalen Erklärung gedacht; allgemeine Angaben zu Verantwortlicher, Datenschutzbeauftragter, Beschwerderecht und Betroffenenrechten können auf die vorhandenen Abschnitte verweisen.

> **Versorgungskompass und Versorgungsnetzwerk**
>
> Wir nutzen einen internen Versorgungskompass, um Kontakte zu Einrichtungen und beruflichen Ansprechpartner:innen im Gesundheitswesen zu verwalten, Hospitationsangebote und Beteiligungsformate zu organisieren, Doppelansprachen zu vermeiden, Zuständigkeiten zuzuordnen und die fachliche Zusammenarbeit nachvollziehbar fortzuführen.
>
> Wir verarbeiten hierfür die von Ihnen mitgeteilten Kontakt- und Organisationsdaten, Ihre berufliche Rolle und fachlichen Interessen sowie organisatorische Informationen aus der Zusammenarbeit, etwa Kontaktanlässe, vereinbarte Termine und Folgeschritte, Einladungs- und Teilnahmestatus sowie sachliche Gesprächsergebnisse. Soweit erforderlich, ergänzen oder aktualisieren wir berufliche Angaben aus öffentlich zugänglichen Quellen, insbesondere offiziellen Verzeichnissen und Websites Ihrer Einrichtung. Die jeweilige Quelle wird dokumentiert. Wir verarbeiten im Versorgungskompass keine Patient:innendaten und verwenden die Angaben nicht für ausschließlich automatisierte Entscheidungen mit rechtlicher oder ähnlich erheblicher Wirkung.
>
> Soweit die Verarbeitung zur Wahrnehmung unserer gesetzlichen Aufgaben erforderlich ist, erfolgt sie auf Grundlage von Art. 6 Abs. 1 lit. e DSGVO in Verbindung mit § 3 BDSG und [konkrete Aufgabe aus § 311 SGB V ergänzen]. Soweit Sie selbst eine vertragliche oder vorvertragliche Maßnahme anfragen und die Voraussetzungen hierfür vorliegen, beruht deren Bearbeitung auf Art. 6 Abs. 1 lit. b DSGVO. Nur in einem abgrenzbaren Bereich außerhalb der öffentlichen Aufgabenerfüllung stützen wir die professionelle Kontakt- und Beziehungsverwaltung auf Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse liegt dann in der koordinierten, bedarfsorientierten und nachvollziehbaren Zusammenarbeit mit Leistungserbringern und weiteren Beteiligten der digitalen Gesundheitsversorgung. Weitergehende #Mitmachen-E-Mails senden wir auf Grundlage Ihrer Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO, soweit keine andere Rechtsgrundlage für eine von Ihnen angefragte oder bereits vereinbarte operative Kommunikation greift.
>
> Zugriff erhalten nur zuständige gematik-Mitarbeitende und erforderliche, vertraglich gebundene IT-Auftragsverarbeiter. Eine Verwendung für fremde Werbezwecke oder ein Verkauf der Kontaktdaten findet nicht statt.
>
> Wir überprüfen die Erforderlichkeit der Daten regelmäßig. Wir löschen oder anonymisieren Kontaktdaten, wenn der jeweilige Zweck entfallen ist und keine gesetzlichen Aufbewahrungs-, Nachweis- oder Rechtsverteidigungsgründe entgegenstehen. [Konkrete Prüf- und Regelfristen ergänzen.] Sie können einer auf Art. 6 Abs. 1 lit. e oder f DSGVO gestützten Verarbeitung aus Gründen Ihrer besonderen Situation widersprechen; gegen Direktwerbung können Sie jederzeit ohne Begründung widersprechen. Eine Einwilligung können Sie jederzeit für die Zukunft widerrufen. Den Widerruf beziehungsweise Widerspruch setzen wir auch in einer minimalen Sperrinformation um, damit Sie nicht erneut ungewollt kontaktiert werden.

Der Baustein muss nach dem Aufgaben-Mapping, der System-/Dienstleisterauswahl und dem finalen Löschkonzept vervollständigt werden. Art. 13 und 14 verlangen unter anderem konkrete Informationen zu Rechtsgrundlage, berechtigten Interessen, Empfängern, Speicherdauer beziehungsweise Kriterien, Rechten und Quellen. [Art. 13 und 14 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

### 7.5 Altbestände

Altbestände sollten nicht pauschal gelöscht oder pauschal als „eingewilligt“ migriert werden:

| Bestand | Migration |
|---|---|
| Selbst eingereichtes Hospitationsangebot, Quelle/Zeitpunkt nachvollziehbar | Operativen CRM-Datensatz behalten; ursprünglichen Zweck und passende Grundlage dokumentieren |
| Aktive bilaterale Zusammenarbeit | Operative Beziehung auf b/e/f abbilden; keine automatische Serienmail-Einwilligung unterstellen |
| Alte Pflicht-Checkbox mit gespeichertem Wortlaut und Zeitpunkt | Als `legacy_single_opt_in` kennzeichnen; wegen Kopplungs- und Beweisrisiko für künftige Sammelversände gezielt bestätigen lassen |
| Nur öffentliche berufliche Quelle | Minimalen Datensatz auf e/f nach Prüfung; Art.-14-Information; keine pauschale Werbe-E-Mail |
| Quelle oder Rechtsgrund unklar | `review_required`; Nutzung bis Klärung beschränken |
| Private, sensible, abwertende oder sachfremde Angaben | löschen beziehungsweise nach dokumentierter Prüfung bereinigen |
| Widerruf/Widerspruch | aktiven Versand stoppen; minimale Sperr-/Nachweisinformation getrennt erhalten, solange erforderlich |

Eine erneute Bestätigung sollte freundlich als Qualitäts- und Präferenzabfrage gestaltet werden, nicht als dramatische „DSGVO-Reparatur“. Operative Kontakte müssen nicht auf die Bestätigung warten.

### 7.6 Lösch- und Prüfkonzept

Die DSGVO gibt für ein Stakeholder-CRM keine pauschale Monats- oder Jahresfrist vor; die Dauer folgt Zweck, Beziehung, gesetzlichen Pflichten und Rechtsverteidigungsinteressen. Art. 5 Abs. 1 lit. e verlangt jedoch, Daten nicht länger als erforderlich identifizierbar zu halten. [Art. 5 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

Als verhältnismäßiger Diskussionsvorschlag:

- **aktive Zusammenarbeit:** Erforderlichkeit jährlich automatisiert markieren; Datensatz bleibt während aktiver Beziehung bestehen;
- **selbst registrierte, aber inaktive Kontakte:** erste fachliche Prüfung nach 24 Monaten ohne bedeutsame Interaktion; Löschung oder Anonymisierung nach 36 Monaten ohne dokumentierten Fortführungsgrund;
- **nur öffentlich für eine einzelne Einladung erfasste Kontakte:** bei ausdrücklicher Absage oder vollständiger Nichtreaktion kurzfristig löschen; der EDPB nutzt für seine eigene Stakeholderpraxis einen besonders defensiven Ein-Monats-Benchmark. [EDPB-Verzeichnis der Verarbeitungstätigkeit „Stakeholder events“, Februar 2026](https://www.edpb.europa.eu/system/files/2026-02/edpb_dpo_record_stakeholders-events_february_2026_en.pdf);
- **öffentlich erfasste Kontakte mit dokumentiertem, fortbestehendem Netzwerk-/Aufgabenbedarf:** Prüfung nach 12 Monaten, Löschung spätestens nach 24 Monaten ohne tragfähigen Bedarf;
- **abgeschlossene Termine und Formate:** Detaildaten nach drei Jahren überprüfen; nur erforderliche Historie oder aggregierte Statistik erhalten;
- **ungeprüfte Fotos:** nicht importieren beziehungsweise kurzfristig entfernen;
- **nicht bestätigtes Opt-in:** nach kurzer technischen Frist löschen;
- **Einwilligungsnachweis und Sperrliste:** getrennt und minimal so lange speichern, wie Nachweis beziehungsweise Verhinderung erneuter Ansprache erforderlich ist; konkrete Frist mit Legal anhand Verjährung und Versandpraxis festlegen;
- **gesetzliche Aufbewahrung oder Rechtsstreit:** gezielte Sperre statt allgemeiner aktiver CRM-Nutzung.

Dies sind keine gesetzlich vorgeschriebenen Zahlen, sondern ein Startpunkt für eine dokumentierte Entscheidung. Entscheidend sind automatische Prüffälligkeiten, klare Verantwortlichkeit und eine tatsächlich ausgeführte Löschroutine.

### 7.7 Technik und Organisation

Vor Regelbetrieb sollten mindestens umgesetzt beziehungsweise dokumentiert sein:

- rollenbasierter Zugriff nach Zuständigkeit und Need-to-know;
- getrennte Rollen für Leserechte, Notizen, Exporte, Einwilligungsänderungen und Administration;
- Protokollierung kritischer Änderungen und Exporte;
- Verschlüsselung bei Übertragung und Speicherung, sichere Backups und Wiederherstellungstests;
- verbindliche Notiz- und Quellenrichtlinie;
- technische Versandsperre bei `withdrawn` und `objected`;
- Dubletten- und Berichtigungsprozess;
- sichere Lösch- und Anonymisierungsjobs;
- Auftragsverarbeitungsverträge nach Art. 28;
- Prüfung von Unterauftragsverarbeitern und Drittlandtransfers;
- Betroffenenrechte-Runbook für Auskunft, Berichtigung, Löschung, Widerspruch und Widerruf;
- VVT nach Art. 30 und angemessene TOM nach Art. 32. [Art. 28, 30 und 32 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

## 8. Vergleichbare CRM-Praxis

Die folgenden Beispiele sind **keine Rechtspräzedenzfälle**. Sie zeigen aber, dass differenzierte CRM- und Stakeholder-Verarbeitung in regulierten beziehungsweise gesundheitsnahen Umfeldern üblich ist und nicht vollständig auf Einwilligung gestützt wird.

| Organisation | Erkennbare Praxis | Übertragbarer Gedanke |
|---|---|---|
| [EDPB – Stakeholder Events, Meetings and Written Exchanges, Februar 2026](https://www.edpb.europa.eu/system/files/2026-02/edpb_sps_stakeholder_events_meetings_and_surveys_february_2026_en.pdf) | Der EDPB verarbeitet Stakeholderdaten zur Organisation, Durchführung und Nachbereitung auf Grundlage seiner öffentlichen Aufgabe; für eine dauerhafte Kontaktliste zu künftigen Initiativen und für veröffentlichte Fotos nutzt er dagegen Einwilligung | Besonders nahes Strukturbeispiel: operative Stakeholderverwaltung und Zukunftsverteiler sind getrennte Zwecke. Als EU-Organ gilt für den EDPB die VO (EU) 2018/1725; Grundlage und Fristen sind nicht 1:1 auf die gematik übertragbar |
| [Bayer – Datenschutz für Healthcare Professionals](https://documents.eu.truman.bayer.com/gb_ph/hcp/en/ps/data_privacy_statement) | CRM über berufliche Kontakte, Expertise, Interaktionen, Interessen und Präferenzen; berechtigte Interessen werden als Grundlage beschrieben | Berufliche Kontakt- und Beziehungshistorie kann getrennt von Marketingeinwilligung geführt werden |
| [Siemens Healthineers – Marketing Privacy Notice](https://www.siemens-healthineers.com/deu/corporate/marketing-privacy-notice) | Unterscheidung zwischen Einwilligung für regelmäßige Marketingkommunikation und berechtigten Interessen für angefragte Inhalte, Geschäftsbeziehungen und bestimmte öffentliche/andere Quellen | Split-Basis nach Zweck und Kanal |
| [Bosch – Datenschutzhinweise B2B](https://privacy.bosch.com/datenschutzhinweise_b2b.pdf) | Interessenten-/Geschäftspartnerbeziehung, interne Koordination und Kundenmanagementsysteme; je nach Zweck berechtigtes Interesse oder Einwilligung | Ansprechpartner:innen einer Organisation werden als eigener CRM-Verarbeitungskontext behandelt |
| [Hochschule München – CRM-Datenschutz](https://hm.edu/datenschutz/datenverarbeitung_crm.de.html) | CRM für Kontaktanfragen, Partner-/Interessentenbeziehungen und Kommunikation; Rechtsgrundlage wird an die öffentliche Hochschulaufgabe angebunden | Öffentliche Aufgaben können ein CRM tragen; Grundlage muss organisationsspezifisch zugeordnet werden |

Gemeinsame Muster:

1. CRM-/Beziehungsmanagement wird als eigener transparenter Zweck beschrieben.
2. Regelmäßige Marketingkommunikation wird von operativer Beziehungspflege getrennt.
3. Berufliche Rolle, Interaktionen und Interessen können zum CRM gehören.
4. Rechtsgrundlagen werden nach Zweck kombiniert.
5. Aufbewahrung, Widerspruch und Verantwortlichkeiten werden ausdrücklich beschrieben.

Das EDPB-Beispiel ist besonders anschaulich, weil es selbst bei einer Datenschutzinstitution nicht „Einwilligung für alles“ vorsieht: Die öffentliche Aufgabe trägt den konkreten Stakeholderprozess, während die fortlaufende Kontaktliste für künftige Initiativen separat einwilligungsbasiert ist. Die Beispiele belegen trotzdem nicht automatisch die Zulässigkeit des Versorgungskompasses. Sie zeigen jedoch, dass der vorgeschlagene Architekturansatz dem etablierten Umgang großer und öffentlicher Organisationen entspricht.

## 9. Risikomatrix

| Stufe | Verarbeitung | Bewertung und Maßnahme |
|---|---|---|
| **Grün** | selbst übermittelte berufliche Stammdaten, Organisation, Sektor, Zuständigkeit | erwartbar; b/e/f dokumentieren |
| **Grün** | Termin, Hospitation, Einladung und Teilnahme im laufenden Vorgang | zwecknah; Datenumfang und Löschung regeln |
| **Grün** | sachliche Gesprächsergebnisse und vereinbarte Folgeschritte | Notizrichtlinie, Autor:in/Datum, Zugriff |
| **Grün** | Einwilligungs-, Widerrufs- und Sperrnachweis | für Rechenschaft und Versandunterdrückung erforderlich; getrennt/minimal |
| **Gelb** | Ergänzung aus öffentlichen Praxis-/Klinikquellen | Aufgabenbezug/Erforderlichkeit beziehungsweise LIA, Art. 14, Quelle und Erwartbarkeit |
| **Gelb** | Themen- und Interessenkennzeichen | nur beruflich relevant, transparent, keine sensiblen Ableitungen |
| **Gelb** | Profilbilder | Notwendigkeit schwach; Rechte- und Quellenfreigabe |
| **Gelb** | Legacy-Single-Opt-in | dokumentierte Qualität prüfen; für Serienversand gezielt DOI nachholen |
| **Gelb** | manuelle Priorität | Kriterien und Zweck definieren; keine abwertende Personenbewertung |
| **Rot** | technisch erzwungene Einwilligung in weitere E-Mails | entkoppeln; Checkbox optional |
| **Rot** | Patientendaten oder Art.-9-Angaben in Freitexten | technisch/organisatorisch untersagen und bereinigen |
| **Rot** | Profilbilder aus Google/Website ohne Rechteprüfung | nicht kopieren |
| **Rot** | massenhafte E-Mail-Einladungen an öffentlich gefundene Adressen ohne Kanalprüfung | nicht versenden |
| **Rot** | verdecktes automatisiertes Personen-/Einflussscoring | nicht im Startumfang; gesonderte Profiling-/DSFA-Prüfung |
| **Rot** | Speicherung ohne Prüftermin oder Löschroutine | Review- und Löschjobs verbindlich machen |

## 10. Datenschutz-Folgenabschätzung

Art. 35 DSGVO verlangt eine DSFA, wenn eine Verarbeitung voraussichtlich ein hohes Risiko für Rechte und Freiheiten zur Folge hat, insbesondere bei umfangreicher systematischer Bewertung, erheblich wirkenden automatisierten Entscheidungen, großskaliger Verarbeitung besonderer Kategorien oder systematischer umfangreicher Überwachung. Die DSK-Muss-Liste nennt unter anderem bestimmte Big-Data-Anreicherungen und umfassende Profile; wegen der voraussichtlichen Einordnung als öffentliche Stelle des Bundes ist zusätzlich die BfDI-Liste maßgeblich zu prüfen. [Art. 35 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679), [DSK-Muss-Liste](https://www.datenschutzkonferenz-online.de/media/ah/20181017_ah_DSK_DSFA_Muss-Liste_Version_1.1_Deutsch.pdf), [BfDI-Liste nach Art. 35 Abs. 4 DSGVO](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Muster/Liste_VerarbeitungsvorgaengeArt35.pdf?__blob=publicationFile&v=7)

Für den hier empfohlenen Startumfang sprechen gegen ein voraussichtlich hohes Risiko:

- berufliche statt private Kontaktkontexte;
- keine Patient:innen- oder sonstigen besonderen Kategorien;
- keine flächendeckende Beobachtung;
- keine ausschließlich automatisierten erheblichen Entscheidungen;
- begrenzte interne Empfänger;
- Widerspruch, Rollenrechte, Löschung und Minimierung.

Risikosteigernd wären dagegen:

- sehr große, quellenübergreifend angereicherte Bestände;
- systematische Verhaltens-, Einfluss- oder Kooperationsscores;
- sensible Freitexte;
- automatisierte Auswahl mit realen Nachteilen;
- umfangreiche Social-Media- oder Web-Scraping-Verfahren.

Empfehlung: Vor Produktivstart ein zwei- bis dreiseitiges **DSFA-Threshold Assessment** anhand Datenumfang, Betroffenenzahl, Quellen, Profiling, Folgen und Garantien dokumentieren. Das voraussichtliche Ergebnis ist für den beschriebenen minimierten Startumfang „keine vollständige DSFA erforderlich“. Ändert sich der Umfang in eine der risikosteigernden Richtungen, ist die Prüfung neu zu öffnen. Diese Einschätzung ersetzt nicht die konkrete Prüfung mit realen Mengen, Systemen und Rollen.

## 11. Gegenargumente – und belastbare Antworten

### „Ohne Einwilligung darf gar nichts ins CRM.“

Das ist rechtlich zu pauschal. Art. 6 DSGVO stellt sechs Grundlagen bereit. Für den aufgabengebundenen Versorgungskompass spricht voraussichtlich Art. 6 Abs. 1 lit. e in Verbindung mit § 3 BDSG und § 311 SGB V. Eine Einwilligung ist für freiwillige weitergehende E-Mail-Kommunikation passend, nicht zwingend für die Bearbeitung eines selbst eingereichten Angebots oder eine erforderliche, transparente professionelle Beziehungsverwaltung. [Art. 6 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679), [§ 3 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__3.html)

### „Die bestehende Einwilligung deckt doch alles.“

Nein. Sie nennt die Verwendung der Kontaktdaten für E-Mail-Informationen und Einladungen zu #Mitmachen. Sie ist keine hinreichend bestimmte Grundlage für beliebige interne Notizen, öffentliche Anreicherung, Fotos oder Scoring. Außerdem ist sie entgegen dem Datenschutzhinweis technisch Pflicht. Die bessere Lösung ist nicht ein noch breiterer Checkboxtext, sondern die Trennung der Verarbeitungszwecke.

### „Öffentliche Daten sind frei nutzbar.“

Auch das ist zu pauschal. Beruflich öffentliche Angaben bleiben regelmäßig personenbezogen. Öffentlichkeit verbessert die Interessenabwägung und Erwartbarkeit, ersetzt aber weder Rechtsgrundlage noch Art.-14-Information, Minimierung, Richtigkeit und Quellprüfung. Bei Fotos kommen eigenständige Rechte hinzu.

### „Ohne Double-Opt-in sind sämtliche vorhandenen Kontakte zu löschen.“

Nein. Double-Opt-in ist vor allem ein Beweis- und Adressverifikationsverfahren für die Einwilligung in elektronische Kommunikation. Ein fehlendes DOI sagt nicht automatisch, dass operative Kontaktdaten oder eine bestehende Zusammenarbeit rechtswidrig gespeichert sind. Es begründet aber ein Nachweisrisiko für künftige weitergehende E-Mail-Serien. Deshalb: Altbestand klassifizieren, Versandberechtigung differenzieren und dort gezielt bestätigen lassen.

### „Interne Notizen sind generell zu riskant.“

Ein CRM ohne Gesprächsergebnis und Folgeschritt verfehlt seinen Zweck. Das Risiko wird nicht durch ein Totalverbot, sondern durch strukturierte Felder, klare Sprachregeln, Rollenrechte, Audit und Löschung beherrscht. Unzulässig bleiben sensible, private, sachfremde oder abwertende Inhalte.

### „Bei einer Gesundheitsorganisation ist jede Angabe besonders sensibel.“

Die Sensitivität richtet sich nach dem Inhalt, nicht nach dem Sektor. Die berufliche Funktion eines Arztes ist nicht automatisch dessen Gesundheitsdatum. Patient:innenfälle oder Gesundheitsangaben über die Kontaktperson wären dagegen besonders geschützt und gehören nicht in dieses CRM.

### „Die Datenschutzbeauftragte muss das Projekt genehmigen.“

Die beziehungsweise der Datenschutzbeauftragte berät und überwacht unabhängig. Die datenschutzrechtliche Verantwortung und Rechenschaftspflicht bleibt beim Verantwortlichen beziehungsweise der Leitung. Ein konstruktiver Prozess legt deshalb eine dokumentierte Lösung zur Beratung vor und bittet um Prüfung der Rechtsgrundlagen, Garantien und Restrisiken – nicht um eine abstrakte Erlaubnis, „ob CRM erlaubt ist“. [Art. 38 und 39 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679), [BfDI Info 4 zum Datenschutzbeauftragten](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO4.pdf?__blob=publicationFile&v=24)

## 12. Gesprächsvorlage für Datenschutz und Legal

### 12.1 Empfohlener Einstieg

> Wir wollen den Versorgungskompass als internes, zugriffsgesteuertes Beziehungs- und Prozessmanagement für das bereits öffentlich beschriebene Versorgungsnetzwerk einführen. Unser Vorschlag ist keine pauschale Einwilligung für sämtliche CRM-Vorgänge. Wir trennen operative Kontaktverwaltung, weitergehende E-Mail-Einladungen und Ergänzungen aus beruflich öffentlichen Quellen. Wir haben die erkennbaren Risiken bereits in konkrete Kontrollen übersetzt und möchten mit Ihnen Rechtsgrundlagen, Aufgabenzuordnung und Restrisiken finalisieren.

### 12.2 Entscheidungspaket statt abstrakter Erlaubnisfrage

Dem Gespräch sollten fünf konkrete Entscheidungspunkte vorgelegt werden:

1. **Aufgaben-Mapping:** Welche operative Verarbeitung beruht auf Art. 6 Abs. 1 lit. e in Verbindung mit welcher SGB-V-Aufgabe, welche auf lit. f und welche auf lit. b?
2. **Kommunikationsgrenze:** Welche Nachrichten gelten als operative Vorgangskommunikation, welche als weitergehende #Mitmachen-Kommunikation mit Einwilligung/DOI?
3. **Transparenz:** Freigabe des Art.-13-/Art.-14-Bausteins einschließlich öffentlicher Quellen, Notizen und Interaktionshistorie.
4. **Lebenszyklus:** Zustimmung zu Prüf- und Löschfristen, Legacy-Migration und minimaler Sperrliste.
5. **Risiko:** Bestätigung beziehungsweise Ergänzung der DSFA-Schwellenprüfung und der Foto-/Scoring-Grenzen.

### 12.3 Formulierung der vorgeschlagenen Entscheidung

> Der Versorgungskompass wird für die koordinierte Zusammenarbeit mit beruflichen Ansprechpartner:innen eingeführt. Vor dem Regelbetrieb werden (a) die optionale #Mitmachen-Einwilligung technisch vom Hospitationsformular entkoppelt, (b) ein Double-Opt-in für weitergehende E-Mail-Kommunikation umgesetzt, (c) Rechtsgrundlagen und Aufgabenbezug pro Zweck dokumentiert, (d) Datenschutzhinweise nach Art. 13/14 ergänzt, (e) Notiz-, Quellen-, Foto- und Löschregeln verbindlich gemacht und (f) Rollenrechte, Auftragsverarbeitung sowie DSFA-Schwelle geprüft. Patient:innendaten, besondere Kategorien und automatisiertes Personen-Scoring sind nicht Teil des Startumfangs.

### 12.4 Unterlagen für das Gespräch

- einseitiges Datenflussbild vom Formular bis CRM und E-Mail-Versand;
- die Zweck-/Rechtsgrundlagenmatrix aus Kapitel 5;
- Entwurf des Datenschutzhinweises;
- Entwurf der Interessenabwägung beziehungsweise des Aufgaben-Mappings;
- Datenfeldliste mit Pflicht/freiwillig, Quelle, Rechtsgrund, Zugriff und Löschregel;
- Rollen- und Berechtigungsmatrix;
- Dienstleister-/AVV-Liste und Transferprüfung;
- DSFA-Schwellenvermerk;
- Legacy-Migrationszahlen nach den Kategorien aus Kapitel 7.5;
- drei reale, anonymisierte Beispielnotizen zur Prüfung der Notizrichtlinie.

## 13. Umsetzungsplan

### Phase 1 – sofort, vor weiterer Bewerbung des Formulars

- Pflichtattribut der #Mitmachen-Checkbox entfernen.
- Formular- und Datenschutzerklärungstext angleichen.
- exakten Einwilligungsnachweis versionieren.
- weitergehenden Versand bis zur geklärten Legacy- und DOI-Regel nur an belastbar berechtigte Kontakte senden.

### Phase 2 – vor produktiver CRM-Nutzung

- Aufgaben-Mapping und/oder LIA finalisieren.
- VVT und Datenschutzhinweis ergänzen.
- Datenmodell für Rechtsgrund, E-Mail-Berechtigung, Verifikation, Quelle und Art.-14-Nachweis erweitern.
- Rollen, TOM, AVV und Drittlandprüfung abschließen.
- Notiz-, Foto-, Quellen- und Löschregeln implementieren.
- DSFA-Schwellenprüfung dokumentieren.

### Phase 3 – kontrollierte Migration

- Altbestände nach Herkunft und Nachweisqualität klassifizieren.
- Pflicht-Checkbox-Kontakte als Legacy-Single-Opt-in kennzeichnen.
- aktive Beziehungen operativ weiterführen.
- für weitergehende Serienkommunikation gezielt DOI beziehungsweise Präferenzbestätigung einholen.
- unklare, private, sensible und veraltete Daten bereinigen.

### Phase 4 – Regelbetrieb

- regelmäßiger Rechte- und Exportreview;
- jährliche Datenqualitäts-/Löschprüfung;
- Stichproben von Notizen;
- Zustell-, Widerrufs- und Beschwerdeauswertung;
- neue Datenfelder, Quellen und Automatisierungen nur nach Privacy-by-Design-Change-Check;
- erneute DSFA-Prüfung bei Scoring, großskaliger Anreicherung oder sensiblen Daten.

## 14. Gesamtfazit

Die richtige Fragestellung lautet nicht „Dürfen wir ein CRM haben?“, sondern „Welche Verarbeitung braucht für welchen Zweck welche Grundlage und welche Leitplanke?“ Unter dieser Betrachtung ist der Versorgungskompass gut gestaltbar:

- **Ja** zu einem internen professionellen Kontakt- und Beziehungsmanagement.
- **Ja** zu sachlichen Notizen, Terminen, Einladungs- und Teilnahmeverläufen.
- **Ja, mit Transparenz und Abwägung** zu gezielter Ergänzung aus beruflich öffentlichen Quellen.
- **Ja, optional und rechtegeprüft** zu Profilbildern.
- **Gesondertes Opt-in, vorzugsweise DOI** für weitergehende wiederkehrende #Mitmachen-E-Mails.
- **Nein** zu gekoppelter Pflicht-Einwilligung, Patientendaten, privaten/sensiblen Dossiers, ungeklärten Bildern, unbefristeter Vorratsspeicherung und verdecktem Personen-Scoring.

Der heutige Formularfehler ist konkret, begrenzt und leicht behebbar. Er ist kein Grund, das CRM-Projekt defensiv zu stoppen. Ein überzeugender Vorschlag an Datenschutz und Legal ist deshalb: **Einführung beschließen, Zwecke trennen, Pflicht-Checkbox korrigieren, Transparenz erweitern und die wenigen gelben/roten Funktionen technisch begrenzen.**

## 15. Quellenübersicht

### Primärrecht und Rechtsprechung

- [Datenschutz-Grundverordnung, konsolidierter deutscher Text](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)
- [§ 2 BDSG – öffentliche und nichtöffentliche Stellen](https://www.gesetze-im-internet.de/bdsg_2018/__2.html)
- [§ 3 BDSG – Verarbeitung durch öffentliche Stellen](https://www.gesetze-im-internet.de/bdsg_2018/__3.html)
- [§ 7 UWG – unzumutbare Belästigungen](https://www.gesetze-im-internet.de/uwg_2004/__7.html)
- [§ 310 SGB V – Gesellschaft für Telematik](https://www.gesetze-im-internet.de/sgb_5/__310.html)
- [§ 311 SGB V – Aufgaben der Gesellschaft für Telematik](https://www.gesetze-im-internet.de/sgb_5/__311.html)
- [§ 313 SGB V – elektronischer Verzeichnisdienst](https://www.gesetze-im-internet.de/sgb_5/__313.html)
- [§ 16 UrhG – Vervielfältigungsrecht](https://www.gesetze-im-internet.de/urhg/__16.html)
- [§ 22 KunstUrhG – Bildnisse](https://www.gesetze-im-internet.de/kunsturhg/__22.html)
- [EuGH, Urteil vom 04.10.2024 – C-621/22, KNLTB](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX%3A62022CJ0621)
- [BGH, Urteil vom 10.02.2011 – I ZR 164/09, Double-Opt-in-Verfahren](https://juris.bundesgerichtshof.de/cgi-bin/bgh_notp/document.py?Art=en&Datum=2011-2&Gericht=bgh&Sort=1024&anz=294&pos=30)
- [BVerwG, Urteil vom 29.01.2025 – 6 C 3.23, Zahnarztpraxen/Telefonwerbung](https://www.bverwg.de/de/290125U6C3.23.0)

### Aufsichtsbehördliche Orientierung

- [EDPB: Personenbezogene Daten rechtmäßig verarbeiten](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_de)
- [EDPB: Consent under GDPR, Zusammenfassung Mai 2026](https://www.edpb.europa.eu/system/files/2026-04/edpb-summary-consent_en.pdf)
- [EDPB Guidelines 1/2024 zu Art. 6 Abs. 1 lit. f](https://www.edpb.europa.eu/public-consultations/guidelines-12024-on-processing-of-personal-data-based-on-article-61f-gdpr_en)
- [EDPB One-Stop-Shop Case Digest zu berechtigten Interessen, 26.03.2026](https://www.edpb.europa.eu/documents/support-pool-of-experts/one-stop-shop-case-digest-on-the-legal-basis-of-legitimate_en)
- [DSK-Orientierungshilfe Direktwerbung, 18.02.2022](https://www.datenschutzkonferenz-online.de/media/oh/OH-Werbung_Februar%202022_final.pdf)
- [DSK-Liste der Verarbeitungstätigkeiten mit DSFA-Pflicht](https://www.datenschutzkonferenz-online.de/media/ah/20181017_ah_DSK_DSFA_Muss-Liste_Version_1.1_Deutsch.pdf)
- [BfDI-Liste der Verarbeitungsvorgänge mit DSFA-Pflicht](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Muster/Liste_VerarbeitungsvorgaengeArt35.pdf?__blob=publicationFile&v=7)
- [BfDI: Informationspflichten nach Art. 13 und 14](https://www.bfdi.bund.de/DE/Buerger/Inhalte/Allgemein/Datenschutz/Informationspflichten.html)
- [BfDI Info 4: Die Datenschutzbeauftragten in Behörde und Betrieb](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO4.pdf?__blob=publicationFile&v=24)
- [BayLDA, 8. Tätigkeitsbericht: Kontaktformulare, S. 56–57](https://lda.bayern.de/media/baylda_report_08.pdf)
- [BayLDA: Verantwortliche Datenverwendung für Werbung und Double-Opt-in](https://www.lda.bayern.de/media/veroeffentlichungen/Info-Blatt_Verantwortliche_Datenverwendung_Werbung_DS-GVO_4-2019.pdf)
- [CNIL: Empfehlungen zur Wiederverwendung veröffentlichter Internetdaten](https://www.cnil.fr/fr/recommandations-reutilisateurs-donnees-internet)
- [CNIL: Freitext- und Kommentarfelder](https://cnil.fr/fr/zones-bloc-note-et-commentaires-les-bons-reflexes-pour-ne-pas-deraper)

### Ist-Zustand und Vergleichspraxis

- [gematik: Versorgungsnetzwerk-Formular](https://www.gematik.de/mitmachen/versorgungs-netzwerk)
- [gematik: Datenschutzerklärung](https://www.gematik.de/datenschutz)
- [EDPB: Stakeholder events, meetings and written exchanges, Februar 2026](https://www.edpb.europa.eu/system/files/2026-02/edpb_sps_stakeholder_events_meetings_and_surveys_february_2026_en.pdf)
- [Bayer: Datenschutzhinweis für Healthcare Professionals](https://documents.eu.truman.bayer.com/gb_ph/hcp/en/ps/data_privacy_statement)
- [Siemens Healthineers: Marketing Privacy Notice](https://www.siemens-healthineers.com/deu/corporate/marketing-privacy-notice)
- [Bosch: Datenschutzhinweise B2B](https://privacy.bosch.com/datenschutzhinweise_b2b.pdf)
- [Hochschule München: Datenverarbeitung im CRM](https://hm.edu/datenschutz/datenverarbeitung_crm.de.html)

## 16. Rechtlicher und methodischer Vorbehalt

Diese Ausarbeitung ist eine fachliche Recherche- und Entscheidungsvorlage, keine anwaltliche Einzelfallberatung. Die endgültige Beurteilung hängt insbesondere von der konkreten Zuordnung des Versorgungsnetzwerks zu den gesetzlichen Aufgaben der gematik, realen Datenmengen, Kommunikationsinhalten, Systemanbietern, Zugriffen, Auftragsverarbeitern, Transfers, Einwilligungsprotokollen und Altbeständen ab. Gesetzes- und Webstand wurden bis zum 27. Juli 2026 geprüft.

Die Recherche, Strukturierung und Formulierung wurden KI-gestützt erstellt. Quellen, tatsächliche Annahmen und die organisationsspezifische Rechtsgrundlagenzuordnung sollten vor einer formalen Freigabe durch gematik Legal und die beziehungsweise den Datenschutzbeauftragten verifiziert werden.
