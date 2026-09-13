import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const observationRoute = "/frontend/app/versorgungs-kompass.html#hospitations:observations";

function inlineObservationBackendFixture(role = "admin") {
  const fixture = createProtectedBackendFixture({ role });
  fixture.hospitations[0].scheduledOn = "2026-01-22";
  fixture.hospitationObservations = [{
    ...fixture.hospitationObservations[0],
    title: "Einzelbearbeitung einer synthetischen Beobachtung",
    situation: "Nur im Drawer sichtbare synthetische Situation",
    description: "Unveränderte Beschreibung des synthetischen Ablaufs.",
    problemType: "positives Muster / Best Practice",
    processPhase: "Kommunikation mit anderen Einrichtungen",
    impact: "Arbeitsfluss wird unterbrochen",
    usageRecommendation: "weiter validieren",
    evidenceType: "interpreted",
    relevanceScore: 4,
    involvedRoles: ["Synthetische Rolle"],
    affectedProducts: ["Synthetisches Produkt"],
    nextStep: "Separater nächster Schritt bleibt erhalten"
  }];
  return fixture;
}

async function openInlineObservation(page, fixture = inlineObservationBackendFixture(), role = "admin") {
  await gotoAuthenticated(page, observationRoute, { role, backendFixture: fixture });
  await page.locator(`[data-observation-open="${fixture.hospitationObservations[0].id}"]`).click();
  const drawer = page.locator("#observation-detail-drawer");
  await expect(drawer).toHaveClass(/is-open/);
  return drawer;
}

async function openInlineField(drawer, field, scope = "observation") {
  await drawer.locator(`[data-observation-edit-field="${field}"]`).click();
  const form = drawer.locator("[data-observation-inline-form]");
  await expect(form).toHaveCount(1);
  await expect(form).toHaveAttribute("data-observation-field", field);
  await expect(form).toHaveAttribute("data-observation-scope", scope);
  return form;
}

async function openLaterAssessment(drawer, field) {
  if (field && !["observationType", "usageRecommendation", "relevanceScore"].includes(field)) return;
  const assessment = drawer.locator("details.observation-detail-assessment");
  await expect(assessment).toHaveCount(1);
  if (!await assessment.evaluate((element) => element.open)) await assessment.locator("summary").click();
  return assessment;
}

async function chooseObservationCode(drawer, field, value) {
  await openLaterAssessment(drawer, field);
  if (field === "relevanceScore") {
    await drawer.locator(value === null ? "[data-observation-relevance-clear]" : `[data-observation-relevance-value="${value}"]`).click();
  } else {
    const trigger = drawer.locator(`[data-observation-code-toggle="${field}"]`);
    if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
    const choices = drawer.locator(`[data-observation-code-popover="${field}"]`);
    await expect(choices).toBeVisible();
    const hint = choices.locator(`[data-observation-input-hint="${field}"]`);
    await expect(hint).toBeVisible();
    await expect(choices.getByRole("listbox")).toHaveAttribute("aria-describedby", await hint.getAttribute("id"));
    await choices.locator(`[data-observation-code-option="${field}"][data-observation-code-value="${value}"]`).click();
  }
}

async function expectObservationCode(drawer, field, value, label = value) {
  if (["observationType", "usageRecommendation", "relevanceScore"].includes(field)) {
    await expect(drawer.locator("details.observation-detail-assessment")).toHaveJSProperty("open", true);
  }
  if (field === "relevanceScore") {
    if (value === null) {
      await expect(drawer.locator('[data-observation-relevance-value][aria-checked="true"]')).toHaveCount(0);
    } else {
      await expect(drawer.locator(`[data-observation-relevance-value="${value}"]`)).toHaveAttribute("aria-checked", "true");
    }
    await expect(drawer.locator('[data-observation-relevance-value="1"]')).toBeEnabled();
    await expect(drawer.locator('[data-observation-input-hint="relevanceScore"]')).toBeVisible();
  } else {
    await expect(drawer.locator(`[data-observation-code-popover="${field}"]`)).toBeHidden();
    const trigger = drawer.locator(`[data-observation-code-toggle="${field}"]`);
    await expect(trigger).toBeEnabled();
    if (label) await expect(trigger).toContainText(String(label));
  }
}

function codedObservationBackendFixture() {
  const fixture = createProtectedBackendFixture({ role: "admin" });
  const hospitationIds = fixture.hospitations.map((hospitation) => hospitation.id);
  const problemTypes = [
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
  ];
  const processPhases = [
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
  ];
  const codePairs = problemTypes.flatMap((problemType) =>
    processPhases.map((processPhase) => ({ problemType, processPhase }))
  );
  let sequence = 0;
  const observation = (pair, hospitationId) => {
    sequence += 1;
    return {
      id: `camel-observation-${String(sequence).padStart(3, "0")}`,
      hospitationId,
      sequence,
      title: `Codierte API-Beobachtung ${sequence}`,
      situation: "Synthetische Vertragssituation",
      description: "Synthetische Beobachtung für den camelCase-API-Vertrag.",
      observedAt: "09:15 Uhr",
      currentWorkaround: "Synthetischer Zwischenweg",
      nextStep: "Persistierter nächster Schritt am Einzelbeleg",
      processPhase: pair.processPhase,
      problemType: pair.problemType,
      impact: "Zeitaufwand",
      observationType: "Reibung / Problem",
      evidenceType: "directly_observed",
      relevanceScore: 4,
      usageRecommendation: "weiter validieren",
      involvedRoles: ["Synthetische Rolle"],
      affectedProducts: [],
      topics: ["Vertragstest"],
      status: "active",
      createdAt: "2026-07-20T08:00:00.000Z",
      createdBy: "demo-profile-admin",
      updatedAt: "2026-07-20T09:00:00.000Z",
      updatedBy: "demo-profile-admin"
    };
  };

  const coded = [];
  codePairs.slice(0, 17).forEach((pair, index) => {
    coded.push(observation(pair, hospitationIds[index % hospitationIds.length]));
    coded.push(observation(pair, hospitationIds[(index + 1) % hospitationIds.length]));
  });
  codePairs.slice(17, 56).forEach((pair, index) => {
    coded.push(observation(pair, hospitationIds[(index + 3) % hospitationIds.length]));
  });
  const legacy = Array.from({ length: 5 }, (_, index) => ({
    id: `camel-legacy-observation-${index + 1}`,
    hospitationId: hospitationIds[index % hospitationIds.length],
    sequence: sequence + index + 1,
    title: `Uncodierte Legacy-Beobachtung ${index + 1}`,
    description: "Historische Beobachtung ohne Problemtyp und Prozessphase.",
    evidenceType: "reported",
    status: "active",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T09:00:00.000Z"
  }));
  fixture.hospitationObservations = [...coded, ...legacy];
  return fixture;
}

test("camelCase-API-Codierung erzeugt 17 echte Muster, aber keine erfundenen Folgestufen", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations:patterns", {
    role: "admin",
    backendFixture: codedObservationBackendFixture()
  });

  const loadedObservations = await page.evaluate(() => window.dataService.loadHospitationObservations());
  expect(loadedObservations).toHaveLength(78);
  expect(loadedObservations.filter((row) => row.processPhase && row.problemType)).toHaveLength(73);
  expect(loadedObservations[0]).toMatchObject({
    processPhase: "Anmeldung / Aufnahme",
    problemType: "Medienbruch",
    observationType: "Reibung / Problem",
    evidenceType: "directly_observed",
    relevanceScore: 4,
    usageRecommendation: "weiter validieren",
    involvedRoles: ["Synthetische Rolle"],
    observedAt: "09:15 Uhr",
    currentWorkaround: "Synthetischer Zwischenweg",
    nextStep: "Persistierter nächster Schritt am Einzelbeleg",
    createdAt: "2026-07-20T08:00:00.000Z",
    createdBy: "demo-profile-admin",
    updatedAt: "2026-07-20T09:00:00.000Z",
    updatedBy: "demo-profile-admin"
  });

  const panel = page.locator("#hospitation-patterns-panel");
  await expect(panel.locator("[data-hospitation-pattern]")).toHaveCount(17);
  await expect(panel.locator("[data-hospitation-framework-count]")).toHaveText(["78", "17", "0", "0"]);
  await expect(panel).not.toContainText("Problemtyp offen");
  await expect(panel).not.toContainText("Prozessphase offen");
});

test("Beobachtungen nutzen geschützte Backend-Daten und eine filterbare Vollbreitenliste", async ({ page }) => {
  await gotoAuthenticated(page, observationRoute, { role: "admin" });

  const workbench = page.locator("#hospitation-observations-workbench");
  await expect(page.locator("#workspace-view-title")).toHaveText("Beobachtungen");
  await expect(workbench.locator(".observation-page-header__copy")).toHaveCount(0);
  await expect(workbench.locator("[data-observation-search-toggle]")).toHaveCount(0);
  await expect(workbench.locator(".observation-header-search")).toBeVisible();
  await expect(workbench.locator("[data-observation-new]")).toBeEnabled();
  await expect(workbench.locator("[data-hospitation-data-mode-switch]")).toHaveCount(0);
  await expect(workbench.locator(".observation-table-head")).toBeVisible();
  await expect(workbench.locator("[data-observation-open]").first()).toBeVisible();
  await expect(workbench.locator(".observation-workbench-body")).toHaveCount(0);
  await expect(workbench.locator("[data-observation-sort='contact']")).toBeVisible();
  await expect(workbench.locator("[data-observation-sort='organization']")).toHaveCount(0);
  await expect(workbench.locator("[data-observation-sort='evidenceType']")).toHaveCount(0);
  await expect(workbench.locator("[data-observation-sort='processPhase']")).toHaveCount(0);
  await expect(workbench.locator("[data-observation-sort='problemType']")).toHaveCount(0);
  await expect(workbench.locator(".observation-result-meta")).toHaveCount(0);
  const firstDateCell = workbench.locator("[data-observation-open]").first().locator(".observation-table-cell").nth(2);
  await expect(firstDateCell).toContainText(/\d{2}\.\d{2}\.\d{4}/);
  await expect(firstDateCell).not.toContainText("Rostock");

  const toolbarGeometry = await workbench.evaluate((root) => {
    const toolbar = root.querySelector(".observation-primary-toolbar")?.getBoundingClientRect();
    const createButton = root.querySelector("[data-observation-new]")?.getBoundingClientRect();
    const search = root.querySelector(".observation-header-search")?.getBoundingClientRect();
    return toolbar && createButton && search ? {
      mobile: matchMedia("(max-width: 760px)").matches,
      toolbarLeft: toolbar.left,
      toolbarRight: toolbar.right,
      createLeft: createButton.left,
      createRight: createButton.right,
      createBottom: createButton.bottom,
      searchLeft: search.left,
      searchRight: search.right,
      searchTop: search.top,
      searchHeight: search.height
    } : null;
  });
  expect(toolbarGeometry).not.toBeNull();
  expect(toolbarGeometry.searchHeight).toBeGreaterThanOrEqual(46);
  expect(Math.abs(toolbarGeometry.createLeft - toolbarGeometry.toolbarLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(toolbarGeometry.searchRight - toolbarGeometry.toolbarRight)).toBeLessThanOrEqual(1);
  if (toolbarGeometry.mobile) {
    expect(toolbarGeometry.searchTop).toBeGreaterThanOrEqual(toolbarGeometry.createBottom + 7);
  } else {
    expect(toolbarGeometry.searchLeft).toBeGreaterThanOrEqual(toolbarGeometry.createRight + 9);
  }

  const columnsButton = workbench.getByRole("button", { name: "Spalten anpassen" });
  await expect(columnsButton).toBeVisible();
  await columnsButton.click();
  await expect(workbench.locator("[data-observation-column-toggle='contact']")).toBeChecked();
  await expect(workbench.locator("[data-observation-column-toggle='organization']")).not.toBeChecked();
  await expect(workbench.locator("[data-observation-column-toggle='evidenceType']")).not.toBeChecked();
  await expect(workbench.locator("[data-observation-column-toggle='processPhase']")).not.toBeChecked();
  await expect(workbench.locator("[data-observation-column-toggle='problemType']")).not.toBeChecked();
  await workbench.locator("[data-observation-column-toggle='evidenceType']").check();
  await expect(workbench.locator("[data-observation-sort='evidenceType']")).toBeVisible();
  await columnsButton.click();
  await workbench.locator("[data-observation-column-toggle='organization']").check();
  await expect(workbench.locator("[data-observation-sort='organization']")).toBeVisible();
  await expect(workbench.locator("[data-observation-sort='contact']")).toBeVisible();
  await columnsButton.click();
  await workbench.locator("[data-observation-column-toggle='problemType']").check();
  await expect(workbench.locator("[data-observation-sort='problemType']")).toBeVisible();

  await workbench.locator("[data-observation-sort='title']").click();
  await expect(workbench.locator("[data-observation-sort='title']")).toHaveAttribute("aria-sort", "ascending");

  const initialRows = await workbench.locator("[data-observation-open]").count();
  expect(initialRows).toBeGreaterThan(3);
  await workbench.locator("[data-observation-query]").fill("Patient");
  const searchRows = await workbench.locator("[data-observation-open]").count();
  expect(searchRows).toBeGreaterThan(0);
  expect(searchRows).toBeLessThan(initialRows);
  await workbench.locator("[data-observation-search-clear]").click();
  await expect(workbench.locator("[data-observation-open]")).toHaveCount(initialRows);

  await workbench.getByRole("button", { name: "Problemtyp in Spalte filtern" }).click();
  const problemTypeOptions = workbench.locator('[data-observation-header-filter-menu][data-observation-filter-key="problemType"] [data-observation-filter-value]');
  await expect(problemTypeOptions.nth(1)).toBeVisible();
  await problemTypeOptions.nth(1).click();
  const filteredRows = await workbench.locator("[data-observation-open]").count();
  expect(filteredRows).toBeGreaterThan(0);
  expect(filteredRows).toBeLessThan(initialRows);

  await workbench.locator("[data-observation-open]").first().click();
  const drawer = page.locator("#observation-detail-drawer");
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer.locator(".observation-detail-card--source .observation-source-meta dt")).toHaveText(["Datum", "Ort", "Owner"]);
  await expect(drawer.locator("[data-observation-open-source]")).toBeVisible();
  await drawer.locator("#observation-detail-close").click();

  await workbench.locator(".observation-analysis-panel > summary").click();
  await expect(workbench.locator("#observation-matrix-title")).toHaveText("Qualitativer Fallvergleich");

  await expect(workbench.locator("[data-observation-new]")).toBeEnabled();
});

test("Gesamtformular verwendet Kurzfassung und vereinte Beobachtung ohne separates Situationsfeld", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const drawer = await openInlineObservation(page, fixture);
  const workbench = page.locator("#hospitation-observations-workbench");
  await expect(drawer.locator("[data-observation-edit]")).toBeVisible();
  await drawer.locator("[data-observation-edit]").click();
  const form = drawer.locator("[data-observation-edit-form]");
  await expect(form.locator('[name="situation"], [name="situationContext"]')).toHaveCount(0);
  await expect(form.getByRole("textbox", { name: "Kurzfassung", exact: true })).toHaveValue(initial.title);
  await expect(form.getByRole("textbox", { name: "Beobachtung", exact: true })).toHaveValue(`${initial.situation}\n\n${initial.description}`);
  await form.locator('[name="title"]').fill("Geprüfte Beobachtung");
  const updatedDescription = "Synthetische Beobachtung für den geschützten Backend-Test.";
  await form.locator('[name="description"]').fill(updatedDescription);
  await form.locator('[name="evidenceType"]').selectOption("directly_observed");
  await expect(form.locator(":invalid")).toHaveCount(0);
  const updateRequest = page.waitForRequest((request) => request.method() === "PATCH"
    && new URL(request.url()).pathname === `/api/hospitation-observations/${initial.id}`);
  await form.locator('button[type="submit"]').click();
  expect((await updateRequest).postDataJSON()).toMatchObject({ description: updatedDescription, situation: "", situationContext: "", expectedUpdatedAt: initial.updatedAt });
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText("Geprüfte Beobachtung");
  await expect(drawer.locator("#observation-detail-title")).toHaveText("Beobachtung");

  await drawer.locator("#observation-detail-close").click();
  await workbench.locator("[data-observation-new]").click();
  const createForm = drawer.locator("[data-observation-create-form]");
  await expect(createForm).toBeVisible();
  await expect(createForm.locator('[name="situation"], [name="situationContext"]')).toHaveCount(0);
  await expect(createForm.getByRole("textbox", { name: "Kurzfassung", exact: true })).toBeVisible();
  await expect(createForm.getByRole("textbox", { name: "Beobachtung", exact: true })).toBeVisible();
  await createForm.locator('[name="hospitationId"]').selectOption({ index: 1 });
  await createForm.locator('[name="title"]').fill("Neue Listenbeobachtung");
  await createForm.locator('[name="description"]').fill("Die neue Beobachtung wurde direkt aus der globalen Liste dokumentiert.");
  await createForm.locator('button[type="submit"]').click();
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText("Neue Listenbeobachtung");
  await expect(drawer.locator("#observation-detail-title")).toHaveText("Beobachtung");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer).toHaveClass(/is-open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("Vereinte Beobachtung erhält alten Kontext und speichert ihn ohne Doppelung oder Wiederauftauchen", async ({ page }) => {
  const fixture = inlineObservationBackendFixture("editor");
  fixture.hospitationObservations[0].situationContext = fixture.hospitationObservations[0].situation;
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const mutations = [];
  page.on("request", (request) => {
    if (["PATCH", "PUT", "POST"].includes(request.method()) && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
  });
  const drawer = await openInlineObservation(page, fixture, "editor");
  const combined = `${initial.situation}\n\n${initial.description}`;
  const observationText = drawer.locator('[data-observation-field="description"] .observation-detail-field__text');
  await expect(observationText).toHaveText(combined);
  expect((await observationText.textContent()).split(initial.situation)).toHaveLength(2);
  await expect(drawer.locator('[data-observation-field="situation"], [data-observation-edit-field="situation"], [data-observation-info="situation"]')).toHaveCount(0);
  expect(fixture.hospitationObservations[0]).toEqual(initial);
  expect(mutations).toEqual([]);

  const descriptions = [
    `${combined}\n\nErgänzende synthetische Beobachtung.`,
    `${combined}\n\nErgänzende synthetische Beobachtung.\n\nWeitere Beobachtung nach erneutem Öffnen.`,
    `${initial.description}\n\nDer Kontext wurde bewusst entfernt.`
  ];
  let previousDescription = combined;
  for (const description of descriptions) {
    const previousUpdatedAt = fixture.hospitationObservations[0].updatedAt;
    const form = await openInlineField(drawer, "description");
    const input = form.locator('[name="description"]');
    await expect(input).toHaveValue(previousDescription);
    await input.fill(description);
    const patchRequest = page.waitForRequest((request) =>
      request.method() === "PATCH" && new URL(request.url()).pathname === `/api/hospitation-observations/${initial.id}`
    );
    await form.locator("[data-observation-inline-save]").click();
    expect((await patchRequest).postDataJSON()).toEqual({ description, situation: "", situationContext: "", expectedUpdatedAt: previousUpdatedAt });
    await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
    await expect(observationText).toHaveText(description);
    expect(fixture.hospitationObservations[0]).toMatchObject({ ...initial, description, situation: "", situationContext: "", updatedAt: fixture.hospitationObservations[0].updatedAt });
    await drawer.locator("#observation-detail-close").click();
    await page.locator(`[data-observation-open="${initial.id}"]`).click();
    await expect(observationText).toHaveText(description);
    previousDescription = description;
  }
  await page.reload();
  await page.locator(`[data-observation-open="${initial.id}"]`).click();
  await expect(observationText).toHaveText(previousDescription);
  await expect(observationText).not.toContainText(initial.situation);
  const reopened = await openInlineField(drawer, "description");
  await expect(reopened.locator('[name="description"]')).toHaveValue(previousDescription);
  await reopened.locator("[data-observation-inline-cancel]").click();
  expect(mutations).toHaveLength(descriptions.length);
});

test("Kurzfassung prüft Pflichttext und ändert den Titel ohne alten Beobachtungskontext zu verlieren", async ({ page }) => {
  const fixture = inlineObservationBackendFixture("editor");
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const drawer = await openInlineObservation(page, fixture, "editor");
  const titleEdit = drawer.locator('[data-observation-edit-field="title"]');
  await expect(titleEdit).toHaveAttribute("aria-label", "Kurzfassung bearbeiten");
  const mutations = [];
  page.on("request", (request) => {
    if (["PATCH", "PUT", "POST"].includes(request.method()) && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
  });
  let form = await openInlineField(drawer, "title");
  let input = form.locator('[name="title"]');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("required", "");
  for (const emptyTitle of ["", "   "]) {
    await input.fill(emptyTitle);
    await form.locator("[data-observation-inline-save]").click();
    await expect(form).toBeVisible();
    expect(mutations).toEqual([]);
    expect(fixture.hospitationObservations[0]).toEqual(initial);
  }
  await input.fill("Dieser Titel wird verworfen");
  await form.locator("[data-observation-inline-cancel]").click();
  await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText(initial.title);
  await expect(titleEdit).toBeFocused();
  expect(mutations).toEqual([]);

  form = await openInlineField(drawer, "title");
  input = form.locator('[name="title"]');
  const title = "Präziser Titel nach Einzelkorrektur";
  await input.fill(`  ${title}  `);
  const saved = page.waitForRequest((request) => request.method() === "PATCH"
    && new URL(request.url()).pathname === `/api/hospitation-observations/${initial.id}`);
  await form.locator("[data-observation-inline-save]").click();
  expect((await saved).postDataJSON()).toEqual({ title, expectedUpdatedAt: initial.updatedAt });
  await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText(title);
  await expect(page.locator(`[data-observation-open="${initial.id}"]`)).toContainText(title);
  await expect(titleEdit).toBeFocused();
  expect(fixture.hospitationObservations[0]).toMatchObject({ ...initial, title, updatedAt: fixture.hospitationObservations[0].updatedAt });
  await expect(drawer.locator('[data-observation-field="description"] .observation-detail-field__text')).toHaveText(`${initial.situation}\n\n${initial.description}`);
  expect(mutations).toHaveLength(1);

  const latestUpdatedAt = fixture.hospitationObservations[0].updatedAt;
  await page.route(`**/api/hospitation-observations/${initial.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Die Beobachtung wurde zwischenzeitlich geändert." }) });
  });
  form = await openInlineField(drawer, "title");
  input = form.locator('[name="title"]');
  const conflictedTitle = "Diese Titelkorrektur bleibt im Editor erhalten";
  await input.fill(conflictedTitle);
  const conflict = page.waitForRequest((request) => request.method() === "PATCH"
    && new URL(request.url()).pathname === `/api/hospitation-observations/${initial.id}`);
  await form.locator("[data-observation-inline-save]").click();
  expect((await conflict).postDataJSON()).toEqual({ title: conflictedTitle, expectedUpdatedAt: latestUpdatedAt });
  await expect(form.locator("[data-observation-inline-status]")).not.toBeEmpty();
  await expect(input).toHaveValue(conflictedTitle);
  await expect(form.locator("[data-observation-inline-save]")).toBeEnabled();
  expect(fixture.hospitationObservations[0].title).toBe(title);
  await form.locator("[data-observation-inline-cancel]").click();
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText(title);
  await expect(titleEdit).toBeFocused();
  expect(mutations).toHaveLength(2);
});

for (const role of ["admin", "viewer"]) {
  test(`Feldhilfen erklären Beobachtung und sieben Codes auch für ${role} ohne Datenänderung`, async ({ page }) => {
    const fixture = inlineObservationBackendFixture(role);
    const initialObservation = structuredClone(fixture.hospitationObservations[0]);
    const initialParents = structuredClone(fixture.hospitations);
    const drawer = await openInlineObservation(page, fixture, role);
    const mutations = [];
    page.on("request", (request) => {
      if (["PATCH", "PUT", "POST", "DELETE"].includes(request.method()) && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
    });
    const fields = ["description", "problemType", "processPhase", "impact", "evidenceType", "observationType", "usageRecommendation", "relevanceScore"];
    await expect(drawer.locator("[data-observation-info]")).toHaveCount(fields.length);
    for (const [index, field] of fields.entries()) {
      await openLaterAssessment(drawer, field);
      const button = drawer.locator(`[data-observation-info="${field}"]`);
      const help = drawer.locator(`[data-observation-help="${field}"]`);
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await expect(help).toBeHidden();
      if (index % 2 === 0) await button.click();
      else {
        await button.focus();
        await button.press("Enter");
      }
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await expect(help).toBeVisible();
      await expect(help).not.toBeEmpty();
      await expect(button).toHaveAttribute("aria-controls", await help.getAttribute("id"));
      expect(await help.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      if (index === 0) {
        await button.click();
        await expect(help).toBeHidden();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await button.press("Enter");
        await expect(help).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await expect(button).toBeFocused();
      await expect(drawer).toHaveClass(/is-open/);
    }
    expect(mutations).toEqual([]);
    expect(fixture.hospitationObservations[0]).toEqual(initialObservation);
    expect(fixture.hospitations).toEqual(initialParents);
  });
}

test("Eingabehinweise bleiben beim Bearbeiten verfügbar und Escape schließt Hilfe vor dem Entwurf", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const initialObservation = structuredClone(fixture.hospitationObservations[0]);
  const drawer = await openInlineObservation(page, fixture);
  const mutations = [];
  page.on("request", (request) => {
    if (["PATCH", "PUT", "POST"].includes(request.method()) && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
  });
  for (const field of ["title", "description"]) {
    const form = await openInlineField(drawer, field);
    const input = form.locator(`[name="${field}"]`);
    const hint = form.locator(`[data-observation-input-hint="${field}"]`);
    await expect(hint).toBeVisible();
    await expect(hint).not.toBeEmpty();
    expect((await input.getAttribute("aria-describedby") || "").split(/\s+/)).toContain(await hint.getAttribute("id"));
    const draft = `Ungespeicherter synthetischer Entwurf für ${field}`;
    await input.fill(draft);
    if (field !== "title") {
      const info = drawer.locator(`[data-observation-info="${field}"]`);
      const help = drawer.locator(`[data-observation-help="${field}"]`);
      await info.click();
      await expect(help).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await expect(info).toBeFocused();
      await expect(form).toBeVisible();
      await expect(input).toHaveValue(draft);
      await expect(drawer).toHaveClass(/is-open/);
    }
    await form.locator("[data-observation-inline-cancel]").click();
    await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
    await expect(drawer.locator(`[data-observation-edit-field="${field}"]`)).toBeFocused();
  }
  expect(mutations).toEqual([]);
  expect(fixture.hospitationObservations[0]).toEqual(initialObservation);
});

test("Codebuch 1.1 zeigt verständliche Labels und speichert die zugehörigen Werte", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  Object.assign(fixture.hospitationObservations[0], {
    problemType: "Technik gestört",
    processPhase: "Aufnahme",
    impact: "Zusätzliche Arbeit",
    evidenceType: "source_bound",
    observationType: "Hindernis"
  });
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const mutations = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
  });
  const drawer = await openInlineObservation(page, fixture);
  const assessment = drawer.locator("details.observation-detail-assessment");
  await expect(assessment.locator("summary")).toHaveText("Spätere Bewertung");
  await expect(assessment).toHaveJSProperty("open", false);
  for (const field of ["observationType", "usageRecommendation", "relevanceScore"]) {
    await expect(assessment.locator(`[data-observation-field="${field}"]`)).toBeHidden();
  }
  const primary = drawer.locator(".observation-detail-card--coding > .observation-detail-coding-grid");
  await expect(primary.locator("[data-observation-field]")).toHaveCount(3);
  await expect(drawer.locator('.observation-detail-card--finding [data-observation-field="evidenceType"]')).toBeVisible();
  await expect(drawer.locator('[data-observation-field="evidenceType"] .observation-detail-field__head > span')).toHaveText("Quelle");
  await expect(drawer.locator("[data-observation-evidence-option], .observation-evidence-segments")).toHaveCount(0);
  await expect(drawer.locator('[data-observation-code-toggle="problemType"]')).toContainText("Technische Störung");
  await expect(drawer.locator('[data-observation-code-toggle="evidenceType"]')).toContainText("Beobachtungsunterlage");
  const menus = [
    ["problemType", ["", "Information fehlt", "Doppelte Dokumentation", "Technik gestört", "Abstimmung unklar", "Verständnis erschwert", "Kapazität fehlt", "Anderer Aspekt", "Kein Hindernis", "Noch nicht zuordenbar"]],
    ["processPhase", ["", "Zugang", "Aufnahme", "Abklärung", "Versorgung", "Übergang", "Nachsorge", "Übergreifend", "Noch nicht zuordenbar"]],
    ["impact", ["", "Zusätzliche Arbeit", "Verzögerung", "Fehler", "Belastung", "Entlastung", "Andere Folge", "Nicht feststellbar"]],
    ["evidenceType", ["", "directly_observed", "reported", "source_bound", "interpreted", "synthetic_source_based"]]
  ];
  for (const [field, values] of menus) {
    const trigger = drawer.locator(`[data-observation-code-toggle="${field}"]`);
    await trigger.click();
    const options = drawer.locator(`[data-observation-code-popover="${field}"] [data-observation-code-option="${field}"]`);
    await expect(options).toHaveCount(values.length);
    expect(await options.evaluateAll((elements) => elements.map((element) => element.dataset.observationCodeValue))).toEqual(values);
    if (field === "problemType") {
      await expect(drawer.locator('[data-observation-code-option="problemType"][data-observation-code-value="Information fehlt"]')).toContainText("Fehlende Information");
    }
    if (field === "evidenceType") {
      for (const [value, label] of [["source_bound", "Beobachtungsunterlage"], ["interpreted", "Annahme"], ["synthetic_source_based", "synthetisches Beispiel"]]) {
        await expect(drawer.locator(`[data-observation-code-option="evidenceType"][data-observation-code-value="${value}"]`)).toContainText(label);
      }
    }
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(drawer).toHaveClass(/is-open/);
  }
  expect(mutations).toEqual([]);
  expect(fixture.hospitationObservations[0]).toEqual(initial);
  const patchRequest = page.waitForRequest((request) => request.method() === "PATCH"
    && new URL(request.url()).pathname === `/api/hospitation-observations/${initial.id}`);
  await chooseObservationCode(drawer, "problemType", "Information fehlt");
  expect((await patchRequest).postDataJSON()).toEqual({ problemType: "Information fehlt", expectedUpdatedAt: initial.updatedAt });
  await expectObservationCode(drawer, "problemType", "Information fehlt", "Fehlende Information");
  expect(fixture.hospitationObservations[0].problemType).toBe("Information fehlt");
  expect(fixture.hospitationObservations[0].evidenceType).toBe("source_bound");
  await expect(assessment).toHaveJSProperty("open", false);

  await drawer.locator("[data-observation-edit]").click();
  const form = drawer.locator("[data-observation-edit-form]");
  await expect(form.locator('[name="problemType"]')).toHaveValue("Information fehlt");
  await expect(form.locator('[name="problemType"] option:checked')).toHaveText("Fehlende Information");
  await expect(form.locator('[name="evidenceType"]')).toHaveValue("source_bound");
  await expect(form.locator('[name="evidenceType"] option:checked')).toHaveText("Beobachtungsunterlage");
  await form.locator("[data-observation-edit-cancel]").click();
  expect(mutations).toHaveLength(1);
});

test("Bisherige Codierungen bleiben beim Lesen und bei einer reinen Textänderung erhalten", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  fixture.hospitationObservations[0].observationType = "Reibung / Problem";
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const fields = ["problemType", "processPhase", "impact", "observationType"];
  const mutations = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
  });
  const drawer = await openInlineObservation(page, fixture);
  for (const field of fields) {
    await openLaterAssessment(drawer, field);
    const trigger = drawer.locator(`[data-observation-code-toggle="${field}"]`);
    await expect(trigger).toContainText(initial[field]);
    await trigger.click();
    const current = drawer.locator(`[data-observation-code-option="${field}"][data-observation-code-value="${initial[field]}"]`);
    await expect(current).toHaveAttribute("aria-selected", "true");
    await expect(current).toContainText("bisherige Codierung");
    await current.click();
    await expect(drawer.locator(`[data-observation-code-popover="${field}"]`)).toBeHidden();
  }
  expect(mutations).toEqual([]);
  expect(fixture.hospitationObservations[0]).toEqual(initial);
  await drawer.locator("[data-observation-edit]").click();
  const fullForm = drawer.locator("[data-observation-edit-form]");
  for (const field of fields) await expect(fullForm.locator(`[name="${field}"]`)).toHaveValue(initial[field]);
  await fullForm.locator("[data-observation-edit-cancel]").click();
  expect(mutations).toEqual([]);

  const form = await openInlineField(drawer, "title");
  await form.locator('[name="title"]').fill("Neue Kurzfassung bei bestehender Codierung");
  const request = page.waitForRequest((item) => item.method() === "PATCH"
    && new URL(item.url()).pathname === `/api/hospitation-observations/${initial.id}`);
  await form.locator("[data-observation-inline-save]").click();
  expect((await request).postDataJSON()).toEqual({ title: "Neue Kurzfassung bei bestehender Codierung", expectedUpdatedAt: initial.updatedAt });
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText("Neue Kurzfassung bei bestehender Codierung");
  const persisted = (await page.evaluate(() => window.dataService.loadHospitationObservations())).find((row) => row.id === initial.id);
  for (const field of [...fields, "evidenceType", "usageRecommendation", "relevanceScore", "situation", "description"]) {
    expect(fixture.hospitationObservations[0][field], field).toEqual(initial[field]);
    expect(persisted[field], field).toEqual(initial[field]);
  }
  expect(mutations).toHaveLength(1);
});

test("Codes speichern jede Direktwahl einzeln mit Versionsstand und Relevanz lässt sich zurücksetzen", async ({ page }) => {
  const fixture = inlineObservationBackendFixture("editor");
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const drawer = await openInlineObservation(page, fixture, "editor");
  const parentMutations = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && /\/api\/hospitations\//.test(new URL(request.url()).pathname)) parentMutations.push(request);
  });
  const expected = { ...initial };
  const updates = [
    ["problemType", "Information fehlt", "Fehlende Information"],
    ["processPhase", "Nachsorge"],
    ["impact", "Zusätzliche Arbeit"],
    ["observationType", "Hindernis"],
    ["usageRecommendation", ""],
    ["evidenceType", "source_bound", "Beobachtungsunterlage"],
    ["evidenceType", "synthetic_source_based", "synthetisches Beispiel"],
    ["evidenceType", "reported", "berichtet"],
    ["evidenceType", ""],
    ["relevanceScore", 2],
    ["relevanceScore", null]
  ];
  for (const [field, value, label = value] of updates) {
    const previousUpdatedAt = fixture.hospitationObservations[0].updatedAt;
    const patchRequest = page.waitForRequest((request) => request.method() === "PATCH"
      && new URL(request.url()).pathname === `/api/hospitation-observations/${initial.id}`);
    await chooseObservationCode(drawer, field, value);
    expect((await patchRequest).postDataJSON()).toEqual({ [field]: value, expectedUpdatedAt: previousUpdatedAt });
    await expectObservationCode(drawer, field, value, label);
    await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
    expected[field] = value;
    expect(fixture.hospitationObservations[0]).toMatchObject({ ...expected, updatedAt: fixture.hospitationObservations[0].updatedAt });
  }
  const persisted = await page.evaluate(() => window.dataService.loadHospitationObservations());
  expect(persisted[0]).toMatchObject({ ...expected, updatedAt: fixture.hospitationObservations[0].updatedAt });
  await expect(drawer.locator('[data-observation-field="description"] .observation-detail-field__text')).toHaveText(`${initial.situation}\n\n${initial.description}`);
  expect(parentMutations).toEqual([]);
});

test("Fehlgeschlagene Codewahl hält den gespeicherten Wert und lässt eine erneute Wahl zu", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const drawer = await openInlineObservation(page, fixture);
  let releaseFailure;
  const failurePending = new Promise((resolve) => { releaseFailure = resolve; });
  let rejectNext = true;
  await page.route(`**/api/hospitation-observations/${initial.id}`, async (route) => {
    if (route.request().method() !== "PATCH" || !rejectNext) return route.fallback();
    rejectNext = false;
    await failurePending;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Die Codewahl konnte nicht gespeichert werden." }) });
  });
  const request = page.waitForRequest((item) => item.method() === "PATCH"
    && new URL(item.url()).pathname === `/api/hospitation-observations/${initial.id}`);
  await chooseObservationCode(drawer, "problemType", "Doppelte Dokumentation");
  expect((await request).postDataJSON()).toEqual({ problemType: "Doppelte Dokumentation", expectedUpdatedAt: initial.updatedAt });
  await expect(drawer.locator('[data-observation-code-toggle="problemType"]')).toContainText(initial.problemType);
  expect(fixture.hospitationObservations[0]).toEqual(initial);
  releaseFailure();
  await expect(drawer.locator('[data-observation-code-status="problemType"]')).not.toBeEmpty();
  await expect(drawer.locator('[data-observation-code-toggle="problemType"]')).toContainText(initial.problemType);
  await expect(drawer.locator('[data-observation-code-toggle="problemType"]')).toBeEnabled();
  expect(fixture.hospitationObservations[0]).toEqual(initial);

  const retry = page.waitForRequest((item) => item.method() === "PATCH"
    && new URL(item.url()).pathname === `/api/hospitation-observations/${initial.id}`);
  await chooseObservationCode(drawer, "problemType", "Doppelte Dokumentation");
  expect((await retry).postDataJSON()).toEqual({ problemType: "Doppelte Dokumentation", expectedUpdatedAt: initial.updatedAt });
  await expectObservationCode(drawer, "problemType", "Doppelte Dokumentation");
  await expect(drawer.locator('[data-observation-code-status="problemType"]')).toHaveText("Gespeichert");
  await expect(drawer.locator('[data-observation-code-status="problemType"]')).not.toHaveClass(/is-error/);
  expect(fixture.hospitationObservations[0]).toMatchObject({ ...initial, problemType: "Doppelte Dokumentation", updatedAt: fixture.hospitationObservations[0].updatedAt });
});

test("Späte Historie öffnet nach Navigation keinen alten Drawer und Codewahl bleibt bei ihrer Beobachtung", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const first = structuredClone(fixture.hospitationObservations[0]);
  const second = {
    ...structuredClone(first),
    id: "synthetic-delayed-history-observation",
    sequence: 2,
    title: "Zweite synthetische Beobachtung mit verzögerter Historie"
  };
  fixture.hospitationObservations.push(second);
  const drawer = await openInlineObservation(page, fixture);
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText(first.title);
  await drawer.locator("#observation-detail-close").click();
  await expect(drawer).not.toHaveClass(/is-open/);

  const historyPath = `/__test/observation-history/${second.id}`;
  let releaseHistory;
  const historyPending = new Promise((resolve) => { releaseHistory = resolve; });
  await page.route((url) => url.pathname === historyPath, async (route) => {
    await historyPending;
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  // Die reale History-Methode liefert derzeit sofort []. Nur ihr Antwortzeitpunkt wird hier gesteuert.
  await page.evaluate(({ id, path }) => {
    const loadHistory = window.dataService.loadHospitationObservationHistory.bind(window.dataService);
    let delayNext = true;
    window.dataService.loadHospitationObservationHistory = (observationId) => {
      if (observationId !== id || !delayNext) return loadHistory(observationId);
      delayNext = false;
      return fetch(path).then((response) => response.json());
    };
  }, { id: second.id, path: historyPath });
  const mutations = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
  });

  try {
    const requestedHistory = page.waitForRequest((request) => new URL(request.url()).pathname === historyPath);
    await page.locator(`[data-observation-open="${second.id}"]`).click();
    await requestedHistory;
    await expect(drawer).not.toHaveClass(/is-open/);
    await expect(drawer.locator('[data-observation-code-toggle="problemType"]')).toBeHidden();
    await page.goto("/frontend/app/versorgungs-kompass.html#hospitations:patterns");
    await expect(page.locator("#hospitation-patterns-panel")).toBeVisible();
    await page.goto(observationRoute);
    await expect(page.locator("#hospitation-observations-workbench")).toBeVisible();

    const returnedHistory = page.waitForResponse((response) => new URL(response.url()).pathname === historyPath);
    releaseHistory();
    await (await returnedHistory).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(drawer).not.toHaveClass(/is-open/);
    await expect(page.locator("#hospitation-observations-workbench")).toBeVisible();
    expect(mutations).toEqual([]);

    await page.goto(observationRoute);
    await page.locator(`[data-observation-open="${second.id}"]`).click();
    await expect(drawer).toHaveClass(/is-open/);
    await expect(drawer.locator("h3.observation-detail-title")).toHaveText(second.title);
    const previousUpdatedAt = second.updatedAt;
    const codeRequest = page.waitForRequest((request) => request.method() === "PATCH"
      && new URL(request.url()).pathname === `/api/hospitation-observations/${second.id}`);
    await chooseObservationCode(drawer, "impact", "Zusätzliche Arbeit");
    expect((await codeRequest).postDataJSON()).toEqual({ impact: "Zusätzliche Arbeit", expectedUpdatedAt: previousUpdatedAt });
    await expectObservationCode(drawer, "impact", "Zusätzliche Arbeit");
    expect(mutations).toHaveLength(1);
    expect(new URL(mutations[0].url()).pathname).toBe(`/api/hospitation-observations/${second.id}`);
    expect(fixture.hospitationObservations.find((row) => row.id === first.id)).toEqual(first);
    expect(fixture.hospitationObservations.find((row) => row.id === second.id).impact).toBe("Zusätzliche Arbeit");
  } finally {
    releaseHistory();
  }
});

test("Einzelbearbeitung verwirft abgebrochene Eingaben und hält sie bei einem Speicherfehler", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const drawer = await openInlineObservation(page, fixture);
  const mutations = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
  });
  let form = await openInlineField(drawer, "description");
  await expect(form.locator('[name="description"]')).toHaveValue(`${initial.situation}\n\n${initial.description}`);
  await form.locator('[name="description"]').fill("Diese Änderung wird verworfen.");
  await form.locator("[data-observation-inline-cancel]").click();
  await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
  expect(mutations).toHaveLength(0);
  expect(fixture.hospitationObservations[0]).toEqual(initial);
  await expect(drawer.locator('[data-observation-field="description"] .observation-detail-field__text')).toHaveText(`${initial.situation}\n\n${initial.description}`);

  await page.route(`**/api/hospitation-observations/${initial.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Die Beobachtung wurde zwischenzeitlich geändert." }) });
  });
  form = await openInlineField(drawer, "description");
  await form.locator('[name="description"]').fill("Diese Eingabe muss nach dem Fehler erhalten bleiben.");
  await form.locator("[data-observation-inline-save]").click();
  await expect(form.locator("[data-observation-inline-status]")).not.toBeEmpty();
  await expect(form.locator('[name="description"]')).toHaveValue("Diese Eingabe muss nach dem Fehler erhalten bleiben.");
  await expect(form.locator("[data-observation-inline-save]")).toBeEnabled();
  expect(fixture.hospitationObservations[0]).toEqual(initial);
  await form.locator("[data-observation-inline-cancel]").click();
  await expect(drawer.locator('[data-observation-field="description"] .observation-detail-field__text')).toHaveText(`${initial.situation}\n\n${initial.description}`);
});

test("Hospitationskontext bleibt ruhig und öffnet ausschließlich die Ursprungshospitation", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const parentId = fixture.hospitationObservations[0].hospitationId;
  const parent = fixture.hospitations.find((item) => item.id === parentId);
  const contact = fixture.contacts[0];
  const organization = fixture.organizations[0];
  organization.name = "Synthetische Sozialberatung Elbtor für sektorenübergreifende Versorgungskoordination";
  organization.normalizedName = organization.name.toLowerCase();
  for (const linkedContact of fixture.contacts.filter((item) => item.organizationId === organization.id)) {
    linkedContact.organization = organization.name;
  }
  const [firstOwner, secondOwner] = fixture.profiles;
  firstOwner.display_name = "Alexandra Maria Mustermann mit erweitertem Familiennamen";
  secondOwner.display_name = "Benedikt Maximilian Beispiel mit weiterem Familiennamen";
  Object.assign(parent, {
    contactId: contact.id,
    contactName: "",
    organizationId: organization.id,
    organizationName: "",
    location: "Synthetischer Beratungsraum",
    ownerId: firstOwner.id,
    ownerIds: [firstOwner.id, secondOwner.id]
  });
  const initialObservation = structuredClone(fixture.hospitationObservations[0]);
  const initialParent = structuredClone(parent);
  const initialContacts = structuredClone(fixture.contacts);
  const initialOrganizations = structuredClone(fixture.organizations);
  const initialProfiles = structuredClone(fixture.profiles);
  const mutations = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) && /\/api\/(hospitations|hospitation-observations|contacts|organizations|profiles?)(\/|$)/.test(new URL(request.url()).pathname)) mutations.push(request);
  });
  const drawer = await openInlineObservation(page, fixture);
  const section = drawer.locator(".observation-detail-card--source");
  await expect(section.locator("#observation-detail-source-title")).toHaveText("Hospitation");
  await expect(section.locator(".hospitation-documentation-profile-top")).toHaveCount(1);
  await expect(section.locator(".detail-profile-main > .avatar")).toBeVisible();
  await expect(section.locator(".detail-profile-copy h3")).toHaveText(contact.name);
  await expect(section.locator(".hospitation-context-organization-name")).toHaveText(organization.name);
  await expect(section.locator(".hospitation-context-organization-name")).toHaveJSProperty("tagName", "SPAN");
  await expect(section.locator('[data-hospitation-action="open-contact"], [data-hospitation-action="open-organization"], .hospitation-documentation-profile-link')).toHaveCount(0);
  await expect(section.locator("[data-observation-edit-field], [data-hospitation-owner-edit], input, select, textarea, form, .observation-detail-source-note")).toHaveCount(0);
  await expect(section).not.toContainText("Änderungen an der Herkunft");
  const metadata = section.locator(".observation-source-meta");
  await expect(metadata.locator("dt")).toHaveText(["Datum", "Ort", "Owner"]);
  await expect(metadata).toContainText("22.01.2026");
  await expect(metadata).toContainText(parent.location);
  await expect(metadata.locator("svg, img, .owner-badge__avatar, .observation-source-meta-icon")).toHaveCount(0);
  await expect(metadata.locator(".observation-source-owner-name")).toHaveText([firstOwner.display_name, secondOwner.display_name]);
  const geometry = await metadata.evaluate((element) => {
    const [date, location, owner] = [...element.querySelectorAll(".observation-source-meta-item")].map((item) => item.getBoundingClientRect());
    return {
      dateTop: date.top,
      dateBottom: date.bottom,
      locationTop: location.top,
      locationBottom: location.bottom,
      ownerTop: owner.top,
      overflow: [element, ...element.querySelectorAll(".observation-source-meta-item, .observation-source-owner-name")].map((item) => ({ text: item.textContent.trim(), horizontal: item.scrollWidth - item.clientWidth }))
    };
  });
  expect(Math.abs(geometry.dateTop - geometry.locationTop)).toBeLessThanOrEqual(1);
  expect(geometry.ownerTop).toBeGreaterThanOrEqual(Math.max(geometry.dateBottom, geometry.locationBottom));
  for (const item of geometry.overflow) expect(item.horizontal, item.text).toBeLessThanOrEqual(1);
  await expect(section.getByRole("button")).toHaveCount(1);
  const openParent = section.getByRole("button", { name: "In Hospitation öffnen", exact: true });
  await expect(openParent).toHaveAttribute("data-observation-open-source", parentId);
  await expect(section.locator("#observation-detail-source-title").locator("..").locator("[data-observation-open-source]")).toHaveCount(1);
  expect(mutations).toEqual([]);
  await openParent.click();
  await expect(drawer).not.toHaveClass(/is-open/);
  const hospitation = page.locator("#hospitation-editor-drawer");
  await expect(hospitation).toHaveClass(/is-open/);
  await expect(hospitation.locator(".detail-profile-copy h3")).toHaveText(contact.name);
  expect(mutations).toEqual([]);
  expect(fixture.hospitations.find((item) => item.id === parentId)).toEqual(initialParent);
  expect(fixture.hospitationObservations[0]).toEqual(initialObservation);
  expect(fixture.contacts).toEqual(initialContacts);
  expect(fixture.organizations).toEqual(initialOrganizations);
  expect(fixture.profiles).toEqual(initialProfiles);
});

test("Leserechte zeigen Beobachtung und Herkunft ohne Bearbeitungsaktionen", async ({ page }) => {
  const drawer = await openInlineObservation(page, inlineObservationBackendFixture("viewer"), "viewer");
  await expect(drawer.locator(".observation-detail-card--coding")).toBeVisible();
  await expect(drawer.locator("[data-observation-edit-field]")).toHaveCount(0);
  await expect(drawer.locator("[data-observation-edit]")).toHaveCount(0);
  await expect(drawer.locator("[data-observation-archive]")).toHaveCount(0);
  await expect(drawer.locator("[data-observation-open-source]")).toBeVisible();
  await expect(drawer.locator("[data-observation-code-toggle], [data-observation-code-option], [data-observation-evidence-option], [data-observation-relevance-value], [data-observation-relevance-clear]")).toHaveCount(0);
});

test("Codelisten lassen sich per Tastatur wählen und per Escape oder Außenklick ohne Änderung schließen", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const initial = structuredClone(fixture.hospitationObservations[0]);
  const drawer = await openInlineObservation(page, fixture);
  const mutations = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname.includes("hospitation")) mutations.push(request);
  });
  const trigger = drawer.locator('[data-observation-code-toggle="problemType"]');
  const choices = drawer.locator('[data-observation-code-popover="problemType"]');
  await trigger.focus();
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const listbox = choices.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-controls", await listbox.getAttribute("id"));
  await expect(choices).toBeVisible();
  const options = choices.locator('[data-observation-code-option="problemType"]');
  await page.keyboard.press("End");
  await expect(options.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(options.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(options.first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(choices).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(drawer).toHaveClass(/is-open/);

  const info = drawer.locator('[data-observation-info="problemType"]');
  const help = drawer.locator('[data-observation-help="problemType"]');
  await info.click();
  await expect(help).toBeVisible();
  await trigger.click();
  await options.first().focus();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(info).toHaveAttribute("aria-expanded", "false");
  await expect(choices).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(options.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(choices).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(drawer).toHaveClass(/is-open/);

  await trigger.click();
  await expect(choices).toBeVisible();
  await drawer.locator("h3.observation-detail-title").click();
  await expect(choices).toBeHidden();
  await expect(drawer).toHaveClass(/is-open/);
  expect(mutations).toEqual([]);
  expect(fixture.hospitationObservations[0]).toEqual(initial);

  await trigger.press("Enter");
  const chosen = choices.locator('[data-observation-code-value="Doppelte Dokumentation"]');
  await chosen.focus();
  const request = page.waitForRequest((item) => item.method() === "PATCH"
    && new URL(item.url()).pathname === `/api/hospitation-observations/${initial.id}`);
  await chosen.press("Enter");
  expect((await request).postDataJSON()).toEqual({ problemType: "Doppelte Dokumentation", expectedUpdatedAt: initial.updatedAt });
  await expectObservationCode(drawer, "problemType", "Doppelte Dokumentation");

  await openInlineField(drawer, "description");
  await page.keyboard.press("Escape");
  await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
  await expect(drawer).toHaveClass(/is-open/);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toHaveClass(/is-open/);
  expect(mutations).toHaveLength(1);
  expect(fixture.hospitationObservations[0].description).toBe(initial.description);
});

test("Kurzfassung und eine breite Beobachtung ersetzen die Situationbox, Codes und Hospitation bleiben lesbar", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const drawer = await openInlineObservation(page, fixture);
  await expect(page.locator("#hospitation-observations-workbench .observation-table-row")).not.toContainText(fixture.hospitationObservations[0].situation);
  await expect(drawer.locator('[data-observation-field="situation"], [data-observation-edit-field="situation"], [data-observation-info="situation"]')).toHaveCount(0);
  await expect(drawer.locator('[data-observation-field="description"] .observation-detail-field__text')).toHaveText(`${fixture.hospitationObservations[0].situation}\n\n${fixture.hospitationObservations[0].description}`);
  await expect(drawer.locator("#observation-detail-subtitle")).not.toContainText(/ID\s+\d|Interpretiert/);
  await expect(drawer).toHaveClass(/is-profile-mode/);
  await expect(drawer.locator(".observation-detail-hero")).toHaveCount(0);
  await expect(drawer.locator(".detail-profile-top .observation-evidence-label")).toHaveCount(0);
  await expect(drawer).not.toContainText("Dokumentierter Kontext und konkreter Befund");
  await expect(drawer.locator(".format-participant-header .observation-detail-id")).toHaveCount(0);
  await expect(drawer.locator("#observation-detail-title")).toHaveText("Beobachtung");
  await expect(drawer.locator(".observation-detail-id")).toContainText(/\d+/);
  await expect(drawer.locator(".observation-detail-id")).toHaveClass(/observation-row-number/);
  await expect(drawer.locator("h3.observation-detail-title")).toHaveText(fixture.hospitationObservations[0].title);
  await expect(drawer.locator(".detail-profile-copy .hospitation-context-organization-name")).toBeVisible();
  await expect(drawer.locator(".detail-profile-copy .hospitation-documentation-profile-link")).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Organisation öffnen", exact: true })).toHaveCount(0);
  await expect(drawer.locator(".observation-detail-card--source .hospitation-documentation-profile-top")).toHaveCount(1);
  await expect(drawer.locator("#observation-detail-source-title")).toHaveText("Hospitation");
  await expect(drawer.locator(".observation-detail-card--source .observation-source-meta dt")).toHaveText(["Datum", "Ort", "Owner"]);
  await expect(drawer.locator(".observation-detail-card--source [data-observation-field], .observation-detail-card--source [data-observation-edit-field]")).toHaveCount(0);
  await expect(drawer.locator(".observation-detail-card--coding [data-observation-edit-field]")).toHaveCount(0);
  await expect(drawer.locator(".observation-detail-copy-block")).toHaveCount(1);
  await expect(drawer.locator(".observation-detail-copy-block .observation-detail-field__head [data-observation-edit-field]")).toHaveCount(1);
  await expect(drawer.locator("[data-observation-edit-field]")).toHaveCount(2);
  await expect(drawer.locator('[data-observation-edit-field="title"]')).toHaveAttribute("aria-label", "Kurzfassung bearbeiten");
  await expect(drawer.locator('[data-observation-edit-field="description"]')).toHaveAttribute("aria-label", "Beobachtung bearbeiten");
  await expect(drawer.locator(".observation-detail-copy-block .observation-detail-field__head > span")).toHaveText("Beobachtung");
  await expect(drawer.locator(".observation-detail-field__value [data-observation-edit-field]")).toHaveCount(0);
  const header = await drawer.locator(".format-participant-header").evaluate((element) => {
    const title = element.querySelector("h3").getBoundingClientRect();
    const close = element.querySelector(".import-close").getBoundingClientRect();
    return { titleRight: title.right, titleMiddle: (title.top + title.bottom) / 2, closeLeft: close.left, closeRight: close.right, closeTop: close.top, closeBottom: close.bottom, viewportWidth: innerWidth };
  });
  expect(header.titleRight).toBeLessThanOrEqual(header.closeLeft);
  expect(header.closeRight).toBeLessThanOrEqual(header.viewportWidth);
  expect(header.titleMiddle).toBeGreaterThanOrEqual(header.closeTop);
  expect(header.titleMiddle).toBeLessThanOrEqual(header.closeBottom);
  const editPositions = await drawer.locator(".observation-detail-copy-block .observation-detail-field__head").evaluateAll((heads) => heads.map((head) => {
    const button = head.querySelector("[data-observation-edit-field]").getBoundingClientRect();
    const label = head.querySelector(":scope > span").getBoundingClientRect();
    const bounds = head.getBoundingClientRect();
    return {
      middleDifference: Math.abs((button.top + button.bottom - label.top - label.bottom) / 2),
      width: button.width,
      left: button.left,
      right: button.right,
      headLeft: bounds.left,
      headRight: bounds.right
    };
  }));
  for (const position of editPositions) {
    expect(position.middleDifference).toBeLessThanOrEqual(2);
    expect(position.width).toBeLessThanOrEqual(32);
    expect(position.left).toBeGreaterThanOrEqual(position.headLeft);
    expect(position.right).toBeLessThanOrEqual(position.headRight);
  }
  await openLaterAssessment(drawer);
  const geometry = await drawer.locator(".observation-detail-coding-item, .observation-detail-evidence").evaluateAll((items) => items.map((item) => {
    const bounds = item.getBoundingClientRect();
    return {
      text: item.textContent.trim(),
      horizontalOverflow: item.scrollWidth - item.clientWidth,
      verticalOverflow: item.scrollHeight - item.clientHeight,
      left: bounds.left,
      right: bounds.right,
      viewportWidth: innerWidth
    };
  }));
  expect(geometry).toHaveLength(7);
  for (const code of geometry) {
    expect(code.horizontalOverflow, code.text).toBeLessThanOrEqual(1);
    expect(code.verticalOverflow, code.text).toBeLessThanOrEqual(1);
    expect(code.left, code.text).toBeGreaterThanOrEqual(-1);
    expect(code.right, code.text).toBeLessThanOrEqual(code.viewportWidth + 1);
  }
  const contentGeometry = await drawer.evaluate((element) => {
    const block = element.querySelector('[data-observation-field="description"]');
    const bounds = block.getBoundingClientRect();
    const section = element.querySelector(".observation-detail-card--finding");
    const sectionStyle = getComputedStyle(section);
    return {
      blockWidth: bounds.width,
      availableWidth: section.clientWidth - parseFloat(sectionStyle.paddingLeft) - parseFloat(sectionStyle.paddingRight),
      blockOverflow: block.scrollWidth - block.clientWidth,
      sourceTop: element.querySelector(".observation-detail-card--source").getBoundingClientRect().top,
      codingBottom: element.querySelector(".observation-detail-card--coding").getBoundingClientRect().bottom,
      viewportWidth: innerWidth
    };
  });
  expect(contentGeometry.blockWidth / contentGeometry.availableWidth).toBeGreaterThan(0.95);
  expect(contentGeometry.blockWidth / contentGeometry.availableWidth).toBeLessThanOrEqual(1.01);
  expect(contentGeometry.blockOverflow).toBeLessThanOrEqual(1);
  expect(contentGeometry.sourceTop).toBeGreaterThanOrEqual(contentGeometry.codingBottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("Code-Auswahllisten bleiben auch im schmalen Drawer vollständig erreichbar", async ({ page }) => {
  const drawer = await openInlineObservation(page);
  const viewports = page.viewportSize().width > 700
    ? [{ width: 900, height: 1000 }, { width: 1024, height: 1000 }]
    : [page.viewportSize()];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openLaterAssessment(drawer);
    for (const field of ["evidenceType", "processPhase", "problemType", "impact", "observationType", "usageRecommendation"]) {
      await drawer.locator(`[data-observation-code-toggle="${field}"]`).click();
      const popover = drawer.locator(`[data-observation-code-popover="${field}"]`);
      await expect(popover).toBeVisible();
      const bounds = await popover.evaluate((element) => {
        const popup = element.getBoundingClientRect();
        const panel = element.closest(".format-participant-panel").getBoundingClientRect();
        return { left: popup.left, right: popup.right, panelLeft: panel.left, panelRight: panel.right, overflow: element.scrollWidth - element.clientWidth };
      });
      expect(bounds.left, `${field} bei ${viewport.width}px`).toBeGreaterThanOrEqual(bounds.panelLeft);
      expect(bounds.right, `${field} bei ${viewport.width}px`).toBeLessThanOrEqual(bounds.panelRight);
      expect(bounds.overflow, field).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();
    }
  }
});

test("Kompakte Herkunft nutzt das Kontaktprofil der Ursprungshospitation und dieselben Kopfaktionen", async ({ page }) => {
  const fixture = inlineObservationBackendFixture();
  const observation = await openInlineObservation(page, fixture);
  const mutations = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && /\/api\/(hospitations|hospitation-observations)\//.test(new URL(request.url()).pathname)) {
      mutations.push(request.url());
    }
  });

  async function profileGeometry(drawer, editSelector) {
    await expect(drawer).toHaveClass(/is-profile-mode/);
    await expect(drawer.locator(".detail-profile-top > .detail-profile-main")).toBeVisible();
    const edit = drawer.locator(`.hospitation-editor-header-actions ${editSelector}`);
    await expect(edit).toBeVisible();
    await expect(edit.locator("svg")).toBeVisible();
    const actionGeometry = await edit.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right, viewportWidth: innerWidth };
    });
    expect(actionGeometry.width).toBeGreaterThanOrEqual(32);
    expect(actionGeometry.height).toBeGreaterThanOrEqual(32);
    expect(actionGeometry.left).toBeGreaterThanOrEqual(0);
    expect(actionGeometry.right).toBeLessThanOrEqual(actionGeometry.viewportWidth);
    const profile = await drawer.evaluate((element) => {
      const panel = element.querySelector(".format-participant-panel");
      const header = element.querySelector(".format-participant-header");
      const avatar = element.querySelector(".detail-profile-main .avatar");
      const headerStyle = getComputedStyle(header);
      return {
        contactName: element.querySelector(".detail-profile-copy h3").textContent.trim(),
        organization: element.querySelector(".detail-profile-copy .hospitation-documentation-profile-link__text").textContent.trim(),
        panelWidth: panel.getBoundingClientRect().width,
        headerHeight: header.getBoundingClientRect().height,
        headerPadding: [headerStyle.paddingTop, headerStyle.paddingRight, headerStyle.paddingBottom, headerStyle.paddingLeft],
        avatarWidth: avatar.getBoundingClientRect().width,
        avatarHeight: avatar.getBoundingClientRect().height
      };
    });
    return { ...profile, actionWidth: actionGeometry.width, actionHeight: actionGeometry.height };
  }

  const observationGeometry = await profileGeometry(observation, "[data-observation-edit]");
  await observation.locator("[data-observation-open-source]").click();
  await expect(observation).not.toHaveClass(/is-open/);
  const hospitation = page.locator("#hospitation-editor-drawer");
  await expect(hospitation).toHaveClass(/is-open/);
  const hospitationGeometry = await profileGeometry(hospitation, '[data-hospitation-action="edit"]');

  expect(observationGeometry.contactName).toBe(hospitationGeometry.contactName);
  expect(observationGeometry.organization).toBe(hospitationGeometry.organization);
  expect(observationGeometry.avatarWidth).toBeGreaterThan(0);
  expect(observationGeometry.avatarHeight).toBe(observationGeometry.avatarWidth);
  expect(observationGeometry.avatarWidth).toBeLessThan(hospitationGeometry.avatarWidth);
  expect(observationGeometry.headerPadding).toEqual(hospitationGeometry.headerPadding);
  for (const dimension of ["panelWidth", "headerHeight", "actionWidth", "actionHeight"]) {
    expect(Math.abs(observationGeometry[dimension] - hospitationGeometry[dimension]), dimension).toBeLessThanOrEqual(1);
  }
  expect(mutations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

for (const entrypoint of ["index.html", "versorgungs-kompass.html"]) {
  test(`Pages ${entrypoint}: versionierte App-Dateien öffnen und bearbeiten wiederholt Beobachtungen`, async ({ page }) => {
    const unversionedAssets = [];
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // Ein alter Cacheeintrag unter der früheren URL darf nicht mit der neuen HTML-Hülle kombiniert werden.
    await page.route((url) => /^\/dist\/pages\/versorgungs-kompass\.(js|css)$/.test(url.pathname) && !url.searchParams.has("v"), async (route) => {
      unversionedAssets.push(route.request().url());
      const script = new URL(route.request().url()).pathname.endsWith(".js");
      await route.fulfill({
        contentType: script ? "application/javascript" : "text/css",
        body: script ? 'throw new Error("Veraltetes unversioniertes App-Skript geladen");' : "/* Veralteter unversionierter Stilstand */"
      });
    });
    await page.goto(`/dist/pages/${entrypoint}?demoProfile=demo-profile-admin#hospitations:observations`);

    for (const [selector, attribute] of [
      ['script[src*="versorgungs-kompass.js"]', "src"],
      ['link[rel="stylesheet"][href*="versorgungs-kompass.css"]', "href"]
    ]) {
      const asset = new URL(await page.locator(selector).getAttribute(attribute), page.url());
      expect(asset.searchParams.get("v")).toMatch(/^[a-f0-9]{64}$/);
      const response = await page.request.get(asset.href);
      expect(response.ok()).toBe(true);
      expect(asset.searchParams.get("v")).toBe(createHash("sha256").update(await response.body()).digest("hex"));
    }

    const rows = page.locator("#hospitation-observations-workbench [data-observation-open]");
    const first = page.getByRole("listitem", { name: "Befundanforderung wird mit Einwilligung vorbereitet öffnen", exact: true });
    await expect(first).toBeVisible();
    const firstId = await first.getAttribute("data-observation-open");
    await first.click();
    const drawer = page.locator("#observation-detail-drawer");
    await expect(drawer).toHaveClass(/is-open/);
    await expect(drawer.locator("#observation-detail-title")).toHaveText("Beobachtung");
    await expect(drawer.locator(".observation-detail-id")).toContainText("69");
    await expect(drawer.locator(".hospitation-editor-header-actions [data-observation-edit] svg")).toBeVisible();

    const inline = await openInlineField(drawer, "description");
    const correctedDescription = "Synthetische Korrektur im Pages-Regressionstest.";
    await inline.locator('[name="description"]').fill(correctedDescription);
    await inline.locator("[data-observation-inline-save]").click();
    await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
    await expect(drawer.locator('[data-observation-field="description"]')).toContainText(correctedDescription);

    await drawer.locator(".hospitation-editor-header-actions [data-observation-edit]").click();
    const edit = drawer.locator("[data-observation-edit-form]");
    await expect(edit).toBeVisible();
    await expect(edit.locator('[name="description"]')).toHaveValue(correctedDescription);
    await edit.locator("[data-observation-edit-cancel]").click();
    await expect(drawer.locator("#observation-detail-title")).toHaveText("Beobachtung");
    await expect(drawer.locator(".observation-detail-id")).toContainText("69");
    await drawer.locator("#observation-detail-close").click();
    await expect(drawer).not.toHaveClass(/is-open/);

    const second = rows.filter({ hasNotText: "Befundanforderung wird mit Einwilligung vorbereitet" }).first();
    expect(await second.getAttribute("data-observation-open")).not.toBe(firstId);
    const secondTitle = (await second.getAttribute("aria-label")).replace(/ öffnen$/, "");
    await second.click();
    await expect(drawer).toHaveClass(/is-open/);
    await expect(drawer.locator("h3.observation-detail-title")).toHaveText(secondTitle);
    const secondInline = await openInlineField(drawer, "description");
    await secondInline.locator("[data-observation-inline-cancel]").click();
    await expect(drawer.locator("[data-observation-inline-form]")).toHaveCount(0);
    await drawer.locator("#observation-detail-close").click();
    await expect(drawer).not.toHaveClass(/is-open/);
    expect(unversionedAssets).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
