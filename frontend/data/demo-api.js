/*
 * Öffentliche Demo-API für GitHub Pages.
 *
 * Sie stellt der unveränderten Anwendung dieselben /api-Endpunkte wie der
 * geschützte Zielbetrieb bereit. Alle Daten stammen aus demo-data.js und
 * bleiben ausschließlich im Arbeitsspeicher des aktuellen Browser-Tabs.
 * Es werden weder fachliche Daten versendet noch dauerhaft gespeichert.
 */
(function () {
  "use strict";

  const CONFIG = window.VERSORGUNGS_COMPASS_CONFIG || {};
  if (CONFIG.dataMode !== "demo" || CONFIG.authMode !== "anonymous-demo") return;

  const NOW = "2026-07-19T12:00:00.000Z";
  const DEMO_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const DEMO_NOTICE_DATA_VIEWS = new Set([
    "map",
    "contacts",
    "organizations",
    "activities",
    "analytics",
    "quality",
    "experts",
    "patients",
    "stakeholders",
    "framework",
    "hospitations",
    "questionnaire",
    "formats",
    "team",
    "personProfile",
    "organizationProfile"
  ]);
  const baseline = window.VERSORGUNGS_COMPASS_DEMO_DATA || {};
  const originalFetch = window.fetch.bind(window);
  let idCounter = 0;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createState() {
    const state = clone(baseline);
    state.profiles ||= [];
    state.currentProfileId = state.profiles.find((profile) => profile.role === (CONFIG.demoRole || "admin"))?.id
      || state.profiles[0]?.id
      || "demo-profile-admin";
    state.contacts ||= [];
    state.organizations ||= [];
    state.organizationPrimarySystems = state.organizations.flatMap((organization) => organization.primarySystems || []);
    state.expertGroups ||= [];
    state.expertContacts ||= [];
    state.expertOrganizations ||= [];
    state.expertEntityLinks ||= [];
    state.stakeholderTypes ||= [];
    state.stakeholderOrganizations ||= [];
    state.stakeholderPeople ||= [];
    state.savedViews ||= [];
    state.hospitationSlots ||= [];
    state.hospitations ||= [];
    state.hospitationObservations ||= [];
    state.roadmapItems ||= [];
    state.hospitationRoadmapAssessments ||= [];
    state.hospitationUnmetNeeds ||= [];
    state.formats ||= [];
    state.activityEvents ||= [];
    state.notifications ||= [];
    state.registrations ||= [];
    state.contactNotes ||= [];
    state.contactNoteAttachments ||= [];
    state.userSettings ||= {};
    return state;
  }

  let state = createState();

  function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-local-${String(idCounter).padStart(3, "0")}`;
  }

  function json(payload, status = 200, headers = {}) {
    return new Response(JSON.stringify(clone(payload)), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Versorgungs-Kompass-Demo": "memory-only",
        ...headers
      }
    });
  }

  function error(message, status = 400) {
    return json({ error: message }, status);
  }

  function activeRows(rows, includeArchived) {
    return rows.filter((row) => includeArchived || !["archived", "Archiviert"].includes(row.status));
  }

  function mergeById(target, rows) {
    (rows || []).forEach((row) => {
      const index = target.findIndex((item) => item.id === row.id);
      if (index >= 0) target[index] = { ...target[index], ...row, updatedAt: NOW };
      else target.push({ ...row, id: row.id || nextId("demo-import"), createdAt: NOW, updatedAt: NOW });
    });
  }

  function collectionForPath(path) {
    return {
      "/api/profiles": state.profiles,
      "/api/contacts": state.contacts,
      "/api/organizations": state.organizations,
      "/api/organization-primary-systems": state.organizationPrimarySystems,
      "/api/expert-groups": state.expertGroups,
      "/api/expert-contacts": state.expertContacts,
      "/api/expert-organizations": state.expertOrganizations,
      "/api/expert-entity-links": state.expertEntityLinks,
      "/api/stakeholder-types": state.stakeholderTypes,
      "/api/stakeholder-organizations": state.stakeholderOrganizations,
      "/api/stakeholder-people": state.stakeholderPeople,
      "/api/saved-views": state.savedViews,
      "/api/hospitation-slots": state.hospitationSlots,
      "/api/hospitations": state.hospitations,
      "/api/hospitation-observations": state.hospitationObservations,
      "/api/roadmap-items": state.roadmapItems,
      "/api/hospitation-roadmap-assessments": state.hospitationRoadmapAssessments,
      "/api/hospitation-unmet-needs": state.hospitationUnmetNeeds,
      "/api/formats": state.formats,
      "/api/activities": state.activityEvents,
      "/api/contact-notes": state.contactNotes,
      "/api/contact-note-attachments": state.contactNoteAttachments
    }[path] || null;
  }

  function propertyForResource(resource) {
    return {
      contacts: "contacts",
      organizations: "organizations",
      "organization-primary-systems": "organizationPrimarySystems",
      "expert-contacts": "expertContacts",
      "expert-organizations": "expertOrganizations",
      "expert-entity-links": "expertEntityLinks",
      "hospitation-slots": "hospitationSlots",
      hospitations: "hospitations",
      "hospitation-observations": "hospitationObservations",
      formats: "formats",
      "saved-views": "savedViews"
    }[resource] || "";
  }

  function prefixForResource(resource) {
    return {
      contacts: "demo-contact",
      organizations: "demo-organization",
      "organization-primary-systems": "demo-primary-system",
      "expert-contacts": "demo-expert-contact",
      "expert-organizations": "demo-expert-organization",
      "expert-entity-links": "demo-expert-link",
      "hospitation-slots": "demo-hospitation-slot",
      hospitations: "demo-hospitation",
      "hospitation-observations": "demo-observation",
      formats: "demo-format",
      "saved-views": "demo-view"
    }[resource] || "demo-item";
  }

  async function requestBody(input, init) {
    const body = init?.body;
    if (typeof body === "string") {
      try { return JSON.parse(body); } catch (_error) { return {}; }
    }
    if (body && typeof body === "object" && !(body instanceof FormData)) return body;
    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        const text = await input.clone().text();
        return text ? JSON.parse(text) : {};
      } catch (_error) {
        return {};
      }
    }
    return {};
  }

  function filterActivities(url) {
    const eventKey = url.searchParams.get("eventKey") || "";
    const category = url.searchParams.get("category") || "";
    const action = url.searchParams.get("action") || url.searchParams.get("kind") || "";
    const origin = url.searchParams.get("origin") || "";
    const actor = url.searchParams.get("changedBy") || "";
    const query = (url.searchParams.get("q") || "").toLocaleLowerCase("de");
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    return state.activityEvents.filter((item) => {
      const occurredAt = item.occurredAt || item.occurred_at || "";
      if (eventKey && item.eventKey !== eventKey) return false;
      if (category && item.categoryKey !== category) return false;
      if (action && item.actionKey !== action && item.action !== action) return false;
      if (origin && item.originKey !== origin) return false;
      if (actor && item.actorId !== actor) return false;
      if (from && new Date(occurredAt).getTime() < new Date(from).getTime()) return false;
      if (to && new Date(occurredAt).getTime() > new Date(to).getTime()) return false;
      return !query || JSON.stringify(item).toLocaleLowerCase("de").includes(query);
    });
  }

  function searchContactContent(query) {
    const needle = String(query || "").trim().toLocaleLowerCase("de");
    if (!needle) return [];
    const notes = state.contactNotes
      .filter((note) => [note.body, note.text, note.emailSubject].join(" ").toLocaleLowerCase("de").includes(needle))
      .map((note) => ({
        contactId: note.contactId || note.contact_id,
        noteId: note.id,
        resultKind: "free_note",
        title: note.title || "Notiz",
        snippet: note.body || note.text || "",
        occurredAt: note.occurredAt || note.createdAt || note.created_at || NOW,
        rank: 1
      }));
    const attachments = state.contactNoteAttachments
      .filter((attachment) => [attachment.fileName, attachment.file_name, attachment.description, attachment.extractedText, attachment.extracted_text].join(" ").toLocaleLowerCase("de").includes(needle))
      .map((attachment) => ({
        contactId: attachment.contactId || attachment.contact_id,
        noteId: attachment.noteId || attachment.note_id,
        attachmentId: attachment.id,
        resultKind: "attachment",
        title: attachment.fileName || attachment.file_name || "Anhang",
        snippet: attachment.description || attachment.extractedText || attachment.extracted_text || "",
        occurredAt: attachment.uploadedAt || attachment.uploaded_at || NOW,
        rank: 1.2
      }));
    return [...attachments, ...notes];
  }

  function byteArrayFromBase64(value) {
    const binary = window.atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function safeDemoMediaUrl(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(candidate)) return candidate;
    try {
      const url = new URL(candidate, window.location.origin);
      if (["http:", "https:"].includes(url.protocol) && url.origin === window.location.origin && !url.pathname.startsWith("/api/")) return url.href;
    } catch (_error) {
      // Ungültige oder externe Medienreferenzen bleiben in der öffentlichen Demo leer.
    }
    return "";
  }

  function sanitizeDemoMediaFields(property, payload = {}) {
    const sanitized = { ...payload };
    const fields = property === "contacts"
      ? ["image", "imageUrl", "image_url", "avatar", "avatarUrl", "avatar_url"]
      : ["logo", "logoUrl", "logo_url", "image", "imageUrl", "image_url"];
    for (const field of fields) {
      if (Object.hasOwn(sanitized, field)) sanitized[field] = safeDemoMediaUrl(sanitized[field]);
    }
    if (property === "contacts") {
      sanitized.imageStoragePath = "";
      sanitized.image_storage_path = "";
      if (Object.hasOwn(sanitized, "imageSourceUrl")) sanitized.imageSourceUrl = safeDemoMediaUrl(sanitized.imageSourceUrl);
      if (Object.hasOwn(sanitized, "image_source_url")) sanitized.image_source_url = safeDemoMediaUrl(sanitized.image_source_url);
    }
    return sanitized;
  }

  function updateOrganizationPrimarySystems() {
    state.organizations = state.organizations.map((organization) => ({
      ...organization,
      primarySystems: state.organizationPrimarySystems.filter((system) =>
        (system.organizationId || system.organization_id) === organization.id
      )
    }));
  }

  function addDemoActivity({ eventKey, categoryKey, actionKey, objectType, objectId, contactId = "", title, changes = [] }) {
    const profile = state.profiles.find((item) => item.id === state.currentProfileId) || state.profiles[0] || {};
    const contact = state.contacts.find((item) => item.id === contactId) || {};
    state.activityEvents.unshift({
      id: nextId("demo-activity"),
      eventKey,
      categoryKey,
      actionKey,
      objectType,
      objectId,
      contactId,
      title,
      actorId: profile.id || "",
      actor: {
        id: profile.id || "",
        displayName: profile.display_name || profile.displayName || "Demo Administration",
        email: profile.email || "",
        role: profile.role || "admin",
        team: profile.team || ""
      },
      contact: {
        id: contact.id || "",
        name: contact.name || "",
        organization: contact.organization || "",
        sector: contact.category || "",
        city: contact.city || "",
        state: contact.state || ""
      },
      occurredAt: new Date().toISOString(),
      originKey: "demo_memory",
      references: [{ type: objectType, id: objectId, label: contact.name || title }],
      changes,
      metadata: { synthetic: true, memoryOnly: true }
    });
  }

  async function handleDemoApi(url, method, body) {
    const path = url.pathname;
    const includeArchived = url.searchParams.get("includeArchived") === "true";

    if (method === "GET" && path === "/api/profile") {
      return json(state.profiles.find((profile) => profile.id === state.currentProfileId) || state.profiles[0] || null);
    }
    if (method === "PATCH" && path === "/api/profile") {
      const index = state.profiles.findIndex((profile) => profile.id === state.currentProfileId);
      if (index < 0) return error("Demo-Profil wurde nicht gefunden.", 404);
      state.profiles[index] = {
        ...state.profiles[index],
        ...body,
        display_name: body.displayName ?? body.display_name ?? state.profiles[index].display_name,
        updated_at: new Date().toISOString()
      };
      return json(state.profiles[index]);
    }
    if (["POST", "DELETE"].includes(method) && path === "/api/profile/avatar") {
      const index = state.profiles.findIndex((profile) => profile.id === state.currentProfileId);
      if (index < 0) return error("Demo-Profil wurde nicht gefunden.", 404);
      state.profiles[index] = {
        ...state.profiles[index],
        avatar_url: method === "POST" && body.data ? `data:${body.contentType || "image/png"};base64,${body.data}` : "",
        updated_at: new Date().toISOString()
      };
      return json(method === "POST" ? { profile: state.profiles[index] } : state.profiles[index]);
    }
    if (method === "GET" && path === "/api/user-settings") return json(state.userSettings);
    if (method === "PUT" && path === "/api/user-settings") {
      state.userSettings = { ...state.userSettings, ...body, userId: state.currentProfileId, updatedAt: new Date().toISOString() };
      return json(state.userSettings);
    }

    if (path === "/api/network-registrations" && method === "GET") {
      const status = url.searchParams.get("status") || "";
      return json({ items: state.registrations.filter((item) => !status || item.status === status) });
    }
    if (path === "/api/network-registrations" && method === "POST") {
      const registration = {
        ...body,
        id: nextId("demo-registration"),
        status: "neu",
        submittedAt: body.submittedAt || body.submitted_at || new Date().toISOString(),
        submitted_at: body.submittedAt || body.submitted_at || new Date().toISOString(),
        privacyCheckStatus: "synthetic_demo",
        privacy_check_status: "synthetic_demo"
      };
      state.registrations.unshift(registration);
      return json({ ok: true, registration, demo: true, persistence: "memory-only" }, 201);
    }
    const registrationMatch = path.match(/^\/api\/network-registrations\/([^/]+)$/);
    if (registrationMatch && method === "PATCH") {
      const id = decodeURIComponent(registrationMatch[1]);
      const index = state.registrations.findIndex((item) => item.id === id);
      if (index < 0) return error("Synthetische Registrierung wurde nicht gefunden.", 404);
      state.registrations[index] = { ...state.registrations[index], ...body, updatedAt: new Date().toISOString() };
      return json({ registration: state.registrations[index] });
    }

    if (method === "GET" && path === "/api/notifications") {
      const unreadOnly = url.searchParams.get("unreadOnly") === "true";
      const context = url.searchParams.get("context") || "all";
      const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
      const rows = state.notifications.filter((item) => {
        const unread = item.unread !== false && !(item.readAt || item.read_at);
        return (!unreadOnly || unread) && (context === "all" || !context || item.context === context);
      });
      return json({ items: rows.slice(offset, offset + limit), nextOffset: Math.min(rows.length, offset + limit), hasMore: rows.length > offset + limit });
    }
    if (method === "GET" && path === "/api/notifications/summary") {
      const unread = state.notifications.filter((item) => item.unread !== false && !(item.readAt || item.read_at));
      const byContext = unread.reduce((result, item) => ({ ...result, [item.context]: (result[item.context] || 0) + 1 }), {});
      return json({ unreadTotal: unread.length, byContext });
    }
    if (method === "PATCH" && (path === "/api/notifications/read" || /^\/api\/notifications\/[^/]+\/read$/.test(path))) {
      const ids = path === "/api/notifications/read" ? (body.ids || []) : [decodeURIComponent(path.split("/").at(-2))];
      state.notifications = state.notifications.map((item) => ids.includes(item.id || item.eventId)
        ? { ...item, unread: false, readAt: item.readAt || new Date().toISOString() }
        : item);
      return json({ ok: true });
    }

    if (method === "GET" && path === "/api/activities") {
      const rows = filterActivities(url);
      const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
      return json({ items: rows.slice(offset, offset + limit), nextOffset: Math.min(rows.length, offset + limit), hasMore: rows.length > offset + limit, nextCursor: null });
    }
    if (method === "GET" && path === "/api/contact-content-search") {
      return json({ items: searchContactContent(url.searchParams.get("query") || url.searchParams.get("q")) });
    }
    const contactHistoryMatch = path.match(/^\/api\/contacts\/([^/]+)\/history$/);
    if (method === "GET" && contactHistoryMatch) {
      const contactId = decodeURIComponent(contactHistoryMatch[1]);
      return json({ items: filterActivities(url).filter((item) => item.contactId === contactId) });
    }

    const contactImageWriteMatch = path.match(/^\/api\/contacts\/([^/]+)\/image$/);
    if (contactImageWriteMatch && ["POST", "DELETE"].includes(method)) {
      const contactId = decodeURIComponent(contactImageWriteMatch[1]);
      const index = state.contacts.findIndex((item) => item.id === contactId);
      if (index < 0) return error("Synthetischer Kontakt wurde nicht gefunden.", 404);
      const contentType = DEMO_IMAGE_TYPES.has(String(body.contentType || "").toLowerCase())
        ? String(body.contentType).toLowerCase()
        : "image/png";
      const imageData = String(body.data || "");
      let imageFileSize = 0;
      if (method === "POST") {
        try { imageFileSize = byteArrayFromBase64(imageData).length; }
        catch (_error) { return error("Das synthetische Kontaktbild ist nicht gültig.", 400); }
        if (!imageData) return error("Das synthetische Kontaktbild ist leer.", 400);
      }
      state.contacts[index] = method === "POST"
        ? {
            ...state.contacts[index],
            image: `data:${contentType};base64,${imageData}`,
            imageStoragePath: "",
            imageKind: "upload",
            imageMimeType: contentType,
            imageFileSize,
            imageWidth: Number(body.width) || 1,
            imageHeight: Number(body.height) || 1,
            imageSourceLabel: body.sourceLabel || "Lokaler Demo-Upload",
            imageRightsNote: body.rightsNote || "",
            imageUpdatedAt: new Date().toISOString(),
            imageUpdatedBy: state.currentProfileId
          }
        : {
            ...state.contacts[index],
            image: "",
            imageStoragePath: "",
            imageKind: "",
            imageMimeType: "",
            imageFileSize: 0,
            imageWidth: 0,
            imageHeight: 0,
            imageSourceLabel: "",
            imageRightsNote: "",
            imageUpdatedAt: new Date().toISOString(),
            imageUpdatedBy: state.currentProfileId
          };
      return json(state.contacts[index]);
    }

    const entityReadMatch = path.match(/^\/api\/(contacts|organizations|formats|hospitations)\/([^/]+)$/);
    if (method === "GET" && entityReadMatch) {
      const property = propertyForResource(entityReadMatch[1]);
      const row = state[property]?.find((item) => item.id === decodeURIComponent(entityReadMatch[2]));
      return row ? json(row) : error("Synthetischer Datensatz wurde nicht gefunden.", 404);
    }

    if (method === "GET") {
      const collection = collectionForPath(path);
      if (collection) {
        let rows = activeRows(collection, includeArchived);
        const status = url.searchParams.get("status") || "";
        const stakeholderTypeId = url.searchParams.get("stakeholderTypeId") || "";
        const hospitationId = url.searchParams.get("hospitationId") || "";
        const contactId = url.searchParams.get("contactId") || "";
        const organizationIds = (url.searchParams.get("organizationIds") || "").split(",").filter(Boolean);
        if (status) rows = rows.filter((row) => row.status === status);
        if (stakeholderTypeId) rows = rows.filter((row) => (row.stakeholderTypeId || row.stakeholder_type_id || row.stakeholderType) === stakeholderTypeId);
        if (hospitationId) rows = rows.filter((row) => (row.hospitationId || row.hospitation_id) === hospitationId);
        if (contactId) rows = rows.filter((row) => (row.contactId || row.contact_id) === contactId);
        if (organizationIds.length) rows = rows.filter((row) => organizationIds.includes(row.organizationId || row.organization_id));
        return json({ items: rows });
      }
    }

    if (method === "POST" && path === "/api/stakeholder-import") {
      mergeById(state.stakeholderTypes, body.types);
      mergeById(state.stakeholderOrganizations, (body.organizations || []).map((row) => sanitizeDemoMediaFields("stakeholderOrganizations", row)));
      mergeById(state.stakeholderPeople, body.people);
      return json({ types: state.stakeholderTypes, organizations: state.stakeholderOrganizations, people: state.stakeholderPeople });
    }

    if (method === "POST" && path === "/api/contact-notes") {
      const created = {
        ...body,
        id: body.id || nextId("demo-note"),
        contact_id: body.contactId || body.contact_id,
        body: body.body || body.text || "",
        created_by: state.currentProfileId,
        updated_by: state.currentProfileId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.contactNotes.unshift(created);
      addDemoActivity({ eventKey: "contact.note.created", categoryKey: "note_document", actionKey: "create", objectType: "contact_note", objectId: created.id, contactId: created.contact_id, title: "Gesprächsnotiz ergänzt" });
      return json(created, 201);
    }
    const noteMatch = path.match(/^\/api\/contact-notes\/([^/]+)$/);
    if (noteMatch && ["PATCH", "DELETE"].includes(method)) {
      const id = decodeURIComponent(noteMatch[1]);
      const index = state.contactNotes.findIndex((note) => note.id === id);
      if (index < 0) return error("Synthetische Notiz wurde nicht gefunden.", 404);
      if (method === "DELETE") {
        state.contactNoteAttachments = state.contactNoteAttachments.filter((attachment) =>
          (attachment.noteId || attachment.note_id) !== id
        );
        state.contactNotes.splice(index, 1);
        return json({ ok: true });
      }
      state.contactNotes[index] = { ...state.contactNotes[index], ...body, body: body.body || body.text || state.contactNotes[index].body, updated_at: new Date().toISOString() };
      return json(state.contactNotes[index]);
    }

    if (method === "POST" && path === "/api/contact-note-attachments") {
      const created = {
        ...body,
        id: body.id || nextId("demo-attachment"),
        contact_id: body.contactId || body.contact_id,
        note_id: body.noteId || body.note_id,
        file_name: body.fileName || body.file_name,
        mime_type: body.mimeType || body.mime_type,
        file_size: body.fileSize || body.file_size || 0,
        extracted_text: body.extractedText || body.extracted_text || "",
        extraction_status: body.extractionStatus || body.extraction_status || "complete",
        uploaded_at: new Date().toISOString(),
        uploader_id: state.currentProfileId,
        _demoData: body.data || ""
      };
      state.contactNoteAttachments.push(created);
      return json(created, 201);
    }
    const attachmentContentMatch = path.match(/^\/api\/contact-note-attachments\/([^/]+)\/content$/);
    if (method === "GET" && attachmentContentMatch) {
      const attachment = state.contactNoteAttachments.find((item) => item.id === decodeURIComponent(attachmentContentMatch[1]));
      if (!attachment) return error("Synthetischer Anhang wurde nicht gefunden.", 404);
      const content = attachment._demoData
        ? byteArrayFromBase64(attachment._demoData)
        : new TextEncoder().encode(attachment.extractedText || attachment.extracted_text || attachment.description || "Synthetischer Demo-Anhang");
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": attachment.mimeType || attachment.mime_type || "text/plain",
          "X-File-Name": encodeURIComponent(attachment.fileName || attachment.file_name || "demo.txt"),
          "Cache-Control": "no-store"
        }
      });
    }
    const attachmentMatch = path.match(/^\/api\/contact-note-attachments\/([^/]+)$/);
    if (method === "DELETE" && attachmentMatch) {
      const id = decodeURIComponent(attachmentMatch[1]);
      state.contactNoteAttachments = state.contactNoteAttachments.filter((item) => item.id !== id);
      return json({ ok: true });
    }

    const createResource = {
      "/api/contacts": ["contacts", "demo-contact", body.contact || body],
      "/api/organizations": ["organizations", "demo-organization", body],
      "/api/organization-primary-systems": ["organizationPrimarySystems", "demo-primary-system", body],
      "/api/expert-contacts": ["expertContacts", "demo-expert-contact", body],
      "/api/expert-organizations": ["expertOrganizations", "demo-expert-organization", body],
      "/api/expert-entity-links": ["expertEntityLinks", "demo-expert-link", body],
      "/api/hospitation-slots": ["hospitationSlots", "demo-hospitation-slot", body],
      "/api/hospitations": ["hospitations", "demo-hospitation", body],
      "/api/hospitation-observations": ["hospitationObservations", "demo-observation", body],
      "/api/formats": ["formats", "demo-format", body],
      "/api/saved-views": ["savedViews", "demo-view", body]
    }[path];
    if (method === "POST" && createResource) {
      const [property, prefix, payload] = createResource;
      const safePayload = sanitizeDemoMediaFields(property, payload);
      const created = { ...safePayload, id: safePayload.id || nextId(prefix), createdAt: safePayload.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      state[property].unshift(created);
      if (property === "organizationPrimarySystems") updateOrganizationPrimarySystems();
      const eventRoot = property === "hospitations" ? "hospitation" : property === "formats" ? "format" : property === "contacts" ? "contact" : "record";
      addDemoActivity({ eventKey: `${eventRoot}.created`, categoryKey: eventRoot === "record" ? "master_data" : eventRoot, actionKey: "create", objectType: eventRoot, objectId: created.id, contactId: created.contactId || (property === "contacts" ? created.id : ""), title: "Synthetischen Demo-Datensatz angelegt" });
      return json(created, 201);
    }

    const updateMatch = path.match(/^\/api\/(contacts|organizations|organization-primary-systems|expert-contacts|expert-organizations|expert-entity-links|hospitation-slots|hospitations|hospitation-observations|formats|saved-views)\/([^/]+)$/);
    if (updateMatch && ["PATCH", "DELETE"].includes(method)) {
      const property = propertyForResource(updateMatch[1]);
      const target = state[property];
      const id = decodeURIComponent(updateMatch[2]);
      const index = target.findIndex((item) => item.id === id);
      if (index < 0) return error("Synthetischer Datensatz wurde nicht gefunden.", 404);
      if (method === "DELETE") {
        if (property === "hospitations") {
          state.hospitationObservations = state.hospitationObservations.filter((item) => (item.hospitationId || item.hospitation_id) !== id);
          state.hospitationRoadmapAssessments = state.hospitationRoadmapAssessments.filter((item) => (item.hospitationId || item.hospitation_id) !== id);
          state.hospitationUnmetNeeds = state.hospitationUnmetNeeds.filter((item) => (item.hospitationId || item.hospitation_id) !== id);
        }
        if (property === "organizations") {
          state.organizationPrimarySystems = state.organizationPrimarySystems.filter((item) => (item.organizationId || item.organization_id) !== id);
        }
        target.splice(index, 1);
        if (property === "organizationPrimarySystems") updateOrganizationPrimarySystems();
        return json({ ok: true });
      }
      const before = target[index];
      const safeBody = sanitizeDemoMediaFields(property, body);
      target[index] = { ...target[index], ...safeBody, updatedAt: new Date().toISOString() };
      if (property === "organizationPrimarySystems") updateOrganizationPrimarySystems();
      if (property === "contacts") {
        addDemoActivity({
          eventKey: "contact.updated",
          categoryKey: "master_data",
          actionKey: "update",
          objectType: "contact",
          objectId: id,
          contactId: id,
          title: "Kontaktdaten aktualisiert",
          changes: Object.keys(safeBody).map((fieldName) => ({ fieldName, oldValue: before[fieldName] ?? "", newValue: safeBody[fieldName] ?? "" }))
        });
      }
      return json(target[index]);
    }

    const syncMatch = path.match(/^\/api\/hospitations\/([^/]+)\/(observations\/sync|roadmap-assessments|unmet-needs)$/);
    if (method === "PUT" && syncMatch) {
      const hospitationId = decodeURIComponent(syncMatch[1]);
      const property = syncMatch[2] === "observations/sync" ? "hospitationObservations" : syncMatch[2] === "roadmap-assessments" ? "hospitationRoadmapAssessments" : "hospitationUnmetNeeds";
      state[property] = state[property].filter((item) => (item.hospitationId || item.hospitation_id) !== hospitationId);
      const items = (body.items || body.observations || []).map((item) => ({ ...item, id: item.id || nextId("demo-item"), hospitationId, updatedAt: new Date().toISOString() }));
      state[property].push(...items);
      addDemoActivity({ eventKey: "hospitation.documented", categoryKey: "hospitation", actionKey: "document", objectType: "hospitation", objectId: hospitationId, title: "Synthetische Hospitationsauswertung gespeichert" });
      return json({ items });
    }

    const formatParticipantsImportMatch = path.match(/^\/api\/formats\/([^/]+)\/participants\/import$/);
    if (formatParticipantsImportMatch && method === "POST") {
      const format = state.formats.find((item) => item.id === decodeURIComponent(formatParticipantsImportMatch[1]));
      if (!format) return error("Synthetisches Format wurde nicht gefunden.", 404);
      format.participants ||= [];
      (body.items || []).forEach((entry) => {
        const contactId = entry.contactId || entry.contact_id || "";
        const index = format.participants.findIndex((item) => (item.contactId || item.contact_id) === contactId);
        const participant = { ...(index >= 0 ? format.participants[index] : {}), ...entry, id: index >= 0 ? format.participants[index].id : (entry.id || nextId("demo-format-participant")), formatId: format.id, contactId, updatedAt: new Date().toISOString() };
        if (index >= 0) format.participants[index] = participant;
        else format.participants.push(participant);
      });
      format.updatedAt = new Date().toISOString();
      return json(format);
    }
    const formatParticipantsMatch = path.match(/^\/api\/formats\/([^/]+)\/participants(?:\/([^/]+))?$/);
    if (formatParticipantsMatch && ["POST", "PATCH", "DELETE"].includes(method)) {
      const format = state.formats.find((item) => item.id === decodeURIComponent(formatParticipantsMatch[1]));
      if (!format) return error("Synthetisches Format wurde nicht gefunden.", 404);
      format.participants ||= [];
      const contactId = formatParticipantsMatch[2] ? decodeURIComponent(formatParticipantsMatch[2]) : (body.contactId || body.contact_id || "");
      const index = format.participants.findIndex((item) => (item.contactId || item.contact_id) === contactId);
      if (method === "POST" && index < 0) format.participants.push({ ...body, id: body.id || nextId("demo-format-participant"), formatId: format.id, contactId, updatedAt: new Date().toISOString() });
      if (method === "PATCH" && index >= 0) format.participants[index] = { ...format.participants[index], ...body, updatedAt: new Date().toISOString() };
      if (method === "DELETE") format.participants = format.participants.filter((item) => (item.contactId || item.contact_id) !== contactId);
      format.updatedAt = new Date().toISOString();
      addDemoActivity({ eventKey: "format.participant.updated", categoryKey: "format", actionKey: method.toLowerCase(), objectType: "format", objectId: format.id, contactId, title: "Synthetische Formatteilnahme aktualisiert" });
      return json(format, method === "POST" ? 201 : 200);
    }

    return error(`Die lokale Demo-API kennt den Aufruf ${method} ${path} noch nicht.`, 501);
  }

  window.fetch = async function (input, init = {}) {
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(requestUrl, window.location.href);
    const method = String(init.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return originalFetch(input, init);
    const body = await requestBody(input, init);
    return handleDemoApi(url, method, body);
  };

  function installDemoNotice() {
    if (!document.body || document.getElementById("vk-public-demo-notice")) return;
    const style = document.createElement("style");
    style.textContent = `
      #vk-public-demo-notice {
        position: fixed; z-index: 70;
        top: calc(14px + env(safe-area-inset-top, 0px)); right: calc(16px + env(safe-area-inset-right, 0px));
        min-height: 38px; box-sizing: border-box;
        display: flex; gap: 10px; align-items: center;
        padding: 4px 5px 4px 11px; border: 1px solid #d8e1ef; border-radius: 11px;
        color: #64748b; background: rgba(255,255,255,.96); box-shadow: 0 7px 18px rgba(16,35,110,.08);
        font: 620 11px/1.25 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(12px);
      }
      #vk-public-demo-notice[hidden], #vk-public-demo-trigger[hidden] { display: none; }
      #vk-public-demo-notice .vk-demo-copy { min-width: 0; display: flex; gap: 4px; align-items: center; }
      #vk-public-demo-notice strong { color: #475569; font-size: 11px; font-weight: 760; }
      #vk-public-demo-notice button {
        min-width: 38px; min-height: 30px; padding: 0 9px; border: 0; border-radius: 8px;
        color: #17275f; background: #eef3fb; font: inherit; font-weight: 760; cursor: pointer;
      }
      #vk-public-demo-notice button:hover, #vk-public-demo-notice button:focus-visible {
        background: #e2eafb; outline: 3px solid #155fe4; outline-offset: 2px;
      }
      #vk-public-demo-trigger {
        position: fixed; z-index: 70;
        top: calc(12px + env(safe-area-inset-top, 0px)); right: calc(12px + env(safe-area-inset-right, 0px));
        width: 38px; height: 38px; display: inline-grid; place-items: center;
        padding: 0; border: 1px solid #c9d8ef; border-radius: 11px;
        color: #1555a5; background: #eaf2ff; box-shadow: 0 7px 18px rgba(16,35,110,.08);
        backdrop-filter: blur(12px); cursor: pointer;
      }
      #vk-public-demo-trigger:hover, #vk-public-demo-trigger:focus-visible {
        background: #dceaff; outline: 3px solid #155fe4; outline-offset: 2px;
      }
      #vk-public-demo-trigger .vk-demo-trigger-mark {
        display: grid; place-items: center; width: 100%; height: 100%;
        color: inherit; background: transparent;
      }
      #vk-public-demo-trigger svg {
        width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;
        stroke-linecap: round; stroke-linejoin: round;
      }
      @media (max-width: 620px) {
        #vk-public-demo-notice {
          top: calc(10px + env(safe-area-inset-top, 0px)); right: calc(10px + env(safe-area-inset-right, 0px));
        }
      }
    `;
    document.head.appendChild(style);
    const notice = document.createElement("aside");
    notice.id = "vk-public-demo-notice";
    notice.setAttribute("role", "note");
    notice.setAttribute("aria-label", "Hinweis zur öffentlichen Demo");
    notice.hidden = true;
    notice.innerHTML = `
      <div class="vk-demo-copy"><strong>Hinweis:</strong> <span>Öffentliche Demo</span></div>
      <button type="button" data-demo-notice-close>OK</button>
    `;
    const closeButton = notice.querySelector("[data-demo-notice-close]");
    const trigger = document.createElement("button");
    trigger.id = "vk-public-demo-trigger";
    trigger.type = "button";
    trigger.hidden = true;
    trigger.setAttribute("aria-label", "Hinweis zur öffentlichen Demo anzeigen");
    trigger.setAttribute("aria-controls", notice.id);
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = `
      <span class="vk-demo-trigger-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 11v5"></path>
          <path d="M12 8h.01"></path>
        </svg>
      </span>
    `;
    let noticeCollapsed = false;
    const appShell = document.querySelector(".app-shell");
    const mobileViewport = window.matchMedia("(max-width: 760px)");
    const syncNoticeVisibility = () => {
      const activeView = appShell?.dataset.activeView || "";
      const mobileNavigationOpen =
        mobileViewport.matches &&
        appShell?.classList.contains("is-mobile-sidebar-expanded");
      const eligible =
        DEMO_NOTICE_DATA_VIEWS.has(activeView) &&
        !mobileNavigationOpen;
      notice.hidden = !eligible || noticeCollapsed;
      trigger.hidden = !eligible || !noticeCollapsed;
      trigger.setAttribute("aria-expanded", eligible && !noticeCollapsed ? "true" : "false");
    };
    closeButton.addEventListener("click", () => {
      noticeCollapsed = true;
      syncNoticeVisibility();
      if (!trigger.hidden) trigger.focus({ preventScroll: true });
    });
    trigger.addEventListener("click", () => {
      noticeCollapsed = false;
      syncNoticeVisibility();
      if (!notice.hidden) closeButton.focus({ preventScroll: true });
    });
    (document.querySelector(".app-main") || document.body).prepend(notice);
    document.body.appendChild(trigger);
    if (appShell) {
      new MutationObserver(syncNoticeVisibility).observe(appShell, {
        attributes: true,
        attributeFilter: ["data-active-view", "class"]
      });
    }
    mobileViewport.addEventListener?.("change", syncNoticeVisibility);
    syncNoticeVisibility();
  }

  window.VERSORGUNGS_COMPASS_DEMO_RUNTIME = Object.freeze({
    publicDemo: true,
    persistence: "memory-only",
    resetOnReload: true,
    syntheticOnly: true
  });
  window.VersorgungsCompassDemoApi = Object.freeze({
    active: true,
    reset() {
      state = createState();
      window.dispatchEvent(new CustomEvent("versorgungs-compass:demo-reset"));
      return clone(state);
    },
    snapshot() {
      return clone(state);
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installDemoNotice, { once: true });
  else installDemoNotice();
})();
