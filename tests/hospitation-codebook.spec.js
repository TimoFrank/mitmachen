import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const observationRoute = "/frontend/app/versorgungs-kompass.html#hospitations:observations";
const comparisonRoute = "/frontend/app/versorgungs-kompass.html#hospitations:patterns";

function observationFixture(buildRows) {
  const fixture = createProtectedBackendFixture({ role: "admin" });
  // Keep only the two explicit cases: unrelated demo documentation must not
  // contribute observations to the comparison under test.
  fixture.hospitations = fixture.hospitations.slice(0, 2).map((item) => ({
    ...item,
    observations: [],
    documentationOutcome: JSON.stringify({ kind: "hospitation-documentation-v2", observations: [] })
  }));
  const ids = fixture.hospitations.map((item) => item.id);
  let sequence = 0;
  const row = (values = {}, caseIndex = 0) => {
    sequence += 1;
    return {
      id: `codebook-observation-${sequence}`,
      hospitationId: ids[caseIndex],
      sequence,
      title: `Vertragsbeobachtung ${sequence}`,
      description: `Fiktive Testsituation ${sequence}: eine Person sucht eine Arbeitsinformation.`,
      processPhase: "Aufnahme",
      problemType: "Information fehlt",
      observationType: "Hindernis",
      evidenceType: "directly_observed",
      sourceReference: `Fiktive Feldnotiz ${sequence}`,
      status: "active",
      createdAt: "2026-07-20T08:00:00.000Z",
      updatedAt: "2026-07-20T09:00:00.000Z",
      ...values
    };
  };
  fixture.hospitationObservations = buildRows(row);
  return fixture;
}

async function openNewObservation(page) {
  await page.locator("[data-observation-new]").click();
  const form = page.locator("[data-observation-create-form]");
  await expect(form).toBeVisible();
  await form.locator('[name="hospitationId"]').selectOption({ index: 1 });
  return form;
}

async function loadedObservation(page, title) {
  return page.evaluate(async (expectedTitle) => {
    const rows = await window.dataService.loadHospitationObservations();
    return rows.find((item) => item.title === expectedTitle);
  }, title);
}

test("Neue Beobachtung startet mit einem Text; drei Codes und Hilfe öffnen sich nur bei Bedarf", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, observationRoute, { role: "admin" });
  const form = await openNewObservation(page);
  const coding = form.locator("[data-observation-coding]");
  await expect(coding).not.toHaveAttribute("open", "");
  await expect(form.locator('[name="situation"], [name="situationContext"]')).toHaveCount(0);
  await expect(form.locator('[name="description"]')).toBeVisible();
  await expect(form.locator('[name="evidenceType"]')).toBeVisible();
  await expect(form.locator('[name="processPhase"]')).toBeHidden();
  await expect(form.locator('[name="observationType"]')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("beobachtung-neu.png") });
  await coding.locator(":scope > summary").click();
  await expect(coding.locator("[data-codebook-field]")).toHaveCount(3);
  const guide = form.locator("[data-hospitation-codebook-guide]");
  const journey = guide.locator("[data-hospitation-journey]");
  const additional = form.locator("[data-codebook-additional]");
  await expect(guide).not.toHaveAttribute("open", "");
  await expect(additional).not.toHaveAttribute("open", "");
  await expect(journey).toBeHidden();
  await expect(form.locator('[name="sourceReference"]')).toBeHidden();
  await expect(form.locator('[name="immediateConsequence"]')).toBeHidden();
  await expect(form.locator('[name="uncertainty"]')).toBeHidden();
  await expect(form.locator('[data-codebook-field] [data-codebook-help]')).toHaveCount(0);
  await expect(form.locator('[data-codebook-field]')).toHaveCount(5);
  const process = form.locator('[name="processPhase"]');
  await expect(process.locator('option:not([value=""])')).toHaveText([
    "Zugang", "Aufnahme", "Abklärung", "Versorgung", "Übergang", "Nachsorge", "Übergreifend", "Noch nicht zuordenbar"
  ]);
  const problem = form.locator('[name="problemType"]');
  await expect(problem.locator('option:not([value=""])')).toHaveText([
    "Fehlende Information", "Doppelte Dokumentation", "Technische Störung", "Unklare Abstimmung", "Verständnisproblem", "Fehlende Kapazität",
    "Anderes Problem", "Kein Problem erkennbar", "Noch nicht zuordenbar"
  ]);
  const problemField = form.locator('[data-codebook-field="problemType"]');
  const trigger = problemField.locator(".custom-select-trigger");
  await expect(trigger).toHaveAttribute("aria-describedby", await problem.getAttribute("aria-describedby"));
  await trigger.click();
  await problemField.getByRole("option", { name: "Fehlende Information", exact: true }).click();
  await process.selectOption("Abklärung");
  await form.locator('[name="title"]').fill("Vorbefund fehlt bei der Abklärung");
  await form.locator('[name="description"]').fill("Fiktives Beispiel: Eine Ärztin sucht einen Vorbefund für die diagnostische Entscheidung. Die Patientin wartet während der Rückfrage.");
  await guide.evaluate((element) => {
    const body = element.closest("#observation-detail-body");
    body.scrollTop += element.getBoundingClientRect().top - body.getBoundingClientRect().top - 80;
    element.closest("#observation-detail-drawer").scrollTop = 0;
    window.scrollTo(0, 0);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("codierung-kompakt.png") });

  await guide.locator(":scope > summary").click();
  await expect(journey.getByRole("list", { name: "Patient Journey" })).toBeVisible();
  await expect(journey.locator("[data-journey-phase] strong")).toHaveText(["Zugang", "Aufnahme", "Abklärung", "Versorgung", "Übergang", "Nachsorge"]);
  await expect(journey.locator('[aria-current="step"]')).toHaveAttribute("data-journey-phase", "Abklärung");
  const explanation = guide.locator('[data-codebook-help="problemType"]');
  await explanation.locator("summary").click();
  await expect(explanation.locator("dd").first()).toBeVisible();
  await expect(explanation).toContainText("Beispiel:");
  await expect(explanation).toContainText("Abgrenzung:");
  await guide.locator(":scope > summary").click();
  await additional.locator(":scope > summary").click();
  await form.locator('[name="observationType"]').selectOption("Hindernis");
  await expect(form.locator('[name="sourceReference"]')).toBeVisible();
  await problem.selectOption("Kein Hindernis");
  await expect(form.locator("[data-codebook-plausibility]")).toBeVisible();
  await problem.selectOption("Information fehlt");
  await expect(form.locator("[data-codebook-plausibility]")).toBeHidden();
  await additional.locator(":scope > summary").click();
  if (testInfo.project.name === "chromium-desktop") {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await guide.evaluate((element) => {
    const body = element.closest("#observation-detail-body");
    body.scrollTop += element.getBoundingClientRect().top - body.getBoundingClientRect().top - 80;
    element.closest("#observation-detail-drawer").scrollTop = 0;
    window.scrollTo(0, 0);
  });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("codierung-kompakt-tablet.png") });
  }
});

test("Ausfüllhinweise öffnen einzeln, ohne Codierung oder Erfassung auszulösen", async ({ page }) => {
  await gotoAuthenticated(page, observationRoute, { role: "admin" });
  const form = await openNewObservation(page);
  await expect(page.locator("#observation-detail-subtitle")).toBeHidden();
  await expect(form.locator(".observation-field-hint:popover-open")).toHaveCount(0);
  const coding = form.locator("[data-observation-coding]");
  for (const [key, label] of [["title", "Kurzfassung"], ["description", "Beobachtung"], ["evidenceType", "Quelle"], ["coding", "Codierung"]]) {
    const trigger = form.getByRole("button", { name: `Hinweise zur ${label}`, exact: true });
    await trigger.focus();
    await trigger.press("Enter");
    const hint = form.locator(`#observation-hint-${key}`);
    await expect(hint).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(coding).not.toHaveAttribute("open", "");
    const insideViewport = await hint.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight;
    });
    expect(insideViewport).toBe(true);
    await trigger.press("Escape");
    await expect(hint).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(form).toBeVisible();
  }
  await form.getByRole("button", { name: "Hinweise zur Quelle", exact: true }).click();
  await form.getByRole("textbox", { name: "Kurzfassung", exact: true }).click();
  await expect(form.locator(".observation-field-hint:popover-open")).toHaveCount(0);
  await expect(form.locator('[name="title"]')).toHaveValue("");
  await expect(form.locator('[name="evidenceType"]')).toHaveValue("");
});

test("Hospitationsauswahl zeigt Kontaktbild und Datum, findet Namen und erhält die gewählte Zuordnung", async ({ page }) => {
  const fixture = observationFixture(() => []);
  const contact = fixture.contacts[0];
  contact.image = "/public/demo-profile-admin.svg";
  const parent = fixture.hospitations[0];
  parent.contactId = contact.id;
  parent.organizationId = "";
  parent.organizationName = "Demo-Zentrum mit einer ausführlichen Organisationsbezeichnung für interdisziplinäre Versorgung";
  // Explicit organization wins over the contact's usual organization.
  contact.organizationId = "";
  contact.organization = "";
  fixture.hospitations[1].contactId = "";
  await gotoAuthenticated(page, observationRoute, { role: "admin", backendFixture: fixture });
  await page.locator("[data-observation-new]").click();
  const form = page.locator("[data-observation-create-form]");
  const shell = form.locator(".observation-parent-select");
  await shell.locator(".custom-select-trigger").click();
  await shell.getByRole("searchbox").fill(contact.name);
  const option = shell.getByRole("option");
  await expect(option).toHaveCount(1);
  await expect(option).toContainText(parent.organizationName);
  await option.click();
  const selected = shell.locator(".custom-select-trigger");
  await expect(selected).toContainText(contact.name);
  await expect(selected).toContainText("22.01.2026");
  await expect(selected.locator("img")).toHaveAttribute("src", /demo-profile-admin\.svg$/);
  await expect.poll(() => selected.locator("img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await selected.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await form.locator('[name="title"]').fill("Fiktiver Eintrag mit ausgewählter Hospitation");
  await form.locator('[name="description"]').fill("Fiktives Beispiel einer konkreten Situation.");
  await form.getByRole("button", { name: "Beobachtung anlegen", exact: true }).click();
  await expect(form).toHaveCount(0);
  expect((await loadedObservation(page, "Fiktiver Eintrag mit ausgewählter Hospitation")).hospitationId).toBe(parent.id);
});

test("Codemenüs bleiben an beiden Drawerrändern erreichbar und per Tastatur bedienbar", async ({ page }) => {
  await gotoAuthenticated(page, observationRoute, { role: "admin" });
  const form = await openNewObservation(page);
  await form.locator("[data-observation-coding] > summary").click();
  await form.locator("[data-codebook-additional] > summary").click();
  const field = form.locator('[data-codebook-field="problemType"]');
  const trigger = field.locator(".custom-select-trigger");
  const panel = field.getByRole("listbox");
  for (const position of [0.82, 0.12]) {
    await trigger.evaluate((element, fraction) => {
      const body = element.closest("#observation-detail-body");
      const bounds = body.getBoundingClientRect();
      body.scrollTop += element.getBoundingClientRect().top - bounds.top - bounds.height * fraction;
    }, position);
    await trigger.click();
    await expect(panel).toBeVisible();
    const visible = await panel.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const body = element.closest("#observation-detail-body").getBoundingClientRect();
      return bounds.top >= Math.max(0, body.top) && bounds.bottom <= Math.min(window.innerHeight, body.bottom);
    });
    expect(visible).toBe(true);
    await trigger.press("End");
    await expect(field.getByRole("option", { name: "Noch nicht zuordenbar", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field.locator("select")).toHaveValue("Noch nicht zuordenbar");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await trigger.click();
  await field.getByRole("option", { name: "Doppelte Dokumentation", exact: true }).click();
  await expect(field.locator("select")).toHaveValue("Doppelte Dokumentation");
});

test("Titel und Beschreibung reichen aus; Codierung und Quelle werden nicht vorausgefüllt", async ({ page }) => {
  await gotoAuthenticated(page, observationRoute, {
    role: "admin",
    backendFixture: observationFixture((row) => [row()])
  });
  const form = await openNewObservation(page);
  for (const name of ["processPhase", "problemType", "impact", "observationType", "evidenceType"]) {
    await expect(form.locator(`[name="${name}"]`)).toHaveValue("");
    await expect(form.locator(`[name="${name}"]`)).not.toHaveAttribute("required", "");
  }
  await expect(form.locator('[name="sourceReference"]')).toBeHidden();
  await form.locator('[name="title"]').fill("Zunächst nur beschrieben");
  await form.locator('[name="description"]').fill("Die Person öffnet ein Dokument und liest den nächsten Arbeitsschritt.");
  await expect(form.locator(":invalid")).toHaveCount(0);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("#observation-detail-finding-title")).toHaveText("Zunächst nur beschrieben");

  await page.reload();
  const saved = await loadedObservation(page, "Zunächst nur beschrieben");
  expect(saved).toBeDefined();
  for (const name of ["processPhase", "problemType", "impact", "observationType", "evidenceType"]) {
    expect(saved[name] ?? "", `${name} darf beim Speichern keine implizite Bewertung erhalten`).toBe("");
  }
});

test("Historische Codes und Quellenarten bleiben beim erneuten Speichern erhalten", async ({ page }) => {
  const legacyValues = {
    processPhase: "Kommunikation mit anderen Einrichtungen",
    problemType: "Medienbruch",
    impact: "Frust / Belastung",
    observationType: "Gegenbeispiel"
  };
  const evidenceTypes = ["source_bound", "synthetic_source_based", "interpreted"];
  const fixture = observationFixture((row) => evidenceTypes.map((evidenceType) => row({
    ...legacyValues,
    evidenceType,
    situation: "Am Empfang eines fiktiven Standorts.",
    description: "Eine benötigte Unterlage fehlt.",
    title: `Bestand ${evidenceType}`,
    sourceReference: `Historische Unterlage ${evidenceType}, Szene 3`
  })));
  await gotoAuthenticated(page, observationRoute, { role: "admin", backendFixture: fixture });

  for (const evidenceType of evidenceTypes) {
    const title = `Bestand ${evidenceType}`;
    await page.locator("[data-observation-open]", { hasText: title }).click();
    const drawer = page.locator("#observation-detail-drawer");
    await expect(drawer.locator("[data-observation-source-reference]")).toContainText(`Historische Unterlage ${evidenceType}, Szene 3`);
    await drawer.locator("[data-observation-edit]").click();
    const form = drawer.locator("[data-observation-edit-form]");
    for (const [name, value] of Object.entries({ ...legacyValues, evidenceType })) {
      await expect(form.locator(`[name="${name}"]`)).toHaveValue(value);
    }
    await expect(form.locator('[name="description"]')).toHaveValue("Am Empfang eines fiktiven Standorts.\n\nEine benötigte Unterlage fehlt.");
    await expect(form.locator('[name="sourceReference"]')).toHaveValue(`Historische Unterlage ${evidenceType}, Szene 3`);
    await expect(form.locator(":invalid")).toHaveCount(0);
    await form.locator('button[type="submit"]').click();
    await expect(drawer.locator("[data-observation-edit]")).toBeVisible();
    await drawer.locator("#observation-detail-close").click();
  }

  await page.reload();
  for (const evidenceType of evidenceTypes) {
    expect(await loadedObservation(page, `Bestand ${evidenceType}`)).toMatchObject({
      ...legacyValues,
      evidenceType,
      sourceReference: `Historische Unterlage ${evidenceType}, Szene 3`,
      situation: "",
      description: "Am Empfang eines fiktiven Standorts.\n\nEine benötigte Unterlage fehlt."
    });
  }
});

test("Der Dokumentationseditor erhält Herkunft und Nutzungsfreigaben bei einer Titeländerung", async ({ page }) => {
  const preserved = {
    originalEvidenceType: "synthetic_source_based",
    sourceType: "synthetic_source_based",
    sourceReference: "Fiktive Demonstrationsunterlage, Szene 7",
    limitations: "Demonstrationsfall ohne empirische Feldbeobachtung.",
    communicationChannels: ["Telefon", "Papier"],
    nextUse: "Technik prüfen",
    internalUseAllowed: true,
    externalUseAllowed: true
  };
  const fixture = observationFixture((row) => [row({
    ...preserved,
    title: "Historischer Demonstrationsfall",
    evidenceType: "interpreted",
    processPhase: "Befund / Dokumentation",
    problemType: "Medienbruch",
    observationType: "Reibung / Problem"
  })]);
  const observationId = fixture.hospitationObservations[0].id;
  await gotoAuthenticated(page, observationRoute, { role: "admin", backendFixture: fixture });
  await page.locator(`[data-observation-open="${observationId}"]`).click();
  await page.locator("#observation-detail-drawer [data-observation-open-source]").click();
  const editor = page.locator("#hospitation-editor-drawer");
  await expect(editor).toHaveClass(/is-open/);
  await editor.getByRole("tab", { name: "Beobachten", exact: true }).click();
  const card = editor.locator('[data-repeatable-card][data-repeatable-type="observation"]').first();
  await expect(card.locator('[data-repeatable-field="evidenceType"]')).toHaveValue("synthetic_source_based");
  await card.locator('[data-repeatable-field="title"]').fill("Demonstrationsfall mit präzisiertem Titel");

  await expect.poll(() => fixture.hospitationObservations.find((item) => item.id === observationId)?.title).toBe("Demonstrationsfall mit präzisiertem Titel");
  await page.reload();
  expect(await loadedObservation(page, "Demonstrationsfall mit präzisiertem Titel")).toMatchObject({
    ...preserved,
    evidenceType: "synthetic_source_based",
    processPhase: "Befund / Dokumentation",
    problemType: "Medienbruch",
    observationType: "Reibung / Problem"
  });
});

test("Vergleichsgruppen zählen nachvollziehbare Hindernisse und behaupten keine Ursache", async ({ page }) => {
  const fixture = observationFixture((row) => {
    const rows = [row({ title: "Beleg Aufnahme A" }), row({ title: "Beleg Aufnahme B" }, 1)];
    // The same pair alone does not turn a positive case, a counterexample or
    // contextual information into supporting evidence for a problem.
    for (const observationType of ["Gelungener Ablauf", "Kontext", "Gegenbeispiel", "positives Beispiel"]) {
      rows.push(row({ observationType, title: `Nicht als Hindernis zählen: ${observationType}` }));
    }
    const excludedPairs = [
      { processPhase: "Zugang", evidenceType: "synthetic_source_based" },
      { processPhase: "Versorgung", evidenceType: "interpreted" },
      { processPhase: "Übergang", evidenceType: "", sourceReference: "" },
      { processPhase: "Nachsorge", evidenceType: "source_bound", sourceReference: "" },
      { processPhase: "Übergreifend", evidenceType: "directly_observed", sourceReference: "" },
      { processPhase: "Verordnung", evidenceType: "reported", sourceReference: "" },
      { processPhase: "Anmeldung / Aufnahme", evidenceType: "directly_observed", originalEvidenceType: "synthetic_source_based" },
      { processPhase: "Aufnahme", problemType: "Kein Hindernis", observationType: "Hindernis" }
    ];
    for (const values of excludedPairs) {
      rows.push(row(values), row(values, 1));
    }
    rows.push(
      row({ processPhase: "Abklärung", problemType: "Technik gestört", evidenceType: "source_bound", title: "Beleg Unterlage" }),
      row({ processPhase: "Abklärung", problemType: "Technik gestört", evidenceType: "reported", title: "Beleg Bericht" }, 1)
    );
    return rows;
  });
  await gotoAuthenticated(page, comparisonRoute, { role: "admin", backendFixture: fixture });
  const panel = page.locator("#hospitation-patterns-panel");
  const groups = panel.locator("[data-hospitation-pattern]");
  await expect(groups).toHaveCount(2);
  await expect(panel.locator("[data-hospitation-framework-count]")).toHaveText(["24", "2", "0", "0"]);
  await expect(panel).toContainText(/Vergleich/);

  for (const phase of ["Aufnahme", "Abklärung"]) {
    const group = groups.filter({ hasText: phase });
    await expect(group).toHaveCount(1);
    await expect(group.locator(".hospitation-pattern-card__metric strong")).toHaveText(["2", "2"]);
    const title = group.locator(".hospitation-pattern-card__title");
    await expect(title).toContainText(phase);
    await expect(group.locator(".hospitation-pattern-card__main")).not.toContainText(/scheitert|blockiert|lösen Rückfragen|weil|entscheidet darüber|brauchen klare|müssen früher/i);
    await group.locator("[data-hospitation-pattern-select]").click();
    await expect(group.locator("[data-hospitation-pattern-observation]")).toHaveCount(2);
    await expect(group).not.toContainText("Nicht als Hindernis zählen");
  }
});

test("Drei Codes können ohne zusätzliche Beobachtungsart neutral verglichen werden", async ({ page }) => {
  const fixture = observationFixture((row) => [
    row({ title: "Unbewertet A", problemType: "Doppelte Dokumentation", observationType: "" }),
    row({ title: "Unbewertet B", problemType: "Doppelte Dokumentation", observationType: "" }, 1),
    row({ title: "Ausdrücklich Hindernis", problemType: "Doppelte Dokumentation", observationType: "Hindernis" }),
    row({ title: "Ausdrücklich gelungen", problemType: "Doppelte Dokumentation", observationType: "Gelungener Ablauf" })
  ]);
  await gotoAuthenticated(page, comparisonRoute, { role: "admin", backendFixture: fixture });
  const groups = page.locator("#hospitation-patterns-panel [data-hospitation-pattern]");
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toContainText("Noch nicht bewertet");
  await expect(groups.first().locator(".hospitation-pattern-card__metric strong")).toHaveText(["2", "2"]);
  await groups.first().locator("[data-hospitation-pattern-select]").click();
  await expect(groups.first().locator("[data-hospitation-pattern-observation]")).toHaveCount(2);
  await expect(groups.first()).not.toContainText("Ausdrücklich Hindernis");
  await expect(groups.first()).not.toContainText("Ausdrücklich gelungen");
  for (const title of ["Unbewertet A", "Unbewertet B"]) {
    expect(await loadedObservation(page, title)).toMatchObject({ observationType: "", impact: "", nextStep: "" });
  }
});
