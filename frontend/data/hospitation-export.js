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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Berlin" }).format(date);
  }

  function normalizeSnapshot(input = {}) {
    const generatedAt = text(input.generatedAt) || new Date().toISOString();
    const appointments = Array.isArray(input.appointments) ? input.appointments : [];
    const hospitations = Array.isArray(input.hospitations)
      ? input.hospitations
      : appointments.filter((item) => item.kind !== "slot");
    return {
      title: text(input.title) || "Hospitations-Termine & Beobachtungen",
      subtitle: text(input.subtitle) || "Versorgungs-Kompass | #Mitmachen",
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
      : "Terminübersicht des Hospitations-Moduls. Terminangebote sind enthalten; eigene Beobachtungskapitel folgen nur für Hospitationen.";
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

  function evidenceLabel(value) {
    return optionLabel("evidenceType", value);
  }

  function permissionLabel(item = {}) {
    const parts = [];
    if (item.internalUseAllowed || item.usageInternal) parts.push("interne Nutzung erlaubt");
    if (item.externalUseAllowed || item.usageExternal) parts.push("externe Nutzung erlaubt");
    if (!parts.length && (item.internalUseAllowed === false || item.externalUseAllowed === false)) parts.push("keine Freigabe dokumentiert");
    return parts.join(", ");
  }

  function observationFields(item = {}) {
    const source = [item.sourceType, item.source, item.sourceReference].map(text).filter(Boolean).join(" | ");
    const relevance = [item.relevanceScore || item.careRelevance ? `${item.relevanceScore || item.careRelevance} / 5` : "", item.relevanceReason].map(text).filter(Boolean).join(" - ");
    return [
      ["Situation / Kontext", nonEmpty(item.situation, item.situationContext)],
      ["Konkrete Beobachtung", nonEmpty(item.description, item.observed, item.observation)],
      ["Beobachtet am", formatDate(item.observedAt, true)],
      ["Reihenfolge", item.sequence],
      ["Auslöser", item.trigger],
      ["Handlungsschritte", list(item.actions || item.actionSteps)],
      ["Werkzeuge und Dokumente", list(item.toolsAndDocuments)],
      ["Kommunikationskanäle", list(item.communicationChannels)],
      ["Unmittelbare Folge", item.immediateConsequence],
      ["Beteiligte Rollen", list(item.involvedRoles || item.affectedRoles)],
      ["Prozessphase", item.processPhase],
      ["Problemtyp", item.problemType],
      ["Auswirkung", item.impact],
      ["Beobachtungsart", item.observationType],
      ["Evidenztyp", evidenceLabel(item.evidenceType)],
      ["Relevanz", relevance],
      ["Aktueller Workaround", nonEmpty(item.workaround, item.currentWorkaround)],
      ["Quelle", source],
      ["Unsicherheit", item.uncertainty],
      ["Grenzen", item.limitations],
      ["Nutzungsempfehlung", nonEmpty(item.usageRecommendation, item.nextUse)],
      ["Nächster Schritt", item.nextStep],
      ["Betroffene Produkte", list(item.affectedProducts)],
      ["Themen", list(item.topics || item.themes)],
      ["Nutzungsfreigabe", permissionLabel(item)],
      ["Aktualisiert", formatDate(item.updatedAt, true)]
    ].filter(([, value]) => Array.isArray(value) ? value.length : text(value));
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
    if (item.startsAt && item.endsAt && localDateKey(item.startsAt) === localDateKey(item.endsAt)) {
      return `${formatDate(item.startsAt)}, ${formatTime(item.startsAt)} - ${formatTime(item.endsAt)}`;
    }
    const start = formatDate(item.startsAt, true);
    const end = formatDate(item.endsAt, true);
    return start && end ? `${start} - ${end}` : start || end || "Termin offen";
  }

  function appointmentStatusLabel(item = {}) {
    const documentation = text(item.documentationStatus);
    return [text(item.status) || (item.kind === "slot" ? "Terminangebot" : "Status offen"), documentation].filter(Boolean).join(" | ");
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

  function filenameFor(type, snapshot) {
    const extension = type === "pdf" ? "pdf" : "docx";
    return `mitmachen-hospitations-termine-${safeFilenameDate(snapshot.generatedAt)}.${extension}`;
  }

  function wRun(value, options = {}) {
    const properties = [
      options.bold ? "<w:b/>" : "",
      options.italic ? "<w:i/>" : "",
      options.color ? `<w:color w:val="${options.color}"/>` : "",
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
    const inner = options.raw ? content : wParagraph(content, { style: options.style || "TableText" });
    const borderColor = options.borderColor || COLORS.border;
    return `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${width}"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="${borderColor}"/><w:left w:val="single" w:sz="4" w:color="${borderColor}"/><w:bottom w:val="single" w:sz="4" w:color="${borderColor}"/><w:right w:val="single" w:sz="4" w:color="${borderColor}"/></w:tcBorders><w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="105" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="105" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/>${options.shading ? `<w:shd w:val="clear" w:fill="${options.shading}"/>` : ""}</w:tcPr>${inner}</w:tc>`;
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

  function wSectionRule() {
    return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${A4.usableDxa}"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1560"/><w:gridCol w:w="7800"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="1560"/><w:shd w:fill="${COLORS.orange}"/><w:tcMar><w:top w:w="70" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/></w:tcMar></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="7800"/><w:shd w:fill="${COLORS.blue}"/><w:tcMar><w:top w:w="70" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/></w:tcMar></w:tcPr><w:p/></w:tc></w:tr></w:tbl>${wParagraph("", { spacing: { after: 80, line: 120 } })}`;
  }

  function wStylesXml() {
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
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:contextualSpacing/></w:pPr></w:style>
</w:styles>`;
  }

  function wNumberingXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="220"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${COLORS.blue}"/></w:rPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
  }

  function wHeaderXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${wParagraph([
      wRun("• ", { color: "64B5FF", bold: true, size: 18, font: "Arial" }),
      wRun("• ", { color: "FF9B4B", bold: true, size: 18, font: "Arial" }),
      wRun("•   #Mitmachen", { color: COLORS.navy, bold: true, size: 18, font: "Arial" }),
      wRun("\tgematik | Stabsstelle Versorgung", { color: COLORS.navy, bold: true, size: 15, font: "Arial" })
    ], { rightTab: A4.usableDxa, bottomBorder: { color: COLORS.blue, size: 6 }, spacing: { after: 0, line: 220 } })}</w:hdr>`;
  }

  function wFooterXml(snapshot) {
    const runs = [
      wRun(`${DOCUMENT_LABEL} | ${snapshot.generatedLabel}   ·   Seite `, { color: COLORS.muted, size: 14, font: "Arial" }),
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
          wParagraph(`Beobachtung ${observationIndex + 1} | ${text(observation.title) || "Ohne Kurztitel"}`, { style: "Heading3" }),
          wFields(observationFields(observation))
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

  function wDocumentXml(snapshot) {
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
    const coreDate = new Date(snapshot.generatedAt).toISOString();
    const entries = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
      ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(snapshot.title)}</dc:title><dc:subject>Synchronisierter Spiegel der Hospitations-Termine und Beobachtungen</dc:subject><dc:creator>Versorgungs-Kompass</dc:creator><cp:keywords>Hospitation, Beobachtung, Versorgungs-Kompass, Mitmachen</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${coreDate}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${coreDate}</dcterms:modified></cp:coreProperties>`],
      ["docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Versorgungs-Kompass</Application><AppVersion>1.0</AppVersion><Company>gematik | Stabsstelle Versorgung</Company></Properties>`],
      ["word/document.xml", wDocumentXml(snapshot)],
      ["word/styles.xml", wStylesXml()],
      ["word/numbering.xml", wNumberingXml()],
      ["word/settings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
      ["word/header1.xml", wHeaderXml()],
      ["word/footer1.xml", wFooterXml(snapshot)],
      ["word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`]
    ];
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

  class PdfBuilder {
    constructor(snapshot) {
      this.snapshot = snapshot;
      this.width = 595.28;
      this.height = 841.89;
      this.margin = 46;
      this.bottom = 48;
      this.pages = [];
      this.page = null;
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

    drawLine(x1, top1, x2, top2, color = COLORS.border, width = 0.5) {
      this.command(`${rgb(color)} RG ${width.toFixed(2)} w ${x1.toFixed(2)} ${(this.height - top1).toFixed(2)} m ${x2.toFixed(2)} ${(this.height - top2).toFixed(2)} l S`);
    }

    addPage() {
      this.page = { commands: [] };
      this.pages.push(this.page);
      const pageNumber = this.pages.length;
      this.drawText("•", this.margin, 19, { bold: true, size: 9, color: "64B5FF" });
      this.drawText("•", this.margin + 9, 19, { bold: true, size: 9, color: "FF9B4B" });
      this.drawText("•  #Mitmachen", this.margin + 18, 19, { bold: true, size: 9, color: COLORS.navy });
      this.drawText("gematik | Stabsstelle Versorgung", 414, 19, { bold: true, size: 7.5, color: COLORS.navy });
      this.drawLine(this.margin, 35, this.width - this.margin, 35, COLORS.blue, 0.8);
      this.drawLine(this.margin, this.height - 31, this.width - this.margin, this.height - 31, COLORS.border, 0.45);
      this.drawText(`${DOCUMENT_LABEL} | ${this.snapshot.generatedLabel}`, this.margin, this.height - 25, { size: 7, color: COLORS.muted });
      this.drawText(`Seite ${pageNumber}`, this.width - this.margin - 35, this.height - 25, { bold: true, size: 7, color: COLORS.navy });
      this.y = 53;
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

    subheading(value) {
      this.ensureSpace(25);
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
      const lines = wrapText(value, available, 8.8, false);
      const height = Math.max(11.5, lines.length * 10.5) + 1;
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
      pdf.subheading(`Beobachtung ${observationIndex + 1} | ${text(observation.title) || "Ohne Kurztitel"}`);
      observationFields(observation).forEach(([label, value]) => pdf.field(label, value));
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

  function assemblePdf(pages) {
    const encoder = new TextEncoder();
    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>";
    const kids = [];
    pages.forEach((page, index) => {
      const pageId = 6 + index * 2;
      const contentId = pageId + 1;
      const stream = page.commands.join("\n");
      const streamLength = encoder.encode(stream).length;
      kids.push(`${pageId} 0 R`);
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
    });
    objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
    const chunks = [encoder.encode("%PDF-1.4\n%Versorgungs-Kompass\n")];
    const offsets = [0];
    let offset = chunks[0].length;
    for (let id = 1; id < objects.length; id += 1) {
      const chunk = encoder.encode(`${id} 0 obj\n${objects[id]}\nendobj\n`);
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
    pdf.paragraph("•  •  •   #Mitmachen", { bold: true, color: COLORS.navy, size: 11, lineHeight: 13, after: 3 });
    pdf.title(snapshot.title, { size: 26, lineHeight: 29, after: 3 });
    pdf.paragraph(snapshot.subtitle, { bold: true, color: COLORS.blue, size: 12.5, lineHeight: 15, after: 6 });
    pdf.drawRect(pdf.margin, pdf.y, 82, 7, { fill: COLORS.orange });
    pdf.drawRect(pdf.margin + 82, pdf.y, pdf.width - pdf.margin * 2 - 82, 7, { fill: COLORS.blue });
    pdf.y += 17;
    pdf.callout(`Dieser Export wurde am ${snapshot.generatedLabel} aus dem aktuell geladenen Datenstand (${snapshot.modeLabel}) erzeugt. Jeder erneute Download erstellt eine neue synchronisierte Momentaufnahme.`);
    pdf.paragraph(summaryLabel(snapshot), { bold: true, color: COLORS.teal, size: 10.5, after: 8 });
    pdf.sectionTitle(overviewTitle(snapshot));
    pdf.paragraph(overviewDescription(snapshot), { size: 8.8, after: 7 });
    pdfOverview(pdf, snapshot);
    snapshot.hospitations.forEach((item, index) => pdfChapter(pdf, item, index));
    const bytes = assemblePdf(pdf.pages);
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      filename: filenameFor("pdf", snapshot),
      snapshot
    };
  }

  window.VersorgungsCompassHospitationExport = {
    createDocx,
    createPdf,
    downloadBlob,
    normalizeSnapshot,
    filenameFor
  };
})();
