(function () {
  const now = "2026-07-19T12:00:00.000Z";
  const demoDataScriptUrl =
    (typeof document === "object" && document.currentScript?.src) ||
    (typeof window === "object" && window.location?.href) ||
    "";
  const demoAssetUrl = (relativePath) => demoDataScriptUrl
    ? new URL(relativePath, demoDataScriptUrl).href
    : relativePath;
  const demoReservedUrl = (hostname, path = "") => `https://${hostname}.example.invalid${path}`;
  const demoProfileImageAdmin = demoAssetUrl("../../public/demo-profile-admin.svg");
  const demoProfileImageEditor = demoAssetUrl("../../public/demo-profile-editor.svg");
  const demoProfileImageViewer = demoAssetUrl("../../public/demo-profile-viewer.svg");
  const demoContactImages = [demoProfileImageAdmin, demoProfileImageEditor, demoProfileImageViewer];

  function demoContactImageForIndex(index = 0) {
    const normalizedIndex = Math.abs(Number(index) || 0);
    return demoContactImages[normalizedIndex % demoContactImages.length];
  }

  const profiles = [
    {
      id: "demo-profile-admin",
      email: "admin@versorgungs-kompass.example.invalid",
      display_name: "Demo Administration",
      initials: "DA",
      role: "admin",
      active: true,
      avatar_url: demoProfileImageAdmin,
      team: "Demo-Qualitätssicherung",
      bio: "Fiktives Admin-Profil für Demo und Offline-QA.",
      created_at: now,
      updated_at: now
    },
    {
      id: "demo-profile-editor",
      email: "redaktion@versorgungs-kompass.example.invalid",
      display_name: "Demo Redaktion",
      initials: "DR",
      role: "editor",
      active: true,
      avatar_url: demoProfileImageEditor,
      team: "Demo-Qualitätssicherung",
      bio: "Fiktives Editor-Profil für Demo und Offline-QA.",
      created_at: now,
      updated_at: now
    },
    {
      id: "demo-profile-viewer",
      email: "lesekonto@versorgungs-kompass.example.invalid",
      display_name: "Demo Lesekonto",
      initials: "DL",
      role: "viewer",
      active: true,
      avatar_url: demoProfileImageViewer,
      team: "Demo-Qualitätssicherung",
      bio: "Fiktives Viewer-Profil für Demo und Offline-QA.",
      created_at: now,
      updated_at: now
    },
    {
      id: "demo-profile-hospitation",
      email: "hospitation@versorgungs-kompass.example.invalid",
      display_name: "Demo Hospitation",
      initials: "DH",
      role: "editor",
      active: true,
      avatar_url: demoProfileImageEditor,
      team: "Versorgung erleben",
      bio: "Rein synthetisches Owner-Profil für Hospitationen und Beobachtungen.",
      created_at: now,
      updated_at: now
    },
    {
      id: "demo-profile-formate",
      email: "formate@versorgungs-kompass.example.invalid",
      display_name: "Demo Formate",
      initials: "DF",
      role: "editor",
      active: true,
      avatar_url: demoProfileImageViewer,
      team: "Dialog und Beteiligung",
      bio: "Rein synthetisches Owner-Profil für Dialogformate und Netzwerkpflege.",
      created_at: now,
      updated_at: now
    }
  ];

  const organizations = [
    ["demo-org-nordstadt", "Demo-MVZ Nordstadt", "Praxis", "MVZ", "10115", "Berlin", "Berlin", 52.532, 13.384],
    ["demo-org-havelpflege", "Demo-Pflegeverbund Havelblick", "Pflege", "Pflegeeinrichtung", "14467", "Potsdam", "Brandenburg", 52.4009, 13.0591],
    ["demo-org-elbufer", "Demo-Klinik Elbufer", "Krankenhaus", "Akutkrankenhaus", "01067", "Dresden", "Sachsen", 51.0504, 13.7373],
    ["demo-org-rheinapotheke", "Demo-Apotheke Rheinmitte", "Apotheke", "Vor-Ort-Apotheke", "50667", "Köln", "Nordrhein-Westfalen", 50.9375, 6.9603],
    ["demo-org-mainnetz", "Demo-Praxisnetz Mainbogen", "Praxis", "Praxisnetz", "60311", "Frankfurt am Main", "Hessen", 50.1109, 8.6821],
    ["demo-org-isar", "Demo-Therapiezentrum Isarpark", "Therapie", "Heilmittelpraxis", "80331", "München", "Bayern", 48.1374, 11.5755],
    ["demo-org-alster", "Demo-Krankenkasse Alster", "Krankenkasse", "Regionalstelle", "20095", "Hamburg", "Hamburg", 53.5503, 10.0007],
    ["demo-org-neckar", "Demo-Reha-Zentrum Neckarbogen", "Reha", "Rehabilitationsklinik", "70173", "Stuttgart", "Baden-Württemberg", 48.7758, 9.1829],
    ["demo-org-weser", "Demo-Sozialdienst Weserquartier", "Sozialdienst", "Beratungsstelle", "28195", "Bremen", "Bremen", 53.0793, 8.8017],
    ["demo-org-foerde", "Demo-Hausarztzentrum Foerde", "Praxis", "Hausarztzentrum", "24103", "Kiel", "Schleswig-Holstein", 54.3233, 10.1228],
    ["demo-org-saar", "Demo-Apothekenkooperation Saar", "Apotheke", "Kooperation", "66111", "Saarbruecken", "Saarland", 49.2402, 6.9969],
    ["demo-org-leine", "Demo-Kinderklinik Leinepark", "Krankenhaus", "Fachklinik", "30159", "Hannover", "Niedersachsen", 52.3759, 9.732],
    ["demo-org-erfurt", "Demo-Versorgungszentrum Domplatz", "Praxis", "Facharztzentrum", "99084", "Erfurt", "Thüringen", 50.9787, 11.0328],
    ["demo-org-rostock", "Demo-Ambulanzverbund Warnow", "Praxis", "Ambulanzverbund", "18055", "Rostock", "Mecklenburg-Vorpommern", 54.0924, 12.0991],
    ["demo-org-mosellabor", "Demo-Laborverbund Moselbogen", "Labor", "Medizinisches Labor", "56068", "Koblenz", "Rheinland-Pfalz", 50.3569, 7.5889],
    ["demo-org-elberettung", "Demo-Rettungsdienst Elbauen", "Rettungsdienst", "Rettungsdienst", "39104", "Magdeburg", "Sachsen-Anhalt", 52.1205, 11.6276],
    ["demo-org-donauhebammen", "Demo-Hebammennetz Donaubogen", "Hebammen", "Hebammennetzwerk", "89073", "Ulm", "Baden-Württemberg", 48.4011, 9.9876],
    ["demo-org-saaleoegd", "Demo-Gesundheitsamt Saaleblick", "ÖGD", "Gesundheitsamt", "07743", "Jena", "Thüringen", 50.9271, 11.5892],
    ["demo-org-ruhrhilfen", "Demo-Hilfsmittelzentrum Ruhrtal", "Hilfsmittel", "Hilfsmittelversorgung", "45127", "Essen", "Nordrhein-Westfalen", 51.4556, 7.0116],
    ["demo-org-innpflege", "Demo-Pflegecampus Innviertel", "Pflege", "Ambulanter Pflegedienst", "83022", "Rosenheim", "Bayern", 47.8564, 12.1288],
    ["demo-org-lippepsyche", "Demo-Psychotherapiezentrum Lippe", "Therapie", "Psychotherapiepraxis", "32756", "Detmold", "Nordrhein-Westfalen", 51.9363, 8.8792],
    ["demo-org-oderklinik", "Demo-Klinikverbund Oderland", "Krankenhaus", "Grund- und Regelversorgung", "15230", "Frankfurt (Oder)", "Brandenburg", 52.3471, 14.5506],
    ["demo-org-kuestenkasse", "Demo-Gesundheitskasse Küstenland", "Krankenkasse", "Kostenträger", "19053", "Schwerin", "Mecklenburg-Vorpommern", 53.6294, 11.4148],
    ["demo-org-weinstadtpraxis", "Demo-Hausarztverbund Weinstraße", "Praxis", "Praxisverbund", "67433", "Neustadt an der Weinstraße", "Rheinland-Pfalz", 49.3502, 8.1487],
    ["demo-org-heidepraxis", "Demo-Praxisgemeinschaft Lüneburger Heide", "Praxis", "Gemeinschaftspraxis", "21335", "Lüneburg", "Niedersachsen", 53.2464, 10.4115],
    ["demo-org-spreeapotheke", "Demo-Apothekennetz Spreebogen", "Apotheke", "Apothekennetz", "10117", "Berlin", "Berlin", 52.517, 13.3889],
    ["demo-org-taunusreha", "Demo-Reha-Netz Taunushöhe", "Reha", "Ambulante Rehabilitation", "65183", "Wiesbaden", "Hessen", 50.0826, 8.2493],
    ["demo-org-hanselabor", "Demo-Labornetz Hanseblick", "Labor", "Labornetzwerk", "28195", "Bremen", "Bremen", 53.0758, 8.8072],
    ["demo-org-rheinrettung", "Demo-Rettungsverbund Rheinufer", "Rettungsdienst", "Rettungsdienst", "40213", "Düsseldorf", "Nordrhein-Westfalen", 51.2254, 6.7763],
    ["demo-org-albhebammen", "Demo-Hebammenverbund Schwäbische Alb", "Hebammen", "Hebammenverbund", "72764", "Reutlingen", "Baden-Württemberg", 48.4914, 9.2043],
    ["demo-org-mitteoegd", "Demo-Gesundheitsdienst Mitte", "ÖGD", "Gesundheitsdienst", "34117", "Kassel", "Hessen", 51.3155, 9.4924],
    ["demo-org-elbesozial", "Demo-Sozialberatung Elbtor", "Sozialdienst", "Beratungsnetz", "22767", "Hamburg", "Hamburg", 53.5461, 9.9661]
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
    website: `https://${id}.example.invalid`,
    phone: "+49 000 000000",
    email: `${id}@example.invalid`,
    notes: "Fiktive Organisation fuer Demo- und QA-Szenarien.",
    source: "Demo-Datensatz",
    status: "active",
    createdAt: now,
    updatedAt: now
  }));

  organizations.forEach((organization) => {
    const systemTypes = {
      Krankenhaus: "KIS",
      Apotheke: "AVS",
      Pflege: "PFLEGE",
      Labor: "LIS",
      Rettungsdienst: "SONSTIGES",
      Hebammen: "PVS",
      "ÖGD": "SONSTIGES",
      Hilfsmittel: "SONSTIGES",
      Krankenkasse: "SONSTIGES",
      Sozialdienst: "SONSTIGES"
    };
    const systemType = systemTypes[organization.sector] || "PVS";
    organization.primarySystems = [{
      id: `demo-primary-system-${organization.id}`,
      organizationId: organization.id,
      systemType,
      vendorName: "DemoSoft",
      productName: systemType === "PVS" ? "Praxis Pilot" : `${systemType} Demo`,
      sourceUrl: `${organization.website}/primaersystem`,
      createdAt: now,
      updatedAt: now
    }];
  });

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
    const demoImage = index % 3 === 0 ? demoContactImageForIndex(index) : "";
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
      email: `demo-contact-${String(n).padStart(2, "0")}@example.invalid`,
      phone: `+49 000 ${String(120000 + n).slice(0, 6)}`,
      linkedin: "",
      themes: topics[index % topics.length],
      note: "Fiktiver Demo-Kontakt. Inhalte dienen ausschliesslich Offline-QA und enthalten keine realen CRM-Daten.",
      nextStep: index % 4 === 0 ? "Rueckmeldung zum Versorgungspfad einholen." : "",
      sources: ["Demo-Datensatz", index % 3 === 0 ? "Fiktiver QA-Import" : "Manuelle Demo-Pflege"],
      image: demoImage,
      imageSourceLabel: demoImage ? "Lokales Demo-Asset" : "",
      imageRightsNote: demoImage ? "Fiktive Illustration im Repository." : "",
      status: "active",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: new Date(Date.UTC(2026, 4, 1 + (index % 18), 9, 0, 0)).toISOString(),
      ...overrides
    };
  }

  const demoFirstNames = [
    "Leonie", "Murat", "Sophie", "Jonas", "Aylin", "Felix", "Nora", "David",
    "Miriam", "Can", "Hannah", "Samir", "Julia", "Tobias", "Elif", "Max"
  ];
  const demoLastNames = ["Albrecht", "Demir", "Hoffmann", "Kramer", "Özdemir", "Neumann"];
  const names = Array.from({ length: 64 }, (_, index) => {
    const title = index % 7 === 0 ? "Dr. " : "";
    return `Demo ${title}${demoFirstNames[index % demoFirstNames.length]} ${demoLastNames[Math.floor(index / demoFirstNames.length) % demoLastNames.length]}`;
  });

  const contacts = names.map((name, index) => contact(index, index % organizations.length, name));
  contacts[5] = { ...contacts[5], email: "", note: "Fiktiver Kontakt mit fehlender E-Mail fuer Datenqualitaets-QA." };
  contacts[8] = { ...contacts[8], phone: "", note: "Fiktiver Kontakt mit fehlender Telefonnummer fuer Datenqualitaets-QA." };
  contacts[12] = { ...contacts[12], specialty: "", note: "Fiktiver Kontakt mit fehlender Fachrichtung fuer Filter- und QA-Pruefung." };
  contacts[16] = { ...contacts[16], ownerId: "", ownerIds: [], owner: "", note: "Fiktiver Kontakt ohne Owner fuer Pflege-Queue und Owner-Filter." };
  contacts[20] = { ...contacts[20], lat: null, lon: null, note: "Fiktiver Kontakt ohne Koordinaten fuer Karten- und Datenqualitaets-QA." };
  contacts[24] = { ...contacts[24], status: "archived", note: "Archivierter Demo-Kontakt fuer Admin-Pruefung." };

  const hospitationDemoSources = {
    kbv2024: "Synthetischer Demo-Quellenhinweis 01 · https://demo-source-01.example.invalid/praxis-digitalisierung",
    gbaDischarge: "Synthetischer Demo-Quellenhinweis 02 · https://demo-source-02.example.invalid/entlassmanagement",
    gbaPatientLetters: "Synthetischer Demo-Quellenhinweis 03 · https://demo-source-03.example.invalid/patienteninformation",
    apsAmts: "Synthetischer Demo-Quellenhinweis 04 · https://demo-source-04.example.invalid/medikationssicherheit",
    cirsTransition: "Synthetischer Demo-Quellenhinweis 05 · https://demo-source-05.example.invalid/versorgung-uebergang"
  };

  function hospitationDemoObservation(input = {}) {
    const actions = Array.isArray(input.actions) ? input.actions : [input.actions].filter(Boolean);
    const toolsAndDocuments = Array.isArray(input.toolsAndDocuments) ? input.toolsAndDocuments : [input.toolsAndDocuments].filter(Boolean);
    const communicationChannels = Array.isArray(input.communicationChannels) ? input.communicationChannels : [input.communicationChannels].filter(Boolean);
    const rawId = String(input.id || "");
    const demoId = rawId.startsWith("demo-") ? rawId : `demo-observation-${rawId.replace(/^obs-/, "")}`;
    return {
      id: demoId,
      sequence: input.sequence,
      observedAt: input.observedAt,
      title: input.title,
      situationContext: input.situationContext,
      trigger: input.trigger,
      observed: input.observed || actions.join(" "),
      actions,
      toolsAndDocuments,
      communicationChannels,
      immediateConsequence: input.immediateConsequence,
      affectedRoles: input.affectedRoles,
      processPhase: input.processPhase,
      problemType: input.problemType,
      impact: input.impact,
      currentWorkaround: input.currentWorkaround || "",
      settingType: input.settingType,
      theme: input.theme,
      evidenceType: "synthetic_source_based",
      sourceType: "synthetic_demo_scenario",
      sourceReference: input.sourceReference,
      uncertainty: input.uncertainty || "Die konkrete Situation ist ein synthetischer Demo-Fall. Sie belegt weder Häufigkeit noch Kausalität.",
      internalUseAllowed: true,
      externalUseAllowed: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function hospitationDemoDocumentation(definition = {}) {
    return JSON.stringify({
      kind: "hospitation-documentation-v2",
      version: 2,
      sourceType: "synthetic_demo_scenario",
      limitations: "Rein synthetische Hospitationsdokumentation. Quellenhinweise verwenden reservierte, nicht auflösbare Testadressen; es liegt keine reale Feldbeobachtung vor.",
      observations: definition.observations || [],
      quotes: [],
      mediaArtifacts: [],
      impulses: [],
      updatedAt: now
    });
  }

  const hospitationDefinitions = [
    {
      id: "demo-hospitation-medikationsabgleich-entlassung",
      date: "2026-01-22", start: "08:35", end: "11:20", contactName: "Demo-Team Hausarztversorgung 01", organizationName: "Demo-Praxis Stadtpark 01",
      city: "Berlin", state: "Berlin", sector: "Ambulante Versorgung", observedRoles: ["MFA", "Hausärztin"],
      goal: "Den Medikationsabgleich nach einer Krankenhausentlassung im laufenden Praxisbetrieb beobachten.",
      topics: ["Medikationsabgleich", "Entlassbrief", "Informationskontinuität"],
      summary: "Papier-Entlassbrief, PVS-Medikationsliste und telefonische Rückfrage werden nacheinander genutzt, weil die Angaben nicht übereinstimmen.",
      observations: [
        hospitationDemoObservation({ id: "obs-med-1", sequence: 1, observedAt: "08:47 Uhr", title: "Drei Medikationsstände liegen gleichzeitig vor", situationContext: "Vorbereitung eines Folgetermins zwei Tage nach Krankenhausentlassung.", trigger: "Der Patient legt einen vorläufigen Entlassbrief und einen ausgedruckten Medikationsplan vor.", actions: ["Die MFA öffnet die Medikationsliste im PVS.", "Sie legt beide Ausdrucke neben den Bildschirm.", "Sie markiert drei abweichende Dosierungen auf Papier."], toolsAndDocuments: ["PVS", "vorläufiger Entlassbrief", "ausgedruckter Medikationsplan", "Papiermarker"], immediateConsequence: "Die Medikamentenliste wird vor dem Arztkontakt nicht aktualisiert.", affectedRoles: ["MFA", "Hausärztin", "Patient"], processPhase: "Befund / Dokumentation", problemType: "fehlende Information", impact: "Fehleranfälligkeit", currentWorkaround: "Abweichungen werden auf Papier markiert und der Ärztin vorgelegt.", settingType: "Hausarztpraxis", theme: "Medikationsabgleich", sourceReference: hospitationDemoSources.apsAmts }),
        hospitationDemoObservation({ id: "obs-med-2", sequence: 2, observedAt: "09:03 Uhr", title: "Klärung wechselt vom PVS zum Telefon", situationContext: "Die Hausärztin prüft die markierten Abweichungen während der Sprechstunde.", trigger: "Aus dem Entlassbrief geht nicht hervor, welche Dosierung dauerhaft gelten soll.", actions: ["Die Ärztin diktiert eine Rückfrage.", "Die MFA ruft die Station an.", "Nach zwei Weiterleitungen wird um einen späteren Rückruf gebeten."], toolsAndDocuments: ["PVS", "Telefon", "Entlassbrief"], communicationChannels: ["Telefon"], immediateConsequence: "Eine offene Aufgabe bleibt in einer lokalen Rückrufliste bestehen.", affectedRoles: ["Hausärztin", "MFA", "Stationssekretariat"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "Rückfrage", impact: "Arbeitsfluss wird unterbrochen", currentWorkaround: "Lokale Rückrufliste neben dem Telefon.", settingType: "Hausarztpraxis", theme: "Sektorübergang", sourceReference: hospitationDemoSources.cirsTransition }),
        hospitationDemoObservation({ id: "obs-med-3", sequence: 3, observedAt: "10:41 Uhr", title: "Korrigierte Liste trifft über KIM ein", situationContext: "Bearbeitung des Posteingangs zwischen zwei Sprechstundenblöcken.", trigger: "Die Klinik sendet eine korrigierte Medikationsliste als KIM-Anhang.", actions: ["Die MFA öffnet die KIM-Nachricht.", "Sie ordnet den PDF-Anhang der Patientenakte zu.", "Die Hausärztin bestätigt die Übernahme in die Medikationsliste."], toolsAndDocuments: ["KIM", "PDF", "PVS"], communicationChannels: ["KIM"], immediateConsequence: "Die Rückrufnotiz wird geschlossen und der Medikationsstand im PVS aktualisiert.", affectedRoles: ["MFA", "Hausärztin"], processPhase: "Befund / Dokumentation", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Hausarztpraxis", theme: "KIM", sourceReference: hospitationDemoSources.kbv2024 })
      ]
    },
    {
      id: "demo-hospitation-entlassmanagement",
      date: "2026-02-05", start: "10:10", end: "13:05", contactName: "Demo-Team Entlasskoordination 02", organizationName: "Demo-Klinik Westufer 02",
      city: "Potsdam", state: "Brandenburg", sector: "Krankenhaus", observedRoles: ["Pflegefachperson", "Stationsärztin", "Entlasskoordination"],
      goal: "Die Vorbereitung einer ambulanten Weiterbehandlung am Entlasstag nachvollziehen.",
      topics: ["Entlassmanagement", "Anschlussversorgung", "Arzneimittel", "Hilfsmittel"],
      summary: "Mehrere Unterlagen werden zu unterschiedlichen Zeitpunkten fertig; die Entlasskoordination führt offene Punkte in einer lokalen Liste zusammen.",
      observations: [
        hospitationDemoObservation({ id: "obs-entlass-1", sequence: 1, observedAt: "10:22 Uhr", title: "Entlasszeit steht vor dem finalen Arztbrief fest", situationContext: "Morgenbesprechung auf einer internistischen Station.", trigger: "Der Transport für 12:00 Uhr ist bestätigt, der finale Arztbrief aber noch nicht freigegeben.", actions: ["Die Pflegefachperson druckt eine vorläufige Kurzinformation.", "Die Stationsärztin ergänzt handschriftlich zwei Medikamentenänderungen.", "Die Entlasskoordination kennzeichnet den Arztbrief als offen."], toolsAndDocuments: ["KIS", "vorläufige Kurzinformation", "Papierliste"], immediateConsequence: "Die Patientin verlässt die Station zunächst ohne finalen Arztbrief.", affectedRoles: ["Pflegefachperson", "Stationsärztin", "Patientin"], processPhase: "Nachbereitung", problemType: "Wartezeit", impact: "Informationsverlust", currentWorkaround: "Vorläufige Kurzinformation mit handschriftlicher Ergänzung.", settingType: "Klinik / Entlassmanagement", theme: "Entlassbrief", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-entlass-2", sequence: 2, observedAt: "11:05 Uhr", title: "Hilfsmittelstatus wird telefonisch geprüft", situationContext: "Abgleich der Versorgung für die ersten Tage zu Hause.", trigger: "Im KIS ist eine Gehhilfe verordnet, ein Liefertermin ist nicht dokumentiert.", actions: ["Die Koordinatorin öffnet die Hilfsmittelverordnung.", "Sie ruft den Leistungserbringer an.", "Sie notiert den bestätigten Liefertermin in ihrer Arbeitsliste."], toolsAndDocuments: ["KIS", "Hilfsmittelverordnung", "Telefon", "Arbeitsliste"], communicationChannels: ["Telefon"], immediateConsequence: "Der Transport wird um 30 Minuten verschoben, bis die Lieferung bestätigt ist.", affectedRoles: ["Entlasskoordination", "Leistungserbringer", "Patientin"], processPhase: "Verordnung", problemType: "fehlende Information", impact: "Prozessverzögerung", currentWorkaround: "Telefonischer Statusabgleich und lokale Arbeitsliste.", settingType: "Klinik / Entlassmanagement", theme: "Hilfsmittel", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-entlass-3", sequence: 3, observedAt: "12:18 Uhr", title: "Offene Aufgaben werden vor Entlassung vorgelesen", situationContext: "Abschlussgespräch mit Patientin und Angehörigem.", trigger: "Die Entlasskoordination übergibt die Unterlagen.", actions: ["Sie legt Medikamentenplan, Kurzinformation und Terminblatt nebeneinander.", "Sie liest die drei offenen Aufgaben vor.", "Der Angehörige wiederholt, welche Stelle jeweils kontaktiert werden soll."], toolsAndDocuments: ["Medikamentenplan", "Kurzinformation", "Terminblatt"], immediateConsequence: "Die Beteiligten verlassen das Gespräch mit einer gemeinsamen Aufgabenliste.", affectedRoles: ["Entlasskoordination", "Patientin", "Angehöriger"], processPhase: "Kommunikation mit Patient:innen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Klinik / Entlassmanagement", theme: "Übergabe", sourceReference: hospitationDemoSources.gbaPatientLetters })
      ]
    },
    {
      id: "demo-hospitation-erezept-signatur",
      date: "2026-02-19", start: "07:55", end: "10:35", contactName: "Demo-Praxisteam 03", organizationName: "Demo-Hausarztzentrum Alster 03",
      city: "Hamburg", state: "Hamburg", sector: "Ambulante Versorgung", observedRoles: ["MFA", "Hausarzt"],
      goal: "Die Ausstellung und Freigabe von Wiederholungsrezepten im Vormittagsbetrieb beobachten.",
      topics: ["eRezept", "Signatur", "Wiederholungsrezept", "Papierfallback"],
      summary: "eRezepte werden gesammelt signiert; bei einer technischen Unterbrechung wechselt das Team kontrolliert auf Papier.",
      observations: [
        hospitationDemoObservation({ id: "obs-erp-1", sequence: 1, observedAt: "08:16 Uhr", title: "Rezeptbestellungen sammeln sich bis zur Signaturrunde", situationContext: "Telefonische Rezeptannahme am Empfang.", trigger: "Drei Patientinnen bestellen Dauermedikationen.", actions: ["Die MFA prüft die Präparate in der Akte.", "Sie legt drei eRezepte zur ärztlichen Signatur vor.", "Die offenen Vorgänge bleiben in einer PVS-Liste."], toolsAndDocuments: ["PVS", "eRezept-Modul"], communicationChannels: ["Telefon"], immediateConsequence: "Die Rezepte sind erst nach der nächsten Signaturrunde abrufbar.", affectedRoles: ["MFA", "Hausarzt", "Patientinnen"], processPhase: "Verordnung", problemType: "Wartezeit", impact: "Prozessverzögerung", currentWorkaround: "Feste Signaturrunden im Tagesablauf.", settingType: "Hausarztpraxis", theme: "eRezept", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-erp-2", sequence: 2, observedAt: "09:02 Uhr", title: "Signaturdialog blockiert den nächsten Vorgang", situationContext: "Ärztliche Sammelsignatur zwischen zwei Behandlungen.", trigger: "Der Signaturdialog zeigt länger als zehn Sekunden einen Ladezustand.", actions: ["Der Arzt wartet im geöffneten Dialog.", "Er wechselt nicht in die nächste Patientenakte.", "Nach dem zweiten Versuch wird die Signatur bestätigt."], toolsAndDocuments: ["PVS", "eRezept-Signaturdialog"], immediateConsequence: "Der nächste Behandlungsschritt beginnt verspätet.", affectedRoles: ["Hausarzt"], processPhase: "Verordnung", problemType: "technisches Problem", impact: "Arbeitsfluss wird unterbrochen", settingType: "Hausarztpraxis", theme: "Signaturdauer", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-erp-3", sequence: 3, observedAt: "09:44 Uhr", title: "Papierfallback wird sichtbar dokumentiert", situationContext: "Akute Verordnung bei anhaltender Störung.", trigger: "Ein einzelnes eRezept lässt sich nach zwei Versuchen nicht freigeben.", actions: ["Die MFA dokumentiert den Fehlerzeitpunkt im PVS.", "Der Arzt stellt ein Papierrezept aus.", "Die MFA kennzeichnet den digitalen Entwurf als nicht versendet."], toolsAndDocuments: ["PVS", "Muster 16", "Drucker"], immediateConsequence: "Eine doppelte spätere Freigabe wird vermieden.", affectedRoles: ["MFA", "Hausarzt", "Patient"], processPhase: "Verordnung", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", currentWorkaround: "Dokumentierter Wechsel auf Muster 16.", settingType: "Hausarztpraxis", theme: "Fallback", sourceReference: hospitationDemoSources.kbv2024 })
      ]
    },
    {
      id: "demo-hospitation-kim-uebergabe",
      date: "2026-03-04", start: "09:05", end: "11:40", contactName: "Demo-Praxisteam 04", organizationName: "Demo-Gemeinschaftspraxis Leine 04",
      city: "Hannover", state: "Niedersachsen", sector: "Ambulante Versorgung", observedRoles: ["MFA", "Hausärztin"],
      goal: "Den Eingang und die Weiterverarbeitung digitaler Arztbriefe beobachten.", topics: ["KIM", "Arztbrief", "Dokumentenzuordnung"],
      summary: "KIM verkürzt den Transportweg, die fachliche Zuordnung des Anhangs bleibt jedoch ein manueller Arbeitsschritt.",
      observations: [
        hospitationDemoObservation({ id: "obs-kim-1", sequence: 1, observedAt: "09:18 Uhr", title: "Arztbrief erreicht die Praxis ohne Postweg", situationContext: "Bearbeitung des digitalen Posteingangs.", trigger: "Ein fachärztlicher Arztbrief trifft als KIM-Nachricht ein.", actions: ["Die MFA öffnet die Nachricht.", "Sie gleicht Name und Geburtsdatum ab.", "Sie ordnet den PDF-Anhang der Patientenakte zu."], toolsAndDocuments: ["KIM", "PDF-Arztbrief", "PVS"], communicationChannels: ["KIM"], immediateConsequence: "Der Arztbrief ist vor dem Folgetermin in der Akte verfügbar.", affectedRoles: ["MFA", "Hausärztin"], processPhase: "Befund / Dokumentation", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Hausarztpraxis", theme: "KIM", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-kim-2", sequence: 2, observedAt: "09:31 Uhr", title: "Uneindeutiger Betreff verhindert automatische Zuordnung", situationContext: "Zweite Nachricht im KIM-Postfach.", trigger: "Im Betreff steht nur eine Fallnummer; die Patientendaten befinden sich im Anhang.", actions: ["Die MFA öffnet den Anhang.", "Sie sucht die Patientin im PVS.", "Sie benennt das Dokument nach der lokalen Ablageregel um."], toolsAndDocuments: ["KIM", "PDF", "PVS"], immediateConsequence: "Die Zuordnung dauert länger und unterbricht die Postfachbearbeitung.", affectedRoles: ["MFA"], processPhase: "Befund / Dokumentation", problemType: "Workaround", impact: "Zeitaufwand", currentWorkaround: "Manuelle Suche und lokale Dateibenennung.", settingType: "Hausarztpraxis", theme: "Dokumentenzuordnung", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-kim-3", sequence: 3, observedAt: "10:12 Uhr", title: "Rückfrage bleibt im gleichen sicheren Kanal", situationContext: "Ärztliche Sichtung des zugeordneten Befunds.", trigger: "Eine Dosierungsangabe im Arztbrief ist unklar.", actions: ["Die Hausärztin öffnet aus dem Dokument heraus eine neue KIM-Nachricht.", "Sie formuliert eine konkrete Rückfrage.", "Die MFA markiert den Vorgang im PVS als offen."], toolsAndDocuments: ["PVS", "KIM", "Arztbrief"], communicationChannels: ["KIM"], immediateConsequence: "Die Rückfrage ist dokumentiert und muss nicht telefonisch rekonstruiert werden.", affectedRoles: ["Hausärztin", "MFA"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Hausarztpraxis", theme: "Rückfrage", sourceReference: hospitationDemoSources.kbv2024 })
      ]
    },
    {
      id: "demo-hospitation-ueberweisung-vorbefunde",
      date: "2026-03-18", start: "08:20", end: "11:10", contactName: "Demo-Facharztteam 05", organizationName: "Demo-Facharztzentrum Rhein 05",
      city: "Köln", state: "Nordrhein-Westfalen", sector: "Ambulante Facharztversorgung", observedRoles: ["MFA", "Fachärztin"],
      goal: "Die Vorbereitung eines Ersttermins mit Überweisung und Vorbefunden beobachten.", topics: ["Überweisung", "Vorbefunde", "Befundtransfer"],
      summary: "Der Überweisungsanlass ist vorhanden, die entscheidungsrelevanten Vorbefunde müssen jedoch aus mehreren Quellen ergänzt werden.",
      observations: [
        hospitationDemoObservation({ id: "obs-ref-1", sequence: 1, observedAt: "08:34 Uhr", title: "Überweisung enthält keinen zugehörigen Bildbefund", situationContext: "Vorbereitung eines fachärztlichen Ersttermins.", trigger: "Die MFA öffnet die eingescannte Überweisung.", actions: ["Sie liest den Überweisungsanlass.", "Sie prüft die Dokumentenliste im PVS.", "Sie findet keinen angekündigten radiologischen Befund."], toolsAndDocuments: ["PVS", "eingescannte Überweisung"], immediateConsequence: "Der Fall wird vor dem Termin nicht vollständig vorbereitet.", affectedRoles: ["MFA", "Fachärztin"], processPhase: "Überweisung", problemType: "fehlende Information", impact: "Informationsverlust", settingType: "Facharztpraxis", theme: "Vorbefunde", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-ref-2", sequence: 2, observedAt: "08:41 Uhr", title: "Vorbefund wird telefonisch angefordert", situationContext: "Die Dokumentensuche bleibt ohne Ergebnis.", trigger: "Die MFA benötigt den radiologischen Befund vor dem Arztkontakt.", actions: ["Sie ruft die überweisende Praxis an.", "Sie nennt Patientendaten und Untersuchungsdatum.", "Sie notiert, dass der Befund per KIM nachgesendet werden soll."], toolsAndDocuments: ["Telefon", "PVS-Notiz"], communicationChannels: ["Telefon", "KIM"], immediateConsequence: "Die Vorbereitung wird unterbrochen und später erneut aufgenommen.", affectedRoles: ["MFA", "überweisende Praxis"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "Rückfrage", impact: "Arbeitsfluss wird unterbrochen", currentWorkaround: "Telefonische Anforderung mit angekündigtem KIM-Versand.", settingType: "Facharztpraxis", theme: "Befundtransfer", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-ref-3", sequence: 3, observedAt: "09:26 Uhr", title: "Patient zeigt Befund auf dem Smartphone", situationContext: "Beginn des Ersttermins, der digitale Befund ist noch nicht eingetroffen.", trigger: "Die Fachärztin fragt nach dem fehlenden Vorbefund.", actions: ["Der Patient öffnet ein Foto des Befunds auf seinem Smartphone.", "Die Fachärztin liest Kernaussagen vom Display.", "Sie dokumentiert, dass das Original noch aussteht."], toolsAndDocuments: ["Smartphone-Foto", "PVS"], immediateConsequence: "Die Entscheidung stützt sich vorläufig auf eine nicht importierbare Kopie.", affectedRoles: ["Patient", "Fachärztin"], processPhase: "Behandlung / Beratung", problemType: "Workaround", impact: "Patient:innen müssen selbst vermitteln", currentWorkaround: "Vorzeigen eines Fotos durch den Patienten.", settingType: "Facharztpraxis", theme: "Patient als Informationsträger", sourceReference: hospitationDemoSources.kbv2024 })
      ]
    },
    {
      id: "demo-hospitation-hkp-pflegekoordination",
      date: "2026-04-02", start: "07:30", end: "10:20", contactName: "Demo-Pflegekoordination 06", organizationName: "Demo-Pflegedienst Elbblick 06",
      city: "Leipzig", state: "Sachsen", sector: "Pflege", observedRoles: ["Pflegefachperson", "Pflegekoordination"],
      goal: "Die Bearbeitung einer HKP-Verordnung vom Eingang bis zur Einsatzplanung beobachten.", topics: ["Häusliche Krankenpflege", "Verordnung", "Genehmigungsstatus"],
      summary: "Verordnung, Rückfrage und Genehmigungsstatus liegen in getrennten Kanälen; die Koordination führt sie manuell zusammen.",
      observations: [
        hospitationDemoObservation({ id: "obs-hkp-1", sequence: 1, observedAt: "07:42 Uhr", title: "Verordnung kommt als unvollständiger Scan an", situationContext: "Morgendliche Bearbeitung neuer Versorgungsaufträge.", trigger: "Eine HKP-Verordnung wird per Fax empfangen.", actions: ["Die Koordinatorin öffnet den Scan.", "Sie erkennt, dass die Dauer der Maßnahme nicht lesbar ist.", "Sie legt den Vorgang in den Rückfrageordner."], toolsAndDocuments: ["Fax-Postfach", "HKP-Verordnung", "digitaler Rückfrageordner"], communicationChannels: ["Fax"], immediateConsequence: "Der Auftrag kann noch nicht verbindlich eingeplant werden.", affectedRoles: ["Pflegekoordination", "Arztpraxis"], processPhase: "Verordnung", problemType: "fehlende Information", impact: "Prozessverzögerung", settingType: "Pflegekoordination", theme: "HKP", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-hkp-2", sequence: 2, observedAt: "08:11 Uhr", title: "Status wird in einer Tabellenzeile nachgeführt", situationContext: "Nach telefonischer Klärung der Verordnungsdauer.", trigger: "Die Praxis bestätigt die fehlende Angabe telefonisch.", actions: ["Die Koordinatorin ergänzt die Dauer in einer Tabellenzeile.", "Sie trägt den Zeitpunkt der Rückfrage ein.", "Sie setzt den Genehmigungsstatus auf offen."], toolsAndDocuments: ["Telefon", "Tabellenkalkulation", "Verordnung"], communicationChannels: ["Telefon"], immediateConsequence: "Die Einsatzplanung kann beginnen, die Kostenzusage bleibt separat offen.", affectedRoles: ["Pflegekoordination", "MFA"], processPhase: "Nachbereitung", problemType: "doppelte Dokumentation", impact: "Zeitaufwand", currentWorkaround: "Lokale Statusliste mit manueller Wiedervorlage.", settingType: "Pflegekoordination", theme: "Statusführung", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-hkp-3", sequence: 3, observedAt: "09:06 Uhr", title: "Pflegeeinsatz wird unter Vorbehalt geplant", situationContext: "Tourenplanung für den Folgetag.", trigger: "Der medizinische Beginn ist geklärt, die Genehmigung noch nicht eingetroffen.", actions: ["Die Koordinatorin reserviert ein Zeitfenster.", "Sie kennzeichnet den Einsatz farbig als vorläufig.", "Sie legt eine telefonische Wiedervorlage für den Nachmittag an."], toolsAndDocuments: ["Tourenplanung", "Statusliste", "Telefonwiedervorlage"], immediateConsequence: "Personalkapazität wird gebunden, obwohl die Finanzierung noch offen ist.", affectedRoles: ["Pflegekoordination", "Pflegefachperson"], processPhase: "Nachbereitung", problemType: "Wartezeit", impact: "Prozessverzögerung", currentWorkaround: "Vorläufige Reservierung mit Farbcodierung.", settingType: "Pflegekoordination", theme: "Einsatzplanung", sourceReference: hospitationDemoSources.gbaDischarge })
      ]
    },
    {
      id: "demo-hospitation-hilfsmittel-homecare",
      date: "2026-04-16", start: "08:45", end: "11:35", contactName: "Demo-Homecare-Team 07", organizationName: "Demo-Homecare Mainbogen 07",
      city: "Frankfurt am Main", state: "Hessen", sector: "Homecare und Hilfsmittel", observedRoles: ["Sachbearbeitung", "Versorgungskoordination"],
      goal: "Den Statusweg einer Hilfsmittelversorgung zwischen Verordnung, Kostenzusage und Lieferung beobachten.", topics: ["Hilfsmittel", "Kostenzusage", "Lieferstatus"],
      summary: "Ein gemeinsamer Fallstatus fehlt; Sachbearbeitung und Patient gleichen Teilstände telefonisch ab.",
      observations: [
        hospitationDemoObservation({ id: "obs-home-1", sequence: 1, observedAt: "09:02 Uhr", title: "Verordnung und Genehmigung haben getrennte Vorgangsnummern", situationContext: "Prüfung eines neu eingegangenen Hilfsmittelauftrags.", trigger: "Die Verordnung ist erfasst, im Kostenträgerportal fehlt ein passender Vorgang.", actions: ["Die Sachbearbeiterin sucht nach Versichertennummer und Datum.", "Sie vergleicht zwei Vorgangsnummern.", "Sie notiert beide Nummern in der lokalen Fallakte."], toolsAndDocuments: ["Auftragssystem", "Kostenträgerportal", "Verordnung", "lokale Fallakte"], immediateConsequence: "Der Genehmigungsstatus bleibt unklar.", affectedRoles: ["Sachbearbeitung", "Kostenträger"], processPhase: "Verordnung", problemType: "Systemverständnis", impact: "Zeitaufwand", currentWorkaround: "Parallele Dokumentation beider Vorgangsnummern.", settingType: "Homecare", theme: "Genehmigungsstatus", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-home-2", sequence: 2, observedAt: "09:28 Uhr", title: "Statusklärung erfolgt über Hotline", situationContext: "Die Portalsuche liefert keinen eindeutigen Stand.", trigger: "Der Auftrag soll für die Tourenplanung freigegeben werden.", actions: ["Die Sachbearbeiterin ruft die Kostenträger-Hotline an.", "Sie nennt beide Vorgangsnummern.", "Sie überträgt die mündliche Auskunft in das Auftragssystem."], toolsAndDocuments: ["Telefon", "Kostenträgerportal", "Auftragssystem"], communicationChannels: ["Telefon"], immediateConsequence: "Die Lieferung bleibt bis zur schriftlichen Bestätigung zurückgestellt.", affectedRoles: ["Sachbearbeitung", "Kostenträger"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "Rückfrage", impact: "Prozessverzögerung", currentWorkaround: "Telefonische Statusklärung mit manueller Übertragung.", settingType: "Homecare", theme: "Statusklärung", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-home-3", sequence: 3, observedAt: "10:14 Uhr", title: "Patient erhält nur den aktuellen Teilstatus", situationContext: "Eingehender Anruf des Patienten zum Liefertermin.", trigger: "Der Patient fragt, ob das Hilfsmittel am Folgetag geliefert wird.", actions: ["Die Koordinatorin öffnet die Fallakte.", "Sie erklärt, dass die Verordnung vorliegt, die schriftliche Genehmigung aber fehlt.", "Sie vereinbart einen Rückruf nach Eingang der Bestätigung."], toolsAndDocuments: ["Telefon", "Fallakte"], communicationChannels: ["Telefon"], immediateConsequence: "Ein verbindlicher Liefertermin kann nicht genannt werden.", affectedRoles: ["Versorgungskoordination", "Patient"], processPhase: "Kommunikation mit Patient:innen", problemType: "fehlende Information", impact: "Sicherheitsgefühl sinkt", settingType: "Homecare", theme: "Patientenstatus", sourceReference: hospitationDemoSources.gbaDischarge })
      ]
    },
    {
      id: "demo-hospitation-reha-nachsorge",
      date: "2026-04-29", start: "13:10", end: "15:40", contactName: "Demo-Reha-Koordination 08", organizationName: "Demo-Reha-Zentrum Neckarbogen 08",
      city: "Stuttgart", state: "Baden-Württemberg", sector: "Reha", observedRoles: ["Reha-Koordination", "Therapeutin"],
      goal: "Die Übergabe von Therapieplan und Nachsorgeterminen in die ambulante Versorgung beobachten.", topics: ["Reha-Nachsorge", "Therapieplan", "Terminsteuerung"],
      summary: "Therapieplan und Terminbestätigungen werden getrennt geführt; Abweichungen werden in einem Übergabeblatt markiert.",
      observations: [
        hospitationDemoObservation({ id: "obs-reha-1", sequence: 1, observedAt: "13:24 Uhr", title: "Therapieplan und Terminliste zeigen unterschiedliche Startdaten", situationContext: "Vorbereitung des Abschlussgesprächs.", trigger: "Die Koordinatorin vergleicht den Therapieplan mit drei externen Terminbestätigungen.", actions: ["Sie legt vier Dokumente nebeneinander.", "Sie markiert zwei unterschiedliche Startdaten.", "Sie fragt telefonisch bei der Physiotherapiepraxis nach."], toolsAndDocuments: ["Therapieplan", "Terminbestätigungen", "Telefon"], communicationChannels: ["Telefon"], immediateConsequence: "Das Abschlussgespräch wird verschoben, bis der erste Termin geklärt ist.", affectedRoles: ["Reha-Koordination", "Therapiepraxis", "Patient"], processPhase: "Nachbereitung", problemType: "fehlende Information", impact: "Prozessverzögerung", currentWorkaround: "Dokumentenvergleich und telefonische Bestätigung.", settingType: "Reha", theme: "Nachsorge", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-reha-2", sequence: 2, observedAt: "14:08 Uhr", title: "Abweichung wird im Übergabeblatt sichtbar gemacht", situationContext: "Nach Rückruf der Physiotherapiepraxis.", trigger: "Der spätere Starttermin wird bestätigt.", actions: ["Die Koordinatorin streicht das frühere Datum.", "Sie trägt den bestätigten Termin in das Übergabeblatt ein.", "Sie legt das Blatt oben auf die Patientenmappe."], toolsAndDocuments: ["Übergabeblatt", "Patientenmappe"], immediateConsequence: "Im Abschlussgespräch wird nur noch ein Startdatum kommuniziert.", affectedRoles: ["Reha-Koordination", "Patient"], processPhase: "Befund / Dokumentation", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Reha", theme: "Übergabe", sourceReference: hospitationDemoSources.gbaPatientLetters }),
        hospitationDemoObservation({ id: "obs-reha-3", sequence: 3, observedAt: "15:02 Uhr", title: "Rückmeldung zum tatsächlichen Therapiebeginn ist nicht vorgesehen", situationContext: "Abschluss der Nachsorgeplanung.", trigger: "Der Patient fragt, wer informiert wird, falls der Termin erneut ausfällt.", actions: ["Die Koordinatorin prüft das Übergabeblatt.", "Sie nennt die Telefonnummer der Reha-Nachsorge.", "Sie dokumentiert keinen automatischen Rückmeldeweg."], toolsAndDocuments: ["Übergabeblatt", "Telefonnummernblatt"], immediateConsequence: "Der Patient muss eine Abweichung selbst melden.", affectedRoles: ["Patient", "Reha-Koordination"], processPhase: "Kommunikation mit Patient:innen", problemType: "Rollenunklarheit", impact: "Patient:innen müssen selbst vermitteln", settingType: "Reha", theme: "Rückmeldeweg", sourceReference: hospitationDemoSources.gbaDischarge })
      ]
    },
    {
      id: "demo-hospitation-paediatrische-entlassung",
      date: "2026-05-07", start: "09:30", end: "12:25", contactName: "Demo-Entlassteam Pädiatrie 09", organizationName: "Demo-Kinderklinik Isar 09",
      city: "München", state: "Bayern", sector: "Krankenhaus", observedRoles: ["Kinderärztin", "Pflegefachperson", "Elternteil"],
      goal: "Die Informationsübergabe an Eltern und ambulante Kinderarztpraxis beobachten.", topics: ["Kinder- und Jugendversorgung", "Entlassbrief", "Angehörigenkommunikation"],
      summary: "Die medizinischen Informationen sind vorhanden, müssen aber für Eltern in konkrete nächste Schritte übersetzt werden.",
      observations: [
        hospitationDemoObservation({ id: "obs-paed-1", sequence: 1, observedAt: "09:46 Uhr", title: "Drei Unterlagen verwenden unterschiedliche Bezeichnungen", situationContext: "Vorbereitung der Entlassmappe.", trigger: "Pflegefachperson und Kinderärztin prüfen Medikamentenplan, Arztbrief und Elterninformation.", actions: ["Die Pflegefachperson legt die Unterlagen nebeneinander.", "Sie markiert unterschiedliche Bezeichnungen für dasselbe Medikament.", "Die Kinderärztin vereinheitlicht die Einnahmeanweisung in der Elterninformation."], toolsAndDocuments: ["Medikamentenplan", "Arztbrief", "Elterninformation"], immediateConsequence: "Die Elterninformation enthält eine eindeutige Bezeichnung.", affectedRoles: ["Pflegefachperson", "Kinderärztin", "Elternteil"], processPhase: "Befund / Dokumentation", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Kinderklinik", theme: "Verständlichkeit", sourceReference: hospitationDemoSources.gbaPatientLetters }),
        hospitationDemoObservation({ id: "obs-paed-2", sequence: 2, observedAt: "10:28 Uhr", title: "Elternteil fotografiert den Terminplan", situationContext: "Entlassgespräch am Patientenbett.", trigger: "Vier Nachsorgetermine werden auf einem Papierblatt erklärt.", actions: ["Die Pflegefachperson zeigt die Termine einzeln.", "Das Elternteil fotografiert das Blatt mit dem Smartphone.", "Es markiert den ersten Termin zusätzlich im Kalender."], toolsAndDocuments: ["Terminblatt", "Smartphone-Kalender"], immediateConsequence: "Das Papierblatt bleibt die einzige gemeinsame Terminquelle.", affectedRoles: ["Pflegefachperson", "Elternteil"], processPhase: "Kommunikation mit Patient:innen", problemType: "Workaround", impact: "Patient:innen müssen selbst vermitteln", currentWorkaround: "Foto des Terminblatts und eigener Smartphone-Kalender.", settingType: "Kinderklinik", theme: "Terminübergabe", sourceReference: hospitationDemoSources.gbaPatientLetters }),
        hospitationDemoObservation({ id: "obs-paed-3", sequence: 3, observedAt: "11:17 Uhr", title: "Kinderarztpraxis erhält den Brief nach dem Gespräch", situationContext: "Versand der Entlassunterlagen.", trigger: "Der finale Arztbrief wird freigegeben.", actions: ["Die Stationssekretärin erzeugt ein PDF.", "Sie sendet den Brief an die hinterlegte Praxisadresse.", "Sie vermerkt den Versandzeitpunkt in der Akte."], toolsAndDocuments: ["KIS", "PDF-Arztbrief", "Versandprotokoll"], communicationChannels: ["sicherer digitaler Versand"], immediateConsequence: "Die ambulante Praxis erhält denselben finalen Stand wie die Familie.", affectedRoles: ["Stationssekretariat", "Kinderarztpraxis"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Kinderklinik", theme: "Befundtransfer", sourceReference: hospitationDemoSources.kbv2024 })
      ]
    },
    {
      id: "demo-hospitation-radiologie-befundtransfer",
      date: "2026-05-21", start: "08:10", end: "10:55", contactName: "Demo-Radiologieteam 10", organizationName: "Demo-Radiologieverbund Elbe 10",
      city: "Dresden", state: "Sachsen", sector: "Ambulante Facharztversorgung", observedRoles: ["MFA", "Radiologin"],
      goal: "Den Transfer von Befundtext und Bilddaten an die weiterbehandelnde Praxis beobachten.", topics: ["Bildbefund", "Befundtransfer", "KIM", "Portal"],
      summary: "Befundtext und Bilddaten verlassen die Radiologie über unterschiedliche technische Wege und müssen beim Empfänger wieder zusammengeführt werden.",
      observations: [
        hospitationDemoObservation({ id: "obs-radio-1", sequence: 1, observedAt: "08:26 Uhr", title: "Befundtext und Bilddaten werden getrennt versendet", situationContext: "Freigabe eines radiologischen Befunds.", trigger: "Die Radiologin schließt die Befundung ab.", actions: ["Sie gibt den Befundtext frei.", "Die MFA versendet das PDF per KIM.", "Sie erzeugt separat einen Portalzugang für die Bilddaten."], toolsAndDocuments: ["RIS", "PACS", "KIM", "Bildportal"], communicationChannels: ["KIM", "Webportal"], immediateConsequence: "Die empfangende Praxis benötigt zwei Zugänge für einen Fall.", affectedRoles: ["Radiologin", "MFA", "überweisende Praxis"], processPhase: "Befund / Dokumentation", problemType: "Medienbruch", impact: "Informationsverlust", settingType: "Radiologie", theme: "Befundtransfer", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-radio-2", sequence: 2, observedAt: "09:03 Uhr", title: "Portalzugang wird telefonisch erneut übermittelt", situationContext: "Rückruf der überweisenden Praxis.", trigger: "Der Befund ist eingetroffen, der Portalcode wurde dort nicht gefunden.", actions: ["Die MFA prüft das Versandprotokoll.", "Sie liest den Portalcode am Telefon vor.", "Sie dokumentiert die erneute Übermittlung."], toolsAndDocuments: ["Telefon", "Versandprotokoll", "Bildportal"], communicationChannels: ["Telefon"], immediateConsequence: "Die Bildansicht verzögert sich bis zur manuellen Klärung.", affectedRoles: ["MFA", "überweisende Praxis"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "Rückfrage", impact: "Arbeitsfluss wird unterbrochen", currentWorkaround: "Telefonische Übermittlung des Portalzugangs.", settingType: "Radiologie", theme: "Portalzugang", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-radio-3", sequence: 3, observedAt: "09:42 Uhr", title: "Dringlicher Befund wird zusätzlich direkt angekündigt", situationContext: "Freigabe eines zeitkritischen Befunds.", trigger: "Die Radiologin kennzeichnet den Befund als dringlich.", actions: ["Sie ruft die weiterbehandelnde Ärztin direkt an.", "Sie nennt die zentrale Befundaussage.", "Die MFA versendet anschließend Befund und Portalzugang."], toolsAndDocuments: ["Telefon", "KIM", "Bildportal"], communicationChannels: ["Telefon", "KIM"], immediateConsequence: "Die Dringlichkeit ist vor dem Dokumenteneingang bekannt.", affectedRoles: ["Radiologin", "weiterbehandelnde Ärztin", "MFA"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Radiologie", theme: "Dringlichkeit", sourceReference: hospitationDemoSources.kbv2024 })
      ]
    },
    {
      id: "demo-hospitation-dmp-telemonitoring",
      date: "2026-06-03", start: "07:50", end: "10:30", contactName: "Demo-DMP-Team 11", organizationName: "Demo-DMP-Zentrum Weser 11",
      city: "Bremen", state: "Bremen", sector: "Ambulante Versorgung", observedRoles: ["MFA", "Hausärztin"],
      goal: "Die Bearbeitung auffälliger Telemonitoring-Werte vom Eingang bis zur Rückmeldung beobachten.", topics: ["DMP", "Telemonitoring", "Aufgabenstatus"],
      summary: "Messwerte sind digital verfügbar; die Zuweisung und Nachverfolgung der daraus entstehenden Aufgabe erfolgt im Praxisteam.",
      observations: [
        hospitationDemoObservation({ id: "obs-dmp-1", sequence: 1, observedAt: "08:05 Uhr", title: "Auffälliger Wert erscheint ohne zuständige Rolle", situationContext: "Morgendliche Sichtung des Telemonitoring-Portals.", trigger: "Ein Messwert überschreitet den hinterlegten Grenzwert.", actions: ["Die MFA öffnet die Detailansicht.", "Sie prüft die letzten drei Werte.", "Sie überträgt den Fall in die PVS-Aufgabenliste der Ärztin."], toolsAndDocuments: ["Telemonitoring-Portal", "PVS-Aufgabenliste"], immediateConsequence: "Die Verantwortlichkeit entsteht erst durch die manuelle Übertragung.", affectedRoles: ["MFA", "Hausärztin"], processPhase: "Nachbereitung", problemType: "Rollenunklarheit", impact: "Zeitaufwand", currentWorkaround: "Manuelle Aufgabe im PVS.", settingType: "Hausarztpraxis", theme: "Telemonitoring", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-dmp-2", sequence: 2, observedAt: "08:37 Uhr", title: "Rückruf wird im PVS dokumentiert", situationContext: "Ärztliche Prüfung des übertragenen Falls.", trigger: "Die Hausärztin bewertet die Wertentwicklung als klärungsbedürftig.", actions: ["Sie ruft den Patienten an.", "Sie dokumentiert Symptome und vereinbart eine Kontrolle.", "Sie schließt die Aufgabe im PVS."], toolsAndDocuments: ["Telefon", "PVS-Aufgabe", "Terminplan"], communicationChannels: ["Telefon"], immediateConsequence: "Der auffällige Wert führt zu einem dokumentierten Folgetermin.", affectedRoles: ["Hausärztin", "Patient"], processPhase: "Kommunikation mit Patient:innen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Hausarztpraxis", theme: "Rückmeldung", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-dmp-3", sequence: 3, observedAt: "09:16 Uhr", title: "Portalstatus bleibt trotz abgeschlossener Aufgabe offen", situationContext: "Erneute Sichtung des Telemonitoring-Portals.", trigger: "Der Rückruf und der Folgetermin sind im PVS abgeschlossen.", actions: ["Die MFA kehrt in das Portal zurück.", "Sie findet keine Funktion zum Übernehmen des PVS-Status.", "Sie kennzeichnet den Fall separat als bearbeitet."], toolsAndDocuments: ["Telemonitoring-Portal", "PVS"], immediateConsequence: "Derselbe Bearbeitungsstatus wird in zwei Systemen gepflegt.", affectedRoles: ["MFA"], processPhase: "Nachbereitung", problemType: "doppelte Dokumentation", impact: "Zeitaufwand", currentWorkaround: "Separate Statuspflege in Portal und PVS.", settingType: "Hausarztpraxis", theme: "Aufgabenstatus", sourceReference: hospitationDemoSources.kbv2024 })
      ]
    },
    {
      id: "demo-hospitation-psychosozialer-krisenpfad",
      date: "2026-06-17", start: "14:00", end: "16:35", contactName: "Demo-Praxisteam Psychosozial 12", organizationName: "Demo-Praxis Nordlicht 12",
      city: "Magdeburg", state: "Sachsen-Anhalt", sector: "Psychosoziale Versorgung", observedRoles: ["Psychotherapeutin", "Praxisassistenz"],
      goal: "Die Koordination eines akuten Krisenfalls zwischen Praxis, Beratungsstelle und Klinik beobachten.", topics: ["Krisenpfad", "Rollenklärung", "Sichere Übergabe"],
      summary: "Die direkte telefonische Übergabe funktioniert, die anschließende schriftliche Dokumentation verteilt sich jedoch auf mehrere Systeme.",
      observations: [
        hospitationDemoObservation({ id: "obs-krise-1", sequence: 1, observedAt: "14:18 Uhr", title: "Akuter Anruf unterbricht die laufende Dokumentation", situationContext: "Nachbereitung einer regulären Sitzung.", trigger: "Eine Beratungsstelle meldet telefonisch eine akute Verschlechterung.", actions: ["Die Psychotherapeutin beendet die laufende Dokumentation.", "Sie notiert Kerndaten auf einem Krisenblatt.", "Die Assistenz sucht parallel die zuständige Kliniknummer."], toolsAndDocuments: ["Telefon", "Krisenblatt", "Kontaktliste"], communicationChannels: ["Telefon"], immediateConsequence: "Zwei Teammitglieder wechseln unmittelbar in den Krisenprozess.", affectedRoles: ["Psychotherapeutin", "Praxisassistenz", "Beratungsstelle"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "Rollenunklarheit", impact: "Arbeitsfluss wird unterbrochen", currentWorkaround: "Krisenblatt und lokale Kontaktliste.", settingType: "Psychosoziale Praxis", theme: "Krisenkoordination", sourceReference: hospitationDemoSources.cirsTransition }),
        hospitationDemoObservation({ id: "obs-krise-2", sequence: 2, observedAt: "14:29 Uhr", title: "Zuständigkeit wird im direkten Gespräch geklärt", situationContext: "Telefonische Übergabe an die Klinik.", trigger: "Die Klinik nimmt den Anruf entgegen.", actions: ["Die Psychotherapeutin schildert die aktuelle Situation.", "Die aufnehmende Ärztin bestätigt die weitere Verantwortung.", "Beide vereinbaren Ankunftszeit und Rückrufnummer."], toolsAndDocuments: ["Telefon", "Krisenblatt"], communicationChannels: ["Telefon"], immediateConsequence: "Die nächste verantwortliche Rolle und der Zeitrahmen sind eindeutig.", affectedRoles: ["Psychotherapeutin", "aufnehmende Ärztin"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Psychosoziale Praxis", theme: "Warme Übergabe", sourceReference: hospitationDemoSources.cirsTransition }),
        hospitationDemoObservation({ id: "obs-krise-3", sequence: 3, observedAt: "15:06 Uhr", title: "Übergabe wird in zwei Dokumentationen nachgetragen", situationContext: "Nach Abschluss der telefonischen Koordination.", trigger: "Die unmittelbare Übergabe ist beendet.", actions: ["Die Psychotherapeutin überträgt die Notizen in die Patientenakte.", "Die Assistenz dokumentiert Zeitpunkt und Zielklinik im Krisenregister.", "Das Papierblatt wird bis zur Gegenprüfung aufbewahrt."], toolsAndDocuments: ["Patientenakte", "Krisenregister", "Krisenblatt"], immediateConsequence: "Dieselben Kerndaten werden in zwei Systemen und vorübergehend auf Papier geführt.", affectedRoles: ["Psychotherapeutin", "Praxisassistenz"], processPhase: "Befund / Dokumentation", problemType: "doppelte Dokumentation", impact: "Zeitaufwand", currentWorkaround: "Nachträglicher Abgleich von Patientenakte und Krisenregister.", settingType: "Psychosoziale Praxis", theme: "Dokumentation", sourceReference: hospitationDemoSources.cirsTransition })
      ]
    },
    {
      id: "demo-hospitation-patienteninformation-entlassung",
      date: "2026-06-25", start: "10:25", end: "12:50", contactName: "Demo-Team Patienteninformation 13", organizationName: "Demo-Klinik Südstadt 13",
      city: "Rostock", state: "Mecklenburg-Vorpommern", sector: "Krankenhaus", observedRoles: ["Stationsärztin", "Pflegefachperson", "Patient"],
      goal: "Beobachten, wie medizinische Entlassinformationen in verständliche nächste Schritte übersetzt werden.", topics: ["Patienteninformation", "Entlassbrief", "Medikationsverständnis"],
      summary: "Ein zusätzliches verständliches Patientenblatt reduziert Rückfragen, bleibt aber ein weiterer zu pflegender Dokumentenstand.",
      observations: [
        hospitationDemoObservation({ id: "obs-info-1", sequence: 1, observedAt: "10:42 Uhr", title: "Medizinischer Arztbrief beantwortet die Alltagsfragen nicht", situationContext: "Vorbereitung eines Entlassgesprächs.", trigger: "Der Patient fragt, welches Medikament abends nicht mehr eingenommen werden soll.", actions: ["Die Pflegefachperson sucht die Änderung im Arztbrief.", "Sie gleicht sie mit dem Medikationsplan ab.", "Sie markiert die Änderung im Patientenblatt."], toolsAndDocuments: ["Arztbrief", "Medikationsplan", "Patientenblatt"], immediateConsequence: "Die konkrete Einnahmeänderung wird im Gespräch sichtbar hervorgehoben.", affectedRoles: ["Pflegefachperson", "Patient"], processPhase: "Kommunikation mit Patient:innen", problemType: "Systemverständnis", impact: "Sicherheitsgefühl sinkt", currentWorkaround: "Zusätzliches laienverständliches Patientenblatt.", settingType: "Klinik / Entlassmanagement", theme: "Medikationsverständnis", sourceReference: hospitationDemoSources.gbaPatientLetters }),
        hospitationDemoObservation({ id: "obs-info-2", sequence: 2, observedAt: "11:18 Uhr", title: "Patient wiederholt den nächsten Schritt", situationContext: "Entlassgespräch mit drei schriftlichen Unterlagen.", trigger: "Die Stationsärztin erklärt die Medikamentenänderung und den Kontrolltermin.", actions: ["Sie bittet den Patienten, die nächsten Schritte in eigenen Worten zu wiederholen.", "Der Patient nennt Medikament, Zeitpunkt und Kontrolltermin.", "Die Pflegefachperson korrigiert eine zunächst falsch genannte Uhrzeit."], toolsAndDocuments: ["Patientenblatt", "Medikationsplan", "Terminblatt"], immediateConsequence: "Ein Missverständnis wird vor der Entlassung erkannt.", affectedRoles: ["Stationsärztin", "Pflegefachperson", "Patient"], processPhase: "Kommunikation mit Patient:innen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Klinik / Entlassmanagement", theme: "Teach-back", sourceReference: hospitationDemoSources.gbaPatientLetters }),
        hospitationDemoObservation({ id: "obs-info-3", sequence: 3, observedAt: "11:46 Uhr", title: "Änderung muss in zwei Dokumenten nachgeführt werden", situationContext: "Korrektur einer Terminzeit nach dem Gespräch.", trigger: "Die Ambulanz meldet telefonisch eine neue Uhrzeit.", actions: ["Die Pflegefachperson ändert das Terminblatt.", "Sie öffnet das Patientenblatt und ändert dieselbe Uhrzeit erneut.", "Sie druckt beide Dokumente neu."], toolsAndDocuments: ["Terminblatt", "Patientenblatt", "Drucker"], communicationChannels: ["Telefon"], immediateConsequence: "Zwei veraltete Ausdrucke werden vernichtet und neu erstellt.", affectedRoles: ["Pflegefachperson", "Ambulanz"], processPhase: "Befund / Dokumentation", problemType: "doppelte Dokumentation", impact: "Zeitaufwand", currentWorkaround: "Manuelle Synchronisation beider Dokumente.", settingType: "Klinik / Entlassmanagement", theme: "Dokumentenstand", sourceReference: hospitationDemoSources.gbaPatientLetters })
      ]
    }
  ];

  const hospitations = hospitationDefinitions.map((definition, index) => {
    const ownerId = ownerIds[index % ownerIds.length] || ownerIds[0] || "";
    const contactSector = {
      "Ambulante Versorgung": "Praxis",
      "Ambulante Facharztversorgung": "Praxis",
      "Homecare und Hilfsmittel": "Hilfsmittel",
      "Psychosoziale Versorgung": "Therapie"
    }[definition.sector] || definition.sector;
    const sectorContacts = contacts.filter((entry) => entry.category === contactSector && entry.status !== "archived");
    const linkedContact = sectorContacts[index % sectorContacts.length] || contacts[index % contacts.length];
    const linkedOrganization = organizations.find((entry) => entry.id === linkedContact.organizationId) || organizations[index % organizations.length];
    const offset = definition.date >= "2026-03-29" ? "+02:00" : "+01:00";
    return {
      id: definition.id,
      contactId: linkedContact.id,
      contactName: linkedContact.name,
      contactImage: linkedContact.image || "",
      organizationId: linkedOrganization.id,
      organizationName: linkedOrganization.name,
      requesterProfileId: ownerId,
      ownerId,
      status: "Dokumentiert",
      requestedWindows: [],
      startsAt: `${definition.date}T${definition.start}:00${offset}`,
      endsAt: `${definition.date}T${definition.end}:00${offset}`,
      location: linkedOrganization.city,
      city: linkedOrganization.city,
      state: linkedOrganization.state,
      sector: linkedOrganization.sector,
      observedRoles: definition.observedRoles,
      goal: definition.goal,
      topics: ["Hospitation", "Versorgungskontakt", ...definition.topics],
      requestNote: "Rein synthetische Demo-Hospitation. Personen, Organisationen und Quellenadressen sind ausdrücklich fiktiv.",
      documentationSummary: definition.summary,
      documentationOutcome: hospitationDemoDocumentation(definition),
      followUpNote: "",
      followUpOwnerId: "",
      followUpDueAt: "",
      documentedAt: `${definition.date}T${definition.end}:00${offset}`,
      documentedBy: ownerId,
      createdAt: now,
      createdBy: ownerId,
      updatedAt: now,
      updatedBy: ownerId
    };
  });

  const plannedHospitationStatuses = ["Angefragt", "Angeboten", "Gebucht", "Durchgeführt", "Abgesagt"];
  plannedHospitationStatuses.forEach((status, index) => {
    const linkedContact = contacts[40 + index];
    const linkedOrganization = organizations.find((entry) => entry.id === linkedContact.organizationId);
    const startsAt = new Date(Date.UTC(2026, 7 + index, 6 + index * 3, 8 + index, 30, 0));
    const endsAt = new Date(startsAt.getTime() + (90 + index * 15) * 60 * 1000);
    hospitations.push({
      id: `demo-hospitation-workflow-${String(index + 1).padStart(2, "0")}`,
      contactId: linkedContact.id,
      contactName: linkedContact.name,
      contactImage: linkedContact.image || "",
      organizationId: linkedOrganization.id,
      organizationName: linkedOrganization.name,
      requesterProfileId: ownerIds[(index + 1) % ownerIds.length],
      ownerId: ownerIds[(index + 1) % ownerIds.length],
      status,
      requestedWindows: [],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      location: index === 1 ? "Online" : linkedOrganization.city,
      city: linkedOrganization.city,
      state: linkedOrganization.state,
      sector: linkedOrganization.sector,
      observedRoles: [linkedContact.contactRole, "Demo-Beobachtungsteam"],
      goal: [
        "ePA-Medikationsübersicht im Übergang zwischen Praxis und Apotheke beobachten.",
        "Einsatzmöglichkeiten des TI-Messengers für kurze sektorenübergreifende Rückfragen vorbereiten.",
        "Befundübergabe über KIM und strukturierte Krankenhausdaten nachvollziehen.",
        "Arbeitsablauf rund um E-Rezept und Medikationsabgleich dokumentieren.",
        "Abgesagtes Szenario für Termin- und Statusfilter sichtbar halten."
      ][index],
      topics: ["Hospitation", ["ePA", "TI-Messenger", "KIM", "E-Rezept", "Terminsteuerung"][index]],
      requestNote: "Realitätsnahes synthetisches Szenario; keine reale Einrichtung oder Feldbeobachtung.",
      documentationSummary: status === "Durchgeführt" ? "Beobachtung abgeschlossen; strukturierte Dokumentation ist noch offen." : "",
      documentationOutcome: "",
      createdAt: now,
      createdBy: ownerIds[(index + 1) % ownerIds.length],
      updatedAt: now,
      updatedBy: ownerIds[(index + 1) % ownerIds.length]
    });
  });

  const roadmapItems = [
    { id: "demo-roadmap-epa-medikation", slug: "epa-3-1-3-teil-1", productName: "ePA", featureName: "Medikationsprozess und Patientenbenachrichtigungen", sortOrder: 10, status: "active" },
    { id: "demo-roadmap-epa-entlassung", slug: "epa-laborprozess-entlassbericht", productName: "ePA", featureName: "Laborwerte, Arztbrief und Entlassbericht", sortOrder: 20, status: "active" },
    { id: "demo-roadmap-tim-pro", slug: "tim-pro-automation-bots", productName: "TI-Messenger", featureName: "Sektorenübergreifende Echtzeitkommunikation", sortOrder: 30, status: "active" },
    { id: "demo-roadmap-kim", slug: "kim-1-6-fhir-vzd", productName: "KIM", featureName: "Sichere Adressierung und strukturierte Nachrichten", sortOrder: 40, status: "active" },
    { id: "demo-roadmap-ti-gateway", slug: "zeta-1-zero-trust-access", productName: "TI-Zugang", featureName: "TI-Gateway und Zero-Trust-Anbindung", sortOrder: 50, status: "active" },
    { id: "demo-roadmap-isik", slug: "isik-6", productName: "ISiK", featureName: "Strukturierte Krankenhausdaten und FHIR", sortOrder: 60, status: "active" }
  ];
  const hospitationRoadmapAssessments = hospitations.slice(0, 6).flatMap((hospitation, hospitationIndex) =>
    [0, 1].map((offset) => ({
      id: `demo-roadmap-assessment-${String(hospitationIndex * 2 + offset + 1).padStart(2, "0")}`,
      hospitationId: hospitation.id,
      roadmapItemId: roadmapItems[(hospitationIndex + offset) % roadmapItems.length].id,
      respondentRole: hospitation.observedRoles[0] || "Versorgungsrolle",
      respondentSector: hospitation.sector,
      careRelevance: 4 + ((hospitationIndex + offset) % 2),
      patientSafety: 3 + ((hospitationIndex + offset) % 3),
      processRelief: 3 + (offset % 2),
      urgency: 3 + (hospitationIndex % 3),
      implementationFeasibility: 2 + ((hospitationIndex + offset) % 3),
      adoptionLikelihood: 3 + (offset % 2),
      confidenceScore: 4,
      comparisonRole: offset === 0 ? "top_priority" : "none",
      evidenceNote: "Synthetische Übungsbewertung auf Basis der dokumentierten Demo-Beobachtung.",
      createdAt: now,
      updatedAt: now
    }))
  );
  const unmetNeedTitles = [
    "Medikationsänderung ohne Medienbruch sichtbar machen",
    "Kurze Rückfragen sicher an die richtige Rolle adressieren",
    "Entlassinformationen in nachgelagerten Systemen auffindbar machen",
    "Strukturierte Laborbefunde ohne manuelle Übertragung nutzen",
    "Status eines E-Rezepts im Versorgungsgespräch verständlich erklären",
    "TI-Zugangsprobleme früh und rollengerecht melden",
    "Pflegeübergaben mit eindeutigem nächsten Schritt versehen",
    "Patienteninformation und Fachinformation synchron halten"
  ];
  const hospitationUnmetNeeds = unmetNeedTitles.map((title, index) => ({
    id: `demo-unmet-need-${String(index + 1).padStart(2, "0")}`,
    hospitationId: hospitations[index % 8].id,
    relatedRoadmapItemId: roadmapItems[index % roadmapItems.length].id,
    title,
    problem: "Der beobachtete Demo-Ablauf zeigt einen wiederkehrenden manuellen Zwischenschritt mit unklarer Zuständigkeit.",
    affectedRole: hospitations[index % 8].observedRoles[0] || "Versorgungsrolle",
    affectedSector: hospitations[index % 8].sector,
    classification: index % 3 === 0 ? "organizational_implementation" : index % 3 === 1 ? "existing_item_extension" : "communication_or_training",
    expectedBenefit: 4 + (index % 2),
    urgency: 3 + (index % 3),
    implementationFeasibility: 3 + (index % 2),
    confidenceScore: 4,
    currentWorkaround: "Telefonische Rückfrage und parallele Dokumentation in einer lokalen Arbeitsliste.",
    nextStep: "In einem weiteren synthetischen Versorgungsszenario mit zwei Sektoren validieren.",
    status: index < 5 ? "In Prüfung" : "Neu",
    createdAt: now,
    updatedAt: now
  }));
  const formats = [
    {
      id: "demo-format-krankenhausentlassbrief",
      title: "Versorgungs-Forum Krankenhausentlassbrief",
      formatType: "Roundtable",
      startsAt: "2026-10-08T09:00:00.000Z",
      endsAt: "2026-10-08T11:00:00.000Z",
      location: "Online",
      goal: "Versorgungsperspektiven auf einen verständlichen, vollständigen und anschlussfähigen Krankenhausentlassbrief zusammenführen.",
      ownerId: ownerIds[0] || "",
      status: "Planung",
      notes: "",
      createdAt: now,
      createdBy: ownerIds[0] || "",
      updatedAt: now,
      updatedBy: ownerIds[0] || "",
      participants: contacts.slice(0, 15).map((entry, index) => ({
        id: `demo-format-participant-${String(index + 1).padStart(2, "0")}`,
        formatId: "demo-format-krankenhausentlassbrief",
        contactId: entry.id,
        invitationStatus: "Eingeladen",
        participantRole: "",
        notes: "",
        invitedAt: "2026-07-10T08:00:00.000Z",
        statusChangedAt: "2026-07-10T08:00:00.000Z",
        createdAt: now,
        createdBy: ownerIds[0] || "",
        updatedAt: now,
        updatedBy: ownerIds[0] || ""
      }))
    },
    {
      id: "demo-format-epa-erfahrungsaustausch",
      title: "Erfahrungsaustausch ePA im Versorgungsalltag",
      formatType: "Fachgespräch",
      startsAt: "2026-03-12T13:00:00.000Z",
      endsAt: "2026-03-12T15:00:00.000Z",
      location: "Berlin",
      goal: "Erfahrungen aus der Versorgung zur Nutzung der ePA bündeln.",
      ownerId: ownerIds[1] || ownerIds[0] || "",
      status: "Abgeschlossen",
      notes: "",
      createdAt: now,
      createdBy: ownerIds[1] || ownerIds[0] || "",
      updatedAt: "2026-03-12T15:00:00.000Z",
      updatedBy: ownerIds[1] || ownerIds[0] || "",
      participants: contacts.slice(0, 5).map((entry, index) => ({
        id: `demo-format-past-participant-${String(index + 1).padStart(2, "0")}`,
        formatId: "demo-format-epa-erfahrungsaustausch",
        contactId: entry.id,
        invitationStatus: "Teilgenommen",
        participantRole: index === 0 ? "Praxisperspektive" : "",
        notes: "",
        invitedAt: "2026-02-12T08:00:00.000Z",
        respondedAt: "2026-02-18T08:00:00.000Z",
        participatedAt: "2026-03-12T15:00:00.000Z",
        statusChangedAt: "2026-03-12T15:00:00.000Z",
        createdAt: "2026-02-12T08:00:00.000Z",
        createdBy: ownerIds[1] || ownerIds[0] || "",
        updatedAt: "2026-03-12T15:00:00.000Z",
        updatedBy: ownerIds[1] || ownerIds[0] || ""
      }))
    }
  ];

  const additionalFormatDefinitions = [
    ["demo-format-epa-medikation", "Praxisdialog ePA: Medikationsliste und E-Rezept im Arbeitsablauf", "Workshop", "2026-08-27T08:00:00.000Z", "2026-08-27T11:00:00.000Z", "Leipzig", "Aktiv", "Sichere Medikationsabgleiche zwischen Praxis, Apotheke und Patient:innen anhand synthetischer Abläufe erproben."],
    ["demo-format-ti-messenger", "Fachgespräch TI-Messenger: kurze Rückfragen sektorenübergreifend klären", "Fachgespräch", "2026-09-15T11:00:00.000Z", "2026-09-15T13:00:00.000Z", "Online", "Planung", "Rückfragen zu Medikation, Befunden und Übergaben als realitätsnahe Demo-Szenarien vergleichen."],
    ["demo-format-ti-gateway", "Roundtable TI-Gateway: Betriebsrealität nach RSA2ECC", "Roundtable", "2026-11-05T09:00:00.000Z", "2026-11-05T11:30:00.000Z", "Berlin", "Planung", "Stabilität, Supportwege und Übergänge bei der TI-Anbindung aus verschiedenen Versorgungssektoren betrachten."],
    ["demo-format-isik-fhir", "Interoperabilitätslabor ISiK/FHIR: Befunde anschlussfähig austauschen", "Workshop", "2026-05-21T08:30:00.000Z", "2026-05-21T14:00:00.000Z", "Hamburg", "Abgeschlossen", "Strukturierte Krankenhausdaten, Laborbefunde und Entlassinformationen in einem fiktiven Versorgungspfad testen."],
    ["demo-format-kim-entlassung", "Sektorforum KIM: Entlassbrief und Rückfragen ohne Medienbruch", "Diskussionsformat", "2026-07-30T12:00:00.000Z", "2026-07-30T14:00:00.000Z", "Online", "Aktiv", "KIM für formale Nachrichten und TI-Messenger für kurze organisatorische Rückfragen voneinander abgrenzen."],
    ["demo-format-vsdm-popp", "Werkstatt VSDM 2.0 und PoPP: Versorgungskontext im Praxisworkflow", "Werkstatt", "2027-01-28T09:00:00.000Z", "2027-01-28T12:00:00.000Z", "Köln", "Planung", "Zugriffs- und Nachweissituationen anhand rein synthetischer Rollen und Abläufe verständlich machen."]
  ];
  additionalFormatDefinitions.forEach((definition, formatIndex) => {
    const [id, title, formatType, startsAt, endsAt, location, status, goal] = definition;
    const participantCount = 8 + (formatIndex % 4);
    const participants = Array.from({ length: participantCount }, (_, participantIndex) => {
      const contactEntry = contacts[(formatIndex * 7 + participantIndex) % contacts.length];
      const invitationStatuses = status === "Abgeschlossen"
        ? ["Teilgenommen", "Teilgenommen", "Abgesagt"]
        : ["Eingeladen", "Zugesagt", "Keine Rückmeldung", "Kandidat"];
      const invitationStatus = invitationStatuses[participantIndex % invitationStatuses.length];
      return {
        id: `demo-format-participant-${id.replace("demo-format-", "")}-${String(participantIndex + 1).padStart(2, "0")}`,
        formatId: id,
        contactId: contactEntry.id,
        invitationStatus,
        participantRole: participantIndex === 0 ? "Versorgungsperspektive" : "",
        notes: "Synthetische Teilnahmebeziehung für die öffentliche Demo.",
        invitedAt: "2026-07-19T09:00:00.000Z",
        respondedAt: ["Zugesagt", "Abgesagt", "Teilgenommen"].includes(invitationStatus) ? "2026-07-20T09:00:00.000Z" : "",
        participatedAt: invitationStatus === "Teilgenommen" ? endsAt : "",
        statusChangedAt: "2026-07-20T09:00:00.000Z",
        createdAt: now,
        createdBy: ownerIds[(formatIndex + 1) % ownerIds.length],
        updatedAt: now,
        updatedBy: ownerIds[(formatIndex + 1) % ownerIds.length]
      };
    });
    formats.push({
      id,
      title,
      formatType,
      startsAt,
      endsAt,
      location,
      goal,
      ownerId: ownerIds[(formatIndex + 1) % ownerIds.length],
      status,
      notes: "Synthetisches Demo-Format, fachlicher Themenstand Juli 2026; keine reale gematik-Veranstaltung.",
      createdAt: now,
      createdBy: ownerIds[(formatIndex + 1) % ownerIds.length],
      updatedAt: now,
      updatedBy: ownerIds[(formatIndex + 1) % ownerIds.length],
      participants
    });
  });

  const hospitationSlots = Array.from({ length: 6 }, (_, index) => {
    const linkedContact = contacts[24 + index];
    const linkedOrganization = organizations.find((entry) => entry.id === linkedContact.organizationId);
    return {
      id: `demo-hospitation-slot-${String(index + 1).padStart(2, "0")}`,
      contactId: linkedContact.id,
      contactName: linkedContact.name,
      organizationId: linkedOrganization.id,
      organizationName: linkedOrganization.name,
      ownerId: ownerIds[index % ownerIds.length],
      status: ["Frei", "Frei", "Reserviert", "Gebucht", "Frei", "Abgesagt"][index],
      startsAt: new Date(Date.UTC(2026, 8 + index, 4 + index * 3, 8 + (index % 3), 0, 0)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 8 + index, 4 + index * 3, 10 + (index % 3), 0, 0)).toISOString(),
      capacity: 1 + (index % 3),
      location: index === 4 ? "Online" : linkedOrganization.city,
      city: linkedOrganization.city,
      state: linkedOrganization.state,
      sector: linkedOrganization.sector,
      notes: "Synthetisches Terminangebot für Status-, Kalender- und Buchungsdemo.",
      createdAt: now,
      updatedAt: now
    };
  });

  const stakeholderTypes = [
    ["kv", "Kassenärztliche Vereinigungen"],
    ["health-insurance", "Krankenkassen"],
    ["patient-associations", "Patientenorganisationen"],
    ["hospital-associations", "Krankenhausgesellschaften"],
    ["physician-associations", "Ärztliche Berufsverbände"]
  ].map(([id, label], index) => ({ id, key: id, value: id, label, description: "Synthetischer Stakeholdertyp für die öffentliche Demo.", sortOrder: (index + 1) * 10, status: "active" }));
  const stakeholderTypePlans = [
    ["kv", "Versorgungsregion", 6],
    ["health-insurance", "Gesundheitskasse", 5],
    ["patient-associations", "Patientennetz", 9],
    ["hospital-associations", "Klinikgesellschaft", 5],
    ["physician-associations", "Berufsverband", 5]
  ];
  const stakeholderOrganizations = stakeholderTypePlans.flatMap(([typeId, label, count], typeIndex) =>
    Array.from({ length: count }, (_, index) => {
      const location = organizations[(typeIndex * 6 + index) % organizations.length];
      return {
        id: `demo-stakeholder-org-${typeId}-${String(index + 1).padStart(2, "0")}`,
        stakeholderTypeId: typeId,
        stakeholderType: typeId,
        name: `Demo-${label} ${location.state} ${String(index + 1).padStart(2, "0")}`,
        normalizedName: `demo ${label} ${location.state} ${index + 1}`.toLowerCase(),
        organizationType: label,
        sector: typeId === "patient-associations" ? ["Onkologie", "Herz-Kreislauf", "Neurologie", "Psychische Gesundheit", "Stoffwechsel", "Seltene Erkrankungen", "Pädiatrie", "Teilhabe", "Pflege"][index] : "Sektorübergreifend",
        postalCode: location.postalCode,
        city: location.city,
        state: location.state,
        lat: location.lat,
        lon: location.lon,
        website: demoReservedUrl(`demo-stakeholder-${typeId}-${String(index + 1).padStart(2, "0")}`),
        email: `stakeholder-${typeId}-${String(index + 1).padStart(2, "0")}@example.invalid`,
        phone: `+49 000 ${String(310000 + typeIndex * 100 + index).padStart(6, "0")}`,
        memberCount: 300 + typeIndex * 240 + index * 75,
        memberCountLabel: `${300 + typeIndex * 240 + index * 75}`,
        memberCountSourceUrl: demoReservedUrl(`demo-stakeholder-source-${typeId}-${String(index + 1).padStart(2, "0")}`),
        memberCountSourceLabel: "Synthetische Demo-Größe",
        memberCountScope: "synthetische Demo-Größe",
        notes: "Fiktive Stakeholderorganisation; keine reale Institution oder Mitgliederzahl.",
        source: "Demo-Datensatz",
        status: "active",
        createdAt: now,
        updatedAt: now
      };
    })
  );
  const stakeholderPeople = Array.from({ length: 45 }, (_, index) => {
    const organization = stakeholderOrganizations[index % stakeholderOrganizations.length];
    return {
      id: `demo-stakeholder-person-${String(index + 1).padStart(2, "0")}`,
      stakeholderTypeId: organization.stakeholderTypeId,
      stakeholderType: organization.stakeholderTypeId,
      organizationId: organization.id,
      organization: organization.name,
      name: `Demo ${demoFirstNames[(index + 3) % demoFirstNames.length]} ${demoLastNames[(index * 5) % demoLastNames.length]} S${String(index + 1).padStart(2, "0")}`,
      role: ["Versorgungsreferent:in", "Patientenvertretung", "Digitalisierungskoordination", "Gremienarbeit"][index % 4],
      contactRole: ["Versorgungsreferent:in", "Patientenvertretung", "Digitalisierungskoordination", "Gremienarbeit"][index % 4],
      committee: index % 3 === 0 ? "Demo-Fachausschuss Versorgung" : "",
      city: organization.city,
      state: organization.state,
      lat: organization.lat,
      lon: organization.lon,
      email: `stakeholder-person-${String(index + 1).padStart(2, "0")}@example.invalid`,
      themes: ["ePA", "Versorgungsprozesse", index % 2 ? "Interoperabilität" : "Patientenperspektive"],
      note: "Fiktive Ansprechperson für Filter-, Karten- und Profildemo.",
      source: "Demo-Datensatz",
      status: "active",
      createdAt: now,
      updatedAt: now
    };
  });

  const expertGroupNames = [
    "Ambulante Primärsysteme",
    "Klinische Systeme und ISiK",
    "Apotheken und Arzneimittel",
    "Pflege und Rehabilitation",
    "Interoperabilität und FHIR",
    "TI-Betrieb und Identitäten"
  ];
  const expertGroups = expertGroupNames.map((name, index) => ({ id: `demo-expert-group-${String(index + 1).padStart(2, "0")}`, name: `Demo ${name}`, description: "Synthetische Expertengruppe.", sortOrder: (index + 1) * 10, status: "active" }));
  const expertOrganizations = Array.from({ length: 18 }, (_, index) => {
    const group = expertGroups[index % expertGroups.length];
    const location = organizations[(index * 5) % organizations.length];
    return {
      id: `demo-expert-org-${String(index + 1).padStart(2, "0")}`,
      name: `Demo-Fachnetz ${expertGroupNames[index % expertGroupNames.length]} ${String(index + 1).padStart(2, "0")}`,
      normalizedName: `demo fachnetz ${index + 1}`,
      groupId: group.id,
      group: group.name,
      groupName: group.name,
      organizationType: "Synthetische Fachorganisation",
      city: location.city,
      state: location.state,
      website: demoReservedUrl(`demo-expert-org-${String(index + 1).padStart(2, "0")}`),
      email: `expert-org-${String(index + 1).padStart(2, "0")}@example.invalid`,
      notes: "Fiktive Organisation für Expert:innen-, Dubletten- und Verknüpfungsdemo.",
      source: "Demo-Datensatz",
      status: "active",
      createdAt: now,
      updatedAt: now
    };
  });
  const expertContacts = Array.from({ length: 36 }, (_, index) => {
    const organization = expertOrganizations[Math.floor(index / 2)];
    const group = expertGroups.find((entry) => entry.id === organization.groupId) || expertGroups[0];
    return {
      id: `demo-expert-contact-${String(index + 1).padStart(2, "0")}`,
      name: `Demo ${index % 4 === 0 ? "Dr. " : ""}${demoFirstNames[(index + 7) % demoFirstNames.length]} ${demoLastNames[(index * 3) % demoLastNames.length]} E${String(index + 1).padStart(2, "0")}`,
      organizationId: organization.id,
      organization: organization.name,
      groupId: group.id,
      group: group.name,
      groupName: group.name,
      specialty: ["Interoperabilität", "Versorgungsinformatik", "Arzneimitteltherapiesicherheit", "Pflegewissenschaft", "FHIR", "Informationssicherheit"][index % 6],
      contactRole: ["Fachexpert:in", "Produktverantwortung", "Versorgungsberatung"][index % 3],
      role: ["Fachexpert:in", "Produktverantwortung", "Versorgungsberatung"][index % 3],
      city: organization.city,
      state: organization.state,
      email: `expert-contact-${String(index + 1).padStart(2, "0")}@example.invalid`,
      ownerId: ownerIds[index % ownerIds.length],
      ownerIds: [ownerIds[index % ownerIds.length]],
      themes: ["ePA", "TI", group.name.replace(/^Demo\s+/, "")],
      note: "Fiktiver Expertenkontakt; alle Angaben sind synthetisch.",
      source: "Demo-Datensatz",
      status: "active",
      createdAt: now,
      updatedAt: now
    };
  });
  const expertEntityLinks = Array.from({ length: 8 }, (_, index) => {
    const shared = {
      id: `demo-expert-link-${String(index + 1).padStart(2, "0")}`,
      matchReason: "Synthetische, manuell bestätigte Querverknüpfung für die Demo.",
      confidence: 1,
      createdAt: now,
      updatedAt: now
    };
    if (index % 2 === 0) {
      return {
        ...shared,
        linkType: "contact",
        expertContactId: expertContacts[index].id,
        contactId: contacts[index * 2].id
      };
    }
    return {
      ...shared,
      linkType: "organization",
      expertOrganizationId: expertContacts[index].organizationId,
      organizationId: contacts[index * 2].organizationId
    };
  });

  const hospitationObservations = hospitations.flatMap((hospitation) => {
    let documentation = {};
    try {
      documentation = JSON.parse(hospitation.documentationOutcome || "{}");
    } catch (_error) {
      documentation = {};
    }
    return (documentation.observations || []).map((observation, index) => {
      const originalEvidenceType = observation.evidenceType || "";
      const evidenceType = ["directly_observed", "reported", "interpreted"].includes(originalEvidenceType)
        ? originalEvidenceType
        : "interpreted";
      return {
        ...observation,
        id: observation.id || `demo-observation-${hospitation.id}-${index + 1}`,
        hospitationId: hospitation.id,
        situation: observation.situationContext || observation.situation || "",
        description: observation.observed || observation.description || "",
        evidenceType,
        originalEvidenceType,
        ownerId: observation.ownerId || hospitation.ownerId,
        payload: {
          ...observation,
          evidenceType,
          originalEvidenceType
        },
        status: observation.status || "active",
        createdAt: observation.createdAt || hospitation.createdAt,
        createdBy: observation.createdBy || hospitation.createdBy,
        updatedAt: observation.updatedAt || hospitation.updatedAt,
        updatedBy: observation.updatedBy || hospitation.updatedBy
      };
    });
  });

  const activityDefinitions = [
    ["contact.updated", "master_data", "update", "Kontaktdaten aktualisiert"],
    ["contact.owner.assigned", "ownership", "assign", "Verantwortung zugeordnet"],
    ["contact.note.created", "note_document", "create", "Gesprächsnotiz ergänzt"],
    ["hospitation.created", "hospitation", "create", "Hospitation angefragt"],
    ["hospitation.documented", "hospitation", "document", "Beobachtung dokumentiert"],
    ["format.participant.invited", "format", "invite", "Teilnahme angefragt"],
    ["format.participant.confirmed", "format", "confirm", "Teilnahme zugesagt"],
    ["contact.consent.granted", "consent", "grant", "Mitmachen-Einwilligung dokumentiert"]
  ];
  const activityEvents = Array.from({ length: 72 }, (_, index) => {
    const [eventKey, categoryKey, actionKey, title] = activityDefinitions[index % activityDefinitions.length];
    const profile = profiles[index % profiles.length];
    const hospitation = hospitations[index % hospitations.length];
    const format = formats[index % formats.length];
    const isHospitation = categoryKey === "hospitation";
    const isFormat = categoryKey === "format";
    const defaultContact = contacts[index % contacts.length];
    const relatedContactId = isHospitation
      ? hospitation.contactId
      : isFormat
        ? format.participants[index % format.participants.length]?.contactId
        : defaultContact.id;
    const contactEntry = contacts.find((entry) => entry.id === relatedContactId) || defaultContact;
    const objectId = isHospitation ? hospitation.id : isFormat ? format.id : contactEntry.id;
    const objectType = isHospitation ? "hospitation" : isFormat ? "format" : "contact";
    return {
      id: `demo-activity-${String(index + 1).padStart(3, "0")}`,
      eventKey,
      categoryKey,
      actionKey,
      title,
      objectType,
      objectId,
      contactId: contactEntry.id,
      actorId: profile.id,
      actor: {
        id: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        role: profile.role,
        team: profile.team
      },
      contact: {
        id: contactEntry.id,
        name: contactEntry.name,
        organization: contactEntry.organization,
        sector: contactEntry.category,
        city: contactEntry.city,
        state: contactEntry.state
      },
      occurredAt: new Date(Date.UTC(2026, 6, 19 - (index % 18), 8 + (index % 9), (index * 7) % 60)).toISOString(),
      originKey: index % 9 === 0 ? "data_import" : "manual",
      originRef: "synthetic-demo",
      references: [{ type: objectType, id: objectId, label: isHospitation ? hospitation.goal : isFormat ? format.title : contactEntry.name }],
      changes: [{ fieldName: categoryKey === "ownership" ? "owner_ids" : "status", oldValue: "Demo-Ausgangswert", newValue: "Demo-Aktualisierung" }],
      metadata: { entityLabel: isHospitation ? hospitation.organizationName : isFormat ? format.title : contactEntry.name, synthetic: true }
    };
  }).sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)));

  const changes = activityEvents.slice(0, 40).map((activity, index) => ({
    id: `demo-change-${String(index + 1).padStart(3, "0")}`,
    contactId: activity.contactId,
    contact_id: activity.contactId,
    action: activity.actionKey,
    eventKey: activity.eventKey,
    event_key: activity.eventKey,
    categoryKey: activity.categoryKey,
    fieldName: activity.changes[0].fieldName,
    field_name: activity.changes[0].fieldName,
    oldValue: activity.changes[0].oldValue,
    old_value: activity.changes[0].oldValue,
    newValue: activity.changes[0].newValue,
    new_value: activity.changes[0].newValue,
    changedAt: activity.occurredAt,
    changed_at: activity.occurredAt,
    changedBy: activity.actorId,
    changed_by: activity.actorId
  }));

  const notificationContexts = ["contacts", "organizations", "hospitations", "formats", "team"];
  const notifications = Array.from({ length: 12 }, (_, index) => {
    const contactEntry = contacts[index];
    const context = notificationContexts[index % notificationContexts.length];
    const organizationEntry = organizations[index % organizations.length];
    const hospitationEntry = hospitations[index % hospitations.length];
    const formatEntry = formats[index % formats.length];
    const definition = {
      contacts: {
        eventKey: "contact.follow_up.due",
        title: "Nächster Schritt ist fällig",
        entityType: "contact",
        entityId: contactEntry.id,
        entityLabel: contactEntry.name
      },
      organizations: {
        eventKey: "organization.updated",
        title: "Organisation wurde ergänzt",
        entityType: "organization",
        entityId: organizationEntry.id,
        entityLabel: organizationEntry.name
      },
      hospitations: {
        eventKey: "hospitation.upcoming",
        title: "Hospitation steht bevor",
        entityType: "hospitation",
        entityId: hospitationEntry.id,
        entityLabel: hospitationEntry.organizationName
      },
      formats: {
        eventKey: "format.participant.confirmed",
        title: "Teilnahme wurde zugesagt",
        entityType: "format",
        entityId: formatEntry.id,
        entityLabel: formatEntry.title
      },
      team: {
        eventKey: "contact.owner.assigned",
        title: "Verantwortung wurde zugeordnet",
        entityType: "contact",
        entityId: contactEntry.id,
        entityLabel: contactEntry.name
      }
    }[context];
    return {
      id: `demo-notification-${String(index + 1).padStart(2, "0")}`,
      eventId: `demo-notification-event-${String(index + 1).padStart(2, "0")}`,
      eventKey: definition.eventKey,
      context,
      title: definition.title,
      body: `Synthetischer Hinweis zu ${definition.entityLabel}; es sind keine echten Personen, Organisationen oder Termine betroffen.`,
      objectType: definition.entityType,
      objectId: definition.entityId,
      entityType: definition.entityType,
      entityId: definition.entityId,
      occurredAt: new Date(Date.UTC(2026, 6, 19 - index, 9, index * 3)).toISOString(),
      unread: index < 7,
      readAt: index < 7 ? "" : new Date(Date.UTC(2026, 6, 19 - index, 10, 0)).toISOString(),
      createdAt: now
    };
  });

  const registrationSectors = ["Praxis", "Apotheke", "Pflege", "Krankenhaus", "Therapie", "Reha", "Labor", "Rettungsdienst", "Hebammen", "ÖGD"];
  const registrations = Array.from({ length: 10 }, (_, index) => {
    const location = organizations[index];
    const statuses = ["neu", "in_pruefung", "uebernommen", "verknuepft", "abgelehnt"];
    return {
      id: `demo-registration-${String(index + 1).padStart(3, "0")}`,
      submissionId: `demo-submission-${String(index + 1).padStart(3, "0")}`,
      submission_id: `demo-submission-${String(index + 1).padStart(3, "0")}`,
      submittedAt: new Date(Date.UTC(2026, 6, 18 - index, 8 + (index % 4), 0)).toISOString(),
      submitted_at: new Date(Date.UTC(2026, 6, 18 - index, 8 + (index % 4), 0)).toISOString(),
      status: statuses[index % statuses.length],
      email: `registrierung-${String(index + 1).padStart(2, "0")}@example.invalid`,
      salutation: index % 2 ? "Herr" : "Frau",
      title: index % 4 === 0 ? "Dr." : "",
      firstName: `Demo ${demoFirstNames[index]}`,
      first_name: `Demo ${demoFirstNames[index]}`,
      lastName: `${demoLastNames[index % demoLastNames.length]} R${String(index + 1).padStart(2, "0")}`,
      last_name: `${demoLastNames[index % demoLastNames.length]} R${String(index + 1).padStart(2, "0")}`,
      organization: `Demo-Netzwerkinteresse ${String(index + 1).padStart(2, "0")}`,
      sector: registrationSectors[index],
      onboardingStage: "profile_complete",
      onboarding_stage: "profile_complete",
      postalCode: location.postalCode,
      postal_code: location.postalCode,
      city: location.city,
      federalState: location.state,
      federal_state: location.state,
      professionalGroup: ["Ärztin / Arzt", "Apotheker:in", "Pflegefachperson", "Therapeut:in"][index % 4],
      professional_group: ["Ärztin / Arzt", "Apotheker:in", "Pflegefachperson", "Therapeut:in"][index % 4],
      role: "Synthetische Ansprechperson",
      primarySystemType: location.primarySystems[0].systemType,
      primary_system_type: location.primarySystems[0].systemType,
      tiApplications: ["ePA", "E-Rezept", index % 2 ? "KIM" : "TI-Messenger"],
      ti_applications: ["ePA", "E-Rezept", index % 2 ? "KIM" : "TI-Messenger"],
      participationFormats: ["Hospitationen", "Fachgespräche"],
      participation_formats: ["Hospitationen", "Fachgespräche"],
      interestTopics: ["Versorgungsprozesse", index % 2 ? "Interoperabilität" : "Medikationssicherheit"],
      interest_topics: ["Versorgungsprozesse", index % 2 ? "Interoperabilität" : "Medikationssicherheit"],
      preferredContact: "E-Mail",
      preferred_contact: "E-Mail",
      message: "Rein synthetischer Registrierungseingang für die öffentliche Funktionsdemo.",
      privacyCheckStatus: "synthetic_demo",
      privacy_check_status: "synthetic_demo",
      emailConfirmationStatus: "confirmed",
      email_confirmation_status: "confirmed",
      sourceUrl: "https://registrierung.example.invalid/demo",
      source_url: "https://registrierung.example.invalid/demo"
    };
  });

  const contactNotes = Array.from({ length: 16 }, (_, index) => {
    const contactEntry = contacts[index];
    return {
      id: `demo-note-${String(index + 1).padStart(2, "0")}`,
      contactId: contactEntry.id,
      contact_id: contactEntry.id,
      body: [
        "Im synthetischen Gespräch wurde ein Medienbruch beim Medikationsabgleich nachvollzogen.",
        "Für den Demo-Termin sollen ePA, KIM und TI-Messenger anhand klar getrennter Anwendungsfälle besprochen werden.",
        "Die fiktive Organisation hat Interesse an einer Hospitation zum Entlassmanagement signalisiert.",
        "Synthetischer Folgeschritt: Rollen und nächsten Übergabepunkt im Versorgungspfad konkretisieren."
      ][index % 4],
      text: "",
      noteType: index % 3 === 0 ? "meeting" : "free_note",
      title: index % 3 === 0 ? "Synthetisches Versorgungsgespräch" : "Demo-Notiz",
      occurredAt: new Date(Date.UTC(2026, 5, 3 + index, 10, 0)).toISOString(),
      createdAt: now,
      created_at: now,
      createdBy: ownerIds[index % ownerIds.length],
      created_by: ownerIds[index % ownerIds.length],
      updatedAt: now,
      updated_at: now
    };
  });
  const contactNoteAttachments = contactNotes.slice(0, 4).map((note, index) => ({
    id: `demo-attachment-${String(index + 1).padStart(2, "0")}`,
    contactId: note.contactId,
    contact_id: note.contactId,
    noteId: note.id,
    note_id: note.id,
    fileName: `synthetisches-gespraech-${String(index + 1).padStart(2, "0")}.txt`,
    file_name: `synthetisches-gespraech-${String(index + 1).padStart(2, "0")}.txt`,
    mimeType: "text/plain",
    mime_type: "text/plain",
    fileSize: 156 + index * 17,
    file_size: 156 + index * 17,
    description: "Synthetischer Textanhang ohne reale Kontakt- oder Versorgungsdaten.",
    extractedText: "Realitätsnahes synthetisches Szenario – keine reale Person, Organisation oder Feldbeobachtung.",
    extracted_text: "Realitätsnahes synthetisches Szenario – keine reale Person, Organisation oder Feldbeobachtung.",
    extractionStatus: "complete",
    extraction_status: "complete",
    uploadedAt: now,
    uploaded_at: now,
    uploaderId: ownerIds[index % ownerIds.length],
    uploader_id: ownerIds[index % ownerIds.length]
  }));

  const savedViews = [
    ["demo-view-high-priority", "Priorisierte Versorgungskontakte", "contacts", { priorities: ["Hoch"] }],
    ["demo-view-organizations-north", "Versorgungsorganisationen Nord und Ost", "organizations", { states: ["Berlin", "Brandenburg", "Sachsen"] }],
    ["demo-view-formats-active", "Aktive Dialogformate", "formats", { statuses: ["Aktiv", "Planung"] }],
    ["demo-view-unassigned", "Kontakte ohne Owner", "contacts", { ownerIds: ["unassigned"] }]
  ].map(([id, name, viewType, filters], index) => ({
    id,
    ownerId: ownerIds[index % ownerIds.length],
    name,
    description: "Kuratiere synthetische Ansicht für die öffentliche Demo.",
    scope: index === 0 ? "team" : "private",
    viewType,
    filters,
    searchQuery: "",
    sortKey: "updated_at",
    sortDirection: "desc",
    pageSize: 20,
    isDefault: index === 0,
    createdAt: now,
    updatedAt: now
  }));

  window.VERSORGUNGS_COMPASS_DEMO_DATA = {
    profiles,
    organizations,
    contacts,
    formats,
    hospitationSlots,
    hospitations,
    hospitationObservations,
    roadmapItems,
    hospitationRoadmapAssessments,
    hospitationUnmetNeeds,
    expertGroups,
    expertOrganizations,
    expertContacts,
    expertEntityLinks,
    stakeholderTypes,
    stakeholderOrganizations,
    stakeholderPeople,
    activityEvents,
    changes,
    notifications,
    registrations,
    contactNotes,
    contactNoteAttachments,
    savedViews,
    userSettings: {
      userId: ownerIds[0],
      defaultViewId: "demo-view-high-priority",
      defaultViewType: "contacts",
      tableDensity: "comfortable",
      theme: "system",
      fontScale: 1,
      pageSize: 20,
      preferences: {
        onboarding: {
          version: 1,
          profileCompletedAt: now,
          tourSkippedAt: now
        },
        demo: {
          dataPolicyAcknowledged: true,
          resetOnReload: true
        }
      },
      createdAt: now,
      updatedAt: now
    }
  };
})();
