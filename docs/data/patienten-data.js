// Separate seed data for the Patienten workspace.
// Reuses the researched Patientenverbaende from stakeholder-data.js and classifies them by indication.
window.VERSORGUNGS_COMPASS_PATIENT_INDICATIONS = [
  { id: "patient-indication-cross-cutting", name: "Übergreifende Patientenvertretung und Beratung", sortOrder: 10 },
  { id: "patient-indication-oncology-hematology", name: "Onkologie und Hämatologie", sortOrder: 20 },
  { id: "patient-indication-cardiovascular", name: "Herz-Kreislauf-Erkrankungen", sortOrder: 30 },
  { id: "patient-indication-neurology", name: "Neurologie und Neurodegeneration", sortOrder: 40 },
  { id: "patient-indication-mental-health", name: "Psychische Gesundheit und Neurodivergenz", sortOrder: 50 },
  { id: "patient-indication-metabolism", name: "Stoffwechsel und Endokrinologie", sortOrder: 60 },
  { id: "patient-indication-autoimmune", name: "Autoimmun, Rheuma und Entzündung", sortOrder: 70 },
  { id: "patient-indication-respiratory", name: "Atemwege, Allergie und Lunge", sortOrder: 80 },
  { id: "patient-indication-gastro", name: "Gastroenterologie und Verdauung", sortOrder: 90 },
  { id: "patient-indication-rare", name: "Seltene Erkrankungen und Genetik", sortOrder: 100 },
  { id: "patient-indication-pediatrics", name: "Pädiatrie, Familie und angeborene Erkrankungen", sortOrder: 110 },
  { id: "patient-indication-eyes-senses", name: "Augen und Sinnesorgane", sortOrder: 120 },
  { id: "patient-indication-disability-participation", name: "Behinderung, Teilhabe und Pflege", sortOrder: 130 }
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
