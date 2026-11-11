import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const PAGES_APP = "/dist/pages/versorgungs-kompass.html";

async function expectCleanHomeSidebar(page) {
  await expect(page.locator(".app-shell")).toHaveClass(/is-public-demo-profile/);
  const sidebar = page.locator(".app-sidebar");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "home");
  await expect(sidebar.locator(".sidebar-brand")).toBeVisible();
  await expect(sidebar.locator(".sidebar-brand .brand-mark")).toBeVisible();
  await expect(sidebar.locator(".sidebar-brand-word")).toBeHidden();
  await expect(sidebar.locator(".sidebar-collapse")).toBeHidden();
  await expect(sidebar.locator(".sidebar-nav")).toBeHidden();
  await expect(sidebar.locator(".sidebar-account-section")).toBeHidden();
  await expect(sidebar.locator("button:visible")).toHaveCount(0);
  await expect(sidebar.locator("a:visible")).toHaveCount(1);
  if ((page.viewportSize()?.width || 0) <= 760) {
    await expect(sidebar).toHaveCSS("height", "64px");
  } else {
    await expect(sidebar).toHaveCSS("width", "76px");
  }
}

test("Pages startet direkt in der App-Startseite", async ({ page }, testInfo) => {
  if (testInfo.project.name.includes("mobile")) {
    await page.setViewportSize({ width: 320, height: 568 });
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dist/pages/index.html");

  await expect(page).toHaveURL(/\/dist\/pages\/index\.html$/);
  await expect(page).toHaveTitle("Startseite · #Mitmachen");
  await expect(page.locator('body[data-public-entry="home"], [data-public-entry-styles]')).toHaveCount(0);
  await expect(page.locator(".app-sidebar")).toBeVisible();
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await expectCleanHomeSidebar(page);
  await expect(page.locator("#global-status")).toBeHidden();
  const destinations = page.locator(".home-destination-link");
  await expect(destinations).toHaveCount(4);
  await expect(page.locator(".home-destination-name")).toHaveText([
    "Versorgungs-Kompass",
    "Stakeholder-Kompass",
    "Hospitations-Kompass",
    "Format-Kompass"
  ]);
  await expect(page.locator(".home-destination-link__mark")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Willkommen.", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Arbeitsbereiche" })).toBeVisible();
  const footer = page.locator(".versorgungs-app-footer");
  await expect(footer).toBeVisible();
  await expect(footer.getByRole("link", { name: "#Mitmachen", exact: true })).toHaveAttribute("href", "https://www.gematik.de/mitmachen");
  await expect(footer.getByRole("link")).toHaveCount(1);
  await expect(footer.locator("span")).toHaveText("- ein Angebot der gematik");
  await expect(page.locator("#home-tour-button")).toHaveCount(0);
  await expect(page.locator("[data-home-compass-name]")).toHaveText(await page.locator(".home-destination-name").allTextContents());
  await expect(page.locator("[data-home-compass-name]").first()).toHaveCSS("animation-name", "homeCompassRotate");
  await expect(page.locator(".home-hero__brand, [data-home-scroll-cue]")).toHaveCount(0);
  await expect(await destinations.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual([
    "#map",
    "#stakeholders",
    "#hospitation-overview",
    "#formats"
  ]);

  for (const link of await destinations.all()) {
    await expect(link).toBeInViewport({ ratio: 1 });
    expect(await link.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator("[data-home-compass-rotation]")).toBeHidden({ timeout: 9_000 });
  await expect(page.getByRole("heading", { name: "Willkommen.", level: 1 })).toBeVisible();
});

test("Arbeitsbereiche sind auch bei reduzierter Bewegung direkt erreichbar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dist/pages/index.html");

  await expect(page.locator("[data-home-compass-rotation]")).toBeHidden();
  const care = page.getByRole("link", { name: "Versorgungs-Kompass", exact: true });
  await expect(care).toBeInViewport();
  await care.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#map$/);
  const map = page.frameLocator("#map-view-frame");
  await expect(map.getByRole("button", { name: "Sektoren", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Startseiteneinstieg öffnet den passenden Navigationsbereich auf Desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Der Desktop-Zustand wird im Desktop-Projekt geprüft.");
  await page.goto("/dist/pages/index.html");

  const shell = page.locator(".app-shell");
  await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  await page.locator('.home-destination-link[data-home-module="planning"]').click();

  await expect(page).toHaveURL(/#hospitation-overview$/);
  await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
  await expect(page.locator(".sidebar-collapse")).toBeVisible();
  await expect(page.locator(".sidebar-nav")).toBeVisible();
  await expect(page.locator(".sidebar-account-section")).toBeVisible();
  await expect(page.locator(".sidebar-brand-word")).toBeVisible();
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveClass(/is-active-section/);
  await expect(page.locator('[data-sidebar-section-toggle="planning"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-view-tab="hospitationOverview"]')).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/\/dist\/pages\/index\.html$/);
  await expectCleanHomeSidebar(page);
});

test("Startseiteneinstiege lassen die mobile Navigation eingeklappt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dist/pages/index.html");

  const shell = page.locator(".app-shell");
  const modules = [
    { module: "care", url: /#map$/, view: "map", group: "care" },
    { module: "stakeholders", url: /#stakeholders$/, view: "stakeholderOverview", group: "stakeholders" },
    { module: "planning", url: /#hospitation-overview$/, view: "hospitationOverview", group: "planning" },
    { module: "formats", url: /#formats$/, view: "formats", group: "formats" }
  ];

  for (const item of modules) {
    await page.locator(`.home-destination-link[data-home-module="${item.module}"]`).click();
    await expect(page).toHaveURL(item.url);
    await expect(shell).not.toHaveClass(/is-mobile-sidebar-expanded/);
    await expect(page.locator("#sidebar-collapse-button")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".sidebar-nav")).toBeHidden();
    await expect(page.locator(".sidebar-account-section")).toBeHidden();
    await expect(page.locator(`[data-view-panel="${item.view}"]`)).toBeVisible();
    await expect(page.locator(`[data-sidebar-section="${item.group}"]`)).toHaveClass(/is-active-section/);

    await page.locator("#brand-home-link").click();
    await expect(page).toHaveURL(/#home$/);
    await expectCleanHomeSidebar(page);
  }
});

test("Mobile-Auslieferung: Startklar-Hinweis erscheint erst im Versorgungs-Kompass", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dist/pages/index.html");

  const status = page.locator("#global-status");
  const footer = page.locator(".versorgungs-app-footer");
  await expect(status).toBeHidden();

  await page.locator('.home-destination-link[data-home-module="care"]').click();
  await expect(status).toBeVisible();
  await expect(status).toHaveText(/Startklar: \d+ Demo-Kontakte stehen bereit\./);
  await expect(status).not.toContainText("synthetische");
  await expect(status).toHaveClass(/is-ready/);
  const statusMark = status.locator(".global-status__mark");
  await expect(statusMark).toBeVisible();
  await expect(statusMark).toHaveAttribute("src", /public\/brand\/versorgungs-kompass\/mark\.svg$/);
  await expect(status.locator(".global-status__icon")).toHaveCSS("opacity", "1");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");

  await expect(footer).toBeHidden();
  const statusBox = await status.boundingBox();
  expect(statusBox).not.toBeNull();
  expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(844);
  expect(statusBox.x).toBeGreaterThanOrEqual(0);
  expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("pages-startklar-versorgungs-kompass.png"), fullPage: false });

  await page.locator("#brand-home-link").click();
  await expect(status).toBeHidden();
});

test("Geschützte Auslieferung: Kontakte werden erst im Versorgungs-Kompass als startklar angekündigt", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#home");

  const shell = page.locator(".app-shell");
  await expect(shell).not.toHaveClass(/is-public-demo-profile/);
  await expect(page.locator(".sidebar-collapse")).toBeVisible();
  await expect(page.locator(".sidebar-brand-word")).toBeVisible();
  if ((page.viewportSize()?.width || 0) <= 760) {
    await expect(page.locator(".sidebar-nav")).toBeHidden();
    await expect(page.locator(".sidebar-account-section")).toBeHidden();
  } else {
    await expect(page.locator(".sidebar-nav")).toBeVisible();
    await expect(page.locator(".sidebar-account-section")).toBeVisible();
  }
  const status = page.locator("#global-status");
  await expect(status).toBeHidden();

  await page.locator('.home-destination-link[data-home-module="care"]').click();
  await expect(status).toBeVisible();
  await expect(status).toHaveText(/Startklar: \d+ Kontakte stehen bereit\./);
  await expect(status).not.toContainText("Backend");
  await expect(status).toHaveClass(/is-ready/);
  await expect(status.locator(".global-status__mark")).toBeVisible();
});

test("Pages-Karte: Sektorpunkte stehen an den erfassten Positionen", async ({ page }) => {
  await page.goto(`${PAGES_APP}#map`);
  const mapFrame = page.frameLocator("#map-view-frame");

  await expect(mapFrame.locator("#map")).toBeVisible();
  await expect(mapFrame.getByRole("button", { name: "Standorte", exact: true })).toHaveCount(0);
  await expect(mapFrame.getByRole("button", { name: "Sektoren", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(mapFrame.locator(".cat-marker").first()).toBeVisible({ timeout: 20_000 });
  await expect(mapFrame.locator(".gematik-marker")).toHaveCount(0);

  await expect.poll(() => mapFrame.locator("#map").evaluate(() => {
    const entries = globalThis.eval("markerIndex");
    return entries.length > 0 && entries.every(({ data, marker: leafletMarker }) => {
      const latLng = leafletMarker.getLatLng();
      return Math.abs(latLng.lat - Number(data.lat)) < 1e-7
        && Math.abs(latLng.lng - Number(data.lon)) < 1e-7;
    });
  })).toBe(true);
});

test("Startseiten-Fußzeile bleibt mobil einzeilig und fließt bei großer Schrift um", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dist/pages/index.html");
  const footer = page.locator(".versorgungs-app-footer");
  await expect(footer).toBeVisible();
  const defaultLayout = await footer.evaluate((root) => {
    const link = root.querySelector("a").getBoundingClientRect();
    const text = root.querySelector("span").getBoundingClientRect();
    return { rowDelta: Math.abs(link.top - text.top), overflow: root.scrollWidth - root.clientWidth };
  });
  expect(defaultLayout.rowDelta).toBeLessThanOrEqual(1);
  expect(defaultLayout.overflow).toBeLessThanOrEqual(1);
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const largeLayout = await footer.evaluate((root) => ({
    overflow: root.scrollWidth - root.clientWidth,
    childrenFit: [...root.children].every((child) => {
      const rect = child.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth;
    })
  }));
  expect(largeLayout.overflow).toBeLessThanOrEqual(1);
  expect(largeLayout.childrenFit).toBe(true);
});
