import { expect, test } from "@playwright/test";

const expectedFlags = [
  ["Alle", "Deutschland", "svg"],
  ["Baden-Württemberg", "Baden-Württemberg", "svg"],
  ["Bayern", "Bayern", "svg"],
  ["Berlin", "Berlin", "img"],
  ["Brandenburg", "Brandenburg", "img"],
  ["Bremen", "Bremen", "img"],
  ["Hamburg", "Hamburg", "svg"],
  ["Hessen", "Hessen", "svg"],
  ["Mecklenburg-Vorpommern", "Mecklenburg-Vorpommern", "svg"],
  ["Niedersachsen", "Niedersachsen", "img"],
  ["Nordrhein-Westfalen", "Nordrhein-Westfalen", "svg"],
  ["Rheinland-Pfalz", "Rheinland-Pfalz", "img"],
  ["Saarland", "Saarland", "img"],
  ["Sachsen", "Sachsen", "svg"],
  ["Sachsen-Anhalt", "Sachsen-Anhalt", "img"],
  ["Schleswig-Holstein", "Schleswig-Holstein", "svg"],
  ["Thüringen", "Thüringen", "svg"]
];

test("Pages-Demo: Bundesland-Flaggen sind vollständig und korrekt zugeordnet", async ({ page }, testInfo) => {
  await page.goto("/dist/pages/versorgungs-kompass.html#map");
  const mapFrame = page.frameLocator("#map-view-frame");
  const isMobile = testInfo.project.name.includes("mobile");
  let stateMenu;
  if (isMobile) {
    const stateTrigger = mapFrame.locator("#mobile-state-filter");
    await expect(stateTrigger).toBeVisible();
    stateMenu = mapFrame.locator("#mobile-state-filter + .map-filter-menu");
    await stateTrigger.click();
  } else {
    await expect(mapFrame.locator("#filters")).toBeVisible();
    const filterDropdowns = mapFrame.locator("#filters .map-filter-dropdown");
    await expect(filterDropdowns).toHaveCount(3);
    const stateDropdown = filterDropdowns.nth(1);
    stateMenu = stateDropdown.locator(".map-filter-menu");
    await stateDropdown.locator(".map-filter-trigger").click();
  }

  await expect(stateMenu).toBeVisible();
  const renderedFlags = await stateMenu.locator(".map-filter-option").evaluateAll((options) =>
    options.map((option) => {
      const flag = option.querySelector(".map-filter-state-flag");
      return [
        option.getAttribute("aria-label"),
        flag?.getAttribute("data-state-flag"),
        flag?.firstElementChild?.tagName.toLowerCase()
      ];
    })
  );
  expect(renderedFlags).toEqual(expectedFlags);

  const assetFlags = stateMenu.locator(".map-filter-state-flag img");
  await expect(assetFlags).toHaveCount(7);
  await expect.poll(() => assetFlags.evaluateAll((images) =>
    images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
  )).toBe(true);

  const northRhineWestphaliaStripes = await stateMenu
    .locator('[data-state-flag="Nordrhein-Westfalen"] svg')
    .evaluate((svg) => Array.from(svg.querySelectorAll("rect"), (rect) => ({
      x: rect.getAttribute("x") || "0",
      y: rect.getAttribute("y") || "0",
      width: rect.getAttribute("width"),
      height: rect.getAttribute("height")
    })));
  expect(northRhineWestphaliaStripes).toEqual([
    { x: "0", y: "0", width: "18", height: "4" },
    { x: "0", y: "4", width: "18", height: "4" },
    { x: "0", y: "8", width: "18", height: "4" }
  ]);

  const mecklenburgWesternPomeraniaStripes = await stateMenu
    .locator('[data-state-flag="Mecklenburg-Vorpommern"] svg')
    .evaluate((svg) => Array.from(svg.querySelectorAll("rect"), (rect) => [
      rect.getAttribute("y") || "0",
      rect.getAttribute("height")
    ]));
  expect(mecklenburgWesternPomeraniaStripes).toEqual([
    ["0", "3.2"],
    ["3.2", "2.4"],
    ["5.6", ".8"],
    ["6.4", "2.4"],
    ["8.8", "3.2"]
  ]);
});
