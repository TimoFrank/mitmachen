import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const DEMO_APP = "/dist/pages/versorgungs-kompass.html?demoProfile=demo-profile-admin";
const SOURCE_APP = "/frontend/app/versorgungs-kompass.html";
const SIDEBAR_WIDTH_KEY = "versorgungs-kompass-sidebar-width";

async function revealSidebar(page) {
  const shell = page.locator(".app-shell");
  const mobile = await page.evaluate(() => window.matchMedia("(max-width: 760px)").matches);
  const expanded = await shell.evaluate((element, isMobile) => isMobile
    ? element.classList.contains("is-mobile-sidebar-expanded")
    : !element.classList.contains("is-sidebar-collapsed"), mobile);
  if (!expanded) await page.locator(mobile ? "#sidebar-collapse-button" : "#sidebar-resize-handle").click();
  return mobile;
}

async function sidebarWidth(page) {
  return page.locator(".app-sidebar").evaluate((element) => Math.round(element.getBoundingClientRect().width));
}

test("Importe beginnen mit Dateiimport und zeigen zusätzliche Wege erst bei Bedarf", async ({ page }) => {
  await page.goto(`${DEMO_APP}#profile-imports`);

  const importsTab = page.locator('[data-profile-tab="imports"]');
  await expect(importsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[aria-label="Importbereiche"] [data-settings-tab]')).toHaveText([
    "Dateiimport", "Online-Erfassung", "Registrierung", "Historie"
  ]);
  await expect(page.locator('[data-settings-tab="imports"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#imports-start-file")).toBeVisible();

  const additional = page.locator("#imports-additional-options");
  await expect(additional).not.toHaveAttribute("open");
  await expect(page.locator("#imports-start-stakeholder")).toBeHidden();
  await additional.locator(":scope > summary").click();
  await expect(page.locator("#imports-start-stakeholder")).toBeVisible();
  await additional.locator(":scope > summary").click();
  await expect(page.locator("#imports-start-stakeholder")).toBeHidden();

  await page.locator('[data-settings-tab="onlineEntry"]').click();
  await expect(page.locator("#imports-open-table")).toBeVisible();
  await page.locator('[data-settings-tab="registrations"]').click();
  await expect(page.locator("#settings-tab-registrations")).toBeVisible();
  await expect(page.locator("#registrations-search")).toHaveCount(0);
  await expect(page.locator("#registrations-status-filter")).toHaveValue("all");
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(10);
  await expect(page.locator("#registrations-summary")).toHaveText("10 Registrierungen");
  await expect(page.locator("#registrations-summary small")).toHaveCount(0);
  await page.locator("#registrations-status-filter").selectOption("open");
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(4);
  const process = page.locator("#registration-process-details");
  await expect(process).not.toHaveAttribute("open");
  await expect(page.locator(".registration-process-flow")).toBeHidden();
  await process.locator(":scope > summary").click();
  await expect(page.locator(".registration-process-flow")).toBeVisible();
  await expect(page.locator("#public-registration-link")).toBeVisible();
  const registrationWidth = await page.locator(".profile-panel").evaluate((element) => element.getBoundingClientRect().width);

  await page.locator('[data-settings-tab="imports"]').click();
  const fileImportWidth = await page.locator(".profile-panel").evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(registrationWidth - fileImportWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator("#imports-start-file")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const route of ["team", "profile-team"]) {
  test(`Teams sind über den Profilreiter und den Direktlink #${route} erreichbar`, async ({ page }) => {
    await page.goto(`${DEMO_APP}#${route}`);

    await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
    await expect(page.locator('[data-profile-tab="team"]')).toHaveAttribute("aria-selected", "true");
    const teamPanel = page.locator("#profile-tab-team");
    await expect(teamPanel).toBeVisible();
    await expect(teamPanel.locator(".team-board-card")).toHaveCount(3);
    await expect(teamPanel.locator(".team-account-card")).toHaveCount(3);
    await expect(page.locator("#sidebar-team-button")).toHaveCount(0);
    await expect(page.locator("#sidebar-account-label")).toHaveText("Konto");
    await expect(page.locator('[data-profile-tab]:visible')).toHaveText([
      "Profil", "Teams", "Benachrichtigungen", "Importe"
    ]);

    await page.locator('[data-profile-tab="profile"]').click();
    await expect(teamPanel).toBeHidden();
    await expect(page.locator("#profile-tab-profile")).toBeVisible();
    await page.locator('[data-profile-tab="team"]').click();
    await expect(teamPanel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("Changelog öffnet aus dem App-Bereich als Dialog und erhält den Seitenkontext", async ({ page }) => {
  await page.goto(`${DEMO_APP}#profile`);
  await expect(page.locator("#profile-tab-profile")).toBeVisible();
  await expect(page.locator('[data-profile-tab="changelog"]')).toHaveCount(0);
  const mobile = await revealSidebar(page);
  const trigger = page.locator("#sidebar-changelog-button");
  await expect(page.locator(".sidebar-app-section").locator("#sidebar-changelog-button")).toBeVisible();
  await trigger.click();

  const overlay = page.locator("#app-changelog");
  const dialog = overlay.getByRole("dialog");
  await expect(overlay).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAccessibleName("Changelog");
  await expect(page.locator("#about-version-list")).not.toBeEmpty();
  const dialogLayout = await dialog.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    viewportHeight: window.innerHeight,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(dialogLayout.height).toBeLessThanOrEqual(Math.min(680, dialogLayout.viewportHeight * 0.78) + 1);
  expect(dialogLayout.height).toBeLessThan(dialogLayout.viewportHeight - 100);
  expect(dialogLayout.scrollHeight).toBeGreaterThan(dialogLayout.clientHeight);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "profile");
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
  await expect(page.locator("#profile-tab-profile")).toBeVisible();
  await expect(page.locator(mobile ? "#sidebar-collapse-button" : "#sidebar-changelog-button")).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");

  await revealSidebar(page);
  await trigger.click();
  await expect(overlay).toBeVisible();
  await page.locator("#app-changelog-close").click();
  await expect(overlay).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Geschützte Viewer können Teams und Changelog ohne Importberechtigung nutzen", async ({ page }) => {
  await gotoAuthenticated(page, `${SOURCE_APP}#profile-team`, { role: "viewer" });
  await expect(page.locator("#profile-tab-team")).toBeVisible();
  await expect(page.locator('[data-profile-tab="imports"]')).toBeHidden();
  await revealSidebar(page);
  await page.locator("#sidebar-changelog-button").click();
  await expect(page.locator("#app-changelog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#profile-tab-team")).toBeVisible();
});

test("Sidebarbreite lässt sich ziehen und per Tastatur begrenzen und bleibt beim Einklappen erhalten", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Ziehen ist eine Interaktion der Desktop-Sidebar.");
  await gotoAuthenticated(page, `${SOURCE_APP}#contacts`, { role: "viewer" });
  await revealSidebar(page);

  const handle = page.locator("#sidebar-resize-handle");
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("role", "separator");
  await expect(handle).toHaveAttribute("aria-orientation", "vertical");
  await expect(handle).toHaveAttribute("aria-valuemin", "76");
  await expect(handle).toHaveAttribute("aria-valuemax", "360");
  expect(await sidebarWidth(page)).toBe(248);

  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => sidebarWidth(page)).toBe(264);
  await page.keyboard.press("Home");
  await expect.poll(() => sidebarWidth(page)).toBe(220);
  await page.keyboard.press("End");
  await expect.poll(() => sidebarWidth(page)).toBe(360);

  const grip = await handle.boundingBox();
  expect(grip).not.toBeNull();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(296, grip.y + grip.height / 2, { steps: 5 });
  await page.mouse.up();
  const resizedWidth = await sidebarWidth(page);
  expect(resizedWidth).toBeGreaterThan(280);
  expect(resizedWidth).toBeLessThan(320);
  expect(await page.evaluate((key) => Number.parseFloat(localStorage.getItem(key)), SIDEBAR_WIDTH_KEY)).toBe(resizedWidth);

  await expect(page.locator(".app-shell")).not.toHaveClass(/is-sidebar-collapsed/);
  await expect(page.locator("#sidebar-collapse-button")).toBeHidden();
  await handle.click();
  await expect(page.locator(".app-shell")).toHaveClass(/is-sidebar-collapsed/);
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("aria-valuenow", "76");
  await expect(handle).toHaveAttribute("aria-valuetext", /^Eingeklappt\./);
  await expect.poll(() => sidebarWidth(page)).toBe(76);
  await handle.click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/is-sidebar-collapsed/);
  await expect.poll(() => sidebarWidth(page)).toBe(resizedWidth);
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".app-shell")).toHaveClass(/is-sidebar-collapsed/);
  await expect(handle).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.locator(".app-shell")).not.toHaveClass(/is-sidebar-collapsed/);
  await expect.poll(() => sidebarWidth(page)).toBe(resizedWidth);
  await page.reload();
  await expect(handle).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBe(resizedWidth);
  await expect(handle).toHaveAttribute("aria-valuenow", String(resizedWidth));

  await page.goto(`${SOURCE_APP}#home`);
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await page.locator('.home-destination-link[data-home-module="care"]').click();
  await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
  await expect(handle).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBe(resizedWidth);
});

test("Mobile Navigation bleibt ohne seitlichen Ziehgriff nutzbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile", "Die kompakte Navigation wird im mobilen Projekt geprüft.");
  await gotoAuthenticated(page, `${SOURCE_APP}#profile-team`, { role: "viewer" });
  await expect(page.locator("#sidebar-resize-handle")).toBeHidden();
  await expect(page.locator("#profile-tab-team")).toBeVisible();
  await page.locator('[data-profile-tab="profile"]').click();
  await expect(page.locator("#profile-tab-profile")).toBeVisible();
  await revealSidebar(page);
  await expect(page.locator("#sidebar-changelog-button")).toBeVisible();
  await expect(page.locator("#sidebar-account-label")).toHaveText("Konto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("Abgelehnter Kontaktwechsel aus Teams erhält einen Profilentwurf ohne doppelte Rückfrage", async ({ page }) => {
  await page.goto(`${DEMO_APP}#profile`);
  const draftName = "Mara Stein Profilentwurf";
  await page.locator("#profile-display-name").fill(draftName);
  await page.locator('[data-profile-tab="team"]').click();
  const owner = page.locator("#team-account-list [data-team-owner-profile]").first();
  await owner.locator("summary").click();
  const contact = owner.locator("[data-team-owner-contact]").first();
  await expect(contact).toBeVisible();
  const routeBeforeContact = page.url();
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await contact.click();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(dialogs).toEqual(["Ungespeicherte Profiländerungen verwerfen?"]);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "profile");
  await expect(page.locator("#profile-tab-team")).toBeVisible();
  await expect(page).toHaveURL(routeBeforeContact);

  await page.locator('[data-profile-tab="profile"]').click();
  await expect(page.locator("#profile-display-name")).toHaveValue(draftName);
  await expect(page.locator("#profile-save")).toBeVisible();
  await page.locator("#profile-save").click();
  await expect.poll(() => page.evaluate(async () => (await window.dataService.getCurrentProfile()).display_name)).toBe(draftName);
  await expect(page.locator("#profile-save")).toBeHidden();
  expect(dialogs).toHaveLength(1);
});

test("Browserzurück aus dem Teamreiter erhält ungespeicherte Profilfelder", async ({ page }) => {
  await page.goto(`${DEMO_APP}#profile`);
  const draftName = "Mara Stein Entwurf bleibt";
  await page.locator("#profile-display-name").fill(draftName);
  await page.locator('[data-profile-tab="team"]').click();
  await expect(page.locator("#profile-tab-team")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#profile-tab-profile")).toBeVisible();
  await expect(page.locator("#profile-display-name")).toHaveValue(draftName);
  await expect(page.locator("#profile-save")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#profile-tab-team")).toBeVisible();
  await page.locator('[data-profile-tab="profile"]').click();
  await expect(page.locator("#profile-display-name")).toHaveValue(draftName);
});
