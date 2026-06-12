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

const stakeholderKvLogoSourceUrls = {
  "kv-baden-wuerttemberg": "https://www.kvbawue.de/fileadmin/templates/pics/LogoKVBW-Only.svg",
  "kv-bayern": "https://www.kvb.de/typo3conf/ext/sitepackage/Resources/Public/Img/Frontend/Icons/kvb_logo_L.svg",
  "kv-berlin": "https://www.kvberlin.de/die-kv-berlin/pressematerial",
  "kv-brandenburg": "https://www.kvbb.de/",
  "kv-bremen": "https://www.kvhb.de/fileadmin/templates/img/kvhb-logo_rgb.svg",
  "kv-hamburg": "https://www.kvhh.net/_Resources/Static/Packages/Kvh.Shared/Images/logo.svg",
  "kv-hessen": "https://www.kvhessen.de/",
  "kv-mecklenburg-vorpommern": "https://www.kvmv.de/export/sites/default/.galleries/logos_kvmv/kvmv_logo_260x72_72dpi_neu.png_924116194.png",
  "kv-niedersachsen": "https://www.kvn.de/media/Startseite/logo_kvn.gif?height=83&width=280",
  "kv-nordrhein": "https://www.kvno.de/_assets/1e9b4bda4188c921a5f70dd8e8f89d33/Default/Images/Frontend/KVNO_Logo_FIN_RGB.svg",
  "kv-rheinland-pfalz": "https://www.kv-rlp.de/",
  "kv-saarland": "https://www.kvsaarland.de/wp-content/uploads/2021/11/cropped-layout_set_logo.png",
  "kv-sachsen": "https://www.kvsachsen.de/_assets/52b99c8405b202148655db3504f4e336/Images/logo.svg",
  "kv-sachsen-anhalt": "https://www.kvsa.de/fileadmin/kvsa/kvsa-logo-positiv.svg",
  "kv-schleswig-holstein": "https://www.kvsh.de/_assets/dc2a61922c9e4e40c3e5c4b5eb2f2579/Images/logo.svg",
  "kv-thueringen": "https://www.kv-thueringen.de/",
  "kv-westfalen-lippe": "https://www.kvwl.de/"
};

window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS = [
  ["kv-baden-wuerttemberg", "Kassenärztliche Vereinigung Baden-Württemberg", "Stuttgart", "Baden-Württemberg", 48.7758, 9.1829, "https://www.kvbawue.de", "kv-baden-wuerttemberg.svg", 24324],
  ["kv-bayern", "Kassenärztliche Vereinigung Bayerns", "München", "Bayern", 48.1351, 11.5820, "https://www.kvb.de", "kv-bayern.svg", 30984],
  ["kv-berlin", "Kassenärztliche Vereinigung Berlin", "Berlin", "Berlin", 52.5200, 13.4050, "https://www.kvberlin.de", "kv-berlin.svg", 11148],
  ["kv-brandenburg", "Kassenärztliche Vereinigung Brandenburg", "Potsdam", "Brandenburg", 52.3906, 13.0645, "https://www.kvbb.de", "kv-brandenburg.svg", 5099],
  ["kv-bremen", "Kassenärztliche Vereinigung Bremen", "Bremen", "Bremen", 53.0793, 8.8017, "https://www.kvhb.de", "kv-bremen.svg", 2127],
  ["kv-hamburg", "Kassenärztliche Vereinigung Hamburg", "Hamburg", "Hamburg", 53.5511, 9.9937, "https://www.kvhh.net", "kv-hamburg.svg", 5873],
  ["kv-hessen", "Kassenärztliche Vereinigung Hessen", "Frankfurt am Main", "Hessen", 50.1109, 8.6821, "https://www.kvhessen.de", "kv-hessen.svg", 14849],
  ["kv-mecklenburg-vorpommern", "Kassenärztliche Vereinigung Mecklenburg-Vorpommern", "Schwerin", "Mecklenburg-Vorpommern", 53.6355, 11.4012, "https://www.kvmv.de", "kv-mecklenburg-vorpommern.png", 3509],
  ["kv-niedersachsen", "Kassenärztliche Vereinigung Niedersachsen", "Hannover", "Niedersachsen", 52.3759, 9.7320, "https://www.kvn.de", "kv-niedersachsen.gif", 17110],
  ["kv-nordrhein", "Kassenärztliche Vereinigung Nordrhein", "Düsseldorf", "Nordrhein-Westfalen", 51.2277, 6.7735, "https://www.kvno.de", "kv-nordrhein.svg", 23809],
  ["kv-rheinland-pfalz", "Kassenärztliche Vereinigung Rheinland-Pfalz", "Mainz", "Rheinland-Pfalz", 49.9929, 8.2473, "https://www.kv-rlp.de", "kv-rheinland-pfalz.svg", 8643],
  ["kv-saarland", "Kassenärztliche Vereinigung Saarland", "Saarbrücken", "Saarland", 49.2402, 6.9969, "https://www.kvsaarland.de", "kv-saarland.png", 2272],
  ["kv-sachsen", "Kassenärztliche Vereinigung Sachsen", "Dresden", "Sachsen", 51.0504, 13.7373, "https://www.kvs-sachsen.de", "kv-sachsen.svg", 9270],
  ["kv-sachsen-anhalt", "Kassenärztliche Vereinigung Sachsen-Anhalt", "Magdeburg", "Sachsen-Anhalt", 52.1205, 11.6276, "https://www.kvsa.de", "kv-sachsen-anhalt.svg", 4663],
  ["kv-schleswig-holstein", "Kassenärztliche Vereinigung Schleswig-Holstein", "Bad Segeberg", "Schleswig-Holstein", 53.9355, 10.3099, "https://www.kvsh.de", "kv-schleswig-holstein.svg", 6468],
  ["kv-thueringen", "Kassenärztliche Vereinigung Thüringen", "Weimar", "Thüringen", 50.9795, 11.3235, "https://www.kv-thueringen.de", "kv-thueringen.svg", 4494],
  ["kv-westfalen-lippe", "Kassenärztliche Vereinigung Westfalen-Lippe", "Dortmund", "Nordrhein-Westfalen", 51.5136, 7.4653, "https://www.kvwl.de", "kv-westfalen-lippe.svg", 17233]
].map(([id, name, city, state, lat, lon, website, logoFile, memberCount]) => ({
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
  logoUrl: `../public/stakeholder-logos/${logoFile}`,
  logoSourceUrl: stakeholderKvLogoSourceUrls[id] || website,
  logoSourceLabel: "Offizielles Header-/Logo-Asset der Organisation",
  memberCount,
  memberCountLabel: memberCount.toLocaleString("de-DE"),
  memberCountScope: "An der vertragsärztlichen Versorgung teilnehmende Ärztinnen und Ärzte, Psychotherapeutinnen und Psychotherapeuten (Zählung nach Personen)",
  memberCountSourceLabel: "KBV Bundesarztregister, Tabelle 4, Stand 31.12.2025",
  memberCountSourceUrl: "https://www.kbv.de/documents/infothek/zahlen-und-fakten/Bundesarztregister/tabellen-statistische-informationen-bar-2025.xlsx",
  memberCountUpdatedAt: "2025-12-31",
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
