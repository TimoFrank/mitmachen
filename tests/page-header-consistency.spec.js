import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const routeGroups = [
  [
    ["care", "Übersicht"],
    ["contacts", "Kontakte"],
    ["organizations", "Organisationen"],
    ["map", "Karte"],
    ["analytics", "Auswertung"],
    ["quality", "Datenqualität"],
    ["activities", "Aktivitäten"]
  ],
  [
    ["patients", "Patienten"],
    ["politics", "Politik"],
    ["press", "Presse"],
    ["stakeholders", "Stakeholder-Kompass"],
    ["stakeholders/kv", "Kassenärztliche Vereinigungen"],
    ["experts", "Expertenkreis"]
  ],
  [
    ["framework", "Hospitationsframework"],
    ["hospitations", "Hospitationen"],
    ["hospitations:observations", "Beobachtungen"],
    ["hospitations:patterns", "Muster"],
    ["hospitations:dashboard", "Dashboard"],
    ["questionnaire", "Hospitations-Fragebogen"],
    ["formats", "Formate"]
  ],
  [
    ["team", "Teams"],
    ["profile", "Mein Profil"],
    ["profile-notifications", "Benachrichtigungen"],
    ["profile-imports:registrations", "Registrierungskonzept"],
    ["profile-imports:imports", "Dateiimport"],
    ["profile-imports:onlineEntry", "Online-Erfassung"],
    ["profile-imports:importHistory", "Importhistorie"],
    ["profile-settings", "Einstellungen"],
    ["profile-changelog", "Changelog"],
    ["profile-about", "Über die App"]
  ]
];

function appPath(route) {
  return `/frontend/app/versorgungs-kompass.html#${route}`;
}

async function expectUnifiedHeader(page, route, title) {
  await expect(page.locator(".workspace-header.workspace-header--unified")).toBeVisible();
  await expect(page.locator("#workspace-view-title")).toHaveText(title);
  await expect(page.locator("#workspace-view-subtitle")).not.toHaveText("");
  await expect(page.locator("#workspace-view-subtitle")).toBeHidden();
  await expect(page.locator("h1:visible")).toHaveCount(1);
  await expect(page.locator("[data-workspace-brand]:visible")).toHaveCount(1);
  await expect(page.locator(".workspace-heading-row")).toBeVisible();
  await expect(page.locator(".workspace-header--unified #summary-grid")).toHaveCount(0);
  await expect(page).toHaveTitle(`${title} · #Mitmachen`);

  if (route === "framework") await expect(page.locator("#view-framework .framework-header")).toHaveCount(0);
  if (route === "hospitations") await expect(page.locator("#hospitation-command-row")).toHaveCount(0);
  if (route === "hospitations:observations") await expect(page.locator("#hospitation-observations-workbench .observation-page-header__copy")).toHaveCount(0);
  if (route === "hospitations:patterns") await expect(page.locator("#hospitation-patterns-workbench .hospitation-patterns-header")).toHaveCount(0);
  if (route === "hospitations:dashboard") await expect(page.locator("#hospitation-dashboard > .hospitation-dashboard-preview-card")).toHaveCount(0);
  if (route === "questionnaire") await expect(page.locator("#view-questionnaire .questionnaire-toolbar h2")).toHaveCount(0);
  if (route === "analytics") await expect(page.locator("#view-analytics .analytics-head")).toHaveCount(0);

  const geometry = await page.locator(".workspace-heading-row").evaluate((headerRow) => {
    const style = getComputedStyle(headerRow);
    const titleElement = headerRow.querySelector("h1");
    const brandElement = headerRow.querySelector("[data-workspace-brand]");
    const brandImage = brandElement?.querySelector("img");
    const titleStyle = titleElement ? getComputedStyle(titleElement) : null;
    const rowRect = headerRow.getBoundingClientRect();
    const titleRect = titleElement?.getBoundingClientRect();
    const brandRect = brandElement?.getBoundingClientRect();
    const brandImageRect = brandImage?.getBoundingClientRect();
    return {
      borderTopWidth: style.borderTopWidth,
      backgroundImage: style.backgroundImage,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      titleFontWeight: Number.parseInt(titleStyle?.fontWeight || "0", 10),
      titleFontSize: Number.parseFloat(titleStyle?.fontSize || "0"),
      rowHeight: rowRect.height,
      brandImageHeight: brandImageRect?.height || 0,
      verticalCenterDelta: titleRect && brandRect
        ? Math.abs((titleRect.top + titleRect.height / 2) - (brandRect.top + brandRect.height / 2))
        : Number.POSITIVE_INFINITY,
      brandRightInset: brandRect ? rowRect.right - brandRect.right : Number.POSITIVE_INFINITY,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(geometry.borderTopWidth, `Header-Kontur auf #${route}`).toBe("1px");
  expect(geometry.backgroundImage, `Header-Fläche auf #${route}`).not.toBe("none");
  expect(Number.parseFloat(geometry.borderRadius), `Header-Rundung auf #${route}`).toBeGreaterThan(0);
  expect(geometry.boxShadow, `Header-Tiefe auf #${route}`).not.toBe("none");
  expect(geometry.titleFontWeight).toBeGreaterThanOrEqual(800);
  expect(geometry.titleFontSize).toBeLessThanOrEqual(20);
  expect(geometry.rowHeight).toBeLessThanOrEqual(76);
  expect(geometry.brandImageHeight).toBeGreaterThanOrEqual(40);
  expect(geometry.verticalCenterDelta).toBeLessThanOrEqual(2);
  expect(geometry.brandRightInset).toBeGreaterThanOrEqual(10);
  expect(geometry.brandRightInset).toBeLessThanOrEqual(18);
  expect(geometry.overflow).toBeLessThanOrEqual(1);

  const contextTabs = page.locator(".workspace-header--unified .workspace-expert-switcher:visible .experts-mode-nav--header");
  if (await contextTabs.count()) {
    const width = await contextTabs.evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(821);
  }
}

routeGroups.forEach((routes, groupIndex) => {
  test(`Unterseiten-Header Gruppe ${groupIndex + 1} folgen dem gemeinsamen Muster`, async ({ page }) => {
    test.setTimeout(120_000);
    const [[firstRoute, firstTitle], ...remainingRoutes] = routes;
    await gotoAuthenticated(page, appPath(firstRoute), { role: "admin" });
    await expectUnifiedHeader(page, firstRoute, firstTitle);

    for (const [route, title] of remainingRoutes) {
      await page.goto(appPath(route), { waitUntil: "load" });
      await expectUnifiedHeader(page, route, title);
    }
  });
});
