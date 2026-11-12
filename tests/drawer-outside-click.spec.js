import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const APP = "/frontend/app/versorgungs-kompass.html";
const DEMO = "/dist/pages/versorgungs-kompass.html?demoProfile=demo-profile-admin";

async function clickOutsideAt(page, locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  const panel = await page.locator("#detail-panel").boundingBox();
  const point = { x: rect.x + 12, y: rect.y + rect.height / 2 };
  expect(point.x).toBeLessThan(panel.x);
  await page.mouse.click(point.x, point.y);
}

for (const target of [
  { route: "contacts", rows: "#contact-list .row", open: "#contact-list [data-open-detail]" },
  { route: "organizations", rows: "#organization-list .row", open: "#organization-list .organization-name-button" }
]) {
  test(`${target.route}: Außenklick schließt den Drawer und öffnet erst beim nächsten Klick den anderen Eintrag`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Mobile Kontakte und Organisationen öffnen direkt die Profilseite.");
    await gotoAuthenticated(page, `${APP}#${target.route}`);
    const first = target.open ? page.locator(target.open).first() : page.locator(target.rows).first();
    await first.click();
    await expect(page.locator("#detail-drawer")).toHaveClass(/is-open/);
    const originalName = await page.locator("#detail-panel h3").first().textContent();
    const originalUrl = page.url();
    const second = page.locator(target.open).nth(1);
    await clickOutsideAt(page, second);
    await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
    await expect(page).toHaveURL(originalUrl);
    await expect(page.locator("#detail-panel h3").first()).toHaveText(originalName);
    await second.click();
    await expect(page.locator("#detail-drawer")).toHaveClass(/is-open/);
    await expect(page.locator("#detail-panel h3").first()).not.toHaveText(originalName);
  });
}

test("Ein Klick auf die Sidebar schließt zuerst den Drawer und aktiviert noch keine Navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Mobile Kontakte öffnen direkt die Profilseite.");
  await gotoAuthenticated(page, `${APP}#contacts`);
  await page.locator("#contact-list [data-open-detail]").first().click();
  await expect(page.locator("#detail-drawer")).toHaveClass(/is-open/);
  const analytics = page.locator("#sidebar-analytics-button");
  await clickOutsideAt(page, analytics);
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await expect(page).toHaveURL(/#contacts$/);
  await analytics.click();
  await expect(page).toHaveURL(/#analytics$/);
  await expect(page.locator("#view-analytics")).toBeVisible();
});

test("Registrierungsdrawer schließt beim Außenklick auch mobil ohne die Hintergrundaktion auszulösen", async ({ page }, testInfo) => {
  await page.goto(`${DEMO}#registrations`);
  await page.locator("#registrations-list [data-registration-preview]").first().click();
  await expect(page.locator("#detail-drawer")).toHaveClass(/is-open/);
  const originalUrl = page.url();
  const panel = await page.locator("#detail-panel").boundingBox();
  const point = { x: 24, y: 30 };
  expect(point.x).toBeLessThan(panel.x);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await expect(page).toHaveURL(originalUrl);
  await expect(page.locator(".app-shell")).not.toHaveClass(/is-mobile-sidebar-expanded/);
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(10);
  if (testInfo.project.name.includes("mobile")) {
    await page.locator("#sidebar-collapse-button").click();
    await expect(page.locator(".app-shell")).toHaveClass(/is-mobile-sidebar-expanded/);
  }
});

test("Ein Editor über dem Organisationsdrawer bleibt bedienbar und schließt den darunterliegenden Drawer nicht", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Mobile Organisationen verwenden die Profilseite.");
  await gotoAuthenticated(page, `${APP}#organizations`);
  await page.locator("#organization-list .organization-name-button").first().click();
  const detail = page.locator("#detail-drawer");
  await expect(detail).toHaveClass(/is-open/);
  await page.locator("#organization-detail-edit").click();
  const editor = page.locator("#organization-editor-drawer");
  await expect(editor).toHaveClass(/is-open/);
  const name = page.locator("#organization-field-name");
  const original = await name.inputValue();
  await name.fill(`${original} Testentwurf`);
  await expect(name).toHaveValue(`${original} Testentwurf`);
  await expect(detail).toHaveClass(/is-open/);
  await name.fill(original);
  await page.locator("#organization-editor-close").click();
  await expect(editor).not.toHaveClass(/is-open/);
  await expect(detail).toHaveClass(/is-open/);
});
