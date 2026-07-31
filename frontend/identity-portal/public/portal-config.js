/*
 * Public runtime configuration; the Firebase Web API key is an identifier, not
 * a secret. Replace every REPLACE_* value before a production build.
 */
window.IDENTITY_PORTAL_CONFIG = Object.freeze({
  firebase: Object.freeze({
    apiKey: "REPLACE_WITH_WEB_API_KEY",
    authDomain: "versorgungs-kompass.de",
    projectId: "REPLACE_WITH_PROJECT_ID"
  }),
  allowedContinueOrigins: Object.freeze([
    "https://REPLACE_WITH_PROTECTED_HOST"
  ]),
  privacyPolicyUrl: "https://www.gematik.de/datenschutz",
  legalNoticeUrl: "https://www.gematik.de/impressum",
  supportUrl: "https://www.gematik.de/kontakt",
  enableLocalPreview: true
});
