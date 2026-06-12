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
      image: index % 9 === 0 ? "../public/demo-person-lisa.svg" : index % 11 === 0 ? "../public/demo-person-jens.svg" : "",
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

  window.VERSORGUNGS_COMPASS_DEMO_DATA = {
    profiles,
    organizations,
    contacts,
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
