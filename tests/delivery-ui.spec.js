import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const PAGES_APP = "/dist/pages/versorgungs-kompass.html";

test("Desktop-Auslieferung: Pages startet direkt in der App-Startseite", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    window.__homeRevealAnimationStarts = 0;
    document.addEventListener("animationstart", (event) => {
      if (event.animationName === "homeSetCharacter") window.__homeRevealAnimationStarts += 1;
    }, true);
  });
  await page.goto("/dist/pages/index.html");

  await expect(page).toHaveURL(/\/dist\/pages\/index\.html$/);
  await expect(page).toHaveTitle("Startseite · #Mitmachen");
  await expect(page.locator('body[data-public-entry="home"], [data-public-entry-styles]')).toHaveCount(0);
  await expect(page.locator(".app-sidebar")).toBeVisible();
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  const destinations = page.locator(".home-destination-link");
  await expect(destinations).toHaveCount(4);
  await expect(destinations.locator("strong")).toHaveText([
    "Versorgungs-Kompass",
    "Stakeholder-Kompass",
    "Hospitations-Kompass",
    "Format-Kompass"
  ]);
  await expect(destinations.locator(".home-destination-link__mark")).toHaveCount(4);
  await expect(destinations.locator(".home-destination-link__copy")).toHaveText([
    "Versorgung regional verstehen.",
    "Perspektiven gezielt verbinden.",
    "Von Beobachtung zu Evidenz.",
    "Austausch wirksam gestalten."
  ]);
  const subtitleMetrics = await destinations.locator(".home-destination-link__copy").evaluateAll((nodes) =>
    nodes.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const lineTops = new Set(
        Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => Math.round(rect.top))
      );
      return {
        lineCount: lineTops.size,
        fits: node.scrollWidth <= node.clientWidth + 1
      };
    })
  );
  expect(subtitleMetrics).toEqual([
    { lineCount: 1, fits: true },
    { lineCount: 1, fits: true },
    { lineCount: 1, fits: true },
    { lineCount: 1, fits: true }
  ]);
  expect(await destinations.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual([
    "#map",
    "#stakeholders",
    "#framework",
    "#formats"
  ]);

  const heading = page.locator(".home-reveal-heading");
  await expect(heading.locator(".home-reveal-heading__line")).toHaveCount(3);
  await expect(heading).not.toHaveClass(/is-static/);
  await expect.poll(() => page.evaluate(() => window.__homeRevealAnimationStarts)).toBeGreaterThan(0);
  await expect(heading).toHaveClass(/is-complete/, { timeout: 5_000 });
  await expect(heading.locator(".home-reveal-heading__char")).not.toHaveCount(0);

  const heroSpacing = await page.locator(".home-hero").evaluate((hero) => {
    const brand = hero.querySelector(".home-hero__brand")?.getBoundingClientRect();
    const title = hero.querySelector(".home-reveal-heading")?.getBoundingClientRect();
    const lead = hero.querySelector(".home-hero__lead")?.getBoundingClientRect();
    const cue = hero.querySelector(".home-scroll-cue")?.getBoundingClientRect();
    return {
      brandWidth: brand?.width || 0,
      brandToTitle: brand && title ? title.top - brand.bottom : 0,
      titleToLead: title && lead ? lead.top - title.bottom : 0,
      leadToCue: lead && cue ? cue.top - lead.bottom : 0
    };
  });
  const isMobileProject = testInfo.project.name.includes("mobile");
  expect(heroSpacing.brandWidth).toBeGreaterThan(isMobileProject ? 250 : 340);
  expect(heroSpacing.brandToTitle).toBeGreaterThanOrEqual(isMobileProject ? 34 : 44);
  expect(heroSpacing.titleToLead).toBeGreaterThanOrEqual(26);
  expect(heroSpacing.leadToCue).toBeGreaterThanOrEqual(38);
});

test("Desktop-Auslieferung: reduzierte Bewegung zeigt die Startüberschrift ruhig", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dist/pages/index.html");

  const heading = page.locator(".home-reveal-heading");
  await expect(heading).toHaveClass(/is-static/);
  await expect(heading.locator(".home-reveal-heading__line")).toHaveCount(3);
  await expect(heading.locator(".home-reveal-heading__char").first()).toHaveCSS("animation-name", "none");
  await expect(heading.locator(".home-reveal-heading__char").first()).toHaveCSS("opacity", "1");
});

test("Mobile-Auslieferung: Startklar-Hinweis bleibt oberhalb der Fußzeile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dist/pages/index.html");

  const status = page.locator("#global-status");
  const footer = page.locator(".versorgungs-app-footer");
  await expect(status).toBeVisible();
  await expect(status).toHaveText(/Startklar: \d+ synthetische Demo-Kontakte stehen bereit\./);
  await expect(status).toHaveClass(/is-ready/);
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");

  const [statusBox, footerBox] = await Promise.all([status.boundingBox(), footer.boundingBox()]);
  expect(statusBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(footerBox.y - 8);
  expect(statusBox.x).toBeGreaterThanOrEqual(0);
  expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(390);
});

test("Geschützte Auslieferung: Kontakte werden motivierend als startklar angekündigt", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#home");

  const status = page.locator("#global-status");
  await expect(status).toBeVisible();
  await expect(status).toHaveText(/Startklar: \d+ Kontakte stehen bereit\./);
  await expect(status).not.toContainText("Backend");
  await expect(status).toHaveClass(/is-ready/);
});

test("Desktop-Auslieferung: Standortmarker behalten den gematik-Stil und ihre echten Positionen", async ({ page }) => {
  await page.goto(`${PAGES_APP}#map`);
  const mapFrame = page.frameLocator("#map-view-frame");

  await expect(mapFrame.locator("#map")).toBeVisible();
  await expect(mapFrame.getByRole("button", { name: "Standorte", exact: true })).toHaveAttribute("aria-pressed", "true");

  const markerShell = mapFrame.locator(".gematik-marker-shell").first();
  const marker = markerShell.locator(".gematik-marker");
  await expect(markerShell).toBeVisible({ timeout: 20_000 });
  await expect(marker).toBeVisible();
  await expect(marker.locator('path[fill="#00ff65"]')).toHaveCount(1);
  await expect(mapFrame.locator(".cat-marker")).toHaveCount(0);

  await expect.poll(() => mapFrame.locator("#map").evaluate(() => {
    const entries = globalThis.eval("markerIndex");
    return entries.length > 0 && entries.every(({ data, marker: leafletMarker }) => {
      const latLng = leafletMarker.getLatLng();
      return Math.abs(latLng.lat - Number(data.lat)) < 1e-7
        && Math.abs(latLng.lng - Number(data.lon)) < 1e-7;
    });
  })).toBe(true);
});
