window.VERSORGUNGS_COMPASS_CONFIG = {
  dataMode: "api",
  // Im ausgelieferten Target wird hier ein freigegebener HTTPS-Origin eingesetzt.
  // Leer bedeutet fuer die lokale Quellansicht: gleiche Origin; Routen beginnen mit /api.
  apiBaseUrl: "",
  apiCredentials: "include",
  requireApiGateway: true,
  // Die Quellansicht laeuft ohne Rewrite-Server und verwendet deshalb Hash-Routen.
  // Der Target-Builder aktiviert kanonische Pfade fuer die produktive Nginx-Auslieferung.
  cleanUrls: false,
  capabilities: {
    contactRole: true,
    contactConsent: true,
    organizationPrimarySystems: true,
    registrationIntake: true,
    contactImageSources: true,
    organizationAssets: false,
    expertOrganizationAssets: false,
    stakeholderOrganizationAssets: true
  }
};
