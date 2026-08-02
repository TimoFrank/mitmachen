import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const APP_PATH = "/frontend/app/versorgungs-kompass.html";

async function expectContextualMultiSelect(page, {
  route,
  rowSelector,
  toolbarSelector,
  context,
  plural
}) {
  await gotoAuthenticated(page, `${APP_PATH}#${route}`, { role: "admin" });

  const rows = page.locator(rowSelector);
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(2);
  await expect(rows.first().locator("[data-contextual-row-select]")).toBeVisible();

  await rows.first().locator("[data-contextual-row-select]").check();
  const contextualToolbar = page.locator(`${toolbarSelector} > #contextual-bulk-toolbar`);
  await expect(contextualToolbar).toBeVisible();
  await expect(contextualToolbar).toHaveAttribute("data-selection-context", context);
  await expect(page.locator("#contextual-bulk-selection-count")).toContainText("1 ");

  await rows.nth(1).locator("[data-contextual-row-select]").check();
  await expect(page.locator("[data-contextual-row-select]:checked")).toHaveCount(2);
  await expect(page.locator("#contextual-bulk-selection-count")).toHaveText(`2 ${plural} ausgewählt`);
  await expect(contextualToolbar.getByRole("button", { name: "Exportieren" })).toBeVisible();

  await page.locator("#contextual-bulk-clear-selection").click();
  await expect(contextualToolbar).toBeHidden();
  await expect(page.locator("[data-contextual-row-select]:checked")).toHaveCount(0);
}

test.describe("Desktop-Mehrfachauswahl", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Mehrfachauswahl ist bewusst auf Desktop beschränkt.");
  });

test("Organisationen unterstützen eine sichtbare Mehrfachauswahl", async ({ page }) => {
  await expectContextualMultiSelect(page, {
    route: "organizations",
    rowSelector: "#organization-list [data-organization-id]",
    toolbarSelector: "#organization-table-toolbar",
    context: "organizations",
    plural: "Organisationen"
  });
});

test("Patienten-Personen unterstützen eine sichtbare Mehrfachauswahl", async ({ page }) => {
  await expectContextualMultiSelect(page, {
    route: "patients?view=people",
    rowSelector: "#patient-people-list [data-patient-person-id]",
    toolbarSelector: "#patient-table-toolbar",
    context: "patient-people",
    plural: "Personen"
  });
});

test("Patienten-Organisationen unterstützen eine sichtbare Mehrfachauswahl", async ({ page }) => {
  await expectContextualMultiSelect(page, {
    route: "patients?view=organizations",
    rowSelector: "#patient-organization-list [data-patient-organization-id]",
    toolbarSelector: "#patient-table-toolbar",
    context: "patient-organizations",
    plural: "Organisationen"
  });
});

test("Patienten-Indikationen exportieren die sichtbaren Ergebniszahlen", async ({ page }) => {
  await gotoAuthenticated(page, `${APP_PATH}#patients?view=indications`, { role: "admin" });

  const firstRow = page.locator("#patient-indications-list [data-patient-indication-row]").first();
  await expect(firstRow).toBeVisible();
  await firstRow.locator("[data-contextual-row-select]").check();
  await expect(page.locator("#contextual-bulk-toolbar")).toHaveAttribute("data-selection-context", "patient-indications");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#contextual-bulk-export").click()
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const csv = await readFile(downloadPath, "utf8");
  const [, firstDataRow] = csv.trim().split("\n");
  expect(firstDataRow).toMatch(/,\d+,\d+$/);
});

test("Politik unterstützt eine sichtbare Mehrfachauswahl", async ({ page }) => {
  await expectContextualMultiSelect(page, {
    route: "politics",
    rowSelector: "#politics-member-list [data-politics-member-id]",
    toolbarSelector: "#politics-table-toolbar",
    context: "politics",
    plural: "Mitglieder"
  });
});

test("Presse unterstützt eine sichtbare Mehrfachauswahl", async ({ page }) => {
  await expectContextualMultiSelect(page, {
    route: "press",
    rowSelector: "#press-contact-list [data-press-contact-id]",
    toolbarSelector: "#press-table-toolbar",
    context: "press",
    plural: "Pressekontakte"
  });
});

test("CSV-Mehrfachauswahl neutralisiert formelartige Zellen", async ({ page }) => {
  const backendFixture = createProtectedBackendFixture({ role: "admin" });
  const hostileOrganization = backendFixture.organizations[0];
  hostileOrganization.name = "  =2+3";
  await gotoAuthenticated(page, `${APP_PATH}#organizations`, { role: "admin", backendFixture });

  const hostileCheckbox = page.getByRole("checkbox", { name: /=2\+3 auswählen/u });
  await expect(hostileCheckbox).toBeVisible();
  await hostileCheckbox.check();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#contextual-bulk-export").click()
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const csv = await readFile(downloadPath, "utf8");
  expect(csv).toContain("'  =2+3");
  expect(csv).not.toMatch(/(?:^|,)\s*=2\+3(?:,|$)/mu);
});
});

test("Mobile Listen verzichten vollständig auf Mehrfachauswahl", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Der mobile Negativzustand wird im Mobile-Projekt geprüft.");
  await page.setViewportSize({ width: 390, height: 844 });
  const routes = [
    { route: "organizations", rows: "#organization-list [data-organization-id]" },
    { route: "patients?view=people", rows: "#patient-people-list [data-patient-person-id]" },
    { route: "patients?view=organizations", rows: "#patient-organization-list [data-patient-organization-id]" },
    { route: "patients?view=indications", rows: "#patient-indications-list [data-patient-indication-row]" },
    { route: "politics", rows: "#politics-member-list [data-politics-member-id]" },
    { route: "press", rows: "#press-contact-list [data-press-contact-id]" }
  ];

  await gotoAuthenticated(page, `${APP_PATH}#${routes[0].route}`, { role: "admin" });
  for (const [index, item] of routes.entries()) {
    if (index > 0) await page.goto(`${APP_PATH}#${item.route}`, { waitUntil: "load" });
    await expect.poll(() => page.locator(item.rows).count()).toBeGreaterThan(0);
    await expect(page.locator(`${item.rows} [data-contextual-row-select]`)).toHaveCount(0);
    await expect(page.locator("[id^=select-visible-]")).toHaveCount(0);
    await expect(page.locator("#contextual-bulk-toolbar")).toBeHidden();
    await expect(page.locator(`${item.rows}.is-bulk-selected`)).toHaveCount(0);
  }
});
