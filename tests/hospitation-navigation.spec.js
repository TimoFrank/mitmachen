import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const appPath = "/frontend/app/versorgungs-kompass.html";
const planning = '[data-sidebar-section="planning"]';

async function openMenu(page) {
  if (await page.locator(".app-shell").evaluate((shell) => matchMedia("(max-width: 760px)").matches && !shell.classList.contains("is-mobile-sidebar-expanded"))) {
    await page.getByRole("button", { name: "Navigation ausklappen", exact: true }).click();
  }
}

test("Pages: #Mitmachen öffnet den Hospitationskompass mit eigener Sidebar", async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack));
  await page.goto("/dist/pages/index.html");
  await expect(page.locator("#view-home [data-home-module]")).toHaveCount(4);
  await page.locator('#view-home [data-home-module="planning"]').click();
  const overview = page.locator("#view-hospitation-overview");
  await expect(overview.getByRole("tab", { name: "Aktuelle Einblicke" })).toHaveAttribute("aria-selected", "true");
  await expect(overview.locator("[data-ho-visit]").first()).toBeVisible();
  await expect(overview.locator("[data-ho-observation]").first()).toBeVisible();

  await openMenu(page);
  const navigation = page.locator(planning);
  await expect(navigation.locator("[data-view-tab]")).toHaveText(["Übersicht", "Framework", "Dashboard"]);
  for (const group of ["care", "stakeholders", "formats"]) {
    await expect(page.locator(`[data-sidebar-group="${group}"]`)).toBeHidden();
  }
  await expect(navigation.getByRole("button", { name: "Übersicht", exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("hospitationskompass-sidebar.png") });
  if (testInfo.project.name.includes("mobile")) await page.locator("#sidebar-collapse-button").click();
  await page.screenshot({ path: testInfo.outputPath("hospitationskompass-uebersicht.png"), fullPage: true });

  await overview.getByRole("tab", { name: "Wissenschaftlicher Hintergrund" }).click();
  await expect(overview.locator("#ho-panel-science")).toBeVisible();
  await overview.getByRole("tab", { name: "Fragebogen" }).click();
  await expect(overview.locator("#hospitation-questionnaire-form")).toBeVisible();
  await page.reload();
  await expect(overview.getByRole("tab", { name: "Fragebogen" })).toHaveAttribute("aria-selected", "true");

  await openMenu(page);
  await navigation.getByRole("button", { name: "Framework", exact: true }).click();
  expect(pageErrors).toEqual([]);
  await page.locator('.hospitation-synthesis__steps [data-synthesis-stage="hospitations"]').click();
  await expect(page.locator('[data-synthesis-table="hospitations"]')).toBeVisible();
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(page.locator("[data-synthesis-calendar]")).toBeVisible();
  await page.locator('[data-synthesis-stage="observations"]').first().click();
  await expect(page).toHaveURL(/#hospitations:synthesis\?stage=observations$/);
  await expect(page.locator('[data-synthesis-table="observations"]')).toBeVisible();
  await page.locator('[data-synthesis-table="observations"] .hs-main-link[data-synthesis-observation]').first().click();
  await expect(page.locator("#observation-detail-drawer")).toHaveClass(/is-open/);
  await page.locator("#observation-detail-close").click();
  await page.screenshot({ path: testInfo.outputPath("hospitationskompass-framework.png") });

  await openMenu(page);
  await navigation.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator("#hospitation-dashboard-panel")).toBeVisible();
  await page.getByRole("button", { name: "Sektoren", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sektoren", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Ansicht anpassen", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Ansicht anpassen" })).toBeVisible();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("hospitationskompass-dashboard.png"), fullPage: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  await openMenu(page);
  await page.getByRole("button", { name: "Alle Kompasse auf der #Mitmachen Startseite" }).click();
  await expect(page.locator("#view-home")).toBeVisible();
  await expect(page.locator("#view-home [data-home-module]:visible")).toHaveCount(4);
  await expect(page.locator("[data-sidebar-group].workspace-compass-hidden")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

for (const [group, destination, tab] of [
  ["care", "map", "contacts"],
  ["stakeholders", "stakeholderOverview", "patients"],
  ["formats", "formats", null]
]) {
  test(`Pages: eigener Modulbereich für ${group} mit Rückweg zur Startseite`, async ({ page }) => {
    const shell = page.locator(".app-shell");
    const sections = page.locator(".sidebar-nav > [data-sidebar-group]");
    const home = page.locator('.sidebar-home-entry [data-view-tab="home"]');
    await page.goto("/dist/pages/index.html");
    await page.locator(`#view-home [data-home-module="${group}"]`).click();
    await expect(shell).toHaveAttribute("data-active-view", destination);

    await openMenu(page);
    const activeSection = sections.filter({ visible: true });
    await expect(activeSection).toHaveAttribute("data-sidebar-group", group);
    await expect(activeSection).toHaveClass(/is-expanded/);
    await expect(home).toHaveAccessibleName("Alle Kompasse auf der #Mitmachen Startseite");

    if (tab) {
      if (group === "stakeholders") {
        await activeSection.locator('details[data-sidebar-subnav="stakeholder-people"] summary').click();
      }
      await activeSection.locator(`[data-view-tab="${tab}"]`).click();
      await expect(shell).toHaveAttribute("data-active-view", tab);
    }
    await page.reload();
    await expect(shell).toHaveAttribute("data-active-view", tab || destination);
    await openMenu(page);
    await expect(activeSection).toHaveAttribute("data-sidebar-group", group);
    await expect(activeSection.locator('[aria-current="page"]')).toBeVisible();

    await home.click();
    await expect(page.locator("#view-home [data-home-module]:visible")).toHaveCount(4);
    await expect(page.locator(".sidebar-nav")).toBeHidden();
    await expect(sections.filter({ has: page.locator("[aria-current=page]") })).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-workspace-compass", /.+/);

    await page.goBack();
    await expect(shell).toHaveAttribute("data-active-view", tab || destination);
    await openMenu(page);
    await expect(activeSection).toHaveAttribute("data-sidebar-group", group);
  });
}

for (const [context, query] of [["Gesamtanwendung", ""], ["Eigener Hospitations-Einstieg", "?workspace=hospitation"]]) {
  test.describe(context, () => {
    test("Hospitationsnavigation: Termine und Framework sind fachlich gruppiert", async ({ page }, testInfo) => {
      await gotoAuthenticated(page, `${appPath}${query}#hospitations`);
      await expect(page.locator("#hospitation-appointments-panel")).toBeVisible();
      await openMenu(page);
      const navigation = page.locator(planning);
      const appointments = navigation.getByRole("group", { name: "Hospitationen", exact: true });
      const framework = navigation.getByRole("group", { name: "Framework", exact: true });
      await expect(appointments.locator("[data-view-tab]")).toHaveText(["Termine", "Auswertung"]);
      await expect(framework.locator("[data-view-tab]")).toHaveText(["Beobachtungen", "Muster", "Grundlagen"]);
      await expect(navigation.getByRole("button", { name: "Fragebogen", exact: true })).toHaveCount(0);
      await expect(appointments.getByRole("button", { name: "Termine", exact: true })).toHaveAttribute("aria-current", "page");
      await testInfo.attach("Navigation", { body: await page.screenshot(), contentType: "image/png" });

      await appointments.getByRole("button", { name: "Auswertung", exact: true }).click();
      await expect(page.locator("#hospitation-dashboard-panel")).toBeVisible();
      await expect(page.locator("#workspace-view-title")).toHaveText("Auswertung");
      await expect(page.locator(`${planning} [data-view-tab="hospitations:dashboard"]`)).toHaveAttribute("aria-current", "page");

      await openMenu(page);
      await framework.getByRole("button", { name: "Beobachtungen", exact: true }).click();
      await expect(page.locator("#hospitation-observations-panel")).toBeVisible();
      await openMenu(page);
      await framework.getByRole("button", { name: "Muster", exact: true }).click();
      await expect(page.locator("#hospitation-patterns-panel")).toBeVisible();
      await openMenu(page);
      await framework.getByRole("button", { name: "Grundlagen", exact: true }).click();
      await expect(page.locator("#view-framework")).toBeVisible();
      await expect(page.locator("#workspace-view-title")).toHaveText("Framework-Grundlagen");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });

    test("Hospitationsnavigation: Fragebogen öffnet aus Terminen und führt zurück", async ({ page }) => {
      await gotoAuthenticated(page, `${appPath}${query}#hospitations`);
      await expect(page.locator("#hospitation-appointments-panel")).toBeVisible();
      await page.locator("#hospitation-questionnaire-open").click();
      await expect(page.locator("#view-questionnaire")).toBeVisible();
      await expect(page).toHaveURL(/#questionnaire$/);
      await expect(page.locator(`${planning} [data-view-tab="hospitations"]`)).toHaveAttribute("aria-current", "location");
      await page.locator("#questionnaire-back-to-appointments").click();
      await expect(page.locator("#hospitation-appointments-panel")).toBeVisible();
      await page.goBack();
      await expect(page.locator("#view-questionnaire")).toBeVisible();
      await page.reload();
      await expect(page.locator("#view-questionnaire")).toBeVisible();
      await expect(page.locator(`${planning} [data-view-tab="hospitations"]`)).toHaveAttribute("aria-current", "location");
      await expect(page.locator(`${planning} [aria-current="page"]`)).toHaveCount(0);
    });
  });
}
