(function () {
  const now = "2026-07-25T12:00:00.000Z";
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
      display_name: "Mara Stein",
      initials: "MS",
      role: "admin",
      active: true,
      avatar_url: demoProfileImageAdmin,
      team: "Programmsteuerung",
      bio: "Fiktives Profil für Administration und Qualitätssicherung.",
      created_at: now,
      updated_at: now
    },
    {
      id: "demo-profile-editor",
      email: "redaktion@versorgungs-kompass.example.invalid",
      display_name: "Tobias Nguyen",
      initials: "TN",
      role: "editor",
      active: true,
      avatar_url: demoProfileImageEditor,
      team: "Versorgungsredaktion",
      bio: "Fiktives Profil für redaktionelle Datenpflege und Qualitätssicherung.",
      created_at: now,
      updated_at: now
    },
    {
      id: "demo-profile-viewer",
      email: "lesekonto@versorgungs-kompass.example.invalid",
      display_name: "Nora Demir",
      initials: "ND",
      role: "viewer",
      active: true,
      avatar_url: demoProfileImageViewer,
      team: "Analyse und Einblicke",
      bio: "Fiktives Profil für Auswertung und fachliche Sichtung.",
      created_at: now,
      updated_at: now
    },
    {
      id: "demo-profile-hospitation",
      email: "hospitation@versorgungs-kompass.example.invalid",
      display_name: "Leonie Berger",
      initials: "LB",
      role: "editor",
      active: true,
      avatar_url: demoProfileImageEditor,
      team: "Versorgung erleben",
      bio: "Fiktives Owner-Profil für Hospitationen und Beobachtungen.",
      created_at: now,
      updated_at: now
    },
    {
      id: "demo-profile-formate",
      email: "formate@versorgungs-kompass.example.invalid",
      display_name: "Murat Seidel",
      initials: "MU",
      role: "editor",
      active: true,
      avatar_url: demoProfileImageViewer,
      team: "Dialog und Beteiligung",
      bio: "Fiktives Owner-Profil für Dialogformate und Netzwerkpflege.",
      created_at: now,
      updated_at: now
    }
  ];

  const organizations = [
    ["demo-org-nordstadt", "MVZ Spreewinkel", "Praxis", "MVZ", "10115", "Berlin", "Berlin", 52.532, 13.384],
    ["demo-org-havelpflege", "Pflegeverbund Havelblick", "Pflege", "Vollstationäre Pflegeeinrichtung", "14467", "Potsdam", "Brandenburg", 52.4009, 13.0591],
    ["demo-org-elbufer", "Klinikum Elbufer", "Krankenhaus", "Akutkrankenhaus", "01067", "Dresden", "Sachsen", 51.0504, 13.7373],
    ["demo-org-rheinapotheke", "Apotheke Rheinmitte", "Apotheke", "Vor-Ort-Apotheke", "50667", "Köln", "Nordrhein-Westfalen", 50.9375, 6.9603],
    ["demo-org-mainnetz", "Praxisnetz Mainbogen", "Praxis", "Praxisnetz", "60311", "Frankfurt am Main", "Hessen", 50.1109, 8.6821],
    ["demo-org-isar", "Therapiezentrum Isarpark", "Therapie", "Heilmittelpraxis", "80331", "München", "Bayern", 48.1374, 11.5755],
    ["demo-org-alster", "Gesundheitskasse Alsterland", "Krankenkasse", "Regionalstelle", "20095", "Hamburg", "Hamburg", 53.5503, 10.0007],
    ["demo-org-neckar", "Reha-Zentrum Neckarbogen", "Reha", "Rehabilitationsklinik", "70173", "Stuttgart", "Baden-Württemberg", 48.7758, 9.1829],
    ["demo-org-weser", "Sozialdienst Weserquartier", "Sozialdienst", "Beratungsstelle", "28195", "Bremen", "Bremen", 53.0793, 8.8017],
    ["demo-org-foerde", "Hausarztzentrum Fördeblick", "Praxis", "Hausarztzentrum", "24103", "Kiel", "Schleswig-Holstein", 54.3233, 10.1228],
    ["demo-org-saar", "Apothekenkooperation Saarbogen", "Apotheke", "Kooperation", "66111", "Saarbrücken", "Saarland", 49.2402, 6.9969],
    ["demo-org-leine", "Kinderklinik Leinepark", "Krankenhaus", "Fachklinik", "30159", "Hannover", "Niedersachsen", 52.3759, 9.732],
    ["demo-org-erfurt", "Facharztzentrum Domhöfe", "Praxis", "Facharztzentrum", "99084", "Erfurt", "Thüringen", 50.9787, 11.0328],
    ["demo-org-rostock", "Ambulanzverbund Warnowufer", "Praxis", "Ambulanzverbund", "18055", "Rostock", "Mecklenburg-Vorpommern", 54.0924, 12.0991],
    ["demo-org-mosellabor", "Laborverbund Moselbogen", "Labor", "Medizinisches Labor", "56068", "Koblenz", "Rheinland-Pfalz", 50.3569, 7.5889],
    ["demo-org-elberettung", "Rettungsdienst Elbauen", "Rettungsdienst", "Rettungsdienst", "39104", "Magdeburg", "Sachsen-Anhalt", 52.1205, 11.6276],
    ["demo-org-donauhebammen", "Hebammennetz Donaublick", "Hebammen", "Hebammennetzwerk", "89073", "Ulm", "Baden-Württemberg", 48.4011, 9.9876],
    ["demo-org-saaleoegd", "Gesundheitsamt Saalebogen", "ÖGD", "Gesundheitsamt", "07743", "Jena", "Thüringen", 50.9271, 11.5892],
    ["demo-org-ruhrhilfen", "Hilfsmittelzentrum Ruhrtal", "Hilfsmittel", "Hilfsmittelversorgung", "45127", "Essen", "Nordrhein-Westfalen", 51.4556, 7.0116],
    ["demo-org-innpflege", "Pflegedienst Mangfallbogen", "Pflege", "Ambulanter Pflegedienst", "83022", "Rosenheim", "Bayern", 47.8564, 12.1288],
    ["demo-org-lippepsyche", "Psychotherapiezentrum Lippegarten", "Therapie", "Psychotherapiepraxis", "32756", "Detmold", "Nordrhein-Westfalen", 51.9363, 8.8792],
    ["demo-org-oderklinik", "Klinikverbund Oderland", "Krankenhaus", "Grund- und Regelversorgung", "15230", "Frankfurt (Oder)", "Brandenburg", 52.3471, 14.5506],
    ["demo-org-kuestenkasse", "Gesundheitskasse Küstenland", "Krankenkasse", "Kostenträger", "19053", "Schwerin", "Mecklenburg-Vorpommern", 53.6294, 11.4148],
    ["demo-org-weinstadtpraxis", "Hausarztverbund Weinstraße", "Praxis", "Praxisverbund", "67433", "Neustadt an der Weinstraße", "Rheinland-Pfalz", 49.3502, 8.1487],
    ["demo-org-heidepraxis", "Praxisgemeinschaft Heidtor", "Praxis", "Gemeinschaftspraxis", "21335", "Lüneburg", "Niedersachsen", 53.2464, 10.4115],
    ["demo-org-spreeapotheke", "Apothekennetz Spreebogen", "Apotheke", "Apothekennetz", "10117", "Berlin", "Berlin", 52.517, 13.3889],
    ["demo-org-taunusreha", "Reha-Netz Taunushöhe", "Reha", "Ambulante Rehabilitation", "65183", "Wiesbaden", "Hessen", 50.0826, 8.2493],
    ["demo-org-hanselabor", "Labornetz Hanseblick", "Labor", "Labornetzwerk", "28195", "Bremen", "Bremen", 53.0758, 8.8072],
    ["demo-org-rheinrettung", "Rettungsverbund Rheinufer", "Rettungsdienst", "Rettungsdienst", "40213", "Düsseldorf", "Nordrhein-Westfalen", 51.2254, 6.7763],
    ["demo-org-albhebammen", "Hebammenverbund Albkante", "Hebammen", "Hebammenverbund", "72764", "Reutlingen", "Baden-Württemberg", 48.4914, 9.2043],
    ["demo-org-mitteoegd", "Gesundheitsdienst Kasseler Mitte", "ÖGD", "Gesundheitsdienst", "34117", "Kassel", "Hessen", 51.3155, 9.4924],
    ["demo-org-elbesozial", "Sozialberatung Elbtor", "Sozialdienst", "Beratungsnetz", "22767", "Hamburg", "Hamburg", 53.5461, 9.9661],
    ["demo-org-albklinik", "Regionalhospital Steinlachtal", "Krankenhaus", "Sektorenübergreifende Versorgungseinrichtung", "72070", "Tübingen", "Baden-Württemberg", 48.5216, 9.0576],
    ["demo-org-spreepflege", "Ambulanter Pflegedienst Spreehafen", "Pflege", "Ambulanter Pflegedienst", "12435", "Berlin", "Berlin", 52.4912, 13.4504],
    ["demo-org-weserapotheke", "Apotheke Weserarkaden", "Apotheke", "Vor-Ort-Apotheke", "28199", "Bremen", "Bremen", 53.0644, 8.7906],
    ["demo-org-isarlabor", "Diagnostiklabor Isarbogen", "Labor", "Fachlabor", "81667", "München", "Bayern", 48.1321, 11.6005],
    ["demo-org-ruhrtherapie", "Therapiehaus Ruhrhöhe", "Therapie", "Interdisziplinäre Heilmittelpraxis", "44137", "Dortmund", "Nordrhein-Westfalen", 51.5121, 7.4513],
    ["demo-org-mainreha", "Rehaklinik Fuldaauen", "Reha", "Stationäre Rehabilitation", "36037", "Fulda", "Hessen", 50.5558, 9.6808],
    ["demo-org-ostseehebammen", "Hebammenzentrum Ostseetor", "Hebammen", "Hebammenzentrum", "23552", "Lübeck", "Schleswig-Holstein", 53.8663, 10.6847],
    ["demo-org-saarrettung", "Rettungswache Saarterrassen", "Rettungsdienst", "Rettungswache", "66119", "Saarbrücken", "Saarland", 49.2294, 7.0037],
    ["demo-org-pfalz-hilfen", "Sanitätshaus Pfalzbogen", "Hilfsmittel", "Sanitätshaus", "67655", "Kaiserslautern", "Rheinland-Pfalz", 49.4431, 7.7689],
    ["demo-org-werraoegd", "Gesundheitsamt Werrator", "ÖGD", "Gesundheitsamt", "99817", "Eisenach", "Thüringen", 50.9748, 10.3192],
    ["demo-org-pleisse-zahn", "Zahnärztliches Zentrum Pleißebogen", "Praxis", "Zahn-MVZ", "04109", "Leipzig", "Sachsen", 51.3402, 12.3748],
    ["demo-org-havel-psych", "Psychotherapeutische Praxis Havelgärten", "Praxis", "Psychotherapiepraxis", "14471", "Potsdam", "Brandenburg", 52.3947, 13.0324],
    ["demo-org-elbe-sapv", "SAPV-Team Elbbrücken", "Praxis", "Palliativ-Care-Team", "20539", "Hamburg", "Hamburg", 53.5289, 10.0352],
    ["demo-org-allgaeu-pflege", "Kurzzeitpflege Allgäublick", "Pflege", "Kurzzeitpflege", "87435", "Kempten", "Bayern", 47.7267, 10.3139],
    ["demo-org-lahnapotheke", "Apotheke Lahnterrassen", "Apotheke", "Vor-Ort-Apotheke", "35037", "Marburg", "Hessen", 50.8075, 8.7708],
    ["demo-org-ruhrklinik", "Sektorenklinik Ruhrbogen", "Krankenhaus", "Sektorenübergreifende Versorgungseinrichtung", "45138", "Essen", "Nordrhein-Westfalen", 51.4454, 7.0321],
    ["demo-org-harzpraxis", "Dialysezentrum Harzvorland", "Praxis", "Facharztzentrum", "38820", "Halberstadt", "Sachsen-Anhalt", 51.8958, 11.0525],
    ["demo-org-kiellogopaedie", "Logopädie am Fördeufer", "Therapie", "Logopädiepraxis", "24114", "Kiel", "Schleswig-Holstein", 54.3152, 10.1164],
    ["demo-org-neckarergotherapie", "Ergotherapie Neckarwinkel", "Therapie", "Ergotherapiepraxis", "74072", "Heilbronn", "Baden-Württemberg", 49.1423, 9.2187],
    ["demo-org-huntepraxis", "Hausarztpraxis Huntebogen", "Praxis", "Hausarztpraxis", "26122", "Oldenburg", "Niedersachsen", 53.1435, 8.2146],
    ["demo-org-nordseepflege", "Tagespflege Nordseegarten", "Pflege", "Tagespflege", "27568", "Bremerhaven", "Bremen", 53.5484, 8.5836],
    ["demo-org-saar-asv", "ASV-Team Saarhöhe Rheumatologie", "Praxis", "ASV Rheumatologie Erwachsene", "66113", "Saarbrücken", "Saarland", 49.2464, 6.9718],
    ["demo-org-radiologie-elbufer", "Radiologiezentrum Elbufer", "Praxis", "Radiologie-MVZ", "01069", "Dresden", "Sachsen", 51.0416, 13.7304]
  ].map(([id, name, sector, organizationType, postalCode, city, state, lat, lon], organizationIndex) => {
    const createdAt = new Date(Date.UTC(2025, 9 + (organizationIndex % 3), 3 + (organizationIndex % 23), 8, 30)).toISOString();
    const updatedAt = new Date(Date.UTC(2026, 4 + (organizationIndex % 3), 2 + (organizationIndex % 22), 9, 15)).toISOString();
    return {
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
      phone: `+49 171 39200 ${String(organizationIndex).padStart(2, "0")}`,
      email: `${id}@example.invalid`,
      notes: "Fiktive Versorgungsorganisation für synthetische Szenarien und Qualitätssicherung.",
      source: "Synthetischer Versorgungsdatensatz",
      status: "active",
      createdAt,
      updatedAt
    };
  });

  organizations.forEach((organization, organizationIndex) => {
    const systemTypes = {
      Krankenhaus: "KIS",
      Apotheke: "AVS",
      Pflege: "PFLEGE",
      Labor: "LIS",
      Reha: "KIS",
      Rettungsdienst: "SONSTIGES",
      Hebammen: "HVS",
      "ÖGD": "SONSTIGES",
      Hilfsmittel: "SONSTIGES",
      Krankenkasse: "SONSTIGES",
      Sozialdienst: "SONSTIGES"
    };
    let systemType = systemTypes[organization.sector] || "PVS";
    if (organization.organizationType === "Zahn-MVZ") systemType = "ZPVS";
    if (organization.organizationType === "Ambulante Rehabilitation") systemType = "SONSTIGES";
    if (organization.id === "demo-org-radiologie-elbufer") systemType = "SONSTIGES";
    if (organization.id === "demo-org-saar-asv") systemType = "SONSTIGES";
    const systemCatalog = {
      PVS: [["MediWerk", "PraxisFlow"], ["Ambulant Digital", "PraxisDesk"], ["VersaMed Systeme", "SprechstundenPilot"]],
      KIS: [["Klinikwerk Systeme", "CareStation"], ["MedicaNova IT", "WardFlow"], ["Auenblick Digital", "KlinikDesk"]],
      AVS: [["PharmaKontor", "RezeptPlus"], ["Offizin Systeme", "ApothekenDesk"], ["Warenfluss Digital", "RezeptPilot"]],
      ZPVS: [["Dentalwerk Systeme", "ZahnPraxis"], ["Praxiszahn Digital", "DentalDesk"], ["Odonto IT", "ZahnPilot"]],
      HVS: [["Hebammenwerk", "WochenbettPlan"], ["Familienpfad Digital", "HebammenDesk"], ["Perinatal Systeme", "BetreuungsPilot"]],
      PFLEGE: [["PflegeRaster", "TourenPlan"], ["CareMobil Systeme", "PflegeDesk"], ["Versorgungslogik", "TourenPilot"]],
      LIS: [["Labornetz Systeme", "LabFlow"], ["Diagnostik Digital", "BefundDesk"], ["Probenwerk IT", "LaborPilot"]],
      SONSTIGES: [["VersorgungsIT", "FachPortal"], ["Sektoren Digital", "FallDesk"], ["Prozesswerk", "VersorgungsPilot"]]
    };
    const catalog = systemCatalog[systemType] || systemCatalog.SONSTIGES;
    const specialSystem = {
      "demo-org-radiologie-elbufer": ["Bilddiagnostik Digital", "RadiologieDesk RIS/PACS"],
      "demo-org-saar-asv": ["Versorgungsnetz Systeme", "ASV-Koordinationsplattform"],
      "demo-org-elbe-sapv": ["Palliativnetz Digital", "SAPV-Dokumentation"],
      "demo-org-taunusreha": ["RehaNetz Systeme", "NachsorgePortal"]
    }[organization.id];
    const [vendorName, productName] = specialSystem || catalog[organizationIndex % catalog.length];
    organization.primarySystems = [{
      id: `demo-primary-system-${organization.id}`,
      organizationId: organization.id,
      systemType,
      vendorName,
      productName,
      sourceUrl: `${organization.website}/primaersystem`,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt
    }];
  });

  const ownerIds = profiles.map((profile) => profile.id);
  const priorities = ["Mittel", "Mittel", "Hoch", "Mittel", "Niedrig"];
  const sectorContactTemplates = {
    Praxis: [
      { role: "Ärztliche Leitung", specialty: "Allgemeinmedizin", topics: ["Hausarztversorgung", "Terminsteuerung"] },
      { role: "Praxismanagement", specialty: "", topics: ["ePA", "Dokumentenmanagement"] },
      { role: "MFA-Teamleitung", specialty: "", topics: ["DMP", "Versorgungskoordination"] },
      { role: "Versorgungskoordination", specialty: "", topics: ["Überweisung", "Befundtransfer"] },
      { role: "Fachärztliche Ansprechperson", specialty: "Innere Medizin", topics: ["Medikationsplan", "KIM"] }
    ],
    Krankenhaus: [
      { role: "Ärztliche Leitung", specialty: "Innere Medizin", topics: ["Entlassmanagement", "Anschlussversorgung"] },
      { role: "Pflegeüberleitung", specialty: "", topics: ["Arztbrief", "KIM"] },
      { role: "Entlasskoordination", specialty: "", topics: ["Medikationsabgleich", "Patienteninformation"] },
      { role: "Stationsleitung", specialty: "", topics: ["Aufnahme", "Notfallübergabe"] },
      { role: "Anwendungsbetreuung KIS", specialty: "", topics: ["ISiK", "Befundtransfer"] }
    ],
    Apotheke: [
      { role: "Apothekenleitung", specialty: "", topics: ["E-Rezept", "Verfügbarkeit"] },
      { role: "AMTS-Verantwortung", specialty: "", topics: ["Medikationsberatung", "Wechselwirkungen"] },
      { role: "Filialleitung", specialty: "", topics: ["Botendienst", "Vorbestellung"] },
      { role: "Pharmazeutisch-technische Assistenz", specialty: "", topics: ["Pflegeversorgung", "KIM"] }
    ],
    Pflege: [
      { role: "Pflegedienstleitung", specialty: "", topics: ["Häusliche Krankenpflege", "Verordnung"] },
      { role: "Pflegefachperson", specialty: "", topics: ["Medikationsmanagement", "Apothekenkommunikation"] },
      { role: "Tourenkoordination", specialty: "", topics: ["Tourenplanung", "Leistungsnachweis"] },
      { role: "Qualitätsmanagement", specialty: "", topics: ["Überleitung", "Pflegebericht"] },
      { role: "Wundexpert:in", specialty: "", topics: ["Wundversorgung", "Angehörigenkommunikation"] }
    ],
    Krankenkasse: [
      { role: "Leitung Versorgungsmanagement", specialty: "", topics: ["Genehmigung", "Hilfsmittel"] },
      { role: "Fallmanagement", specialty: "", topics: ["Entlassmanagement", "Anschlussversorgung"] },
      { role: "Pflegeberatung", specialty: "", topics: ["Pflegeberatung", "Versorgungsplan"] },
      { role: "Vertragsreferent:in", specialty: "", topics: ["Selektivverträge", "Datenqualität"] }
    ],
    Labor: [
      { role: "Ärztliche Laborleitung", specialty: "Laboratoriumsmedizin", topics: ["Laborauftrag", "Befundübermittlung"] },
      { role: "Einsendermanagement", specialty: "", topics: ["Kritischer Befund", "Rückruf"] },
      { role: "LIS-Koordination", specialty: "", topics: ["LIS", "KIM"] },
      { role: "Qualitätsmanagement", specialty: "", topics: ["DEMIS", "Meldewesen"] }
    ],
    Therapie: [
      { role: "Therapeutische Leitung", specialty: "", topics: ["Heilmittelverordnung", "Therapieziel"] },
      { role: "Rezeptmanagement", specialty: "", topics: ["Blankoverordnung", "Behandlungsplanung"] },
      { role: "Fachtherapeut:in", specialty: "", topics: ["Therapiebericht", "Rückmeldung"] },
      { role: "Praxisorganisation", specialty: "", topics: ["Terminserie", "Ausfallmanagement"] }
    ],
    Hebammen: [
      { role: "Leitende Hebamme", specialty: "", topics: ["Wochenbett", "Entlassinformation"] },
      { role: "Netzwerkkoordination", specialty: "", topics: ["Hebammenvermittlung", "Kapazitätsplanung"] },
      { role: "Freiberufliche Hebamme", specialty: "", topics: ["Mutterpass", "Befundübergabe"] },
      { role: "Koordination Frühe Hilfen", specialty: "", topics: ["Frühe Hilfen", "Beratung"] }
    ],
    Rettungsdienst: [
      { role: "Ärztliche Leitung Rettungsdienst", specialty: "Anästhesiologie", topics: ["Notfallübergabe", "Medikationsinformation"] },
      { role: "Leitstellenkoordination", specialty: "", topics: ["Leitstelle", "Disposition"] },
      { role: "Notfallsanitäter:in", specialty: "", topics: ["Einsatzdokumentation", "Klinikübergabe"] },
      { role: "Qualitätsmanagement", specialty: "", topics: ["Telemedizin", "Rückmeldung"] }
    ],
    Reha: [
      { role: "Ärztliche Leitung", specialty: "Neurologie", topics: ["Reha-Antrag", "Befundanforderung"] },
      { role: "Reha-Koordination", specialty: "", topics: ["Entlassbericht", "Nachsorge"] },
      { role: "Therapieleitung", specialty: "", topics: ["Therapieplanung", "Teilhabeziel"] },
      { role: "Sozialdienst", specialty: "", topics: ["Anschlussrehabilitation", "Kostenträger"] }
    ],
    Hilfsmittel: [
      { role: "Versorgungskoordination", specialty: "", topics: ["Hilfsmittelverordnung", "Genehmigung"] },
      { role: "Orthopädietechnik-Meister:in", specialty: "", topics: ["Einweisung", "Anpassung"] },
      { role: "Homecare-Fachkraft", specialty: "", topics: ["Lieferstatus", "Entlassmanagement"] },
      { role: "Rezeptmanagement", specialty: "", topics: ["Kostenvoranschlag", "Rückfrage"] }
    ],
    Sozialdienst: [
      { role: "Beratungsstellenleitung", specialty: "", topics: ["Anschlussversorgung", "Leistungsantrag"] },
      { role: "Sozialberatung", specialty: "", topics: ["Pflegegrad", "Beratung"] },
      { role: "Case Management", specialty: "", topics: ["Teilhabe", "Rehabilitation"] },
      { role: "Überleitungskoordination", specialty: "", topics: ["Wohnraumberatung", "Hilfsmittel"] }
    ],
    "ÖGD": [
      { role: "Amtsärztliche Leitung", specialty: "Öffentliches Gesundheitswesen", topics: ["DEMIS", "Fallermittlung"] },
      { role: "Sachgebietsleitung Infektionsschutz", specialty: "", topics: ["Infektionsschutz", "Kontaktmanagement"] },
      { role: "DEMIS-Koordination", specialty: "", topics: ["Meldewesen", "Datenqualität"] },
      { role: "Hygienekontrolle", specialty: "", topics: ["Beratung", "Krisenkoordination"] }
    ]
  };
  const ambulantCareTemplates = [
    { role: "Pflegedienstleitung", specialty: "", topics: ["Häusliche Krankenpflege", "Versorgungsplanung"] },
    { role: "Pflegefachperson ambulant", specialty: "", topics: ["Medikationsmanagement", "Hausbesuch"] },
    { role: "Tourenkoordination", specialty: "", topics: ["Tourenplanung", "Leistungsnachweis"] },
    { role: "Wundexpert:in", specialty: "", topics: ["Wundversorgung", "Rückmeldung an die Praxis"] },
    { role: "Abrechnung und Qualitätsmanagement", specialty: "", topics: ["Verordnung", "Datenqualität"] }
  ];
  const psychotherapyTemplates = [
    { role: "Psychotherapeutische Leitung", specialty: "Psychologische Psychotherapie", topics: ["Psychotherapie", "Versorgungssteuerung"] },
    { role: "Psychologische Psychotherapeut:in", specialty: "Psychologische Psychotherapie", topics: ["Behandlungsplanung", "Krisenversorgung"] },
    { role: "Krisenkoordination", specialty: "", topics: ["Krisenpfad", "Schnittstellen"] },
    { role: "Praxisorganisation", specialty: "", topics: ["Terminsteuerung", "Antragsverfahren"] }
  ];
  const organizationContactTemplates = {
    "demo-org-havelpflege": [
      { role: "Einrichtungsleitung", specialty: "", topics: ["Vollstationäre Langzeitpflege", "Versorgungsplanung"] },
      { role: "Pflegedienstleitung", specialty: "", topics: ["Medikationsmanagement", "Pflegequalität"] },
      { role: "Wohnbereichsleitung", specialty: "", topics: ["Interne Übergabe", "Angehörigenkommunikation"] },
      { role: "Pflegefachperson", specialty: "", topics: ["Geriatrie", "Pflegedokumentation"] }
    ],
    "demo-org-innpflege": ambulantCareTemplates,
    "demo-org-spreepflege": ambulantCareTemplates,
    "demo-org-allgaeu-pflege": [
      { role: "Bereichsleitung Kurzzeitpflege", specialty: "", topics: ["Kurzzeitpflege", "Belegungssteuerung"] },
      { role: "Aufnahme- und Überleitungskoordination", specialty: "", topics: ["Medikationsabgleich", "Anschlussversorgung"] },
      { role: "Pflegefachperson", specialty: "", topics: ["Übergangspflege", "Geriatrie"] },
      { role: "Sozialdienst", specialty: "", topics: ["Entlassplanung", "Leistungsantrag"] }
    ],
    "demo-org-nordseepflege": [
      { role: "Tagespflegeleitung", specialty: "", topics: ["Teilstationäre Pflege", "Belegungsplanung"] },
      { role: "Pflegefachperson Tagespflege", specialty: "", topics: ["Behandlungspflege", "Medikationsmanagement"] },
      { role: "Alltagsbegleitung", specialty: "", topics: ["Aktivierung", "Sturzprävention"] },
      { role: "Fahrdienstkoordination", specialty: "", topics: ["Beförderung", "Angehörigenkommunikation"] }
    ],
    "demo-org-lippepsyche": psychotherapyTemplates,
    "demo-org-havel-psych": psychotherapyTemplates,
    "demo-org-pleisse-zahn": [
      { role: "Zahnärztliche Leitung", specialty: "Zahnmedizin", topics: ["Zahnmedizin", "Praxissteuerung"] },
      { role: "ZFA-Teamleitung", specialty: "", topics: ["Behandlungsassistenz", "Terminsteuerung"] },
      { role: "Prophylaxefachkraft", specialty: "", topics: ["Prävention", "Patienteninformation"] },
      { role: "Zahnmedizinische Verwaltungsassistenz", specialty: "", topics: ["Abrechnung", "Heil- und Kostenplan"] }
    ],
    "demo-org-elbe-sapv": [
      { role: "Palliativärztliche Leitung", specialty: "Palliativmedizin", topics: ["SAPV", "Krisenplan"] },
      { role: "Palliative-Care-Pflegefachperson", specialty: "", topics: ["Symptomkontrolle", "Bedarfsmedikation"] },
      { role: "SAPV-Koordination", specialty: "", topics: ["24/7-Erreichbarkeit", "Sektorübergang"] },
      { role: "Psychosozialer Dienst", specialty: "", topics: ["Angehörigenbegleitung", "Vorsorgeplanung"] }
    ],
    "demo-org-harzpraxis": [
      { role: "Nephrologische Leitung", specialty: "Nephrologie", topics: ["Dialyse", "Nierenersatztherapie"] },
      { role: "Dialysefachpflege", specialty: "", topics: ["Dialyseablauf", "Gefäßzugang"] },
      { role: "MFA Dialysekoordination", specialty: "", topics: ["Terminsteuerung", "Laborwerte"] },
      { role: "Praxismanagement", specialty: "", topics: ["Abrechnung", "Versorgungsplanung"] }
    ],
    "demo-org-radiologie-elbufer": [
      { role: "Radiologische Leitung", specialty: "Radiologie", topics: ["Bildgebung", "Befundfreigabe"] },
      { role: "MTR-Teamleitung", specialty: "", topics: ["Untersuchungsablauf", "Strahlenschutz"] },
      { role: "Befundkoordination", specialty: "", topics: ["Befundübermittlung", "Dringlichkeit"] },
      { role: "RIS/PACS-Administration", specialty: "", topics: ["Bilddatenaustausch", "Systembetrieb"] }
    ],
    "demo-org-saar-asv": [
      { role: "ASV-Teamleitung Rheumatologie", specialty: "Rheumatologie", topics: ["ASV", "Rheumatologie"] },
      { role: "ASV-Koordination", specialty: "", topics: ["Überweisung", "Teamabstimmung"] },
      { role: "Patientenmanagement", specialty: "", topics: ["Terminsteuerung", "Befundanforderung"] }
    ],
    "demo-org-leine": [
      { role: "Ärztliche Leitung Pädiatrie", specialty: "Kinder- und Jugendmedizin", topics: ["Pädiatrie", "Entlassmanagement"] },
      { role: "Pflegeüberleitung Pädiatrie", specialty: "", topics: ["Nachsorge", "Elterninformation"] },
      { role: "Entlasskoordination", specialty: "", topics: ["Arztbrief", "Anschlussversorgung"] },
      { role: "Stationsleitung", specialty: "", topics: ["Aufnahme", "Interne Übergabe"] }
    ],
    "demo-org-kiellogopaedie": [
      { role: "Logopädische Leitung", specialty: "", topics: ["Logopädie", "Therapieplanung"] },
      { role: "Rezeptmanagement", specialty: "", topics: ["Heilmittelverordnung", "Fristen"] }
    ],
    "demo-org-neckarergotherapie": [
      { role: "Ergotherapeutische Leitung", specialty: "", topics: ["Ergotherapie", "Teilhabeziele"] },
      { role: "Praxisorganisation", specialty: "", topics: ["Terminserien", "Therapiebericht"] }
    ]
  };
  const demoFirstNames = [
    "Leonie", "Murat", "Sophie", "Jonas", "Aylin", "Felix", "Nora", "David", "Miriam", "Can",
    "Hannah", "Samir", "Julia", "Tarek", "Elif", "Max", "Amira", "Benjamin", "Clara", "Deniz",
    "Fatma", "Georg", "Helene", "Idris", "Jana", "Karim", "Luisa", "Mehmet", "Nele", "Paul"
  ];
  const demoLastNames = [
    "Albrecht", "Demir", "Hoffmann", "Kramer", "Özdemir", "Neumann",
    "Becker", "Nguyen", "Richter", "Yilmaz", "Schubert", "Wagner"
  ];
  const fictionalPersonName = (index, { offset = 0, doctor = false } = {}) => {
    const normalizedIndex = Math.abs(Number(index) + Number(offset));
    const firstName = demoFirstNames[normalizedIndex % demoFirstNames.length];
    const nameCycle = Math.floor(normalizedIndex / demoFirstNames.length);
    const lastName = demoLastNames[((normalizedIndex * 7) + (nameCycle * 5)) % demoLastNames.length];
    return `${doctor ? "Dr. " : ""}${firstName} ${lastName}`;
  };
  const organizationContactCounts = [
    3, 3, 4, 2, 3, 3, 3, 3, 2, 3, 3, 4, 3, 4, 3, 3, 2, 3, 2, 3, 2, 4, 3, 3, 2, 3, 2,
    3, 3, 2, 2, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 3, 3, 1, 2, 3, 1, 1, 1, 3, 3, 2
  ];
  const contactAssignments = organizationContactCounts.flatMap((count, organizationIndex) =>
    Array.from({ length: count }, (_, localIndex) => ({ organizationIndex, localIndex }))
  );

  function contact(index, organizationIndex, localIndex, baseName, overrides = {}) {
    const org = organizations[organizationIndex % organizations.length];
    const templates = organizationContactTemplates[org.id] || sectorContactTemplates[org.sector] || sectorContactTemplates.Praxis;
    const contactTemplate = templates[localIndex % templates.length];
    const contactRole = contactTemplate.role;
    const specialty = contactTemplate.specialty;
    const themes = contactTemplate.topics;
    const doctor = /ärzt|nephrologische|radiologische/i.test(contactRole);
    const name = doctor ? `Dr. ${baseName}` : baseName;
    const n = index + 1;
    const phoneIndex = 55 + index;
    const phone = phoneIndex < 100
      ? `+49 171 39200 ${String(phoneIndex).padStart(2, "0")}`
      : `+49 176 040690 ${String(phoneIndex - 100).padStart(2, "0")}`;
    const demoImage = index % 3 === 0 ? demoContactImageForIndex(index) : "";
    const assignedOwnerIds = index % 9 === 0
      ? [ownerIds[index % ownerIds.length], ownerIds[(index + 1) % ownerIds.length]]
      : [ownerIds[index % ownerIds.length]];
    const assignedOwnerLabels = assignedOwnerIds
      .map((ownerId) => profiles.find((profile) => profile.id === ownerId)?.display_name || "")
      .filter(Boolean);
    const consentRecordedBy = assignedOwnerIds[0] || ownerIds[(index + 1) % ownerIds.length] || "";
    const consentDecisionAt = new Date(Date.UTC(2026, 4 + (index % 2), 2 + (index % 20), 9 + (index % 6), 15)).toISOString();
    const relationshipBasisOptions = [
      "public_task",
      "self_submitted",
      "active_collaboration",
      "verbal_contact",
      "public_professional_source"
    ];
    const relationshipBasis = index % 9 === 3
      ? "review_required"
      : relationshipBasisOptions[index % relationshipBasisOptions.length];
    const relationshipBasisEffectiveAt = relationshipBasis === "review_required"
      ? ""
      : new Date(Date.UTC(2026, 3 + (index % 2), 1 + (index % 24), 8 + (index % 5), 30)).toISOString();
    const relationshipBasisNote = relationshipBasis === "review_required"
      ? "Die Beziehungsgrundlage dieses synthetischen Kontakts muss fachlich geprüft werden."
      : "Synthetisch dokumentierte Beziehungsgrundlage für Funktions- und Filtertests.";
    const consentSourceOptions = ["online_form", "email", "written", "verbal_confirmed", "manual_transfer"];
    const consentGranted = index < 72 && index % 8 === 7;
    const consentStatus = consentGranted
      ? "granted"
      : index % 41 === 12
        ? "withdrawn"
        : index % 17 === 6
          ? "declined"
          : index % 11 === 4
            ? "clarification_needed"
            : "not_requested";
    const consentSource = consentGranted
      ? consentSourceOptions[Math.floor(index / 8) % consentSourceOptions.length]
      : ["declined", "withdrawn"].includes(consentStatus)
        ? (index % 2 ? "email" : "written")
        : "";
    const consentNote = consentGranted
      ? "Vollständig dokumentierte, rein synthetische Einwilligung für Funktions- und Filtertests."
      : consentStatus === "declined"
        ? "Kontaktaufnahme wurde im synthetischen Szenario abgelehnt."
        : consentStatus === "withdrawn"
          ? "Eine zuvor erteilte Einwilligung wurde im synthetischen Szenario widerrufen."
          : consentStatus === "clarification_needed"
            ? "Reichweite oder Nachweis der Einwilligung ist im synthetischen Szenario noch zu klären."
            : "";
    return {
      id: `demo-contact-${String(n).padStart(2, "0")}`,
      name,
      organizationId: org.id,
      organization: org.name,
      category: org.sector,
      specialty,
      contactRole,
      priority: priorities[index % priorities.length],
      ownerId: assignedOwnerIds[0] || "",
      ownerIds: assignedOwnerIds,
      owner: assignedOwnerLabels.join(", "),
      postalCode: org.postalCode,
      city: org.city,
      state: org.state,
      lat: Number((org.lat + ((index % 5) - 2) * 0.018).toFixed(5)),
      lon: Number((org.lon + ((index % 7) - 3) * 0.022).toFixed(5)),
      email: `kontakt-${String(n).padStart(3, "0")}@versorgung.example.invalid`,
      phone,
      linkedin: "",
      relationshipBasis,
      relationshipBasisEffectiveAt,
      relationshipBasisRecordedBy: relationshipBasis === "review_required" ? "" : consentRecordedBy,
      relationshipBasisNote,
      mitmachenConsentStatus: consentStatus,
      mitmachenConsentEffectiveAt: ["granted", "declined", "withdrawn"].includes(consentStatus) ? consentDecisionAt : "",
      mitmachenConsentSource: consentSource,
      mitmachenConsentTextVersion: ["granted", "declined", "withdrawn"].includes(consentStatus) ? "mitmachen-kontakt-v2" : "",
      mitmachenConsentRecordedBy: ["granted", "declined", "withdrawn"].includes(consentStatus) ? consentRecordedBy : "",
      mitmachenConsentNote: consentNote,
      ehcConsentStatus: "not_requested",
      ehcConsentEffectiveAt: "",
      ehcConsentSource: "",
      ehcConsentTextVersion: "",
      ehcConsentRecordedBy: "",
      ehcConsentNote: "",
      themes,
      note: "Fiktiver Versorgungskontakt; alle Angaben sind synthetisch und enthalten keine realen CRM-Daten.",
      nextStep: index % 3 === 0 ? "Rückmeldung zum nächsten Übergabepunkt im Versorgungspfad einholen." : "",
      sources: ["Synthetischer Versorgungsdatensatz", index % 3 === 0 ? "Fiktiver Qualitätsimport" : "Manuelle Datenpflege"],
      image: demoImage,
      imageSourceLabel: demoImage ? "Lokales synthetisches Profilbild" : "",
      imageRightsNote: demoImage ? "Fiktive Illustration im Repository." : "",
      status: "active",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: new Date(Date.UTC(2026, 4, 1 + (index % 18), 9, 0, 0)).toISOString(),
      ...overrides
    };
  }

  const contacts = contactAssignments.map(({ organizationIndex, localIndex }, index) =>
    contact(index, organizationIndex, localIndex, fictionalPersonName(index))
  );
  contacts.forEach((entry, index) => {
    if (index % 17 === 5) {
      entry.email = "";
      entry.note = "Fiktiver Kontakt mit noch nicht erhobener E-Mail-Adresse für die Datenqualitätsprüfung.";
    }
    if (index % 19 === 8) {
      entry.phone = "";
      entry.note = "Fiktiver Kontakt mit noch nicht erhobener Telefonnummer für die Datenqualitätsprüfung.";
    }
    if (index % 31 === 12 && entry.organizationId !== "demo-org-havel-psych") {
      entry.specialty = "";
      entry.note = "Fiktiver Kontakt mit offener fachlicher Zuordnung für Filter- und Qualitätsprüfung.";
    }
    if (index % 37 === 16) {
      entry.ownerId = "";
      entry.ownerIds = [];
      entry.owner = "";
      entry.note = "Fiktiver Kontakt ohne zugeordnete Verantwortung für Pflege-Queue und Owner-Filter.";
    }
    if (index % 43 === 20) {
      entry.lat = null;
      entry.lon = null;
      entry.note = "Fiktiver Kontakt ohne Koordinaten für Karten- und Datenqualitätsprüfung.";
    }
  });
  [24, 77, 110].forEach((index) => {
    contacts[index] = { ...contacts[index], status: "archived", note: "Archivierter synthetischer Kontakt für administrative Prüfungen." };
  });
  Object.assign(contacts[3], {
    relationshipBasis: "review_required",
    relationshipBasisEffectiveAt: "",
    relationshipBasisRecordedBy: "",
    relationshipBasisNote: "",
    mitmachenConsentStatus: "not_requested",
    mitmachenConsentEffectiveAt: "",
    mitmachenConsentSource: "",
    mitmachenConsentTextVersion: "",
    mitmachenConsentRecordedBy: "",
    mitmachenConsentNote: "",
    ehcConsentStatus: "not_requested",
    ehcConsentEffectiveAt: "",
    ehcConsentSource: "",
    ehcConsentTextVersion: "",
    ehcConsentRecordedBy: "",
    ehcConsentNote: ""
  });
  Object.assign(contacts[4], {
    relationshipBasis: "review_required",
    relationshipBasisEffectiveAt: "",
    relationshipBasisRecordedBy: "",
    relationshipBasisNote: "Herkunft und Reichweite müssen vor einer Kontaktaufnahme geklärt werden.",
    mitmachenConsentStatus: "clarification_needed",
    mitmachenConsentEffectiveAt: "",
    mitmachenConsentSource: "",
    mitmachenConsentTextVersion: "",
    mitmachenConsentRecordedBy: "",
    mitmachenConsentNote: "Der synthetische Altfund enthält keinen belastbaren #Mitmachen-Nachweis."
  });
  Object.assign(contacts[7], {
    relationshipBasis: "self_submitted",
    relationshipBasisEffectiveAt: "2026-05-09T10:15:00.000Z",
    relationshipBasisRecordedBy: contacts[7].ownerId,
    relationshipBasisNote: "Selbstregistrierung über das synthetische #Mitmachen-Onlineformular.",
    mitmachenConsentStatus: "granted",
    mitmachenConsentEffectiveAt: "2026-05-09T10:15:00.000Z",
    mitmachenConsentSource: "online_form",
    mitmachenConsentTextVersion: "mitmachen-kontakt-v2",
    mitmachenConsentRecordedBy: contacts[7].ownerId,
    mitmachenConsentNote: "Vollständiger synthetischer Formularnachweis."
  });
  Object.assign(contacts[31], {
    relationshipBasis: "verbal_contact",
    relationshipBasisEffectiveAt: "2026-06-13T11:30:00.000Z",
    relationshipBasisRecordedBy: contacts[31].ownerId,
    relationshipBasisNote: "Persönliches Gespräch auf einem rein fiktiven Fachkongress.",
    mitmachenConsentStatus: "granted",
    mitmachenConsentEffectiveAt: "2026-06-13T11:30:00.000Z",
    mitmachenConsentSource: "verbal_confirmed",
    mitmachenConsentTextVersion: "mitmachen-muendlich-v1",
    mitmachenConsentRecordedBy: contacts[31].ownerId,
    mitmachenConsentNote: "Mündlich bestätigt; schriftlichen Nachweis im synthetischen Szenario nachfassen."
  });
  Object.assign(contacts[70], {
    ehcConsentStatus: "clarification_needed",
    ehcConsentEffectiveAt: "",
    ehcConsentSource: "manual_transfer",
    ehcConsentTextVersion: "",
    ehcConsentRecordedBy: contacts[70].ownerId,
    ehcConsentNote: "Die übertragene EHC-Textversion ist im synthetischen Szenario noch zu klären."
  });
  Object.assign(contacts[75], {
    relationshipBasis: "active_collaboration",
    relationshipBasisEffectiveAt: "2025-11-12T09:20:00.000Z",
    relationshipBasisRecordedBy: contacts[75].ownerId,
    relationshipBasisNote: "Verarbeitung ausschließlich für die synthetische EHC-Panelverwaltung.",
    mitmachenConsentStatus: "not_requested",
    mitmachenConsentEffectiveAt: "",
    mitmachenConsentSource: "",
    mitmachenConsentTextVersion: "",
    mitmachenConsentRecordedBy: "",
    mitmachenConsentNote: "",
    ehcConsentStatus: "granted",
    ehcConsentEffectiveAt: "2025-11-12T09:15:00.000Z",
    ehcConsentSource: "survalyzer_ehc",
    ehcConsentTextVersion: "ehc-teilnahme-v2025-11",
    ehcConsentRecordedBy: contacts[75].ownerId,
    ehcConsentNote: "Vollständiger synthetischer EHC-Nachweis; keine #Mitmachen-Einwilligung."
  });

  const hospitationDemoSources = {
    kbv2024: "Fachlicher Quellenbezug 01 · https://www.kbv.de/infothek/zahlen-und-fakten/studien-und-berichte/praxisbarometer-digitalisierung",
    gbaDischarge: "Fachlicher Quellenbezug 02 · https://www.g-ba.de/presse/pressemitteilungen-meldungen/595/",
    gbaPatientLetters: "Fachlicher Quellenbezug 03 · https://www.bundesgesundheitsministerium.de/service/begriffe-von-a-z/e/entlassmanagement/seite",
    apsAmts: "Fachlicher Quellenbezug 04 · https://www.g-ba.de/richtlinien/87/",
    cirsTransition: "Fachlicher Quellenbezug 05 · https://www.g-ba.de/richtlinien/87/",
    gematikERezept: "Fachlicher Quellenbezug 06 · https://www.gematik.de/anwendungen/e-rezept",
    gematikTiAtlas: "Fachlicher Quellenbezug 07 · https://www.gematik.de/telematikinfrastruktur/transparenz/ti-atlas",
    rkiDemis: "Fachlicher Quellenbezug 08 · https://www.rki.de/DE/Themen/Infektionskrankheiten/Meldewesen/DEMIS/demis-node.html",
    gbaHeilmittel: "Fachlicher Quellenbezug 09 · https://www.g-ba.de/richtlinien/12/",
    gbaSapv: "Fachlicher Quellenbezug 10 · https://www.g-ba.de/richtlinien/64/",
    gbaHkp: "Fachlicher Quellenbezug 11 · https://www.g-ba.de/richtlinien/11/",
    baekLab: "Fachlicher Quellenbezug 12 · https://www.bundesaerztekammer.de/fileadmin/user_upload/BAEK/Themen/Qualitaetssicherung/_Bek_BAEK_RiLi_BAEK_ONLINE_FINAL_VERS_26_05_2023.pdf",
    gkvHebammen: "Fachlicher Quellenbezug 13 · https://www.gkv-spitzenverband.de/krankenversicherung/ambulante_leistungen/hebammen_geburtshaeuser/qualitaet/qualitaet.jsp",
    diviEmergency: "Fachlicher Quellenbezug 14 · https://www.divi.de/sektionen/notfalldokumentation",
    destatisCare: "Fachlicher Quellenbezug 15 · https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Gesundheit/Pflege/Tabellen/pflegeeinrichtungen-deutschland.html?templateQueryString=2021+2021"
  };
  const observationSourceOverrides = {
    "obs-lab-1": hospitationDemoSources.baekLab,
    "obs-lab-2": hospitationDemoSources.baekLab,
    "obs-lab-3": hospitationDemoSources.baekLab,
    "obs-lab-4": hospitationDemoSources.baekLab,
    "obs-rd-1": hospitationDemoSources.diviEmergency,
    "obs-rd-2": hospitationDemoSources.diviEmergency,
    "obs-rd-3": hospitationDemoSources.diviEmergency,
    "obs-rd-4": hospitationDemoSources.diviEmergency,
    "obs-heb-1": hospitationDemoSources.gkvHebammen,
    "obs-heb-2": hospitationDemoSources.gkvHebammen,
    "obs-heb-3": hospitationDemoSources.gkvHebammen
  };
  const observationProblemTypeOverrides = {
    "obs-med-2": "fehlende Information",
    "obs-kim-2": "fehlende Information",
    "obs-ref-2": "fehlende Information",
    "obs-ref-3": "fehlende Information",
    "obs-home-2": "fehlende Information",
    "obs-paed-1": "Systemverständnis",
    "obs-paed-2": "Medienbruch",
    "obs-paed-3": "Wartezeit",
    "obs-radio-2": "fehlende Information",
    "obs-apo-3": "fehlende Information",
    "obs-pfl-3": "fehlende Information",
    "obs-rd-4": "Medienbruch",
    "obs-lab-2": "",
    "obs-rd-1": "",
    "obs-heil-2": ""
  };
  const observationTypeOverrides = {
    "obs-kim-2": "Gegenbeispiel",
    "obs-ref-3": "Gegenbeispiel",
    "obs-paed-2": "Gegenbeispiel",
    "obs-rd-4": "Gegenbeispiel",
    "obs-lab-2": "Kontextwissen",
    "obs-rd-1": "Kontextwissen",
    "obs-heil-2": "Kontextwissen"
  };
  const observationImpactOverrides = {
    "obs-paed-1": "Fehleranfälligkeit",
    "obs-paed-3": "Prozessverzögerung"
  };
  const observationProblemTypeAliases = {
    "widersprüchliche Datenstände": "fehlende Information",
    "unklare Zuständigkeit": "Rollenunklarheit",
    "unklarer Bearbeitungsstatus": "fehlende Information"
  };
  const observationProcessPhaseAliases = {
    "Anamnese / Bedarfserhebung": "Behandlung / Beratung",
    Anamnese: "Behandlung / Beratung",
    "Bedarfserhebung": "Behandlung / Beratung",
    "Behandlung / Pflege": "Behandlung / Beratung",
    "Genehmigung / Abrechnung": "Nachbereitung",
    "Interne Übergabe": "Befund / Dokumentation",
    "Nachsorge": "Nachbereitung"
  };
  const observationProcessPhaseOverrides = {
    "obs-reha-1": "Befund / Dokumentation",
    "obs-kas-1": "Nachbereitung"
  };
  const observationImpactAliases = {
    "Belastung für Angehörige": "Frust / Belastung",
    "Frust und Belastung": "Frust / Belastung",
    Koordinationsaufwand: "Zeitaufwand",
    Nacharbeit: "Zeitaufwand",
    Sicherheitsrisiko: "Fehleranfälligkeit",
    "Sicherheitsrisiko wird reduziert": "Ablauf funktioniert gut",
    "Sicherheitsgefühl steigt": "Ablauf funktioniert gut",
    Unsicherheit: "Sicherheitsgefühl sinkt",
    Versorgungsverzögerung: "Prozessverzögerung",
    Wartezeit: "Prozessverzögerung"
  };

  function hospitationDemoObservation(input = {}) {
    const actions = Array.isArray(input.actions) ? input.actions : [input.actions].filter(Boolean);
    const toolsAndDocuments = Array.isArray(input.toolsAndDocuments) ? input.toolsAndDocuments : [input.toolsAndDocuments].filter(Boolean);
    const communicationChannels = Array.isArray(input.communicationChannels) ? input.communicationChannels : [input.communicationChannels].filter(Boolean);
    const rawId = String(input.id || "");
    const demoId = rawId.startsWith("demo-") ? rawId : `demo-observation-${rawId.replace(/^obs-/, "")}`;
    const problemType = Object.hasOwn(observationProblemTypeOverrides, rawId)
      ? observationProblemTypeOverrides[rawId]
      : observationProblemTypeAliases[input.problemType] || input.problemType;
    const processPhase = observationProcessPhaseOverrides[rawId]
      || observationProcessPhaseAliases[input.processPhase]
      || input.processPhase;
    const impact = observationImpactOverrides[rawId] || observationImpactAliases[input.impact] || input.impact;
    const observationType = input.observationType
      || observationTypeOverrides[rawId]
      || (problemType === "positives Muster / Best Practice"
        ? "positives Beispiel"
        : problemType === "offene Frage"
          ? "offene Frage"
          : problemType === "Workaround"
            ? "Gegenbeispiel"
            : "Reibung / Problem");
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
      processPhase,
      problemType,
      impact,
      observationType,
      currentWorkaround: input.currentWorkaround || "",
      settingType: input.settingType,
      theme: input.theme,
      evidenceType: "synthetic_source_based",
      sourceType: "synthetic_source_scenario",
      sourceReference: observationSourceOverrides[rawId] || input.sourceReference,
      uncertainty: input.uncertainty || "Die konkrete Situation ist ein synthetischer Fall. Sie belegt weder Häufigkeit noch Kausalität.",
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
      sourceType: "synthetic_source_scenario",
      limitations: "Rein synthetische Hospitationsdokumentation. Die offiziellen Quellen belegen nur den Prozesskontext, nicht das einzelne Ereignis, seine Häufigkeit oder Kausalität.",
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
      organizationId: "demo-org-nordstadt",
      date: "2026-01-22", start: "08:35", end: "11:20", contactName: "Hausarztteam Stadtpark", organizationName: "Hausarztpraxis Stadtpark",
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
      organizationId: "demo-org-elbufer",
      date: "2026-02-05", start: "10:10", end: "13:05", contactName: "Entlasskoordination Westufer", organizationName: "Klinik Westufer",
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
      organizationId: "demo-org-foerde",
      date: "2026-02-19", start: "07:55", end: "10:35", contactName: "Praxisteam Alsterbogen", organizationName: "Hausarztzentrum Alsterbogen",
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
      organizationId: "demo-org-heidepraxis",
      date: "2026-03-04", start: "09:05", end: "11:40", contactName: "Praxisteam Leineufer", organizationName: "Gemeinschaftspraxis Leineufer",
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
      organizationId: "demo-org-erfurt",
      date: "2026-03-18", start: "08:20", end: "11:10", contactName: "Facharztteam Rheinbogen", organizationName: "Facharztzentrum Rheinbogen",
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
      organizationId: "demo-org-innpflege",
      date: "2026-04-02", start: "07:30", end: "10:20", contactName: "Pflegekoordination Elbblick", organizationName: "Pflegedienst Elbblick",
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
      organizationId: "demo-org-ruhrhilfen",
      date: "2026-04-16", start: "08:45", end: "11:35", contactName: "Homecare-Team Mainbogen", organizationName: "Homecare Mainbogen",
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
      organizationId: "demo-org-taunusreha",
      date: "2026-04-29", start: "13:10", end: "15:40", contactName: "Reha-Koordination Neckarbogen", organizationName: "Reha-Zentrum Neckarbogen",
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
      organizationId: "demo-org-leine",
      date: "2026-05-07", start: "09:30", end: "12:25", contactName: "Entlassteam Pädiatrie", organizationName: "Kinderklinik Isarbogen",
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
      organizationId: "demo-org-radiologie-elbufer",
      date: "2026-05-21", start: "08:10", end: "10:55", contactName: "Radiologieteam Elbufer", organizationName: "Radiologieverbund Elbufer",
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
      organizationId: "demo-org-mainnetz",
      date: "2026-06-03", start: "07:50", end: "10:30", contactName: "DMP-Team Weserbogen", organizationName: "DMP-Zentrum Weserbogen",
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
      organizationId: "demo-org-lippepsyche",
      date: "2026-06-17", start: "14:00", end: "16:35", contactName: "Praxisteam Psychosoziale Versorgung", organizationName: "Praxis Nordlicht",
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
      organizationId: "demo-org-oderklinik",
      date: "2026-06-25", start: "10:25", end: "12:50", contactName: "Team Patienteninformation", organizationName: "Klinik Südstadt",
      city: "Rostock", state: "Mecklenburg-Vorpommern", sector: "Krankenhaus", observedRoles: ["Stationsärztin", "Pflegefachperson", "Patient"],
      goal: "Beobachten, wie medizinische Entlassinformationen in verständliche nächste Schritte übersetzt werden.", topics: ["Patienteninformation", "Entlassbrief", "Medikationsverständnis"],
      summary: "Ein zusätzliches verständliches Patientenblatt reduziert Rückfragen, bleibt aber ein weiterer zu pflegender Dokumentenstand.",
      observations: [
        hospitationDemoObservation({ id: "obs-info-1", sequence: 1, observedAt: "10:42 Uhr", title: "Medizinischer Arztbrief beantwortet die Alltagsfragen nicht", situationContext: "Vorbereitung eines Entlassgesprächs.", trigger: "Der Patient fragt, welches Medikament abends nicht mehr eingenommen werden soll.", actions: ["Die Pflegefachperson sucht die Änderung im Arztbrief.", "Sie gleicht sie mit dem Medikationsplan ab.", "Sie markiert die Änderung im Patientenblatt."], toolsAndDocuments: ["Arztbrief", "Medikationsplan", "Patientenblatt"], immediateConsequence: "Die konkrete Einnahmeänderung wird im Gespräch sichtbar hervorgehoben.", affectedRoles: ["Pflegefachperson", "Patient"], processPhase: "Kommunikation mit Patient:innen", problemType: "Systemverständnis", impact: "Sicherheitsgefühl sinkt", currentWorkaround: "Zusätzliches laienverständliches Patientenblatt.", settingType: "Klinik / Entlassmanagement", theme: "Medikationsverständnis", sourceReference: hospitationDemoSources.gbaPatientLetters }),
        hospitationDemoObservation({ id: "obs-info-2", sequence: 2, observedAt: "11:18 Uhr", title: "Patient wiederholt den nächsten Schritt", situationContext: "Entlassgespräch mit drei schriftlichen Unterlagen.", trigger: "Die Stationsärztin erklärt die Medikamentenänderung und den Kontrolltermin.", actions: ["Sie bittet den Patienten, die nächsten Schritte in eigenen Worten zu wiederholen.", "Der Patient nennt Medikament, Zeitpunkt und Kontrolltermin.", "Die Pflegefachperson korrigiert eine zunächst falsch genannte Uhrzeit."], toolsAndDocuments: ["Patientenblatt", "Medikationsplan", "Terminblatt"], immediateConsequence: "Ein Missverständnis wird vor der Entlassung erkannt.", affectedRoles: ["Stationsärztin", "Pflegefachperson", "Patient"], processPhase: "Kommunikation mit Patient:innen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Klinik / Entlassmanagement", theme: "Teach-back", sourceReference: hospitationDemoSources.gbaPatientLetters }),
        hospitationDemoObservation({ id: "obs-info-3", sequence: 3, observedAt: "11:46 Uhr", title: "Änderung muss in zwei Dokumenten nachgeführt werden", situationContext: "Korrektur einer Terminzeit nach dem Gespräch.", trigger: "Die Ambulanz meldet telefonisch eine neue Uhrzeit.", actions: ["Die Pflegefachperson ändert das Terminblatt.", "Sie öffnet das Patientenblatt und ändert dieselbe Uhrzeit erneut.", "Sie druckt beide Dokumente neu."], toolsAndDocuments: ["Terminblatt", "Patientenblatt", "Drucker"], communicationChannels: ["Telefon"], immediateConsequence: "Zwei veraltete Ausdrucke werden vernichtet und neu erstellt.", affectedRoles: ["Pflegefachperson", "Ambulanz"], processPhase: "Befund / Dokumentation", problemType: "doppelte Dokumentation", impact: "Zeitaufwand", currentWorkaround: "Manuelle Synchronisation beider Dokumente.", settingType: "Klinik / Entlassmanagement", theme: "Dokumentenstand", sourceReference: hospitationDemoSources.gbaPatientLetters })
      ]
    },
    {
      id: "demo-hospitation-erezept-apothekenabgabe",
      organizationId: "demo-org-rheinapotheke",
      date: "2026-07-02", start: "08:15", end: "10:45", contactName: "Apothekenteam Rheinmitte", organizationName: "Apotheke Rheinmitte",
      city: "Köln", state: "Nordrhein-Westfalen", sector: "Apotheke", observedRoles: ["Apothekerin", "PTA", "PKA"],
      goal: "Abruf, Prüfung und Abgabe eines E-Rezepts einschließlich Lieferengpass und Rückfrage nachvollziehen.",
      topics: ["E-Rezept", "Lieferfähigkeit", "Substitution", "Praxisrückfrage"],
      summary: "Der digitale Abruf funktioniert zuverlässig; Lieferstatus und pharmazeutische Rückfrage wechseln jedoch zwischen Warenwirtschaft, Telefon und Notiz.",
      observations: [
        hospitationDemoObservation({ id: "obs-apo-1", sequence: 1, observedAt: "08:31 Uhr", title: "Rezeptdaten werden direkt in die Warenwirtschaft übernommen", situationContext: "Einlösung eines E-Rezepts mit der elektronischen Gesundheitskarte.", trigger: "Die Patientin steckt ihre eGK am Handverkaufstisch ein.", actions: ["Die PTA ruft die offenen Verordnungen ab.", "Sie übernimmt das ausgewählte Rezept in das AVS.", "Das System prüft Pflichtangaben und Verfügbarkeit."], toolsAndDocuments: ["eGK", "E-Rezept-Fachdienst", "AVS"], immediateConsequence: "Die Verordnung muss nicht manuell erfasst werden.", affectedRoles: ["PTA", "Patientin"], processPhase: "Anmeldung / Aufnahme", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Vor-Ort-Apotheke", theme: "E-Rezept-Abruf", sourceReference: hospitationDemoSources.gematikERezept }),
        hospitationDemoObservation({ id: "obs-apo-2", sequence: 2, observedAt: "08:38 Uhr", title: "Lieferstatus ist nur im zweiten System sichtbar", situationContext: "Prüfung eines nicht vorrätigen Arzneimittels.", trigger: "Das AVS meldet für die verordnete Packung keinen Bestand.", actions: ["Die PTA öffnet die Großhandelsabfrage.", "Sie vergleicht drei alternative Packungen.", "Sie notiert den erwarteten Lieferzeitpunkt im AVS-Kommentarfeld."], toolsAndDocuments: ["AVS", "Großhandelsportal", "Kommentarfeld"], immediateConsequence: "Die Patientin wartet auf eine belastbare Aussage zur Abholung.", affectedRoles: ["PTA", "Patientin"], processPhase: "Verordnung", problemType: "Medienbruch", impact: "Wartezeit", currentWorkaround: "Lieferinformation wird aus dem Großhandelsportal in das AVS übertragen.", settingType: "Vor-Ort-Apotheke", theme: "Lieferfähigkeit", sourceReference: hospitationDemoSources.gematikERezept }),
        hospitationDemoObservation({ id: "obs-apo-3", sequence: 3, observedAt: "09:12 Uhr", title: "Pharmazeutische Rückfrage bleibt telefonisch", situationContext: "Prüfung einer Dosierungsangabe vor der Abgabe.", trigger: "Die Dosierung passt nicht zur dokumentierten Wirkstärke.", actions: ["Die Apothekerin ruft die verordnende Praxis an.", "Sie erläutert die konkrete Abweichung.", "Nach Rücksprache dokumentiert sie die bestätigte Dosierung im AVS."], toolsAndDocuments: ["Telefon", "AVS", "E-Rezept"], communicationChannels: ["Telefon"], immediateConsequence: "Die Abgabe erfolgt erst nach der fachlichen Klärung.", affectedRoles: ["Apothekerin", "MFA", "Patientin"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "Rückfrage", impact: "Versorgungsverzögerung", currentWorkaround: "Telefonische Klärung und lokale Dokumentation.", settingType: "Vor-Ort-Apotheke", theme: "Arzneimitteltherapiesicherheit", sourceReference: hospitationDemoSources.gematikERezept })
      ]
    },
    {
      id: "demo-hospitation-labor-kritischer-befund",
      organizationId: "demo-org-mosellabor",
      date: "2026-07-07", start: "07:35", end: "11:20", contactName: "Einsendermanagement Moselbogen", organizationName: "Laborverbund Moselbogen",
      city: "Koblenz", state: "Rheinland-Pfalz", sector: "Labor", observedRoles: ["MTL", "Laborärztin", "Einsendermanagement"],
      goal: "Probenzuordnung, Freigabe und Übermittlung eines kritischen Laborbefunds beobachten.",
      topics: ["Präanalytik", "LIS", "kritischer Befund", "KIM"],
      summary: "Barcode und LIS stützen den Routineprozess; ein kritischer Wert löst zusätzlich einen dokumentierten Telefonkontakt aus.",
      observations: [
        hospitationDemoObservation({ id: "obs-lab-1", sequence: 1, observedAt: "07:52 Uhr", title: "Barcode verbindet Probe und Auftrag", situationContext: "Probeneingang aus mehreren ambulanten Praxen.", trigger: "Eine Transportbox wird am Probeneingang geöffnet.", actions: ["Die MTL scannt Proben- und Auftragsbarcode.", "Das LIS zeigt Einsender und angeforderte Analysen.", "Abweichungsfreie Proben werden automatisch der Analytik zugeordnet."], toolsAndDocuments: ["Probenbarcode", "Auftragsbarcode", "LIS"], immediateConsequence: "Die Zuordnung ist ohne erneute Dateneingabe nachvollziehbar.", affectedRoles: ["MTL", "Einsendermanagement"], processPhase: "Identifikation", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Medizinisches Labor", theme: "Probenidentifikation", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-lab-2", sequence: 2, observedAt: "09:26 Uhr", title: "Kritischer Wert erzeugt eine zusätzliche Rückrufaufgabe", situationContext: "Technische und ärztliche Befundvalidierung.", trigger: "Ein Kaliumwert überschreitet den lokal hinterlegten Alarmgrenzwert.", actions: ["Das LIS sperrt die automatische Freigabe.", "Die Laborärztin plausibilisiert Vorwert und Probenhinweis.", "Das Einsendermanagement übernimmt den Fall in die Rückrufliste."], toolsAndDocuments: ["LIS", "Vorwerte", "digitale Rückrufliste"], immediateConsequence: "Der Routineprozess wird zugunsten der Patientensicherheit unterbrochen.", affectedRoles: ["Laborärztin", "Einsendermanagement"], processPhase: "Befund / Dokumentation", problemType: "positives Muster / Best Practice", impact: "Sicherheitsrisiko wird reduziert", settingType: "Medizinisches Labor", theme: "Kritischer Befund", sourceReference: hospitationDemoSources.kbv2024 }),
        hospitationDemoObservation({ id: "obs-lab-3", sequence: 3, observedAt: "09:41 Uhr", title: "Erreichbarkeit der richtigen Praxisrolle ist nicht hinterlegt", situationContext: "Telefonische Übermittlung des kritischen Befunds.", trigger: "Die zentrale Praxisnummer führt zunächst in die Terminwarteschleife.", actions: ["Die Fachkraft nennt den Anlass in der Anmeldung.", "Sie wird an die behandelnde Ärztin weiterverbunden.", "Zeitpunkt, Empfängerin und Rücklesebestätigung werden im LIS dokumentiert."], toolsAndDocuments: ["Telefon", "LIS", "Einsenderstammdaten"], communicationChannels: ["Telefon"], immediateConsequence: "Die Befundübermittlung verzögert sich um mehrere Minuten.", affectedRoles: ["Einsendermanagement", "MFA", "Ärztin"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "unklare Zuständigkeit", impact: "Arbeitsfluss wird unterbrochen", currentWorkaround: "Weiterleitung über die zentrale Praxisnummer.", settingType: "Medizinisches Labor", theme: "Befundkommunikation", sourceReference: hospitationDemoSources.cirsTransition })
      ]
    },
    {
      id: "demo-hospitation-demis-fallermittlung",
      organizationId: "demo-org-saaleoegd",
      date: "2026-07-09", start: "08:40", end: "12:20", contactName: "Sachgebiet Infektionsschutz", organizationName: "Gesundheitsamt Saalebogen",
      city: "Jena", state: "Thüringen", sector: "ÖGD", observedRoles: ["Sachbearbeitung Infektionsschutz", "Hygienekontrolleurin", "Amtsärztin"],
      goal: "Eingang, Dublettenprüfung und Bearbeitung einer elektronischen Infektionsmeldung nachvollziehen.",
      topics: ["DEMIS", "Infektionsschutz", "Dublettenprüfung", "Fallermittlung"],
      summary: "DEMIS routet die Meldung schnell an das zuständige Amt; die lokale Fallzusammenführung und Rückfrage bleiben fachliche Arbeitsschritte.",
      observations: [
        hospitationDemoObservation({ id: "obs-dem-1", sequence: 1, observedAt: "08:53 Uhr", title: "Meldung erreicht automatisch das zuständige Gesundheitsamt", situationContext: "Sichtung neuer Meldungen zu Beginn des Arbeitstags.", trigger: "Eine elektronische Labormeldung trifft über DEMIS ein.", actions: ["Die Sachbearbeitung öffnet den Meldungseingang.", "Sie prüft Zuständigkeit und Meldekategorie.", "Die Meldung wird in die lokale Fallbearbeitung übernommen."], toolsAndDocuments: ["DEMIS", "Fachanwendung Infektionsschutz"], communicationChannels: ["DEMIS"], immediateConsequence: "Es ist keine manuelle Weiterleitung per Fax erforderlich.", affectedRoles: ["Sachbearbeitung Infektionsschutz"], processPhase: "Anmeldung / Aufnahme", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Gesundheitsamt", theme: "Elektronischer Meldeeingang", sourceReference: hospitationDemoSources.rkiDemis }),
        hospitationDemoObservation({ id: "obs-dem-2", sequence: 2, observedAt: "09:17 Uhr", title: "Zwei Meldungen müssen fachlich zu einem Fall zusammengeführt werden", situationContext: "Abgleich eines Laborbefunds mit einer ärztlichen Krankheitsmeldung.", trigger: "Name und Geburtsdatum stimmen überein, die Anschriften weichen voneinander ab.", actions: ["Die Sachbearbeitung vergleicht Meldedatum und Erregerangabe.", "Sie sucht den bestehenden Fall in der Fachanwendung.", "Sie kennzeichnet die zweite Meldung als zusammengehörig."], toolsAndDocuments: ["DEMIS", "Fachanwendung Infektionsschutz", "Meldungsdetails"], immediateConsequence: "Eine doppelte Fallermittlung wird vermieden.", affectedRoles: ["Sachbearbeitung Infektionsschutz"], processPhase: "Identifikation", problemType: "widersprüchliche Datenstände", impact: "Nacharbeit", currentWorkaround: "Manuelle Plausibilisierung anhand mehrerer Identitätsmerkmale.", settingType: "Gesundheitsamt", theme: "Dublettenprüfung", sourceReference: hospitationDemoSources.rkiDemis }),
        hospitationDemoObservation({ id: "obs-dem-3", sequence: 3, observedAt: "10:06 Uhr", title: "Fehlende Expositionsangabe wird telefonisch ergänzt", situationContext: "Vorbereitung der Fallermittlung.", trigger: "Die Meldung enthält keinen Hinweis auf einen möglichen Gemeinschaftseinrichtungsbezug.", actions: ["Die Hygienekontrolleurin ruft die meldende Praxis an.", "Sie erfragt Aufenthalts- und Tätigkeitskontext.", "Die ergänzte Angabe wird in der Fallakte dokumentiert."], toolsAndDocuments: ["Telefon", "Fachanwendung Infektionsschutz"], communicationChannels: ["Telefon"], immediateConsequence: "Die Priorisierung weiterer Schutzmaßnahmen kann fachlich erfolgen.", affectedRoles: ["Hygienekontrolleurin", "MFA"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "fehlende Information", impact: "Koordinationsaufwand", currentWorkaround: "Telefonische Ergänzung der Meldung.", settingType: "Gesundheitsamt", theme: "Fallermittlung", sourceReference: hospitationDemoSources.rkiDemis })
      ]
    },
    {
      id: "demo-hospitation-rettungsdienst-klinikuebergabe",
      organizationId: "demo-org-elberettung",
      date: "2026-07-14", start: "06:30", end: "11:45", contactName: "Rettungswachenteam Elbauen", organizationName: "Rettungsdienst Elbauen",
      city: "Magdeburg", state: "Sachsen-Anhalt", sector: "Rettungsdienst", observedRoles: ["Notfallsanitäterin", "Rettungssanitäter", "Notaufnahme-Pflegefachperson"],
      goal: "Einsatzdokumentation und Übergabe eines zeitkritischen Falls an die Notaufnahme beobachten.",
      topics: ["Einsatzdokumentation", "Medikationsinformation", "Klinikübergabe", "Einsatzbereitschaft"],
      summary: "Ein strukturiertes Übergabeschema stabilisiert die mündliche Übergabe; Vorinformationen und Abschlussstatus verteilen sich auf Leitstelle, ePCR und Kliniksystem.",
      observations: [
        hospitationDemoObservation({ id: "obs-rd-1", sequence: 1, observedAt: "07:04 Uhr", title: "Leitstellendaten werden in das Einsatzprotokoll übernommen", situationContext: "Anfahrt zu einer internistischen Notfallmeldung.", trigger: "Der Einsatz wird auf das mobile Dokumentationsgerät übertragen.", actions: ["Die Notfallsanitäterin öffnet den Einsatz.", "Adresse und Meldebild sind bereits vorausgefüllt.", "Sie ergänzt Ankunftszeit und erste Lageeinschätzung."], toolsAndDocuments: ["Leitstellensystem", "mobiles ePCR"], communicationChannels: ["Digitalfunk", "Datensatzübertragung"], immediateConsequence: "Stammdaten müssen im Fahrzeug nicht erneut eingegeben werden.", affectedRoles: ["Notfallsanitäterin", "Leitstellendisposition"], processPhase: "Anmeldung / Aufnahme", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Rettungsdienst", theme: "Einsatzübernahme", sourceReference: hospitationDemoSources.cirsTransition }),
        hospitationDemoObservation({ id: "obs-rd-2", sequence: 2, observedAt: "07:38 Uhr", title: "Aktueller Medikationsplan ist am Einsatzort nicht verfügbar", situationContext: "Versorgung einer desorientierten Patientin in der Wohnung.", trigger: "Die Patientin kann ihre gerinnungshemmende Medikation nicht sicher benennen.", actions: ["Das Team sucht nach einem ausgedruckten Medikationsplan.", "Ein Angehöriger zeigt eine ältere Medikamentenliste auf dem Mobiltelefon.", "Die Unsicherheit wird im ePCR dokumentiert."], toolsAndDocuments: ["mobiles ePCR", "Foto einer Medikamentenliste"], immediateConsequence: "Die Medikamentenanamnese bleibt bis zur Klinikaufnahme unvollständig.", affectedRoles: ["Notfallsanitäterin", "Patientin", "Angehöriger"], processPhase: "Anamnese", problemType: "fehlende Information", impact: "Sicherheitsrisiko", currentWorkaround: "Kennzeichnung der ungesicherten Angabe in der Einsatzdokumentation.", settingType: "Rettungsdienst", theme: "Medikationsinformation", sourceReference: hospitationDemoSources.apsAmts }),
        hospitationDemoObservation({ id: "obs-rd-3", sequence: 3, observedAt: "08:21 Uhr", title: "Mündliche Übergabe folgt einem festen Schema", situationContext: "Übergabe im Schockraum der Notaufnahme.", trigger: "Das Klinikteam übernimmt die Patientin.", actions: ["Die Notfallsanitäterin berichtet nach einem festen Übergabeschema.", "Die Pflegefachperson wiederholt Allergie und letzte Vitalwerte.", "Das digitale Einsatzprotokoll wird nach Abschluss freigegeben."], toolsAndDocuments: ["Übergabeschema", "mobiles ePCR", "KIS"], communicationChannels: ["persönliche Übergabe"], immediateConsequence: "Kerninformationen werden hörbar bestätigt.", affectedRoles: ["Notfallsanitäterin", "Notaufnahme-Pflegefachperson", "Notärztin"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Notaufnahme", theme: "Klinikübergabe", sourceReference: hospitationDemoSources.cirsTransition })
      ]
    },
    {
      id: "demo-hospitation-wochenbett-uebergang",
      organizationId: "demo-org-donauhebammen",
      date: "2026-07-16", start: "09:00", end: "12:10", contactName: "Hebammennetz Donaublick", organizationName: "Hebammennetz Donaublick",
      city: "Ulm", state: "Baden-Württemberg", sector: "Hebammen", observedRoles: ["Freiberufliche Hebamme", "Wöchnerin", "Kinderarztpraxis"],
      goal: "Informationsübergang von der Geburtsklinik in die häusliche Wochenbettbetreuung nachvollziehen.",
      topics: ["Wochenbett", "Entlassinformation", "Mutterpass", "Neugeborenenversorgung"],
      summary: "Mutterpass und Entlassbogen tragen die Basisinformationen; ausstehende Befunde und Zuständigkeiten erfordern zusätzliche Rückfragen.",
      observations: [
        hospitationDemoObservation({ id: "obs-heb-1", sequence: 1, observedAt: "09:14 Uhr", title: "Entlassbogen strukturiert den ersten Hausbesuch", situationContext: "Erster Wochenbettbesuch am Tag nach der Klinikentlassung.", trigger: "Die Wöchnerin legt Mutterpass und Entlassbogen bereit.", actions: ["Die Hebamme gleicht Geburtsverlauf und Empfehlungen ab.", "Sie überträgt relevante Angaben in ihre Dokumentation.", "Sie markiert zwei offene Befunde für die Nachverfolgung."], toolsAndDocuments: ["Mutterpass", "Entlassbogen", "Hebammendokumentation"], immediateConsequence: "Die Betreuung beginnt mit einem gemeinsamen Informationsstand.", affectedRoles: ["Freiberufliche Hebamme", "Wöchnerin"], processPhase: "Anamnese", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Häusliche Wochenbettbetreuung", theme: "Entlassinformation", sourceReference: hospitationDemoSources.cirsTransition }),
        hospitationDemoObservation({ id: "obs-heb-2", sequence: 2, observedAt: "09:42 Uhr", title: "Ausstehender Screeningbefund hat keinen sichtbaren Status", situationContext: "Prüfung der Unterlagen des Neugeborenen.", trigger: "Im Entlassbogen ist das Screening als abgenommen, aber nicht als befundet markiert.", actions: ["Die Hebamme sucht nach einem separaten Laborblatt.", "Die Mutter prüft das Patientenportal der Klinik.", "Die Hebamme notiert eine Rückfrage für den Nachmittag."], toolsAndDocuments: ["Entlassbogen", "Patientenportal", "Hebammendokumentation"], immediateConsequence: "Für die Familie bleibt unklar, wann und über welchen Kanal der Befund eintrifft.", affectedRoles: ["Freiberufliche Hebamme", "Wöchnerin"], processPhase: "Befund / Dokumentation", problemType: "unklarer Bearbeitungsstatus", impact: "Belastung für Angehörige", currentWorkaround: "Rückfrage bei Klinik oder Kinderarztpraxis.", settingType: "Häusliche Wochenbettbetreuung", theme: "Screeningbefund", sourceReference: hospitationDemoSources.cirsTransition }),
        hospitationDemoObservation({ id: "obs-heb-3", sequence: 3, observedAt: "10:18 Uhr", title: "Gewichtsverlauf wird telefonisch an die Kinderarztpraxis übergeben", situationContext: "Abklärung einer auffälligen Gewichtsabnahme.", trigger: "Die Verlaufsmessung überschreitet den lokalen Rückfragewert.", actions: ["Die Hebamme bereitet Geburts- und aktuelle Gewichtsdaten vor.", "Sie ruft die Kinderarztpraxis an.", "Ein kurzfristiger Kontrolltermin wird vereinbart und dokumentiert."], toolsAndDocuments: ["Waage", "Hebammendokumentation", "Telefon"], communicationChannels: ["Telefon"], immediateConsequence: "Die weitere Beurteilung ist noch am selben Tag geplant.", affectedRoles: ["Freiberufliche Hebamme", "MFA", "Wöchnerin"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Häusliche Wochenbettbetreuung", theme: "Neugeborenenversorgung", sourceReference: hospitationDemoSources.cirsTransition })
      ]
    },
    {
      id: "demo-hospitation-hilfsmittel-genehmigung-kasse",
      organizationId: "demo-org-alster",
      date: "2026-07-21", start: "08:50", end: "12:05", contactName: "Versorgungsmanagement Alsterland", organizationName: "Gesundheitskasse Alsterland",
      city: "Hamburg", state: "Hamburg", sector: "Krankenkasse", observedRoles: ["Fallmanagement", "Leistungsprüfung", "Versorgungsberatung"],
      goal: "Eingang, Prüfung und Rückfrage zu einer dringlichen Hilfsmittelversorgung nach Entlassung beobachten.",
      topics: ["Hilfsmittel", "Genehmigung", "Entlassmanagement", "Versorgungsstatus"],
      summary: "Der digitale Antrag ist auffindbar, medizinische Begründung und Lieferstatus werden jedoch in getrennten Vorgängen nachgeführt.",
      observations: [
        hospitationDemoObservation({ id: "obs-kas-1", sequence: 1, observedAt: "09:03 Uhr", title: "Dringlicher Antrag wird anhand des Entlassdatums priorisiert", situationContext: "Arbeitsvorrat der Hilfsmittel-Leistungsprüfung.", trigger: "Ein Antrag enthält ein Entlassdatum innerhalb der nächsten zwei Tage.", actions: ["Das System kennzeichnet den Vorgang als dringlich.", "Die Fachkraft prüft Verordnung und Kostenvoranschlag.", "Sie übernimmt den Fall in ihre priorisierte Arbeitsliste."], toolsAndDocuments: ["Leistungssystem", "Hilfsmittelverordnung", "Kostenvoranschlag"], immediateConsequence: "Der Antrag wird vor regulären Vorgängen bearbeitet.", affectedRoles: ["Leistungsprüfung"], processPhase: "Verordnung", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Krankenkasse", theme: "Priorisierung", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-kas-2", sequence: 2, observedAt: "09:28 Uhr", title: "Versorgungsziel ist im Antrag nicht konkret beschrieben", situationContext: "Fachliche Prüfung der beantragten Mobilitätshilfe.", trigger: "Diagnose und Produktgruppe sind angegeben, das häusliche Nutzungsszenario fehlt.", actions: ["Die Fachkraft öffnet die beigefügten Klinikunterlagen.", "Sie findet keine ergänzende Funktionsbeschreibung.", "Sie erstellt eine Rückfrage an den Leistungserbringer."], toolsAndDocuments: ["Leistungssystem", "Klinikunterlagen", "Rückfragevorlage"], immediateConsequence: "Eine Entscheidung ist ohne zusätzliche Information nicht möglich.", affectedRoles: ["Leistungsprüfung", "Leistungserbringer"], processPhase: "Bedarfserhebung", problemType: "fehlende Information", impact: "Versorgungsverzögerung", currentWorkaround: "Standardisierte Rückfrage mit Fristsetzung.", settingType: "Krankenkasse", theme: "Medizinische Begründung", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-kas-3", sequence: 3, observedAt: "10:17 Uhr", title: "Genehmigung und Liefertermin haben getrennte Statusanzeigen", situationContext: "Telefonische Auskunft an eine Angehörige.", trigger: "Die Genehmigung ist erteilt, der Liefertermin aber nicht im Leistungssystem sichtbar.", actions: ["Das Fallmanagement prüft den Genehmigungsstatus.", "Es ruft den Leistungserbringer an.", "Der bestätigte Liefertermin wird als Freitextnotiz ergänzt."], toolsAndDocuments: ["Leistungssystem", "Telefon", "Freitextnotiz"], communicationChannels: ["Telefon"], immediateConsequence: "Die Angehörige erhält eine Auskunft, der Status bleibt aber nicht strukturiert auswertbar.", affectedRoles: ["Fallmanagement", "Leistungserbringer", "Angehörige"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "Medienbruch", impact: "Koordinationsaufwand", currentWorkaround: "Liefertermin als Freitext am Vorgang dokumentieren.", settingType: "Krankenkasse", theme: "Lieferstatus", sourceReference: hospitationDemoSources.gbaDischarge })
      ]
    },
    {
      id: "demo-hospitation-pflege-kim-medikation",
      organizationId: "demo-org-spreepflege",
      date: "2026-07-23", start: "06:45", end: "11:30", contactName: "Pflegekoordination Spreehafen", organizationName: "Ambulanter Pflegedienst Spreehafen",
      city: "Berlin", state: "Berlin", sector: "Pflege", observedRoles: ["Pflegefachperson", "Tourenkoordination", "Hausarztpraxis"],
      goal: "Übernahme einer Medikationsänderung in Tourenplanung und Pflegedokumentation beobachten.",
      topics: ["KIM", "Medikationsänderung", "Tourenplanung", "häusliche Krankenpflege"],
      summary: "Die sichere Nachricht erreicht die Einrichtung zentral; Zuordnung, Tourenanpassung und Rückbestätigung erfordern mehrere lokale Schritte.",
      observations: [
        hospitationDemoObservation({ id: "obs-pfl-1", sequence: 1, observedAt: "07:02 Uhr", title: "KIM-Nachricht erreicht das zentrale Postfach", situationContext: "Morgendliche Sichtung neuer ärztlicher Mitteilungen.", trigger: "Eine Hausarztpraxis sendet eine geänderte Insulindosierung.", actions: ["Die Koordination öffnet die KIM-Nachricht.", "Sie gleicht Person und Verordnungszeitraum ab.", "Sie ordnet den PDF-Anhang der digitalen Pflegeakte zu."], toolsAndDocuments: ["KIM", "PDF", "Pflegesoftware"], communicationChannels: ["KIM"], immediateConsequence: "Die Änderung ist nachvollziehbar in der Pflegeakte abgelegt.", affectedRoles: ["Tourenkoordination"], processPhase: "Befund / Dokumentation", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Ambulanter Pflegedienst", theme: "Sichere Nachricht", sourceReference: hospitationDemoSources.gematikTiAtlas }),
        hospitationDemoObservation({ id: "obs-pfl-2", sequence: 2, observedAt: "07:19 Uhr", title: "Tourenplan übernimmt die Änderung nicht automatisch", situationContext: "Vorbereitung der Frühroute.", trigger: "Die Dosierung gilt bereits für den heutigen Einsatz.", actions: ["Die Koordination öffnet parallel Tourenplan und Pflegeakte.", "Sie ändert den Leistungshinweis im Tourenplan.", "Sie markiert die Änderung für die ausführende Pflegefachperson."], toolsAndDocuments: ["Pflegesoftware", "Tourenplan"], immediateConsequence: "Dieselbe Information wird in zwei Modulen gepflegt.", affectedRoles: ["Tourenkoordination", "Pflegefachperson"], processPhase: "Interne Übergabe", problemType: "doppelte Dokumentation", impact: "Zeitaufwand", currentWorkaround: "Manuelle Übertragung und farbliche Markierung.", settingType: "Ambulanter Pflegedienst", theme: "Tourenanpassung", sourceReference: hospitationDemoSources.gematikTiAtlas }),
        hospitationDemoObservation({ id: "obs-pfl-3", sequence: 3, observedAt: "09:36 Uhr", title: "Abweichender Vorrat löst Rückfrage aus der Häuslichkeit aus", situationContext: "Medikamentengabe beim ersten Besuch nach der Änderung.", trigger: "Vor Ort liegt nur die bisherige Insulinstärke vor.", actions: ["Die Pflegefachperson prüft Verordnung und vorhandene Packung.", "Sie ruft die Koordination an.", "Die Koordination stimmt das weitere Vorgehen mit Praxis und Apotheke ab."], toolsAndDocuments: ["mobile Pflegeakte", "Telefon", "Medikamentenpackung"], communicationChannels: ["Telefon"], immediateConsequence: "Der Einsatz verlängert sich und die Folgetermine verschieben sich.", affectedRoles: ["Pflegefachperson", "Tourenkoordination", "MFA", "Apotheke"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "Rückfrage", impact: "Arbeitsfluss wird unterbrochen", currentWorkaround: "Telefonische Dreiecksabstimmung.", settingType: "Häusliche Pflege", theme: "Medikationsänderung", sourceReference: hospitationDemoSources.gbaHkp })
      ]
    },
    {
      id: "demo-hospitation-heilmittel-blankoverordnung",
      organizationId: "demo-org-ruhrtherapie",
      date: "2026-07-18", start: "12:30", end: "15:20", contactName: "Therapieteam Ruhrhöhe", organizationName: "Therapiehaus Ruhrhöhe",
      city: "Dortmund", state: "Nordrhein-Westfalen", sector: "Therapie", observedRoles: ["Physiotherapeutin", "Rezeptmanagement", "Patient"],
      goal: "Prüfung, Behandlungsplanung und Rückmeldung bei einer Blankoverordnung beobachten.",
      topics: ["Blankoverordnung", "Heilmittel", "Therapieziel", "Behandlungsplanung"],
      summary: "Die Blankoverordnung erweitert den therapeutischen Entscheidungsspielraum; Diagnosegruppe, Fristen und Verlaufsdokumentation bleiben prüfungsintensiv.",
      observations: [
        hospitationDemoObservation({ id: "obs-heil-1", sequence: 1, observedAt: "12:42 Uhr", title: "Verordnung wird vor der Terminvergabe formal geprüft", situationContext: "Anmeldung eines neuen Physiotherapiefalls.", trigger: "Der Patient reicht eine Blankoverordnung ein.", actions: ["Das Rezeptmanagement prüft Personalien und Diagnosegruppe.", "Es kontrolliert Ausstellungsdatum und Frist.", "Die Verordnung wird digital dem Fall zugeordnet."], toolsAndDocuments: ["Blankoverordnung", "Praxissoftware", "Scanner"], immediateConsequence: "Formale Rückfragen werden vor Beginn der Behandlung erkannt.", affectedRoles: ["Rezeptmanagement", "Patient"], processPhase: "Anmeldung / Aufnahme", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Heilmittelpraxis", theme: "Verordnungsprüfung", sourceReference: hospitationDemoSources.gbaHeilmittel }),
        hospitationDemoObservation({ id: "obs-heil-2", sequence: 2, observedAt: "13:18 Uhr", title: "Therapieziele werden aus Befund und Alltag abgeleitet", situationContext: "Physiotherapeutische Erstbefundung.", trigger: "Die Verordnung gibt Diagnosegruppe, aber keine konkrete Maßnahme vor.", actions: ["Die Therapeutin erhebt Funktionsbefund und Aktivitätsziele.", "Sie bespricht Prioritäten mit dem Patienten.", "Sie legt Heilmittel, Frequenz und erste Behandlungsphase fest."], toolsAndDocuments: ["Befundbogen", "Praxissoftware", "Blankoverordnung"], immediateConsequence: "Der Therapieplan wird individuell innerhalb des Verordnungsrahmens erstellt.", affectedRoles: ["Physiotherapeutin", "Patient"], processPhase: "Behandlung / Pflege", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Heilmittelpraxis", theme: "Therapieplanung", sourceReference: hospitationDemoSources.gbaHeilmittel }),
        hospitationDemoObservation({ id: "obs-heil-3", sequence: 3, observedAt: "14:37 Uhr", title: "Relevanter Vorbefund muss aus der Arztpraxis angefordert werden", situationContext: "Abschluss der Erstbefundung.", trigger: "Der Patient berichtet von aktueller Bildgebung, hat den Befund aber nicht vorliegen.", actions: ["Die Therapeutin dokumentiert die fehlende Information.", "Das Rezeptmanagement bereitet eine Einwilligung zur Befundanforderung vor.", "Die Praxis wird über den vereinbarten Kanal kontaktiert."], toolsAndDocuments: ["Praxissoftware", "Einwilligung", "Telefon"], communicationChannels: ["Telefon"], immediateConsequence: "Die Belastungsplanung bleibt bis zum Befundeingang vorläufig.", affectedRoles: ["Physiotherapeutin", "Rezeptmanagement", "MFA"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "fehlende Information", impact: "Unsicherheit", currentWorkaround: "Befundanforderung nach dokumentierter Einwilligung.", settingType: "Heilmittelpraxis", theme: "Vorbefund", sourceReference: hospitationDemoSources.gbaHeilmittel })
      ]
    },
    {
      id: "demo-hospitation-sapv-krisenplan",
      organizationId: "demo-org-elbe-sapv",
      date: "2026-07-20", start: "15:00", end: "19:10", contactName: "Palliativ-Care-Team Elbbrücken", organizationName: "SAPV-Team Elbbrücken",
      city: "Hamburg", state: "Hamburg", sector: "Ambulante Versorgung", observedRoles: ["Palliativärztin", "Palliative-Care-Pflegefachperson", "Angehörige"],
      goal: "Abstimmung von Krisenplan, Bedarfsmedikation und Erreichbarkeit im häuslichen Umfeld beobachten.",
      topics: ["SAPV", "Krisenplan", "Bedarfsmedikation", "24/7-Erreichbarkeit"],
      summary: "Der gemeinsame Hausbesuch führt medizinische und pflegerische Perspektive zusammen; Planstände bei Familie, Hausarzt und Team müssen aktiv synchronisiert werden.",
      observations: [
        hospitationDemoObservation({ id: "obs-sapv-1", sequence: 1, observedAt: "15:24 Uhr", title: "Krisenplan wird gemeinsam mit der Familie durchgesprochen", situationContext: "Geplanter Hausbesuch bei zunehmender Symptomlast.", trigger: "Die Angehörige berichtet von nächtlicher Atemnot.", actions: ["Die Pflegefachperson erhebt den Verlauf seit dem letzten Besuch.", "Die Ärztin erläutert abgestufte Maßnahmen.", "Die Angehörige wiederholt Kontaktweg und erste Handlung in eigenen Worten."], toolsAndDocuments: ["Krisenplan", "SAPV-Dokumentation", "Medikationsplan"], immediateConsequence: "Rollen und Erreichbarkeit für eine erneute Krise sind geklärt.", affectedRoles: ["Palliativärztin", "Palliative-Care-Pflegefachperson", "Angehörige"], processPhase: "Kommunikation mit Patient:innen", problemType: "positives Muster / Best Practice", impact: "Sicherheitsgefühl steigt", settingType: "Häusliche Palliativversorgung", theme: "Krisenkommunikation", sourceReference: hospitationDemoSources.gbaSapv }),
        hospitationDemoObservation({ id: "obs-sapv-2", sequence: 2, observedAt: "16:02 Uhr", title: "Bedarfsmedikation hat zwei unterschiedliche Planstände", situationContext: "Abgleich der vorhandenen Arzneimittel mit der Teamdokumentation.", trigger: "Auf dem Papierplan der Familie fehlt eine am Vortag ergänzte Bedarfsdosis.", actions: ["Die Ärztin prüft die elektronische Verlaufsdokumentation.", "Die Pflegefachperson vergleicht Packungen und Papierplan.", "Ein aktualisierter Plan wird ausgedruckt und der alte sichtbar entwertet."], toolsAndDocuments: ["SAPV-Dokumentation", "Papier-Medikationsplan", "Arzneimittelpackungen"], immediateConsequence: "Der aktuelle Plan ist vor Ort eindeutig, musste aber manuell synchronisiert werden.", affectedRoles: ["Palliativärztin", "Pflegefachperson", "Angehörige"], processPhase: "Verordnung", problemType: "widersprüchliche Datenstände", impact: "Fehleranfälligkeit", currentWorkaround: "Ausdruck ersetzen und alten Plan entwerten.", settingType: "Häusliche Palliativversorgung", theme: "Bedarfsmedikation", sourceReference: hospitationDemoSources.gbaSapv }),
        hospitationDemoObservation({ id: "obs-sapv-3", sequence: 3, observedAt: "17:11 Uhr", title: "Aktualisierter Plan wird an Hausarzt und Pflegedienst verteilt", situationContext: "Nachbereitung des Hausbesuchs.", trigger: "Die Medikationsanpassung ist dokumentiert und freigegeben.", actions: ["Die Koordination erstellt eine kurze Zusammenfassung.", "Sie sendet den aktualisierten Plan an die beteiligten Einrichtungen.", "Der Versand und die erwartete Rückmeldung werden in der Fallakte markiert."], toolsAndDocuments: ["SAPV-Dokumentation", "KIM", "Medikationsplan"], communicationChannels: ["KIM"], immediateConsequence: "Alle professionell Beteiligten erhalten denselben Planstand.", affectedRoles: ["SAPV-Koordination", "Hausarztpraxis", "Pflegedienst"], processPhase: "Kommunikation mit anderen Einrichtungen", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "SAPV-Team", theme: "Sektorübergreifende Abstimmung", sourceReference: hospitationDemoSources.gbaSapv })
      ]
    },
    {
      id: "demo-hospitation-sozialdienst-rehaantrag",
      organizationId: "demo-org-elbesozial",
      date: "2026-07-24", start: "09:20", end: "12:35", contactName: "Sozialberatung Elbtor", organizationName: "Sozialberatung Elbtor",
      city: "Hamburg", state: "Hamburg", sector: "Sozialdienst", observedRoles: ["Sozialberaterin", "Versicherter", "Reha-Sachbearbeitung"],
      goal: "Bedarfsklärung und Zusammenstellung eines Rehabilitationsantrags nach längerer Erkrankung beobachten.",
      topics: ["Reha-Antrag", "Teilhabe", "Befundunterlagen", "Kostenträger"],
      summary: "Eine Checkliste strukturiert die Beratung; Zuständigkeit und Vollständigkeit des Antrags hängen dennoch von Informationen mehrerer Stellen ab.",
      observations: [
        hospitationDemoObservation({ id: "obs-soz-1", sequence: 1, observedAt: "09:34 Uhr", title: "Checkliste macht fehlende Unterlagen früh sichtbar", situationContext: "Erstberatung zu einer medizinischen Rehabilitation.", trigger: "Der Versicherte bringt Arztbrief, Medikamentenplan und Arbeitsunfähigkeitszeiten mit.", actions: ["Die Sozialberaterin ordnet die Unterlagen nach einer Checkliste.", "Sie markiert einen fehlenden aktuellen Befundbericht.", "Sie hält fest, wer das Dokument anfordern soll."], toolsAndDocuments: ["Beratungscheckliste", "Arztbrief", "Medikationsplan"], immediateConsequence: "Der offene Unterlagenschritt ist vor Antragstellung geklärt.", affectedRoles: ["Sozialberaterin", "Versicherter"], processPhase: "Bedarfserhebung", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Sozialberatungsstelle", theme: "Antragsvorbereitung", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-soz-2", sequence: 2, observedAt: "10:06 Uhr", title: "Zuständiger Kostenträger ist zunächst offen", situationContext: "Klärung der versicherungsrechtlichen Ausgangslage.", trigger: "Versicherungszeiten und aktueller Erwerbsstatus führen zu zwei möglichen Kostenträgern.", actions: ["Die Beraterin prüft die vorliegenden Nachweise.", "Sie erläutert dem Versicherten die offene Zuständigkeitsfrage.", "Sie stellt eine Vorabanfrage an die Reha-Sachbearbeitung."], toolsAndDocuments: ["Versicherungsverlauf", "Beratungssoftware", "Anfrageformular"], communicationChannels: ["Telefon"], immediateConsequence: "Der Antrag wird noch nicht versendet.", affectedRoles: ["Sozialberaterin", "Versicherter", "Reha-Sachbearbeitung"], processPhase: "Genehmigung / Abrechnung", problemType: "offene Frage", impact: "Frust und Belastung", currentWorkaround: "Vorabanfrage vor formaler Antragstellung.", settingType: "Sozialberatungsstelle", theme: "Kostenträgerklärung", sourceReference: hospitationDemoSources.gbaDischarge }),
        hospitationDemoObservation({ id: "obs-soz-3", sequence: 3, observedAt: "11:22 Uhr", title: "Befundanforderung wird mit Einwilligung vorbereitet", situationContext: "Abschluss der Beratung.", trigger: "Der aktuelle fachärztliche Befundbericht fehlt weiterhin.", actions: ["Der Versicherte unterschreibt eine zweckgebundene Einwilligung.", "Die Beraterin erstellt die Befundanforderung.", "Eine Wiedervorlage bis zum erwarteten Eingang wird gesetzt."], toolsAndDocuments: ["Einwilligung", "Befundanforderung", "Wiedervorlage"], immediateConsequence: "Der nächste Schritt hat eine verantwortliche Person und ein Fälligkeitsdatum.", affectedRoles: ["Sozialberaterin", "Versicherter", "Facharztpraxis"], processPhase: "Nachsorge", problemType: "positives Muster / Best Practice", impact: "Ablauf funktioniert gut", settingType: "Sozialberatungsstelle", theme: "Verbindlicher Folgeschritt", sourceReference: hospitationDemoSources.gbaDischarge })
      ]
    }
  ];

  const twoObservationHospitationIds = new Set([
    "demo-hospitation-medikationsabgleich-entlassung",
    "demo-hospitation-erezept-signatur",
    "demo-hospitation-ueberweisung-vorbefunde",
    "demo-hospitation-dmp-telemonitoring",
    "demo-hospitation-patienteninformation-entlassung"
  ]);
  const additionalObservationsByHospitationId = {
    "demo-hospitation-labor-kritischer-befund": hospitationDemoObservation({
      id: "obs-lab-4",
      sequence: 4,
      observedAt: "10:42 Uhr",
      title: "Rückrufannahme wird mit Name und Zeitpunkt bestätigt",
      situationContext: "Abschluss der Meldung eines kritischen Laborwerts.",
      trigger: "Die behandelnde Ärztin bestätigt die Entgegennahme des Befunds.",
      actions: ["Das Einsendermanagement erfasst Name und Funktion der annehmenden Person.", "Der Zeitpunkt wird im LIS protokolliert.", "Die Rückrufaufgabe wird erst danach geschlossen."],
      toolsAndDocuments: ["LIS", "Rückrufprotokoll"],
      communicationChannels: ["Telefon"],
      immediateConsequence: "Die erfolgte Übergabe bleibt für die Qualitätssicherung nachvollziehbar.",
      affectedRoles: ["Einsendermanagement", "behandelnde Ärztin"],
      processPhase: "Befund / Dokumentation",
      problemType: "positives Muster / Best Practice",
      impact: "Ablauf funktioniert gut",
      settingType: "Medizinisches Labor",
      theme: "Kritischer Befund",
      sourceReference: hospitationDemoSources.apsAmts
    }),
    "demo-hospitation-demis-fallermittlung": hospitationDemoObservation({
      id: "obs-dem-4",
      sequence: 4,
      observedAt: "11:35 Uhr",
      title: "Dublettenprüfung benötigt den Vergleich zweier Meldestände",
      situationContext: "Qualitätssicherung vor Abschluss der Fallzuordnung.",
      trigger: "Zu derselben Person liegen eine Labormeldung und eine ergänzende Arztmeldung vor.",
      actions: ["Die Sachbearbeitung öffnet beide DEMIS-Vorgänge.", "Sie vergleicht Meldekategorie und Probendatum.", "Die zusammengehörigen Vorgänge werden manuell verknüpft."],
      toolsAndDocuments: ["DEMIS", "Fallmanagement"],
      communicationChannels: ["DEMIS"],
      immediateConsequence: "Der Fall wird korrekt gebündelt, die Prüfung bindet zusätzliche Bearbeitungszeit.",
      affectedRoles: ["Sachbearbeitung Infektionsschutz"],
      processPhase: "Befund / Dokumentation",
      problemType: "doppelte Dokumentation",
      impact: "Zeitaufwand",
      currentWorkaround: "Manueller Vergleich anhand von Person, Erreger und Probendatum.",
      settingType: "Gesundheitsamt",
      theme: "Dublettenprüfung",
      sourceReference: hospitationDemoSources.rkiDemis
    }),
    "demo-hospitation-rettungsdienst-klinikuebergabe": hospitationDemoObservation({
      id: "obs-rd-4",
      sequence: 4,
      observedAt: "10:58 Uhr",
      title: "Einsatzbereitschaft hängt vom manuellen Materialabgleich ab",
      situationContext: "Wiederherstellung der Einsatzbereitschaft nach der Klinikübergabe.",
      trigger: "Verbrauchsmaterial wurde im Einsatz eingesetzt und muss ergänzt werden.",
      actions: ["Die Besatzung gleicht die Fahrzeugcheckliste mit den Fächern ab.", "Fehlendes Material wird aus dem Lager ergänzt.", "Die Einsatzbereitschaft wird anschließend in der Leitstelle bestätigt."],
      toolsAndDocuments: ["Fahrzeugcheckliste", "Materiallager", "Leitstellensystem"],
      communicationChannels: ["Digitalfunk"],
      immediateConsequence: "Das Fahrzeug bleibt bis zum abgeschlossenen Abgleich vorübergehend nicht disponierbar.",
      affectedRoles: ["Notfallsanitäter:in", "Leitstelle"],
      processPhase: "Nachbereitung",
      problemType: "Workaround",
      impact: "Prozessverzögerung",
      currentWorkaround: "Manuelle Vollständigkeitskontrolle nach jedem Transport.",
      settingType: "Rettungswache",
      theme: "Einsatzbereitschaft",
      sourceReference: hospitationDemoSources.apsAmts
    }),
    "demo-hospitation-pflege-kim-medikation": hospitationDemoObservation({
      id: "obs-pfl-4",
      sequence: 4,
      observedAt: "10:22 Uhr",
      title: "Rückbestätigung wird zusätzlich als Freitext dokumentiert",
      situationContext: "Nachbereitung der abgestimmten Medikationsänderung.",
      trigger: "Praxis und Apotheke bestätigen das weitere Vorgehen telefonisch.",
      actions: ["Die Koordination ergänzt die Pflegeakte.", "Sie überträgt dieselbe Information in die Tourennotiz.", "Die zuständige Pflegefachperson wird per interner Nachricht informiert."],
      toolsAndDocuments: ["Pflegeakte", "Tourenplan", "interne Nachricht"],
      communicationChannels: ["Telefon", "interne Nachricht"],
      immediateConsequence: "Die Bestätigung ist sichtbar, muss aber in zwei Modulen konsistent gehalten werden.",
      affectedRoles: ["Tourenkoordination", "Pflegefachperson"],
      processPhase: "Befund / Dokumentation",
      problemType: "doppelte Dokumentation",
      impact: "Zeitaufwand",
      currentWorkaround: "Parallele Freitextnotiz mit identischem Zeitstempel.",
      settingType: "Ambulanter Pflegedienst",
      theme: "Rückbestätigung",
      sourceReference: hospitationDemoSources.gbaHkp
    }),
    "demo-hospitation-sapv-krisenplan": hospitationDemoObservation({
      id: "obs-sapv-4",
      sequence: 4,
      observedAt: "18:26 Uhr",
      title: "Erreichbarkeitsnummer steht auf zwei Planversionen",
      situationContext: "Abschlusskontrolle der Unterlagen im Haushalt.",
      trigger: "Neben dem aktualisierten Krisenplan liegt ein älteres Merkblatt.",
      actions: ["Die Pflegefachperson vergleicht beide Telefonnummern.", "Sie bestätigt die aktuell gültige Rufnummer mit der Koordination.", "Das ältere Merkblatt wird entfernt."],
      toolsAndDocuments: ["Krisenplan", "Erreichbarkeitsmerkblatt", "SAPV-Dokumentation"],
      communicationChannels: ["Telefon"],
      immediateConsequence: "Die Familie verfügt wieder über einen eindeutigen Kontaktweg.",
      affectedRoles: ["Palliative-Care-Pflegefachperson", "SAPV-Koordination", "Angehörige"],
      processPhase: "Kommunikation mit Patient:innen",
      problemType: "fehlende Information",
      impact: "Fehleranfälligkeit",
      currentWorkaround: "Alte Papierfassung sichtbar aus dem Haushalt entfernen.",
      settingType: "Häusliche Palliativversorgung",
      theme: "24/7-Erreichbarkeit",
      sourceReference: hospitationDemoSources.gbaSapv
    })
  };
  hospitationDefinitions.forEach((definition) => {
    if (twoObservationHospitationIds.has(definition.id)) definition.observations = definition.observations.slice(0, 2);
    const additionalObservation = additionalObservationsByHospitationId[definition.id];
    if (additionalObservation) definition.observations.push(additionalObservation);
    definition.observations.forEach((observation, index) => {
      observation.sequence = index + 1;
    });
  });

  const hospitations = hospitationDefinitions.map((definition, index) => {
    const ownerId = ownerIds[index % ownerIds.length] || ownerIds[0] || "";
    const contactSector = {
      "Ambulante Versorgung": "Praxis",
      "Ambulante Facharztversorgung": "Praxis",
      "Homecare und Hilfsmittel": "Hilfsmittel",
      "Psychosoziale Versorgung": "Therapie"
    }[definition.sector] || definition.sector;
    const sectorContacts = contacts.filter((entry) => entry.category === contactSector && entry.status !== "archived");
    const preferredOrganization = organizations.find((entry) => entry.id === definition.organizationId);
    const preferredContacts = preferredOrganization
      ? contacts.filter((entry) => entry.organizationId === preferredOrganization.id && entry.status !== "archived")
      : [];
    const linkedContact = contacts.find((entry) => entry.id === definition.contactId)
      || preferredContacts[index % preferredContacts.length]
      || sectorContacts[index % sectorContacts.length]
      || contacts[index % contacts.length];
    const linkedOrganization = preferredOrganization
      || organizations.find((entry) => entry.id === linkedContact.organizationId)
      || organizations[index % organizations.length];
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
      requestNote: "Rein synthetische Hospitation. Personen und Organisationen sind fiktiv; offizielle Quellen belegen ausschließlich den Prozesskontext.",
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
  const plannedHospitationOrganizationIds = [
    "demo-org-nordstadt",
    "demo-org-mainnetz",
    "demo-org-elbufer",
    "demo-org-rheinapotheke",
    "demo-org-mosellabor"
  ];
  plannedHospitationStatuses.forEach((status, index) => {
    const linkedOrganization = organizations.find((entry) => entry.id === plannedHospitationOrganizationIds[index])
      || organizations[index];
    const linkedContact = contacts.find((entry) => entry.organizationId === linkedOrganization.id && entry.status !== "archived")
      || contacts[40 + index];
    const startsAt = status === "Durchgeführt"
      ? new Date(Date.UTC(2026, 6, 17, 11, 30, 0))
      : new Date(Date.UTC(2026, 7 + index, 6 + index * 3, 8 + index, 30, 0));
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
      observedRoles: [linkedContact.contactRole, "Fachteam Versorgungsbeobachtung"],
      goal: [
        "ePA-Medikationsübersicht im Übergang zwischen Praxis und Apotheke beobachten.",
        "Einsatzmöglichkeiten des TI-Messengers für kurze sektorenübergreifende Rückfragen vorbereiten.",
        "Befundübergabe über KIM und strukturierte Krankenhausdaten nachvollziehen.",
        "Arbeitsablauf rund um E-Rezept und Medikationsabgleich dokumentieren.",
        "Rückrufweg für zeitkritische Laborbefunde und die dokumentierte Empfangsbestätigung beobachten."
      ][index],
      topics: ["Hospitation", ["ePA", "TI-Messenger", "KIM", "E-Rezept", "kritischer Laborbefund"][index]],
      requestNote: status === "Abgesagt"
        ? "Realitätsnahes synthetisches Szenario; der Termin wurde wegen kurzfristiger Personalbindung im Labor abgesagt."
        : "Realitätsnahes synthetisches Szenario; keine reale Einrichtung oder Feldbeobachtung.",
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
      evidenceNote: "Synthetische Übungsbewertung auf Basis der dokumentierten Beobachtung.",
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
    problem: "Der beobachtete synthetische Ablauf zeigt einen wiederkehrenden manuellen Zwischenschritt mit unklarer Zuständigkeit.",
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
    ["demo-format-ti-messenger", "Fachgespräch TI-Messenger: kurze Rückfragen sektorenübergreifend klären", "Fachgespräch", "2026-09-15T11:00:00.000Z", "2026-09-15T13:00:00.000Z", "Online", "Planung", "Rückfragen zu Medikation, Befunden und Übergaben anhand realitätsnaher synthetischer Szenarien vergleichen."],
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
        notes: "Synthetische Teilnahmebeziehung für die öffentliche Beispieldarstellung.",
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
      notes: "Synthetisches Format, fachlicher Themenstand Juli 2026; keine reale gematik-Veranstaltung.",
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
      notes: "Synthetisches Terminangebot für Status-, Kalender- und Buchungsansichten.",
      createdAt: now,
      updatedAt: now
    };
  });

  const stakeholderTypes = [
    ["kv", "Vertragsärztliche Versorgungsvereinigungen"],
    ["health-insurance", "Krankenkassen"],
    ["patient-associations", "Patientenorganisationen"],
    ["hospital-associations", "Krankenhausgesellschaften"],
    ["physician-associations", "Ärztliche Berufsverbände"],
    ["press", "Presse und Gesundheitsmedien"]
  ].map(([id, label], index) => ({
    id,
    key: id,
    value: id,
    label,
    description: id === "press"
      ? "Synthetische Presse- und Medienkontakte für die öffentliche Beispieldarstellung."
      : "Synthetischer Stakeholdertyp für die öffentliche Beispieldarstellung.",
    sortOrder: (index + 1) * 10,
    status: "active"
  }));
  const stakeholderTypePlans = [
    ["kv", "Versorgungsregion", 6],
    ["health-insurance", "Gesundheitskasse", 5],
    ["patient-associations", "Patientennetz", 9],
    ["hospital-associations", "Klinikgesellschaft", 5],
    ["physician-associations", "Berufsverband", 5]
  ];
  const stakeholderMemberCounts = {
    kv: [5100, 4800, 9300, 24500, 13800, 31000],
    "health-insurance": [420000, 850000, 260000, 180000, 310000],
    "patient-associations": [1200, 3200, 2200, 850, 4100, 1600, 2700, 6400, 1900],
    "hospital-associations": [78, 54, 96, 41, 63],
    "physician-associations": [3600, 2400, 5800, 1900, 4200]
  };
  const patientAssociationTopics = ["Onkologie", "Herz-Kreislauf", "Neurologie", "Psychische Gesundheit", "Stoffwechsel", "Seltene Erkrankungen", "Pädiatrie", "Teilhabe", "Pflege"];
  const physicianAssociationTopics = ["Allgemeinmedizin", "Pädiatrie", "Innere Medizin", "Psychotherapie", "Radiologie"];
  const coreStakeholderOrganizations = stakeholderTypePlans.flatMap(([typeId, label, count], typeIndex) =>
    Array.from({ length: count }, (_, index) => {
      const location = organizations[(typeIndex * 6 + index) % organizations.length];
      const indication = patientAssociationTopics[index] || "Versorgung";
      const organizationName = {
        kv: `Vertragsärztliche Versorgungsvereinigung ${location.city}`,
        "health-insurance": `Gesundheitskasse ${location.city} und Umland`,
        "patient-associations": `Patientennetz ${indication} ${location.city}`,
        "hospital-associations": `Regionale Krankenhausgesellschaft ${location.city}`,
        "physician-associations": `Berufsverband ${physicianAssociationTopics[index] || "Versorgungsmedizin"}`
      }[typeId] || `${label} ${location.city}`;
      const memberCount = stakeholderMemberCounts[typeId]?.[index] || 0;
      return {
        id: `demo-stakeholder-org-${typeId}-${String(index + 1).padStart(2, "0")}`,
        stakeholderTypeId: typeId,
        stakeholderType: typeId,
        name: organizationName,
        normalizedName: organizationName.toLowerCase(),
        organizationType: label,
        sector: typeId === "patient-associations" ? indication : "Sektorübergreifend",
        postalCode: location.postalCode,
        city: location.city,
        state: location.state,
        lat: location.lat,
        lon: location.lon,
        website: demoReservedUrl(`stakeholder-${typeId}-${String(index + 1).padStart(2, "0")}`),
        email: `stakeholder-${typeId}-${String(index + 1).padStart(2, "0")}@example.invalid`,
        phone: "",
        memberCount,
        memberCountLabel: new Intl.NumberFormat("de-DE").format(memberCount),
        memberCountSourceUrl: demoReservedUrl(`stakeholder-quelle-${typeId}-${String(index + 1).padStart(2, "0")}`),
        memberCountSourceLabel: "Synthetische Größenordnung",
        memberCountScope: "synthetische Größenordnung",
        notes: "Fiktive Stakeholderorganisation; keine reale Institution oder Mitgliederzahl.",
        source: "Synthetischer Versorgungsdatensatz",
        status: "active",
        createdAt: now,
        updatedAt: now
      };
    })
  );
  const pressOrganizationPlans = [
    ["Redaktion Gesundheitsfenster", "Fachmedium", "Digital Health"],
    ["Nachrichtenbüro Versorgungsspiegel", "Nachrichtenagentur", "Gesundheitssystem"],
    ["Magazin Digitalmedizin-Puls", "Digital-Health-Magazin", "Digital Health"],
    ["Hauptstadtbrief Gesundheitspfad", "Politikredaktion", "Gesundheitspolitik"],
    ["Wirtschaftsredaktion Gesundheitskurve", "Wirtschaftsredaktion", "Gesundheitswirtschaft"],
    ["Regionalredaktion Versorgungsbogen", "Regionalredaktion", "Regionale Versorgung"],
    ["Audio-Redaktion Gesundheitstakt", "Audio-Redaktion", "Gesundheitskommunikation"],
    ["Fachmedium Interop-Lotse", "Technologie-Fachmedium", "Interoperabilität"],
    ["Politikredaktion Systemblick", "Hauptstadtredaktion", "Gesundheitspolitik"],
    ["Pressestelle Gesundheitsdialog", "Institutionelle Pressestelle", "Gesundheitssystem"],
    ["Pressestelle Versorgungslabor", "Institutionelle Pressestelle", "Digitalisierung"],
    ["Fachverlag Praxiswandel", "Fachverlag", "Versorgungsprozesse"]
  ];
  const pressOrganizationTopics = [
    ["Digital Health", "Gesundheitssystem", "gematik"],
    ["Gesundheitspolitik", "Gesundheitssystem", "Versorgungsdaten"],
    ["Digital Health", "ePA", "Telematikinfrastruktur"],
    ["Gesundheitspolitik", "gematik", "Gesetzgebung"],
    ["Gesundheitswirtschaft", "Digital Health", "Krankenkassen"],
    ["Regionale Versorgung", "Krankenhäuser", "Pflege"],
    ["Patientenperspektive", "Digital Health", "Versorgungsprozesse"],
    ["Interoperabilität", "FHIR", "gematik"],
    ["Gesundheitspolitik", "Bundestag", "gematik"],
    ["Pressearbeit", "Gesundheitssystem", "Versorgungspolitik"],
    ["Pressearbeit", "Digitalisierung", "Telematikinfrastruktur"],
    ["Fachpublikationen", "ePA", "Gesundheitssystem"]
  ];
  const pressOrganizations = pressOrganizationPlans.map(([name, organizationType, sector], index) => {
    const location = organizations[(index * 4 + 2) % organizations.length];
    const number = String(index + 1).padStart(2, "0");
    return {
      id: `demo-stakeholder-org-press-${number}`,
      stakeholderTypeId: "press",
      stakeholderType: "press",
      name,
      normalizedName: name.toLowerCase(),
      organizationType,
      sector,
      postalCode: location.postalCode,
      city: location.city,
      state: location.state,
      lat: location.lat,
      lon: location.lon,
      website: demoReservedUrl(`presse-organisation-${number}`),
      email: `redaktion-${number}@presse.example.invalid`,
      phone: "",
      memberCount: null,
      memberCountLabel: "",
      memberCountSourceUrl: "",
      memberCountSourceLabel: "",
      memberCountScope: "",
      notes: "Fiktive Presseorganisation; Name, Schwerpunkt und Kontaktdaten sind vollständig synthetisch.",
      source: "Synthetischer Presse-Demodatensatz · Stand 25.07.2026",
      status: "active",
      createdAt: now,
      updatedAt: now
    };
  });
  const stakeholderOrganizations = [...coreStakeholderOrganizations, ...pressOrganizations];
  const coreStakeholderPeople = Array.from({ length: 45 }, (_, index) => {
    const organization = coreStakeholderOrganizations[index % coreStakeholderOrganizations.length];
    const rolesByType = {
      kv: ["Versorgungsreferent:in", "Gremienkoordination", "Digitalisierungsreferent:in"],
      "health-insurance": ["Versorgungsmanagement", "Vertragsreferent:in", "Pflegeberatung"],
      "patient-associations": ["Patientenvertretung", "Beratungskoordination", "Gremienvertretung"],
      "hospital-associations": ["Versorgungsreferent:in", "Qualitätsmanagement", "Digitalisierungskoordination"],
      "physician-associations": ["Fachreferent:in", "Gremienarbeit", "Versorgungspolitik"]
    };
    const role = (rolesByType[organization.stakeholderTypeId] || ["Versorgungsreferent:in"])[index % 3];
    return {
      id: `demo-stakeholder-person-${String(index + 1).padStart(2, "0")}`,
      stakeholderTypeId: organization.stakeholderTypeId,
      stakeholderType: organization.stakeholderTypeId,
      organizationId: organization.id,
      organization: organization.name,
      name: fictionalPersonName(index, { offset: 160 }),
      role,
      contactRole: role,
      committee: index % 3 === 0 ? "Fachausschuss Versorgungsprozesse" : "",
      city: organization.city,
      state: organization.state,
      lat: organization.lat,
      lon: organization.lon,
      email: `stakeholder-person-${String(index + 1).padStart(2, "0")}@example.invalid`,
      themes: ["ePA", "Versorgungsprozesse", index % 2 ? "Interoperabilität" : "Patientenperspektive"],
      note: "Fiktive Ansprechperson für Filter-, Karten- und Profilansichten.",
      source: "Synthetischer Versorgungsdatensatz",
      status: "active",
      createdAt: now,
      updatedAt: now
    };
  });
  const pressRolePlans = [
    ["Chefredakteur:in Gesundheit", "Redakteur:in Digital Health", "Redakteur:in Gesundheitssystem"],
    ["Redaktionsleitung Gesundheit", "Korrespondent:in Gesundheitspolitik"],
    ["Redaktionsleitung Digital Health", "Fachredakteur:in ePA", "Redakteur:in Telematikinfrastruktur"],
    ["Ressortleitung Gesundheitspolitik", "Parlamentskorrespondent:in Gesundheit"],
    ["Ressortleitung Gesundheitswirtschaft", "Redakteur:in Krankenkassen"],
    ["Redaktionsleitung Regionale Versorgung", "Redakteur:in Krankenhaus und Pflege"],
    ["Chef:in vom Dienst Audio", "Podcast-Redakteur:in Gesundheit"],
    ["Leitende:r Fachredakteur:in Gesundheits-IT", "Datenjournalist:in Interoperabilität"],
    ["Büroleitung Gesundheitspolitik", "Redakteur:in gematik und Digitalisierung"],
    ["Pressesprecher:in", "Referent:in Presse und Medien"],
    ["Leitung Kommunikation", "Pressesprecher:in Digitalisierung"],
    ["Programmleitung Gesundheit", "Fachredakteur:in Versorgungsprozesse"]
  ];
  const pressPeople = pressRolePlans.flatMap((roles, organizationIndex) => {
    const organization = pressOrganizations[organizationIndex];
    return roles.map((role, roleIndex) => {
      const index = pressRolePlans
        .slice(0, organizationIndex)
        .reduce((count, organizationRoles) => count + organizationRoles.length, 0) + roleIndex;
      const number = String(index + 1).padStart(2, "0");
      return {
        id: `demo-stakeholder-person-press-${number}`,
        stakeholderTypeId: "press",
        stakeholderType: "press",
        organizationId: organization.id,
        organization: organization.name,
        name: fictionalPersonName(index, { offset: 230 }),
        role,
        contactRole: role,
        committee: "",
        city: organization.city,
        state: organization.state,
        lat: organization.lat,
        lon: organization.lon,
        email: `pressekontakt-${number}@presse.example.invalid`,
        phone: "",
        linkedin: "",
        themes: pressOrganizationTopics[organizationIndex],
        note: "Fiktive berufliche Kontaktperson für Suche, Filter, Sortierung und Detailansicht der Presse-Seite.",
        source: "Synthetische Redaktions- oder Presseseite · Stand 25.07.2026",
        url: demoReservedUrl(`pressekontakt-${number}`, "/profil"),
        status: "active",
        createdAt: now,
        updatedAt: now
      };
    });
  });
  const stakeholderPeople = [...coreStakeholderPeople, ...pressPeople];

  const expertGroupNames = [
    "Ambulante Primärsysteme",
    "Klinische Systeme und ISiK",
    "Apotheken und Arzneimittel",
    "Pflege und Rehabilitation",
    "Interoperabilität und FHIR",
    "TI-Betrieb und Identitäten"
  ];
  const expertGroups = expertGroupNames.map((name, index) => ({ id: `demo-expert-group-${String(index + 1).padStart(2, "0")}`, name, description: "Synthetische Expertengruppe.", sortOrder: (index + 1) * 10, status: "active" }));
  const expertOrganizations = Array.from({ length: 18 }, (_, index) => {
    const group = expertGroups[index % expertGroups.length];
    const location = organizations[(index * 5) % organizations.length];
    const regionalQualifier = ["Nord", "Mitte", "Süd"][Math.floor(index / expertGroups.length)] || "Region";
    const organizationName = `Fachverbund ${location.city} ${regionalQualifier} · ${group.name}`;
    return {
      id: `demo-expert-org-${String(index + 1).padStart(2, "0")}`,
      name: organizationName,
      normalizedName: organizationName.toLowerCase(),
      groupId: group.id,
      group: group.name,
      groupName: group.name,
      organizationType: "Synthetische Fachorganisation",
      city: location.city,
      state: location.state,
      website: demoReservedUrl(`demo-expert-org-${String(index + 1).padStart(2, "0")}`),
      email: `expert-org-${String(index + 1).padStart(2, "0")}@example.invalid`,
      notes: "Fiktive Organisation für Expert:innen-, Dubletten- und Verknüpfungsansichten.",
      source: "Synthetischer Versorgungsdatensatz",
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
      name: fictionalPersonName(index, { offset: 220, doctor: index % 6 === 0 }),
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
      themes: ["ePA", "TI", group.name],
      note: "Fiktiver Expertenkontakt; alle Angaben sind synthetisch.",
      source: "Synthetischer Versorgungsdatensatz",
      status: "active",
      createdAt: now,
      updatedAt: now
    };
  });
  const expertEntityLinks = Array.from({ length: 8 }, (_, index) => {
    const shared = {
      id: `demo-expert-link-${String(index + 1).padStart(2, "0")}`,
      matchReason: "Synthetische, manuell bestätigte Querverknüpfung.",
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
      occurredAt: categoryKey === "consent"
        ? contactEntry.mitmachenConsentEffectiveAt
        : new Date(Date.UTC(2026, 6, 19 - (index % 18), 8 + (index % 9), (index * 7) % 60)).toISOString(),
      originKey: index % 9 === 0 ? "data_import" : "manual",
      originRef: "synthetic-pages",
      references: [{ type: objectType, id: objectId, label: isHospitation ? hospitation.goal : isFormat ? format.title : contactEntry.name }],
      changes: [{
        fieldName: categoryKey === "ownership"
          ? "owner_ids"
          : categoryKey === "consent"
            ? "mitmachen_consent_status"
            : "status",
        oldValue: categoryKey === "consent" ? "not_requested" : "Ausgangswert",
        newValue: categoryKey === "consent" ? "granted" : "Aktualisierter Wert"
      }],
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
      entityLabel: definition.entityLabel,
      occurredAt: new Date(Date.UTC(2026, 6, 19 - index, 9, index * 3)).toISOString(),
      unread: index < 7,
      readAt: index < 7 ? "" : new Date(Date.UTC(2026, 6, 19 - index, 10, 0)).toISOString(),
      createdAt: now
    };
  });

  const registrationProfessionalGroups = {
    Praxis: "Ärztin / Arzt",
    Apotheke: "Apotheker:in",
    Pflege: "Pflegefachperson",
    Krankenhaus: "Versorgungskoordination",
    Therapie: "Therapeut:in",
    Reha: "Reha-Koordination",
    Labor: "Medizinische Technolog:in",
    Rettungsdienst: "Notfallsanitäter:in",
    Hebammen: "Hebamme",
    "ÖGD": "Fachkraft im öffentlichen Gesundheitsdienst"
  };
  const registrations = Array.from({ length: 10 }, (_, index) => {
    const location = organizations[index];
    const statuses = ["neu", "in_pruefung", "uebernommen", "verknuepft", "abgelehnt"];
    const personName = fictionalPersonName(index, { offset: 280 });
    const [firstName, ...lastNameParts] = personName.split(" ");
    const lastName = lastNameParts.join(" ");
    const professionalGroup = registrationProfessionalGroups[location.sector] || "Versorgungskoordination";
    const submittedAt = new Date(Date.UTC(2026, 6, 18 - index, 8 + (index % 4), 0)).toISOString();
    const consentProcessingAcceptedAt = new Date(new Date(submittedAt).getTime() - 5 * 60 * 1000).toISOString();
    const consentContactAcceptedAt = index % 3 === 2 ? "" : consentProcessingAcceptedAt;
    return {
      id: `demo-registration-${String(index + 1).padStart(3, "0")}`,
      submissionId: `demo-submission-${String(index + 1).padStart(3, "0")}`,
      submission_id: `demo-submission-${String(index + 1).padStart(3, "0")}`,
      submittedAt,
      submitted_at: submittedAt,
      status: statuses[index % statuses.length],
      email: `registrierung-${String(index + 1).padStart(2, "0")}@example.invalid`,
      salutation: index % 2 ? "Herr" : "Frau",
      title: ["Praxis", "Krankenhaus", "Labor"].includes(location.sector) && index % 4 === 0 ? "Dr." : "",
      firstName,
      first_name: firstName,
      lastName,
      last_name: lastName,
      organization: location.name,
      sector: location.sector,
      onboardingStage: "profile_complete",
      onboarding_stage: "profile_complete",
      postalCode: location.postalCode,
      postal_code: location.postalCode,
      city: location.city,
      federalState: location.state,
      federal_state: location.state,
      professionalGroup,
      professional_group: professionalGroup,
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
      message: "Rein synthetischer Registrierungseingang für die öffentliche Funktionsdarstellung.",
      consentProcessingAcceptedAt,
      consent_processing_accepted_at: consentProcessingAcceptedAt,
      consentProcessingVersion: "datenschutz-v2",
      consent_processing_version: "datenschutz-v2",
      consentContactAcceptedAt,
      consent_contact_accepted_at: consentContactAcceptedAt,
      consentContactVersion: consentContactAcceptedAt ? "mitmachen-kontakt-v2" : "",
      consent_contact_version: consentContactAcceptedAt ? "mitmachen-kontakt-v2" : "",
      privacyCheckStatus: "synthetic_demo",
      privacy_check_status: "synthetic_demo",
      emailConfirmationStatus: "confirmed",
      email_confirmation_status: "confirmed",
      sourceUrl: "https://registrierung.example.invalid/beispiel",
      source_url: "https://registrierung.example.invalid/beispiel"
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
        "Im synthetischen Folgetermin sollen ePA, KIM und TI-Messenger anhand klar getrennter Anwendungsfälle besprochen werden.",
        "Die fiktive Organisation hat Interesse an einer Hospitation zum Entlassmanagement signalisiert.",
        "Synthetischer Folgeschritt: Rollen und nächsten Übergabepunkt im Versorgungspfad konkretisieren."
      ][index % 4],
      text: "",
      noteType: index % 3 === 0 ? "meeting" : "free_note",
      title: index % 3 === 0 ? "Synthetisches Versorgungsgespräch" : "Gesprächsnotiz",
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
    description: "Kuratierte synthetische Ansicht für die öffentliche Beispieldarstellung.",
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
        favoriteContactIds: ["demo-contact-01", "demo-contact-04", "demo-contact-09"],
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
