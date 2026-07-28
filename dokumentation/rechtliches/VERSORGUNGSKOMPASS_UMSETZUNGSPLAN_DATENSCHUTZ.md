# Versorgungskompass: konkreter Datenschutz-Umsetzungsplan

**Stand:** 27. Juli 2026

**Status:** Nicht freigegebener Arbeits- und Prüfstand für Fachbereich, Legal, Datenschutz, Webteam, IAM und Informationssicherheit

> **Prüfhinweis:** Die als „copy-ready“ bezeichneten Passagen sind redaktionelle Entwürfe und dürfen erst nach fachlicher, rechtlicher und technischer Prüfung veröffentlicht oder produktiv umgesetzt werden. Organisationsspezifische Annahmen, konkrete Empfänger, Dienstleister, Fristen und Systemgrenzen sind vor der Freigabe zu bestätigen.

Dieser Plan konkretisiert die [umfassende juristische Recherche](VERSORGUNGSKOMPASS_DATENSCHUTZ_EINWILLIGUNG_RECHERCHE.md). Er baut auf folgenden fachlichen Prämissen auf:

- Der Versorgungskompass dient der Einbeziehung von Leistungserbringern in die praxisnahe Erprobung, Einführung und Weiterentwicklung der Telematikinfrastruktur.
- Die gematik handelt dabei im Rahmen ihrer gesetzlichen Aufgaben und nicht im Wettbewerb.
- Hauptzweck ist ein transparentes, gemeinsames und zugriffsgesteuertes Kontakt- und Prozessmanagement; Patient:innendaten sind nicht Teil des CRM.
- Es sind keine allgemeinen Massenmailings geplant. Künftige, über den konkreten Hospitationsvorgang hinausgehende #Mitmachen-Einladungen sollen trotzdem als eigener Kommunikationszweck behandelt werden.

## 1. Empfohlene Entscheidung

Der Versorgungskompass sollte eingeführt werden. Das datenschutzrechtliche Zielbild lautet:

1. **Operativer CRM-Kern:** Art. 6 Abs. 1 lit. e und Abs. 3 DSGVO in Verbindung mit § 3 BDSG, § 306 Abs. 1 und § 311 Abs. 1 Satz 1 Nr. 13 SGB V. Soweit Rückmeldungen tatsächlich in funktionale oder technische Vorgaben beziehungsweise notwendige Testmaßnahmen einfließen, kommen fallbezogen Nr. 1 Buchst. a und d hinzu. Soweit ein konkretes Beteiligungsformat nachweislich der Umsetzung oder Fortschreibung der Digitalisierungsstrategie dient, kommt ergänzend Nr. 17 in Betracht. Grenze bleibt § 311 Abs. 4 SGB V.
2. **Zusätzliche künftige #Mitmachen-E-Mails:** freiwillige Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO, technisch vom Kernzweck getrennt und mit Double-Opt-in nachgewiesen.
3. **Interner Zugriff:** nicht aufgrund der Einwilligung, sondern aufgrund der jeweiligen dienstlichen Aufgabe, dokumentierter Weisungen und des Need-to-know-Prinzips.
4. **Öffentliche Berufsangaben:** nur zweckbezogen, mit Quellenvermerk, Transparenz nach Art. 14 DSGVO und ohne private oder sachfremde Anreicherung.
5. **Freitext und Bilder:** sachliche Notizregeln; Profilbild nur optional und mit dokumentierter Quellen- und Nutzungsberechtigung.

Die gesetzliche Aufgabenbasis ist substanziell: § 311 Abs. 1 Satz 1 Nr. 13 SGB V nennt ausdrücklich die „Planung, Durchführung und Unterstützung der Erprobungs- und Einführungsphasen von Anwendungen“. § 311 Abs. 4 begrenzt die Aufgabenerfüllung zugleich auf das für eine interoperable, kompatible und sichere TI Erforderliche. Deshalb sollte jedes Beteiligungsformat intern einer konkreten §-311-Aufgabe zugeordnet werden. [§ 311 SGB V](https://www.gesetze-im-internet.de/sgb_5/__311.html)

Unter den noch organisationsintern zu bestätigenden Annahmen, dass die Verarbeitung einer gesetzlichen Verwaltungsaufgabe dient und nicht in einem abgrenzbaren Wettbewerbsbereich stattfindet, spricht viel für eine Einordnung der gematik als öffentliche Stelle des Bundes nach § 2 Abs. 3 BDSG. § 310 Abs. 2 Nr. 1 SGB V weist dem Bund 51 Prozent der Anteile zu. Die konkrete Einordnung, der Aufgabenbezug und die mögliche Ausnahme nach § 2 Abs. 5 BDSG müssen gematik Legal und Datenschutz vor einer formalen Freigabe bestätigen. [§ 2 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__2.html), [§ 310 SGB V](https://www.gesetze-im-internet.de/sgb_5/__310.html)

Das Bundesverwaltungsgericht hat bestätigt, dass Art. 6 Abs. 1 lit. e DSGVO bei Verarbeitungen geringer Eingriffsintensität durch § 3 BDSG als Brückennorm und das jeweilige Fachrecht ausgefüllt werden kann, ohne dass jeder einzelne technische Verarbeitungsschritt ausdrücklich im Fachgesetz stehen muss. Entscheidend bleiben Aufgabenbezug, Erforderlichkeit, Datenminimierung und wirksame Garantien. [BVerwG, Urteil vom 20.03.2024 – 6 C 8.22, insbesondere Rn. 27–31, 38 und 44–47](https://www.bverwg.de/de/200324U6C8.22.0)

Als besonders nahes Behördenbeispiel trennt der Europäische Datenschutzausschuss selbst seit Februar 2026 genauso: Organisation, Durchführung und Nachbereitung von Stakeholderformaten beruhen auf der öffentlichen Aufgabe; erst die dauerhafte Liste für künftige Initiativen beruht auf Einwilligung. Das Beispiel gilt unter dem Datenschutzrecht für EU-Institutionen und ist nicht unmittelbar die Rechtsgrundlage der gematik, bestätigt aber die vorgeschlagene Zweckarchitektur. [EDPB-Verarbeitungsverzeichnis „Stakeholder events, meetings and written exchanges“, Februar 2026](https://www.edpb.europa.eu/system/files/2026-02/edpb_dpo_record_stakeholders-events_february_2026_en.pdf)

### 1.1 Warum das CRM das verhältnismäßige Arbeitsmittel ist

Telefon, Einzel-E-Mail und dezentrale Notizen sind kein datenschutzrechtlich „milderes Mittel“, wenn dieselben Informationen dort ebenfalls verarbeitet werden. Sie erzeugen typischerweise mehr Kopien, uneinheitliche Datenstände, unklare Zuständigkeiten und schlechter kontrollierbare Löschungen. Ein zentraler Versorgungskompass kann demgegenüber:

- den Datenumfang standardisieren und minimieren;
- Zuständigkeiten und Zweckbindungen sichtbar machen;
- Dubletten und unkontrollierte Schattenlisten vermeiden;
- Zugriffe, Exporte, Änderungen und Löschungen technisch steuern;
- Widerrufe, Widersprüche und Kontaktsperren zuverlässig organisationsweit umsetzen.

Für den internen Aufgaben- und Erforderlichkeitsvermerk wird folgende Formulierung empfohlen:

> Die strukturierte Verarbeitung im Versorgungskompass ist zur Erfüllung der Aufgaben nach § 306 Abs. 1 und § 311 Abs. 1 Satz 1 Nr. 13 SGB V erforderlich. Die gematik muss geeignete Leistungserbringer und Versorgungseinrichtungen identifizieren, fachlich zuordnen, anlassbezogen kontaktieren sowie Erprobungs-, Einführungs- und Beteiligungsprozesse planen, durchführen und nachbereiten können. Eine ausschließlich dezentrale Bearbeitung über Telefon, Einzelpostfächer und persönliche Notizen erreicht diesen Zweck nicht gleich wirksam und führt zu zusätzlichen, schlechter kontrollierbaren Datenkopien. Der Versorgungskompass begrenzt die Verarbeitung auf berufliche Kontaktdaten und erforderliche Prozessinformationen und ermöglicht zentrale Zugriffs-, Berichtigungs-, Widerspruchs- und Löschkontrollen. Soweit Rückmeldungen in funktionale oder technische Vorgaben beziehungsweise notwendige Testmaßnahmen einfließen, wird zusätzlich § 311 Abs. 1 Satz 1 Nr. 1 Buchst. a und d dokumentiert; soweit die Einbindung der Umsetzung oder Fortschreibung der Digitalisierungsstrategie dient, zusätzlich Nr. 17. Die Begrenzung des § 311 Abs. 4 wird durch Datenminimierung, Zweckbindung und die beschriebenen Zugriffskontrollen umgesetzt.

## 2. Exakte Änderung der Datenschutzerklärung

Aktuell stehen die einschlägigen Angaben auf [gematik.de/datenschutz](https://www.gematik.de/datenschutz) unter:

- „Kontaktformulare und E-Mail auf Klick“, Ziffer 2 „Kontaktformular ‚Versorgungs-Netzwerk‘“;
- „#Mitmachen – Einwilligung zur Kontaktaufnahme für Beteiligungsformate“.

### 2.1 Änderungslandkarte

| Stelle auf der aktuellen Seite | Maßnahme |
|---|---|
| Ziffer 2 „Kontaktformular ‚Versorgungs-Netzwerk‘“ | Überschrift in „Kontaktformular ‚Versorgungs-Netzwerk‘ und Versorgungskompass“ ändern und den bisherigen Text vollständig durch Abschnitt 2.2 ersetzen |
| Abschnitt „#Mitmachen – Einwilligung zur Kontaktaufnahme für Beteiligungsformate“ | Die Hospitationskontaktaufnahme zum eingereichten Angebot aus dem Einwilligungszweck herausnehmen und den Abschnitt durch 2.3 ersetzen |
| Beginn des neuen Versorgungskompass-Abschnitts | Stabile HTML-ID `versorgungs-netzwerk-datenschutz` setzen |
| Beginn des neuen Einwilligungsabschnitts | Stabile HTML-ID `mitmachen-e-mail-einwilligung` setzen |
| Allgemeine Löschformulierung bei Kontaktformularen | Für den Versorgungskompass die konkretere Prüf- und Regelfrist aus 2.2 verwenden |
| Empfängerangaben | Funktionsbezogene interne Zugriffe und eingesetzte Auftragsverarbeiter ergänzen |

### 2.2 Copy-ready Ersatztext für „Kontaktformular Versorgungs-Netzwerk“

> **2. Kontaktformular „Versorgungs-Netzwerk“ und Versorgungskompass**
>
> Über das Formular „Versorgungs-Netzwerk“ können Sie Ihre Einrichtung für unser Versorgungs-Netzwerk registrieren und uns insbesondere eine Hospitation anbieten. Wir verarbeiten Ihre Angaben, um Ihr Angebot zu prüfen, bei einer fachlich passenden Gelegenheit mit Ihnen Kontakt aufzunehmen und die Zusammenarbeit mit Leistungserbringern im Rahmen von Erprobungs-, Einführungs- und Weiterentwicklungsprozessen der Telematikinfrastruktur zu planen, durchzuführen und nachzubereiten.
>
> Hierzu führen wir die Angaben in unserem internen Versorgungskompass. Der Versorgungskompass ist ein Kontakt- und Arbeitsinstrument der gematik. Darin verarbeiten wir die von Ihnen mitgeteilten Kontakt- und Organisationsdaten, insbesondere E-Mail-Adresse, Name, Einrichtung und Sektor, sowie – soweit für die Zusammenarbeit erforderlich – Ihre berufliche Rolle, fachliche Themen und Interessen, zuständige gematik-Mitarbeitende, Kontaktanlässe, vereinbarte Termine und Folgeschritte, Einladungs- und Teilnahmestatus sowie sachliche Ergebnisse der Zusammenarbeit.
>
> Zur Zuordnung und Aktualisierung können wir berufsbezogene Angaben aus öffentlich zugänglichen Quellen ergänzen, insbesondere aus offiziellen Verzeichnissen sowie den Websites Ihrer Einrichtung oder Praxis. Wir dokumentieren dabei die Quelle und das Abrufdatum. Private Informationen, Patient:innendaten und besondere Kategorien personenbezogener Daten, insbesondere Gesundheitsdaten der Kontaktperson, sind nicht Gegenstand des Versorgungskompasses.
>
> Die Verarbeitung erfolgt zur Wahrnehmung der gesetzlichen Aufgaben der gematik auf Grundlage von Art. 6 Abs. 1 lit. e und Abs. 3 DSGVO in Verbindung mit § 3 BDSG, § 306 Abs. 1 und § 311 Abs. 1 Satz 1 Nr. 13 SGB V. Soweit Rückmeldungen in funktionale oder technische Vorgaben beziehungsweise notwendige Testmaßnahmen einfließen, gilt ergänzend § 311 Abs. 1 Satz 1 Nr. 1 Buchst. a und d SGB V. Soweit ein konkretes Beteiligungsformat der Umsetzung oder Fortschreibung der Digitalisierungsstrategie dient, gilt ergänzend § 311 Abs. 1 Satz 1 Nr. 17 SGB V. Die Aufgabenbegrenzung nach § 311 Abs. 4 SGB V bleibt unberührt.
>
> Im Formular ist die Angabe Ihrer E-Mail-Adresse erforderlich, damit wir Ihr Angebot bearbeiten und Sie hierzu kontaktieren können. Die weiteren im Formular gekennzeichneten Angaben sind freiwillig. Ohne eine erreichbare E-Mail-Adresse können wir das Hospitationsangebot nicht bearbeiten.
>
> Innerhalb der gematik erhalten nur solche Beschäftigten Zugriff, die die Daten für den Betrieb des Versorgungs-Netzwerks, die Zuordnung und Betreuung von Kontakten, die Planung oder Durchführung eines konkreten Beteiligungsformats, die Datenqualität oder die Bearbeitung Ihrer Datenschutzrechte benötigen. Von uns eingesetzte IT- und Kommunikationsdienstleister erhalten Zugriff nur, soweit dies zur Erbringung ihrer vertraglich festgelegten Leistungen erforderlich ist; sie werden als Auftragsverarbeiter nach Art. 28 DSGVO weisungsgebunden eingesetzt. Ein Verkauf der Kontaktdaten oder eine Weitergabe für fremde Werbezwecke findet nicht statt.
>
> Wir prüfen mindestens jährlich, ob die Daten für die genannten Aufgaben noch erforderlich und richtig sind. Ohne einen dokumentierten fortbestehenden Aufgabenbezug löschen oder anonymisieren wir den CRM-Datensatz grundsätzlich spätestens drei Jahre nach dem letzten inhaltlich relevanten Kontakt oder der letzten Teilnahme. Nicht übernommene oder abschließend abgelehnte Registrierungen löschen wir grundsätzlich sechs Monate nach Abschluss der Prüfung. Gesetzliche Aufbewahrungspflichten, die Erforderlichkeit zur Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen sowie ein minimaler Nachweis von Widersprüchen oder Kontaktsperren bleiben unberührt.
>
> Es findet keine ausschließlich automatisierte Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung statt. Sie können einer auf Art. 6 Abs. 1 lit. e DSGVO gestützten Verarbeitung aus Gründen, die sich aus Ihrer besonderen Situation ergeben, nach Art. 21 Abs. 1 DSGVO widersprechen. Weitere Betroffenenrechte und die Kontaktdaten unseres Datenschutzbeauftragten finden Sie in den allgemeinen Abschnitten dieser Datenschutzerklärung.
>
> Ob Sie zusätzlich E-Mails zu weiteren #Mitmachen-Formaten erhalten möchten, entscheiden Sie freiwillig. Diese Einwilligung ist keine Voraussetzung für die Registrierung, die Prüfung Ihres Hospitationsangebots oder eine hierzu passende Kontaktaufnahme.

Die genannten Fristen sind ein vertretbarer Policy-Vorschlag, keine unmittelbar gesetzlich festgeschriebenen Fristen. Sie sollten vor Veröffentlichung mit dem tatsächlichen fachlichen Auswahlzyklus und bestehenden Aufbewahrungsregeln abgeglichen werden.

Redaktionelle Regel: In der veröffentlichten Fassung werden nur die tatsächlich genutzten Aufgabennormen genannt. Wenn zum Start ausschließlich Erprobungs- und Einführungsphasen nach Nr. 13 unterstützt werden, entfallen die konditionalen Sätze zu Nr. 1 und Nr. 17. Diese Nummern sind keine vorsorglichen Reservegrundlagen, sondern müssen jeweils durch das interne Aufgaben-Mapping belegt sein.

### 2.3 Copy-ready Ersatztext für den #Mitmachen-Abschnitt

> **#Mitmachen – freiwillige Einwilligung in zusätzliche E-Mail-Einladungen**
>
> An verschiedenen Stellen unserer Webseite haben Sie die Möglichkeit, freiwillig einzuwilligen, zusätzliche Informationen und Einladungen zu Beteiligungsformaten der gematik per E-Mail zu erhalten.
>
> Wenn Sie sich über das Formular „Versorgungs-Netzwerk“ registrieren, ist davon die Bearbeitung Ihres eingereichten Hospitationsangebots zu unterscheiden: Rückfragen zu diesem Angebot, die Kontaktaufnahme bei einer hierzu passenden Hospitation, Terminabstimmungen und die Nachbereitung des konkreten Vorgangs erfolgen unabhängig von der nachfolgenden Einwilligung.
>
> Mit Ihrer freiwilligen Einwilligung dürfen wir die von Ihnen angegebenen Kontaktdaten und fachlichen Zuordnungsmerkmale, insbesondere Name, E-Mail-Adresse, Einrichtung, Sektor, Berufsgruppe und Themeninteressen, verwenden, um Sie per E-Mail über weitere fachlich passende #Mitmachen-Formate zu informieren und dazu einzuladen. Hierzu gehören:
>
> - Austauschrunden in digitaler Form oder vor Ort;
> - Online-Kommentierungen von Konzepten, Unterlagen oder Demonstratoren;
> - Sprechstunden, Foren und vergleichbare Angebote für Leistungserbringer;
> - Anfragen, ob Sie als Testimonial oder für ein Praxisbeispiel zu einer TI-Anwendung mitwirken möchten.
>
> Eine tatsächliche Veröffentlichung von Namen, Aussagen, Bild- oder Tonaufnahmen als Testimonial erfolgt nicht aufgrund dieser Kontakt-Einwilligung, sondern nur nach einer gesonderten, anlassbezogenen Vereinbarung beziehungsweise Einwilligung.
>
> Rechtsgrundlage für diese zusätzliche E-Mail-Kommunikation ist Art. 6 Abs. 1 lit. a DSGVO. Die Einwilligung ist freiwillig und keine Voraussetzung für die Nutzung des jeweiligen Formulars oder die Bearbeitung des ursprünglichen Anliegens.
>
> Nach Auswahl der Checkbox senden wir Ihnen eine Bestätigungs-E-Mail. Erst wenn Sie den darin enthaltenen Link anklicken, wird Ihre Einwilligung für weitere #Mitmachen-E-Mails aktiviert. Ohne Bestätigung erhalten Sie keine solchen zusätzlichen Einladungen; Ihr ursprüngliches Anliegen bearbeiten wir trotzdem.
>
> Zugriff auf die für den Versand erforderlichen Daten erhalten nur die hierfür zuständigen gematik-Mitarbeitenden. Soweit wir einen technischen Versanddienstleister einsetzen, wird dieser als weisungsgebundener Auftragsverarbeiter nach Art. 28 DSGVO tätig. Für den Versand werden nur die erforderlichen Kontaktdaten, fachlichen Zuordnungsmerkmale und der aktuelle Einwilligungs- beziehungsweise Sperrstatus verwendet; interne Gesprächsnotizen werden nicht in Versandlisten übernommen.
>
> Sie können die Einwilligung jederzeit mit Wirkung für die Zukunft über den Abmeldelink in jeder #Mitmachen-E-Mail oder per E-Mail an datenschutz@gematik.de widerrufen. Der Widerruf beendet die zusätzliche #Mitmachen-E-Mail-Kommunikation. Die rechtmäßige Bearbeitung Ihres ursprünglichen Anliegens und die auf einer anderen Rechtsgrundlage beruhende, erforderliche Dokumentation im Versorgungskompass bleiben davon unberührt.
>
> Wir speichern den Einwilligungsnachweis während der Nutzung für diesen Kommunikationszweck und anschließend nur so lange und in dem Umfang, wie dies zum Nachweis der Einwilligung und zur Beachtung Ihres Widerrufs erforderlich ist. Eine minimale Kontaktsperre kann erhalten bleiben, damit Sie nicht versehentlich erneut angeschrieben werden.

### 2.4 Kurzhinweis für erstmals aus öffentlichen Quellen aufgenommene Kontakte

Wenn eine Person nicht selbst über das Formular aufgenommen wurde und die Informationen auch nicht bereits in der laufenden Zusammenarbeit erhalten hat, muss Art. 14 DSGVO berücksichtigt werden. Die Information ist grundsätzlich spätestens bei der ersten Kommunikation oder innerhalb eines Monats zu erteilen. [Art. 14 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

E-Mail-Baustein zur fachlichen und rechtlichen Prüfung:

> **Vor Verwendung:** Die beiden eckig markierten Angaben müssen fallbezogen durch die tatsächlich dokumentierte Quelle und das konkrete TI-/Beteiligungsthema ersetzt werden.

> Wir haben Ihre beruflichen Kontaktdaten aus [konkrete Quelle] übernommen, weil Ihre Funktion beziehungsweise Einrichtung für [konkretes TI-/Beteiligungsthema] fachlich relevant ist. Die gematik verarbeitet diese Angaben im internen Versorgungskompass zur Wahrnehmung ihrer Aufgaben nach § 311 SGB V. Informationen zu Zwecken, Rechtsgrundlage, Quellen, Speicherdauer und Ihren Rechten finden Sie unter https://www.gematik.de/datenschutz#versorgungs-netzwerk-datenschutz. Wenn Sie nicht auf dieser Grundlage kontaktiert werden möchten, teilen Sie uns dies bitte mit; wir prüfen und beachten Ihren Widerspruch nach Art. 21 DSGVO.

## 3. Exakte Umsetzung auf der Website

### 3.1 Sofortige Korrektur im Live-Formular

Im technischen Ist-Befund vom 27. Juli 2026 war das Live-Formular unter [gematik.de/mitmachen/versorgungs-netzwerk](https://www.gematik.de/mitmachen/versorgungs-netzwerk) ein TYPO3-Powermail-Formular mit der Formular-UID 41. Zu diesem Prüfzeitpunkt war der Feldmarker `datenschutzhinweis` als Pflichtfeld ausgegeben, obwohl sein Text eine Einwilligung in weitere #Mitmachen-E-Mails enthielt. Dieser zeitabhängige Befund muss vor der Umsetzung erneut geprüft werden.

Sofort zu ändern:

1. Das heutige Pflichtfeld „Datenschutzhinweis*“ vollständig entfernen.
2. `required`, Pflichtstern und jede serverseitige Pflichtvalidierung für die zusätzliche Einwilligung entfernen.
3. Einen reinen Datenschutz-Hinweis ohne Checkbox einsetzen.
4. Eine neue, standardmäßig nicht ausgewählte optionale Checkbox mit neuem technischen Feldmarker anlegen.
5. Das Formular muss auch bei nicht ausgewählter Checkbox vollständig absendbar sein.
6. Die gezielte spätere Kontaktaufnahme zu dem angebotenen Hospitationsort darf nicht von der optionalen Einwilligung abhängen.

Der alte Feldmarker sollte nicht weiterverwendet werden. Empfohlen wird `mitmachen_email_einwilligung`, damit historische, technisch erzwungene Angaben und neue freiwillige Einwilligungen nicht vermischt werden.

### 3.2 Copy-ready Reihenfolge und Texte

**A. Vor dem ersten Eingabefeld ergänzen**

> Mit Ihrer Registrierung nehmen wir Ihre Einrichtung in das Versorgungs-Netzwerk auf. Wir dürfen Sie anschließend zu Ihrem Hospitationsangebot und zu einer konkret passenden Hospitation kontaktieren. Ob Sie zusätzlich Einladungen zu weiteren #Mitmachen-Formaten erhalten möchten, entscheiden Sie unabhängig davon weiter unten.

**B. Unter dem Freitextfeld „Ihre Nachricht“ ergänzen**

> Bitte tragen Sie hier keine Daten von Patientinnen oder Patienten und keine Angaben zu Gesundheit, Religion, politischen Ansichten oder sonstigen besonders geschützten persönlichen Umständen ein.

**C. Reiner Hinweis, ohne Checkbox**

Überschrift: **Datenschutzinformation**

> Wir verarbeiten Ihre Angaben, um Ihre Einrichtung für das Versorgungs-Netzwerk zu registrieren, Ihr Hospitationsangebot zu prüfen und die weitere Zusammenarbeit im internen Versorgungskompass zu organisieren und zu dokumentieren. Die Registrierung ist nicht von einer Einwilligung in weitere E-Mail-Einladungen abhängig. Einzelheiten zu Datenkategorien, Rechtsgrundlagen, Speicherdauer und Ihren Rechten finden Sie in der [Datenschutzerklärung](https://www.gematik.de/datenschutz#versorgungs-netzwerk-datenschutz).

Es darf keine Checkbox „Datenschutzerklärung gelesen“, „Datenschutz akzeptiert“ oder „Ich stimme der notwendigen Verarbeitung zu“ geben. Die Information wird nachweisbar in der zum Absendezeitpunkt geltenden Version angezeigt; die Verarbeitung beruht aber nicht auf einer Zustimmung zur Datenschutzerklärung.

**D. Optionale Checkbox**

Überschrift: **Optional: Einladungen zu weiteren #Mitmachen-Formaten**

> [ ] Ja, ich möchte zusätzlich von der gematik GmbH per E-Mail Informationen und Einladungen zu fachlich passenden #Mitmachen-Formaten erhalten: Austauschrunden in digitaler Form oder vor Ort, Online-Kommentierungen von Konzepten und Demonstratoren, Sprechstunden und Foren sowie Anfragen, ob ich als Testimonial oder für ein Praxisbeispiel zu einer TI-Anwendung mitwirken möchte. Diese Einwilligung ist freiwillig. Nach dem Absenden erhalte ich eine Bestätigungs-E-Mail; erst nach dem Klick auf den Bestätigungslink werde ich für diese zusätzlichen Einladungen freigeschaltet. Ich kann die Einwilligung jederzeit mit Wirkung für die Zukunft über den Abmeldelink oder per E-Mail an datenschutz@gematik.de widerrufen. Weitere Informationen finden Sie in der [Datenschutzerklärung](https://www.gematik.de/datenschutz#mitmachen-e-mail-einwilligung).

Button: **Einrichtung registrieren**

### 3.3 Semantisches HTML-Zielbild

```html
<p id="privacy-information">
  Wir verarbeiten Ihre Angaben, um Ihre Einrichtung für das
  Versorgungs-Netzwerk zu registrieren, Ihr Hospitationsangebot zu prüfen
  und die Zusammenarbeit im internen Versorgungskompass zu organisieren.
  <a href="/datenschutz#versorgungs-netzwerk-datenschutz">
    Weitere Datenschutzinformationen
  </a>
</p>

<fieldset>
  <legend>Optional: Einladungen zu weiteren #Mitmachen-Formaten</legend>
  <label for="mitmachen_email_einwilligung">
    <input
      id="mitmachen_email_einwilligung"
      name="mitmachen_email_einwilligung"
      type="checkbox"
      value="yes"
    >
    Ja, ich möchte zusätzlich ...
  </label>
</fieldset>

<button type="submit">Einrichtung registrieren</button>
```

Die Checkbox darf weder `required` noch `checked` noch `aria-required="true"` enthalten. Die optionale Auswahl darf nicht durch ein Cookie-Banner oder die Consent-Management-Plattform für Cookies verwaltet werden; es handelt sich um einen eigenen, serverseitig dokumentierten Kommunikationsnachweis.

### 3.4 Abgrenzung der E-Mail-Arten

| E-Mail | Grundlage | Checkbox/DOI erforderlich? |
|---|---|---|
| Eingangsbestätigung, Rückfrage zum Angebot | operativer Netzwerkzweck | nein |
| Kontaktaufnahme, weil die angebotene Einrichtung zu einer konkreten Hospitation passt | operativer Netzwerkzweck | nein |
| Termin, Vorbereitung und Nachbereitung einer vereinbarten Hospitation | operativer Netzwerkzweck | nein |
| Einladungen zu anderen Austauschrunden, Kommentierungen, Sprechstunden oder Foren | zusätzliche #Mitmachen-Kommunikation | ja, bestätigte Einwilligung |
| Anfrage, ob die Person künftig als Testimonial mitwirken möchte | zusätzliche #Mitmachen-Kommunikation | ja, bestätigte Einwilligung |
| Veröffentlichung eines Testimonials, Namens, Fotos, Audio- oder Videomaterials | eigener Veröffentlichungszweck | separate anlassbezogene Vereinbarung/Einwilligung |

Die geringe Versandmenge reduziert das praktische Beschwerderisiko, ersetzt aber nicht die Zwecktrennung oder den Einwilligungsnachweis. Double-Opt-in ist kein allgemeines gesetzliches Formerfordernis für den CRM-Eintrag; für die elektronisch erklärte Erlaubnis zu künftigen E-Mails ist es die belastbarste Nachweislösung. [DSK-Orientierungshilfe Direktwerbung](https://www.datenschutzkonferenz-online.de/media/oh/OH-Werbung_Februar%202022_final.pdf), [BGH, I ZR 164/09](https://juris.bundesgerichtshof.de/cgi-bin/bgh_notp/document.py?Art=en&Datum=2011-2&Gericht=bgh&Sort=1024&anz=294&pos=30)

### 3.5 Double-Opt-in-Ablauf

1. Das Hospitationsangebot wird unabhängig von der optionalen Checkbox gespeichert und bearbeitet.
2. Ohne Checkbox erhält der Kontakt den Status `email_permission = not_requested` beziehungsweise `operational_only`.
3. Mit Checkbox wird zunächst `email_permission = pending` gespeichert.
4. Das System versendet eine neutrale Bestätigungs-E-Mail mit einem zufälligen, einmal verwendbaren Bestätigungslink.
5. Erst der Klick setzt `email_permission = granted` und `consent_confirmed_at`.
6. Ein nicht bestätigter Status darf nie für zusätzliche Einladungen selektiert werden.
7. Der Link sollte nach 14 Tagen verfallen. Nicht bestätigte Token können nach 30 Tagen gelöscht werden; das zugrunde liegende Hospitationsangebot bleibt davon unberührt.
8. Jede zusätzliche #Mitmachen-E-Mail prüft unmittelbar vor dem Versand `granted`, fehlenden Widerruf und fehlende Sperre.
9. Jede solche E-Mail enthält einen einfachen Abmeldelink. Der Widerruf setzt `withdrawn` beziehungsweise `blocked`, ohne den operativen CRM-Datensatz automatisch zu löschen.

Copy-ready Bestätigungs-E-Mail:

> **Betreff:** Bitte bestätigen Sie Ihre #Mitmachen-Einwilligung
>
> Sie haben bei Ihrer Registrierung für das Versorgungs-Netzwerk angegeben, dass Sie zusätzlich per E-Mail Informationen und Einladungen zu weiteren #Mitmachen-Formaten der gematik erhalten möchten.
>
> Bitte bestätigen Sie dies über folgenden Link:
>
> **[Einwilligung bestätigen]**
>
> Der Link ist 14 Tage gültig. Wenn Sie die Auswahl nicht selbst getroffen haben oder keine zusätzlichen Einladungen wünschen, müssen Sie nichts tun. Ihr Hospitationsangebot wird unabhängig von dieser Bestätigung bearbeitet.
>
> Informationen zur Verarbeitung Ihrer Daten und zum Widerruf finden Sie unter https://www.gematik.de/datenschutz#mitmachen-e-mail-einwilligung.

### 3.6 Zu speichernder Nachweis

Mindestens zu dokumentieren sind:

- Kontakt- oder Registrierungs-ID;
- E-Mail-Adresse zum Zeitpunkt der Erklärung;
- exakter Einwilligungstext oder unveränderliche Textversion;
- Formular- und Datenschutzhinweis-Version;
- Quellformular und Quell-URL;
- Zeitpunkt der Checkbox-Auswahl;
- Zeitpunkt des Versands der Bestätigungs-E-Mail;
- Zeitpunkt der Bestätigung;
- Status `not_requested`, `pending`, `granted`, `withdrawn`, `blocked` oder `expired`;
- Zeitpunkt und Quelle eines Widerrufs;
- technische Versand- und Bestätigungsergebnisse.

Eine volle IP-Adresse muss nicht allein vorsorglich dauerhaft gespeichert werden. Wenn sie für Missbrauchsschutz kurzfristig benötigt wird, sollte sie getrennt, gekürzt oder pseudonymisiert und mit kurzer Frist verarbeitet werden.

### 3.7 Umgang mit bisherigen Powermail-Daten

Historische Werte des heutigen Pflichtfelds `datenschutzhinweis` bleiben als Nachweis der damaligen Formularübermittlung und als operative Netzwerkregistrierung erhalten. Sie werden aber **nicht pauschal als künftig bestätigte E-Mail-Einwilligung migriert**, weil die Auswahl technisch erzwungen wurde und öffentlich kein Double-Opt-in-Nachweis erkennbar ist.

Für zusätzliche künftige #Mitmachen-E-Mails gilt:

- anderweitig belastbar dokumentierte, freiwillige Einwilligungen können nach Einzelfallprüfung übernommen werden;
- der bisherige Pflichtfeldwert allein erhält den Status `legacy_single_opt_in` beziehungsweise `clarification_needed`, nicht `granted`;
- eine neue freiwillige DOI-Einwilligung darf bei einem bestehenden operativen Kontakt in einem passenden, nicht irreführenden Kontext angeboten werden;
- öffentlich recherchierte Kontakte erhalten nicht allein zu dem Zweck eine unverlangte „Bitte bestätigen Sie Ihre Werbung“-E-Mail.

### 3.8 Abnahmekriterien für TYPO3/Powermail

- Formular ist ohne Checkbox absendbar.
- Checkbox ist standardmäßig leer und hat kein Pflichtattribut.
- Servervalidierung akzeptiert sowohl `false` als auch fehlenden Checkboxwert.
- Datenschutzhinweis ist verlinkt, vor dem Button sichtbar und per Tastatur erreichbar.
- Datenschutz- und Einwilligungstext sind versioniert.
- Bei Checkbox `false`: kein DOI-Versand, kein Eintrag in den Zusatzverteiler.
- Bei Checkbox `true`: Status nur `pending`; erst Linkklick erzeugt `granted`.
- Ein Fehler im DOI-Versand verhindert nicht die Bearbeitung des Hospitationsangebots.
- Bestätigungslink ist zufällig, gehasht gespeichert, einmalig nutzbar und zeitlich begrenzt.
- Zusätzlicher E-Mail-Versand selektiert nur `granted` und prüft Widerrufs-/Sperrstatus.
- Historische Pflichtfeldwerte werden nicht automatisch als neue, freiwillige DOI-Einwilligung behandelt.
- Testfälle decken Absenden ohne Einwilligung, mit unbestätigter Einwilligung, Bestätigung, abgelaufenen Link und Widerruf ab.

## 4. Wer innerhalb der gematik zugreifen darf

### 4.1 Der zentrale Grundsatz

Eine Einwilligung der Kontaktperson ist **keine interne Zugriffsfreigabe**. Sie erlaubt ausschließlich den darin beschriebenen Kommunikationszweck. Welche gematik-Mitarbeitenden einen CRM-Datensatz sehen oder verändern dürfen, richtet sich nach der gesetzlichen Aufgabe, der konkreten dienstlichen Zuständigkeit und den Weisungen der gematik. Art. 29 und Art. 32 Abs. 4 DSGVO verlangen, dass Beschäftigte mit Zugang nur auf Weisung und innerhalb ihrer Berechtigung verarbeiten. [Art. 29 und 32 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679)

Daraus folgen zwei ebenso wichtige Aussagen:

- Eine bestätigte #Mitmachen-Einwilligung berechtigt nicht „alle bei der gematik“, Notizen, Bilder oder Kontaktverläufe zu sehen.
- Eine fehlende oder widerrufene #Mitmachen-Einwilligung verbietet zuständigen Mitarbeitenden nicht, den für die öffentliche Aufgabe erforderlichen operativen CRM-Datensatz zu bearbeiten.

### 4.2 Praktikables zweistufiges Sichtmodell

Damit der Versorgungskompass tatsächlich organisationsübergreifend nutzbar bleibt, wird kein vollständig abgeschottetes Einzelfallmodell empfohlen. Zweckmäßig ist:

1. **Discovery-Sicht:** Der abgegrenzte Nutzerkreis „Versorgungskompass Operations“ kann aktive berufliche Stammdaten, Einrichtung, Sektor, Funktion, Region und fachliche Themen durchsuchen. Das ermöglicht das organisationsweite Matching.
2. **Fallsicht:** Detaillierte Kontakthistorien, Termine, Gesprächsnotizen, Dokumente und formatbezogene Informationen sehen nur zugewiesene Kontaktverantwortliche, das zuständige Team und Mitarbeitende des konkreten Formats.

### 4.3 Empfohlene Rollen- und Zugriffsmatrix

| Rolle/Funktionsgruppe | Zulässiger Umfang | Nicht zulässig |
|---|---|---|
| Versorgungskompass Operations | Discovery-Sicht auf alle aktiven beruflichen Kontakte; Vollsicht auf zugewiesene Kontakte | allgemeiner Export; Einsicht in sachfremde Detailnotizen |
| Kontakt-/Beziehungsowner | Stammdaten, operative Historie, Termine, sachliche Notizen und Folgeschritte der zugewiesenen Kontakte pflegen | Rollenverwaltung; Bulk-Export; Widerruf eigenmächtig überschreiben |
| Hospitations-/Formatkoordination | erforderliche Stammdaten, Termine, Einladungs- und Teilnahmestatus für das eigene Format; nur formatspezifische Notizen | gesamte Historie anderer Formate; allgemeine Freitexte; Roh-Einwilligungsbelege |
| Kommunikation/#Mitmachen-Versand | Name, dienstliche E-Mail, Einrichtung, Sektor, relevante Themen und aktueller Versandstatus der freigegebenen Zielgruppe | allgemeine Notizen, Profilbilder, vollständige Historie oder CSV-Gesamtexport |
| Teamleitung | Daten des eigenen Verantwortungsbereichs für Zuordnung, Qualität und Eskalation | dauerhafte systemweite Vollsicht ohne fachlichen Bedarf |
| Data Steward/CRM-Qualität | systemweiter Zugriff, soweit für Dubletten, Berichtigung, Quellenprüfung, Löschung und Sperren erforderlich | Kampagnenversand; inhaltliche Nutzung für eigene Projektzwecke |
| Betroffenenrechte/Legal | fallbezogener, zeitlich begrenzter Zugriff für Auskunft, Berichtigung, Löschung, Widerspruch oder Rechtsverteidigung | permanenter operativer Vollzugriff |
| Datenschutzbeauftragte:r | erforderlicher Read-only-Zugriff für Beratung, Kontrolle, Stichprobe und Beschwerdeprüfung | operative Datenpflege, Versand, Rollenadministration oder regelmäßige Projektsteuerung |
| Informationssicherheit/Audit | Sicherheits-, Rollen-, Export- und Auditlogs; Inhaltszugriff nur bei konkretem Vorfall | routinemäßiger Zugriff auf CRM-Inhalte |
| Systemadministration/Support | technische Administration; Inhaltszugriff nur zeitlich begrenzt per Ticket/Break-glass | dauerhafte fachliche Vollsicht; Selbstgenehmigung von Business-Rollen |
| Management/Analytics | anonymisierte oder hinreichend aggregierte Kennzahlen | personenbezogene Gesamtdashboards oder Rohdatenexporte ohne dokumentierte Ausnahme |

### 4.4 Technische Mindestkontrollen

- zentrale Anmeldung, MFA und gruppenbasierte Rollenvergabe;
- `deny by default`;
- serverseitige Zeilen- und Feldbegrenzung, nicht nur Ausblendung im Frontend;
- Zuordnung über Team, Kontaktowner und Formatmitgliedschaft;
- getrennte Berechtigungen für Lesen, Schreiben, Notizen, Einwilligungsstatus, Versand, Export, Löschung und Administration;
- Bulk-Export standardmäßig deaktiviert; Ausnahme mit Zweck, Empfänger, Umfang, Genehmigung und Ablaufdatum;
- Protokollierung von Rollenänderungen, Exporten, Einwilligungs-/Sperränderungen, Merge/Löschung, privilegiertem Inhaltszugriff und Break-glass;
- sofortige Entziehung bei Austritt oder Rollenwechsel;
- quartalsweise Rezertifizierung privilegierter, Versand- und Exportrollen; halbjährliche Rezertifizierung der Standardrollen;
- jährliche Wirksamkeitsprüfung des Rollenmodells.

Der Datenschutzbeauftragte berät und überwacht nach Art. 38 und 39 DSGVO. Er ist nicht der operative Genehmigungs-Owner des CRM und sollte nicht zugleich regulärer Systemadministrator sein. Die Zugriffsentscheidung verantworten Fach- und Systemowner; Datenschutz und Informationssicherheit prüfen das Konzept unabhängig.

## 5. Konkrete Auswirkungen auf das lokale Versorgungskompass-Modell

Die lokale Anwendung enthält bereits hilfreiche Bausteine, ist für den beschriebenen Regelbetrieb aber noch nicht vollständig auf das Zielbild ausgerichtet.

| Fundstelle | Ist-Befund | Änderungsticket |
|---|---|---|
| [`supabase/functions/network-registration/index.ts`](../../supabase/functions/network-registration/index.ts) | `consent_processing_accepted_at` wird als notwendige Zustimmung verlangt; Fehlermeldung „Die notwendige Verarbeitung wurde nicht bestätigt.“ | Pflichtzustimmung entfernen; stattdessen nur nachweisen, welche Datenschutzhinweis-Version beim Absenden angezeigt wurde |
| [`supabase/schema.sql`](../../supabase/schema.sql) – `network_registrations` | `consent_processing_version` und `consent_processing_accepted_at` sind `NOT NULL` | in `privacy_notice_version`/`privacy_notice_presented_at` überführen; keine Einwilligungssemantik für den operativen Zweck |
| [`supabase/schema.sql`](../../supabase/schema.sql) – E-Mail-Bestätigung | Statusfelder sind vorhanden, ein vollständiger DOI-Versand- und Bestätigungsworkflow ist im geprüften Code aber nicht erkennbar | Token-, Versand-, Bestätigungs-, Ablauf- und Widerrufsworkflow implementieren; `granted` erst nach Bestätigung |
| [`supabase/schema.sql`](../../supabase/schema.sql) – Kontaktstatus | `granted` kann ohne gesonderten `pending`-Status geführt werden | `pending` beziehungsweise getrennte Felder `consent_checked_at` und `consent_confirmed_at` ergänzen |
| [`api/security-policy.mjs`](../../api/security-policy.mjs) | `viewer` darf die wesentlichen Collections und aktiven Kontakte lesen | Discovery- und Fallsicht in getrennte Routen/Projektionen aufteilen; Zugriff nach Team, Owner und Format begrenzen |
| [`supabase/schema.sql`](../../supabase/schema.sql) – RLS | Policy `contacts authenticated read active` erlaubt allen authentifizierten Profilen die Lektüre aller aktiven Kontakte | RLS/API-Scope auf autorisierte Versorgungskompass-Gruppe und erforderliche Zeilen/Felder begrenzen |
| [`api/security-policy.mjs`](../../api/security-policy.mjs) – Export | Export ist bereits Admins vorbehalten | beibehalten und zusätzlich Zweck/Genehmigung/Audit sowie feldreduzierte Versandlisten einführen |
| Kontaktmodell | Einwilligungsquelle, Textversion und Zeitpunkt sind bereits strukturiert | beibehalten; Online-`granted` nur mit DOI-Nachweis, Widerruf und Sperre unveränderlich auditieren |

Wichtig: Das vorliegende Dokument empfiehlt diese Änderungen, setzt sie aber nicht in Produktivcode um. Vor der technischen Umsetzung sind Systemgrenze, produktiver Identitätsprovider und tatsächlicher Versanddienst festzulegen.

## 6. Zusätzliche Betriebsregeln

### 6.1 Notizen

Zulässig:

- „Interesse an Hospitation zum Thema KIM; Rückmeldung im September vereinbart.“
- „Einladung zum Format X am 12.08. versendet; Teilnahme zugesagt.“
- „Praxis nutzt laut eigener Angabe System Y; Ansprechpartnerin für organisatorische Rückfragen.“

Nicht zulässig:

- Patient:innenfälle oder medizinische Details;
- private Lebensumstände, Gesundheitsangaben oder politische/religiöse Informationen;
- Gerüchte, abwertende Wertungen oder Diagnosen über die Kontaktperson;
- versteckte Eignungs-, Sympathie- oder Zuverlässigkeitsscores ohne festgelegten Zweck und Kriterien.

Jede Notiz erhält Autor:in, Datum, Anlass und gegebenenfalls eine Wiedervorlage. Freitext sollte für Absprachen und Ergebnisse genutzt werden; Status, Termin, Thema und Teilnahme gehören in strukturierte Felder.

### 6.2 Öffentliche Quellen

Berufliche Funktion, Einrichtung, Praxis-/Klinikanschrift, Sektor, dienstliche Erreichbarkeit und relevante fachliche Informationen dürfen nur aufgenommen werden, wenn sie für eine konkrete §-311-Aufgabe erforderlich sind. Quelle und Abrufdatum werden gespeichert.

Nicht als Standardquelle verwenden:

- private Social-Media-Profile;
- Google-Bewertungen oder sonstige Bewertungen durch Dritte;
- private Anschriften oder private Telefonnummern;
- aus dem TI-Verzeichnisdienst nach § 313 SGB V für unzulässige Werbezwecke gewonnene Angaben.

### 6.3 Profilbilder

Initialen bleiben der Standard. Ein Bild wird nur gespeichert, wenn:

- es von der Person beziehungsweise Einrichtung für diesen Zweck bereitgestellt wurde; oder
- eine gematik-eigene Aufnahme mit passender Nutzungserlaubnis vorliegt; oder
- Quelle und Nutzungsrecht die interne CRM-Vervielfältigung nachweisbar erlauben.

Ein von einer Website oder Google Maps sichtbares Bild ist nicht automatisch zur Kopie in das CRM lizenziert. Quellen-URL, Rechtevermerk und Prüfdatum müssen beim Bild gespeichert werden. Gesichtserkennung oder biometrischer Abgleich sind ausgeschlossen.

### 6.4 Lösch- und Sperrlogik

- jährliche Richtigkeits- und Erforderlichkeitsprüfung aktiver Kontakte;
- Regellöschung oder Anonymisierung drei Jahre nach letzter relevanter Interaktion, wenn kein fortbestehender Aufgabenbezug dokumentiert ist;
- sechs Monate für abschließend abgelehnte/nicht übernommene Intake-Datensätze;
- abgelaufene DOI-Token nach 30 Tagen entfernen;
- Einwilligungsnachweis getrennt und minimal für die erforderliche Nachweiszeit;
- Widerrufs-/Widerspruchssperre minimal erhalten, damit kein erneuter ungewollter Versand erfolgt;
- Legal Hold nur dokumentiert, befristet und auf die erforderlichen Daten begrenzt.

## 7. Umsetzung in Arbeitspaketen

| Reihenfolge | Arbeitspaket | Verantwortlich | Ergebnis/Go-live-Gate |
|---|---|---|---|
| 1 | Aufgaben-Mapping | Fachbereich + Legal | Einseitiger Vermerk: Versorgungskompass und jedes Startformat sind § 306 Abs. 1 und § 311 Abs. 1 Satz 1 Nr. 13, gegebenenfalls Nr. 1 Buchst. a/d oder Nr. 17, zugeordnet; § 311 Abs. 4 und fehlender Wettbewerb sind dokumentiert |
| 2 | Sofortkorrektur Formular | Webteam/TYPO3 + Fachbereich | Pflicht-Checkbox entfernt; Formular ohne Zusatz-Einwilligung absendbar |
| 3 | Datenschutzerklärung | Legal/Datenschutz + Webredaktion | Texte aus Kapitel 2 fachlich abgeglichen, veröffentlicht und stabil verankert |
| 4 | DOI und Versandsteuerung | Web-/CRM-Backend + Kommunikation | Statusmaschine, Bestätigungslink, Widerruf, Sperre und Versandprüfung technisch getestet |
| 5 | Rollen und IAM | Fachowner + IAM + Informationssicherheit | Discovery-/Fallsicht, Funktionsgruppen, Joiner/Mover/Leaver und Rezertifizierung eingerichtet |
| 6 | Datenmodell und Hinweise | CRM-Team | Pflicht-„Verarbeitungseinwilligung“ entfernt; Rechtsgrund, Hinweisversion, Quelle, Art.-14-Status und Löschprüfung abgebildet |
| 7 | Governance | Fachbereich + Data Steward | Notiz-, Quellen-, Foto-, Export- und Löschregeln beschlossen; VVT und AVV-/Transferprüfung vollständig |
| 8 | Kontrollierter Pilot | Fachbereich | kleine autorisierte Nutzergruppe; keine Legacy-Massenübernahme; Rechte, Widerruf, Export und Löschung praktisch getestet |
| 9 | Regelbetrieb | System-/Fachowner | Abnahmeprotokoll, Rollenreview, Stichprobe der Notizen und dokumentierte DSFA-Schwellenprüfung |

## 8. Vorschlag für das Gespräch mit Datenschutz und Legal

Nicht fragen:

> Dürfen wir dieses CRM überhaupt verwenden?

Sondern folgenden Beschlussvorschlag zur Beratung vorlegen:

> Wir führen den Versorgungskompass als internes, zugriffsgesteuertes Arbeitsinstrument zur Wahrnehmung der Aufgaben nach § 306 Abs. 1 und § 311 Abs. 1 Satz 1 Nr. 13 SGB V ein. Für die jeweils einschlägigen Maßnahmen dokumentieren wir ergänzend Nr. 1 Buchst. a und d beziehungsweise Nr. 17 und beachten die Begrenzung des § 311 Abs. 4. Die operative Kontaktverwaltung, das Matching geeigneter Einrichtungen, die Organisation von Hospitationen und die sachliche Nachbereitung stützen wir auf Art. 6 Abs. 1 lit. e und Abs. 3 DSGVO in Verbindung mit § 3 BDSG und den genannten SGB-V-Aufgaben. Die heutige Pflicht-Checkbox wird entfernt. Nur zusätzliche E-Mail-Einladungen zu anderen #Mitmachen-Formaten beruhen auf einer freiwilligen, per Double-Opt-in bestätigten Einwilligung. Interne Zugriffe werden nicht durch diese Einwilligung, sondern durch ein rollen-, team- und fallbezogenes Berechtigungskonzept gesteuert. Patient:innendaten, private Dossiers, ungeklärte Bildkopien und verdecktes Personen-Scoring sind ausgeschlossen. Wir bitten Datenschutz und Legal, die konkrete Normenzuordnung, die vorgelegten Texte und die beschriebenen Garantien zu beraten und verbleibende Änderungen als konkrete Auflagen zu benennen.

Zur Besprechung mitbringen:

- diesen Umsetzungsplan;
- einseitiges Aufgaben-/Erforderlichkeits-Mapping;
- Datenfeldliste mit Zweck, Quelle, Zugriff und Frist;
- Rollenmatrix und aktuelle Nutzergruppen;
- Datenfluss vom Powermail-Formular über CRM bis zum DOI-/E-Mail-System;
- Liste der Auftragsverarbeiter und Transfers;
- VVT-Entwurf;
- DSFA-Schwellenprüfung;
- drei anonymisierte Muster-Notizen;
- Migrationszahlen und Herkunft der Altbestände.

## 9. Abnahmeentscheidung

Der Regelbetrieb kann aus Datenschutzsicht vorgeschlagen werden, wenn alle folgenden Punkte mit „ja“ beantwortet sind:

- §-311-Aufgabenbezug ist schriftlich dokumentiert.
- Live-Formular funktioniert ohne zusätzliche Einwilligung.
- Datenschutzerklärung beschreibt CRM, Datenarten, Quellen, Notizen, Zugriffe und Fristen.
- Hospitationskontakt und zusätzliche #Mitmachen-E-Mail sind technisch getrennt.
- Online-Einwilligung wird erst nach DOI als `granted` geführt.
- Widerruf und Widerspruch wirken organisationsweit.
- Zugriff ist auf definierte Funktionsgruppen begrenzt; keine pauschale gematik-weite Vollsicht.
- Discovery- und Fallsicht sind technisch getrennt.
- Exporte sind begrenzt, genehmigt und protokolliert.
- Notiz-, Quellen-, Foto- und Löschregeln sind verbindlich.
- VVT, AVV-/Transferprüfung und DSFA-Schwellenvermerk liegen vor.
- Altbestände werden nicht pauschal als einwilligungsbasiert migriert.

## 10. Rechtlicher Vorbehalt

Dies ist eine juristische Recherche- und Umsetzungsvorlage, keine anwaltliche Einzelfallberatung. Die empfohlene Normenkette setzt voraus, dass der tatsächliche Betrieb und die einzelnen Beteiligungsformate der beschriebenen gesetzlichen Aufgabe dienen und nicht in einem abgrenzbaren Wettbewerbsbereich stattfinden. Vor formaler Veröffentlichung sollten gematik Legal und der beziehungsweise die Datenschutzbeauftragte insbesondere die organisationsinterne Aufgabenfestlegung, tatsächlichen Empfänger, Dienstleister, Fristen und Systemgrenzen verifizieren.
