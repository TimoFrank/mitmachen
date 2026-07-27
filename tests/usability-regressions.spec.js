import { expect, test } from "@playwright/test";
import path from "node:path";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const previewDirectory = path.join(process.cwd(), "output", "playwright", "usability-fixes");

async function waitForApp(page) {
  await expect(page.locator(".app-shell")).not.toHaveClass(/is-initializing/, { timeout: 15_000 });
}

test("Desktop-Arbeitsbereich bleibt innerhalb des Viewports und Tabellen scrollen lokal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });
  await waitForApp(page);

  const desktopDimensions = await page.evaluate(() => {
    const tableWrap = document.querySelector("#view-contacts .table-wrap");
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      tableClientWidth: tableWrap?.clientWidth || 0,
      tableScrollWidth: tableWrap?.scrollWidth || 0
    };
  });
  expect(desktopDimensions.documentWidth).toBeLessThanOrEqual(desktopDimensions.viewportWidth);
  expect(desktopDimensions.bodyWidth).toBeLessThanOrEqual(desktopDimensions.viewportWidth);
  expect(desktopDimensions.tableScrollWidth).toBeGreaterThan(desktopDimensions.tableClientWidth);

  await page.screenshot({
    path: path.join(previewDirectory, "desktop-contacts-overview-1440x1000.png"),
    fullPage: false
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await page.screenshot({
    path: path.join(previewDirectory, "desktop-contacts-contained-1280x900.png"),
    fullPage: false
  });
});

test("Seitennavigation setzt Scrollposition und Fokus zurück; Tabs funktionieren mit Pfeiltasten", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#framework", { role: "admin" });
  await waitForApp(page);

  await page.locator("#view-framework").evaluate((panel) => {
    panel.style.minHeight = "1800px";
  });
  await page.evaluate(() => window.scrollTo(0, 1000));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('[data-view-tab="hospitations"]').click();
  await expect(page.locator("#workspace-view-title")).toHaveText("Hospitationen");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main-content");
  await expect(page).toHaveTitle("Hospitationen · Versorgungs-Kompass");

  await page.locator("#sidebar-section-stakeholders-toggle").click();
  await page.locator('[data-view-tab="experts"]').click();
  const contactTab = page.locator('button[data-expert-mode="contacts"]');
  const organizationTab = page.locator('button[data-expert-mode="organizations"]');
  await contactTab.focus();
  await contactTab.press("ArrowRight");
  await expect(organizationTab).toHaveAttribute("aria-selected", "true");
  await expect(organizationTab).toBeFocused();

  const nativePageSizeSelect = page.locator("#experts-page-size-select");
  const pageSizeTrigger = nativePageSizeSelect.locator("xpath=..").locator(".custom-select-trigger");
  await expect(nativePageSizeSelect).toHaveAttribute("aria-hidden", "true");
  await expect(nativePageSizeSelect).toHaveAttribute("tabindex", "-1");
  await expect(pageSizeTrigger).toHaveAttribute("aria-label", /Kontakte pro Seite|pro Seite/i);
  await pageSizeTrigger.press("ArrowDown");
  await expect(pageSizeTrigger).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("option");
});

test("Dialoge halten den Fokus, warnen vor Entwurfsverlust und geben den Fokus zurück", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "editor" });
  await waitForApp(page);

  const newContactButton = page.locator("#new-contact-button");
  const drawer = page.locator("#editor-drawer");
  await newContactButton.click();
  await expect(drawer).toHaveClass(/is-open/);

  await page.evaluate(() => {
    const dialog = document.querySelector("#editor-drawer [role='dialog']");
    const focusables = [...dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) =>
      !element.hidden &&
      !element.closest("[hidden]") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0 &&
      getComputedStyle(element).display !== "none" &&
      getComputedStyle(element).visibility !== "hidden"
    );
    focusables.at(-1)?.focus();
  });
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() =>
    document.querySelector("#editor-drawer [role='dialog']")?.contains(document.activeElement)
  )).toBe(true);

  await page.locator('#editor-form input[name="name"]').fill("Entwurf Fokusprüfung");
  const categoryShell = page.locator("#field-category").locator("xpath=..");
  const categoryTrigger = categoryShell.locator(".custom-select-trigger");
  await categoryTrigger.click();
  await expect(categoryShell).toHaveClass(/is-open/);
  await expect(categoryTrigger).toBeFocused();
  let customSelectEscapeDialog = false;
  const customSelectEscapeHandler = async (dialog) => {
    customSelectEscapeDialog = true;
    await dialog.dismiss();
  };
  page.on("dialog", customSelectEscapeHandler);
  await page.keyboard.press("Escape");
  await expect(categoryShell).not.toHaveClass(/is-open/);
  await expect(drawer).toHaveClass(/is-open/);
  await page.waitForTimeout(100);
  page.off("dialog", customSelectEscapeHandler);
  expect(customSelectEscapeDialog).toBe(false);

  await page.locator('#editor-form input[name="organization"]').focus();
  await expect(page.locator("[data-organization-combobox]")).toHaveClass(/is-open/);
  let transientEscapeDialog = false;
  const transientEscapeHandler = async (dialog) => {
    transientEscapeDialog = true;
    await dialog.dismiss();
  };
  page.on("dialog", transientEscapeHandler);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-organization-combobox]")).not.toHaveClass(/is-open/);
  await page.waitForTimeout(100);
  page.off("dialog", transientEscapeHandler);
  expect(transientEscapeDialog).toBe(false);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#editor-close").click();
  await expect(drawer).toHaveClass(/is-open/);

  await page.screenshot({
    path: path.join(previewDirectory, "contact-draft-warning-state-1440x1000.png"),
    fullPage: false
  });

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#editor-close").click();
  await expect(drawer).not.toHaveClass(/is-open/);
  await expect(newContactButton).toBeFocused();
});

test("Skip-Link ist nur bei Tastaturfokus sichtbar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });
  await waitForApp(page);

  const skipLink = page.locator(".skip-link");
  await expect.poll(() => skipLink.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect.poll(() => skipLink.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await page.screenshot({
    path: path.join(previewDirectory, "keyboard-skip-link-1440x1000.png"),
    fullPage: false
  });
  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#contacts$/);
  await expect(page.locator("#view-contacts")).toHaveClass(/is-active/);
  await expect(page.locator("#main-content")).toBeFocused();
});

test("Durchsuchbare Auswahlfelder lassen sich vollständig per Tastatur bedienen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dist/pages/versorgungs-kompass.html#questionnaire");
  const demoNotice = page.getByRole("note", { name: "Hinweis zur öffentlichen Demo" });
  if (await demoNotice.isVisible().catch(() => false)) {
    await demoNotice.getByRole("button", { name: "OK" }).click();
  }
  await waitForApp(page);

  const select = page.locator("#questionnaire-hospitation-container");
  const shell = select.locator("xpath=..");
  await shell.locator(".custom-select-trigger").click();
  const search = shell.locator("[data-custom-select-search-input]");
  await search.fill("Nele");
  await search.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("option");
  const focusedValue = await page.evaluate(() => document.activeElement?.getAttribute("data-option-value") || "");
  expect(focusedValue).not.toBe("");
  await page.keyboard.press("Enter");
  await expect(shell.locator(".custom-select-trigger")).toHaveAttribute("aria-expanded", "false");
  await expect(select).toHaveValue(focusedValue);
});

test("Dynamische Dashboard-Dialoge bleiben bedienbar und geben den Fokus zurück", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations:dashboard", { role: "admin" });
  await waitForApp(page);

  const opener = page.locator('[data-hospitation-dashboard-card="observations"] button[data-hospitation-dashboard-detail="observations"]');
  await expect(opener).toBeVisible();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Alle Beobachtungen" });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveAttribute("inert", "");
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "Schließen" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("Abgebrochene Zurück-Navigation hält Profilansicht und URL synchron", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });
  await waitForApp(page);

  await page.locator("#sidebar-profile-button").click();
  await expect(page).toHaveURL(/#profile$/);
  await page.locator("#profile-display-name").fill("Ungespeicherter Profilentwurf");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/#profile$/);
  await expect(page.locator("#profile-page")).toHaveClass(/is-active/);
  await expect(page.locator("#profile-display-name")).toHaveValue("Ungespeicherter Profilentwurf");
});
