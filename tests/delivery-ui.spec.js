import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const PAGES_APP = "/dist/pages/versorgungs-kompass.html";

async function expectPagesAtlasHome(page) {
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveClass(/is-public-demo-profile/);
  await expect(shell).toHaveAttribute("data-active-view", "home");
  await expect(page.locator(".app-sidebar")).toBeHidden();
  const atlas = page.locator("#view-home [data-pages-atlas]");
  await expect(atlas.getByRole("heading", { name: "Wo Versorgung stattfindet.", level: 1 })).toBeVisible();
  await expect(atlas.locator(".atlas-brand")).toContainText("Versorgungs-Kompass");
}

test("Pages startet direkt in der App-Startseite", async ({ page }, testInfo) => {
  if (testInfo.project.name.includes("mobile")) {
    await page.setViewportSize({ width: 320, height: 568 });
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dist/pages/index.html");

  await expect(page).toHaveURL(/\/dist\/pages\/index\.html$/);
  await expect(page).toHaveTitle("Startseite | Versorgungs-Kompass");
  await expect(page.locator('body[data-public-entry="home"], [data-public-entry-styles]')).toHaveCount(0);
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await expectPagesAtlasHome(page);
  await expect(page.locator("#global-status")).toBeHidden();
  const destinations = page.locator(".home-destination-link");
  await expect(destinations).toHaveCount(4);
  await expect(page.locator(".home-destination-name")).toHaveText(["Versorgung", "Stakeholder", "Hospitation", "Formate"]);
  const marks = destinations.locator(".home-destination-link__mark");
  await expect(marks).toHaveCount(4);
  await expect.poll(() => marks.evaluateAll((images) => images.every((img) =>
    img.complete && img.naturalWidth > 0
  ))).toBe(true);
  const navigation = page.getByRole("navigation", { name: "Arbeitsbereiche" });
  await expect(navigation.getByRole("link")).toHaveCount(4);
  await expect(page.locator(".versorgungs-app-footer, [data-atlas-playback], [data-atlas-modules]")).toHaveCount(0);
  await expect(page.locator('#view-home summary').filter({ hasText: "Kartengrundlagen" })).toHaveCount(0);
  await expect(page.locator("#home-tour-button")).toHaveCount(0);
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
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "home");
});

test("Arbeitsbereiche sind auch bei reduzierter Bewegung direkt erreichbar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dist/pages/index.html");

  const atlas = page.locator("[data-pages-atlas]");
  await expect(atlas).toHaveAttribute("data-renderer", /^(webgl|fallback)$/);
  if (await atlas.getAttribute("data-renderer") === "webgl") {
    const stage = atlas.locator(".art-stage");
    await expect(stage).toHaveAttribute("data-unlocked", "true");
    await expect(atlas.locator(".site-keys [data-site]")).toHaveCount(15);
    await stage.focus();
    await page.keyboard.press("1");
    const selected = atlas.locator('.site-keys [data-site][aria-pressed="true"]');
    await expect(selected).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(selected).toHaveCount(0);
  } else {
    await expect(atlas.locator(".fallback img")).toBeVisible();
  }
  const care = page.getByRole("link", { name: "Versorgung", exact: true });
  await care.focus();
  await expect(care).toBeFocused();
  await expect(care).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#map$/);
  const map = page.frameLocator("#map-view-frame");
  await expect(map.getByRole("button", { name: "Sektoren", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Versorgung wartet auf die gezeichnete Karte und lässt sich beim Laden verlassen", async ({ page }) => {
  // The iframe may already be loaded while its contacts are still in transit.
  await page.addInitScript(() => {
    function holdContacts(event) {
      if (event.data?.type !== "versorgungs-kompass-map-data" || event.data.channel !== "contacts") return;
      event.stopImmediatePropagation();
      window.deliverPendingMapContacts = () => {
        window.removeEventListener("message", holdContacts, true);
        window.dispatchEvent(new MessageEvent("message", {
          data: event.data, origin: event.origin, source: event.source
        }));
      };
    }
    window.addEventListener("message", holdContacts, true);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dist/pages/index.html", { waitUntil: "domcontentloaded" });
  const loader = page.locator("#module-entry-loader");
  const care = page.getByRole("link", { name: "Versorgung", exact: true });
  await care.click();
  await expect(loader).toBeVisible();
  const map = page.frameLocator("#map-view-frame");
  const mapDocument = map.locator("html");
  await expect.poll(() => mapDocument.evaluate(() =>
    document.readyState === "complete" && typeof window.deliverPendingMapContacts === "function"
  )).toBe(true);
  await expect(loader).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/dist\/pages\/index\.html$/);
  await expectPagesAtlasHome(page);
  await expect(care).toBeFocused();
  await page.goForward({ waitUntil: "commit" });
  await expect(page).toHaveURL(/#map$/);
  await expect(loader).toBeHidden();
  await page.goBack({ waitUntil: "commit" });
  await expectPagesAtlasHome(page);
  await expect(loader).toBeHidden();
  await care.click();
  await expect(loader).toBeVisible();
  await mapDocument.evaluate(() => window.deliverPendingMapContacts());
  await expect(loader).toBeHidden();
  await expect(map.locator(".cat-marker").first()).toBeVisible();
  await expect(map.getByRole("button", { name: "Sektoren", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Ein fehlgeschlagener Kartenstart lässt sich direkt erneut versuchen", async ({ page }) => {
  let failedOnce = false;
  await page.route("**/versorgungs-kompass-map.js*", (route) => {
    if (!failedOnce && new URL(route.request().frame().url()).searchParams.get("channel") === "contacts") {
      failedOnce = true;
      return route.abort();
    }
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dist/pages/index.html");
  await page.getByRole("link", { name: "Versorgung", exact: true }).click();
  const loader = page.locator("#module-entry-loader");
  await expect(loader).toContainText("Die Karte konnte nicht geladen werden.");
  await loader.locator("#module-entry-retry").click();
  await expect(loader).toBeHidden();
  await expect(page.frameLocator("#map-view-frame").locator(".cat-marker").first()).toBeVisible();
});

test("Startseiteneinstieg öffnet den passenden Navigationsbereich auf Desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Der Desktop-Zustand wird im Desktop-Projekt geprüft.");
  await page.goto("/dist/pages/index.html");

  const shell = page.locator(".app-shell");
  await expectPagesAtlasHome(page);
  await page.locator('.home-destination-link[data-home-module="planning"]').click();

  await expect(page).toHaveURL(/#hospitation-overview$/);
  await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
  await expect(page.locator("#sidebar-collapse-button")).toBeHidden();
  await expect(page.locator("#sidebar-resize-handle")).toBeInViewport();
  await expect(page.locator(".sidebar-nav")).toBeVisible();
  await expect(page.locator(".sidebar-account-section")).toBeVisible();
  await expect(page.locator(".sidebar-brand-word")).toBeVisible();
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveClass(/is-active-section/);
  await expect(page.locator('[data-sidebar-section-toggle="planning"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-view-tab="hospitationOverview"]')).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/\/dist\/pages\/index\.html$/);
  await expectPagesAtlasHome(page);
});

test("Startseiteneinstiege lassen die mobile Navigation eingeklappt", async ({ page }) => {
  test.slow(); // Four complete module entries and returns to the WebGL atlas.
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
    await expect(page.locator("#module-entry-loader")).toBeHidden();
    await expect(shell).not.toHaveClass(/is-mobile-sidebar-expanded/);
    await expect(page.locator("#sidebar-collapse-button")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".sidebar-nav")).toBeHidden();
    await expect(page.locator(".sidebar-account-section")).toBeHidden();
    await expect(page.locator(`[data-view-panel="${item.view}"]`)).toBeVisible();
    await expect(page.locator(`[data-sidebar-section="${item.group}"]`)).toHaveClass(/is-active-section/);

    await page.locator("#brand-home-link").click();
    await expect(page).toHaveURL(/#home$/);
    await expectPagesAtlasHome(page);
  }
});

test("Mobile-Auslieferung: Startklar-Hinweis erscheint erst im Versorgungs-Kompass", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dist/pages/index.html");

  const status = page.locator("#global-status");
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
  await expect(page.locator("[data-pages-atlas]")).toHaveCount(0);
  await expect(page.locator(".versorgungs-app-footer")).toBeVisible();
  await expect(page.locator("#sidebar-resize-handle")).toBeHidden();
  await expect(page.locator(".sidebar-brand-word")).toBeVisible();
  if ((page.viewportSize()?.width || 0) <= 760) {
    await expect(page.locator("#sidebar-collapse-button")).toBeVisible();
    await expect(page.locator(".sidebar-nav")).toBeHidden();
    await expect(page.locator(".sidebar-account-section")).toBeHidden();
  } else {
    await expect(page.locator("#sidebar-collapse-button")).toBeHidden();
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

test("Die Arbeitsbereiche bleiben beim Drehen und Scrollen vollständig im Bild", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dist/pages/index.html");
  await expectPagesAtlasHome(page);

  const links = page.getByRole("navigation", { name: "Arbeitsbereiche" }).getByRole("link");
  await expect(links).toHaveCount(4);
  for (const [width, height] of [[320, 568], [568, 320], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    for (const link of await links.all()) {
      await expect(link).toBeInViewport({ ratio: 1 });
      const isClickable = await link.evaluate((anchor) => {
        const rect = anchor.getBoundingClientRect();
        return anchor.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      });
      expect(isClickable).toBe(true);
    }
    const first = await links.first().boundingBox();
    expect(first.x).toBeLessThan(width / 4);
    expect(first.y).toBeGreaterThan(height / 2);

    await page.mouse.move(8, height / 2);
    await page.mouse.wheel(0, height);
    await page.keyboard.press("PageDown");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const offset = await links.first().evaluate((anchor) => {
      let top = 0;
      for (let el = anchor; el; el = el.parentElement) top += Math.abs(el.scrollTop);
      return top;
    });
    expect(offset).toBe(0);
    await expect(links.first()).toBeInViewport({ ratio: 1 });
  }
});
