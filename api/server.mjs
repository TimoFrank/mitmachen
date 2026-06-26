import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const CONTACT_FIELDS = [
  "id",
  "name",
  "organization_id",
  "organization",
  "sector",
  "specialty",
  "role",
  "priority",
  "owner_id",
  "postal_code",
  "city",
  "federal_state",
  "latitude",
  "longitude",
  "email",
  "phone",
  "linkedin",
  "topics",
  "notes",
  "source",
  "image_url",
  "image_source_url",
  "image_source_label",
  "image_rights_note",
  "image_updated_at",
  "image_updated_by",
  "status",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];

const ORGANIZATION_FIELDS = [
  "id",
  "name",
  "normalized_name",
  "sector",
  "organization_type",
  "postal_code",
  "city",
  "federal_state",
  "latitude",
  "longitude",
  "website",
  "phone",
  "email",
  "logo_url",
  "logo_source_url",
  "logo_source_label",
  "member_count",
  "member_count_source_url",
  "member_count_source_label",
  "member_count_updated_at",
  "member_count_scope",
  "notes",
  "source",
  "status",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const PROFILE_FIELDS = [
  "id",
  "email",
  "display_name",
  "initials",
  "role",
  "active",
  "avatar_url",
  "team",
  "bio",
  "created_at",
  "updated_at"
];
const CHANGE_FIELDS = ["id", "contact_id", "action", "field_name", "old_value", "new_value", "changed_at", "changed_by"];
const CONTACT_OWNER_FIELDS = ["contact_id", "profile_id", "assigned_at", "assigned_by"];
const NOTIFICATION_SELECT = [
  "event_id",
  "user_id",
  "read_at",
  "dismissed_at",
  "created_at",
  "notification_events(id,event_type,entity_type,entity_id,actor_id,title,body,occurred_at,route,payload,created_at)"
].join(",");
const SAVED_VIEW_FIELDS = [
  "id",
  "owner_id",
  "name",
  "description",
  "scope",
  "view_type",
  "filters",
  "search_query",
  "sort_key",
  "sort_direction",
  "page_size",
  "is_default",
  "created_at",
  "updated_at"
];
const USER_SETTINGS_FIELDS = [
  "user_id",
  "default_view_id",
  "default_view_type",
  "table_density",
  "theme",
  "font_scale",
  "page_size",
  "preferences",
  "created_at",
  "updated_at"
];
const FORMAT_FIELDS = [
  "id",
  "title",
  "format_type",
  "starts_at",
  "ends_at",
  "location",
  "goal",
  "owner_id",
  "status",
  "notes",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const FORMAT_PARTICIPANT_FIELDS = [
  "id",
  "format_id",
  "contact_id",
  "invitation_status",
  "participant_role",
  "notes",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const HOSPITATION_SLOT_FIELDS = [
  "id",
  "contact_id",
  "contact_name",
  "organization_id",
  "organization_name",
  "starts_at",
  "ends_at",
  "location",
  "city",
  "federal_state",
  "sector",
  "capacity",
  "owner_id",
  "status",
  "notes",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const HOSPITATION_FIELDS = [
  "id",
  "slot_id",
  "contact_id",
  "contact_name",
  "organization_id",
  "organization_name",
  "requester_profile_id",
  "owner_id",
  "status",
  "requested_windows",
  "starts_at",
  "ends_at",
  "location",
  "city",
  "federal_state",
  "sector",
  "goal",
  "topics",
  "request_note",
  "documentation_summary",
  "documentation_outcome",
  "follow_up_note",
  "follow_up_owner_id",
  "follow_up_due_at",
  "documented_at",
  "documented_by",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const EXPERT_GROUP_FIELDS = ["id", "name", "sort_order", "status", "created_at", "updated_at"];
const EXPERT_CONTACT_FIELDS = [
  "id",
  "name",
  "organization_id",
  "organization",
  "group_id",
  "group_name",
  "specialty",
  "role",
  "city",
  "federal_state",
  "email",
  "phone",
  "linkedin",
  "topics",
  "notes",
  "source",
  "profile_url",
  "owner_id",
  "owner_ids",
  "status",
  "created_at",
  "updated_at"
];
const EXPERT_ORGANIZATION_FIELDS = [
  "id",
  "name",
  "normalized_name",
  "group_id",
  "group_name",
  "organization_type",
  "city",
  "federal_state",
  "website",
  "phone",
  "email",
  "notes",
  "source",
  "status",
  "created_at",
  "updated_at"
];
const EXPERT_ENTITY_LINK_FIELDS = [
  "id",
  "link_type",
  "contact_id",
  "expert_contact_id",
  "organization_id",
  "expert_organization_id",
  "match_reason",
  "confidence",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const STAKEHOLDER_TYPE_FIELDS = ["id", "label", "description", "sort_order", "status", "created_at", "updated_at"];
const STAKEHOLDER_ORGANIZATION_FIELDS = [
  "id",
  "stakeholder_type_id",
  "name",
  "normalized_name",
  "organization_type",
  "postal_code",
  "city",
  "federal_state",
  "latitude",
  "longitude",
  "website",
  "phone",
  "email",
  "logo_url",
  "logo_source_url",
  "logo_source_label",
  "member_count",
  "member_count_source_url",
  "member_count_source_label",
  "member_count_updated_at",
  "member_count_scope",
  "notes",
  "source",
  "status",
  "created_at",
  "updated_at"
];
const STAKEHOLDER_PEOPLE_FIELDS = [
  "id",
  "stakeholder_type_id",
  "organization_id",
  "organization",
  "name",
  "role",
  "committee",
  "city",
  "federal_state",
  "latitude",
  "longitude",
  "map_position_source",
  "email",
  "phone",
  "linkedin",
  "topics",
  "notes",
  "source",
  "profile_url",
  "is_representative_assembly_member",
  "status",
  "created_at",
  "updated_at"
];
const PORT = Number(process.env.PORT || 8081);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const STATIC_ROOT = process.env.STATIC_ROOT ? path.resolve(process.env.STATIC_ROOT) : "";
const STATIC_INDEX = process.env.STATIC_INDEX || "login.html";
const LOG_REQUESTS = process.env.API_LOG_REQUESTS === "1";
const PROFILE_IMAGE_BUCKET = process.env.PROFILE_IMAGE_BUCKET || "";
const CONTACT_IMAGE_BUCKET = process.env.CONTACT_IMAGE_BUCKET || "";
const API_AUTH_MODE = process.env.API_AUTH_MODE || "iap";
const API_AUTH_ALLOW_DEV_PROFILE = process.env.API_AUTH_ALLOW_DEV_PROFILE === "1";
const API_AUTH_ALLOW_BEARER_DEV = process.env.API_AUTH_ALLOW_BEARER_DEV === "1";
const API_DEV_PROFILE_ID = process.env.API_DEV_PROFILE_ID || process.env.GCP_DEMO_PROFILE_ID || "";
const IAP_JWT_AUDIENCE = process.env.IAP_JWT_AUDIENCE || "";
const AUTH_EMAIL_HEADER = String(process.env.AUTH_EMAIL_HEADER || "x-auth-request-email").toLowerCase();
const AUTH_SUBJECT_HEADER = String(process.env.AUTH_SUBJECT_HEADER || "x-auth-request-user").toLowerCase();
const DEFAULT_DB_NAME = "versorgungs_kompass";
const DEFAULT_DB_USER = "vk_app";

const CONTACT_INPUT_FIELDS = [
  "id",
  "name",
  "organizationId",
  "organization_id",
  "organization",
  "category",
  "sector",
  "specialty",
  "contactRole",
  "role",
  "priority",
  "ownerId",
  "owner_id",
  "ownerIds",
  "owner_ids",
  "owners",
  "owner",
  "postalCode",
  "postal_code",
  "city",
  "state",
  "federal_state",
  "latitude",
  "lat",
  "longitude",
  "lon",
  "email",
  "phone",
  "linkedin",
  "themes",
  "topics",
  "note",
  "notes",
  "sources",
  "source",
  "image",
  "image_url",
  "imageSourceUrl",
  "image_source_url",
  "imageSourceLabel",
  "image_source_label",
  "imageRightsNote",
  "image_rights_note",
  "imageUpdatedAt",
  "image_updated_at",
  "imageUpdatedBy",
  "image_updated_by",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "status"
];
const CONTACT_CREATE_WRAPPER_FIELDS = ["contact", "options"];
const CONTACT_CREATE_OPTIONS_FIELDS = ["action", "batchId", "batch_id"];
const ORGANIZATION_INPUT_FIELDS = [
  "id",
  "name",
  "normalizedName",
  "normalized_name",
  "sector",
  "organizationType",
  "organization_type",
  "postalCode",
  "postal_code",
  "city",
  "state",
  "federal_state",
  "latitude",
  "lat",
  "longitude",
  "lon",
  "website",
  "phone",
  "email",
  "notes",
  "note",
  "source",
  "status"
];
const PROFILE_PATCH_FIELDS = ["displayName", "display_name", "initials", "team", "bio", "avatarUrl", "avatar_url"];
const PROFILE_AVATAR_UPLOAD_FIELDS = ["fileName", "contentType", "data"];
const SAVED_VIEW_INPUT_FIELDS = [
  "id",
  "name",
  "description",
  "scope",
  "viewType",
  "view_type",
  "filters",
  "searchQuery",
  "search_query",
  "sortKey",
  "sort_key",
  "sortDirection",
  "sort_direction",
  "pageSize",
  "page_size",
  "isDefault",
  "is_default"
];
const USER_SETTINGS_INPUT_FIELDS = [
  "defaultViewId",
  "default_view_id",
  "defaultViewType",
  "default_view_type",
  "tableDensity",
  "table_density",
  "theme",
  "fontScale",
  "font_scale",
  "pageSize",
  "page_size",
  "preferences"
];
const FORMAT_INPUT_FIELDS = [
  "id",
  "title",
  "formatType",
  "format_type",
  "startsAt",
  "starts_at",
  "endsAt",
  "ends_at",
  "location",
  "goal",
  "ownerId",
  "owner_id",
  "owner",
  "status",
  "notes"
];
const FORMAT_PARTICIPANT_INPUT_FIELDS = ["contactId", "contact_id", "invitationStatus", "invitation_status", "participantRole", "participant_role", "notes"];
const HOSPITATION_SLOT_INPUT_FIELDS = [
  "id",
  "contactId",
  "contact_id",
  "contactName",
  "contact_name",
  "organizationId",
  "organization_id",
  "organizationName",
  "organization_name",
  "startsAt",
  "starts_at",
  "endsAt",
  "ends_at",
  "location",
  "city",
  "state",
  "federalState",
  "federal_state",
  "sector",
  "capacity",
  "ownerId",
  "owner_id",
  "owner",
  "status",
  "notes"
];
const HOSPITATION_INPUT_FIELDS = [
  "id",
  "slotId",
  "slot_id",
  "contactId",
  "contact_id",
  "contactName",
  "contact_name",
  "organizationId",
  "organization_id",
  "organizationName",
  "organization_name",
  "requesterProfileId",
  "requester_profile_id",
  "ownerId",
  "owner_id",
  "owner",
  "status",
  "requestedWindows",
  "requested_windows",
  "startsAt",
  "starts_at",
  "endsAt",
  "ends_at",
  "location",
  "city",
  "state",
  "federalState",
  "federal_state",
  "sector",
  "goal",
  "topics",
  "requestNote",
  "request_note",
  "documentationSummary",
  "documentation_summary",
  "documentationOutcome",
  "documentation_outcome",
  "followUpNote",
  "follow_up_note",
  "followUpOwnerId",
  "follow_up_owner_id",
  "followUpDueAt",
  "follow_up_due_at",
  "documentedAt",
  "documented_at",
  "documentedBy",
  "documented_by"
];
const EXPERT_CONTACT_INPUT_FIELDS = [
  "id",
  "name",
  "organizationId",
  "organization_id",
  "organization",
  "groupId",
  "group_id",
  "group",
  "groupName",
  "group_name",
  "category",
  "specialty",
  "contactRole",
  "role",
  "city",
  "state",
  "federal_state",
  "email",
  "phone",
  "linkedin",
  "themes",
  "topics",
  "note",
  "notes",
  "sources",
  "source",
  "url",
  "sourceUrl",
  "profileUrl",
  "profile_url",
  "ownerId",
  "owner_id",
  "ownerIds",
  "owner_ids",
  "owner",
  "status"
];
const EXPERT_ORGANIZATION_INPUT_FIELDS = [
  "id",
  "name",
  "normalizedName",
  "normalized_name",
  "groupId",
  "group_id",
  "group",
  "groupName",
  "group_name",
  "sector",
  "category",
  "organizationType",
  "organization_type",
  "city",
  "state",
  "federal_state",
  "website",
  "phone",
  "email",
  "notes",
  "source",
  "status"
];
const EXPERT_ENTITY_LINK_INPUT_FIELDS = [
  "linkType",
  "link_type",
  "contactId",
  "contact_id",
  "expertContactId",
  "expert_contact_id",
  "organizationId",
  "organization_id",
  "expertOrganizationId",
  "expert_organization_id",
  "matchReason",
  "match_reason",
  "confidence",
  "score"
];
const STAKEHOLDER_IMPORT_INPUT_FIELDS = ["types", "organizations", "people"];

let profileCache = { expiresAt: 0, byId: new Map() };
let iapKeyCache = { expiresAt: 0, keys: new Map() };
let supportsContactOwners = true;
let pool = null;

const ROLE_MATRIX = [
  {
    role: "admin",
    label: "Admin",
    canRead: true,
    canWrite: true,
    canDelete: true,
    canExport: true,
    canOperate: true
  },
  {
    role: "editor",
    label: "Editor",
    canRead: true,
    canWrite: true,
    canDelete: false,
    canExport: false,
    canOperate: false
  },
  {
    role: "viewer",
    label: "Viewer",
    canRead: true,
    canWrite: false,
    canDelete: false,
    canExport: false,
    canOperate: false
  }
];

function withoutTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(/\s*;\s*|\s*\|\s*|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePriority(value) {
  const label = String(value || "").trim();
  if (["Hoch", "Mittel", "Niedrig"].includes(label)) return label;
  return "Mittel";
}

function normalizeFormatStatus(value) {
  const label = String(value || "").trim();
  if (["Planung", "Aktiv", "Abgeschlossen", "Archiviert"].includes(label)) return label;
  if (label === "archived") return "Archiviert";
  return "Planung";
}

function normalizeInvitationStatus(value) {
  const label = String(value || "").trim();
  if (["Kandidat", "Eingeladen", "Zugesagt", "Abgesagt", "Keine Rückmeldung", "Teilgenommen"].includes(label)) return label;
  return "Kandidat";
}

function normalizeHospitationStatus(value) {
  const label = String(value || "").trim();
  if (["Entwurf", "Angefragt", "Angeboten", "Gebucht", "Abgelehnt", "Abgesagt", "Durchgeführt", "Dokumentiert", "Archiviert"].includes(label)) return label;
  if (label === "archived") return "Archiviert";
  return "Angefragt";
}

function normalizeHospitationSlotStatus(value) {
  const label = String(value || "").trim();
  if (["Frei", "Reserviert", "Gebucht", "Abgesagt", "Archiviert"].includes(label)) return label;
  if (label === "archived") return "Archiviert";
  return "Frei";
}

function stringifyValue(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeOrganizationName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseLocalizedInteger(value) {
  if (Number.isFinite(value)) return Math.round(value);
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let normalized = raw.replace(/\s/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/[.,]/g, "");
  } else if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function profileName(id) {
  const profile = profileCache.byId.get(id);
  return profile?.display_name || profile?.email || "";
}

function profileSummary(id) {
  const profile = profileCache.byId.get(id);
  if (!profile) return null;
  return {
    id: profile.id,
    displayName: profile.display_name || profile.email || "",
    initials: profile.initials || "",
    role: profile.role || "viewer",
    avatarUrl: profile.avatar_url || ""
  };
}

function resolveOwnerId(value) {
  const normalizedOwner = String(value || "").trim().toLowerCase();
  if (!normalizedOwner) return null;
  if (profileCache.byId.has(value)) return value;
  const profile = [...profileCache.byId.values()].find((item) =>
    [item.display_name, item.email, item.initials].some((candidate) => String(candidate || "").trim().toLowerCase() === normalizedOwner)
  );
  return profile?.id || null;
}

function splitOwnerTokens(value) {
  if (Array.isArray(value)) return value.flatMap(splitOwnerTokens);
  if (value && typeof value === "object") return splitOwnerTokens(value.id || value.profileId || value.profile_id || value.value || "");
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOwnerIds(values = []) {
  const ids = [];
  splitOwnerTokens(values).forEach((value) => {
    const id = resolveOwnerId(value);
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

function ownerIdsFromContact(contact = {}) {
  if (Array.isArray(contact.ownerIds)) return normalizeOwnerIds(contact.ownerIds);
  if (Array.isArray(contact.owner_ids)) return normalizeOwnerIds(contact.owner_ids);
  if (Array.isArray(contact.owners)) return normalizeOwnerIds(contact.owners);
  return normalizeOwnerIds([
    contact.ownerId,
    contact.owner_id,
    contact.owner
  ]);
}

function ownerSummaries(ownerIds = []) {
  return normalizeOwnerIds(ownerIds)
    .map((id) => profileSummary(id))
    .filter(Boolean);
}

function decorateContactOwners(contact = {}, ownerIds = null) {
  const ids = normalizeOwnerIds(Array.isArray(ownerIds) ? ownerIds : ownerIdsFromContact(contact));
  const owners = ownerSummaries(ids);
  return {
    ...contact,
    ownerIds: ids,
    owners,
    ownerId: ids[0] || contact.ownerId || "",
    owner: owners.map((owner) => owner.displayName).filter(Boolean).join(", ") || contact.owner || ""
  };
}

function contactOwnersChanged(oldOwnerIds = [], nextOwnerIds = []) {
  return stringifyValue(normalizeOwnerIds(oldOwnerIds)) !== stringifyValue(normalizeOwnerIds(nextOwnerIds));
}

function uniqueIds(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function idsExcept(values = [], excludedId = "") {
  return uniqueIds(values).filter((id) => id !== excludedId);
}

function activeProfileIds() {
  return [...profileCache.byId.values()]
    .filter((profile) => profile?.active !== false)
    .map((profile) => profile.id)
    .filter(Boolean);
}

function adminProfileIds() {
  return [...profileCache.byId.values()]
    .filter((profile) => profile?.active !== false && String(profile.role || "").toLowerCase() === "admin")
    .map((profile) => profile.id)
    .filter(Boolean);
}

function notificationContext(entityType = "", eventType = "") {
  const entity = String(entityType || "").toLowerCase();
  const event = String(eventType || "").toLowerCase();
  if (entity === "contact") return "contacts";
  if (entity === "organization") return "organizations";
  if (entity === "format" || entity === "format_participant") return "formats";
  if (entity === "profile" || event.includes("team") || event.includes("account")) return "team";
  if (entity === "product" || event.includes("feature")) return "product";
  return "all";
}

function notificationToDto(row = {}) {
  const event = row.notification_events || row.event || row;
  const eventId = event.id || row.event_id || row.eventId || "";
  const eventType = event.event_type || event.eventType || "";
  const entityType = event.entity_type || event.entityType || "";
  const actorId = event.actor_id || event.actorId || "";
  return {
    id: eventId,
    eventId,
    eventType,
    entityType,
    entityId: event.entity_id || event.entityId || "",
    context: notificationContext(entityType, eventType),
    actorId,
    actor: profileSummary(actorId),
    title: event.title || "Hinweis",
    body: event.body || "",
    route: event.route || "",
    payload: event.payload || {},
    occurredAt: event.occurred_at || event.occurredAt || row.created_at || "",
    createdAt: row.created_at || event.created_at || "",
    readAt: row.read_at || "",
    dismissedAt: row.dismissed_at || "",
    unread: !Boolean(row.read_at)
  };
}

function notificationMatchesContext(notification, context = "") {
  const normalized = String(context || "all").trim();
  return !normalized || normalized === "all" || notification.context === normalized;
}

function sortNotifications(items = []) {
  return [...items].sort((left, right) => {
    const time = new Date(right.occurredAt || right.createdAt || 0).getTime() - new Date(left.occurredAt || left.createdAt || 0).getTime();
    return time || String(right.id).localeCompare(String(left.id));
  });
}

function isMissingNotificationsError(error) {
  return /notification_events|notification_recipients|create_notification_event|schema cache|relation .* does not exist|function .* does not exist/i.test(String(error?.message || error?.details || error?.hint || ""));
}

function contactRoute(contactId = "") {
  return contactId ? `#contacts?contact=${encodeURIComponent(contactId)}` : "#contacts";
}

function organizationRoute(organizationId = "") {
  return organizationId ? `#organizations?organization=${encodeURIComponent(organizationId)}` : "#organizations";
}

function formatRoute(formatId = "") {
  return formatId ? `#formats?format=${encodeURIComponent(formatId)}` : "#formats";
}

function contactToDto(row, index = 0, ownerIds = null) {
  const topics = splitList(row.topics);
  return decorateContactOwners({
    id: row.id,
    organizationId: row.organization_id || "",
    name: row.name || "",
    organization: row.organization || "",
    category: row.sector || "Praxis",
    specialty: row.specialty || "",
    contactRole: row.role || "",
    priority: normalizePriority(row.priority),
    owner: profileName(row.owner_id),
    ownerId: row.owner_id || "",
    postalCode: row.postal_code || "",
    city: row.city || "",
    state: row.federal_state || "",
    latitude: row.latitude,
    longitude: row.longitude,
    lat: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    lon: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    email: row.email || "",
    phone: row.phone || "",
    linkedin: row.linkedin || "",
    themes: topics,
    note: row.notes || "",
    sources: splitList(row.source),
    image: row.image_url || "",
    imageSourceUrl: row.image_source_url || "",
    imageSourceLabel: row.image_source_label || "",
    imageRightsNote: row.image_rights_note || "",
    imageUpdatedAt: row.image_updated_at || "",
    imageUpdatedBy: row.image_updated_by || "",
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
    location: [row.postal_code, row.city].filter(Boolean).join(" "),
    topic: topics.length ? `Themen: ${topics.join(" · ")}` : "",
    description: row.sector ? `Sektor: ${row.sector}` : "",
    _index: index
  }, ownerIds);
}

function organizationToDto(row, contactCount = 0) {
  return {
    id: row.id,
    name: row.name || "",
    normalizedName: row.normalized_name || normalizeOrganizationName(row.name),
    sector: row.sector || "",
    organizationType: row.organization_type || "",
    postalCode: row.postal_code || "",
    city: row.city || "",
    state: row.federal_state || "",
    latitude: row.latitude,
    longitude: row.longitude,
    lat: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    lon: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    website: row.website || "",
    phone: row.phone || "",
    email: row.email || "",
    notes: row.notes || "",
    source: row.source || "",
    status: row.status || "active",
    contactCount,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || ""
  };
}

function expertGroupToDto(row, index = 0) {
  return {
    id: row.id || `expert-group-${index + 1}`,
    name: row.name || "",
    sortOrder: Number(row.sort_order ?? (index + 1) * 10),
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function expertContactToDto(row, index = 0) {
  const topics = splitList(row.topics);
  return {
    id: row.id,
    name: row.name || "",
    organizationId: row.organization_id || "",
    organization: row.organization || "",
    groupId: row.group_id || "",
    group: row.group_name || "",
    category: row.group_name || "",
    specialty: row.specialty || "",
    contactRole: row.role || "",
    city: row.city || "",
    state: row.federal_state || "",
    email: row.email || "",
    phone: row.phone || "",
    linkedin: row.linkedin || "",
    themes: topics,
    note: row.notes || "",
    sources: splitList(row.source || "INA Expertenkreis"),
    url: row.profile_url || "",
    sourceUrl: row.profile_url || "",
    ownerId: row.owner_id || "",
    ownerIds: Array.isArray(row.owner_ids) ? row.owner_ids : [],
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    _index: index
  };
}

function expertOrganizationToDto(row, contactCount = 0) {
  return {
    id: row.id,
    name: row.name || "",
    normalizedName: row.normalized_name || normalizeOrganizationName(row.name),
    groupId: row.group_id || "",
    group: row.group_name || "",
    sector: row.group_name || "",
    organizationType: row.organization_type || "",
    city: row.city || "",
    state: row.federal_state || "",
    website: row.website || "",
    phone: row.phone || "",
    email: row.email || "",
    notes: row.notes || "",
    source: row.source || "",
    status: row.status || "active",
    contactCount,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function expertEntityLinkToDto(row = {}) {
  return {
    id: row.id || "",
    linkType: row.link_type || "",
    contactId: row.contact_id || "",
    expertContactId: row.expert_contact_id || "",
    organizationId: row.organization_id || "",
    expertOrganizationId: row.expert_organization_id || "",
    matchReason: row.match_reason || "",
    confidence: Number(row.confidence || 0),
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || ""
  };
}

function stakeholderTypeToDto(row, index = 0) {
  return {
    id: row.id || `stakeholder-type-${index + 1}`,
    label: row.label || "",
    description: row.description || "",
    sortOrder: Number(row.sort_order ?? (index + 1) * 10),
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function stakeholderOrganizationToDto(row, personCount = 0) {
  return {
    id: row.id || "",
    stakeholderTypeId: row.stakeholder_type_id || "",
    stakeholderType: row.stakeholder_type_id || "",
    name: row.name || "",
    normalizedName: row.normalized_name || normalizeOrganizationName(row.name),
    organizationType: row.organization_type || "",
    postalCode: row.postal_code || "",
    city: row.city || "",
    state: row.federal_state || "",
    latitude: row.latitude,
    longitude: row.longitude,
    lat: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    lon: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    website: row.website || "",
    phone: row.phone || "",
    email: row.email || "",
    logoUrl: row.logo_url || "",
    logoSourceUrl: row.logo_source_url || "",
    logoSourceLabel: row.logo_source_label || "",
    memberCount: Number.isFinite(Number(row.member_count)) ? Number(row.member_count) : null,
    memberCountSourceUrl: row.member_count_source_url || "",
    memberCountSourceLabel: row.member_count_source_label || "",
    memberCountUpdatedAt: row.member_count_updated_at || "",
    memberCountScope: row.member_count_scope || "",
    notes: row.notes || "",
    source: row.source || "",
    status: row.status || "active",
    personCount,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function stakeholderPersonToDto(row, index = 0) {
  const topics = splitList(row.topics);
  return {
    id: row.id || `stakeholder-person-${index + 1}`,
    stakeholderTypeId: row.stakeholder_type_id || "",
    stakeholderType: row.stakeholder_type_id || "",
    organizationId: row.organization_id || "",
    organization: row.organization || "",
    name: row.name || "",
    role: row.role || "",
    contactRole: row.role || "",
    committee: row.committee || "",
    city: row.city || "",
    state: row.federal_state || "",
    latitude: row.latitude,
    longitude: row.longitude,
    lat: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    lon: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    mapPositionSource: row.map_position_source || "",
    email: row.email || "",
    phone: row.phone || "",
    linkedin: row.linkedin || "",
    themes: topics,
    note: row.notes || "",
    source: row.source || "",
    sources: splitList(row.source),
    url: row.profile_url || "",
    isRepresentativeAssemblyMember: Boolean(row.is_representative_assembly_member),
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    _index: index
  };
}

function savedViewToDto(row) {
  return {
    id: row.id,
    ownerId: row.owner_id || "",
    name: row.name || "Gespeicherte Suche",
    description: row.description || "",
    scope: row.scope || "private",
    viewType: row.view_type || "contacts",
    filters: row.filters || {},
    searchQuery: row.search_query || "",
    sortKey: row.sort_key || "updated_at",
    sortDirection: row.sort_direction || "desc",
    pageSize: row.page_size || 20,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    owner: profileSummary(row.owner_id)
  };
}

function userSettingsToDto(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    defaultViewId: row.default_view_id || "",
    defaultViewType: row.default_view_type || "contacts",
    tableDensity: row.table_density || "comfortable",
    theme: row.theme || "system",
    fontScale: Number(row.font_scale || 1),
    pageSize: row.page_size || 20,
    preferences: row.preferences || {},
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function formatParticipantToDto(row) {
  return {
    id: row.id || "",
    formatId: row.format_id || "",
    contactId: row.contact_id || "",
    invitationStatus: normalizeInvitationStatus(row.invitation_status),
    participantRole: row.participant_role || "",
    notes: row.notes || "",
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || ""
  };
}

function formatToDto(row, participants = []) {
  return {
    id: row.id || "",
    title: row.title || "Unbenanntes Format",
    formatType: row.format_type || "Roundtable",
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    location: row.location || "",
    goal: row.goal || "",
    ownerId: row.owner_id || "",
    owner: profileName(row.owner_id),
    status: normalizeFormatStatus(row.status),
    notes: row.notes || "",
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || "",
    participants: participants.map(formatParticipantToDto)
  };
}

function changeKind(change = {}) {
  if (change.action === "archive") return "archive";
  if (change.action === "create") return "create";
  if (change.action === "import") return "import";
  if (change.fieldName === "status" && change.newValue === "active" && change.oldValue === "archived") return "restore";
  if (["owner_id", "owner_ids", "owner", "ownerId", "ownerIds"].includes(change.fieldName)) return "owner";
  return "update";
}

function changeContactSummary(row) {
  const contact = row.contacts || row.contact || null;
  if (!contact) return null;
  return {
    id: contact.id || row.contact_id || "",
    name: contact.name || "",
    organization: contact.organization || "",
    sector: contact.sector || "",
    specialty: contact.specialty || "",
    city: contact.city || "",
    state: contact.federal_state || contact.state || "",
    image: contact.image_url || "",
    status: contact.status || "active"
  };
}

function changeToDto(row) {
  const change = {
    id: row.id,
    contactId: row.contact_id,
    action: row.action || "update",
    fieldName: row.field_name || "",
    oldValue: row.old_value || "",
    newValue: row.new_value || "",
    changedAt: row.changed_at || "",
    changedBy: row.changed_by || "",
    user: profileSummary(row.changed_by),
    contact: changeContactSummary(row)
  };
  return { ...change, kind: changeKind(change) };
}

function savedViewToDb(view = {}, ownerId) {
  return {
    owner_id: ownerId,
    name: String(view.name || "").trim(),
    description: String(view.description || "").trim() || null,
    scope: view.scope === "team" ? "team" : "private",
    view_type: view.viewType || view.view_type || "contacts",
    filters: view.filters || {},
    search_query: String(view.searchQuery || view.search_query || "").trim(),
    sort_key: view.sortKey || view.sort_key || "updated_at",
    sort_direction: view.sortDirection === "asc" || view.sort_direction === "asc" ? "asc" : "desc",
    page_size: Number(view.pageSize || view.page_size || 20),
    is_default: Boolean(view.isDefault || view.is_default)
  };
}

function savedViewPatchToDb(patch = {}) {
  const db = {};
  if ("name" in patch) db.name = String(patch.name || "").trim();
  if ("description" in patch) db.description = String(patch.description || "").trim() || null;
  if ("scope" in patch) db.scope = patch.scope === "team" ? "team" : "private";
  if ("viewType" in patch || "view_type" in patch) db.view_type = patch.viewType || patch.view_type || "contacts";
  if ("filters" in patch) db.filters = patch.filters || {};
  if ("searchQuery" in patch || "search_query" in patch) db.search_query = String(patch.searchQuery || patch.search_query || "").trim();
  if ("sortKey" in patch || "sort_key" in patch) db.sort_key = patch.sortKey || patch.sort_key || "updated_at";
  if ("sortDirection" in patch || "sort_direction" in patch) db.sort_direction = patch.sortDirection === "asc" || patch.sort_direction === "asc" ? "asc" : "desc";
  if ("pageSize" in patch || "page_size" in patch) db.page_size = Number(patch.pageSize || patch.page_size || 20);
  if ("isDefault" in patch || "is_default" in patch) db.is_default = Boolean(patch.isDefault || patch.is_default);
  return db;
}

function userSettingsToDb(settings = {}, userId) {
  return {
    user_id: userId,
    default_view_id: settings.defaultViewId || settings.default_view_id || null,
    default_view_type: settings.defaultViewType || settings.default_view_type || "contacts",
    table_density: settings.tableDensity || settings.table_density || "comfortable",
    theme: settings.theme || "system",
    font_scale: Number(settings.fontScale || settings.font_scale || 1),
    page_size: Number(settings.pageSize || settings.page_size || 20),
    preferences: settings.preferences || {}
  };
}

function profilePatchToDb(profile = {}) {
  const db = {};
  if ("displayName" in profile || "display_name" in profile) db.display_name = String(profile.displayName ?? profile.display_name ?? "").trim();
  if ("initials" in profile) db.initials = String(profile.initials || "").trim().slice(0, 4).toUpperCase() || null;
  if ("team" in profile) db.team = String(profile.team || "").trim() || null;
  if ("bio" in profile) db.bio = String(profile.bio || "").trim() || null;
  if ("avatarUrl" in profile || "avatar_url" in profile) db.avatar_url = profile.avatarUrl ?? profile.avatar_url ?? null;
  return db;
}

function profileAvatarUrl(profileId) {
  return `/api/profile-avatar/${encodeURIComponent(profileId)}`;
}

function profileRowToClient(row = {}) {
  if (!row) return row;
  const avatar = String(row.avatar_url || "");
  return {
    ...row,
    avatar_url: avatar.startsWith("gs://") ? profileAvatarUrl(row.id) : avatar
  };
}

function formatToDb(format = {}) {
  return {
    id: String(format.id || generatedId("format")).trim(),
    title: String(format.title || "").trim(),
    format_type: String(format.formatType || format.format_type || "Roundtable").trim() || "Roundtable",
    starts_at: format.startsAt || format.starts_at || null,
    ends_at: format.endsAt || format.ends_at || null,
    location: String(format.location || "").trim() || null,
    goal: String(format.goal || "").trim() || null,
    owner_id: format.ownerId || format.owner_id || resolveOwnerId(format.owner) || null,
    status: normalizeFormatStatus(format.status),
    notes: String(format.notes || "").trim() || null
  };
}

function formatPatchToDb(patch = {}) {
  const db = {};
  if ("title" in patch) db.title = String(patch.title || "").trim();
  if ("formatType" in patch || "format_type" in patch) db.format_type = String(patch.formatType || patch.format_type || "Roundtable").trim() || "Roundtable";
  if ("startsAt" in patch || "starts_at" in patch) db.starts_at = patch.startsAt || patch.starts_at || null;
  if ("endsAt" in patch || "ends_at" in patch) db.ends_at = patch.endsAt || patch.ends_at || null;
  if ("location" in patch) db.location = String(patch.location || "").trim() || null;
  if ("goal" in patch) db.goal = String(patch.goal || "").trim() || null;
  if ("ownerId" in patch || "owner_id" in patch) db.owner_id = patch.ownerId || patch.owner_id || null;
  if (!("ownerId" in patch) && !("owner_id" in patch) && "owner" in patch) db.owner_id = resolveOwnerId(patch.owner);
  if ("status" in patch) db.status = normalizeFormatStatus(patch.status);
  if ("notes" in patch) db.notes = String(patch.notes || "").trim() || null;
  return db;
}

function formatParticipantToDb(participant = {}, formatId, contactId) {
  return {
    id: String(participant.id || generatedId("format-participant")).trim(),
    format_id: formatId || participant.formatId || participant.format_id,
    contact_id: contactId || participant.contactId || participant.contact_id,
    invitation_status: normalizeInvitationStatus(participant.invitationStatus || participant.invitation_status),
    participant_role: String(participant.participantRole || participant.participant_role || "").trim() || null,
    notes: String(participant.notes || "").trim() || null
  };
}

function formatParticipantPatchToDb(patch = {}) {
  const db = {};
  if ("invitationStatus" in patch || "invitation_status" in patch) db.invitation_status = normalizeInvitationStatus(patch.invitationStatus || patch.invitation_status);
  if ("participantRole" in patch || "participant_role" in patch) db.participant_role = String(patch.participantRole || patch.participant_role || "").trim() || null;
  if ("notes" in patch) db.notes = String(patch.notes || "").trim() || null;
  return db;
}

function hospitationSlotToDto(row = {}) {
  return {
    id: row.id || "",
    contactId: row.contact_id || "",
    contactName: row.contact_name || "",
    organizationId: row.organization_id || "",
    organizationName: row.organization_name || "",
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    location: row.location || "",
    city: row.city || "",
    state: row.federal_state || "",
    sector: row.sector || "",
    capacity: Number(row.capacity || 1),
    ownerId: row.owner_id || "",
    owner: profileName(row.owner_id),
    status: normalizeHospitationSlotStatus(row.status),
    notes: row.notes || "",
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || ""
  };
}

function hospitationToDto(row = {}) {
  return {
    id: row.id || "",
    slotId: row.slot_id || "",
    contactId: row.contact_id || "",
    contactName: row.contact_name || "",
    organizationId: row.organization_id || "",
    organizationName: row.organization_name || "",
    requesterProfileId: row.requester_profile_id || "",
    requester: profileName(row.requester_profile_id),
    ownerId: row.owner_id || "",
    owner: profileName(row.owner_id),
    status: normalizeHospitationStatus(row.status),
    requestedWindows: Array.isArray(row.requested_windows) ? row.requested_windows : [],
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    location: row.location || "",
    city: row.city || "",
    state: row.federal_state || "",
    sector: row.sector || "",
    goal: row.goal || "",
    topics: Array.isArray(row.topics) ? row.topics : [],
    requestNote: row.request_note || "",
    documentationSummary: row.documentation_summary || "",
    documentationOutcome: row.documentation_outcome || "",
    followUpNote: row.follow_up_note || "",
    followUpOwnerId: row.follow_up_owner_id || "",
    followUpOwner: profileName(row.follow_up_owner_id),
    followUpDueAt: row.follow_up_due_at || "",
    documentedAt: row.documented_at || "",
    documentedBy: row.documented_by || "",
    documentedByName: profileName(row.documented_by),
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || ""
  };
}

function hospitationSlotToDb(slot = {}) {
  return {
    id: String(slot.id || generatedId("hospitation-slot")).trim(),
    contact_id: slot.contactId || slot.contact_id || null,
    contact_name: String(slot.contactName || slot.contact_name || "").trim() || null,
    organization_id: slot.organizationId || slot.organization_id || null,
    organization_name: String(slot.organizationName || slot.organization_name || "").trim() || null,
    starts_at: slot.startsAt || slot.starts_at || null,
    ends_at: slot.endsAt || slot.ends_at || null,
    location: String(slot.location || "").trim() || null,
    city: String(slot.city || "").trim() || null,
    federal_state: String(slot.federalState || slot.federal_state || slot.state || "").trim() || null,
    sector: String(slot.sector || "").trim() || null,
    capacity: Math.max(1, Number.parseInt(slot.capacity || 1, 10) || 1),
    owner_id: slot.ownerId || slot.owner_id || resolveOwnerId(slot.owner) || null,
    status: normalizeHospitationSlotStatus(slot.status),
    notes: String(slot.notes || "").trim() || null
  };
}

function hospitationSlotPatchToDb(patch = {}) {
  const db = {};
  if ("contactId" in patch || "contact_id" in patch) db.contact_id = patch.contactId || patch.contact_id || null;
  if ("contactName" in patch || "contact_name" in patch) db.contact_name = String(patch.contactName || patch.contact_name || "").trim() || null;
  if ("organizationId" in patch || "organization_id" in patch) db.organization_id = patch.organizationId || patch.organization_id || null;
  if ("organizationName" in patch || "organization_name" in patch) db.organization_name = String(patch.organizationName || patch.organization_name || "").trim() || null;
  if ("startsAt" in patch || "starts_at" in patch) db.starts_at = patch.startsAt || patch.starts_at || null;
  if ("endsAt" in patch || "ends_at" in patch) db.ends_at = patch.endsAt || patch.ends_at || null;
  if ("location" in patch) db.location = String(patch.location || "").trim() || null;
  if ("city" in patch) db.city = String(patch.city || "").trim() || null;
  if ("federalState" in patch || "federal_state" in patch || "state" in patch) db.federal_state = String(patch.federalState || patch.federal_state || patch.state || "").trim() || null;
  if ("sector" in patch) db.sector = String(patch.sector || "").trim() || null;
  if ("capacity" in patch) db.capacity = Math.max(1, Number.parseInt(patch.capacity || 1, 10) || 1);
  if ("ownerId" in patch || "owner_id" in patch) db.owner_id = patch.ownerId || patch.owner_id || null;
  if (!("ownerId" in patch) && !("owner_id" in patch) && "owner" in patch) db.owner_id = resolveOwnerId(patch.owner);
  if ("status" in patch) db.status = normalizeHospitationSlotStatus(patch.status);
  if ("notes" in patch) db.notes = String(patch.notes || "").trim() || null;
  return db;
}

function hospitationToDb(hospitation = {}, userId = "") {
  return {
    id: String(hospitation.id || generatedId("hospitation")).trim(),
    slot_id: hospitation.slotId || hospitation.slot_id || null,
    contact_id: hospitation.contactId || hospitation.contact_id || null,
    contact_name: String(hospitation.contactName || hospitation.contact_name || "").trim() || null,
    organization_id: hospitation.organizationId || hospitation.organization_id || null,
    organization_name: String(hospitation.organizationName || hospitation.organization_name || "").trim() || null,
    requester_profile_id: hospitation.requesterProfileId || hospitation.requester_profile_id || userId || null,
    owner_id: hospitation.ownerId || hospitation.owner_id || resolveOwnerId(hospitation.owner) || userId || null,
    status: normalizeHospitationStatus(hospitation.status),
    requested_windows: Array.isArray(hospitation.requestedWindows || hospitation.requested_windows) ? hospitation.requestedWindows || hospitation.requested_windows : [],
    starts_at: hospitation.startsAt || hospitation.starts_at || null,
    ends_at: hospitation.endsAt || hospitation.ends_at || null,
    location: String(hospitation.location || "").trim() || null,
    city: String(hospitation.city || "").trim() || null,
    federal_state: String(hospitation.federalState || hospitation.federal_state || hospitation.state || "").trim() || null,
    sector: String(hospitation.sector || "").trim() || null,
    goal: String(hospitation.goal || "").trim() || null,
    topics: splitList(hospitation.topics),
    request_note: String(hospitation.requestNote || hospitation.request_note || "").trim() || null,
    documentation_summary: String(hospitation.documentationSummary || hospitation.documentation_summary || "").trim() || null,
    documentation_outcome: String(hospitation.documentationOutcome || hospitation.documentation_outcome || "").trim() || null,
    follow_up_note: String(hospitation.followUpNote || hospitation.follow_up_note || "").trim() || null,
    follow_up_owner_id: hospitation.followUpOwnerId || hospitation.follow_up_owner_id || null,
    follow_up_due_at: hospitation.followUpDueAt || hospitation.follow_up_due_at || null,
    documented_at: hospitation.documentedAt || hospitation.documented_at || null,
    documented_by: hospitation.documentedBy || hospitation.documented_by || null
  };
}

function hospitationPatchToDb(patch = {}) {
  const db = {};
  if ("slotId" in patch || "slot_id" in patch) db.slot_id = patch.slotId || patch.slot_id || null;
  if ("contactId" in patch || "contact_id" in patch) db.contact_id = patch.contactId || patch.contact_id || null;
  if ("contactName" in patch || "contact_name" in patch) db.contact_name = String(patch.contactName || patch.contact_name || "").trim() || null;
  if ("organizationId" in patch || "organization_id" in patch) db.organization_id = patch.organizationId || patch.organization_id || null;
  if ("organizationName" in patch || "organization_name" in patch) db.organization_name = String(patch.organizationName || patch.organization_name || "").trim() || null;
  if ("requesterProfileId" in patch || "requester_profile_id" in patch) db.requester_profile_id = patch.requesterProfileId || patch.requester_profile_id || null;
  if ("ownerId" in patch || "owner_id" in patch) db.owner_id = patch.ownerId || patch.owner_id || null;
  if (!("ownerId" in patch) && !("owner_id" in patch) && "owner" in patch) db.owner_id = resolveOwnerId(patch.owner);
  if ("status" in patch) db.status = normalizeHospitationStatus(patch.status);
  if ("requestedWindows" in patch || "requested_windows" in patch) db.requested_windows = Array.isArray(patch.requestedWindows || patch.requested_windows) ? patch.requestedWindows || patch.requested_windows : [];
  if ("startsAt" in patch || "starts_at" in patch) db.starts_at = patch.startsAt || patch.starts_at || null;
  if ("endsAt" in patch || "ends_at" in patch) db.ends_at = patch.endsAt || patch.ends_at || null;
  if ("location" in patch) db.location = String(patch.location || "").trim() || null;
  if ("city" in patch) db.city = String(patch.city || "").trim() || null;
  if ("federalState" in patch || "federal_state" in patch || "state" in patch) db.federal_state = String(patch.federalState || patch.federal_state || patch.state || "").trim() || null;
  if ("sector" in patch) db.sector = String(patch.sector || "").trim() || null;
  if ("goal" in patch) db.goal = String(patch.goal || "").trim() || null;
  if ("topics" in patch) db.topics = splitList(patch.topics);
  if ("requestNote" in patch || "request_note" in patch) db.request_note = String(patch.requestNote || patch.request_note || "").trim() || null;
  if ("documentationSummary" in patch || "documentation_summary" in patch) db.documentation_summary = String(patch.documentationSummary || patch.documentation_summary || "").trim() || null;
  if ("documentationOutcome" in patch || "documentation_outcome" in patch) db.documentation_outcome = String(patch.documentationOutcome || patch.documentation_outcome || "").trim() || null;
  if ("followUpNote" in patch || "follow_up_note" in patch) db.follow_up_note = String(patch.followUpNote || patch.follow_up_note || "").trim() || null;
  if ("followUpOwnerId" in patch || "follow_up_owner_id" in patch) db.follow_up_owner_id = patch.followUpOwnerId || patch.follow_up_owner_id || null;
  if ("followUpDueAt" in patch || "follow_up_due_at" in patch) db.follow_up_due_at = patch.followUpDueAt || patch.follow_up_due_at || null;
  if ("documentedAt" in patch || "documented_at" in patch) db.documented_at = patch.documentedAt || patch.documented_at || null;
  if ("documentedBy" in patch || "documented_by" in patch) db.documented_by = patch.documentedBy || patch.documented_by || null;
  return db;
}

function expertEntityLinkToDb(link = {}, userId = "") {
  const linkType = String(link.linkType || link.link_type || "").trim();
  const payload = {
    link_type: linkType,
    contact_id: link.contactId || link.contact_id || null,
    expert_contact_id: link.expertContactId || link.expert_contact_id || null,
    organization_id: link.organizationId || link.organization_id || null,
    expert_organization_id: link.expertOrganizationId || link.expert_organization_id || null,
    match_reason: String(link.matchReason || link.match_reason || "").trim() || null,
    confidence: Number.isFinite(Number(link.confidence ?? link.score)) ? Number(link.confidence ?? link.score) : null,
    created_by: userId || null,
    updated_by: userId || null
  };
  if (!["contact", "organization"].includes(payload.link_type)) {
    throw validationError("Link-Typ muss contact oder organization sein.");
  }
  if (payload.link_type === "contact" && (!payload.contact_id || !payload.expert_contact_id || payload.organization_id || payload.expert_organization_id)) {
    throw validationError("Kontakt-Verknuepfung benoetigt contactId und expertContactId.");
  }
  if (payload.link_type === "organization" && (!payload.organization_id || !payload.expert_organization_id || payload.contact_id || payload.expert_contact_id)) {
    throw validationError("Organisations-Verknuepfung benoetigt organizationId und expertOrganizationId.");
  }
  return payload;
}

function organizationPatchToDb(patch = {}) {
  const db = {};
  if ("name" in patch) {
    db.name = String(patch.name || "").trim();
    db.normalized_name = normalizeOrganizationName(patch.name);
  }
  if ("normalizedName" in patch || "normalized_name" in patch) db.normalized_name = normalizeOrganizationName(patch.normalizedName || patch.normalized_name);
  if ("sector" in patch) db.sector = String(patch.sector || "").trim() || null;
  if ("organizationType" in patch || "organization_type" in patch) db.organization_type = String(patch.organizationType || patch.organization_type || "").trim() || null;
  if ("postalCode" in patch || "postal_code" in patch) db.postal_code = patch.postalCode || patch.postal_code || null;
  if ("city" in patch) db.city = patch.city || null;
  if ("state" in patch || "federal_state" in patch) db.federal_state = patch.state || patch.federal_state || null;
  if ("latitude" in patch || "lat" in patch) db.latitude = Number.isFinite(Number(patch.lat ?? patch.latitude)) ? Number(patch.lat ?? patch.latitude) : null;
  if ("longitude" in patch || "lon" in patch) db.longitude = Number.isFinite(Number(patch.lon ?? patch.longitude)) ? Number(patch.lon ?? patch.longitude) : null;
  if ("website" in patch) db.website = String(patch.website || "").trim() || null;
  if ("phone" in patch) db.phone = String(patch.phone || "").trim() || null;
  if ("email" in patch) db.email = String(patch.email || "").trim() || null;
  if ("notes" in patch || "note" in patch) db.notes = String(patch.notes || patch.note || "").trim() || null;
  if ("source" in patch) db.source = String(patch.source || "").trim() || null;
  if ("status" in patch) db.status = patch.status || "active";
  return db;
}

function organizationCreateToDb(organization = {}) {
  const db = organizationPatchToDb(organization);
  db.id = String(organization.id || generatedId("organization")).trim();
  db.name = String(organization.name || "").trim();
  db.normalized_name = normalizeOrganizationName(organization.normalizedName || db.name);
  db.status = organization.status || "active";
  if (!db.name) {
    const error = new Error("Name der Organisation fehlt.");
    error.status = 400;
    throw error;
  }
  return db;
}

function contactPatchToDb(patch = {}) {
  const db = {};
  if ("organizationId" in patch || "organization_id" in patch) db.organization_id = patch.organizationId || patch.organization_id || null;
  if ("name" in patch) db.name = String(patch.name || "").trim();
  if ("organization" in patch) db.organization = String(patch.organization || "").trim() || null;
  if ("category" in patch || "sector" in patch) db.sector = String(patch.category || patch.sector || "").trim() || "Praxis";
  if ("specialty" in patch) db.specialty = String(patch.specialty || "").trim() || null;
  if ("priority" in patch) db.priority = normalizePriority(patch.priority);
  if ("ownerIds" in patch || "owner_ids" in patch || "owners" in patch || "ownerId" in patch || "owner_id" in patch || "owner" in patch) {
    db.owner_id = ownerIdsFromContact(patch)[0] || null;
  }
  if ("postalCode" in patch || "postal_code" in patch) db.postal_code = patch.postalCode || patch.postal_code || null;
  if ("city" in patch) db.city = patch.city || null;
  if ("state" in patch || "federal_state" in patch) db.federal_state = patch.state || patch.federal_state || null;
  if ("latitude" in patch || "lat" in patch) db.latitude = Number.isFinite(Number(patch.lat ?? patch.latitude)) ? Number(patch.lat ?? patch.latitude) : null;
  if ("longitude" in patch || "lon" in patch) db.longitude = Number.isFinite(Number(patch.lon ?? patch.longitude)) ? Number(patch.lon ?? patch.longitude) : null;
  if ("email" in patch) db.email = String(patch.email || "").trim() || null;
  if ("phone" in patch) db.phone = String(patch.phone || "").trim() || null;
  if ("linkedin" in patch) db.linkedin = String(patch.linkedin || "").trim() || null;
  if ("themes" in patch || "topics" in patch) db.topics = splitList(patch.themes || patch.topics);
  if ("note" in patch || "notes" in patch) db.notes = String(patch.note || patch.notes || "").trim() || null;
  if ("sources" in patch || "source" in patch) db.source = splitList(patch.sources || patch.source).join("; ") || null;
  if ("image" in patch || "image_url" in patch) db.image_url = patch.image || patch.image_url || null;
  if ("status" in patch) db.status = patch.status || "active";
  return db;
}

function contactCreateToDb(contact = {}) {
  const db = contactPatchToDb(contact);
  db.id = `contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  db.name = String(contact.name || "").trim();
  db.status = contact.status || "active";
  db.priority = normalizePriority(contact.priority);
  if (!db.name) {
    const error = new Error("Kontaktname fehlt.");
    error.status = 400;
    throw error;
  }
  return db;
}

function generatedId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function expertGroupFields(input = {}) {
  const groupName = String(input.group || input.groupName || input.group_name || input.category || input.sector || "").trim();
  const groupId = String(input.groupId || input.group_id || "").trim();
  return { groupName, groupId };
}

function expertContactCreateToDb(contact = {}) {
  const { groupName, groupId } = expertGroupFields(contact);
  const ownerIds = ownerIdsFromContact(contact);
  const db = {
    id: String(contact.id || generatedId("expert-contact")).trim(),
    name: String(contact.name || "").trim(),
    organization_id: contact.organizationId || contact.organization_id || null,
    organization: String(contact.organization || "").trim() || null,
    group_id: groupId,
    group_name: groupName,
    specialty: String(contact.specialty || "").trim() || null,
    role: String(contact.contactRole || contact.role || "").trim() || null,
    city: String(contact.city || "").trim() || null,
    federal_state: String(contact.state || contact.federal_state || "").trim() || null,
    email: String(contact.email || "").trim() || null,
    phone: String(contact.phone || "").trim() || null,
    linkedin: String(contact.linkedin || "").trim() || null,
    topics: splitList(contact.themes || contact.topics),
    notes: String(contact.note || contact.notes || "").trim() || null,
    source: splitList(contact.sources || contact.source).join("; ") || "Manuell angelegt",
    profile_url: String(contact.url || contact.sourceUrl || contact.profileUrl || contact.profile_url || "").trim() || null,
    owner_id: ownerIds[0] || null,
    owner_ids: ownerIds,
    status: contact.status || "active"
  };
  if (!db.name) {
    const error = new Error("Name des Expertenkreis-Kontakts fehlt.");
    error.status = 400;
    throw error;
  }
  if (!db.group_id || !db.group_name) {
    const error = new Error("Gruppe des Expertenkreis-Kontakts fehlt.");
    error.status = 400;
    throw error;
  }
  return db;
}

function expertContactPatchToDb(contact = {}) {
  const has = (field) => Object.prototype.hasOwnProperty.call(contact, field);
  const db = {};
  if (has("name")) db.name = String(contact.name || "").trim();
  if (has("organizationId") || has("organization_id")) db.organization_id = contact.organizationId || contact.organization_id || null;
  if (has("organization")) db.organization = String(contact.organization || "").trim() || null;
  if (has("groupId") || has("group_id")) db.group_id = contact.groupId || contact.group_id || null;
  if (has("group") || has("groupName") || has("group_name") || has("category")) {
    db.group_name = String(contact.group || contact.groupName || contact.group_name || contact.category || "").trim() || null;
  }
  if (has("specialty")) db.specialty = String(contact.specialty || "").trim() || null;
  if (has("contactRole") || has("role")) db.role = String(contact.contactRole || contact.role || "").trim() || null;
  if (has("city")) db.city = String(contact.city || "").trim() || null;
  if (has("state") || has("federal_state")) db.federal_state = String(contact.state || contact.federal_state || "").trim() || null;
  if (has("email")) db.email = String(contact.email || "").trim() || null;
  if (has("phone")) db.phone = String(contact.phone || "").trim() || null;
  if (has("linkedin")) db.linkedin = String(contact.linkedin || "").trim() || null;
  if (has("themes") || has("topics")) db.topics = splitList(contact.themes || contact.topics);
  if (has("note") || has("notes")) db.notes = String(contact.note || contact.notes || "").trim() || null;
  if (has("sources") || has("source")) db.source = splitList(contact.sources || contact.source).join("; ") || "Manuell angelegt";
  if (has("url") || has("sourceUrl") || has("profileUrl") || has("profile_url")) {
    db.profile_url = String(contact.url || contact.sourceUrl || contact.profileUrl || contact.profile_url || "").trim() || null;
  }
  if (["ownerIds", "owner_ids", "owners", "ownerId", "owner_id", "owner"].some(has)) {
    const ownerIds = ownerIdsFromContact(contact);
    db.owner_id = ownerIds[0] || null;
    db.owner_ids = ownerIds;
  }
  if (has("status")) db.status = contact.status || "active";
  return db;
}

function expertOrganizationCreateToDb(organization = {}) {
  const { groupName, groupId } = expertGroupFields(organization);
  const name = String(organization.name || "").trim();
  const db = {
    id: String(organization.id || generatedId("expert-org")).trim(),
    name,
    normalized_name: normalizeOrganizationName(organization.normalizedName || organization.normalized_name || name),
    group_id: groupId || null,
    group_name: groupName || null,
    organization_type: String(organization.organizationType || organization.organization_type || "").trim() || null,
    city: String(organization.city || "").trim() || null,
    federal_state: String(organization.state || organization.federal_state || "").trim() || null,
    website: String(organization.website || "").trim() || null,
    phone: String(organization.phone || "").trim() || null,
    email: String(organization.email || "").trim() || null,
    notes: String(organization.notes || "").trim() || null,
    source: String(organization.source || "").trim() || "Manuell angelegt",
    status: organization.status || "active"
  };
  if (!db.name) {
    const error = new Error("Name der Expertenkreis-Organisation fehlt.");
    error.status = 400;
    throw error;
  }
  return db;
}

function stakeholderTypeToDb(type = {}) {
  return {
    id: String(type.id || type.value || "kv").trim(),
    label: String(type.label || type.name || "Kassenärztliche Vereinigungen").trim(),
    description: String(type.description || "").trim() || null,
    sort_order: Number(type.sortOrder ?? type.sort_order ?? 10),
    status: type.status || "active"
  };
}

function stakeholderOrganizationToDb(organization = {}) {
  const name = String(organization.name || organization.organization || "").trim();
  return {
    id: String(organization.id || generatedId("stakeholder-org")).trim(),
    stakeholder_type_id: String(organization.stakeholderTypeId || organization.stakeholder_type_id || organization.stakeholderType || "kv").trim() || "kv",
    name,
    normalized_name: normalizeOrganizationName(organization.normalizedName || organization.normalized_name || name),
    organization_type: String(organization.organizationType || organization.organization_type || "").trim() || null,
    postal_code: String(organization.postalCode || organization.postal_code || "").trim() || null,
    city: String(organization.city || "").trim() || null,
    federal_state: String(organization.state || organization.federal_state || "").trim() || null,
    latitude: Number.isFinite(Number(organization.lat ?? organization.latitude)) ? Number(organization.lat ?? organization.latitude) : null,
    longitude: Number.isFinite(Number(organization.lon ?? organization.longitude)) ? Number(organization.lon ?? organization.longitude) : null,
    website: String(organization.website || organization.url || "").trim() || null,
    phone: String(organization.phone || "").trim() || null,
    email: String(organization.email || "").trim() || null,
    logo_url: String(organization.logoUrl || organization.logo_url || "").trim() || null,
    logo_source_url: String(organization.logoSourceUrl || organization.logo_source_url || "").trim() || null,
    logo_source_label: String(organization.logoSourceLabel || organization.logo_source_label || "").trim() || null,
    member_count: parseLocalizedInteger(organization.memberCount ?? organization.member_count),
    member_count_source_url: String(organization.memberCountSourceUrl || organization.member_count_source_url || "").trim() || null,
    member_count_source_label: String(organization.memberCountSourceLabel || organization.member_count_source_label || "").trim() || null,
    member_count_updated_at: String(organization.memberCountUpdatedAt || organization.member_count_updated_at || "").trim() || null,
    member_count_scope: String(organization.memberCountScope || organization.member_count_scope || "").trim() || null,
    notes: String(organization.notes || organization.note || "").trim() || null,
    source: String(organization.source || "").trim() || "Stakeholder-Import",
    status: organization.status || "active"
  };
}

function stakeholderPersonToDb(person = {}) {
  const name = String(person.name || "").trim();
  return {
    id: String(person.id || generatedId("stakeholder-person")).trim(),
    stakeholder_type_id: String(person.stakeholderTypeId || person.stakeholder_type_id || person.stakeholderType || "kv").trim() || "kv",
    organization_id: person.organizationId || person.organization_id || null,
    organization: String(person.organization || "").trim() || null,
    name,
    role: String(person.role || person.contactRole || "").trim() || null,
    committee: String(person.committee || person.gremium || "").trim() || null,
    city: String(person.city || "").trim() || null,
    federal_state: String(person.state || person.federal_state || "").trim() || null,
    latitude: Number.isFinite(Number(person.lat ?? person.latitude)) ? Number(person.lat ?? person.latitude) : null,
    longitude: Number.isFinite(Number(person.lon ?? person.longitude)) ? Number(person.lon ?? person.longitude) : null,
    map_position_source: String(person.mapPositionSource || person.map_position_source || "").trim() || null,
    email: String(person.email || "").trim() || null,
    phone: String(person.phone || "").trim() || null,
    linkedin: String(person.linkedin || "").trim() || null,
    topics: splitList(person.themes || person.topics),
    notes: String(person.note || person.notes || "").trim() || null,
    source: String(person.source || splitList(person.sources).join("; ")).trim() || "Stakeholder-Import",
    profile_url: String(person.url || person.profileUrl || person.profile_url || "").trim() || null,
    is_representative_assembly_member: Boolean(person.isRepresentativeAssemblyMember ?? person.is_representative_assembly_member),
    status: person.status || "active"
  };
}

function jsonResponse(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(),
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function corsHeaders() {
  if (!ALLOWED_ORIGIN) return {};
  const headers = {
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-headers": `authorization, content-type, x-goog-authenticated-user-email, x-goog-authenticated-user-id, ${AUTH_EMAIL_HEADER}, ${AUTH_SUBJECT_HEADER}`,
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    vary: "origin"
  };
  if (ALLOWED_ORIGIN !== "*") headers["access-control-allow-credentials"] = "true";
  return headers;
}

function staticContentType(filePath = "") {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp"
  }[ext] || "application/octet-stream";
}

function resolveStaticFile(pathname = "") {
  if (!STATIC_ROOT) return "";
  const decodedPath = decodeURIComponent(pathname || "/");
  const normalizedPath = decodedPath === "/" ? `/${STATIC_INDEX}` : decodedPath;
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const resolved = path.resolve(STATIC_ROOT, relativePath);
  if (resolved !== STATIC_ROOT && !resolved.startsWith(`${STATIC_ROOT}${path.sep}`)) return "";
  return resolved;
}

async function serveStaticAsset(request, response, url) {
  if (!STATIC_ROOT || !["GET", "HEAD"].includes(request.method)) return false;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname === "/healthz") return false;
  let filePath = resolveStaticFile(url.pathname);
  let stat = null;
  try {
    stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, STATIC_INDEX);
      stat = await fs.promises.stat(filePath);
    }
  } catch {
    if (path.extname(url.pathname)) return false;
    filePath = path.join(STATIC_ROOT, STATIC_INDEX);
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return false;
    }
  }
  if (!stat?.isFile()) return false;
  response.writeHead(200, {
    "content-type": staticContentType(filePath),
    "cache-control": path.extname(filePath) === ".html" ? "no-store" : "public, max-age=3600"
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  fs.createReadStream(filePath)
    .on("error", () => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    })
    .pipe(response);
  return true;
}

function bearerToken(request) {
  const header = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || "";
}

function userIdFromToken(request) {
  if (request.currentProfile?.id) return request.currentProfile.id;
  return bearerSubject(request);
}

function bearerSubject(request) {
  if (!API_AUTH_ALLOW_BEARER_DEV) return "";
  const token = bearerToken(request);
  const [, payload] = token.split(".");
  if (!payload) return "";
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json).sub || "";
  } catch {
    return "";
  }
}

function cleanIdentityHeader(value = "") {
  const raw = String(value || "").trim();
  return raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
}

function requestHeader(request, name) {
  return request.headers[String(name || "").toLowerCase()] || "";
}

function iapEmail(request) {
  return cleanIdentityHeader(
    request.headers["x-goog-authenticated-user-email"] ||
    request.headers["x-auth-request-email"] ||
    request.headers["x-forwarded-email"] ||
    ""
  ).toLowerCase();
}

function iapSubject(request) {
  return cleanIdentityHeader(request.headers["x-goog-authenticated-user-id"] || "");
}

function trustedHeaderEmail(request) {
  return cleanIdentityHeader(requestHeader(request, AUTH_EMAIL_HEADER)).toLowerCase();
}

function trustedHeaderSubject(request) {
  return cleanIdentityHeader(requestHeader(request, AUTH_SUBJECT_HEADER));
}

function authModeLabel() {
  return {
    iap: "IAP/SSO",
    "trusted-header": "Gateway-SSO",
    sso: "SSO"
  }[API_AUTH_MODE] || "Backend-Identitaet";
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    const error = new Error("IAP-JWT konnte nicht gelesen werden.");
    error.status = 401;
    throw error;
  }
}

async function iapPublicKeys() {
  if (iapKeyCache.expiresAt > Date.now() && iapKeyCache.keys.size) return iapKeyCache.keys;
  const response = await fetch("https://www.gstatic.com/iap/verify/public_key-jwk");
  if (!response.ok) {
    const error = new Error("IAP-Public-Keys konnten nicht geladen werden.");
    error.status = 503;
    throw error;
  }
  const payload = await response.json();
  const keys = new Map();
  for (const jwk of payload.keys || []) {
    if (!jwk.kid) continue;
    keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
  }
  iapKeyCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys };
  return keys;
}

async function verifyIapJwt(request) {
  if (request.iapPayload) return request.iapPayload;
  if (API_AUTH_MODE !== "iap" || !IAP_JWT_AUDIENCE) return null;
  const token = String(request.headers["x-goog-iap-jwt-assertion"] || "").trim();
  if (!token) {
    const error = new Error("Signiertes IAP-JWT fehlt.");
    error.status = 401;
    throw error;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    const error = new Error("IAP-JWT ist ungueltig.");
    error.status = 401;
    throw error;
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  if (header.alg !== "ES256" || !header.kid) {
    const error = new Error("IAP-JWT nutzt keinen unterstuetzten Signaturalgorithmus.");
    error.status = 401;
    throw error;
  }
  const keys = await iapPublicKeys();
  const publicKey = keys.get(header.kid);
  if (!publicKey) {
    const error = new Error("IAP-JWT-Key ist unbekannt.");
    error.status = 401;
    throw error;
  }
  const verified = crypto.verify(
    "sha256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(encodedSignature, "base64url")
  );
  if (!verified) {
    const error = new Error("IAP-JWT-Signatur ist ungueltig.");
    error.status = 401;
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  const skew = 30;
  if (payload.iss !== "https://cloud.google.com/iap" || payload.aud !== IAP_JWT_AUDIENCE) {
    const error = new Error("IAP-JWT-Issuer oder Audience passt nicht.");
    error.status = 401;
    throw error;
  }
  if (Number(payload.exp || 0) < now - skew || Number(payload.iat || 0) > now + skew) {
    const error = new Error("IAP-JWT-Zeitfenster ist ungueltig.");
    error.status = 401;
    throw error;
  }
  if (!payload.email || !payload.sub) {
    const error = new Error("IAP-JWT enthaelt keine Nutzeridentitaet.");
    error.status = 401;
    throw error;
  }
  request.iapPayload = payload;
  return payload;
}

function devProfileFromRequest(request) {
  if (API_AUTH_ALLOW_BEARER_DEV) {
    const tokenId = bearerSubject(request);
    if (tokenId) {
      return {
        id: tokenId,
        email: `${tokenId}@dev.local`,
        display_name: "Validation Test",
        initials: "VT",
        role: "admin",
        active: true
      };
    }
  }
  if (!API_AUTH_ALLOW_DEV_PROFILE) return null;
  const id = API_DEV_PROFILE_ID || "local-admin";
  return {
    id,
    email: `${id}@dev.local`,
    display_name: "Lokales Admin-Profil",
    initials: "LA",
    role: "admin",
    active: true
  };
}

async function resolveRequestProfile(request) {
  const devProfile = devProfileFromRequest(request);
  if (devProfile) return devProfile;
  const iapPayload = await verifyIapJwt(request);
  const email = String(iapPayload?.email || trustedHeaderEmail(request) || iapEmail(request)).trim().toLowerCase();
  const subject = String(iapPayload?.sub || trustedHeaderSubject(request) || iapSubject(request)).trim();
  if (!email && !subject) {
    const error = new Error("Gateway-/SSO-Identitaet fehlt.");
    error.status = 401;
    throw error;
  }
  await loadProfiles(request);
  const profile = [...profileCache.byId.values()].find((item) => {
    const profileEmail = String(item.email || "").trim().toLowerCase();
    return item.active !== false && ((email && profileEmail === email) || (subject && item.id === subject));
  });
  if (!profile) {
    const error = new Error("SSO-Nutzer ist keinem aktiven Versorgungs-Kompass-Profil zugeordnet.");
    error.status = 403;
    throw error;
  }
  return profile;
}

function roleRank(role = "") {
  return { viewer: 1, editor: 2, admin: 3 }[String(role || "").toLowerCase()] || 0;
}

function requiredRoleForRequest(method, pathname) {
  if (method === "OPTIONS") return "";
  if (["/healthz", "/api/healthz"].includes(pathname)) return "";
  if (pathname === "/api/session") return "viewer";
  if (pathname === "/api/export" || pathname.startsWith("/api/ops/")) return "admin";
  if (method === "GET") return "viewer";
  if (pathname === "/api/profile" || pathname === "/api/profile/avatar") return "viewer";
  if (method === "DELETE" && pathname.startsWith("/api/formats/")) return "admin";
  return "editor";
}

async function authorizeRequest(request, url) {
  const requiredRole = requiredRoleForRequest(request.method, url.pathname);
  if (!requiredRole) return;
  const profile = await resolveRequestProfile(request);
  request.currentProfile = profile;
  if (roleRank(profile.role) < roleRank(requiredRole)) {
    const error = new Error("Fuer diese Aktion fehlt die serverseitige Rolle.");
    error.status = 403;
    throw error;
  }
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function assertPlainObject(value, label = "Request Body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(`${label} muss ein JSON-Objekt sein.`);
  }
}

function assertAllowedFields(value, allowedFields, label = "Request Body") {
  assertPlainObject(value, label);
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw validationError(`${label} enthaelt nicht unterstuetzte Felder: ${unknown.join(", ")}.`);
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) {
      const error = new Error("Request Body ist zu groß.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request Body ist kein gültiges JSON.");
    error.status = 400;
    throw error;
  }
}

async function readValidatedJsonBody(request, allowedFields, label = "Request Body") {
  const body = await readJsonBody(request);
  assertAllowedFields(body, allowedFields, label);
  return body;
}

const TABLE_FIELDS = new Map(Object.entries({
  contacts: [...CONTACT_FIELDS, "role", "image_source_url", "image_source_label", "image_rights_note", "image_updated_at", "image_updated_by"],
  contact_owners: CONTACT_OWNER_FIELDS,
  organizations: ORGANIZATION_FIELDS,
  profiles: PROFILE_FIELDS,
  changes: CHANGE_FIELDS,
  saved_views: SAVED_VIEW_FIELDS,
  user_settings: USER_SETTINGS_FIELDS,
  formats: FORMAT_FIELDS,
  format_participants: FORMAT_PARTICIPANT_FIELDS,
  hospitation_slots: HOSPITATION_SLOT_FIELDS,
  hospitations: HOSPITATION_FIELDS,
  expert_groups: EXPERT_GROUP_FIELDS,
  expert_contacts: EXPERT_CONTACT_FIELDS,
  expert_organizations: [...EXPERT_ORGANIZATION_FIELDS, "logo_url", "logo_source_url", "logo_source_label", "member_count", "member_count_source_url", "member_count_source_label", "member_count_updated_at", "member_count_scope"],
  expert_entity_links: EXPERT_ENTITY_LINK_FIELDS,
  stakeholder_types: STAKEHOLDER_TYPE_FIELDS,
  stakeholder_organizations: STAKEHOLDER_ORGANIZATION_FIELDS,
  stakeholder_people: STAKEHOLDER_PEOPLE_FIELDS,
  notification_events: ["id", "event_type", "entity_type", "entity_id", "actor_id", "title", "body", "occurred_at", "route", "payload", "created_at"],
  notification_recipients: ["event_id", "user_id", "read_at", "dismissed_at", "created_at"]
}));

function getPool() {
  if (pool) return pool;
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 5),
      ssl: process.env.DB_SSL === "1" ? { rejectUnauthorized: false } : undefined
    });
    return pool;
  }
  const host = process.env.DB_HOST || process.env.PGHOST || "";
  const database = process.env.DB_NAME || process.env.PGDATABASE || DEFAULT_DB_NAME;
  const user = process.env.DB_USER || process.env.PGUSER || DEFAULT_DB_USER;
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || "";
  if (!host && !process.env.PGHOST) {
    const error = new Error("Postgres-Verbindung fehlt. Bitte DATABASE_URL oder DB_HOST/DB_NAME/DB_USER/DB_PASSWORD setzen.");
    error.status = 500;
    throw error;
  }
  pool = new Pool({
    host,
    port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
    database,
    user,
    password,
    max: Number(process.env.DB_POOL_MAX || 5)
  });
  return pool;
}

function tableFields(table) {
  const fields = TABLE_FIELDS.get(table);
  if (!fields) {
    const error = new Error(`Unbekannte Cloud-SQL-Tabelle: ${table}`);
    error.status = 500;
    throw error;
  }
  return new Set(fields);
}

function qid(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw validationError(`Ungueltiger SQL-Identifier: ${identifier}`);
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function dbValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  return value;
}

function parseInValues(value) {
  const match = /^in\.\((.*)\)$/.exec(value);
  if (!match) return [];
  return match[1].split(",").map((item) => dbValue(item.trim())).filter((item) => item !== "");
}

function buildWhere(table, searchParams, values) {
  const fields = tableFields(table);
  const clauses = [];
  for (const [key, rawValue] of searchParams.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(key)) continue;
    if (!fields.has(key)) continue;
    const value = String(rawValue || "");
    const column = qid(key);
    if (value.startsWith("eq.")) {
      values.push(dbValue(value.slice(3)));
      clauses.push(`${column} = $${values.length}`);
    } else if (value.startsWith("neq.")) {
      values.push(dbValue(value.slice(4)));
      clauses.push(`${column} <> $${values.length}`);
    } else if (value.startsWith("gte.")) {
      values.push(dbValue(value.slice(4)));
      clauses.push(`${column} >= $${values.length}`);
    } else if (value.startsWith("lte.")) {
      values.push(dbValue(value.slice(4)));
      clauses.push(`${column} <= $${values.length}`);
    } else if (value.startsWith("gt.")) {
      values.push(dbValue(value.slice(3)));
      clauses.push(`${column} > $${values.length}`);
    } else if (value.startsWith("lt.")) {
      values.push(dbValue(value.slice(3)));
      clauses.push(`${column} < $${values.length}`);
    } else if (value.startsWith("in.")) {
      const items = parseInValues(value);
      if (!items.length) {
        clauses.push("false");
      } else {
        values.push(items);
        clauses.push(`${column} = any($${values.length})`);
      }
    } else if (value === "is.null") {
      clauses.push(`${column} is null`);
    } else if (value === "not.is.null") {
      clauses.push(`${column} is not null`);
    }
  }
  return clauses.length ? ` where ${clauses.join(" and ")}` : "";
}

function buildOrder(table, searchParams) {
  const fields = tableFields(table);
  const order = searchParams.get("order");
  if (!order) return "";
  const clauses = order.split(",").map((part) => {
    const [field, direction = "asc", nulls] = part.split(".");
    if (!fields.has(field)) return "";
    const dir = direction.toLowerCase() === "desc" ? "desc" : "asc";
    const nullsClause = nulls === "nullslast" ? " nulls last" : nulls === "nullsfirst" ? " nulls first" : "";
    return `${qid(field)} ${dir}${nullsClause}`;
  }).filter(Boolean);
  return clauses.length ? ` order by ${clauses.join(", ")}` : "";
}

function buildLimitOffset(searchParams, values) {
  const clauses = [];
  const limit = Number(searchParams.get("limit"));
  const offset = Number(searchParams.get("offset"));
  if (Number.isFinite(limit) && limit > 0) {
    values.push(Math.min(limit, 5000));
    clauses.push(` limit $${values.length}`);
  }
  if (Number.isFinite(offset) && offset > 0) {
    values.push(offset);
    clauses.push(` offset $${values.length}`);
  }
  return clauses.join("");
}

async function selectRows(table, searchParams) {
  const values = [];
  const where = buildWhere(table, searchParams, values);
  const order = buildOrder(table, searchParams);
  const limitOffset = buildLimitOffset(searchParams, values);
  const result = await getPool().query(`select * from ${qid(table)}${where}${order}${limitOffset}`, values);
  if (table === "changes" && String(searchParams.get("select") || "").includes("contacts(")) {
    await attachContactsToChanges(result.rows);
  }
  if (table === "notification_recipients") {
    await attachNotificationEvents(result.rows);
  }
  return result.rows;
}

async function attachContactsToChanges(rows = []) {
  const ids = uniqueIds(rows.map((row) => row.contact_id));
  if (!ids.length) return;
  const result = await getPool().query("select id, name, organization, sector, specialty, city, federal_state, image_url, status from contacts where id = any($1)", [ids]);
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  rows.forEach((row) => {
    row.contacts = byId.get(row.contact_id) || null;
  });
}

async function attachNotificationEvents(rows = []) {
  const ids = uniqueIds(rows.map((row) => row.event_id));
  if (!ids.length) return;
  const result = await getPool().query("select * from notification_events where id = any($1)", [ids]);
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  rows.forEach((row) => {
    row.notification_events = byId.get(row.event_id) || null;
  });
}

function sanitizeRowForTable(table, row = {}) {
  const fields = tableFields(table);
  return Object.fromEntries(Object.entries(row).filter(([key]) => fields.has(key)));
}

function insertSql(table, rows, searchParams, options = {}) {
  const items = (Array.isArray(rows) ? rows : [rows]).map((row) => sanitizeRowForTable(table, row));
  if (!items.length || items.some((row) => !Object.keys(row).length)) {
    throw validationError(`Keine gueltigen Felder fuer ${table}.`);
  }
  const columns = [...new Set(items.flatMap((row) => Object.keys(row)))];
  const values = [];
  const tuples = items.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const conflict = String(searchParams.get("on_conflict") || "").split(",").map((field) => field.trim()).filter(Boolean);
  let conflictClause = "";
  const prefer = String(options.headers?.prefer || "");
  if (conflict.length) {
    const conflictColumns = conflict.map(qid).join(", ");
    if (prefer.includes("ignore-duplicates")) {
      conflictClause = ` on conflict (${conflictColumns}) do nothing`;
    } else {
      const updates = columns
        .filter((column) => !conflict.includes(column))
        .map((column) => `${qid(column)} = excluded.${qid(column)}`);
      conflictClause = updates.length
        ? ` on conflict (${conflictColumns}) do update set ${updates.join(", ")}`
        : ` on conflict (${conflictColumns}) do nothing`;
    }
  }
  return {
    sql: `insert into ${qid(table)} (${columns.map(qid).join(", ")}) values ${tuples.join(", ")}${conflictClause} returning *`,
    values
  };
}

async function insertRows(table, searchParams, options = {}) {
  const { sql, values } = insertSql(table, options.body, searchParams, options);
  const result = await getPool().query(sql, values);
  return result.rows;
}

async function patchRows(table, searchParams, options = {}) {
  const payload = sanitizeRowForTable(table, options.body || {});
  const columns = Object.keys(payload);
  if (!columns.length) return [];
  const values = [];
  const assignments = columns.map((column) => {
    values.push(payload[column]);
    return `${qid(column)} = $${values.length}`;
  });
  const where = buildWhere(table, searchParams, values);
  const result = await getPool().query(`update ${qid(table)} set ${assignments.join(", ")}${where} returning *`, values);
  return result.rows;
}

async function deleteRows(table, searchParams) {
  const values = [];
  const where = buildWhere(table, searchParams, values);
  await getPool().query(`delete from ${qid(table)}${where}`, values);
  return [];
}

async function createNotificationEventRpc(input = {}) {
  const recipientIds = uniqueIds(input.p_recipient_ids || []);
  if (!recipientIds.length) return null;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const id = generatedId("notification-event");
    const event = await client.query(
      `insert into notification_events
        (id, event_type, entity_type, entity_id, actor_id, title, body, route, payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning *`,
      [
        id,
        input.p_event_type || "notice",
        input.p_entity_type || "system",
        input.p_entity_id || "",
        input.p_actor_id || null,
        input.p_title || "Hinweis",
        input.p_body || "",
        input.p_route || "",
        input.p_payload || {}
      ]
    );
    for (const userId of recipientIds) {
      await client.query(
        `insert into notification_recipients (event_id, user_id)
         values ($1, $2)
         on conflict (event_id, user_id) do nothing`,
        [id, userId]
      );
    }
    await client.query("commit");
    return event.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function cloudSqlRest(path, request, searchParams = new URLSearchParams(), options = {}) {
  if (path === "rpc/create_notification_event") return createNotificationEventRpc(options.body || {});
  const method = String(options.method || "GET").toUpperCase();
  if (method === "GET") return selectRows(path, searchParams);
  if (method === "POST") return insertRows(path, searchParams, options);
  if (method === "PATCH") return patchRows(path, searchParams, options);
  if (method === "DELETE") return deleteRows(path, searchParams);
  const error = new Error(`Nicht unterstuetzte Cloud-SQL-Methode: ${method}`);
  error.status = 405;
  throw error;
}

function isMissingContactOwnersError(error) {
  return /contact_owners|profile_id|assigned_at|assigned_by/i.test(String(error?.message || error?.details || ""));
}

function contactOwnerMap(rows = []) {
  return rows.reduce((map, row) => {
    const contactId = row.contact_id || row.contactId || "";
    const profileId = row.profile_id || row.profileId || "";
    if (!contactId || !profileId) return map;
    if (!map.has(contactId)) map.set(contactId, []);
    const ids = map.get(contactId);
    if (!ids.includes(profileId)) ids.push(profileId);
    return map;
  }, new Map());
}

async function loadContactOwnerRows(request, contactIds = []) {
  if (!supportsContactOwners) return [];
  const ids = [...new Set(contactIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return [];
  try {
    return await cloudSqlRest("contact_owners", request, new URLSearchParams({
      select: CONTACT_OWNER_FIELDS.join(","),
      contact_id: `in.(${ids.join(",")})`,
      order: "assigned_at.asc"
    })) || [];
  } catch (error) {
    if (isMissingContactOwnersError(error)) {
      supportsContactOwners = false;
      return [];
    }
    throw error;
  }
}

async function decorateRowsWithStoredOwners(request, rows = []) {
  if (!rows.length) return [];
  const ownerRows = await loadContactOwnerRows(request, rows.map((row) => row.id));
  if (!supportsContactOwners) return rows.map((row, index) => contactToDto(row, index));
  const ownersByContact = contactOwnerMap(ownerRows);
  return rows.map((row, index) => contactToDto(row, index, ownersByContact.get(row.id) || normalizeOwnerIds(row.owner_id)));
}

async function createNotificationEvent(request, input = {}) {
  await loadProfiles(request);
  const actorId = userIdFromToken(request);
  const recipientIds = uniqueIds(input.recipientIds || input.recipient_ids || []);
  if (!actorId || !recipientIds.length) return null;
  try {
    return await cloudSqlRest("rpc/create_notification_event", request, new URLSearchParams(), {
      method: "POST",
      body: {
        p_event_type: input.eventType || input.event_type || "notice",
        p_entity_type: input.entityType || input.entity_type || "system",
        p_entity_id: input.entityId || input.entity_id || "",
        p_actor_id: actorId,
        p_title: input.title || "Hinweis",
        p_body: input.body || "",
        p_route: input.route || "",
        p_payload: input.payload || {},
        p_recipient_ids: recipientIds
      }
    });
  } catch (error) {
    if (isMissingNotificationsError(error)) return null;
    console.warn("Hinweis konnte nicht erstellt werden.", error.message || error);
    return null;
  }
}

async function organizationContactOwnerIds(request, organization = {}) {
  const id = String(organization.id || "").trim();
  const name = String(organization.name || "").trim();
  let rows = [];
  if (id) {
    rows = await cloudSqlRest("contacts", request, new URLSearchParams({
      select: CONTACT_FIELDS.join(","),
      organization_id: `eq.${id}`,
      status: "neq.archived"
    })) || [];
  }
  if (!rows.length && name) {
    rows = await cloudSqlRest("contacts", request, new URLSearchParams({
      select: CONTACT_FIELDS.join(","),
      organization: `eq.${name}`,
      status: "neq.archived"
    })) || [];
  }
  const contacts = await decorateRowsWithStoredOwners(request, rows || []);
  return uniqueIds(contacts.flatMap(ownerIdsFromContact));
}

async function formatParticipantOwnerIds(request, format = {}) {
  const participants = Array.isArray(format.participants) && format.participants.length
    ? format.participants
    : [...(await formatParticipantsByFormat(request, [format.id])).values()].flat();
  const contactIds = uniqueIds(participants.map((participant) => participant.contactId || participant.contact_id));
  if (!contactIds.length) return [];
  const rows = await cloudSqlRest("contacts", request, new URLSearchParams({
    select: CONTACT_FIELDS.join(","),
    id: `in.(${contactIds.join(",")})`
  })) || [];
  const contacts = await decorateRowsWithStoredOwners(request, rows || []);
  return uniqueIds(contacts.flatMap(ownerIdsFromContact));
}

async function notifyContactCreated(request, contact = {}, actorId = "", options = {}) {
  await loadProfiles(request);
  const ownerIds = ownerIdsFromContact(contact);
  const recipients = ownerIds.length ? ownerIds : idsExcept(adminProfileIds(), actorId);
  const imported = options.action === "import";
  await createNotificationEvent(request, {
    eventType: imported ? "contact_imported" : "contact_created",
    entityType: "contact",
    entityId: contact.id,
    title: imported ? "Kontakt importiert" : "Neuer Kontakt",
    body: `${contact.name || "Ein Kontakt"} wurde ${imported ? "importiert" : "angelegt"}.`,
    route: contactRoute(contact.id),
    payload: {
      contactName: contact.name || "",
      organization: contact.organization || "",
      batchId: options.batchId || ""
    },
    recipientIds: recipients
  });
}

async function notifyContactUpdated(request, contact = {}, actorId = "", details = {}) {
  await loadProfiles(request);
  const ownerChanged = details.hasOwnerPatch && contactOwnersChanged(details.oldOwnerIds || [], details.nextOwnerIds || []);
  const action = details.action || "update";
  const changedFields = details.changedFields || [];
  if (!ownerChanged && !changedFields.length) return;
  const recipients = ownerChanged
    ? uniqueIds([...(details.oldOwnerIds || []), ...(details.nextOwnerIds || [])])
    : (ownerIdsFromContact(contact).length ? idsExcept(ownerIdsFromContact(contact), actorId) : idsExcept(adminProfileIds(), actorId));
  const archived = action === "archive";
  await createNotificationEvent(request, {
    eventType: ownerChanged ? "contact_owner_changed" : archived ? "contact_archived" : "contact_updated",
    entityType: "contact",
    entityId: contact.id,
    title: ownerChanged ? "Owner geändert" : archived ? "Kontakt archiviert" : "Kontakt aktualisiert",
    body: ownerChanged
      ? `Die Zuständigkeit für ${contact.name || "einen Kontakt"} wurde geändert.`
      : `${contact.name || "Ein Kontakt"} wurde aktualisiert.`,
    route: contactRoute(contact.id),
    payload: {
      contactName: contact.name || "",
      organization: contact.organization || "",
      changedFields,
      oldOwnerIds: details.oldOwnerIds || [],
      nextOwnerIds: details.nextOwnerIds || []
    },
    recipientIds: recipients
  });
}

async function notifyOrganizationChanged(request, organization = {}, actorId = "", action = "update") {
  await loadProfiles(request);
  const ownerIds = await organizationContactOwnerIds(request, organization);
  const recipients = ownerIds.length ? idsExcept(ownerIds, actorId) : idsExcept(adminProfileIds(), actorId);
  await createNotificationEvent(request, {
    eventType: action === "create" ? "organization_created" : "organization_updated",
    entityType: "organization",
    entityId: organization.id,
    title: action === "create" ? "Neue Organisation" : "Organisation aktualisiert",
    body: `${organization.name || "Eine Organisation"} wurde ${action === "create" ? "angelegt" : "aktualisiert"}.`,
    route: organizationRoute(organization.id),
    payload: {
      organizationName: organization.name || "",
      sector: organization.sector || ""
    },
    recipientIds: recipients
  });
}

async function notifyFormatChanged(request, format = {}, actorId = "", action = "update", previous = null) {
  await loadProfiles(request);
  const previousOwnerId = previous?.ownerId || previous?.owner_id || "";
  const nextOwnerId = format.ownerId || format.owner_id || "";
  const ownerChanged = action !== "create" && previousOwnerId !== nextOwnerId;
  const participantOwnerIds = await formatParticipantOwnerIds(request, format);
  const baseRecipients = uniqueIds([nextOwnerId, ...participantOwnerIds]);
  const recipients = action === "create" || ownerChanged
    ? uniqueIds([previousOwnerId, nextOwnerId, ...participantOwnerIds])
    : idsExcept(baseRecipients, actorId);
  await createNotificationEvent(request, {
    eventType: action === "create" ? "format_created" : ownerChanged ? "format_owner_changed" : action === "participant" ? "format_participant_changed" : "format_updated",
    entityType: action === "participant" ? "format_participant" : "format",
    entityId: format.id,
    title: action === "create" ? "Neues Format" : ownerChanged ? "Format-Owner geändert" : action === "participant" ? "Format-Teilnehmer geändert" : "Format aktualisiert",
    body: `${format.title || "Ein Format"} wurde ${action === "create" ? "angelegt" : "aktualisiert"}.`,
    route: formatRoute(format.id),
    payload: {
      formatTitle: format.title || "",
      status: format.status || "",
      previousOwnerId,
      nextOwnerId
    },
    recipientIds: recipients
  });
}

async function replaceStoredContactOwners(request, contactId, oldOwnerIds = [], nextOwnerIds = [], userId = "", { log = true } = {}) {
  if (!supportsContactOwners || !contactId) return;
  const oldIds = normalizeOwnerIds(oldOwnerIds);
  const nextIds = normalizeOwnerIds(nextOwnerIds);
  if (!contactOwnersChanged(oldIds, nextIds)) return;
  try {
    await cloudSqlRest("contact_owners", request, new URLSearchParams({ contact_id: `eq.${contactId}` }), {
      method: "DELETE",
      headers: { prefer: "return=minimal" }
    });
  } catch (error) {
    if (isMissingContactOwnersError(error)) {
      supportsContactOwners = false;
      return;
    }
    throw error;
  }
  if (nextIds.length) {
    await cloudSqlRest("contact_owners", request, new URLSearchParams(), {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: nextIds.map((profileId) => ({
        contact_id: contactId,
        profile_id: profileId,
        assigned_by: userId
      }))
    });
  }
  if (log) {
    await cloudSqlRest("changes", request, new URLSearchParams(), {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: {
        contact_id: contactId,
        action: "update",
        field_name: "owner_ids",
        old_value: JSON.stringify(oldIds),
        new_value: JSON.stringify(nextIds),
        changed_by: userId
      }
    });
  }
}

function storageEnabled(bucket) {
  return Boolean(bucket);
}

async function googleAccessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "metadata-flavor": "Google" }
  });
  if (!response.ok) {
    const error = new Error("Google-Access-Token fuer Cloud Storage konnte nicht gelesen werden.");
    error.status = 500;
    throw error;
  }
  const payload = await response.json();
  return payload.access_token || "";
}

async function storageFetch(url, options = {}) {
  const token = await googleAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok && response.status !== 404) {
    const details = await response.text();
    const error = new Error(`Cloud-Storage-Anfrage fehlgeschlagen (${response.status}).`);
    error.status = response.status;
    error.details = details;
    throw error;
  }
  return response;
}

async function saveStorageObject(bucket, objectName, buffer, contentType) {
  if (!storageEnabled(bucket)) {
    const error = new Error("Cloud-Storage-Bucket ist nicht konfiguriert.");
    error.status = 500;
    throw error;
  }
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const response = await storageFetch(url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: buffer
  });
  return response.ok;
}

async function deleteStorageObject(bucket, objectName) {
  if (!storageEnabled(bucket) || !objectName) return;
  await storageFetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`, {
    method: "DELETE"
  });
}

async function readStorageObject(bucket, objectName) {
  const metadata = await storageFetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`);
  if (metadata.status === 404) return null;
  const meta = await metadata.json();
  const media = await storageFetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`);
  if (media.status === 404) return null;
  return {
    buffer: Buffer.from(await media.arrayBuffer()),
    contentType: meta.contentType || "application/octet-stream"
  };
}

async function loadProfiles(request) {
  if (profileCache.expiresAt > Date.now()) return;
  const params = new URLSearchParams({
    select: PROFILE_FIELDS.join(","),
    active: "eq.true"
  });
  const rows = await cloudSqlRest("profiles", request, params);
  profileCache = {
    expiresAt: Date.now() + 60_000,
    byId: new Map((rows || []).map((profile) => {
      const mapped = profileRowToClient(profile);
      return [mapped.id, mapped];
    }))
  };
}

async function listProfiles(request) {
  await loadProfiles(request);
  return { items: [...profileCache.byId.values()] };
}

async function getCurrentProfile(request) {
  if (!request.currentProfile) request.currentProfile = await resolveRequestProfile(request);
  return profileRowToClient(request.currentProfile);
}

async function getSession(request) {
  const profile = await getCurrentProfile(request);
  return {
    authMode: API_AUTH_MODE,
    authModeLabel: authModeLabel(),
    identitySource: trustedHeaderEmail(request) || trustedHeaderSubject(request) || iapEmail(request) || iapSubject(request) || (API_AUTH_ALLOW_DEV_PROFILE ? "lokales Dev-Profil" : ""),
    enforcement: "server-side",
    enforcementLabel: "Rollen werden in der API serverseitig geprueft.",
    profile,
    roleMatrix: ROLE_MATRIX
  };
}

async function patchCurrentProfile(request) {
  if (!request.currentProfile) request.currentProfile = await resolveRequestProfile(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus der IAP-/SSO-Identitaet gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = profilePatchToDb(await readValidatedJsonBody(request, PROFILE_PATCH_FIELDS, "Profil-Update"));
  if (!payload.display_name) {
    const error = new Error("Bitte trage einen Anzeigenamen ein.");
    error.status = 400;
    throw error;
  }
  payload.updated_at = new Date().toISOString();
  const rows = await cloudSqlRest("profiles", request, new URLSearchParams({
    id: `eq.${userId}`,
    select: PROFILE_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: payload
  });
  if (!rows?.[0]) {
    const error = new Error("Profil wurde nicht aktualisiert.");
    error.status = 404;
    throw error;
  }
  profileCache.expiresAt = 0;
  await loadProfiles(request);
  return profileRowToClient(rows[0]);
}

async function uploadCurrentProfileAvatar(request) {
  if (!request.currentProfile) request.currentProfile = await resolveRequestProfile(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus der IAP-/SSO-Identitaet gelesen werden.");
    error.status = 401;
    throw error;
  }
  if (!PROFILE_IMAGE_BUCKET) {
    const error = new Error("PROFILE_IMAGE_BUCKET ist nicht konfiguriert.");
    error.status = 500;
    throw error;
  }
  const body = await readValidatedJsonBody(request, PROFILE_AVATAR_UPLOAD_FIELDS, "Profilfoto-Upload");
  const contentType = String(body.contentType || "").trim();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    const error = new Error("Bitte nutze ein JPG-, PNG- oder WebP-Bild.");
    error.status = 400;
    throw error;
  }
  const data = String(body.data || "");
  if (!data) {
    const error = new Error("Profilfoto-Daten fehlen.");
    error.status = 400;
    throw error;
  }
  const buffer = Buffer.from(data, "base64");
  if (buffer.length > 5 * 1024 * 1024) {
    const error = new Error("Das Profilfoto darf maximal 5 MB groß sein.");
    error.status = 413;
    throw error;
  }
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const objectName = `profile-images/${userId}/avatar.${extension}`;
  await saveStorageObject(PROFILE_IMAGE_BUCKET, objectName, buffer, contentType);
  const avatarUrl = profileAvatarUrl(userId);
  await cloudSqlRest("profiles", request, new URLSearchParams({
    id: `eq.${userId}`,
    select: PROFILE_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: {
      avatar_url: `gs://${PROFILE_IMAGE_BUCKET}/${objectName}`,
      updated_at: new Date().toISOString()
    }
  });
  profileCache.expiresAt = 0;
  return { publicUrl: avatarUrl, path: objectName };
}

async function removeCurrentProfileAvatar(request) {
  if (!request.currentProfile) request.currentProfile = await resolveRequestProfile(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus der IAP-/SSO-Identitaet gelesen werden.");
    error.status = 401;
    throw error;
  }
  await Promise.all(["jpg", "jpeg", "png", "webp"].map((extension) =>
    deleteStorageObject(PROFILE_IMAGE_BUCKET, `profile-images/${userId}/avatar.${extension}`)
  ));
  const rows = await cloudSqlRest("profiles", request, new URLSearchParams({
    id: `eq.${userId}`,
    select: PROFILE_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: {
      avatar_url: null,
      updated_at: new Date().toISOString()
    }
  });
  profileCache.expiresAt = 0;
  await loadProfiles(request);
  return profileRowToClient(rows?.[0] || null);
}

async function readProfileAvatar(request, response, profileId) {
  await authorizeRequest(request, new URL("/api/profile-avatar", "http://local"));
  if (!PROFILE_IMAGE_BUCKET) return jsonResponse(response, 404, { error: "Profilbild-Bucket ist nicht konfiguriert." });
  for (const extension of ["jpg", "jpeg", "png", "webp"]) {
    const objectName = `profile-images/${profileId}/avatar.${extension}`;
    const object = await readStorageObject(PROFILE_IMAGE_BUCKET, objectName);
    if (object) {
      response.writeHead(200, {
        "content-type": object.contentType,
        "cache-control": "private, max-age=300",
        ...corsHeaders()
      });
      response.end(object.buffer);
      return;
    }
  }
  return jsonResponse(response, 404, { error: "Profilbild nicht gefunden." });
}

async function listContacts(request, url) {
  await loadProfiles(request);
  const params = new URLSearchParams({
    select: CONTACT_FIELDS.join(","),
    order: "updated_at.desc.nullslast,name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  if (url.searchParams.get("status")) params.set("status", `eq.${url.searchParams.get("status")}`);
  const rows = await cloudSqlRest("contacts", request, params);
  return { items: await decorateRowsWithStoredOwners(request, rows || []) };
}

async function organizationContactCounts(request, ids = []) {
  if (!ids.length) return new Map();
  const params = new URLSearchParams({
    select: "organization_id",
    organization_id: `in.(${ids.join(",")})`,
    status: "neq.archived"
  });
  const rows = await cloudSqlRest("contacts", request, params);
  return (rows || []).reduce((counts, row) => {
    if (row.organization_id) counts.set(row.organization_id, (counts.get(row.organization_id) || 0) + 1);
    return counts;
  }, new Map());
}

async function listOrganizations(request, url) {
  const params = new URLSearchParams({
    select: ORGANIZATION_FIELDS.join(","),
    order: "updated_at.desc.nullslast,name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  const rows = await cloudSqlRest("organizations", request, params);
  const counts = await organizationContactCounts(request, (rows || []).map((row) => row.id));
  return { items: (rows || []).map((row) => organizationToDto(row, counts.get(row.id) || 0)) };
}

async function listExpertGroups(request, url) {
  const params = new URLSearchParams({
    select: EXPERT_GROUP_FIELDS.join(","),
    order: "sort_order.asc,name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  const rows = await cloudSqlRest("expert_groups", request, params);
  return { items: (rows || []).map(expertGroupToDto) };
}

async function listExpertContacts(request, url) {
  const params = new URLSearchParams({
    select: EXPERT_CONTACT_FIELDS.join(","),
    order: "name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  if (url.searchParams.get("status")) params.set("status", `eq.${url.searchParams.get("status")}`);
  const rows = await cloudSqlRest("expert_contacts", request, params);
  return { items: (rows || []).map(expertContactToDto) };
}

async function createExpertContact(request) {
  await loadProfiles(request);
  const payload = expertContactCreateToDb(
    await readValidatedJsonBody(request, EXPERT_CONTACT_INPUT_FIELDS, "Expertenkreis-Kontakt")
  );
  const rows = await cloudSqlRest("expert_contacts", request, new URLSearchParams({
    select: EXPERT_CONTACT_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  return expertContactToDto(rows?.[0]);
}

async function patchExpertContact(request, id) {
  await loadProfiles(request);
  const patch = await readValidatedJsonBody(request, EXPERT_CONTACT_INPUT_FIELDS, "Expertenkreis-Kontakt-Update");
  const dbPatch = expertContactPatchToDb(patch);
  if (!Object.keys(dbPatch).length) {
    const error = new Error("Keine unterstützten Expertenkreis-Kontaktfelder im Request.");
    error.status = 400;
    throw error;
  }
  dbPatch.updated_at = new Date().toISOString();
  const rows = await cloudSqlRest("expert_contacts", request, new URLSearchParams({
    id: `eq.${id}`,
    select: EXPERT_CONTACT_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: dbPatch
  });
  if (!rows?.[0]) {
    const error = new Error("Expertenkreis-Kontakt wurde nicht aktualisiert.");
    error.status = 404;
    throw error;
  }
  return expertContactToDto(rows[0]);
}

async function expertOrganizationContactCounts(request, ids = []) {
  if (!ids.length) return new Map();
  const params = new URLSearchParams({
    select: "organization_id",
    organization_id: `in.(${ids.join(",")})`,
    status: "neq.archived"
  });
  const rows = await cloudSqlRest("expert_contacts", request, params);
  return (rows || []).reduce((counts, row) => {
    if (row.organization_id) counts.set(row.organization_id, (counts.get(row.organization_id) || 0) + 1);
    return counts;
  }, new Map());
}

async function listExpertOrganizations(request, url) {
  const params = new URLSearchParams({
    select: EXPERT_ORGANIZATION_FIELDS.join(","),
    order: "name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  const rows = await cloudSqlRest("expert_organizations", request, params);
  const counts = await expertOrganizationContactCounts(request, (rows || []).map((row) => row.id));
  return { items: (rows || []).map((row) => expertOrganizationToDto(row, counts.get(row.id) || 0)) };
}

async function createExpertOrganization(request) {
  const payload = expertOrganizationCreateToDb(
    await readValidatedJsonBody(request, EXPERT_ORGANIZATION_INPUT_FIELDS, "Expertenkreis-Organisation")
  );
  const rows = await cloudSqlRest("expert_organizations", request, new URLSearchParams({
    select: EXPERT_ORGANIZATION_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  return expertOrganizationToDto(rows?.[0], 0);
}

async function listExpertEntityLinks(request) {
  const rows = await cloudSqlRest("expert_entity_links", request, new URLSearchParams({
    select: EXPERT_ENTITY_LINK_FIELDS.join(","),
    order: "updated_at.desc.nullslast"
  }));
  return { items: (rows || []).map(expertEntityLinkToDto) };
}

async function createExpertEntityLink(request) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = expertEntityLinkToDb(
    await readValidatedJsonBody(request, EXPERT_ENTITY_LINK_INPUT_FIELDS, "Expertenkreis-Verknuepfung"),
    userId
  );
  const rows = await cloudSqlRest("expert_entity_links", request, new URLSearchParams({
    select: EXPERT_ENTITY_LINK_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  return expertEntityLinkToDto(rows?.[0]);
}

async function listStakeholderTypes(request, url) {
  const params = new URLSearchParams({
    select: STAKEHOLDER_TYPE_FIELDS.join(","),
    order: "sort_order.asc,label.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  const rows = await cloudSqlRest("stakeholder_types", request, params);
  return { items: (rows || []).map(stakeholderTypeToDto) };
}

async function stakeholderPeopleCounts(request, ids = []) {
  if (!ids.length) return new Map();
  const params = new URLSearchParams({
    select: "organization_id",
    organization_id: `in.(${ids.join(",")})`,
    status: "neq.archived"
  });
  const rows = await cloudSqlRest("stakeholder_people", request, params);
  return (rows || []).reduce((counts, row) => {
    if (row.organization_id) counts.set(row.organization_id, (counts.get(row.organization_id) || 0) + 1);
    return counts;
  }, new Map());
}

async function listStakeholderOrganizations(request, url) {
  const params = new URLSearchParams({
    select: STAKEHOLDER_ORGANIZATION_FIELDS.join(","),
    order: "name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  if (url.searchParams.get("stakeholderTypeId")) params.set("stakeholder_type_id", `eq.${url.searchParams.get("stakeholderTypeId")}`);
  const rows = await cloudSqlRest("stakeholder_organizations", request, params);
  const counts = await stakeholderPeopleCounts(request, (rows || []).map((row) => row.id));
  return { items: (rows || []).map((row) => stakeholderOrganizationToDto(row, counts.get(row.id) || 0)) };
}

async function listStakeholderPeople(request, url) {
  const params = new URLSearchParams({
    select: STAKEHOLDER_PEOPLE_FIELDS.join(","),
    order: "name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  if (url.searchParams.get("stakeholderTypeId")) params.set("stakeholder_type_id", `eq.${url.searchParams.get("stakeholderTypeId")}`);
  if (url.searchParams.get("representativeAssembly") === "true") params.set("is_representative_assembly_member", "eq.true");
  const rows = await cloudSqlRest("stakeholder_people", request, params);
  return { items: (rows || []).map(stakeholderPersonToDto) };
}

async function upsertStakeholderImport(request) {
  const body = await readValidatedJsonBody(request, STAKEHOLDER_IMPORT_INPUT_FIELDS, "Stakeholder-Import");
  const types = (Array.isArray(body.types) ? body.types : []).map(stakeholderTypeToDb);
  const organizations = (Array.isArray(body.organizations) ? body.organizations : []).map(stakeholderOrganizationToDb).filter((row) => row.name);
  const people = (Array.isArray(body.people) ? body.people : []).map(stakeholderPersonToDb).filter((row) => row.name);

  if (types.length) {
    await cloudSqlRest("stakeholder_types", request, new URLSearchParams({ on_conflict: "id" }), {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: types
    });
  }
  if (organizations.length) {
    await cloudSqlRest("stakeholder_organizations", request, new URLSearchParams({ on_conflict: "id" }), {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: organizations
    });
  }
  if (people.length) {
    await cloudSqlRest("stakeholder_people", request, new URLSearchParams({ on_conflict: "id" }), {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: people
    });
  }

  return {
    types: (await listStakeholderTypes(request, new URL("http://local/api/stakeholder-types?includeArchived=true"))).items,
    organizations: (await listStakeholderOrganizations(request, new URL("http://local/api/stakeholder-organizations?includeArchived=true"))).items,
    people: (await listStakeholderPeople(request, new URL("http://local/api/stakeholder-people?includeArchived=true"))).items
  };
}

async function deleteExpertEntityLink(request, id) {
  await cloudSqlRest("expert_entity_links", request, new URLSearchParams({ id: `eq.${id}` }), {
    method: "DELETE",
    headers: { prefer: "return=minimal" }
  });
  return { ok: true };
}

async function getOrganization(request, id) {
  const rows = await cloudSqlRest("organizations", request, new URLSearchParams({
    select: ORGANIZATION_FIELDS.join(","),
    id: `eq.${id}`,
    limit: "1"
  }));
  if (!rows?.length) {
    const error = new Error("Organisation wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  const counts = await organizationContactCounts(request, [id]);
  return organizationToDto(rows[0], counts.get(id) || 0);
}

async function createOrganization(request) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const organization = await readValidatedJsonBody(request, ORGANIZATION_INPUT_FIELDS, "Organisation");
  const dbOrganization = organizationCreateToDb(organization);
  dbOrganization.created_by = userId;
  dbOrganization.updated_by = userId;
  const rows = await cloudSqlRest("organizations", request, new URLSearchParams({
    select: ORGANIZATION_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: dbOrganization
  });
  const created = rows?.[0];
  if (!created) {
    const error = new Error("Organisation wurde nicht angelegt.");
    error.status = 500;
    throw error;
  }
  const dto = organizationToDto(created, 0);
  await notifyOrganizationChanged(request, dto, userId, "create");
  return dto;
}

async function patchOrganization(request, id) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const patch = await readValidatedJsonBody(request, ORGANIZATION_INPUT_FIELDS, "Organisations-Update");
  const dbPatch = organizationPatchToDb(patch);
  if (!Object.keys(dbPatch).length) {
    const error = new Error("Keine unterstützten Organisationsfelder im Request.");
    error.status = 400;
    throw error;
  }
  dbPatch.updated_by = userId;
  dbPatch.updated_at = new Date().toISOString();
  const rows = await cloudSqlRest("organizations", request, new URLSearchParams({
    id: `eq.${id}`,
    select: ORGANIZATION_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: dbPatch
  });
  const updated = rows?.[0];
  if (!updated) {
    const error = new Error("Organisation wurde nicht aktualisiert.");
    error.status = 404;
    throw error;
  }
  const counts = await organizationContactCounts(request, [id]);
  const dto = organizationToDto(updated, counts.get(id) || 0);
  await notifyOrganizationChanged(request, dto, userId, "update");
  return dto;
}

async function listSavedViews(request) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  const rows = await cloudSqlRest("saved_views", request, new URLSearchParams({
    select: SAVED_VIEW_FIELDS.join(","),
    order: "is_default.desc,updated_at.desc"
  }));
  return {
    items: (rows || [])
      .filter((row) => row.scope === "team" || row.owner_id === userId)
      .map(savedViewToDto)
  };
}

async function createSavedView(request) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = savedViewToDb(await readValidatedJsonBody(request, SAVED_VIEW_INPUT_FIELDS, "Gespeicherte Ansicht"), userId);
  if (payload.scope === "team" && roleRank(request.currentProfile?.role) < roleRank("admin")) payload.scope = "private";
  if (!payload.name) {
    const error = new Error("Name fuer gespeicherte Suche fehlt.");
    error.status = 400;
    throw error;
  }
  const rows = await cloudSqlRest("saved_views", request, new URLSearchParams({
    select: SAVED_VIEW_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  return savedViewToDto(rows?.[0]);
}

async function patchSavedView(request, id) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  const existingRows = await cloudSqlRest("saved_views", request, new URLSearchParams({
    id: `eq.${id}`,
    limit: "1"
  }));
  if (!existingRows?.[0] || (existingRows[0].owner_id !== userId && roleRank(request.currentProfile?.role) < roleRank("admin"))) {
    const error = new Error("Gespeicherte Ansicht wurde nicht gefunden oder darf nicht bearbeitet werden.");
    error.status = 404;
    throw error;
  }
  const payload = savedViewPatchToDb(await readValidatedJsonBody(request, SAVED_VIEW_INPUT_FIELDS, "Gespeicherte Ansicht"));
  if (payload.scope === "team" && roleRank(request.currentProfile?.role) < roleRank("admin")) payload.scope = "private";
  if (!Object.keys(payload).length) {
    const error = new Error("Keine unterstützten Felder fuer gespeicherte Suche im Request.");
    error.status = 400;
    throw error;
  }
  const rows = await cloudSqlRest("saved_views", request, new URLSearchParams({
    id: `eq.${id}`,
    select: SAVED_VIEW_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: payload
  });
  if (!rows?.[0]) {
    const error = new Error("Gespeicherte Ansicht wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  return savedViewToDto(rows[0]);
}

async function deleteSavedView(request, id) {
  const userId = userIdFromToken(request);
  const existingRows = await cloudSqlRest("saved_views", request, new URLSearchParams({
    id: `eq.${id}`,
    limit: "1"
  }));
  if (!existingRows?.[0] || (existingRows[0].owner_id !== userId && roleRank(request.currentProfile?.role) < roleRank("admin"))) {
    const error = new Error("Gespeicherte Ansicht wurde nicht gefunden oder darf nicht geloescht werden.");
    error.status = 404;
    throw error;
  }
  await cloudSqlRest("saved_views", request, new URLSearchParams({ id: `eq.${id}` }), {
    method: "DELETE",
    headers: { prefer: "return=minimal" }
  });
  return { ok: true };
}

async function getUserSettings(request) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const rows = await cloudSqlRest("user_settings", request, new URLSearchParams({
    select: USER_SETTINGS_FIELDS.join(","),
    user_id: `eq.${userId}`,
    limit: "1"
  }));
  return userSettingsToDto(rows?.[0] || null);
}

async function upsertUserSettings(request) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = userSettingsToDb(await readValidatedJsonBody(request, USER_SETTINGS_INPUT_FIELDS, "Nutzereinstellungen"), userId);
  const rows = await cloudSqlRest("user_settings", request, new URLSearchParams({
    on_conflict: "user_id",
    select: USER_SETTINGS_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: payload
  });
  return userSettingsToDto(rows?.[0] || null);
}

async function formatParticipantsByFormat(request, ids = []) {
  if (!ids.length) return new Map();
  const rows = await cloudSqlRest("format_participants", request, new URLSearchParams({
    select: FORMAT_PARTICIPANT_FIELDS.join(","),
    format_id: `in.(${ids.join(",")})`,
    order: "updated_at.desc.nullslast"
  }));
  return (rows || []).reduce((groups, row) => {
    const list = groups.get(row.format_id) || [];
    list.push(row);
    groups.set(row.format_id, list);
    return groups;
  }, new Map());
}

async function listFormats(request, url) {
  await loadProfiles(request);
  const rows = await cloudSqlRest("formats", request, new URLSearchParams({
    select: FORMAT_FIELDS.join(","),
    order: "updated_at.desc.nullslast,title.asc"
  }));
  const participantGroups = await formatParticipantsByFormat(request, (rows || []).map((row) => row.id));
  const items = (rows || [])
    .map((row) => formatToDto(row, participantGroups.get(row.id) || []))
    .filter((format) => url.searchParams.get("includeArchived") === "true" || format.status !== "Archiviert");
  return { items };
}

async function getFormat(request, id) {
  await loadProfiles(request);
  const rows = await cloudSqlRest("formats", request, new URLSearchParams({
    select: FORMAT_FIELDS.join(","),
    id: `eq.${id}`,
    limit: "1"
  }));
  if (!rows?.length) {
    const error = new Error("Format wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  const participantGroups = await formatParticipantsByFormat(request, [id]);
  return formatToDto(rows[0], participantGroups.get(id) || []);
}

async function createFormat(request) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = formatToDb(await readValidatedJsonBody(request, FORMAT_INPUT_FIELDS, "Format"));
  if (!payload.title) {
    const error = new Error("Titel des Formats fehlt.");
    error.status = 400;
    throw error;
  }
  payload.created_by = userId;
  payload.updated_by = userId;
  const rows = await cloudSqlRest("formats", request, new URLSearchParams({
    select: FORMAT_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  const dto = formatToDto(rows?.[0], []);
  await notifyFormatChanged(request, dto, userId, "create");
  return dto;
}

async function patchFormat(request, id, patch = null) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const rawPatch = patch || await readValidatedJsonBody(request, FORMAT_INPUT_FIELDS, "Format-Update");
  const shouldNotify = Object.keys(rawPatch || {}).length > 0;
  const previous = shouldNotify ? await getFormat(request, id) : null;
  const payload = {
    ...formatPatchToDb(rawPatch),
    updated_by: userId,
    updated_at: new Date().toISOString()
  };
  const rows = await cloudSqlRest("formats", request, new URLSearchParams({
    id: `eq.${id}`,
    select: FORMAT_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: payload
  });
  if (!rows?.[0]) {
    const error = new Error("Format wurde nicht aktualisiert.");
    error.status = 404;
    throw error;
  }
  const participantGroups = await formatParticipantsByFormat(request, [id]);
  const dto = formatToDto(rows[0], participantGroups.get(id) || []);
  if (shouldNotify) await notifyFormatChanged(request, dto, userId, "update", previous);
  return dto;
}

async function deleteFormat(request, id) {
  await cloudSqlRest("formats", request, new URLSearchParams({ id: `eq.${id}` }), {
    method: "DELETE",
    headers: { prefer: "return=minimal" }
  });
  return { ok: true };
}

async function addFormatParticipant(request, formatId) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const body = await readValidatedJsonBody(request, FORMAT_PARTICIPANT_INPUT_FIELDS, "Format-Teilnehmer");
  const contactId = body.contactId || body.contact_id;
  if (!contactId) {
    const error = new Error("Kontakt-ID fuer Teilnehmer fehlt.");
    error.status = 400;
    throw error;
  }
  const payload = formatParticipantToDb(body, formatId, contactId);
  payload.created_by = userId;
  payload.updated_by = userId;
  await cloudSqlRest("format_participants", request, new URLSearchParams({ on_conflict: "format_id,contact_id" }), {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: payload
  });
  const updated = await patchFormat(request, formatId, {});
  await notifyFormatChanged(request, updated, userId, "participant");
  return updated;
}

async function patchFormatParticipant(request, formatId, contactId) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = formatParticipantPatchToDb(await readValidatedJsonBody(request, FORMAT_PARTICIPANT_INPUT_FIELDS, "Format-Teilnehmer"));
  if (!Object.keys(payload).length) {
    const error = new Error("Keine unterstützten Teilnehmerfelder im Request.");
    error.status = 400;
    throw error;
  }
  payload.updated_by = userId;
  payload.updated_at = new Date().toISOString();
  await cloudSqlRest("format_participants", request, new URLSearchParams({
    format_id: `eq.${formatId}`,
    contact_id: `eq.${contactId}`
  }), {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: payload
  });
  const updated = await patchFormat(request, formatId, {});
  await notifyFormatChanged(request, updated, userId, "participant");
  return updated;
}

async function removeFormatParticipant(request, formatId, contactId) {
  const userId = userIdFromToken(request);
  await cloudSqlRest("format_participants", request, new URLSearchParams({
    format_id: `eq.${formatId}`,
    contact_id: `eq.${contactId}`
  }), {
    method: "DELETE",
    headers: { prefer: "return=minimal" }
  });
  const updated = await patchFormat(request, formatId, {});
  await notifyFormatChanged(request, updated, userId, "participant");
  return updated;
}

async function listHospitationSlots(request, url) {
  await loadProfiles(request);
  const rows = await cloudSqlRest("hospitation_slots", request, new URLSearchParams({
    select: HOSPITATION_SLOT_FIELDS.join(","),
    order: "starts_at.asc.nullslast,updated_at.desc.nullslast"
  }));
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const items = (rows || [])
    .map(hospitationSlotToDto)
    .filter((slot) => includeArchived || slot.status !== "Archiviert");
  return { items };
}

async function getHospitationSlot(request, id) {
  await loadProfiles(request);
  const rows = await cloudSqlRest("hospitation_slots", request, new URLSearchParams({
    select: HOSPITATION_SLOT_FIELDS.join(","),
    id: `eq.${id}`,
    limit: "1"
  }));
  if (!rows?.length) {
    const error = new Error("Hospitations-Termin wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  return hospitationSlotToDto(rows[0]);
}

async function createHospitationSlot(request) {
  const body = await readValidatedJsonBody(request, HOSPITATION_SLOT_INPUT_FIELDS, "Hospitations-Termin");
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = hospitationSlotToDb(body);
  if (!payload.starts_at) {
    const error = new Error("Startzeit des Hospitations-Termins fehlt.");
    error.status = 400;
    throw error;
  }
  payload.created_by = userId;
  payload.updated_by = userId;
  const rows = await cloudSqlRest("hospitation_slots", request, new URLSearchParams({
    select: HOSPITATION_SLOT_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  return hospitationSlotToDto(rows?.[0]);
}

async function patchHospitationSlot(request, id) {
  const rawPatch = await readValidatedJsonBody(request, HOSPITATION_SLOT_INPUT_FIELDS, "Hospitations-Termin-Update");
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = {
    ...hospitationSlotPatchToDb(rawPatch),
    updated_by: userId,
    updated_at: new Date().toISOString()
  };
  const rows = await cloudSqlRest("hospitation_slots", request, new URLSearchParams({
    id: `eq.${id}`,
    select: HOSPITATION_SLOT_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: payload
  });
  if (!rows?.[0]) {
    const error = new Error("Hospitations-Termin wurde nicht aktualisiert.");
    error.status = 404;
    throw error;
  }
  return hospitationSlotToDto(rows[0]);
}

function hospitationOccupiesSlot(status = "") {
  return ["Gebucht", "Durchgeführt", "Dokumentiert"].includes(normalizeHospitationStatus(status));
}

async function syncHospitationSlotStatus(request, slotId = "", status = "") {
  if (!slotId) return;
  const nextStatus = hospitationOccupiesSlot(status) ? "Gebucht" : status === "Abgesagt" ? "Abgesagt" : "";
  if (!nextStatus) return;
  await cloudSqlRest("hospitation_slots", request, new URLSearchParams({ id: `eq.${slotId}` }), {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: {
      status: nextStatus,
      updated_by: userIdFromToken(request),
      updated_at: new Date().toISOString()
    }
  });
}

async function hydrateHospitationFromSlot(request, payload = {}) {
  if (!payload.slot_id) return payload;
  const slot = await getHospitationSlot(request, payload.slot_id);
  return {
    ...payload,
    contact_id: payload.contact_id || slot.contactId || null,
    contact_name: payload.contact_name || slot.contactName || null,
    organization_id: payload.organization_id || slot.organizationId || null,
    organization_name: payload.organization_name || slot.organizationName || null,
    starts_at: payload.starts_at || slot.startsAt || null,
    ends_at: payload.ends_at || slot.endsAt || null,
    location: payload.location || slot.location || null,
    city: payload.city || slot.city || null,
    federal_state: payload.federal_state || slot.state || null,
    sector: payload.sector || slot.sector || null,
    owner_id: payload.owner_id || slot.ownerId || null
  };
}

async function listHospitations(request, url) {
  await loadProfiles(request);
  const rows = await cloudSqlRest("hospitations", request, new URLSearchParams({
    select: HOSPITATION_FIELDS.join(","),
    order: "starts_at.desc.nullslast,updated_at.desc.nullslast"
  }));
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const items = (rows || [])
    .map(hospitationToDto)
    .filter((hospitation) => includeArchived || hospitation.status !== "Archiviert");
  return { items };
}

async function getHospitation(request, id) {
  await loadProfiles(request);
  const rows = await cloudSqlRest("hospitations", request, new URLSearchParams({
    select: HOSPITATION_FIELDS.join(","),
    id: `eq.${id}`,
    limit: "1"
  }));
  if (!rows?.length) {
    const error = new Error("Hospitation wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  return hospitationToDto(rows[0]);
}

async function createHospitation(request) {
  const rawBody = await readValidatedJsonBody(request, HOSPITATION_INPUT_FIELDS, "Hospitation");
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = await hydrateHospitationFromSlot(request, hospitationToDb(rawBody, userId));
  if (!payload.contact_id && !payload.contact_name && !payload.organization_id && !payload.organization_name && !payload.slot_id) {
    const error = new Error("Hospitation benötigt Kontakt, Organisation oder Termin-Slot.");
    error.status = 400;
    throw error;
  }
  payload.created_by = userId;
  payload.updated_by = userId;
  const rows = await cloudSqlRest("hospitations", request, new URLSearchParams({
    select: HOSPITATION_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  const dto = hospitationToDto(rows?.[0]);
  await syncHospitationSlotStatus(request, dto.slotId, dto.status);
  return dto;
}

async function patchHospitation(request, id) {
  const rawPatch = await readValidatedJsonBody(request, HOSPITATION_INPUT_FIELDS, "Hospitations-Update");
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = await hydrateHospitationFromSlot(request, hospitationPatchToDb(rawPatch));
  if (normalizeHospitationStatus(rawPatch.status) === "Dokumentiert") {
    if (!("documentedAt" in rawPatch) && !("documented_at" in rawPatch)) payload.documented_at = new Date().toISOString();
    if (!("documentedBy" in rawPatch) && !("documented_by" in rawPatch)) payload.documented_by = userId;
  }
  payload.updated_by = userId;
  payload.updated_at = new Date().toISOString();
  const rows = await cloudSqlRest("hospitations", request, new URLSearchParams({
    id: `eq.${id}`,
    select: HOSPITATION_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: payload
  });
  if (!rows?.[0]) {
    const error = new Error("Hospitation wurde nicht aktualisiert.");
    error.status = 404;
    throw error;
  }
  const dto = hospitationToDto(rows[0]);
  await syncHospitationSlotStatus(request, dto.slotId, dto.status);
  return dto;
}

async function createContact(request) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }

  const payload = await readJsonBody(request);
  assertAllowedFields(payload, [...CONTACT_INPUT_FIELDS, ...CONTACT_CREATE_WRAPPER_FIELDS], "Kontaktanlage");
  const hasWrappedContact = Object.prototype.hasOwnProperty.call(payload, "contact");
  const contact = hasWrappedContact ? payload.contact : payload;
  assertAllowedFields(contact, CONTACT_INPUT_FIELDS, "Kontakt");
  const options = payload.options && typeof payload.options === "object" ? payload.options : {};
  assertAllowedFields(options, CONTACT_CREATE_OPTIONS_FIELDS, "Kontaktanlage-Optionen");
  const ownerIds = ownerIdsFromContact(contact);
  const dbContact = contactCreateToDb(contact);
  dbContact.created_by = userId;
  dbContact.updated_by = userId;

  const rows = await cloudSqlRest("contacts", request, new URLSearchParams({
    select: CONTACT_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: dbContact
  });
  const created = rows?.[0];
  if (!created) {
    const error = new Error("Kontakt wurde nicht angelegt.");
    error.status = 500;
    throw error;
  }

  await cloudSqlRest("changes", request, new URLSearchParams(), {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: {
      contact_id: created.id,
      action: options.action === "import" ? "import" : "create",
      field_name: null,
      old_value: "",
      new_value: options.batchId ? `${created.name || created.id} · Batch ${options.batchId}` : created.name || created.id,
      changed_by: userId
    }
  });

  await replaceStoredContactOwners(request, created.id, [], ownerIds, userId, { log: false });
  const dto = contactToDto(created, 0, supportsContactOwners ? ownerIds : normalizeOwnerIds(created.owner_id));
  await notifyContactCreated(request, dto, userId, options);
  return dto;
}

async function getContact(request, id) {
  await loadProfiles(request);
  const params = new URLSearchParams({
    select: CONTACT_FIELDS.join(","),
    id: `eq.${id}`,
    limit: "1"
  });
  const rows = await cloudSqlRest("contacts", request, params);
  if (!rows?.length) {
    const error = new Error("Kontakt wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  return (await decorateRowsWithStoredOwners(request, rows || []))[0];
}

async function getContactHistory(request, id, url) {
  await loadProfiles(request);
  const params = new URLSearchParams({
    select: CHANGE_FIELDS.join(","),
    contact_id: `eq.${id}`,
    order: "changed_at.desc,id.desc"
  });
  if (url.searchParams.get("action")) params.set("action", `eq.${url.searchParams.get("action")}`);
  const rows = await cloudSqlRest("changes", request, params);
  return { items: (rows || []).map(changeToDto) };
}

function activityMatchesFilters(change, filters = {}) {
  const kind = String(filters.kind || filters.action || "").trim();
  const query = String(filters.q || "").trim().toLowerCase();
  if (kind && change.kind !== kind && change.action !== kind) return false;
  if (!query) return true;
  return [
    change.contactId,
    change.action,
    change.kind,
    change.fieldName,
    change.oldValue,
    change.newValue,
    change.changedBy,
    change.user?.displayName,
    change.user?.role,
    change.contact?.name,
    change.contact?.organization,
    change.contact?.sector,
    change.contact?.specialty,
    change.contact?.city,
    change.contact?.state
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

async function getActivities(request, url) {
  await loadProfiles(request);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const kind = String(url.searchParams.get("kind") || url.searchParams.get("action") || "").trim();
  const changedBy = String(url.searchParams.get("changedBy") || "").trim();
  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  const q = String(url.searchParams.get("q") || "").trim();
  const needsClientFilter = Boolean(q) || ["owner", "restore", "update"].includes(kind);
  const params = new URLSearchParams({
    select: `${CHANGE_FIELDS.join(",")},contacts(id,name,organization,sector,specialty,city,federal_state,image_url,status)`,
    order: "changed_at.desc,id.desc"
  });
  if (changedBy) params.set("changed_by", `eq.${changedBy}`);
  if (from) params.append("changed_at", `gte.${from}`);
  if (to) params.append("changed_at", `lte.${to}`);
  if (["create", "import", "archive"].includes(kind)) params.set("action", `eq.${kind}`);
  if (needsClientFilter) {
    params.set("limit", "1000");
  } else {
    params.set("limit", String(limit + 1));
    params.set("offset", String(offset));
  }
  const rows = await cloudSqlRest("changes", request, params);
  const allItems = (rows || [])
    .map(changeToDto)
    .filter((change) => activityMatchesFilters(change, { kind, q }));
  const page = needsClientFilter ? allItems.slice(offset, offset + limit + 1) : allItems;
  return {
    items: page.slice(0, limit),
    nextOffset: offset + Math.min(page.length, limit),
    hasMore: page.length > limit
  };
}

async function listNotifications(request, url) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) return { items: [], nextOffset: 0, hasMore: false };
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const context = String(url.searchParams.get("context") || "all").trim();
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  try {
    const params = new URLSearchParams({
      select: NOTIFICATION_SELECT,
      dismissed_at: "is.null",
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit: String(offset + limit + 100)
    });
    if (unreadOnly) params.set("read_at", "is.null");
    const rows = await cloudSqlRest("notification_recipients", request, params);
    const filtered = sortNotifications((rows || []).map(notificationToDto))
      .filter((item) => notificationMatchesContext(item, context));
    const page = filtered.slice(offset, offset + limit + 1);
    return {
      items: page.slice(0, limit),
      nextOffset: offset + Math.min(page.length, limit),
      hasMore: page.length > limit
    };
  } catch (error) {
    if (isMissingNotificationsError(error)) return { items: [], nextOffset: offset, hasMore: false };
    throw error;
  }
}

async function getNotificationSummary(request) {
  const payload = await listNotifications(request, new URL("http://local/api/notifications?unreadOnly=true&limit=100"));
  const byContext = {};
  (payload.items || []).forEach((item) => {
    byContext[item.context] = (byContext[item.context] || 0) + 1;
  });
  const unreadTotal = Object.values(byContext).reduce((sum, count) => sum + count, 0);
  return { unreadTotal, byContext };
}

async function markNotificationRead(request, id) {
  const userId = userIdFromToken(request);
  try {
    await cloudSqlRest("notification_recipients", request, new URLSearchParams({
      event_id: `eq.${id}`,
      user_id: `eq.${userId}`,
      read_at: "is.null"
    }), {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: { read_at: new Date().toISOString() }
    });
    return { ok: true };
  } catch (error) {
    if (isMissingNotificationsError(error)) return { ok: false };
    throw error;
  }
}

async function markNotificationsRead(request) {
  const body = await readJsonBody(request);
  const ids = uniqueIds(Array.isArray(body?.ids) ? body.ids : []);
  for (const id of ids) {
    await markNotificationRead(request, id);
  }
  return { ok: true };
}

function runtimeMetadata() {
  return {
    service: process.env.K_SERVICE || "local-api",
    revision: process.env.K_REVISION || "local",
    configuration: process.env.K_CONFIGURATION || "local",
    database: process.env.DB_NAME || process.env.PGDATABASE || DEFAULT_DB_NAME,
    authMode: API_AUTH_MODE,
    iapJwtAudienceConfigured: Boolean(IAP_JWT_AUDIENCE),
    authEmailHeader: AUTH_EMAIL_HEADER,
    authSubjectHeader: AUTH_SUBJECT_HEADER,
    profileImageBucket: PROFILE_IMAGE_BUCKET || null,
    contactImageBucket: CONTACT_IMAGE_BUCKET || null
  };
}

async function scalar(sql, values = []) {
  const result = await getPool().query(sql, values);
  return result.rows[0] || {};
}

async function countWhere(table, where = "true") {
  const row = await scalar(`select count(*)::int as count from ${qid(table)} where ${where}`);
  return row.count || 0;
}

async function getOpsSummary() {
  const row = await scalar("select now() as db_time");
  return {
    ok: true,
    backend: "postgres",
    generatedAt: new Date().toISOString(),
    runtime: runtimeMetadata(),
    databaseTime: row.db_time || null,
    counts: {
      profiles: await countWhere("profiles"),
      activeContacts: await countWhere("contacts", "status <> 'archived'"),
      archivedContacts: await countWhere("contacts", "status = 'archived'"),
      activeOrganizations: await countWhere("organizations", "status <> 'archived'"),
      archivedOrganizations: await countWhere("organizations", "status = 'archived'"),
      changes: await countWhere("changes"),
      activeFormats: await countWhere("formats", "status <> 'Archiviert'"),
      archivedFormats: await countWhere("formats", "status = 'Archiviert'"),
      formatParticipants: await countWhere("format_participants"),
      activeHospitationSlots: await countWhere("hospitation_slots", "status <> 'Archiviert'"),
      activeHospitations: await countWhere("hospitations", "status <> 'Archiviert'"),
      documentedHospitations: await countWhere("hospitations", "status = 'Dokumentiert'"),
      expertGroups: await countWhere("expert_groups", "status <> 'archived'"),
      expertContacts: await countWhere("expert_contacts", "status <> 'archived'"),
      expertOrganizations: await countWhere("expert_organizations", "status <> 'archived'"),
      stakeholderTypes: await countWhere("stakeholder_types", "status <> 'archived'"),
      stakeholderOrganizations: await countWhere("stakeholder_organizations", "status <> 'archived'"),
      stakeholderPeople: await countWhere("stakeholder_people", "status <> 'archived'"),
      savedViews: await countWhere("saved_views"),
      userSettings: await countWhere("user_settings"),
      notifications: await countWhere("notification_events"),
      importRuns: await countWhere("import_runs")
    }
  };
}

function opsCheck(key, label, status, detail, meta = {}) {
  return { key, label, status, detail, meta };
}

async function getOpsChecks() {
  const checks = [];
  let summary = null;
  let dbError = "";
  const startedAt = Date.now();
  try {
    const dbStartedAt = Date.now();
    summary = await getOpsSummary();
    checks.push(opsCheck("postgres", "Postgres", "ok", `Datenbank antwortet in ${Date.now() - dbStartedAt} ms.`, {
      databaseTime: summary.databaseTime
    }));
  } catch (error) {
    dbError = error.message || "Postgres-Abfrage fehlgeschlagen.";
    checks.push(opsCheck("postgres", "Postgres", "error", dbError));
  }
  const counts = summary?.counts || {};
  checks.push(opsCheck("kubernetes-api", "Kubernetes API", "ok", "API-Service antwortet.", runtimeMetadata()));
  checks.push(opsCheck(
    "auth-boundary",
    "Gateway/SSO",
    API_AUTH_MODE === "iap" ? (IAP_JWT_AUDIENCE ? "ok" : "warn") : (["trusted-header", "sso"].includes(API_AUTH_MODE) && AUTH_EMAIL_HEADER ? "ok" : "warn"),
    API_AUTH_MODE === "iap" && IAP_JWT_AUDIENCE
      ? "API validiert signierte IAP-JWTs und mappt sie auf Profile."
      : ["trusted-header", "sso"].includes(API_AUTH_MODE) && AUTH_EMAIL_HEADER
        ? "API erwartet eine vom Gateway gesetzte Nutzeridentitaet und mappt sie auf Profile."
        : "API erwartet eine Gateway-/SSO-Identitaet; Auth-Konfiguration ist unvollstaendig.",
    { authMode: API_AUTH_MODE, iapJwtAudienceConfigured: Boolean(IAP_JWT_AUDIENCE), authEmailHeader: AUTH_EMAIL_HEADER, authSubjectHeader: AUTH_SUBJECT_HEADER }
  ));
  checks.push(opsCheck(
    "core-data",
    "Kern-Daten",
    dbError ? "error" : counts.profiles > 0 && counts.activeContacts > 0 ? "ok" : "warn",
    dbError || `${counts.profiles || 0} Profile, ${counts.activeContacts || 0} aktive Kontakte, ${counts.activeOrganizations || 0} aktive Organisationen.`,
    counts
  ));
  checks.push(opsCheck(
    "storage",
    "Object Storage",
    PROFILE_IMAGE_BUCKET || CONTACT_IMAGE_BUCKET ? "ok" : "warn",
    PROFILE_IMAGE_BUCKET || CONTACT_IMAGE_BUCKET ? "Mindestens ein Storage-Bucket ist konfiguriert." : "PROFILE_IMAGE_BUCKET/CONTACT_IMAGE_BUCKET fehlen.",
    { profileImageBucket: PROFILE_IMAGE_BUCKET || null, contactImageBucket: CONTACT_IMAGE_BUCKET || null }
  ));
  checks.push(opsCheck("migration-jobs", "Migrationsjobs", "info", "Nicht fuer den App-Betrieb erforderlich; optional fuer Migrationen, Seeds oder Wartung."));
  const status = checks.some((check) => check.status === "error") ? "error" : checks.some((check) => check.status === "warn") ? "warn" : "ok";
  return {
    ok: status !== "error",
    status,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    runtime: runtimeMetadata(),
    summary,
    checks
  };
}

async function exportCloudSqlData() {
  const tables = [
    "profiles",
    "organizations",
    "contacts",
    "contact_owners",
    "changes",
    "formats",
    "format_participants",
    "hospitation_slots",
    "hospitations",
    "expert_groups",
    "expert_contacts",
    "expert_organizations",
    "expert_entity_links",
    "stakeholder_types",
    "stakeholder_organizations",
    "stakeholder_people",
    "saved_views",
    "user_settings",
    "notification_events",
    "notification_recipients",
    "import_runs"
  ];
  const data = {};
  for (const table of tables) {
    data[table] = (await getPool().query(`select * from ${qid(table)}`)).rows;
  }
  return {
    exportedAt: new Date().toISOString(),
    exportType: "versorgungs-kompass-cloud-sql",
    runtime: runtimeMetadata(),
    data
  };
}

function jsonDownload(response, fileName, payload) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="${fileName}"`,
    "cache-control": "no-store",
    ...corsHeaders()
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function patchContact(request, id) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }

  const patch = await readValidatedJsonBody(request, CONTACT_INPUT_FIELDS, "Kontakt-Update");
  const hasOwnerPatch = ["ownerIds", "owner_ids", "owners", "ownerId", "owner_id", "owner"].some((field) =>
    Object.prototype.hasOwnProperty.call(patch, field)
  );
  const nextOwnerIds = hasOwnerPatch ? ownerIdsFromContact(patch) : [];
  const dbPatch = contactPatchToDb(patch);
  if (!Object.keys(dbPatch).length) {
    const error = new Error("Keine unterstützten Kontaktfelder im Request.");
    error.status = 400;
    throw error;
  }

  const oldRows = await cloudSqlRest("contacts", request, new URLSearchParams({
    select: CONTACT_FIELDS.join(","),
    id: `eq.${id}`,
    limit: "1"
  }));
  if (!oldRows?.length) {
    const error = new Error("Kontakt wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  const oldRow = oldRows[0];
  const oldOwnerRows = await loadContactOwnerRows(request, [id]);
  const oldOwnerIds = supportsContactOwners
    ? contactOwnerMap(oldOwnerRows).get(id) || normalizeOwnerIds(oldRow.owner_id)
    : normalizeOwnerIds(oldRow.owner_id);

  dbPatch.updated_by = userId;
  dbPatch.updated_at = new Date().toISOString();
  let changedFields = Object.keys(dbPatch).filter((field) => stringifyValue(oldRow[field]) !== stringifyValue(dbPatch[field]));
  if (hasOwnerPatch && supportsContactOwners) changedFields = changedFields.filter((field) => field !== "owner_id");

  const updatedRows = await cloudSqlRest("contacts", request, new URLSearchParams({
    id: `eq.${id}`,
    select: CONTACT_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: dbPatch
  });
  const updated = updatedRows?.[0];
  if (!updated) {
    const error = new Error("Kontakt wurde nicht aktualisiert.");
    error.status = 500;
    throw error;
  }

  if (changedFields.length) {
    const action = dbPatch.status === "archived" ? "archive" : "update";
    await cloudSqlRest("changes", request, new URLSearchParams(), {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: changedFields.map((field) => ({
        contact_id: id,
        action,
        field_name: field,
        old_value: stringifyValue(oldRow[field]),
        new_value: stringifyValue(dbPatch[field]),
        changed_by: userId
      }))
    });
  }

  if (hasOwnerPatch) await replaceStoredContactOwners(request, id, oldOwnerIds, nextOwnerIds, userId, { log: supportsContactOwners });
  const dto = contactToDto(updated, 0, hasOwnerPatch ? nextOwnerIds : oldOwnerIds);
  await notifyContactUpdated(request, dto, userId, {
    action: dbPatch.status === "archived" ? "archive" : "update",
    changedFields,
    hasOwnerPatch,
    oldOwnerIds,
    nextOwnerIds
  });
  return dto;
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  if (request.method === "OPTIONS") return jsonResponse(response, 204, {});
  if (await serveStaticAsset(request, response, url)) return;
  if (LOG_REQUESTS) console.log(`${request.method} ${url.pathname}${url.search}`);
  try {
    const profileAvatarMatch = /^\/api\/profile-avatar\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && profileAvatarMatch) {
      return readProfileAvatar(request, response, decodeURIComponent(profileAvatarMatch[1]));
    }
    await authorizeRequest(request, url);
    if (request.method === "GET" && ["/healthz", "/api/healthz"].includes(url.pathname)) {
      return jsonResponse(response, 200, { ok: true, backend: "postgres", authMode: API_AUTH_MODE });
    }
    if (request.method === "GET" && url.pathname === "/api/session") {
      return jsonResponse(response, 200, await getSession(request));
    }
    if (request.method === "GET" && url.pathname === "/api/ops/summary") {
      return jsonResponse(response, 200, await getOpsSummary());
    }
    if (request.method === "GET" && url.pathname === "/api/ops/checks") {
      return jsonResponse(response, 200, await getOpsChecks());
    }
    if (request.method === "GET" && url.pathname === "/api/export") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return jsonDownload(response, `versorgungs-kompass-cloud-sql-export-${stamp}.json`, await exportCloudSqlData());
    }
    if (request.method === "GET" && url.pathname === "/api/contacts") {
      return jsonResponse(response, 200, await listContacts(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/contacts") {
      return jsonResponse(response, 201, await createContact(request));
    }
    if (request.method === "GET" && url.pathname === "/api/organizations") {
      return jsonResponse(response, 200, await listOrganizations(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/organizations") {
      return jsonResponse(response, 201, await createOrganization(request));
    }
    if (request.method === "GET" && url.pathname === "/api/expert-groups") {
      return jsonResponse(response, 200, await listExpertGroups(request, url));
    }
    if (request.method === "GET" && url.pathname === "/api/expert-contacts") {
      return jsonResponse(response, 200, await listExpertContacts(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/expert-contacts") {
      return jsonResponse(response, 201, await createExpertContact(request));
    }
    const expertContactMatch = /^\/api\/expert-contacts\/([^/]+)$/.exec(url.pathname);
    if (request.method === "PATCH" && expertContactMatch) {
      return jsonResponse(response, 200, await patchExpertContact(request, decodeURIComponent(expertContactMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/expert-organizations") {
      return jsonResponse(response, 200, await listExpertOrganizations(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/expert-organizations") {
      return jsonResponse(response, 201, await createExpertOrganization(request));
    }
    if (request.method === "GET" && url.pathname === "/api/expert-entity-links") {
      return jsonResponse(response, 200, await listExpertEntityLinks(request));
    }
    if (request.method === "POST" && url.pathname === "/api/expert-entity-links") {
      return jsonResponse(response, 201, await createExpertEntityLink(request));
    }
    if (request.method === "GET" && url.pathname === "/api/stakeholder-types") {
      return jsonResponse(response, 200, await listStakeholderTypes(request, url));
    }
    if (request.method === "GET" && url.pathname === "/api/stakeholder-organizations") {
      return jsonResponse(response, 200, await listStakeholderOrganizations(request, url));
    }
    if (request.method === "GET" && url.pathname === "/api/stakeholder-people") {
      return jsonResponse(response, 200, await listStakeholderPeople(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/stakeholder-import") {
      return jsonResponse(response, 200, await upsertStakeholderImport(request));
    }
    if (request.method === "GET" && url.pathname === "/api/profiles") {
      return jsonResponse(response, 200, await listProfiles(request));
    }
    if (request.method === "GET" && url.pathname === "/api/profile") {
      return jsonResponse(response, 200, await getCurrentProfile(request));
    }
    if (request.method === "PATCH" && url.pathname === "/api/profile") {
      return jsonResponse(response, 200, await patchCurrentProfile(request));
    }
    if (request.method === "POST" && url.pathname === "/api/profile/avatar") {
      return jsonResponse(response, 200, await uploadCurrentProfileAvatar(request));
    }
    if (request.method === "DELETE" && url.pathname === "/api/profile/avatar") {
      return jsonResponse(response, 200, await removeCurrentProfileAvatar(request));
    }
    const organizationMatch = /^\/api\/organizations\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && organizationMatch) {
      return jsonResponse(response, 200, await getOrganization(request, decodeURIComponent(organizationMatch[1])));
    }
    if (request.method === "PATCH" && organizationMatch) {
      return jsonResponse(response, 200, await patchOrganization(request, decodeURIComponent(organizationMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/saved-views") {
      return jsonResponse(response, 200, await listSavedViews(request));
    }
    if (request.method === "POST" && url.pathname === "/api/saved-views") {
      return jsonResponse(response, 201, await createSavedView(request));
    }
    const savedViewMatch = /^\/api\/saved-views\/([^/]+)$/.exec(url.pathname);
    if (request.method === "PATCH" && savedViewMatch) {
      return jsonResponse(response, 200, await patchSavedView(request, decodeURIComponent(savedViewMatch[1])));
    }
    if (request.method === "DELETE" && savedViewMatch) {
      return jsonResponse(response, 200, await deleteSavedView(request, decodeURIComponent(savedViewMatch[1])));
    }
    const expertEntityLinkMatch = /^\/api\/expert-entity-links\/([^/]+)$/.exec(url.pathname);
    if (request.method === "DELETE" && expertEntityLinkMatch) {
      return jsonResponse(response, 200, await deleteExpertEntityLink(request, decodeURIComponent(expertEntityLinkMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/user-settings") {
      return jsonResponse(response, 200, await getUserSettings(request));
    }
    if (request.method === "PUT" && url.pathname === "/api/user-settings") {
      return jsonResponse(response, 200, await upsertUserSettings(request));
    }
    if (request.method === "GET" && url.pathname === "/api/hospitation-slots") {
      return jsonResponse(response, 200, await listHospitationSlots(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/hospitation-slots") {
      return jsonResponse(response, 201, await createHospitationSlot(request));
    }
    const hospitationSlotMatch = /^\/api\/hospitation-slots\/([^/]+)$/.exec(url.pathname);
    if (request.method === "PATCH" && hospitationSlotMatch) {
      return jsonResponse(response, 200, await patchHospitationSlot(request, decodeURIComponent(hospitationSlotMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/hospitations") {
      return jsonResponse(response, 200, await listHospitations(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/hospitations") {
      return jsonResponse(response, 201, await createHospitation(request));
    }
    const hospitationMatch = /^\/api\/hospitations\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && hospitationMatch) {
      return jsonResponse(response, 200, await getHospitation(request, decodeURIComponent(hospitationMatch[1])));
    }
    if (request.method === "PATCH" && hospitationMatch) {
      return jsonResponse(response, 200, await patchHospitation(request, decodeURIComponent(hospitationMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/formats") {
      return jsonResponse(response, 200, await listFormats(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/formats") {
      return jsonResponse(response, 201, await createFormat(request));
    }
    const formatParticipantMatch = /^\/api\/formats\/([^/]+)\/participants(?:\/([^/]+))?$/.exec(url.pathname);
    if (request.method === "POST" && formatParticipantMatch && !formatParticipantMatch[2]) {
      return jsonResponse(response, 200, await addFormatParticipant(request, decodeURIComponent(formatParticipantMatch[1])));
    }
    if (request.method === "PATCH" && formatParticipantMatch?.[2]) {
      return jsonResponse(response, 200, await patchFormatParticipant(
        request,
        decodeURIComponent(formatParticipantMatch[1]),
        decodeURIComponent(formatParticipantMatch[2])
      ));
    }
    if (request.method === "DELETE" && formatParticipantMatch?.[2]) {
      return jsonResponse(response, 200, await removeFormatParticipant(
        request,
        decodeURIComponent(formatParticipantMatch[1]),
        decodeURIComponent(formatParticipantMatch[2])
      ));
    }
    const formatMatch = /^\/api\/formats\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && formatMatch) {
      return jsonResponse(response, 200, await getFormat(request, decodeURIComponent(formatMatch[1])));
    }
    if (request.method === "PATCH" && formatMatch) {
      return jsonResponse(response, 200, await patchFormat(request, decodeURIComponent(formatMatch[1])));
    }
    if (request.method === "DELETE" && formatMatch) {
      return jsonResponse(response, 200, await deleteFormat(request, decodeURIComponent(formatMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/activities") {
      return jsonResponse(response, 200, await getActivities(request, url));
    }
    if (request.method === "GET" && url.pathname === "/api/notifications") {
      return jsonResponse(response, 200, await listNotifications(request, url));
    }
    if (request.method === "GET" && url.pathname === "/api/notifications/summary") {
      return jsonResponse(response, 200, await getNotificationSummary(request));
    }
    if (request.method === "PATCH" && url.pathname === "/api/notifications/read") {
      return jsonResponse(response, 200, await markNotificationsRead(request));
    }
    const notificationReadMatch = /^\/api\/notifications\/([^/]+)\/read$/.exec(url.pathname);
    if (request.method === "PATCH" && notificationReadMatch) {
      return jsonResponse(response, 200, await markNotificationRead(request, decodeURIComponent(notificationReadMatch[1])));
    }
    const historyMatch = /^\/api\/contacts\/([^/]+)\/history$/.exec(url.pathname);
    if (request.method === "GET" && historyMatch) {
      return jsonResponse(response, 200, await getContactHistory(request, decodeURIComponent(historyMatch[1]), url));
    }
    const contactMatch = /^\/api\/contacts\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && contactMatch) {
      return jsonResponse(response, 200, await getContact(request, decodeURIComponent(contactMatch[1])));
    }
    if (request.method === "PATCH" && contactMatch) {
      return jsonResponse(response, 200, await patchContact(request, decodeURIComponent(contactMatch[1])));
    }
    if (LOG_REQUESTS) console.log(`${request.method} ${url.pathname}${url.search} -> 404`);
    return jsonResponse(response, 404, { error: "Not found" });
  } catch (error) {
    const status = Number(error.status || 500);
    if (LOG_REQUESTS) {
      const detail = error.details ? ` details=${String(error.details).slice(0, 500)}` : "";
      console.warn(`${request.method} ${url.pathname}${url.search} -> ${status} ${error.message}${detail}`);
    }
    const payload = {
      error: status >= 500 ? "API-Anfrage fehlgeschlagen." : error.message
    };
    if (process.env.NODE_ENV !== "production" && error.details) payload.details = error.details;
    return jsonResponse(response, status, payload);
  }
}

http.createServer(handle).listen(PORT, () => {
  console.log(`Versorgungs-Kompass API listening on ${PORT}`);
});
