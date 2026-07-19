/* API-only browser data service. Fachliche Daten werden ausschliesslich ueber /api geladen und gespeichert. */
!function() {
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
  const CONTACT_IMAGE_TYPES = Object.freeze([ "image/jpeg", "image/png", "image/webp" ]);
  const CONTACT_NOTE_ATTACHMENT_TYPES = Object.freeze([ "text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ]);
  const CONFIG = window.VERSORGUNGS_COMPASS_CONFIG || {};
  const CAPABILITIES = CONFIG.capabilities || {};
  const IS_PUBLIC_DEMO_PROFILE = CONFIG.dataMode === "demo" && CONFIG.authMode === "anonymous-demo";
  let client = null, profileCache = new Map, profileLoadPromise = null, currentProfilePromise = null, contactCache = [], contactNoteCache = [], contactNoteAttachmentCache = [], organizationCache = [], organizationPrimarySystemCache = [], expertGroupCache = [], expertContactCache = [], expertOrganizationCache = [], expertEntityLinkCache = [], stakeholderTypeCache = [], stakeholderOrganizationCache = [], stakeholderPeopleCache = [], formatCache = [], hospitationSlotCache = [], hospitationCache = [], hospitationObservationCache = [], roadmapItemCache = [], hospitationRoadmapAssessmentCache = [], hospitationUnmetNeedCache = [], supportsOrganizationPrimarySystems = (CAPABILITIES.contactImageSources,
  CAPABILITIES.contactRole, CAPABILITIES.contactConsent, !0 === CAPABILITIES.organizationPrimarySystems), supportsNotifications = (CAPABILITIES.registrationIntake,
  CAPABILITIES.organizationAssets, CAPABILITIES.expertOrganizationAssets, CAPABILITIES.stakeholderOrganizationAssets,
  CAPABILITIES.stakeholderOrganizationSector, !0), supportsContactNotes = !1 !== CAPABILITIES.contactNotes;
  function apiBaseUrl() {
    return String(CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
  }
  function assertDemoAdapterReady() {
    if (!IS_PUBLIC_DEMO_PROFILE) return;
    const runtime = window.VERSORGUNGS_COMPASS_DEMO_RUNTIME;
    const adapter = window.VersorgungsCompassDemoApi;
    if (runtime?.publicDemo === true && runtime?.persistence === "memory-only" && adapter?.active === true) return;
    throw new Error("Die lokale Demo-Datenquelle ist nicht verfügbar. Es wurde keine Anfrage gesendet.");
  }
  async function apiRequest(path, {method: method = "GET", params: params = {}, body: body} = {}) {
    assertDemoAdapterReady();
    const url = new URL(`${apiBaseUrl()}${path}`, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      null != value && "" !== value && url.searchParams.set(key, String(value));
    });
    const headers = {
      Accept: "application/json"
    };
    void 0 !== body && (headers["Content-Type"] = "application/json");
    const response = await fetch(url.href, {
      method: method,
      headers: {
        ...headers
      },
      credentials: CONFIG.apiCredentials || "same-origin",
      body: void 0 !== body ? JSON.stringify(body) : void 0
    }), payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API-Anfrage fehlgeschlagen (${response.status}).`);
    return payload;
  }
  function apiContactPayload(payload) {
    return payload?.contact || payload;
  }
  function apiOrganizationPayload(payload) {
    return payload?.organization || payload;
  }
  function normalizeCareSector(value, fallback = "Praxis") {
    return window.VersorgungsCompassSectors?.normalizeSector ? window.VersorgungsCompassSectors.normalizeSector(value, fallback) : String(value || "").trim() || fallback;
  }
  async function apiGet(path, params = {}) {
    return apiRequest(path, {
      params: params
    });
  }
  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
    return window.btoa(binary);
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function normalizeRegistration(row = {}) {
    const submittedAt = row.submittedAt || row.submitted_at || "", processedAt = row.processedAt || row.processed_at || "", legacyConsentAt = row.consentAcceptedAt || row.consent_accepted_at || "", legacyConsentVersion = row.consentTextVersion || row.consent_text_version || "", processingConsentAt = row.consentProcessingAcceptedAt || row.consent_processing_accepted_at || legacyConsentAt || "", processingConsentVersion = row.consentProcessingVersion || row.consent_processing_version || legacyConsentVersion || "", contactConsentAt = row.consentContactAcceptedAt || row.consent_contact_accepted_at || "", contactConsentVersion = row.consentContactVersion || row.consent_contact_version || "", listValue = value => Array.isArray(value) ? [ ...new Set(value.map(item => String(item || "").trim()).filter(Boolean)) ] : [ ...new Set(String(value || "").split(/\s*[,;|]\s*/).map(item => item.trim()).filter(Boolean)) ], tiApplications = listValue(row.tiApplications || row.ti_applications), participationFormats = listValue(row.participationFormats || row.participation_formats), interestTopics = listValue(row.interestTopics || row.interest_topics);
    return {
      id: String(row.id || row.registration_id || "").trim(),
      submissionId: String(row.submissionId || row.submission_id || "").trim(),
      submission_id: String(row.submissionId || row.submission_id || "").trim(),
      submittedAt: submittedAt,
      submitted_at: submittedAt,
      status: String(row.status || "neu").trim() || "neu",
      onboardingStage: String(row.onboardingStage || row.onboarding_stage || "registered").trim() || "registered",
      onboarding_stage: String(row.onboardingStage || row.onboarding_stage || "registered").trim() || "registered",
      email: String(row.email || "").trim(),
      salutation: String(row.salutation || row.anrede || "").trim(),
      title: String(row.title || row.academic_title || "").trim(),
      firstName: String(row.firstName || row.first_name || "").trim(),
      first_name: String(row.firstName || row.first_name || "").trim(),
      lastName: String(row.lastName || row.last_name || "").trim(),
      last_name: String(row.lastName || row.last_name || "").trim(),
      organization: String(row.organization || row.einrichtung || "").trim(),
      sector: String(row.sector || row.category || "").trim(),
      postalCode: String(row.postalCode || row.postal_code || row.zip || row.plz || "").trim(),
      postal_code: String(row.postalCode || row.postal_code || row.zip || row.plz || "").trim(),
      city: String(row.city || "").trim(),
      federalState: String(row.federalState || row.federal_state || row.state || "").trim(),
      federal_state: String(row.federalState || row.federal_state || row.state || "").trim(),
      professionalGroup: String(row.professionalGroup || row.professional_group || "").trim(),
      professional_group: String(row.professionalGroup || row.professional_group || "").trim(),
      role: String(row.role || row.function || row.position || "").trim(),
      employmentStatus: String(row.employmentStatus || row.employment_status || "").trim(),
      employment_status: String(row.employmentStatus || row.employment_status || "").trim(),
      yearsInProfessionBand: String(row.yearsInProfessionBand || row.years_in_profession_band || "").trim(),
      years_in_profession_band: String(row.yearsInProfessionBand || row.years_in_profession_band || "").trim(),
      ageGroup: String(row.ageGroup || row.age_group || "").trim(),
      age_group: String(row.ageGroup || row.age_group || "").trim(),
      employeeCountBand: String(row.employeeCountBand || row.employee_count_band || "").trim(),
      employee_count_band: String(row.employeeCountBand || row.employee_count_band || "").trim(),
      primarySystemType: String(row.primarySystemType || row.primary_system_type || "").trim(),
      primary_system_type: String(row.primarySystemType || row.primary_system_type || "").trim(),
      primarySystemVendor: String(row.primarySystemVendor || row.primary_system_vendor || "").trim(),
      primary_system_vendor: String(row.primarySystemVendor || row.primary_system_vendor || "").trim(),
      primarySystemProduct: String(row.primarySystemProduct || row.primary_system_product || "").trim(),
      primary_system_product: String(row.primarySystemProduct || row.primary_system_product || "").trim(),
      tiApplications: tiApplications,
      ti_applications: tiApplications,
      participationFormats: participationFormats,
      participation_formats: participationFormats,
      interestTopics: interestTopics,
      interest_topics: interestTopics,
      preferredContact: String(row.preferredContact || row.preferred_contact || row.preferredContactWay || row.preferred_contact_way || "").trim(),
      preferred_contact: String(row.preferredContact || row.preferred_contact || row.preferredContactWay || row.preferred_contact_way || "").trim(),
      message: String(row.message || row.nachricht || "").trim(),
      formVersion: String(row.formVersion || row.form_version || "").trim(),
      form_version: String(row.formVersion || row.form_version || "").trim(),
      privacyCheckStatus: String(row.privacyCheckStatus || row.privacy_check_status || "").trim(),
      privacy_check_status: String(row.privacyCheckStatus || row.privacy_check_status || "").trim(),
      consentProcessingVersion: String(processingConsentVersion).trim(),
      consent_processing_version: String(processingConsentVersion).trim(),
      consentProcessingAcceptedAt: String(processingConsentAt).trim(),
      consent_processing_accepted_at: String(processingConsentAt).trim(),
      consentContactVersion: String(contactConsentVersion).trim(),
      consent_contact_version: String(contactConsentVersion).trim(),
      consentContactAcceptedAt: String(contactConsentAt).trim(),
      consent_contact_accepted_at: String(contactConsentAt).trim(),
      consentTextVersion: String(legacyConsentVersion).trim(),
      consent_text_version: String(legacyConsentVersion).trim(),
      consentAcceptedAt: String(legacyConsentAt).trim(),
      consent_accepted_at: String(legacyConsentAt).trim(),
      sourceUrl: String(row.sourceUrl || row.source_url || "").trim(),
      source_url: String(row.sourceUrl || row.source_url || "").trim(),
      eligibilityConfirmedAt: String(row.eligibilityConfirmedAt || row.eligibility_confirmed_at || "").trim(),
      eligibility_confirmed_at: String(row.eligibilityConfirmedAt || row.eligibility_confirmed_at || "").trim(),
      privacyNoticeVersion: String(row.privacyNoticeVersion || row.privacy_notice_version || "").trim(),
      privacy_notice_version: String(row.privacyNoticeVersion || row.privacy_notice_version || "").trim(),
      emailConfirmationStatus: String(row.emailConfirmationStatus || row.email_confirmation_status || "pending").trim() || "pending",
      email_confirmation_status: String(row.emailConfirmationStatus || row.email_confirmation_status || "pending").trim() || "pending",
      emailConfirmationSentAt: String(row.emailConfirmationSentAt || row.email_confirmation_sent_at || "").trim(),
      email_confirmation_sent_at: String(row.emailConfirmationSentAt || row.email_confirmation_sent_at || "").trim(),
      emailConfirmedAt: String(row.emailConfirmedAt || row.email_confirmed_at || "").trim(),
      email_confirmed_at: String(row.emailConfirmedAt || row.email_confirmed_at || "").trim(),
      retentionReviewAt: String(row.retentionReviewAt || row.retention_review_at || "").trim(),
      retention_review_at: String(row.retentionReviewAt || row.retention_review_at || "").trim(),
      duplicateHint: String(row.duplicateHint || row.duplicate_hint || "").trim(),
      duplicate_hint: String(row.duplicateHint || row.duplicate_hint || "").trim(),
      contactId: String(row.contactId || row.contact_id || "").trim(),
      contact_id: String(row.contactId || row.contact_id || "").trim(),
      organizationId: String(row.organizationId || row.organization_id || "").trim(),
      organization_id: String(row.organizationId || row.organization_id || "").trim(),
      processedAt: processedAt,
      processed_at: processedAt,
      processedBy: String(row.processedBy || row.processed_by || "").trim(),
      processed_by: String(row.processedBy || row.processed_by || "").trim(),
      processingNote: String(row.processingNote || row.processing_note || "").trim(),
      processing_note: String(row.processingNote || row.processing_note || "").trim()
    };
  }
  function splitList(value) {
    return Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : String(value || "").split(/\s*\|\s*|\s*;\s*|\n+/).map(item => item.trim()).filter(Boolean);
  }
  function initialsFromProfile(profile) {
    const source = profile?.display_name || profile?.email || "VK", parts = String(source).trim().split(/\s+/).filter(Boolean);
    return profile?.initials ? String(profile.initials).trim().slice(0, 4).toUpperCase() : parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : String(source).slice(0, 2).toUpperCase();
  }
  function splitOwnerTokens(value) {
    return Array.isArray(value) ? value.flatMap(splitOwnerTokens) : value && "object" == typeof value ? splitOwnerTokens(value.id || value.profileId || value.profile_id || value.value || "") : String(value || "").split(/[;,]/).map(item => item.trim()).filter(Boolean);
  }
  function normalizeOwnerIds(values = []) {
    const ids = [];
    return splitOwnerTokens(values).forEach(value => {
      const id = function(value) {
        const owner = String(value || "").trim();
        if (!owner) return null;
        if (profileCache.has(owner)) return owner;
        if (/^[0-9a-f-]{36}$/i.test(owner)) return owner;
        const normalizedOwner = owner.toLowerCase(), profile = [ ...profileCache.values() ].find(item => [ item.display_name, item.email, item.initials ].some(candidate => String(candidate || "").trim().toLowerCase() === normalizedOwner));
        return profile?.id || null;
      }(value);
      id && !ids.includes(id) && ids.push(id);
    }), ids;
  }
  function ownerIdsFromContact(contact = {}) {
    return Array.isArray(contact.ownerIds) ? normalizeOwnerIds(contact.ownerIds) : Array.isArray(contact.owner_ids) ? normalizeOwnerIds(contact.owner_ids) : Array.isArray(contact.owners) ? normalizeOwnerIds(contact.owners) : normalizeOwnerIds([ contact.ownerId, contact.owner_id, contact.owner ]);
  }
  function decorateContactOwners(contact = {}, ownerIds = null) {
    const ids = normalizeOwnerIds(Array.isArray(ownerIds) ? ownerIds : ownerIdsFromContact(contact)), owners = function(ownerIds = []) {
      return normalizeOwnerIds(ownerIds).map(id => function(id) {
        const profile = profileCache.get(id);
        return {
          id: id || "",
          displayName: profile?.display_name || profile?.email || "Unbekannter Nutzer",
          initials: initialsFromProfile(profile),
          role: profile?.role || "",
          roleLabel: (role = profile?.role, "admin" === role ? "Admin" : "editor" === role ? "Editor" : "viewer" === role ? "Viewer" : role || "Nutzer"),
          avatarUrl: profile?.avatar_url || ""
        };
        var role;
      }(id));
    }(ids);
    return {
      ...contact,
      ownerIds: ids,
      owners: owners,
      ownerId: ids[0] || contact.ownerId || "",
      owner: owners.map(owner => owner.displayName).filter(Boolean).join(", ") || contact.owner || ""
    };
  }
  function hospitationModel() {
    return window.VersorgungsCompassHospitationModel || null;
  }
  function normalizeHospitationQualitativeData(record = {}) {
    const model = hospitationModel();
    return model?.normalizeHospitationRecord ? model.normalizeHospitationRecord(record) : record;
  }
  function hospitationObservationDbToUi(row = {}) {
    const payload = row.payload && "object" == typeof row.payload && !Array.isArray(row.payload) ? row.payload : {}, raw = {
      ...payload,
      id: row.id || payload.id || "",
      hospitationId: row.hospitation_id || row.hospitationId || payload.hospitationId || "",
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
      status: row.status || payload.status || "active",
      archivedAt: row.archived_at || "",
      archivedBy: row.archived_by || "",
      createdAt: row.created_at || payload.createdAt || "",
      createdBy: row.created_by || payload.createdBy || "",
      updatedAt: row.updated_at || payload.updatedAt || "",
      updatedBy: row.updated_by || payload.updatedBy || ""
    }, model = hospitationModel();
    return model?.normalizeObservation ? {
      ...model.normalizeObservation(raw, {
        id: raw.hospitationId
      }),
      ...raw
    } : raw;
  }
  function hospitationObservationUiToDb(observation = {}, hospitationId = "") {
    const model = hospitationModel(), normalized = model?.normalizeObservation ? model.normalizeObservation(observation, {
      id: hospitationId || observation.hospitationId || observation.hospitation_id
    }) : observation;
    return {
      id: String(normalized.id || observation.id || "").trim(),
      hospitation_id: String(hospitationId || normalized.hospitationId || observation.hospitation_id || "").trim(),
      sequence: Number(normalized.sequence) || null,
      title: String(normalized.title || "Beobachtung").trim() || "Beobachtung",
      situation: String(normalized.situation || normalized.situationContext || "").trim() || null,
      description: String(normalized.description || normalized.observed || "").trim() || null,
      process_phase: String(normalized.processPhase || "").trim() || null,
      problem_type: String(normalized.problemType || "").trim() || null,
      impact: String(normalized.impact || "").trim() || null,
      observation_type: String(normalized.observationType || "").trim() || null,
      evidence_type: [ "directly_observed", "reported", "interpreted" ].includes(normalized.evidenceType) ? normalized.evidenceType : "interpreted",
      relevance_score: Number(normalized.relevanceScore) || null,
      usage_recommendation: String(normalized.usageRecommendation || normalized.nextUse || "").trim() || null,
      involved_roles: splitList(normalized.involvedRoles || normalized.affectedRoles),
      affected_products: splitList(normalized.affectedProducts),
      topics: splitList(normalized.topics || normalized.themes),
      payload: {
        ...normalized,
        status: "archived" === observation.status ? "archived" : "active",
        archiveReason: observation.archiveReason || observation.archive_reason || ""
      },
      status: "archived" === observation.status ? "archived" : "active",
      archived_at: observation.archivedAt || observation.archived_at || null,
      archived_by: observation.archivedBy || observation.archived_by || null
    };
  }
  function normalizeComparisonRole(value) {
    const label = String(value || "").trim();
    return [ "top_priority", "low_priority" ].includes(label) ? label : "none";
  }
  function normalizeUnmetNeedClassification(value) {
    const label = String(value || "").trim();
    return [ "existing_item_extension", "new_backlog_item", "legal_clarification", "organizational_implementation", "local_system_issue", "communication_or_training" ].includes(label) ? label : "new_backlog_item";
  }
  function normalizeUnmetNeedStatus(value) {
    const label = String(value || "").trim();
    return [ "Neu", "In Prüfung", "Übernommen", "Zurückgestellt", "Erledigt", "Archiviert" ].includes(label) ? label : "Neu";
  }
  function ratingValue(value) {
    const number = Number(value);
    return !Number.isFinite(number) || number < 1 || number > 5 ? null : Math.round(number);
  }
  function normalizeContactUi(contact = {}) {
    const entry = {
      ...contact,
      category: normalizeCareSector(contact.category || contact.sector)
    };
    return entry.imageStoragePath && (entry.image = `${apiBaseUrl()}/api/contact-images/${encodeURIComponent(entry.id)}`),
    decorateContactOwners(entry);
  }
  function normalizeOrganizationUi(organization = {}) {
    return {
      ...organization,
      sector: normalizeCareSector(organization.sector, ""),
      primarySystems: Array.isArray(organization.primarySystems) ? organization.primarySystems.map(normalizePrimarySystemUi) : []
    };
  }
  function normalizePrimarySystemType(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return [ "PVS", "KIS", "AVS", "ZPVS", "LIS", "HVS", "PFLEGE", "SONSTIGES" ].includes(normalized) ? normalized : "SONSTIGES";
  }
  function normalizePrimarySystemUi(system = {}) {
    return {
      id: String(system.id || "").trim(),
      organizationId: String(system.organizationId || system.organization_id || "").trim(),
      systemType: normalizePrimarySystemType(system.systemType || system.system_type),
      vendorName: String(system.vendorName || system.vendor_name || "").trim(),
      productName: String(system.productName || system.product_name || "").trim(),
      sourceUrl: String(system.sourceUrl || system.source_url || "").trim(),
      createdAt: system.createdAt || system.created_at || "",
      updatedAt: system.updatedAt || system.updated_at || "",
      createdBy: system.createdBy || system.created_by || "",
      updatedBy: system.updatedBy || system.updated_by || ""
    };
  }
  function normalizeOrganizationName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }
  function parseLocalizedInteger(value) {
    if (Number.isFinite(value)) return Math.round(value);
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    let normalized = raw.replace(/\s/g, "");
    /^\d{1,3}([.,]\d{3})+$/.test(normalized) ? normalized = normalized.replace(/[.,]/g, "") : normalized.includes(",") && normalized.includes(".") ? normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".") ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "") : normalized.includes(",") && (normalized = normalized.replace(",", "."));
    const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  function expertGroupName(groupId, fallback = "") {
    const group = expertGroupCache.find(item => item.id === groupId);
    return group?.name || fallback || "";
  }
  function expertGroupDbToUi(row, index = 0) {
    return {
      id: row.id || `expert-group-${index + 1}`,
      name: row.name || "",
      sortOrder: Number(row.sort_order ?? row.sortOrder ?? 10 * (index + 1)),
      status: row.status || "active",
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || ""
    };
  }
  function expertContactDbToUi(row, index = 0) {
    const groupName = row.group_name || row.groupName || expertGroupName(row.group_id || row.groupId, row.group || row.category || row.sector), topics = splitList(row.topics || row.themes), source = row.source || row.sources || "INA Expertenkreis", profileUrl = row.profile_url || row.profileUrl || row.sourceUrl || row.url || "";
    return decorateContactOwners({
      id: row.id || `expert-contact-${index + 1}`,
      name: row.name || "",
      organizationId: row.organization_id || row.organizationId || "",
      organization: row.organization || "",
      groupId: row.group_id || row.groupId || "",
      group: groupName,
      category: groupName,
      specialty: row.specialty || "",
      contactRole: row.role || row.contactRole || "",
      city: row.city || "",
      state: row.federal_state || row.state || "",
      email: row.email || "",
      phone: row.phone || "",
      linkedin: row.linkedin || "",
      themes: topics,
      note: row.notes || row.note || "",
      sources: splitList(source),
      url: profileUrl,
      sourceUrl: profileUrl,
      ownerId: row.owner_id || row.ownerId || "",
      ownerIds: ownerIdsFromContact(row),
      status: row.status || "active",
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || "",
      _index: index
    });
  }
  function expertOrganizationDbToUi(row, contactCount = 0) {
    const groupName = row.group_name || row.groupName || expertGroupName(row.group_id || row.groupId, row.group || row.sector || row.category);
    return {
      id: row.id || "",
      name: row.name || "",
      normalizedName: row.normalized_name || row.normalizedName || normalizeOrganizationName(row.name),
      groupId: row.group_id || row.groupId || "",
      group: groupName,
      sector: groupName,
      organizationType: row.organization_type || row.organizationType || "",
      city: row.city || "",
      state: row.federal_state || row.state || "",
      website: row.website || "",
      phone: row.phone || "",
      email: row.email || "",
      notes: row.notes || "",
      source: row.source || "",
      status: row.status || "active",
      contactCount: Number(row.contact_count ?? row.contactCount ?? contactCount ?? 0),
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || ""
    };
  }
  function expertEntityLinkDbToUi(row = {}) {
    return {
      id: row.id || "",
      linkType: row.link_type || row.linkType || "",
      contactId: row.contact_id || row.contactId || "",
      expertContactId: row.expert_contact_id || row.expertContactId || "",
      organizationId: row.organization_id || row.organizationId || "",
      expertOrganizationId: row.expert_organization_id || row.expertOrganizationId || "",
      matchReason: row.match_reason || row.matchReason || "",
      confidence: Number(row.confidence ?? row.score ?? 0),
      createdAt: row.created_at || row.createdAt || "",
      createdBy: row.created_by || row.createdBy || "",
      updatedAt: row.updated_at || row.updatedAt || "",
      updatedBy: row.updated_by || row.updatedBy || ""
    };
  }
  function stakeholderTypeDbToUi(row, index = 0) {
    return {
      id: row.id || `stakeholder-type-${index + 1}`,
      label: row.label || row.name || "",
      description: row.description || "",
      sortOrder: Number(row.sort_order ?? row.sortOrder ?? 10 * (index + 1)),
      status: row.status || "active",
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || ""
    };
  }
  function stakeholderOrganizationDbToUi(row, personCount = 0) {
    const latitude = Number.parseFloat(row.latitude ?? row.lat ?? ""), longitude = Number.parseFloat(row.longitude ?? row.lon ?? "");
    return {
      id: row.id || "",
      stakeholderTypeId: row.stakeholder_type_id || row.stakeholderTypeId || row.stakeholderType || "kv",
      stakeholderType: row.stakeholder_type_id || row.stakeholderType || "kv",
      name: row.name || "",
      normalizedName: row.normalized_name || row.normalizedName || normalizeOrganizationName(row.name),
      organizationType: row.organization_type || row.organizationType || "",
      sector: row.sector || row.indication || row.category || "",
      postalCode: row.postal_code || row.postalCode || "",
      city: row.city || "",
      state: row.federal_state || row.state || "",
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      lat: Number.isFinite(latitude) ? latitude : null,
      lon: Number.isFinite(longitude) ? longitude : null,
      website: row.website || "",
      phone: row.phone || "",
      email: row.email || "",
      logoUrl: row.logo_url || row.logoUrl || "",
      logoSourceUrl: row.logo_source_url || row.logoSourceUrl || "",
      logoSourceLabel: row.logo_source_label || row.logoSourceLabel || "",
      memberCount: Number.isFinite(Number(row.member_count ?? row.memberCount)) ? Number(row.member_count ?? row.memberCount) : null,
      memberCountLabel: row.member_count_label || row.memberCountLabel || "",
      memberCountSourceUrl: row.member_count_source_url || row.memberCountSourceUrl || "",
      memberCountSourceLabel: row.member_count_source_label || row.memberCountSourceLabel || "",
      memberCountUpdatedAt: row.member_count_updated_at || row.memberCountUpdatedAt || "",
      memberCountScope: row.member_count_scope || row.memberCountScope || "",
      notes: row.notes || row.note || "",
      source: row.source || "",
      status: row.status || "active",
      personCount: Number(row.person_count ?? row.personCount ?? personCount ?? 0),
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || ""
    };
  }
  function stakeholderPersonDbToUi(row, index = 0) {
    const latitude = Number.parseFloat(row.latitude ?? row.lat ?? ""), longitude = Number.parseFloat(row.longitude ?? row.lon ?? "");
    return {
      id: row.id || `stakeholder-person-${index + 1}`,
      stakeholderTypeId: row.stakeholder_type_id || row.stakeholderTypeId || row.stakeholderType || "kv",
      stakeholderType: row.stakeholder_type_id || row.stakeholderType || "kv",
      organizationId: row.organization_id || row.organizationId || "",
      organization: row.organization || "",
      name: row.name || "",
      role: row.role || row.contactRole || "",
      contactRole: row.role || row.contactRole || "",
      committee: row.committee || row.gremium || "",
      city: row.city || "",
      state: row.federal_state || row.state || "",
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      lat: Number.isFinite(latitude) ? latitude : null,
      lon: Number.isFinite(longitude) ? longitude : null,
      mapPositionSource: row.map_position_source || row.mapPositionSource || "",
      email: row.email || "",
      phone: row.phone || "",
      linkedin: row.linkedin || "",
      themes: splitList(row.topics || row.themes),
      note: row.notes || row.note || "",
      source: row.source || "",
      sources: splitList(row.source),
      url: row.profile_url || row.profileUrl || row.url || "",
      isRepresentativeAssemblyMember: Boolean(row.is_representative_assembly_member ?? row.isRepresentativeAssemblyMember),
      status: row.status || "active",
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || "",
      _index: index
    };
  }
  function stakeholderTypeUiToDb(type = {}) {
    return {
      id: String(type.id || type.value || "kv").trim(),
      label: String(type.label || type.name || "Kassenärztliche Vereinigungen").trim(),
      description: String(type.description || "").trim() || null,
      sort_order: Number(type.sortOrder ?? type.sort_order ?? 10),
      status: type.status || "active"
    };
  }
  function stakeholderOrganizationUiToDb(organization = {}) {
    const name = String(organization.name || organization.organization || "").trim(), latitude = Number.parseFloat(organization.lat ?? organization.latitude ?? ""), longitude = Number.parseFloat(organization.lon ?? organization.longitude ?? "");
    return {
      id: String(organization.id || `stakeholder-org-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).trim(),
      stakeholder_type_id: String(organization.stakeholderTypeId || organization.stakeholder_type_id || organization.stakeholderType || "kv").trim() || "kv",
      name: name,
      normalized_name: normalizeOrganizationName(organization.normalizedName || organization.normalized_name || name),
      organization_type: String(organization.organizationType || organization.organization_type || "").trim() || null,
      sector: String(organization.sector || organization.indication || organization.category || "").trim() || null,
      postal_code: String(organization.postalCode || organization.postal_code || "").trim() || null,
      city: String(organization.city || "").trim() || null,
      federal_state: String(organization.state || organization.federal_state || "").trim() || null,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
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
  function stakeholderPersonUiToDb(person = {}) {
    const name = String(person.name || "").trim(), latitude = Number.parseFloat(person.lat ?? person.latitude ?? ""), longitude = Number.parseFloat(person.lon ?? person.longitude ?? "");
    return {
      id: String(person.id || `stakeholder-person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).trim(),
      stakeholder_type_id: String(person.stakeholderTypeId || person.stakeholder_type_id || person.stakeholderType || "kv").trim() || "kv",
      organization_id: person.organizationId || person.organization_id || null,
      organization: String(person.organization || "").trim() || null,
      name: name,
      role: String(person.role || person.contactRole || "").trim() || null,
      committee: String(person.committee || person.gremium || "").trim() || null,
      city: String(person.city || "").trim() || null,
      federal_state: String(person.state || person.federal_state || "").trim() || null,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
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
  function expertGroupIdForName(name = "", fallbackId = "") {
    const normalized = String(name || "").trim().toLowerCase();
    if (!normalized) return fallbackId || "";
    const group = expertGroupCache.find(item => String(item.name || "").trim().toLowerCase() === normalized);
    return group?.id || fallbackId || "";
  }
  async function loadProfiles(options = {}) {
    const force = Boolean(options.force);
    if (!force && profileCache.size) return [ ...profileCache.values() ];
    if (!force && profileLoadPromise) return profileLoadPromise;
    const request = (async () => {
      {
        const payload = await apiGet("/api/profiles");
        return function(profiles = []) {
          return profileCache = new Map((profiles || []).map(profile => [ profile.id, profile ])),
          [ ...profileCache.values() ];
        }(Array.isArray(payload.items) ? payload.items : []);
      }
    })();
    profileLoadPromise = request;
    try {
      return await request;
    } catch (error) {
      throw profileLoadPromise === request && (profileLoadPromise = null), error;
    }
  }
  async function getCurrentProfile(options = {}) {
    if (options.force, !options.force && currentProfilePromise) return currentProfilePromise;
    const request = (async () => {
      {
        const profile = await apiGet("/api/profile");
        return profile?.id && profileCache.set(profile.id, profile), profile;
      }
    })();
    currentProfilePromise = request;
    try {
      return await request;
    } catch (error) {
      throw currentProfilePromise === request && (currentProfilePromise = null), error;
    }
  }
  async function loadContacts(options = {}) {
    {
      const payload = await apiGet("/api/contacts", {
        includeArchived: options.includeArchived ? "true" : "",
        status: options.status || ""
      });
      return contactCache = Array.isArray(payload.items) ? payload.items.map(normalizeContactUi) : [],
      contactCache;
    }
  }
  async function getContacts(filters = {}) {
    return contactCache.length || await loadContacts(), function(items, filters = {}) {
      return items.filter(contact => !(filters.status && contact.status !== filters.status || filters.sector && contact.category !== filters.sector || filters.state && contact.state !== filters.state || filters.priority && contact.priority !== filters.priority));
    }(contactCache, filters);
  }
  async function getContact(id) {
    return contactCache.find(contact => contact.id === id) || normalizeContactUi(await apiGet(`/api/contacts/${encodeURIComponent(id)}`));
  }
  async function getOrganization(id) {
    return normalizeOrganizationUi(await apiGet(`/api/organizations/${encodeURIComponent(id)}`));
  }
  async function loadOrganizationPrimarySystems(options = {}) {
    const organizationIds = [ ...new Set((options.organizationIds || []).filter(Boolean)) ];
    if (!supportsOrganizationPrimarySystems) return [];
    {
      const payload = await apiGet("/api/organization-primary-systems", {
        organizationIds: organizationIds.join(",")
      }), rows = Array.isArray(payload.items) ? payload.items.map(normalizePrimarySystemUi) : [];
      return organizationPrimarySystemCache = rows, clone(rows);
    }
  }
  async function loadExpertGroups(options = {}) {
    {
      const payload = await apiGet("/api/expert-groups", {
        includeArchived: options.includeArchived ? "true" : ""
      });
      return expertGroupCache = Array.isArray(payload.items) ? payload.items.map(expertGroupDbToUi) : [],
      clone(expertGroupCache);
    }
  }
  async function loadExpertContacts(options = {}) {
    {
      expertGroupCache.length || await loadExpertGroups({
        includeArchived: !0
      });
      const payload = await apiGet("/api/expert-contacts", {
        includeArchived: options.includeArchived ? "true" : "",
        status: options.status || ""
      });
      return expertContactCache = Array.isArray(payload.items) ? payload.items.map(expertContactDbToUi) : [],
      clone(expertContactCache);
    }
  }
  async function loadExpertOrganizations(options = {}) {
    {
      expertGroupCache.length || await loadExpertGroups({
        includeArchived: !0
      });
      const payload = await apiGet("/api/expert-organizations", {
        includeArchived: options.includeArchived ? "true" : ""
      });
      return expertOrganizationCache = Array.isArray(payload.items) ? payload.items.map(expertOrganizationDbToUi) : [],
      clone(expertOrganizationCache);
    }
  }
  async function loadStakeholderOrganizations(options = {}) {
    {
      const payload = await apiGet("/api/stakeholder-organizations", {
        includeArchived: options.includeArchived ? "true" : "",
        stakeholderTypeId: options.stakeholderTypeId || options.stakeholderType || ""
      });
      return stakeholderOrganizationCache = Array.isArray(payload.items) ? payload.items.map(stakeholderOrganizationDbToUi) : [],
      clone(stakeholderOrganizationCache);
    }
  }
  async function loadStakeholderPeople(options = {}) {
    {
      const payload = await apiGet("/api/stakeholder-people", {
        includeArchived: options.includeArchived ? "true" : "",
        stakeholderTypeId: options.stakeholderTypeId || options.stakeholderType || "",
        representativeAssembly: options.representativeAssembly ? "true" : ""
      });
      return stakeholderPeopleCache = Array.isArray(payload.items) ? payload.items.map(stakeholderPersonDbToUi) : [],
      clone(stakeholderPeopleCache);
    }
  }
  function updatePrimarySystemsInOrganizationCache(organizationId, systems) {
    organizationCache = organizationCache.map(organization => organization.id === organizationId ? {
      ...organization,
      primarySystems: clone(systems)
    } : organization);
  }
  async function createOrganizationPrimarySystem(organizationId, system) {
    const input = normalizePrimarySystemUi({
      ...system,
      organizationId: organizationId
    });
    if (!organizationId || !input.systemType) throw new Error("Organisation und Systemtyp sind erforderlich.");
    if (!supportsOrganizationPrimarySystems) throw new Error("Die Migration für Primärsysteme ist noch nicht aktiv.");
    {
      const created = normalizePrimarySystemUi(await apiRequest("/api/organization-primary-systems", {
        method: "POST",
        body: input
      }));
      return await loadOrganizationPrimarySystems({
        organizationIds: [ organizationId ]
      }), updatePrimarySystemsInOrganizationCache(organizationId, organizationPrimarySystemCache),
      created;
    }
  }
  async function updateOrganizationPrimarySystem(id, patch) {
    const existing = organizationPrimarySystemCache.find(system => system.id === id);
    if (!existing) throw new Error("Primärsystem wurde nicht gefunden.");
    const input = normalizePrimarySystemUi({
      ...existing,
      ...patch,
      id: id
    });
    {
      const updated = normalizePrimarySystemUi(await apiRequest(`/api/organization-primary-systems/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: input
      }));
      return organizationPrimarySystemCache = organizationPrimarySystemCache.map(item => item.id === id ? updated : item),
      updatePrimarySystemsInOrganizationCache(updated.organizationId, organizationPrimarySystemCache.filter(item => item.organizationId === updated.organizationId)),
      updated;
    }
  }
  async function deleteOrganizationPrimarySystem(id) {
    const existing = organizationPrimarySystemCache.find(system => system.id === id);
    return !existing || (await apiRequest(`/api/organization-primary-systems/${encodeURIComponent(id)}`, {
      method: "DELETE"
    }), organizationPrimarySystemCache = organizationPrimarySystemCache.filter(item => item.id !== id),
    updatePrimarySystemsInOrganizationCache(existing.organizationId, organizationPrimarySystemCache.filter(item => item.organizationId === existing.organizationId)),
    !0);
  }
  async function getCurrentUserId() {
    {
      const profile = await getCurrentProfile();
      if (!profile?.id) throw new Error("Bitte zuerst anmelden.");
      return profile.id;
    }
  }
  function contactNoteDbToUi(row = {}) {
    return {
      id: String(row.id || ""),
      contactId: String(row.contact_id || row.contactId || ""),
      contentType: String(row.content_type || row.contentType || "free_note"),
      text: String(row.body || row.text || ""),
      body: String(row.body || row.text || ""),
      emailSubject: String(row.email_subject || row.emailSubject || ""),
      emailSender: String(row.email_sender || row.emailSender || ""),
      emailRecipients: splitList(row.email_recipients || row.emailRecipients),
      emailOccurredAt: row.email_occurred_at || row.emailOccurredAt || "",
      authorId: String(row.created_by || row.createdBy || row.authorId || ""),
      createdBy: String(row.created_by || row.createdBy || row.authorId || ""),
      updatedBy: String(row.updated_by || row.updatedBy || ""),
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || "",
      editedAt: row.updated_at && row.updated_at !== row.created_at ? row.updated_at : row.editedAt || ""
    };
  }
  function contactNoteAttachmentDbToUi(row = {}) {
    return {
      id: String(row.id || ""),
      contactId: String(row.contact_id || row.contactId || ""),
      noteId: String(row.note_id || row.noteId || ""),
      fileName: String(row.file_name || row.fileName || "Datei"),
      storagePath: String(row.storage_path || row.storagePath || ""),
      mimeType: String(row.mime_type || row.mimeType || "application/octet-stream"),
      fileSize: Number(row.file_size || row.fileSize) || 0,
      description: String(row.description || ""),
      extractionStatus: String(row.extraction_status || row.extractionStatus || "pending"),
      extractionError: String(row.extraction_error || row.extractionError || ""),
      uploadedAt: row.uploaded_at || row.uploadedAt || "",
      uploaderId: String(row.uploader_id || row.uploaderId || ""),
      extractedText: String(row.extracted_text || row.extractedText || "")
    };
  }
  function contactNotePayload(note = {}) {
    const contentType = "email_text" === String(note.contentType || note.content_type || "free_note") ? "email_text" : "free_note", payload = {
      contact_id: String(note.contactId || note.contact_id || "").trim(),
      content_type: contentType,
      body: String(note.body || note.text || "").trim(),
      email_subject: "email_text" === contentType && String(note.emailSubject || note.email_subject || "").trim() || null,
      email_sender: "email_text" === contentType && String(note.emailSender || note.email_sender || "").trim() || null,
      email_recipients: "email_text" === contentType ? splitList(note.emailRecipients || note.email_recipients) : [],
      email_occurred_at: "email_text" === contentType && (note.emailOccurredAt || note.email_occurred_at) || null
    };
    if (!payload.contact_id) throw new Error("Kontaktbezug der Notiz fehlt.");
    if (!payload.body) throw new Error("Notiztext fehlt.");
    if (payload.body.length > 5e5) throw new Error("Die Notiz darf höchstens 500.000 Zeichen enthalten.");
    return payload;
  }
  function normalizeContentSearchResult(row = {}) {
    return {
      contactId: String(row.contact_id || row.contactId || ""),
      noteId: String(row.note_id || row.noteId || ""),
      attachmentId: String(row.attachment_id || row.attachmentId || ""),
      resultKind: String(row.result_kind || row.resultKind || "note"),
      title: String(row.title || "Treffer"),
      snippet: String(row.snippet || ""),
      occurredAt: row.occurred_at || row.occurredAt || "",
      rank: Number(row.rank) || 0
    };
  }
  async function updateContact(id, patch) {
    const normalizedPatch = {
      ...patch
    };
    ("category" in normalizedPatch || "sector" in normalizedPatch) && (normalizedPatch.category = normalizeCareSector(normalizedPatch.category || normalizedPatch.sector),
    delete normalizedPatch.sector);
    {
      const updated = normalizeContactUi(apiContactPayload(await apiRequest(`/api/contacts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: normalizedPatch
      })));
      return contactCache = contactCache.map(contact => contact.id === id ? updated : contact),
      updated;
    }
  }
  async function updateFormat(id, patch) {
    {
      const updated = await apiRequest(`/api/formats/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
      return formatCache = formatCache.map(format => format.id === id ? updated : format),
      updated;
    }
  }
  async function updateHospitationSlot(id, patch = {}) {
    {
      const updated = await apiRequest(`/api/hospitation-slots/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
      return hospitationSlotCache = hospitationSlotCache.map(slot => slot.id === id ? updated : slot),
      updated;
    }
  }
  async function loadHospitations(options = {}) {
    {
      const payload = await apiGet("/api/hospitations", {
        includeArchived: options.includeArchived ? "true" : ""
      });
      return hospitationCache = Array.isArray(payload.items) ? payload.items : [], hospitationCache;
    }
  }
  async function createHospitation(hospitation) {
    {
      const created = await apiRequest("/api/hospitations", {
        method: "POST",
        body: hospitation
      });
      return hospitationCache = [ created, ...hospitationCache.filter(item => item.id !== created.id) ],
      created;
    }
  }
  async function updateHospitation(id, patch = {}) {
    "Dokumentiert" === function(value) {
      const label = String(value || "").trim();
      return [ "Entwurf", "Angefragt", "Angeboten", "Gebucht", "Abgelehnt", "Abgesagt", "Durchgeführt", "Dokumentiert", "Archiviert" ].includes(label) ? label : "archived" === label ? "Archiviert" : "Angefragt";
    }(patch.status) && (patch.documentedAt || patch.documented_at || (new Date).toISOString(),
    patch.documentedBy || patch.documented_by);
    {
      const updated = await apiRequest(`/api/hospitations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
      return hospitationCache = hospitationCache.map(hospitation => hospitation.id === id ? updated : hospitation),
      updated;
    }
  }
  function migrateHospitationsWithLegacyImpulses(items = hospitationCache, options = {}) {
    const model = hospitationModel(), needs = Array.isArray(options.unmetNeeds) ? options.unmetNeeds : hospitationUnmetNeedCache, normalizedItems = (Array.isArray(items) ? items : []).map(item => normalizeHospitationQualitativeData(item));
    return model?.migrateLegacyUnmetNeeds ? normalizedItems.map(item => model.migrateLegacyUnmetNeeds(item, needs)) : normalizedItems;
  }
  async function getHospitationById(id) {
    const hospitationId = String(id || "").trim();
    return hospitationId && (migrateHospitationsWithLegacyImpulses(hospitationCache).find(hospitation => hospitation.id === hospitationId) || migrateHospitationsWithLegacyImpulses(await loadHospitations({
      includeArchived: !0
    })).find(hospitation => hospitation.id === hospitationId)) || null;
  }
  async function saveHospitation(hospitation = {}) {
    const payload = function(hospitation = {}) {
      const normalized = normalizeHospitationQualitativeData(hospitation);
      return {
        ...hospitation,
        ...normalized,
        topics: normalized.tags?.length ? normalized.tags : normalized.topics,
        requestNote: normalized.notes || hospitation.requestNote || hospitation.request_note || "",
        documentationSummary: normalized.summary || hospitation.documentationSummary || hospitation.documentation_summary || "",
        documentationOutcome: normalized.documentationOutcome
      };
    }(hospitation), id = String(payload.id || "").trim();
    return id && await getHospitationById(id) ? updateHospitation(id, payload) : createHospitation(payload);
  }
  async function loadHospitationObservations(options = {}) {
    {
      const payload = await apiGet("/api/hospitation-observations", {
        includeArchived: options.includeArchived ? "true" : "",
        hospitationId: options.hospitationId || ""
      });
      return hospitationObservationCache = Array.isArray(payload.items) ? payload.items.map(hospitationObservationDbToUi) : [],
      clone(hospitationObservationCache);
    }
  }
  async function updateHospitationObservation(id, patch = {}, expectedUpdatedAt = "") {
    const current = hospitationObservationCache.find(item => item.id === id);
    if (!current) throw new Error("Beobachtung wurde nicht gefunden.");
    const next = hospitationObservationDbToUi({
      ...hospitationObservationUiToDb({
        ...current,
        ...patch
      }, current.hospitationId),
      created_at: current.createdAt,
      created_by: current.createdBy,
      updated_at: (new Date).toISOString(),
      updated_by: ""
    });
    if (!String(next.situation || "").trim() && !String(next.description || next.observed || "").trim()) throw new Error("Eine Beobachtung benötigt eine Situation oder Beschreibung.");
    {
      const updated = await apiRequest(`/api/hospitation-observations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: {
          ...patch,
          expectedUpdatedAt: expectedUpdatedAt
        }
      });
      return hospitationObservationCache = [ updated, ...hospitationObservationCache.filter(item => item.id !== id) ],
      updated;
    }
  }
  async function loadNotifications(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100), offset = Math.max(Number(options.offset) || 0, 0), context = String(options.context || "all").trim();
    return profileCache.size || await loadProfiles(), supportsNotifications ? apiGet("/api/notifications", {
      limit: limit,
      offset: offset,
      unreadOnly: options.unreadOnly ? "true" : "",
      context: context
    }) : {
      items: [],
      nextOffset: offset,
      hasMore: !1
    };
  }
  async function markNotificationsRead(ids = []) {
    const eventIds = function(values = []) {
      return [ ...new Set(values.map(value => String(value || "").trim()).filter(Boolean)) ];
    }(ids);
    return !eventIds.length || !!supportsNotifications && (await apiRequest("/api/notifications/read", {
      method: "PATCH",
      body: {
        ids: eventIds
      }
    }), !0);
  }
  function countBy(items, key) {
    return items.reduce((counts, item) => {
      const value = item[key] || "Unbekannt";
      return counts[value] = (counts[value] || 0) + 1, counts;
    }, {});
  }
  window.dataService = {
    isConfigured: function() {
      return !0;
    },
    getClient: function() {
      return client || (client = {
        auth: {
          signOut: async () => ({
            error: null
          })
        }
      }, client);
    },
    loadContacts: loadContacts,
    getContacts: getContacts,
    getContact: getContact,
    getProfiles: async function() {
      return loadProfiles();
    },
    getCurrentProfile: getCurrentProfile,
    updateCurrentProfile: async function(profile = {}) {
      {
        const apiProfile = {};
        ("displayName" in profile || "display_name" in profile) && (apiProfile.displayName = String(profile.displayName ?? profile.display_name ?? "").trim()),
        "initials" in profile && (apiProfile.initials = String(profile.initials || "").trim().slice(0, 4).toUpperCase()),
        "team" in profile && (apiProfile.team = String(profile.team || "").trim()), "bio" in profile && (apiProfile.bio = String(profile.bio || "").trim());
        const updated = await apiRequest("/api/profile", {
          method: "PATCH",
          body: apiProfile
        });
        return updated?.id && profileCache.set(updated.id, updated), currentProfilePromise = Promise.resolve(updated),
        updated;
      }
    },
    uploadCurrentProfileImage: async function(file) {
      if (!file) throw new Error("Bitte wähle ein Profilfoto aus.");
      if (![ "image/jpeg", "image/png", "image/webp" ].includes(file.type)) throw new Error("Bitte nutze ein JPG-, PNG- oder WebP-Bild.");
      if (file.size > 5242880) throw new Error("Das Profilfoto darf maximal 5 MB groß sein.");
      {
        const payload = await apiRequest("/api/profile/avatar", {
          method: "POST",
          body: {
            fileName: file.name || "avatar",
            contentType: file.type,
            data: await fileToBase64(file)
          }
        }), updated = payload?.profile || await getCurrentProfile({
          force: !0
        });
        if (!updated?.id) throw new Error("Das aktualisierte Profil konnte nach dem Foto-Upload nicht geladen werden.");
        return profileCache.set(updated.id, updated), currentProfilePromise = Promise.resolve(updated),
        updated;
      }
    },
    removeCurrentProfileImage: async function() {
      {
        const updated = await apiRequest("/api/profile/avatar", {
          method: "DELETE"
        });
        return updated?.id && profileCache.set(updated.id, updated), currentProfilePromise = Promise.resolve(updated),
        updated;
      }
    },
    getContactChanges: async function(contactId, options = {}) {
      {
        const payload = await apiGet(`/api/contacts/${encodeURIComponent(contactId)}/history`, {
          action: options.action || "",
          kind: options.kind || "",
          eventKey: options.eventKey || options.event_key || "",
          category: options.category || options.categoryKey || "",
          origin: options.origin || options.originKey || options.originType || "",
          title: options.title || "",
          changedBy: options.changedBy || "",
          from: options.from || "",
          to: options.to || "",
          q: options.q || ""
        });
        return Array.isArray(payload.items) ? payload.items : [];
      }
    },
    getActivities: async function(options = {}) {
      const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100), offset = Math.max(Number(options.offset) || 0, 0);
      return apiGet("/api/activities", {
        limit: limit,
        offset: options.cursor && void 0 === options.offset ? "" : offset,
        action: options.action || "",
        kind: options.kind || "",
        eventKey: options.eventKey || options.event_key || "",
        category: options.category || options.categoryKey || "",
        origin: options.origin || options.originKey || options.originType || "",
        title: options.title || "",
        cursor: options.cursor || "",
        changedBy: options.changedBy || "",
        from: options.from || "",
        to: options.to || "",
        q: options.q || ""
      });
    },
    loadBackendRegistrations: async function(options = {}) {
      const status = String(options.status || "").trim();
      const payload = await apiGet("/api/network-registrations", {
        status: status
      });
      return (Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : []).map(normalizeRegistration);
    },
    updateBackendRegistration: async function(id, patch = {}) {
      const registrationId = String(id || "").trim();
      if (!registrationId) throw new Error("Registrierungs-ID fehlt.");
      const status = String(patch.status || "").trim();
      if (!status) throw new Error("Registrierungsstatus fehlt.");
      const processedBy = String(patch.processedBy || patch.processed_by || "").trim(), processedAt = new Set([ "uebernommen", "verknuepft", "abgelehnt", "widerrufen" ]).has(status) ? patch.processedAt || patch.processed_at || (new Date).toISOString() : null;
      const payload = await apiRequest(`/api/network-registrations/${encodeURIComponent(registrationId)}`, {
        method: "PATCH",
        body: {
          ...patch,
          status: status,
          processed_at: processedAt,
          processed_by: processedBy
        }
      });
      return normalizeRegistration(payload?.registration || payload);
    },
    loadOrganizations: async function(options = {}) {
      {
        const payload = await apiGet("/api/organizations", {
          includeArchived: options.includeArchived ? "true" : ""
        });
        return organizationCache = Array.isArray(payload.items) ? payload.items.map(normalizeOrganizationUi) : [],
        organizationPrimarySystemCache = organizationCache.flatMap(organization => organization.primarySystems || []),
        clone(organizationCache);
      }
    },
    getOrganization: getOrganization,
    loadOrganizationPrimarySystems: loadOrganizationPrimarySystems,
    createOrganizationPrimarySystem: createOrganizationPrimarySystem,
    updateOrganizationPrimarySystem: updateOrganizationPrimarySystem,
    deleteOrganizationPrimarySystem: deleteOrganizationPrimarySystem,
    saveOrganizationPrimarySystems: async function(organizationId, systems = []) {
      const normalized = systems.map(system => normalizePrimarySystemUi({
        ...system,
        organizationId: organizationId
      })).filter(system => system.systemType), existing = await loadOrganizationPrimarySystems({
        organizationIds: [ organizationId ]
      }), retainedIds = new Set(normalized.map(system => system.id).filter(Boolean));
      for (const system of existing) retainedIds.has(system.id) || await deleteOrganizationPrimarySystem(system.id);
      const saved = [];
      for (const system of normalized) saved.push(system.id ? await updateOrganizationPrimarySystem(system.id, system) : await createOrganizationPrimarySystem(organizationId, system));
      return organizationPrimarySystemCache = saved, updatePrimarySystemsInOrganizationCache(organizationId, saved),
      clone(saved);
    },
    loadExpertGroups: loadExpertGroups,
    loadExpertContacts: loadExpertContacts,
    loadExpertOrganizations: loadExpertOrganizations,
    loadExpertEntityLinks: async function() {
      {
        const payload = await apiGet("/api/expert-entity-links");
        return expertEntityLinkCache = Array.isArray(payload.items) ? payload.items.map(expertEntityLinkDbToUi) : [],
        clone(expertEntityLinkCache);
      }
    },
    getPersonRecord: async function(kind, id, options = {}) {
      const normalizedKind = function(kind = "") {
        const value = String(kind || "").trim().toLowerCase();
        return [ "contact", "contacts", "care" ].includes(value) ? "contact" : [ "expert", "experts", "expert-contact" ].includes(value) ? "expert" : [ "stakeholder", "stakeholder-person", "stakeholder_people" ].includes(value) ? "stakeholder" : "";
      }(kind), recordId = String(id || "").trim();
      if (!normalizedKind || !recordId) return null;
      const includeArchived = Boolean(options.includeArchived);
      if ("contact" === normalizedKind) return getContact(recordId);
      if ("expert" === normalizedKind) {
        let record = expertContactCache.find(contact => contact.id === recordId);
        return record || (record = (await loadExpertContacts({
          includeArchived: includeArchived
        })).find(contact => contact.id === recordId)), record ? clone(record) : null;
      }
      if ("stakeholder" === normalizedKind) {
        let record = stakeholderPeopleCache.find(person => person.id === recordId);
        return record || (record = (await loadStakeholderPeople({
          includeArchived: includeArchived
        })).find(person => person.id === recordId)), record ? clone(record) : null;
      }
      return null;
    },
    getOrganizationRecord: async function(kind, id, options = {}) {
      const normalizedKind = function(kind = "") {
        const value = String(kind || "").trim().toLowerCase();
        return [ "care", "organization", "organizations", "contact", "contacts" ].includes(value) ? "care" : [ "expert", "experts", "expert-organization" ].includes(value) ? "expert" : [ "stakeholder", "stakeholders", "kv", "stakeholder-organization" ].includes(value) ? "stakeholder" : "";
      }(kind), recordId = String(id || "").trim();
      if (!normalizedKind || !recordId) return null;
      const includeArchived = Boolean(options.includeArchived);
      if ("care" === normalizedKind) return getOrganization(recordId);
      if ("expert" === normalizedKind) {
        let record = expertOrganizationCache.find(organization => organization.id === recordId);
        return record || (record = (await loadExpertOrganizations({
          includeArchived: includeArchived
        })).find(organization => organization.id === recordId)), record ? clone(record) : null;
      }
      if ("stakeholder" === normalizedKind) {
        let record = stakeholderOrganizationCache.find(organization => organization.id === recordId);
        return record || (record = (await loadStakeholderOrganizations({
          includeArchived: includeArchived
        })).find(organization => organization.id === recordId)), record ? clone(record) : null;
      }
      return null;
    },
    createExpertContact: async function(contact = {}) {
      expertGroupCache.length || await loadExpertGroups({
        includeArchived: !0
      });
      const payload = function(contact = {}) {
        const groupName = String(contact.group || contact.category || contact.groupName || "").trim(), groupId = String(contact.groupId || contact.group_id || expertGroupIdForName(groupName)).trim(), ownerIds = ownerIdsFromContact(contact);
        return {
          id: contact.id || `expert-contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: String(contact.name || "").trim(),
          organization_id: contact.organizationId || contact.organization_id || null,
          organization: String(contact.organization || "").trim() || null,
          group_id: groupId,
          group_name: groupName || expertGroupName(groupId),
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
          profile_url: String(contact.url || contact.sourceUrl || contact.profileUrl || "").trim() || null,
          owner_id: ownerIds[0] || null,
          owner_ids: ownerIds,
          status: contact.status || "active"
        };
      }(contact);
      if (!payload.name) throw new Error("Name des Expertenkreis-Kontakts fehlt.");
      if (!payload.group_id || !payload.group_name) throw new Error("Bitte wähle eine Gruppe für den Expertenkreis-Kontakt.");
      {
        const normalized = expertContactDbToUi(await apiRequest("/api/expert-contacts", {
          method: "POST",
          body: contact
        }));
        return expertContactCache = [ normalized, ...expertContactCache.filter(item => item.id !== normalized.id) ],
        normalized;
      }
    },
    updateExpertContact: async function(id, patch = {}) {
      expertGroupCache.length || await loadExpertGroups({
        includeArchived: !0
      }), [ "ownerIds", "owner_ids", "owners", "ownerId", "owner_id", "owner" ].some(field => Object.prototype.hasOwnProperty.call(patch, field));
      {
        const updated = expertContactDbToUi(await apiRequest(`/api/expert-contacts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: patch
        }));
        return expertContactCache = expertContactCache.map(contact => contact.id === id ? updated : contact),
        updated;
      }
    },
    createExpertOrganization: async function(organization = {}) {
      expertGroupCache.length || await loadExpertGroups({
        includeArchived: !0
      });
      const payload = function(organization = {}) {
        const groupName = String(organization.group || organization.sector || organization.category || organization.groupName || "").trim(), groupId = String(organization.groupId || organization.group_id || expertGroupIdForName(groupName)).trim(), name = String(organization.name || "").trim();
        return {
          id: organization.id || `expert-org-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: name,
          normalized_name: normalizeOrganizationName(organization.normalizedName || name),
          group_id: groupId || null,
          group_name: groupName || expertGroupName(groupId) || null,
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
      }(organization);
      if (!payload.name) throw new Error("Name der Expertenkreis-Organisation fehlt.");
      {
        const normalized = expertOrganizationDbToUi(await apiRequest("/api/expert-organizations", {
          method: "POST",
          body: organization
        }));
        return expertOrganizationCache = [ normalized, ...expertOrganizationCache.filter(item => item.id !== normalized.id) ],
        normalized;
      }
    },
    createExpertEntityLink: async function(link = {}) {
      {
        const created = await apiRequest("/api/expert-entity-links", {
          method: "POST",
          body: link
        });
        return expertEntityLinkCache = [ created, ...expertEntityLinkCache.filter(item => item.id !== created.id) ],
        expertEntityLinkDbToUi(created);
      }
    },
    deleteExpertEntityLink: async function(id) {
      return await apiRequest(`/api/expert-entity-links/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }), expertEntityLinkCache = expertEntityLinkCache.filter(item => item.id !== id),
      !0;
    },
    loadStakeholderTypes: async function(options = {}) {
      {
        const payload = await apiGet("/api/stakeholder-types", {
          includeArchived: options.includeArchived ? "true" : ""
        });
        return stakeholderTypeCache = Array.isArray(payload.items) ? payload.items.map(stakeholderTypeDbToUi) : [],
        clone(stakeholderTypeCache);
      }
    },
    loadStakeholderOrganizations: loadStakeholderOrganizations,
    loadStakeholderPeople: loadStakeholderPeople,
    upsertStakeholderImport: async function(payload = {}) {
      (payload.types || []).map(stakeholderTypeUiToDb), (payload.organizations || []).map(stakeholderOrganizationUiToDb).filter(organization => organization.name),
      (payload.people || []).map(stakeholderPersonUiToDb).filter(person => person.name);
      {
        const imported = await apiRequest("/api/stakeholder-import", {
          method: "POST",
          body: payload
        });
        return stakeholderTypeCache = Array.isArray(imported.types) ? imported.types.map(stakeholderTypeDbToUi) : stakeholderTypeCache,
        stakeholderOrganizationCache = Array.isArray(imported.organizations) ? imported.organizations.map(stakeholderOrganizationDbToUi) : stakeholderOrganizationCache,
        stakeholderPeopleCache = Array.isArray(imported.people) ? imported.people.map(stakeholderPersonDbToUi) : stakeholderPeopleCache,
        clone(imported);
      }
    },
    createOrganization: async function(organization) {
      {
        const organizationForWrite = normalizeOrganizationUi(organization), created = normalizeOrganizationUi(apiOrganizationPayload(await apiRequest("/api/organizations", {
          method: "POST",
          body: organizationForWrite
        })));
        return organizationCache = [ created, ...organizationCache.filter(item => item.id !== created.id) ],
        created;
      }
    },
    updateOrganization: async function(id, patch) {
      {
        const patchForWrite = "sector" in patch ? {
          ...patch,
          sector: normalizeCareSector(patch.sector, "")
        } : patch, updated = normalizeOrganizationUi(apiOrganizationPayload(await apiRequest(`/api/organizations/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: patchForWrite
        })));
        return organizationCache = organizationCache.map(item => item.id === id ? updated : item),
        updated;
      }
    },
    linkContactToOrganization: async function(contactId, organization) {
      return updateContact(contactId, {
        organizationId: "string" == typeof organization ? organization : organization?.id,
        organization: ("string" == typeof organization ? "" : organization?.name) || void 0
      });
    },
    getSavedViews: async function() {
      {
        const payload = await apiGet("/api/saved-views");
        return Array.isArray(payload.items) ? payload.items : [];
      }
    },
    createSavedView: async function(view) {
      return apiRequest("/api/saved-views", {
        method: "POST",
        body: view
      });
    },
    updateSavedView: async function(id, patch) {
      return apiRequest(`/api/saved-views/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
    },
    deleteSavedView: async function(id) {
      return await apiRequest(`/api/saved-views/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }), !0;
    },
    getUserSettings: async function() {
      return apiGet("/api/user-settings");
    },
    upsertUserSettings: async function(settings = {}) {
      return apiRequest("/api/user-settings", {
        method: "PUT",
        body: settings
      });
    },
    createContact: async function(contact, options = {}) {
      const contactForWrite = {
        ...contact,
        category: normalizeCareSector(contact.category || contact.sector)
      };
      {
        const created = normalizeContactUi(apiContactPayload(await apiRequest("/api/contacts", {
          method: "POST",
          body: {
            contact: contactForWrite,
            options: options
          }
        })));
        return contactCache = [ created, ...contactCache.filter(item => item.id !== created.id) ],
        created;
      }
    },
    updateContact: updateContact,
    loadContactNotes: async function(contactId) {
      const normalizedContactId = String(contactId || "").trim();
      if (!normalizedContactId || !supportsContactNotes) return [];
      {
        const payload = await apiGet("/api/contact-notes", {
          contactId: normalizedContactId
        }), notes = (payload.items || payload || []).map(contactNoteDbToUi);
        return contactNoteCache = [ ...contactNoteCache.filter(note => note.contactId !== normalizedContactId), ...notes ],
        notes;
      }
    },
    createContactNote: async function(note) {
      return contactNotePayload(note), contactNoteDbToUi(await apiRequest("/api/contact-notes", {
        method: "POST",
        body: note
      }));
    },
    updateContactNote: async function(id, patch = {}) {
      const existing = contactNoteCache.find(note => note.id === id);
      if (!existing) throw new Error("Notiz wurde nicht gefunden.");
      return delete contactNotePayload({
        ...existing,
        ...patch,
        body: patch.body ?? patch.text ?? existing.body,
        contactId: existing.contactId
      }).contact_id, contactNoteDbToUi(await apiRequest(`/api/contact-notes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      }));
    },
    deleteContactNote: async function(id) {
      if (!contactNoteCache.find(note => note.id === id)) return !0;
      if (contactNoteAttachmentCache.some(attachment => attachment.noteId === id)) throw new Error("Bitte entferne zuerst alle Anhänge dieser Notiz.");
      return await apiRequest(`/api/contact-notes/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }), contactNoteCache = contactNoteCache.filter(item => item.id !== id), !0;
    },
    loadContactNoteAttachments: async function(contactId) {
      const normalizedContactId = String(contactId || "").trim();
      if (!normalizedContactId || !supportsContactNotes) return [];
      {
        const payload = await apiGet("/api/contact-note-attachments", {
          contactId: normalizedContactId
        }), attachments = (payload.items || payload || []).map(contactNoteAttachmentDbToUi);
        return contactNoteAttachmentCache = [ ...contactNoteAttachmentCache.filter(item => item.contactId !== normalizedContactId), ...attachments ],
        attachments;
      }
    },
    uploadContactNoteAttachment: async function(contactId, noteId, file, options = {}) {
      const meta = function(file) {
        if (!file) throw new Error("Bitte wähle eine Datei aus.");
        if (!CONTACT_NOTE_ATTACHMENT_TYPES.includes(file.type)) throw new Error("Erlaubt sind TXT-, PDF- und DOCX-Dateien.");
        if (!Number(file.size) || file.size > 10485760) throw new Error("Eine Datei darf maximal 10 MB groß sein.");
        return {
          fileName: String(file.name || "Datei").slice(0, 240),
          mimeType: file.type,
          fileSize: file.size
        };
      }(file), extraction = window.DocumentTextExtractor?.extract ? await window.DocumentTextExtractor.extract(file) : {
        status: "failed",
        text: "",
        error: "Dokumentextraktion ist nicht verfügbar."
      }, normalized = {
        contactId: String(contactId || ""),
        noteId: String(noteId || ""),
        ...meta,
        description: String(options.description || "").trim(),
        extractionStatus: extraction.status,
        extractedText: String(extraction.text || "").slice(0, 2e5),
        extractionError: String(extraction.error || "").slice(0, 500)
      };
      if (!normalized.contactId || !normalized.noteId) throw new Error("Notizbezug des Anhangs fehlt.");
      return contactNoteAttachmentDbToUi(await apiRequest("/api/contact-note-attachments", {
        method: "POST",
        body: {
          ...normalized,
          data: await fileToBase64(file)
        }
      }));
    },
    downloadContactNoteAttachment: async function(attachment) {
      const normalized = contactNoteAttachmentDbToUi(attachment);
      {
        const result = await async function(path) {
          const url = new URL(`${apiBaseUrl()}${path}`, window.location.origin), response = await fetch(url.href, {
            headers: {},
            credentials: CONFIG.apiCredentials || "same-origin"
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Datei konnte nicht geladen werden (${response.status}).`);
          }
          return {
            blob: await response.blob(),
            fileName: decodeURIComponent(response.headers.get("x-file-name") || "")
          };
        }(`/api/contact-note-attachments/${encodeURIComponent(normalized.id)}/content`);
        return {
          ...result,
          fileName: result.fileName || normalized.fileName
        };
      }
    },
    removeContactNoteAttachment: async function(attachment) {
      const normalized = contactNoteAttachmentDbToUi(attachment);
      return await apiRequest(`/api/contact-note-attachments/${encodeURIComponent(normalized.id)}`, {
        method: "DELETE"
      }), contactNoteAttachmentCache = contactNoteAttachmentCache.filter(item => item.id !== normalized.id),
      !0;
    },
    searchContactContent: async function(query, options = {}) {
      const search = String(query || "").trim(), limit = Math.max(1, Math.min(Number(options.limit || 40), 100));
      if (search.length < 2 || !supportsContactNotes) return [];
      {
        const payload = await apiGet("/api/contact-content-search", {
          query: search,
          limit: limit
        });
        return (payload.items || payload || []).map(normalizeContentSearchResult);
      }
    },
    uploadContactImage: async function(contactId, file, options = {}) {
      const meta = await async function(file) {
        if (!file) throw new Error("Bitte wähle ein Kontaktbild aus.");
        if (!CONTACT_IMAGE_TYPES.includes(file.type)) throw new Error("Bitte nutze ein JPG-, PNG- oder WebP-Bild.");
        if (file.size < 1 || file.size > 5242880) throw new Error("Das Kontaktbild darf maximal 5 MB groß sein.");
        let width = 0, height = 0;
        if ("function" == typeof window.createImageBitmap) {
          const bitmap = await window.createImageBitmap(file).catch(() => null);
          width = Number(bitmap?.width) || 0, height = Number(bitmap?.height) || 0, bitmap?.close?.();
        }
        if (!width || !height) {
          const objectUrl = URL.createObjectURL(file);
          try {
            const image = await new Promise((resolve, reject) => {
              const node = new Image;
              node.onload = () => resolve(node), node.onerror = () => reject(new Error("Die Bilddatei ist beschädigt oder nicht lesbar.")),
              node.src = objectUrl;
            });
            width = Number(image.naturalWidth) || 0, height = Number(image.naturalHeight) || 0;
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        }
        if (!width || !height) throw new Error("Die Bildabmessungen konnten nicht geprüft werden.");
        if (width > 4096 || height > 4096) throw new Error("Das Kontaktbild darf höchstens 4096 × 4096 Pixel groß sein.");
        return {
          width: width,
          height: height,
          contentType: file.type,
          size: file.size
        };
      }(file), timestamp = (await getContact(contactId), (new Date).toISOString()), patch = {
        image: "",
        imageStoragePath: "",
        imageKind: "upload",
        imageMimeType: meta.contentType,
        imageFileSize: meta.size,
        imageWidth: meta.width,
        imageHeight: meta.height,
        imageSourceUrl: "",
        imageSourceLabel: String(options.sourceLabel || "Eigener Upload").trim(),
        imageRightsNote: String(options.rightsNote || "").trim(),
        imageUpdatedAt: timestamp,
        imageUpdatedBy: await getCurrentUserId()
      };
      {
        const updated = normalizeContactUi(apiContactPayload(await apiRequest(`/api/contacts/${encodeURIComponent(contactId)}/image`, {
          method: "POST",
          body: {
            fileName: file.name || "kontaktbild",
            contentType: file.type,
            data: await fileToBase64(file),
            width: meta.width,
            height: meta.height,
            sourceLabel: patch.imageSourceLabel,
            rightsNote: patch.imageRightsNote
          }
        })));
        return contactCache = contactCache.map(contact => contact.id === contactId ? updated : contact),
        updated;
      }
    },
    setContactImageLink: async function(contactId, value, options = {}) {
      let url;
      try {
        url = new URL(String(value || "").trim());
      } catch (_error) {
        throw new Error("Bitte gib eine gültige HTTPS-Bildadresse ein.");
      }
      if ("https:" !== url.protocol) throw new Error("Kontaktbilder per Link müssen HTTPS verwenden.");
      const existing = await getContact(contactId);
      return await updateContact(contactId, {
        image: url.href,
        imageStoragePath: "",
        imageKind: "external",
        imageMimeType: "",
        imageFileSize: 0,
        imageWidth: 0,
        imageHeight: 0,
        imageSourceUrl: url.href,
        imageSourceLabel: String(options.sourceLabel || existing?.imageSourceLabel || "Externer Bildlink").trim(),
        imageRightsNote: String(options.rightsNote || existing?.imageRightsNote || "").trim(),
        imageUpdatedAt: (new Date).toISOString(),
        imageUpdatedBy: await getCurrentUserId()
      });
    },
    removeContactImage: async function(contactId) {
      await getContact(contactId);
      {
        const updated = normalizeContactUi(apiContactPayload(await apiRequest(`/api/contacts/${encodeURIComponent(contactId)}/image`, {
          method: "DELETE"
        })));
        return contactCache = contactCache.map(contact => contact.id === contactId ? updated : contact),
        updated;
      }
    },
    archiveContact: async function(id) {
      return updateContact(id, {
        status: "archived"
      }).then(archived => (contactCache = contactCache.filter(contact => contact.id !== id),
      archived));
    },
    restoreContact: async function(id) {
      return updateContact(id, {
        status: "active"
      }).then(restored => (contactCache = [ restored, ...contactCache.filter(contact => contact.id !== id) ],
      restored));
    },
    loadFormats: async function(options = {}) {
      {
        const payload = await apiGet("/api/formats", {
          includeArchived: options.includeArchived ? "true" : ""
        });
        return formatCache = Array.isArray(payload.items) ? payload.items : [], formatCache;
      }
    },
    createFormat: async function(format) {
      {
        const created = await apiRequest("/api/formats", {
          method: "POST",
          body: format
        });
        return formatCache = [ created, ...formatCache.filter(item => item.id !== created.id) ],
        created;
      }
    },
    updateFormat: updateFormat,
    archiveFormat: async function(id) {
      return updateFormat(id, {
        status: "Archiviert"
      });
    },
    deleteFormat: async function(id) {
      return await apiRequest(`/api/formats/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }), formatCache = formatCache.filter(format => format.id !== id), !0;
    },
    addFormatParticipant: async function(formatId, contactId, patch = {}) {
      {
        const updated = await apiRequest(`/api/formats/${encodeURIComponent(formatId)}/participants`, {
          method: "POST",
          body: {
            ...patch,
            contactId: contactId
          }
        });
        return formatCache = formatCache.map(format => format.id === formatId ? updated : format),
        updated;
      }
    },
    importFormatParticipants: async function(formatId, participants = []) {
      const entries = Array.isArray(participants) ? participants.filter(participant => participant?.contactId || participant?.contact_id) : [];
      if (!formatId || !entries.length) throw new Error("Keine Format-Einladungen für den Import vorhanden.");
      {
        const updated = await apiRequest(`/api/formats/${encodeURIComponent(formatId)}/participants/import`, {
          method: "POST",
          body: {
            items: entries
          }
        });
        return formatCache = formatCache.map(format => format.id === formatId ? updated : format),
        updated;
      }
    },
    updateFormatParticipant: async function(formatId, contactId, patch = {}) {
      {
        const updated = await apiRequest(`/api/formats/${encodeURIComponent(formatId)}/participants/${encodeURIComponent(contactId)}`, {
          method: "PATCH",
          body: patch
        });
        return formatCache = formatCache.map(format => format.id === formatId ? updated : format),
        updated;
      }
    },
    removeFormatParticipant: async function(formatId, contactId) {
      {
        const updated = await apiRequest(`/api/formats/${encodeURIComponent(formatId)}/participants/${encodeURIComponent(contactId)}`, {
          method: "DELETE"
        });
        return formatCache = formatCache.map(format => format.id === formatId ? updated : format),
        updated;
      }
    },
    loadHospitationSlots: async function(options = {}) {
      {
        const payload = await apiGet("/api/hospitation-slots", {
          includeArchived: options.includeArchived ? "true" : ""
        });
        return hospitationSlotCache = Array.isArray(payload.items) ? payload.items : [],
        hospitationSlotCache;
      }
    },
    createHospitationSlot: async function(slot) {
      {
        const created = await apiRequest("/api/hospitation-slots", {
          method: "POST",
          body: slot
        });
        return hospitationSlotCache = [ created, ...hospitationSlotCache.filter(item => item.id !== created.id) ],
        created;
      }
    },
    updateHospitationSlot: updateHospitationSlot,
    archiveHospitationSlot: async function(id) {
      return updateHospitationSlot(id, {
        status: "Archiviert"
      }).then(archived => (hospitationSlotCache = hospitationSlotCache.filter(slot => slot.id !== id),
      archived));
    },
    deleteHospitationSlot: async function(id) {
      return await apiRequest(`/api/hospitation-slots/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }), hospitationSlotCache = hospitationSlotCache.filter(slot => slot.id !== id),
      !0;
    },
    loadHospitations: loadHospitations,
    getHospitations: async function(options = {}) {
      return hospitationCache.length || await loadHospitations(options), migrateHospitationsWithLegacyImpulses(hospitationCache.filter(hospitation => options.includeArchived || "Archiviert" !== hospitation.status), options);
    },
    getHospitationById: getHospitationById,
    saveHospitation: saveHospitation,
    createHospitation: createHospitation,
    updateHospitation: updateHospitation,
    archiveHospitation: async function(id) {
      return updateHospitation(id, {
        status: "Archiviert"
      }).then(archived => (hospitationCache = hospitationCache.filter(hospitation => hospitation.id !== id),
      archived));
    },
    deleteHospitation: async function(id) {
      return await apiRequest(`/api/hospitations/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }), hospitationCache = hospitationCache.filter(hospitation => hospitation.id !== id),
      !0;
    },
    loadHospitationObservations: loadHospitationObservations,
    getHospitationObservations: async function(options = {}) {
      return hospitationObservationCache.length && !options.reload || await loadHospitationObservations(options),
      clone(hospitationObservationCache.filter(observation => (options.includeArchived || "archived" !== observation.status) && (!options.hospitationId || observation.hospitationId === options.hospitationId)));
    },
    updateHospitationObservation: updateHospitationObservation,
    syncHospitationObservations: async function(hospitationId, observations = []) {
      observations.map(observation => hospitationObservationDbToUi({
        ...hospitationObservationUiToDb(observation, hospitationId),
        created_at: observation.createdAt,
        created_by: observation.createdBy,
        updated_at: observation.updatedAt
      }));
      {
        const payload = await apiRequest(`/api/hospitations/${encodeURIComponent(hospitationId)}/observations/sync`, {
          method: "PUT",
          body: {
            observations: observations
          }
        });
        return Array.isArray(payload.items) ? payload.items : [];
      }
    },
    archiveHospitationObservation: async function(id, reason = "") {
      return updateHospitationObservation(id, {
        status: "archived",
        archivedAt: (new Date).toISOString(),
        archivedBy: "",
        archiveReason: String(reason || "").trim()
      });
    },
    loadHospitationObservationHistory: async function(observationId) {
      return [];
    },
    addObservation: async function(hospitationId, observation = {}) {
      const model = hospitationModel();
      if (!model?.addObservation) throw new Error("Das Hospitationsmodell ist nicht geladen.");
      const hospitation = await getHospitationById(hospitationId);
      if (!hospitation) throw new Error("Hospitation wurde nicht gefunden.");
      return saveHospitation(model.addObservation(hospitation, observation));
    },
    addQuote: async function(hospitationId, quote = {}) {
      const model = hospitationModel();
      if (!model?.addQuote) throw new Error("Das Hospitationsmodell ist nicht geladen.");
      const hospitation = await getHospitationById(hospitationId);
      if (!hospitation) throw new Error("Hospitation wurde nicht gefunden.");
      return saveHospitation(model.addQuote(hospitation, quote));
    },
    addMediaArtifact: async function(hospitationId, media = {}) {
      const model = hospitationModel();
      if (!model?.addMediaArtifact) throw new Error("Das Hospitationsmodell ist nicht geladen.");
      const hospitation = await getHospitationById(hospitationId);
      if (!hospitation) throw new Error("Hospitation wurde nicht gefunden.");
      return saveHospitation(model.addMediaArtifact(hospitation, media));
    },
    addImpulse: async function(hospitationId, impulse = {}) {
      const model = hospitationModel();
      if (!model?.addImpulse) throw new Error("Das Hospitationsmodell ist nicht geladen.");
      const hospitation = await getHospitationById(hospitationId);
      if (!hospitation) throw new Error("Hospitation wurde nicht gefunden.");
      return saveHospitation(model.addImpulse(hospitation, impulse));
    },
    calculateDocumentationCompleteness: function(hospitation = {}) {
      const model = hospitationModel();
      return model?.calculateDocumentationCompleteness ? model.calculateDocumentationCompleteness(hospitation) : {
        percent: hospitation.documentationSummary ? 100 : 0,
        completed: hospitation.documentationSummary ? 1 : 0,
        total: 1,
        missing: hospitation.documentationSummary ? [] : [ "summary" ],
        status: hospitation.documentationSummary ? "documented" : "draft"
      };
    },
    getDashboardAggregates: function(hospitations = hospitationCache, options = {}) {
      const model = hospitationModel(), items = migrateHospitationsWithLegacyImpulses(hospitations, options);
      return model?.getDashboardAggregates ? model.getDashboardAggregates(items) : {
        total: items.length,
        documented: items.filter(item => item.documentationSummary).length,
        counts: {}
      };
    },
    migrateHospitationsWithLegacyImpulses: migrateHospitationsWithLegacyImpulses,
    loadRoadmapItems: async function(options = {}) {
      {
        const payload = await apiGet("/api/roadmap-items", {
          includeInactive: options.includeInactive ? "true" : ""
        });
        return roadmapItemCache = Array.isArray(payload.items) ? payload.items : [], roadmapItemCache;
      }
    },
    loadHospitationRoadmapAssessments: async function(options = {}) {
      {
        const payload = await apiGet("/api/hospitation-roadmap-assessments", {
          hospitationId: options.hospitationId || ""
        });
        return hospitationRoadmapAssessmentCache = Array.isArray(payload.items) ? payload.items : [],
        hospitationRoadmapAssessmentCache;
      }
    },
    saveHospitationRoadmapAssessments: async function(hospitationId, assessments = []) {
      if (!hospitationId) return [];
      const seenRoadmapItems = new Set, cleanAssessments = assessments.map(assessment => function(row = {}) {
        return {
          id: row.id || "",
          hospitationId: row.hospitation_id || row.hospitationId || "",
          roadmapItemId: row.roadmap_item_id || row.roadmapItemId || "",
          respondentRole: row.respondent_role || row.respondentRole || "",
          respondentSector: row.respondent_sector || row.respondentSector || "",
          careRelevance: ratingValue(row.care_relevance ?? row.careRelevance),
          patientSafety: ratingValue(row.patient_safety ?? row.patientSafety),
          processRelief: ratingValue(row.process_relief ?? row.processRelief),
          urgency: ratingValue(row.urgency),
          implementationFeasibility: ratingValue(row.implementation_feasibility ?? row.implementationFeasibility),
          adoptionLikelihood: ratingValue(row.adoption_likelihood ?? row.adoptionLikelihood),
          confidenceScore: ratingValue(row.confidence_score ?? row.confidenceScore),
          comparisonRole: normalizeComparisonRole(row.comparison_role || row.comparisonRole),
          evidenceNote: row.evidence_note || row.evidenceNote || "",
          createdAt: row.created_at || row.createdAt || "",
          createdBy: row.created_by || row.createdBy || "",
          updatedAt: row.updated_at || row.updatedAt || "",
          updatedBy: row.updated_by || row.updatedBy || ""
        };
      }({
        ...assessment,
        hospitationId: hospitationId
      })).filter(assessment => !(!assessment.roadmapItemId || seenRoadmapItems.has(assessment.roadmapItemId) || (seenRoadmapItems.add(assessment.roadmapItemId),
      0)));
      {
        const payload = await apiRequest(`/api/hospitations/${encodeURIComponent(hospitationId)}/roadmap-assessments`, {
          method: "PUT",
          body: {
            items: cleanAssessments
          }
        }), items = Array.isArray(payload.items) ? payload.items : [];
        return hospitationRoadmapAssessmentCache = [ ...items, ...hospitationRoadmapAssessmentCache.filter(assessment => assessment.hospitationId !== hospitationId) ],
        items;
      }
    },
    loadHospitationUnmetNeeds: async function(options = {}) {
      {
        const payload = await apiGet("/api/hospitation-unmet-needs", {
          hospitationId: options.hospitationId || "",
          includeArchived: options.includeArchived ? "true" : ""
        });
        return hospitationUnmetNeedCache = Array.isArray(payload.items) ? payload.items : [],
        hospitationUnmetNeedCache;
      }
    },
    saveHospitationUnmetNeeds: async function(hospitationId, needs = []) {
      if (!hospitationId) return [];
      const cleanNeeds = needs.map(need => function(row = {}) {
        return {
          id: row.id || "",
          hospitationId: row.hospitation_id || row.hospitationId || "",
          relatedRoadmapItemId: row.related_roadmap_item_id || row.relatedRoadmapItemId || "",
          title: row.title || "",
          problem: row.problem || "",
          affectedRole: row.affected_role || row.affectedRole || "",
          affectedSector: row.affected_sector || row.affectedSector || "",
          classification: normalizeUnmetNeedClassification(row.classification),
          expectedBenefit: ratingValue(row.expected_benefit ?? row.expectedBenefit),
          urgency: ratingValue(row.urgency),
          implementationFeasibility: ratingValue(row.implementation_feasibility ?? row.implementationFeasibility),
          confidenceScore: ratingValue(row.confidence_score ?? row.confidenceScore),
          currentWorkaround: row.current_workaround || row.currentWorkaround || "",
          nextStep: row.next_step || row.nextStep || "",
          status: normalizeUnmetNeedStatus(row.status),
          createdAt: row.created_at || row.createdAt || "",
          createdBy: row.created_by || row.createdBy || "",
          updatedAt: row.updated_at || row.updatedAt || "",
          updatedBy: row.updated_by || row.updatedBy || ""
        };
      }({
        ...need,
        hospitationId: hospitationId
      })).filter(need => String(need.title || "").trim());
      {
        const payload = await apiRequest(`/api/hospitations/${encodeURIComponent(hospitationId)}/unmet-needs`, {
          method: "PUT",
          body: {
            items: cleanNeeds
          }
        }), items = Array.isArray(payload.items) ? payload.items : [];
        return hospitationUnmetNeedCache = [ ...items, ...hospitationUnmetNeedCache.filter(need => need.hospitationId !== hospitationId) ],
        items;
      }
    },
    loadNotifications: loadNotifications,
    getNotificationSummary: async function() {
      profileCache.size || await loadProfiles();
      const payload = await loadNotifications({
        unreadOnly: !0,
        limit: 100,
        offset: 0
      }), byContext = {};
      return (payload.items || []).forEach(item => {
        byContext[item.context] = (byContext[item.context] || 0) + 1;
      }), {
        unreadTotal: Object.values(byContext).reduce((sum, count) => sum + count, 0),
        byContext: byContext
      };
    },
    markNotificationRead: async function(id) {
      return !!id && !!supportsNotifications && (await apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: "PATCH"
      }), !0);
    },
    markNotificationsRead: markNotificationsRead,
    markAllNotificationsRead: async function(options = {}) {
      const context = String(options.context || "all").trim();
      return markNotificationsRead(((await loadNotifications({
        unreadOnly: !0,
        context: context,
        limit: 100,
        offset: 0
      })).items || []).map(item => item.id));
    },
    getDashboardStats: async function(filters = {}) {
      const items = await getContacts(filters);
      return {
        total: items.length,
        bySector: countBy(items, "category"),
        byState: countBy(items, "state"),
        byPriority: countBy(items, "priority")
      };
    },
    getMapData: async function(filters = {}) {
      return (await getContacts(filters)).filter(contact => Number.isFinite(contact.lat) && Number.isFinite(contact.lon));
    }
  };
}();
