const ROLE_RANK = Object.freeze({ viewer: 1, editor: 2, admin: 3 });
const ACCESS_SCOPES = new Set(["standard", "test_only"]);
const IAP_ISSUER = "https://cloud.google.com/iap";
const IAP_CLOCK_SKEW_SECONDS = 30;
const IAP_MAX_TOKEN_LIFETIME_SECONDS = 10 * 60;
const IAP_IDENTITY_MODES = new Set(["iam", "external"]);
const IAP_EXTERNAL_SIGN_IN_PROVIDERS = new Set(["google.com", "password"]);
const IAP_GCIP_CLAIM_MAX_BYTES = 12 * 1024;
const IAP_EXTERNAL_MAX_DURATION_MS = 62 * 24 * 60 * 60 * 1000;

export const WRITE_CLASSES = Object.freeze({
  READ: "read",
  SELF_SERVICE: "self-service",
  TEST_OBJECT_CREATE: "test-object-create",
  TEST_OBJECT_UPDATE: "test-object-update",
  RESTRICTED: "restricted"
});

function route(methods, pattern, role, id, writeClass = WRITE_CLASSES.RESTRICTED) {
  return Object.freeze({ methods: new Set(methods), pattern, role, id, writeClass });
}

// Jede produktive API-Route muss hier explizit eingetragen sein. Neue Routen sind
// dadurch bis zu einer bewussten Berechtigungsentscheidung automatisch gesperrt.
export const ROUTE_POLICIES = Object.freeze([
  route(["GET"], /^\/(?:api\/)?(?:healthz|readyz)$/, "public", "health", WRITE_CLASSES.READ),
  route(["GET"], /^\/api\/auth\/bootstrap$/, "public", "auth.bootstrap", WRITE_CLASSES.READ),
  route(["GET"], /^\/api\/session$/, "viewer", "session.read", WRITE_CLASSES.READ),
  route(["GET"], /^\/api\/ops\/(?:summary|checks)$/, "admin", "operations.read"),
  route(["GET"], /^\/api\/export$/, "admin", "data.export"),
  route(["GET"], /^\/api\/politics\/health-committee$/, "viewer", "politics.health-committee.read", WRITE_CLASSES.READ),

  route(["GET"], /^\/api\/(?:contacts|contact-content-search|contact-notes|contact-note-attachments|organizations|organization-primary-systems|expert-groups|expert-contacts|expert-organizations|expert-entity-links|stakeholder-types|stakeholder-organizations|stakeholder-people|profiles|saved-views|user-settings|hospitation-slots|hospitations|hospitation-observations|roadmap-items|hospitation-roadmap-assessments|hospitation-unmet-needs|formats|activities|notifications|notifications\/summary)$/, "viewer", "collection.read", WRITE_CLASSES.READ),
  route(["GET"], /^\/api\/(?:contacts|organizations|formats|hospitations)\/[^/]+$/, "viewer", "entity.read", WRITE_CLASSES.READ),
  route(["GET"], /^\/api\/contacts\/[^/]+\/history$/, "viewer", "contact.history.read", WRITE_CLASSES.READ),
  route(["GET"], /^\/api\/(?:profile-avatar|contact-images|stakeholder-logos)\/[^/]+$/, "viewer", "image.read", WRITE_CLASSES.READ),
  route(["GET"], /^\/api\/contact-note-attachments\/[^/]+\/content$/, "viewer", "attachment.read", WRITE_CLASSES.READ),
  route(["GET"], /^\/api\/profile$/, "viewer", "profile.self.read", WRITE_CLASSES.READ),

  route(["PATCH"], /^\/api\/profile$/, "viewer", "profile.self.update", WRITE_CLASSES.SELF_SERVICE),
  route(["POST", "DELETE"], /^\/api\/profile\/avatar$/, "viewer", "profile.self.avatar", WRITE_CLASSES.RESTRICTED),
  route(["GET"], /^\/api\/saved-views$/, "viewer", "saved-view.self.read", WRITE_CLASSES.READ),
  route(["POST"], /^\/api\/saved-views$/, "viewer", "saved-view.self.create", WRITE_CLASSES.SELF_SERVICE),
  route(["PATCH", "DELETE"], /^\/api\/saved-views\/[^/]+$/, "viewer", "saved-view.self.write", WRITE_CLASSES.SELF_SERVICE),
  route(["GET"], /^\/api\/user-settings$/, "viewer", "settings.self.read", WRITE_CLASSES.READ),
  route(["PUT"], /^\/api\/user-settings$/, "viewer", "settings.self.write", WRITE_CLASSES.SELF_SERVICE),
  route(["GET"], /^\/api\/notifications(?:\/summary)?$/, "viewer", "notification.self.read", WRITE_CLASSES.READ),
  route(["PATCH"], /^\/api\/notifications\/(?:read|[^/]+\/read)$/, "viewer", "notification.self.acknowledge", WRITE_CLASSES.SELF_SERVICE),

  route(["POST"], /^\/api\/(?:contacts|organizations)$/, "editor", "test-object.create", WRITE_CLASSES.TEST_OBJECT_CREATE),
  route(["PATCH"], /^\/api\/(?:contacts|organizations)\/[^/]+$/, "editor", "test-object.update", WRITE_CLASSES.TEST_OBJECT_UPDATE),
  route(["POST", "PATCH"], /^\/api\/(?:contacts|organizations|organization-primary-systems|expert-contacts|expert-organizations|expert-entity-links|hospitation-slots|hospitations|hospitation-observations|formats)(?:\/[^/]+)?$/, "editor", "domain.write"),
  route(["POST"], /^\/api\/(?:contact-notes|contact-note-attachments)$/, "editor", "contact-note.write"),
  route(["PATCH", "DELETE"], /^\/api\/contact-notes\/[^/]+$/, "editor", "contact-note.owned.write"),
  route(["DELETE"], /^\/api\/contact-note-attachments\/[^/]+$/, "editor", "attachment.owned.delete"),
  route(["POST", "DELETE"], /^\/api\/contacts\/[^/]+\/image$/, "editor", "contact.image.write"),
  route(["PUT"], /^\/api\/hospitations\/[^/]+\/(?:observations\/sync|roadmap-assessments|unmet-needs)$/, "editor", "hospitation.detail.write"),
  route(["POST", "PATCH", "DELETE"], /^\/api\/formats\/[^/]+\/participants(?:\/(?!import$)[^/]+)?$/, "editor", "format.participant.write"),

  route(["POST"], /^\/api\/(?:stakeholder-import)$/, "admin", "bulk.import"),
  route(["POST"], /^\/api\/admin\/hospitation-import\/preview$/, "admin", "hospitation.import.preview"),
  route(["POST"], /^\/api\/admin\/hospitation-import\/apply$/, "admin", "hospitation.import.apply"),
  route(["POST"], /^\/api\/formats\/[^/]+\/participants\/import$/, "admin", "format.participant.import"),
  route(["POST"], /^\/api\/formats\/[^/]+\/(?:archive|restore)$/, "admin", "format.lifecycle.write"),
  route(["DELETE"], /^\/api\/(?:organization-primary-systems|expert-entity-links|hospitation-slots|hospitations|formats)\/[^/]+$/, "admin", "domain.delete"),

  // Absichtlich vorhandener, stets abgewiesener Activity-Writer. Der Dispatcher
  // liefert 405; die Route bleibt für authentifizierte Nutzer nachvollziehbar.
  route(["POST", "PUT", "PATCH", "DELETE"], /^\/api\/activities$/, "viewer", "activity.direct-write-denied")
]);

export function policyForRequest(method, pathname) {
  const normalizedMethod = String(method || "").toUpperCase();
  if (normalizedMethod === "OPTIONS") {
    return Object.freeze({ role: "public", id: "cors.preflight", writeClass: WRITE_CLASSES.READ });
  }
  return ROUTE_POLICIES.find((item) => item.methods.has(normalizedMethod) && item.pattern.test(pathname)) || null;
}

export function roleRank(role = "") {
  return ROLE_RANK[String(role || "").toLowerCase()] || 0;
}

export function accessScopeForProfile(profile = {}) {
  const scope = String(profile.access_scope || profile.accessScope || "standard").trim().toLowerCase();
  return ACCESS_SCOPES.has(scope) ? scope : "";
}

export function accessScopeRefForProfile(profile = {}) {
  return String(profile.scope_ref || profile.scopeRef || "").trim();
}

export function assertAccessScopePermission(profile, policy) {
  const accessScope = accessScopeForProfile(profile);
  const scopeRef = accessScopeRefForProfile(profile);
  if (accessScope === "standard" && !scopeRef) return;
  const allowed = new Set([
    WRITE_CLASSES.READ,
    WRITE_CLASSES.SELF_SERVICE,
    WRITE_CLASSES.TEST_OBJECT_CREATE,
    WRITE_CLASSES.TEST_OBJECT_UPDATE
  ]);
  if (accessScope !== "test_only" || !scopeRef || !allowed.has(policy?.writeClass)) {
    const error = new Error("Diese Aktion ist fuer den begrenzten Testzugang nicht freigegeben.");
    error.status = 403;
    throw error;
  }
}

export function sessionCapabilities(profile = {}) {
  const accessScope = accessScopeForProfile(profile);
  const scopeRef = accessScopeRefForProfile(profile);
  const rank = roleRank(profile.role);
  const standard = accessScope === "standard" && !scopeRef;
  const testOnly = accessScope === "test_only" && Boolean(scopeRef);
  return Object.freeze({
    canRead: rank >= roleRank("viewer") && (standard || testOnly),
    canSelfService: rank >= roleRank("viewer") && (standard || testOnly),
    canWriteDomain: standard && rank >= roleRank("editor"),
    canCreateTestObjects: testOnly && rank >= roleRank("editor"),
    canEditTestObjects: testOnly && rank >= roleRank("editor"),
    canDelete: standard && rank >= roleRank("admin"),
    canExport: standard && rank >= roleRank("admin"),
    canOperate: standard && rank >= roleRank("admin")
  });
}

export function assertIapJwtClaims(payload, expectedAudience, options = {}) {
  const now = Number.isFinite(options.nowSeconds)
    ? Number(options.nowSeconds)
    : Math.floor(Date.now() / 1000);
  const exp = payload?.exp;
  const iat = payload?.iat;
  const nbf = payload?.nbf;
  const numericDatesValid = typeof exp === "number"
    && Number.isFinite(exp)
    && typeof iat === "number"
    && Number.isFinite(iat)
    && (nbf == null || (typeof nbf === "number" && Number.isFinite(nbf)));
  const lifetime = numericDatesValid ? exp - iat : Number.NaN;
  const timeWindowValid = numericDatesValid
    && exp > iat
    && exp > now - IAP_CLOCK_SKEW_SECONDS
    && iat <= now + IAP_CLOCK_SKEW_SECONDS
    && (nbf == null || nbf <= now + IAP_CLOCK_SKEW_SECONDS)
    && (nbf == null || nbf <= exp)
    && lifetime <= IAP_MAX_TOKEN_LIFETIME_SECONDS + (2 * IAP_CLOCK_SKEW_SECONDS);
  if (
    payload?.iss !== IAP_ISSUER
    || payload?.aud !== expectedAudience
    || !timeWindowValid
  ) {
    const error = new Error("IAP-JWT-Claims oder Zeitfenster sind ungueltig.");
    error.status = 401;
    throw error;
  }
  return Object.freeze({ exp, iat, nbf: nbf ?? null });
}

function canonicalUtcTimestamp(value, label) {
  const timestamp = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp)) {
    throw new Error(`${label} muss ein kanonischer UTC-Zeitstempel sein.`);
  }
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${label} muss ein gueltiger UTC-Zeitstempel sein.`);
  }
  const milliseconds = parsed.toISOString();
  const seconds = milliseconds.replace(/\.000Z$/u, "Z");
  if (timestamp !== milliseconds && timestamp !== seconds) {
    throw new Error(`${label} muss ein kanonischer UTC-Zeitstempel sein.`);
  }
  return Object.freeze({ value: timestamp, milliseconds: parsed.getTime() });
}

export function validateIdentityConfiguration(env = process.env, options = {}) {
  const mode = String(env.API_AUTH_MODE || "").trim().toLowerCase();
  const production = env.NODE_ENV === "production";
  const devBypass = env.API_AUTH_ALLOW_DEV_PROFILE === "1" || env.API_AUTH_ALLOW_BEARER_DEV === "1";
  const supported = new Set(["iap", "oidc", "trusted-header"]);
  const iapIdentityMode = String(env.IAP_IDENTITY_MODE || "iam").trim().toLowerCase();
  let iapGcipProjectId = "";
  let iapGcipTenantId = "";
  let iapExternalAccessExpiresAt = "";
  let iapExternalAccessExpiresAtMs = 0;
  let iapExternalLoginPageUri = "";
  let iapExternalAuthApiKey = "";

  if (!supported.has(mode)) {
    throw new Error("API_AUTH_MODE muss explizit auf iap oder oidc gesetzt sein.");
  }
  if (!IAP_IDENTITY_MODES.has(iapIdentityMode)) {
    throw new Error("IAP_IDENTITY_MODE muss iam oder external sein.");
  }
  if (iapIdentityMode === "external" && mode !== "iap") {
    throw new Error("IAP_IDENTITY_MODE=external setzt API_AUTH_MODE=iap voraus.");
  }
  if (production && devBypass) {
    throw new Error("Entwicklungs-Authentifizierung darf in Produktion nicht aktiviert sein.");
  }
  if (production && mode === "trusted-header") {
    throw new Error("Unsignierte Identity-Header sind in Produktion nicht zulaessig; iap oder oidc verwenden.");
  }
  if (mode === "iap" && !String(env.IAP_JWT_AUDIENCE || "").trim()) {
    throw new Error("IAP_JWT_AUDIENCE ist fuer API_AUTH_MODE=iap zwingend erforderlich.");
  }
  if (mode === "iap" && iapIdentityMode === "external") {
    iapGcipProjectId = String(env.IAP_GCIP_PROJECT_ID || "").trim();
    iapGcipTenantId = String(env.IAP_GCIP_TENANT_ID || "").trim();
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(iapGcipProjectId)) {
      throw new Error("IAP_GCIP_PROJECT_ID muss eine kanonische Google-Cloud-Projekt-ID sein.");
    }
    if (iapGcipTenantId && !/^[A-Za-z0-9_-]{1,128}$/u.test(iapGcipTenantId)) {
      throw new Error("IAP_GCIP_TENANT_ID enthaelt unzulaessige Zeichen.");
    }
    iapExternalLoginPageUri = String(env.IAP_EXTERNAL_LOGIN_PAGE_URI || "").trim();
    let loginPageUrl;
    try {
      loginPageUrl = new URL(iapExternalLoginPageUri);
    } catch {
      throw new Error("IAP_EXTERNAL_LOGIN_PAGE_URI muss eine gueltige HTTPS-URL sein.");
    }
    if (
      loginPageUrl.protocol !== "https:"
      || loginPageUrl.username
      || loginPageUrl.password
      || loginPageUrl.search
      || loginPageUrl.hash
      || loginPageUrl.href !== iapExternalLoginPageUri
    ) {
      throw new Error("IAP_EXTERNAL_LOGIN_PAGE_URI muss eine kanonische HTTPS-URL ohne Zugangsdaten, Query oder Fragment sein.");
    }
    iapExternalAuthApiKey = String(env.IAP_EXTERNAL_AUTH_API_KEY || "").trim();
    if (!/^AIza[0-9A-Za-z_-]{35}$/u.test(iapExternalAuthApiKey)) {
      throw new Error("IAP_EXTERNAL_AUTH_API_KEY muss der gepinnte Identity-Platform-Web-API-Key sein.");
    }
    const expiry = canonicalUtcTimestamp(
      env.IAP_EXTERNAL_ACCESS_EXPIRES_AT,
      "IAP_EXTERNAL_ACCESS_EXPIRES_AT"
    );
    const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
    if (expiry.milliseconds <= nowMs) {
      throw new Error("IAP_EXTERNAL_ACCESS_EXPIRES_AT muss beim Start in der Zukunft liegen.");
    }
    if (expiry.milliseconds - nowMs > IAP_EXTERNAL_MAX_DURATION_MS) {
      throw new Error("IAP_EXTERNAL_ACCESS_EXPIRES_AT darf hoechstens 62 Tage in der Zukunft liegen.");
    }
    iapExternalAccessExpiresAt = expiry.value;
    iapExternalAccessExpiresAtMs = expiry.milliseconds;
  }
  if (mode === "oidc") {
    const issuer = String(env.OIDC_ISSUER || "").trim();
    const audience = String(env.OIDC_AUDIENCE || "").trim();
    const jwksUrl = String(env.OIDC_JWKS_URL || "").trim();
    if (!issuer || !audience || !jwksUrl) {
      throw new Error("OIDC_ISSUER, OIDC_AUDIENCE und OIDC_JWKS_URL sind fuer API_AUTH_MODE=oidc erforderlich.");
    }
    for (const [label, value] of [["OIDC_ISSUER", issuer], ["OIDC_JWKS_URL", jwksUrl]]) {
      let parsed;
      try { parsed = new URL(value); } catch { throw new Error(`${label} ist keine gueltige URL.`); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
        throw new Error(`${label} muss eine HTTPS-URL ohne Zugangsdaten oder Fragment sein.`);
      }
    }
  }
  return Object.freeze({
    mode,
    production,
    devBypass,
    iapIdentityMode,
    iapGcipProjectId,
    iapGcipTenantId,
    iapExternalAccessExpiresAt,
    iapExternalAccessExpiresAtMs,
    iapExternalLoginPageUri,
    iapExternalAuthApiKey
  });
}

function externalIdentityError(status, message) {
  return Object.assign(new Error(message), { status });
}

function parsedGcipClaim(value) {
  try {
    let serialized;
    if (typeof value === "string") {
      serialized = value;
    } else if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype
    ) {
      serialized = JSON.stringify(value);
    } else {
      throw new Error("GCIP-Claim ist kein einfaches JSON-Objekt.");
    }
    if (
      typeof serialized !== "string"
      || !serialized
      || Buffer.byteLength(serialized, "utf8") > IAP_GCIP_CLAIM_MAX_BYTES
    ) {
      throw new Error("GCIP-Claim ist leer oder zu gross.");
    }
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("GCIP-Claim ist kein Objekt.");
    }
    return parsed;
  } catch (cause) {
    if (cause?.status) throw cause;
    throw externalIdentityError(401, "IAP-JWT enthaelt keinen gueltigen GCIP-Claim.");
  }
}

function verifiedExternalEmail(value) {
  const email = typeof value === "string" ? value.trim() : "";
  const firstAt = email.indexOf("@");
  if (
    !email
    || value !== email
    || email.length > 320
    || !/^[!-~]+$/u.test(email)
    || firstAt <= 0
    || firstAt !== email.lastIndexOf("@")
    || firstAt === email.length - 1
  ) {
    throw externalIdentityError(401, "GCIP-Claim enthaelt keine gueltige verifizierte E-Mail-Adresse.");
  }
  return email;
}

export function assertIapExternalIdentityClaims(payload, identityConfiguration, options = {}) {
  if (identityConfiguration?.iapIdentityMode !== "external") {
    throw new TypeError("External-Identity-Pruefung setzt IAP_IDENTITY_MODE=external voraus.");
  }
  assertIapExternalAccessWindow(identityConfiguration, options);

  const gcip = parsedGcipClaim(payload?.gcip);
  const firebase = gcip.firebase;
  if (!firebase || typeof firebase !== "object" || Array.isArray(firebase)) {
    throw externalIdentityError(401, "GCIP-Claim enthaelt keine Provider-Information.");
  }
  const provider = String(firebase.sign_in_provider || "");
  if (!IAP_EXTERNAL_SIGN_IN_PROVIDERS.has(provider)) {
    throw externalIdentityError(401, "GCIP-Provider ist fuer diesen Zugang nicht freigegeben.");
  }
  if (gcip.email_verified !== true) {
    throw externalIdentityError(401, "GCIP-E-Mail-Adresse ist nicht verifiziert.");
  }

  const innerEmail = verifiedExternalEmail(gcip.email);
  const innerSubject = typeof gcip.sub === "string" ? gcip.sub : "";
  if (
    !innerSubject
    || innerSubject !== innerSubject.trim()
    || innerSubject.length > 128
    || /[\u0000-\u001f\u007f]/u.test(innerSubject)
  ) {
    throw externalIdentityError(401, "GCIP-Claim enthaelt keinen stabilen Subject-Identifier.");
  }

  const projectId = String(identityConfiguration.iapGcipProjectId || "");
  const tenantId = String(identityConfiguration.iapGcipTenantId || "");
  const claimTenantId = firebase.tenant == null ? "" : String(firebase.tenant);
  if (claimTenantId !== tenantId) {
    throw externalIdentityError(401, "GCIP-Tenant passt nicht zur freigegebenen IAP-Konfiguration.");
  }
  const namespace = `securetoken.google.com/${projectId}${tenantId ? `/${tenantId}` : ""}`;
  const subject = `${namespace}:${innerSubject}`;
  const namespacedEmail = `${namespace}:${innerEmail}`;
  if (payload?.sub !== subject || payload?.email !== namespacedEmail) {
    throw externalIdentityError(401, "IAP- und GCIP-Identitaetsclaims sind nicht konsistent.");
  }

  return Object.freeze({
    subject,
    email: innerEmail.toLowerCase(),
    provider,
    tenantId
  });
}

export function assertIapExternalAccessWindow(identityConfiguration, options = {}) {
  if (identityConfiguration?.iapIdentityMode !== "external") {
    throw new TypeError("External-Identity-Ablaufpruefung setzt IAP_IDENTITY_MODE=external voraus.");
  }
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const expiresAtMs = Number(identityConfiguration.iapExternalAccessExpiresAtMs);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0 || nowMs >= expiresAtMs) {
    throw externalIdentityError(403, "Der befristete External-Identity-Zugang ist abgelaufen.");
  }
}

export function assertIapNativeIdentityClaims(payload) {
  if (payload?.gcip != null) {
    throw externalIdentityError(401, "GCIP-Claim ist im nativen IAP/IAM-Modus nicht zulaessig.");
  }
}

export function requireSingleActiveIdentityProfile(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") {
    throw externalIdentityError(403, "Anmeldung nicht möglich.");
  }
  return rows[0];
}

export function validateAllowedOriginConfiguration(env = process.env) {
  const configured = String(env.ALLOWED_ORIGIN || "").trim();
  const production = env.NODE_ENV === "production";
  if (!configured) {
    if (production) throw new Error("ALLOWED_ORIGIN ist fuer den produktiven Browser-/API-Vertrag zwingend erforderlich.");
    return "";
  }
  let parsed;
  try { parsed = new URL(configured); } catch { throw new Error("ALLOWED_ORIGIN ist keine gueltige URL."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("ALLOWED_ORIGIN muss ein exakter HTTP(S)-Origin ohne Zugangsdaten, Pfad, Query oder Fragment sein.");
  }
  if (production && parsed.protocol !== "https:") {
    throw new Error("ALLOWED_ORIGIN muss in Produktion HTTPS verwenden.");
  }
  return parsed.origin;
}

export function assertSensitiveQueryPermission(profile, searchParams) {
  const asksForRestrictedRows = ["includeArchived", "includeInactive"].some((name) => searchParams.get(name) === "true");
  if (asksForRestrictedRows && roleRank(profile?.role) < roleRank("admin")) {
    const error = new Error("Archivierte oder inaktive Datensaetze duerfen nur Admins abrufen.");
    error.status = 403;
    throw error;
  }
}
