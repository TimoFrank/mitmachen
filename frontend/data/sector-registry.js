(function (root) {
  const sectors = [
    {
      id: "praxis",
      label: "Praxis",
      aliases: ["Versorgungspraxis", "Wissenschaftliches Netzwerk", "Berufliches Netzwerk", "Arztpraxis", "MVZ", "Facharztpraxis", "Zahnarztpraxis", "Zahnmedizin", "Psychotherapiepraxis", "Psychotherapie"],
      color: "#155fe4",
      sortOrder: 10,
      coverageTarget: true
    },
    {
      id: "krankenhaus",
      label: "Krankenhaus",
      aliases: ["Krankenhaus / Klinik", "Klinik", "Fachklinik", "Akutkrankenhaus", "Institution", "Methodik"],
      color: "#dc2626",
      sortOrder: 20,
      coverageTarget: true
    },
    {
      id: "apotheke",
      label: "Apotheke",
      aliases: ["Vor-Ort-Apotheke", "Apothekenkooperation"],
      color: "#16a34a",
      sortOrder: 30,
      coverageTarget: true
    },
    {
      id: "pflege",
      label: "Pflege",
      aliases: ["Pflegeeinrichtung", "Pflegedienst", "Pflegefachkraft", "Patientenperspektive"],
      color: "#7c3aed",
      sortOrder: 40,
      coverageTarget: true
    },
    {
      id: "krankenkasse",
      label: "Krankenkasse",
      aliases: ["Kasse", "Kostentraeger", "Kostenträger", "GKV", "PKV"],
      color: "#4f5fb8",
      sortOrder: 50,
      coverageTarget: true
    },
    {
      id: "labor",
      label: "Labor",
      aliases: ["Labore", "Medizinisches Labor", "Laboratorium", "Labordiagnostik", "Diagnostik"],
      color: "#0891b2",
      sortOrder: 60,
      coverageTarget: true
    },
    {
      id: "physio-heilmittel",
      label: "Physio / Heilmittel",
      aliases: ["Physio/Heilmittel", "Therapie", "Therapie und Heilmittel", "Physiotherapie", "Physiotherapeuten", "Physio", "Ergotherapie", "Logopaedie", "Logopädie", "Podologie", "Heilmittel", "Heilmittelerbringer", "Heilmittelpraxis"],
      color: "#0f766e",
      sortOrder: 70,
      coverageTarget: true
    },
    {
      id: "hebammen",
      label: "Hebammen",
      aliases: ["Hebamme", "Geburtshilfe", "Entbindungspflege"],
      color: "#be185d",
      sortOrder: 80,
      coverageTarget: true
    },
    {
      id: "notfallversorgung",
      label: "Notfallversorgung",
      aliases: ["Rettungsdienst", "Notfall", "Rettungswesen", "Krankentransport", "Notaufnahme", "Ärztlicher Bereitschaftsdienst", "Aerztlicher Bereitschaftsdienst", "KV-Bereitschaftsdienst"],
      color: "#ea580c",
      sortOrder: 90,
      coverageTarget: true
    },
    {
      id: "reha",
      label: "Reha",
      aliases: ["Rehabilitation", "Rehaklinik", "Reha-Klinik", "Rehabilitationsklinik"],
      color: "#ca8a04",
      sortOrder: 100,
      coverageTarget: true
    },
    {
      id: "hilfsmittel",
      label: "Hilfsmittel",
      aliases: ["Hilfsmittelerbringer", "Sanitaetshaus", "Sanitätshaus", "Medizinprodukte", "Homecare", "Homecare und Hilfsmittel"],
      color: "#475569",
      sortOrder: 110,
      coverageTarget: true
    },
    {
      id: "sozialdienst",
      label: "Sozialdienst",
      aliases: ["Beratungsstelle", "Sozialberatung"],
      color: "#64748b",
      sortOrder: 200,
      coverageTarget: false
    },
    {
      id: "oegd",
      label: "ÖGD",
      aliases: ["OeGD", "Öffentlicher Gesundheitsdienst", "Gesundheitsamt"],
      color: "#64748b",
      sortOrder: 220,
      coverageTarget: false
    }
  ];

  const fallbackColor = "#64748b";
  const excludedSectorKeys = new Set(["digitalhealth"]);

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  const lookup = new Map();
  sectors.forEach((sector) => {
    [sector.id, sector.label, ...(sector.aliases || [])].forEach((value) => {
      const key = normalizeKey(value);
      if (key) lookup.set(key, sector);
    });
  });

  function sortedSectors() {
    return sectors.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "de"));
  }

  function find(value) {
    return lookup.get(normalizeKey(value)) || null;
  }

  function isExcludedSector(value) {
    return excludedSectorKeys.has(normalizeKey(value));
  }

  function normalizeSector(value, fallback = "") {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    if (isExcludedSector(raw)) return fallback;
    return find(raw)?.label || raw;
  }

  function isKnownSector(value) {
    return Boolean(find(value));
  }

  function colorFor(value) {
    return find(value)?.color || fallbackColor;
  }

  function labels(options = {}) {
    return sortedSectors()
      .filter((sector) => options.coverageOnly ? sector.coverageTarget : true)
      .map((sector) => sector.label);
  }

  function options() {
    return sortedSectors().map((sector) => ({
      value: sector.label,
      label: sector.label
    }));
  }

  root.VERSORGUNGS_COMPASS_SECTORS = sortedSectors();
  root.VersorgungsCompassSectors = {
    sectors: sortedSectors(),
    fallbackColor,
    normalizeKey,
    find,
    normalizeSector,
    isKnownSector,
    isExcludedSector,
    colorFor,
    labels,
    options
  };
})(typeof window !== "undefined" ? window : globalThis);
