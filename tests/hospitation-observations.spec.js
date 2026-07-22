import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const observationRoute = "/frontend/app/versorgungs-kompass.html#hospitations:observations";

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
  await expect(workbench.locator(".observation-page-header")).toContainText("Beobachtungen");
  await expect(workbench.locator("[data-observation-search-toggle]")).toBeVisible();
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

  const searchAlignment = await workbench.evaluate((root) => {
    const header = root.querySelector(".observation-page-header")?.getBoundingClientRect();
    const button = root.querySelector("[data-observation-search-toggle]")?.getBoundingClientRect();
    return header && button ? Math.abs(header.right - button.right) : Number.POSITIVE_INFINITY;
  });
  expect(searchAlignment).toBeLessThan(40);
  const headingFontSize = await workbench.locator(".observation-page-header__copy strong").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(headingFontSize).toBeGreaterThan((page.viewportSize()?.width || 0) > 700 ? 20 : 14);

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
  await workbench.locator("[data-observation-search-toggle]").click();
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
  await expect(drawer.locator(".observation-detail-card--source")).toContainText("Owner");
  await expect(drawer.locator("[data-observation-open-source]")).toBeVisible();
  await drawer.locator("#observation-detail-close").click();

  await workbench.locator(".observation-analysis-panel > summary").click();
  await expect(workbench.locator("#observation-matrix-title")).toHaveText("Qualitativer Fallvergleich");

  await expect(workbench.locator("[data-observation-new]")).toBeEnabled();
});

test("Beobachtung öffnet separat, ist editierbar und Mobile bleibt ohne Seitenüberlauf", async ({ page }) => {
  await gotoAuthenticated(page, observationRoute, { role: "admin" });
  const workbench = page.locator("#hospitation-observations-workbench");
  await workbench.locator("[data-observation-open]").first().click();
  const drawer = page.locator("#observation-detail-drawer");
  await expect(drawer.locator("[data-observation-edit]")).toBeVisible();
  await drawer.locator("[data-observation-edit]").click();
  const form = drawer.locator("[data-observation-edit-form]");
  await form.locator('[name="title"]').fill("Geprüfte Beobachtung");
  await form.locator('[name="description"]').fill("Synthetische Beobachtung für den geschützten Backend-Test.");
  await form.locator('[name="evidenceType"]').selectOption("directly_observed");
  await expect(form.locator(":invalid")).toHaveCount(0);
  await form.locator('button[type="submit"]').click();
  await expect(drawer.locator("#observation-detail-title")).toHaveText("Geprüfte Beobachtung");

  await drawer.locator("#observation-detail-close").click();
  await workbench.locator("[data-observation-new]").click();
  const createForm = drawer.locator("[data-observation-create-form]");
  await expect(createForm).toBeVisible();
  await createForm.locator('[name="hospitationId"]').selectOption({ index: 1 });
  await createForm.locator('[name="title"]').fill("Neue Listenbeobachtung");
  await createForm.locator('[name="description"]').fill("Die neue Beobachtung wurde direkt aus der globalen Liste dokumentiert.");
  await createForm.locator('button[type="submit"]').click();
  await expect(drawer.locator("#observation-detail-title")).toHaveText("Neue Listenbeobachtung");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer).toHaveClass(/is-open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
