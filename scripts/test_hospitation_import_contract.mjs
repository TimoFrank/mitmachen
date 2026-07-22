import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  HOSPITATION_IMPORT_CONFIRMATION,
  HOSPITATION_IMPORT_SCHEMA_VERSION,
  buildHospitationImportPlan,
  manifestFingerprint,
  normalizeHospitationImportManifest,
  targetFingerprint
} from "../api/hospitation-import.mjs";
import { normalizedRequestLogPath } from "../api/request-log-privacy.mjs";
import { policyForRequest } from "../api/security-policy.mjs";

const owner = {
  id: "profile-timo-production",
  display_name: "Timo Frank",
  role: "admin",
  active: true
};

function manifest(overrides = {}) {
  return {
    schemaVersion: HOSPITATION_IMPORT_SCHEMA_VERSION,
    snapshot: {
      id: "snapshot-2026-07-22T120000Z",
      createdAt: "2026-07-22T12:00:00.000Z",
      source: "local-hospitation"
    },
    ownerRef: "timo-frank",
    organizations: [{
      id: "local-org-medici",
      name: "MEDICI WIESBADEN",
      city: "Wiesbaden",
      sector: "Praxis",
      status: "active"
    }],
    contacts: [{
      id: "local-contact-koehler",
      name: "Dr. Christian Köhler",
      organizationId: "local-org-medici",
      organization: "MEDICI WIESBADEN",
      city: "Wiesbaden",
      sector: "Praxis",
      topics: ["Versorgung"],
      status: "active"
    }],
    hospitations: [{
      id: "hospitation-2026-07-16-koehler",
      contactId: "local-contact-koehler",
      contactName: "Dr. Christian Köhler",
      organizationId: "local-org-medici",
      organizationName: "MEDICI WIESBADEN",
      startsAt: "2026-07-16T06:15:00.000Z",
      endsAt: "2026-07-16T15:37:00.000Z",
      city: "Wiesbaden",
      status: "Dokumentiert"
    }],
    observations: [{
      id: "obs-koehler-01",
      hospitationId: "hospitation-2026-07-16-koehler",
      sequence: 1,
      title: "Lokaler Ablauf",
      situationContext: "Anmeldung",
      observed: "Der Ablauf wurde direkt beobachtet.",
      evidenceType: "directly_observed",
      affectedRoles: ["Hausarzt"],
      status: "active",
      createdAt: "2026-07-16T06:20:00.000Z",
      updatedAt: "2026-07-16T16:00:00.000Z"
    }],
    ...overrides
  };
}

const normalized = normalizeHospitationImportManifest(manifest());
assert.equal(normalized.schemaVersion, HOSPITATION_IMPORT_SCHEMA_VERSION);
assert.equal(normalized.snapshot.createdAt, "2026-07-22T12:00:00.000Z");
assert.equal(manifestFingerprint(normalized), manifestFingerprint(normalizeHospitationImportManifest(manifest())));

const emptyTarget = {
  organizations: [], contacts: [], contact_owners: [], hospitations: [], hospitation_observations: []
};
const createPlan = buildHospitationImportPlan(normalized, emptyTarget, owner);
assert.deepEqual(createPlan.summary.total, { total: 4, create: 4, update: 0, unchanged: 0, conflict: 0 });
assert.equal(createPlan.canApply, true);
assert.equal(createPlan.items.contacts[0].record.owner_id, owner.id);
assert.equal(createPlan.items.hospitations[0].record.owner_id, owner.id);
assert.equal(createPlan.items.hospitations[0].record.requester_profile_id, owner.id);
assert.equal(createPlan.items.hospitations[0].record.documented_by, owner.id);
assert.ok(!Object.hasOwn(createPlan.items.observations[0].record.payload, "createdAt"));
assert.ok(!Object.hasOwn(createPlan.items.observations[0].record.payload, "updatedAt"));
assert.deepEqual(Object.keys(createPlan.publicItems.observations[0]).sort(), ["action", "changedFields", "entityType", "sourceId", "targetId"]);
assert.doesNotMatch(JSON.stringify(createPlan.publicItems), /Lokaler Ablauf/u);

const appliedTarget = {
  organizations: createPlan.items.organizations.map((item) => ({ ...item.record, created_at: "2026-07-22T12:01:00.000Z" })),
  contacts: createPlan.items.contacts.map((item) => ({ ...item.record, created_at: "2026-07-22T12:01:00.000Z" })),
  contact_owners: [{ contact_id: "local-contact-koehler", profile_id: owner.id, assigned_at: "2026-07-22T12:01:00.000Z", assigned_by: owner.id }],
  hospitations: createPlan.items.hospitations.map((item) => ({
    ...item.record,
    requester_profile_id: "existing-requester",
    documented_by: "existing-documenter",
    topics: ["Produktives Thema"],
    documentation_summary: "Produktive Zusammenfassung bleibt erhalten",
    created_at: "2026-07-22T12:01:00.000Z"
  })),
  hospitation_observations: [
    ...createPlan.items.observations.map((item) => ({ ...item.record, created_at: "2026-07-22T12:01:00.000Z" })),
    {
      id: "production-observation-not-in-manifest",
      hospitation_id: "hospitation-2026-07-16-koehler",
      sequence: 99,
      title: "Bestehende Produktionsbeobachtung",
      evidence_type: "interpreted",
      status: "active"
    }
  ]
};
const secondPreview = buildHospitationImportPlan(normalized, appliedTarget, owner);
assert.deepEqual(secondPreview.summary.total, { total: 4, create: 0, update: 0, unchanged: 4, conflict: 0 });
assert.equal(secondPreview.canApply, false);
assert.equal(secondPreview.items.observations.length, 1, "Nicht im Manifest enthaltene Beobachtungen werden nicht archiviert oder veraendert.");
assert.ok(secondPreview.items.observations.every((item) => item.action === "unchanged"));
assert.ok(!secondPreview.items.hospitations[0].changedFields.includes("topics"));
assert.ok(!secondPreview.items.hospitations[0].changedFields.includes("documentation_summary"));
assert.ok(!secondPreview.items.hospitations[0].changedFields.includes("requester_profile_id"));
assert.ok(!secondPreview.items.hospitations[0].changedFields.includes("documented_by"));

const enrichedManifest = normalizeHospitationImportManifest(manifest({
  hospitations: [{
    ...manifest().hospitations[0],
    topics: ["Neues Thema"],
    documentationSummary: "Neue freigegebene Zusammenfassung"
  }]
}));
const enrichedPlan = buildHospitationImportPlan(enrichedManifest, appliedTarget, owner);
assert.ok(enrichedPlan.items.hospitations[0].changedFields.includes("topics"));
assert.ok(enrichedPlan.items.hospitations[0].changedFields.includes("documentation_summary"));

const ownerRelationMissing = { ...appliedTarget, contact_owners: [] };
const ownerPlan = buildHospitationImportPlan(normalized, ownerRelationMissing, owner);
assert.equal(ownerPlan.items.contacts[0].action, "update");
assert.deepEqual(ownerPlan.items.contacts[0].changedFields, ["ownerIds"]);

const legacyOwnerId = "profile-existing-owner";
const archivedTarget = {
  ...appliedTarget,
  organizations: appliedTarget.organizations.map((row) => ({ ...row, status: "archived" })),
  contacts: appliedTarget.contacts.map((row) => ({ ...row, owner_id: legacyOwnerId, status: "archived" })),
  contact_owners: [{ contact_id: "local-contact-koehler", profile_id: legacyOwnerId }],
  hospitations: appliedTarget.hospitations.map((row) => ({ ...row, owner_id: legacyOwnerId, status: "Archiviert" }))
};
const archivedPlan = buildHospitationImportPlan(normalized, archivedTarget, owner);
for (const entityType of ["organizations", "contacts", "hospitations"]) {
  assert.ok(!archivedPlan.items[entityType][0].changedFields.includes("status"), `${entityType} duerfen durch den Staging-Import nicht reaktiviert werden.`);
}
assert.ok(!archivedPlan.items.contacts[0].changedFields.includes("owner_id"), "Ein bestehender Primaer-Owner darf nicht ersetzt werden.");
assert.ok(!archivedPlan.items.hospitations[0].changedFields.includes("owner_id"), "Ein bestehender Termin-Owner darf nicht ersetzt werden.");
assert.ok(archivedPlan.items.contacts[0].changedFields.includes("ownerIds"), "Timo Frank wird als additive Kontakt-Owner-Relation ergaenzt.");

const terminalStatusTarget = {
  ...appliedTarget,
  hospitations: appliedTarget.hospitations.map((row) => ({ ...row, status: "Abgesagt" }))
};
const terminalStatusPlan = buildHospitationImportPlan(normalized, terminalStatusTarget, owner);
assert.ok(!terminalStatusPlan.items.hospitations[0].changedFields.includes("status"), "Ein terminaler Terminstatus darf nicht ueberschrieben werden.");

const documentedTarget = {
  ...appliedTarget,
  hospitations: appliedTarget.hospitations.map((row) => ({ ...row, status: "Dokumentiert" }))
};
const bookedManifest = normalizeHospitationImportManifest(manifest({
  hospitations: [{ ...manifest().hospitations[0], status: "Gebucht" }]
}));
const statusRegressionPlan = buildHospitationImportPlan(bookedManifest, documentedTarget, owner);
assert.ok(!statusRegressionPlan.items.hospitations[0].changedFields.includes("status"), "Ein Terminstatus darf nicht zurueckgestuft werden.");

const bookedTarget = {
  ...appliedTarget,
  hospitations: appliedTarget.hospitations.map((row) => ({ ...row, status: "Gebucht" }))
};
const statusProgressionPlan = buildHospitationImportPlan(normalized, bookedTarget, owner);
assert.ok(statusProgressionPlan.items.hospitations[0].changedFields.includes("status"), "Ein normaler Terminstatus darf bis Dokumentiert fortschreiten.");

const sameNameOtherCity = {
  ...emptyTarget,
  organizations: [{ id: "existing-medici-berlin", name: "MEDICI WIESBADEN", normalized_name: "medici wiesbaden", city: "Berlin" }]
};
assert.equal(buildHospitationImportPlan(normalized, sameNameOtherCity, owner).items.organizations[0].action, "create");

const noCityManifest = normalizeHospitationImportManifest(manifest({
  organizations: [{ id: "local-org-medici", name: "MEDICI WIESBADEN", sector: "Praxis", status: "active" }]
}));
const uniqueNameTarget = {
  ...emptyTarget,
  organizations: [{ id: "existing-medici", name: "MEDICI WIESBADEN", normalized_name: "medici wiesbaden", city: "Wiesbaden", sector: "Praxis", status: "active" }]
};
assert.equal(buildHospitationImportPlan(noCityManifest, uniqueNameTarget, owner).items.organizations[0].targetId, "existing-medici");

const stableIdNaturalCollision = {
  ...emptyTarget,
  organizations: [
    { id: "local-org-medici", name: "Alter Organisationsname", normalized_name: "alter organisationsname", city: "Wiesbaden" },
    { id: "other-production-org", name: "MEDICI WIESBADEN", normalized_name: "medici wiesbaden", city: "Wiesbaden" }
  ]
};
const stableIdCollisionPlan = buildHospitationImportPlan(normalized, stableIdNaturalCollision, owner);
assert.equal(stableIdCollisionPlan.items.organizations[0].action, "conflict");
assert.equal(stableIdCollisionPlan.conflicts[0].code, "natural_key_owned_by_other_id");

const duplicateTargetManifest = normalizeHospitationImportManifest(manifest({
  organizations: [
    { id: "prod-org-beta", name: "Alpha Praxis", city: "Berlin", sector: "Praxis", status: "active" },
    { id: "local-org-beta", name: "Beta Praxis", city: "Berlin", sector: "Praxis", status: "active" }
  ],
  contacts: [{ ...manifest().contacts[0], organizationId: "prod-org-beta", organization: "Alpha Praxis" }],
  hospitations: [{ ...manifest().hospitations[0], organizationId: "prod-org-beta", organizationName: "Alpha Praxis" }]
}));
const duplicateTarget = {
  ...emptyTarget,
  organizations: [{ id: "prod-org-beta", name: "Beta Praxis", normalized_name: "beta praxis", city: "Berlin", sector: "Praxis", status: "active" }]
};
const duplicateTargetPlan = buildHospitationImportPlan(duplicateTargetManifest, duplicateTarget, owner);
const duplicateOrganization = duplicateTargetPlan.items.organizations.find((item) => item.sourceId === "local-org-beta");
assert.equal(duplicateOrganization.action, "conflict");
assert.equal(duplicateTargetPlan.conflicts.find((item) => item.sourceId === "local-org-beta")?.code, "duplicate_target_mapping");

const observationCollision = {
  ...emptyTarget,
  hospitation_observations: [{
    id: "different-stable-id",
    hospitation_id: "hospitation-2026-07-16-koehler",
    sequence: 1,
    title: "Lokaler Ablauf",
    evidence_type: "interpreted",
    status: "active"
  }]
};
const observationCollisionPlan = buildHospitationImportPlan(normalized, observationCollision, owner);
assert.equal(observationCollisionPlan.items.observations[0].action, "conflict");
assert.equal(observationCollisionPlan.conflicts[0].code, "natural_key_owned_by_other_id");

const observationStableIdCollision = {
  ...emptyTarget,
  hospitation_observations: [
    {
      id: "obs-koehler-01",
      hospitation_id: "hospitation-2026-07-16-koehler",
      sequence: 1,
      title: "Bisheriger Titel",
      evidence_type: "interpreted",
      status: "active"
    },
    {
      id: "other-observation-id",
      hospitation_id: "hospitation-2026-07-16-koehler",
      sequence: 1,
      title: "Lokaler Ablauf",
      evidence_type: "interpreted",
      status: "active"
    }
  ]
};
const observationStableCollisionPlan = buildHospitationImportPlan(normalized, observationStableIdCollision, owner);
assert.equal(observationStableCollisionPlan.items.observations[0].action, "conflict");
assert.equal(observationStableCollisionPlan.conflicts[0].code, "natural_key_owned_by_other_id");

const sparseObservationManifest = normalizeHospitationImportManifest(manifest({
  observations: [{
    id: "obs-koehler-01",
    hospitationId: "hospitation-2026-07-16-koehler",
    title: "Lokaler Ablauf",
    immediateConsequence: "",
    externalUseAllowed: false,
    status: "active"
  }]
}));
const sparseObservationTarget = {
  ...emptyTarget,
  hospitation_observations: [{
    id: "obs-koehler-01",
    hospitation_id: "hospitation-2026-07-16-koehler",
    title: "Lokaler Ablauf",
    description: "Produktiver Text bleibt erhalten",
    evidence_type: "reported",
    status: "archived",
    archived_at: "2026-07-20T10:00:00.000Z",
    archived_by: owner.id,
    payload: { legacy: true, immediateConsequence: "Produktive Folge bleibt erhalten", status: "archived" }
  }]
};
const sparseObservationPlan = buildHospitationImportPlan(sparseObservationManifest, sparseObservationTarget, owner);
const sparseFields = sparseObservationPlan.items.observations[0].changedFields;
assert.deepEqual(sparseFields, ["payload"]);
assert.ok(!sparseFields.includes("description") && !sparseFields.includes("status") && !sparseFields.includes("archived_at"));
assert.equal(sparseObservationPlan.items.observations[0].record.payload.legacy, true, "Produktive payload-only Felder bleiben beim ergänzenden Merge erhalten.");
assert.equal(sparseObservationPlan.items.observations[0].record.payload.immediateConsequence, "Produktive Folge bleibt erhalten");
assert.equal(sparseObservationPlan.items.observations[0].record.payload.externalUseAllowed, false, "Explizite boolesche false-Werte werden übernommen.");
assert.equal(sparseObservationPlan.items.observations[0].record.payload.status, "archived", "Ein aktiver Staging-Status reaktiviert keine produktiv archivierte Beobachtung.");

assert.throws(
  () => normalizeHospitationImportManifest(manifest({
    contacts: [{ id: "contact-with-image", name: "Bildkontakt", imageUrl: "data:image/png;base64,AA==" }]
  })),
  /keine Bilder/u
);
assert.throws(
  () => normalizeHospitationImportManifest(manifest({ ownerRef: "arbitrary-admin" })),
  /ownerRef/u
);
assert.throws(
  () => normalizeHospitationImportManifest(manifest({
    organizations: [{ id: "unknown-sector-org", name: "Unbekannter Sektor", sector: "Weltraummedizin" }]
  })),
  /Unbekannter Versorgungssektor/u
);
assert.throws(
  () => normalizeHospitationImportManifest(manifest({
    observations: [{ id: "broken-observation", hospitationId: "missing-hospitation", title: "Defekte Referenz" }]
  })),
  /nicht im Snapshot enthaltene Hospitation/u
);

const firstTargetFingerprint = targetFingerprint(emptyTarget, owner);
const changedTargetFingerprint = targetFingerprint({ ...emptyTarget, organizations: [{ id: "x", name: "X" }] }, owner);
assert.notEqual(firstTargetFingerprint, changedTargetFingerprint);
assert.match(firstTargetFingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(HOSPITATION_IMPORT_CONFIRMATION, "HOSPITATIONEN IMPORTIEREN");

for (const endpoint of ["preview", "apply"]) {
  const pathname = `/api/admin/hospitation-import/${endpoint}`;
  const policy = policyForRequest("POST", pathname);
  assert.equal(policy?.role, "admin");
  assert.equal(policy?.id, `hospitation.import.${endpoint}`);
  assert.equal(normalizedRequestLogPath(pathname), pathname);
  assert.equal(policyForRequest("GET", pathname), null);
}

const serverSource = await readFile(new URL("../api/server.mjs", import.meta.url), "utf8");
assert.match(serverSource, /pg_advisory_xact_lock\(hashtextextended/u);
assert.match(serverSource, /lock table public\.profiles, public\.organizations, public\.contacts, public\.contact_owners, public\.hospitations, public\.hospitation_observations, public\.import_runs in share row exclusive mode/u);
assert.match(serverSource, /currentTargetFingerprint !== confirmedTargetFingerprint/u);
assert.match(serverSource, /body\.backupConfirmed !== true/u);
assert.match(serverSource, /HOSPITATION_IMPORT_MANIFEST_LIMIT_BYTES = 1024 \* 1024/u);
assert.match(serverSource, /assertHospitationImportManifestSize\(body\.manifest\)/u);
assert.match(serverSource, /manifest_already_applied/u);
assert.match(serverSource, /persistHospitationImportPlan/u);
assert.match(serverSource, /dbRow\.references = JSON\.stringify\(dbRow\.references \|\| \[\]\)/u,
  "JSONB-Aktivitaetsreferenzen muessen vor dem node-postgres-Aufruf explizit als JSON serialisiert werden.");
assert.doesNotMatch(serverSource.slice(serverSource.indexOf("async function applyHospitationImport"), serverSource.indexOf("async function getHospitation")), /syncHospitationObservations/u);

console.log("Hospitation import contract tests passed.");
