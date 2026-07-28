import { expect, test } from "@playwright/test";

const PAGES_APP = "/dist/pages/versorgungs-kompass.html";

test("Desktop-Auslieferung: Pages startet direkt in der App-Startseite", async ({ page }) => {
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
  expect(await destinations.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual([
    "#map",
    "#stakeholders",
    "#framework",
    "#formats"
  ]);
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
