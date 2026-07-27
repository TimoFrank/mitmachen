const STATIC_API_PATHS = new Set([
  "/healthz",
  "/readyz",
  "/api/healthz",
  "/api/readyz",
  "/api/activities",
  "/api/admin/hospitation-import/apply",
  "/api/admin/hospitation-import/preview",
  "/api/auth/bootstrap",
  "/api/contact-content-search",
  "/api/contact-note-attachments",
  "/api/contact-notes",
  "/api/contacts",
  "/api/expert-contacts",
  "/api/expert-entity-links",
  "/api/expert-groups",
  "/api/expert-organizations",
  "/api/export",
  "/api/formats",
  "/api/hospitation-observations",
  "/api/hospitation-roadmap-assessments",
  "/api/hospitation-slots",
  "/api/hospitation-unmet-needs",
  "/api/hospitations",
  "/api/notifications",
  "/api/notifications/read",
  "/api/notifications/summary",
  "/api/ops/checks",
  "/api/ops/summary",
  "/api/organization-primary-systems",
  "/api/organizations",
  "/api/profile",
  "/api/profile/avatar",
  "/api/profiles",
  "/api/roadmap-items",
  "/api/saved-views",
  "/api/session",
  "/api/stakeholder-import",
  "/api/stakeholder-organizations",
  "/api/stakeholder-people",
  "/api/stakeholder-types",
  "/api/user-settings"
]);

const DYNAMIC_API_PATHS = Object.freeze([
  [/^\/api\/contact-note-attachments\/[^/]+\/content$/u, "/api/contact-note-attachments/:id/content"],
  [/^\/api\/contacts\/[^/]+\/(?:history|image)$/u, (pathname) => (
    pathname.endsWith("/history") ? "/api/contacts/:id/history" : "/api/contacts/:id/image"
  )],
  [/^\/api\/hospitations\/[^/]+\/observations\/sync$/u, "/api/hospitations/:id/observations/sync"],
  [/^\/api\/hospitations\/[^/]+\/(?:roadmap-assessments|unmet-needs)$/u, (pathname) => (
    pathname.endsWith("/roadmap-assessments")
      ? "/api/hospitations/:id/roadmap-assessments"
      : "/api/hospitations/:id/unmet-needs"
  )],
  [/^\/api\/formats\/[^/]+\/participants\/import$/u, "/api/formats/:id/participants/import"],
  [/^\/api\/formats\/[^/]+\/participants\/[^/]+$/u, "/api/formats/:id/participants/:participantId"],
  [/^\/api\/formats\/[^/]+\/participants$/u, "/api/formats/:id/participants"],
  [/^\/api\/notifications\/[^/]+\/read$/u, "/api/notifications/:id/read"],
  [/^\/api\/(?:profile-avatar|contact-images|stakeholder-logos)\/[^/]+$/u, (pathname) => (
    `/${pathname.split("/").slice(1, 3).join("/")}/:id`
  )],
  [/^\/api\/(?:contact-notes|contact-note-attachments|expert-contacts|organizations|organization-primary-systems|saved-views|expert-entity-links|hospitation-slots|hospitations|hospitation-observations|formats|contacts)\/[^/]+$/u, (pathname) => (
    `/${pathname.split("/").slice(1, 3).join("/")}/:id`
  )]
]);

export function normalizedRequestLogPath(pathname) {
  const value = typeof pathname === "string" ? pathname : "";
  if (STATIC_API_PATHS.has(value)) return value;
  for (const [pattern, replacement] of DYNAMIC_API_PATHS) {
    if (!pattern.test(value)) continue;
    return typeof replacement === "function" ? replacement(value) : replacement;
  }
  return value.startsWith("/api/") ? "/api/:unmatched" : "/:unmatched";
}
