window.VERSORGUNGS_COMPASS_CONFIG = {
  dataMode: "api",
  // Im ausgelieferten Target wird hier ein freigegebener HTTPS-Origin eingesetzt.
  // Leer bedeutet fuer die lokale Quellansicht: gleiche Origin; Routen beginnen mit /api.
  apiBaseUrl: "",
  apiCredentials: "include",
  requireApiGateway: true,
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
