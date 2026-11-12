import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const APP = "/frontend/app/versorgungs-kompass.html";
const DEMO = "/dist/pages/versorgungs-kompass.html?demoProfile=demo-profile-admin";
const COMPACT_LIST_FIXTURE = `
  window.VERSORGUNGS_COMPASS_CONTACTS = [
    { id: "round4-contact-1", name: "Anna Adler", organizationId: "round4-org-1", organization: "MVZ Nord", category: "Praxis", city: "Berlin", state: "Berlin", status: "active" },
    { id: "round4-contact-2", name: "Boris Brandt", organizationId: "round4-org-2", organization: "Praxis Mitte", category: "Praxis", city: "Berlin", state: "Berlin", status: "active" }
  ];
  window.VERSORGUNGS_COMPASS_DEMO_DATA = {
    organizations: [
      { id: "round4-org-1", name: "MVZ Nord", sector: "Praxis", city: "Berlin", state: "Berlin", status: "active" },
      { id: "round4-org-2", name: "Praxis Mitte", sector: "Praxis", city: "Berlin", state: "Berlin", status: "active" }
    ]
  };
`;

test("Registrierung zeigt alle Demo-Eingänge und einen einfachen Zähler im Kopf", async ({ page }) => {
  await page.goto(`${DEMO}#registrations`);
  await expect(page.locator("#registrations-status-filter")).toHaveValue("all");
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(10);
  const head = page.locator(".registrations-card .dashboard-card-head");
  const summary = head.locator("#registrations-summary");
  await expect(summary).toHaveText("10 Registrierungen");
  await expect(summary.locator("small")).toHaveCount(0);
  await expect(page.locator(".registrations-overview-row")).not.toContainText(/anderem Status|offene von/);
  const placement = await head.evaluate((element) => {
    const title = element.querySelector("h4").getBoundingClientRect();
    const counter = element.querySelector("#registrations-summary").getBoundingClientRect();
    return { titleRight: title.right, counterLeft: counter.left, counterRight: counter.right, headRight: element.getBoundingClientRect().right };
  });
  expect(placement.counterLeft).toBeGreaterThan(placement.titleRight);
  expect(placement.headRight - placement.counterRight).toBeLessThanOrEqual(2);
  await expect(page.locator(".registrations-overview-row #registrations-refresh")).toHaveCount(0);
  await expect(page.locator("#registration-process-details")).not.toHaveAttribute("open");
  await page.locator("#registrations-status-filter").selectOption("open");
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(4);
  await expect(summary).toHaveText("4 Registrierungen");
  await page.locator("#registrations-status-filter").selectOption("all");
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(10);
});

test("Registrierungsstatus bleibt über der befüllten Tabelle per Klick auswählbar", async ({ page }) => {
  await page.goto(`${DEMO}#registrations`);
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(10);
  const select = page.locator(".registrations-status-filter [data-custom-select]");
  await select.locator(".custom-select-trigger").click();
  const panel = select.locator(".custom-select-panel");
  await expect(panel).toBeVisible();
  const option = panel.locator('.custom-select-option[data-option-value="in_pruefung"]');
  await expect(option).toBeVisible();
  const receivesPointer = await option.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  });
  expect(receivesPointer).toBe(true);
  await option.click();
  await expect(page.locator("#registrations-status-filter")).toHaveValue("in_pruefung");
  await expect(panel).toBeHidden();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(2);
});

test("Mobil öffnet die Demo-Kontowahl erst durch das Avatar und lässt sich wieder schließen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile", "Die mobile Kontowahl hat einen eigenen Platz in der Navigation.");
  await page.goto(`${DEMO}#contacts`);
  await page.locator("#sidebar-collapse-button").click();
  await expect(page.locator(".app-shell")).toHaveClass(/is-mobile-sidebar-expanded/);
  const trigger = page.locator("[data-demo-profile-switcher-trigger]");
  const switcher = page.locator("#demo-profile-switcher");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(switcher).toBeHidden();
  await trigger.click();
  await expect(switcher).toBeVisible();
  await expect(switcher.locator("[data-demo-profile-choice]")).toHaveCount(3);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await trigger.click();
  await expect(switcher).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(switcher).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const target of [
  { route: "contacts", view: "#view-contacts", rows: "#contact-list .row" },
  { route: "organizations", view: "#view-organizations", rows: "#organization-list .row" }
]) {
  test(`${target.route}: eine kurze Tabelle endet auf Desktop direkt nach der letzten Zeile`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Mobil bleibt der natürliche Seitenfluss erhalten.");
    const backendFixture = createProtectedBackendFixture({ role: "admin", fixtureScript: COMPACT_LIST_FIXTURE });
    await gotoAuthenticated(page, `${APP}#${target.route}`, { role: "admin", backendFixture });
    await expect(page.locator(target.rows)).toHaveCount(2);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.locator(`${target.view} .table-footer`).evaluate((footer) => {
        const card = footer.closest(".view-card");
        const table = card.querySelector(".table-wrap").getBoundingClientRect();
        const rows = card.querySelectorAll(".table-wrap .row");
        const lastRow = rows[rows.length - 1].getBoundingClientRect();
        const rect = footer.getBoundingClientRect();
        return {
          footerTop: rect.top,
          tableBottom: table.bottom,
          lastRowBottom: lastRow.bottom,
          footerBottom: rect.bottom,
          viewportHeight: window.innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth
        };
      });
      expect(geometry.footerTop).toBeGreaterThan(0);
      expect(Math.abs(geometry.footerTop - geometry.tableBottom)).toBeLessThanOrEqual(2);
      expect(Math.abs(geometry.tableBottom - geometry.lastRowBottom)).toBeLessThanOrEqual(2);
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
      expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
      await expect(page.locator(`${target.view} .table-footer`)).toBeInViewport();
    }
  });
}


test("Demo-Listen starten mit 25 Einträgen und erhalten eine persönliche Seitenlänge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Mobile Listen behalten ihre kompakte Seitengröße.");
  await page.goto(`${DEMO}#contacts`);
  await expect(page.locator("#page-size-select")).toHaveValue("25");
  await expect(page.locator("#contact-list .row")).toHaveCount(25);
  await page.locator('[data-view-tab="organizations"]').click();
  await expect(page.locator("#organization-list .row")).toHaveCount(25);
  await page.locator('[data-view-tab="contacts"]').click();
  await page.locator("#page-size-select").selectOption("10", { force: true });
  await expect(page.locator("#contact-list .row")).toHaveCount(10);
  await page.locator('[data-view-tab="organizations"]').click();
  await expect(page.locator("#organization-list .row")).toHaveCount(10);
  await page.locator('[data-view-tab="contacts"]').click();
  await expect(page.locator("#page-size-select")).toHaveValue("10");
  await expect(page.locator("#contact-list .row")).toHaveCount(10);
});
