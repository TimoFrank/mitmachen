// Public stakeholder fallback seed.
// Contains organization-level KV baseline data plus public board-member rows.
// Do not include non-public contact data here.
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

const stakeholderKvOrganizationById = new Map(
  window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS.map((organization) => [organization.id, organization])
);

window.VERSORGUNGS_COMPASS_STAKEHOLDER_PEOPLE = [
  ["kv-baden-wuerttemberg-karsten-braun", "kv-baden-wuerttemberg", "Dr. Karsten Braun", "Vorstandsvorsitzender", "https://www.kvbawue.de/ueber-uns/vorstand"],
  ["kv-baden-wuerttemberg-doris-reinhardt", "kv-baden-wuerttemberg", "Dr. Doris Reinhardt", "Stellvertretende Vorstandsvorsitzende", "https://www.kvbawue.de/ueber-uns/vorstand"],
  ["kv-bayern-christian-pfeiffer", "kv-bayern", "Dr. Christian Pfeiffer", "Vorstandsvorsitzender", "https://www.kvb.de/ueber-uns/verwaltung"],
  ["kv-bayern-peter-heinz", "kv-bayern", "Dr. Peter Heinz", "1. Stv. Vorstandsvorsitzender", "https://www.kvb.de/ueber-uns/verwaltung"],
  ["kv-bayern-claudia-ritter-rupp", "kv-bayern", "Dr. Claudia Ritter-Rupp", "2. Stv. Vorstandsvorsitzende", "https://www.kvb.de/ueber-uns/verwaltung"],
  ["kv-berlin-burkhard-ruppert", "kv-berlin", "Dr. Burkhard Ruppert", "Vorstandsvorsitzender", "https://www.kvberlin.de/die-kv-berlin/organisation/vorstand"],
  ["kv-berlin-christiane-wessel", "kv-berlin", "Dr. Christiane Wessel", "Stellvertretende Vorstandsvorsitzende", "https://www.kvberlin.de/die-kv-berlin/organisation/vorstand"],
  ["kv-berlin-guenter-scherer", "kv-berlin", "Günter Scherer", "Vorstandsmitglied", "https://www.kvberlin.de/die-kv-berlin/organisation/vorstand"],
  ["kv-brandenburg-catrin-steiniger", "kv-brandenburg", "Catrin Steiniger", "Vorsitzende des Vorstandes", "https://www.kvbb.de/wir/unsere-struktur/vorstand"],
  ["kv-brandenburg-stefan-rossbach-kurschat", "kv-brandenburg", "Dr. med. Stefan Roßbach-Kurschat", "Stellvertretender Vorsitzender des Vorstandes", "https://www.kvbb.de/wir/unsere-struktur/vorstand"],
  ["kv-brandenburg-holger-rostek", "kv-brandenburg", "Holger Rostek", "Stellvertretender Vorsitzender des Vorstandes", "https://www.kvbb.de/wir/unsere-struktur/vorstand"],
  ["kv-bremen-bernhard-rochell", "kv-bremen", "Dr. Bernhard Rochell", "Vorstandsvorsitzender", "https://www.kvhb.de/ueber-uns/vorstand"],
  ["kv-bremen-peter-kurt-josenhans", "kv-bremen", "Peter Kurt Josenhans", "Stv. Vorstandsvorsitzender", "https://www.kvhb.de/ueber-uns/vorstand"],
  ["kv-bremen-martina-kemme", "kv-bremen", "Martina Kemme", "Mitglied des Vorstands", "https://www.kvhb.de/ueber-uns/vorstand"],
  ["kv-hamburg-john-afful", "kv-hamburg", "John Afful", "Vorsitzender des Vorstandes", "https://www.kvhh.net/de/ueber-uns/aufbau-vorstand.html"],
  ["kv-hamburg-caroline-roos", "kv-hamburg", "Caroline Roos", "Stellv. Vorsitzende des Vorstandes", "https://www.kvhh.net/de/ueber-uns/aufbau-vorstand.html"],
  ["kv-hessen-frank-dastych", "kv-hessen", "Frank Dastych", "Vorstandsvorsitzender", "https://www.kvhessen.de/ueber-uns/vorstand"],
  ["kv-hessen-armin-beck", "kv-hessen", "Armin Beck", "Stellvertretender Vorstandsvorsitzender", "https://www.kvhessen.de/ueber-uns/vorstand"],
  ["kv-mecklenburg-vorpommern-angelika-von-schuetz", "kv-mecklenburg-vorpommern", "Dipl.-Med. Angelika von Schütz", "Vorsitzende", "https://www.kvmv.de/ueber-uns/vorstand/"],
  ["kv-mecklenburg-vorpommern-tilo-schneider", "kv-mecklenburg-vorpommern", "Dr. med. Tilo Schneider", "Stellvertretender Vorsitzender", "https://www.kvmv.de/ueber-uns/vorstand/"],
  ["kv-mecklenburg-vorpommern-markolf-oelze", "kv-mecklenburg-vorpommern", "Dr. med. Markolf Oelze", "Stellvertretender Vorsitzender", "https://www.kvmv.de/ueber-uns/vorstand/"],
  ["kv-niedersachsen-mark-barjenbruch", "kv-niedersachsen", "Mark Barjenbruch", "Vorsitzender", "https://www.kvn.de/%C3%9Cber%2Buns/Organisation/Vorstand.html"],
  ["kv-niedersachsen-thorsten-schmidt", "kv-niedersachsen", "Thorsten Schmidt", "Stellvertretender Vorsitzender", "https://www.kvn.de/%C3%9Cber%2Buns/Organisation/Vorstand.html"],
  ["kv-niedersachsen-nicole-loehr", "kv-niedersachsen", "Nicole Löhr", "Vorständin", "https://www.kvn.de/%C3%9Cber%2Buns/Organisation/Vorstand.html"],
  ["kv-nordrhein-frank-bergmann", "kv-nordrhein", "Dr. med. Frank Bergmann", "Vorstandsvorsitzender", "https://www.kvno.de/ueber-uns/vorstand"],
  ["kv-nordrhein-carsten-koenig", "kv-nordrhein", "Dr. med. Carsten König, M. san.", "Stellvertretender Vorstandsvorsitzender", "https://www.kvno.de/ueber-uns/vorstand"],
  ["kv-rheinland-pfalz-peter-heinz", "kv-rheinland-pfalz", "San.-Rat Dr. Peter Heinz", "Vorsitzender des Vorstands", "https://www.kv-rlp.de/institution/aufgaben-und-organisation"],
  ["kv-rheinland-pfalz-andreas-bartels", "kv-rheinland-pfalz", "Dr. Andreas Bartels", "Stellvertretender Vorsitzender des Vorstands", "https://www.kv-rlp.de/institution/aufgaben-und-organisation"],
  ["kv-rheinland-pfalz-peter-andreas-staub", "kv-rheinland-pfalz", "Peter Andreas Staub", "Mitglied des Vorstands", "https://www.kv-rlp.de/institution/aufgaben-und-organisation"],
  ["kv-saarland-harry-derouet", "kv-saarland", "San.-Rat Prof. Dr. med. Harry Derouet", "Vorsitzender des Vorstandes", "https://www.kvsaarland.de/vorstand"],
  ["kv-saarland-thomas-rehlinger", "kv-saarland", "Thomas Rehlinger", "Stellv. Vorsitzender des Vorstandes", "https://www.kvsaarland.de/vorstand"],
  ["kv-sachsen-stefan-windau", "kv-sachsen", "Dr. med. Stefan Windau", "Vorstandsvorsitzender", "https://www.kvsachsen.de/kv-sachsen/organisation/verwaltung/vorstand"],
  ["kv-sachsen-manuela-sipli", "kv-sachsen", "Dr. med. Manuela Sipli", "Stellvertretende Vorstandsvorsitzende", "https://www.kvsachsen.de/kv-sachsen/organisation/verwaltung/vorstand"],
  ["kv-sachsen-anhalt-joerg-boehme", "kv-sachsen-anhalt", "Dr. med. Jörg Böhme", "Vorsitzender des Vorstandes", "https://www.kvsa.de/ueber-uns/ansprechpartner/vorstand"],
  ["kv-sachsen-anhalt-nadine-waldburg", "kv-sachsen-anhalt", "Dr. med. Nadine Waldburg", "Stellvertretende Vorsitzende des Vorstandes", "https://www.kvsa.de/ueber-uns/ansprechpartner/vorstand"],
  ["kv-sachsen-anhalt-mathias-tronnier", "kv-sachsen-anhalt", "Mathias Tronnier", "Geschäftsführender Vorstand", "https://www.kvsa.de/ueber-uns/ansprechpartner/vorstand"],
  ["kv-schleswig-holstein-bettina-schultz", "kv-schleswig-holstein", "Dr. med. Bettina Schultz", "Vorstandsvorsitzende", "https://www.kvsh.de/ueber-uns/organisation/vorstand"],
  ["kv-schleswig-holstein-karsten-brandstetter", "kv-schleswig-holstein", "Dipl.-Kfm. Karsten Brandstetter", "Stellvertretender Vorstandsvorsitzender", "https://www.kvsh.de/ueber-uns/organisation/vorstand"],
  ["kv-schleswig-holstein-alexander-paquet", "kv-schleswig-holstein", "Dipl.-Wirtschaftsinformatiker Alexander Paquet", "Vorstandsmitglied", "https://www.kvsh.de/ueber-uns/organisation/vorstand"],
  ["kv-thueringen-annette-rommel", "kv-thueringen", "Dr. med. Annette Rommel", "1. Vorsitzende", "https://www.kv-thueringen.de/ueber-uns/vorstand"],
  ["kv-thueringen-thomas-schroeter", "kv-thueringen", "Dr. med. Thomas Schröter", "2. Vorsitzender", "https://www.kv-thueringen.de/ueber-uns/vorstand"],
  ["kv-westfalen-lippe-dirk-spelmeyer", "kv-westfalen-lippe", "Dr. med. Dirk Spelmeyer", "Vorstandsvorsitzender", "https://www.kvwl.de/kvwl/selbstverwaltung/vorstand"],
  ["kv-westfalen-lippe-anke-richter-scheer", "kv-westfalen-lippe", "Anke Richter-Scheer", "Stellv. Vorstandsvorsitzende", "https://www.kvwl.de/kvwl/selbstverwaltung/vorstand"]
].map(([id, organizationId, name, role, url]) => {
  const organization = stakeholderKvOrganizationById.get(organizationId) || {};
  return {
    id,
    stakeholderTypeId: "kv",
    stakeholderType: "kv",
    organizationId,
    organization: organization.name || "",
    name,
    role,
    committee: "Vorstand",
    city: organization.city || "",
    state: organization.state || "",
    lat: organization.lat,
    lon: organization.lon,
    latitude: organization.latitude,
    longitude: organization.longitude,
    mapPositionSource: "organization",
    isRepresentativeAssemblyMember: false,
    themes: ["Selbstverwaltung", "KV-Vorstand"],
    source: "Offizielle KV-Vorstandsseite",
    url,
    status: "active"
  };
});
