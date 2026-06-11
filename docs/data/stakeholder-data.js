// Public stakeholder fallback seed.
// Contains organization-level KV baseline data plus synthetic representative rows for demo/tests only.
// Do not commit real personal contact data here.
window.VERSORGUNGS_COMPASS_STAKEHOLDER_TYPES = [
  {
    id: "kv",
    label: "Kassenärztliche Vereinigungen",
    description: "Regionale Kassenärztliche Vereinigungen als erster Stakeholder-Bereich.",
    sortOrder: 10,
    status: "active"
  }
];

window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS = [
  ["kv-baden-wuerttemberg", "Kassenärztliche Vereinigung Baden-Württemberg", "Stuttgart", "Baden-Württemberg", 48.7758, 9.1829, "https://www.kvbawue.de"],
  ["kv-bayern", "Kassenärztliche Vereinigung Bayerns", "München", "Bayern", 48.1351, 11.5820, "https://www.kvb.de"],
  ["kv-berlin", "Kassenärztliche Vereinigung Berlin", "Berlin", "Berlin", 52.5200, 13.4050, "https://www.kvberlin.de"],
  ["kv-brandenburg", "Kassenärztliche Vereinigung Brandenburg", "Potsdam", "Brandenburg", 52.3906, 13.0645, "https://www.kvbb.de"],
  ["kv-bremen", "Kassenärztliche Vereinigung Bremen", "Bremen", "Bremen", 53.0793, 8.8017, "https://www.kvhb.de"],
  ["kv-hamburg", "Kassenärztliche Vereinigung Hamburg", "Hamburg", "Hamburg", 53.5511, 9.9937, "https://www.kvhh.net"],
  ["kv-hessen", "Kassenärztliche Vereinigung Hessen", "Frankfurt am Main", "Hessen", 50.1109, 8.6821, "https://www.kvhessen.de"],
  ["kv-mecklenburg-vorpommern", "Kassenärztliche Vereinigung Mecklenburg-Vorpommern", "Schwerin", "Mecklenburg-Vorpommern", 53.6355, 11.4012, "https://www.kvmv.de"],
  ["kv-niedersachsen", "Kassenärztliche Vereinigung Niedersachsen", "Hannover", "Niedersachsen", 52.3759, 9.7320, "https://www.kvn.de"],
  ["kv-nordrhein", "Kassenärztliche Vereinigung Nordrhein", "Düsseldorf", "Nordrhein-Westfalen", 51.2277, 6.7735, "https://www.kvno.de"],
  ["kv-rheinland-pfalz", "Kassenärztliche Vereinigung Rheinland-Pfalz", "Mainz", "Rheinland-Pfalz", 49.9929, 8.2473, "https://www.kv-rlp.de"],
  ["kv-saarland", "Kassenärztliche Vereinigung Saarland", "Saarbrücken", "Saarland", 49.2402, 6.9969, "https://www.kvsaarland.de"],
  ["kv-sachsen", "Kassenärztliche Vereinigung Sachsen", "Dresden", "Sachsen", 51.0504, 13.7373, "https://www.kvs-sachsen.de"],
  ["kv-sachsen-anhalt", "Kassenärztliche Vereinigung Sachsen-Anhalt", "Magdeburg", "Sachsen-Anhalt", 52.1205, 11.6276, "https://www.kvsa.de"],
  ["kv-schleswig-holstein", "Kassenärztliche Vereinigung Schleswig-Holstein", "Bad Segeberg", "Schleswig-Holstein", 53.9355, 10.3099, "https://www.kvsh.de"],
  ["kv-thueringen", "Kassenärztliche Vereinigung Thüringen", "Weimar", "Thüringen", 50.9795, 11.3235, "https://www.kv-thueringen.de"],
  ["kv-westfalen-lippe", "Kassenärztliche Vereinigung Westfalen-Lippe", "Dortmund", "Nordrhein-Westfalen", 51.5136, 7.4653, "https://www.kvwl.de"]
].map(([id, name, city, state, lat, lon, website]) => ({
  id,
  stakeholderTypeId: "kv",
  stakeholderType: "kv",
  name,
  normalizedName: name.toLowerCase(),
  organizationType: "Kassenärztliche Vereinigung",
  city,
  state,
  lat,
  lon,
  latitude: lat,
  longitude: lon,
  website,
  source: "Öffentliche KV-Baseline",
  status: "active"
}));

window.VERSORGUNGS_COMPASS_STAKEHOLDER_PEOPLE = window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS.slice(0, 3).map((organization, index) => ({
  id: `stakeholder-person-demo-${index + 1}`,
  stakeholderTypeId: "kv",
  stakeholderType: "kv",
  organizationId: organization.id,
  organization: organization.name,
  name: `VV Demo ${index + 1}`,
  role: "Mitglied der Vertreterversammlung",
  committee: "Vertreterversammlung",
  city: organization.city,
  state: organization.state,
  lat: organization.lat,
  lon: organization.lon,
  latitude: organization.lat,
  longitude: organization.lon,
  mapPositionSource: "organization",
  isRepresentativeAssemblyMember: true,
  themes: ["Selbstverwaltung"],
  source: "Synthetische Demo-Daten",
  status: "active"
}));
