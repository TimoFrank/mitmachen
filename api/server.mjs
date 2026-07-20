import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { checkServerIdentity } from "node:tls";
import { Pool } from "pg";
import "../frontend/data/activity-model.js";
import { normalizedRequestLogPath } from "./request-log-privacy.mjs";
import {
  assertSensitiveQueryPermission,
  policyForRequest,
  roleRank,
  validateAllowedOriginConfiguration,
  validateIdentityConfiguration
} from "./security-policy.mjs";

const ActivityModel = globalThis.ActivityModel;

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
  "mitmachen_consent_status",
  "mitmachen_consent_effective_at",
  "mitmachen_consent_source",
  "mitmachen_consent_text_version",
  "mitmachen_consent_recorded_by",
  "mitmachen_consent_note",
  "topics",
  "notes",
  "source",
  "image_url",
  "image_source_url",
  "image_source_label",
  "image_rights_note",
  "image_updated_at",
  "image_updated_by",
  "image_storage_path",
  "image_kind",
  "image_mime_type",
  "image_file_size",
  "image_width",
  "image_height",
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
const ORGANIZATION_PRIMARY_SYSTEM_FIELDS = [
  "id",
  "organization_id",
  "system_type",
  "vendor_name",
  "product_name",
  "source_url",
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
const CHANGE_FIELDS = [
  "id",
  "contact_id",
  "action",
  "field_name",
  "old_value",
  "new_value",
  "changed_at",
  "changed_by",
  "activity_event_id",
  "canonicalized_at"
];
const ACTIVITY_EVENT_FIELDS = [
  "id",
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
  "legacy_id",
  "created_at"
];
const CONTACT_NOTE_FIELDS = [
  "id",
  "contact_id",
  "content_type",
  "body",
  "email_subject",
  "email_sender",
  "email_recipients",
  "email_occurred_at",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const CONTACT_NOTE_ATTACHMENT_FIELDS = [
  "id",
  "contact_id",
  "note_id",
  "file_name",
  "storage_path",
  "mime_type",
  "file_size",
  "description",
  "extraction_status",
  "extraction_error",
  "uploaded_at",
  "uploader_id"
];
const ACTIVITY_PAGE_SIZE = 500;
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
  "invited_at",
  "responded_at",
  "participated_at",
  "cancelled_at",
  "status_changed_at",
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
const HOSPITATION_OBSERVATION_FIELDS = [
  "id", "hospitation_id", "sequence", "title", "situation", "description",
  "process_phase", "problem_type", "impact", "observation_type", "evidence_type",
  "relevance_score", "usage_recommendation", "involved_roles", "affected_products",
  "topics", "payload", "status", "archived_at", "archived_by", "created_at",
  "created_by", "updated_at", "updated_by"
];
const ROADMAP_ITEM_FIELDS = [
  "id",
  "slug",
  "roadmap_version",
  "source_url",
  "product_area",
  "product_name",
  "feature_name",
  "phase",
  "roadmap_status",
  "timeline_label",
  "deadline_type",
  "legal_basis",
  "user_groups",
  "primary_systems",
  "description",
  "sort_order",
  "active",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const HOSPITATION_ROADMAP_ASSESSMENT_FIELDS = [
  "id",
  "hospitation_id",
  "roadmap_item_id",
  "respondent_role",
  "respondent_sector",
  "care_relevance",
  "patient_safety",
  "process_relief",
  "urgency",
  "implementation_feasibility",
  "adoption_likelihood",
  "confidence_score",
  "comparison_role",
  "evidence_note",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by"
];
const HOSPITATION_UNMET_NEED_FIELDS = [
  "id",
  "hospitation_id",
  "related_roadmap_item_id",
  "title",
  "problem",
  "affected_role",
  "affected_sector",
  "classification",
  "expected_benefit",
  "urgency",
  "implementation_feasibility",
  "confidence_score",
  "current_workaround",
  "next_step",
  "status",
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
  "sector",
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
const ALLOWED_ORIGIN = validateAllowedOriginConfiguration(process.env);
const LOG_REQUESTS = process.env.API_LOG_REQUESTS === "1";
const PROFILE_IMAGE_BUCKET = process.env.PROFILE_IMAGE_BUCKET || "";
const CONTACT_IMAGE_BUCKET = process.env.CONTACT_IMAGE_BUCKET || "";
const CONTACT_NOTE_ATTACHMENT_BUCKET = process.env.CONTACT_NOTE_ATTACHMENT_BUCKET || "";
const STAKEHOLDER_LOGO_BUCKET = process.env.STAKEHOLDER_LOGO_BUCKET || "";
const ATTACHMENT_UPLOAD_MODE = String(
  process.env.ATTACHMENT_UPLOAD_MODE || (process.env.NODE_ENV === "production" ? "disabled" : "text-only")
).toLowerCase();
if (!["disabled", "text-only"].includes(ATTACHMENT_UPLOAD_MODE)) {
  throw new Error("ATTACHMENT_UPLOAD_MODE erlaubt derzeit nur disabled oder text-only. Dokumente benoetigen zuerst eine externe Scan-/Quarantaene-Abnahme.");
}
const IMAGE_UPLOAD_MODE = String(
  process.env.IMAGE_UPLOAD_MODE || (process.env.NODE_ENV === "production" ? "disabled" : "validated-original")
).toLowerCase();
if (!["disabled", "validated-original"].includes(IMAGE_UPLOAD_MODE) || (process.env.NODE_ENV === "production" && IMAGE_UPLOAD_MODE !== "disabled")) {
  throw new Error("Bild-Uploads muessen in Produktion deaktiviert bleiben, bis Re-Encoding, Metadatenentfernung und Quarantaene abgenommen sind.");
}
const IDENTITY_CONFIGURATION = validateIdentityConfiguration(process.env);
const API_AUTH_MODE = IDENTITY_CONFIGURATION.mode;
const API_AUTH_ALLOW_DEV_PROFILE = process.env.API_AUTH_ALLOW_DEV_PROFILE === "1";
const API_AUTH_ALLOW_BEARER_DEV = process.env.API_AUTH_ALLOW_BEARER_DEV === "1";
const API_DEV_PROFILE_ID = process.env.API_DEV_PROFILE_ID || process.env.GCP_DEMO_PROFILE_ID || "";
const IAP_JWT_AUDIENCE = process.env.IAP_JWT_AUDIENCE || "";
const OIDC_ISSUER = String(process.env.OIDC_ISSUER || "").trim();
const OIDC_AUDIENCE = process.env.OIDC_AUDIENCE || "";
const OIDC_JWKS_URL = process.env.OIDC_JWKS_URL || "";
const OIDC_EMAIL_CLAIM = process.env.OIDC_EMAIL_CLAIM || "email";
const OIDC_SUBJECT_CLAIM = process.env.OIDC_SUBJECT_CLAIM || "sub";
const AUTH_EMAIL_HEADER = String(process.env.AUTH_EMAIL_HEADER || "x-auth-request-email").toLowerCase();
const AUTH_SUBJECT_HEADER = String(process.env.AUTH_SUBJECT_HEADER || "x-auth-request-user").toLowerCase();
const OUTBOUND_FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.OUTBOUND_FETCH_TIMEOUT_MS || 5000));
const REQUEST_BODY_LIMIT_BYTES = Math.max(64 * 1024, Number(process.env.REQUEST_BODY_LIMIT_BYTES || 2 * 1024 * 1024));
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_READS = Math.max(10, Number(process.env.RATE_LIMIT_READS_PER_MINUTE || 240));
const RATE_LIMIT_WRITES = Math.max(5, Number(process.env.RATE_LIMIT_WRITES_PER_MINUTE || 60));
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
  "mitmachenConsentStatus",
  "mitmachen_consent_status",
  "mitmachenConsentEffectiveAt",
  "mitmachen_consent_effective_at",
  "mitmachenConsentSource",
  "mitmachen_consent_source",
  "mitmachenConsentTextVersion",
  "mitmachen_consent_text_version",
  "mitmachenConsentRecordedBy",
  "mitmachen_consent_recorded_by",
  "mitmachenConsentNote",
  "mitmachen_consent_note",
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
  "imageStoragePath",
  "image_storage_path",
  "imageKind",
  "image_kind",
  "imageMimeType",
  "image_mime_type",
  "imageFileSize",
  "image_file_size",
  "imageWidth",
  "image_width",
  "imageHeight",
  "image_height",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "status"
];
const CONTACT_IMAGE_UPLOAD_FIELDS = ["fileName", "contentType", "data", "width", "height", "sourceLabel", "rightsNote"];
const CONTACT_NOTE_INPUT_FIELDS = [
  "contactId",
  "contact_id",
  "contentType",
  "content_type",
  "body",
  "text",
  "emailSubject",
  "email_subject",
  "emailSender",
  "email_sender",
  "emailRecipients",
  "email_recipients",
  "emailOccurredAt",
  "email_occurred_at"
];
const CONTACT_NOTE_ATTACHMENT_UPLOAD_FIELDS = [
  "contactId",
  "noteId",
  "fileName",
  "mimeType",
  "fileSize",
  "description",
  "extractionStatus",
  "extractedText",
  "extractionError",
  "data"
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
const ORGANIZATION_PRIMARY_SYSTEM_INPUT_FIELDS = [
  "id",
  "organizationId",
  "organization_id",
  "systemType",
  "system_type",
  "vendorName",
  "vendor_name",
  "productName",
  "product_name",
  "sourceUrl",
  "source_url"
];
const PROFILE_PATCH_FIELDS = ["displayName", "display_name", "initials", "team", "bio"];
const PROFILE_AVATAR_UPLOAD_FIELDS = ["fileName", "contentType", "data"];
const PROFILE_AVATAR_CONTENT_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
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
const HOSPITATION_OBSERVATION_INPUT_FIELDS = [
  "title", "situation", "description", "observed", "processPhase", "process_phase",
  "problemType", "problem_type", "impact", "observationType", "observation_type",
  "evidenceType", "evidence_type", "relevanceScore", "relevance_score",
  "usageRecommendation", "usage_recommendation", "nextUse", "involvedRoles",
  "involved_roles", "affectedProducts", "affected_products", "topics", "themes",
  "status", "archivedAt", "archived_at", "archivedBy", "archived_by",
  "archiveReason", "expectedUpdatedAt"
];
const HOSPITATION_ROADMAP_ASSESSMENT_INPUT_FIELDS = [
  "id",
  "hospitationId",
  "hospitation_id",
  "roadmapItemId",
  "roadmap_item_id",
  "respondentRole",
  "respondent_role",
  "respondentSector",
  "respondent_sector",
  "careRelevance",
  "care_relevance",
  "patientSafety",
  "patient_safety",
  "processRelief",
  "process_relief",
  "urgency",
  "implementationFeasibility",
  "implementation_feasibility",
  "adoptionLikelihood",
  "adoption_likelihood",
  "confidenceScore",
  "confidence_score",
  "comparisonRole",
  "comparison_role",
  "evidenceNote",
  "evidence_note"
];
const HOSPITATION_UNMET_NEED_INPUT_FIELDS = [
  "id",
  "hospitationId",
  "hospitation_id",
  "relatedRoadmapItemId",
  "related_roadmap_item_id",
  "title",
  "problem",
  "affectedRole",
  "affected_role",
  "affectedSector",
  "affected_sector",
  "classification",
  "expectedBenefit",
  "expected_benefit",
  "urgency",
  "implementationFeasibility",
  "implementation_feasibility",
  "confidenceScore",
  "confidence_score",
  "currentWorkaround",
  "current_workaround",
  "nextStep",
  "next_step",
  "status"
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
let oidcKeyCache = { expiresAt: 0, keys: new Map() };
let supportsContactOwners = true;
let pool = null;
const requestRateBuckets = new Map();

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
    mitmachenConsentStatus: row.mitmachen_consent_status || "not_requested",
    mitmachenConsentEffectiveAt: row.mitmachen_consent_effective_at || "",
    mitmachenConsentSource: row.mitmachen_consent_source || "",
    mitmachenConsentTextVersion: row.mitmachen_consent_text_version || "",
    mitmachenConsentRecordedBy: row.mitmachen_consent_recorded_by || "",
    mitmachenConsentNote: row.mitmachen_consent_note || "",
    themes: topics,
    note: row.notes || "",
    sources: splitList(row.source),
    image: row.image_storage_path ? `/api/contact-images/${encodeURIComponent(row.id)}` : row.image_url || "",
    imageSourceUrl: row.image_source_url || "",
    imageSourceLabel: row.image_source_label || "",
    imageRightsNote: row.image_rights_note || "",
    imageUpdatedAt: row.image_updated_at || "",
    imageUpdatedBy: row.image_updated_by || "",
    imageStoragePath: row.image_storage_path || "",
    imageKind: row.image_kind || (row.image_url ? "external" : ""),
    imageMimeType: row.image_mime_type || "",
    imageFileSize: Number(row.image_file_size) || 0,
    imageWidth: Number(row.image_width) || 0,
    imageHeight: Number(row.image_height) || 0,
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

function organizationPrimarySystemToDto(row = {}) {
  return {
    id: row.id || "",
    organizationId: row.organization_id || "",
    systemType: row.system_type || "SONSTIGES",
    vendorName: row.vendor_name || "",
    productName: row.product_name || "",
    sourceUrl: row.source_url || "",
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

function stakeholderLogoUrl(row = {}) {
  const value = String(row.logo_url || "").trim();
  return stakeholderLogoObjectName(value)
    ? `/api/stakeholder-logos/${encodeURIComponent(row.id || "")}`
    : "";
}

function stakeholderOrganizationToDto(row, personCount = 0) {
  return {
    id: row.id || "",
    stakeholderTypeId: row.stakeholder_type_id || "",
    stakeholderType: row.stakeholder_type_id || "",
    name: row.name || "",
    normalizedName: row.normalized_name || normalizeOrganizationName(row.name),
    organizationType: row.organization_type || "",
    sector: row.sector || "",
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
    logoUrl: stakeholderLogoUrl(row),
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

function contactNoteToDto(row = {}) {
  return {
    id: row.id || "",
    contactId: row.contact_id || "",
    contentType: row.content_type || "free_note",
    text: row.body || "",
    body: row.body || "",
    emailSubject: row.email_subject || "",
    emailSender: row.email_sender || "",
    emailRecipients: splitList(row.email_recipients),
    emailOccurredAt: row.email_occurred_at || "",
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || ""
  };
}

function contactNoteAttachmentToDto(row = {}) {
  return {
    id: row.id || "",
    contactId: row.contact_id || "",
    noteId: row.note_id || "",
    fileName: row.file_name || "Datei",
    storagePath: row.storage_path || "",
    mimeType: row.mime_type || "application/octet-stream",
    fileSize: Number(row.file_size) || 0,
    description: row.description || "",
    extractionStatus: row.extraction_status || "pending",
    extractionError: row.extraction_error || "",
    uploadedAt: row.uploaded_at || "",
    uploaderId: row.uploader_id || ""
  };
}

function contentSearchResultToDto(row = {}) {
  return {
    contactId: row.contact_id || "",
    noteId: row.note_id || "",
    attachmentId: row.attachment_id || "",
    resultKind: row.result_kind || "note",
    title: row.title || "Treffer",
    snippet: row.snippet || "",
    occurredAt: row.occurred_at || "",
    rank: Number(row.rank) || 0
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
    invitedAt: row.invited_at || "",
    respondedAt: row.responded_at || "",
    participatedAt: row.participated_at || "",
    cancelledAt: row.cancelled_at || "",
    statusChangedAt: row.status_changed_at || "",
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
    contact: changeContactSummary(row),
    activityEventId: row.activity_event_id || "",
    canonicalizedAt: row.canonicalized_at || ""
  };
  return { ...change, kind: changeKind(change) };
}

function isMissingActivityEventsError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error?.details || error?.hint || "");
  return ["42P01", "PGRST205"].includes(code) || /activity_events.*(?:does not exist|schema cache|could not find)|relation .*activity_events.* does not exist/i.test(message);
}

function decorateActivityDto(activity = {}, row = {}) {
  const actorId = activity.actorId || activity.actor?.id || activity.changedBy || row.actor_id || row.changed_by || "";
  const actor = profileSummary(actorId) || activity.actor || activity.user || { id: actorId, displayName: actorId ? "Unbekannter Nutzer" : "System" };
  const contactId = activity.contactId || row.contact_id || "";
  const contact = changeContactSummary(row) || activity.contact || (contactId ? { id: contactId, name: "" } : null);
  const occurredAt = activity.occurredAt || activity.changedAt || row.occurred_at || row.changed_at || "";
  return {
    ...activity,
    actor,
    actorId,
    user: actor,
    changedBy: actorId,
    contactId,
    contact,
    occurredAt,
    changedAt: occurredAt,
    correlationId: activity.correlationId || row.correlation_id || ""
  };
}

function activityEventToDto(row = {}) {
  const actor = profileSummary(row.actor_id);
  const contact = changeContactSummary(row);
  return decorateActivityDto(ActivityModel.fromDatabaseRow({
    ...row,
    ...(actor ? { actor } : {}),
    ...(contact ? { contact } : {})
  }), row);
}

function legacyChangeToActivity(row = {}) {
  const change = changeToDto(row);
  return decorateActivityDto(ActivityModel.normalizeLegacyChange(change), {
    ...row,
    contact: change.contact
  });
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

function hospitationObservationToDto(row = {}) {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  return {
    ...payload,
    id: row.id || payload.id || "",
    hospitationId: row.hospitation_id || payload.hospitationId || "",
    sequence: row.sequence ?? payload.sequence ?? null,
    title: row.title || payload.title || "Beobachtung",
    situation: row.situation ?? payload.situation ?? "",
    description: row.description ?? payload.description ?? payload.observed ?? "",
    processPhase: row.process_phase ?? payload.processPhase ?? "",
    problemType: row.problem_type ?? payload.problemType ?? "",
    impact: row.impact ?? payload.impact ?? "",
    observationType: row.observation_type ?? payload.observationType ?? "",
    evidenceType: row.evidence_type || payload.evidenceType || "interpreted",
    relevanceScore: Number(row.relevance_score ?? payload.relevanceScore ?? 0) || null,
    usageRecommendation: row.usage_recommendation ?? payload.usageRecommendation ?? payload.nextUse ?? "",
    involvedRoles: Array.isArray(row.involved_roles) ? row.involved_roles : payload.involvedRoles || [],
    affectedProducts: Array.isArray(row.affected_products) ? row.affected_products : payload.affectedProducts || [],
    topics: Array.isArray(row.topics) ? row.topics : payload.topics || [],
    status: row.status || "active",
    archivedAt: row.archived_at || "",
    archivedBy: row.archived_by || "",
    createdAt: row.created_at || payload.createdAt || "",
    createdBy: row.created_by || payload.createdBy || "",
    updatedAt: row.updated_at || payload.updatedAt || "",
    updatedBy: row.updated_by || payload.updatedBy || ""
  };
}

function hospitationObservationToDb(observation = {}, hospitationId = "") {
  const payload = { ...observation };
  delete payload.expectedUpdatedAt;
  const relevance = Number(observation.relevanceScore ?? observation.relevance_score ?? 0) || null;
  return {
    id: String(observation.id || generatedId("observation")).trim(),
    hospitation_id: String(hospitationId || observation.hospitationId || observation.hospitation_id || "").trim(),
    sequence: Number(observation.sequence) || null,
    title: String(observation.title || "Beobachtung").trim() || "Beobachtung",
    situation: String(observation.situation || observation.situationContext || "").trim() || null,
    description: String(observation.description || observation.observed || "").trim() || null,
    process_phase: String(observation.processPhase || observation.process_phase || "").trim() || null,
    problem_type: String(observation.problemType || observation.problem_type || "").trim() || null,
    impact: String(observation.impact || "").trim() || null,
    observation_type: String(observation.observationType || observation.observation_type || "").trim() || null,
    evidence_type: ["directly_observed", "reported", "interpreted"].includes(observation.evidenceType || observation.evidence_type) ? observation.evidenceType || observation.evidence_type : "interpreted",
    relevance_score: relevance,
    usage_recommendation: String(observation.usageRecommendation || observation.usage_recommendation || observation.nextUse || "").trim() || null,
    involved_roles: splitList(observation.involvedRoles || observation.involved_roles),
    affected_products: splitList(observation.affectedProducts || observation.affected_products),
    topics: splitList(observation.topics || observation.themes),
    payload,
    status: observation.status === "archived" ? "archived" : "active",
    archived_at: observation.archivedAt || observation.archived_at || null,
    archived_by: observation.archivedBy || observation.archived_by || null
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

function ratingValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 5) return null;
  return Math.round(number);
}

function normalizeComparisonRole(value) {
  const label = String(value || "").trim();
  if (["top_priority", "low_priority"].includes(label)) return label;
  return "none";
}

function normalizeUnmetNeedClassification(value) {
  const label = String(value || "").trim();
  if (["existing_item_extension", "new_backlog_item", "legal_clarification", "organizational_implementation", "local_system_issue", "communication_or_training"].includes(label)) return label;
  return "new_backlog_item";
}

function normalizeUnmetNeedStatus(value) {
  const label = String(value || "").trim();
  if (["Neu", "In Prüfung", "Übernommen", "Zurückgestellt", "Erledigt", "Archiviert"].includes(label)) return label;
  return "Neu";
}

function roadmapItemToDto(row = {}) {
  return {
    id: row.id || "",
    slug: row.slug || "",
    roadmapVersion: row.roadmap_version || "",
    sourceUrl: row.source_url || "",
    productArea: row.product_area || "",
    productName: row.product_name || "",
    featureName: row.feature_name || "",
    phase: row.phase || "",
    roadmapStatus: row.roadmap_status || "Unklar",
    timelineLabel: row.timeline_label || "",
    deadlineType: row.deadline_type || "Unklar",
    legalBasis: row.legal_basis || "",
    userGroups: Array.isArray(row.user_groups) ? row.user_groups : [],
    primarySystems: Array.isArray(row.primary_systems) ? row.primary_systems : [],
    description: row.description || "",
    sortOrder: Number(row.sort_order || 100),
    active: row.active !== false,
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || ""
  };
}

function hospitationRoadmapAssessmentToDto(row = {}) {
  return {
    id: row.id || "",
    hospitationId: row.hospitation_id || "",
    roadmapItemId: row.roadmap_item_id || "",
    respondentRole: row.respondent_role || "",
    respondentSector: row.respondent_sector || "",
    careRelevance: ratingValue(row.care_relevance),
    patientSafety: ratingValue(row.patient_safety),
    processRelief: ratingValue(row.process_relief),
    urgency: ratingValue(row.urgency),
    implementationFeasibility: ratingValue(row.implementation_feasibility),
    adoptionLikelihood: ratingValue(row.adoption_likelihood),
    confidenceScore: ratingValue(row.confidence_score),
    comparisonRole: normalizeComparisonRole(row.comparison_role),
    evidenceNote: row.evidence_note || "",
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || ""
  };
}

function hospitationRoadmapAssessmentToDb(assessment = {}, hospitationId = "") {
  return {
    hospitation_id: hospitationId || assessment.hospitationId || assessment.hospitation_id || null,
    roadmap_item_id: assessment.roadmapItemId || assessment.roadmap_item_id || null,
    respondent_role: String(assessment.respondentRole || assessment.respondent_role || "").trim() || null,
    respondent_sector: String(assessment.respondentSector || assessment.respondent_sector || "").trim() || null,
    care_relevance: ratingValue(assessment.careRelevance ?? assessment.care_relevance),
    patient_safety: ratingValue(assessment.patientSafety ?? assessment.patient_safety),
    process_relief: ratingValue(assessment.processRelief ?? assessment.process_relief),
    urgency: ratingValue(assessment.urgency),
    implementation_feasibility: ratingValue(assessment.implementationFeasibility ?? assessment.implementation_feasibility),
    adoption_likelihood: ratingValue(assessment.adoptionLikelihood ?? assessment.adoption_likelihood),
    confidence_score: ratingValue(assessment.confidenceScore ?? assessment.confidence_score),
    comparison_role: normalizeComparisonRole(assessment.comparisonRole || assessment.comparison_role),
    evidence_note: String(assessment.evidenceNote || assessment.evidence_note || "").trim() || null
  };
}

function hospitationUnmetNeedToDto(row = {}) {
  return {
    id: row.id || "",
    hospitationId: row.hospitation_id || "",
    relatedRoadmapItemId: row.related_roadmap_item_id || "",
    title: row.title || "",
    problem: row.problem || "",
    affectedRole: row.affected_role || "",
    affectedSector: row.affected_sector || "",
    classification: normalizeUnmetNeedClassification(row.classification),
    expectedBenefit: ratingValue(row.expected_benefit),
    urgency: ratingValue(row.urgency),
    implementationFeasibility: ratingValue(row.implementation_feasibility),
    confidenceScore: ratingValue(row.confidence_score),
    currentWorkaround: row.current_workaround || "",
    nextStep: row.next_step || "",
    status: normalizeUnmetNeedStatus(row.status),
    createdAt: row.created_at || "",
    createdBy: row.created_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || ""
  };
}

function hospitationUnmetNeedToDb(need = {}, hospitationId = "") {
  return {
    hospitation_id: hospitationId || need.hospitationId || need.hospitation_id || null,
    related_roadmap_item_id: need.relatedRoadmapItemId || need.related_roadmap_item_id || null,
    title: String(need.title || "").trim(),
    problem: String(need.problem || "").trim() || null,
    affected_role: String(need.affectedRole || need.affected_role || "").trim() || null,
    affected_sector: String(need.affectedSector || need.affected_sector || "").trim() || null,
    classification: normalizeUnmetNeedClassification(need.classification),
    expected_benefit: ratingValue(need.expectedBenefit ?? need.expected_benefit),
    urgency: ratingValue(need.urgency),
    implementation_feasibility: ratingValue(need.implementationFeasibility ?? need.implementation_feasibility),
    confidence_score: ratingValue(need.confidenceScore ?? need.confidence_score),
    current_workaround: String(need.currentWorkaround || need.current_workaround || "").trim() || null,
    next_step: String(need.nextStep || need.next_step || "").trim() || null,
    status: normalizeUnmetNeedStatus(need.status)
  };
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

function organizationPrimarySystemToDb(system = {}, { includeOrganization = true } = {}) {
  const systemType = String(system.systemType || system.system_type || "").trim().toUpperCase();
  const allowedTypes = new Set(["PVS", "KIS", "AVS", "ZPVS", "LIS", "HVS", "PFLEGE", "SONSTIGES"]);
  if (!allowedTypes.has(systemType)) throw validationError("Unbekannter Primärsystem-Typ.");
  const db = {
    system_type: systemType,
    vendor_name: String(system.vendorName || system.vendor_name || "").trim() || null,
    product_name: String(system.productName || system.product_name || "").trim() || null,
    source_url: String(system.sourceUrl || system.source_url || "").trim() || null
  };
  if (includeOrganization) {
    db.organization_id = String(system.organizationId || system.organization_id || "").trim();
    if (!db.organization_id) throw validationError("Organisation für Primärsystem fehlt.");
  }
  return db;
}

const MITMACHEN_CONSENT_STATUSES = new Set(["granted", "not_requested", "declined", "withdrawn", "clarification_needed"]);
const MITMACHEN_CONSENT_SOURCES = new Set(["online_form", "email", "written", "verbal_confirmed", "manual_transfer"]);

function normalizeMitmachenConsentStatus(value) {
  const normalized = String(value || "not_requested").trim();
  if (!MITMACHEN_CONSENT_STATUSES.has(normalized)) throw validationError("Unbekannter #Mitmachen-Einwilligungsstatus.");
  return normalized;
}

function normalizeMitmachenConsentSource(value) {
  const normalized = String(value || "").trim();
  if (normalized && !MITMACHEN_CONSENT_SOURCES.has(normalized)) throw validationError("Unbekannte Quelle der #Mitmachen-Einwilligung.");
  return normalized || null;
}

function validateMitmachenConsent(values = {}) {
  const status = normalizeMitmachenConsentStatus(values.mitmachen_consent_status);
  const source = normalizeMitmachenConsentSource(values.mitmachen_consent_source);
  const effectiveAt = values.mitmachen_consent_effective_at || null;
  const recordedBy = values.mitmachen_consent_recorded_by || null;
  const note = String(values.mitmachen_consent_note || "").trim();
  const effectiveTime = new Date(effectiveAt || "").getTime();
  const hasValidEffectiveTime = Boolean(effectiveAt) && Number.isFinite(effectiveTime);
  if (status === "granted" && (!effectiveAt || !source || !recordedBy)) {
    throw validationError("Für eine erteilte #Mitmachen-Einwilligung sind Zeitpunkt, Quelle und erfassende Person erforderlich.");
  }
  if (status === "granted" && !hasValidEffectiveTime) {
    throw validationError("Für eine erteilte #Mitmachen-Einwilligung ist ein gültiger Wirksamkeitszeitpunkt erforderlich.");
  }
  if (["granted", "declined", "withdrawn"].includes(status) && hasValidEffectiveTime && effectiveTime > Date.now()) {
    throw validationError("Der Wirksamkeitszeitpunkt einer #Mitmachen-Einwilligung darf nicht in der Zukunft liegen.");
  }
  if (["declined", "withdrawn"].includes(status) && !hasValidEffectiveTime) {
    throw validationError("Für Ablehnung oder Widerruf ist ein gültiger Zeitpunkt erforderlich.");
  }
  if (["verbal_confirmed", "manual_transfer"].includes(source) && !note) {
    throw validationError("Eine mündlich bestätigte oder manuell übertragene Einwilligung benötigt einen Nachweisvermerk.");
  }
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
  if ("mitmachenConsentStatus" in patch || "mitmachen_consent_status" in patch) {
    db.mitmachen_consent_status = normalizeMitmachenConsentStatus(patch.mitmachenConsentStatus || patch.mitmachen_consent_status);
  }
  if ("mitmachenConsentEffectiveAt" in patch || "mitmachen_consent_effective_at" in patch) {
    db.mitmachen_consent_effective_at = patch.mitmachenConsentEffectiveAt || patch.mitmachen_consent_effective_at || null;
  }
  if ("mitmachenConsentSource" in patch || "mitmachen_consent_source" in patch) {
    db.mitmachen_consent_source = normalizeMitmachenConsentSource(patch.mitmachenConsentSource || patch.mitmachen_consent_source);
  }
  if ("mitmachenConsentTextVersion" in patch || "mitmachen_consent_text_version" in patch) {
    db.mitmachen_consent_text_version = String(patch.mitmachenConsentTextVersion || patch.mitmachen_consent_text_version || "").trim() || null;
  }
  if ("mitmachenConsentRecordedBy" in patch || "mitmachen_consent_recorded_by" in patch) {
    db.mitmachen_consent_recorded_by = patch.mitmachenConsentRecordedBy || patch.mitmachen_consent_recorded_by || null;
  }
  if ("mitmachenConsentNote" in patch || "mitmachen_consent_note" in patch) {
    db.mitmachen_consent_note = String(patch.mitmachenConsentNote || patch.mitmachen_consent_note || "").trim() || null;
  }
  if ("themes" in patch || "topics" in patch) db.topics = splitList(patch.themes || patch.topics);
  if ("note" in patch || "notes" in patch) db.notes = String(patch.note || patch.notes || "").trim() || null;
  if ("sources" in patch || "source" in patch) db.source = splitList(patch.sources || patch.source).join("; ") || null;
  if ("image" in patch || "image_url" in patch) {
    const imageUrl = String(patch.image || patch.image_url || "").trim();
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw validationError("Kontaktbilder per Link müssen HTTPS verwenden.");
    db.image_url = imageUrl || null;
  }
  if ("imageSourceUrl" in patch || "image_source_url" in patch) db.image_source_url = patch.imageSourceUrl || patch.image_source_url || null;
  if ("imageSourceLabel" in patch || "image_source_label" in patch) db.image_source_label = patch.imageSourceLabel || patch.image_source_label || null;
  if ("imageRightsNote" in patch || "image_rights_note" in patch) db.image_rights_note = patch.imageRightsNote || patch.image_rights_note || null;
  if ("imageUpdatedAt" in patch || "image_updated_at" in patch) db.image_updated_at = patch.imageUpdatedAt || patch.image_updated_at || null;
  if ("imageUpdatedBy" in patch || "image_updated_by" in patch) db.image_updated_by = patch.imageUpdatedBy || patch.image_updated_by || null;
  if ("imageStoragePath" in patch || "image_storage_path" in patch) db.image_storage_path = patch.imageStoragePath || patch.image_storage_path || null;
  if ("imageKind" in patch || "image_kind" in patch) {
    const imageKind = patch.imageKind || patch.image_kind || null;
    if (imageKind && !["upload", "external"].includes(imageKind)) throw validationError("Unbekannte Kontaktbild-Quelle.");
    db.image_kind = imageKind;
  }
  if ("imageMimeType" in patch || "image_mime_type" in patch) db.image_mime_type = patch.imageMimeType || patch.image_mime_type || null;
  if ("imageFileSize" in patch || "image_file_size" in patch) db.image_file_size = Number(patch.imageFileSize || patch.image_file_size) || null;
  if ("imageWidth" in patch || "image_width" in patch) db.image_width = Number(patch.imageWidth || patch.image_width) || null;
  if ("imageHeight" in patch || "image_height" in patch) db.image_height = Number(patch.imageHeight || patch.image_height) || null;
  if ("status" in patch) db.status = patch.status || "active";
  return db;
}

function contactCreateToDb(contact = {}) {
  const db = contactPatchToDb(contact);
  db.id = `contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  db.name = String(contact.name || "").trim();
  db.status = contact.status || "active";
  db.priority = normalizePriority(contact.priority);
  db.mitmachen_consent_status = normalizeMitmachenConsentStatus(db.mitmachen_consent_status);
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
  const logoUrl = String(organization.logoUrl || organization.logo_url || "").trim();
  if (logoUrl && !stakeholderLogoObjectName(logoUrl)) {
    const error = new Error("Stakeholder-Logos müssen aus dem geschützten Logo-Speicher stammen.");
    error.status = 400;
    throw error;
  }
  return {
    id: String(organization.id || generatedId("stakeholder-org")).trim(),
    stakeholder_type_id: String(organization.stakeholderTypeId || organization.stakeholder_type_id || organization.stakeholderType || "kv").trim() || "kv",
    name,
    normalized_name: normalizeOrganizationName(organization.normalizedName || organization.normalized_name || name),
    organization_type: String(organization.organizationType || organization.organization_type || "").trim() || null,
    sector: String(organization.sector || organization.indication || organization.category || "").trim() || null,
    postal_code: String(organization.postalCode || organization.postal_code || "").trim() || null,
    city: String(organization.city || "").trim() || null,
    federal_state: String(organization.state || organization.federal_state || "").trim() || null,
    latitude: Number.isFinite(Number(organization.lat ?? organization.latitude)) ? Number(organization.lat ?? organization.latitude) : null,
    longitude: Number.isFinite(Number(organization.lon ?? organization.longitude)) ? Number(organization.lon ?? organization.longitude) : null,
    website: String(organization.website || organization.url || "").trim() || null,
    phone: String(organization.phone || "").trim() || null,
    email: String(organization.email || "").trim() || null,
    logo_url: logoUrl || null,
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

function securityResponseHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-resource-policy": "same-site",
    ...(process.env.NODE_ENV === "production" ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {})
  };
}

function jsonResponse(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...securityResponseHeaders(),
    ...corsHeaders(),
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function redirectResponse(response, location) {
  response.writeHead(302, {
    location,
    "cache-control": "no-store",
    ...securityResponseHeaders(),
    ...corsHeaders()
  });
  response.end();
}

function validatedIapBootstrapReturnUrl(url) {
  if (!ALLOWED_ORIGIN) {
    const error = new Error("ALLOWED_ORIGIN fehlt fuer den IAP-Login-Ruecksprung.");
    error.status = 500;
    throw error;
  }
  let allowedOrigin;
  let returnUrl;
  try {
    allowedOrigin = new URL(ALLOWED_ORIGIN).origin;
    returnUrl = new URL(String(url.searchParams.get("return") || ""));
  } catch {
    throw validationError("IAP-Login-Ruecksprung ist keine gueltige URL.");
  }
  if (returnUrl.protocol !== "https:" || returnUrl.origin !== allowedOrigin) {
    throw validationError("IAP-Login-Ruecksprung muss zur erlaubten HTTPS-Frontend-Origin gehoeren.");
  }
  return returnUrl.href;
}

function corsHeaders() {
  if (!ALLOWED_ORIGIN) return {};
  return {
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-credentials": "true",
    // Identitaetsheader werden ausschliesslich vom vorgeschalteten Gateway
    // gesetzt und duerfen niemals aus dem Browser-CORS-Kontext kommen.
    "access-control-allow-headers": "authorization, content-type, x-request-id",
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
    oidc: "OIDC/SSO",
    "trusted-header": "Gateway-SSO"
  }[API_AUTH_MODE] || "Backend-Identitaet";
}

function decodeJwtPart(value) {
  try {
    const encoded = String(value || "");
    if (!encoded || encoded.length > 12_000) throw new Error("JWT-Segment ist zu gross.");
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JWT-Segment ist kein Objekt.");
    return parsed;
  } catch {
    const error = new Error("Signiertes Identity-Token konnte nicht gelesen werden.");
    error.status = 401;
    throw error;
  }
}

async function readBoundedJsonResponse(response, maximumBytes = 1024 * 1024) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maximumBytes) {
    const error = new Error("Identity-Key-Antwort ist zu gross.");
    error.status = 503;
    throw error;
  }
  if (!response.body?.getReader) {
    const error = new Error("Identity-Key-Antwort besitzt keinen lesbaren Body.");
    error.status = 503;
    throw error;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        const error = new Error("Identity-Key-Antwort ist zu gross.");
        error.status = 503;
        throw error;
      }
      chunks.push(Buffer.from(value));
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Ungueltige JSON-Struktur.");
    return parsed;
  } catch (cause) {
    if (cause?.status) throw cause;
    const error = new Error("Identity-Key-Antwort ist kein gueltiges JSON.", { cause });
    error.status = 503;
    throw error;
  }
}

async function iapPublicKeys() {
  if (iapKeyCache.expiresAt > Date.now() && iapKeyCache.keys.size) return iapKeyCache.keys;
  const response = await fetch("https://www.gstatic.com/iap/verify/public_key-jwk", {
    signal: AbortSignal.timeout(OUTBOUND_FETCH_TIMEOUT_MS)
  });
  if (!response.ok) {
    const error = new Error("IAP-Public-Keys konnten nicht geladen werden.");
    error.status = 503;
    throw error;
  }
  const payload = await readBoundedJsonResponse(response);
  const keys = new Map();
  for (const jwk of payload.keys || []) {
    if (!jwk.kid || jwk.kty !== "EC" || (jwk.use && jwk.use !== "sig") || (jwk.alg && jwk.alg !== "ES256")) continue;
    keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
  }
  if (!keys.size) {
    const error = new Error("IAP-JWKS enthaelt keine unterstuetzten Signaturschluessel.");
    error.status = 503;
    throw error;
  }
  iapKeyCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys };
  return keys;
}

async function oidcPublicKeys() {
  if (oidcKeyCache.expiresAt > Date.now() && oidcKeyCache.keys.size) return oidcKeyCache.keys;
  const response = await fetch(OIDC_JWKS_URL, { signal: AbortSignal.timeout(OUTBOUND_FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    const error = new Error("OIDC-Public-Keys konnten nicht geladen werden.");
    error.status = 503;
    throw error;
  }
  const payload = await readBoundedJsonResponse(response);
  const keys = new Map();
  for (const jwk of payload.keys || []) {
    if (!jwk.kid || !["RSA", "EC"].includes(jwk.kty) || (jwk.use && jwk.use !== "sig")) continue;
    if (jwk.alg && !["ES256", "RS256", "PS256"].includes(jwk.alg)) continue;
    keys.set(jwk.kid, {
      key: crypto.createPublicKey({ key: jwk, format: "jwk" }),
      alg: String(jwk.alg || ""),
      kty: jwk.kty
    });
  }
  if (!keys.size) {
    const error = new Error("OIDC-JWKS enthaelt keine unterstuetzten Signaturschluessel.");
    error.status = 503;
    throw error;
  }
  const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get("cache-control") || "");
  const ttlMs = Math.min(60 * 60 * 1000, Math.max(60 * 1000, Number(maxAge?.[1] || 300) * 1000));
  oidcKeyCache = { expiresAt: Date.now() + ttlMs, keys };
  return keys;
}

function jwtAudienceMatches(actual, expected) {
  return (Array.isArray(actual) ? actual : [actual]).some((value) => value === expected);
}

function verifyJwtSignature(header, signedData, encodedSignature, publicKey) {
  const signature = Buffer.from(encodedSignature, "base64url");
  if (header.alg === "ES256") {
    return crypto.verify("sha256", signedData, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature);
  }
  if (header.alg === "RS256") return crypto.verify("RSA-SHA256", signedData, publicKey, signature);
  if (header.alg === "PS256") {
    return crypto.verify("RSA-SHA256", signedData, {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32
    }, signature);
  }
  return false;
}

async function verifyIapJwt(request) {
  if (request.iapPayload) return request.iapPayload;
  if (API_AUTH_MODE !== "iap") return null;
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

async function verifyOidcJwt(request) {
  if (request.oidcPayload) return request.oidcPayload;
  if (API_AUTH_MODE !== "oidc") return null;
  const token = bearerToken(request);
  if (!token) {
    const error = new Error("Signiertes OIDC-Access-Token fehlt.");
    error.status = 401;
    throw error;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    const error = new Error("OIDC-Token ist ungueltig.");
    error.status = 401;
    throw error;
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  if (!header.kid || !["ES256", "RS256", "PS256"].includes(header.alg)) {
    const error = new Error("OIDC-Token nutzt keinen erlaubten Signaturalgorithmus.");
    error.status = 401;
    throw error;
  }
  const keys = await oidcPublicKeys();
  const keyRecord = keys.get(header.kid);
  const expectedKeyType = header.alg === "ES256" ? "EC" : "RSA";
  const verified = keyRecord && keyRecord.kty === expectedKeyType && (!keyRecord.alg || keyRecord.alg === header.alg) && verifyJwtSignature(
    header,
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    encodedSignature,
    keyRecord.key
  );
  if (!verified) {
    const error = new Error("OIDC-Token-Signatur ist ungueltig.");
    error.status = 401;
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  const skew = 30;
  const issuer = String(payload.iss || "");
  if (issuer !== OIDC_ISSUER || !jwtAudienceMatches(payload.aud, OIDC_AUDIENCE)) {
    const error = new Error("OIDC-Issuer oder Audience passt nicht.");
    error.status = 401;
    throw error;
  }
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < now - skew ||
      (payload.nbf != null && Number(payload.nbf) > now + skew) ||
      (payload.iat != null && Number(payload.iat) > now + skew)) {
    const error = new Error("OIDC-Token-Zeitfenster ist ungueltig.");
    error.status = 401;
    throw error;
  }
  const email = String(payload[OIDC_EMAIL_CLAIM] || "").trim().toLowerCase();
  const subject = String(payload[OIDC_SUBJECT_CLAIM] || "").trim();
  if (!subject) {
    const error = new Error("OIDC-Token enthaelt keinen stabilen Subject-Identifier.");
    error.status = 401;
    throw error;
  }
  request.oidcPayload = { ...payload, email, sub: subject };
  return request.oidcPayload;
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
  const oidcPayload = await verifyOidcJwt(request);
  const unsignedHeaderMode = !IDENTITY_CONFIGURATION.production && API_AUTH_MODE === "trusted-header";
  const subject = String(
    iapPayload?.sub || oidcPayload?.sub || (unsignedHeaderMode ? trustedHeaderSubject(request) || iapSubject(request) : "")
  ).trim();
  const email = String(
    iapPayload?.email || oidcPayload?.email || (unsignedHeaderMode ? trustedHeaderEmail(request) || iapEmail(request) : "")
  ).trim().toLowerCase();
  if (!subject && unsignedHeaderMode) {
    const profile = await loadDevelopmentHeaderProfile(email);
    if (profile) return profile;
  }
  if (!subject) {
    const error = new Error("Gateway-/SSO-Identitaet fehlt.");
    error.status = 401;
    throw error;
  }
  if (unsignedHeaderMode) {
    const profile = await loadDevelopmentHeaderProfile(email, subject);
    if (profile) return profile;
  }
  const issuer = String(iapPayload?.iss || oidcPayload?.iss || "").trim();
  if (!issuer) {
    const error = new Error("Signierter Identity-Issuer fehlt.");
    error.status = 401;
    throw error;
  }
  let rows;
  try {
    rows = (await getPool().query(
      `select p.*
         from public.identity_bindings binding
         join public.profiles p on p.id = binding.profile_id
        where binding.issuer = $1
          and binding.subject = $2
          and binding.active = true
          and p.active = true
        limit 2`,
      [issuer, subject]
    )).rows;
  } catch (cause) {
    const error = new Error("Identity-Bindung konnte nicht sicher geprueft werden.", { cause });
    error.status = 503;
    throw error;
  }
  if (rows?.length !== 1) {
    const error = new Error("SSO-Nutzer ist keinem aktiven Versorgungs-Kompass-Profil zugeordnet.");
    error.status = 403;
    throw error;
  }
  return rows[0];
}

async function loadDevelopmentHeaderProfile(email = "", subject = "") {
  if (IDENTITY_CONFIGURATION.production || API_AUTH_MODE !== "trusted-header") return null;
  await loadProfiles({});
  return [...profileCache.byId.values()].find((item) => {
    const profileEmail = String(item.email || "").trim().toLowerCase();
    return item.active !== false && ((subject && item.id === subject) || (!subject && email && profileEmail === email));
  }) || null;
}

async function authorizeRequest(request, url) {
  const policy = policyForRequest(request.method, url.pathname);
  if (!policy) {
    const error = new Error("Not found");
    error.status = 404;
    throw error;
  }
  request.routePolicy = policy;
  if (policy.role === "public") return;
  const profile = await resolveRequestProfile(request);
  request.currentProfile = profile;
  if (roleRank(profile.role) < roleRank(policy.role)) {
    const error = new Error("Fuer diese Aktion fehlt die serverseitige Rolle.");
    error.status = 403;
    throw error;
  }
  assertSensitiveQueryPermission(profile, url.searchParams);
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isArchivedStatus(value) {
  return ["archived", "archiviert"].includes(String(value || "").trim().toLowerCase());
}

function assertEntityVisible(request, row, notFoundMessage) {
  if (!row || (isArchivedStatus(row.status) && roleRank(request.currentProfile?.role) < roleRank("admin"))) {
    const error = new Error(notFoundMessage);
    error.status = 404;
    throw error;
  }
  return row;
}

async function visibleParentIds(request, table, ids = []) {
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (roleRank(request.currentProfile?.role) >= roleRank("admin")) return new Set(unique);
  const visible = new Set();
  for (let offset = 0; offset < unique.length; offset += 500) {
    const chunk = unique.slice(offset, offset + 500);
    const rows = await cloudSqlRest(table, request, new URLSearchParams({
      select: "id,status",
      id: `in.(${chunk.join(",")})`
    }));
    for (const row of rows || []) if (!isArchivedStatus(row.status)) visible.add(row.id);
  }
  return visible;
}

async function filterRowsByVisibleParent(request, rows = [], parentTable, parentField) {
  if (roleRank(request.currentProfile?.role) >= roleRank("admin")) return rows;
  const visible = await visibleParentIds(request, parentTable, rows.map((row) => row[parentField]));
  return rows.filter((row) => visible.has(row[parentField]));
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
  const uploadRoute = /^\/api\/(?:profile\/avatar|contacts\/[^/]+\/image|contact-note-attachments)$/.test(
    String(request.url || "").split("?")[0]
  );
  const limit = uploadRoute ? 14 * 1024 * 1024 : REQUEST_BODY_LIMIT_BYTES;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
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
  organization_primary_systems: ORGANIZATION_PRIMARY_SYSTEM_FIELDS,
  profiles: PROFILE_FIELDS,
  changes: CHANGE_FIELDS,
  activity_events: ACTIVITY_EVENT_FIELDS,
  contact_notes: CONTACT_NOTE_FIELDS,
  contact_note_attachments: [...CONTACT_NOTE_ATTACHMENT_FIELDS, "extracted_text"],
  saved_views: SAVED_VIEW_FIELDS,
  user_settings: USER_SETTINGS_FIELDS,
  formats: FORMAT_FIELDS,
  format_participants: FORMAT_PARTICIPANT_FIELDS,
  hospitation_slots: HOSPITATION_SLOT_FIELDS,
  hospitations: HOSPITATION_FIELDS,
  hospitation_observations: HOSPITATION_OBSERVATION_FIELDS,
  roadmap_items: ROADMAP_ITEM_FIELDS,
  hospitation_roadmap_assessments: HOSPITATION_ROADMAP_ASSESSMENT_FIELDS,
  hospitation_unmet_needs: HOSPITATION_UNMET_NEED_FIELDS,
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

const DB_SSL_MODES = new Set(["disable", "require", "verify-ca", "verify-full"]);
const DATABASE_URL_SSL_PARAMETERS = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"];
const DB_SSL_OVERRIDE_ENV = [
  "DB_SSL",
  "DB_SSL_MODE",
  "DB_SSL_CA",
  "DB_SSL_CA_FILE",
  "DB_SSL_CERT",
  "DB_SSL_CERT_FILE",
  "DB_SSL_KEY",
  "DB_SSL_KEY_FILE",
  "DB_SSL_SERVERNAME",
  "DB_SSL_SERVER_NAME",
  "PGSSLMODE",
  "PGSSLROOTCERT",
  "PGSSLCERT",
  "PGSSLKEY"
];

function configuredEnvValue(env, names) {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return "";
}

function readDatabaseTlsMaterial(env, inlineName, fileNames, label) {
  const inlineValue = configuredEnvValue(env, [inlineName]);
  const filePath = configuredEnvValue(env, fileNames);
  if (inlineValue && filePath) {
    throw new Error(`Postgres-TLS-${label} darf nicht gleichzeitig direkt und als Datei konfiguriert werden.`);
  }
  if (inlineValue) return inlineValue;
  if (!filePath) return "";
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Postgres-TLS-${label} konnte nicht aus ${filePath} gelesen werden: ${error.message}`, { cause: error });
  }
}

function databaseUrlHasSslParameters(connectionString) {
  try {
    const url = new URL(connectionString);
    return DATABASE_URL_SSL_PARAMETERS.some((name) => url.searchParams.has(name));
  } catch {
    return /(?:\?|&)(?:ssl|sslmode|sslcert|sslkey|sslrootcert)=/i.test(connectionString);
  }
}

function hasDatabaseSslOverrides(env) {
  return DB_SSL_OVERRIDE_ENV.some((name) => configuredEnvValue(env, [name]));
}

function normalizeDatabaseSslMode(env, hasTlsMaterial) {
  const configuredMode = configuredEnvValue(env, ["DB_SSL_MODE", "DB_SSL", "PGSSLMODE"])
    .trim()
    .toLowerCase();
  const aliases = {
    "0": "disable",
    false: "disable",
    off: "disable",
    "1": "require",
    true: "require",
    on: "require",
    "no-verify": "require",
    prefer: "require"
  };
  const mode = aliases[configuredMode] || configuredMode || (hasTlsMaterial ? "verify-full" : "");
  if (mode && !DB_SSL_MODES.has(mode)) {
    throw new Error(`Ungueltiger Postgres-TLS-Modus: ${configuredMode}. Erlaubt sind disable, require, verify-ca und verify-full.`);
  }
  return mode;
}

function buildDatabaseSslConfig(env = process.env) {
  const ca = readDatabaseTlsMaterial(env, "DB_SSL_CA", ["DB_SSL_CA_FILE", "PGSSLROOTCERT"], "CA");
  const cert = readDatabaseTlsMaterial(env, "DB_SSL_CERT", ["DB_SSL_CERT_FILE", "PGSSLCERT"], "Client-Zertifikat");
  const key = readDatabaseTlsMaterial(env, "DB_SSL_KEY", ["DB_SSL_KEY_FILE", "PGSSLKEY"], "Client-Schluessel");
  const servername = configuredEnvValue(env, ["DB_SSL_SERVERNAME", "DB_SSL_SERVER_NAME"]);
  const hasTlsMaterial = Boolean(ca || cert || key || servername);
  const mode = normalizeDatabaseSslMode(env, hasTlsMaterial);

  if (!mode) return undefined;
  if (mode === "disable") {
    if (hasTlsMaterial) {
      throw new Error("Postgres-TLS-Material ist konfiguriert, obwohl der TLS-Modus disable ist.");
    }
    return false;
  }
  if (Boolean(cert) !== Boolean(key)) {
    throw new Error("Postgres-TLS-Client-Zertifikat und -Schluessel muessen gemeinsam konfiguriert werden.");
  }
  if (mode === "verify-ca" && !ca) {
    throw new Error("Postgres-TLS verify-ca benoetigt DB_SSL_CA oder DB_SSL_CA_FILE/PGSSLROOTCERT.");
  }
  if (mode === "require" && ca) {
    throw new Error("Postgres-TLS-CA ist mit require wirkungslos. Bitte verify-ca oder verify-full verwenden.");
  }

  const ssl = { rejectUnauthorized: mode !== "require" };
  if (ca) ssl.ca = ca;
  if (cert) ssl.cert = cert;
  if (key) ssl.key = key;
  if (servername) ssl.servername = servername;
  if (mode === "verify-ca") ssl.checkServerIdentity = () => undefined;
  if (mode === "verify-full" && servername) {
    ssl.checkServerIdentity = (_hostname, certificate) => checkServerIdentity(servername, certificate);
  }
  return ssl;
}

function buildPostgresPoolConfig(env = process.env) {
  const max = Number(env.DB_POOL_MAX || 5);
  const runtimeOptions = {
    max,
    connectionTimeoutMillis: Math.max(1000, Number(env.DB_CONNECT_TIMEOUT_MS || 5000)),
    idleTimeoutMillis: Math.max(1000, Number(env.DB_IDLE_TIMEOUT_MS || 30000)),
    query_timeout: Math.max(1000, Number(env.DB_QUERY_TIMEOUT_MS || 15000)),
    statement_timeout: Math.max(1000, Number(env.DB_STATEMENT_TIMEOUT_MS || 15000)),
    application_name: String(env.DB_APPLICATION_NAME || "versorgungs-kompass-api").slice(0, 63),
    keepAlive: true
  };
  const connectionString = configuredEnvValue(env, ["DATABASE_URL"]);
  if (connectionString) {
    const urlControlsSsl = databaseUrlHasSslParameters(connectionString);
    if (urlControlsSsl && hasDatabaseSslOverrides(env)) {
      throw new Error("Postgres-TLS darf nicht gleichzeitig in DATABASE_URL und ueber DB_SSL_*/PGSSL* konfiguriert werden.");
    }
    const config = { connectionString, ...runtimeOptions };
    if (!urlControlsSsl) {
      const ssl = buildDatabaseSslConfig(env);
      if (ssl !== undefined) config.ssl = ssl;
    }
    validateProductionDatabaseTransport(config, env);
    validateProductionDatabaseCredentials(config, env);
    return config;
  }

  const host = configuredEnvValue(env, ["DB_HOST", "PGHOST"]);
  if (!host) {
    const error = new Error("Postgres-Verbindung fehlt. Bitte DATABASE_URL oder DB_HOST/DB_NAME/DB_USER/DB_PASSWORD setzen.");
    error.status = 500;
    throw error;
  }
  const config = {
    host,
    port: Number(env.DB_PORT || env.PGPORT || 5432),
    database: env.DB_NAME || env.PGDATABASE || DEFAULT_DB_NAME,
    user: env.DB_USER || env.PGUSER || DEFAULT_DB_USER,
    password: env.DB_PASSWORD || env.PGPASSWORD || "",
    ...runtimeOptions
  };
  const ssl = buildDatabaseSslConfig(env);
  if (ssl !== undefined) config.ssl = ssl;
  validateProductionDatabaseTransport(config, env);
  validateProductionDatabaseCredentials(config, env);
  return config;
}

function validateProductionDatabaseTransport(config, env = process.env) {
  if (env.NODE_ENV !== "production") return;
  let hostname = String(config.host || "").toLowerCase();
  if (!hostname && config.connectionString) {
    try { hostname = new URL(config.connectionString).hostname.toLowerCase(); } catch { hostname = ""; }
  }
  const localProxy = ["127.0.0.1", "localhost", "::1"].includes(hostname);
  if (localProxy) return;
  if (config.connectionString) {
    try {
      const sslMode = new URL(config.connectionString).searchParams.get("sslmode");
      if (String(sslMode || "").toLowerCase() === "verify-full") return;
    } catch {}
  }
  const configuredMode = configuredEnvValue(env, ["DB_SSL_MODE", "DB_SSL", "PGSSLMODE"]).trim().toLowerCase();
  if (configuredMode !== "verify-full" || !config.ssl || config.ssl.rejectUnauthorized !== true) {
    throw new Error("Produktive Postgres-Verbindungen muessen CA und Hostname pruefen (verify-full) oder einen lokalen mTLS-Cloud-SQL-Proxy verwenden.");
  }
}

function validateProductionDatabaseCredentials(config, env = process.env) {
  if (env.NODE_ENV !== "production") return;
  if (config.connectionString) {
    try {
      const url = new URL(config.connectionString);
      if (url.username && url.password) return;
    } catch {}
  } else if (String(config.user || "").trim() && String(config.password || "").length > 0) {
    return;
  }
  throw new Error("Produktive Postgres-Zugangsdaten fehlen oder sind unvollstaendig.");
}

function getPool() {
  if (pool) return pool;
  pool = new Pool(buildPostgresPoolConfig());
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

function parseInValues(value, operator = "in") {
  const match = new RegExp(`^${operator.replaceAll(".", "\\.")}\\.\\((.*)\\)$`).exec(value);
  if (!match) return [];
  const items = [];
  let buffer = "";
  let quoted = false;
  let itemWasQuoted = false;
  let escaped = false;
  const appendItem = () => {
    const normalized = itemWasQuoted ? buffer : buffer.trim();
    if (normalized !== "") items.push(itemWasQuoted ? normalized : dbValue(normalized));
    buffer = "";
    itemWasQuoted = false;
  };
  for (const character of match[1]) {
    if (escaped) {
      buffer += character;
      escaped = false;
    } else if (quoted && character === "\\") {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
      itemWasQuoted = true;
    } else if (character === "," && !quoted) {
      appendItem();
    } else {
      buffer += character;
    }
  }
  if (quoted || escaped) throw validationError("Ungueltige in-Filterliste.");
  appendItem();
  return items;
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
    } else if (value.startsWith("not.in.")) {
      const items = parseInValues(value, "not.in");
      if (items.length) {
        values.push(items);
        clauses.push(`not (${column} = any($${values.length}))`);
      }
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

function databaseQuery(transaction, sql, values = []) {
  if (transaction?.query && typeof transaction.query === "function") {
    return transaction.query(sql, values);
  }
  return getPool().query(sql, values);
}

async function selectRows(table, searchParams, transaction = null) {
  const values = [];
  const where = buildWhere(table, searchParams, values);
  const order = buildOrder(table, searchParams);
  const limitOffset = buildLimitOffset(searchParams, values);
  const result = await databaseQuery(transaction, `select * from ${qid(table)}${where}${order}${limitOffset}`, values);
  if (["changes", "activity_events"].includes(table) && String(searchParams.get("select") || "").includes("contacts(")) {
    await attachContactsToChanges(result.rows, transaction);
  }
  if (table === "notification_recipients") {
    await attachNotificationEvents(result.rows, transaction);
  }
  return result.rows;
}

async function attachContactsToChanges(rows = [], transaction = null) {
  const ids = uniqueIds(rows.map((row) => row.contact_id));
  if (!ids.length) return;
  const result = await databaseQuery(transaction, "select id, name, organization, sector, specialty, city, federal_state, image_url, status from contacts where id = any($1)", [ids]);
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  rows.forEach((row) => {
    row.contacts = byId.get(row.contact_id) || null;
  });
}

async function attachNotificationEvents(rows = [], transaction = null) {
  const ids = uniqueIds(rows.map((row) => row.event_id));
  if (!ids.length) return;
  const result = await databaseQuery(transaction, "select * from notification_events where id = any($1)", [ids]);
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
      const preservedFields = new Set([...(options.conflictPreserveFields || []), ...conflict]);
      const updates = columns
        .filter((column) => !preservedFields.has(column))
        .map((column) => `${qid(column)} = excluded.${qid(column)}`);
      const conflictMatchFields = (options.conflictMatchFields || [])
        .filter((field) => tableFields(table).has(field));
      const conflictGuard = conflictMatchFields.length
        ? ` where ${conflictMatchFields.map((field) => `${qid(table)}.${qid(field)} = excluded.${qid(field)}`).join(" and ")}`
        : "";
      conflictClause = updates.length
        ? ` on conflict (${conflictColumns}) do update set ${updates.join(", ")}${conflictGuard}`
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
  const result = await databaseQuery(options.transaction, sql, values);
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
  if (!where) throw Object.assign(new Error("Ungefilterte SQL-Updates sind gesperrt."), { status: 500 });
  const result = await databaseQuery(options.transaction, `update ${qid(table)} set ${assignments.join(", ")}${where} returning *`, values);
  return result.rows;
}

async function deleteRows(table, searchParams, options = {}) {
  const values = [];
  const where = buildWhere(table, searchParams, values);
  if (!where) throw Object.assign(new Error("Ungefilterte SQL-Loeschungen sind gesperrt."), { status: 500 });
  await databaseQuery(options.transaction, `delete from ${qid(table)}${where}`, values);
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
  const requestedStatus = !Array.isArray(options.body) && Object.prototype.hasOwnProperty.call(options.body || {}, "status")
    ? String(options.body.status || "")
    : "";
  if (["POST", "PATCH"].includes(method) && requestedStatus && roleRank(request.currentProfile?.role) < roleRank("admin")) {
    if (isArchivedStatus(requestedStatus)) {
      throw Object.assign(new Error("Archivieren ist nur fuer Admins erlaubt."), { status: 403 });
    }
    if (method === "PATCH" && tableFields(path).has("status")) {
      const currentParams = new URLSearchParams(searchParams);
      currentParams.set("select", "status");
      currentParams.set("limit", "2");
      const currentRows = await selectRows(path, currentParams, options.transaction);
      if (currentRows.some((row) => isArchivedStatus(row.status))) {
        throw Object.assign(new Error("Wiederherstellen ist nur fuer Admins erlaubt."), { status: 403 });
      }
    }
  }
  if (method === "GET") return selectRows(path, searchParams, options.transaction);
  if (method === "POST") return insertRows(path, searchParams, options);
  if (method === "PATCH") return patchRows(path, searchParams, options);
  if (method === "DELETE") return deleteRows(path, searchParams, options);
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

async function loadContactOwnerRows(request, contactIds = [], transaction = null) {
  if (!supportsContactOwners) return [];
  const ids = [...new Set(contactIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return [];
  try {
    return await cloudSqlRest("contact_owners", request, new URLSearchParams({
      select: CONTACT_OWNER_FIELDS.join(","),
      contact_id: `in.(${ids.join(",")})`,
      order: "assigned_at.asc"
    }), transaction ? { transaction } : {}) || [];
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
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      severity: "WARN",
      event: "notification_delivery_failed",
      requestId: request.requestId || "",
      entityType: String(input.entityType || input.entity_type || "system").slice(0, 80),
      errorClass: error?.constructor?.name || "Error"
    }));
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

async function replaceStoredContactOwners(request, contactId, oldOwnerIds = [], nextOwnerIds = [], userId = "", { log = true, transaction = null } = {}) {
  if (!supportsContactOwners || !contactId) return;
  const oldIds = normalizeOwnerIds(oldOwnerIds);
  const nextIds = normalizeOwnerIds(nextOwnerIds);
  if (!contactOwnersChanged(oldIds, nextIds)) return;
  try {
    await cloudSqlRest("contact_owners", request, new URLSearchParams({ contact_id: `eq.${contactId}` }), {
      method: "DELETE",
      headers: { prefer: "return=minimal" },
      transaction
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
      })),
      transaction
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
      },
      transaction
    });
  }
}

function storageEnabled(bucket) {
  return Boolean(bucket);
}

async function googleAccessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "metadata-flavor": "Google" },
    signal: AbortSignal.timeout(OUTBOUND_FETCH_TIMEOUT_MS)
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
    signal: options.signal || AbortSignal.timeout(OUTBOUND_FETCH_TIMEOUT_MS),
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

async function boundedStorageResponseBuffer(response, maximumBytes = 0) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (maximumBytes > 0 && declaredLength > maximumBytes) {
    const error = new Error("Cloud-Storage-Objekt überschreitet die erlaubte Größe.");
    error.status = 415;
    throw error;
  }
  if (!maximumBytes || !response.body?.getReader) return Buffer.from(await response.arrayBuffer());
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => {});
        const error = new Error("Cloud-Storage-Objekt überschreitet die erlaubte Größe.");
        error.status = 415;
        throw error;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function readStorageObject(bucket, objectName, { maxBytes = 0, allowedContentTypes = [] } = {}) {
  const metadataUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`);
  metadataUrl.searchParams.set("fields", "name,size,contentType,generation");
  const metadata = await storageFetch(metadataUrl.toString());
  if (metadata.status === 404) return null;
  const meta = await metadata.json();
  const size = Number(meta.size);
  const contentType = String(meta.contentType || "application/octet-stream").toLowerCase().split(";", 1)[0].trim();
  const generation = String(meta.generation || "");
  if (
    meta.name !== objectName
    || !Number.isSafeInteger(size)
    || size < 1
    || (maxBytes > 0 && size > maxBytes)
    || !/^[0-9]+$/.test(generation)
    || (allowedContentTypes.length > 0 && !allowedContentTypes.includes(contentType))
  ) {
    const error = new Error("Cloud-Storage-Objektmetadaten sind nicht freigegeben.");
    error.status = 415;
    throw error;
  }
  const mediaUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`);
  mediaUrl.searchParams.set("alt", "media");
  mediaUrl.searchParams.set("generation", generation);
  const media = await storageFetch(mediaUrl.toString());
  if (media.status === 404) return null;
  const buffer = await boundedStorageResponseBuffer(media, maxBytes);
  if (buffer.length !== size) {
    const error = new Error("Cloud-Storage-Objekt stimmt nicht mit seinen Metadaten überein.");
    error.status = 415;
    throw error;
  }
  return {
    buffer,
    contentType
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

function pngProfileAvatarMetadata(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer || buffer.length < 45 || !buffer.subarray(0, 8).equals(signature)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let hasImageData = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) return null;
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) return null;
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    }
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") {
      if (length !== 0 || end !== buffer.length || !width || !height || !hasImageData) return null;
      return { contentType: "image/png", width, height };
    }
    offset = end;
  }
  return null;
}

function jpegProfileAvatarMetadata(buffer) {
  if (!buffer || buffer.length < 16 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  if (buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) return null;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let dimensions = null;
  while (offset + 4 <= buffer.length - 2) {
    if (buffer[offset] !== 0xff) return null;
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (marker === 0xd9) break;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (length < 7) return null;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (!width || !height) return null;
      dimensions = { contentType: "image/jpeg", width, height };
    }
    if (marker === 0xda) return dimensions;
    offset += length;
  }
  return null;
}

function webpProfileAvatarMetadata(buffer) {
  if (
    !buffer
    || buffer.length < 25
    || buffer.subarray(0, 4).toString("ascii") !== "RIFF"
    || buffer.subarray(8, 12).toString("ascii") !== "WEBP"
    || buffer.readUInt32LE(4) + 8 !== buffer.length
  ) return null;
  let offset = 12;
  let extendedDimensions = null;
  let imageDimensions = null;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    const paddedEnd = payloadEnd + (chunkSize % 2);
    if (payloadEnd > buffer.length || paddedEnd > buffer.length) return null;
    if (chunkType === "VP8X" && chunkSize >= 10) {
      extendedDimensions = {
        width: 1 + buffer.readUIntLE(payloadStart + 4, 3),
        height: 1 + buffer.readUIntLE(payloadStart + 7, 3)
      };
    } else if (chunkType === "VP8L" && chunkSize >= 5 && buffer[payloadStart] === 0x2f) {
      imageDimensions = {
        width: 1 + (((buffer[payloadStart + 2] & 0x3f) << 8) | buffer[payloadStart + 1]),
        height: 1 + (((buffer[payloadStart + 4] & 0x0f) << 10) | (buffer[payloadStart + 3] << 2) | ((buffer[payloadStart + 2] & 0xc0) >> 6))
      };
    } else if (
      chunkType === "VP8 "
      && chunkSize >= 10
      && buffer[payloadStart + 3] === 0x9d
      && buffer[payloadStart + 4] === 0x01
      && buffer[payloadStart + 5] === 0x2a
    ) {
      imageDimensions = {
        width: buffer.readUInt16LE(payloadStart + 6) & 0x3fff,
        height: buffer.readUInt16LE(payloadStart + 8) & 0x3fff
      };
    }
    offset = paddedEnd;
  }
  if (offset !== buffer.length || !imageDimensions?.width || !imageDimensions?.height) return null;
  return {
    contentType: "image/webp",
    width: Math.max(extendedDimensions?.width || 0, imageDimensions.width),
    height: Math.max(extendedDimensions?.height || 0, imageDimensions.height)
  };
}

function profileAvatarMetadata(buffer) {
  return pngProfileAvatarMetadata(buffer) || jpegProfileAvatarMetadata(buffer) || webpProfileAvatarMetadata(buffer);
}

function detectedProfileAvatarContentType(buffer) {
  return profileAvatarMetadata(buffer)?.contentType || "";
}

function decodeProfileAvatarBase64(data) {
  const encoded = String(data || "");
  if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    const error = new Error("Profilfoto-Daten sind kein gültiges Base64.");
    error.status = 400;
    throw error;
  }
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.toString("base64") !== encoded) {
    const error = new Error("Profilfoto-Daten sind kein kanonisches Base64.");
    error.status = 400;
    throw error;
  }
  return buffer;
}

function decodeCanonicalBase64(data, label) {
  const encoded = String(data || "").trim();
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw validationError(`${label}-Daten sind kein kanonisches Base64.`);
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.toString("base64") !== encoded) {
    throw validationError(`${label}-Daten sind kein kanonisches Base64.`);
  }
  return buffer;
}

function profileAvatarObjectName(avatarUrl, profileId) {
  const prefix = `gs://${PROFILE_IMAGE_BUCKET}/profile-images/${profileId}/`;
  const value = String(avatarUrl || "");
  if (!PROFILE_IMAGE_BUCKET || !value.startsWith(prefix)) return "";
  const fileName = value.slice(prefix.length);
  if (!/^avatar(?:-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?\.(?:jpe?g|png|webp)$/i.test(fileName)) return "";
  return `profile-images/${profileId}/${fileName}`;
}

function profileAvatarVersionFilter(avatarUrl) {
  return avatarUrl ? `eq.${avatarUrl}` : "is.null";
}

async function rawProfileAvatarRow(request, profileId, { activeOnly = false } = {}) {
  const params = new URLSearchParams({
    select: "id,avatar_url,active",
    id: `eq.${profileId}`,
    limit: "1"
  });
  if (activeOnly) params.set("active", "eq.true");
  const rows = await cloudSqlRest("profiles", request, params);
  return rows?.[0] || null;
}

async function deleteProfileAvatarObject(objectName) {
  if (!objectName) return;
  try {
    await deleteStorageObject(PROFILE_IMAGE_BUCKET, objectName);
  } catch (error) {
    console.warn("Ein nicht mehr referenziertes Profilfoto konnte nicht aus Cloud Storage entfernt werden.", error);
  }
}

async function uploadCurrentProfileAvatar(request) {
  if (IMAGE_UPLOAD_MODE === "disabled") {
    throw Object.assign(new Error("Profilfoto-Uploads sind bis zur sicheren Re-Encoding-Abnahme deaktiviert."), { status: 503 });
  }
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
  if (!PROFILE_AVATAR_CONTENT_TYPES.includes(contentType)) {
    const error = new Error("Bitte nutze ein JPG-, PNG- oder WebP-Bild.");
    error.status = 400;
    throw error;
  }
  const buffer = decodeProfileAvatarBase64(body.data);
  if (buffer.length > 5 * 1024 * 1024) {
    const error = new Error("Das Profilfoto darf maximal 5 MB groß sein.");
    error.status = 413;
    throw error;
  }
  const metadata = profileAvatarMetadata(buffer);
  if (metadata?.contentType !== contentType) {
    const error = new Error("Dateiinhalt und Profilfoto-Format stimmen nicht überein.");
    error.status = 400;
    throw error;
  }
  if (metadata.width > 4096 || metadata.height > 4096) {
    const error = new Error("Das Profilfoto darf höchstens 4096 × 4096 Pixel groß sein.");
    error.status = 400;
    throw error;
  }
  const oldProfile = await rawProfileAvatarRow(request, userId);
  if (!oldProfile) {
    const error = new Error("Profil wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const objectName = `profile-images/${userId}/avatar-${crypto.randomUUID()}.${extension}`;
  await saveStorageObject(PROFILE_IMAGE_BUCKET, objectName, buffer, contentType);
  const avatarUrl = profileAvatarUrl(userId);
  let updated;
  try {
    const rows = await cloudSqlRest("profiles", request, new URLSearchParams({
      id: `eq.${userId}`,
      avatar_url: profileAvatarVersionFilter(oldProfile.avatar_url),
      select: PROFILE_FIELDS.join(",")
    }), {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: {
        avatar_url: `gs://${PROFILE_IMAGE_BUCKET}/${objectName}`,
        updated_at: new Date().toISOString()
      }
    });
    updated = rows?.[0];
    if (!updated) {
      const error = new Error("Das Profilfoto wurde zwischenzeitlich geändert. Bitte versuche es erneut.");
      error.status = 409;
      throw error;
    }
  } catch (error) {
    await deleteProfileAvatarObject(objectName);
    throw error;
  }
  const oldObjectName = profileAvatarObjectName(oldProfile.avatar_url, userId);
  if (oldObjectName && oldObjectName !== objectName) await deleteProfileAvatarObject(oldObjectName);
  profileCache.expiresAt = 0;
  await loadProfiles(request);
  return { publicUrl: avatarUrl, path: objectName, profile: profileRowToClient(updated) };
}

async function removeCurrentProfileAvatar(request) {
  if (!request.currentProfile) request.currentProfile = await resolveRequestProfile(request);
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus der IAP-/SSO-Identitaet gelesen werden.");
    error.status = 401;
    throw error;
  }
  const oldProfile = await rawProfileAvatarRow(request, userId);
  if (!oldProfile) {
    const error = new Error("Profil wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  const rows = await cloudSqlRest("profiles", request, new URLSearchParams({
    id: `eq.${userId}`,
    avatar_url: profileAvatarVersionFilter(oldProfile.avatar_url),
    select: PROFILE_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: {
      avatar_url: null,
      updated_at: new Date().toISOString()
    }
  });
  if (!rows?.[0]) {
    const error = new Error("Das Profilfoto wurde zwischenzeitlich geändert. Bitte versuche es erneut.");
    error.status = 409;
    throw error;
  }
  profileCache.expiresAt = 0;
  await loadProfiles(request);
  await deleteProfileAvatarObject(profileAvatarObjectName(oldProfile.avatar_url, userId));
  return profileRowToClient(rows[0]);
}

async function readProfileAvatar(request, response, profileId) {
  await authorizeRequest(request, new URL(`/api/profile-avatar/${encodeURIComponent(profileId)}`, "http://local"));
  if (!PROFILE_IMAGE_BUCKET) return jsonResponse(response, 404, { error: "Profilbild-Bucket ist nicht konfiguriert." });
  const profile = await rawProfileAvatarRow(request, profileId, { activeOnly: true });
  const objectName = profileAvatarObjectName(profile?.avatar_url, profileId);
  if (!objectName) return jsonResponse(response, 404, { error: "Profilbild nicht gefunden." });
  const object = await readStorageObject(PROFILE_IMAGE_BUCKET, objectName);
  if (!object) return jsonResponse(response, 404, { error: "Profilbild nicht gefunden." });
  const metadata = profileAvatarMetadata(object.buffer);
  if (!metadata || metadata.width > 4096 || metadata.height > 4096) {
    return jsonResponse(response, 415, { error: "Profilbildformat ist ungültig." });
  }
  response.writeHead(200, {
    "content-type": metadata.contentType,
    "content-length": object.buffer.length,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    ...corsHeaders()
  });
  response.end(object.buffer);
}

async function readContactImage(request, response, contactId) {
  await authorizeRequest(request, new URL(`/api/contact-images/${encodeURIComponent(contactId)}`, "http://local"));
  if (!CONTACT_IMAGE_BUCKET) return jsonResponse(response, 404, { error: "Kontaktbild-Bucket ist nicht konfiguriert." });
  const rows = await cloudSqlRest("contacts", request, new URLSearchParams({
    select: "id,image_storage_path,status",
    id: `eq.${contactId}`,
    limit: "1"
  }));
  const contact = rows?.[0];
  if (!contact?.image_storage_path) return jsonResponse(response, 404, { error: "Kontaktbild wurde nicht gefunden." });
  if (isArchivedStatus(contact.status) && request.currentProfile?.role !== "admin") return jsonResponse(response, 404, { error: "Kontaktbild wurde nicht gefunden." });
  const object = await readStorageObject(CONTACT_IMAGE_BUCKET, contact.image_storage_path);
  if (!object) return jsonResponse(response, 404, { error: "Kontaktbild wurde nicht gefunden." });
  const metadata = profileAvatarMetadata(object.buffer);
  if (!metadata || metadata.width > 4096 || metadata.height > 4096) {
    return jsonResponse(response, 415, { error: "Kontaktbildformat ist ungueltig." });
  }
  response.writeHead(200, {
    "content-type": metadata.contentType,
    "cache-control": "private, max-age=300",
    ...securityResponseHeaders(),
    ...corsHeaders()
  });
  response.end(object.buffer);
}

function stakeholderLogoObjectName(logoUrl) {
  const prefix = "private://stakeholder-logos/";
  const value = String(logoUrl || "").trim();
  if (!value.startsWith(prefix)) return "";
  const objectName = value.slice(prefix.length);
  if (
    !objectName
    || objectName.length > 1024
    || !/^[A-Za-z0-9._/-]+$/.test(objectName)
    || objectName.startsWith("/")
    || objectName.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) return "";
  return objectName;
}

const STANDARD_W3C_SVG_DOCTYPE = /^<!DOCTYPE\s+svg\s+PUBLIC\s+["']-\/\/W3C\/\/DTD SVG (?:1\.0|1\.1)\/\/EN["']\s+["']https?:\/\/www\.w3\.org\/Graphics\/SVG\/(?:1\.0\/DTD\/svg10|1\.1\/DTD\/svg11)\.dtd["']\s*>/i;

function svgLeadingTrivia(text) {
  let offset = text.startsWith("\uFEFF") ? 1 : 0;
  while (/\s/.test(text[offset] || "")) offset += 1;
  if (/^<\?xml\b/i.test(text.slice(offset))) {
    const declarationEnd = text.indexOf("?>", offset + 5);
    if (declarationEnd < 0) return null;
    offset = declarationEnd + 2;
    while (/\s/.test(text[offset] || "")) offset += 1;
  }
  while (text.startsWith("<!--", offset)) {
    const commentEnd = text.indexOf("-->", offset + 4);
    if (commentEnd < 0) return null;
    offset = commentEnd + 3;
    while (/\s/.test(text[offset] || "")) offset += 1;
  }
  return offset;
}

function svgWithoutTrailingComments(text) {
  let remainder = text.trimEnd();
  while (remainder.endsWith("-->")) {
    const commentStart = remainder.lastIndexOf("<!--");
    if (commentStart < 0) return "";
    remainder = remainder.slice(0, commentStart).trimEnd();
  }
  return remainder;
}

function sanitizedStakeholderLogoSvg(buffer) {
  const text = buffer.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buffer)) return null;
  let sanitized = text;
  let leadingOffset = svgLeadingTrivia(sanitized);
  if (leadingOffset === null) return null;
  if (/^<!DOCTYPE\s+svg\b/i.test(sanitized.slice(leadingOffset))) {
    const standardDoctype = STANDARD_W3C_SVG_DOCTYPE.exec(sanitized.slice(leadingOffset));
    if (!standardDoctype) return null;
    sanitized = `${sanitized.slice(0, leadingOffset)}${sanitized.slice(leadingOffset + standardDoctype[0].length)}`;
    leadingOffset = svgLeadingTrivia(sanitized);
    if (leadingOffset === null) return null;
  }
  const svgDocument = sanitized.slice(leadingOffset);
  if (
    !/^<svg\b/i.test(svgDocument)
    || /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:|javascript:)/i.test(svgDocument)
  ) return null;
  const withoutTrailingComments = svgWithoutTrailingComments(svgDocument);
  if (
    !/<\/svg>$/i.test(withoutTrailingComments)
    && !/^<svg\b(?:[^>"']|"[^"]*"|'[^']*')*\/>$/i.test(withoutTrailingComments)
  ) return null;
  return Buffer.from(sanitized, "utf8");
}

function stakeholderLogoMetadata(object) {
  const contentType = String(object?.contentType || "").toLowerCase().split(";", 1)[0].trim();
  const buffer = object?.buffer;
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 2 * 1024 * 1024) return null;
  if (["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    const metadata = profileAvatarMetadata(buffer);
    if (!metadata || metadata.contentType !== contentType || metadata.width > 4096 || metadata.height > 4096) return null;
    return { contentType, buffer, contentSecurityPolicy: "default-src 'none'; sandbox" };
  }
  if (contentType === "image/gif") {
    const isGif = buffer.length >= 13 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
    if (!isGif) return null;
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    if (!width || !height || width > 4096 || height > 4096) return null;
    return { contentType, buffer, contentSecurityPolicy: "default-src 'none'; sandbox" };
  }
  if (contentType === "image/svg+xml") {
    const sanitizedBuffer = sanitizedStakeholderLogoSvg(buffer);
    if (!sanitizedBuffer) return null;
    return { contentType, buffer: sanitizedBuffer, contentSecurityPolicy: "default-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; font-src 'none'; style-src 'unsafe-inline'; sandbox" };
  }
  return null;
}

async function readStakeholderLogo(request, response, organizationId) {
  await authorizeRequest(request, new URL(`/api/stakeholder-logos/${encodeURIComponent(organizationId)}`, "http://local"));
  if (!STAKEHOLDER_LOGO_BUCKET) return jsonResponse(response, 404, { error: "Stakeholder-Logo-Bucket ist nicht konfiguriert." });
  const rows = await cloudSqlRest("stakeholder_organizations", request, new URLSearchParams({
    select: "id,logo_url,status",
    id: `eq.${organizationId}`,
    limit: "1"
  }));
  const organization = rows?.[0];
  if (!organization || (isArchivedStatus(organization.status) && request.currentProfile?.role !== "admin")) {
    return jsonResponse(response, 404, { error: "Stakeholder-Logo wurde nicht gefunden." });
  }
  const objectName = stakeholderLogoObjectName(organization.logo_url);
  if (!objectName) return jsonResponse(response, 404, { error: "Stakeholder-Logo wurde nicht gefunden." });
  const object = await readStorageObject(STAKEHOLDER_LOGO_BUCKET, objectName, {
    maxBytes: 2 * 1024 * 1024,
    allowedContentTypes: ["image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/webp"]
  });
  if (!object) return jsonResponse(response, 404, { error: "Stakeholder-Logo wurde nicht gefunden." });
  const metadata = stakeholderLogoMetadata(object);
  if (!metadata) return jsonResponse(response, 415, { error: "Stakeholder-Logoformat ist nicht freigegeben." });
  const responseBuffer = metadata.buffer;
  response.writeHead(200, {
    "content-type": metadata.contentType,
    "content-length": responseBuffer.length,
    "cache-control": "private, max-age=300",
    ...securityResponseHeaders(),
    ...corsHeaders(),
    "content-security-policy": metadata.contentSecurityPolicy,
    "cross-origin-resource-policy": "same-origin"
  });
  response.end(responseBuffer);
}

async function contactImageRow(request, contactId) {
  const rows = await cloudSqlRest("contacts", request, new URLSearchParams({
    select: CONTACT_FIELDS.join(","),
    id: `eq.${contactId}`,
    limit: "1"
  }));
  if (!rows?.[0]) {
    const error = new Error("Kontakt wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  return rows[0];
}

async function writeContactImageChange(request, contactId, oldValue, newValue, userId) {
  await cloudSqlRest("changes", request, new URLSearchParams(), {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: {
      contact_id: contactId,
      action: "update",
      field_name: "image_storage_path",
      old_value: String(oldValue || ""),
      new_value: String(newValue || ""),
      changed_by: userId
    }
  });
}

async function uploadContactImage(request, contactId) {
  if (IMAGE_UPLOAD_MODE === "disabled") {
    throw Object.assign(new Error("Kontaktbild-Uploads sind bis zur sicheren Re-Encoding-Abnahme deaktiviert."), { status: 503 });
  }
  if (!CONTACT_IMAGE_BUCKET) throw Object.assign(new Error("CONTACT_IMAGE_BUCKET ist nicht konfiguriert."), { status: 500 });
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  const body = await readValidatedJsonBody(request, CONTACT_IMAGE_UPLOAD_FIELDS, "Kontaktbild-Upload");
  const contentType = String(body.contentType || "").trim();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw validationError("Bitte nutze ein JPG-, PNG- oder WebP-Bild.");
  const buffer = decodeCanonicalBase64(body.data, "Kontaktbild");
  if (buffer.length > 5 * 1024 * 1024) throw Object.assign(new Error("Das Kontaktbild darf maximal 5 MB groß sein."), { status: 413 });
  const metadata = profileAvatarMetadata(buffer);
  if (!metadata || metadata.contentType !== contentType) throw validationError("Dateiinhalt und Kontaktbild-Format stimmen nicht überein.");
  const width = metadata.width;
  const height = metadata.height;
  if (width > 4096 || height > 4096) throw validationError("Das Kontaktbild darf höchstens 4096 × 4096 Pixel groß sein.");
  if ((body.width && Number(body.width) !== width) || (body.height && Number(body.height) !== height)) {
    throw validationError("Die Bildabmessungen stimmen nicht mit dem Dateiinhalt überein.");
  }
  const oldRow = await contactImageRow(request, contactId);
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const objectName = `contact-images/${contactId}/${crypto.randomUUID()}.${extension}`;
  await saveStorageObject(CONTACT_IMAGE_BUCKET, objectName, buffer, contentType);
  let updated;
  try {
    const rows = await cloudSqlRest("contacts", request, new URLSearchParams({ id: `eq.${contactId}`, select: CONTACT_FIELDS.join(",") }), {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: {
        image_url: null,
        image_storage_path: objectName,
        image_kind: "upload",
        image_mime_type: contentType,
        image_file_size: buffer.length,
        image_width: width,
        image_height: height,
        image_source_url: null,
        image_source_label: String(body.sourceLabel || "Eigener Upload").trim() || "Eigener Upload",
        image_rights_note: String(body.rightsNote || "").trim() || null,
        image_updated_at: new Date().toISOString(),
        image_updated_by: userId,
        updated_at: new Date().toISOString(),
        updated_by: userId
      }
    });
    updated = rows?.[0];
    if (!updated) throw new Error("Kontaktbild wurde nicht gespeichert.");
  } catch (error) {
    await deleteStorageObject(CONTACT_IMAGE_BUCKET, objectName);
    throw error;
  }
  await writeContactImageChange(request, contactId, oldRow.image_storage_path || oldRow.image_url, objectName, userId);
  if (oldRow.image_storage_path && oldRow.image_storage_path !== objectName) await deleteStorageObject(CONTACT_IMAGE_BUCKET, oldRow.image_storage_path);
  const dto = (await decorateRowsWithStoredOwners(request, [updated]))[0];
  await notifyContactUpdated(request, dto, userId, { action: "update", changedFields: ["image_storage_path"] });
  return dto;
}

async function removeContactImage(request, contactId) {
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  const oldRow = await contactImageRow(request, contactId);
  const rows = await cloudSqlRest("contacts", request, new URLSearchParams({ id: `eq.${contactId}`, select: CONTACT_FIELDS.join(",") }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: {
      image_url: null,
      image_storage_path: null,
      image_kind: null,
      image_mime_type: null,
      image_file_size: null,
      image_width: null,
      image_height: null,
      image_source_url: null,
      image_source_label: null,
      image_rights_note: null,
      image_updated_at: new Date().toISOString(),
      image_updated_by: userId,
      updated_at: new Date().toISOString(),
      updated_by: userId
    }
  });
  const updated = rows?.[0];
  if (!updated) throw Object.assign(new Error("Kontaktbild wurde nicht entfernt."), { status: 500 });
  await writeContactImageChange(request, contactId, oldRow.image_storage_path || oldRow.image_url, "", userId);
  if (oldRow.image_storage_path) await deleteStorageObject(CONTACT_IMAGE_BUCKET, oldRow.image_storage_path);
  const dto = (await decorateRowsWithStoredOwners(request, [updated]))[0];
  await notifyContactUpdated(request, dto, userId, { action: "update", changedFields: ["image_storage_path"] });
  return dto;
}

async function visibleContactRow(request, contactId) {
  const rows = await cloudSqlRest("contacts", request, new URLSearchParams({
    select: CONTACT_FIELDS.join(","),
    id: `eq.${contactId}`,
    limit: "1"
  }));
  const contact = rows?.[0];
  if (!contact || (isArchivedStatus(contact.status) && request.currentProfile?.role !== "admin")) {
    const error = new Error("Kontakt wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
  return contact;
}

function contactNotePayload(body = {}, { patch = false } = {}) {
  const has = (...keys) => keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
  const contentType = String(body.contentType || body.content_type || "free_note").trim();
  const noteBody = String(body.body ?? body.text ?? "").trim();
  if (!patch || has("contentType", "content_type")) {
    if (!["free_note", "email_text"].includes(contentType)) throw validationError("Bitte Notiz oder E-Mail-Text auswählen.");
  }
  if (!patch || has("body", "text")) {
    if (!noteBody) throw validationError("Der Notiztext darf nicht leer sein.");
    if (noteBody.length > 500000) throw validationError("Der Notiztext ist zu lang.");
  }
  const recipients = splitList(body.emailRecipients ?? body.email_recipients);
  const occurredAt = String(body.emailOccurredAt || body.email_occurred_at || "").trim();
  if (occurredAt && Number.isNaN(Date.parse(occurredAt))) throw validationError("Das E-Mail-Datum ist ungültig.");
  const payload = {};
  if (!patch || has("contentType", "content_type")) payload.content_type = contentType;
  if (!patch || has("body", "text")) payload.body = noteBody;
  if (!patch || has("emailSubject", "email_subject")) payload.email_subject = String(body.emailSubject || body.email_subject || "").trim() || null;
  if (!patch || has("emailSender", "email_sender")) payload.email_sender = String(body.emailSender || body.email_sender || "").trim() || null;
  if (!patch || has("emailRecipients", "email_recipients")) payload.email_recipients = recipients;
  if (!patch || has("emailOccurredAt", "email_occurred_at")) payload.email_occurred_at = occurredAt || null;
  if (payload.content_type === "free_note") {
    payload.email_subject = null;
    payload.email_sender = null;
    payload.email_recipients = [];
    payload.email_occurred_at = null;
  }
  return payload;
}

async function contactNoteRow(request, noteId) {
  const rows = await cloudSqlRest("contact_notes", request, new URLSearchParams({
    id: `eq.${noteId}`,
    limit: "1"
  }));
  const note = rows?.[0];
  if (!note) throw Object.assign(new Error("Notiz wurde nicht gefunden."), { status: 404 });
  await visibleContactRow(request, note.contact_id);
  return note;
}

function assertNoteOwner(request, row, ownerField = "created_by") {
  const userId = userIdFromToken(request);
  if (request.currentProfile?.role !== "admin" && row?.[ownerField] !== userId) {
    const error = new Error("Nur die erstellende Person oder ein Admin darf diesen Inhalt ändern.");
    error.status = 403;
    throw error;
  }
  return userId;
}

async function listContactNotes(request, url) {
  const contactId = String(url.searchParams.get("contactId") || "").trim();
  if (!contactId) throw validationError("contactId fehlt.");
  await visibleContactRow(request, contactId);
  const rows = await cloudSqlRest("contact_notes", request, new URLSearchParams({
    contact_id: `eq.${contactId}`,
    order: "created_at.desc"
  })) || [];
  return { items: rows.map(contactNoteToDto) };
}

async function createContactNote(request) {
  const body = await readValidatedJsonBody(request, CONTACT_NOTE_INPUT_FIELDS, "Notiz");
  const contactId = String(body.contactId || body.contact_id || "").trim();
  if (!contactId) throw validationError("Kontakt fehlt.");
  const contact = await visibleContactRow(request, contactId);
  if (contact.status === "archived") throw Object.assign(new Error("Für archivierte Kontakte können keine Notizen erstellt werden."), { status: 409 });
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  const rows = await cloudSqlRest("contact_notes", request, new URLSearchParams(), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: {
      id: crypto.randomUUID(),
      contact_id: contactId,
      ...contactNotePayload(body),
      created_by: userId,
      updated_by: userId
    }
  });
  return contactNoteToDto(rows?.[0]);
}

async function patchContactNote(request, noteId) {
  const existing = await contactNoteRow(request, noteId);
  const userId = assertNoteOwner(request, existing);
  const body = await readValidatedJsonBody(request, CONTACT_NOTE_INPUT_FIELDS, "Notiz");
  const requestedContactId = String(body.contactId || body.contact_id || "").trim();
  if (requestedContactId && requestedContactId !== existing.contact_id) throw validationError("Der Kontakt einer Notiz kann nicht geändert werden.");
  const merged = {
    contentType: body.contentType ?? body.content_type ?? existing.content_type,
    body: body.body ?? body.text ?? existing.body,
    emailSubject: body.emailSubject ?? body.email_subject ?? existing.email_subject,
    emailSender: body.emailSender ?? body.email_sender ?? existing.email_sender,
    emailRecipients: body.emailRecipients ?? body.email_recipients ?? existing.email_recipients,
    emailOccurredAt: body.emailOccurredAt ?? body.email_occurred_at ?? existing.email_occurred_at
  };
  const rows = await cloudSqlRest("contact_notes", request, new URLSearchParams({ id: `eq.${noteId}` }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: { ...contactNotePayload(merged), updated_by: userId, updated_at: new Date().toISOString() }
  });
  return contactNoteToDto(rows?.[0]);
}

async function deleteContactNote(request, noteId) {
  const existing = await contactNoteRow(request, noteId);
  assertNoteOwner(request, existing);
  const attachments = await cloudSqlRest("contact_note_attachments", request, new URLSearchParams({
    note_id: `eq.${noteId}`,
    limit: "1"
  })) || [];
  if (attachments.length) throw Object.assign(new Error("Bitte zuerst die Anhänge dieser Notiz entfernen."), { status: 409 });
  await cloudSqlRest("contact_notes", request, new URLSearchParams({ id: `eq.${noteId}` }), { method: "DELETE" });
  return { ok: true };
}

async function listContactNoteAttachments(request, url) {
  const contactId = String(url.searchParams.get("contactId") || "").trim();
  if (!contactId) throw validationError("contactId fehlt.");
  await visibleContactRow(request, contactId);
  const rows = await cloudSqlRest("contact_note_attachments", request, new URLSearchParams({
    contact_id: `eq.${contactId}`,
    order: "uploaded_at.asc"
  })) || [];
  return { items: rows.map(contactNoteAttachmentToDto) };
}

async function contactNoteAttachmentRow(request, attachmentId) {
  const rows = await cloudSqlRest("contact_note_attachments", request, new URLSearchParams({
    id: `eq.${attachmentId}`,
    limit: "1"
  })) || [];
  const attachment = rows[0];
  if (!attachment) throw Object.assign(new Error("Anhang wurde nicht gefunden."), { status: 404 });
  await visibleContactRow(request, attachment.contact_id);
  return attachment;
}

function safeAttachmentName(value = "Datei") {
  return String(value || "Datei").replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 240) || "Datei";
}

async function uploadContactNoteAttachment(request) {
  if (ATTACHMENT_UPLOAD_MODE === "disabled") {
    throw Object.assign(new Error("Dateianhaenge sind bis zur Abnahme einer Scan- und Quarantaene-Strecke deaktiviert."), { status: 503 });
  }
  if (!CONTACT_NOTE_ATTACHMENT_BUCKET) throw Object.assign(new Error("CONTACT_NOTE_ATTACHMENT_BUCKET ist nicht konfiguriert."), { status: 500 });
  const body = await readValidatedJsonBody(request, CONTACT_NOTE_ATTACHMENT_UPLOAD_FIELDS, "Notiz-Anhang");
  const contactId = String(body.contactId || "").trim();
  const noteId = String(body.noteId || "").trim();
  const note = await contactNoteRow(request, noteId);
  if (!contactId || note.contact_id !== contactId) throw validationError("Notiz und Kontakt passen nicht zusammen.");
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  const fileName = safeAttachmentName(body.fileName);
  const mimeType = String(body.mimeType || "").trim();
  if (mimeType !== "text/plain" || !/\.txt$/i.test(fileName)) {
    throw validationError("Bis zur Scanner-Abnahme sind ausschließlich TXT-Anhänge erlaubt.");
  }
  const buffer = decodeCanonicalBase64(body.data, "Datei");
  if (buffer.length > 1024 * 1024) throw Object.assign(new Error("TXT-Anhänge dürfen maximal 1 MB groß sein."), { status: 413 });
  const declaredSize = Number(body.fileSize) || 0;
  if (declaredSize && declaredSize !== buffer.length) throw validationError("Die Dateigröße stimmt nicht mit dem Upload überein.");
  let extractedText;
  try { extractedText = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { throw validationError("TXT-Anhang ist nicht gueltig UTF-8-kodiert."); }
  if (/[\u0000]/.test(extractedText)) throw validationError("TXT-Anhang enthaelt unzulaessige Nullbytes.");
  extractedText = extractedText.slice(0, 200000);
  const attachmentId = crypto.randomUUID();
  const objectName = `${contactId}/${noteId}/${attachmentId}/${fileName}`;
  await saveStorageObject(CONTACT_NOTE_ATTACHMENT_BUCKET, objectName, buffer, mimeType);
  try {
    const rows = await cloudSqlRest("contact_note_attachments", request, new URLSearchParams(), {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: {
        id: attachmentId,
        contact_id: contactId,
        note_id: noteId,
        file_name: fileName,
        storage_path: objectName,
        mime_type: mimeType,
        file_size: buffer.length,
        description: String(body.description || "").trim() || null,
        extraction_status: "complete",
        extracted_text: extractedText,
        extraction_error: null,
        uploader_id: userId
      }
    });
    return contactNoteAttachmentToDto(rows?.[0]);
  } catch (error) {
    await deleteStorageObject(CONTACT_NOTE_ATTACHMENT_BUCKET, objectName);
    throw error;
  }
}

async function readContactNoteAttachment(request, response, attachmentId) {
  const attachment = await contactNoteAttachmentRow(request, attachmentId);
  if (!CONTACT_NOTE_ATTACHMENT_BUCKET) return jsonResponse(response, 404, { error: "Anhang-Bucket ist nicht konfiguriert." });
  const object = await readStorageObject(CONTACT_NOTE_ATTACHMENT_BUCKET, attachment.storage_path);
  if (!object) return jsonResponse(response, 404, { error: "Anhang wurde nicht gefunden." });
  const fileName = safeAttachmentName(attachment.file_name).replace(/"/g, "'");
  response.writeHead(200, {
    "content-type": object.contentType || attachment.mime_type,
    "content-length": object.buffer.length,
    "content-disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    ...securityResponseHeaders(),
    ...corsHeaders()
  });
  response.end(object.buffer);
}

async function removeContactNoteAttachment(request, attachmentId) {
  const attachment = await contactNoteAttachmentRow(request, attachmentId);
  assertNoteOwner(request, attachment, "uploader_id");
  if (!CONTACT_NOTE_ATTACHMENT_BUCKET) throw Object.assign(new Error("CONTACT_NOTE_ATTACHMENT_BUCKET ist nicht konfiguriert."), { status: 500 });
  await deleteStorageObject(CONTACT_NOTE_ATTACHMENT_BUCKET, attachment.storage_path);
  await cloudSqlRest("contact_note_attachments", request, new URLSearchParams({ id: `eq.${attachmentId}` }), { method: "DELETE" });
  return { ok: true };
}

async function searchContactContent(request, url) {
  const query = String(url.searchParams.get("query") || "").trim();
  if (query.length < 2) return { items: [] };
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 40, 100));
  const includeArchived = request.currentProfile?.role === "admin";
  const result = await getPool().query(
    `with search_query as (select websearch_to_tsquery('german', $1) as query), ranked as (
       select c.id as contact_id, null::uuid as note_id, null::uuid as attachment_id,
         'contact'::text as result_kind, c.name as title,
         concat_ws(' · ', nullif(c.organization, ''), nullif(c.specialty, ''), nullif(c.city, '')) as snippet,
         c.updated_at as occurred_at, (1.4 * ts_rank_cd(c.contact_search_vector, q.query))::real as rank
       from contacts c cross join search_query q
       where c.contact_search_vector @@ q.query and ($2::boolean or c.status <> 'archived')
       union all
       select n.contact_id, n.id, null::uuid, n.content_type,
         coalesce(nullif(n.email_subject, ''), case when n.content_type = 'email_text' then 'E-Mail-Text' else 'Notiz' end),
         regexp_replace(ts_headline('german', n.body, q.query, 'MaxWords=24, MinWords=8, ShortWord=2'), '</?b>', '', 'gi'),
         coalesce(n.email_occurred_at, n.created_at), ts_rank_cd(n.search_vector, q.query)::real
       from contact_notes n join contacts c on c.id = n.contact_id cross join search_query q
       where n.search_vector @@ q.query and ($2::boolean or c.status <> 'archived')
       union all
       select a.contact_id, a.note_id, a.id, 'attachment', a.file_name,
         regexp_replace(ts_headline('german', concat_ws(' ', a.description, a.extracted_text), q.query, 'MaxWords=24, MinWords=8, ShortWord=2'), '</?b>', '', 'gi'),
         a.uploaded_at, (0.85 * ts_rank_cd(a.search_vector, q.query))::real
       from contact_note_attachments a join contacts c on c.id = a.contact_id cross join search_query q
       where a.search_vector @@ q.query and ($2::boolean or c.status <> 'archived')
     ) select * from ranked order by rank desc, occurred_at desc limit $3`,
    [query, includeArchived, limit]
  );
  return { items: result.rows.map(contentSearchResultToDto) };
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

async function listOrganizationPrimarySystems(request, url) {
  const params = new URLSearchParams({
    select: ORGANIZATION_PRIMARY_SYSTEM_FIELDS.join(","),
    order: "system_type.asc,product_name.asc.nullslast"
  });
  const ids = String(url.searchParams.get("organizationIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length) params.set("organization_id", `in.(${ids.join(",")})`);
  const rows = await cloudSqlRest("organization_primary_systems", request, params);
  const visibleRows = await filterRowsByVisibleParent(request, rows || [], "organizations", "organization_id");
  return { items: visibleRows.map(organizationPrimarySystemToDto) };
}

async function primarySystemsByOrganization(request, ids = []) {
  if (!ids.length) return new Map();
  const url = new URL("http://local/api/organization-primary-systems");
  url.searchParams.set("organizationIds", ids.join(","));
  const { items } = await listOrganizationPrimarySystems(request, url);
  return items.reduce((groups, system) => {
    const rows = groups.get(system.organizationId) || [];
    rows.push(system);
    groups.set(system.organizationId, rows);
    return groups;
  }, new Map());
}

async function listOrganizations(request, url) {
  const params = new URLSearchParams({
    select: ORGANIZATION_FIELDS.join(","),
    order: "updated_at.desc.nullslast,name.asc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "neq.archived");
  const rows = await cloudSqlRest("organizations", request, params);
  const ids = (rows || []).map((row) => row.id);
  const [counts, primarySystems] = await Promise.all([
    organizationContactCounts(request, ids),
    primarySystemsByOrganization(request, ids)
  ]);
  return {
    items: (rows || []).map((row) => ({
      ...organizationToDto(row, counts.get(row.id) || 0),
      primarySystems: primarySystems.get(row.id) || []
    }))
  };
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
  let visibleRows = rows || [];
  for (const [table, field] of [
    ["contacts", "contact_id"],
    ["expert_contacts", "expert_contact_id"],
    ["organizations", "organization_id"],
    ["expert_organizations", "expert_organization_id"]
  ]) {
    const candidates = visibleRows.filter((row) => row[field]);
    const visible = await visibleParentIds(request, table, candidates.map((row) => row[field]));
    visibleRows = visibleRows.filter((row) => !row[field] || visible.has(row[field]));
  }
  return { items: visibleRows.map(expertEntityLinkToDto) };
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
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  if (types.length > 500 || organizations.length > 5_000 || people.length > 5_000) {
    throw Object.assign(new Error("Stakeholder-Import ueberschreitet das erlaubte Datensatzlimit."), { status: 400 });
  }

  await withDomainTransaction(async (transaction) => {
    if (types.length) {
      await cloudSqlRest("stakeholder_types", request, new URLSearchParams({ on_conflict: "id" }), {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: types,
        transaction
      });
    }
    if (organizations.length) {
      await cloudSqlRest("stakeholder_organizations", request, new URLSearchParams({ on_conflict: "id" }), {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: organizations,
        transaction
      });
    }
    if (people.length) {
      await cloudSqlRest("stakeholder_people", request, new URLSearchParams({ on_conflict: "id" }), {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: people,
        transaction
      });
    }
    await recordActivityEventInternal(transaction, request, {
      eventKey: "organization.updated",
      entityType: "stakeholder_import",
      entityId: `stakeholder-import-${Date.now()}`,
      objectLabel: "Stakeholder-Import",
      originKey: "data_import",
      details: { typeCount: types.length, organizationCount: organizations.length, peopleCount: people.length }
    });
  });

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
  assertEntityVisible(request, rows?.[0], "Organisation wurde nicht gefunden.");
  const [counts, primarySystems] = await Promise.all([
    organizationContactCounts(request, [id]),
    primarySystemsByOrganization(request, [id])
  ]);
  return {
    ...organizationToDto(rows[0], counts.get(id) || 0),
    primarySystems: primarySystems.get(id) || []
  };
}

async function createOrganizationPrimarySystem(request) {
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  const input = await readValidatedJsonBody(request, ORGANIZATION_PRIMARY_SYSTEM_INPUT_FIELDS, "Primärsystem");
  const payload = {
    ...organizationPrimarySystemToDb(input),
    created_by: userId,
    updated_by: userId
  };
  const rows = await cloudSqlRest("organization_primary_systems", request, new URLSearchParams({
    select: ORGANIZATION_PRIMARY_SYSTEM_FIELDS.join(",")
  }), {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: payload
  });
  if (!rows?.[0]) throw Object.assign(new Error("Primärsystem wurde nicht angelegt."), { status: 500 });
  return organizationPrimarySystemToDto(rows[0]);
}

async function patchOrganizationPrimarySystem(request, id) {
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  const input = await readValidatedJsonBody(request, ORGANIZATION_PRIMARY_SYSTEM_INPUT_FIELDS, "Primärsystem-Update");
  const payload = {
    ...organizationPrimarySystemToDb(input, { includeOrganization: false }),
    updated_by: userId,
    updated_at: new Date().toISOString()
  };
  const rows = await cloudSqlRest("organization_primary_systems", request, new URLSearchParams({
    id: `eq.${id}`,
    select: ORGANIZATION_PRIMARY_SYSTEM_FIELDS.join(",")
  }), {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: payload
  });
  if (!rows?.[0]) throw Object.assign(new Error("Primärsystem wurde nicht gefunden."), { status: 404 });
  return organizationPrimarySystemToDto(rows[0]);
}

async function deleteOrganizationPrimarySystem(request, id) {
  await cloudSqlRest("organization_primary_systems", request, new URLSearchParams({ id: `eq.${id}` }), {
    method: "DELETE",
    headers: { prefer: "return=minimal" }
  });
  return { ok: true };
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
  assertEntityVisible(request, rows?.[0], "Format wurde nicht gefunden.");
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
  const row = await withDomainTransaction(async (transaction) => {
    const rows = await cloudSqlRest("formats", request, new URLSearchParams({
      select: FORMAT_FIELDS.join(",")
    }), {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: payload,
      transaction
    });
    const created = rows?.[0];
    await recordActivityEventInternal(transaction, request, {
      eventKey: "format.created",
      entityType: "format",
      entityId: created.id,
      objectLabel: created.title
    });
    return created;
  });
  const dto = formatToDto(row, []);
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
  const domainPatch = formatPatchToDb(rawPatch);
  if (!Object.keys(domainPatch).length) {
    const error = new Error("Keine unterstützten Formatfelder im Request.");
    error.status = 400;
    throw error;
  }
  const payload = {
    ...domainPatch,
    updated_by: userId,
    updated_at: new Date().toISOString()
  };
  const row = await withDomainTransaction(async (transaction) => {
    const updateParams = new URLSearchParams({ id: `eq.${id}`, select: FORMAT_FIELDS.join(",") });
    if (previous?.updatedAt) updateParams.set("updated_at", `eq.${previous.updatedAt}`);
    const rows = await cloudSqlRest("formats", request, updateParams, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: payload,
      transaction
    });
    if (!rows?.[0]) {
      const error = new Error("Format wurde zwischenzeitlich geändert. Bitte neu laden.");
      error.status = 409;
      throw error;
    }
    await recordActivityEventInternal(transaction, request, {
      eventKey: "format.updated",
      entityType: "format",
      entityId: id,
      objectLabel: rows[0].title,
      details: { changedFields: Object.keys(domainPatch) }
    });
    return rows[0];
  });
  const participantGroups = await formatParticipantsByFormat(request, [id]);
  const dto = formatToDto(row, participantGroups.get(id) || []);
  if (shouldNotify) await notifyFormatChanged(request, dto, userId, "update", previous);
  return dto;
}

async function deleteFormat(request, id) {
  await withDomainTransaction(async (transaction) => {
    const existing = await cloudSqlRest("formats", request, new URLSearchParams({
      id: `eq.${id}`,
      select: "id,title",
      limit: "1"
    }), { transaction });
    if (!existing?.[0]) throw Object.assign(new Error("Format wurde nicht gefunden."), { status: 404 });
    await cloudSqlRest("formats", request, new URLSearchParams({ id: `eq.${id}` }), {
      method: "DELETE",
      headers: { prefer: "return=minimal" },
      transaction
    });
    await recordActivityEventInternal(transaction, request, {
      eventKey: "format.updated",
      entityType: "format",
      entityId: id,
      objectLabel: existing[0].title,
      details: { action: "delete" }
    });
  });
  return { ok: true };
}

async function mutateFormatParticipants(request, formatId, userId, action, work) {
  await withDomainTransaction(async (transaction) => {
    await work(transaction);
    const rows = await cloudSqlRest("formats", request, new URLSearchParams({
      id: `eq.${formatId}`,
      select: FORMAT_FIELDS.join(",")
    }), {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: { updated_by: userId, updated_at: new Date().toISOString() },
      transaction
    });
    if (!rows?.[0]) throw Object.assign(new Error("Format wurde nicht gefunden."), { status: 404 });
    await recordActivityEventInternal(transaction, request, {
      eventKey: "format.updated",
      entityType: "format",
      entityId: formatId,
      objectLabel: rows[0].title,
      details: { participantAction: action }
    });
  });
  const updated = await getFormat(request, formatId);
  await notifyFormatChanged(request, updated, userId, "participant");
  return updated;
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
  return mutateFormatParticipants(request, formatId, userId, "add", async (transaction) => {
    await cloudSqlRest("format_participants", request, new URLSearchParams({ on_conflict: "format_id,contact_id" }), {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
      body: payload,
      transaction
    });
  });
}

async function importFormatParticipants(request, formatId) {
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const body = await readValidatedJsonBody(request, ["items"], "Format-Einladungsimport");
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 500) {
    const error = new Error("Der Format-Einladungsimport muss zwischen 1 und 500 Einträge enthalten.");
    error.status = 400;
    throw error;
  }
  const now = new Date().toISOString();
  const payload = items.map((item) => {
    const contactId = item?.contactId || item?.contact_id;
    if (!contactId) {
      const error = new Error("Kontakt-ID für einen importierten Format-Teilnehmer fehlt.");
      error.status = 400;
      throw error;
    }
    const row = formatParticipantToDb(item, formatId, contactId);
    delete row.id;
    return { ...row, updated_by: userId, updated_at: now };
  });
  return mutateFormatParticipants(request, formatId, userId, "import", async (transaction) => {
    await cloudSqlRest("format_participants", request, new URLSearchParams({ on_conflict: "format_id,contact_id" }), {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: payload,
      transaction
    });
  });
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
  return mutateFormatParticipants(request, formatId, userId, "update", async (transaction) => {
    const rows = await cloudSqlRest("format_participants", request, new URLSearchParams({
      format_id: `eq.${formatId}`,
      contact_id: `eq.${contactId}`
    }), {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: payload,
      transaction
    });
    if (!rows?.[0]) throw Object.assign(new Error("Format-Teilnehmer wurde nicht gefunden."), { status: 404 });
  });
}

async function removeFormatParticipant(request, formatId, contactId) {
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  return mutateFormatParticipants(request, formatId, userId, "remove", async (transaction) => {
    const existing = await cloudSqlRest("format_participants", request, new URLSearchParams({
      format_id: `eq.${formatId}`,
      contact_id: `eq.${contactId}`,
      select: "id",
      limit: "1"
    }), { transaction });
    if (!existing?.[0]) throw Object.assign(new Error("Format-Teilnehmer wurde nicht gefunden."), { status: 404 });
    await cloudSqlRest("format_participants", request, new URLSearchParams({
      format_id: `eq.${formatId}`,
      contact_id: `eq.${contactId}`
    }), {
      method: "DELETE",
      headers: { prefer: "return=minimal" },
      transaction
    });
  });
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
  assertEntityVisible(request, rows?.[0], "Hospitations-Termin wurde nicht gefunden.");
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

async function deleteHospitationSlot(request, id) {
  await cloudSqlRest("hospitation_slots", request, new URLSearchParams({ id: `eq.${id}` }), {
    method: "DELETE",
    headers: { prefer: "return=minimal" }
  });
  return { ok: true };
}

function hospitationOccupiesSlot(status = "") {
  return ["Gebucht", "Durchgeführt", "Dokumentiert"].includes(normalizeHospitationStatus(status));
}

async function syncHospitationSlotStatus(request, slotId = "", status = "", transaction = null) {
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
    },
    transaction
  });
}

async function releaseHospitationSlot(request, slotId = "", transaction = null) {
  if (!slotId) return;
  await cloudSqlRest("hospitation_slots", request, new URLSearchParams({ id: `eq.${slotId}` }), {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: {
      status: "Frei",
      updated_by: userIdFromToken(request),
      updated_at: new Date().toISOString()
    },
    transaction
  });
}

function hospitationActivityEventKey(status = "", fallback = "hospitation.updated") {
  return {
    Geplant: "hospitation.scheduled",
    Gebucht: "hospitation.scheduled",
    Durchgeführt: "hospitation.completed",
    Dokumentiert: "hospitation.documented",
    Abgesagt: "hospitation.cancelled"
  }[normalizeHospitationStatus(status)] || fallback;
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
  assertEntityVisible(request, rows?.[0], "Hospitation wurde nicht gefunden.");
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
  const row = await withDomainTransaction(async (transaction) => {
    const rows = await cloudSqlRest("hospitations", request, new URLSearchParams({
      select: HOSPITATION_FIELDS.join(",")
    }), {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: payload,
      transaction
    });
    if (!rows?.[0]) throw Object.assign(new Error("Hospitation wurde nicht angelegt."), { status: 500 });
    await syncHospitationSlotStatus(request, rows[0].slot_id, rows[0].status, transaction);
    await recordActivityEventInternal(transaction, request, {
      eventKey: "hospitation.created",
      entityType: "hospitation",
      entityId: rows[0].id,
      objectLabel: rows[0].title || rows[0].contact_name || rows[0].organization_name || "Hospitation"
    });
    return rows[0];
  });
  const dto = hospitationToDto(row);
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
  const previous = await getHospitation(request, id);
  if (Object.prototype.hasOwnProperty.call(rawPatch, "status") &&
      normalizeHospitationStatus(rawPatch.status) !== normalizeHospitationStatus(previous.status) &&
      [normalizeHospitationStatus(rawPatch.status), normalizeHospitationStatus(previous.status)].includes("Archiviert") &&
      request.currentProfile?.role !== "admin") {
    throw Object.assign(new Error("Archivieren und Wiederherstellen ist nur fuer Admins erlaubt."), { status: 403 });
  }
  const payload = await hydrateHospitationFromSlot(request, hospitationPatchToDb(rawPatch));
  if (normalizeHospitationStatus(rawPatch.status) === "Dokumentiert") {
    if (!("documentedAt" in rawPatch) && !("documented_at" in rawPatch)) payload.documented_at = new Date().toISOString();
    if (!("documentedBy" in rawPatch) && !("documented_by" in rawPatch)) payload.documented_by = userId;
  }
  payload.updated_by = userId;
  payload.updated_at = new Date().toISOString();
  const row = await withDomainTransaction(async (transaction) => {
    const rows = await cloudSqlRest("hospitations", request, new URLSearchParams({
      id: `eq.${id}`,
      select: HOSPITATION_FIELDS.join(",")
    }), {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: payload,
      transaction
    });
    if (!rows?.[0]) throw Object.assign(new Error("Hospitation wurde nicht aktualisiert."), { status: 404 });
    const nextSlotId = rows[0].slot_id || "";
    if (previous.slotId && (previous.slotId !== nextSlotId || (hospitationOccupiesSlot(previous.status) && !hospitationOccupiesSlot(rows[0].status)))) {
      await releaseHospitationSlot(request, previous.slotId, transaction);
    }
    await syncHospitationSlotStatus(request, nextSlotId, rows[0].status, transaction);
    await recordActivityEventInternal(transaction, request, {
      eventKey: hospitationActivityEventKey(rows[0].status),
      entityType: "hospitation",
      entityId: rows[0].id,
      objectLabel: rows[0].title || rows[0].contact_name || rows[0].organization_name || "Hospitation"
    });
    return rows[0];
  });
  const dto = hospitationToDto(row);
  return dto;
}

async function deleteHospitation(request, id) {
  await withDomainTransaction(async (transaction) => {
    const existing = await cloudSqlRest("hospitations", request, new URLSearchParams({
      id: `eq.${id}`,
      select: "id,title,contact_name,organization_name,slot_id",
      limit: "1"
    }), { transaction });
    if (!existing?.[0]) throw Object.assign(new Error("Hospitation wurde nicht gefunden."), { status: 404 });
    await cloudSqlRest("hospitations", request, new URLSearchParams({ id: `eq.${id}` }), {
      method: "DELETE",
      headers: { prefer: "return=minimal" },
      transaction
    });
    await releaseHospitationSlot(request, existing[0].slot_id, transaction);
    await recordActivityEventInternal(transaction, request, {
      eventKey: "hospitation.updated",
      entityType: "hospitation",
      entityId: id,
      objectLabel: existing[0].title || existing[0].contact_name || existing[0].organization_name || "Hospitation",
      details: { action: "delete" }
    });
  });
  return { ok: true };
}

async function listHospitationObservations(request, url) {
  const params = new URLSearchParams({
    select: HOSPITATION_OBSERVATION_FIELDS.join(","),
    order: "updated_at.desc"
  });
  if (url.searchParams.get("includeArchived") !== "true") params.set("status", "eq.active");
  if (url.searchParams.get("hospitationId")) params.set("hospitation_id", `eq.${url.searchParams.get("hospitationId")}`);
  const rows = await cloudSqlRest("hospitation_observations", request, params);
  const visibleRows = await filterRowsByVisibleParent(request, rows || [], "hospitations", "hospitation_id");
  return { items: visibleRows.map(hospitationObservationToDto) };
}

async function patchHospitationObservation(request, id) {
  const patch = await readValidatedJsonBody(request, HOSPITATION_OBSERVATION_INPUT_FIELDS, "Beobachtungs-Update");
  const expectedUpdatedAt = String(patch.expectedUpdatedAt || "").trim();
  const userId = userIdFromToken(request);
  if (!userId) throw Object.assign(new Error("User-ID konnte nicht aus dem Token gelesen werden."), { status: 401 });
  const row = await withDomainTransaction(async (transaction) => {
    const currentRows = await cloudSqlRest("hospitation_observations", request, new URLSearchParams({
      id: `eq.${id}`,
      select: HOSPITATION_OBSERVATION_FIELDS.join(","),
      limit: "1"
    }), { transaction });
    if (!currentRows?.[0]) throw Object.assign(new Error("Beobachtung wurde nicht gefunden."), { status: 404 });
    if (expectedUpdatedAt && currentRows[0].updated_at !== expectedUpdatedAt) {
      throw Object.assign(new Error("Die Beobachtung wurde zwischenzeitlich geändert. Bitte neu laden."), { status: 409 });
    }
    const current = hospitationObservationToDto(currentRows[0]);
    const payload = hospitationObservationToDb({ ...current, ...patch, id }, current.hospitationId);
    delete payload.id;
    payload.updated_by = userId;
    payload.updated_at = new Date().toISOString();
    if (payload.status === "archived") {
      payload.archived_at = currentRows[0].archived_at || payload.updated_at;
      payload.archived_by = userId;
    } else {
      payload.archived_at = null;
      payload.archived_by = null;
    }
    const updateParams = new URLSearchParams({
      id: `eq.${id}`,
      updated_at: `eq.${currentRows[0].updated_at}`,
      select: HOSPITATION_OBSERVATION_FIELDS.join(",")
    });
    const rows = await cloudSqlRest("hospitation_observations", request, updateParams, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: payload,
      transaction
    });
    if (!rows?.[0]) throw Object.assign(new Error("Die Beobachtung wurde zwischenzeitlich geändert. Bitte neu laden."), { status: 409 });
    await recordActivityEventInternal(transaction, request, {
      eventKey: "hospitation.updated",
      entityType: "hospitation_observation",
      entityId: id,
      objectLabel: rows[0].title || "Beobachtung",
      details: { hospitationId: rows[0].hospitation_id }
    });
    return rows[0];
  });
  return hospitationObservationToDto(row);
}

async function syncHospitationObservations(request, hospitationId) {
  const body = await readValidatedJsonBody(request, ["observations"], "Beobachtungssynchronisation");
  const observations = Array.isArray(body.observations) ? body.observations : [];
  if (observations.length > 500) throw Object.assign(new Error("Hoechstens 500 Beobachtungen pro Synchronisation."), { status: 400 });
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const now = new Date().toISOString();
  const rows = observations.map((observation) => ({
    ...hospitationObservationToDb(observation, hospitationId),
    created_by: userId,
    updated_by: userId,
    updated_at: now,
    status: "active",
    archived_at: null,
    archived_by: null
  }));
  return withDomainTransaction(async (transaction) => {
    if (rows.length) {
      const upsertedRows = await cloudSqlRest("hospitation_observations", request, new URLSearchParams({
        select: HOSPITATION_OBSERVATION_FIELDS.join(","),
        on_conflict: "id"
      }), {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: rows,
        transaction,
        conflictMatchFields: ["hospitation_id"],
        conflictPreserveFields: ["created_at", "created_by"]
      });
      if (upsertedRows.length !== rows.length) {
        const error = new Error("Mindestens eine Beobachtungs-ID gehört bereits zu einer anderen Hospitation.");
        error.status = 409;
        throw error;
      }
    }
    const archiveParams = new URLSearchParams({ hospitation_id: `eq.${hospitationId}`, status: "eq.active" });
    if (rows.length) archiveParams.set("id", `not.in.(${rows.map((row) => `"${row.id.replaceAll('"', '\\"')}"`).join(",")})`);
    await cloudSqlRest("hospitation_observations", request, archiveParams, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: { status: "archived", archived_at: now, archived_by: userId, updated_by: userId, updated_at: now },
      transaction
    });
    const activeRows = await cloudSqlRest("hospitation_observations", request, new URLSearchParams({
      hospitation_id: `eq.${hospitationId}`,
      status: "eq.active",
      select: HOSPITATION_OBSERVATION_FIELDS.join(","),
      order: "sequence.asc.nullslast,created_at.asc"
    }), { transaction });
    const result = { items: (activeRows || []).map(hospitationObservationToDto) };
    await recordActivityEventInternal(transaction, request, {
      eventKey: "hospitation.updated",
      entityType: "hospitation",
      entityId: hospitationId,
      objectLabel: "Hospitation",
      details: { action: "observations.sync", activeCount: result.items.length }
    });
    return result;
  });
}

async function listRoadmapItems(request, url) {
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const params = new URLSearchParams({
    select: ROADMAP_ITEM_FIELDS.join(","),
    order: "sort_order.asc.nullslast,product_name.asc.nullslast"
  });
  if (!includeInactive) params.set("active", "eq.true");
  const rows = await cloudSqlRest("roadmap_items", request, params);
  return { items: (rows || []).map(roadmapItemToDto) };
}

async function listHospitationRoadmapAssessments(request, url) {
  const params = new URLSearchParams({
    select: HOSPITATION_ROADMAP_ASSESSMENT_FIELDS.join(","),
    order: "updated_at.desc.nullslast"
  });
  const hospitationId = url.searchParams.get("hospitationId");
  if (hospitationId) params.set("hospitation_id", `eq.${hospitationId}`);
  const rows = await cloudSqlRest("hospitation_roadmap_assessments", request, params);
  const visibleRows = await filterRowsByVisibleParent(request, rows || [], "hospitations", "hospitation_id");
  return { items: visibleRows.map(hospitationRoadmapAssessmentToDto) };
}

async function replaceHospitationRoadmapAssessments(request, hospitationId) {
  const body = await readValidatedJsonBody(request, ["items"], "Roadmap-Bewertungen");
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 500) throw Object.assign(new Error("Hoechstens 500 Roadmap-Bewertungen pro Vorgang."), { status: 400 });
  items.forEach((item, index) => assertAllowedFields(item, HOSPITATION_ROADMAP_ASSESSMENT_INPUT_FIELDS, `Roadmap-Bewertung ${index + 1}`));
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const seenRoadmapItems = new Set();
  const payload = items
    .map((item) => hospitationRoadmapAssessmentToDb(item, hospitationId))
    .filter((item) => {
      if (!item.hospitation_id || !item.roadmap_item_id || seenRoadmapItems.has(item.roadmap_item_id)) return false;
      seenRoadmapItems.add(item.roadmap_item_id);
      return true;
    })
    .map((item) => ({ ...item, created_by: userId, updated_by: userId }));
  return withDomainTransaction(async (transaction) => {
    await cloudSqlRest("hospitation_roadmap_assessments", request, new URLSearchParams({ hospitation_id: `eq.${hospitationId}` }), {
      method: "DELETE",
      headers: { prefer: "return=minimal" },
      transaction
    });
    const rows = payload.length ? await cloudSqlRest("hospitation_roadmap_assessments", request, new URLSearchParams({
      select: HOSPITATION_ROADMAP_ASSESSMENT_FIELDS.join(",")
    }), {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: payload,
      transaction
    }) : [];
    const result = { items: (rows || []).map(hospitationRoadmapAssessmentToDto) };
    await recordActivityEventInternal(transaction, request, {
      eventKey: "hospitation.updated",
      entityType: "hospitation",
      entityId: hospitationId,
      objectLabel: "Hospitation",
      details: { action: "roadmap-assessments.replace", itemCount: result.items.length }
    });
    return result;
  });
}

async function listHospitationUnmetNeeds(request, url) {
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const params = new URLSearchParams({
    select: HOSPITATION_UNMET_NEED_FIELDS.join(","),
    order: "updated_at.desc.nullslast"
  });
  const hospitationId = url.searchParams.get("hospitationId");
  if (hospitationId) params.set("hospitation_id", `eq.${hospitationId}`);
  if (!includeArchived) params.set("status", "neq.Archiviert");
  const rows = await cloudSqlRest("hospitation_unmet_needs", request, params);
  const visibleRows = await filterRowsByVisibleParent(request, rows || [], "hospitations", "hospitation_id");
  return { items: visibleRows.map(hospitationUnmetNeedToDto) };
}

async function replaceHospitationUnmetNeeds(request, hospitationId) {
  const body = await readValidatedJsonBody(request, ["items"], "Mögliche Impulse");
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 500) throw Object.assign(new Error("Hoechstens 500 Impulse pro Vorgang."), { status: 400 });
  items.forEach((item, index) => assertAllowedFields(item, HOSPITATION_UNMET_NEED_INPUT_FIELDS, `Möglicher Impuls ${index + 1}`));
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus dem Token gelesen werden.");
    error.status = 401;
    throw error;
  }
  const payload = items
    .map((item) => hospitationUnmetNeedToDb(item, hospitationId))
    .filter((item) => item.hospitation_id && item.title)
    .map((item) => ({ ...item, created_by: userId, updated_by: userId }));
  return withDomainTransaction(async (transaction) => {
    await cloudSqlRest("hospitation_unmet_needs", request, new URLSearchParams({ hospitation_id: `eq.${hospitationId}` }), {
      method: "DELETE",
      headers: { prefer: "return=minimal" },
      transaction
    });
    const rows = payload.length ? await cloudSqlRest("hospitation_unmet_needs", request, new URLSearchParams({
      select: HOSPITATION_UNMET_NEED_FIELDS.join(",")
    }), {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: payload,
      transaction
    }) : [];
    const result = { items: (rows || []).map(hospitationUnmetNeedToDto) };
    await recordActivityEventInternal(transaction, request, {
      eventKey: "hospitation.updated",
      entityType: "hospitation",
      entityId: hospitationId,
      objectLabel: "Hospitation",
      details: { action: "unmet-needs.replace", itemCount: result.items.length }
    });
    return result;
  });
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
  const hasConsentInput = Object.keys(contact).some((field) => field.startsWith("mitmachenConsent") || field.startsWith("mitmachen_consent_"));
  if (hasConsentInput && dbContact.mitmachen_consent_status !== "not_requested") {
    dbContact.mitmachen_consent_recorded_by = userId;
  }
  validateMitmachenConsent(dbContact);
  dbContact.created_by = userId;
  dbContact.updated_by = userId;

  const created = await withDomainTransaction(async (transaction) => {
    const rows = await cloudSqlRest("contacts", request, new URLSearchParams({
      select: CONTACT_FIELDS.join(",")
    }), {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: dbContact,
      transaction
    });
    const row = rows?.[0];
    if (!row) {
      const error = new Error("Kontakt wurde nicht angelegt.");
      error.status = 500;
      throw error;
    }
    await cloudSqlRest("changes", request, new URLSearchParams(), {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: {
        contact_id: row.id,
        action: options.action === "import" ? "import" : "create",
        field_name: null,
        old_value: "",
        new_value: options.batchId ? `${row.name || row.id} · Batch ${options.batchId}` : row.name || row.id,
        changed_by: userId
      },
      transaction
    });
    await replaceStoredContactOwners(request, row.id, [], ownerIds, userId, { log: false, transaction });
    await recordActivityEventInternal(transaction, request, {
      eventKey: "contact.created",
      entityType: "contact",
      entityId: row.id,
      objectLabel: row.name,
      originKey: options.action === "import" ? "data_import" : "manual",
      originRef: options.batchId || ""
    });
    return row;
  });
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
  assertEntityVisible(request, rows?.[0], "Kontakt wurde nicht gefunden.");
  return (await decorateRowsWithStoredOwners(request, rows || []))[0];
}

async function getContactHistory(request, id, url) {
  await loadProfiles(request);
  await assertContactHistoryVisible(request, id);
  const activityEventsMaxId = await loadActivityMaxId(request, "activity_events", { optional: true });
  const changeParams = new URLSearchParams({
    select: `${CHANGE_FIELDS.join(",")},contacts(id,name,organization,sector,specialty,city,federal_state,image_url,status)`,
    contact_id: `eq.${id}`,
    order: "changed_at.desc,id.desc"
  });
  const eventParams = new URLSearchParams({
    select: `${ACTIVITY_EVENT_FIELDS.join(",")},contacts(id,name,organization,sector,specialty,city,federal_state,image_url,status)`,
    contact_id: `eq.${id}`,
    order: "occurred_at.desc,id.desc"
  });
  eventParams.append("id", `lte.${activityEventsMaxId}`);
  const [changeRows, eventRows] = await Promise.all([
    cloudSqlRest("changes", request, changeParams),
    loadActivityEventRows(request, eventParams)
  ]);
  const filters = {
    kind: String(url.searchParams.get("kind") || url.searchParams.get("action") || "").trim(),
    eventKey: String(url.searchParams.get("eventKey") || "").trim(),
    category: String(url.searchParams.get("category") || "").trim(),
    origin: String(url.searchParams.get("origin") || "").trim(),
    title: String(url.searchParams.get("title") || "").trim(),
    changedBy: String(url.searchParams.get("changedBy") || "").trim(),
    from: String(url.searchParams.get("from") || "").trim(),
    to: String(url.searchParams.get("to") || "").trim(),
    q: String(url.searchParams.get("q") || "").trim()
  };
  return {
    items: sortActivities([
      ...(eventRows || []).map(activityEventToDto),
      ...(changeRows || [])
        .filter((row) => legacyChangeVisibleAtSnapshot(row, activityEventsMaxId))
        .map(legacyChangeToActivity)
    ].filter((activity) => activityMatchesFilters(activity, filters)))
  };
}

function activityMatchesFilters(activity, filters = {}) {
  const kind = String(filters.kind || filters.action || "").trim();
  const eventKey = String(filters.eventKey || "").trim();
  const category = String(filters.category || "").trim();
  const origin = String(filters.origin || "").trim();
  const title = String(filters.title || "").trim().toLowerCase();
  const changedBy = String(filters.changedBy || "").trim();
  const from = String(filters.from || "").trim();
  const to = String(filters.to || "").trim();
  const query = String(filters.q || "").trim().toLowerCase();
  if (kind && ![activity.kind, activity.action, activity.actionKey].includes(kind)) return false;
  if (eventKey && activity.eventKey !== eventKey) return false;
  if (category && ![activity.categoryKey, activity.category?.key].includes(category)) return false;
  if (origin && ![activity.originKey, activity.origin?.key].includes(origin)) return false;
  if (title && !String(activity.title || "").toLowerCase().includes(title)) return false;
  if (changedBy && ![activity.changedBy, activity.actorId, activity.actor?.id, activity.user?.id].includes(changedBy)) return false;
  const occurredAt = activity.occurredAt || activity.changedAt || "";
  if (from && new Date(occurredAt).getTime() < new Date(from).getTime()) return false;
  if (to && new Date(occurredAt).getTime() > new Date(to).getTime()) return false;
  if (!query) return true;
  return [
    activity.eventKey,
    activity.categoryKey,
    activity.category?.label,
    activity.originKey,
    activity.origin?.label,
    activity.title,
    activity.objectType,
    activity.objectId,
    activity.object?.label,
    activity.contactId,
    activity.action,
    activity.actionKey,
    activity.kind,
    activity.fieldName,
    activity.oldValue,
    activity.newValue,
    activity.changedBy,
    activity.user?.displayName,
    activity.user?.email,
    activity.user?.role,
    activity.contact?.name,
    activity.contact?.organization,
    activity.contact?.sector,
    activity.contact?.specialty,
    activity.contact?.city,
    activity.contact?.state
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function sortActivities(items = []) {
  return items.sort(compareActivities);
}

function compareActivities(left, right) {
  const rightTime = new Date(right.occurredAt || right.changedAt || "").getTime();
  const leftTime = new Date(left.occurredAt || left.changedAt || "").getTime();
  const time = (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  return time || String(right.id || "").localeCompare(String(left.id || ""), "de", { numeric: true });
}

function legacyChangeVisibleAtSnapshot(row = {}, activityEventsMaxId = "0") {
  if (!row.activity_event_id && !row.activityEventId) return true;
  const linkedEventId = String(row.activity_event_id || row.activityEventId || "");
  const maxId = String(activityEventsMaxId || "0");
  if (!/^\d+$/.test(linkedEventId) || !/^\d+$/.test(maxId)) return false;
  return BigInt(linkedEventId) > BigInt(maxId);
}

function activityRowVisibleToRequest(row = {}, request) {
  if (roleRank(request.currentProfile?.role) >= roleRank("admin")) return true;
  const contactId = row.contact_id || row.contactId || "";
  if (!contactId) return true;
  const contact = row.contacts || row.contact || null;
  return Boolean(contact && contact.status !== "archived");
}

async function assertContactHistoryVisible(request, contactId) {
  const rows = await cloudSqlRest("contacts", request, new URLSearchParams({
    select: "id,status",
    id: `eq.${contactId}`,
    limit: "1"
  }));
  const contact = rows?.[0];
  if (!contact || (contact.status === "archived" && roleRank(request.currentProfile?.role) < roleRank("admin"))) {
    const error = new Error("Kontakt wurde nicht gefunden.");
    error.status = 404;
    throw error;
  }
}

function normalizedActivityFilterSignature(filters = {}) {
  const serialized = JSON.stringify({
    kind: String(filters.kind || "").trim(),
    eventKey: String(filters.eventKey || "").trim(),
    category: String(filters.category || "").trim(),
    origin: String(filters.origin || "").trim(),
    title: String(filters.title || "").trim(),
    changedBy: String(filters.changedBy || "").trim(),
    from: String(filters.from || "").trim(),
    to: String(filters.to || "").trim(),
    q: String(filters.q || "").trim()
  });
  return crypto.createHash("sha256").update(serialized).digest("base64url").slice(0, 22);
}

function encodeActivityCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeActivityCursor(value, filterSignature) {
  const token = String(value || "").trim();
  if (!token) return null;
  if (token.length > 2048) throw validationError("Der Aktivitäten-Cursor ist ungültig.");
  try {
    const payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    const source = (entry) => {
      const offset = Number(entry?.offset);
      const maxId = String(entry?.maxId || "");
      if (!Number.isSafeInteger(offset) || offset < 0 || !/^\d{1,40}$/.test(maxId)) throw new Error("invalid source cursor");
      return { offset, maxId, exhausted: entry?.exhausted === true };
    };
    const offset = Number(payload?.offset);
    const snapshotAt = String(payload?.snapshotAt || "");
    if (
      payload?.version !== 3 ||
      payload?.filterSignature !== filterSignature ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isFinite(new Date(snapshotAt).getTime())
    ) {
      throw new Error("invalid cursor payload");
    }
    return {
      offset,
      snapshotAt,
      sources: {
        changes: source(payload.sources?.changes),
        activityEvents: source(payload.sources?.activityEvents)
      }
    };
  } catch (_error) {
    throw validationError("Der Aktivitäten-Cursor ist ungültig oder passt nicht zu den aktiven Filtern.");
  }
}

function createPagedActivitySource({ loadPage, normalize, filters, rawVisible = () => true, cursor = {}, maxId = "0" }) {
  return {
    loadPage,
    normalize,
    filters,
    rawVisible,
    maxId: String(cursor.maxId || maxId),
    scanOffset: Number.isSafeInteger(cursor.offset) && cursor.offset >= 0 ? cursor.offset : 0,
    exhausted: cursor.exhausted === true,
    buffer: []
  };
}

async function ensureActivitySourceHead(source) {
  while (!source.buffer.length && !source.exhausted) {
    const pageStart = source.scanOffset;
    const rows = await source.loadPage(pageStart);
    source.scanOffset += rows.length;
    source.exhausted = rows.length < ACTIVITY_PAGE_SIZE;
    source.buffer = rows
      .map((row, index) => ({ row, rawOffset: pageStart + index }))
      .filter((entry) => source.rawVisible(entry.row))
      .map((entry) => ({ activity: source.normalize(entry.row), rawOffset: entry.rawOffset }))
      .filter((entry) => activityMatchesFilters(entry.activity, source.filters));
  }
  return source.buffer[0]?.activity || null;
}

async function nextMergedActivity(sources) {
  const heads = await Promise.all(sources.map(ensureActivitySourceHead));
  let selectedIndex = -1;
  heads.forEach((head, index) => {
    if (!head) return;
    if (selectedIndex < 0 || compareActivities(head, heads[selectedIndex]) < 0) selectedIndex = index;
  });
  if (selectedIndex < 0) return null;
  return sources[selectedIndex].buffer.shift().activity;
}

function activitySourceCursor(source) {
  const nextEntry = source.buffer[0];
  return {
    offset: nextEntry ? nextEntry.rawOffset : source.scanOffset,
    maxId: source.maxId,
    exhausted: !nextEntry && source.exhausted
  };
}

async function readMergedActivityPage(sources, options = {}) {
  const skip = Math.max(Number(options.skip) || 0, 0);
  const limit = Math.max(Number(options.limit) || 0, 0);
  for (let index = 0; index < skip; index += 1) {
    if (!await nextMergedActivity(sources)) break;
  }
  const items = [];
  while (items.length < limit) {
    const activity = await nextMergedActivity(sources);
    if (!activity) break;
    items.push(activity);
  }
  const sourceCursors = sources.map(activitySourceCursor);
  const hasMore = Boolean(await nextMergedActivity(sources));
  return { items, hasMore, sourceCursors };
}

async function loadActivityEventRows(request, params) {
  try {
    return await cloudSqlRest("activity_events", request, params) || [];
  } catch (error) {
    if (isMissingActivityEventsError(error)) return [];
    throw error;
  }
}

async function loadActivityMaxId(request, table, { optional = false } = {}) {
  const params = new URLSearchParams({ select: "id", order: "id.desc", limit: "1" });
  const rows = optional
    ? await loadActivityEventRows(request, params)
    : await cloudSqlRest(table, request, params);
  return String(rows?.[0]?.id || "0");
}

async function getActivities(request, url) {
  await loadProfiles(request);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const kind = String(url.searchParams.get("kind") || url.searchParams.get("action") || "").trim();
  const eventKey = String(url.searchParams.get("eventKey") || "").trim();
  const category = String(url.searchParams.get("category") || "").trim();
  const origin = String(url.searchParams.get("origin") || "").trim();
  const title = String(url.searchParams.get("title") || "").trim();
  const changedBy = String(url.searchParams.get("changedBy") || "").trim();
  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  const q = String(url.searchParams.get("q") || "").trim();
  const filters = { kind, eventKey, category, origin, title, changedBy, from, to, q };
  const filterSignature = normalizedActivityFilterSignature(filters);
  const cursor = decodeActivityCursor(url.searchParams.get("cursor"), filterSignature);
  if (cursor && url.searchParams.has("offset") && offset !== cursor.offset) {
    throw validationError("Der Aktivitäten-Cursor passt nicht zum angeforderten Offset.");
  }
  const pageOffset = cursor?.offset ?? offset;
  const snapshotAt = cursor?.snapshotAt || new Date().toISOString();
  const [changesMaxId, activityEventsMaxId] = cursor
    ? [cursor.sources.changes.maxId, cursor.sources.activityEvents.maxId]
    : await Promise.all([
      loadActivityMaxId(request, "changes"),
      loadActivityMaxId(request, "activity_events", { optional: true })
    ]);
  const changeParams = new URLSearchParams({
    select: `${CHANGE_FIELDS.join(",")},contacts(id,name,organization,sector,specialty,city,federal_state,image_url,status)`,
    order: "changed_at.desc,id.desc"
  });
  if (changedBy) changeParams.set("changed_by", `eq.${changedBy}`);
  changeParams.append("id", `lte.${changesMaxId}`);
  if (from) changeParams.append("changed_at", `gte.${from}`);
  if (to) changeParams.append("changed_at", `lte.${to}`);

  const eventParams = new URLSearchParams({
    select: `${ACTIVITY_EVENT_FIELDS.join(",")},contacts(id,name,organization,sector,specialty,city,federal_state,image_url,status)`,
    order: "occurred_at.desc,id.desc"
  });
  if (changedBy) eventParams.set("actor_id", `eq.${changedBy}`);
  eventParams.append("id", `lte.${activityEventsMaxId}`);
  if (from) eventParams.append("occurred_at", `gte.${from}`);
  if (to) eventParams.append("occurred_at", `lte.${to}`);
  const loadPage = async (table, params, pageStart, optional = false) => {
    const pageParams = new URLSearchParams(params);
    pageParams.set("limit", String(ACTIVITY_PAGE_SIZE));
    pageParams.set("offset", String(pageStart));
    return optional
      ? loadActivityEventRows(request, pageParams)
      : cloudSqlRest(table, request, pageParams);
  };
  const changesSource = createPagedActivitySource({
    cursor: cursor?.sources.changes,
    maxId: changesMaxId,
    filters,
    rawVisible: (row) => legacyChangeVisibleAtSnapshot(row, activityEventsMaxId)
      && activityRowVisibleToRequest(row, request),
    normalize: legacyChangeToActivity,
    loadPage: (pageStart) => loadPage("changes", changeParams, pageStart)
  });
  const activityEventsSource = createPagedActivitySource({
    cursor: cursor?.sources.activityEvents,
    maxId: activityEventsMaxId,
    filters,
    rawVisible: (row) => activityRowVisibleToRequest(row, request),
    normalize: activityEventToDto,
    loadPage: (pageStart) => loadPage("activity_events", eventParams, pageStart, true)
  });
  const page = await readMergedActivityPage([changesSource, activityEventsSource], {
    skip: cursor ? 0 : offset,
    limit
  });
  const nextOffset = pageOffset + page.items.length;
  return {
    items: page.items,
    nextOffset,
    hasMore: page.hasMore,
    nextCursor: page.hasMore ? encodeActivityCursor({
      version: 3,
      offset: nextOffset,
      snapshotAt,
      filterSignature,
      sources: {
        changes: page.sourceCursors[0],
        activityEvents: page.sourceCursors[1]
      }
    }) : null
  };
}

const DOMAIN_TRANSACTION = Symbol("domain-transaction");

async function withDomainTransaction(work) {
  const client = await getPool().connect();
  const transaction = {
    [DOMAIN_TRANSACTION]: true,
    query: client.query.bind(client)
  };
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local idle_in_transaction_session_timeout = '15s'");
    const result = await work(transaction);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// Private write boundary for future domain mutations. It requires the same
// explicit transaction that persists the domain mutation and its changes rows.
async function recordActivityEventInternal(transaction, request, input = {}) {
  if (!transaction?.[DOMAIN_TRANSACTION] || typeof transaction.query !== "function") {
    throw new Error("Aktivitaetsereignisse duerfen nur innerhalb einer Fachvorgangs-Transaktion geschrieben werden.");
  }
  const userId = userIdFromToken(request);
  if (!userId) {
    const error = new Error("User-ID konnte nicht aus der authentifizierten Session gelesen werden.");
    error.status = 401;
    throw error;
  }
  const eventKey = ActivityModel.assertProducerEventKey(String(input.eventKey || input.event_key || "").trim());
  const object = input.object || {
    type: input.entityType || input.entity_type || input.objectType || input.object_type || "",
    id: input.entityId || input.entity_id || input.objectId || input.object_id || "",
    label: input.objectLabel || input.object_label || ""
  };
  const details = input.details && typeof input.details === "object" && !Array.isArray(input.details) ? input.details : {};
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};
  const actorProfile = request.currentProfile || {};
  const normalized = ActivityModel.normalizeEvent({
    ...input,
    eventKey,
    object,
    actorId: userId,
    actor: {
      id: userId,
      displayName: actorProfile.display_name || actorProfile.displayName || actorProfile.email || "Unbekannter Nutzer",
      email: actorProfile.email || "",
      role: actorProfile.role || "",
      avatarUrl: actorProfile.avatar_url || actorProfile.avatarUrl || ""
    },
    occurredAt: input.occurredAt || input.occurred_at || new Date().toISOString(),
    originKey: input.originKey || input.origin_key || input.originType || input.origin_type || input.origin || "manual",
    originRef: input.originRef || input.origin_ref || "",
    metadata: { ...details, ...metadata }
  });
  if (!normalized.object?.type || !normalized.object?.id) {
    throw new Error("Interne Aktivitaetsereignisse erfordern entityType und entityId beziehungsweise ein vollstaendiges object.");
  }
  const dbRow = ActivityModel.toDatabaseRow(normalized);
  dbRow.actor_id = userId;
  dbRow.correlation_id = String(input.correlationId || input.correlation_id || "").trim() || null;
  const { sql, values } = insertSql("activity_events", dbRow, new URLSearchParams());
  const rows = (await transaction.query(sql, values)).rows;
  if (!rows?.[0]) {
    const error = new Error("Aktivitaetsereignis wurde nicht angelegt.");
    error.status = 500;
    throw error;
  }
  return activityEventToDto(rows[0]);
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
    contactImageBucket: CONTACT_IMAGE_BUCKET || null,
    contactNoteAttachmentBucket: CONTACT_NOTE_ATTACHMENT_BUCKET || null,
    stakeholderLogoBucket: STAKEHOLDER_LOGO_BUCKET || null
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

async function countActivityEvents() {
  try {
    return await countWhere("activity_events");
  } catch (error) {
    if (isMissingActivityEventsError(error)) return 0;
    throw error;
  }
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
      organizationPrimarySystems: await countWhere("organization_primary_systems"),
      changes: await countWhere("changes"),
      activityEvents: await countActivityEvents(),
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
  const signedIdentityReady = API_AUTH_MODE === "iap"
    ? Boolean(IAP_JWT_AUDIENCE)
    : API_AUTH_MODE === "oidc"
      ? Boolean(OIDC_ISSUER && OIDC_AUDIENCE && OIDC_JWKS_URL)
      : false;
  checks.push(opsCheck("kubernetes-api", "Kubernetes API", "ok", "API-Service antwortet.", runtimeMetadata()));
  checks.push(opsCheck(
    "auth-boundary",
    "Gateway/SSO",
    signedIdentityReady ? "ok" : "warn",
    signedIdentityReady
      ? `API validiert signierte ${API_AUTH_MODE === "iap" ? "IAP" : "OIDC"}-JWTs und mappt sie auf aktive Profile.`
      : "API erwartet eine signierte Gateway-/SSO-Identitaet; Auth-Konfiguration ist unvollstaendig.",
    {
      authMode: API_AUTH_MODE,
      iapJwtAudienceConfigured: Boolean(IAP_JWT_AUDIENCE),
      oidcIssuerConfigured: Boolean(OIDC_ISSUER),
      oidcAudienceConfigured: Boolean(OIDC_AUDIENCE),
      oidcJwksConfigured: Boolean(OIDC_JWKS_URL)
    }
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
    [PROFILE_IMAGE_BUCKET, CONTACT_IMAGE_BUCKET, CONTACT_NOTE_ATTACHMENT_BUCKET, STAKEHOLDER_LOGO_BUCKET].every(Boolean) ? "ok" : "warn",
    [PROFILE_IMAGE_BUCKET, CONTACT_IMAGE_BUCKET, CONTACT_NOTE_ATTACHMENT_BUCKET, STAKEHOLDER_LOGO_BUCKET].every(Boolean)
      ? "Alle geschuetzten Storage-Buckets sind konfiguriert."
      : "Mindestens ein geschuetzter Storage-Bucket fehlt.",
    {
      profileImageBucket: PROFILE_IMAGE_BUCKET || null,
      contactImageBucket: CONTACT_IMAGE_BUCKET || null,
      contactNoteAttachmentBucket: CONTACT_NOTE_ATTACHMENT_BUCKET || null,
      stakeholderLogoBucket: STAKEHOLDER_LOGO_BUCKET || null
    }
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
    "organization_primary_systems",
    "contacts",
    "contact_owners",
    "changes",
    "activity_events",
    "contact_notes",
    "contact_note_attachments",
    "formats",
    "format_participants",
    "hospitation_slots",
    "hospitations",
    "hospitation_observations",
    "hospitation_observation_changes",
    "roadmap_items",
    "hospitation_roadmap_assessments",
    "hospitation_unmet_needs",
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
    try {
      data[table] = (await getPool().query(`select * from ${qid(table)}`)).rows;
    } catch (error) {
      if (table === "activity_events" && isMissingActivityEventsError(error)) {
        data[table] = [];
        continue;
      }
      throw error;
    }
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
  const hasConsentPatch = Object.keys(patch).some((field) => field.startsWith("mitmachenConsent") || field.startsWith("mitmachen_consent_"));
  if (hasConsentPatch) dbPatch.mitmachen_consent_recorded_by = userId;
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
  if (Object.prototype.hasOwnProperty.call(dbPatch, "status") && dbPatch.status !== oldRow.status &&
      (dbPatch.status === "archived" || oldRow.status === "archived") && request.currentProfile?.role !== "admin") {
    throw Object.assign(new Error("Archivieren und Wiederherstellen ist nur fuer Admins erlaubt."), { status: 403 });
  }
  if (hasConsentPatch) validateMitmachenConsent({ ...oldRow, ...dbPatch });
  const oldOwnerRows = await loadContactOwnerRows(request, [id]);
  const oldOwnerIds = supportsContactOwners
    ? contactOwnerMap(oldOwnerRows).get(id) || normalizeOwnerIds(oldRow.owner_id)
    : normalizeOwnerIds(oldRow.owner_id);

  dbPatch.updated_by = userId;
  dbPatch.updated_at = new Date().toISOString();
  let changedFields = Object.keys(dbPatch).filter((field) => stringifyValue(oldRow[field]) !== stringifyValue(dbPatch[field]));
  if (hasOwnerPatch && supportsContactOwners) changedFields = changedFields.filter((field) => field !== "owner_id");

  const updated = await withDomainTransaction(async (transaction) => {
    const updateParams = new URLSearchParams({ id: `eq.${id}`, select: CONTACT_FIELDS.join(",") });
    if (oldRow.updated_at) updateParams.set("updated_at", `eq.${new Date(oldRow.updated_at).toISOString()}`);
    const updatedRows = await cloudSqlRest("contacts", request, updateParams, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: dbPatch,
      transaction
    });
    const row = updatedRows?.[0];
    if (!row) {
      throw Object.assign(new Error("Kontakt wurde zwischenzeitlich geaendert. Bitte neu laden."), { status: 409 });
    }
    if (changedFields.length) {
      const action = dbPatch.status === "archived" ? "archive" : "update";
      const applicationLoggedFields = changedFields.filter((field) => !field.startsWith("mitmachen_consent_"));
      if (applicationLoggedFields.length) await cloudSqlRest("changes", request, new URLSearchParams(), {
        method: "POST",
        headers: { prefer: "return=minimal" },
        body: applicationLoggedFields.map((field) => ({
          contact_id: id,
          action,
          field_name: field,
          old_value: stringifyValue(oldRow[field]),
          new_value: stringifyValue(dbPatch[field]),
          changed_by: userId
        })),
        transaction
      });
    }
    if (hasOwnerPatch) {
      await replaceStoredContactOwners(request, id, oldOwnerIds, nextOwnerIds, userId, {
        log: supportsContactOwners,
        transaction
      });
    }
    if (changedFields.length || hasOwnerPatch) {
      await recordActivityEventInternal(transaction, request, {
        eventKey: dbPatch.status === "archived" ? "contact.archived" : "contact.updated",
        entityType: "contact",
        entityId: id,
        objectLabel: row.name,
        details: { changedFields, ownerChanged: hasOwnerPatch }
      });
    }
    return row;
  });
  if (oldRow.image_storage_path && Object.prototype.hasOwnProperty.call(dbPatch, "image_storage_path") && !dbPatch.image_storage_path) {
    await deleteStorageObject(CONTACT_IMAGE_BUCKET, oldRow.image_storage_path);
  }
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

function requestIdFromHeader(request) {
  const supplied = String(request.headers["x-request-id"] || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function assertAllowedBrowserOrigin(request) {
  const origin = String(request.headers.origin || "").trim();
  if (!origin || !ALLOWED_ORIGIN) return;
  let expected;
  try { expected = new URL(ALLOWED_ORIGIN).origin; } catch { expected = ALLOWED_ORIGIN; }
  if (origin !== expected) {
    const error = new Error("Browser-Origin ist nicht freigegeben.");
    error.status = 403;
    throw error;
  }
}

function enforceRequestRateLimit(request, url) {
  const now = Date.now();
  const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const limit = write ? RATE_LIMIT_WRITES : RATE_LIMIT_READS;
  const source = String(request.socket?.remoteAddress || "unknown").slice(0, 128);
  const key = `${source}:${write ? "write" : "read"}`;
  const current = requestRateBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS } : current;
  bucket.count += 1;
  requestRateBuckets.set(key, bucket);
  if (requestRateBuckets.size > 5000) {
    for (const [candidate, value] of requestRateBuckets) if (value.resetAt <= now) requestRateBuckets.delete(candidate);
  }
  if (bucket.count > limit) {
    const error = new Error("Zu viele Anfragen. Bitte spaeter erneut versuchen.");
    error.status = 429;
    error.retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw error;
  }
  request.rateLimit = { limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

function logRequestCompletion(request, response, url, startedAt) {
  const status = response.statusCode || 500;
  const shouldLog = LOG_REQUESTS || status >= 400 || !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (!shouldLog) return;
  const entry = {
    timestamp: new Date().toISOString(),
    severity: status >= 500 ? "ERROR" : status >= 400 ? "WARNING" : "INFO",
    event: status === 401 ? "authentication_denied" : status === 403 ? "authorization_denied" : "api_request",
    requestId: request.requestId,
    method: request.method,
    route: request.routePolicy?.id || "unmatched",
    path: normalizedRequestLogPath(url.pathname),
    status,
    durationMs: Math.max(0, Date.now() - startedAt),
    role: request.currentProfile?.role || "anonymous"
  };
  console.log(JSON.stringify(entry));
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  const startedAt = Date.now();
  request.requestId = requestIdFromHeader(request);
  response.setHeader("x-request-id", request.requestId);
  response.once("finish", () => logRequestCompletion(request, response, url, startedAt));
  try {
    assertAllowedBrowserOrigin(request);
    enforceRequestRateLimit(request, url);
    if (request.method === "OPTIONS") return jsonResponse(response, 204, {});
    const profileAvatarMatch = /^\/api\/profile-avatar\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && profileAvatarMatch) {
      return readProfileAvatar(request, response, decodeURIComponent(profileAvatarMatch[1]));
    }
    const contactImageReadMatch = /^\/api\/contact-images\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && contactImageReadMatch) {
      return readContactImage(request, response, decodeURIComponent(contactImageReadMatch[1]));
    }
    const stakeholderLogoReadMatch = /^\/api\/stakeholder-logos\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && stakeholderLogoReadMatch) {
      return readStakeholderLogo(request, response, decodeURIComponent(stakeholderLogoReadMatch[1]));
    }
    await authorizeRequest(request, url);
    if (request.method === "GET" && ["/healthz", "/api/healthz"].includes(url.pathname)) {
      return jsonResponse(response, 200, { ok: true });
    }
    if (request.method === "GET" && ["/readyz", "/api/readyz"].includes(url.pathname)) {
      await getPool().query("select 1");
      await getPool().query("select 1 from public.identity_bindings limit 0");
      return jsonResponse(response, 200, { ok: true });
    }
    if (request.method === "GET" && url.pathname === "/api/auth/bootstrap") {
      return redirectResponse(response, validatedIapBootstrapReturnUrl(url));
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
    if (request.method === "GET" && url.pathname === "/api/contact-content-search") {
      return jsonResponse(response, 200, await searchContactContent(request, url));
    }
    if (request.method === "GET" && url.pathname === "/api/contact-notes") {
      return jsonResponse(response, 200, await listContactNotes(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/contact-notes") {
      return jsonResponse(response, 201, await createContactNote(request));
    }
    const contactNoteMatch = /^\/api\/contact-notes\/([^/]+)$/.exec(url.pathname);
    if (request.method === "PATCH" && contactNoteMatch) {
      return jsonResponse(response, 200, await patchContactNote(request, decodeURIComponent(contactNoteMatch[1])));
    }
    if (request.method === "DELETE" && contactNoteMatch) {
      return jsonResponse(response, 200, await deleteContactNote(request, decodeURIComponent(contactNoteMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/contact-note-attachments") {
      return jsonResponse(response, 200, await listContactNoteAttachments(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/contact-note-attachments") {
      return jsonResponse(response, 201, await uploadContactNoteAttachment(request));
    }
    const contactNoteAttachmentContentMatch = /^\/api\/contact-note-attachments\/([^/]+)\/content$/.exec(url.pathname);
    if (request.method === "GET" && contactNoteAttachmentContentMatch) {
      return readContactNoteAttachment(request, response, decodeURIComponent(contactNoteAttachmentContentMatch[1]));
    }
    const contactNoteAttachmentMatch = /^\/api\/contact-note-attachments\/([^/]+)$/.exec(url.pathname);
    if (request.method === "DELETE" && contactNoteAttachmentMatch) {
      return jsonResponse(response, 200, await removeContactNoteAttachment(request, decodeURIComponent(contactNoteAttachmentMatch[1])));
    }
    const contactImageWriteMatch = /^\/api\/contacts\/([^/]+)\/image$/.exec(url.pathname);
    if (request.method === "POST" && contactImageWriteMatch) {
      return jsonResponse(response, 200, await uploadContactImage(request, decodeURIComponent(contactImageWriteMatch[1])));
    }
    if (request.method === "DELETE" && contactImageWriteMatch) {
      return jsonResponse(response, 200, await removeContactImage(request, decodeURIComponent(contactImageWriteMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/organizations") {
      return jsonResponse(response, 200, await listOrganizations(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/organizations") {
      return jsonResponse(response, 201, await createOrganization(request));
    }
    if (request.method === "GET" && url.pathname === "/api/organization-primary-systems") {
      return jsonResponse(response, 200, await listOrganizationPrimarySystems(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/organization-primary-systems") {
      return jsonResponse(response, 201, await createOrganizationPrimarySystem(request));
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
    const organizationPrimarySystemMatch = /^\/api\/organization-primary-systems\/([^/]+)$/.exec(url.pathname);
    if (request.method === "PATCH" && organizationPrimarySystemMatch) {
      return jsonResponse(response, 200, await patchOrganizationPrimarySystem(request, decodeURIComponent(organizationPrimarySystemMatch[1])));
    }
    if (request.method === "DELETE" && organizationPrimarySystemMatch) {
      return jsonResponse(response, 200, await deleteOrganizationPrimarySystem(request, decodeURIComponent(organizationPrimarySystemMatch[1])));
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
    if (request.method === "DELETE" && hospitationSlotMatch) {
      return jsonResponse(response, 200, await deleteHospitationSlot(request, decodeURIComponent(hospitationSlotMatch[1])));
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
    if (request.method === "DELETE" && hospitationMatch) {
      return jsonResponse(response, 200, await deleteHospitation(request, decodeURIComponent(hospitationMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/hospitation-observations") {
      return jsonResponse(response, 200, await listHospitationObservations(request, url));
    }
    const hospitationObservationMatch = /^\/api\/hospitation-observations\/([^/]+)$/.exec(url.pathname);
    if (request.method === "PATCH" && hospitationObservationMatch) {
      return jsonResponse(response, 200, await patchHospitationObservation(request, decodeURIComponent(hospitationObservationMatch[1])));
    }
    const hospitationObservationSyncMatch = /^\/api\/hospitations\/([^/]+)\/observations\/sync$/.exec(url.pathname);
    if (request.method === "PUT" && hospitationObservationSyncMatch) {
      return jsonResponse(response, 200, await syncHospitationObservations(request, decodeURIComponent(hospitationObservationSyncMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/roadmap-items") {
      return jsonResponse(response, 200, await listRoadmapItems(request, url));
    }
    if (request.method === "GET" && url.pathname === "/api/hospitation-roadmap-assessments") {
      return jsonResponse(response, 200, await listHospitationRoadmapAssessments(request, url));
    }
    if (request.method === "GET" && url.pathname === "/api/hospitation-unmet-needs") {
      return jsonResponse(response, 200, await listHospitationUnmetNeeds(request, url));
    }
    const hospitationRoadmapMatch = /^\/api\/hospitations\/([^/]+)\/roadmap-assessments$/.exec(url.pathname);
    if (request.method === "PUT" && hospitationRoadmapMatch) {
      return jsonResponse(response, 200, await replaceHospitationRoadmapAssessments(request, decodeURIComponent(hospitationRoadmapMatch[1])));
    }
    const hospitationUnmetNeedsMatch = /^\/api\/hospitations\/([^/]+)\/unmet-needs$/.exec(url.pathname);
    if (request.method === "PUT" && hospitationUnmetNeedsMatch) {
      return jsonResponse(response, 200, await replaceHospitationUnmetNeeds(request, decodeURIComponent(hospitationUnmetNeedsMatch[1])));
    }
    if (request.method === "GET" && url.pathname === "/api/formats") {
      return jsonResponse(response, 200, await listFormats(request, url));
    }
    if (request.method === "POST" && url.pathname === "/api/formats") {
      return jsonResponse(response, 201, await createFormat(request));
    }
    const formatParticipantImportMatch = /^\/api\/formats\/([^/]+)\/participants\/import$/.exec(url.pathname);
    if (request.method === "POST" && formatParticipantImportMatch) {
      return jsonResponse(response, 200, await importFormatParticipants(
        request,
        decodeURIComponent(formatParticipantImportMatch[1])
      ));
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
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && url.pathname === "/api/activities") {
      return jsonResponse(response, 405, {
        error: "Aktivitaetsereignisse duerfen nicht direkt geschrieben werden. Sie entstehen ausschliesslich in serverseitigen Fachvorgaengen."
      });
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
    return jsonResponse(response, 404, { error: "Not found" });
  } catch (error) {
    const status = Number(error.status || 500);
    if (error.retryAfter) response.setHeader("retry-after", String(error.retryAfter));
    if (status >= 500) console.error(JSON.stringify({
      timestamp: new Date().toISOString(), severity: "ERROR", event: "api_error",
      requestId: request.requestId, route: request.routePolicy?.id || "unmatched", status,
      errorClass: error?.constructor?.name || "Error"
    }));
    const payload = {
      error: status >= 500 ? "API-Anfrage fehlgeschlagen." : error.message
    };
    if (process.env.NODE_ENV !== "production" && error.details) payload.details = error.details;
    return jsonResponse(response, status, payload);
  }
}

const server = http.createServer(handle);
server.requestTimeout = Math.max(5000, Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 30000));
server.headersTimeout = Math.max(5000, Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 10000));
server.keepAliveTimeout = Math.max(1000, Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 5000));
server.maxRequestsPerSocket = Math.max(10, Number(process.env.HTTP_MAX_REQUESTS_PER_SOCKET || 1000));
server.listen(PORT, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    severity: "INFO",
    event: "api_started",
    message: `Versorgungs-Kompass API listening on ${PORT}`,
    port: PORT,
    authMode: API_AUTH_MODE
  }));
});

let shutdownStarted = false;
function shutdown(signal, exitCode = 0) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    severity: exitCode === 0 ? "INFO" : "ERROR",
    event: "api_shutdown",
    signal
  }));
  const forceTimer = setTimeout(() => {
    server.closeAllConnections?.();
    process.exit(exitCode || 1);
  }, Math.max(5000, Number(process.env.HTTP_SHUTDOWN_TIMEOUT_MS || 25000)));
  forceTimer.unref();
  server.close(async (error) => {
    try {
      if (pool) await pool.end();
    } catch {
      exitCode = 1;
    }
    clearTimeout(forceTimer);
    process.exit(error ? 1 : exitCode);
  });
  server.closeIdleConnections?.();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("uncaughtException", (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), severity: "CRITICAL", event: "uncaught_exception",
    errorClass: error?.constructor?.name || "Error"
  }));
  shutdown("uncaughtException", 1);
});
process.once("unhandledRejection", (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), severity: "CRITICAL", event: "unhandled_rejection",
    errorClass: error?.constructor?.name || "Error"
  }));
  shutdown("unhandledRejection", 1);
});
