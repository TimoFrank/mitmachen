(function () {
  "use strict";

  const COLORS = Object.freeze({
    navy: "001489",
    blue: "155FE4",
    orange: "FF7A3D",
    teal: "0F766E",
    text: "334155",
    muted: "64748B",
    paleBlue: "EAF1FF",
    paleTeal: "E8F7F4",
    paleOrange: "FFF1EA",
    neutral: "F7FAFC",
    border: "B8C9DD",
    white: "FFFFFF"
  });

  const CODING_BADGE_PALETTES = Object.freeze({
    problem: Object.freeze({ fill: "F2EEFF", border: "D8CDF8", text: "5B3EB2" }),
    phase: Object.freeze({ fill: "EAF2FF", border: "CBDCFB", text: "215CB8" }),
    impact: Object.freeze({ fill: "FFF5E5", border: "F0D5AA", text: "9A5B08" }),
    evidence: Object.freeze({ fill: "E8F7F4", border: "B9DED7", text: "0F766E" }),
    relevance: Object.freeze({ fill: "EAF1FF", border: "B8D0FF", text: "155FE4" }),
    usage: Object.freeze({ fill: "EAF9F5", border: "BFE3DC", text: "167060" })
  });

  // Official start-page logo; embedded for synchronous, offline Word/PDF export.
  // Source: public/brand/mitmachen/flechtwerk-lockup-horizontal.svg
  // Source SHA-256: 15b5255f1c65637b2f84c30bddbdbfcf2317f2cee68a101fb7eb55e50f9ff98e
  // Rasterization: sharp(svg, { density: 108 }).flatten({ background: '#fff' })
  //   .jpeg({ quality: 92, chromaSubsampling: '4:4:4' }); 615 x 144 px.
  const DOCUMENT_LOGO_JPEG = "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";

  // Versionierter Darstellungsvertrag des Einzeltermin-Exports. Die Erfassung
  // und ihre laufende Codebuch-Migration bleiben davon unabhängig. Gespeicherte
  // Altwerte werden weder normalisiert noch fachlich neu zugeordnet.
  const APPOINTMENT_CODEBOOK = freezeReportCodebook({
    "version": "1.1-erprobung",
    "codebook": {
      "processPhase": [
        "Zugang",
        "Aufnahme",
        "Abklärung",
        "Versorgung",
        "Übergang",
        "Nachsorge",
        "Übergreifend",
        "Noch nicht zuordenbar"
      ],
      "problemType": [
        {
          "value": "Information fehlt",
          "label": "Fehlende Information"
        },
        {
          "value": "Doppelte Dokumentation",
          "label": "Doppelte Dokumentation"
        },
        {
          "value": "Technik gestört",
          "label": "Technische Störung"
        },
        {
          "value": "Abstimmung unklar",
          "label": "Unklare Abstimmung"
        },
        {
          "value": "Verständnis erschwert",
          "label": "Verständnisproblem"
        },
        {
          "value": "Kapazität fehlt",
          "label": "Fehlende Kapazität"
        },
        {
          "value": "Anderer Aspekt",
          "label": "Anderes Problem"
        },
        {
          "value": "Kein Hindernis",
          "label": "Kein Problem erkennbar"
        },
        {
          "value": "Noch nicht zuordenbar",
          "label": "Noch nicht zuordenbar"
        }
      ],
      "impact": [
        "Zusätzliche Arbeit",
        "Verzögerung",
        "Fehler",
        "Belastung",
        "Entlastung",
        "Andere Folge",
        "Nicht feststellbar"
      ],
      "evidenceType": [
        {
          "value": "directly_observed",
          "label": "direkt beobachtet"
        },
        {
          "value": "reported",
          "label": "berichtet"
        },
        {
          "value": "source_bound",
          "label": "Beobachtungsunterlage"
        },
        {
          "value": "interpreted",
          "label": "Annahme"
        },
        {
          "value": "synthetic_source_based",
          "label": "synthetisches Beispiel"
        }
      ]
    },
    "legacyCodebook": {
      "processPhase": [
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
      "problemType": [
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
        "offene Frage",
        "Übernahme nötig"
      ],
      "impact": [
        "Zeitaufwand",
        "Fehleranfälligkeit",
        "Frust / Belastung",
        "Informationsverlust",
        "Patient:innen müssen selbst vermitteln",
        "Prozessverzögerung",
        "Sicherheitsgefühl sinkt",
        "Arbeitsfluss wird unterbrochen",
        "Ablauf funktioniert gut"
      ]
    }
  });

  function freezeReportCodebook(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freezeReportCodebook);
      Object.freeze(value);
    }
    return value;
  }

  function documentLogo() {
    return { bytes: Uint8Array.from(atob(DOCUMENT_LOGO_JPEG), (character) => character.charCodeAt(0)), width: 615, height: 144 };
  }

  const DOCUMENT_LABEL = "Hospitations-Termine | synchronisierter Spiegel";
  const A4 = Object.freeze({ widthDxa: 11906, heightDxa: 16838, usableDxa: 10152 });

  function text(value) {
    return String(value ?? "")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function list(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean);
    return text(value).split(/\n+|[;,]\s*/).map(text).filter(Boolean);
  }

  function unique(values) {
    return [...new Set(list(values))];
  }

  function nonEmpty(...values) {
    return values.map(text).find(Boolean) || "";
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\u00a0/g, " ")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return new Intl.DateTimeFormat("de-DE", includeTime
      ? { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }
      : { dateStyle: "medium", timeZone: "Europe/Berlin" }
    ).format(date);
  }

  function formatGeneratedAt(value) {
    return formatDate(value || new Date().toISOString(), true);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(date);
  }

  function localDateKey(value) {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
    if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Berlin" }).format(date);
  }

  function normalizeSnapshot(input = {}) {
    const generatedAt = text(input.generatedAt) || new Date().toISOString();
    const requestedKind = text(input.documentKind);
    const documentKind = requestedKind === "observations"
      ? "observations"
      : requestedKind === "appointment" ? "appointment" : "appointments";
    const appointments = Array.isArray(input.appointments) ? input.appointments : [];
    const hospitations = Array.isArray(input.hospitations)
      ? input.hospitations
      : appointments.filter((item) => item.kind !== "slot");
    return {
      documentKind,
      documentLabel: text(input.documentLabel) || (documentKind === "observations"
        ? "Hospitations-Beobachtungen | Übersicht"
        : documentKind === "appointment" ? "Hospitations-Framework" : DOCUMENT_LABEL),
      title: text(input.title) || (documentKind === "observations"
        ? "Hospitations-Beobachtungen"
        : documentKind === "appointment" ? "Hospitations-Framework" : "Hospitations-Termine & Beobachtungen"),
      subtitle: text(input.subtitle) || (documentKind === "appointment"
        ? "Unknown Unknowns aus der Versorgung"
        : "Versorgungs-Kompass | #Mitmachen"),
      modeLabel: text(input.modeLabel) || "Geschuetzter Datenstand",
      generatedAt,
      generatedLabel: formatGeneratedAt(generatedAt),
      appointments,
      hospitations,
      sourceUpdatedAt: text(input.sourceUpdatedAt),
      summary: {
        appointments: appointments.length,
        hospitations: hospitations.length,
        observations: hospitations.reduce((sum, item) => sum + observationItems(item).length, 0)
      }
    };
  }

  function countLabel(value, singular, plural) {
    const count = Number(value) || 0;
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function summaryLabel(snapshot) {
    return [
      countLabel(snapshot.summary.appointments, "Termin", "Termine"),
      countLabel(snapshot.summary.hospitations, "Hospitation", "Hospitationen"),
      countLabel(snapshot.summary.observations, "Beobachtung", "Beobachtungen")
    ].join(" | ");
  }

  function overviewTitle(snapshot) {
    return Number(snapshot.summary.appointments) === 1 ? "Termin" : "Alle Termine";
  }

  function overviewDescription(snapshot) {
    return Number(snapshot.summary.appointments) === 1
      ? "Einzelansicht des Hospitations-Termins. Das zugehörige Beobachtungskapitel folgt anschließend."
      : "Terminübersicht des Hospitations-Moduls. Eigene Beobachtungskapitel folgen für dokumentierte Hospitationen.";
  }

  function documentationFor(item = {}) {
    return item.documentation && typeof item.documentation === "object" ? item.documentation : {};
  }

  function observationItems(item = {}) {
    const documentation = documentationFor(item);
    return Array.isArray(documentation.observations)
      ? documentation.observations
      : Array.isArray(item.observations) ? item.observations : [];
  }

  function quoteItems(item = {}) {
    const documentation = documentationFor(item);
    return Array.isArray(documentation.quotes) ? documentation.quotes : [];
  }

  function mediaItems(item = {}) {
    const documentation = documentationFor(item);
    return Array.isArray(documentation.mediaArtifacts) ? documentation.mediaArtifacts : [];
  }

  function impulseItems(item = {}) {
    const documentation = documentationFor(item);
    return Array.isArray(documentation.impulses) ? documentation.impulses : [];
  }

  function boolLabel(value, yes = "Ja", no = "Nein") {
    return value === true ? yes : value === false ? no : "";
  }

  function optionLabel(key, value) {
    const model = window.VersorgungsCompassHospitationModel;
    return typeof model?.optionLabel === "function" ? model.optionLabel(key, value) : text(value);
  }

  function joined(values, separator = ", ") {
    return unique(values).join(separator);
  }

  function observationEvidenceValue(item = {}) {
    const originalEvidenceType = text(item.originalEvidenceType || item.original_evidence_type || item.payload?.originalEvidenceType || item.payload?.original_evidence_type);
    const value = originalEvidenceType === "synthetic_source_based"
      ? "synthetic_source_based"
      : text(item.evidenceType ?? item.evidence_type ?? item.payload?.evidenceType);
    return value;
  }

  function observationEvidenceLabel(item = {}) {
    const value = observationEvidenceValue(item);
    return text(value) ? optionLabel("evidenceType", value) : "";
  }

  function observationCodeLabel(key, value) {
    const label = text(optionLabel(key, value));
    if (!label) return "";
    const model = window.VersorgungsCompassHospitationModel;
    return model?.isLegacyCodebookValue?.(key, value) ? `${label} (bisherige Codierung)` : label;
  }

  function observationSource(item = {}) {
    return [item.sourceType, item.source, item.sourceReference].map(text).filter(Boolean).join(" | ");
  }

  function observationText(item) {
    return window.VersorgungsCompassHospitationModel.observationText(item);
  }

  function observationAssessmentFields(item = {}) {
    const relevance = [item.relevanceScore || item.careRelevance ? `${item.relevanceScore || item.careRelevance} / 5` : "", item.relevanceReason].map(text).filter(Boolean).join(" - ");
    return [
      ["Beobachtungsart", observationCodeLabel("observationType", item.observationType)],
      ["Nächste Nutzung", nonEmpty(item.usageRecommendation, item.nextUse)],
      ["Relevanz", relevance],
      ["Nächster Schritt", item.nextStep]
    ].filter(([, value]) => text(value));
  }

  function appointmentCodeLabel(key, value) {
    const raw = text(value);
    if (!raw) return "";
    const options = APPOINTMENT_CODEBOOK.codebook[key] || [];
    const valueOf = (entry) => typeof entry === "object" ? entry.value : entry;
    const labelOf = (entry) => typeof entry === "object" ? entry.label : entry;
    const exact = options.find((entry) => valueOf(entry) === raw);
    if (exact) return labelOf(exact);
    // Groß-/Kleinschreibung trennt alte von neuen fachlichen Zuordnungen.
    if ((APPOINTMENT_CODEBOOK.legacyCodebook[key] || []).includes(raw)) return `${raw}*`;
    const display = options.find((entry) => labelOf(entry) === raw);
    if (display) return labelOf(display);
    return `${raw}**`;
  }

  function appointmentSourceLabel(value) {
    return appointmentCodeLabel("evidenceType", value);
  }

  function codeHelpNotes(snapshot) {
    const observations = (snapshot?.hospitations || []).flatMap(observationItems);
    const values = observations.flatMap((observation) => [
      ...appointmentCodingItems(observation).map((item) => item.value),
      appointmentSourceLabel(observationEvidenceValue(observation))
    ]);
    return [
      values.some((value) => /(?<!\*)\*$/.test(value)) ? "* Bisherige Codierung; unverändert übernommen." : "",
      values.some((value) => value.endsWith("**")) ? "** Außerhalb des Codebuchs 1.1; unverändert übernommen." : ""
    ].filter(Boolean);
  }

  function codeHelpItems() {
    const labels = (key) => APPOINTMENT_CODEBOOK.codebook[key].map((entry) =>
      appointmentCodeLabel(key, typeof entry === "object" ? entry.value : entry));
    return [
      { label: "Prozessphase", values: labels("processPhase"), palette: CODING_BADGE_PALETTES.phase },
      { label: "Problemtyp", values: labels("problemType"), palette: CODING_BADGE_PALETTES.problem },
      { label: "Auswirkung", values: labels("impact"), palette: CODING_BADGE_PALETTES.impact },
      { label: "Quelle", values: labels("evidenceType"), palette: CODING_BADGE_PALETTES.evidence }
    ];
  }

  function observationCodingItems(item = {}) {
    return [
      { label: "Prozessphase", value: observationCodeLabel("processPhase", item.processPhase) || "Noch nicht codiert", tone: "phase" },
      { label: "Problemtyp", value: observationCodeLabel("problemType", item.problemType) || "Noch nicht codiert", tone: "problem" },
      { label: "Auswirkung", value: observationCodeLabel("impact", item.impact) || "Noch nicht codiert", tone: "impact" }
    ].map((entry) => ({ ...entry, palette: CODING_BADGE_PALETTES[entry.tone] }));
  }

  function wCodingBadgeCell(item = {}, width = 3220) {
    const palette = item.palette || CODING_BADGE_PALETTES.relevance;
    return `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${width}"/><w:tcBorders><w:top w:val="single" w:sz="7" w:color="${palette.border}"/><w:left w:val="single" w:sz="7" w:color="${palette.border}"/><w:bottom w:val="single" w:sz="7" w:color="${palette.border}"/><w:right w:val="single" w:sz="7" w:color="${palette.border}"/></w:tcBorders><w:tcMar><w:top w:w="95" w:type="dxa"/><w:left w:w="125" w:type="dxa"/><w:bottom w:w="95" w:type="dxa"/><w:right w:w="125" w:type="dxa"/></w:tcMar><w:shd w:val="clear" w:fill="${palette.fill}"/><w:vAlign w:val="center"/></w:tcPr>${wParagraph(item.label, { keepNext: true, run: { bold: true, color: COLORS.muted, size: 14, font: "Arial" }, spacing: { after: 18, line: 190 } })}${wParagraph(item.value, { keepNext: true, run: { bold: true, color: palette.text, size: 17, font: "Arial" }, spacing: { after: 0, line: 220 } })}</w:tc>`;
  }

  function wCodingBadges(observation = {}) {
    const items = observationCodingItems(observation);
    const width = 3220;
    const rows = [];
    for (let index = 0; index < items.length; index += 3) {
      rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${items.slice(index, index + 3).map((item) => wCodingBadgeCell(item, width)).join("")}</w:tr>`);
    }
    return [
      wParagraph("Codierung", { style: "FieldLabel", keepNext: true, spacing: { before: 30, after: 35, line: 220 } }),
      `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${width * 3}"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellSpacing w:w="70" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${width}"/><w:gridCol w:w="${width}"/><w:gridCol w:w="${width}"/></w:tblGrid>${rows.join("")}</w:tbl>`,
      wParagraph("", { keepNext: true, spacing: { after: 45, line: 100 } })
    ].join("");
  }

  function wObservationReadingBlock(observation = {}, index = 0, fields = []) {
    const fieldMarkup = wFields(fields);
    const firstParagraphEnd = fieldMarkup.indexOf("</w:p>") + 6;
    const firstParagraph = firstParagraphEnd >= 6 ? fieldMarkup.slice(0, firstParagraphEnd) : "";
    const heading = wParagraph(`Beobachtung ${index + 1} | ${text(observation.title) || "Ohne Kurztitel"}`, { style: "Heading3" });
    const coding = wCodingBadges(observation);
    const firstTextLength = firstParagraph.replace(/<[^>]+>/g, "").length;
    // Nur der kurze Einstieg wird zusammengehalten; lange Befunde bleiben frei umbrechbar.
    if (!firstParagraph || firstTextLength > 800) return `${heading}${coding}${fieldMarkup}`;
    const intro = `${heading}${coding}${firstParagraph}`;
    return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${A4.usableDxa}"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${A4.usableDxa}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${A4.usableDxa}"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>${intro}</w:tc></w:tr></w:tbl>${fieldMarkup.slice(firstParagraphEnd)}`;
  }

  function pdfObservationAssessment(pdf, observation = {}) {
    const fields = observationAssessmentFields(observation);
    if (!fields.length) return;
    pdf.ensureSpace(25);
    pdf.paragraph("Spätere Bewertung", { bold: true, color: COLORS.teal, size: 8.2, lineHeight: 9.8, after: 3 });
    fields.forEach(([label, value]) => pdf.field(label, value));
  }

  function permissionLabel(item = {}) {
    const parts = [];
    if (item.internalUseAllowed || item.usageInternal) parts.push("interne Nutzung erlaubt");
    if (item.externalUseAllowed || item.usageExternal) parts.push("externe Nutzung erlaubt");
    if (!parts.length && (item.internalUseAllowed === false || item.externalUseAllowed === false)) parts.push("keine Freigabe dokumentiert");
    return parts.join(", ");
  }

  function observationFields(item = {}) {
    return [
      ["Beobachtung", observationText(item)],
      ["Quelle", observationEvidenceLabel(item) || "Noch nicht angegeben"],
      ["Beobachtet am", formatDate(item.observedAt, true)],
      ["Reihenfolge", item.sequence],
      ["Auslöser", item.trigger],
      ["Handlungsschritte", list(item.actions || item.actionSteps)],
      ["Werkzeuge und Dokumente", list(item.toolsAndDocuments)],
      ["Kommunikationskanäle", list(item.communicationChannels)],
      ["Konkrete Folge", item.immediateConsequence],
      ["Beteiligte Rollen", list(item.involvedRoles || item.affectedRoles)],
      ["Aktueller Workaround", nonEmpty(item.workaround, item.currentWorkaround)],
      ["Quellenbezug", observationSource(item)],
      ["Unsicherheit", item.uncertainty],
      ["Grenzen", item.limitations],
      ["Betroffene Produkte", list(item.affectedProducts)],
      ["Themen", list(item.topics || item.themes)],
      ["Nutzungsfreigabe", permissionLabel(item)],
      ["Aktualisiert", formatDate(item.updatedAt, true)]
    ].filter(([, value]) => Array.isArray(value) ? value.length : text(value));
  }

  function observationOverviewFields(item = {}) {
    return [
      ["Beobachtung", observationText(item)],
      ["Quelle", observationEvidenceLabel(item) || "Noch nicht angegeben"],
      ["Konkrete Folge", item.immediateConsequence],
      ["Quellenbezug", observationSource(item)]
    ].filter(([, value]) => text(value));
  }

  function appointmentObservationFields(item = {}) {
    const description = appointmentObservationText(item);
    const captureIdentifiers = new Set(["questionnaire", "manual", "import", "api", "demo"]);
    const source = [item.sourceType, item.source].map(text)
      .filter((value) => value && !captureIdentifiers.has(value));
    const reference = unique([...source, nonEmpty(item.sourceReference, item.source_reference)]).join(" | ");
    return [["Beobachtung", description], ["Quellenbezug", reference]].filter(([, value]) => text(value));
  }

  function appointmentObservationText(item = {}) {
    const description = observationText(item);
    const actions = list(item.actions || item.actionSteps);
    const normalized = (value) => text(value).replace(/\s+/g, " ");
    // Only omit a complete repeated statement, never a matching word fragment.
    // Keep the authored description (including its paragraph breaks) untouched.
    const containsStatement = (source, value) => {
      const haystack = normalized(source);
      const needle = normalized(value);
      if (!needle) return true;
      if (String(source).split(/\r\n|\r|\n/).some((line) => normalized(line) === needle)) return true;
      let offset = haystack.indexOf(needle);
      while (offset !== -1) {
        const before = haystack.slice(0, offset);
        const after = haystack.slice(offset + needle.length);
        const startsStatement = !before || /[.!?]["”»')\]]?\s+$/.test(before);
        const endsStatement = !after || /^[.!?](?:\s|$)/.test(after)
          || (/[.!?]["”»')\]]?$/.test(needle) && /^\s/.test(after));
        if (startsStatement && endsStatement) return true;
        offset = haystack.indexOf(needle, offset + 1);
      }
      return false;
    };
    const added = [];
    const additional = (value) => {
      const candidate = text(value);
      if (!candidate || containsStatement(description, candidate)
        || added.some((entry) => containsStatement(entry, candidate))) return "";
      added.push(candidate);
      return candidate;
    };
    const roles = list(item.involvedRoles || item.affectedRoles);
    const roleText = roles.length === 1 ? `Beteiligt ist ${roles[0]}.`
      : roles.length ? `Beteiligt sind ${roles.slice(0, -1).join(", ")} und ${roles.at(-1)}.` : "";
    const parts = [
      description,
      additional(item.trigger),
      ...actions.map(additional),
      additional(item.immediateConsequence),
      additional(nonEmpty(item.workaround, item.currentWorkaround)),
      additional(roleText)
    ].filter(Boolean);
    // Source order supplies context; no inferred causal links or new findings.
    // This is an export projection, not a mutation or migration of stored fields.
    let narrative = parts.reduce((result, part) => result
      ? `${result}${/[.!?;:…]["”»')\]]?$/.test(result) ? " " : ". "}${part}` : part, "");
    // Nennung bewahren, ohne tatsächliche Nutzung oder einen Kausalbezug abzuleiten.
    const mentioned = (value) => {
      const escaped = normalized(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(normalized(narrative));
    };
    for (const [label, values] of [
      ["Genannte Systeme und Dokumente", item.toolsAndDocuments],
      ["Genannte Kommunikationskanäle", item.communicationChannels]
    ]) {
      const missing = unique(values).filter((value) => !mentioned(value));
      if (missing.length) narrative += `${narrative && !/[.!?]$/.test(narrative) ? "." : ""}${narrative ? " " : ""}${label}: ${missing.join(", ")}.`;
    }
    return narrative;
  }

  function appointmentCodingItems(item = {}) {
    return [
      { label: "Prozessphase", value: appointmentCodeLabel("processPhase", item.processPhase), palette: CODING_BADGE_PALETTES.phase },
      { label: "Problemtyp", value: appointmentCodeLabel("problemType", item.problemType), palette: CODING_BADGE_PALETTES.problem },
      { label: "Auswirkung", value: appointmentCodeLabel("impact", item.impact), palette: CODING_BADGE_PALETTES.impact }
    ];
  }

  function observationRelevance(item = {}) {
    const value = Number(item.relevanceScore ?? item.careRelevance);
    return Number.isFinite(value) && value >= 1 && value <= 5 ? Math.round(value) : 0;
  }

  function observationTimeLabel(item = {}) {
    const raw = nonEmpty(item.observedAt, item.observed_at, item.observationTime, item.observation_time);
    const missing = "Uhrzeit: -";
    const match = /^(?:(\d{4})-(\d{2})-(\d{2})[T ])?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?(?:\s+Uhr)?$/i.exec(raw);
    if (!match) return missing;
    const [, year, month, day, hour, minute, second, zone] = match;
    if (Number(hour) > 23 || Number(minute) > 59 || Number(second || 0) > 59) return missing;
    if (year) {
      const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (Number(year) < 1 || Number(month) < 1 || Number(month) > 12
        || Number(day) < 1 || Number(day) > days[Number(month) - 1]) return missing;
    }
    const clock = `${hour.padStart(2, "0")}:${minute}`;
    if (!zone) return `${clock} Uhr`;
    if (!year) return missing;
    const offset = zone.toUpperCase() === "Z" ? "Z" : zone.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    // Explicit offsets describe an instant. Unzoned values above retain the
    // recorded local clock, independent of the computer's time zone.
    const date = new Date(`${year}-${month}-${day}T${clock}:${second || "00"}${offset}`);
    return Number.isNaN(date.getTime()) ? missing : `${formatTime(date)} Uhr`;
  }

  function observationMetadataLayout(observation, width) {
    const time = observationTimeLabel(observation);
    const timeWidth = Math.ceil(measureReportText(time, 8, true) + 16);
    const evidence = appointmentSourceLabel(observationEvidenceValue(observation)) || "Nicht erfasst";
    const prefixWidth = measureReportText("Quelle: ", 7.5);
    const score = observationRelevance(observation);
    const value = score ? `${score}/5` : "";
    const relevanceWidth = 16 + measureReportText("Relevanz", 7.5, true) + 8 + 41.5
      + (score ? 8 + measureReportText(value, 8, true) : 0);
    const maxEvidenceWidth = width - timeWidth - relevanceWidth - 24;
    const evidenceWidth = Math.min(maxEvidenceWidth, prefixWidth + measureReportText(evidence, 8, true) + 16);
    const evidenceLines = wrapReportText(evidence, maxEvidenceWidth - 16 - prefixWidth, 8, true);
    return { time, timeWidth, evidence, evidenceWidth, evidenceLines, prefixWidth,
      score, value, relevanceWidth, height: Math.max(20, evidenceLines.length * 11 + 8) };
  }

  function observationFollowUpFields(item = {}) {
    return [
      ["Offene Frage", item.uncertainty],
      ["Grenzen der Beobachtung", item.limitations],
      ["Nächster Schritt", item.nextStep]
    ].filter(([, value]) => text(value));
  }

  function orderedAppointmentObservations(item = {}) {
    return observationItems(item).map((observation, index) => ({ observation, index }))
      .sort((left, right) => {
        const sequence = (entry) => Number(entry.observation.sequence) > 0
          ? Number(entry.observation.sequence) : Number.POSITIVE_INFINITY;
        return sequence(left) - sequence(right) || left.index - right.index;
      }).map(({ observation }) => observation);
  }

  function observationChapterMetadata(item = {}) {
    return [
      ["Termin", appointmentDateLabel(item)],
      ["Kontakt", item.contact],
      ["Organisation", item.organization],
      ["Sektor", item.sector],
      ["Ort", joined([item.location, item.city])]
    ];
  }

  function quoteFields(item = {}) {
    return [
      ["Zitat", item.quote],
      ["Person", nonEmpty(item.personName, item.contactName)],
      ["Rolle", nonEmpty(item.role, item.personRole)],
      ["Kontext", item.context],
      ["Freigabestatus", optionLabel("quoteApprovalStatus", item.approvalStatus)],
      ["Anonymisiert", boolLabel(item.anonymized)],
      ["Nutzungsfreigabe", permissionLabel(item)],
      ["Aktualisiert", formatDate(item.updatedAt, true)]
    ].filter(([, value]) => text(value));
  }

  function mediaFields(item = {}) {
    const privacy = [
      item.hasPeopleVisible || item.peopleVisible ? "Personen sichtbar" : "",
      item.hasPersonalDataVisible || item.personalDataVisible ? "personenbezogene Daten sichtbar" : "",
      item.needsRedaction ? "Schwärzung erforderlich" : ""
    ].filter(Boolean).join(", ");
    return [
      ["Beschreibung", item.description],
      ["Typ", optionLabel("mediaType", item.type)],
      ["Datei", item.fileName],
      ["Link", item.fileUrl],
      ["Datenschutz", privacy],
      ["Freigabestatus", optionLabel("quoteApprovalStatus", item.approvalStatus)],
      ["Nutzungsfreigabe", permissionLabel(item)],
      ["Aktualisiert", formatDate(item.updatedAt, true)]
    ].filter(([, value]) => text(value));
  }

  function impulseFields(item = {}) {
    return [
      ["Klassifikation", optionLabel("impulseClassification", item.classification)],
      ["Problem", nonEmpty(item.problemStatement, item.problem)],
      ["Erwarteter Nutzen", item.expectedBenefit],
      ["Dringlichkeit", item.urgencyScore || item.urgency ? `${item.urgencyScore || item.urgency} / 5` : ""],
      ["Workaround", nonEmpty(item.workaround, item.currentWorkaround)],
      ["Nächster Schritt", item.nextStep],
      ["Status", optionLabel("impulseStatus", item.status)],
      ["Roadmap-Bezug", nonEmpty(item.relatedRoadmapItemLabel, item.relatedRoadmapItemId)],
      ["Aktualisiert", formatDate(item.updatedAt, true)]
    ].filter(([, value]) => text(value));
  }

  function assessmentFields(item = {}) {
    const ratingFields = [
      ["Versorgungsrelevanz", item.careRelevance],
      ["Patientensicherheit", item.patientSafety],
      ["Prozessentlastung", item.processRelief],
      ["Dringlichkeit", item.urgency],
      ["Umsetzbarkeit", item.implementationFeasibility],
      ["Adoptionswahrscheinlichkeit", item.adoptionLikelihood],
      ["Sicherheit der Einschätzung", item.confidenceScore]
    ].filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([label, value]) => `${label}: ${value} / 5`).join(" | ");
    return [
      ["Roadmap-Bezug", nonEmpty(item.roadmapItemLabel, item.roadmapItemId)],
      ["Perspektive", [item.respondentRole, item.respondentSector].map(text).filter(Boolean).join(" | ")],
      ["Bewertungen", ratingFields],
      ["Vergleichsrolle", item.comparisonRole],
      ["Evidenznotiz", item.evidenceNote],
      ["Aktualisiert", formatDate(item.updatedAt, true)]
    ].filter(([, value]) => text(value));
  }

  function unmetNeedFields(item = {}) {
    return [
      ["Problem", item.problem],
      ["Betroffene Rolle", item.affectedRole],
      ["Betroffener Sektor", item.affectedSector],
      ["Klassifikation", item.classification],
      ["Erwarteter Nutzen", item.expectedBenefit ? `${item.expectedBenefit} / 5` : ""],
      ["Dringlichkeit", item.urgency ? `${item.urgency} / 5` : ""],
      ["Umsetzbarkeit", item.implementationFeasibility ? `${item.implementationFeasibility} / 5` : ""],
      ["Sicherheit der Einschätzung", item.confidenceScore ? `${item.confidenceScore} / 5` : ""],
      ["Aktueller Workaround", item.currentWorkaround],
      ["Nächster Schritt", item.nextStep],
      ["Status", item.status],
      ["Roadmap-Bezug", nonEmpty(item.relatedRoadmapItemLabel, item.relatedRoadmapItemId)]
    ].filter(([, value]) => text(value));
  }

  function contextLabel(item = {}) {
    return nonEmpty(item.context, [item.contact, item.organization].map(text).filter(Boolean).join(" | "), item.title, "Hospitation");
  }

  function appointmentDateLabel(item = {}) {
    if (item.dateLabel) return text(item.dateLabel);
    if (item.scheduledOn || item.scheduled_on) return formatDate(item.scheduledOn || item.scheduled_on);
    if (item.startsAt && item.endsAt && localDateKey(item.startsAt) === localDateKey(item.endsAt)) {
      return `${formatDate(item.startsAt)}, ${formatTime(item.startsAt)} - ${formatTime(item.endsAt)}`;
    }
    const start = formatDate(item.startsAt, true);
    const end = formatDate(item.endsAt, true);
    return start && end ? `${start} - ${end}` : start || end || "Termin offen";
  }

  function appointmentStatusLabel(item = {}) {
    const documentation = text(item.documentationStatus);
    return unique([text(item.status) || (item.kind === "slot" ? "Terminangebot" : "Status offen"), documentation]).join(" | ");
  }

  function chapterMetadata(item = {}) {
    return [
      ["Termin", appointmentDateLabel(item)],
      ["Status", appointmentStatusLabel(item)],
      ["Kontakt", item.contact],
      ["Organisation", item.organization],
      ["Sektor", item.sector],
      ["Ort", [item.location, item.city].map(text).filter(Boolean).join(", ")],
      ["Bundesland", item.state],
      ["Owner", joined(item.owners)],
      ["Ziel", item.goal],
      ["Themen", joined(item.topics)],
      ["Aktualisiert", formatDate(item.updatedAt, true)],
      ["Datensatz-ID", item.id]
    ];
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function safeFilenameDate(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? "aktuell" : date.toISOString().slice(0, 10);
  }

  function filenameSlug(value) {
    return text(value)
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae")
      .replace(/Ö/g, "Oe")
      .replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "kontakt";
  }

  function filenameFor(type, snapshot) {
    const extension = type === "pdf" ? "pdf" : "docx";
    if (snapshot.documentKind === "appointment") {
      const item = snapshot.hospitations[0] || snapshot.appointments[0] || {};
      const date = localDateKey(item.scheduledOn || item.scheduled_on || item.startsAt) || safeFilenameDate(snapshot.generatedAt);
      return `mitmachen-hospitations-termin-${date}-${filenameSlug(item.contact || contextLabel(item))}.${extension}`;
    }
    const subject = snapshot.documentKind === "observations" ? "beobachtungen" : "termine";
    return `mitmachen-hospitations-${subject}-${safeFilenameDate(snapshot.generatedAt)}.${extension}`;
  }

  function wRun(value, options = {}) {
    const properties = [
      options.bold ? "<w:b/>" : "",
      options.italic ? "<w:i/>" : "",
      options.color ? `<w:color w:val="${options.color}"/>` : "",
      options.shading ? `<w:shd w:val="clear" w:fill="${options.shading}"/>` : "",
      options.position ? `<w:position w:val="${options.position}"/>` : "",
      options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : "",
      options.font ? `<w:rFonts w:ascii="${escapeXml(options.font)}" w:hAnsi="${escapeXml(options.font)}"/>` : ""
    ].join("");
    return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
  }

  function wParagraph(content = "", options = {}) {
    const runs = Array.isArray(content) ? content.join("") : wRun(content, options.run || {});
    const borders = options.leftBorder
      ? `<w:pBdr><w:left w:val="single" w:sz="${options.leftBorder.size || 18}" w:space="6" w:color="${options.leftBorder.color || COLORS.orange}"/></w:pBdr>`
      : options.bottomBorder
        ? `<w:pBdr><w:bottom w:val="single" w:sz="${options.bottomBorder.size || 10}" w:space="1" w:color="${options.bottomBorder.color || COLORS.blue}"/></w:pBdr>`
        : "";
    const numbering = options.numId
      ? `<w:numPr><w:ilvl w:val="${options.level || 0}"/><w:numId w:val="${options.numId}"/></w:numPr>`
      : "";
    const tabs = options.rightTab ? `<w:tabs><w:tab w:val="right" w:pos="${options.rightTab}"/></w:tabs>` : "";
    const pPr = [
      options.style ? `<w:pStyle w:val="${options.style}"/>` : "",
      options.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
      options.keepNext ? "<w:keepNext/>" : "",
      options.keepLines ? "<w:keepLines/>" : "",
      options.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.shading}"/>` : "",
      borders,
      numbering,
      tabs,
      options.align ? `<w:jc w:val="${options.align}"/>` : "",
      options.spacing ? `<w:spacing w:before="${options.spacing.before || 0}" w:after="${options.spacing.after || 0}" w:line="${options.spacing.line || 240}" w:lineRule="auto"/>` : ""
    ].join("");
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs}</w:p>`;
  }

  function wFieldParagraph(label, value) {
    if (label === "Beobachtung") {
      return String(value).split(/\r?\n[\t ]*\r?\n/).map((paragraph, index, paragraphs) => wParagraph([
        ...(index === 0 ? [wRun(`${label}: `, { bold: true, color: COLORS.teal, size: 18, font: "Arial" })] : []),
        ...paragraph.split(/\r?\n/).flatMap((line, lineIndex) => [
          ...(lineIndex ? ["<w:r><w:br/></w:r>"] : []),
          wRun(line, { color: COLORS.text, size: 19, font: "Arial" })
        ])
      ], { keepNext: paragraphs.length > 1 && index === paragraphs.length - 2, spacing: { after: 55, line: 244 } })).join("");
    }
    return wParagraph([
      wRun(`${label}: `, { bold: true, color: COLORS.teal, size: 18, font: "Arial" }),
      wRun(value, { color: COLORS.text, size: 19, font: "Arial" })
    ], { spacing: { after: 55, line: 244 } });
  }

  function wListField(label, values) {
    const items = list(values);
    if (!items.length) return "";
    return [
      wParagraph(label, { style: "FieldLabel", keepNext: true }),
      ...items.map((item) => wParagraph(item, { style: "ListParagraph", numId: 1, spacing: { after: 20, line: 232 } }))
    ].join("");
  }

  function wCell(content, width, options = {}) {
    const inner = options.raw ? content : wParagraph(content, { style: options.style || "TableText", keepNext: options.keepNext });
    const borderColor = options.borderColor || COLORS.border;
    const verticalPadding = options.verticalPadding ?? 90;
    return `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${width}"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="${borderColor}"/><w:left w:val="single" w:sz="4" w:color="${borderColor}"/><w:bottom w:val="single" w:sz="4" w:color="${borderColor}"/><w:right w:val="single" w:sz="4" w:color="${borderColor}"/></w:tcBorders><w:tcMar><w:top w:w="${verticalPadding}" w:type="dxa"/><w:left w:w="105" w:type="dxa"/><w:bottom w:w="${verticalPadding}" w:type="dxa"/><w:right w:w="105" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/>${options.shading ? `<w:shd w:val="clear" w:fill="${options.shading}"/>` : ""}</w:tcPr>${inner}</w:tc>`;
  }

  function wTable(rows, widths, options = {}) {
    const total = widths.reduce((sum, value) => sum + value, 0);
    const rowXml = rows.map((row, rowIndex) => {
      const cells = row.map((cell, index) => wCell(cell.content ?? cell, widths[index], {
        raw: Boolean(cell.raw),
        style: cell.style,
        shading: cell.shading || (rowIndex === 0 && options.header ? COLORS.navy : ""),
        borderColor: cell.borderColor
      })).join("");
      return `<w:tr>${rowIndex === 0 && options.header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells}</w:tr>`;
    }).join("");
    return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${total}"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rowXml}</w:tbl>`;
  }

  function binaryBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (Array.isArray(value)) return Uint8Array.from(value);
    return null;
  }

  function contactImageFor(snapshot = {}) {
    const item = snapshot.hospitations?.[0] || snapshot.appointments?.[0] || {};
    const image = item.contactImage && typeof item.contactImage === "object" ? item.contactImage : null;
    const bytes = binaryBytes(image?.bytes);
    if (!bytes?.length) return null;
    return {
      bytes,
      width: Math.max(1, Number(image.width) || 480),
      height: Math.max(1, Number(image.height) || 480),
      mimeType: "image/jpeg",
      alt: text(image.alt) || `Kontaktfoto von ${text(item.contact) || "Kontakt"}`
    };
  }

  function wContactPhotoParagraph(relationshipId, alt = "Kontaktfoto") {
    const extent = 560000;
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${extent}" cy="${extent}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Kontaktfoto" descr="${escapeXml(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="kontaktfoto.jpg" descr="${escapeXml(alt)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${extent}" cy="${extent}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  function wReportFields(fields = []) {
    return fields.map(([label, value]) => Array.isArray(value)
      ? wReportFieldParagraph(label, value.join("; "))
      : wReportFieldParagraph(label, value)).join("");
  }

  function wReportFieldParagraph(label, value) {
    const mainText = label === "Beobachtung";
    const paragraphs = String(value ?? "").replace(/\r\n|\r/g, "\n").split(/\n[ \t]*\n/);
    if (mainText && paragraphs.length > 1) {
      return paragraphs.map((paragraph) => wReportFieldParagraph(label, paragraph)).join("");
    }
    const lines = String(value ?? "").split(/\r\n|\r|\n/);
    const runs = mainText ? [] : [wRun(`${label}: `, { bold: true, color: COLORS.teal, size: 17, font: "Arial" })];
    lines.forEach((line, index) => {
      if (index) runs.push("<w:r><w:br/></w:r>");
      runs.push(wRun(line, { color: COLORS.text, size: mainText ? 19 : 17, font: "Arial" }));
    });
    return wParagraph(runs, { spacing: { after: mainText ? 85 : 40, line: 244 } });
  }

  function appointmentSummaryFields(item = {}) {
    return [
      ["Ziel der Hospitation", item.goal],
      ["Kurzfassung", nonEmpty(item.summary, item.documentationSummary, documentationFor(item).experience)]
    ].filter(([, value]) => text(value));
  }

  function initials(value) {
    const parts = text(value).replace(/\b(dr|prof)\.?\b/gi, "").split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "HO").toUpperCase();
  }

  function wContactHero(item = {}, imageRelationshipId = "") {
    const summaryFields = appointmentSummaryFields(item);
    const contactName = text(item.contact) || contextLabel(item);
    const organization = text(item.organization) === contactName ? "" : text(item.organization);
    const leftWidth = summaryFields.length ? 5050 : A4.usableDxa;
    const rightWidth = A4.usableDxa - leftWidth;
    const imageWidth = 1000;
    const image = imageRelationshipId
      ? wContactPhotoParagraph(imageRelationshipId, "Kontaktfoto")
      : wParagraph(initials(item.contact || contextLabel(item)), { align: "center", run: { bold: true, color: COLORS.navy, size: 27 }, shading: COLORS.paleBlue, spacing: { before: 120, after: 120, line: 360 } });
    const identity = [
      wParagraph(contactName, { style: "ReportContact" }),
      organization ? wParagraph(organization, { run: { bold: true, color: COLORS.teal, size: 18 }, spacing: { after: 50, line: 230 } }) : ""
    ].join("");
    const contact = `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${leftWidth - 480}"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${imageWidth}"/><w:gridCol w:w="${leftWidth - 480 - imageWidth}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${imageWidth}"/><w:vAlign w:val="top"/></w:tcPr>${image}</w:tc><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${leftWidth - 480 - imageWidth}"/></w:tcPr>${identity}</w:tc></w:tr></w:tbl>`;
    const left = contact + wParagraph("", { spacing: { after: 70, line: 50 } }) + wAppointmentMetadataTags(item, leftWidth - 480);
    const right = summaryFields.map(([label, value]) => wParagraph(label, { run: { bold: true, color: COLORS.teal, size: 17 }, keepNext: true, spacing: { after: 45, line: 230 } }) + wReportFieldParagraph("Beobachtung", value)).join("");
    const cell = (content, width) => `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${width}"/><w:tcMar><w:top w:w="220" w:type="dxa"/><w:left w:w="240" w:type="dxa"/><w:bottom w:w="170" w:type="dxa"/><w:right w:w="240" w:type="dxa"/></w:tcMar><w:shd w:fill="${COLORS.neutral}"/><w:vAlign w:val="top"/></w:tcPr>${content}</w:tc>`;
    return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${A4.usableDxa}"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="5" w:color="D7E1F3"/><w:left w:val="single" w:sz="5" w:color="D7E1F3"/><w:bottom w:val="single" w:sz="5" w:color="D7E1F3"/><w:right w:val="single" w:sz="5" w:color="D7E1F3"/><w:insideV w:val="single" w:sz="5" w:color="D7E1F3"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${leftWidth}"/>${rightWidth ? `<w:gridCol w:w="${rightWidth}"/>` : ""}</w:tblGrid><w:tr>${cell(left, leftWidth)}${rightWidth ? cell(right, rightWidth) : ""}</w:tr></w:tbl>${wParagraph("", { spacing: { after: 80, line: 80 } })}`;
  }

  function wAppointmentMetadataTags(item, width) {
    const labelWidth = 1480;
    const rows = appointmentMetadata(item).map(([label, value]) => {
      const labelCell = wCell(wParagraph(label, { run: { bold: true, color: COLORS.blue, size: 15 }, spacing: { after: 0, line: 230 } }), labelWidth,
        { raw: true, shading: COLORS.paleBlue, borderColor: COLORS.neutral, verticalPadding: 45 });
      const valueCell = wCell(wParagraph(value, { run: { color: COLORS.text, size: 17 }, spacing: { after: 0, line: 230 } }), width - labelWidth,
        { raw: true, shading: COLORS.neutral, borderColor: COLORS.neutral, verticalPadding: 45 });
      return `<w:tr>${labelCell}${valueCell}</w:tr>`;
    }).join("");
    return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${width}"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${labelWidth}"/><w:gridCol w:w="${width - labelWidth}"/></w:tblGrid>${rows}</w:tbl>${wParagraph("", { spacing: { after: 0, line: 40 } })}`;
  }

  function wCodingRows(observation = {}) {
    const items = appointmentCodingItems(observation);
    const width = Math.floor(A4.usableDxa / 3);
    const rows = [items].map((row) => `<w:tr>${row.map((item) =>
      wCell(wParagraph(item.label, { run: { bold: true, color: COLORS.muted, size: 14 }, keepNext: true, spacing: { after: 25, line: 200 } })
        + wParagraph(item.value || item.placeholder || "Nicht erfasst", { run: { bold: Boolean(item.value), color: item.value ? item.palette.text : COLORS.muted, size: 17 }, spacing: { after: 0, line: 230 } }),
      width, { raw: true, shading: item.palette.fill, borderColor: item.palette.border }).replace('<w:vAlign w:val="center"/>', '<w:vAlign w:val="top"/>')
    ).join("")}</w:tr>`).join("");
    return [
      wParagraph("Einordnung und Codes", { style: "ReportGroup" }),
      `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${A4.usableDxa}"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${items.slice(0, 3).map(() => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rows}</w:tbl>`,
      wParagraph("", { spacing: { after: 35, line: 40 } })
    ].join("");
  }

  function wObservationHeading(observation, index) {
    const widths = [720, A4.usableDxa - 720];
    const title = wParagraph(text(observation.title) || "Ohne Kurztitel", { style: "ObservationTitle",
      keepNext: true, spacing: { after: 0, line: 260 } });
    const cells = [wParagraph([wRun(` ${String(index + 1).padStart(2, "0")} `,
      { bold: true, color: COLORS.white, shading: COLORS.blue, size: 22 })], { keepNext: true, spacing: { after: 0, line: 260 } }), title]
      .map((content, column) => `<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${content}</w:tc>`).join("");
    return wParagraph("", { keepNext: true, spacing: { before: 120, after: 0, line: 40 } })
      + `<w:tbl><w:tblPr><w:tblW w:w="${A4.usableDxa}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((edge) => `<w:${edge} w:val="nil"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`
      + wParagraph("", { keepNext: true, spacing: { after: 30, line: 40 } });
  }

  function wObservationMetadata(observation) {
    const time = observationTimeLabel(observation);
    const timePalette = { fill: COLORS.neutral, border: COLORS.border, text: COLORS.text };
    const timeWidth = Math.ceil((measureReportText(time, 8, true) + 16) * 20);
    const evidence = appointmentSourceLabel(observationEvidenceValue(observation)) || "Nicht erfasst";
    const palette = CODING_BADGE_PALETTES.evidence;
    const relevancePalette = CODING_BADGE_PALETTES.relevance;
    const score = observationRelevance(observation);
    const relevanceWidth = score ? 2340 : 2040;
    const evidenceWidth = Math.min(A4.usableDxa - timeWidth - relevanceWidth - 720,
      Math.ceil((measureReportText("Quelle: ", 7.5) + measureReportText(evidence, 8, true) + 16) * 20));
    const widths = [timeWidth, 240, evidenceWidth, 240, relevanceWidth,
      A4.usableDxa - timeWidth - evidenceWidth - relevanceWidth - 480];
    const dots = [1, 2, 3, 4, 5].map((value) => wRun(value <= score ? "● " : "○ ", {
      color: relevancePalette.text, size: 20, font: "Arial" }));
    const contents = [
      wParagraph([wRun(time, { bold: true, color: timePalette.text, size: 16 })],
      { keepNext: true, keepLines: true, spacing: { after: 0, line: 220 } }),
      wParagraph("", { keepNext: true, spacing: { after: 0, line: 20 } }),
      wParagraph([wRun("Quelle: ", { color: palette.text, size: 15 }),
        wRun(evidence, { bold: true, color: palette.text, size: 16 })],
      { keepNext: true, keepLines: true, spacing: { after: 0, line: 220 } }),
      wParagraph("", { keepNext: true, spacing: { after: 0, line: 20 } }),
      wParagraph([wRun("Relevanz  ", { bold: true, color: relevancePalette.text, size: 15 }), ...dots,
        ...(score ? [wRun(` ${score}/5`, { bold: true, color: relevancePalette.text, size: 16 })] : [])],
      { keepNext: true, keepLines: true, align: "left", spacing: { after: 0, line: 220 } }),
      wParagraph("", { keepNext: true, spacing: { after: 0, line: 20 } })
    ];
    const cells = contents.map((content, index) => {
      const chip = index === 0 ? timePalette : index === 2 ? palette : index === 4 ? relevancePalette : null;
      const style = chip
        ? `<w:shd w:fill="${chip.fill}"/><w:tcBorders>${["top", "left", "bottom", "right"].map((edge) => `<w:${edge} w:val="single" w:sz="4" w:color="${chip.border}"/>`).join("")}</w:tcBorders><w:tcMar><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>` : "";
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[index]}" w:type="dxa"/><w:vAlign w:val="center"/>${style}${index === 0 || index === 4 ? "<w:noWrap/>" : ""}</w:tcPr>${content}</w:tc>`;
    }).join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="${A4.usableDxa}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((edge) => `<w:${edge} w:val="nil"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`
      + wParagraph("", { keepNext: true, spacing: { after: 65, line: 40 } });
  }

  function wAppointmentObservationBlock(observation = {}, index = 0) {
    const followUp = observationFollowUpFields(observation);
    const content = [
      wObservationHeading(observation, index),
      wObservationMetadata(observation),
      wReportFields(appointmentObservationFields(observation)),
      wCodingRows(observation),
      text(observation.relevanceReason) ? wReportFieldParagraph("Begründung der Relevanz", observation.relevanceReason) : "",
      followUp.length ? wParagraph("Offene Fragen und nächste Schritte", { style: "ReportGroup" }) + wReportFields(followUp) : ""
    ].join("");
    // Keep short observations with their codes. Long narratives may break naturally.
    if (appointmentObservationHeight(observation, index) > 500) return content;
    // Word renderers do not consistently honor keepNext across a heading-table
    // boundary. A borderless, non-splitting row keeps a short observation intact.
    return `<w:tbl><w:tblPr><w:tblW w:w="${A4.usableDxa}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((edge) => `<w:${edge} w:val="nil"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${A4.usableDxa}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${A4.usableDxa}" w:type="dxa"/></w:tcPr>${content}</w:tc></w:tr></w:tbl>`
      + wParagraph("", { spacing: { after: 0, line: 20 } });
  }

  function wCodeHelp(snapshot) {
    const items = codeHelpItems();
    if (!items.length) return "";
    const width = Math.floor(A4.usableDxa / 3);
    const cell = (item) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${[
      wParagraph(item.label, { keepNext: true, keepLines: true,
        run: { bold: true, color: item.palette.text, size: 17 }, spacing: { before: 50, after: 65, line: 220 } }),
      ...item.values.map((value) => wParagraph(value, { keepNext: true, keepLines: true,
        run: { color: COLORS.muted, size: 18 }, spacing: { after: 30, line: 220 } }))
    ].join("")}</w:tc>`;
    const evidence = items[3];
    const evidenceRows = [
      wParagraph([wRun(`${evidence.label}   `, { bold: true, color: evidence.palette.text, size: 17 }),
        wRun(evidence.values.join("  |  "), { color: COLORS.muted, size: 18 })],
      { keepNext: true, keepLines: true, spacing: { before: 130, after: 25, line: 220 } }),
      ...codeHelpNotes(snapshot).map((note) => wParagraph(note, { keepNext: true, keepLines: true,
        run: { color: COLORS.muted, size: 16 }, spacing: { before: 50, after: 0, line: 210 } }))
    ].join("");
    const rows = `<w:tr><w:trPr><w:cantSplit/></w:trPr>${items.slice(0, 3).map(cell).join("")}</w:tr>`
      + `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${A4.usableDxa}" w:type="dxa"/><w:gridSpan w:val="3"/></w:tcPr>${evidenceRows}</w:tc></w:tr>`;
    return [
      wParagraph([wRun("Codehilfe", { bold: true, color: COLORS.text, size: 19 }),
        wRun("  ·  Mögliche Angaben je Feld  ·  Fassung 1.1 · Erprobung", { color: COLORS.muted, size: 17 })],
      { keepNext: true, bottomBorder: { color: COLORS.border, size: 4 }, spacing: { before: 320, after: 90, line: 240 } }),
      `<w:tbl><w:tblPr><w:tblW w:w="${A4.usableDxa}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="105" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="105" w:type="dxa"/></w:tblCellMar><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((edge) => `<w:${edge} w:val="nil"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${items.slice(0, 3).map(() => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rows}</w:tbl>`,
      wParagraph("", { spacing: { after: 0, line: 20 } })
    ].join("");
  }

  function wAppointmentSectionRule() {
    const widths = [1660, A4.usableDxa - 1660];
    const colors = [COLORS.orange, COLORS.blue];
    const cells = widths.map((width, index) => `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${width}"/><w:shd w:fill="${colors[index]}"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t></w:t></w:r></w:p></w:tc>`).join("");
    return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${A4.usableDxa}"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid><w:tr><w:trPr><w:trHeight w:val="100" w:hRule="exact"/></w:trPr>${cells}</w:tr></w:tbl>${wParagraph("", { keepNext: true, spacing: { after: 90, line: 80 } })}`;
  }

  function appointmentObservationHeight(observation = {}, index = 0) {
    const width = 503;
    const title = text(observation.title) || "Ohne Kurztitel";
    const fields = appointmentObservationFields(observation);
    const followUp = observationFollowUpFields(observation);
    const coding = appointmentCodingItems(observation);
    const notesHeight = (items) => items.reduce((sum, [label, value]) => {
      const mainText = label === "Beobachtung";
      const content = Array.isArray(value) ? value.join("; ") : value;
      const paragraphs = mainText ? String(content).replace(/\r\n|\r/g, "\n").split(/\n[ \t]*\n/) : [`${label}: ${content}`];
      return sum + paragraphs.reduce((height, paragraph) => height
        + wrapReportText(paragraph, width, mainText ? 9.5 : 8.5).length * (mainText ? 13 : 11.5)
        + (mainText ? 7 : 2), 0);
    }, 0);
    const cardHeight = Math.max(...coding.map((item) => wrapReportText(item.value || "Nicht erfasst", 147, 8.5, Boolean(item.value)).length)) * 11 + 31;
    const metadata = observationMetadataLayout(observation, width);
    return Math.max(24, wrapReportText(title, width - 44, 11, true).length * 14 + 8) + 21
      + metadata.height + 8
      + notesHeight(fields) + 22 + cardHeight
      + notesHeight(followUp) + (followUp.length ? 22 : 0)
      + (text(observation.relevanceReason) ? notesHeight([["Begründung der Relevanz", observation.relevanceReason]]) : 0);
  }

  function wSectionRule() {
    return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${A4.usableDxa}"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1560"/><w:gridCol w:w="7800"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="1560"/><w:shd w:fill="${COLORS.orange}"/><w:tcMar><w:top w:w="70" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/></w:tcMar></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="7800"/><w:shd w:fill="${COLORS.blue}"/><w:tcMar><w:top w:w="70" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/></w:tcMar></w:tcPr><w:p/></w:tc></w:tr></w:tbl>${wParagraph("", { spacing: { after: 80, line: 120 } })}`;
  }

  function wStylesXml(appointment = false) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:color w:val="${COLORS.text}"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:widowControl/><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${COLORS.text}"/><w:sz w:val="19"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="MirrorTitle"><w:name w:val="Mirror Title"/><w:basedOn w:val="Normal"/><w:next w:val="MirrorSubtitle"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="40" w:after="40"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="54"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="MirrorSubtitle"><w:name w:val="Mirror Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.blue}"/><w:sz w:val="25"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:uiPriority w:val="9"/><w:outlineLvl w:val="0"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="120" w:after="30"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="44"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:uiPriority w:val="9"/><w:outlineLvl w:val="1"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="160" w:after="70"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:uiPriority w:val="9"/><w:outlineLvl w:val="2"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="120" w:after="45"/><w:shd w:fill="${COLORS.paleBlue}"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="${COLORS.blue}"/></w:pBdr></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="FieldLabel"><w:name w:val="Field Label"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="25"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.teal}"/><w:sz w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Callout"><w:name w:val="Callout"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="60" w:after="100" w:line="252" w:lineRule="auto"/><w:shd w:fill="${COLORS.paleOrange}"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="${COLORS.orange}"/></w:pBdr></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${COLORS.text}"/><w:sz w:val="19"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="220" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.white}"/><w:sz w:val="16"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="220" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${COLORS.text}"/><w:sz w:val="16"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableLabel"><w:name w:val="Table Label"/><w:basedOn w:val="TableText"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.teal}"/><w:sz w:val="16"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:contextualSpacing/></w:pPr></w:style>${appointment ? `

  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="100"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="54"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ReportSubtitle"><w:name w:val="Report Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="110"/></w:pPr><w:rPr><w:color w:val="${COLORS.blue}"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ReportContact"><w:name w:val="Report Contact"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="50"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ReportSection"><w:name w:val="Report Section"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/><w:spacing w:before="220" w:after="100"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ObservationTitle"><w:name w:val="Observation Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/><w:spacing w:before="210" w:after="100"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ReportGroup"><w:name w:val="Observation Group"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="2"/><w:spacing w:before="130" w:after="60"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLORS.teal}"/><w:sz w:val="17"/></w:rPr></w:style>` : ""}
</w:styles>`;
  }

  function wNumberingXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="220"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${COLORS.blue}"/></w:rPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
  }

  function wLogoRun() {
    const cx = 1301750;
    const cy = 304800;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="2" name="#Mitmachen" descr="#Mitmachen Logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="mitmachen-logo.jpg" descr="#Mitmachen Logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  function wHeaderXml(snapshot) {
    if (snapshot.documentKind === "appointment") {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">${wParagraph([
        wLogoRun(),
        wRun("\tgematik | Stabsstelle Versorgung", { color: COLORS.navy, bold: true, size: 15, font: "Arial", position: 12 })
      ], { rightTab: A4.usableDxa, bottomBorder: { color: COLORS.blue, size: 6 }, spacing: { after: 0, line: 220 } })}</w:hdr>`;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${wParagraph([
      wRun("• ", { color: "64B5FF", bold: true, size: 18, font: "Arial" }),
      wRun("• ", { color: "FF9B4B", bold: true, size: 18, font: "Arial" }),
      wRun("•   #Mitmachen", { color: COLORS.navy, bold: true, size: 18, font: "Arial" }),
      wRun("\tgematik | Stabsstelle Versorgung", { color: COLORS.navy, bold: true, size: 15, font: "Arial" })
    ], { rightTab: A4.usableDxa, bottomBorder: { color: COLORS.blue, size: 6 }, spacing: { after: 0, line: 220 } })}</w:hdr>`;
  }

  function wFooterXml(snapshot) {
    const runs = [
      wRun(`${snapshot.documentLabel || DOCUMENT_LABEL} | ${snapshot.generatedLabel}   ·   Seite `, { color: COLORS.muted, size: 14, font: "Arial" }),
      `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${COLORS.navy}"/><w:sz w:val="14"/></w:rPr><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve"> PAGE </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>1</w:t><w:fldChar w:fldCharType="end"/></w:r>`
    ];
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${wParagraph(runs, { align: "center", spacing: { after: 0, line: 220 } })}</w:ftr>`;
  }

  function wOverviewTable(snapshot) {
    const widths = [650, 1450, 3300, 1600, 1852, 1300];
    const rows = [[
      { content: "Nr.", style: "TableHeader" },
      { content: "Termin", style: "TableHeader" },
      { content: "Kontakt / Organisation", style: "TableHeader" },
      { content: "Sektor / Ort", style: "TableHeader" },
      { content: "Status / Dokumentation", style: "TableHeader" },
      { content: "Beob.", style: "TableHeader" }
    ]];
    snapshot.appointments.forEach((item, index) => {
      const fill = index % 2 ? COLORS.neutral : COLORS.white;
      rows.push([
        { content: String(index + 1), shading: fill },
        { content: appointmentDateLabel(item), shading: fill },
        { content: contextLabel(item), shading: fill },
        { content: [item.sector, item.location || item.city].map(text).filter(Boolean).join(" | ") || "Nicht hinterlegt", shading: fill },
        { content: appointmentStatusLabel(item), shading: fill },
        { content: item.kind === "slot" ? "-" : String(observationItems(item).length), shading: fill }
      ]);
    });
    if (!snapshot.appointments.length) {
      rows.push([
        { content: "-", shading: COLORS.neutral },
        { content: "Keine Termine geladen", shading: COLORS.neutral },
        { content: "", shading: COLORS.neutral },
        { content: "", shading: COLORS.neutral },
        { content: "", shading: COLORS.neutral },
        { content: "0", shading: COLORS.neutral }
      ]);
    }
    return wTable(rows, widths, { header: true });
  }

  function wMetadataTable(item) {
    const entries = chapterMetadata(item);
    const widths = [1500, 3576, 1500, 3576];
    const rows = [];
    for (let index = 0; index < entries.length; index += 2) {
      const left = entries[index];
      const right = entries[index + 1] || ["", ""];
      rows.push([
        { content: left[0], style: "TableLabel", shading: COLORS.paleTeal },
        { content: text(left[1]) || "Nicht hinterlegt", shading: COLORS.white },
        { content: right[0], style: "TableLabel", shading: COLORS.paleTeal },
        { content: text(right[1]) || "Nicht hinterlegt", shading: COLORS.white }
      ]);
    }
    return wTable(rows, widths);
  }

  function wFields(fields) {
    return fields.map(([label, value]) => Array.isArray(value) ? wListField(label, value) : wFieldParagraph(label, text(value))).join("");
  }

  function wObservationAssessment(observation = {}) {
    const fields = observationAssessmentFields(observation);
    return fields.length ? `${wParagraph("Spätere Bewertung", { style: "FieldLabel", keepNext: true })}${wFields(fields)}` : "";
  }

  function wChapter(item, index) {
    const documentation = documentationFor(item);
    const observations = observationItems(item);
    const quotes = quoteItems(item);
    const media = mediaItems(item);
    const impulses = impulseItems(item);
    const scores = documentation.scores && typeof documentation.scores === "object" ? documentation.scores : {};
    const scoreLabels = documentation.scoreLabels && typeof documentation.scoreLabels === "object" ? documentation.scoreLabels : {};
    const body = [
      wParagraph(`${String(index + 1).padStart(2, "0")} | Hospitation`, { style: "Heading1", pageBreakBefore: true }),
      wParagraph(contextLabel(item), { style: "MirrorSubtitle" }),
      wSectionRule(),
      wMetadataTable(item)
    ];
    const summaryFields = [
      ["Kurzfassung", nonEmpty(item.summary, item.documentationSummary, documentation.experience)],
      ["Erkenntnis", documentation.insight],
      ["Nächste Nutzung", nonEmpty(documentation.nextUse, documentation.transferPotential)],
      ["Prozessnotizen", documentation.processNotes],
      ["Risiken", documentation.risks],
      ["Terminnotizen", nonEmpty(item.notes, item.requestNote)]
    ].filter(([, value]) => text(value));
    if (summaryFields.length) {
      body.push(wParagraph("Einordnung und Zusammenfassung", { style: "Heading2" }), wFields(summaryFields));
    }
    body.push(wParagraph(`Beobachtungen (${observations.length})`, { style: "Heading2" }));
    if (!observations.length) {
      body.push(wParagraph("Noch keine Beobachtungen dokumentiert.", { style: "Callout" }));
    } else {
      observations.forEach((observation, observationIndex) => {
        body.push(
          wObservationReadingBlock(observation, observationIndex, observationFields(observation)),
          wObservationAssessment(observation)
        );
      });
    }
    if (quotes.length) {
      body.push(wParagraph(`Zitate (${quotes.length})`, { style: "Heading2" }));
      quotes.forEach((quote, quoteIndex) => body.push(
        wParagraph(`Zitat ${quoteIndex + 1}`, { style: "Heading3" }),
        wFields(quoteFields(quote))
      ));
    }
    if (media.length) {
      body.push(wParagraph(`Medien und Artefakte (${media.length})`, { style: "Heading2" }));
      media.forEach((artifact, artifactIndex) => body.push(
        wParagraph(`${artifactIndex + 1} | ${text(artifact.title) || "Medienbeleg"}`, { style: "Heading3" }),
        wFields(mediaFields(artifact))
      ));
    }
    if (impulses.length) {
      body.push(wParagraph(`Impulse (${impulses.length})`, { style: "Heading2" }));
      impulses.forEach((impulse, impulseIndex) => body.push(
        wParagraph(`${impulseIndex + 1} | ${text(impulse.title) || "Impuls"}`, { style: "Heading3" }),
        wFields(impulseFields(impulse))
      ));
    }
    const scoreEntries = Object.entries(scores).filter(([, value]) => value !== null && value !== undefined && value !== "");
    if (scoreEntries.length) {
      body.push(wParagraph("Bewertungen", { style: "Heading2" }));
      body.push(wTable([
        [{ content: "Kriterium", style: "TableHeader" }, { content: "Wert", style: "TableHeader" }],
        ...scoreEntries.map(([key, value], scoreIndex) => [
          { content: text(scoreLabels[key]) || key, shading: scoreIndex % 2 ? COLORS.neutral : COLORS.white },
          { content: `${value} / 5`, shading: scoreIndex % 2 ? COLORS.neutral : COLORS.white }
        ])
      ], [8152, 2000], { header: true }));
    }
    const assessments = Array.isArray(item.roadmapAssessments) ? item.roadmapAssessments : [];
    if (assessments.length) {
      body.push(wParagraph(`Roadmap-Einschätzungen (${assessments.length})`, { style: "Heading2" }));
      assessments.forEach((assessment, assessmentIndex) => body.push(
        wParagraph(`${assessmentIndex + 1} | ${nonEmpty(assessment.roadmapItemLabel, assessment.roadmapItemId, "Roadmap-Einschätzung")}`, { style: "Heading3" }),
        wFields(assessmentFields(assessment))
      ));
    }
    const unmetNeeds = Array.isArray(item.unmetNeeds) ? item.unmetNeeds : [];
    if (unmetNeeds.length) {
      body.push(wParagraph(`Weitere Bedarfe (${unmetNeeds.length})`, { style: "Heading2" }));
      unmetNeeds.forEach((need, needIndex) => body.push(
        wParagraph(`${needIndex + 1} | ${text(need.title) || "Bedarf"}`, { style: "Heading3" }),
        wFields(unmetNeedFields(need))
      ));
    }
    return body.join("");
  }

  function wObservationOverviewTable(snapshot) {
    const widths = [650, 1650, 3650, 2750, 1452];
    const rows = [[
      { content: "Nr.", style: "TableHeader" },
      { content: "Termin", style: "TableHeader" },
      { content: "Kontakt / Organisation", style: "TableHeader" },
      { content: "Sektor / Ort", style: "TableHeader" },
      { content: "Beob.", style: "TableHeader" }
    ]];
    snapshot.hospitations.forEach((item, index) => {
      const fill = index % 2 ? COLORS.neutral : COLORS.white;
      rows.push([
        { content: String(index + 1), shading: fill },
        { content: appointmentDateLabel(item), shading: fill },
        { content: contextLabel(item), shading: fill },
        { content: [item.sector, item.location || item.city].map(text).filter(Boolean).join(" | ") || "Nicht hinterlegt", shading: fill },
        { content: String(observationItems(item).length), shading: fill }
      ]);
    });
    if (!snapshot.hospitations.length) {
      rows.push([
        { content: "-", shading: COLORS.neutral },
        { content: "Keine Hospitationen mit Beobachtungen", shading: COLORS.neutral },
        { content: "", shading: COLORS.neutral },
        { content: "", shading: COLORS.neutral },
        { content: "0", shading: COLORS.neutral }
      ]);
    }
    return wTable(rows, widths, { header: true });
  }

  function wObservationMetadataTable(item) {
    const entries = observationChapterMetadata(item);
    const widths = [1500, 3576, 1500, 3576];
    const rows = [];
    for (let index = 0; index < entries.length; index += 2) {
      const left = entries[index];
      const right = entries[index + 1] || ["", ""];
      rows.push([
        { content: left[0], style: "TableLabel", shading: COLORS.paleTeal },
        { content: text(left[1]) || "Nicht hinterlegt", shading: COLORS.white },
        { content: right[0], style: "TableLabel", shading: right[0] ? COLORS.paleTeal : COLORS.white },
        { content: text(right[1]), shading: COLORS.white }
      ]);
    }
    return wTable(rows, widths);
  }

  function wObservationChapter(item, index) {
    const observations = observationItems(item);
    const body = [
      wParagraph(`${String(index + 1).padStart(2, "0")} | Hospitation`, { style: "Heading1", pageBreakBefore: true }),
      wParagraph(contextLabel(item), { style: "MirrorSubtitle" }),
      wSectionRule(),
      wObservationMetadataTable(item),
      wParagraph(`Beobachtungen (${observations.length})`, { style: "Heading2" })
    ];
    if (!observations.length) {
      body.push(wParagraph("Noch keine Beobachtungen dokumentiert.", { style: "Callout" }));
    } else {
      observations.forEach((observation, observationIndex) => {
        body.push(
          wObservationReadingBlock(observation, observationIndex, observationOverviewFields(observation)),
          wObservationAssessment(observation)
        );
      });
    }
    return body.join("");
  }

  function wObservationDocumentXml(snapshot) {
    const intro = `Diese Übersicht bündelt ${countLabel(snapshot.summary.observations, "qualitative Beobachtung", "qualitative Beobachtungen")} aus ${countLabel(snapshot.summary.hospitations, "Hospitation", "Hospitationen")}. Die Beobachtungen sind nach Hospitation geordnet.`;
    const body = [
      wParagraph("•  •  •   #Mitmachen", { run: { bold: true, color: COLORS.navy, size: 22, font: "Arial" }, spacing: { before: 80, after: 30, line: 240 } }),
      wParagraph(snapshot.title, { style: "MirrorTitle" }),
      wParagraph(snapshot.subtitle, { style: "MirrorSubtitle" }),
      wSectionRule(),
      wParagraph(intro, { style: "Callout" }),
      wParagraph(`${countLabel(snapshot.summary.observations, "Beobachtung", "Beobachtungen")} | ${countLabel(snapshot.summary.hospitations, "Hospitation", "Hospitationen")}`, { run: { bold: true, color: COLORS.teal, size: 20, font: "Arial" }, spacing: { after: 120, line: 252 } }),
      wParagraph("Hospitationen im Überblick", { style: "Heading2" }),
      wObservationOverviewTable(snapshot),
      ...snapshot.hospitations.map((item, index) => wObservationChapter(item, index)),
      `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="${A4.widthDxa}" w:h="${A4.heightDxa}"/><w:pgMar w:top="893" w:right="878" w:bottom="835" w:left="878" w:header="317" w:footer="346" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`;
  }

  function appointmentMetadata(item = {}) {
    return [
      ["Termin", appointmentDateLabel(item)],
      ["Status", appointmentStatusLabel(item)],
      ["Sektor", item.sector],
      ["Ort", joined([item.location, item.city])],
      ["Verantwortlich", joined(item.owners)]
    ].filter(([, value]) => text(value));
  }

  function wAppointmentDocumentXml(snapshot, imageRelationshipId = "") {
    const item = snapshot.hospitations[0] || snapshot.appointments[0] || {};
    const observations = orderedAppointmentObservations(item);
    const observationBody = observations.length
      ? observations.map((observation, index) => wAppointmentObservationBlock(observation, index)).join("")
      : wParagraph("Noch keine Beobachtungen dokumentiert.");
    const body = [
      wParagraph(snapshot.title, { style: "Title" }),
      wParagraph(snapshot.subtitle, { style: "ReportSubtitle" }),
      wAppointmentSectionRule(),
      wContactHero(item, imageRelationshipId),
      wParagraph("Beobachtungen", { style: "ReportSection" }),
      wAppointmentSectionRule(),
      observationBody,
      wCodeHelp(snapshot),
      `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="${A4.widthDxa}" w:h="${A4.heightDxa}"/><w:pgMar w:top="1060" w:right="878" w:bottom="835" w:left="878" w:header="160" w:footer="346" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`;
  }

  function wDocumentXml(snapshot, imageRelationshipId = "") {
    if (snapshot.documentKind === "observations") return wObservationDocumentXml(snapshot);
    if (snapshot.documentKind === "appointment") return wAppointmentDocumentXml(snapshot, imageRelationshipId);
    const intro = `Dieser Export wurde am ${snapshot.generatedLabel} aus dem aktuell geladenen Datenstand (${snapshot.modeLabel}) erzeugt. Jeder erneute Download erstellt eine neue synchronisierte Momentaufnahme.`;
    const summary = summaryLabel(snapshot);
    const body = [
      wParagraph("•  •  •   #Mitmachen", { run: { bold: true, color: COLORS.navy, size: 22, font: "Arial" }, spacing: { before: 80, after: 30, line: 240 } }),
      wParagraph(snapshot.title, { style: "MirrorTitle" }),
      wParagraph(snapshot.subtitle, { style: "MirrorSubtitle" }),
      wSectionRule(),
      wParagraph(intro, { style: "Callout" }),
      wParagraph(summary, { run: { bold: true, color: COLORS.teal, size: 20, font: "Arial" }, spacing: { after: 120, line: 252 } }),
      wParagraph(overviewTitle(snapshot), { style: "Heading2" }),
      wParagraph(overviewDescription(snapshot), { spacing: { after: 80, line: 252 } }),
      wOverviewTable(snapshot),
      ...snapshot.hospitations.map((item, index) => wChapter(item, index)),
      `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="${A4.widthDxa}" w:h="${A4.heightDxa}"/><w:pgMar w:top="893" w:right="878" w:bottom="835" w:left="878" w:header="317" w:footer="346" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`;
  }

  function dosDateTime(value) {
    const date = new Date(value || Date.now());
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosTime, dosDate };
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    return Uint8Array.of(value & 255, (value >>> 8) & 255);
  }

  function u32(value) {
    return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
  }

  function concatBytes(chunks) {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  function zipStore(entries, generatedAt) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const { dosTime, dosDate } = dosDateTime(generatedAt);
    let offset = 0;
    entries.forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = typeof content === "string" ? encoder.encode(content) : content;
      const crc = crc32(data);
      const local = concatBytes([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data
      ]);
      localParts.push(local);
      centralParts.push(concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), nameBytes
      ]));
      offset += local.length;
    });
    const central = concatBytes(centralParts);
    const end = concatBytes([
      u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
      u32(central.length), u32(offset), u16(0)
    ]);
    return concatBytes([...localParts, central, end]);
  }

  function createDocx(input = {}) {
    const snapshot = normalizeSnapshot(input);
    const contactImage = snapshot.documentKind === "appointment" ? contactImageFor(snapshot) : null;
    const logo = snapshot.documentKind === "appointment" ? documentLogo() : null;
    const imageRelationshipId = contactImage ? "rId6" : "";
    const coreDate = new Date(snapshot.generatedAt).toISOString();
    const entries = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${contactImage || logo ? `<Default Extension="jpg" ContentType="image/jpeg"/>` : ""}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
      ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(snapshot.title)}</dc:title><dc:subject>Synchronisierter Spiegel der Hospitations-Termine und Beobachtungen</dc:subject><dc:creator>Versorgungs-Kompass</dc:creator><cp:keywords>Hospitation, Beobachtung, Versorgungs-Kompass, Mitmachen</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${coreDate}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${coreDate}</dcterms:modified></cp:coreProperties>`],
      ["docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Versorgungs-Kompass</Application><AppVersion>1.0</AppVersion><Company>gematik | Stabsstelle Versorgung</Company></Properties>`],
      ["word/document.xml", wDocumentXml(snapshot, imageRelationshipId)],
      ["word/styles.xml", wStylesXml(snapshot.documentKind === "appointment")],
      ["word/numbering.xml", wNumberingXml()],
      ["word/settings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
      ["word/header1.xml", wHeaderXml(snapshot)],
      ["word/footer1.xml", wFooterXml(snapshot)],
      ["word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${contactImage ? `<Relationship Id="${imageRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/kontaktfoto.jpg"/>` : ""}</Relationships>`]
    ];
    if (logo) {
      entries.push(["word/media/mitmachen-logo.jpg", logo.bytes]);
      entries.push(["word/_rels/header1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/mitmachen-logo.jpg"/></Relationships>`]);
    }
    if (contactImage) entries.push(["word/media/kontaktfoto.jpg", contactImage.bytes]);
    const bytes = zipStore(entries, snapshot.generatedAt);
    return {
      blob: new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      filename: filenameFor("docx", snapshot),
      snapshot
    };
  }

  const CP1252 = Object.freeze({
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f
  });

  function pdfHex(value) {
    const bytes = [];
    for (const character of text(value)) {
      const code = character.codePointAt(0);
      const byte = code <= 0xff ? code : CP1252[code] ?? 0x3f;
      bytes.push(byte.toString(16).padStart(2, "0").toUpperCase());
    }
    return `<${bytes.join("")}>`;
  }

  function rgb(hex) {
    const value = hex.replace(/^#/, "");
    return [0, 2, 4].map((index) => (parseInt(value.slice(index, index + 2), 16) / 255).toFixed(3)).join(" ");
  }

  function measureText(value, size, bold = false) {
    let units = 0;
    for (const char of text(value)) {
      if (/[ilI.,:;!|' ]/.test(char)) units += 0.27;
      else if (/[mwMW@%&]/.test(char)) units += 0.82;
      else if (/[A-ZÄÖÜ0-9]/.test(char)) units += 0.61;
      else units += 0.51;
    }
    return units * size * (bold ? 1.035 : 1);
  }

  function wrapText(value, maxWidth, size, bold = false) {
    const paragraphs = String(value ?? "").replace(/\r/g, "").split("\n");
    const lines = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const words = text(paragraph).split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
      } else {
        let line = "";
        words.forEach((word) => {
          const candidate = line ? `${line} ${word}` : word;
          if (!line || measureText(candidate, size, bold) <= maxWidth) {
            line = candidate;
            return;
          }
          lines.push(line);
          if (measureText(word, size, bold) <= maxWidth) {
            line = word;
            return;
          }
          let fragment = "";
          for (const char of word) {
            if (fragment && measureText(`${fragment}${char}`, size, bold) > maxWidth) {
              lines.push(fragment);
              fragment = char;
            } else fragment += char;
          }
          line = fragment;
        });
        if (line) lines.push(line);
      }
      if (paragraphIndex < paragraphs.length - 1) lines.push("");
    });
    return lines.length ? lines : [""];
  }

  // Adobe standard PDF font advances (WinAnsi, character codes 32-255),
  // matching the Helvetica/Helvetica-Bold resources emitted by assemblePdf.
  const REPORT_FONT_WIDTHS = Object.freeze({
    regular: Object.freeze([278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500]),
    bold: Object.freeze([278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556])
  });

  function measureReportText(value, size, bold = false) {
    const widths = bold ? REPORT_FONT_WIDTHS.bold : REPORT_FONT_WIDTHS.regular;
    return [...String(value)].reduce((sum, character) => {
      const code = character.codePointAt(0);
      const byte = code <= 0xff ? code : CP1252[code] ?? 0x3f;
      return sum + (widths[byte - 32] ?? widths[0x3f - 32]);
    }, 0) * size / 1000;
  }

  function wrapReportText(value, maxWidth, size, bold = false) {
    return String(value ?? "").split(/\r\n|\r|\n/).flatMap((paragraph) => {
      const words = text(paragraph).split(/\s+/).filter(Boolean);
      const lines = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (measureReportText(candidate, size, bold) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        // Split only a token that cannot fit by itself (for example a long URL).
        for (const character of word) {
          if (line && measureReportText(line + character, size, bold) > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
      if (line || !lines.length) lines.push(line);
      return lines;
    });
  }

  class PdfBuilder {
    constructor(snapshot) {
      this.snapshot = snapshot;
      this.width = 595.28;
      this.height = 841.89;
      this.margin = 46;
      this.bottom = 48;
      this.pages = [];
      this.page = null;
      const contactImage = snapshot.documentKind === "appointment" ? contactImageFor(snapshot) : null;
      this.contactImage = contactImage;
      this.images = contactImage ? [{ name: "Im1", ...contactImage }] : [];
      if (snapshot.documentKind === "appointment") this.images.push({ name: "BrandLogo", ...documentLogo() });
      this.y = 60;
      this.addPage();
    }

    command(value) {
      this.page.commands.push(value);
    }

    drawText(value, x, top, options = {}) {
      if (!text(value)) return;
      const size = options.size || 9.5;
      const font = options.bold ? "F2" : options.italic ? "F3" : "F1";
      const color = rgb(options.color || COLORS.text);
      const baseline = this.height - top - size;
      this.command(`BT /${font} ${size.toFixed(2)} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm ${pdfHex(value)} Tj ET`);
    }

    drawRect(x, top, width, height, options = {}) {
      const y = this.height - top - height;
      const fill = options.fill ? `${rgb(options.fill)} rg` : "";
      const stroke = options.stroke ? `${rgb(options.stroke)} RG ${(options.lineWidth || 0.5).toFixed(2)} w` : "";
      const operator = options.fill && options.stroke ? "B" : options.fill ? "f" : "S";
      this.command(`${fill} ${stroke} ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${operator}`.trim());
    }

    drawRoundedRect(x, top, width, height, radius = 6, options = {}) {
      const y = this.height - top - height;
      const r = Math.max(0, Math.min(radius, width / 2, height / 2));
      const k = r * 0.55228475;
      const fill = options.fill ? `${rgb(options.fill)} rg` : "";
      const stroke = options.stroke ? `${rgb(options.stroke)} RG ${(options.lineWidth || 0.5).toFixed(2)} w` : "";
      const operator = options.fill && options.stroke ? "B" : options.fill ? "f" : "S";
      const x2 = x + width;
      const y2 = y + height;
      this.command([
        fill,
        stroke,
        `${(x + r).toFixed(2)} ${y.toFixed(2)} m`,
        `${(x2 - r).toFixed(2)} ${y.toFixed(2)} l`,
        `${(x2 - r + k).toFixed(2)} ${y.toFixed(2)} ${x2.toFixed(2)} ${(y + r - k).toFixed(2)} ${x2.toFixed(2)} ${(y + r).toFixed(2)} c`,
        `${x2.toFixed(2)} ${(y2 - r).toFixed(2)} l`,
        `${x2.toFixed(2)} ${(y2 - r + k).toFixed(2)} ${(x2 - r + k).toFixed(2)} ${y2.toFixed(2)} ${(x2 - r).toFixed(2)} ${y2.toFixed(2)} c`,
        `${(x + r).toFixed(2)} ${y2.toFixed(2)} l`,
        `${(x + r - k).toFixed(2)} ${y2.toFixed(2)} ${x.toFixed(2)} ${(y2 - r + k).toFixed(2)} ${x.toFixed(2)} ${(y2 - r).toFixed(2)} c`,
        `${x.toFixed(2)} ${(y + r).toFixed(2)} l`,
        `${x.toFixed(2)} ${(y + r - k).toFixed(2)} ${(x + r - k).toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c h ${operator}`
      ].filter(Boolean).join(" "));
    }

    drawImage(name, x, top, width, height) {
      if (!this.images.some((image) => image.name === name)) return;
      this.page.images.add(name);
      const y = this.height - top - height;
      this.command(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`);
    }

    drawLine(x1, top1, x2, top2, color = COLORS.border, width = 0.5) {
      this.command(`${rgb(color)} RG ${width.toFixed(2)} w ${x1.toFixed(2)} ${(this.height - top1).toFixed(2)} m ${x2.toFixed(2)} ${(this.height - top2).toFixed(2)} l S`);
    }

    addPage() {
      this.page = { commands: [], images: new Set() };
      this.pages.push(this.page);
      const pageNumber = this.pages.length;
      if (this.snapshot.documentKind === "appointment") this.drawImage("BrandLogo", this.margin, 8, 102.5, 24);
      else {
        this.drawText("•", this.margin, 19, { bold: true, size: 9, color: "64B5FF" });
        this.drawText("•", this.margin + 9, 19, { bold: true, size: 9, color: "FF9B4B" });
        this.drawText("•  #Mitmachen", this.margin + 18, 19, { bold: true, size: 9, color: COLORS.navy });
      }
      this.drawText("gematik | Stabsstelle Versorgung", 414, 19, { bold: true, size: 7.5, color: COLORS.navy });
      this.drawLine(this.margin, 35, this.width - this.margin, 35, COLORS.blue, 0.8);
      this.drawLine(this.margin, this.height - 31, this.width - this.margin, this.height - 31, COLORS.border, 0.45);
      this.drawText(`${this.snapshot.documentLabel || DOCUMENT_LABEL} | ${this.snapshot.generatedLabel}`, this.margin, this.height - 25, { size: 7, color: COLORS.muted });
      this.drawText(`Seite ${pageNumber}`, this.width - this.margin - 35, this.height - 25, { bold: true, size: 7, color: COLORS.navy });
      this.y = 53;
      if (this.snapshot.documentKind === "appointment" && this.observationLabel) {
        const lines = wrapText(`${this.observationLabel} · Fortsetzung`, this.width - this.margin * 2, 8, false);
        lines.forEach((line) => {
          this.drawText(line, this.margin, this.y, { size: 8, color: COLORS.muted });
          this.y += 11;
        });
        this.y += 8;
      }
    }

    ensureSpace(height) {
      if (this.y + height <= this.height - this.bottom) return;
      this.addPage();
    }

    paragraph(value, options = {}) {
      const size = options.size || 9.5;
      const lineHeight = options.lineHeight || size * 1.35;
      const width = options.width || this.width - this.margin * 2;
      const x = options.x ?? this.margin;
      const lines = wrapText(value, width, size, Boolean(options.bold));
      const height = lines.length * lineHeight + (options.after ?? 5);
      this.ensureSpace(height);
      lines.forEach((line, index) => this.drawText(line, x, this.y + index * lineHeight, options));
      this.y += height;
      return height;
    }

    title(value, options = {}) {
      return this.paragraph(value, { bold: true, color: COLORS.navy, size: options.size || 26, lineHeight: options.lineHeight || 29, after: options.after ?? 4 });
    }

    sectionTitle(value) {
      this.ensureSpace(30);
      this.paragraph(value, { bold: true, color: COLORS.navy, size: 14, lineHeight: 17, after: 3 });
      this.drawRect(this.margin, this.y, 82, 5, { fill: COLORS.orange });
      this.drawRect(this.margin + 82, this.y, this.width - this.margin * 2 - 82, 5, { fill: COLORS.blue });
      this.y += 13;
    }

    subheading(value, { keepAfter = 0 } = {}) {
      const headingHeight = wrapText(value, this.width - this.margin * 2 - 9, 10.2, true).length * 12 + 3;
      this.ensureSpace(Math.max(25, headingHeight + keepAfter));
      this.drawRect(this.margin, this.y, 3, 18, { fill: COLORS.blue });
      this.paragraph(value, { x: this.margin + 9, width: this.width - this.margin * 2 - 9, bold: true, color: COLORS.navy, size: 10.2, lineHeight: 12, after: 3 });
    }

    callout(value) {
      const size = 9.5;
      const lines = wrapText(value, this.width - this.margin * 2 - 20, size, false);
      const height = Math.max(31, lines.length * 12.5 + 14);
      this.ensureSpace(height + 7);
      this.drawRect(this.margin, this.y, this.width - this.margin * 2, height, { fill: COLORS.paleOrange });
      this.drawRect(this.margin, this.y, 3, height, { fill: COLORS.orange });
      lines.forEach((line, index) => this.drawText(line, this.margin + 10, this.y + 7 + index * 12.5, { size, color: COLORS.text }));
      this.y += height + 7;
    }

    reportHeading(value, level = "section") {
      const formats = {
        section: { size: 14, lineHeight: 18, after: 8 },
        observation: { size: 11, lineHeight: 14, after: 9 },
        group: { size: 8.5, lineHeight: 11, after: 5 }
      };
      const format = formats[level];
      const height = wrapReportText(value, this.width - this.margin * 2, format.size, true).length * format.lineHeight;
      const before = level === "group" ? 6 : 12;
      this.ensureSpace(height + before + format.after + 32);
      this.y += before;
      this.paragraph(value, { ...format, bold: true, color: level === "group" ? COLORS.teal : COLORS.navy });
    }

    reportField(label, value) {
      if (Array.isArray(value)) value = value.join("; ");
      if (!text(value)) return;
      if (label === "Beobachtung") {
        this.flowParagraph(value, { size: 9.5, lineHeight: 13, after: 7, widowControl: true });
        return;
      }
      const size = 8.5;
      const prefix = `${label}:`;
      const lines = wrapReportText(`${prefix} ${value}`, this.width - this.margin * 2 - 6, size, true);
      lines.forEach((line, index) => {
        this.ensureSpace(11.5);
        if (index === 0) {
          // Let PDF advance the text cursor using the actual font metrics. Keeping
          // the trailing space in the label avoids collisions with the body text.
          const labelHex = `${pdfHex(prefix).slice(0, -1)}20>`;
          this.command(`BT /F2 ${size.toFixed(2)} Tf ${rgb(COLORS.teal)} rg 1 0 0 1 ${this.margin.toFixed(2)} ${(this.height - this.y - size).toFixed(2)} Tm ${labelHex} Tj /F1 ${size.toFixed(2)} Tf ${rgb(COLORS.text)} rg ${pdfHex(line.slice(prefix.length).trimStart())} Tj ET`);
        } else this.drawText(line, this.margin, this.y, { size, color: COLORS.text });
        this.y += 11.5;
      });
      this.y += 2;
    }

    flowParagraph(value, options = {}) {
      const size = options.size || 9.5;
      const lineHeight = options.lineHeight || 13;
      if (options.widowControl) {
        const paragraphs = String(value ?? "").replace(/\r\n|\r/g, "\n").split(/\n[ \t]*\n/);
        paragraphs.forEach((paragraph) => {
          const lines = wrapReportText(paragraph, this.width - this.margin * 2, size, Boolean(options.bold));
          // Reserve the beginning and the last two lines of each authored paragraph.
          this.ensureSpace(Math.min(3, lines.length) * lineHeight);
          lines.forEach((line, index) => {
            this.ensureSpace((lines.length - index === 2 ? 2 : 1) * lineHeight);
            this.drawText(line, this.margin, this.y, { ...options, size });
            this.y += lineHeight;
          });
          this.y += options.after ?? 5;
        });
        return;
      }
      const lines = wrapReportText(value, this.width - this.margin * 2, size, Boolean(options.bold));
      lines.forEach((line) => {
        this.ensureSpace(lineHeight);
        this.drawText(line, this.margin, this.y, { ...options, size });
        this.y += lineHeight;
      });
      this.y += options.after ?? 5;
    }

    contactHero(item = {}) {
      const width = this.width - this.margin * 2;
      const summaries = appointmentSummaryFields(item);
      const contactName = text(item.contact) || contextLabel(item);
      const organization = text(item.organization) === contactName ? "" : text(item.organization);
      const columnWidth = summaries.length ? width / 2 : width;
      const innerWidth = columnWidth - 24;
      const linesFor = (value, available, style = {}) => wrapReportText(value, available, style.size || 9, Boolean(style.bold))
        .map((value) => ({ value, height: style.lineHeight || 12, ...style }));
      const gap = (height) => ({ value: "", height });
      const identity = [
        ...linesFor(contactName, innerWidth - 58, { size: 13, bold: true, color: COLORS.navy, lineHeight: 16 }),
        ...(organization ? linesFor(organization, innerWidth - 58, { size: 9.2, bold: true, color: COLORS.teal, lineHeight: 12 }) : [])
      ].map((line) => ({ ...line, inset: 58 }));
      const identityHeight = identity.reduce((sum, line) => sum + line.height, 0);
      const left = [
        ...identity, gap(Math.max(0, 48 - identityHeight) + 10),
        ...appointmentMetadata(item).flatMap(([label, value]) => [
          ...linesFor(value, innerWidth - 82, { size: 8.5, lineHeight: 14 })
            .map((line, index) => ({ ...line, inset: 82, metadataLabel: index === 0 ? label : "", textOffset: 2 })), gap(3)
        ])
      ];
      const right = summaries.flatMap(([label, value]) => [
        ...linesFor(label, innerWidth, { size: 8.5, bold: true, color: COLORS.teal, lineHeight: 13 }),
        ...linesFor(value, innerWidth, { size: 9.2, lineHeight: 12.5 }), gap(9)
      ]);
      const columns = [left, right];
      const fullHeight = Math.max(...columns.map((lines) => lines.reduce((sum, line) => sum + line.height, 0))) + 24;
      if (fullHeight < this.height - this.bottom - 53) this.ensureSpace(fullHeight + 8);
      let first = true;
      while (columns.some((lines) => lines.length)) {
        this.ensureSpace(100);
        const top = this.y;
        const capacity = this.height - this.bottom - top - 24;
        const chunks = columns.map((lines) => {
          const chunk = [];
          let height = 0;
          while (lines.length && height + lines[0].height <= capacity) {
            const line = lines.shift();
            chunk.push(line);
            height += line.height;
          }
          return { lines: chunk, height };
        });
        const height = Math.max(...chunks.map((chunk) => chunk.height)) + 24;
        this.drawRoundedRect(this.margin, top, width, height, 8, { fill: COLORS.neutral, stroke: "D7E1F3", lineWidth: 0.55 });
        if (summaries.length) this.drawLine(this.margin + columnWidth, top + 12, this.margin + columnWidth, top + height - 12, "D7E1F3");
        if (first) {
          const x = this.margin + 12;
          if (this.contactImage) this.drawImage("Im1", x, top + 12, 46, 46);
          else {
            this.drawRoundedRect(x, top + 12, 46, 46, 7, { fill: COLORS.paleBlue, stroke: "CBDCFB" });
            const letters = initials(item.contact || contextLabel(item));
            this.drawText(letters, x + (46 - measureText(letters, 15, true)) / 2, top + 25, { size: 15, bold: true, color: COLORS.navy });
          }
        }
        chunks.forEach((chunk, index) => {
          let y = top + 12;
          chunk.lines.forEach((line) => {
            const x = this.margin + 12 + index * columnWidth;
            if (line.metadataLabel) {
              this.drawRoundedRect(x, y, 74, 14, 3, { fill: COLORS.paleBlue });
              this.drawText(line.metadataLabel, x + 5, y + 2, { size: 7.5, bold: true, color: COLORS.blue });
            }
            this.drawText(line.value, x + (line.inset || 0), y + (line.textOffset || 0), line);
            y += line.height;
          });
        });
        this.y += height + 10;
        first = false;
        if (columns.some((lines) => lines.length)) this.addPage();
      }
    }

    badgeHeight(items = []) {
      if (!items.length) return 0;
      const gap = 6;
      const width = (this.width - this.margin * 2 - gap * 2) / 3;
      let height = 9.8 + 3 + 1;
      for (let index = 0; index < items.length; index += 3) {
        const valueLines = items.slice(index, index + 3).map((item) => wrapText(item.value, width - 14, 7.6, true));
        height += Math.max(36, Math.max(...valueLines.map((lines) => lines.length)) * 9 + 21) + 6;
      }
      return height;
    }

    badges(items = []) {
      if (!items.length) return;
      this.ensureSpace(this.badgeHeight(items));
      this.paragraph("Codierung", { bold: true, color: COLORS.teal, size: 8.2, lineHeight: 9.8, after: 3 });
      const gap = 6;
      const width = (this.width - this.margin * 2 - gap * 2) / 3;
      for (let index = 0; index < items.length; index += 3) {
        const row = items.slice(index, index + 3);
        const valueLines = row.map((item) => wrapText(item.value, width - 14, 7.6, true));
        const height = Math.max(36, Math.max(...valueLines.map((lines) => lines.length)) * 9 + 21);
        this.ensureSpace(height + 6);
        row.forEach((item, itemIndex) => {
          const x = this.margin + itemIndex * (width + gap);
          const palette = item.palette || CODING_BADGE_PALETTES.relevance;
          this.drawRoundedRect(x, this.y, width, height, 7, { fill: palette.fill, stroke: palette.border, lineWidth: 0.55 });
          this.drawText(item.label, x + 7, this.y + 6, { bold: true, size: 6.6, color: COLORS.muted });
          valueLines[itemIndex].forEach((line, lineIndex) => this.drawText(line, x + 7, this.y + 17 + lineIndex * 9, { bold: true, size: 7.6, color: palette.text }));
        });
        this.y += height + 6;
      }
      this.y += 1;
    }

    codingRows(observation = {}) {
      const items = appointmentCodingItems(observation);
      const gap = 7;
      const width = (this.width - this.margin * 2 - gap * 2) / 3;
      const rows = [items].map((row) => ({ items: row,
        lines: row.map((item) => wrapReportText(item.value || item.placeholder || "Nicht erfasst", width - 16, 8.5, Boolean(item.value))) }));
      const totalHeight = rows.reduce((sum, row) => sum + Math.max(...row.lines.map((lines) => lines.length)) * 11 + 31, 22);
      if (totalHeight < this.height - this.bottom - 80) this.ensureSpace(totalHeight);
      this.reportHeading("Einordnung und Codes", "group");
      // Only the three categorical dimensions use cards; empty values retain their place.
      rows.forEach((row) => {
        while (row.lines.some((lines) => lines.length)) {
          this.ensureSpace(38);
          const capacity = Math.max(1, Math.floor((this.height - this.bottom - this.y - 25) / 11));
          const chunks = row.lines.map((lines) => lines.splice(0, capacity));
          const rowHeight = Math.max(...chunks.map((lines) => lines.length)) * 11 + 25;
          chunks.forEach((chunk, index) => {
            if (!chunk.length) return;
            const item = row.items[index];
            const x = this.margin + index * (width + gap);
            this.drawRoundedRect(x, this.y, width, rowHeight, 7, { fill: item.palette.fill, stroke: item.palette.border, lineWidth: 0.55 });
            this.drawText(item.label, x + 8, this.y + 6, { size: 7, bold: true, color: COLORS.muted });
            chunk.forEach((line, lineIndex) => this.drawText(line, x + 8, this.y + 18 + lineIndex * 11, { size: 8.5, bold: Boolean(item.value), color: item.value ? item.palette.text : COLORS.muted }));
          });
          this.y += rowHeight + 6;
        }
      });
    }

    field(label, value) {
      if (Array.isArray(value)) {
        if (!value.length) return;
        this.ensureSpace(14);
        this.paragraph(label, { bold: true, color: COLORS.teal, size: 8.2, lineHeight: 9.8, after: 0 });
        value.forEach((entry) => {
          const bullet = `• ${entry}`;
          this.paragraph(bullet, { x: this.margin + 8, width: this.width - this.margin * 2 - 8, size: 8.8, lineHeight: 10.5, after: 0 });
        });
        this.y += 1;
        return;
      }
      if (!text(value)) return;
      const labelWidth = Math.min(120, measureText(`${label}:`, 8.2, true) + 8);
      const available = this.width - this.margin * 2 - labelWidth;
      const lines = label === "Beobachtung"
        ? String(value ?? "").replace(/\r/g, "").split("\n").flatMap((line) => wrapText(line, available, 8.8, false))
        : wrapText(value, available, 8.8, false);
      const height = Math.max(11.5, lines.length * 10.5) + 1;
      if (label === "Beobachtung") {
        this.ensureSpace(Math.min(height, 22));
        this.drawText(`${label}:`, this.margin, this.y, { bold: true, color: COLORS.teal, size: 8.2 });
        lines.forEach((line) => {
          this.ensureSpace(10.5);
          this.drawText(line, this.margin + labelWidth, this.y, { size: 8.8, color: COLORS.text });
          this.y += 10.5;
        });
        this.y += Math.max(11.5, lines.length * 10.5) - lines.length * 10.5 + 1;
        return;
      }
      this.ensureSpace(height);
      this.drawText(`${label}:`, this.margin, this.y, { bold: true, color: COLORS.teal, size: 8.2 });
      lines.forEach((line, index) => this.drawText(line, this.margin + labelWidth, this.y + index * 10.5, { size: 8.8, color: COLORS.text }));
      this.y += height;
    }

    tableRow(cells, widths, options = {}) {
      const fontSize = options.header ? 7.2 : 7.5;
      const bold = Boolean(options.header);
      const wrapped = cells.map((cell, index) => wrapText(cell, widths[index] - 8, fontSize, bold));
      const height = Math.max(options.header ? 21 : 20, Math.max(...wrapped.map((lines) => lines.length)) * 9.2 + 9);
      if (this.y + height > this.height - this.bottom) return false;
      let x = this.margin;
      cells.forEach((_, index) => {
        this.drawRect(x, this.y, widths[index], height, {
          fill: options.header ? COLORS.navy : options.fill || COLORS.white,
          stroke: COLORS.border,
          lineWidth: 0.35
        });
        wrapped[index].forEach((line, lineIndex) => this.drawText(line, x + 4, this.y + 4 + lineIndex * 9.2, {
          bold,
          size: fontSize,
          color: options.header ? COLORS.white : COLORS.text
        }));
        x += widths[index];
      });
      this.y += height;
      return true;
    }
  }

  function pdfOverview(pdf, snapshot) {
    const widths = [30, 70, 174, 88, 99, 42];
    const headers = ["Nr.", "Termin", "Kontakt / Organisation", "Sektor / Ort", "Status / Doku", "Beob."];
    pdf.tableRow(headers, widths, { header: true });
    const rows = snapshot.appointments.length ? snapshot.appointments : [{ empty: true }];
    rows.forEach((item, index) => {
      const cells = item.empty
        ? ["-", "Keine Termine geladen", "", "", "", "0"]
        : [
          String(index + 1),
          appointmentDateLabel(item),
          contextLabel(item),
          [item.sector, item.location || item.city].map(text).filter(Boolean).join(" | ") || "Nicht hinterlegt",
          appointmentStatusLabel(item),
          item.kind === "slot" ? "-" : String(observationItems(item).length)
        ];
      if (!pdf.tableRow(cells, widths, { fill: index % 2 ? COLORS.neutral : COLORS.white })) {
        pdf.addPage();
        pdf.sectionTitle(`${overviewTitle(snapshot)} (Fortsetzung)`);
        pdf.tableRow(headers, widths, { header: true });
        pdf.tableRow(cells, widths, { fill: index % 2 ? COLORS.neutral : COLORS.white });
      }
    });
  }

  function pdfChapter(pdf, item, index) {
    pdf.addPage();
    pdf.title(`${String(index + 1).padStart(2, "0")} | Hospitation`, { size: 22, lineHeight: 25 });
    pdf.paragraph(contextLabel(item), { bold: true, color: COLORS.teal, size: 12.5, lineHeight: 15, after: 5 });
    pdf.drawRect(pdf.margin, pdf.y, 82, 6, { fill: COLORS.orange });
    pdf.drawRect(pdf.margin + 82, pdf.y, pdf.width - pdf.margin * 2 - 82, 6, { fill: COLORS.blue });
    pdf.y += 15;

    chapterMetadata(item).forEach(([label, value]) => pdf.field(label, text(value) || "Nicht hinterlegt"));
    const documentation = documentationFor(item);
    const summaryFields = [
      ["Kurzfassung", nonEmpty(item.summary, item.documentationSummary, documentation.experience)],
      ["Erkenntnis", documentation.insight],
      ["Nächste Nutzung", nonEmpty(documentation.nextUse, documentation.transferPotential)],
      ["Prozessnotizen", documentation.processNotes],
      ["Risiken", documentation.risks],
      ["Terminnotizen", nonEmpty(item.notes, item.requestNote)]
    ].filter(([, value]) => text(value));
    if (summaryFields.length) {
      pdf.sectionTitle("Einordnung und Zusammenfassung");
      summaryFields.forEach(([label, value]) => pdf.field(label, value));
    }

    const observations = observationItems(item);
    pdf.sectionTitle(`Beobachtungen (${observations.length})`);
    if (!observations.length) pdf.callout("Noch keine Beobachtungen dokumentiert.");
    observations.forEach((observation, observationIndex) => {
      const codingItems = observationCodingItems(observation);
      pdf.subheading(`Beobachtung ${observationIndex + 1} | ${text(observation.title) || "Ohne Kurztitel"}`, { keepAfter: pdf.badgeHeight(codingItems) + 22 });
      pdf.badges(codingItems);
      observationFields(observation).forEach(([label, value]) => pdf.field(label, value));
      pdfObservationAssessment(pdf, observation);
    });

    const quotes = quoteItems(item);
    if (quotes.length) {
      pdf.sectionTitle(`Zitate (${quotes.length})`);
      quotes.forEach((quote, quoteIndex) => {
        pdf.subheading(`Zitat ${quoteIndex + 1}`);
        quoteFields(quote).forEach(([label, value]) => pdf.field(label, value));
      });
    }
    const media = mediaItems(item);
    if (media.length) {
      pdf.sectionTitle(`Medien und Artefakte (${media.length})`);
      media.forEach((artifact, artifactIndex) => {
        pdf.subheading(`${artifactIndex + 1} | ${text(artifact.title) || "Medienbeleg"}`);
        mediaFields(artifact).forEach(([label, value]) => pdf.field(label, value));
      });
    }
    const impulses = impulseItems(item);
    if (impulses.length) {
      pdf.sectionTitle(`Impulse (${impulses.length})`);
      impulses.forEach((impulse, impulseIndex) => {
        pdf.subheading(`${impulseIndex + 1} | ${text(impulse.title) || "Impuls"}`);
        impulseFields(impulse).forEach(([label, value]) => pdf.field(label, value));
      });
    }
    const scores = documentation.scores && typeof documentation.scores === "object" ? documentation.scores : {};
    const scoreLabels = documentation.scoreLabels && typeof documentation.scoreLabels === "object" ? documentation.scoreLabels : {};
    const scoreEntries = Object.entries(scores).filter(([, value]) => value !== null && value !== undefined && value !== "");
    if (scoreEntries.length) {
      pdf.sectionTitle("Bewertungen");
      scoreEntries.forEach(([key, value]) => pdf.field(text(scoreLabels[key]) || key, `${value} / 5`));
    }
    const assessments = Array.isArray(item.roadmapAssessments) ? item.roadmapAssessments : [];
    if (assessments.length) {
      pdf.sectionTitle(`Roadmap-Einschätzungen (${assessments.length})`);
      assessments.forEach((assessment, assessmentIndex) => {
        pdf.subheading(`${assessmentIndex + 1} | ${nonEmpty(assessment.roadmapItemLabel, assessment.roadmapItemId, "Roadmap-Einschätzung")}`);
        assessmentFields(assessment).forEach(([label, value]) => pdf.field(label, value));
      });
    }
    const unmetNeeds = Array.isArray(item.unmetNeeds) ? item.unmetNeeds : [];
    if (unmetNeeds.length) {
      pdf.sectionTitle(`Weitere Bedarfe (${unmetNeeds.length})`);
      unmetNeeds.forEach((need, needIndex) => {
        pdf.subheading(`${needIndex + 1} | ${text(need.title) || "Bedarf"}`);
        unmetNeedFields(need).forEach(([label, value]) => pdf.field(label, value));
      });
    }
  }

  function pdfObservationOverview(pdf, snapshot) {
    const widths = [30, 82, 195, 145, 51];
    const headers = ["Nr.", "Termin", "Kontakt / Organisation", "Sektor / Ort", "Beob."];
    pdf.tableRow(headers, widths, { header: true });
    const rows = snapshot.hospitations.length ? snapshot.hospitations : [{ empty: true }];
    rows.forEach((item, index) => {
      const cells = item.empty
        ? ["-", "Keine Hospitationen mit Beobachtungen", "", "", "0"]
        : [
          String(index + 1),
          appointmentDateLabel(item),
          contextLabel(item),
          [item.sector, item.location || item.city].map(text).filter(Boolean).join(" | ") || "Nicht hinterlegt",
          String(observationItems(item).length)
        ];
      if (!pdf.tableRow(cells, widths, { fill: index % 2 ? COLORS.neutral : COLORS.white })) {
        pdf.addPage();
        pdf.sectionTitle("Hospitationen im Überblick (Fortsetzung)");
        pdf.tableRow(headers, widths, { header: true });
        pdf.tableRow(cells, widths, { fill: index % 2 ? COLORS.neutral : COLORS.white });
      }
    });
  }

  function pdfObservationChapter(pdf, item, index) {
    pdf.addPage();
    pdf.title(`${String(index + 1).padStart(2, "0")} | Hospitation`, { size: 22, lineHeight: 25 });
    pdf.paragraph(contextLabel(item), { bold: true, color: COLORS.teal, size: 12.5, lineHeight: 15, after: 5 });
    pdf.drawRect(pdf.margin, pdf.y, 82, 6, { fill: COLORS.orange });
    pdf.drawRect(pdf.margin + 82, pdf.y, pdf.width - pdf.margin * 2 - 82, 6, { fill: COLORS.blue });
    pdf.y += 15;
    observationChapterMetadata(item).forEach(([label, value]) => pdf.field(label, text(value) || "Nicht hinterlegt"));
    const observations = observationItems(item);
    pdf.sectionTitle(`Beobachtungen (${observations.length})`);
    if (!observations.length) pdf.callout("Noch keine Beobachtungen dokumentiert.");
    observations.forEach((observation, observationIndex) => {
      const codingItems = observationCodingItems(observation);
      pdf.subheading(`Beobachtung ${observationIndex + 1} | ${text(observation.title) || "Ohne Kurztitel"}`, { keepAfter: pdf.badgeHeight(codingItems) + 22 });
      pdf.badges(codingItems);
      observationOverviewFields(observation).forEach(([label, value]) => pdf.field(label, value));
      pdfObservationAssessment(pdf, observation);
    });
  }

  function pdfObservationMetadata(pdf, observation) {
    const { time, timeWidth, evidenceWidth: chipWidth, evidenceLines, prefixWidth,
      score, value, relevanceWidth, height } = observationMetadataLayout(observation, pdf.width - pdf.margin * 2);
    const palette = CODING_BADGE_PALETTES.evidence;
    const prefix = "Quelle: ";
    pdf.ensureSpace(height + 8);
    pdf.drawRoundedRect(pdf.margin, pdf.y, timeWidth, height, 4,
      { fill: COLORS.neutral, stroke: COLORS.border, lineWidth: 0.5 });
    pdf.drawText(time, pdf.margin + 8, pdf.y + (height - 8) / 2,
      { size: 8, bold: true, color: COLORS.text });
    const sourceLeft = pdf.margin + timeWidth + 12;
    pdf.drawRoundedRect(sourceLeft, pdf.y, chipWidth, height, 4,
      { fill: palette.fill, stroke: palette.border, lineWidth: 0.5 });
    pdf.drawText(prefix, sourceLeft + 8, pdf.y + 6.5, { size: 7.5, color: palette.text });
    evidenceLines.forEach((line, index) => pdf.drawText(line, sourceLeft + 8 + prefixWidth, pdf.y + 6 + index * 11,
      { size: 8, bold: true, color: palette.text }));

    const relevancePalette = CODING_BADGE_PALETTES.relevance;
    const relevanceLeft = sourceLeft + chipWidth + 12;
    const labelWidth = measureReportText("Relevanz", 7.5, true);
    pdf.drawRoundedRect(relevanceLeft, pdf.y, relevanceWidth, height, 4,
      { fill: relevancePalette.fill, stroke: relevancePalette.border, lineWidth: 0.5 });
    const dotsLeft = relevanceLeft + 8 + labelWidth + 8;
    const textY = pdf.y + (height - 7.5) / 2;
    pdf.drawText("Relevanz", relevanceLeft + 8, textY,
      { size: 7.5, bold: true, color: relevancePalette.text });
    [1, 2, 3, 4, 5].forEach((level, position) => {
      pdf.drawRoundedRect(dotsLeft + position * 9, pdf.y + (height - 5.5) / 2, 5.5, 5.5, 2.75,
        { fill: level <= score ? relevancePalette.text : relevancePalette.fill, stroke: relevancePalette.text, lineWidth: 0.7 });
    });
    if (score) pdf.drawText(value, dotsLeft + 49.5, textY - 0.5, { size: 8, bold: true, color: relevancePalette.text });
    pdf.y += height + 8;
  }

  function pdfAppointment(pdf, snapshot) {
    const item = snapshot.hospitations[0] || snapshot.appointments[0] || {};
    const observations = orderedAppointmentObservations(item);
    pdf.contactHero(item);
    pdf.ensureSpace(90);
    pdf.sectionTitle("Beobachtungen");
    if (!observations.length) {
      pdf.flowParagraph("Noch keine Beobachtungen dokumentiert.");
      return;
    }
    observations.forEach((observation, index) => {
      const label = String(index + 1).padStart(2, "0");
      const title = text(observation.title) || "Ohne Kurztitel";
      const titleLines = wrapReportText(title, pdf.width - pdf.margin * 2 - 44, 11, true);
      pdf.observationLabel = "";
      const blockHeight = appointmentObservationHeight(observation, index);
      pdf.ensureSpace(blockHeight < 600 ? blockHeight : titleLines.length * 14 + 96);
      pdf.observationLabel = label;
      pdf.y += 10;
      const titleHeight = Math.max(24, titleLines.length * 14 + 8);
      pdf.drawRoundedRect(pdf.margin, pdf.y, 26, 22, 3, { fill: COLORS.blue });
      pdf.drawText(label, pdf.margin + 6, pdf.y + 4, { size: 11, bold: true, color: COLORS.white });
      titleLines.forEach((line, lineIndex) => pdf.drawText(line, pdf.margin + 44, pdf.y + 4 + lineIndex * 14, { bold: true, color: COLORS.navy, size: 11 }));
      pdf.y += titleHeight + 5;
      pdfObservationMetadata(pdf, observation);
      appointmentObservationFields(observation).forEach(([label, value]) => pdf.reportField(label, value));
      pdf.codingRows(observation);
      if (text(observation.relevanceReason)) pdf.reportField("Begründung der Relevanz", observation.relevanceReason);
      const followUp = observationFollowUpFields(observation);
      if (followUp.length) {
        pdf.reportHeading("Offene Fragen und nächste Schritte", "group");
        followUp.forEach(([label, value]) => pdf.reportField(label, value));
      }
      pdf.y += 6;
    });
  }

  function pdfCodeHelp(pdf, snapshot) {
    const items = codeHelpItems();
    if (!items.length) return;
    // Reuse the observation cards' three-column anchors without their filled boxes.
    const gap = 7;
    const width = (pdf.width - pdf.margin * 2 - gap * 2) / 3;
    const blocks = items.slice(0, 3).map((item) => {
      const lines = [
        { value: item.label, size: 8.5, height: 16, bold: true, color: item.palette.text },
        ...item.values.flatMap((value) => [
          ...wrapReportText(value, width - 16, 9).map((value) => ({ value, size: 9, height: 11, color: COLORS.muted })),
          { height: 1.5 }
        ])
      ];
      return { lines, height: lines.reduce((sum, line) => sum + line.height, 0) };
    });
    const evidence = items[3];
    const evidenceWidth = pdf.width - pdf.margin * 2 - 16;
    const evidenceValues = wrapReportText(evidence.values.join("  |  "), evidenceWidth - 58, 9);
    const sourceLines = codeHelpNotes(snapshot).flatMap((note) => wrapReportText(note, evidenceWidth, 8));
    const height = 36 + Math.max(...blocks.map((block) => block.height)) + 9 + evidenceValues.length * 11.5 + sourceLines.length * 11 + 2;
    // The legend is a document-level closing section, never an observation continuation.
    pdf.observationLabel = "";
    pdf.ensureSpace(height);
    pdf.y += 16;
    pdf.drawText("Codehilfe", pdf.margin, pdf.y, { size: 9.5, bold: true, color: COLORS.text });
    pdf.drawText("Mögliche Angaben je Feld · Fassung 1.1 · Erprobung", pdf.margin + 64, pdf.y + 1, { size: 8.5, color: COLORS.muted });
    pdf.drawLine(pdf.margin, pdf.y + 14, pdf.width - pdf.margin, pdf.y + 14, COLORS.border, 0.5);
    pdf.y += 20;
    blocks.forEach((block, column) => {
      let top = pdf.y;
      block.lines.forEach((line) => {
        if (line.value) pdf.drawText(line.value, pdf.margin + column * (width + gap) + 8, top, line);
        top += line.height;
      });
    });
    pdf.y += Math.max(...blocks.map((block) => block.height)) + 9;
    pdf.drawText(evidence.label, pdf.margin + 8, pdf.y, { size: 8.5, bold: true, color: evidence.palette.text });
    evidenceValues.forEach((line, index) => pdf.drawText(line, pdf.margin + 66, pdf.y + index * 11.5, { size: 9, color: COLORS.muted }));
    pdf.y += evidenceValues.length * 11.5 + 2;
    sourceLines.forEach((line, index) => pdf.drawText(line, pdf.margin + 8, pdf.y + index * 11, { size: 8, color: COLORS.muted }));
    pdf.y += sourceLines.length * 11;
  }

  function assemblePdf(pages, images = []) {
    const encoder = new TextEncoder();
    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>";
    const imageIds = new Map();
    images.forEach((image, index) => {
      const id = 6 + index;
      const bytes = binaryBytes(image.bytes) || new Uint8Array();
      imageIds.set(image.name, id);
      objects[id] = {
        dictionary: `<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Number(image.width) || 1)} /Height ${Math.max(1, Number(image.height) || 1)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>`,
        stream: bytes
      };
    });
    const kids = [];
    const pageObjectStart = 6 + images.length;
    pages.forEach((page, index) => {
      const pageId = pageObjectStart + index * 2;
      const contentId = pageId + 1;
      const stream = page.commands.join("\n");
      const streamLength = encoder.encode(stream).length;
      const imageResources = [...(page.images || [])]
        .map((name) => imageIds.has(name) ? `/${name} ${imageIds.get(name)} 0 R` : "")
        .filter(Boolean)
        .join(" ");
      kids.push(`${pageId} 0 R`);
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${imageResources ? ` /XObject << ${imageResources} >>` : ""} >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
    });
    objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
    const chunks = [encoder.encode("%PDF-1.4\n%Versorgungs-Kompass\n")];
    const offsets = [0];
    let offset = chunks[0].length;
    for (let id = 1; id < objects.length; id += 1) {
      const object = objects[id];
      const chunk = typeof object === "string"
        ? encoder.encode(`${id} 0 obj\n${object}\nendobj\n`)
        : concatBytes([
          encoder.encode(`${id} 0 obj\n${object.dictionary}\nstream\n`),
          object.stream,
          encoder.encode("\nendstream\nendobj\n")
        ]);
      offsets[id] = offset;
      chunks.push(chunk);
      offset += chunk.length;
    }
    const xrefOffset = offset;
    const xref = [
      `xref\n0 ${objects.length}\n`,
      "0000000000 65535 f \n",
      ...offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`),
      `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    ].join("");
    chunks.push(encoder.encode(xref));
    return concatBytes(chunks);
  }

  function createPdf(input = {}) {
    const snapshot = normalizeSnapshot(input);
    const pdf = new PdfBuilder(snapshot);
    if (snapshot.documentKind === "appointment") {
      pdf.title(snapshot.title, { size: 26, lineHeight: 29, after: 5 });
      pdf.paragraph(snapshot.subtitle, { color: COLORS.blue, size: 11, lineHeight: 15, after: 8 });
      pdf.drawRect(pdf.margin, pdf.y, 82, 7, { fill: COLORS.orange });
      pdf.drawRect(pdf.margin + 82, pdf.y, pdf.width - pdf.margin * 2 - 82, 7, { fill: COLORS.blue });
      pdf.y += 19;
    } else {
      pdf.paragraph("•  •  •   #Mitmachen", { bold: true, color: COLORS.navy, size: 11, lineHeight: 13, after: 3 });
      pdf.title(snapshot.title, { size: 26, lineHeight: 29, after: 3 });
      pdf.paragraph(snapshot.subtitle, { bold: true, color: COLORS.blue, size: 12.5, lineHeight: 15, after: 6 });
      pdf.drawRect(pdf.margin, pdf.y, 82, 7, { fill: COLORS.orange });
      pdf.drawRect(pdf.margin + 82, pdf.y, pdf.width - pdf.margin * 2 - 82, 7, { fill: COLORS.blue });
      pdf.y += 17;
    }
    if (snapshot.documentKind === "observations") {
      pdf.callout(`Diese Übersicht bündelt ${countLabel(snapshot.summary.observations, "qualitative Beobachtung", "qualitative Beobachtungen")} aus ${countLabel(snapshot.summary.hospitations, "Hospitation", "Hospitationen")}. Die Beobachtungen sind nach Hospitation geordnet.`);
      pdf.paragraph(`${countLabel(snapshot.summary.observations, "Beobachtung", "Beobachtungen")} | ${countLabel(snapshot.summary.hospitations, "Hospitation", "Hospitationen")}`, { bold: true, color: COLORS.teal, size: 10.5, after: 8 });
      pdf.sectionTitle("Hospitationen im Überblick");
      pdfObservationOverview(pdf, snapshot);
      snapshot.hospitations.forEach((item, index) => pdfObservationChapter(pdf, item, index));
    } else if (snapshot.documentKind === "appointment") {
      pdfAppointment(pdf, snapshot);
      pdfCodeHelp(pdf, snapshot);
    } else {
      pdf.callout(`Dieser Export wurde am ${snapshot.generatedLabel} aus dem aktuell geladenen Datenstand (${snapshot.modeLabel}) erzeugt. Jeder erneute Download erstellt eine neue synchronisierte Momentaufnahme.`);
      pdf.paragraph(summaryLabel(snapshot), { bold: true, color: COLORS.teal, size: 10.5, after: 8 });
      pdf.sectionTitle(overviewTitle(snapshot));
      pdf.paragraph(overviewDescription(snapshot), { size: 8.8, after: 7 });
      pdfOverview(pdf, snapshot);
      snapshot.hospitations.forEach((item, index) => pdfChapter(pdf, item, index));
    }
    const bytes = assemblePdf(pdf.pages, pdf.images);
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      filename: filenameFor("pdf", snapshot),
      snapshot
    };
  }

  window.VersorgungsCompassHospitationExport = {
    appointmentCodebook: APPOINTMENT_CODEBOOK,
    createDocx,
    createPdf,
    createAppointmentDocx: (input = {}) => createDocx({ ...input, documentKind: "appointment" }),
    createAppointmentPdf: (input = {}) => createPdf({ ...input, documentKind: "appointment" }),
    createObservationDocx: (input = {}) => createDocx({ ...input, documentKind: "observations" }),
    createObservationPdf: (input = {}) => createPdf({ ...input, documentKind: "observations" }),
    downloadBlob,
    normalizeSnapshot,
    filenameFor
  };
})();
