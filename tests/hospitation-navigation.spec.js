import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const appPath = "/frontend/app/versorgungs-kompass.html";
const planning = '[data-sidebar-section="planning"]';

async function openMenu(page) {
  if (await page.locator(".app-shell").evaluate((shell) => matchMedia("(max-width: 760px)").matches && !shell.classList.contains("is-mobile-sidebar-expanded"))) {
    await page.getByRole("button", { name: "Navigation ausklappen", exact: true }).click();
  }
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
