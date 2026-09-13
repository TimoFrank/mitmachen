(function () {
  const DOCUMENTATION_KIND = "hospitation-documentation-v2";
  const LEGACY_DOCUMENTATION_KIND = "hospitation-documentation-v1";
  const SYSTEM_TAGS = ["Hospitation", "Versorgungskontakt"];
  const codebookVersion = "1.1-erprobung";

  // Alte Kategorien bleiben lesbar. Sie werden nicht in neue Codes übersetzt.
  const legacyCodebook = Object.freeze({
    processPhase: [
      "Anmeldung / Aufnahme",
      "Identifikation",
      "Behandlung / Beratung",
      "Verordnung",
      "Überweisung",
      "Befund / Dokumentation",
      "Kommunikation mit Patient:innen",
      "Kommunikation mit anderen Einrichtungen",
      "Nachbereitung",
      "Sonstiges"
    ],
    problemType: [
      "Medienbruch",
      "fehlende Information",
      "doppelte Dokumentation",
      "Rückfrage",
      "Wartezeit",
      "Workaround",
      "Systemverständnis",
      "Rollenunklarheit",
      "technisches Problem",
      "positives Muster / Best Practice",
      "offene Frage",
      "Übernahme nötig"
    ],
    impact: [
      "Zeitaufwand",
      "Fehleranfälligkeit",
      "Frust / Belastung",
      "Informationsverlust",
      "Patient:innen müssen selbst vermitteln",
      "Prozessverzögerung",
      "Sicherheitsgefühl sinkt",
      "Arbeitsfluss wird unterbrochen",
      "Ablauf funktioniert gut"
    ],
    observationType: [
      "Reibung / Problem",
      "positives Beispiel",
      "Gegenbeispiel",
      "offene Frage",
      "Kontextwissen"
    ]
  });

  const codebook = Object.freeze({
    goalType: ["Einblick gewinnen", "Thema verstehen", "Verbesserung prüfen"],
    documentationStatus: ["draft", "documented", "reviewed"],
    processPhase: ["Zugang", "Aufnahme", "Abklärung", "Versorgung", "Übergang", "Nachsorge", "Übergreifend", "Noch nicht zuordenbar"],
    problemType: [
      { value: "Information fehlt", label: "Fehlende Information" },
      { value: "Doppelte Dokumentation", label: "Doppelte Dokumentation" },
      { value: "Technik gestört", label: "Technische Störung" },
      { value: "Abstimmung unklar", label: "Unklare Abstimmung" },
      { value: "Verständnis erschwert", label: "Verständnisproblem" },
      { value: "Kapazität fehlt", label: "Fehlende Kapazität" },
      { value: "Anderer Aspekt", label: "Anderes Problem" },
      { value: "Kein Hindernis", label: "Kein Problem erkennbar" },
      { value: "Noch nicht zuordenbar", label: "Noch nicht zuordenbar" }
    ],
    impact: ["Zusätzliche Arbeit", "Verzögerung", "Fehler", "Belastung", "Entlastung", "Andere Folge", "Nicht feststellbar"],
    observationType: ["Hindernis", "Gelungener Ablauf", "Kontext"],
    evidenceType: [
      { value: "directly_observed", label: "direkt beobachtet" },
      { value: "reported", label: "berichtet" },
      { value: "source_bound", label: "Beobachtungsunterlage" },
      { value: "interpreted", label: "Annahme" },
      { value: "synthetic_source_based", label: "synthetisches Beispiel" }
    ],
    usageRecommendation: [
      "Wissen teilen",
      "weiter validieren",
      "Produkt prüfen",
      "Technik prüfen",
      "Prozess prüfen",
      "Roadmap prüfen",
      "kein weiterer Schritt"
    ],
    quoteApprovalStatus: [
      { value: "open", label: "offen" },
      { value: "internal_approved", label: "intern freigegeben" },
      { value: "external_approved", label: "extern freigegeben" },
      { value: "not_usable", label: "nicht nutzbar" }
    ],
    mediaType: [
      { value: "workplace", label: "Arbeitsplatz" },
      { value: "process_step", label: "Prozessschritt" },
      { value: "form", label: "Formular" },
      { value: "notice", label: "Hinweiszettel" },
      { value: "whiteboard", label: "Whiteboard" },
      { value: "sketch", label: "Skizze" },
      { value: "material", label: "Material" },
      { value: "other", label: "Sonstiges" }
    ],
    impulseClassification: [
      { value: "knowledge", label: "Wissensimpuls" },
      { value: "product_question", label: "Produktfrage" },
      { value: "technical_question", label: "Technikfrage" },
      { value: "process_question", label: "Prozessfrage" },
      { value: "roadmap_signal", label: "Roadmap-Signal" },
      { value: "validation_needed", label: "Validierungsbedarf" }
    ],
    impulseStatus: [
      { value: "draft", label: "Entwurf" },
      { value: "to_review", label: "zu prüfen" },
      { value: "accepted", label: "übernommen" },
      { value: "rejected", label: "verworfen" },
      { value: "closed", label: "geschlossen" }
    ],
    systemTags: SYSTEM_TAGS
  });

  const codebookBasis = Object.freeze({
    processPhase: "SEIPS 3.0 und SEIPS 101: Patient Journey; die Phasen sind eine lokale Erprobungsfassung, kein validierter Standardpfad.",
    problemType: "SEIPS 101: Hindernisse im Arbeitssystem; diese beobachtbaren Problemtypen sind eine lokale Operationalisierung in Erprobung.",
    impact: "SEIPS 101: Outcomes Matrix; konkrete Folgen und betroffene Personen getrennt benennen. Die Auswahl allein belegt keine Ursache.",
    observationType: "SEIPS 101: Hindernisse und förderliche Bedingungen; lokale Einordnung des Falls, keine Bewertung der gesamten Einrichtung.",
    evidenceType: "Qualitative Beobachtungsmethodik: Beobachtung, Bericht und Interpretation auseinanderhalten; synthetische Beispiele sind keine Felddaten."
  });

  const codebookFieldDefinitions = Object.freeze({
    processPhase: Object.freeze({
      question: "An welcher Stelle im Versorgungsverlauf spielt die Situation?",
      guide: "Wähle den Schwerpunkt der konkreten Situation. Kommunikation und Dokumentation begleiten mehrere Phasen. Der Verlauf kann zurückspringen; er ist kein Pflichtablauf.",
      basis: codebookBasis.processPhase
    }),
    problemType: Object.freeze({
      question: "Was erschwert den nächsten Schritt unmittelbar?",
      guide: "Wähle das Hindernis, das in der Situation am deutlichsten belegt ist. Beschreibe weitere Hindernisse im Text; leite keine Ursache aus einer Rückfrage oder Wartezeit ab.",
      basis: codebookBasis.problemType
    }),
    impact: Object.freeze({
      question: "Welche konkrete Folge ist feststellbar, und für wen?",
      guide: "Wähle die vorrangige belegte Folge. Benenne im Folgentext die betroffene Person oder Rolle und woran die Folge erkennbar ist. Vermutete Risiken gehören zu den offenen Fragen.",
      basis: codebookBasis.impact
    }),
    observationType: Object.freeze({
      question: "Was zeigt diese Situation?",
      guide: "Ordne den einzelnen Fall ein. Ein gelungenes Beispiel belegt noch keine übertragbare Best Practice; offene Fragen können bei jedem Fall bestehen.",
      basis: codebookBasis.observationType
    }),
    evidenceType: Object.freeze({
      question: "Worauf beruht die Beschreibung?",
      guide: "Kennzeichne die Quelle des Befunds. Wenn Beobachtung, Bericht und Annahme zusammenkommen, trenne sie im Text und benenne den jeweiligen Bezug. Eine unbekannte Quelle bleibt offen.",
      basis: codebookBasis.evidenceType
    })
  });

  function defineCode(key, definition, inclusion, exclusion, example, boundary) {
    return Object.freeze({ definition, inclusion, exclusion, example, boundary, basis: codebookBasis[key] });
  }

  const codebookDefinitions = Object.freeze({
    processPhase: Object.freeze({
      Zugang: defineCode("processPhase",
        "Versorgung suchen und einen passenden Kontakt erreichen.",
        "Orientierung, Terminvereinbarung und Klärung, an welche Stelle sich jemand wenden kann.",
        "Formale Aufnahme bei einer bereits erreichten Stelle.",
        "Eine Patientin versucht, einen Termin für eine Abklärung zu erhalten.",
        "Zugang endet dort, wo die konkrete Aufnahme beginnt; die Grenze richtet sich nach dem beschriebenen Schritt."),
      Aufnahme: defineCode("processPhase",
        "Eine Person für den konkreten Versorgungskontakt aufnehmen.",
        "Anmeldung, Identifikation und administrative Erfassung beim Beginn des Kontakts.",
        "Die inhaltliche Beurteilung des Anliegens.",
        "Am Empfang werden Identität und Versicherungsdaten geprüft.",
        "Dient eine Angabe schon der fachlichen Einschätzung, ist Abklärung näher als Aufnahme."),
      Abklärung: defineCode("processPhase",
        "Das Anliegen fachlich erfassen und den Versorgungsbedarf bestimmen.",
        "Anamnese, Untersuchung, Diagnostik und die Einordnung relevanter Befunde.",
        "Die Durchführung einer bereits ausgewählten Versorgung.",
        "Eine Ärztin sucht einen Vorbefund für die diagnostische Entscheidung.",
        "Befundsuche gehört zur Phase, deren Entscheidung sie dient; Dokumentation ist keine eigene Zeitphase."),
      Versorgung: defineCode("processPhase",
        "Die vereinbarte Behandlung, Unterstützung oder Beratung durchführen.",
        "Therapie, Pflege, konkrete Beratung und das Ausstellen einer Verordnung.",
        "Organisation des Wechsels zu einer anderen versorgenden Stelle.",
        "Eine Verordnung wird ausgestellt und mit der Patientin besprochen.",
        "Bei Beratung ist ihr Zweck entscheidend: Bedarf klären gehört zur Abklärung, eine Maßnahme umsetzen zur Versorgung."),
      Übergang: defineCode("processPhase",
        "Versorgung an eine andere Stelle übergeben oder den Anschluss organisieren.",
        "Überweisung, Entlassung, Übergabe und Abstimmung der Anschlussversorgung.",
        "Kontrolle nach einer abgeschlossenen Maßnahme ohne laufende Übergabe.",
        "Eine Praxis übermittelt Unterlagen für die Weiterbehandlung.",
        "Eine Überweisung ist Übergang, wenn die konkrete Situation die Weiterleitung oder Übergabe betrifft."),
      Nachsorge: defineCode("processPhase",
        "Nach einer Maßnahme den weiteren Verlauf prüfen oder begleiten.",
        "Verlaufskontrolle, Rückmeldung zu Ergebnissen und vereinbarte Nachbeobachtung.",
        "Allgemeine administrative Nacharbeit ohne Bezug zum weiteren Versorgungsverlauf.",
        "Die Praxis fragt nach, ob die vereinbarte Kontrolle stattgefunden hat.",
        "Administrative Nacharbeit der ursprünglichen Phase zuordnen; Nachsorge braucht einen Bezug zum weiteren Verlauf."),
      Übergreifend: defineCode("processPhase",
        "Die Situation betrifft mehrere Phasen, ohne dass eine davon im Vordergrund steht.",
        "Ein nachvollziehbarer Zusammenhang über mehrere Schritte oder ein phasenübergreifender Arbeitsablauf.",
        "Eine Situation, deren Phase nur noch nicht ausreichend beschrieben ist.",
        "Eine Person erklärt, wie ein gemeinsamer Status von der Aufnahme bis zur Entlassung genutzt wird.",
        "Wenn der Schwerpunkt benennbar ist, diese Phase wählen; bei fehlendem Kontext Noch nicht zuordenbar."),
      "Noch nicht zuordenbar": defineCode("processPhase",
        "Die vorhandene Beschreibung reicht für eine Phasenzuordnung nicht aus.",
        "Zeitpunkt oder Zweck des beschriebenen Schritts ist offen.",
        "Ein nachweislich phasenübergreifender Ablauf.",
        "Eine Notiz nennt eine Befundsuche, aber nicht deren Anlass.",
        "Fehlenden Kontext als offene Frage festhalten; die Phase nicht aus dem Werkzeugnamen ableiten.")
    }),
    problemType: Object.freeze({
      "Information fehlt": defineCode("problemType",
        "Eine für den nächsten Schritt benötigte Angabe ist nicht verfügbar.",
        "Fehlende oder nicht zugängliche Befunde, Kontaktdaten oder Statusangaben.",
        "Vorhandene Angaben, die nur erneut eingegeben oder verständlich erklärt werden müssen.",
        "Für die Weiterbehandlung fehlt der aktuelle Befund.",
        "Fehlt der Inhalt, hier zuordnen. Werden dieselben vorhandenen Angaben erneut dokumentiert, Doppelte Dokumentation prüfen."),
      "Doppelte Dokumentation": defineCode("problemType",
        "Dieselben bereits vorhandenen Angaben müssen erneut dokumentiert werden.",
        "Dieselbe Angabe nochmals abtippen oder in einem weiteren Dokument oder System erneut festhalten.",
        "Neue oder aktualisierte Angaben; einmaliges Scannen, Übermitteln oder Zusammenführen ohne erneute Dokumentation derselben Angaben.",
        "Die MFA tippt bekannte Angaben aus einem PDF erneut in das PVS.",
        "Benennen, welche Angabe schon wo dokumentiert ist und wo sie nochmals eingetragen wird. Ein Medienwechsel allein reicht nicht aus."),
      "Technik gestört": defineCode("problemType",
        "Eine technische Funktion fällt aus oder funktioniert in der Situation nicht wie vorgesehen.",
        "Abbruch, Fehlermeldung, Ausfall oder beobachtete technische Fehlfunktion.",
        "Eine funktionierende, aber schwer verständliche Bedienung; eine nicht vorgesehene Schnittstelle.",
        "Beim Absenden erscheint eine Fehlermeldung, der Vorgang bricht ab.",
        "Technische Ursache nicht aus einer Verzögerung vermuten. Erzwingt eine fehlende Schnittstelle das erneute Dokumentieren derselben Angaben, Doppelte Dokumentation prüfen."),
      "Abstimmung unklar": defineCode("problemType",
        "Zuständigkeit oder ein erforderlicher gemeinsamer nächster Schritt ist zwischen Beteiligten nicht geklärt.",
        "Widersprüchliche Absprachen, ungeklärte Übergabe oder unklare Verantwortung.",
        "Nur ein fehlender Befund oder bloß nicht verfügbare Termine.",
        "Praxis und Klinik gehen jeweils davon aus, dass die andere Stelle den Kontrolltermin vereinbart.",
        "Wer muss mit wem was klären? Ist nur ein einzelner Inhalt nicht verfügbar, Information fehlt prüfen."),
      "Verständnis erschwert": defineCode("problemType",
        "Vorhandene Angaben oder eine Bedienung sind für Beteiligte nicht ausreichend verständlich.",
        "Unklare Begriffe, missverständliche Anweisungen oder eine schwer nachvollziehbare Oberfläche.",
        "Fehlende Angaben, technische Ausfälle oder ungeklärte Zuständigkeiten zwischen Stellen.",
        "Eine Patientin kann aus der vorhandenen Anleitung den nächsten Schritt nicht erkennen.",
        "Den konkreten unverständlichen Inhalt benennen; nicht pauschal mangelnde Kompetenz einer Person unterstellen."),
      "Kapazität fehlt": defineCode("problemType",
        "Eine benötigte personelle, zeitliche oder räumliche Ressource steht nicht zur Verfügung.",
        "Kein verfügbarer Termin, fehlende Besetzung oder nicht verfügbare Behandlungsplätze.",
        "Eine Wartezeit, deren Grund unbekannt ist; ein technischer Ausfall.",
        "Der nötige Termin kann laut zuständiger Person wegen fehlender freier Plätze nicht angeboten werden.",
        "Kapazitätsmangel muss beobachtet oder konkret berichtet sein. Wartezeit allein belegt ihn nicht."),
      "Anderer Aspekt": defineCode("problemType",
        "Ein belegtes Hindernis passt nicht zu den sechs Kernkategorien.",
        "Beschriebene Hindernisse mit bekanntem Inhalt außerhalb der vorhandenen Kategorien.",
        "Fehlende Informationen über die Art des Hindernisses.",
        "Eine räumliche Barriere erschwert einen Schritt, ohne dass eine Kapazität fehlt.",
        "Den Aspekt im Text benennen; wiederkehrende Fälle im Codebuchreview prüfen, statt sie in einen unpassenden Code zu drücken."),
      "Kein Hindernis": defineCode("problemType",
        "Für die beschriebene Situation ist kein Hindernis festgestellt.",
        "Ein konkret nachvollziehbarer gelungener Ablauf oder eine Situation ohne festgestellte Schwierigkeit.",
        "Eine Beschreibung, die keine Beurteilung zulässt.",
        "Die zuständige Stelle erhält die benötigten Angaben und kann den Schritt abschließen.",
        "Bezieht sich nur auf den beschriebenen Fall; bedeutet weder Fehlerfreiheit noch generelle Best Practice."),
      "Noch nicht zuordenbar": defineCode("problemType",
        "Der Befund reicht noch nicht aus, um das Hindernis oder dessen Fehlen zu bestimmen.",
        "Unklarer Auslöser, lückenhafte Beschreibung oder mehrere noch nicht unterscheidbare Erklärungen.",
        "Ein klar beschriebenes Hindernis außerhalb der Kategorien.",
        "Es wird eine Wartezeit berichtet, aber nicht, was den nächsten Schritt verhindert.",
        "Die fehlende Klärung im Text festhalten. Anderer Aspekt setzt ein bereits beschreibbares Hindernis voraus.")
    }),
    impact: Object.freeze({
      "Zusätzliche Arbeit": defineCode("impact",
        "Für eine benannte Person oder Rolle fallen zusätzliche Tätigkeiten an.",
        "Erneutes Erfassen, zusätzliche Telefonate, Suchschritte oder Vermittlungsarbeit.",
        "Reine verstrichene Wartezeit ohne zusätzliche Tätigkeit.",
        "Die MFA muss den Befund telefonisch anfordern und den Eingang später prüfen.",
        "Benennen, wer welche zusätzliche Arbeit leistet. Minuten nur angeben, wenn gemessen oder als Schätzung gekennzeichnet."),
      Verzögerung: defineCode("impact",
        "Ein benannter Schritt beginnt oder endet später beziehungsweise bleibt vorerst liegen.",
        "Festgestellte Wartezeit, verschobene Weiterbearbeitung oder verspäteter Anschluss.",
        "Nur vermutete Verzögerung; zusätzliche Arbeit ohne erkennbaren zeitlichen Aufschub.",
        "Die Aufnahme ruht, bis der angeforderte Befund eintrifft.",
        "Welcher Schritt verzögert sich und für wen? Den Umfang nicht aus einem Problemcode ableiten."),
      Fehler: defineCode("impact",
        "Eine konkrete falsche Angabe, Zuordnung oder Ausführung ist festgestellt.",
        "Nachvollziehbar dokumentierter oder konkret berichteter Fehler, auch wenn er rechtzeitig korrigiert wurde.",
        "Bloße Fehleranfälligkeit, Unsicherheit oder ein vermutetes Sicherheitsrisiko.",
        "Eine Angabe wurde in die falsche Akte übernommen und anschließend korrigiert.",
        "Den tatsächlichen Fehler beschreiben. Daraus weder einen eingetretenen Schaden noch dessen Ursache automatisch folgern."),
      Belastung: defineCode("impact",
        "Eine benannte Person berichtet Belastung oder zeigt konkret beschreibbare Belastungsanzeichen.",
        "Geäußerter Stress, Frust oder Überforderung mit erkennbarer Quelle.",
        "Nur vermutetes Befinden oder zusätzlicher Aufwand ohne belegte Belastung.",
        "Eine Mitarbeiterin beschreibt die wiederholte Suche als belastend.",
        "Bericht und sichtbares Verhalten auseinanderhalten; Gefühle und klinische Folgen nicht aus Körpersprache diagnostizieren."),
      Entlastung: defineCode("impact",
        "Eine konkrete Erleichterung für eine benannte Person oder Rolle ist belegt.",
        "Entfallene Tätigkeit oder ausdrücklich berichtete Erleichterung im beschriebenen Ablauf.",
        "Pauschales Lob ohne konkrete Folge; vermutete Einsparungen.",
        "Die Mitarbeiterin berichtet, dass die automatische Übernahme das erneute Abtippen erspart.",
        "Den Vergleich oder die Quelle der Erleichterung nennen; aus einem gelungenen Ablauf keine Entlastung voraussetzen."),
      "Andere Folge": defineCode("impact",
        "Eine konkrete Folge ist feststellbar, passt aber nicht zu den vorhandenen Folgenarten.",
        "Beschriebene Folgen für Personen oder Einrichtungen außerhalb der übrigen Kategorien.",
        "Unbekannte Folgen oder lediglich vermutete Risiken.",
        "Eine Person berichtet einen zusätzlichen Anfahrtsweg, dessen Aufwand noch nicht näher beschrieben ist.",
        "Die Folge und betroffene Person im Text benennen. Wiederkehrende Fälle für die Weiterentwicklung sammeln."),
      "Nicht feststellbar": defineCode("impact",
        "Aus der vorhandenen Quelle lässt sich keine konkrete Folge bestimmen.",
        "Der weitere Verlauf wurde nicht beobachtet oder nicht berichtet.",
        "Eine konkret belegte Folge, die nur keiner vorhandenen Kategorie entspricht.",
        "Die Beobachtung endet bei der Rückfrage; die weitere Bearbeitung bleibt unbekannt.",
        "Nicht feststellbar bedeutet nicht folgenlos. Offene Risiken getrennt als Annahmen dokumentieren.")
    }),
    observationType: Object.freeze({
      Hindernis: defineCode("observationType",
        "Die Situation zeigt eine konkret beschreibbare Schwierigkeit beim Ausführen eines Schritts.",
        "Eine Tätigkeit wird erschwert, unterbrochen oder kann nicht wie benötigt fortgesetzt werden.",
        "Bloße Vermutung eines Problems ohne beschriebenen Bezug.",
        "Die Weiterbearbeitung stockt, weil die benötigte Angabe fehlt.",
        "Eine Umgehungslösung kann das Hindernis kompensieren; ihr Erfolg hebt die dokumentierte Schwierigkeit nicht auf."),
      "Gelungener Ablauf": defineCode("observationType",
        "Die Situation zeigt, wie ein benötigter Schritt nachvollziehbar gelingt.",
        "Ein konkretes förderliches Vorgehen mit beschriebenem Ablauf.",
        "Allgemeines Lob ohne Situation oder die Behauptung einer überall wirksamen Best Practice.",
        "Eine abgestimmte Übergabe stellt die benötigten Unterlagen für den nächsten Schritt bereit.",
        "Nur den Einzelfall einordnen; Übertragbarkeit und tatsächliche Entlastung benötigen eigene Belege."),
      Kontext: defineCode("observationType",
        "Die Beschreibung hilft, Bedingungen oder Abläufe zu verstehen, ohne sie als Hindernis oder gelungenen Fall zu bewerten.",
        "Hintergrundwissen, normale Abläufe und noch nicht beurteilbare Situationen.",
        "Bereits konkret beschriebene Schwierigkeiten oder förderliche Abläufe.",
        "Eine Mitarbeiterin erklärt, welche Dokumente für eine Übergabe verwendet werden.",
        "Offene Fragen sind bei jeder Beobachtungsart möglich und ändern diese Einordnung nicht automatisch.")
    }),
    evidenceType: Object.freeze({
      directly_observed: defineCode("evidenceType",
        "Die dokumentierende Person hat den beschriebenen Vorgang selbst wahrgenommen.",
        "Selbst gesehene Handlungen oder Abläufe mit erkennbarem Situationsbezug.",
        "Erzählungen über andere Situationen und daraus abgeleitete Annahmen.",
        "Bei der Hospitation wurde die erneute Eingabe eines Befunds beobachtet.",
        "Eine gehörte Erzählung ist ein Bericht über den Vorgang; nur das Gespräch selbst wurde direkt wahrgenommen."),
      reported: defineCode("evidenceType",
        "Eine beteiligte Person schildert eine Situation oder ihre Erfahrung.",
        "Berichte aus Gespräch, Interview oder Rückmeldung mit Quellenbezug.",
        "Selbst beobachteter Vorgang oder eine eigene Erklärungshypothese.",
        "Eine Pflegekraft berichtet, dass sie regelmäßig Unterlagen nachfordern muss.",
        "Sprecherrolle und Berichtsbezug festhalten; berichtete Häufigkeit nicht als selbst gemessene Häufigkeit ausgeben."),
      source_bound: defineCode("evidenceType",
        "Die Beschreibung beruht auf einer vorhandenen Beobachtungsunterlage.",
        "Anonymisierte Feldnotiz oder Unterlage mit nachvollziehbarer Herkunft.",
        "Ein frei erfundenes Fallbeispiel oder eine eigene direkte Beobachtung ohne solchen Unterlagenbezug.",
        "Eine anonymisierte Feldnotiz beschreibt die Unterbrechung bei einer Aufnahme.",
        "Die Unterlage referenzieren und deren Grenzen übernehmen; ihre Nutzung macht die bearbeitende Person nicht zur Augenzeugin."),
      interpreted: defineCode("evidenceType",
        "Die Aussage ist eine Annahme oder Deutung auf Grundlage vorhandener Hinweise.",
        "Erklärungshypothesen, noch ungeprüfte Schlussfolgerungen und vermutete Zusammenhänge.",
        "Ein konkret belegter Vorgang, dessen Quelle nur nicht angegeben wurde.",
        "Es wird vermutet, dass eine unklare Zuständigkeit zur Verzögerung beiträgt.",
        "Den zugrunde liegenden Hinweis und die offene Prüfung benennen. Eine fehlende Quellenwahl bleibt leer."),
      synthetic_source_based: defineCode("evidenceType",
        "Der Fall wurde für Erklärung oder Erprobung konstruiert, gegebenenfalls anhand von Quellen.",
        "Fiktive Beispiele und bewusst zusammengesetzte Übungsfälle.",
        "Tatsächliche Feldbeobachtungen oder Berichte über einen realen Einzelfall.",
        "Ein erfundener Fall zeigt, wie eine fehlende Statusangabe codiert werden könnte.",
        "Synthetische Fälle getrennt von Felddaten auswerten; sie belegen keine Häufigkeit oder reale Wirkung.")
    })
  });

  const labelAliases = {
    goalType: {
      kennenlernen: "Einblick gewinnen",
      exploration: "Einblick gewinnen",
      verstehen: "Thema verstehen",
      validation: "Verbesserung prüfen",
      verbesserung: "Verbesserung prüfen"
    },
    documentationStatus: {
      entwurf: "draft",
      dokumentiert: "documented",
      "in review": "reviewed",
      geprüft: "reviewed",
      geprueft: "reviewed"
    },
    processPhase: {
      dokumentation: "Befund / Dokumentation",
      "befundsuche": "Befund / Dokumentation",
      "überweisung / befundsuche": "Überweisung",
      "ueberweisung / befundsuche": "Überweisung",
      "verordnung und statusklärung": "Verordnung",
      "verordnung und statusklaerung": "Verordnung",
      "koordination und anschlussversorgung": "Nachbereitung",
      "patientenverständnis und nächste schritte": "Kommunikation mit Patient:innen",
      "patientenverstaendnis und naechste schritte": "Kommunikation mit Patient:innen",
      "prozessphase offen": "Sonstiges"
    },
    problemType: {
      statusunklarheit: "fehlende Information",
      informationslücke: "fehlende Information",
      informationsluecke: "fehlende Information",
      übergabeverzug: "fehlende Information",
      uebergabeverzug: "fehlende Information",
      verständlichkeitslücke: "Systemverständnis",
      verstaendlichkeitsluecke: "Systemverständnis",
      koordinationsaufwand: "Rollenunklarheit",
      "einordnung offen": "offene Frage"
    },
    impact: {
      zeit: "Zeitaufwand",
      mehraufwand: "Zeitaufwand",
      fehler: "Fehleranfälligkeit",
      fehleranfällig: "Fehleranfälligkeit",
      fehleranfaellig: "Fehleranfälligkeit",
      belastung: "Frust / Belastung",
      frust: "Frust / Belastung",
      informationslücke: "Informationsverlust",
      informationsluecke: "Informationsverlust",
      statusverlust: "Informationsverlust",
      vermittlungsaufwand: "Patient:innen müssen selbst vermitteln",
      verzögerung: "Prozessverzögerung",
      verzoegerung: "Prozessverzögerung",
      wartezeit: "Prozessverzögerung",
      unsicherheit: "Sicherheitsgefühl sinkt",
      unterbrechung: "Arbeitsfluss wird unterbrochen",
      "funktioniert gut": "Ablauf funktioniert gut"
    },
    observationType: {
      reibung: "Reibung / Problem",
      problem: "Reibung / Problem",
      "positives muster": "positives Beispiel",
      "positives beispiel": "positives Beispiel",
      bestpractice: "positives Beispiel",
      "best practice": "positives Beispiel",
      gegenbeispiel: "Gegenbeispiel",
      frage: "offene Frage",
      "offene frage": "offene Frage",
      kontext: "Kontextwissen",
      kontextwissen: "Kontextwissen"
    },
    evidenceType: {
      "direkt beobachtet": "directly_observed",
      "aus anonymisierter beobachtungsunterlage": "source_bound",
      "synthetisch, quellenbasiert": "synthetic_source_based",
      quellenbasiert: "synthetic_source_based",
      berichtet: "reported",
      interpretiert: "interpreted"
    },
    usageRecommendation: {
      teilen: "Wissen teilen",
      validieren: "weiter validieren",
      produkt: "Produkt prüfen",
      technik: "Technik prüfen",
      prozess: "Prozess prüfen",
      roadmap: "Roadmap prüfen",
      "keinen weiteren schritt": "kein weiterer Schritt"
    },
    quoteApprovalStatus: {
      offen: "open",
      "intern freigegeben": "internal_approved",
      "extern freigegeben": "external_approved",
      "nicht nutzbar": "not_usable"
    },
    mediaType: {
      arbeitsplatz: "workplace",
      prozessschritt: "process_step",
      formular: "form",
      hinweiszettel: "notice",
      whiteboard: "whiteboard",
      skizze: "sketch",
      material: "material",
      sonstiges: "other"
    },
    impulseClassification: {
      wissensimpuls: "knowledge",
      produktfrage: "product_question",
      technikfrage: "technical_question",
      prozessfrage: "process_question",
      "roadmap-signal": "roadmap_signal",
      validierungsbedarf: "validation_needed",
      communication_or_training: "knowledge",
      new_backlog_item: "product_question",
      local_system_issue: "technical_question",
      organizational_implementation: "process_question",
      existing_item_extension: "roadmap_signal",
      legal_clarification: "validation_needed"
    },
    impulseStatus: {
      entwurf: "draft",
      "zu prüfen": "to_review",
      "zu pruefen": "to_review",
      übernommen: "accepted",
      uebernommen: "accepted",
      verworfen: "rejected",
      geschlossen: "closed",
      neu: "draft",
      "in prüfung": "to_review",
      "in pruefung": "to_review",
      zurückgestellt: "rejected",
      zurueckgestellt: "rejected",
      erledigt: "closed",
      archiviert: "closed"
    }
  };

  const legacyImpulseClassification = {
    knowledge: "communication_or_training",
    product_question: "new_backlog_item",
    technical_question: "local_system_issue",
    process_question: "organizational_implementation",
    roadmap_signal: "existing_item_extension",
    validation_needed: "legal_clarification"
  };

  const legacyImpulseStatus = {
    draft: "Neu",
    to_review: "In Prüfung",
    accepted: "Übernommen",
    rejected: "Zurückgestellt",
    closed: "Erledigt"
  };

  function text(value) {
    return String(value ?? "").trim();
  }

  function firstNonBlank(...values) {
    return values.map(text).find(Boolean) || "";
  }

  function list(value) {
    if (Array.isArray(value)) return [...new Set(value.map(text).filter(Boolean))];
    return [...new Set(text(value).split(/[;,]\s*|\n+/).map(text).filter(Boolean))];
  }

  function bool(value) {
    if (typeof value === "boolean") return value;
    const normalized = text(value).toLowerCase();
    if (["true", "1", "ja", "yes"].includes(normalized)) return true;
    if (["false", "0", "nein", "no"].includes(normalized)) return false;
    return false;
  }

  function rating(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 1 || number > 5) return null;
    return Math.round(number);
  }

  function valuesFor(key) {
    return (codebook[key] || []).map((entry) => (typeof entry === "object" ? entry.value : entry));
  }

  function normalizeCodebookValue(key, value, fallback = "") {
    const raw = text(value);
    if (!raw) return fallback;
    const values = [...valuesFor(key), ...(legacyCodebook[key] || [])];
    if (values.includes(raw)) return raw;
    const alias = labelAliases[key]?.[raw.toLowerCase()];
    if (alias && values.includes(alias)) return alias;
    const labelMatch = (codebook[key] || []).find((entry) => typeof entry === "object" && text(entry.label).toLowerCase() === raw.toLowerCase());
    return labelMatch?.value || fallback;
  }

  function optionLabel(key, value) {
    const raw = text(value);
    const match = (codebook[key] || []).find((entry) => (typeof entry === "object" ? entry.value : entry) === raw);
    return typeof match === "object" ? match.label : match || raw;
  }

  function isLegacyCodebookValue(key, value) {
    const normalized = normalizeCodebookValue(key, value);
    return Boolean(normalized && (legacyCodebook[key] || []).includes(normalized) && !valuesFor(key).includes(normalized));
  }

  function codebookDefinition(key, value) {
    const normalized = normalizeCodebookValue(key, value);
    return codebookDefinitions[key]?.[normalized] || null;
  }

  function timestamp(value) {
    return text(value) || new Date().toISOString();
  }

  function generatedId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function systemTagSet() {
    return new Set(SYSTEM_TAGS.map((tag) => tag.toLowerCase()));
  }

  function splitTags(tags) {
    const allTags = list(tags);
    const systemTags = allTags.filter((tag) => systemTagSet().has(tag.toLowerCase()));
    const analysisTags = allTags.filter((tag) => !systemTagSet().has(tag.toLowerCase()));
    return {
      tags: allTags,
      systemTags,
      analysisTags
    };
  }

  function defaultDocumentationPayload(context = {}) {
    return {
      kind: DOCUMENTATION_KIND,
      version: 2,
      legacyKind: "",
      legacyNotes: "",
      experience: text(context.documentationSummary || context.summary),
      insight: "",
      nextUse: "",
      observation: text(context.documentationSummary || context.summary),
      processNotes: "",
      risks: "",
      transferPotential: "",
      scores: {},
      scoreLabels: {},
      scoreOrder: [],
      observations: [],
      quotes: [],
      mediaArtifacts: [],
      impulses: [],
      affectedProducts: [],
      updatedAt: timestamp(context.updatedAt)
    };
  }

  function normalizeScoreMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, raw]) => [text(key), rating(raw)])
        .filter(([key, score]) => key && score)
    );
  }

  function observationText(item = {}) {
    const input = item && typeof item === "object" ? item : {};
    const situation = firstNonBlank(input.situation, input.situationContext, input.situation_context, input.context);
    const description = firstNonBlank(input.description, input.observed, input.concreteObservation, input.concrete_observation, input.observation);
    if (!situation) return description;
    if (!description) return situation;
    // Nur ein identischer oder vollständig vorangestellter Kontext ist schon enthalten.
    // Ein Treffer mitten im Text oder innerhalb eines längeren Wortes reicht nicht.
    const comparableSituation = situation.replace(/\r\n?/g, "\n");
    const comparableDescription = description.replace(/\r\n?/g, "\n");
    if (comparableDescription === comparableSituation
      || (comparableDescription.startsWith(comparableSituation)
        && /^\s/.test(comparableDescription.slice(comparableSituation.length)))) return description;
    return `${situation}\n\n${description}`;
  }

  function normalizeObservation(input = {}, context = {}) {
    const now = timestamp(input.updatedAt || input.updated_at || context.updatedAt);
    const hospitationId = text(input.hospitationId || input.hospitation_id || context.hospitationId || context.id);
    const situation = firstNonBlank(input.situation, input.situationContext, input.situation_context, input.context);
    const description = firstNonBlank(input.description, input.observed, input.concreteObservation, input.concrete_observation, input.observation);
    const involvedRoles = list(input.involvedRoles || input.involved_roles || input.affectedRoles || input.affected_roles);
    const relevanceScore = rating(input.relevanceScore ?? input.relevance_score ?? input.careRelevance ?? input.care_relevance);
    const usageRecommendation = normalizeCodebookValue("usageRecommendation", input.usageRecommendation || input.usage_recommendation || input.nextUse || input.next_use || input.possibleUse || input.possible_use, "");
    const workaround = text(input.workaround || input.currentWorkaround || input.current_workaround);
    const nextStep = text(input.nextStep || input.next_step);
    const sequence = Number(input.sequence || input.order || input.position || 0) || null;
    const actions = list(input.actions || input.actionSteps || input.action_steps);
    const toolsAndDocuments = list(input.toolsAndDocuments || input.tools_and_documents || input.tools || input.documents);
    const communicationChannels = list(input.communicationChannels || input.communication_channels || input.channels);
    const observationType = normalizeCodebookValue("observationType", input.observationType ?? input.observation_type ?? input.type, "");
    const originalEvidenceType = text(input.originalEvidenceType || input.original_evidence_type || input.payload?.originalEvidenceType || input.payload?.original_evidence_type);
    const topics = list(input.topics || input.themes || input.topic || input.theme);
    const affectedProducts = list(input.affectedProducts || input.affected_products || input.products || input.productReference || input.product_reference || input.product);
    const linkedQuoteIds = list(input.linkedQuoteIds || input.linked_quote_ids || input.quoteIds || input.quote_ids);
    const linkedMediaIds = list(input.linkedMediaIds || input.linked_media_ids || input.mediaIds || input.media_ids);
    return {
      id: text(input.id) || generatedId("observation"),
      hospitationId,
      title: text(input.title) || "Beobachtung",
      situation,
      situationContext: situation,
      description,
      observed: description,
      sequence,
      observedAt: text(input.observedAt || input.observed_at || input.observationTime || input.observation_time),
      trigger: text(input.trigger),
      actions,
      actionSteps: actions,
      toolsAndDocuments,
      communicationChannels,
      immediateConsequence: text(input.immediateConsequence || input.immediate_consequence || input.consequence),
      sourceType: text(input.sourceType || input.source_type),
      sourceReference: text(input.sourceReference ?? input.source_reference),
      uncertainty: text(input.uncertainty),
      limitations: text(input.limitations),
      relevanceReason: text(input.relevanceReason || input.relevance_reason),
      involvedRoles,
      affectedRoles: involvedRoles.join(", "),
      processPhase: normalizeCodebookValue("processPhase", input.processPhase ?? input.process_phase, ""),
      problemType: normalizeCodebookValue("problemType", input.problemType ?? input.problem_type, ""),
      impact: normalizeCodebookValue("impact", input.impact, ""),
      observationType,
      evidenceType: normalizeCodebookValue("evidenceType", input.evidenceType ?? input.evidence_type, ""),
      ...(valuesFor("evidenceType").includes(originalEvidenceType) ? { originalEvidenceType } : {}),
      relevanceScore,
      careRelevance: relevanceScore,
      usageRecommendation,
      nextUse: usageRecommendation,
      workaround,
      currentWorkaround: workaround,
      nextStep,
      source: text(input.source || input.captureSource || input.capture_source || context.source),
      settingType: text(input.settingType || input.setting_type),
      theme: topics[0] || text(input.theme || input.topic),
      topics,
      themes: topics,
      affectedProducts,
      internalUseAllowed: bool(input.internalUseAllowed ?? input.internal_use_allowed ?? input.usageInternal ?? input.usage_internal),
      externalUseAllowed: bool(input.externalUseAllowed ?? input.external_use_allowed ?? input.usageExternal ?? input.usage_external),
      linkedQuoteIds,
      linkedMediaIds,
      createdAt: timestamp(input.createdAt || input.created_at || now),
      updatedAt: now
    };
  }

  function normalizeQuote(input = {}, context = {}) {
    const now = timestamp(input.updatedAt || input.updated_at || context.updatedAt);
    const personName = text(input.personName || input.person_name || input.contactName || input.contact_name || context.contactName || context.contact_name);
    const personImage = text(input.personImage || input.person_image || input.contactImage || input.contact_image || input.image || context.contactImage || context.contact_image);
    const role = text(input.role || input.personRole || input.person_role);
    const usageInternal = bool(input.usageInternal ?? input.usage_internal ?? input.internalUseAllowed ?? input.internal_use_allowed);
    const usageExternal = bool(input.usageExternal ?? input.usage_external ?? input.externalUseAllowed ?? input.external_use_allowed);
    return {
      id: text(input.id) || generatedId("quote"),
      hospitationId: text(input.hospitationId || input.hospitation_id || context.hospitationId || context.id),
      observationId: text(input.observationId || input.observation_id),
      quote: text(input.quote),
      personName,
      contactName: personName,
      personImage,
      contactImage: personImage,
      role,
      personRole: role,
      context: text(input.context),
      usageInternal,
      usageExternal,
      internalUseAllowed: usageInternal,
      externalUseAllowed: usageExternal,
      anonymized: bool(input.anonymized),
      approvalStatus: normalizeCodebookValue("quoteApprovalStatus", input.approvalStatus || input.approval_status, "open"),
      createdAt: timestamp(input.createdAt || input.created_at || now),
      updatedAt: now
    };
  }

  function normalizeMediaArtifact(input = {}, context = {}) {
    const now = timestamp(input.updatedAt || input.updated_at || context.updatedAt);
    const fileData = input.fileData || input.file_data || input.fileDataUrl || input.file_data_url || input.previewDataUrl || "";
    const hasPeopleVisible = bool(input.hasPeopleVisible ?? input.has_people_visible ?? input.peopleVisible ?? input.people_visible);
    const hasPersonalDataVisible = bool(input.hasPersonalDataVisible ?? input.has_personal_data_visible ?? input.personalDataVisible ?? input.personal_data_visible);
    const usageInternal = bool(input.usageInternal ?? input.usage_internal ?? input.internalUseAllowed ?? input.internal_use_allowed);
    const usageExternal = bool(input.usageExternal ?? input.usage_external ?? input.externalUseAllowed ?? input.external_use_allowed);
    return {
      id: text(input.id) || generatedId("media"),
      hospitationId: text(input.hospitationId || input.hospitation_id || context.hospitationId || context.id),
      observationId: text(input.observationId || input.observation_id),
      title: text(input.title) || "Medienbeleg",
      description: text(input.description),
      type: normalizeCodebookValue("mediaType", input.type, "other"),
      fileData,
      fileDataUrl: fileData,
      fileUrl: text(input.fileUrl || input.file_url),
      fileName: text(input.fileName || input.file_name),
      fileMimeType: text(input.fileMimeType || input.file_mime_type || input.mimeType),
      fileSize: Number(input.fileSize || input.file_size || 0) || 0,
      hasPeopleVisible,
      peopleVisible: hasPeopleVisible,
      hasPersonalDataVisible,
      personalDataVisible: hasPersonalDataVisible,
      needsRedaction: bool(input.needsRedaction ?? input.needs_redaction),
      usageInternal,
      usageExternal,
      internalUseAllowed: usageInternal,
      externalUseAllowed: usageExternal,
      approvalStatus: normalizeCodebookValue("quoteApprovalStatus", input.approvalStatus || input.approval_status, "open"),
      createdAt: timestamp(input.createdAt || input.created_at || now),
      updatedAt: now
    };
  }

  function normalizeImpulse(input = {}, context = {}) {
    const now = timestamp(input.updatedAt || input.updated_at || context.updatedAt);
    const problemStatement = text(input.problemStatement || input.problem_statement || input.problem);
    const workaround = text(input.workaround || input.currentWorkaround || input.current_workaround);
    const nextStep = text(input.nextStep || input.next_step);
    const urgencyScore = rating(input.urgencyScore ?? input.urgency_score ?? input.urgency);
    const status = normalizeCodebookValue("impulseStatus", input.status, "draft");
    return {
      id: text(input.id) || generatedId("impulse"),
      hospitationId: text(input.hospitationId || input.hospitation_id || context.hospitationId || context.id),
      relatedObservationIds: list(input.relatedObservationIds || input.related_observation_ids),
      title: text(input.title) || "Impuls",
      classification: normalizeCodebookValue("impulseClassification", input.classification, "validation_needed"),
      problemStatement,
      problem: problemStatement,
      expectedBenefit: text(input.expectedBenefit || input.expected_benefit),
      urgencyScore,
      urgency: urgencyScore,
      workaround,
      currentWorkaround: workaround,
      nextStep,
      status,
      relatedRoadmapItemId: text(input.relatedRoadmapItemId || input.related_roadmap_item_id),
      createdAt: timestamp(input.createdAt || input.created_at || now),
      updatedAt: now
    };
  }

  function legacyObservationFromPayload(payload = {}, context = {}) {
    const situation = text(payload.experience || payload.observation || context.documentationSummary || context.summary);
    const description = [payload.insight, payload.processNotes, payload.risks].map(text).filter(Boolean).join("\n\n");
    if (!situation && !description) return null;
    return normalizeObservation({
      id: `legacy-observation-${text(context.id || context.hospitationId) || "unspecified"}`,
      hospitationId: context.id || context.hospitationId,
      title: text(context.title) || "Allgemeine Beobachtung",
      situation,
      description,
      relevanceReason: payload.nextUse || payload.transferPotential || "",
      processPhase: "Sonstiges",
      evidenceType: "interpreted",
      usageRecommendation: "weiter validieren",
      createdAt: context.createdAt,
      updatedAt: payload.updatedAt || context.updatedAt
    }, context);
  }

  function normalizeDocumentationPayload(payload = {}, context = {}) {
    const fallback = defaultDocumentationPayload(context);
    const scores = normalizeScoreMap(payload.scores);
    const observations = Array.isArray(payload.observations) ? payload.observations.map((item) => normalizeObservation(item, context)) : [];
    const affectedProducts = list([
      ...list(payload.affectedProducts || payload.affected_products || payload.products || payload.gematikProducts || payload.gematik_products),
      ...observations.flatMap((observation) => observation.affectedProducts || [])
    ]);
    const normalized = {
      ...fallback,
      ...payload,
      kind: DOCUMENTATION_KIND,
      version: 2,
      legacyKind: text(payload.legacyKind || (payload.kind && payload.kind !== DOCUMENTATION_KIND ? payload.kind : "")),
      legacyNotes: text(payload.legacyNotes),
      experience: text(payload.experience || payload.observation || fallback.experience),
      insight: text(payload.insight || [payload.processNotes, payload.risks].map(text).filter(Boolean).join("\n\n")),
      nextUse: text(payload.nextUse || payload.transferPotential),
      observation: text(payload.observation || payload.experience || fallback.observation),
      processNotes: text(payload.processNotes || payload.insight),
      risks: text(payload.risks),
      transferPotential: text(payload.transferPotential || payload.nextUse),
      scores,
      scoreLabels: payload.scoreLabels && typeof payload.scoreLabels === "object" && !Array.isArray(payload.scoreLabels) ? payload.scoreLabels : {},
      scoreOrder: Array.isArray(payload.scoreOrder) ? payload.scoreOrder.map(text).filter((id) => scores[id]) : Object.keys(scores),
      observations,
      quotes: Array.isArray(payload.quotes) ? payload.quotes.map((item) => normalizeQuote(item, context)).filter((item) => item.quote) : [],
      mediaArtifacts: Array.isArray(payload.mediaArtifacts || payload.media_artifacts)
        ? (payload.mediaArtifacts || payload.media_artifacts).map((item) => normalizeMediaArtifact(item, context)).filter((item) => item.fileUrl || item.fileData || item.title || item.description)
        : [],
      impulses: Array.isArray(payload.impulses) ? payload.impulses.map((item) => normalizeImpulse(item, context)).filter((item) => item.title) : [],
      affectedProducts,
      updatedAt: timestamp(payload.updatedAt || payload.updated_at || context.updatedAt)
    };
    if (!normalized.observations.length) {
      const legacyObservation = legacyObservationFromPayload(normalized, context);
      if (legacyObservation) normalized.observations = [legacyObservation];
    }
    return normalized;
  }

  function parseDocumentationOutcome(raw, context = {}) {
    if (!text(raw)) return defaultDocumentationPayload(context);
    if (typeof raw === "object") return normalizeDocumentationPayload(raw, context);
    try {
      const parsed = JSON.parse(String(raw));
      if (parsed?.kind === LEGACY_DOCUMENTATION_KIND) {
        return normalizeDocumentationPayload({ ...parsed, legacyKind: LEGACY_DOCUMENTATION_KIND }, context);
      }
      return normalizeDocumentationPayload(parsed || {}, context);
    } catch (error) {
      return normalizeDocumentationPayload({
        legacyKind: "legacy-freetext",
        legacyNotes: text(raw),
        experience: text(raw),
        observation: text(raw)
      }, context);
    }
  }

  function serializeDocumentationPayload(payload = {}, context = {}) {
    return JSON.stringify(normalizeDocumentationPayload(payload, context));
  }

  function documentationStatusFor(hospitation = {}, documentation = defaultDocumentationPayload()) {
    const explicit = normalizeCodebookValue("documentationStatus", hospitation.documentationStatus || hospitation.documentation_status, "");
    if (explicit) return explicit;
    if (text(hospitation.status) === "Dokumentiert" || text(hospitation.documentationSummary || hospitation.documentation_summary || hospitation.summary)) return "documented";
    if (documentation.observations.length || documentation.quotes.length || documentation.mediaArtifacts.length || documentation.impulses.length) return "documented";
    return "draft";
  }

  function deriveGoalType(value = "") {
    const direct = normalizeCodebookValue("goalType", value, "");
    if (direct) return direct;
    const source = text(value).toLowerCase();
    if (/verbesser|prüf|pruef|produkt|prozess/.test(source)) return "Verbesserung prüfen";
    if (/versteh|thema|frage|problem/.test(source)) return "Thema verstehen";
    return "Einblick gewinnen";
  }

  function normalizeHospitationRecord(input = {}, options = {}) {
    const startsAt = text(input.startsAt || input.starts_at);
    const documentation = parseDocumentationOutcome(input.documentationOutcome || input.documentation_outcome, {
      ...input,
      hospitationId: input.id,
      summary: input.summary || input.documentationSummary || input.documentation_summary
    });
    const topics = list(input.tags || input.topics || input.themes);
    const tagGroups = splitTags(topics);
    const focusTopics = list(input.focusTopics || input.focus_topics || tagGroups.analysisTags);
    const title = text(input.title) || [text(input.contactName || input.contact_name), text(input.organizationName || input.organization_name), startsAt.slice(0, 10)].filter(Boolean).join(" · ") || "Hospitation";
    const normalized = {
      ...input,
      id: text(input.id) || generatedId("hospitation"),
      title,
      date: text(input.date) || startsAt.slice(0, 10),
      contactName: text(input.contactName || input.contact_name),
      organizationName: text(input.organizationName || input.organization_name),
      settingType: text(input.settingType || input.setting_type || input.location),
      sector: text(input.sector),
      federalState: text(input.federalState || input.federal_state || input.state),
      regionType: text(input.regionType || input.region_type),
      observedRoles: list(input.observedRoles || input.observed_roles).length
        ? list(input.observedRoles || input.observed_roles)
        : [...new Set(documentation.observations.flatMap((observation) => observation.involvedRoles))],
      goalType: deriveGoalType(input.goalType || input.goal_type || input.goal),
      focusTopics,
      tags: tagGroups.tags,
      systemTags: tagGroups.systemTags,
      analysisTags: tagGroups.analysisTags,
      summary: text(input.summary || input.documentationSummary || input.documentation_summary),
      notes: text(input.notes || input.requestNote || input.request_note),
      documentationStatus: documentationStatusFor(input, documentation),
      observations: documentation.observations,
      quotes: documentation.quotes,
      mediaArtifacts: documentation.mediaArtifacts,
      impulses: documentation.impulses,
      documentation: documentation,
      documentationOutcome: serializeDocumentationPayload(documentation, input),
      createdAt: timestamp(input.createdAt || input.created_at),
      updatedAt: timestamp(input.updatedAt || input.updated_at || options.updatedAt)
    };
    return normalized;
  }

  function legacyUnmetNeedToImpulse(need = {}, context = {}) {
    return normalizeImpulse({
      id: text(need.id) ? `impulse-${need.id}` : "",
      hospitationId: need.hospitationId || need.hospitation_id || context.id || context.hospitationId,
      title: need.title,
      classification: need.classification,
      problemStatement: need.problem,
      expectedBenefit: need.expectedBenefit || need.expected_benefit,
      urgencyScore: need.urgency,
      workaround: need.currentWorkaround || need.current_workaround,
      nextStep: need.nextStep || need.next_step,
      status: need.status,
      relatedRoadmapItemId: need.relatedRoadmapItemId || need.related_roadmap_item_id,
      createdAt: need.createdAt || need.created_at,
      updatedAt: need.updatedAt || need.updated_at
    }, context);
  }

  function impulseToLegacyUnmetNeed(impulse = {}) {
    const normalized = normalizeImpulse(impulse);
    return {
      id: text(normalized.id).startsWith("impulse-") ? normalized.id.replace(/^impulse-/, "") : normalized.id,
      hospitationId: normalized.hospitationId,
      relatedRoadmapItemId: normalized.relatedRoadmapItemId || "",
      title: normalized.title,
      problem: normalized.problemStatement,
      affectedRole: "",
      affectedSector: "",
      classification: legacyImpulseClassification[normalized.classification] || "new_backlog_item",
      expectedBenefit: rating(normalized.expectedBenefit),
      urgency: normalized.urgencyScore,
      implementationFeasibility: "",
      confidenceScore: 4,
      currentWorkaround: normalized.workaround,
      nextStep: normalized.nextStep,
      status: legacyImpulseStatus[normalized.status] || "Neu",
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt
    };
  }

  function migrateLegacyUnmetNeeds(hospitation = {}, unmetNeeds = []) {
    const normalized = normalizeHospitationRecord(hospitation);
    const relatedNeeds = (Array.isArray(unmetNeeds) ? unmetNeeds : [])
      .filter((need) => (need.hospitationId || need.hospitation_id) === normalized.id)
      .map((need) => legacyUnmetNeedToImpulse(need, normalized));
    if (!relatedNeeds.length) return normalized;
    const byKey = new Map(normalized.impulses.map((impulse) => [impulse.id || impulse.title, impulse]));
    relatedNeeds.forEach((impulse) => {
      const key = impulse.id || impulse.title;
      if (!byKey.has(key)) byKey.set(key, impulse);
    });
    const documentation = normalizeDocumentationPayload({
      ...normalized.documentation,
      impulses: [...byKey.values()]
    }, normalized);
    return {
      ...normalized,
      impulses: documentation.impulses,
      documentation,
      documentationOutcome: serializeDocumentationPayload(documentation, normalized)
    };
  }

  function updateDocumentationArray(hospitation, key, item, normalizer) {
    const normalized = normalizeHospitationRecord(hospitation);
    const documentation = normalizeDocumentationPayload(normalized.documentation, normalized);
    const nextItem = normalizer(item, normalized);
    const nextItems = [
      nextItem,
      ...(documentation[key] || []).filter((entry) => entry.id !== nextItem.id)
    ];
    const nextDocumentation = normalizeDocumentationPayload({
      ...documentation,
      [key]: nextItems,
      updatedAt: new Date().toISOString()
    }, normalized);
    return normalizeHospitationRecord({
      ...normalized,
      documentationOutcome: serializeDocumentationPayload(nextDocumentation, normalized),
      documentationSummary: normalized.summary,
      updatedAt: nextDocumentation.updatedAt
    });
  }

  function addObservation(hospitation, observation) {
    return updateDocumentationArray(hospitation, "observations", observation, normalizeObservation);
  }

  function addQuote(hospitation, quote) {
    return updateDocumentationArray(hospitation, "quotes", quote, normalizeQuote);
  }

  function addMediaArtifact(hospitation, media) {
    return updateDocumentationArray(hospitation, "mediaArtifacts", media, normalizeMediaArtifact);
  }

  function addImpulse(hospitation, impulse) {
    return updateDocumentationArray(hospitation, "impulses", impulse, normalizeImpulse);
  }

  function calculateDocumentationCompleteness(hospitation = {}) {
    const normalized = normalizeHospitationRecord(hospitation);
    const checks = [
      ["context", Boolean(normalized.date && (normalized.contactName || normalized.organizationName || normalized.settingType))],
      ["goal", Boolean(normalized.goalType && normalized.focusTopics.length)],
      ["summary", Boolean(normalized.summary || normalized.notes)],
      ["observation", normalized.observations.some((observation) => observation.situation || observation.description)],
      ["analysisCode", normalized.observations.some((observation) => observation.processPhase || observation.problemType || observation.impact)],
      ["source", normalized.observations.some((observation) => observation.evidenceType && observation.sourceReference)],
      ["consequence", normalized.observations.some((observation) => observation.immediateConsequence)]
    ];
    const completed = checks.filter(([, ok]) => ok).length;
    return {
      percent: Math.round((completed / checks.length) * 100),
      completed,
      total: checks.length,
      missing: checks.filter(([, ok]) => !ok).map(([key]) => key),
      status: normalized.documentationStatus
    };
  }

  function increment(counts, value) {
    const label = text(value);
    if (!label) return;
    counts[label] = (counts[label] || 0) + 1;
  }

  function sortedCounts(counts) {
    return Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "de"));
  }

  function getDashboardAggregates(hospitations = []) {
    const rows = (Array.isArray(hospitations) ? hospitations : []).map((item) => normalizeHospitationRecord(item));
    const counts = {
      documentationStatus: {},
      processPhase: {},
      problemType: {},
      impact: {},
      observationType: {},
      affectedProducts: {},
      roles: {},
      focusTopics: {},
      analysisTags: {},
      systemTags: {},
      evidenceType: {},
      usageRecommendation: {},
      impulseClassification: {},
      impulseStatus: {},
      mediaType: {}
    };
    let relevanceTotal = 0;
    let relevanceCount = 0;
    rows.forEach((hospitation) => {
      increment(counts.documentationStatus, hospitation.documentationStatus);
      hospitation.focusTopics.forEach((topic) => increment(counts.focusTopics, topic));
      hospitation.analysisTags.forEach((tag) => increment(counts.analysisTags, tag));
      hospitation.systemTags.forEach((tag) => increment(counts.systemTags, tag));
      hospitation.observedRoles.forEach((role) => increment(counts.roles, role));
      hospitation.observations.forEach((observation) => {
        increment(counts.processPhase, observation.processPhase);
        increment(counts.problemType, observation.problemType);
        increment(counts.impact, observation.impact);
        increment(counts.observationType, observation.observationType);
        observation.affectedProducts.forEach((product) => increment(counts.affectedProducts, product));
        increment(counts.evidenceType, optionLabel("evidenceType", observation.evidenceType));
        increment(counts.usageRecommendation, observation.usageRecommendation);
        observation.involvedRoles.forEach((role) => increment(counts.roles, role));
        if (observation.relevanceScore) {
          relevanceTotal += observation.relevanceScore;
          relevanceCount += 1;
        }
      });
      hospitation.mediaArtifacts.forEach((media) => increment(counts.mediaType, optionLabel("mediaType", media.type)));
      hospitation.impulses.forEach((impulse) => {
        increment(counts.impulseClassification, optionLabel("impulseClassification", impulse.classification));
        increment(counts.impulseStatus, optionLabel("impulseStatus", impulse.status));
      });
    });
    const allQuotes = rows.flatMap((hospitation) => hospitation.quotes);
    const allMedia = rows.flatMap((hospitation) => hospitation.mediaArtifacts);
    const allImpulses = rows.flatMap((hospitation) => hospitation.impulses);
    const allObservations = rows.flatMap((hospitation) => hospitation.observations);
    return {
      total: rows.length,
      documented: rows.filter((row) => row.documentationStatus !== "draft").length,
      observationsTotal: allObservations.length,
      quotesTotal: allQuotes.length,
      mediaArtifactsTotal: allMedia.length,
      impulsesTotal: allImpulses.length,
      relevanceScoreAverage: relevanceCount ? relevanceTotal / relevanceCount : null,
      documentationCompletenessAverage: rows.length
        ? rows.reduce((sum, row) => sum + calculateDocumentationCompleteness(row).percent, 0) / rows.length
        : 0,
      counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, sortedCounts(value)])),
      epicCandidates: allImpulses.filter((impulse) => ["product_question", "roadmap_signal", "validation_needed"].includes(impulse.classification))
    };
  }

  window.VersorgungsCompassHospitationModel = {
    DOCUMENTATION_KIND,
    LEGACY_DOCUMENTATION_KIND,
    codebook,
    codebookVersion,
    legacyCodebook,
    codebookDefinitions,
    codebookFieldDefinitions,
    codebookDefinition,
    isLegacyCodebookValue,
    systemTags: SYSTEM_TAGS,
    normalizeCodebookValue,
    optionLabel,
    observationText,
    normalizeObservation,
    normalizeQuote,
    normalizeMediaArtifact,
    normalizeImpulse,
    parseDocumentationOutcome,
    serializeDocumentationPayload,
    normalizeDocumentationPayload,
    normalizeHospitationRecord,
    migrateLegacyUnmetNeeds,
    legacyUnmetNeedToImpulse,
    impulseToLegacyUnmetNeed,
    addObservation,
    addQuote,
    addMediaArtifact,
    addImpulse,
    calculateDocumentationCompleteness,
    getDashboardAggregates
  };
})();
