import assert from "node:assert/strict";

import { normalizedRequestLogPath } from "../api/request-log-privacy.mjs";

for (const [pathname, expected] of [
  ["/api/contacts", "/api/contacts"],
  ["/api/profile-avatar/profile-secret-123", "/api/profile-avatar/:id"],
  ["/api/contact-images/contact-secret-123", "/api/contact-images/:id"],
  ["/api/stakeholder-logos/stakeholder-secret-123", "/api/stakeholder-logos/:id"],
  ["/api/contact-note-attachments/attachment-secret/content", "/api/contact-note-attachments/:id/content"],
  ["/api/contacts/contact-secret/history", "/api/contacts/:id/history"],
  ["/api/contacts/contact-secret/image", "/api/contacts/:id/image"],
  ["/api/hospitations/hospitation-secret/observations/sync", "/api/hospitations/:id/observations/sync"],
  ["/api/formats/format-secret/participants/contact-secret", "/api/formats/:id/participants/:participantId"],
  ["/api/notifications/event-secret/read", "/api/notifications/:id/read"],
  ["/api/unmatched/person%40example.invalid", "/api/:unmatched"],
  ["/private/person-secret", "/:unmatched"]
]) {
  const normalized = normalizedRequestLogPath(pathname);
  assert.equal(normalized, expected);
  for (const sensitive of ["secret", "example.invalid", "%40"]) {
    assert.doesNotMatch(normalized, new RegExp(sensitive, "u"));
  }
}

console.log("Request log privacy contract OK: dynamic identifiers are replaced by route placeholders.");
