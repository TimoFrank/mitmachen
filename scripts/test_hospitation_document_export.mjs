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
const appointmentSnapshot = {
  ...fixture,
  documentKind: "appointment",
  documentLabel: "Hospitations-Termin | Einzelansicht",
  title: "Hospitation | Dr. Ada Beispiel",
  appointments: [fixture.hospitations[0]],
  hospitations: [fixture.hospitations[0]]
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
assert.doesNotMatch(observationDocxText, /Datensatz-ID|Notiz A-01|Betroffene Produkte|Nutzungsfreigabe|Roadmap-Einschätzungen|checkliste\.pdf|Synthetischer Testdatenstand/);
assert.match(observationPdfText, /^%PDF-1\.4/);
assert.equal(appointmentDocx.snapshot.documentKind, "appointment");
assert.equal(appointmentDocx.snapshot.summary.appointments, 1);
assert.equal(appointmentDocx.snapshot.summary.observations, 2);
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
assert.doesNotMatch(appointmentDocxText, /Pflegezentrum Beispiel/);
assert.match(appointmentPdfText, /^%PDF-1\.4/);
assert.match(appointmentPdfText, /\/Subtype \/Image/);
assert.match(appointmentPdfText, /\/Im1 Do/);

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
}

console.log(`Hospitations-Export geprüft: ${docxBytes.length} Bytes DOCX, ${pdfBytes.length} Bytes PDF; Beobachtungs-Übersicht: ${observationDocxBytes.length} Bytes DOCX, ${observationPdfBytes.length} Bytes PDF; Einzeltermin: ${appointmentDocxBytes.length} Bytes DOCX, ${appointmentPdfBytes.length} Bytes PDF.`);
