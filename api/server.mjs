import http from "node:http";

const CONTACT_FIELDS = [
  "id",
  "name",
  "organization_id",
  "organization",
  "sector",
  "specialty",
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
const SUPABASE_URL = withoutTrailingSlash(process.env.SUPABASE_URL || "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const LOG_REQUESTS = process.env.API_LOG_REQUESTS === "1";
const PROFILE_IMAGE_BUCKET = "profile-images";

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
let supportsContactOwners = true;

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

function publicStorageUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function formatToDb(format = {}) {
  return {
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
  return {
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    vary: "origin"
  };
}

function bearerToken(request) {
  const header = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || "";
}

function userIdFromToken(request) {
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

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const error = new Error("API ist nicht konfiguriert. SUPABASE_URL und SUPABASE_ANON_KEY fehlen.");
    error.status = 500;
    throw error;
  }
}

async function supabaseRest(path, request, searchParams = new URLSearchParams(), options = {}) {
  assertConfigured();
  const token = bearerToken(request);
  if (!token) {
    const error = new Error("Authorization Bearer Token fehlt.");
    error.status = 401;
    throw error;
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  searchParams.forEach((value, key) => url.searchParams.append(key, value));

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    authorization: `Bearer ${token}`,
    accept: "application/json",
    ...(options.headers || {})
  };
  if (options.body) headers["content-type"] = "application/json";

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Supabase Anfrage fehlgeschlagen (${response.status}).`);
    error.status = response.status;
    error.details = details;
    throw error;
  }
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
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
    return await supabaseRest("contact_owners", request, new URLSearchParams({
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
    return await supabaseRest("rpc/create_notification_event", request, new URLSearchParams(), {
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
    rows = await supabaseRest("contacts", request, new URLSearchParams({
      select: CONTACT_FIELDS.join(","),
      organization_id: `eq.${id}`,
      status: "neq.archived"
    })) || [];
  }
  if (!rows.length && name) {
    rows = await supabaseRest("contacts", request, new URLSearchParams({
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
  const rows = await supabaseRest("contacts", request, new URLSearchParams({
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
    await supabaseRest("contact_owners", request, new URLSearchParams({ contact_id: `eq.${contactId}` }), {
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
    await supabaseRest("contact_owners", request, new URLSearchParams(), {
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
    await supabaseRest("changes", request, new URLSearchParams(), {
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

async function supabaseStorage(path, request, options = {}) {
  assertConfigured();
  const token = bearerToken(request);
  if (!token) {
    const error = new Error("Authorization Bearer Token fehlt.");
    error.status = 401;
    throw error;
  }
  const url = new URL(`${SUPABASE_URL}/storage/v1/${path}`);
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body
  });
  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Supabase Storage Anfrage fehlgeschlagen (${response.status}).`);
    error.status = response.status;
    error.details = details;
    throw error;
  }
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function loadProfiles(request) {
  if (profileCache.expiresAt > Date.now()) return;
  const params = new URLSearchParams({
    select: PROFILE_FIELDS.join(","),
    active: "eq.true"
  });
  const rows = await supabaseRest("profiles", request, params);
  profileCache = {
    expiresAt: Date.now() + 60_000,
    byId: new Map((rows || []).map((profile) => [profile.id, profile]))
  };
}

async function listProfiles(request) {
  await loadProfiles(request);
  return { items: [...profileCache.byId.values()] };
}

async function getCurrentProfile(request) {
  await loadProfiles(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  return profileCache.byId.get(userId) || null;
}

async function patchCurrentProfile(request) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
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
  const rows = await supabaseRest("profiles", request, new URLSearchParams({
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
  return rows[0];
}

async function uploadCurrentProfileAvatar(request) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
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
  const path = `${userId}/avatar.${extension}`;
  await supabaseStorage(`object/${PROFILE_IMAGE_BUCKET}/${path}`, request, {
    method: "POST",
    headers: {
      "cache-control": "3600",
      "content-type": contentType,
      "x-upsert": "true"
    },
    body: buffer
  });
  return { publicUrl: publicStorageUrl(PROFILE_IMAGE_BUCKET, path), path };
}

async function removeCurrentProfileAvatar(request) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const paths = ["jpg", "jpeg", "png", "webp"].map((extension) => `${userId}/avatar.${extension}`);
  await supabaseStorage(`object/${PROFILE_IMAGE_BUCKET}`, request, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefixes: paths })
  });
  const rows = await supabaseRest("profiles", request, new URLSearchParams({
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
  return rows?.[0] || null;
}

async function listContacts(request, url) {
  await loadProfiles(request);
  const params = new URLSearchParams({
    select: CONTACT_FIELDS.join(","),
    order: "updated_at.desc.nullslast,name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  if (url.searchParams.get("status")) params.set("status", `eq.${url.searchParams.get("status")}`);
  const rows = await supabaseRest("contacts", request, params);
  return { items: await decorateRowsWithStoredOwners(request, rows || []) };
}

async function organizationContactCounts(request, ids = []) {
  if (!ids.length) return new Map();
  const params = new URLSearchParams({
    select: "organization_id",
    organization_id: `in.(${ids.join(",")})`,
    status: "neq.archived"
  });
  const rows = await supabaseRest("contacts", request, params);
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
  const rows = await supabaseRest("organizations", request, params);
  const counts = await organizationContactCounts(request, (rows || []).map((row) => row.id));
  return { items: (rows || []).map((row) => organizationToDto(row, counts.get(row.id) || 0)) };
}

async function listExpertGroups(request, url) {
  const params = new URLSearchParams({
    select: EXPERT_GROUP_FIELDS.join(","),
    order: "sort_order.asc,name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  const rows = await supabaseRest("expert_groups", request, params);
  return { items: (rows || []).map(expertGroupToDto) };
}

async function listExpertContacts(request, url) {
  const params = new URLSearchParams({
    select: EXPERT_CONTACT_FIELDS.join(","),
    order: "name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  if (url.searchParams.get("status")) params.set("status", `eq.${url.searchParams.get("status")}`);
  const rows = await supabaseRest("expert_contacts", request, params);
  return { items: (rows || []).map(expertContactToDto) };
}

async function createExpertContact(request) {
  const payload = expertContactCreateToDb(
    await readValidatedJsonBody(request, EXPERT_CONTACT_INPUT_FIELDS, "Expertenkreis-Kontakt")
  );
  const rows = await supabaseRest("expert_contacts", request, new URLSearchParams({
    select: EXPERT_CONTACT_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  return expertContactToDto(rows?.[0]);
}

async function expertOrganizationContactCounts(request, ids = []) {
  if (!ids.length) return new Map();
  const params = new URLSearchParams({
    select: "organization_id",
    organization_id: `in.(${ids.join(",")})`,
    status: "neq.archived"
  });
  const rows = await supabaseRest("expert_contacts", request, params);
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
  const rows = await supabaseRest("expert_organizations", request, params);
  const counts = await expertOrganizationContactCounts(request, (rows || []).map((row) => row.id));
  return { items: (rows || []).map((row) => expertOrganizationToDto(row, counts.get(row.id) || 0)) };
}

async function createExpertOrganization(request) {
  const payload = expertOrganizationCreateToDb(
    await readValidatedJsonBody(request, EXPERT_ORGANIZATION_INPUT_FIELDS, "Expertenkreis-Organisation")
  );
  const rows = await supabaseRest("expert_organizations", request, new URLSearchParams({
    select: EXPERT_ORGANIZATION_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  return expertOrganizationToDto(rows?.[0], 0);
}

async function listExpertEntityLinks(request) {
  const rows = await supabaseRest("expert_entity_links", request, new URLSearchParams({
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
  const rows = await supabaseRest("expert_entity_links", request, new URLSearchParams({
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
  const rows = await supabaseRest("stakeholder_types", request, params);
  return { items: (rows || []).map(stakeholderTypeToDto) };
}

async function stakeholderPeopleCounts(request, ids = []) {
  if (!ids.length) return new Map();
  const params = new URLSearchParams({
    select: "organization_id",
    organization_id: `in.(${ids.join(",")})`,
    status: "neq.archived"
  });
  const rows = await supabaseRest("stakeholder_people", request, params);
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
  const rows = await supabaseRest("stakeholder_organizations", request, params);
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
  const rows = await supabaseRest("stakeholder_people", request, params);
  return { items: (rows || []).map(stakeholderPersonToDto) };
}

async function upsertStakeholderImport(request) {
  const body = await readValidatedJsonBody(request, STAKEHOLDER_IMPORT_INPUT_FIELDS, "Stakeholder-Import");
  const types = (Array.isArray(body.types) ? body.types : []).map(stakeholderTypeToDb);
  const organizations = (Array.isArray(body.organizations) ? body.organizations : []).map(stakeholderOrganizationToDb).filter((row) => row.name);
  const people = (Array.isArray(body.people) ? body.people : []).map(stakeholderPersonToDb).filter((row) => row.name);

  if (types.length) {
    await supabaseRest("stakeholder_types", request, new URLSearchParams({ on_conflict: "id" }), {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: types
    });
  }
  if (organizations.length) {
    await supabaseRest("stakeholder_organizations", request, new URLSearchParams({ on_conflict: "id" }), {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: organizations
    });
  }
  if (people.length) {
    await supabaseRest("stakeholder_people", request, new URLSearchParams({ on_conflict: "id" }), {
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
  await supabaseRest("expert_entity_links", request, new URLSearchParams({ id: `eq.${id}` }), {
    method: "DELETE",
    headers: { prefer: "return=minimal" }
  });
  return { ok: true };
}

async function getOrganization(request, id) {
  const rows = await supabaseRest("organizations", request, new URLSearchParams({
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
  const rows = await supabaseRest("organizations", request, new URLSearchParams({
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
  const rows = await supabaseRest("organizations", request, new URLSearchParams({
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
  const rows = await supabaseRest("saved_views", request, new URLSearchParams({
    select: SAVED_VIEW_FIELDS.join(","),
    order: "is_default.desc,updated_at.desc"
  }));
  return { items: (rows || []).map(savedViewToDto) };
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
  if (!payload.name) {
    const error = new Error("Name fuer gespeicherte Suche fehlt.");
    error.status = 400;
    throw error;
  }
  const rows = await supabaseRest("saved_views", request, new URLSearchParams({
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
  const payload = savedViewPatchToDb(await readValidatedJsonBody(request, SAVED_VIEW_INPUT_FIELDS, "Gespeicherte Ansicht"));
  if (!Object.keys(payload).length) {
    const error = new Error("Keine unterstützten Felder fuer gespeicherte Suche im Request.");
    error.status = 400;
    throw error;
  }
  const rows = await supabaseRest("saved_views", request, new URLSearchParams({
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
  await supabaseRest("saved_views", request, new URLSearchParams({ id: `eq.${id}` }), {
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
  const rows = await supabaseRest("user_settings", request, new URLSearchParams({
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
  const rows = await supabaseRest("user_settings", request, new URLSearchParams({
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
  const rows = await supabaseRest("format_participants", request, new URLSearchParams({
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
  const rows = await supabaseRest("formats", request, new URLSearchParams({
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
  const rows = await supabaseRest("formats", request, new URLSearchParams({
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
  const rows = await supabaseRest("formats", request, new URLSearchParams({
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
  const rows = await supabaseRest("formats", request, new URLSearchParams({
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
  await supabaseRest("formats", request, new URLSearchParams({ id: `eq.${id}` }), {
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
  await supabaseRest("format_participants", request, new URLSearchParams({ on_conflict: "format_id,contact_id" }), {
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
  await supabaseRest("format_participants", request, new URLSearchParams({
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
  await supabaseRest("format_participants", request, new URLSearchParams({
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

  const rows = await supabaseRest("contacts", request, new URLSearchParams({
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

  await supabaseRest("changes", request, new URLSearchParams(), {
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
  const rows = await supabaseRest("contacts", request, params);
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
  const rows = await supabaseRest("changes", request, params);
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
  const rows = await supabaseRest("changes", request, params);
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
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const context = String(url.searchParams.get("context") || "all").trim();
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  try {
    const params = new URLSearchParams({
      select: NOTIFICATION_SELECT,
      dismissed_at: "is.null",
      order: "created_at.desc",
      limit: String(offset + limit + 100)
    });
    if (unreadOnly) params.set("read_at", "is.null");
    const rows = await supabaseRest("notification_recipients", request, params);
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
  try {
    await supabaseRest("notification_recipients", request, new URLSearchParams({
      event_id: `eq.${id}`,
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

  const oldRows = await supabaseRest("contacts", request, new URLSearchParams({
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

  const updatedRows = await supabaseRest("contacts", request, new URLSearchParams({
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
    await supabaseRest("changes", request, new URLSearchParams(), {
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
  if (request.method === "OPTIONS") return jsonResponse(response, 204, {});
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  if (LOG_REQUESTS) console.log(`${request.method} ${url.pathname}${url.search}`);
  try {
    if (request.method === "GET" && ["/healthz", "/api/healthz"].includes(url.pathname)) {
      return jsonResponse(response, 200, { ok: true });
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
