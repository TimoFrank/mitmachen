(function () {
  const now = "2026-05-19T08:00:00.000Z";
  const profiles = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      email: "timo.frank@example.test",
      display_name: "Timo Frank",
      initials: "TF",
      role: "admin",
      active: true,
      avatar_url: "",
      team: "Stabsstelle Versorgung",
      bio: "Fiktives Admin-Profil fuer Offline-QA.",
      created_at: now,
      updated_at: now
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      email: "benjamin.bluemchen@example.test",
      display_name: "Benjamin Blümchen",
      initials: "BB",
      role: "editor",
      active: true,
      avatar_url: "",
      team: "Kommunikation",
      bio: "Fiktives Editor-Profil fuer Offline-QA.",
      created_at: now,
      updated_at: now
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      email: "bibi.blocksberg@example.test",
      display_name: "Bibi Blocksberg",
      initials: "BI",
      role: "viewer",
      active: true,
      avatar_url: "",
      team: "Kommunikation",
      bio: "Fiktives Viewer-Profil fuer Offline-QA.",
      created_at: now,
      updated_at: now
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      email: "hallo@example.test",
      display_name: "hallo",
      initials: "HA",
      role: "viewer",
      active: true,
      avatar_url: "",
      team: "Strategie und Standards",
      bio: "Fiktives Viewer-Profil fuer Offline-QA.",
      created_at: now,
      updated_at: now
    }
  ];

  const organizations = [
    ["demo-org-nordstadt", "MVZ Nordstadt", "Praxis", "MVZ", "10115", "Berlin", "Berlin", 52.532, 13.384],
    ["demo-org-havelpflege", "Pflegeverbund Havelblick", "Pflege", "Pflegeeinrichtung", "14467", "Potsdam", "Brandenburg", 52.4009, 13.0591],
    ["demo-org-elbufer", "Klinikum Elbufer", "Krankenhaus", "Akutkrankenhaus", "01067", "Dresden", "Sachsen", 51.0504, 13.7373],
    ["demo-org-rheinapotheke", "Rhein-Apotheke Mitte", "Apotheke", "Vor-Ort-Apotheke", "50667", "Koeln", "Nordrhein-Westfalen", 50.9375, 6.9603],
    ["demo-org-mainnetz", "Praxisnetz Mainbogen", "Praxis", "Praxisnetz", "60311", "Frankfurt am Main", "Hessen", 50.1109, 8.6821],
    ["demo-org-isar", "Therapiezentrum Isarpark", "Therapie", "Heilmittelpraxis", "80331", "Muenchen", "Bayern", 48.1374, 11.5755],
    ["demo-org-alster", "Krankenkasse Alster Region", "Krankenkasse", "Regionalstelle", "20095", "Hamburg", "Hamburg", 53.5503, 10.0007],
    ["demo-org-neckar", "Reha-Klinik Neckarbogen", "Reha", "Rehabilitationsklinik", "70173", "Stuttgart", "Baden-Wuerttemberg", 48.7758, 9.1829],
    ["demo-org-weser", "Sozialdienst Weserquartier", "Sozialdienst", "Beratungsstelle", "28195", "Bremen", "Bremen", 53.0793, 8.8017],
    ["demo-org-foerde", "Hausarztzentrum Foerde", "Praxis", "Hausarztzentrum", "24103", "Kiel", "Schleswig-Holstein", 54.3233, 10.1228],
    ["demo-org-saar", "Apothekenkooperation Saar", "Apotheke", "Kooperation", "66111", "Saarbruecken", "Saarland", 49.2402, 6.9969],
    ["demo-org-leine", "Kinderklinik Leinepark", "Krankenhaus", "Fachklinik", "30159", "Hannover", "Niedersachsen", 52.3759, 9.732],
    ["demo-org-erfurt", "Versorgungszentrum Domplatz", "Praxis", "Facharztzentrum", "99084", "Erfurt", "Thueringen", 50.9787, 11.0328],
    ["demo-org-rostock", "Ambulanzverbund Warnow", "Praxis", "Ambulanzverbund", "18055", "Rostock", "Mecklenburg-Vorpommern", 54.0924, 12.0991]
  ].map(([id, name, sector, organizationType, postalCode, city, state, lat, lon]) => ({
    id,
    name,
    normalizedName: name.toLowerCase(),
    sector,
    organizationType,
    postalCode,
    city,
    state,
    lat,
    lon,
    website: `https://${id.replace("demo-org-", "")}.example.test`,
    phone: "+49 000 000000",
    email: `${id.replace("demo-org-", "kontakt-")}@example.test`,
    notes: "Fiktive Organisation fuer Demo- und QA-Szenarien.",
    source: "Demo-Datensatz",
    status: "active",
    createdAt: now,
    updatedAt: now
  }));

  const ownerIds = profiles.map((profile) => profile.id);
  const priorities = ["Hoch", "Mittel", "Niedrig"];
  const specialties = [
    "Allgemeinmedizin",
    "Geriatrie",
    "Kardiologie",
    "Neurologie",
    "Palliativversorgung",
    "Pneumologie",
    "Psychotherapie",
    "Sozialberatung",
    "Pharmazie",
    "Physiotherapie"
  ];
  const roles = ["Leitung", "Koordination", "Fachaerztliche Ansprechperson", "Pflegeberatung", "Praxismanagement", "Netzwerkkoordination"];
  const topics = [
    ["Hausarztversorgung", "Terminsteuerung"],
    ["Entlassmanagement", "Ueberleitung"],
    ["Arzneimitteltherapiesicherheit", "Medikationsplan"],
    ["Pflegeberatung", "Hilfsmittel"],
    ["Reha-Zugang", "Nachsorge"],
    ["Psychosoziale Versorgung", "Krisenpfad"],
    ["Telemedizin", "DMP"],
    ["Kinder- und Jugendversorgung", "Uebergang"]
  ];

  function contact(index, organizationIndex, name, overrides = {}) {
    const org = organizations[organizationIndex % organizations.length];
    const n = index + 1;
    const assignedOwnerIds = index % 6 === 0
      ? [ownerIds[index % ownerIds.length], ownerIds[(index + 1) % ownerIds.length]]
      : [ownerIds[index % ownerIds.length]];
    const assignedOwnerLabels = assignedOwnerIds
      .map((ownerId) => profiles.find((profile) => profile.id === ownerId)?.display_name || "")
      .filter(Boolean);
    return {
      id: `demo-contact-${String(n).padStart(2, "0")}`,
      name,
      organizationId: org.id,
      organization: org.name,
      category: org.sector,
      specialty: specialties[index % specialties.length],
      contactRole: roles[index % roles.length],
      priority: priorities[index % priorities.length],
      ownerId: assignedOwnerIds[0] || "",
      ownerIds: assignedOwnerIds,
      owner: assignedOwnerLabels.join(", "),
      postalCode: org.postalCode,
      city: org.city,
      state: org.state,
      lat: Number((org.lat + ((index % 5) - 2) * 0.018).toFixed(5)),
      lon: Number((org.lon + ((index % 7) - 3) * 0.022).toFixed(5)),
      email: `demo-kontakt-${String(n).padStart(2, "0")}@example.test`,
      phone: `+49 000 ${String(120000 + n).slice(0, 6)}`,
      linkedin: "",
      themes: topics[index % topics.length],
      note: "Fiktiver Demo-Kontakt. Inhalte dienen ausschliesslich Offline-QA und enthalten keine realen CRM-Daten.",
      nextStep: index % 4 === 0 ? "Rueckmeldung zum Versorgungspfad einholen." : "",
      sources: ["Demo-Datensatz", index % 3 === 0 ? "Fiktiver QA-Import" : "Manuelle Demo-Pflege"],
      image: index % 9 === 0 ? "../../public/demo-person-lisa.svg" : index % 11 === 0 ? "../../public/demo-person-jens.svg" : "",
      imageSourceLabel: index % 9 === 0 ? "Lokales Demo-Asset" : "",
      imageRightsNote: index % 9 === 0 ? "Fiktive Illustration im Repository." : "",
      status: "active",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: new Date(Date.UTC(2026, 4, 1 + (index % 18), 9, 0, 0)).toISOString(),
      ...overrides
    };
  }

  const names = [
    "Dr. Mira Linden",
    "Jonas Feld",
    "Samira Kern",
    "Dr. Theo Brandt",
    "Lea Sommer",
    "Nikolai Weber",
    "Dr. Paula Seidel",
    "Maren Vogt",
    "Benno Graf",
    "Dr. Ina Krueger",
    "Hanna Albrecht",
    "Dr. Emil Rau",
    "Tara Neumann",
    "Oskar Voss",
    "Dr. Nele Berger",
    "Milo Hansen",
    "Juna Becker",
    "Dr. Alex Marten",
    "Romy Adler",
    "Dr. Finn Stein",
    "Elif Morgen",
    "Lukas Dietz",
    "Dr. Nora Falk",
    "Tessa Braun",
    "Malte Wolff",
    "Dr. Klara Ott",
    "Yasin Keller",
    "Maja Friese",
    "Dr. Ruben Lang",
    "Nika Schuster",
    "Dr. Lio Berg",
    "Selin Pohl",
    "Aron Weiss",
    "Dr. Greta Kuhn",
    "Mika Stern",
    "Noa Richter"
  ];

  const contacts = names.map((name, index) => contact(index, index % organizations.length, name));
  contacts[5] = { ...contacts[5], email: "", note: "Fiktiver Kontakt mit fehlender E-Mail fuer Datenqualitaets-QA." };
  contacts[8] = { ...contacts[8], phone: "", note: "Fiktiver Kontakt mit fehlender Telefonnummer fuer Datenqualitaets-QA." };
  contacts[12] = { ...contacts[12], specialty: "", note: "Fiktiver Kontakt mit fehlender Fachrichtung fuer Filter- und QA-Pruefung." };
  contacts[16] = { ...contacts[16], ownerId: "", ownerIds: [], owner: "", note: "Fiktiver Kontakt ohne Owner fuer Pflege-Queue und Owner-Filter." };
  contacts[20] = { ...contacts[20], lat: null, lon: null, note: "Fiktiver Kontakt ohne Koordinaten fuer Karten- und Datenqualitaets-QA." };
  contacts[24] = { ...contacts[24], status: "archived", note: "Archivierter Demo-Kontakt fuer Admin-Pruefung." };
  contacts[30] = { ...contacts[30], organization: "MVZ Nordstadt", organizationId: "demo-org-nordstadt", city: "Berlin", state: "Berlin" };

  const hospitationEntries = [
    ["hospitation-2026-01-27-malinckrodt", "Dr. Malinckrodt", "Hanau", "2026-01-27", "+01:00"],
    ["hospitation-2026-01-27-rothsching", "Dr. Marcus Rothsching", "", "2026-01-27", "+01:00"],
    ["hospitation-2026-02-02-claus", "Christoph Claus", "Grebenstein", "2026-02-02", "+01:00"],
    ["hospitation-2026-02-16-walther", "Felix Walther", "Chemnitz", "2026-02-16", "+01:00"],
    ["hospitation-2026-02-24-duderstadt", "Tilly Duderstadt", "Berlin", "2026-02-24", "+01:00"],
    ["hospitation-2026-03-02-froehlich", "Dr. Jonas Fröhlich", "Kaiserslautern", "2026-03-02", "+01:00"],
    ["hospitation-2026-03-12-rau", "Florian Rau", "Harsfeld", "2026-03-12", "+01:00"],
    ["hospitation-2026-04-30-antje-weichard", "Dr. Antje Weichard", "Magdeburg", "2026-04-30", "+02:00"],
    ["hospitation-2026-06-10-deile", "Dr. Martin Deile", "Dresden", "2026-06-10", "+02:00"],
    ["hospitation-2026-06-24-zimmermann", "Dr. Lars Zimmermann", "Magdeburg", "2026-06-24", "+02:00"],
    ["hospitation-2026-06-23-cornelia-weichard", "Dr. Cornelia Weichard", "Magdeburg", "2026-06-23", "+02:00"]
  ];

  const hospitationScoreLabels = {
    medicationPlan: "Medikationsplan",
    dischargeLetter: "Entlassbrief",
    btmPrescription: "Betäubungsmittel-Verordnung",
    actorCoordination: "Akteurskoordination",
    digitalWorkflow: "Digitaler Prozessnutzen",
    patientSafety: "Patientensicherheit",
    processRelief: "Prozessentlastung",
    informationContinuity: "Informationskontinuität",
    patientParticipation: "Patientenbeteiligung",
    careCoordination: "Versorgungskoordination"
  };

  function hospitationDocumentationOutcome(details = {}) {
    const scores = details.scores || {};
    const scoreOrder = Object.keys(scores);
    return JSON.stringify({
      kind: "hospitation-documentation-v1",
      version: 1,
      experience: details.experience || "",
      insight: details.insight || "",
      nextUse: details.nextUse || "",
      observation: details.experience || "",
      processNotes: details.insight || "",
      risks: details.risks || "",
      transferPotential: details.nextUse || "",
      scores,
      scoreLabels: Object.fromEntries(scoreOrder.map((id) => [id, hospitationScoreLabels[id] || id])),
      scoreOrder,
      updatedAt: now
    });
  }

  const hospitationInsights = {
    "hospitation-2026-01-27-malinckrodt": {
      organizationName: "Hausarztpraxis am Marktplatz",
      sector: "Ambulante Versorgung",
      state: "Hessen",
      goal: "Verstehen, welche digitalen Informationen im hausärztlichen Erstkontakt wirklich entscheidungsrelevant sind.",
      topics: ["Medikationsplan", "ePA-Befunde", "KIM-Kommunikation", "Patientensicherheit"],
      requestNote: "Fokus auf Medikationsabgleich, Vorbefunde und Rückfragen an mitbehandelnde Fachärzte.",
      documentationSummary: "Die Praxis priorisiert einen verlässlichen Medikationsabgleich vor jeder technischen Zusatzfunktion.",
      experience: "Zitat Praxis: \"Wenn der Medikationsplan nicht stimmt, startet jede weitere digitale Idee mit Misstrauen.\"",
      insight: "Roadmap-Signal: ePA-Befunde und Medikationsplan müssen im PVS als gemeinsame Arbeitsfläche sichtbar werden.",
      nextUse: "Cluster 'Medikationssicherheit im Erstkontakt' mit ePA 3.1.3 und Medikationsprozess abgleichen.",
      scores: { medicationPlan: 5, patientSafety: 5, informationContinuity: 4, digitalWorkflow: 4 },
      roadmapItemId: "epa-3-1-3-teil-1",
      respondentRole: "Arzt/Ärztin",
      comparisonRole: "top_priority",
      roadmapEvidence: "Medikationsabgleich und Vorbefunde werden als ein Arbeitskontext gebraucht."
    },
    "hospitation-2026-01-27-rothsching": {
      organizationName: "Landapotheke Rothsching",
      sector: "Apotheke",
      state: "Hessen",
      goal: "Rückfragen der Apotheke zu eRezept, Medikationsplan und Sonderverordnungen nachvollziehen.",
      topics: ["eRezept-Rückfragen", "Betäubungsmittel-Verordnung", "Medikationsplan", "Prozessentlastung"],
      requestNote: "Beobachtung am HV-Tisch und im Backoffice: Wann wird telefoniert, wann digital recherchiert?",
      documentationSummary: "Apotheken brauchen priorisierte Rückfragekanäle, nicht noch eine weitere unstrukturierte Nachricht.",
      experience: "Die meisten Verzögerungen entstehen beim Klären von Dosierung, Packungsgröße und Substitution.",
      insight: "BTM- und Sonderverordnungen sind ein Roadmap-Kandidat, weil Fehler heute sofort Telefonketten auslösen.",
      nextUse: "Für eRp 27.3 eBTM und strukturierte Rückfragen als Evidenz nutzen.",
      scores: { btmPrescription: 5, medicationPlan: 4, processRelief: 4, actorCoordination: 4 },
      roadmapItemId: "erp-ebtm",
      respondentRole: "Apotheke",
      comparisonRole: "top_priority",
      roadmapEvidence: "Sonderverordnungen erzeugen Wartezeit und manuelle Klärketten."
    },
    "hospitation-2026-02-02-claus": {
      organizationName: "Pflegedienst Nordhessen",
      sector: "Pflege",
      state: "Hessen",
      goal: "Pflegeperspektive auf Verordnungen, Hilfsmittelstatus und Arztkommunikation erfassen.",
      topics: ["Hilfsmittelstatus", "Häusliche Krankenpflege", "Versorgungskoordination", "Angehörigenkommunikation"],
      requestNote: "Mitlaufen in Tourenplanung und Pflegekoordination, Schwerpunkt Verordnungs- und Hilfsmittelrückfragen.",
      documentationSummary: "Pflege erlebt digitale Lücken vor allem als fehlende Statusklarheit.",
      experience: "Die Koordination führt eine eigene Liste, weil Hilfsmittelstatus, HKP-Verordnung und Praxisrückfragen nicht zusammenlaufen.",
      insight: "Roadmap-Signal: Der Nutzen entsteht durch Status- und Verantwortlichkeitsklarheit, nicht nur durch digitale Verordnung.",
      nextUse: "Bedarf 'Hilfsmittelstatus transparent machen' in eRezept/HKP-Backlog spiegeln.",
      scores: { careCoordination: 5, processRelief: 5, patientParticipation: 4, digitalWorkflow: 4 },
      roadmapItemId: "erp-haeusliche-krankenpflege",
      respondentRole: "Pflege",
      comparisonRole: "top_priority",
      roadmapEvidence: "HKP- und Hilfsmittelstatus müssen für Pflegekoordination zusammen sichtbar werden.",
      unmetNeedTitle: "Hilfsmittelstatus über Praxis, Pflege und Kostenträger hinweg",
      unmetNeedProblem: "Unklar ist oft, ob Verordnung, Genehmigung oder Lieferung der nächste Engpass ist."
    },
    "hospitation-2026-02-16-walther": {
      organizationName: "Klinikum Chemnitz Entlassmanagement",
      sector: "Krankenhaus",
      state: "Sachsen",
      goal: "Entlassinformationen, Medikationsänderungen und Anschlussversorgung im Klinikalltag beobachten.",
      topics: ["Entlassbrief", "Medikationsänderung", "KIM-Kommunikation", "Anschlussversorgung"],
      requestNote: "Shadowing im Entlassmanagement: Was fehlt ambulanten Akteuren bei Entlassung am häufigsten?",
      documentationSummary: "Entlassbriefe sind relevant, aber oft zu spät; entscheidend ist ein frühes Übergabesignal.",
      experience: "Entlassbriefe enthalten die Information, kommen aber häufig nach dem ersten ambulanten Folgekontakt an.",
      insight: "Eine frühe digitale Übergabe mit Medikationsänderungen und offenen To-dos hätte hohen Sicherheitsnutzen.",
      nextUse: "Als Klinik-zu-Praxis-Use-Case für ePA-Dokumente und KIM priorisieren.",
      scores: { dischargeLetter: 5, informationContinuity: 5, actorCoordination: 4, patientSafety: 4 },
      roadmapItemId: "epa-3-1-3-teil-1",
      respondentRole: "Krankenhaus",
      comparisonRole: "top_priority",
      roadmapEvidence: "Frühe Übergabesignale vor dem finalen Entlassbrief reduzieren Sicherheitsrisiken.",
      unmetNeedTitle: "Frühes digitales Entlasssignal vor finalem Entlassbrief",
      unmetNeedProblem: "Ambulante Weiterbehandlung startet häufig, bevor der finale Entlassbrief verfügbar ist."
    },
    "hospitation-2026-02-24-duderstadt": {
      organizationName: "Versichertenberatung Berlin",
      sector: "Patienten- und Versichertenperspektive",
      state: "Berlin",
      goal: "Verstehen, welche digitalen Statusinformationen Patientinnen und Patienten wirklich entlasten.",
      topics: ["Patientenbeteiligung", "Status-Transparenz", "ePA-Nutzung", "Terminsteuerung"],
      requestNote: "Gespräch mit Beratungsteam zu wiederkehrenden Fragen rund um Rezepte, Befunde und Kostenklärung.",
      documentationSummary: "Patientinnen und Patienten fragen selten nach Produkten, sondern nach dem nächsten klaren Schritt.",
      experience: "Wiederkehrendes Zitat: \"Ich will nur wissen, wer jetzt dran ist.\"",
      insight: "Status- und Zuständigkeitsanzeigen können mehr Wirkung haben als zusätzliche Dokumentenablagen.",
      nextUse: "Als Querschnittskriterium für patientennahe Roadmap-Items nutzen: Status, nächste Aktion, zuständige Stelle.",
      scores: { patientParticipation: 5, digitalWorkflow: 4, informationContinuity: 4, careCoordination: 4 },
      roadmapItemId: "epa-3-1-3-teil-1",
      respondentRole: "Versicherte/Patient",
      comparisonRole: "top_priority",
      roadmapEvidence: "Patientinnen brauchen verständlichen Status und den nächsten Handlungsschritt.",
      unmetNeedTitle: "Patientenverständlicher Status und nächster Schritt",
      unmetNeedProblem: "Versicherte sehen Daten, wissen aber nicht, was daraus als nächste Handlung folgt."
    },
    "hospitation-2026-03-02-froehlich": {
      organizationName: "Facharztpraxis Fröhlich",
      sector: "Ambulante Facharztversorgung",
      state: "Rheinland-Pfalz",
      goal: "Fachärztliche Informationslücken bei Überweisung, Befunden und Therapieentscheidung erfassen.",
      topics: ["Überweisung", "ePA-Befunde", "Informationskontinuität", "Therapieentscheidung"],
      requestNote: "Sprechstundenbeobachtung mit Fokus auf fehlende Vorbefunde und Rückfragen an Zuweiser.",
      documentationSummary: "Fachärztliche Entscheidungen hängen stark daran, ob Vorbefunde schnell auffindbar sind.",
      experience: "Mehrere Fälle starteten mit telefonischer Befundsuche, obwohl die Patientinnen davon ausgingen, dass alles digital vorliegt.",
      insight: "ePA-Mehrwert entsteht erst, wenn relevante Vorbefunde im Fachworkflow leicht auffindbar sind.",
      nextUse: "Für ePA-Usability und Metadatenpriorisierung als Facharzt-Signal nutzen.",
      scores: { informationContinuity: 5, digitalWorkflow: 4, patientSafety: 4, patientParticipation: 3 },
      roadmapItemId: "epa-3-1-3-teil-1",
      respondentRole: "Arzt/Ärztin",
      comparisonRole: "none",
      roadmapEvidence: "Vorbefunde müssen im Fachworkflow ohne Sucharbeit sichtbar sein."
    },
    "hospitation-2026-03-12-rau": {
      organizationName: "Gemeinschaftspraxis Harsfeld",
      sector: "Ambulante Versorgung",
      state: "Hessen",
      goal: "Ländliche Versorgung mit knappen Terminen, DMP und Pflegeanbindung verstehen.",
      topics: ["DMP", "Terminsteuerung", "Pflegeanbindung", "Versorgungskoordination"],
      requestNote: "Fokus auf Koordinationsarbeit zwischen Praxis, Pflege und Angehörigen.",
      documentationSummary: "In ländlichen Settings ist digitale Koordination wertvoll, wenn sie Telefonarbeit ersetzt.",
      experience: "DMP-Termine, Pflegehinweise und Angehörigenrückfragen laufen parallel über Telefonnotizen.",
      insight: "Termin- und Aufgabenstatus zwischen Praxis und Pflege ist ein Prozessentlastungshebel.",
      nextUse: "Als Evidenz für koordinierende Funktionen und TI-Messenger-Automation prüfen.",
      scores: { careCoordination: 5, processRelief: 4, digitalWorkflow: 4, actorCoordination: 4 },
      roadmapItemId: "tim-pro-automation-bots",
      respondentRole: "Arzt/Ärztin",
      comparisonRole: "top_priority",
      roadmapEvidence: "Aufgabenstatus zwischen Praxis und Pflege wäre ein direkter Telefonentlaster."
    },
    "hospitation-2026-04-30-antje-weichard": {
      organizationName: "Homecare Magdeburg",
      sector: "Homecare und Hilfsmittel",
      state: "Sachsen-Anhalt",
      goal: "Hilfsmittelversorgung zwischen Praxis, Homecare und Kostenträger nachvollziehen.",
      topics: ["Hilfsmittelstatus", "Kostenzusage", "Homecare", "Prozessentlastung"],
      requestNote: "Beobachtung der Fälle von Verordnung bis Lieferung; besondere Aufmerksamkeit auf Medienbrüche.",
      documentationSummary: "Hilfsmittelversorgung scheitert selten am Bedarf, sondern an fehlender Status-Transparenz.",
      experience: "Statusfragen binden viel Zeit: Verordnung da, Kostenzusage offen, Lieferung unklar, Rückfrage unbeantwortet.",
      insight: "Hilfsmittelstatus ist ein starkes Backlog-Thema mit hohem Entlastungspotenzial.",
      nextUse: "Als neue Anforderung gegen eRezept-Hilfsmittel-Backlog und Patientenstatus spiegeln.",
      scores: { processRelief: 5, careCoordination: 5, patientParticipation: 4, digitalWorkflow: 4 },
      roadmapItemId: "erp-hilfsmittel-backlog",
      respondentRole: "Sonstige",
      comparisonRole: "top_priority",
      roadmapEvidence: "Status-Transparenz zu Hilfsmitteln ist wiederkehrender Schmerzpunkt.",
      unmetNeedTitle: "Hilfsmittelstatus über Praxis, Homecare und Kostenträger hinweg",
      unmetNeedProblem: "Beteiligte wissen oft nicht, ob Verordnung, Genehmigung oder Lieferung der nächste Engpass ist."
    },
    "hospitation-2026-06-10-deile": {
      organizationName: "Hausarztpraxis Dr. Deile",
      sector: "Ambulante Versorgung",
      state: "Sachsen",
      goal: "Hausärztliche Dokumentationslast und Medikationssicherheit im Versorgungsalltag verstehen.",
      topics: ["Dokumentations-Tag", "Medikationsplan", "Entlassbrief", "Roadmap-Kandidat"],
      requestNote: "Hospitation bei Dr. Martin Deile in Dresden. Visualtest-nahe Demo-Hospitation mit Fokus auf Dokumentation, Zitate und Score-Auswertung.",
      documentationSummary: "Dokumentationsnotiz aus dem Visualtest: Medikationsplan und Entlassbrief zeigen unmittelbar, wo Roadmap-Priorisierung helfen kann.",
      experience: "Dokumentationsnotiz aus dem Visualtest: Die Praxis erkennt Nutzen, wenn Medikationsplan, Entlassbrief und offene Rückfragen zusammenkommen.",
      insight: "Die stärkste Erkenntnis ist nicht ein Durchschnittswert, sondern die Kombination aus Score, Zitat und Sektor-Kontext.",
      nextUse: "Als Referenzfall im Dashboard belassen, um Demo, Test und Roadmap-Steuerung sichtbar zu verbinden.",
      scores: {},
      roadmapItemId: "epa-3-1-3-teil-1",
      respondentRole: "Arzt/Ärztin",
      comparisonRole: "top_priority",
      roadmapEvidence: "Medikationsplan, Entlassbrief und Rückfragen gehören in eine priorisierte Sicht."
    },
    "hospitation-2026-06-24-zimmermann": {
      organizationName: "MVZ Magdeburg Süd",
      sector: "Ambulante Facharztversorgung",
      state: "Sachsen-Anhalt",
      goal: "Sektorübergreifende Rückfragen zwischen MVZ, Klinik und Apotheke untersuchen.",
      topics: ["KIM-Kommunikation", "Akteurskoordination", "eRezept", "Befundtransfer"],
      requestNote: "Fokus auf strukturierte Kommunikation statt Freitext-Pingpong.",
      documentationSummary: "Das MVZ braucht weniger Nachrichten und mehr Klarheit, welche Rückfrage für wen handlungsrelevant ist.",
      experience: "Rückfragen aus Klinik und Apotheke landen in unterschiedlichen Kanälen; Priorität und Verantwortlichkeit sind oft unklar.",
      insight: "KIM- und TI-Messenger-Flows sollten Aufgabenstatus und Verantwortlichkeit mittransportieren.",
      nextUse: "Für TI-M Pro Automation und KIM-Strukturierung als Praxis-MVZ-Signal nutzen.",
      scores: { actorCoordination: 5, digitalWorkflow: 4, processRelief: 4, informationContinuity: 4 },
      roadmapItemId: "tim-pro-automation-bots",
      respondentRole: "Arzt/Ärztin",
      comparisonRole: "none",
      roadmapEvidence: "Kommunikationskanäle brauchen Aufgabenstatus und klare Verantwortlichkeit.",
      unmetNeedTitle: "Rückfragen mit Priorität und zuständiger Rolle",
      unmetNeedProblem: "Nachrichtenkanäle transportieren zu selten, wer bis wann handeln muss."
    },
    "hospitation-2026-06-23-cornelia-weichard": {
      organizationName: "Patientenberatung Sachsen-Anhalt",
      sector: "Patienten- und Versichertenperspektive",
      state: "Sachsen-Anhalt",
      goal: "Patientennahe Anforderungen an ePA, Medikationsinformationen und Verständlichkeit sammeln.",
      topics: ["Patientenbeteiligung", "ePA", "Medikationsverständnis", "Status-Transparenz"],
      requestNote: "Beratungssituationen auswerten: Was müssten Patientinnen sehen, um selbst handlungsfähig zu werden?",
      documentationSummary: "Patientenbeteiligung wird konkret, wenn Informationen verständlich, aktuell und mit nächstem Schritt verbunden sind.",
      experience: "Viele Fragen entstehen nicht aus Ablehnung digitaler Angebote, sondern aus Unsicherheit über Bedeutung und Aktualität.",
      insight: "ePA-Informationen brauchen laienverständliche Hinweise und klare nächste Schritte.",
      nextUse: "Als Gegenpol zu reiner Leistungserbringer-Perspektive in Roadmap-Bewertungen einbauen.",
      scores: { patientParticipation: 5, medicationPlan: 4, informationContinuity: 4, digitalWorkflow: 3 },
      roadmapItemId: "epa-3-1-3-teil-1",
      respondentRole: "Versicherte/Patient",
      comparisonRole: "top_priority",
      roadmapEvidence: "Patientenverständlichkeit entscheidet über tatsächliche Nutzung."
    }
  };

  const hospitations = hospitationEntries.map(([id, contactName, city, date, offset]) => {
    const insight = hospitationInsights[id] || {};
    const hasDocumentation = Boolean(insight.documentationSummary);
    return {
      id,
      contactId: "",
      contactName,
      organizationId: "",
      organizationName: insight.organizationName || "",
      requesterProfileId: ownerIds[0],
      ownerId: ownerIds[0],
      status: "Durchgeführt",
      requestedWindows: [],
      startsAt: `${date}T09:00:00${offset}`,
      endsAt: `${date}T11:00:00${offset}`,
      location: city,
      city,
      state: insight.state || "",
      sector: insight.sector || "",
      goal: insight.goal || "Hospitationstermin aus persönlicher Liste.",
      topics: insight.topics || ["Hospitation", "Versorgungskontakt"],
      requestNote: insight.requestNote || (city
        ? `Hospitation bei ${contactName} in ${city}. Kontaktprofil wird später ergänzt.`
        : `Hospitation bei ${contactName}. Ort und Kontaktprofil werden später ergänzt.`),
      documentationSummary: insight.documentationSummary || "",
      documentationOutcome: hasDocumentation ? hospitationDocumentationOutcome(insight) : "",
      followUpNote: insight.nextUse || "",
      followUpOwnerId: hasDocumentation ? ownerIds[0] : "",
      followUpDueAt: hasDocumentation ? "2026-07-15" : "",
      documentedAt: hasDocumentation ? `${date}T12:30:00${offset}` : "",
      documentedBy: hasDocumentation ? ownerIds[0] : "",
      createdAt: now,
      createdBy: ownerIds[0],
      updatedAt: now,
      updatedBy: ownerIds[0]
    };
  });

  const hospitationRoadmapAssessments = hospitationEntries
    .map(([id]) => {
      const insight = hospitationInsights[id] || {};
      if (!insight.roadmapItemId) return null;
      return {
        id: `demo-assessment-${id}`,
        hospitationId: id,
        roadmapItemId: insight.roadmapItemId,
        respondentRole: insight.respondentRole || "Arzt/Ärztin",
        respondentSector: insight.sector || "",
        careRelevance: Math.max(...Object.values(insight.scores || { score: 4 })),
        patientSafety: insight.scores?.patientSafety || insight.scores?.informationContinuity || 4,
        processRelief: insight.scores?.processRelief || insight.scores?.digitalWorkflow || 4,
        urgency: insight.comparisonRole === "top_priority" ? 5 : 3,
        implementationFeasibility: 3,
        adoptionLikelihood: insight.scores?.patientParticipation || 4,
        confidenceScore: 4,
        comparisonRole: insight.comparisonRole || "none",
        evidenceNote: insight.roadmapEvidence || insight.insight || "",
        createdAt: now,
        updatedAt: now
      };
    })
    .filter(Boolean);

  const hospitationUnmetNeeds = Object.entries(hospitationInsights)
    .filter(([, insight]) => insight.unmetNeedTitle)
    .map(([id, insight]) => ({
      id: `demo-unmet-${id}`,
      hospitationId: id,
      relatedRoadmapItemId: insight.roadmapItemId || "",
      title: insight.unmetNeedTitle,
      problem: insight.unmetNeedProblem || insight.insight || "",
      affectedRole: insight.respondentRole || "",
      affectedSector: insight.sector || "",
      classification: insight.roadmapItemId ? "existing_item_extension" : "new_backlog_item",
      expectedBenefit: 5,
      urgency: insight.comparisonRole === "top_priority" ? 5 : 4,
      implementationFeasibility: 3,
      confidenceScore: 4,
      currentWorkaround: "Telefon, manuelle Liste und erneute Rückfrage im Einzelfall.",
      nextStep: insight.nextUse || "Mit Roadmap-Cluster abgleichen.",
      status: "Neu",
      createdAt: now,
      updatedAt: now
    }));

  window.VERSORGUNGS_COMPASS_DEMO_DATA = {
    profiles,
    organizations,
    contacts,
    hospitationSlots: [],
    hospitations,
    hospitationRoadmapAssessments,
    hospitationUnmetNeeds,
    changes: contacts.slice(0, 8).map((item, index) => ({
      id: index + 1,
      contactId: item.id,
      contact_id: item.id,
      action: index % 3 === 0 ? "create" : "update",
      fieldName: index % 3 === 0 ? "" : "priority",
      field_name: index % 3 === 0 ? "" : "priority",
      oldValue: index % 3 === 0 ? "" : "Mittel",
      old_value: index % 3 === 0 ? "" : "Mittel",
      newValue: item.priority,
      new_value: item.priority,
      changedAt: item.updatedAt,
      changed_at: item.updatedAt,
      changedBy: ownerIds[index % ownerIds.length],
      changed_by: ownerIds[index % ownerIds.length]
    })),
    savedViews: [
      {
        id: "demo-view-high-priority",
        ownerId: ownerIds[0],
        name: "Hohe Prioritaet",
        description: "Fiktive Teamansicht fuer priorisierte Kontakte.",
        scope: "team",
        viewType: "contacts",
        filters: { priorities: ["Hoch"] },
        searchQuery: "",
        sortKey: "updated_at",
        sortDirection: "desc",
        pageSize: 20,
        isDefault: false,
        createdAt: now,
        updatedAt: now
      }
    ],
    userSettings: {
      userId: ownerIds[0],
      defaultViewId: "",
      defaultViewType: "contacts",
      tableDensity: "comfortable",
      theme: "system",
      fontScale: 1,
      pageSize: 20,
      preferences: {},
      createdAt: now,
      updatedAt: now
    }
  };
})();
