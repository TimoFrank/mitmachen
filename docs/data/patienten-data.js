// Separate seed data for the Patienten workspace.
// Reuses the researched Patientenverbaende from stakeholder-data.js and classifies them by indication.
window.VERSORGUNGS_COMPASS_PATIENT_INDICATIONS = [
  {
    id: "patient-indication-cross-cutting",
    name: "Übergreifende Patientenvertretung und Beratung",
    description: "Querschnitt für Patientenrechte, unabhängige Beratung, Patientensicherheit, Selbsthilfe-Infrastruktur und krankheitsübergreifende Interessenvertretung.",
    sortOrder: 10
  },
  {
    id: "patient-indication-oncology-hematology",
    name: "Onkologie und Hämatologie",
    description: "Bündelt Krebserkrankungen, solide Tumoren sowie Erkrankungen des Blut- und Lymphsystems inklusive Krebs-Selbsthilfe.",
    sortOrder: 20
  },
  {
    id: "patient-indication-cardiovascular",
    name: "Herz-Kreislauf-Erkrankungen",
    description: "Umfasst Herz- und Gefäßerkrankungen, angeborene Herzfehler, Herzinsuffizienz, Rhythmusstörungen und kardiovaskuläre Prävention.",
    sortOrder: 30
  },
  {
    id: "patient-indication-neurology",
    name: "Neurologie und Neurodegeneration",
    description: "Für Erkrankungen von Gehirn, Rückenmark und Nerven, darunter Multiple Sklerose, Parkinson, Epilepsie, Alzheimer und Demenz.",
    sortOrder: 40
  },
  {
    id: "patient-indication-mental-health",
    name: "Psychische Gesundheit und Neurodivergenz",
    description: "Fasst psychische Erkrankungen, psychosoziale Versorgung und neurodivergente Lebenslagen wie Autismus oder ADHS zusammen.",
    sortOrder: 50
  },
  {
    id: "patient-indication-metabolism",
    name: "Stoffwechsel und Endokrinologie",
    description: "Für Diabetes, Schilddrüsen- und Hormonerkrankungen sowie weitere Stoffwechselthemen mit langfristiger Versorgungsperspektive.",
    sortOrder: 60
  },
  {
    id: "patient-indication-autoimmune",
    name: "Autoimmun, Rheuma und Entzündung",
    description: "Bündelt autoimmune und chronisch-entzündliche Erkrankungen, etwa Rheuma, Psoriasis und systemische Entzündungserkrankungen.",
    sortOrder: 70
  },
  {
    id: "patient-indication-respiratory",
    name: "Atemwege, Allergie und Lunge",
    description: "Für Asthma, Allergien, chronische Lungenerkrankungen, Mukoviszidose und weitere Atemwegs- oder Lungenindikationen.",
    sortOrder: 80
  },
  {
    id: "patient-indication-gastro",
    name: "Gastroenterologie und Verdauung",
    description: "Umfasst Erkrankungen von Magen, Darm, Leber und Verdauung sowie Stoma- und chronisch-entzündliche Darmthemen.",
    sortOrder: 90
  },
  {
    id: "patient-indication-rare",
    name: "Seltene Erkrankungen und Genetik",
    description: "Querschnitt für seltene, häufig genetisch bedingte Erkrankungen mit besonderem Bedarf an Orientierung, Vernetzung und Expertise.",
    sortOrder: 100
  },
  {
    id: "patient-indication-pediatrics",
    name: "Pädiatrie, Familie und angeborene Erkrankungen",
    description: "Für Kinder, Jugendliche, Familien und angeborene Erkrankungen, wenn Versorgung und Teilhabe familienzentriert organisiert werden.",
    sortOrder: 110
  },
  {
    id: "patient-indication-eyes-senses",
    name: "Augen und Sinnesorgane",
    description: "Bündelt Erkrankungen von Auge, Sehen, Hören und weiteren Sinnesorganen, inklusive Netzhaut- und Sehbehinderungsthemen.",
    sortOrder: 120
  },
  {
    id: "patient-indication-disability-participation",
    name: "Behinderung, Teilhabe und Pflege",
    description: "Für Teilhabe, Pflege, Behinderung, Inklusion und sozialrechtliche Fragen, die häufig indikationsübergreifend wirken.",
    sortOrder: 130
  }
];

window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATION_INDICATIONS = {
  "patient-dbr": "Behinderung, Teilhabe und Pflege",
  "patient-bagp": "Übergreifende Patientenvertretung und Beratung",
  "patient-dag-shg": "Übergreifende Patientenvertretung und Beratung",
  "patient-vzbv": "Übergreifende Patientenvertretung und Beratung",
  "patient-bag-selbsthilfe": "Behinderung, Teilhabe und Pflege",
  "patient-sovd": "Behinderung, Teilhabe und Pflege",
  "patient-vdk": "Behinderung, Teilhabe und Pflege",
  "patient-isl": "Behinderung, Teilhabe und Pflege",
  "patient-abid": "Behinderung, Teilhabe und Pflege",
  "patient-lebenshilfe": "Behinderung, Teilhabe und Pflege",
  "patient-achse": "Seltene Erkrankungen und Genetik",
  "patient-deutsche-alzheimer-gesellschaft": "Neurologie und Neurodegeneration",
  "patient-rheuma-liga": "Autoimmun, Rheuma und Entzündung",
  "patient-dmsg": "Neurologie und Neurodegeneration",
  "patient-dccv": "Gastroenterologie und Verdauung",
  "patient-pro-retina": "Augen und Sinnesorgane",
  "patient-upd": "Übergreifende Patientenvertretung und Beratung",
  "patient-aps": "Übergreifende Patientenvertretung und Beratung",
  "patient-bpik": "Übergreifende Patientenvertretung und Beratung",
  "patient-diabetesde": "Stoffwechsel und Endokrinologie",
  "patient-parkinson-vereinigung": "Neurologie und Neurodegeneration",
  "patient-herzstiftung": "Herz-Kreislauf-Erkrankungen",
  "patient-daab": "Atemwege, Allergie und Lunge",
  "patient-psoriasis-bund": "Autoimmun, Rheuma und Entzündung",
  "patient-frauenselbsthilfe-krebs": "Onkologie und Hämatologie",
  "patient-prostatakrebs-bps": "Onkologie und Hämatologie",
  "patient-ilco": "Gastroenterologie und Verdauung",
  "patient-haus-der-krebs-selbsthilfe": "Onkologie und Hämatologie",
  "patient-dlh": "Onkologie und Hämatologie",
  "patient-schilddruesenkrebs": "Onkologie und Hämatologie",
  "patient-mukoviszidose": "Atemwege, Allergie und Lunge",
  "patient-kindernetzwerk": "Pädiatrie, Familie und angeborene Erkrankungen",
  "patient-bvhk": "Herz-Kreislauf-Erkrankungen",
  "patient-epilepsievereinigung": "Neurologie und Neurodegeneration",
  "patient-depressionsliga": "Psychische Gesundheit und Neurodivergenz",
  "patient-autismus-deutschland": "Psychische Gesundheit und Neurodivergenz",
  "patient-adhs-deutschland": "Psychische Gesundheit und Neurodivergenz",
  "patient-sarkom-stiftung": "Onkologie und Hämatologie",
  "patient-blasenkrebs-shb": "Onkologie und Hämatologie"
};

(function buildPatientOrganizations() {
  const indications = Array.isArray(window.VERSORGUNGS_COMPASS_PATIENT_INDICATIONS)
    ? window.VERSORGUNGS_COMPASS_PATIENT_INDICATIONS
    : [];
  const indicationByName = new Map(indications.map((indication) => [indication.name, indication]));
  const indicationByOrganization = window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATION_INDICATIONS || {};
  const stakeholderOrganizations = Array.isArray(window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS)
    ? window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS
    : [];

  window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATIONS = stakeholderOrganizations
    .filter((organization) => organization?.stakeholderTypeId === "patient-associations")
    .map((organization) => {
      const indicationName = indicationByOrganization[organization.id] || "Übergreifende Patientenvertretung und Beratung";
      const indication = indicationByName.get(indicationName) || indications[0] || {};
      return {
        ...organization,
        groupId: indication.id || "",
        group: indicationName,
        category: indicationName,
        sector: indicationName,
        source: organization.source || "Patientenverbaende-Stakeholderdaten",
        organizationType: organization.organizationType || "Patientenorganisation"
      };
    });
})();

(function buildPatientPeople() {
  const normalizeOrganizationName = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");
  const patientOrganizations = Array.isArray(window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATIONS)
    ? window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATIONS
    : [];
  const organizationById = new Map(patientOrganizations.map((organization) => [organization.id, organization]));
  const organizationByName = new Map(
    patientOrganizations.map((organization) => [normalizeOrganizationName(organization.name), organization])
  );
  const stakeholderPeople = Array.isArray(window.VERSORGUNGS_COMPASS_STAKEHOLDER_PEOPLE)
    ? window.VERSORGUNGS_COMPASS_STAKEHOLDER_PEOPLE
    : [];

  window.VERSORGUNGS_COMPASS_PATIENT_PEOPLE = stakeholderPeople
    .filter((person) =>
      person?.stakeholderTypeId === "patient-associations" ||
      person?.stakeholder_type_id === "patient-associations" ||
      person?.stakeholderType === "patient-associations"
    )
    .map((person) => {
      const organizationId = person.organizationId || person.organization_id || "";
      const organizationName = person.organization || "";
      const organization = organizationById.get(organizationId) || organizationByName.get(normalizeOrganizationName(organizationName));
      const indication =
        person.indication ||
        person.group ||
        person.sector ||
        person.category ||
        organization?.indication ||
        organization?.sector ||
        organization?.category ||
        "Übergreifende Patientenvertretung und Beratung";
      return {
        ...person,
        stakeholderTypeId: "patient-associations",
        stakeholderType: "patient-associations",
        organizationId: organization?.id || organizationId,
        organization: organization?.name || organizationName,
        indicationId:
          person.indicationId ||
          person.indication_id ||
          person.groupId ||
          person.group_id ||
          organization?.indicationId ||
          organization?.groupId ||
          "",
        indication,
        groupId:
          person.groupId ||
          person.group_id ||
          person.indicationId ||
          person.indication_id ||
          organization?.groupId ||
          organization?.indicationId ||
          "",
        group: indication,
        category: indication,
        sector: indication,
        source: person.source || organization?.source || "Patientenverbaende-Stakeholderdaten"
      };
    });
})();
