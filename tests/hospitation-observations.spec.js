import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const observationRoute = "/frontend/app/versorgungs-kompass.html#hospitations:observations";

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
  const firstHospitationCell = workbench.locator("[data-observation-open]").first().locator(".observation-table-cell").nth(1);
  await expect(firstHospitationCell).toContainText(/\d{2}\.\d{2}\.\d{4}/);
  await expect(firstHospitationCell).not.toContainText("Rostock");

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
  await expect(drawer).toContainText("Owner werden aus der Ursprungshospitation übernommen");
  await drawer.locator("#observation-detail-close").click();

  await workbench.locator(".observation-analysis-panel > summary").click();
  await expect(workbench).toContainText("Wiederholungshinweis, noch kein validiertes Muster");

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
