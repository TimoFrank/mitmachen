const ROLE_RANK = Object.freeze({ viewer: 1, editor: 2, admin: 3 });

function route(methods, pattern, role, id) {
  return Object.freeze({ methods: new Set(methods), pattern, role, id });
}

// Jede produktive API-Route muss hier explizit eingetragen sein. Neue Routen sind
// dadurch bis zu einer bewussten Berechtigungsentscheidung automatisch gesperrt.
export const ROUTE_POLICIES = Object.freeze([
  route(["GET"], /^\/(?:api\/)?(?:healthz|readyz)$/, "public", "health"),
  route(["GET"], /^\/api\/auth\/bootstrap$/, "public", "auth.bootstrap"),
  route(["GET"], /^\/api\/session$/, "viewer", "session.read"),
  route(["GET"], /^\/api\/ops\/(?:summary|checks)$/, "admin", "operations.read"),
  route(["GET"], /^\/api\/export$/, "admin", "data.export"),

  route(["GET"], /^\/api\/(?:contacts|contact-content-search|contact-notes|contact-note-attachments|organizations|organization-primary-systems|expert-groups|expert-contacts|expert-organizations|expert-entity-links|stakeholder-types|stakeholder-organizations|stakeholder-people|profiles|saved-views|user-settings|hospitation-slots|hospitations|hospitation-observations|roadmap-items|hospitation-roadmap-assessments|hospitation-unmet-needs|formats|activities|notifications|notifications\/summary)$/, "viewer", "collection.read"),
  route(["GET"], /^\/api\/(?:contacts|organizations|formats|hospitations)\/[^/]+$/, "viewer", "entity.read"),
  route(["GET"], /^\/api\/contacts\/[^/]+\/history$/, "viewer", "contact.history.read"),
  route(["GET"], /^\/api\/(?:profile-avatar|contact-images)\/[^/]+$/, "viewer", "image.read"),
  route(["GET"], /^\/api\/contact-note-attachments\/[^/]+\/content$/, "viewer", "attachment.read"),
  route(["GET"], /^\/api\/profile$/, "viewer", "profile.self.read"),

  route(["PATCH"], /^\/api\/profile$/, "viewer", "profile.self.update"),
  route(["POST", "DELETE"], /^\/api\/profile\/avatar$/, "viewer", "profile.self.avatar"),
  route(["GET", "POST"], /^\/api\/saved-views$/, "viewer", "saved-view.self.collection"),
  route(["PATCH", "DELETE"], /^\/api\/saved-views\/[^/]+$/, "viewer", "saved-view.self.write"),
  route(["GET", "PUT"], /^\/api\/user-settings$/, "viewer", "settings.self"),
  route(["GET"], /^\/api\/notifications(?:\/summary)?$/, "viewer", "notification.self.read"),
  route(["PATCH"], /^\/api\/notifications\/(?:read|[^/]+\/read)$/, "viewer", "notification.self.acknowledge"),

  route(["POST", "PATCH"], /^\/api\/(?:contacts|organizations|organization-primary-systems|expert-contacts|expert-organizations|expert-entity-links|hospitation-slots|hospitations|hospitation-observations|formats)(?:\/[^/]+)?$/, "editor", "domain.write"),
  route(["POST"], /^\/api\/(?:contact-notes|contact-note-attachments)$/, "editor", "contact-note.write"),
  route(["PATCH", "DELETE"], /^\/api\/contact-notes\/[^/]+$/, "editor", "contact-note.owned.write"),
  route(["DELETE"], /^\/api\/contact-note-attachments\/[^/]+$/, "editor", "attachment.owned.delete"),
  route(["POST", "DELETE"], /^\/api\/contacts\/[^/]+\/image$/, "editor", "contact.image.write"),
  route(["PUT"], /^\/api\/hospitations\/[^/]+\/(?:observations\/sync|roadmap-assessments|unmet-needs)$/, "editor", "hospitation.detail.write"),
  route(["POST", "PATCH", "DELETE"], /^\/api\/formats\/[^/]+\/participants(?:\/(?!import$)[^/]+)?$/, "editor", "format.participant.write"),

  route(["POST"], /^\/api\/(?:stakeholder-import)$/, "admin", "bulk.import"),
  route(["POST"], /^\/api\/formats\/[^/]+\/participants\/import$/, "admin", "format.participant.import"),
  route(["DELETE"], /^\/api\/(?:organization-primary-systems|expert-entity-links|hospitation-slots|hospitations|formats)\/[^/]+$/, "admin", "domain.delete"),

  // Absichtlich vorhandener, stets abgewiesener Activity-Writer. Der Dispatcher
  // liefert 405; die Route bleibt für authentifizierte Nutzer nachvollziehbar.
  route(["POST", "PUT", "PATCH", "DELETE"], /^\/api\/activities$/, "viewer", "activity.direct-write-denied")
]);

export function policyForRequest(method, pathname) {
  const normalizedMethod = String(method || "").toUpperCase();
  if (normalizedMethod === "OPTIONS") return Object.freeze({ role: "public", id: "cors.preflight" });
  return ROUTE_POLICIES.find((item) => item.methods.has(normalizedMethod) && item.pattern.test(pathname)) || null;
}

export function roleRank(role = "") {
  return ROLE_RANK[String(role || "").toLowerCase()] || 0;
}

export function validateIdentityConfiguration(env = process.env) {
  const mode = String(env.API_AUTH_MODE || "").trim().toLowerCase();
  const production = env.NODE_ENV === "production";
  const devBypass = env.API_AUTH_ALLOW_DEV_PROFILE === "1" || env.API_AUTH_ALLOW_BEARER_DEV === "1";
  const supported = new Set(["iap", "oidc", "trusted-header"]);

  if (!supported.has(mode)) {
    throw new Error("API_AUTH_MODE muss explizit auf iap oder oidc gesetzt sein.");
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
  return Object.freeze({ mode, production, devBypass });
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
