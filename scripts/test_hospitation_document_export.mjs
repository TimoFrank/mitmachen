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
    .filter((run) => run.y <= 800 && !(run.y === 18 && /^(?:Hospitations-|Seite )/.test(run.text)));
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
    assert.equal((visibleText.match(/Beobachtung:/g) || []).length, observationTextCases.filter((testCase) => testCase.expected).length, `${documentKind}/${format}: Pro befülltem Eintrag wird genau ein Beobachtungsfeld ausgegeben`);
  }
  assert.match(xml, /Kontext Altbestand am Empfang\.<\/w:t>[\s\S]*?<\/w:p>[\s\S]*?<w:p>[\s\S]*?Die MFA öffnet den alten Prüfauftrag\./, `${documentKind}/DOCX: Kontext und Ablauf benötigen getrennte Absätze`);
  for (const run of pdfRuns) {
    assert.ok(run.y >= 30, `${documentKind}/PDF: Langer Beobachtungstext läuft unter den Seitenrand`);
  }
  semanticExports.push({ documentKind, docxBytes, pdfBytes });
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
  documentLabel: "Hospitations-Termin | Einzelansicht",
  title: "Hospitation | Dr. Ada Beispiel",
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
assert.match(appointmentDocxText, /Codierung/);
assert.match(appointmentDocxText, /F2EEFF/);
assert.match(appointmentDocxText, /EAF2FF/);
assert.match(appointmentDocxText, /Vorbefund fehlt bei der Aufnahme/);
assert.doesNotMatch(appointmentDocxText, /18\.07\.2026,\s*02:00/, "Ein reiner Hospitationstag darf im Export keine abgeleitete Uhrzeit erhalten");
assert.doesNotMatch(appointmentDocxText, /Pflegezentrum Beispiel/);
assert.doesNotMatch(appointmentDocxText, /Terminangebot/);
assert.match(appointmentPdfText, /^%PDF-1\.4/);
assert.match(appointmentPdfText, /\/Subtype \/Image/);
assert.match(appointmentPdfText, /\/Im1 Do/);

for (const bytes of [docxBytes, observationDocxBytes, appointmentDocxBytes, pdfBytes, observationPdfBytes, appointmentPdfBytes]) {
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
  for (const [format, content] of [["DOCX", docxVisibleText(docxDocumentXml(docxBytes))], ["PDF", pdfBodyTextRuns(pdfBytes).map((run) => run.text).join(" ")]]) {
    for (const [, label] of sourceCases) assert.ok(content.includes(label), `${documentKind}/${format}: Quellenlabel ${label} fehlt`);
    assert.match(content, /Fehlende Information/, `${documentKind}/${format}: Anzeigename statt Speicherwert verwenden`);
    assert.doesNotMatch(content, /Information fehlt|source_bound|synthetic_source_based|bisherige Codierung/, `${documentKind}/${format}: Neue Werte benötigen aktuelle Anzeigenamen`);
    assert.doesNotMatch(content, /Spätere Bewertung|Beobachtungsart|Nächste Nutzung:|Relevanz:/, `${documentKind}/${format}: Unbefüllte spätere Bewertung darf nicht erscheinen`);
    assert.ok(content.replace(/\s+/g, " ").includes(longObservation.replace(/\s+/g, " ")), `${documentKind}/${format}: Langer Befund muss vollständig bleiben`);
  }
  for (const run of pdfBodyTextRuns(pdfBytes)) assert.ok(run.y >= 30, `${documentKind}/PDF: Codebuchdarstellung läuft unter den Seitenrand`);
  codingExports.push({ documentKind, docxBytes, pdfBytes });
}

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
  for (const exported of semanticExports) {
    await writeFile(resolve(outputDir, `beobachtung-texte-${exported.documentKind}.docx`), exported.docxBytes);
    await writeFile(resolve(outputDir, `beobachtung-texte-${exported.documentKind}.pdf`), exported.pdfBytes);
  }
  for (const exported of codingExports) {
    await writeFile(resolve(outputDir, `codebuch-1-1-${exported.documentKind}.docx`), exported.docxBytes);
    await writeFile(resolve(outputDir, `codebuch-1-1-${exported.documentKind}.pdf`), exported.pdfBytes);
  }
}

console.log(`Hospitations-Export geprüft: ${docxBytes.length} Bytes DOCX, ${pdfBytes.length} Bytes PDF; Beobachtungs-Übersicht: ${observationDocxBytes.length} Bytes DOCX, ${observationPdfBytes.length} Bytes PDF; Einzeltermin: ${appointmentDocxBytes.length} Bytes DOCX, ${appointmentPdfBytes.length} Bytes PDF.`);
