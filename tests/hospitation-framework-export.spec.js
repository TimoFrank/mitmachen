import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

function exportFixture() {
  const fixture = createProtectedBackendFixture({ role: "admin" });
  fixture.hospitations = [{
    ...fixture.hospitations[0],
    observations: [],
    documentationOutcome: JSON.stringify({ kind: "hospitation-documentation-v2", observations: [] })
  }];
  const hospitationId = fixture.hospitations[0].id;
  const observation = (sequence, values) => ({
    id: `framework-export-observation-${sequence}`,
    hospitationId,
    sequence,
    status: "active",
    createdAt: "2026-07-16T07:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
    ...values
  });
  fixture.hospitationObservations = [
    observation(1, {
      title: "Synthetischer Fall vor der Bearbeitung",
      situation: "An einem fiktiven Empfang wird eine Unterlage gesucht.",
      description: "Die Unterlage ist im Testsystem nicht auffindbar.",
      observedAt: "2026-07-16T07:14:37.000Z",
      processPhase: "Aufnahme",
      problemType: "Information fehlt",
      impact: "Zusätzliche Arbeit",
      evidenceType: "interpreted",
      originalEvidenceType: "synthetic_source_based",
      sourceReference: "Fiktive Demonstrationsunterlage, Szene 1",
      immediateConsequence: "Im Testfall entstehen fünf Minuten Wartezeit.",
      currentWorkaround: "Die Testperson verwendet eine Papierkopie.",
      relevanceScore: 4
    }),
    observation(2, {
      title: "Historische Codierung bleibt erkennbar",
      description: "Eine fiktive Altunterlage dokumentiert einen Medienwechsel.",
      observedAt: "10:32:59 Uhr",
      processPhase: "Anmeldung / Aufnahme",
      problemType: "Medienbruch",
      impact: "Zeitaufwand",
      evidenceType: "reported"
    }),
    observation(3, {
      title: "Uncodierter Fall bleibt offen",
      description: "Für diesen fiktiven Fall wurden noch keine Codes vergeben.",
      processPhase: "",
      problemType: "",
      impact: "",
      evidenceType: "",
      relevanceScore: null
    })
  ];
  return fixture;
}

// Read the downloaded artifacts themselves; do not substitute the exporter API
// for the user-facing editor, persistence and download flow under test.
function docxText(bytes) {
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const length = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    if (name === "word/document.xml") {
      const compressed = bytes.subarray(start, start + length);
      expect([0, 8]).toContain(method);
      const xml = (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
      const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => entities[entity]))
        .join(" ");
    }
    offset = start + length;
  }
  throw new Error("Der Word-Download enthält keinen Dokumentinhalt.");
}

function pdfText(bytes) {
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  return [...bytes.toString("latin1").matchAll(/<([0-9a-f]+)>\s*Tj/gi)]
    .map((match) => new TextDecoder("windows-1252").decode(Buffer.from(match[1], "hex")))
    .join(" ");
}

for (const profile of ["source", "pages"]) {
  test(`Ausfüllbare PDF lässt sich im ${profile}-Profil herunterladen, ändern und erneut öffnen`, async ({ page }, testInfo) => {
    if (profile === "source") {
      await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#questionnaire");
    } else {
      await page.goto("/dist/pages/versorgungs-kompass.html#questionnaire");
    }
    const link = page.getByRole("link", { name: "Ausfüllbare PDF-Vorlage herunterladen", exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("title", /fiktiven Beispielen/);
    await page.screenshot({ path: testInfo.outputPath(`formular-download-${profile}.png`) });
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toBe("Hospitations-Framework_ausfuellbar.pdf");
    expect(await download.failure()).toBeNull();
    const output = testInfo.outputPath("ausfuellbare-vorlage.pdf");
    await download.saveAs(output);
    const bytes = await readFile(output);
    const source = await readFile(new URL("../public/hospitation/hospitations-framework-ausfuellbar.pdf", import.meta.url));
    expect(bytes.equals(source)).toBe(true);

    const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    let reopened;
    try {
      const pdf = await loading.promise;
      expect(pdf.numPages).toBe(2);
      const fields = await pdf.getFieldObjects();
      expect(Object.keys(fields)).toHaveLength(39);
      expect(Object.values(fields).flat().every((field) => field.editable && !field.hidden)).toBe(true);
      expect(fields.beobachtung_01_quelle[0].value).toBe("synthetisches Beispiel");
      expect(fields.beobachtung_01_problemtyp[0].items.map((item) => item.exportValue)).toContain("Fehlende Information");
      pdf.annotationStorage.setValue(fields.name[0].id, { value: "Alex Beispiel" });
      pdf.annotationStorage.setValue(fields.beobachtung_01_problemtyp[0].id, { value: "Fehlende Information" });
      pdf.annotationStorage.setValue(fields.beobachtung_01_beschreibung[0].id, { value: "" });
      reopened = getDocument({ data: await pdf.saveDocument(), useSystemFonts: true });
      const saved = await (await reopened.promise).getFieldObjects();
      expect(saved.name[0].value).toBe("Alex Beispiel");
      expect(saved.beobachtung_01_problemtyp[0].value).toBe("Fehlende Information");
      expect(saved.beobachtung_01_beschreibung[0].value).toBe("");
      expect(saved.beobachtung_02_quelle[0].value).toBe("synthetisches Beispiel");
    } finally {
      if (reopened) await reopened.destroy();
      await loading.destroy();
    }
  });
}

test("Termin-Downloads übernehmen gespeicherte Beobachtungen, aktuelle Codes und geschützte Herkunft", async ({ page }, testInfo) => {
  const fixture = exportFixture();
  const first = fixture.hospitationObservations[0];
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations:observations", {
    role: "admin",
    backendFixture: fixture
  });
  await page.locator(`[data-observation-open="${first.id}"]`).click();
  const drawer = page.locator("#observation-detail-drawer");
  await drawer.locator("[data-observation-edit]").click();
  const form = drawer.locator("[data-observation-edit-form]");
  await expect(form.locator('[name="description"]')).toHaveValue(`${first.situation}\n\n${first.description}`);
  const title = "Vorbefund fehlt im synthetischen Kontrolltermin";
  const description = "An einem fiktiven Empfang wird ein Vorbefund gesucht. Die Testperson fordert ihn telefonisch an.";
  await form.locator('[name="title"]').fill(title);
  await form.locator('[name="description"]').fill(description);
  // A later evidence selection must never erase the original synthetic source.
  await form.locator('[name="evidenceType"]').selectOption("directly_observed");
  await form.locator("[data-observation-coding] > summary").click();
  await form.locator('[name="processPhase"]').selectOption("Abklärung");
  await form.locator('[name="problemType"]').selectOption("Information fehlt");
  const saved = page.waitForResponse((response) => response.request().method() === "PATCH"
    && new URL(response.url()).pathname === `/api/hospitation-observations/${first.id}`);
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText(title);

  await page.reload();
  await page.locator(`[data-observation-open="${first.id}"]`).click();
  await drawer.locator("[data-observation-edit]").click();
  await expect(form.locator('[name="title"]')).toHaveValue(title);
  await expect(form.locator('[name="description"]')).toHaveValue(description);
  expect(fixture.hospitationObservations.find((row) => row.id === first.id)).toMatchObject({
    situation: "",
    description,
    processPhase: "Abklärung",
    originalEvidenceType: "synthetic_source_based",
    observedAt: "2026-07-16T07:14:37.000Z"
  });
  await form.locator("[data-observation-edit-cancel]").click();
  await drawer.locator("[data-observation-open-source]").click();
  const editor = page.locator("#hospitation-editor-drawer");
  await expect(editor).toHaveClass(/is-open/);
  const exportButtons = editor.locator("[data-hospitation-action='export-appointment']");
  await expect(exportButtons).toHaveCount(2);
  await exportButtons.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("termin-export.png") });

  for (const format of ["docx", "pdf"]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      editor.locator(`[data-hospitation-export-format="${format}"]`).click()
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^mitmachen-hospitations-termin-.*\\.${format}$`));
    expect(await download.failure()).toBeNull();
    const path = testInfo.outputPath(`hospitations-framework.${format}`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    const content = (format === "docx" ? docxText(bytes) : pdfText(bytes)).replace(/\s+/g, " ");
    expect(content).toContain("Hospitations-Framework");
    expect(content).toContain("Unknown Unknowns aus der Versorgung");
    expect(content).toContain("Codehilfe");
    const observations = content.split("Codehilfe")[0];
    const current = observations.split(title)[1].split("Historische Codierung bleibt erkennbar")[0];
    for (const expected of [description, first.immediateConsequence, first.currentWorkaround,
      "09:14", "Abklärung", "Fehlende Information", "Zusätzliche Arbeit", "synthetisches Beispiel"]) {
      expect(current, `${format}: ${expected}`).toContain(expected);
    }
    expect(current).not.toContain("direkt beobachtet");
    expect(current).not.toContain("09:14:37");
    expect(current).not.toContain(first.description);
    const historical = observations.split("Historische Codierung bleibt erkennbar")[1].split("Uncodierter Fall bleibt offen")[0];
    for (const expected of ["10:32", "Anmeldung / Aufnahme*", "Medienbruch*", "Zeitaufwand*"]) {
      expect(historical).toContain(expected);
    }
    expect(historical).not.toContain("10:32:59");
    const uncoded = observations.split("Uncodierter Fall bleibt offen")[1];
    expect(uncoded).toContain("Für diesen fiktiven Fall wurden noch keine Codes vergeben.");
    expect(uncoded).not.toMatch(/Fehlende Information|Kein Problem erkennbar|Nicht feststellbar|direkt beobachtet/);
    expect(observations).not.toMatch(/Kontext:|Anlass:|Aktueller Workaround:|Nächste Nutzung/);
  }
});
