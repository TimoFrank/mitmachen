import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

globalThis.window = globalThis;
await import("../frontend/data/hospitation-model.js");
await import("../frontend/data/hospitation-export.js");

const generatedAt = "2026-07-16T09:30:00.000Z";
const fixture = {
  title: "Hospitations-Termine & Beobachtungen",
  subtitle: "Versorgungs-Kompass | #Mitmachen",
  modeLabel: "Synthetischer Testdatenstand",
  generatedAt,
  appointments: [
    {
      kind: "hospitation",
      id: "hospitation-fixture-1",
      startsAt: "2026-07-18T08:00:00.000Z",
      endsAt: "2026-07-18T11:00:00.000Z",
      context: "Dr. Ada Beispiel | Hausarztpraxis am Markt",
      contact: "Dr. Ada Beispiel",
      organization: "Hausarztpraxis am Markt",
      sector: "Praxis",
      location: "Musterstraße 1",
      city: "Berlin",
      state: "Berlin",
      status: "Dokumentiert",
      documentationStatus: "Dokumentiert",
      owners: ["Timo", "Mara"],
      goal: "Informationsflüsse bei der Aufnahme verstehen",
      topics: ["Befund", "Medienbruch"],
      summary: "Die Aufnahme wird durch fehlende Vorbefunde regelmäßig unterbrochen.",
      notes: "18.07.2026 · Timo\nVorbereitung abgeschlossen.",
      updatedAt: generatedAt,
      documentation: {
        insight: "Vorbefunde sind ein wiederkehrender Engpass.",
        nextUse: "Produkt und Prozess prüfen",
        processNotes: "Beobachtung und Deutung wurden getrennt dokumentiert.",
        risks: "Einzelbeobachtung; weitere Validierung nötig.",
        scores: { relevance: 5, transfer: 4 },
        scoreLabels: { relevance: "Versorgungsrelevanz", transfer: "Übertragbarkeit" },
        observations: [
          {
            id: "observation-fixture-1",
            title: "Vorbefund fehlt bei der Aufnahme",
            situation: "Patientin wird am Empfang aufgenommen.",
            description: "Der aktuelle Vorbefund liegt weder digital noch als Ausdruck vor.",
            observedAt: "2026-07-18T08:25:00.000Z",
            trigger: "Beginn der Aufnahme",
            actions: ["PVS prüfen", "Vorbehandler anrufen"],
            toolsAndDocuments: ["PVS", "Telefon", "Papiernotiz"],
            communicationChannels: ["Telefon"],
            immediateConsequence: "Die Aufnahme pausiert für zwölf Minuten.",
            involvedRoles: ["MFA", "Patientin"],
            processPhase: "Anmeldung / Aufnahme",
            problemType: "fehlende Information",
            impact: "Arbeitsfluss wird unterbrochen",
            observationType: "Reibung / Problem",
            evidenceType: "directly_observed",
            relevanceScore: 5,
            relevanceReason: "Direkte Auswirkung auf Wartezeit und Arbeitsfluss.",
            workaround: "Telefonische Rückfrage",
            sourceType: "Vor-Ort-Beobachtung",
            sourceReference: "Notiz A-01",
            uncertainty: "Unklar, wie häufig dieser Fall pro Woche auftritt.",
            limitations: "Nur eine Schicht beobachtet.",
            usageRecommendation: "weiter validieren",
            nextStep: "In zwei weiteren Praxen prüfen",
            affectedProducts: ["ePA"],
            topics: ["Befund", "Aufnahme"],
            internalUseAllowed: true,
            externalUseAllowed: false,
            updatedAt: generatedAt
          },
          {
            id: "observation-fixture-2",
            title: "Checkliste stabilisiert den Ablauf",
            situation: "Übergabe zwischen zwei MFA",
            description: "Eine lokale Checkliste verhindert, dass Rückfragen vergessen werden.",
            processPhase: "Nachbereitung",
            problemType: "positives Muster / Best Practice",
            impact: "Ablauf funktioniert gut",
            observationType: "positives Beispiel",
            evidenceType: "directly_observed",
            relevanceScore: 4,
            updatedAt: generatedAt
          }
        ],
        quotes: [{
          quote: "Ohne den Ausdruck müssen wir jedes Mal hinterhertelefonieren.",
          personName: "Anonymisierte MFA",
          role: "MFA",
          context: "Aufnahme",
          anonymized: true,
          approvalStatus: "internal_approved",
          usageInternal: true,
          updatedAt: generatedAt
        }],
        mediaArtifacts: [{
          title: "Anonymisierte Checkliste",
          description: "Lokale Papiercheckliste am Empfang.",
          type: "form",
          fileName: "checkliste.pdf",
          fileUrl: "https://example.invalid/checkliste.pdf",
          needsRedaction: false,
          approvalStatus: "internal_approved",
          usageInternal: true,
          updatedAt: generatedAt
        }],
        impulses: [{
          title: "Vorbefunde bei Aufnahme sichtbar machen",
          classification: "product_question",
          problemStatement: "Vorbefunde fehlen im entscheidenden Moment.",
          expectedBenefit: "Weniger Rückfragen und Unterbrechungen",
          urgencyScore: 4,
          workaround: "Telefonische Rückfrage",
          nextStep: "Produktbezug prüfen",
          status: "to_review",
          relatedRoadmapItemLabel: "Dokumentenzugriff",
          updatedAt: generatedAt
        }]
      },
      roadmapAssessments: [{
        roadmapItemId: "roadmap-1",
        roadmapItemLabel: "Dokumentenzugriff",
        respondentRole: "MFA",
        respondentSector: "Praxis",
        careRelevance: 5,
        patientSafety: 4,
        processRelief: 5,
        urgency: 4,
        implementationFeasibility: 3,
        adoptionLikelihood: 4,
        confidenceScore: 4,
        evidenceNote: "Direkt beobachtete Unterbrechung.",
        updatedAt: generatedAt
      }],
      unmetNeeds: [{
        title: "Verlässlicher Vorbefundzugriff",
        problem: "Vorbefunde fehlen bei der Aufnahme.",
        affectedRole: "MFA",
        affectedSector: "Praxis",
        classification: "new_backlog_item",
        expectedBenefit: 5,
        urgency: 4,
        currentWorkaround: "Telefonische Rückfrage",
        nextStep: "Validieren",
        status: "Neu",
        relatedRoadmapItemLabel: "Dokumentenzugriff"
      }]
    },
    {
      kind: "slot",
      id: "slot-fixture-1",
      startsAt: "2026-08-02T07:00:00.000Z",
      context: "Pflegezentrum Beispiel",
      organization: "Pflegezentrum Beispiel",
      sector: "Pflege",
      city: "Potsdam",
      state: "Brandenburg",
      status: "Frei",
      documentationStatus: "Terminangebot",
      owners: ["Mara"],
      updatedAt: generatedAt,
      documentation: {}
    }
  ]
};
fixture.hospitations = fixture.appointments.filter((item) => item.kind === "hospitation");
// Valides synthetisches 1x1-Baseline-JPEG ohne Abbildung einer realen Person.
// Die Bytes bleiben absichtlich im Test, damit ein frischer RC-Checkout keine
// private oder ignorierte lokale Bilddatei benoetigt.
const fixturePhotoBytes = Uint8Array.from(Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCloCqE/9k=",
  "base64"
));
fixture.hospitations[0].contactImage = {
  bytes: fixturePhotoBytes,
  width: 1,
  height: 1,
  mimeType: "image/jpeg",
  alt: "Synthetische Kontaktbild-Fixture"
};

const exporter = globalThis.VersorgungsCompassHospitationExport;
assert.ok(exporter, "Exporter wurde nicht registriert");

// Der vereinbarte Exportkatalog ist unabhängig vom aktuell geladenen Editor-Modell.
const expectedAppointmentCodebook = {
  processPhase: ["Zugang", "Aufnahme", "Abklärung", "Versorgung", "Übergang", "Nachsorge", "Übergreifend", "Noch nicht zuordenbar"],
  problemType: [
    { value: "Information fehlt", label: "Fehlende Information" },
    { value: "Doppelte Dokumentation", label: "Doppelte Dokumentation" },
    { value: "Technik gestört", label: "Technische Störung" },
    { value: "Abstimmung unklar", label: "Unklare Abstimmung" },
    { value: "Verständnis erschwert", label: "Verständnisproblem" },
    { value: "Kapazität fehlt", label: "Fehlende Kapazität" },
    { value: "Anderer Aspekt", label: "Anderes Problem" },
    { value: "Kein Hindernis", label: "Kein Problem erkennbar" },
    { value: "Noch nicht zuordenbar", label: "Noch nicht zuordenbar" }
  ],
  impact: ["Zusätzliche Arbeit", "Verzögerung", "Fehler", "Belastung", "Entlastung", "Andere Folge", "Nicht feststellbar"],
  evidenceType: [
    { value: "directly_observed", label: "direkt beobachtet" },
    { value: "reported", label: "berichtet" },
    { value: "source_bound", label: "Beobachtungsunterlage" },
    { value: "interpreted", label: "Annahme" },
    { value: "synthetic_source_based", label: "synthetisches Beispiel" }
  ]
};
const expectedLegacyCodebook = {
  processPhase: ["Anmeldung / Aufnahme", "Identifikation", "Behandlung / Beratung", "Verordnung", "Überweisung",
    "Befund / Dokumentation", "Kommunikation mit Patient:innen", "Kommunikation mit anderen Einrichtungen", "Nachbereitung", "Sonstiges"],
  problemType: ["Medienbruch", "fehlende Information", "doppelte Dokumentation", "Rückfrage", "Wartezeit", "Workaround",
    "Systemverständnis", "Rollenunklarheit", "technisches Problem", "positives Muster / Best Practice", "offene Frage", "Übernahme nötig"],
  impact: ["Zeitaufwand", "Fehleranfälligkeit", "Frust / Belastung", "Informationsverlust", "Patient:innen müssen selbst vermitteln",
    "Prozessverzögerung", "Sicherheitsgefühl sinkt", "Arbeitsfluss wird unterbrochen", "Ablauf funktioniert gut"]
};
assert.equal(exporter.appointmentCodebook?.version, "1.1-erprobung", "Der Einzelterminexport bindet die bestätigte Erprobungsfassung");
assert.deepEqual(exporter.appointmentCodebook.codebook, expectedAppointmentCodebook,
  "Werte, sichtbare Bezeichnungen und Reihenfolge entsprechen vollständig dem abgestimmten Codebuch 1.1");
for (const [key, values] of Object.entries(expectedLegacyCodebook)) {
  assert.deepEqual(exporter.appointmentCodebook.legacyCodebook[key], values,
    `Alle bisherigen Werte in ${key} bleiben ohne fachliche Umdeutung erkennbar`);
}
function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value), "Der versionierte Exportkatalog ist einschließlich seiner Antwortlisten unveränderlich");
  Object.values(value).forEach(assertDeepFrozen);
}
assertDeepFrozen(exporter.appointmentCodebook);
for (const [key, values] of Object.entries(expectedAppointmentCodebook)) {
  assert.deepEqual(globalThis.VersorgungsCompassHospitationModel.codebook[key], values,
    `Framework und aktueller Editor teilen Werte, Anzeigenamen und Reihenfolge in ${key}`);
}
for (const [key, values] of Object.entries(expectedLegacyCodebook)) {
  assert.deepEqual(globalThis.VersorgungsCompassHospitationModel.legacyCodebook[key], values,
    `Framework und aktueller Editor erhalten dieselben historischen Werte in ${key}`);
}

const docx = exporter.createDocx(fixture);
const pdf = exporter.createPdf(fixture);
const observationDocx = exporter.createObservationDocx({
  ...fixture,
  title: "Hospitations-Beobachtungen",
  appointments: fixture.hospitations,
  hospitations: fixture.hospitations
});
const observationPdf = exporter.createObservationPdf({
  ...fixture,
  title: "Hospitations-Beobachtungen",
  appointments: fixture.hospitations,
  hospitations: fixture.hospitations
});
const dateOnlyAppointment = {
  ...fixture.hospitations[0],
  scheduledOn: "2026-07-18",
  startsAt: "",
  endsAt: ""
};
const appointmentSnapshot = {
  ...fixture,
  documentKind: "appointment",
  documentLabel: undefined,
  title: undefined,
  subtitle: undefined,
  appointments: [dateOnlyAppointment],
  hospitations: [dateOnlyAppointment]
};
const appointmentDocx = exporter.createAppointmentDocx(appointmentSnapshot);
const appointmentPdf = exporter.createAppointmentPdf(appointmentSnapshot);
const docxBytes = new Uint8Array(await docx.blob.arrayBuffer());
const pdfBytes = new Uint8Array(await pdf.blob.arrayBuffer());
const observationDocxBytes = new Uint8Array(await observationDocx.blob.arrayBuffer());
const observationPdfBytes = new Uint8Array(await observationPdf.blob.arrayBuffer());
const appointmentDocxBytes = new Uint8Array(await appointmentDocx.blob.arrayBuffer());
const appointmentPdfBytes = new Uint8Array(await appointmentPdf.blob.arrayBuffer());
const docxText = new TextDecoder().decode(docxBytes);
const pdfText = new TextDecoder().decode(pdfBytes.slice(0, 64));
const observationDocxText = new TextDecoder().decode(observationDocxBytes);
const observationPdfText = new TextDecoder().decode(observationPdfBytes.slice(0, 64));
const appointmentDocxText = new TextDecoder("latin1").decode(appointmentDocxBytes);
const appointmentPdfText = new TextDecoder("latin1").decode(appointmentPdfBytes);

function storedZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0, "Die Testauswertung erwartet unkomprimierte DOCX-Einträge");
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataOffset = offset + 30 + nameLength + extraLength;
    assert.ok(dataOffset + size <= bytes.length, "DOCX-Eintrag ist unvollständig");
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    entries.set(name, bytes.subarray(dataOffset, dataOffset + size));
    offset = dataOffset + size;
  }
  assert.ok(entries.has("word/document.xml"), "DOCX enthält keinen Dokumentinhalt");
  return entries;
}

function entryXml(entries, name) {
  assert.ok(entries.has(name), `DOCX-Eintrag fehlt: ${name}`);
  return new TextDecoder().decode(entries.get(name));
}

function documentText(xml) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => entities[entity]))
    .join("\n");
}

function pdfDocumentText(bytes) {
  const source = new TextDecoder("latin1").decode(bytes);
  return [...source.matchAll(/<([0-9a-f]+)>\s*Tj/gi)]
    .map((match) => new TextDecoder("windows-1252").decode(Buffer.from(match[1], "hex")))
    .join("\n");
}

function normalizedText(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function beforeCodeHelp(content) {
  const headingAt = content.indexOf("Codehilfe");
  return headingAt < 0 ? content : content.slice(0, headingAt);
}

function beforeCodeHelpXml(xml) {
  const heading = [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)]
    .find((match) => documentText(match[0]).split("\n")[0].trim() === "Codehilfe");
  return heading ? xml.slice(0, heading.index) : xml;
}

function codeHelpLabel(entry) {
  if (typeof entry === "string") return entry;
  return entry.label;
}

function assertCodeHelp(format, content, lastContent) {
  const headingAt = content.indexOf("Codehilfe");
  assert.equal(content.split("Codehilfe").length - 1, 1, `${format}: Die Codehilfe steht genau einmal am Dokumentende`);
  assert.ok(headingAt > content.indexOf(lastContent) && content.includes(lastContent),
    `${format}: Die Codehilfe folgt auf den letzten dokumentierten Inhalt`);
  const help = normalizedText(content.slice(headingAt));
  assert.ok(help.includes("Mögliche Angaben je Feld"), `${format}: Die Legende erklärt ihre Funktion`);
  assert.ok(help.includes("Fassung 1.1 · Erprobung"), `${format}: Die lokale Codebuchfassung ist erkennbar`);
  const sections = [["Prozessphase", "processPhase"], ["Problemtyp", "problemType"], ["Auswirkung", "impact"], ["Quelle", "evidenceType"]];
  sections.forEach(([label, key], index) => {
    const start = help.indexOf(label);
    const end = index < sections.length - 1 ? help.indexOf(sections[index + 1][0]) : help.length;
    assert.ok(start >= 0 && end > start, `${format}: Codehilfebereich ${label} steht an seiner vorgesehenen Stelle`);
    const section = help.slice(start, end);
    for (const entry of expectedAppointmentCodebook[key]) {
      const value = codeHelpLabel(entry);
      assert.ok(section.includes(value), `${format}: Codehilfe ${label} enthält die Antwort aus Fassung 1.1: ${value}`);
    }
  });
  const evidence = help.slice(help.indexOf("Quelle"));
  assert.doesNotMatch(evidence, /Bei Quellen:|Evidenzart|anonymisierte Unterlage|synthetisch, quellenbasiert/,
    `${format}: Alle fünf Quellenarten stehen gemeinsam mit den neuen kurzen Bezeichnungen`);
  expectedAppointmentCodebook.evidenceType.forEach((entry) => {
    assert.equal(evidence.split(entry.label).length - 1, 1,
      `${format}: Jede Quellenart erscheint in der schmalen Legendenzeile genau einmal`);
  });
}

const codeLabels = ["Prozessphase", "Problemtyp", "Auswirkung"];
const observationMetaLabels = ["Uhrzeit", "Quelle", "Relevanz"];

function wordCells(xml) {
  const starts = [];
  const cells = [];
  for (const match of xml.matchAll(/<\/?w:tc\b[^>]*>/g)) {
    if (!match[0].startsWith("</")) {
      starts.push(match.index);
      continue;
    }
    const start = starts.pop();
    if (start === undefined) continue; // A chapter excerpt may begin inside a heading cell.
    const cell = xml.slice(start, match.index + match[0].length);
    if (!/<w:tc\b/.test(cell.slice(cell.indexOf(">") + 1))) cells.push({ start, xml: cell });
  }
  return cells.sort((left, right) => left.start - right.start)
    .map(({ xml: cell }) => ({ xml: cell, content: documentText(cell), lines: documentText(cell).split("\n") }));
}

function assertCodeCells(xml, expectedValues) {
  const cells = wordCells(xml)
    .filter((cell) => [...codeLabels, "Nächste Nutzung"].includes(cell.lines[0])
      && /<w:shd\b[^>]*w:fill="(?!FFFFFF)[0-9A-F]{6}"/i.test(cell.xml));
  assert.deepEqual(cells.map((cell) => cell.lines[0]), codeLabels,
    "Nur Prozessphase, Problemtyp und Auswirkung bilden die drei farbigen Codezellen");
  cells.forEach((cell, index) => {
    assert.equal(normalizedText(cell.lines.slice(1).join(" ")), expectedValues[index],
      `Der Wert für ${codeLabels[index]} bleibt in seiner eigenen Zelle sichtbar`);
    assert.match(cell.xml, /<w:shd\b[^>]*w:fill="(?!FFFFFF)[0-9A-F]{6}"/i,
      `Die Zelle ${codeLabels[index]} hat auch bei fehlendem Wert eine farbige Fläche`);
  });
}

function pdfPageContents(source) {
  const objects = new Map([...source.matchAll(/(\d+) 0 obj\b([\s\S]*?)\bendobj/g)]
    .map((match) => [match[1], match[2]]));
  const pages = [...objects.values()].filter((object) => /\/Type\s*\/Page\b/.test(object));
  assert.ok(pages.length, "Das PDF enthält mindestens eine Seite");
  return pages.map((page) => {
    const contentId = /\/Contents\s+(\d+) 0 R/.exec(page)?.[1];
    assert.ok(contentId && objects.has(contentId), "Der PDF-Seiteninhalt ist verknüpft");
    return { page, content: objects.get(contentId) };
  });
}

function pdfTextRuns(source) {
  return pdfPageContents(source).flatMap(({ content }, page) =>
    [...content.matchAll(/\bBT\b[\s\S]*?\bET\b/g)].map((match) => {
      const position = /\b1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\b/.exec(match[0]);
      return { text: normalizedText(pdfDocumentText(new TextEncoder().encode(match[0]))), page,
        x: Number(position?.[1]), y: Number(position?.[2]), preceding: content.slice(0, match.index) };
    }));
}

function assertPdfBrandOnEveryPage(source) {
  const pages = pdfPageContents(source);
  pages.forEach(({ page, content }, index) => {
    assert.match(page, /\/BrandLogo\s+\d+ 0 R/, `PDF-Seite ${index + 1}: Das Logo ist als Bildressource verfügbar`);
    assert.equal([...content.matchAll(/\/BrandLogo\s+Do\b/g)].length, 1,
      `PDF-Seite ${index + 1}: Das echte Markenlogo wird genau einmal gezeichnet`);
  });
  return pages.length;
}

async function appointmentContents(item, includeCodeHelp = false) {
  const input = { ...appointmentSnapshot, appointments: [item], hospitations: [item] };
  const word = exporter.createAppointmentDocx(input);
  const pdf = exporter.createAppointmentPdf(input);
  const entries = storedZipEntries(new Uint8Array(await word.blob.arrayBuffer()));
  const contents = [
    ["Word", documentText(entryXml(entries, "word/document.xml"))],
    ["PDF", pdfDocumentText(new Uint8Array(await pdf.blob.arrayBuffer()))]
  ];
  return contents.map(([format, content]) => [format, includeCodeHelp ? content : beforeCodeHelp(content)]);
}

const appointmentEntries = storedZipEntries(appointmentDocxBytes);
const appointmentFullXml = entryXml(appointmentEntries, "word/document.xml");
const appointmentFullContent = documentText(appointmentFullXml);
const appointmentXml = beforeCodeHelpXml(appointmentFullXml);
const appointmentContent = beforeCodeHelp(appointmentFullContent);
const appointmentPdfFullContent = pdfDocumentText(appointmentPdfBytes);
const appointmentPdfContent = beforeCodeHelp(appointmentPdfFullContent);

assert.equal(docx.snapshot.summary.appointments, 2);
assert.equal(docx.snapshot.summary.hospitations, 1);
assert.equal(docx.snapshot.summary.observations, 2);
assert.match(docx.filename, /mitmachen-hospitations-termine-2026-07-16\.docx$/);
assert.match(pdf.filename, /mitmachen-hospitations-termine-2026-07-16\.pdf$/);
assert.ok(docxBytes.length > 10_000, "DOCX ist unerwartet klein");
assert.ok(pdfBytes.length > 5_000, "PDF ist unerwartet klein");
assert.equal(String.fromCharCode(...docxBytes.slice(0, 2)), "PK");
assert.match(docxText, /word\/document\.xml/);
assert.match(docxText, /Hospitations-Termine &amp; Beobachtungen/);
assert.match(docxText, /Vorbefund fehlt bei der Aufnahme/);
assert.match(docxText, /w:pgSz w:w="11906" w:h="16838"/);
assert.match(pdfText, /^%PDF-1\.4/);
assert.equal(observationDocx.snapshot.documentKind, "observations");
assert.equal(observationDocx.snapshot.summary.hospitations, 1);
assert.equal(observationDocx.snapshot.summary.observations, 2);
assert.match(observationDocx.filename, /mitmachen-hospitations-beobachtungen-2026-07-16\.docx$/);
assert.match(observationPdf.filename, /mitmachen-hospitations-beobachtungen-2026-07-16\.pdf$/);
assert.ok(observationDocxBytes.length > 10_000, "Beobachtungs-DOCX ist unerwartet klein");
assert.ok(observationPdfBytes.length > 5_000, "Beobachtungs-PDF ist unerwartet klein");
assert.match(observationDocxText, /Hospitations-Beobachtungen/);
assert.match(observationDocxText, /Vorbefund fehlt bei der Aufnahme/);
assert.match(observationDocxText, /Die Aufnahme pausiert für zwölf Minuten/);
assert.doesNotMatch(observationDocxText, /Datensatz-ID|Betroffene Produkte|Nutzungsfreigabe|Roadmap-Einschätzungen|checkliste\.pdf|Synthetischer Testdatenstand/);
assert.match(observationPdfText, /^%PDF-1\.4/);
for (const [format, content] of [["Gesamtübersicht Word", docxText], ["Beobachtungsübersicht Word", observationDocxText],
  ["Gesamtübersicht PDF", pdfDocumentText(pdfBytes)], ["Beobachtungsübersicht PDF", pdfDocumentText(observationPdfBytes)]]) {
  assert.doesNotMatch(content, /Codehilfe/, `${format}: Die Codehilfe bleibt auf den Einzelterminexport begrenzt`);
  assert.doesNotMatch(content, /Uhrzeit:/, `${format}: Das neue Uhrzeitlabel bleibt auf das Hospitations-Framework begrenzt`);
}
assert.equal(appointmentDocx.snapshot.documentKind, "appointment");
assert.equal(appointmentDocx.snapshot.summary.appointments, 1);
assert.equal(appointmentDocx.snapshot.summary.observations, 2);
assert.equal(appointmentDocx.snapshot.hospitations[0].scheduledOn, "2026-07-18");
assert.match(appointmentDocx.filename, /^mitmachen-hospitations-termin-2026-07-18-dr-ada-beispiel\.docx$/);
assert.match(appointmentPdf.filename, /^mitmachen-hospitations-termin-2026-07-18-dr-ada-beispiel\.pdf$/);
assert.ok(appointmentDocxBytes.length > fixturePhotoBytes.length, "Einzeltermin-DOCX enthält das Foto nicht plausibel");
assert.ok(appointmentPdfBytes.length > fixturePhotoBytes.length, "Einzeltermin-PDF enthält das Foto nicht plausibel");
assert.match(appointmentDocxText, /word\/media\/kontaktfoto\.jpg/);
assert.match(appointmentDocxText, /relationships\/image/);
assert.equal(appointmentDocx.snapshot.title, "Hospitations-Framework");
assert.equal(appointmentDocx.snapshot.subtitle, "Unknown Unknowns aus der Versorgung");
assert.equal(appointmentDocx.snapshot.documentLabel, "Hospitations-Framework");
for (const [format, content] of [["Word", appointmentContent], ["PDF", appointmentPdfContent]]) {
  const normalized = normalizedText(content);
  assert.ok(normalized.includes("Hospitations-Framework"), `${format}: Der gewählte Dokumenttitel erscheint`);
  assert.ok(normalized.includes("Unknown Unknowns aus der Versorgung"), `${format}: Der gekürzte Untertitel erscheint`);
  assert.doesNotMatch(content, /Genauer hingeschaut|Beobachtungen und Unknown Unknowns/,
    `${format}: Frühere Titel und Untertitel entfallen`);
  assert.doesNotMatch(content, /(?:^|\n)\s*KONTAKT\s*(?:\n|$)/,
    `${format}: Die zusätzliche sichtbare Kontaktüberschrift entfällt`);
  dateOnlyAppointment.documentation.observations.forEach((observation, index) => {
    const heading = `${String(index + 1).padStart(2, "0")} ${observation.title}`;
    assert.ok(normalized.includes(heading), `${format}: Fortlaufende Nummer und Titel fehlen: ${heading}`);
  });
  assert.doesNotMatch(normalized, /(?:Beobachtung\s+)?\d{2}\s*[|/]/,
    `${format}: Nummerierte Beobachtungsüberschriften erhalten keinen senkrechten Strich oder Schrägstrich`);
  for (const value of ["Dr. Ada Beispiel", "Hausarztpraxis am Markt", "Praxis", "Musterstraße 1", "Berlin", "18.07.2026",
    "Dokumentiert", "Timo", "Mara", dateOnlyAppointment.goal, dateOnlyAppointment.summary]) {
    assert.equal(normalized.split(value).length - 1, 1, `${format}: ${value} soll im Dokument nur einmal erscheinen`);
  }
  assert.doesNotMatch(content, /(?:^|\n)\s*\d+ Beobachtungen?(?: zu diesem Termin)?\s*(?:\n|$)/,
    `${format}: Die separate Beobachtungszahl entfällt`);
  assert.doesNotMatch(content, /(?:^|\n)\s*(?:Befund|Anlass und Überblick|Anlass und Einordnung)\s*(?:\n|$)/,
    `${format}: Die überflüssigen Zwischenabschnitte entfallen`);
}
const appointmentHeaderXml = entryXml(appointmentEntries, "word/header1.xml");
assert.doesNotMatch(documentText(appointmentHeaderXml), /Dr\. Ada Beispiel|Hausarztpraxis am Markt|18\.07\.2026|•/);
for (const name of ["word/header1.xml", "word/footer1.xml"]) {
  const content = documentText(entryXml(appointmentEntries, name));
  assert.doesNotMatch(content, /Codehilfe|Prozessphase|Problemtyp|Auswirkung|Quelle/,
    `${name}: Die Legende ist kein Bestandteil von Kopf- oder Fußzeile`);
}
for (const [format, content] of [["Word", appointmentFullContent], ["PDF", appointmentPdfFullContent]]) {
  assertCodeHelp(format, content, dateOnlyAppointment.documentation.observations.at(-1).description);
}
const codeHelpXml = appointmentFullXml.slice(appointmentXml.length);
const legendCells = wordCells(codeHelpXml);
assert.deepEqual(legendCells.slice(0, 3).map((cell) => cell.lines[0]), codeLabels,
  "Word: Die Legende übernimmt Prozessphase, Problemtyp und Auswirkung in derselben Spaltenreihenfolge wie die Beobachtungen");
const legendWidths = legendCells.slice(0, 3).map((cell) => /<w:tcW\b[^>]*w:w="(\d+)"/.exec(cell.xml)?.[1]);
assert.ok(legendWidths.every(Boolean) && new Set(legendWidths).size === 1,
  "Word: Die drei Hauptfelder der Codehilfe erhalten gleich breite Spalten");
const sourceLegendParagraph = [...codeHelpXml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)]
  .map((match) => match[0]).find((paragraph) => normalizedText(documentText(paragraph)).startsWith("Quelle "));
assert.ok(sourceLegendParagraph, "Word: Die Quellenlegende steht in einem eigenen schmalen Absatz");
assert.equal(normalizedText(documentText(sourceLegendParagraph)),
  `Quelle ${expectedAppointmentCodebook.evidenceType.map((entry) => entry.label).join(" | ")}`,
  "Word: Die fünf Quellenarten bleiben in einer gemeinsamen Legendenzeile");
assert.doesNotMatch(sourceLegendParagraph, /<w:br\b/,
  "Word: Die schmale Quellenlegende enthält keinen erzwungenen Zeilenumbruch");
const appointmentPdfRuns = pdfTextRuns(appointmentPdfText);
const legendPdfRuns = appointmentPdfRuns.slice(appointmentPdfRuns.findIndex((run) => run.text === "Codehilfe"));
const legendHeadings = codeLabels.map((label) => legendPdfRuns.find((run) => run.text === label));
assert.ok(legendHeadings.every(Boolean) && new Set(legendHeadings.map((run) => `${run.page}:${run.y}`)).size === 1
  && legendHeadings.every((run, index) => !index || run.x > legendHeadings[index - 1].x),
"PDF: Die drei Hauptfelder stehen nebeneinander auf derselben Höhe");
const sourceLegendLabel = legendPdfRuns.find((run) => run.text === "Quelle");
const sourceLegendValues = legendPdfRuns.find((run) => run.text === expectedAppointmentCodebook.evidenceType.map((entry) => entry.label).join(" | "));
assert.ok(sourceLegendLabel && sourceLegendValues && sourceLegendValues.page === sourceLegendLabel.page
  && Math.abs(sourceLegendValues.y - sourceLegendLabel.y) < 1 && sourceLegendValues.x > sourceLegendLabel.x,
"PDF: Alle fünf Quellenarten passen in eine schmale Zeile neben der Beschriftung");
const brandLogo = appointmentEntries.get("word/media/mitmachen-logo.jpg");
assert.ok(brandLogo?.length > 100, "Der Word-Export enthält das Markenlogo als eigenes Bild");
assert.deepEqual([...brandLogo.slice(0, 3)], [0xff, 0xd8, 0xff], "Das Markenlogo ist ein JPEG-Bild");
const headerRelations = entryXml(appointmentEntries, "word/_rels/header1.xml.rels");
const imageRelation = [...headerRelations.matchAll(/<Relationship\b[^>]*\/>/g)]
  .map((match) => match[0]).find((relation) => /Target="media\/mitmachen-logo\.jpg"/.test(relation));
assert.ok(imageRelation, "Der Word-Header besitzt eine eigene Beziehung zum Markenlogo");
assert.match(imageRelation, /Type="[^"]*\/image"/);
const imageRelationshipId = /Id="([^"]+)"/.exec(imageRelation)?.[1];
assert.ok(appointmentHeaderXml.includes(`r:embed="${imageRelationshipId}"`),
  "Der Word-Header bindet das Markenlogo über seine eigene Bildbeziehung ein");
assert.doesNotMatch(appointmentContent, /18\.07\.2026,\s*02:00/, "Ein reiner Hospitationstag darf im Export keine abgeleitete Uhrzeit erhalten");
assert.doesNotMatch(appointmentContent, /Pflegezentrum Beispiel|Terminangebot/);
assert.doesNotMatch(appointmentXml, /<w:pageBreakBefore\b|<w:br\b[^>]*w:type="page"/, "Beobachtungen sollen ohne erzwungene Seitenumbrüche fließen");
for (const [index, observation] of dateOnlyAppointment.documentation.observations.entries()) {
  for (const [format, content] of [["Word", appointmentContent], ["PDF", appointmentPdfContent]]) {
    const titleAt = content.indexOf(observation.title);
    const nextTitle = dateOnlyAppointment.documentation.observations[index + 1]?.title;
    const block = normalizedText(content.slice(titleAt, nextTitle ? content.indexOf(nextTitle) : undefined));
    const situationAt = block.indexOf(observation.situation);
    const descriptionAt = block.indexOf(observation.description);
    const codingAt = block.search(/Einordnung und Codes|Codierung/);
    assert.ok(titleAt >= 0 && situationAt > 0 && descriptionAt > situationAt && codingAt > descriptionAt,
      `${format}: Situation und Beschreibung stehen im gemeinsamen Haupttext vor den Codes`);
    if (observation.trigger) assert.ok(block.indexOf(observation.trigger) > situationAt
      && block.indexOf(observation.trigger) < codingAt,
    `${format}: Der dokumentierte Auslöser fließt vor der Codierung in den Haupttext ein`);
    assert.ok(block.indexOf("Quelle:") >= 0 && block.indexOf("Quelle:") < situationAt,
      `${format}: Die Quelle ist schon unter der Überschrift erkennbar`);
    for (const value of [observation.situation, observation.description, observation.trigger, ...(observation.actions || []),
      observation.immediateConsequence, observation.workaround, ...(observation.involvedRoles || []),
      observation.problemType, observation.processPhase, observation.impact,
      observation.uncertainty, observation.limitations, observation.nextStep, observation.relevanceReason].filter(Boolean)) {
      assert.ok(block.includes(value), `${format}: Dokumentierter Inhalt fehlt: ${value}`);
    }
    assert.doesNotMatch(block, /Situation:|Konkrete Beobachtung|Ergänzende Angaben|Auslöser:|Handlungsschritte:|Unmittelbare Folge:|Workaround:|Beteiligte Rollen:/,
      `${format}: Der zusammenhängende Haupttext enthält keine strukturierten Zwischenlabels`);
  }
  const titleXmlAt = appointmentXml.indexOf(observation.title);
  const headingParagraph = [...appointmentXml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)]
    .map((match) => match[0]).find((paragraph) => paragraph.includes(observation.title));
  const headingRuns = documentText(headingParagraph).split("\n");
  assert.equal(headingRuns.join("").trim(), observation.title,
    "Der Beobachtungstitel steht eigenständig und ohne sichtbaren Trenner");
  const nextTitle = dateOnlyAppointment.documentation.observations[index + 1]?.title;
  const observationXml = appointmentXml.slice(titleXmlAt, nextTitle ? appointmentXml.indexOf(nextTitle) : undefined);
  assertCodeCells(observationXml, [observation.processPhase, observation.problemType, observation.impact].map((value) => `${value}*`));
}
for (const [format, content] of [["Word", appointmentContent], ["PDF", appointmentPdfContent]]) {
  assert.doesNotMatch(content, /Noch offen|Noch nicht codiert|Prozessphase offen|Auswirkung offen|Noch nicht festgelegt|Quelle offen/,
    `${format}: Fehlende Werte stehen am jeweiligen Feld und nicht in einer Sammelzeile`);
  for (const value of ["direkt beobachtet", "5/5", "4/5"]) {
    assert.ok(normalizedText(content).includes(value), `${format}: Sekundärer Codewert fehlt: ${value}`);
  }
  assert.doesNotMatch(content, /Nächste Nutzung|Nutzungsempfehlung|weiter validieren|Nicht festgelegt|Nicht bewertet|0\s*\/\s*5/,
    `${format}: Der Einzeltermin zeigt weder Nutzungsfeld noch dessen gespeicherten oder leeren Wert`);
}
for (const [format, content] of [["Word-Gesamtübersicht", documentText(entryXml(storedZipEntries(docxBytes), "word/document.xml"))],
  ["PDF-Gesamtübersicht", pdfDocumentText(pdfBytes)]]) {
  assert.ok(normalizedText(content).includes(fixture.hospitations[0].documentation.observations[0].usageRecommendation),
    `${format}: Die gespeicherte Nutzungsempfehlung bleibt im anderen Exportformat erhalten`);
}
assert.match(appointmentPdfText, /^%PDF-1\.4/);
assert.match(appointmentPdfText, /\/Subtype \/Image/);
assert.match(appointmentPdfText, /\/Im1 Do/);
assertPdfBrandOnEveryPage(appointmentPdfText);

const organizationOnlyAppointment = {
  ...dateOnlyAppointment, contact: "", context: "", contactImage: undefined
};
for (const [format, content] of await appointmentContents(organizationOnlyAppointment)) {
  assert.equal(normalizedText(content).split(organizationOnlyAppointment.organization).length - 1, 1,
    `${format}: Ohne Kontakt erscheint die Organisation als Ersatzidentität nur einmal`);
  assert.doesNotMatch(content, /Dr\. Ada Beispiel/,
    `${format}: Bei fehlendem Kontakt wird kein Personenname ergänzt`);
}

const customTitle = "Blick in den Praxisalltag & offene Fragen";
const customAppointmentDocx = exporter.createAppointmentDocx({ ...appointmentSnapshot, title: customTitle });
assert.equal(customAppointmentDocx.snapshot.title, customTitle);
const customAppointmentEntries = storedZipEntries(new Uint8Array(await customAppointmentDocx.blob.arrayBuffer()));
assert.ok(documentText(entryXml(customAppointmentEntries, "word/document.xml")).includes(customTitle),
  "Ein bewusst gewählter eigener Dokumenttitel bleibt erhalten");

const sparseObservation = {
  title: "Eine erste Beobachtung",
  description: "Die Übergabe beginnt mit einer offenen Rückfrage."
};
const sparseAppointment = {
  ...dateOnlyAppointment,
  documentation: { observations: [sparseObservation] }
};

// Die Uhrzeit stammt ausschließlich aus dem Beobachtungszeitpunkt. Weder Terminbeginn
// noch Exportdatum dürfen aus einer fehlenden Zeit eine scheinbar genaue Angabe machen.
const observationTimeCases = [
  { fields: { observedAt: "9:07" }, expected: "09:07 Uhr" },
  { fields: { observedAt: "08:25:59.999" }, expected: "08:25 Uhr" },
  { fields: { observedAt: " 9:07:08 Uhr " }, expected: "09:07 Uhr" },
  { fields: { observedAt: "00:00" }, expected: "00:00 Uhr" },
  { fields: { observedAt: "2026-07-18T09:07:59.999" }, expected: "09:07 Uhr" },
  { fields: { observedAt: "2026-07-18 09:07" }, expected: "09:07 Uhr" },
  { fields: { observedAt: "2024-02-29 08:25:59+0100" }, expected: "08:25 Uhr" },
  { fields: { observedAt: "2026-07-18T08:25:59.999Z" }, expected: "10:25 Uhr" },
  { fields: { observedAt: "2026-01-18T08:25:59Z" }, expected: "09:25 Uhr" },
  { fields: { observedAt: "2026-07-18T07:25:59+02:00" }, expected: "07:25 Uhr" },
  { fields: { observedAt: "2026-07-18T12:25:59+05:30" }, expected: "08:55 Uhr" },
  { fields: { observedAt: "2026-03-29T00:59:59Z" }, expected: "01:59 Uhr" },
  { fields: { observedAt: "2026-03-29T01:00:00Z" }, expected: "03:00 Uhr" },
  { fields: { observedAt: "2026-10-25T01:30:00Z" }, expected: "02:30 Uhr" },
  { fields: {}, expected: "Uhrzeit: -" },
  { fields: { observedAt: "2026-07-18" }, expected: "Uhrzeit: -" },
  { fields: { observedAt: "unbekannt" }, expected: "Uhrzeit: -" },
  { fields: { observedAt: "24:00" }, expected: "Uhrzeit: -" },
  { fields: { observedAt: "12:60" }, expected: "Uhrzeit: -" },
  { fields: { observedAt: "12:00:60" }, expected: "Uhrzeit: -" },
  { fields: { observedAt: "2026-02-30T12:00:00Z" }, expected: "Uhrzeit: -" },
  { fields: { observedAt: "2026-02-29T12:00:00" }, expected: "Uhrzeit: -" },
  { fields: { observedAt: "2026-07-18T25:00:00+02:00" }, expected: "Uhrzeit: -" },
  { fields: { observedAt: "", observed_at: "09:34:56" }, expected: "09:34 Uhr" },
  { fields: { observedAt: null, observationTime: "10:46:01" }, expected: "10:46 Uhr" },
  { fields: { observation_time: "11:58" }, expected: "11:58 Uhr" },
  { fields: { observedAt: "07:12", observed_at: "19:45" }, expected: "07:12 Uhr" },
  { fields: { observedAt: "unbekannt", observed_at: "19:45" }, expected: "Uhrzeit: -" }
];
const timeAppointment = {
  ...fixture.hospitations[0],
  documentation: { observations: observationTimeCases.map(({ fields }, index) => ({
    ...sparseObservation, title: `Zeitbeispiel ${String(index + 1).padStart(2, "0")}`,
    evidenceType: "reported", relevanceScore: 3, ...fields
  })) }
};
const timeSnapshot = { ...appointmentSnapshot, appointments: [timeAppointment], hospitations: [timeAppointment] };
const unchangedTimeSnapshot = structuredClone(timeSnapshot);
const timeDocx = exporter.createAppointmentDocx(timeSnapshot);
const timePdf = exporter.createAppointmentPdf(timeSnapshot);
const timeXml = beforeCodeHelpXml(entryXml(storedZipEntries(new Uint8Array(await timeDocx.blob.arrayBuffer())), "word/document.xml"));
const timePdfSource = new TextDecoder("latin1").decode(new Uint8Array(await timePdf.blob.arrayBuffer()));
for (const [format, content] of [["Word", documentText(timeXml)], ["PDF", beforeCodeHelp(pdfDocumentText(new TextEncoder().encode(timePdfSource)))]]) {
  observationTimeCases.forEach(({ fields, expected }, index) => {
    const title = timeAppointment.documentation.observations[index].title;
    const nextTitle = timeAppointment.documentation.observations[index + 1]?.title;
    const block = normalizedText(content.slice(content.indexOf(title), nextTitle ? content.indexOf(nextTitle) : undefined));
    assert.ok(block.includes(expected), `${format}: ${JSON.stringify(fields)} erscheint als ${expected}`);
    const metadata = block.slice(0, block.indexOf(sparseObservation.description));
    assert.ok(metadata.indexOf(expected) < metadata.indexOf("Quelle:")
      && metadata.indexOf("Quelle:") < metadata.indexOf("Relevanz"),
    `${format}: Uhrzeit, Quelle und Relevanz stehen in der vereinbarten Lesereihenfolge`);
    assert.doesNotMatch(metadata, /\d{1,2}:\d{2}:\d{2}/,
      `${format}: Die Beobachtungszeit enthält weder Sekunden noch Sekundenbruchteile`);
    if (expected === "Uhrzeit: -") assert.doesNotMatch(metadata, /\b\d{2}:\d{2}\b/,
      `${format}: Ohne gültige Uhrzeit wird auch bei vorhandenem Terminbeginn und Exportdatum keine Zeit ergänzt`);
  });
}
assert.deepEqual(timeSnapshot, unchangedTimeSnapshot,
  "Minutengenaue Darstellung und Feld-Aliasse verändern keine gespeicherten Beobachtungszeitpunkte");

const sparseDocx = exporter.createAppointmentDocx({
  ...appointmentSnapshot,
  appointments: [sparseAppointment],
  hospitations: [sparseAppointment]
});
const sparseEntries = storedZipEntries(new Uint8Array(await sparseDocx.blob.arrayBuffer()));
const sparseXml = beforeCodeHelpXml(entryXml(sparseEntries, "word/document.xml"));
const sparseContent = documentText(sparseXml);
assert.ok(sparseContent.includes(sparseObservation.description));
assertCodeCells(sparseXml, ["Nicht erfasst", "Nicht erfasst", "Nicht erfasst"]);
assert.doesNotMatch(sparseContent, /Direkt beobachtet|weiter validieren|fehlende Information|Offene Frage:|Grenzen der Beobachtung:|Nächster Schritt:|Relevanzbegründung:/,
  "Fehlende Einordnung, Unsicherheit und Folgeschritte dürfen nicht ergänzt werden");
for (const [format, content] of await appointmentContents(sparseAppointment)) {
  const normalized = normalizedText(content);
  [...codeLabels, ...observationMetaLabels].forEach((label) => assert.ok(normalized.includes(label), `${format}: Auch das leere Feld ${label} bleibt sichtbar`));
  assert.equal(normalized.split("Nicht erfasst").length - 1, 4, `${format}: Vier leere Codes werden als nicht erfasst gekennzeichnet`);
  assert.doesNotMatch(content, /Nicht bewertet|0\s*\/\s*5/,
    `${format}: Eine fehlende Relevanz zeigt keinen erläuternden Text und keine Nullbewertung`);
  assert.doesNotMatch(content, /Nächste Nutzung|Nicht festgelegt/,
    `${format}: Auch ohne gespeicherten Nutzungswert erscheint kein zusätzliches Feld`);
  assert.doesNotMatch(content, /Noch offen/, `${format}: Die Sammelzeile für leere Codes entfällt`);
  assert.doesNotMatch(content, /(?:^|\n)\s*(?:Situation|Ergänzende Angaben|Auslöser|Handlungsschritte|Unmittelbare Folge|Workaround|Beteiligte Rollen)\s*:?\s*(?:\n|$)/,
    `${format}: Leere strukturierte Zusatzfelder erscheinen nicht als Überschriften`);
}

const emptyAppointment = { ...sparseAppointment, documentation: { observations: [] } };
for (const [format, content] of await appointmentContents(emptyAppointment, true)) {
  assertCodeHelp(format, content, "Noch keine Beobachtungen dokumentiert.");
  assert.doesNotMatch(beforeCodeHelp(content), /Prozessphase|Problemtyp|Auswirkung|Quelle|Nicht erfasst|Nicht bewertet|Nicht festgelegt/,
    `${format}: Beim leeren Termin werden keine Beobachtungen oder deren Codewerte erfunden`);
}

const legacyCodeNote = "* Bisherige Codierung; unverändert übernommen.";
const unknownCodeNote = "** Außerhalb des Codebuchs 1.1; unverändert übernommen.";
const codeCases = [
  ...["processPhase", "problemType", "impact"].flatMap((key) => expectedAppointmentCodebook[key]
    .map((entry) => ({ key, input: typeof entry === "string" ? entry : entry.value, expected: codeHelpLabel(entry) }))),
  ...expectedAppointmentCodebook.problemType.filter((entry) => entry.value !== entry.label)
    .map((entry) => ({ key: "problemType", input: entry.label, expected: entry.label })),
  ...expectedAppointmentCodebook.evidenceType.map((entry) => ({ key: "evidenceType", input: entry.label, expected: entry.label })),
  { key: "processPhase", input: "Anmeldung / Aufnahme", expected: "Anmeldung / Aufnahme*" },
  { key: "problemType", input: "fehlende Information", expected: "fehlende Information*" },
  { key: "problemType", input: "doppelte Dokumentation", expected: "doppelte Dokumentation*" },
  { key: "impact", input: "Arbeitsfluss wird unterbrochen", expected: "Arbeitsfluss wird unterbrochen*" },
  { key: "processPhase", input: "dokumentation", expected: "dokumentation**" },
  { key: "problemType", input: "statusunklarheit", expected: "statusunklarheit**" },
  { key: "impact", input: "mehraufwand", expected: "mehraufwand**" },
  { key: "evidenceType", input: "Lokale Quellenangabe", expected: "Lokale Quellenangabe**" },
  { key: "evidenceType", input: "", expected: "Nicht erfasst" }
];
const codeCaseAppointment = {
  ...sparseAppointment,
  documentation: { observations: codeCases.map(({ key, input }, index) => ({
    ...sparseObservation, title: `Codebuchprüfung ${String(index + 1).padStart(2, "0")}`, [key]: input
  })) }
};
const codeCaseSnapshot = { ...appointmentSnapshot, appointments: [codeCaseAppointment], hospitations: [codeCaseAppointment] };
const unchangedCodeCaseSnapshot = structuredClone(codeCaseSnapshot);
for (const [format, content] of await appointmentContents(codeCaseAppointment, true)) {
  const body = beforeCodeHelp(content);
  codeCases.forEach(({ key, expected }, index) => {
    const title = codeCaseAppointment.documentation.observations[index].title;
    const nextTitle = codeCaseAppointment.documentation.observations[index + 1]?.title;
    const block = normalizedText(body.slice(body.indexOf(title), nextTitle ? body.indexOf(nextTitle) : undefined));
    const label = key === "evidenceType" ? "Quelle:" : codeLabels[["processPhase", "problemType", "impact"].indexOf(key)];
    const expectedField = `${label} ${expected}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(block, new RegExp(`${expectedField}(?=\\s|$)`),
      `${format}: ${key} zeigt den dokumentierten Wert ohne Umdeutung als ${expected}`);
    if (!expected.endsWith("*")) assert.ok(!block.includes(`${expected}*`),
      `${format}: Ein aktueller oder leerer Code erhält keinen historischen Marker`);
  });
  const help = normalizedText(content.slice(content.indexOf("Codehilfe")));
  for (const note of [legacyCodeNote, unknownCodeNote]) {
    assert.equal(help.split(note).length - 1, 1, `${format}: Ein verwendeter Marker wird einmalig in der Legende erklärt`);
    assert.ok(!body.includes(note), `${format}: Markerhinweise wiederholen sich nicht bei jeder Beobachtung`);
  }
}
for (const [format, content] of await appointmentContents(sparseAppointment, true)) {
  assert.ok(!content.includes(legacyCodeNote) && !content.includes(unknownCodeNote),
    `${format}: Ohne historische oder eigene Werte entfallen beide Markerhinweise`);
}
const unknownOnlyAppointment = { ...sparseAppointment, documentation: { observations: [{
  ...sparseObservation, processPhase: "Eigene Prozessphase"
}] } };
for (const [format, content] of await appointmentContents(unknownOnlyAppointment, true)) {
  const normalized = normalizedText(content);
  assert.equal(normalized.split(unknownCodeNote).length - 1, 1,
    `${format}: Ein eigener Wert erhält genau einen passenden Hinweis`);
  assert.ok(!normalized.includes(legacyCodeNote), `${format}: Ein eigener Wert wird nicht als bekannter Altwert bezeichnet`);
}
for (const [format, content] of [["Word", appointmentFullContent], ["PDF", appointmentPdfFullContent]]) {
  const normalized = normalizedText(content);
  assert.equal(normalized.split(legacyCodeNote).length - 1, 1,
    `${format}: Mehrere historische Codierungen teilen sich einen einzigen erklärenden Hinweis`);
  assert.ok(!normalized.includes(unknownCodeNote), `${format}: Ausschließlich bekannte Altwerte erzeugen keinen Fremdwert-Hinweis`);
}

const loadedModel = globalThis.VersorgungsCompassHospitationModel;
const loadedModelCodebookBefore = structuredClone(loadedModel.codebook);
const compatibleModel = {
  ...loadedModel,
  codebookVersion: "1.1-erprobung",
  codebook: { ...loadedModel.codebook, ...structuredClone(expectedAppointmentCodebook) },
  optionLabel(key, value) {
    if (!expectedAppointmentCodebook[key]) return loadedModel.optionLabel(key, value);
    const entry = expectedAppointmentCodebook[key].find((item) => (typeof item === "string" ? item : item.value) === value);
    return entry ? codeHelpLabel(entry) : String(value ?? "");
  }
};
for (const [format, create] of [["Word", exporter.createAppointmentDocx], ["PDF", exporter.createAppointmentPdf]]) {
  const withOldModel = new Uint8Array(await create(codeCaseSnapshot).blob.arrayBuffer());
  try {
    globalThis.VersorgungsCompassHospitationModel = compatibleModel;
    const withNewModel = new Uint8Array(await create(codeCaseSnapshot).blob.arrayBuffer());
    assert.deepEqual(withNewModel, withOldModel,
      `${format}: Die bestätigte Exportfassung bleibt mit altem und neuem Editor-Katalog identisch`);
  } finally {
    globalThis.VersorgungsCompassHospitationModel = loadedModel;
  }
}
assert.deepEqual(loadedModel.codebook, loadedModelCodebookBefore,
  "Der Export verändert den noch separat geführten Editor-Katalog nicht");
assert.deepEqual(codeCaseSnapshot, unchangedCodeCaseSnapshot,
  "Anzeige-Aliasse und historische Marker schreiben weder Codes noch Quellenarten in den Eingabedaten um");

const sourceObservation = {
  ...sparseObservation,
  description: "Die Anmeldung nutzt das PVS. Genannte Systeme und Dokumente: Papierliste. Die Übergabe erfolgt per Telefon.",
  toolsAndDocuments: ["PVS", "PVS", "Papierliste", "Dienstplan", "Scanner"],
  communicationChannels: ["Telefon", "Fax", "Fax"],
  sourceType: "Feldnotiz",
  source: "Feldnotiz",
  sourceReference: "Synthetische Notiz B-02",
  evidenceType: "reported"
};
const sourceAppointment = { ...sparseAppointment, documentation: { observations: [sourceObservation] } };
const unchangedSourceAppointment = structuredClone(sourceAppointment);
for (const [format, content] of await appointmentContents(sourceAppointment)) {
  const normalized = normalizedText(content);
  assert.ok(normalized.includes(sourceObservation.description), `${format}: Die bestehende Beschreibung bleibt wörtlich erhalten`);
  for (const sentence of ["Genannte Systeme und Dokumente: Dienstplan, Scanner.", "Genannte Kommunikationskanäle: Fax."]) {
    assert.ok(normalized.includes(sentence), `${format}: Zusätzliche Angaben fließen ohne neue Kausalbehauptung in den Haupttext ein`);
    assert.ok(normalized.indexOf(sentence) < normalized.indexOf("Quellenbezug:"),
      `${format}: Systeme und Kommunikationskanäle stehen im Haupttext vor dem Quellenbezug`);
  }
  for (const value of ["PVS", "Papierliste", "Telefon", "Feldnotiz", sourceObservation.sourceReference]) {
    assert.equal(normalized.split(value).length - 1, 1, `${format}: Bereits vorhandene Angaben werden nicht doppelt ausgegeben: ${value}`);
  }
  assert.equal(normalized.split("Quellenbezug:").length - 1, 1, `${format}: Ein gemeinsamer Quellenbezug ersetzt mehrere separate Felder`);
  assert.ok(normalized.indexOf(sourceObservation.sourceReference) > normalized.indexOf("Quellenbezug:")
    && normalized.indexOf(sourceObservation.sourceReference) < normalized.indexOf("Einordnung und Codes"),
  `${format}: Der Quellenverweis folgt auf die Beschreibung und steht vor den Codes`);
  assert.ok(normalized.includes("Quelle: berichtet"), `${format}: Ein Quellenverweis verändert die dokumentierte Quellenart nicht`);
}
assert.deepEqual(sourceAppointment, unchangedSourceAppointment,
  "Die Zusammenführung und Quellen-Deduplizierung verändern keine gespeicherten Zusatzangaben");
for (const technicalSource of ["questionnaire", "manual", "import", "api", "demo"]) {
  const item = { ...sparseAppointment, documentation: { observations: [{
    ...sparseObservation, sourceType: technicalSource, source: technicalSource
  }] } };
  for (const [format, content] of await appointmentContents(item)) {
    assert.doesNotMatch(content, /Quellenbezug:/,
      `${format}: Der technische Herkunftswert ${technicalSource} erfindet keinen fachlichen Quellenverweis`);
    assert.ok(normalizedText(content).includes("Quelle: Nicht erfasst"),
      `${format}: Technische Herkunft darf keine fehlende Quellenart ersetzen`);
  }
}
const longSourceReference = Array.from({ length: 32 }, (_, index) => `Synthetischer Quellenabschnitt ${index + 1}`).join("; ");
const longSourceAppointment = { ...sparseAppointment, documentation: { observations: [{
  ...sparseObservation, sourceType: "manual", sourceReference: longSourceReference
}] } };
for (const [format, content] of await appointmentContents(longSourceAppointment)) {
  const normalized = normalizedText(content);
  assert.ok(normalized.includes(longSourceReference), `${format}: Auch ein langer Quellenverweis bleibt vollständig erhalten`);
  assert.ok(normalized.includes("Quelle: Nicht erfasst"), `${format}: Der Verweis ergänzt keine nicht dokumentierte Quellenart`);
}
const technicalReferenceAppointment = { ...sparseAppointment, documentation: { observations: [{
  ...sparseObservation, sourceType: "manual", sourceReference: "manual"
}] } };
for (const [format, content] of await appointmentContents(technicalReferenceAppointment)) {
  assert.ok(normalizedText(content).includes("Quellenbezug: manual"),
    `${format}: Ein expliziter Quellenverweis bleibt auch bei gleicher Schreibweise wie ein technischer Herkunftswert erhalten`);
}

const evidenceTypes = expectedAppointmentCodebook.evidenceType;
const ratingObservations = [1, 2, 3, 4, 5, undefined].map((rating, index) => ({
  ...sparseObservation,
  title: `Bewertungsbeispiel ${index + 1}`,
  observedAt: "09:07:59",
  relevanceScore: rating,
  evidenceType: evidenceTypes[index]?.value,
  usageRecommendation: index % 2 ? "intern nutzen" : "weiter validieren"
}));
const ratingAppointment = { ...sparseAppointment, documentation: { observations: ratingObservations } };
const ratingSnapshot = { ...appointmentSnapshot, appointments: [ratingAppointment], hospitations: [ratingAppointment] };
const ratingDocx = exporter.createAppointmentDocx(ratingSnapshot);
const ratingEntries = storedZipEntries(new Uint8Array(await ratingDocx.blob.arrayBuffer()));
const ratingXml = beforeCodeHelpXml(entryXml(ratingEntries, "word/document.xml"));
const ratingWordCells = wordCells(ratingXml);
const ratingCells = ratingWordCells
  .filter((cell) => normalizedText(cell.content).startsWith("Relevanz "));
assert.equal(ratingCells.length, ratingObservations.length,
  "Jede Beobachtung besitzt genau eine kompakte Relevanzanzeige im Überschriftsbereich");
ratingCells.forEach((cell, index) => {
  const score = ratingObservations[index].relevanceScore;
  assert.equal([...cell.content].filter((char) => char === "●").length, score || 0,
    "Die Anzahl gefüllter Punkte entspricht der dokumentierten Relevanz");
  assert.equal([...cell.content].filter((char) => char === "○").length, 5 - (score || 0),
    "Die fünfstufige Relevanzskala bleibt auch ohne Bewertung vollständig sichtbar");
  const alignment = /<w:jc\b[^>]*w:val="([^"]+)"/.exec(cell.xml)?.[1] || "left";
  assert.equal(alignment, "left", "Die kompakte Relevanzanzeige beginnt links in ihrer Zelle");
  assert.match(cell.xml, /<w:shd\b[^>]*w:fill="(?!FFFFFF)[0-9A-F]{6}"/i,
    "Die Relevanz besitzt eine getönte Labelfläche");
  assert.match(cell.xml, /<w:tcBorders>[\s\S]*w:val="single"/,
    "Das Relevanzlabel besitzt einen farbigen Rand");
  for (const run of [...cell.xml.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map((match) => match[0])
    .filter((run) => /[●○]/.test(documentText(run)))) {
    const color = /<w:color\b[^>]*w:val="([0-9A-F]{6})"/i.exec(run)?.[1] || "000000";
    const [red, green, blue] = color.match(/../g).map((component) => Number.parseInt(component, 16));
    assert.ok(blue > red + 60 && blue > green + 40,
      "Gefüllte und leere Relevanzpunkte sind deutlich blau hervorgehoben");
  }
  const remainder = ratingWordCells[ratingWordCells.indexOf(cell) + 1];
  assert.ok(remainder && normalizedText(remainder.content) === "" && !/<w:shd\b/.test(remainder.xml),
    "Nach dem kompakten Relevanzlabel bleibt eine ungefärbte leere Restzelle");
  assert.equal([...cell.xml.matchAll(/<w:p>/g)].length, 1,
    "Relevanzlabel, fünf Punkte und Wert stehen gemeinsam in genau einem Absatz");
  assert.doesNotMatch(cell.xml, /<w:br\b/,
    "Die kompakte Relevanzanzeige enthält keinen erzwungenen Zeilenumbruch");
  if (!score) assert.equal(normalizedText(cell.content).replace(/[●○\s]/g, ""), "Relevanz",
    "Ohne Bewertung zeigt das Label nur seine Beschriftung und fünf leere Punkte");
});
const evidenceCells = ratingWordCells
  .filter((cell) => normalizedText(cell.content).startsWith("Quelle:"));
const timeCells = ratingWordCells.filter((cell) => normalizedText(cell.content) === "09:07 Uhr");
assert.equal(timeCells.length, ratingObservations.length,
  "Word: Jede Beobachtung besitzt genau ein eigenes minutengenaues Uhrzeitlabel");
timeCells.forEach((cell, index) => {
  assert.match(cell.xml, /<w:shd\b[^>]*w:fill="(?!FFFFFF)[0-9A-F]{6}"/i,
    "Word: Die Uhrzeit hat eine eigene getönte Fläche");
  assert.match(cell.xml, /<w:tcBorders>[\s\S]*w:val="single"/,
    "Word: Das Uhrzeitlabel besitzt einen eigenen Rand");
  assert.doesNotMatch(cell.xml, /<w:br\b/,
    "Word: Die minutengenaue Uhrzeit bleibt in einer Zeile");
  const cellIndex = ratingWordCells.indexOf(cell);
  const gap = ratingWordCells[cellIndex + 1];
  assert.ok(gap && normalizedText(gap.content) === "", "Word: Zwischen Uhrzeit und Quelle liegt nur eine Abstandszelle");
  assert.match(gap.xml, /<w:tcW\b[^>]*w:w="240"/,
    "Word: Die Abstandszelle zwischen Uhrzeit und Quelle ist 12 pt breit");
  assert.equal(ratingWordCells[cellIndex + 2], evidenceCells[index],
    "Word: Die Quellenbox folgt rechts auf das Uhrzeitlabel");
});
const metadataRows = [...ratingXml.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)]
  .map((match) => match[0]).filter((row) => documentText(row).includes("09:07 Uhr"));
assert.equal(metadataRows.length, ratingObservations.length);
metadataRows.forEach((row) => {
  const content = normalizedText(documentText(row));
  assert.ok(content.indexOf("09:07 Uhr") < content.indexOf("Quelle:") && content.indexOf("Quelle:") < content.indexOf("Relevanz"),
    "Word: Uhrzeit, Quelle und Relevanz stehen gemeinsam von links nach rechts in einer Tabellenzeile");
});
assert.equal(evidenceCells.length, ratingObservations.length,
  "Jede Beobachtung besitzt genau ein eigenständiges Evidenzlabel");
evidenceCells.forEach((cell, index) => {
  assert.equal(normalizedText(cell.content), `Quelle: ${evidenceTypes[index]?.label || "Nicht erfasst"}`,
    "Auch lange und fehlende Quellenarten bleiben im Label vollständig lesbar");
  assert.match(cell.xml, /<w:shd\b[^>]*w:fill="(?!FFFFFF)[0-9A-F]{6}"/i,
    "Das Evidenzlabel besitzt eine getönte Fläche");
  assert.match(cell.xml, /<w:tcBorders>[\s\S]*w:val="single"/,
    "Das Evidenzlabel besitzt einen farbigen Rand");
  const cellIndex = ratingWordCells.indexOf(cell);
  const gap = ratingWordCells[cellIndex + 1];
  assert.ok(gap && normalizedText(gap.content) === "", "Zwischen Evidenzchip und Relevanz liegt nur eine Abstandszelle");
  assert.match(gap.xml, /<w:tcW\b[^>]*w:w="240"/,
    "Die Abstandszelle zwischen Evidenzchip und Relevanz ist 12 pt breit");
  assert.equal(ratingWordCells[cellIndex + 2], ratingCells[index],
    "Die Relevanz folgt unmittelbar auf den schmalen Abstand hinter dem Evidenzchip");
});
const ratingPdf = exporter.createAppointmentPdf(ratingSnapshot);
const ratingPdfSource = new TextDecoder("latin1").decode(new Uint8Array(await ratingPdf.blob.arrayBuffer()));
const ratingPdfTexts = pdfTextRuns(ratingPdfSource);
const pdfRelevanceLabels = ratingPdfTexts.filter((item) => item.text === "Relevanz");
assert.equal(pdfRelevanceLabels.length, ratingObservations.length, "PDF: Jede Beobachtung besitzt ein Relevanzlabel");
pdfRelevanceLabels.forEach((label, index) => {
  const score = ratingObservations[index].relevanceScore;
  const nextText = ratingPdfTexts[ratingPdfTexts.indexOf(label) + 1];
  assert.ok(nextText?.page === label.page, "PDF: Die Relevanzskala bleibt auf einer Seite zusammen");
  const dots = nextText.preceding.slice(label.preceding.length).split("\n")
    .filter((line) => /\bB\s*$/.test(line));
  assert.equal(dots.length, 5, "PDF: Jede Bewertung besitzt genau fünf Punkte, auch ohne gespeicherten Wert");
  const dotColors = dots.map((dot) => /([\d.]+ [\d.]+ [\d.]+) rg.*?([\d.]+ [\d.]+ [\d.]+) RG/.exec(dot));
  assert.ok(dotColors.every(Boolean), "PDF: Alle Relevanzpunkte besitzen eine Fläche und eine Kontur");
  assert.equal(dotColors.filter((color) => color[1] === color[2]).length, score || 0,
    "PDF: Nur die dokumentierte Anzahl von Punkten ist kräftig ausgefüllt");
  for (const color of dotColors) {
    const [red, green, blue] = color[2].split(" ").map(Number);
    assert.ok(blue > red + 0.2 && blue > green + 0.15,
      "PDF: Die Relevanzpunkte besitzen eine deutlich blaue Kontur");
  }
  if (!score) return;
  const expectedScore = `${score}/5`;
  const value = ratingPdfTexts.find((item) => item.page === label.page && item.text === expectedScore);
  assert.ok(value && value.x > label.x && Math.abs(value.y - label.y) < 0.01,
    "PDF: Relevanzlabel und Wert stehen nebeneinander auf derselben Textgrundlinie");
});
const pdfEvidenceLabels = ratingPdfTexts.filter((item) => item.text.startsWith("Quelle:"));
const pdfTimeLabels = ratingPdfTexts.filter((item) => item.text === "09:07 Uhr");
assert.equal(pdfTimeLabels.length, ratingObservations.length,
  "PDF: Jede Beobachtung besitzt genau ein minutengenaues Uhrzeitlabel");
pdfTimeLabels.forEach((time, index) => {
  const source = pdfEvidenceLabels[index];
  const relevance = pdfRelevanceLabels[index];
  assert.ok(source?.page === time.page && relevance?.page === time.page && time.x < source.x && source.x < relevance.x,
    "PDF: Uhrzeit, Quelle und Relevanz stehen gemeinsam von links nach rechts auf derselben Seite");
  assert.ok(Math.abs(time.y - source.y) < 1 && Math.abs(time.y - relevance.y) < 1,
    "PDF: Die drei einzeiligen Metadatenlabels stehen auf derselben Textgrundlinie");
  const shape = time.preceding.split("\n").reverse().find((line) => /\b(?:B|f)\s*$/.test(line)) || "";
  assert.match(shape, /\brg\b.*\bRG\b.*\bB\s*$/,
    "PDF: Das Uhrzeitlabel besitzt eine gefüllte und umrandete Fläche");
  const right = Math.max(...[...shape.matchAll(/([\d.-]+) ([\d.-]+) [ml]\b/g)].map((match) => Number(match[1])));
  const sourceShape = source.preceding.split("\n").reverse().find((line) => /\b(?:B|f)\s*$/.test(line)) || "";
  const sourceLeft = Math.min(...[...sourceShape.matchAll(/([\d.-]+) ([\d.-]+) [ml]\b/g)].map((match) => Number(match[1])));
  assert.ok(Number.isFinite(right) && Math.abs(sourceLeft - right - 12) < 0.02,
    "PDF: Die Quellenbox beginnt mit 12 pt Abstand rechts neben der Uhrzeitbox");
});
assert.equal(pdfEvidenceLabels.length, ratingObservations.length, "PDF: Jede Beobachtung besitzt ein vollständiges Evidenzlabel");
pdfEvidenceLabels.forEach((label, index) => {
  const value = ratingPdfTexts[ratingPdfTexts.indexOf(label) + 1];
  assert.ok(value && value.page === label.page && value.x > label.x,
    "PDF: Die Evidenzbezeichnung folgt unmittelbar auf ihr Label");
  assert.equal(`${label.text} ${value.text}`, `Quelle: ${evidenceTypes[index]?.label || "Nicht erfasst"}`,
    "PDF: Alle Quellenarten bleiben im farbigen Label vollständig lesbar");
  const shape = label.preceding.split("\n").reverse().find((line) => /\b(?:B|f)\s*$/.test(line)) || "";
  assert.match(shape, /\brg\b.*\bRG\b.*\bB\s*$/,
    "PDF: Das Evidenzlabel erhält eine gefüllte und umrandete Fläche");
  const points = [...shape.matchAll(/([\d.-]+) ([\d.-]+) [ml]\b/g)].map((match) => [Number(match[1]), Number(match[2])]);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  assert.ok(points.length >= 4 && [label, value].every((item) => item.x >= Math.min(...xs) && item.x <= Math.max(...xs)
    && item.y >= Math.min(...ys) && item.y <= Math.max(...ys)),
  "PDF: Die getönte Fläche liegt tatsächlich hinter dem Evidenztext");
  const relevance = pdfRelevanceLabels[index];
  const relevanceShape = relevance.preceding.split("\n").reverse().find((line) => /\b(?:B|f)\s*$/.test(line)) || "";
  assert.match(relevanceShape, /\brg\b.*\bRG\b.*\bB\s*$/,
    "PDF: Das Relevanzlabel besitzt eine gefüllte und umrandete Fläche");
  const relevancePoints = [...relevanceShape.matchAll(/([\d.-]+) ([\d.-]+) [ml]\b/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  const relevanceLeft = Math.min(...relevancePoints.map(([x]) => x));
  assert.ok(relevance.page === label.page && Math.abs(relevanceLeft - Math.max(...xs) - 12) < 0.02,
    "PDF: Die Relevanzfläche beginnt 12 pt hinter der rechten Kante des Evidenzchips");
  assert.ok(Math.abs(relevance.x - relevanceLeft - 8) < 0.02,
    "PDF: Der Relevanztext beginnt mit 8 pt Innenabstand in seiner Fläche");
});
for (const [format, content] of await appointmentContents(ratingAppointment)) {
  ratingObservations.forEach((observation, index) => {
    const nextTitle = ratingObservations[index + 1]?.title;
    const block = normalizedText(content.slice(content.indexOf(observation.title), nextTitle ? content.indexOf(nextTitle) : undefined));
    assert.ok(block.includes("Relevanz"), `${format}: Die Relevanz ist durch ihre Beschriftung erkennbar`);
    assert.doesNotMatch(block, /Nicht bewertet|0\s*\/\s*5/,
      `${format}: Das Label enthält keinen fehlenden Bewertungstext und keine Nullbewertung`);
    if (observation.relevanceScore) assert.ok(block.includes(`${observation.relevanceScore}/5`),
      `${format}: Eine vorhandene Bewertung behält ihren Zahlenwert`);
    assert.ok(block.indexOf("Relevanz") < block.indexOf(observation.description),
      `${format}: Die Bewertung steht bei der Überschrift und nicht unter der Codierung`);
    assert.ok(block.includes(`Quelle: ${evidenceTypes[index]?.label || "Nicht erfasst"}`),
      `${format}: Die dokumentierte Quelle bleibt als Text erhalten`);
    assert.ok(!block.includes(observation.usageRecommendation) && !block.includes("Nächste Nutzung"),
      `${format}: Gespeicherte Nutzungswerte erscheinen nicht mehr im Einzeltermin`);
  });
}

const longEvidence = "Ausführliche lokale Quellenbezeichnung mit mehreren zusätzlichen Angaben zum dokumentierten Beobachtungszusammenhang";
const longEvidenceObservation = { ...sparseObservation, title: "Zeit neben längerer Quellenangabe",
  observedAt: "14:38:59", evidenceType: longEvidence, relevanceScore: 5 };
const longEvidenceAppointment = { ...sparseAppointment, documentation: { observations: [longEvidenceObservation] } };
const longEvidenceSnapshot = { ...appointmentSnapshot, appointments: [longEvidenceAppointment], hospitations: [longEvidenceAppointment] };
const longEvidenceDocx = exporter.createAppointmentDocx(longEvidenceSnapshot);
const longEvidenceXml = beforeCodeHelpXml(entryXml(storedZipEntries(new Uint8Array(await longEvidenceDocx.blob.arrayBuffer())), "word/document.xml"));
const longEvidenceRows = [...longEvidenceXml.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)]
  .map((match) => match[0]).filter((row) => documentText(row).includes("14:38 Uhr"));
assert.equal(longEvidenceRows.length, 1, "Word: Auch neben einer langen Quelle steht die Uhrzeit in genau einer Metadatenzeile");
assert.ok(normalizedText(documentText(longEvidenceRows[0])).includes(`14:38 Uhr Quelle: ${longEvidence}** Relevanz`),
  "Word: Eine lange Quellenangabe bleibt vollständig zwischen Uhrzeit und Relevanz in derselben Zeile von Zellen");
const longEvidencePdf = exporter.createAppointmentPdf(longEvidenceSnapshot);
const longEvidencePdfSource = new TextDecoder("latin1").decode(new Uint8Array(await longEvidencePdf.blob.arrayBuffer()));
const longEvidenceRuns = pdfTextRuns(longEvidencePdfSource);
const longEvidenceTime = longEvidenceRuns.find((run) => run.text === "14:38 Uhr");
const longEvidenceSource = longEvidenceRuns.find((run) => run.text === "Quelle:");
const longEvidenceRelevance = longEvidenceRuns.find((run) => run.text === "Relevanz");
const longEvidenceBody = longEvidenceRuns.find((run) => run.text.includes("Die Übergabe beginnt"));
assert.ok(longEvidenceTime && longEvidenceSource && longEvidenceRelevance && longEvidenceBody);
assert.ok([longEvidenceSource, longEvidenceRelevance, longEvidenceBody].every((run) => run.page === longEvidenceTime.page)
  && longEvidenceTime.x < longEvidenceSource.x && longEvidenceSource.x < longEvidenceRelevance.x,
"PDF: Trotz umgebrochener Quelle bleiben Uhrzeit und Relevanz daneben und die Beschreibung auf derselben Seite");
const sourceStart = longEvidenceRuns.indexOf(longEvidenceSource);
const sourceEnd = longEvidenceRuns.indexOf(longEvidenceRelevance);
const wrappedSourceRuns = longEvidenceRuns.slice(sourceStart + 1, sourceEnd);
assert.ok(wrappedSourceRuns.length > 1, "PDF: Die lange Quellenangabe wird innerhalb ihrer schmaleren Box umgebrochen");
assert.equal(normalizedText(wrappedSourceRuns.map((run) => run.text).join(" ")), `${longEvidence}**`,
  "PDF: Die lange Quellenbezeichnung bleibt einschließlich ihres Codebuchhinweismarkers vollständig");
assert.ok([longEvidenceTime, longEvidenceSource, longEvidenceRelevance, ...wrappedSourceRuns]
  .every((run) => run.y > longEvidenceBody.y),
"PDF: Der umgebrochene Metadatenbereich überlappt nicht mit der folgenden Beobachtungsbeschreibung");
for (const label of [longEvidenceTime, longEvidenceSource, longEvidenceRelevance]) {
  const shape = label.preceding.split("\n").reverse().find((line) => /\b(?:B|f)\s*$/.test(line)) || "";
  const bounds = [...shape.matchAll(/([\d.-]+) ([\d.-]+) [ml]\b/g)].map((match) => [Number(match[1]), Number(match[2])]);
  assert.ok(bounds.length >= 4 && Math.max(...bounds.map(([x]) => x)) <= 559.3,
    "PDF: Auch bei langer Quellenangabe bleibt jede Metadatenbox innerhalb des rechten Inhaltsrands");
}

const multiPageAppointment = {
  ...sparseAppointment,
  contactImage: undefined,
  documentation: { observations: Array.from({ length: 14 }, (_, index) => ({
    ...sparseObservation, title: `Synthetische Beobachtung ${index + 1}`
  })) }
};
const multiPagePdf = exporter.createAppointmentPdf({
  ...appointmentSnapshot, appointments: [multiPageAppointment], hospitations: [multiPageAppointment]
});
const multiPagePdfSource = new TextDecoder("latin1").decode(new Uint8Array(await multiPagePdf.blob.arrayBuffer()));
assert.ok(assertPdfBrandOnEveryPage(multiPagePdfSource) > 1,
  "Das Markenlogo wird auch ohne Kontaktfoto über mehrere PDF-Seiten geprüft");
const multiPageContents = pdfPageContents(multiPagePdfSource)
  .map(({ content }) => pdfDocumentText(new TextEncoder().encode(content)));
const helpPageIndex = multiPageContents.findIndex((content) => content.includes("Codehilfe"));
assert.ok(helpPageIndex > 0, "Nach mehreren regulären Beobachtungen folgt die Codehilfe auf einer späteren Seite");
const helpPage = multiPageContents[helpPageIndex];
assert.equal(helpPageIndex, multiPageContents.length - 1, "Die vollständige Codehilfe steht auf der letzten Dokumentseite");
if (!/Synthetische Beobachtung|Die Übergabe beginnt mit einer offenen Rückfrage/.test(helpPage)) {
  assert.doesNotMatch(helpPage, /\d+\s*[·|]\s*Fortsetzung/,
    "Eine reine Codehilfe-Seite trägt keine falsche Fortsetzungskennzeichnung der letzten Beobachtung");
}
assertCodeHelp("Mehrseitiges PDF", multiPageContents.join("\n"), multiPageAppointment.documentation.observations.at(-1).title);
const codebook = expectedAppointmentCodebook;
for (const key of ["processPhase", "problemType", "impact", "evidenceType"]) {
  for (const entry of codebook[key]) {
    assert.ok(normalizedText(helpPage).includes(codeHelpLabel(entry)),
      "Die komplette Codehilfe bleibt auf derselben Abschlussseite zusammen");
  }
}

const longFirstCodeToken = "W".repeat(180);
const longCodeAppointment = {
  ...sparseAppointment,
  documentation: { observations: [{ ...sparseObservation, problemType: longFirstCodeToken }] }
};
const longCodePdf = exporter.createAppointmentPdf({
  ...appointmentSnapshot, appointments: [longCodeAppointment], hospitations: [longCodeAppointment]
});
const longCodeRuns = pdfDocumentText(new Uint8Array(await longCodePdf.blob.arrayBuffer()))
  .split("\n").filter((run) => /^W+\*{0,2}$/.test(run)).map((run) => run.replace(/\*+$/, ""));
assert.equal(longCodeRuns.join(""), longFirstCodeToken,
  "Auch ein überlanges erstes Wort bleibt im PDF-Codewert vollständig erhalten");
// Helvetica-Bold gives W a width of 944/1000 em; use the actual font advance.
assert.ok(longCodeRuns.length > 1 && longCodeRuns.every((run) => run.length * 8.5 * 0.944 <= 147.09),
  "Ein ungetrennter Codewert wird in kurze Teilstücke für die schmale Codekarte umbrochen");

const duplicateSteps = ["Die MFA prüft den Eingang.", "Die Praxis bestätigt den Termin."];
const duplicateAppointment = {
  ...sparseAppointment,
  documentation: { observations: [{
    ...sparseObservation,
    description: `${duplicateSteps[0]}\r\n\n  ${duplicateSteps[1]}`,
    actions: [`  ${duplicateSteps[0]} `, `\t${duplicateSteps[1]}  `],
    situation: "Am Empfang vor Beginn der Sprechstunde.",
    trigger: "Die telefonische Anmeldung geht ein.",
    immediateConsequence: "Der Termin ist verbindlich bestätigt.",
    workaround: "Die Rückrufnummer steht auf einem Notizzettel.",
    involvedRoles: ["MFA", "Praxisassistenz"]
  }] }
};
for (const [format, content] of await appointmentContents(duplicateAppointment)) {
  const normalized = normalizedText(content);
  for (const step of duplicateSteps) {
    assert.equal(normalized.split(step).length - 1, 1,
      `${format}: Gleiche Beschreibung und Handlungsschritte werden trotz abweichendem Whitespace nur einmal ausgegeben`);
  }
  for (const value of [duplicateAppointment.documentation.observations[0].situation,
    duplicateAppointment.documentation.observations[0].trigger,
    duplicateAppointment.documentation.observations[0].immediateConsequence,
    duplicateAppointment.documentation.observations[0].workaround, "MFA", "Praxisassistenz"]) {
    assert.ok(normalized.includes(value), `${format}: Eigenständige Zusatzinformation fehlt: ${value}`);
  }
  assert.ok(normalized.indexOf(duplicateAppointment.documentation.observations[0].situation) < normalized.indexOf(duplicateSteps[0]),
    `${format}: Die Situation leitet den gemeinsamen Haupttext ein`);
  assert.doesNotMatch(content, /Situation \/ Kontext|Kontext:|Anlass:|Behelfslösung:|Situation:|Konkrete Beobachtung|Ergänzende Angaben|Auslöser:|Handlungsschritte|Unmittelbare Folge:|Workaround:|Beteiligte Rollen:|Weitere Schritte/,
    `${format}: Auch gespeicherte Zusatzangaben erhalten keine separaten Labels mehr`);
}

const additionalSteps = ["Die MFA ergänzt die Rückrufliste.", "Das Team prüft den Eingang am Nachmittag."];
const additionalAppointment = {
  ...sparseAppointment,
  documentation: { observations: [{ ...sparseObservation, actions: additionalSteps }] }
};
for (const [format, content] of await appointmentContents(additionalAppointment)) {
  const normalized = normalizedText(content);
  assert.ok(normalized.includes(sparseObservation.description), `${format}: Der Freitext bleibt erhalten`);
  assert.doesNotMatch(normalized, /Ergänzende Angaben|Handlungsschritte:/, `${format}: Eigenständige Schritte sind Teil des Haupttexts`);
  additionalSteps.forEach((step) => assert.ok(normalized.includes(step), `${format}: Zusätzlicher Schritt fehlt: ${step}`));
}

const repeatedSituation = "Die Aufnahme beginnt am Empfang.";
const repeatedAction = "Die MFA prüft den Befund.";
const distinctAction = "Die MFA legt einen Rückruf an.";
const mixedObservation = {
  ...sparseObservation,
  title: "Zusammengeführte Angaben ohne Informationsverlust",
  situation: repeatedSituation,
  trigger: `  ${repeatedSituation}  `,
  description: `${repeatedSituation}\n\n${repeatedAction} Danach ruft sie die Praxis an.`,
  actions: [repeatedAction, distinctAction, distinctAction, "Befund"],
  immediateConsequence: distinctAction,
  workaround: "Befund liegt vor.",
  involvedRoles: ["MFA", "Praxisassistenz"],
  usageRecommendation: "Nur gespeicherte Nutzungsplanung",
  nextUse: "Ältere gespeicherte Nutzungsplanung"
};
const mixedAppointment = { ...sparseAppointment, documentation: { observations: [mixedObservation] } };
const mixedSnapshot = { ...appointmentSnapshot, appointments: [mixedAppointment], hospitations: [mixedAppointment] };
const unchangedMixedSnapshot = structuredClone(mixedSnapshot);
for (const [format, content] of await appointmentContents(mixedAppointment)) {
  const normalized = normalizedText(content);
  for (const sentence of [repeatedSituation, repeatedAction, distinctAction]) {
    assert.equal(normalized.split(sentence).length - 1, 1,
      `${format}: Vollständig identische Sätze werden gegenüber Beschreibung und bereits ergänztem Text nur einmal ausgegeben`);
  }
  assert.equal(normalized.split("Befund.").length - 1, 2,
    `${format}: Ein eigenständiges Fragment bleibt erhalten, auch wenn es als Teil eines anderen Satzes vorkommt`);
  for (const value of ["Danach ruft sie die Praxis an.", mixedObservation.workaround, "Praxisassistenz"]) {
    assert.ok(normalized.includes(value), `${format}: Eine eigenständige Information bleibt im Haupttext erhalten: ${value}`);
  }
  for (const value of [mixedObservation.usageRecommendation, mixedObservation.nextUse, "Nächste Nutzung"]) {
    assert.ok(!normalized.includes(value), `${format}: Nutzungsfelder bleiben ausschließlich im Datenbestand: ${value}`);
  }
}
for (const [format, create] of [["Word", exporter.createAppointmentDocx], ["PDF", exporter.createAppointmentPdf]]) {
  const first = new Uint8Array(await create(mixedSnapshot).blob.arrayBuffer());
  const second = new Uint8Array(await create(mixedSnapshot).blob.arrayBuffer());
  assert.deepEqual(second, first, `${format}: Ein wiederholter Export desselben Snapshots ist unverändert`);
}
assert.deepEqual(mixedSnapshot, unchangedMixedSnapshot,
  "Das Zusammenführen der Exporttexte verändert weder gespeicherte Felder noch den Eingabe-Snapshot");

const legacyObservation = {
  title: "Vorhandene ältere Dokumentation",
  situationContext: "Die Anmeldung erfolgt telefonisch.",
  observed: "Ein Rückruf ist erforderlich.",
  actionSteps: ["Die Rückrufnummer wird notiert."],
  currentWorkaround: "Eine separate Telefonliste bleibt am Empfang.",
  affectedRoles: ["Praxisassistenz"],
  careRelevance: 3,
  nextUse: "Im nächsten Teamgespräch prüfen"
};
const legacyAppointment = { ...sparseAppointment, documentation: { observations: [legacyObservation] } };
for (const [format, content] of await appointmentContents(legacyAppointment)) {
  const normalized = normalizedText(content);
  for (const value of [legacyObservation.situationContext, legacyObservation.observed,
    ...legacyObservation.actionSteps, legacyObservation.currentWorkaround, ...legacyObservation.affectedRoles,
    "3/5"]) {
    assert.ok(normalized.includes(value), `${format}: Auch ein vorhandener älterer Feldname bleibt vollständig exportierbar: ${value}`);
  }
  assert.ok(!normalized.includes(legacyObservation.nextUse) && !normalized.includes("Nächste Nutzung"),
    `${format}: Auch der ältere Alias nextUse erscheint nicht mehr im Einzeltermin`);
}

const descriptionLines = ["Die Aufnahme beginnt.", "Die Mitarbeiterin prüft den Befund.", "Eine Rückfrage folgt.", "Die Übergabe ist abgeschlossen."];
const multilineAppointment = {
  ...sparseAppointment,
  documentation: { observations: [{
    ...sparseObservation,
    description: `${descriptionLines[0]}\r\n${descriptionLines[1]}\r${descriptionLines[2]}\n\n${descriptionLines[3]}`
  }] }
};
const multilineDocx = exporter.createAppointmentDocx({
  ...appointmentSnapshot, appointments: [multilineAppointment], hospitations: [multilineAppointment]
});
const multilineEntries = storedZipEntries(new Uint8Array(await multilineDocx.blob.arrayBuffer()));
const multilineXml = entryXml(multilineEntries, "word/document.xml");
const multilineParagraphs = [...multilineXml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map((match) => match[0]);
const descriptionParagraph = multilineParagraphs.find((paragraph) => paragraph.includes(descriptionLines[0]));
assert.ok(descriptionParagraph, "Der mehrzeilige Befund ist im Dokument enthalten");
descriptionLines.slice(0, 3).forEach((line, index) => {
  assert.ok(documentText(descriptionParagraph).includes(line), `Befundzeile fehlt: ${line}`);
  if (!index) return;
  const between = descriptionParagraph.slice(descriptionParagraph.indexOf(descriptionLines[index - 1]), descriptionParagraph.indexOf(line));
  assert.equal([...between.matchAll(/<w:br\s*\/>/g)].length, 1,
    "Einzelne eingegebene Zeilenumbrüche bleiben innerhalb desselben Absatzes erhalten");
});
const lastDescriptionParagraph = multilineParagraphs.find((paragraph) => paragraph.includes(descriptionLines[3]));
assert.ok(lastDescriptionParagraph && multilineParagraphs.indexOf(lastDescriptionParagraph) > multilineParagraphs.indexOf(descriptionParagraph),
  "Eine eingegebene Leerzeile trennt den nachfolgenden Text in einen eigenen Word-Absatz");
assert.ok(!descriptionParagraph.includes(descriptionLines[3]),
  "Die Zeile nach einer Leerzeile gehört nicht mehr zum vorausgehenden Absatz");
const multilineContent = documentText(multilineXml);
descriptionLines.forEach((line, index) => {
  assert.equal(multilineContent.split(line).length - 1, 1, `Die Beschreibung enthält jede Zeile vollständig genau einmal: ${line}`);
  if (index) assert.ok(multilineContent.indexOf(line) > multilineContent.indexOf(descriptionLines[index - 1]),
    "Auch über Absatzgrenzen bleibt die ursprüngliche Reihenfolge erhalten");
});

const longNarrativeLines = Array.from({ length: 80 }, (_, index) =>
  `Schritt ${index + 1}: Eine Mitarbeiterin klärt den Befund und dokumentiert die weitere Übergabe an die zuständige Einrichtung, damit das Team die nächsten Schritte abstimmen kann.`);
const longNarrativeObservation = { ...sparseObservation, title: "Langer Ablauf mit vollständiger Dokumentation",
  description: longNarrativeLines.join("\n") };
const longNarrativeAppointment = { ...sparseAppointment, documentation: { observations: [longNarrativeObservation] } };
const longNarrativeSnapshot = { ...appointmentSnapshot, appointments: [longNarrativeAppointment], hospitations: [longNarrativeAppointment] };
const longNarrativeDocx = exporter.createAppointmentDocx(longNarrativeSnapshot);
const longNarrativeEntries = storedZipEntries(new Uint8Array(await longNarrativeDocx.blob.arrayBuffer()));
const longNarrativeXml = entryXml(longNarrativeEntries, "word/document.xml");
const beforeLongNarrative = longNarrativeXml.slice(0, longNarrativeXml.indexOf(longNarrativeLines[0]));
assert.equal([...beforeLongNarrative.matchAll(/<w:tbl>/g)].length, [...beforeLongNarrative.matchAll(/<\/w:tbl>/g)].length,
  "Eine lange Beobachtung bleibt außerhalb einer unteilbaren Gesamttabelle frei umbrechbar");
const longNarrativePdf = exporter.createAppointmentPdf(longNarrativeSnapshot);
const longNarrativePdfText = normalizedText(pdfDocumentText(new Uint8Array(await longNarrativePdf.blob.arrayBuffer()))
  .split("\n").filter((line) => !/^(?:gematik \| Stabsstelle Versorgung|Hospitations-Framework \||Seite \d+$|\d+ · Fortsetzung$)/.test(line)).join("\n"));
for (const line of longNarrativeLines) {
  assert.ok(longNarrativePdfText.includes(line),
    "Normale Wörter bleiben auch bei langen Abläufen und Seitenumbrüchen ungetrennt und vollständig erhalten");
}

const sequencedAppointment = {
  ...dateOnlyAppointment,
  documentation: {
    observations: dateOnlyAppointment.documentation.observations.map((observation, index) => ({
      ...observation, sequence: 2 - index
    }))
  }
};
const sequencedDocx = exporter.createAppointmentDocx({
  ...appointmentSnapshot,
  appointments: [sequencedAppointment],
  hospitations: [sequencedAppointment]
});
const sequencedEntries = storedZipEntries(new Uint8Array(await sequencedDocx.blob.arrayBuffer()));
const sequencedContent = documentText(entryXml(sequencedEntries, "word/document.xml"));
assert.ok(sequencedContent.indexOf("Checkliste stabilisiert den Ablauf") < sequencedContent.indexOf("Vorbefund fehlt bei der Aufnahme"),
  "Eine dokumentierte Reihenfolge bestimmt die Sortierung der Beobachtungen");
assert.ok(normalizedText(sequencedContent).includes("01 Checkliste stabilisiert den Ablauf")
  && normalizedText(sequencedContent).includes("02 Vorbefund fehlt bei der Aufnahme"),
  "Auch nach Sortierung bleiben die Überschriften fortlaufend nummeriert");

// Regressionen des aktuellen main: gemeinsamer Freitext, Codebuch und Herkunftsschutz.
const model = globalThis.VersorgungsCompassHospitationModel;
assert.equal(typeof model.observationText, "function", "Der gemeinsame Beobachtungstext fehlt im Modell");
assert.equal(model.codebookVersion, "1.1-erprobung", "Der Export benötigt das aktuelle Codebuch");
assert.equal(typeof model.isLegacyCodebookValue, "function", "Die Altwertkennzeichnung fehlt im Modell");

const longObservation = Array.from({ length: 48 }, (_, index) =>
  `Prüfschritt ${String(index + 1).padStart(2, "0")}: Die Mitarbeiterin prüft den Eintrag und dokumentiert den nächsten Arbeitsschritt.`
).join("\n\n");
const observationTextCases = [
  {
    name: "Altbestand",
    input: { situation: "Kontext Altbestand am Empfang.", description: "Die MFA öffnet den alten Prüfauftrag." },
    expected: "Kontext Altbestand am Empfang.\n\nDie MFA öffnet den alten Prüfauftrag."
  },
  {
    name: "Neuer gemeinsamer Text",
    input: { situation: "", situationContext: "", description: "Kontext des neuen Eintrags.\n\nDie MFA ergänzt die neue Notiz." },
    expected: "Kontext des neuen Eintrags.\n\nDie MFA ergänzt die neue Notiz."
  },
  {
    name: "Identische Texte",
    input: { situation: "Identischer Text bleibt einmal sichtbar.", description: "Identischer Text bleibt einmal sichtbar." },
    expected: "Identischer Text bleibt einmal sichtbar."
  },
  {
    name: "Kontext bereits vorangestellt",
    input: { situation: "Kontext ist bereits enthalten.", description: "Kontext ist bereits enthalten.\n\nDie MFA bestätigt den enthaltenen Kontext." },
    expected: "Kontext ist bereits enthalten.\n\nDie MFA bestätigt den enthaltenen Kontext."
  },
  {
    name: "Historische Aliasfelder",
    input: { situation: " ", situation_context: "Alias-Kontext wird erhalten.", description: " \n ", observed: "Der historische Ablauf bleibt lesbar." },
    expected: "Alias-Kontext wird erhalten.\n\nDer historische Ablauf bleibt lesbar."
  },
  {
    name: "Nur Kontext",
    input: { situationContext: "Der allein vorhandene Kontext bleibt erhalten." },
    expected: "Der allein vorhandene Kontext bleibt erhalten."
  },
  {
    name: "Nur Beobachtung",
    input: { observation: "Die allein vorhandene Beobachtung bleibt erhalten." },
    expected: "Die allein vorhandene Beobachtung bleibt erhalten."
  },
  {
    name: "Fehlende Texte",
    input: {},
    expected: ""
  },
  {
    name: "Kein Abgleich innerhalb eines Wortes",
    input: { situation: "Morgen", description: "Morgenbesprechung mit dem Pflegeteam." },
    expected: "Morgen\n\nMorgenbesprechung mit dem Pflegeteam."
  },
  {
    name: "Kein Abgleich mitten im Text",
    input: { situation: "am Einzelplatz", description: "Die Kollegin arbeitet am Einzelplatz und meldet sich ab." },
    expected: "am Einzelplatz\n\nDie Kollegin arbeitet am Einzelplatz und meldet sich ab."
  },
  {
    name: "Lange Beobachtung",
    input: { situation: "Ein langer Ablauf wird vollständig dokumentiert.", description: longObservation },
    expected: `Ein langer Ablauf wird vollständig dokumentiert.\n\n${longObservation}`
  }
];
for (const testCase of observationTextCases) {
  const input = Object.freeze({ ...testCase.input });
  assert.equal(model.observationText(input), testCase.expected, testCase.name);
  assert.equal(model.observationText(model.normalizeObservation(input)), testCase.expected, `${testCase.name}: Normalisierung muss alle Textinhalte erhalten`);
  assert.deepEqual(input, testCase.input, `${testCase.name}: Der Lesehelper darf keine Felder verändern`);
}
assert.equal(model.observationText(null), "", "Ein fehlendes Beobachtungsobjekt bleibt leer");
assert.equal(model.observationText({ situation: "Erste Zeile.\r\nZweite Zeile.", description: "Erste Zeile.\nZweite Zeile.\n\nAblauf." }), "Erste Zeile.\nZweite Zeile.\n\nAblauf.");
assert.equal(model.observationText({ situation: "Vor der Übergabe.", description: "Vor der Übergabe. Die MFA druckt den Plan." }), "Vor der Übergabe. Die MFA druckt den Plan.");
const unchangedLegacy = model.normalizeObservation(observationTextCases[0].input);
assert.equal(unchangedLegacy.situation, observationTextCases[0].input.situation, "Normalisierung darf den Kontext nicht migrieren");
assert.equal(unchangedLegacy.description, observationTextCases[0].input.description, "Normalisierung darf die getrennte Beschreibung nicht umschreiben");

function docxDocumentXml(bytes) {
  const xml = new TextDecoder().decode(bytes).match(/<w:document\b[\s\S]*?<\/w:document>/)?.[0];
  assert.ok(xml, "DOCX-Hauptdokument fehlt");
  return xml;
}

function docxVisibleText(xml) {
  const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1].replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => entities[entity]))
    .join(" ");
}

function pdfBodyTextRuns(bytes) {
  const source = new TextDecoder("latin1").decode(bytes);
  return [...source.matchAll(/1 0 0 1 [\d.]+ (-?[\d.]+) Tm <([A-F0-9]+)> Tj/g)]
    .map((match) => ({
      y: Number(match[1]),
      text: new TextDecoder("windows-1252").decode(Buffer.from(match[2], "hex"))
    }))
    // A continuing Framework observation repeats its number above the body. That
    // navigational label is not part of the saved observation's narrative.
    .filter((run) => run.y <= 800 && !(run.y === 18 && /^(?:Hospitations-|Seite )/.test(run.text))
      && !/^\d+ · Fortsetzung$/.test(run.text));
}

const semanticAppointment = {
  ...fixture.hospitations[0],
  contactImage: null,
  roadmapAssessments: [],
  unmetNeeds: [],
  documentation: {
    observations: observationTextCases.map((testCase, index) => ({
      id: `observation-text-fixture-${index + 1}`,
      title: `Kurzfassung ${index + 1}: ${testCase.name}`,
      ...testCase.input
    }))
  }
};
const semanticSnapshot = { ...fixture, appointments: [semanticAppointment], hospitations: [semanticAppointment] };
const semanticExports = [];
for (const documentKind of ["appointments", "observations", "appointment"]) {
  const snapshot = { ...semanticSnapshot, documentKind };
  const semanticDocx = exporter.createDocx(snapshot);
  const semanticPdf = exporter.createPdf(snapshot);
  const docxBytes = new Uint8Array(await semanticDocx.blob.arrayBuffer());
  const pdfBytes = new Uint8Array(await semanticPdf.blob.arrayBuffer());
  const xml = docxDocumentXml(docxBytes);
  const pdfRuns = pdfBodyTextRuns(pdfBytes);
  const texts = { DOCX: docxVisibleText(xml), PDF: pdfRuns.map((run) => run.text).join(" ") };
  for (const [format, visibleText] of Object.entries(texts)) {
    assert.doesNotMatch(visibleText, /Situation\s*\/\s*Kontext|Konkrete Beobachtung/, `${documentKind}/${format}: Alte getrennte Feldlabels dürfen nicht erscheinen`);
    const normalizedText = visibleText.replace(/\s+/g, " ").trim();
    for (const [index, testCase] of observationTextCases.entries()) {
      assert.ok(normalizedText.includes(`Kurzfassung ${index + 1}: ${testCase.name}`), `${documentKind}/${format}: Kurzfassung fehlt`);
      if (!testCase.expected) continue;
      const expected = testCase.expected.replace(/\s+/g, " ").trim();
      assert.ok(normalizedText.includes(expected), `${documentKind}/${format}: ${testCase.name} fehlt oder ist nicht zusammenhängend`);
      if (["Identische Texte", "Kontext bereits vorangestellt"].includes(testCase.name)) {
        assert.equal(normalizedText.split(testCase.input.situation).length - 1, 1, `${documentKind}/${format}: Kontext wird doppelt ausgegeben`);
      }
    }
    if (documentKind !== "appointment") {
      assert.equal((visibleText.match(/Beobachtung:/g) || []).length, observationTextCases.filter((testCase) => testCase.expected).length, `${documentKind}/${format}: Pro befülltem Eintrag wird genau ein Beobachtungsfeld ausgegeben`);
    }
  }
  assert.match(xml, /Kontext Altbestand am Empfang\.<\/w:t>[\s\S]*?<\/w:p>[\s\S]*?<w:p>[\s\S]*?Die MFA öffnet den alten Prüfauftrag\./, `${documentKind}/DOCX: Kontext und Ablauf benötigen getrennte Absätze`);
  for (const run of pdfRuns) {
    assert.ok(run.y >= 30, `${documentKind}/PDF: Langer Beobachtungstext läuft unter den Seitenrand`);
  }
  semanticExports.push({ documentKind, docxBytes, pdfBytes });
}


for (const bytes of [docxBytes, observationDocxBytes, pdfBytes, observationPdfBytes]) {
  const content = bytes[0] === 80 ? docxVisibleText(docxDocumentXml(bytes)) : pdfBodyTextRuns(bytes).map((run) => run.text).join(" ");
  for (const label of ["Prozessphase", "Problemtyp", "Auswirkung", "Quelle", "Quellenbezug", "Konkrete Folge", "Spätere Bewertung", "Beobachtungsart", "Nächste Nutzung", "Relevanz"]) {
    assert.ok(content.includes(label), `Export enthält ${label} nicht`);
  }
  assert.match(content, /Notiz A-01/, "Quellenbezug muss auch im kompakten Export erhalten bleiben");
  assert.match(content, /Anmeldung \/ Aufnahme \(bisherige Codierung\)/, "Alte Phasencodes dürfen nicht umgedeutet werden");
  assert.match(content, /fehlende Information \(bisherige Codierung\)/, "Alte Problemtypen bleiben erkennbar");
  assert.doesNotMatch(content, /Evidenztyp|Evidenzart|Nutzungsempfehlung|Einordnung:/, "Alte Codefeldlabels dürfen nicht erscheinen");
  assert.ok(content.indexOf("Spätere Bewertung") > content.indexOf("Beobachtung:"), "Spätere Bewertung gehört hinter den Befund");
}


for (const [format, content] of [["Word-Gesamtübersicht", docxText], ["Word-Beobachtungsübersicht", observationDocxText]]) {
  const codingXml = content.match(/Codierung[\s\S]*?<w:tbl>[\s\S]*?<\/w:tbl>/)?.[0] || "";
  assert.equal((codingXml.match(/<w:tc>/g) || []).length, 3,
    `${format}: Die primäre Codierung behält drei nebeneinanderliegende Zellen`);
  for (const label of ["Prozessphase", "Problemtyp", "Auswirkung"]) assert.ok(codingXml.includes(label));
  assert.doesNotMatch(codingXml, /Beobachtungsart|Quelle|Einordnung|Nächste Nutzung|Relevanz/,
    `${format}: Herkunft und spätere Bewertung gehören weiterhin außerhalb der primären Codierung`);
}

const sourceCases = [
  ["source_bound", "Beobachtungsunterlage"],
  ["synthetic_source_based", "synthetisches Beispiel"],
  ["reported", "berichtet"],
  ["interpreted", "Annahme"],
  ["", "Noch nicht angegeben"]
];
const codingExports = [];
for (const documentKind of ["appointments", "observations", "appointment"]) {
  const observations = sourceCases.map(([evidenceType], index) => ({
    id: `codebook-fixture-${index + 1}`,
    title: `Kurzfassung ${index + 1}: Quelle und Codierung`,
    description: index === 1 ? `Der vollständige Ablauf bleibt erhalten.\n\n${longObservation}` : "Die MFA prüft, ob die Unterlage für den nächsten Schritt vorliegt.",
    processPhase: "Abklärung",
    problemType: "Information fehlt",
    impact: "Zusätzliche Arbeit",
    evidenceType
  }));
  const appointment = { ...semanticAppointment, documentation: { observations } };
  const snapshot = { ...semanticSnapshot, documentKind, appointments: [appointment], hospitations: [appointment] };
  const docxBytes = new Uint8Array(await exporter.createDocx(snapshot).blob.arrayBuffer());
  const pdfBytes = new Uint8Array(await exporter.createPdf(snapshot).blob.arrayBuffer());
  for (const [format, fullContent] of [["DOCX", docxVisibleText(docxDocumentXml(docxBytes))], ["PDF", pdfBodyTextRuns(pdfBytes).map((run) => run.text).join(" ")]]) {
    const content = documentKind === "appointment" ? beforeCodeHelp(fullContent) : fullContent;
    for (const [value, label] of sourceCases) {
      const expectedLabel = !value && documentKind === "appointment" ? "Nicht erfasst" : label;
      assert.ok(content.includes(expectedLabel), `${documentKind}/${format}: Quellenlabel ${expectedLabel} fehlt`);
    }
    assert.match(content, /Fehlende Information/, `${documentKind}/${format}: Anzeigename statt Speicherwert verwenden`);
    assert.doesNotMatch(content, /Information fehlt|source_bound|synthetic_source_based|bisherige Codierung/, `${documentKind}/${format}: Neue Werte benötigen aktuelle Anzeigenamen`);
    assert.doesNotMatch(content, /Spätere Bewertung|Beobachtungsart|Nächste Nutzung:|Relevanz:/, `${documentKind}/${format}: Unbefüllte spätere Bewertung darf nicht erscheinen`);
    assert.ok(content.replace(/\s+/g, " ").includes(longObservation.replace(/\s+/g, " ")), `${documentKind}/${format}: Langer Befund muss vollständig bleiben`);
  }
  for (const run of pdfBodyTextRuns(pdfBytes)) assert.ok(run.y >= 30, `${documentKind}/PDF: Codebuchdarstellung läuft unter den Seitenrand`);
  codingExports.push({ documentKind, docxBytes, pdfBytes });
}


const currentLegacyCodeCases = [
  { problemType: "Übernahme nötig", expected: "Übernahme nötig", legacy: true },
  { problemType: "Doppelte Dokumentation", expected: "Doppelte Dokumentation", legacy: false },
  { problemType: "Information fehlt", expected: "Fehlende Information", legacy: false }
];
for (const documentKind of ["appointments", "observations", "appointment"]) {
  for (const testCase of currentLegacyCodeCases) {
    const observation = { ...sparseObservation, processPhase: "Aufnahme", problemType: testCase.problemType,
      impact: "Zusätzliche Arbeit", evidenceType: "synthetic_source_based" };
    const appointment = { ...sparseAppointment, documentation: { observations: [observation] } };
    const snapshot = { ...semanticSnapshot, documentKind, appointments: [appointment], hospitations: [appointment] };
    const unchanged = structuredClone(snapshot);
    for (const [format, create, read] of [
      ["Word", exporter.createDocx, (bytes) => docxVisibleText(docxDocumentXml(bytes))],
      ["PDF", exporter.createPdf, (bytes) => pdfBodyTextRuns(bytes).map((run) => run.text).join(" ")]
    ]) {
      const text = beforeCodeHelp(read(new Uint8Array(await create(snapshot).blob.arrayBuffer())));
      const marker = documentKind === "appointment" ? "*" : " (bisherige Codierung)";
      assert.ok(text.includes(testCase.expected + (testCase.legacy ? marker : "")),
        `${documentKind}/${format}: Aktuelle Anzeige und historische Codierung bleiben unterscheidbar`);
      if (!testCase.legacy) assert.ok(!text.includes(testCase.expected + marker),
        `${documentKind}/${format}: Ein aktueller Code darf nicht als Altwert erscheinen`);
      if (testCase.legacy) assert.doesNotMatch(text, /Doppelte Dokumentation/,
        `${documentKind}/${format}: Die breite bisherige Kategorie darf nicht in die engere neue Kategorie umgedeutet werden`);
    }
    assert.deepEqual(snapshot, unchanged, `${documentKind}: Codes bleiben im Eingabe-Snapshot unverändert`);
  }
}

// Eingebettete Dokumentation und rohe Export-Snapshots durchlaufen nicht
// zwangsläufig die API-Konvertierung. Bekannte synthetische Herkunft muss
// deshalb auch hier Vorrang vor einer veralteten Quellenangabe haben.
const syntheticOrigins = [
  { originalEvidenceType: "synthetic_source_based" },
  { original_evidence_type: "synthetic_source_based" },
  { payload: { originalEvidenceType: "synthetic_source_based" } },
  { payload: { original_evidence_type: "synthetic_source_based" } }
];
const syntheticBase = {
  id: "synthetic-source-regression",
  title: "Fiktiver Ablauf mit bekannter Herkunft",
  description: "Ein konstruierter Fall für die Herkunftsprüfung.",
  processPhase: "Aufnahme",
  problemType: "Übernahme nötig",
  sourceReference: "Fiktive Demonstrationsunterlage, Szene 4"
};
let restoredSynthetic;
for (const origin of syntheticOrigins) {
  for (const evidenceType of ["", "directly_observed", "reported", "source_bound", "interpreted", "synthetic_source_based"]) {
    const embedded = JSON.stringify({
      kind: model.DOCUMENTATION_KIND,
      observations: [{ ...syntheticBase, ...origin, evidenceType }]
    });
    const parsed = model.parseDocumentationOutcome(embedded);
    restoredSynthetic = model.parseDocumentationOutcome(model.serializeDocumentationPayload(parsed)).observations[0];
    for (const observation of [parsed.observations[0], restoredSynthetic]) {
      assert.equal(observation.evidenceType, "synthetic_source_based", "Eingebettete Dokumentation darf bekannte synthetische Herkunft nicht als andere Quelle ausgeben");
      assert.equal(observation.originalEvidenceType, "synthetic_source_based");
      for (const field of ["description", "processPhase", "problemType", "sourceReference"]) {
        assert.equal(observation[field], syntheticBase[field], `Die Herkunftskorrektur darf ${field} nicht verändern`);
      }
    }
  }
}
const syntheticExportObservations = [
  ...syntheticOrigins.map((origin, index) => ({ ...syntheticBase, ...origin, id: `raw-synthetic-${index}`, evidenceType: "reported" })),
  { ...restoredSynthetic, id: "restored-synthetic" }
];
const syntheticExportItem = { ...dateOnlyAppointment, documentation: { observations: syntheticExportObservations } };
const syntheticExportSnapshot = { ...fixture, appointments: [syntheticExportItem], hospitations: [syntheticExportItem] };
const unchangedSyntheticExportSnapshot = structuredClone(syntheticExportSnapshot);
for (const [createWord, createPdf] of [
  [exporter.createDocx, exporter.createPdf],
  [exporter.createObservationDocx, exporter.createObservationPdf],
  [exporter.createAppointmentDocx, exporter.createAppointmentPdf]
]) {
  const word = createWord(syntheticExportSnapshot);
  const pdf = createPdf(syntheticExportSnapshot);
  const wordText = docxVisibleText(docxDocumentXml(new Uint8Array(await word.blob.arrayBuffer())));
  const pdfText = pdfBodyTextRuns(new Uint8Array(await pdf.blob.arrayBuffer())).map((run) => run.text).join(" ");
  for (const fullContent of [wordText, pdfText]) {
    const content = beforeCodeHelp(fullContent);
    assert.equal((content.match(/synthetisches Beispiel/g) || []).length, syntheticExportObservations.length, "Jede bekannte synthetische Beobachtung muss im Export entsprechend gekennzeichnet sein");
    assert.doesNotMatch(content, /direkt beobachtet|berichtet|Annahme|Beobachtungsunterlage/, "Veraltete Quellenangaben dürfen bekannte synthetische Fälle nicht empirisch erscheinen lassen");
  }
}

assert.deepEqual(syntheticExportSnapshot, unchangedSyntheticExportSnapshot,
  "Die Herkunftskennzeichnung verändert keinen rohen Export-Snapshot");

const outputIndex = process.argv.indexOf("--output-dir");
if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
  const outputDir = resolve(process.argv[outputIndex + 1]);
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, docx.filename), docxBytes);
  await writeFile(resolve(outputDir, pdf.filename), pdfBytes);
  await writeFile(resolve(outputDir, observationDocx.filename), observationDocxBytes);
  await writeFile(resolve(outputDir, observationPdf.filename), observationPdfBytes);
  await writeFile(resolve(outputDir, appointmentDocx.filename), appointmentDocxBytes);
  await writeFile(resolve(outputDir, appointmentPdf.filename), appointmentPdfBytes);
  for (const exported of [...semanticExports, ...codingExports]) {
    const prefix = semanticExports.includes(exported) ? "beobachtung-texte" : "codebuch-1-1";
    await writeFile(resolve(outputDir, `${prefix}-${exported.documentKind}.docx`), exported.docxBytes);
    await writeFile(resolve(outputDir, `${prefix}-${exported.documentKind}.pdf`), exported.pdfBytes);
  }
}

console.log(`Hospitations-Export geprüft: ${docxBytes.length} Bytes DOCX, ${pdfBytes.length} Bytes PDF; Beobachtungs-Übersicht: ${observationDocxBytes.length} Bytes DOCX, ${observationPdfBytes.length} Bytes PDF; Einzeltermin: ${appointmentDocxBytes.length} Bytes DOCX, ${appointmentPdfBytes.length} Bytes PDF.`);
