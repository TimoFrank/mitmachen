(function initActivityModel(root) {
  "use strict";

  const CATEGORY_DEFINITIONS = Object.freeze({
    master_data: Object.freeze({ key: "master_data", label: "Stammdaten" }),
    ownership: Object.freeze({ key: "ownership", label: "Zuständigkeit" }),
    consent: Object.freeze({ key: "consent", label: "Einwilligung" }),
    hospitation: Object.freeze({ key: "hospitation", label: "Hospitation" }),
    format: Object.freeze({ key: "format", label: "Format" }),
    note_document: Object.freeze({ key: "note_document", label: "Notiz und Dokument" }),
    unknown: Object.freeze({ key: "unknown", label: "Nicht zugeordnet" })
  });

  const ORIGIN_DEFINITIONS = Object.freeze({
    manual: Object.freeze({ key: "manual", label: "Manuell" }),
    data_import: Object.freeze({ key: "data_import", label: "Datenimport" }),
    public_registration: Object.freeze({ key: "public_registration", label: "Öffentliche Anmeldung" }),
    system: Object.freeze({ key: "system", label: "System" }),
    legacy: Object.freeze({ key: "legacy", label: "Altdaten" })
  });

  function eventDefinition(categoryKey, actionKey, title, objectType, fieldFamily) {
    return Object.freeze({ categoryKey, actionKey, title, objectType, fieldFamily });
  }

  const EVENT_DEFINITIONS = Object.freeze({
    "contact.created": eventDefinition("master_data", "created", "Kontakt angelegt", "contact", "contact_lifecycle"),
    "contact.updated": eventDefinition("master_data", "updated", "Kontaktdaten aktualisiert", "contact", "contact_master_data"),
    "contact.archived": eventDefinition("master_data", "archived", "Kontakt archiviert", "contact", "contact_lifecycle"),
    "contact.restored": eventDefinition("master_data", "restored", "Kontakt wiederhergestellt", "contact", "contact_lifecycle"),
    "contact.image.added": eventDefinition("master_data", "added", "Kontaktbild hinzugefügt", "contact", "contact_image"),
    "contact.image.updated": eventDefinition("master_data", "updated", "Kontaktbild aktualisiert", "contact", "contact_image"),
    "contact.image.removed": eventDefinition("master_data", "removed", "Kontaktbild entfernt", "contact", "contact_image"),
    "contact.owner.added": eventDefinition("ownership", "added", "Owner hinzugefügt", "contact", "contact_ownership"),
    "contact.owner.removed": eventDefinition("ownership", "removed", "Owner entfernt", "contact", "contact_ownership"),
    "contact.owner.changed": eventDefinition("ownership", "changed", "Owner geändert", "contact", "contact_ownership"),
    "contact.consent.granted": eventDefinition("consent", "granted", "Einwilligung erteilt", "contact", "contact_consent"),
    "contact.consent.updated": eventDefinition("consent", "updated", "Einwilligung aktualisiert", "contact", "contact_consent"),
    "contact.consent.declined": eventDefinition("consent", "declined", "Einwilligung abgelehnt", "contact", "contact_consent"),
    "contact.consent.withdrawn": eventDefinition("consent", "withdrawn", "Einwilligung widerrufen", "contact", "contact_consent"),
    "organization.created": eventDefinition("master_data", "created", "Organisation angelegt", "organization", "organization_lifecycle"),
    "organization.updated": eventDefinition("master_data", "updated", "Organisation aktualisiert", "organization", "organization_master_data"),
    "organization.archived": eventDefinition("master_data", "archived", "Organisation archiviert", "organization", "organization_lifecycle"),
    "organization.restored": eventDefinition("master_data", "restored", "Organisation wiederhergestellt", "organization", "organization_lifecycle"),
    "hospitation.created": eventDefinition("hospitation", "created", "Hospitation angelegt", "hospitation", "hospitation"),
    "hospitation.updated": eventDefinition("hospitation", "updated", "Hospitation aktualisiert", "hospitation", "hospitation"),
    "hospitation.scheduled": eventDefinition("hospitation", "scheduled", "Hospitation terminiert", "hospitation", "hospitation"),
    "hospitation.completed": eventDefinition("hospitation", "completed", "Hospitation durchgeführt", "hospitation", "hospitation"),
    "hospitation.documented": eventDefinition("hospitation", "documented", "Hospitation dokumentiert", "hospitation", "hospitation"),
    "hospitation.cancelled": eventDefinition("hospitation", "cancelled", "Hospitation abgesagt", "hospitation", "hospitation"),
    "format.created": eventDefinition("format", "created", "Format angelegt", "format", "format"),
    "format.updated": eventDefinition("format", "updated", "Format aktualisiert", "format", "format"),
    "format.invitation.created": eventDefinition("format", "invited", "Zu Format eingeladen", "format_invitation", "format_invitation"),
    "format.invitation.accepted": eventDefinition("format", "accepted", "Teilnahme zugesagt", "format_invitation", "format_invitation"),
    "format.invitation.declined": eventDefinition("format", "declined", "Teilnahme abgesagt", "format_invitation", "format_invitation"),
    "format.participation.recorded": eventDefinition("format", "participated", "Teilgenommen", "format_participation", "format_participation"),
    "format.participation.cancelled": eventDefinition("format", "cancelled", "Formatteilnahme abgesagt", "format_participation", "format_participation"),
    "note.created": eventDefinition("note_document", "created", "Notiz erstellt", "note", "note"),
    "note.updated": eventDefinition("note_document", "updated", "Notiz aktualisiert", "note", "note"),
    "note.deleted": eventDefinition("note_document", "deleted", "Notiz gelöscht", "note", "note"),
    "email.documented": eventDefinition("note_document", "documented", "E-Mail-Text dokumentiert", "note", "note"),
    "document.uploaded": eventDefinition("note_document", "uploaded", "Dokument hochgeladen", "document", "document"),
    "document.removed": eventDefinition("note_document", "removed", "Dokument entfernt", "document", "document"),
    "legacy.activity.recorded": eventDefinition("unknown", "recorded", "Historische Aktivität", "activity", "legacy_unknown")
  });

  const FIELD_LABELS = Object.freeze({
    name: "Name",
    organization: "Organisation",
    organization_id: "Organisation",
    sector: "Sektor",
    specialty: "Fachrichtung",
    role: "Rolle",
    contact_role: "Rolle",
    priority: "Priorität",
    postal_code: "PLZ",
    city: "Ort",
    federal_state: "Bundesland",
    latitude: "Breitengrad",
    longitude: "Längengrad",
    email: "E-Mail",
    phone: "Telefon",
    linkedin: "LinkedIn",
    website: "Website",
    topics: "Themen",
    notes: "Notiz",
    note: "Notiz",
    source: "Quelle",
    status: "Status",
    owner_id: "Owner",
    owner_ids: "Owner",
    invitation_status: "Beteiligungsstatus",
    image: "Bild",
    image_url: "Bild",
    image_source_url: "Bildquelle",
    image_source_label: "Bildquelle",
    image_rights_note: "Bildrechte",
    image_updated_at: "Bildaktualisierung",
    image_updated_by: "Bildaktualisierung",
    mitmachen_consent_status: "Einwilligungsstatus",
    image_storage_path: "Bilddatei",
    image_kind: "Bildquelle",
    image_mime_type: "Bildformat",
    image_file_size: "Bildgröße",
    image_width: "Bildbreite",
    image_height: "Bildhöhe",
    mitmachen_consent_effective_at: "Einwilligungszeitpunkt",
    mitmachen_consent_source: "Einwilligungsquelle",
    mitmachen_consent_text_version: "Einwilligungstext",
    mitmachen_consent_recorded_by: "Einwilligung erfasst von",
    mitmachen_consent_note: "Einwilligungsnachweis"
  });

  const FIELD_FAMILIES = Object.freeze({
    contact_identity: new Set(["name", "title", "first_name", "last_name", "organization", "organization_id", "sector", "specialty", "role", "contact_role"]),
    contact_channels: new Set(["email", "phone", "linkedin", "website"]),
    contact_location: new Set(["postal_code", "city", "federal_state", "latitude", "longitude"]),
    contact_classification: new Set(["priority", "topics", "topic", "source", "sources", "category"]),
    contact_ownership: new Set(["owner", "owner_id", "owner_ids"]),
    contact_notes: new Set(["note", "notes"]),
    contact_documents: new Set(["attachment", "attachments", "document", "documents", "file", "files"]),
    contact_technical: new Set(["updated_at", "updated_by", "created_at", "created_by"])
  });

  const CONSENT_FIELDS = new Set([
    "consent",
    "consent_status",
    "mitmachen_consent_status",
    "mitmachen_consent_effective_at",
    "mitmachen_consent_source",
    "mitmachen_consent_text_version",
    "mitmachen_consent_recorded_by",
    "mitmachen_consent_note"
  ]);

  const IMAGE_FIELDS = new Set([
    "image",
    "image_url",
    "image_source_url",
    "image_source_label",
    "image_rights_note",
    "image_updated_at",
    "image_updated_by",
    "avatar",
    "image_storage_path",
    "image_kind",
    "image_mime_type",
    "image_file_size",
    "image_width",
    "image_height",
    "avatar_url"
  ]);

  const CATEGORY_KEYS = Object.freeze(Object.keys(CATEGORY_DEFINITIONS));
  const ORIGIN_KEYS = Object.freeze(Object.keys(ORIGIN_DEFINITIONS));
  const PRODUCER_EVENT_KEYS = Object.freeze(Object.keys(EVENT_DEFINITIONS).filter((eventKey) => eventKey !== "legacy.activity.recorded"));
  const DEFAULT_GROUP_WINDOW_MS = 5000;

  function hasOwn(value, key) {
    return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
  }

  function firstDefined(source, keys, fallback = "") {
    for (const key of keys) {
      if (hasOwn(source, key) && source[key] !== undefined && source[key] !== null) return source[key];
    }
    return fallback;
  }

  function asText(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  }

  function parseJson(value, fallback) {
    if (typeof value !== "string") return value === undefined || value === null ? fallback : value;
    const normalized = value.trim();
    if (!normalized) return fallback;
    try {
      return JSON.parse(normalized);
    } catch (_error) {
      return fallback;
    }
  }

  function plainObject(value) {
    const parsed = parseJson(value, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
  }

  function toSnakeCase(value) {
    return asText(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[\s.-]+/g, "_")
      .replace(/_+/g, "_")
      .toLowerCase();
  }

  function normalizeEventKey(value) {
    return asText(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
      .replace(/[\s/_:-]+/g, ".")
      .replace(/\.+/g, ".")
      .replace(/^\.|\.$/g, "")
      .toLowerCase();
  }

  function normalizeOriginKey(value, fallback = "manual") {
    const key = toSnakeCase(value);
    const aliases = {
      import: "data_import",
      imported: "data_import",
      csv: "data_import",
      csv_import: "data_import",
      dataimport: "data_import",
      registration: "public_registration",
      public_form: "public_registration",
      public_signup: "public_registration",
      automation: "system",
      automated: "system",
      historical: "legacy"
    };
    const normalized = aliases[key] || key;
    return hasOwn(ORIGIN_DEFINITIONS, normalized) ? normalized : fallback;
  }

  function normalizeActor(raw = {}) {
    const direct = plainObject(firstDefined(raw, ["actor", "user"], {}));
    const id = asText(firstDefined(direct, ["id", "actorId", "actor_id", "userId", "user_id"], firstDefined(raw, ["actorId", "actor_id", "changedBy", "changed_by", "userId", "user_id"], "")));
    const displayName = asText(firstDefined(direct, ["displayName", "display_name", "name", "label"], firstDefined(raw, ["actorName", "actor_name", "changedByName", "changed_by_name"], "")));
    return {
      id,
      displayName: displayName || (id ? "Unbekannter Nutzer" : "System"),
      email: asText(firstDefined(direct, ["email"], firstDefined(raw, ["actorEmail", "actor_email"], ""))),
      role: asText(firstDefined(direct, ["role"], "")),
      team: asText(firstDefined(direct, ["team"], "")),
      avatarUrl: asText(firstDefined(direct, ["avatarUrl", "avatar_url"], ""))
    };
  }

  function normalizeReference(value, fallbackType = "reference") {
    if (typeof value === "string" || typeof value === "number") {
      return { type: fallbackType, id: asText(value), label: "" };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const type = toSnakeCase(firstDefined(value, ["type", "objectType", "object_type", "entityType", "entity_type"], fallbackType)) || fallbackType;
    const id = asText(firstDefined(value, ["id", "objectId", "object_id", "entityId", "entity_id", "value"], ""));
    const label = asText(firstDefined(value, ["label", "name", "title", "displayName", "display_name"], ""));
    const route = asText(firstDefined(value, ["route", "href", "url"], ""));
    if (!id && !label && !route) return null;
    return { type, id, label, ...(route ? { route } : {}) };
  }

  function referencesFromObjectMap(value) {
    const references = [];
    Object.entries(value || {}).forEach(([rawKey, rawValue]) => {
      if (rawValue === undefined || rawValue === null || rawValue === "") return;
      const key = toSnakeCase(rawKey);
      const type = key.replace(/_(id|ids|ref|refs|reference|references)$/, "") || "reference";
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      values.forEach((entry) => {
        const reference = normalizeReference(entry, type);
        if (reference) references.push(reference);
      });
    });
    return references;
  }

  function normalizeReferences(raw = {}, object = null) {
    const source = parseJson(firstDefined(raw, ["references", "reference", "refs"], []), []);
    let references = [];
    if (Array.isArray(source)) {
      references = source.map((value) => normalizeReference(value)).filter(Boolean);
    } else if (source && typeof source === "object") {
      const direct = normalizeReference(source);
      references = direct ? [direct] : referencesFromObjectMap(source);
    }

    const typedIds = [
      ["contact", firstDefined(raw, ["contactId", "contact_id"], ""), firstDefined(raw.contact || {}, ["displayName", "name"], "")],
      ["organization", firstDefined(raw, ["organizationId", "organization_id"], ""), ""],
      ["hospitation", firstDefined(raw, ["hospitationId", "hospitation_id"], ""), ""],
      ["format", firstDefined(raw, ["formatId", "format_id"], ""), ""],
      ["note", firstDefined(raw, ["noteId", "note_id"], ""), ""],
      ["document", firstDefined(raw, ["documentId", "document_id"], "") , ""]
    ];
    typedIds.forEach(([type, id, label]) => {
      if (asText(id)) references.push({ type, id: asText(id), label: asText(label) });
    });
    if (object && (object.id || object.label)) references.push({ ...object });

    const seen = new Set();
    return references.filter((reference) => {
      const key = `${reference.type}:${reference.id}:${reference.label}:${reference.route || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeObject(raw = {}, definition = EVENT_DEFINITIONS["legacy.activity.recorded"]) {
    const direct = plainObject(firstDefined(raw, ["object", "entity"], {}));
    const contact = plainObject(raw.contact);
    const metadata = plainObject(raw.metadata);
    const type = toSnakeCase(firstDefined(direct, ["type", "objectType", "object_type", "entityType", "entity_type"], firstDefined(raw, ["objectType", "object_type", "entityType", "entity_type"], definition.objectType))) || definition.objectType;
    const typeIdKeys = [`${type}Id`, `${type}_id`];
    const id = asText(firstDefined(direct, ["id", "objectId", "object_id", "entityId", "entity_id"], firstDefined(raw, ["objectId", "object_id", "entityId", "entity_id", ...typeIdKeys, "contactId", "contact_id"], "")));
    const label = asText(firstDefined(direct, ["label", "name", "title", "displayName", "display_name"], firstDefined(raw, ["objectLabel", "object_label", "entityLabel", "entity_label"], firstDefined(metadata, ["entityLabel", "entity_label", "objectLabel", "object_label"], firstDefined(contact, ["displayName", "display_name", "name"], "")))));
    return { type, id, label };
  }

  function normalizeStoredChanges(value) {
    const parsed = parseJson(value, value);
    if (Array.isArray(parsed)) {
      return parsed.map((change) => ({
        fieldName: toSnakeCase(firstDefined(change || {}, ["fieldName", "field_name", "field"], "")),
        oldValue: firstDefined(change || {}, ["oldValue", "old_value", "before"], ""),
        newValue: firstDefined(change || {}, ["newValue", "new_value", "after"], "")
      }));
    }
    if (!parsed || typeof parsed !== "object") return [];
    if (["fieldName", "field_name", "field"].some((key) => hasOwn(parsed, key))) {
      return [{
        fieldName: toSnakeCase(firstDefined(parsed, ["fieldName", "field_name", "field"], "")),
        oldValue: firstDefined(parsed, ["oldValue", "old_value", "before"], ""),
        newValue: firstDefined(parsed, ["newValue", "new_value", "after"], "")
      }];
    }
    return Object.entries(parsed).map(([field, change]) => {
      const values = change && typeof change === "object" && !Array.isArray(change) ? change : { after: change };
      return {
        fieldName: toSnakeCase(field),
        oldValue: firstDefined(values, ["oldValue", "old_value", "before"], ""),
        newValue: firstDefined(values, ["newValue", "new_value", "after"], "")
      };
    });
  }

  function parseValueList(value) {
    if (Array.isArray(value)) return [...new Set(value.map(asText).filter(Boolean))];
    if (value === undefined || value === null || value === "") return [];
    const parsed = parseJson(value, null);
    if (Array.isArray(parsed)) return [...new Set(parsed.map(asText).filter(Boolean))];
    const normalized = asText(value).replace(/^\{/, "").replace(/\}$/, "");
    if (!normalized) return [];
    return [...new Set(normalized.split(/[;,|]/).map((entry) => entry.replace(/^"|"$/g, "").trim()).filter(Boolean))];
  }

  function fieldFamily(fieldName) {
    const field = toSnakeCase(fieldName);
    if (CONSENT_FIELDS.has(field) || field.startsWith("mitmachen_consent_") || field.startsWith("consent_")) return "contact_consent";
    if (IMAGE_FIELDS.has(field) || field.startsWith("image_") || field.startsWith("avatar_")) return "contact_image";
    for (const [family, fields] of Object.entries(FIELD_FAMILIES)) {
      if (fields.has(field)) return family;
    }
    return "legacy_unknown";
  }

  function ownerEventKey(oldValue, newValue) {
    const oldOwners = parseValueList(oldValue);
    const nextOwners = parseValueList(newValue);
    const added = nextOwners.filter((id) => !oldOwners.includes(id));
    const removed = oldOwners.filter((id) => !nextOwners.includes(id));
    if (added.length && !removed.length) return "contact.owner.added";
    if (removed.length && !added.length) return "contact.owner.removed";
    return "contact.owner.changed";
  }

  function presenceEventKey(prefix, oldValue, newValue) {
    const hadValue = parseValueList(oldValue).length > 0 || Boolean(asText(oldValue));
    const hasValue = parseValueList(newValue).length > 0 || Boolean(asText(newValue));
    if (!hadValue && hasValue) return `${prefix}.added`;
    if (hadValue && !hasValue) return `${prefix}.removed`;
    return `${prefix}.updated`;
  }

  function noteEventKey(oldValue, newValue) {
    if (!asText(oldValue) && asText(newValue)) return "note.created";
    if (asText(oldValue) && !asText(newValue)) return "note.deleted";
    return "note.updated";
  }

  function consentEventKey(fieldName, newValue) {
    if (toSnakeCase(fieldName) !== "mitmachen_consent_status" && toSnakeCase(fieldName) !== "consent_status") return "contact.consent.updated";
    const status = toSnakeCase(newValue);
    if (["granted", "accepted", "approved", "erteilt"].includes(status)) return "contact.consent.granted";
    if (["declined", "rejected", "abgelehnt"].includes(status)) return "contact.consent.declined";
    if (["withdrawn", "revoked", "widerrufen"].includes(status)) return "contact.consent.withdrawn";
    return "contact.consent.updated";
  }

  function legacyMapping(raw = {}) {
    const action = toSnakeCase(firstDefined(raw, ["action", "kind"], "update")) || "update";
    const fieldName = toSnakeCase(firstDefined(raw, ["fieldName", "field_name"], ""));
    const oldValue = firstDefined(raw, ["oldValue", "old_value"], "");
    const newValue = firstDefined(raw, ["newValue", "new_value"], "");

    if (action === "import") return { eventKey: "contact.created", originKey: "data_import", fieldFamily: "contact_lifecycle" };
    if (action === "create") return { eventKey: "contact.created", fieldFamily: "contact_lifecycle" };
    if (action === "archive") return { eventKey: "contact.archived", fieldFamily: "contact_lifecycle" };
    if (action === "restore" || (fieldName === "status" && toSnakeCase(oldValue) === "archived" && toSnakeCase(newValue) === "active")) {
      return { eventKey: "contact.restored", fieldFamily: "contact_lifecycle" };
    }
    if (action === "owner" || FIELD_FAMILIES.contact_ownership.has(fieldName)) {
      return { eventKey: ownerEventKey(oldValue, newValue), fieldFamily: "contact_ownership" };
    }
    if (CONSENT_FIELDS.has(fieldName) || fieldName.startsWith("mitmachen_consent_") || fieldName.startsWith("consent_")) {
      return { eventKey: consentEventKey(fieldName, newValue), fieldFamily: "contact_consent" };
    }
    if (IMAGE_FIELDS.has(fieldName) || fieldName.startsWith("image_") || fieldName.startsWith("avatar_")) {
      return { eventKey: presenceEventKey("contact.image", oldValue, newValue), fieldFamily: "contact_image" };
    }
    if (FIELD_FAMILIES.contact_notes.has(fieldName)) {
      return { eventKey: noteEventKey(oldValue, newValue), fieldFamily: "contact_notes" };
    }
    if (FIELD_FAMILIES.contact_documents.has(fieldName)) {
      const key = presenceEventKey("document", oldValue, newValue);
      return { eventKey: key === "document.added" ? "document.uploaded" : key === "document.updated" ? "document.uploaded" : "document.removed", fieldFamily: "contact_documents" };
    }
    const family = fieldFamily(fieldName);
    if (action === "update" && family !== "legacy_unknown") return { eventKey: "contact.updated", fieldFamily: family };
    return { eventKey: "legacy.activity.recorded", fieldFamily: "legacy_unknown" };
  }

  function compatibleKind(eventKey, originKey) {
    if (eventKey === "contact.created") return originKey === "data_import" ? "import" : "create";
    if (eventKey.endsWith(".archived")) return "archive";
    if (eventKey.endsWith(".restored")) return "restore";
    if (eventKey.startsWith("contact.owner.")) return "owner";
    return "update";
  }

  function titleFor(eventKey, definition, originKey, explicitTitle = "") {
    if (asText(explicitTitle)) return asText(explicitTitle);
    if (eventKey === "contact.created" && originKey === "data_import") return "Kontakt importiert";
    if (eventKey === "contact.created" && originKey === "public_registration") return "Kontakt aus Anmeldung übernommen";
    return definition.title;
  }

  function normalizeActivity(raw = {}) {
    const explicitEventKey = normalizeEventKey(firstDefined(raw, ["eventKey", "event_key", "eventType", "event_type"], ""));
    const legacy = !explicitEventKey;
    const mapping = legacy ? legacyMapping(raw) : { eventKey: explicitEventKey };
    const eventKey = mapping.eventKey || "legacy.activity.recorded";
    const knownDefinition = EVENT_DEFINITIONS[eventKey];
    const definition = knownDefinition || eventDefinition("unknown", "unknown", "Unbekannte Aktivität", toSnakeCase(firstDefined(raw, ["objectType", "object_type", "entityType", "entity_type"], "activity")) || "activity", "unknown");
    const rawOrigin = firstDefined(raw, ["originKey", "origin_key", "originType", "origin_type", "origin", "sourceType", "source_type"], "");
    const originKey = normalizeOriginKey(rawOrigin, mapping.originKey || (legacy ? "legacy" : "manual"));
    const originRef = asText(firstDefined(raw, ["originRef", "origin_ref"], ""));
    const categoryCandidate = toSnakeCase(firstDefined(raw, ["categoryKey", "category_key", "category"], definition.categoryKey));
    const actionCandidate = toSnakeCase(firstDefined(raw, ["actionKey", "action_key", "action"], definition.actionKey));
    const categoryKey = knownDefinition ? definition.categoryKey : "unknown";
    const actionKey = knownDefinition ? definition.actionKey : "unknown";
    const object = normalizeObject(raw, definition);
    const actor = normalizeActor(raw);
    const occurredAt = asText(firstDefined(raw, ["occurredAt", "occurred_at", "changedAt", "changed_at", "createdAt", "created_at"], ""));
    const fieldName = toSnakeCase(firstDefined(raw, ["fieldName", "field_name"], ""));
    const oldValue = firstDefined(raw, ["oldValue", "old_value"], "");
    const newValue = firstDefined(raw, ["newValue", "new_value"], "");
    const metadata = plainObject(raw.metadata);
    const baseDetails = { ...metadata, ...plainObject(firstDefined(raw, ["details", "payload"], {})) };
    const storedChanges = normalizeStoredChanges(firstDefined(raw, ["changes"], baseDetails.changes || []));
    const effectiveFieldFamily = asText(firstDefined(baseDetails, ["fieldFamily", "field_family"], mapping.fieldFamily || definition.fieldFamily));
    const references = normalizeReferences(raw, object);
    const contactReference = references.find((reference) => reference.type === "contact");
    const contactId = asText(firstDefined(raw, ["contactId", "contact_id"], object.type === "contact" ? object.id : contactReference?.id || ""));
    const origin = { ...ORIGIN_DEFINITIONS[originKey], ...(originRef ? { ref: originRef } : {}) };
    const category = CATEGORY_DEFINITIONS[categoryKey] || CATEGORY_DEFINITIONS.unknown;
    const id = asText(firstDefined(raw, ["id", "eventId", "event_id"], ""));
    const correlationId = asText(firstDefined(raw, ["correlationId", "correlation_id"], ""));
    const legacySource = asText(firstDefined(raw, ["legacySource", "legacy_source"], ""));
    const legacyId = asText(firstDefined(raw, ["legacyId", "legacy_id"], ""));
    const legacyAction = toSnakeCase(firstDefined(raw, ["action", "kind"], compatibleKind(eventKey, originKey))) || compatibleKind(eventKey, originKey);
    const kind = compatibleKind(eventKey, originKey);
    const compatibleAction = legacy ? legacyAction : kind;
    const details = {
      ...baseDetails,
      fieldFamily: effectiveFieldFamily || definition.fieldFamily,
      ...(storedChanges.length ? { changes: storedChanges } : {}),
      ...(fieldName ? { fieldName, fieldLabel: FIELD_LABELS[fieldName] || fieldName } : {}),
      ...(oldValue !== undefined && oldValue !== null && (fieldName || asText(oldValue)) ? { oldValue } : {}),
      ...(newValue !== undefined && newValue !== null && (fieldName || asText(newValue)) ? { newValue } : {}),
      ...(legacy ? { legacy: true, legacyAction } : {}),
      ...(!knownDefinition && explicitEventKey ? { unsupportedEventKey: explicitEventKey } : {})
    };
    if (!knownDefinition && explicitEventKey) {
      if (categoryCandidate) details.unsupportedCategory = categoryCandidate;
      if (actionCandidate) details.unsupportedAction = actionCandidate;
    }
    const title = titleFor(eventKey, definition, originKey, firstDefined(raw, ["title"], metadata.title || ""));
    const contact = plainObject(raw.contact);
    const compatibleContact = Object.keys(contact).length
      ? contact
      : contactId
        ? { id: contactId, name: object.type === "contact" ? object.label : "", displayName: object.type === "contact" ? object.label : "" }
        : null;
    const compatibleChange = {
      id,
      contactId,
      action: compatibleAction,
      kind,
      fieldName,
      oldValue,
      newValue,
      changedAt: occurredAt,
      changedBy: actor.id,
      user: actor,
      contact: compatibleContact
    };
    const compatibleChanges = storedChanges.length
      ? storedChanges.map((change, index) => ({
          id: asText(firstDefined(change || {}, ["id"], `${id || "event"}-${index + 1}`)),
          contactId,
          action: compatibleAction,
          kind,
          fieldName: toSnakeCase(firstDefined(change || {}, ["fieldName", "field_name", "field"], "")),
          oldValue: firstDefined(change || {}, ["oldValue", "old_value", "before"], ""),
          newValue: firstDefined(change || {}, ["newValue", "new_value", "after"], ""),
          changedAt: occurredAt,
          changedBy: actor.id,
          user: actor,
          contact: compatibleContact
        }))
      : legacy || fieldName
        ? [compatibleChange]
        : [];

    return {
      id,
      eventKey,
      categoryKey,
      actionKey,
      title,
      object,
      actor,
      occurredAt,
      references,
      origin,
      details,
      metadata,
      category,
      originKey,
      originRef,
      correlationId,
      legacySource,
      legacyId,
      fieldFamily: details.fieldFamily,
      objectType: object.type,
      objectId: object.id,
      actorId: actor.id,
      contactId,
      action: compatibleAction,
      kind,
      fieldName,
      oldValue,
      newValue,
      changedAt: occurredAt,
      changedBy: actor.id,
      user: actor,
      contact: compatibleContact,
      changes: compatibleChanges
    };
  }

  function normalizeActivities(rows = [], options = {}) {
    if (!Array.isArray(rows)) return [];
    const includeTechnical = Boolean(options.includeTechnical);
    return rows
      .map((row) => normalizeActivity(row))
      .filter((activity) => includeTechnical || activity.fieldFamily !== "contact_technical");
  }

  function groupIdentity(activity) {
    const subject = activity.contactId || `${activity.object?.type || "activity"}:${activity.object?.id || activity.id || ""}`;
    const actor = activity.actor?.id || activity.changedBy || activity.actor?.displayName || "unknown";
    return `${subject}\u0000${actor}\u0000${activity.actionKey}\u0000${activity.fieldFamily || "unknown"}`;
  }

  function activityTimestamp(activity) {
    const value = new Date(activity.occurredAt || activity.changedAt || "").getTime();
    return Number.isFinite(value) ? value : null;
  }

  function mergeGroup(group, activity) {
    const changes = [...group.changes, ...(Array.isArray(activity.changes) ? activity.changes : [])];
    const eventIds = [...group.eventIds, activity.id].filter(Boolean);
    const references = normalizeReferences({ references: [...group.references, ...activity.references] });
    return {
      ...group,
      references,
      details: {
        ...group.details,
        changes: changes.map((change) => ({
          fieldName: change.fieldName,
          oldValue: change.oldValue,
          newValue: change.newValue
        }))
      },
      changes,
      eventIds,
      eventCount: group.eventCount + 1
    };
  }

  function groupActivities(rows = [], options = {}) {
    const windowMs = Number.isFinite(Number(options.windowMs)) ? Math.max(0, Number(options.windowMs)) : DEFAULT_GROUP_WINDOW_MS;
    const activities = normalizeActivities(rows, { includeTechnical: options.includeTechnical });
    const groups = [];
    activities.forEach((activity) => {
      const previous = groups[groups.length - 1];
      const previousTime = previous ? activityTimestamp(previous) : null;
      const currentTime = activityTimestamp(activity);
      const sameGroup = Boolean(
        previous &&
        previous.details?.legacy === true &&
        activity.details?.legacy === true &&
        groupIdentity(previous) === groupIdentity(activity) &&
        previousTime !== null &&
        currentTime !== null &&
        Math.abs(previousTime - currentTime) <= windowMs
      );
      if (sameGroup) {
        groups[groups.length - 1] = mergeGroup(previous, activity);
        return;
      }
      groups.push({
        ...activity,
        details: { ...activity.details, changes: activity.changes.map((change) => ({ fieldName: change.fieldName, oldValue: change.oldValue, newValue: change.newValue })) },
        eventIds: activity.id ? [activity.id] : [],
        eventCount: 1
      });
    });
    return groups;
  }

  function eventDefinitionFor(eventKey) {
    return EVENT_DEFINITIONS[normalizeEventKey(eventKey)] || null;
  }

  function isKnownEventKey(eventKey) {
    return Boolean(eventDefinitionFor(eventKey));
  }

  function isProducerEventKey(eventKey) {
    return PRODUCER_EVENT_KEYS.includes(normalizeEventKey(eventKey));
  }

  function assertProducerEventKey(eventKey) {
    const normalized = normalizeEventKey(eventKey);
    if (!isProducerEventKey(normalized)) {
      throw new Error(`Unbekannter oder nicht produzierbarer Aktivitätsschlüssel: ${normalized || "(leer)"}`);
    }
    return normalized;
  }

  function changesForDatabase(activity) {
    return (Array.isArray(activity.changes) ? activity.changes : []).reduce((result, change) => {
      const field = toSnakeCase(firstDefined(change || {}, ["fieldName", "field_name", "field"], ""));
      if (!field) return result;
      result[field] = {
        before: firstDefined(change || {}, ["oldValue", "old_value", "before"], ""),
        after: firstDefined(change || {}, ["newValue", "new_value", "after"], "")
      };
      return result;
    }, {});
  }

  function toDatabaseRow(value = {}, options = {}) {
    const activity = normalizeActivity(value);
    const hasLegacyReference = Boolean(activity.legacySource || activity.legacyId);
    if (hasLegacyReference && options.allowLegacy !== true) {
      throw new Error("Legacy-Referenzen dürfen nur mit allowLegacy geschrieben werden.");
    }
    if (Boolean(activity.legacySource) !== Boolean(activity.legacyId)) {
      throw new Error("legacySource und legacyId müssen gemeinsam gesetzt werden.");
    }
    if (options.allowLegacy === true && activity.eventKey === "legacy.activity.recorded") {
      // Explizit für kontrollierte Altdatenmigrationen zugelassen.
    } else {
      assertProducerEventKey(activity.eventKey);
    }
    if (!activity.object.type || !activity.object.id) {
      throw new Error("Aktivitätsereignisse benötigen entity_type und entity_id.");
    }
    const metadata = {
      ...activity.metadata,
      ...(activity.object.label ? { entityLabel: activity.object.label } : {}),
      ...(activity.title !== EVENT_DEFINITIONS[activity.eventKey]?.title ? { title: activity.title } : {})
    };
    delete metadata.changes;
    return {
      event_key: activity.eventKey,
      category: activity.categoryKey,
      action: activity.actionKey,
      entity_type: activity.object.type,
      entity_id: activity.object.id || null,
      contact_id: activity.contactId || null,
      actor_id: activity.actor.id || null,
      occurred_at: activity.occurredAt || new Date().toISOString(),
      origin_type: activity.originKey,
      origin_ref: activity.originRef || null,
      correlation_id: activity.correlationId || null,
      references: activity.references,
      changes: changesForDatabase(activity),
      metadata,
      legacy_source: activity.legacySource || null,
      legacy_id: activity.legacyId || null
    };
  }

  function fromDatabaseRow(row = {}) {
    return normalizeActivity(row);
  }

  root.ActivityModel = Object.freeze({
    version: 1,
    DEFAULT_GROUP_WINDOW_MS,
    CATEGORY_KEYS,
    ORIGIN_KEYS,
    PRODUCER_EVENT_KEYS,
    categories: CATEGORY_DEFINITIONS,
    origins: ORIGIN_DEFINITIONS,
    eventDefinitions: EVENT_DEFINITIONS,
    CATEGORY_DEFINITIONS,
    ORIGIN_DEFINITIONS,
    EVENT_DEFINITIONS,
    eventDefinitionFor,
    isKnownEventKey,
    isProducerEventKey,
    assertProducerEventKey,
    normalizeActivity,
    normalizeEvent: normalizeActivity,
    fromDatabaseRow,
    toDatabaseRow,
    normalizeLegacyChange: normalizeActivity,
    normalizeActivities,
    normalizeMany: normalizeActivities,
    groupActivities,
    group: groupActivities,
    toViewModel: normalizeActivity,
    fieldFamily,
    normalizeOriginKey
  });
})(globalThis);
