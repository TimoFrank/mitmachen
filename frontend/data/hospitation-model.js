(function () {
  const DOCUMENTATION_KIND = "hospitation-documentation-v2";
  const LEGACY_DOCUMENTATION_KIND = "hospitation-documentation-v1";
  const SYSTEM_TAGS = ["Hospitation", "Versorgungskontakt"];

  const codebook = Object.freeze({
    goalType: ["Einblick gewinnen", "Thema verstehen", "Verbesserung prüfen"],
    documentationStatus: ["draft", "documented", "reviewed"],
    processPhase: [
      "Anmeldung / Aufnahme",
      "Identifikation",
      "Behandlung / Beratung",
      "Verordnung",
      "Überweisung",
      "Befund / Dokumentation",
      "Kommunikation mit Patient:innen",
      "Kommunikation mit anderen Einrichtungen",
      "Nachbereitung",
      "Sonstiges"
    ],
    problemType: [
      "Medienbruch",
      "fehlende Information",
      "doppelte Dokumentation",
      "Rückfrage",
      "Wartezeit",
      "Workaround",
      "Systemverständnis",
      "Rollenunklarheit",
      "technisches Problem",
      "positives Muster / Best Practice",
      "offene Frage"
    ],
    impact: [
      "Zeitaufwand",
      "Fehleranfälligkeit",
      "Frust / Belastung",
      "Informationsverlust",
      "Patient:innen müssen selbst vermitteln",
      "Prozessverzögerung",
      "Sicherheitsgefühl sinkt",
      "Arbeitsfluss wird unterbrochen",
      "Ablauf funktioniert gut"
    ],
    observationType: [
      "Reibung / Problem",
      "positives Beispiel",
      "Gegenbeispiel",
      "offene Frage",
      "Kontextwissen"
    ],
    evidenceType: [
      { value: "directly_observed", label: "direkt beobachtet" },
      { value: "source_bound", label: "aus anonymisierter Beobachtungsunterlage" },
      { value: "synthetic_source_based", label: "synthetisch, quellenbasiert" },
      { value: "reported", label: "berichtet" },
      { value: "interpreted", label: "interpretiert" }
    ],
    usageRecommendation: [
      "Wissen teilen",
      "weiter validieren",
      "Produkt prüfen",
      "Technik prüfen",
      "Prozess prüfen",
      "Roadmap prüfen",
      "kein weiterer Schritt"
    ],
    quoteApprovalStatus: [
      { value: "open", label: "offen" },
      { value: "internal_approved", label: "intern freigegeben" },
      { value: "external_approved", label: "extern freigegeben" },
      { value: "not_usable", label: "nicht nutzbar" }
    ],
    mediaType: [
      { value: "workplace", label: "Arbeitsplatz" },
      { value: "process_step", label: "Prozessschritt" },
      { value: "form", label: "Formular" },
      { value: "notice", label: "Hinweiszettel" },
      { value: "whiteboard", label: "Whiteboard" },
      { value: "sketch", label: "Skizze" },
      { value: "material", label: "Material" },
      { value: "other", label: "Sonstiges" }
    ],
    impulseClassification: [
      { value: "knowledge", label: "Wissensimpuls" },
      { value: "product_question", label: "Produktfrage" },
      { value: "technical_question", label: "Technikfrage" },
      { value: "process_question", label: "Prozessfrage" },
      { value: "roadmap_signal", label: "Roadmap-Signal" },
      { value: "validation_needed", label: "Validierungsbedarf" }
    ],
    impulseStatus: [
      { value: "draft", label: "Entwurf" },
      { value: "to_review", label: "zu prüfen" },
      { value: "accepted", label: "übernommen" },
      { value: "rejected", label: "verworfen" },
      { value: "closed", label: "geschlossen" }
    ],
    systemTags: SYSTEM_TAGS
  });

  const labelAliases = {
    goalType: {
      kennenlernen: "Einblick gewinnen",
      exploration: "Einblick gewinnen",
      verstehen: "Thema verstehen",
      validation: "Verbesserung prüfen",
      verbesserung: "Verbesserung prüfen"
    },
    documentationStatus: {
      entwurf: "draft",
      dokumentiert: "documented",
      "in review": "reviewed",
      geprüft: "reviewed",
      geprueft: "reviewed"
    },
    processPhase: {
      dokumentation: "Befund / Dokumentation",
      "befundsuche": "Befund / Dokumentation",
      "überweisung / befundsuche": "Überweisung",
      "ueberweisung / befundsuche": "Überweisung",
      "verordnung und statusklärung": "Verordnung",
      "verordnung und statusklaerung": "Verordnung",
      "koordination und anschlussversorgung": "Nachbereitung",
      "patientenverständnis und nächste schritte": "Kommunikation mit Patient:innen",
      "patientenverstaendnis und naechste schritte": "Kommunikation mit Patient:innen",
      "prozessphase offen": "Sonstiges"
    },
    problemType: {
      statusunklarheit: "fehlende Information",
      informationslücke: "fehlende Information",
      informationsluecke: "fehlende Information",
      übergabeverzug: "fehlende Information",
      uebergabeverzug: "fehlende Information",
      verständlichkeitslücke: "Systemverständnis",
      verstaendlichkeitsluecke: "Systemverständnis",
      koordinationsaufwand: "Rollenunklarheit",
      "einordnung offen": "offene Frage"
    },
    impact: {
      zeit: "Zeitaufwand",
      mehraufwand: "Zeitaufwand",
      fehler: "Fehleranfälligkeit",
      fehleranfällig: "Fehleranfälligkeit",
      fehleranfaellig: "Fehleranfälligkeit",
      belastung: "Frust / Belastung",
      frust: "Frust / Belastung",
      informationslücke: "Informationsverlust",
      informationsluecke: "Informationsverlust",
      statusverlust: "Informationsverlust",
      vermittlungsaufwand: "Patient:innen müssen selbst vermitteln",
      verzögerung: "Prozessverzögerung",
      verzoegerung: "Prozessverzögerung",
      wartezeit: "Prozessverzögerung",
      unsicherheit: "Sicherheitsgefühl sinkt",
      unterbrechung: "Arbeitsfluss wird unterbrochen",
      "funktioniert gut": "Ablauf funktioniert gut"
    },
    observationType: {
      reibung: "Reibung / Problem",
      problem: "Reibung / Problem",
      "positives muster": "positives Beispiel",
      "positives beispiel": "positives Beispiel",
      bestpractice: "positives Beispiel",
      "best practice": "positives Beispiel",
      gegenbeispiel: "Gegenbeispiel",
      frage: "offene Frage",
      "offene frage": "offene Frage",
      kontext: "Kontextwissen",
      kontextwissen: "Kontextwissen"
    },
    evidenceType: {
      "direkt beobachtet": "directly_observed",
      "aus anonymisierter beobachtungsunterlage": "source_bound",
      "synthetisch, quellenbasiert": "synthetic_source_based",
      quellenbasiert: "synthetic_source_based",
      berichtet: "reported",
      interpretiert: "interpreted"
    },
    usageRecommendation: {
      teilen: "Wissen teilen",
      validieren: "weiter validieren",
      produkt: "Produkt prüfen",
      technik: "Technik prüfen",
      prozess: "Prozess prüfen",
      roadmap: "Roadmap prüfen",
      "keinen weiteren schritt": "kein weiterer Schritt"
    },
    quoteApprovalStatus: {
      offen: "open",
      "intern freigegeben": "internal_approved",
      "extern freigegeben": "external_approved",
      "nicht nutzbar": "not_usable"
    },
    mediaType: {
      arbeitsplatz: "workplace",
      prozessschritt: "process_step",
      formular: "form",
      hinweiszettel: "notice",
      whiteboard: "whiteboard",
      skizze: "sketch",
      material: "material",
      sonstiges: "other"
    },
    impulseClassification: {
      wissensimpuls: "knowledge",
      produktfrage: "product_question",
      technikfrage: "technical_question",
      prozessfrage: "process_question",
      "roadmap-signal": "roadmap_signal",
      validierungsbedarf: "validation_needed",
      communication_or_training: "knowledge",
      new_backlog_item: "product_question",
      local_system_issue: "technical_question",
      organizational_implementation: "process_question",
      existing_item_extension: "roadmap_signal",
      legal_clarification: "validation_needed"
    },
    impulseStatus: {
      entwurf: "draft",
      "zu prüfen": "to_review",
      "zu pruefen": "to_review",
      übernommen: "accepted",
      uebernommen: "accepted",
      verworfen: "rejected",
      geschlossen: "closed",
      neu: "draft",
      "in prüfung": "to_review",
      "in pruefung": "to_review",
      zurückgestellt: "rejected",
      zurueckgestellt: "rejected",
      erledigt: "closed",
      archiviert: "closed"
    }
  };

  const legacyImpulseClassification = {
    knowledge: "communication_or_training",
    product_question: "new_backlog_item",
    technical_question: "local_system_issue",
    process_question: "organizational_implementation",
    roadmap_signal: "existing_item_extension",
    validation_needed: "legal_clarification"
  };

  const legacyImpulseStatus = {
    draft: "Neu",
    to_review: "In Prüfung",
    accepted: "Übernommen",
    rejected: "Zurückgestellt",
    closed: "Erledigt"
  };

  function text(value) {
    return String(value ?? "").trim();
  }

  function list(value) {
    if (Array.isArray(value)) return [...new Set(value.map(text).filter(Boolean))];
    return [...new Set(text(value).split(/[;,]\s*|\n+/).map(text).filter(Boolean))];
  }

  function bool(value) {
    if (typeof value === "boolean") return value;
    const normalized = text(value).toLowerCase();
    if (["true", "1", "ja", "yes"].includes(normalized)) return true;
    if (["false", "0", "nein", "no"].includes(normalized)) return false;
    return false;
  }

  function rating(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 1 || number > 5) return null;
    return Math.round(number);
  }

  function valuesFor(key) {
    return (codebook[key] || []).map((entry) => (typeof entry === "object" ? entry.value : entry));
  }

  function normalizeCodebookValue(key, value, fallback = "") {
    const raw = text(value);
    if (!raw) return fallback;
    const values = valuesFor(key);
    if (values.includes(raw)) return raw;
    const alias = labelAliases[key]?.[raw.toLowerCase()];
    if (alias && values.includes(alias)) return alias;
    const labelMatch = (codebook[key] || []).find((entry) => typeof entry === "object" && text(entry.label).toLowerCase() === raw.toLowerCase());
    return labelMatch?.value || fallback;
  }

  function optionLabel(key, value) {
    const raw = text(value);
    const match = (codebook[key] || []).find((entry) => (typeof entry === "object" ? entry.value : entry) === raw);
    return typeof match === "object" ? match.label : match || raw;
  }

  function timestamp(value) {
    return text(value) || new Date().toISOString();
  }

  function generatedId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function systemTagSet() {
    return new Set(SYSTEM_TAGS.map((tag) => tag.toLowerCase()));
  }

  function splitTags(tags) {
    const allTags = list(tags);
    const systemTags = allTags.filter((tag) => systemTagSet().has(tag.toLowerCase()));
    const analysisTags = allTags.filter((tag) => !systemTagSet().has(tag.toLowerCase()));
    return {
      tags: allTags,
      systemTags,
      analysisTags
    };
  }

  function defaultDocumentationPayload(context = {}) {
    return {
      kind: DOCUMENTATION_KIND,
      version: 2,
      legacyKind: "",
      legacyNotes: "",
      experience: text(context.documentationSummary || context.summary),
      insight: "",
      nextUse: "",
      observation: text(context.documentationSummary || context.summary),
      processNotes: "",
      risks: "",
      transferPotential: "",
      scores: {},
      scoreLabels: {},
      scoreOrder: [],
      observations: [],
      quotes: [],
      mediaArtifacts: [],
      impulses: [],
      affectedProducts: [],
      updatedAt: timestamp(context.updatedAt)
    };
  }

  function normalizeScoreMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, raw]) => [text(key), rating(raw)])
        .filter(([key, score]) => key && score)
    );
  }

  function normalizeObservation(input = {}, context = {}) {
    const now = timestamp(input.updatedAt || input.updated_at || context.updatedAt);
    const hospitationId = text(input.hospitationId || input.hospitation_id || context.hospitationId || context.id);
    const situation = text(input.situation || input.situationContext || input.situation_context || input.context);
    const description = text(input.description || input.observed || input.concreteObservation || input.concrete_observation || input.observation);
    const involvedRoles = list(input.involvedRoles || input.involved_roles || input.affectedRoles || input.affected_roles);
    const relevanceScore = rating(input.relevanceScore ?? input.relevance_score ?? input.careRelevance ?? input.care_relevance);
    const usageRecommendation = normalizeCodebookValue("usageRecommendation", input.usageRecommendation || input.usage_recommendation || input.nextUse || input.next_use || input.possibleUse || input.possible_use, "");
    const workaround = text(input.workaround || input.currentWorkaround || input.current_workaround);
    const nextStep = text(input.nextStep || input.next_step);
    const sequence = Number(input.sequence || input.order || input.position || 0) || null;
    const actions = list(input.actions || input.actionSteps || input.action_steps);
    const toolsAndDocuments = list(input.toolsAndDocuments || input.tools_and_documents || input.tools || input.documents);
    const communicationChannels = list(input.communicationChannels || input.communication_channels || input.channels);
    const observationType = normalizeCodebookValue("observationType", input.observationType || input.observation_type || input.type, "");
    const topics = list(input.topics || input.themes || input.topic || input.theme);
    const affectedProducts = list(input.affectedProducts || input.affected_products || input.products || input.productReference || input.product_reference || input.product);
    const linkedQuoteIds = list(input.linkedQuoteIds || input.linked_quote_ids || input.quoteIds || input.quote_ids);
    const linkedMediaIds = list(input.linkedMediaIds || input.linked_media_ids || input.mediaIds || input.media_ids);
    return {
      id: text(input.id) || generatedId("observation"),
      hospitationId,
      title: text(input.title) || "Beobachtung",
      situation,
      situationContext: situation,
      description,
      observed: description,
      sequence,
      observedAt: text(input.observedAt || input.observed_at || input.observationTime || input.observation_time),
      trigger: text(input.trigger),
      actions,
      actionSteps: actions,
      toolsAndDocuments,
      communicationChannels,
      immediateConsequence: text(input.immediateConsequence || input.immediate_consequence || input.consequence),
      sourceType: text(input.sourceType || input.source_type),
      sourceReference: text(input.sourceReference || input.source_reference),
      uncertainty: text(input.uncertainty),
      limitations: text(input.limitations),
      relevanceReason: text(input.relevanceReason || input.relevance_reason),
      involvedRoles,
      affectedRoles: involvedRoles.join(", "),
      processPhase: normalizeCodebookValue("processPhase", input.processPhase || input.process_phase, ""),
      problemType: normalizeCodebookValue("problemType", input.problemType || input.problem_type, ""),
      impact: normalizeCodebookValue("impact", input.impact, ""),
      observationType,
      evidenceType: normalizeCodebookValue("evidenceType", input.evidenceType || input.evidence_type, "interpreted"),
      relevanceScore,
      careRelevance: relevanceScore,
      usageRecommendation,
      nextUse: usageRecommendation,
      workaround,
      currentWorkaround: workaround,
      nextStep,
      source: text(input.source || input.captureSource || input.capture_source || context.source),
      settingType: text(input.settingType || input.setting_type),
      theme: topics[0] || text(input.theme || input.topic),
      topics,
      themes: topics,
      affectedProducts,
      internalUseAllowed: bool(input.internalUseAllowed ?? input.internal_use_allowed ?? input.usageInternal ?? input.usage_internal),
      externalUseAllowed: bool(input.externalUseAllowed ?? input.external_use_allowed ?? input.usageExternal ?? input.usage_external),
      linkedQuoteIds,
      linkedMediaIds,
      createdAt: timestamp(input.createdAt || input.created_at || now),
      updatedAt: now
    };
  }

  function normalizeQuote(input = {}, context = {}) {
    const now = timestamp(input.updatedAt || input.updated_at || context.updatedAt);
    const personName = text(input.personName || input.person_name || input.contactName || input.contact_name || context.contactName || context.contact_name);
    const personImage = text(input.personImage || input.person_image || input.contactImage || input.contact_image || input.image || context.contactImage || context.contact_image);
    const role = text(input.role || input.personRole || input.person_role);
    const usageInternal = bool(input.usageInternal ?? input.usage_internal ?? input.internalUseAllowed ?? input.internal_use_allowed);
    const usageExternal = bool(input.usageExternal ?? input.usage_external ?? input.externalUseAllowed ?? input.external_use_allowed);
    return {
      id: text(input.id) || generatedId("quote"),
      hospitationId: text(input.hospitationId || input.hospitation_id || context.hospitationId || context.id),
      observationId: text(input.observationId || input.observation_id),
      quote: text(input.quote),
      personName,
      contactName: personName,
      personImage,
      contactImage: personImage,
      role,
      personRole: role,
      context: text(input.context),
      usageInternal,
      usageExternal,
      internalUseAllowed: usageInternal,
      externalUseAllowed: usageExternal,
      anonymized: bool(input.anonymized),
      approvalStatus: normalizeCodebookValue("quoteApprovalStatus", input.approvalStatus || input.approval_status, "open"),
      createdAt: timestamp(input.createdAt || input.created_at || now),
      updatedAt: now
    };
  }

  function normalizeMediaArtifact(input = {}, context = {}) {
    const now = timestamp(input.updatedAt || input.updated_at || context.updatedAt);
    const fileData = input.fileData || input.file_data || input.fileDataUrl || input.file_data_url || input.previewDataUrl || "";
    const hasPeopleVisible = bool(input.hasPeopleVisible ?? input.has_people_visible ?? input.peopleVisible ?? input.people_visible);
    const hasPersonalDataVisible = bool(input.hasPersonalDataVisible ?? input.has_personal_data_visible ?? input.personalDataVisible ?? input.personal_data_visible);
    const usageInternal = bool(input.usageInternal ?? input.usage_internal ?? input.internalUseAllowed ?? input.internal_use_allowed);
    const usageExternal = bool(input.usageExternal ?? input.usage_external ?? input.externalUseAllowed ?? input.external_use_allowed);
    return {
      id: text(input.id) || generatedId("media"),
      hospitationId: text(input.hospitationId || input.hospitation_id || context.hospitationId || context.id),
      observationId: text(input.observationId || input.observation_id),
      title: text(input.title) || "Medienbeleg",
      description: text(input.description),
      type: normalizeCodebookValue("mediaType", input.type, "other"),
      fileData,
      fileDataUrl: fileData,
      fileUrl: text(input.fileUrl || input.file_url),
      fileName: text(input.fileName || input.file_name),
      fileMimeType: text(input.fileMimeType || input.file_mime_type || input.mimeType),
      fileSize: Number(input.fileSize || input.file_size || 0) || 0,
      hasPeopleVisible,
      peopleVisible: hasPeopleVisible,
      hasPersonalDataVisible,
      personalDataVisible: hasPersonalDataVisible,
      needsRedaction: bool(input.needsRedaction ?? input.needs_redaction),
      usageInternal,
      usageExternal,
      internalUseAllowed: usageInternal,
      externalUseAllowed: usageExternal,
      approvalStatus: normalizeCodebookValue("quoteApprovalStatus", input.approvalStatus || input.approval_status, "open"),
      createdAt: timestamp(input.createdAt || input.created_at || now),
      updatedAt: now
    };
  }

  function normalizeImpulse(input = {}, context = {}) {
    const now = timestamp(input.updatedAt || input.updated_at || context.updatedAt);
    const problemStatement = text(input.problemStatement || input.problem_statement || input.problem);
    const workaround = text(input.workaround || input.currentWorkaround || input.current_workaround);
    const nextStep = text(input.nextStep || input.next_step);
    const urgencyScore = rating(input.urgencyScore ?? input.urgency_score ?? input.urgency);
    const status = normalizeCodebookValue("impulseStatus", input.status, "draft");
    return {
      id: text(input.id) || generatedId("impulse"),
      hospitationId: text(input.hospitationId || input.hospitation_id || context.hospitationId || context.id),
      relatedObservationIds: list(input.relatedObservationIds || input.related_observation_ids),
      title: text(input.title) || "Impuls",
      classification: normalizeCodebookValue("impulseClassification", input.classification, "validation_needed"),
      problemStatement,
      problem: problemStatement,
      expectedBenefit: text(input.expectedBenefit || input.expected_benefit),
      urgencyScore,
      urgency: urgencyScore,
      workaround,
      currentWorkaround: workaround,
      nextStep,
      status,
      relatedRoadmapItemId: text(input.relatedRoadmapItemId || input.related_roadmap_item_id),
      createdAt: timestamp(input.createdAt || input.created_at || now),
      updatedAt: now
    };
  }

  function legacyObservationFromPayload(payload = {}, context = {}) {
    const situation = text(payload.experience || payload.observation || context.documentationSummary || context.summary);
    const description = [payload.insight, payload.processNotes, payload.risks].map(text).filter(Boolean).join("\n\n");
    if (!situation && !description) return null;
    return normalizeObservation({
      id: `legacy-observation-${text(context.id || context.hospitationId) || "unspecified"}`,
      hospitationId: context.id || context.hospitationId,
      title: text(context.title) || "Allgemeine Beobachtung",
      situation,
      description,
      relevanceReason: payload.nextUse || payload.transferPotential || "",
      processPhase: "Sonstiges",
      evidenceType: "interpreted",
      usageRecommendation: "weiter validieren",
      createdAt: context.createdAt,
      updatedAt: payload.updatedAt || context.updatedAt
    }, context);
  }

  function normalizeDocumentationPayload(payload = {}, context = {}) {
    const fallback = defaultDocumentationPayload(context);
    const scores = normalizeScoreMap(payload.scores);
    const observations = Array.isArray(payload.observations) ? payload.observations.map((item) => normalizeObservation(item, context)) : [];
    const affectedProducts = list([
      ...list(payload.affectedProducts || payload.affected_products || payload.products || payload.gematikProducts || payload.gematik_products),
      ...observations.flatMap((observation) => observation.affectedProducts || [])
    ]);
    const normalized = {
      ...fallback,
      ...payload,
      kind: DOCUMENTATION_KIND,
      version: 2,
      legacyKind: text(payload.legacyKind || (payload.kind && payload.kind !== DOCUMENTATION_KIND ? payload.kind : "")),
      legacyNotes: text(payload.legacyNotes),
      experience: text(payload.experience || payload.observation || fallback.experience),
      insight: text(payload.insight || [payload.processNotes, payload.risks].map(text).filter(Boolean).join("\n\n")),
      nextUse: text(payload.nextUse || payload.transferPotential),
      observation: text(payload.observation || payload.experience || fallback.observation),
      processNotes: text(payload.processNotes || payload.insight),
      risks: text(payload.risks),
      transferPotential: text(payload.transferPotential || payload.nextUse),
      scores,
      scoreLabels: payload.scoreLabels && typeof payload.scoreLabels === "object" && !Array.isArray(payload.scoreLabels) ? payload.scoreLabels : {},
      scoreOrder: Array.isArray(payload.scoreOrder) ? payload.scoreOrder.map(text).filter((id) => scores[id]) : Object.keys(scores),
      observations,
      quotes: Array.isArray(payload.quotes) ? payload.quotes.map((item) => normalizeQuote(item, context)).filter((item) => item.quote) : [],
      mediaArtifacts: Array.isArray(payload.mediaArtifacts || payload.media_artifacts)
        ? (payload.mediaArtifacts || payload.media_artifacts).map((item) => normalizeMediaArtifact(item, context)).filter((item) => item.fileUrl || item.fileData || item.title || item.description)
        : [],
      impulses: Array.isArray(payload.impulses) ? payload.impulses.map((item) => normalizeImpulse(item, context)).filter((item) => item.title) : [],
      affectedProducts,
      updatedAt: timestamp(payload.updatedAt || payload.updated_at || context.updatedAt)
    };
    if (!normalized.observations.length) {
      const legacyObservation = legacyObservationFromPayload(normalized, context);
      if (legacyObservation) normalized.observations = [legacyObservation];
    }
    return normalized;
  }

  function parseDocumentationOutcome(raw, context = {}) {
    if (!text(raw)) return defaultDocumentationPayload(context);
    if (typeof raw === "object") return normalizeDocumentationPayload(raw, context);
    try {
      const parsed = JSON.parse(String(raw));
      if (parsed?.kind === LEGACY_DOCUMENTATION_KIND) {
        return normalizeDocumentationPayload({ ...parsed, legacyKind: LEGACY_DOCUMENTATION_KIND }, context);
      }
      return normalizeDocumentationPayload(parsed || {}, context);
    } catch (error) {
      return normalizeDocumentationPayload({
        legacyKind: "legacy-freetext",
        legacyNotes: text(raw),
        experience: text(raw),
        observation: text(raw)
      }, context);
    }
  }

  function serializeDocumentationPayload(payload = {}, context = {}) {
    return JSON.stringify(normalizeDocumentationPayload(payload, context));
  }

  function documentationStatusFor(hospitation = {}, documentation = defaultDocumentationPayload()) {
    const explicit = normalizeCodebookValue("documentationStatus", hospitation.documentationStatus || hospitation.documentation_status, "");
    if (explicit) return explicit;
    if (text(hospitation.status) === "Dokumentiert" || text(hospitation.documentationSummary || hospitation.documentation_summary || hospitation.summary)) return "documented";
    if (documentation.observations.length || documentation.quotes.length || documentation.mediaArtifacts.length || documentation.impulses.length) return "documented";
    return "draft";
  }

  function deriveGoalType(value = "") {
    const direct = normalizeCodebookValue("goalType", value, "");
    if (direct) return direct;
    const source = text(value).toLowerCase();
    if (/verbesser|prüf|pruef|produkt|prozess/.test(source)) return "Verbesserung prüfen";
    if (/versteh|thema|frage|problem/.test(source)) return "Thema verstehen";
    return "Einblick gewinnen";
  }

  function normalizeHospitationRecord(input = {}, options = {}) {
    const startsAt = text(input.startsAt || input.starts_at);
    const documentation = parseDocumentationOutcome(input.documentationOutcome || input.documentation_outcome, {
      ...input,
      hospitationId: input.id,
      summary: input.summary || input.documentationSummary || input.documentation_summary
    });
    const topics = list(input.tags || input.topics || input.themes);
    const tagGroups = splitTags(topics);
    const focusTopics = list(input.focusTopics || input.focus_topics || tagGroups.analysisTags);
    const title = text(input.title) || [text(input.contactName || input.contact_name), text(input.organizationName || input.organization_name), startsAt.slice(0, 10)].filter(Boolean).join(" · ") || "Hospitation";
    const normalized = {
      ...input,
      id: text(input.id) || generatedId("hospitation"),
      title,
      date: text(input.date) || startsAt.slice(0, 10),
      contactName: text(input.contactName || input.contact_name),
      organizationName: text(input.organizationName || input.organization_name),
      settingType: text(input.settingType || input.setting_type || input.location),
      sector: text(input.sector),
      federalState: text(input.federalState || input.federal_state || input.state),
      regionType: text(input.regionType || input.region_type),
      observedRoles: list(input.observedRoles || input.observed_roles).length
        ? list(input.observedRoles || input.observed_roles)
        : [...new Set(documentation.observations.flatMap((observation) => observation.involvedRoles))],
      goalType: deriveGoalType(input.goalType || input.goal_type || input.goal),
      focusTopics,
      tags: tagGroups.tags,
      systemTags: tagGroups.systemTags,
      analysisTags: tagGroups.analysisTags,
      summary: text(input.summary || input.documentationSummary || input.documentation_summary),
      notes: text(input.notes || input.requestNote || input.request_note),
      documentationStatus: documentationStatusFor(input, documentation),
      observations: documentation.observations,
      quotes: documentation.quotes,
      mediaArtifacts: documentation.mediaArtifacts,
      impulses: documentation.impulses,
      documentation: documentation,
      documentationOutcome: serializeDocumentationPayload(documentation, input),
      createdAt: timestamp(input.createdAt || input.created_at),
      updatedAt: timestamp(input.updatedAt || input.updated_at || options.updatedAt)
    };
    return normalized;
  }

  function legacyUnmetNeedToImpulse(need = {}, context = {}) {
    return normalizeImpulse({
      id: text(need.id) ? `impulse-${need.id}` : "",
      hospitationId: need.hospitationId || need.hospitation_id || context.id || context.hospitationId,
      title: need.title,
      classification: need.classification,
      problemStatement: need.problem,
      expectedBenefit: need.expectedBenefit || need.expected_benefit,
      urgencyScore: need.urgency,
      workaround: need.currentWorkaround || need.current_workaround,
      nextStep: need.nextStep || need.next_step,
      status: need.status,
      relatedRoadmapItemId: need.relatedRoadmapItemId || need.related_roadmap_item_id,
      createdAt: need.createdAt || need.created_at,
      updatedAt: need.updatedAt || need.updated_at
    }, context);
  }

  function impulseToLegacyUnmetNeed(impulse = {}) {
    const normalized = normalizeImpulse(impulse);
    return {
      id: text(normalized.id).startsWith("impulse-") ? normalized.id.replace(/^impulse-/, "") : normalized.id,
      hospitationId: normalized.hospitationId,
      relatedRoadmapItemId: normalized.relatedRoadmapItemId || "",
      title: normalized.title,
      problem: normalized.problemStatement,
      affectedRole: "",
      affectedSector: "",
      classification: legacyImpulseClassification[normalized.classification] || "new_backlog_item",
      expectedBenefit: rating(normalized.expectedBenefit),
      urgency: normalized.urgencyScore,
      implementationFeasibility: "",
      confidenceScore: 4,
      currentWorkaround: normalized.workaround,
      nextStep: normalized.nextStep,
      status: legacyImpulseStatus[normalized.status] || "Neu",
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt
    };
  }

  function migrateLegacyUnmetNeeds(hospitation = {}, unmetNeeds = []) {
    const normalized = normalizeHospitationRecord(hospitation);
    const relatedNeeds = (Array.isArray(unmetNeeds) ? unmetNeeds : [])
      .filter((need) => (need.hospitationId || need.hospitation_id) === normalized.id)
      .map((need) => legacyUnmetNeedToImpulse(need, normalized));
    if (!relatedNeeds.length) return normalized;
    const byKey = new Map(normalized.impulses.map((impulse) => [impulse.id || impulse.title, impulse]));
    relatedNeeds.forEach((impulse) => {
      const key = impulse.id || impulse.title;
      if (!byKey.has(key)) byKey.set(key, impulse);
    });
    const documentation = normalizeDocumentationPayload({
      ...normalized.documentation,
      impulses: [...byKey.values()]
    }, normalized);
    return {
      ...normalized,
      impulses: documentation.impulses,
      documentation,
      documentationOutcome: serializeDocumentationPayload(documentation, normalized)
    };
  }

  function updateDocumentationArray(hospitation, key, item, normalizer) {
    const normalized = normalizeHospitationRecord(hospitation);
    const documentation = normalizeDocumentationPayload(normalized.documentation, normalized);
    const nextItem = normalizer(item, normalized);
    const nextItems = [
      nextItem,
      ...(documentation[key] || []).filter((entry) => entry.id !== nextItem.id)
    ];
    const nextDocumentation = normalizeDocumentationPayload({
      ...documentation,
      [key]: nextItems,
      updatedAt: new Date().toISOString()
    }, normalized);
    return normalizeHospitationRecord({
      ...normalized,
      documentationOutcome: serializeDocumentationPayload(nextDocumentation, normalized),
      documentationSummary: normalized.summary,
      updatedAt: nextDocumentation.updatedAt
    });
  }

  function addObservation(hospitation, observation) {
    return updateDocumentationArray(hospitation, "observations", observation, normalizeObservation);
  }

  function addQuote(hospitation, quote) {
    return updateDocumentationArray(hospitation, "quotes", quote, normalizeQuote);
  }

  function addMediaArtifact(hospitation, media) {
    return updateDocumentationArray(hospitation, "mediaArtifacts", media, normalizeMediaArtifact);
  }

  function addImpulse(hospitation, impulse) {
    return updateDocumentationArray(hospitation, "impulses", impulse, normalizeImpulse);
  }

  function calculateDocumentationCompleteness(hospitation = {}) {
    const normalized = normalizeHospitationRecord(hospitation);
    const checks = [
      ["context", Boolean(normalized.date && (normalized.contactName || normalized.organizationName || normalized.settingType))],
      ["goal", Boolean(normalized.goalType && normalized.focusTopics.length)],
      ["summary", Boolean(normalized.summary || normalized.notes)],
      ["observation", normalized.observations.some((observation) => observation.situation || observation.description)],
      ["analysisCode", normalized.observations.some((observation) => observation.processPhase || observation.problemType || observation.impact)],
      ["source", normalized.observations.some((observation) => observation.evidenceType && observation.sourceReference)],
      ["consequence", normalized.observations.some((observation) => observation.immediateConsequence)]
    ];
    const completed = checks.filter(([, ok]) => ok).length;
    return {
      percent: Math.round((completed / checks.length) * 100),
      completed,
      total: checks.length,
      missing: checks.filter(([, ok]) => !ok).map(([key]) => key),
      status: normalized.documentationStatus
    };
  }

  function increment(counts, value) {
    const label = text(value);
    if (!label) return;
    counts[label] = (counts[label] || 0) + 1;
  }

  function sortedCounts(counts) {
    return Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "de"));
  }

  function getDashboardAggregates(hospitations = []) {
    const rows = (Array.isArray(hospitations) ? hospitations : []).map((item) => normalizeHospitationRecord(item));
    const counts = {
      documentationStatus: {},
      processPhase: {},
      problemType: {},
      impact: {},
      observationType: {},
      affectedProducts: {},
      roles: {},
      focusTopics: {},
      analysisTags: {},
      systemTags: {},
      evidenceType: {},
      usageRecommendation: {},
      impulseClassification: {},
      impulseStatus: {},
      mediaType: {}
    };
    let relevanceTotal = 0;
    let relevanceCount = 0;
    rows.forEach((hospitation) => {
      increment(counts.documentationStatus, hospitation.documentationStatus);
      hospitation.focusTopics.forEach((topic) => increment(counts.focusTopics, topic));
      hospitation.analysisTags.forEach((tag) => increment(counts.analysisTags, tag));
      hospitation.systemTags.forEach((tag) => increment(counts.systemTags, tag));
      hospitation.observedRoles.forEach((role) => increment(counts.roles, role));
      hospitation.observations.forEach((observation) => {
        increment(counts.processPhase, observation.processPhase);
        increment(counts.problemType, observation.problemType);
        increment(counts.impact, observation.impact);
        increment(counts.observationType, observation.observationType);
        observation.affectedProducts.forEach((product) => increment(counts.affectedProducts, product));
        increment(counts.evidenceType, optionLabel("evidenceType", observation.evidenceType));
        increment(counts.usageRecommendation, observation.usageRecommendation);
        observation.involvedRoles.forEach((role) => increment(counts.roles, role));
        if (observation.relevanceScore) {
          relevanceTotal += observation.relevanceScore;
          relevanceCount += 1;
        }
      });
      hospitation.mediaArtifacts.forEach((media) => increment(counts.mediaType, optionLabel("mediaType", media.type)));
      hospitation.impulses.forEach((impulse) => {
        increment(counts.impulseClassification, optionLabel("impulseClassification", impulse.classification));
        increment(counts.impulseStatus, optionLabel("impulseStatus", impulse.status));
      });
    });
    const allQuotes = rows.flatMap((hospitation) => hospitation.quotes);
    const allMedia = rows.flatMap((hospitation) => hospitation.mediaArtifacts);
    const allImpulses = rows.flatMap((hospitation) => hospitation.impulses);
    const allObservations = rows.flatMap((hospitation) => hospitation.observations);
    return {
      total: rows.length,
      documented: rows.filter((row) => row.documentationStatus !== "draft").length,
      observationsTotal: allObservations.length,
      quotesTotal: allQuotes.length,
      mediaArtifactsTotal: allMedia.length,
      impulsesTotal: allImpulses.length,
      relevanceScoreAverage: relevanceCount ? relevanceTotal / relevanceCount : null,
      documentationCompletenessAverage: rows.length
        ? rows.reduce((sum, row) => sum + calculateDocumentationCompleteness(row).percent, 0) / rows.length
        : 0,
      counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, sortedCounts(value)])),
      epicCandidates: allImpulses.filter((impulse) => ["product_question", "roadmap_signal", "validation_needed"].includes(impulse.classification))
    };
  }

  window.VersorgungsCompassHospitationModel = {
    DOCUMENTATION_KIND,
    LEGACY_DOCUMENTATION_KIND,
    codebook,
    systemTags: SYSTEM_TAGS,
    normalizeCodebookValue,
    optionLabel,
    normalizeObservation,
    normalizeQuote,
    normalizeMediaArtifact,
    normalizeImpulse,
    parseDocumentationOutcome,
    serializeDocumentationPayload,
    normalizeDocumentationPayload,
    normalizeHospitationRecord,
    migrateLegacyUnmetNeeds,
    legacyUnmetNeedToImpulse,
    impulseToLegacyUnmetNeed,
    addObservation,
    addQuote,
    addMediaArtifact,
    addImpulse,
    calculateDocumentationCompleteness,
    getDashboardAggregates
  };
})();
