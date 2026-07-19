import assert from "node:assert/strict";

delete globalThis.ActivityModel;
await import("../frontend/data/activity-model.js");

const model = globalThis.ActivityModel;
assert.ok(model, "ActivityModel wurde beim Import nicht auf globalThis registriert.");
assert.deepEqual(model.CATEGORY_KEYS, ["master_data", "ownership", "consent", "hospitation", "format", "note_document", "unknown"]);
assert.deepEqual(model.ORIGIN_KEYS, ["manual", "data_import", "public_registration", "system", "legacy"]);
[
  "contact.created",
  "contact.updated",
  "organization.created",
  "hospitation.created",
  "format.invitation.created",
  "note.created",
  "document.uploaded",
  "legacy.activity.recorded"
].forEach((eventKey) => assert.ok(model.eventDefinitionFor(eventKey), `Eventdefinition fehlt: ${eventKey}`));
assert.equal(model.isKnownEventKey("legacy.activity.recorded"), true);
assert.equal(model.isProducerEventKey("hospitation.created"), true);
assert.equal(model.isProducerEventKey("legacy.activity.recorded"), false);
assert.throws(() => model.assertProducerEventKey("future.workflow.triggered"), /nicht produzierbarer Aktivitätsschlüssel/);

const formatStatusActivities = [
  ["format.invitation.created", "Zu Format eingeladen"],
  ["format.invitation.accepted", "Teilnahme zugesagt"],
  ["format.participation.recorded", "Teilgenommen"],
  ["format.invitation.declined", "Teilnahme abgesagt"]
].map(([event_key, title]) => ({ activity: model.normalizeEvent({ event_key, entity_type: "format_participant", entity_id: `participant-${event_key}`, contact_id: "contact-1" }), title }));
formatStatusActivities.forEach(({ activity, title }) => {
  assert.equal(activity.categoryKey, "format");
  assert.equal(activity.title, title);
});

const producerContracts = [
  ["contact.created", "master_data", "Kontakt angelegt"],
  ["contact.updated", "master_data", "Kontaktdaten aktualisiert"],
  ["contact.archived", "master_data", "Kontakt archiviert"],
  ["contact.restored", "master_data", "Kontakt wiederhergestellt"],
  ["contact.image.added", "master_data", "Kontaktbild hinzugefügt"],
  ["contact.image.updated", "master_data", "Kontaktbild aktualisiert"],
  ["contact.image.removed", "master_data", "Kontaktbild entfernt"],
  ["contact.owner.added", "ownership", "Owner hinzugefügt"],
  ["contact.owner.removed", "ownership", "Owner entfernt"],
  ["contact.owner.changed", "ownership", "Owner geändert"],
  ["contact.consent.granted", "consent", "Einwilligung erteilt"],
  ["contact.consent.updated", "consent", "Einwilligung aktualisiert"],
  ["contact.consent.declined", "consent", "Einwilligung abgelehnt"],
  ["contact.consent.withdrawn", "consent", "Einwilligung widerrufen"],
  ["organization.created", "master_data", "Organisation angelegt"],
  ["organization.updated", "master_data", "Organisation aktualisiert"],
  ["organization.archived", "master_data", "Organisation archiviert"],
  ["organization.restored", "master_data", "Organisation wiederhergestellt"],
  ["hospitation.created", "hospitation", "Hospitation angelegt"],
  ["hospitation.updated", "hospitation", "Hospitation aktualisiert"],
  ["hospitation.scheduled", "hospitation", "Hospitation terminiert"],
  ["hospitation.completed", "hospitation", "Hospitation durchgeführt"],
  ["hospitation.documented", "hospitation", "Hospitation dokumentiert"],
  ["hospitation.cancelled", "hospitation", "Hospitation abgesagt"],
  ["format.created", "format", "Format angelegt"],
  ["format.updated", "format", "Format aktualisiert"],
  ["format.invitation.created", "format", "Zu Format eingeladen"],
  ["format.invitation.accepted", "format", "Teilnahme zugesagt"],
  ["format.invitation.declined", "format", "Teilnahme abgesagt"],
  ["format.participation.recorded", "format", "Teilgenommen"],
  ["format.participation.cancelled", "format", "Formatteilnahme abgesagt"],
  ["note.created", "note_document", "Notiz erstellt"],
  ["note.updated", "note_document", "Notiz aktualisiert"],
  ["note.deleted", "note_document", "Notiz gelöscht"],
  ["email.documented", "note_document", "E-Mail-Text dokumentiert"],
  ["document.uploaded", "note_document", "Dokument hochgeladen"],
  ["document.removed", "note_document", "Dokument entfernt"]
];
assert.deepEqual(
  producerContracts.map(([eventKey]) => eventKey).sort(),
  [...model.PRODUCER_EVENT_KEYS].sort(),
  "Jeder freigegebene Ereignisproduzent benötigt einen expliziten Vertragsfall."
);
producerContracts.forEach(([eventKey, categoryKey, title]) => {
  const activity = model.normalizeEvent({
    eventKey,
    objectId: `object-${eventKey}`,
    contactId: "contact-producer-contract",
    occurredAt: "2026-07-16T12:00:00.000Z"
  });
  assert.equal(model.assertProducerEventKey(eventKey), eventKey);
  assert.equal(activity.categoryKey, categoryKey, `Kategorie für ${eventKey}`);
  assert.equal(activity.title, title, `Titel für ${eventKey}`);
});

const base = {
  contact_id: "contact-1",
  changed_by: "actor-1",
  changed_at: "2026-07-16T09:00:00.000Z",
  contact: { id: "contact-1", name: "Ada Beispiel" },
  user: { id: "actor-1", display_name: "Alex Pflege" }
};

const imported = model.normalizeActivity({
  ...base,
  id: 1,
  action: "import",
  field_name: null,
  new_value: "Ada Beispiel"
});
assert.equal(imported.eventKey, "contact.created");
assert.equal(imported.categoryKey, "master_data");
assert.equal(imported.actionKey, "created");
assert.equal(imported.originKey, "data_import");
assert.equal(imported.origin.label, "Datenimport");
assert.equal(imported.title, "Kontakt importiert");
assert.equal(imported.kind, "import");
assert.equal(imported.contactId, "contact-1");

const created = model.normalizeActivity({
  id: "create-1",
  contactId: "contact-2",
  action: "create",
  changedBy: "actor-1",
  changedAt: "2026-07-16T09:01:00.000Z",
  newValue: "Berta Beispiel"
});
assert.equal(created.eventKey, "contact.created");
assert.equal(created.title, "Kontakt angelegt");
assert.equal(created.kind, "create");
assert.equal(created.originKey, "legacy");

const archived = model.normalizeActivity({ ...base, id: 2, action: "archive", field_name: "status", old_value: "active", new_value: "archived" });
assert.equal(archived.eventKey, "contact.archived");
assert.equal(archived.title, "Kontakt archiviert");
assert.equal(archived.kind, "archive");

const restored = model.normalizeActivity({ ...base, id: 3, action: "update", field_name: "status", old_value: "archived", new_value: "active" });
assert.equal(restored.eventKey, "contact.restored");
assert.equal(restored.title, "Kontakt wiederhergestellt");
assert.equal(restored.kind, "restore");

const ownerAdded = model.normalizeActivity({ ...base, id: 4, action: "update", field_name: "owner_ids", old_value: "[]", new_value: '["actor-1"]' });
const ownerRemoved = model.normalizeActivity({ ...base, id: 5, action: "update", field_name: "ownerIds", old_value: ["actor-1", "actor-2"], new_value: ["actor-1"] });
const ownerChanged = model.normalizeActivity({ ...base, id: 6, action: "update", field_name: "owner_id", old_value: "actor-1", new_value: "actor-2" });
assert.equal(ownerAdded.eventKey, "contact.owner.added");
assert.equal(ownerRemoved.eventKey, "contact.owner.removed");
assert.equal(ownerChanged.eventKey, "contact.owner.changed");
assert.equal(ownerAdded.categoryKey, "ownership");
assert.equal(ownerRemoved.title, "Owner entfernt");
assert.equal(ownerChanged.kind, "owner");

const consent = model.normalizeActivity({ ...base, id: 7, action: "update", fieldName: "mitmachenConsentStatus", oldValue: "granted", newValue: "withdrawn" });
assert.equal(consent.eventKey, "contact.consent.withdrawn");
assert.equal(consent.categoryKey, "consent");
assert.equal(consent.title, "Einwilligung widerrufen");
assert.equal(consent.fieldName, "mitmachen_consent_status");

const imageAdded = model.normalizeActivity({ ...base, id: 8, action: "update", field_name: "image_url", old_value: "", new_value: "https://example.test/ada.jpg" });
const imageChanged = model.normalizeActivity({ ...base, id: 9, action: "update", fieldName: "imageUrl", oldValue: "old.jpg", newValue: "new.jpg" });
const imageRemoved = model.normalizeActivity({ ...base, id: 91, action: "update", field_name: "image_storage_path", old_value: "contact-1/bild.webp", new_value: "" });
assert.equal(imageAdded.eventKey, "contact.image.added");
assert.equal(imageChanged.eventKey, "contact.image.updated");
assert.equal(imageRemoved.eventKey, "contact.image.removed");
assert.equal(imageAdded.fieldFamily, "contact_image");

const noteCreated = model.normalizeActivity({ ...base, id: 10, action: "update", field_name: "notes", old_value: "", new_value: "E-Mail vom 16. Juli" });
const noteDeleted = model.normalizeActivity({ ...base, id: 11, action: "update", fieldName: "note", oldValue: "Alt", newValue: "" });
assert.equal(noteCreated.eventKey, "note.created");
assert.equal(noteCreated.categoryKey, "note_document");
assert.equal(noteDeleted.eventKey, "note.deleted");

const grouped = model.groupActivities([
  { ...base, id: 12, action: "update", field_name: "email", old_value: "a@example.test", new_value: "b@example.test", changed_at: "2026-07-16T10:00:00.000Z" },
  { ...base, id: 13, action: "update", field_name: "phone", old_value: "1", new_value: "2", changed_at: "2026-07-16T09:59:58.000Z" },
  { ...base, id: 14, action: "update", field_name: "priority", old_value: "Mittel", new_value: "Hoch", changed_at: "2026-07-16T09:59:57.000Z" },
  { ...base, id: 15, action: "update", field_name: "owner_ids", old_value: "[]", new_value: '["actor-1"]', changed_at: "2026-07-16T09:59:56.000Z" }
]);
assert.equal(grouped.length, 3, "Nur gleiche fachliche Feldfamilien dürfen innerhalb von fünf Sekunden gruppiert werden.");
assert.equal(grouped[0].eventCount, 2);
assert.equal(grouped[0].fieldFamily, "contact_channels");
assert.equal(grouped[1].fieldFamily, "contact_classification");
assert.equal(grouped[2].fieldFamily, "contact_ownership");

const outsideWindow = model.groupActivities([
  { ...base, id: 16, action: "update", field_name: "email", old_value: "a", new_value: "b", changed_at: "2026-07-16T10:00:00.000Z" },
  { ...base, id: 17, action: "update", field_name: "phone", old_value: "1", new_value: "2", changed_at: "2026-07-16T09:59:54.999Z" }
]);
assert.equal(outsideWindow.length, 2, "Ereignisse außerhalb des Fünf-Sekunden-Fensters dürfen nicht gruppiert werden.");

const unknownLegacy = model.normalizeActivity({ ...base, id: 18, action: "update", field_name: "future_field", old_value: "alt", new_value: "neu" });
assert.equal(unknownLegacy.eventKey, "legacy.activity.recorded");
assert.equal(unknownLegacy.categoryKey, "unknown");
assert.equal(unknownLegacy.title, "Historische Aktivität");
assert.equal(unknownLegacy.details.fieldName, "future_field");

const unknownNew = model.normalizeActivity({
  event_key: "future.workflow.triggered",
  object_type: "workflow",
  object_id: "workflow-1",
  actor_id: "actor-2",
  occurred_at: "2026-07-16T11:00:00.000Z",
  origin: "system"
});
assert.equal(unknownNew.eventKey, "future.workflow.triggered");
assert.equal(unknownNew.categoryKey, "unknown");
assert.equal(unknownNew.title, "Unbekannte Aktivität");
assert.equal(unknownNew.details.unsupportedEventKey, "future.workflow.triggered");

const newEvent = model.normalizeEvent({
  id: "event-1",
  event_key: "hospitation.created",
  category_key: "wrong-category-is-ignored",
  action_key: "wrong-action-is-ignored",
  object_type: "hospitation",
  object_id: "hospitation-1",
  object_label: "Hospitation Hausarztzentrum",
  actor: { id: "actor-2", display_name: "Dana Demo", team: "Versorgung" },
  occurred_at: "2026-07-16T12:00:00.000Z",
  correlation_id: "contact-9:visit-intake",
  references: JSON.stringify({ contact_id: "contact-9", format_id: "format-3" }),
  changes: { status: { before: "Entwurf", after: "Geplant" }, starts_at: { before: "", after: "2026-08-01T09:00:00.000Z" } },
  origin: "public-registration",
  origin_ref: "registration-42",
  metadata: JSON.stringify({ status: "Geplant", campaign: "Sommer" })
});
assert.equal(newEvent.eventKey, "hospitation.created");
assert.equal(newEvent.categoryKey, "hospitation");
assert.equal(newEvent.actionKey, "created");
assert.equal(newEvent.title, "Hospitation angelegt");
assert.deepEqual(newEvent.object, { type: "hospitation", id: "hospitation-1", label: "Hospitation Hausarztzentrum" });
assert.equal(newEvent.actor.displayName, "Dana Demo");
assert.equal(newEvent.occurredAt, "2026-07-16T12:00:00.000Z");
assert.equal(newEvent.originKey, "public_registration");
assert.equal(newEvent.originRef, "registration-42");
assert.equal(newEvent.correlationId, "contact-9:visit-intake");
assert.equal(newEvent.details.status, "Geplant");
assert.equal(newEvent.metadata.campaign, "Sommer");
assert.deepEqual(newEvent.changes.map(({ fieldName, oldValue, newValue }) => ({ fieldName, oldValue, newValue })), [
  { fieldName: "status", oldValue: "Entwurf", newValue: "Geplant" },
  { fieldName: "starts_at", oldValue: "", newValue: "2026-08-01T09:00:00.000Z" }
]);
assert.ok(newEvent.references.some((reference) => reference.type === "contact" && reference.id === "contact-9"));
assert.ok(newEvent.references.some((reference) => reference.type === "format" && reference.id === "format-3"));
assert.equal(newEvent.changedAt, newEvent.occurredAt);
assert.equal(newEvent.changedBy, "actor-2");
assert.equal(newEvent.user.displayName, "Dana Demo");

const databaseRow = model.toDatabaseRow(newEvent);
assert.deepEqual(Object.keys(databaseRow), [
  "event_key",
  "category",
  "action",
  "entity_type",
  "entity_id",
  "contact_id",
  "actor_id",
  "occurred_at",
  "origin_type",
  "origin_ref",
  "correlation_id",
  "references",
  "changes",
  "metadata",
  "legacy_source",
  "legacy_id"
]);
assert.equal(databaseRow.event_key, "hospitation.created");
assert.equal(databaseRow.category, "hospitation");
assert.equal(databaseRow.action, "created");
assert.equal(databaseRow.entity_type, "hospitation");
assert.equal(databaseRow.origin_type, "public_registration");
assert.equal(databaseRow.correlation_id, "contact-9:visit-intake");
assert.equal(databaseRow.legacy_source, null);
assert.equal(databaseRow.legacy_id, null);
assert.deepEqual(databaseRow.changes.status, { before: "Entwurf", after: "Geplant" });
const roundtripEvent = model.fromDatabaseRow(databaseRow);
assert.equal(roundtripEvent.eventKey, newEvent.eventKey);
assert.equal(roundtripEvent.object.id, newEvent.object.id);
assert.equal(roundtripEvent.object.label, newEvent.object.label);
assert.equal(roundtripEvent.originRef, newEvent.originRef);
assert.equal(roundtripEvent.correlationId, newEvent.correlationId);
assert.equal(roundtripEvent.metadata.campaign, "Sommer");
assert.deepEqual(
  roundtripEvent.changes.map(({ fieldName, oldValue, newValue }) => ({ fieldName, oldValue, newValue })),
  newEvent.changes.map(({ fieldName, oldValue, newValue }) => ({ fieldName, oldValue, newValue }))
);

const canonicalEventsStaySeparate = model.groupActivities([
  {
    id: "event-h-1",
    event_key: "hospitation.created",
    entity_type: "hospitation",
    entity_id: "hospitation-1",
    contact_id: "contact-1",
    actor_id: "actor-1",
    occurred_at: "2026-07-16T12:10:00.000Z"
  },
  {
    id: "event-h-2",
    event_key: "hospitation.created",
    entity_type: "hospitation",
    entity_id: "hospitation-2",
    contact_id: "contact-1",
    actor_id: "actor-1",
    occurred_at: "2026-07-16T12:09:58.000Z"
  }
]);
assert.equal(canonicalEventsStaySeparate.length, 2, "Kanonische activity_events dürfen nicht nach dem Legacy-Zeitfenster verschmolzen werden.");
assert.deepEqual(canonicalEventsStaySeparate[0].changes, [], "Kanonische Ereignisse ohne Feldänderung dürfen keinen leeren Platzhalter-Diff erzeugen.");

const migratedLegacyRow = model.toDatabaseRow({
  event_key: "contact.updated",
  entity_type: "contact",
  entity_id: "contact-legacy",
  contact_id: "contact-legacy",
  actor_id: "actor-1",
  occurred_at: "2026-01-01T08:00:00.000Z",
  origin_type: "legacy",
  legacy_source: "changes",
  legacy_id: "4711",
  changes: { priority: { before: "Mittel", after: "Hoch" } }
}, { allowLegacy: true });
assert.equal(migratedLegacyRow.legacy_source, "changes");
assert.equal(migratedLegacyRow.legacy_id, "4711");
const migratedLegacyRoundtrip = model.fromDatabaseRow(migratedLegacyRow);
assert.equal(migratedLegacyRoundtrip.legacySource, "changes");
assert.equal(migratedLegacyRoundtrip.legacyId, "4711");
assert.throws(
  () => model.toDatabaseRow({ ...migratedLegacyRoundtrip, legacyId: "4711", legacySource: "changes" }),
  /nur mit allowLegacy/
);

const formatInvitation = model.normalizeEvent({ eventKey: "format.invitation.created", objectId: "invitation-1", formatId: "format-1", contactId: "contact-1" });
assert.equal(formatInvitation.title, "Zu Format eingeladen");
assert.equal(formatInvitation.categoryKey, "format");
assert.throws(
  () => model.toDatabaseRow({ eventKey: "contact.created" }),
  /entity_type und entity_id/,
  "Producer dürfen keine Ereignisse ohne vollständigen Objektbezug speichern."
);

console.log("Activity Model Test OK: Taxonomie, Legacy-Mapping, Gruppierung und ViewModel sind stabil.");
