import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const APP_PATH = "/frontend/app/versorgungs-kompass.html";
const POLITICS_VIEW = '[data-view-panel="politics"]';
const POLITICS_TAB = '[data-view-tab="politics"]';
const COMMITTEE_TABLE = '[aria-label="Mitglieder des Ausschusses für Gesundheit"]';
const MEMBER_ROWS = "[data-politics-member-id]";
const POLITICS_PROFILE = ".detail-panel--politics";

const EXPECTED_FACTION_COUNTS = new Map([
  ["CDU/CSU", 13],
  ["AfD", 9],
  ["SPD", 7],
  ["Bündnis 90/Die Grünen", 5],
  ["Die Linke", 4]
]);

test.beforeEach(async ({ page }) => {
  await page.route("https://www.bundestag.de/resource/image/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="214" viewBox="0 0 160 214">
          <rect width="160" height="214" fill="#e7edfb"/>
          <circle cx="80" cy="72" r="36" fill="#7587b8"/>
          <path d="M28 190c5-49 27-75 52-75s47 26 52 75" fill="#52699f"/>
        </svg>
      `
    });
  });
});

test("Politik ist über den Stakeholder-Kompass erreichbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Die Sidebar-Navigation wird im Desktop-Projekt geprüft.");
  await gotoAuthenticated(page, `${APP_PATH}#stakeholders/kv`);

  const politicsTab = page.locator(POLITICS_TAB);
  await expect(politicsTab).toBeVisible();
  await politicsTab.click();

  await expect(page).toHaveURL(/#politics$/);
  await expect(politicsTab).toHaveAttribute("aria-current", "page");
  await expect(page.locator(POLITICS_VIEW)).toBeVisible();
});

test("Politik zeigt alle 38 Ausschussmitglieder und filtert nach Namen", async ({ page }) => {
  const portraitRequests = [];
  page.on("request", (request) => {
    if (/^https:\/\/www\.bundestag\.de\/resource\/image\//.test(request.url())) {
      portraitRequests.push(request.url());
    }
  });
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const politicsView = page.locator(POLITICS_VIEW);
  const committeeTable = politicsView.locator(COMMITTEE_TABLE);
  const memberRows = committeeTable.locator(MEMBER_ROWS);

  await expect(politicsView).toBeVisible();
  await expect(committeeTable).toBeVisible();
  await expect(memberRows).toHaveCount(38);
  await expect(committeeTable.locator("#politics-table-head > div")).toHaveCount(6);
  await expect(committeeTable.locator("[data-politics-sort]")).toHaveCount(5);
  await expect(committeeTable.locator("[data-politics-header-filter-button]")).toHaveCount(5);
  await expect(memberRows.locator("img")).toHaveCount(0);
  await expect(memberRows.locator(".avatar-fallback")).toHaveCount(38);
  expect(portraitRequests).toEqual([]);

  for (const [faction, count] of EXPECTED_FACTION_COUNTS) {
    await expect(memberRows.filter({ hasText: faction })).toHaveCount(count);
  }
  await expect(memberRows.locator(".politics-party-chip--cdu-csu")).toHaveCount(13);
  await expect(memberRows.locator(".politics-party-chip--afd")).toHaveCount(9);
  await expect(memberRows.locator(".politics-party-chip--spd")).toHaveCount(7);
  await expect(memberRows.locator(".politics-party-chip--greens")).toHaveCount(5);
  await expect(memberRows.locator(".politics-party-chip--left")).toHaveCount(4);

  await page.locator("#search").fill("Demo-Ausschussmitglied 01");

  const visibleRows = committeeTable.locator(`${MEMBER_ROWS}:visible`);
  await expect(visibleRows).toHaveCount(1);
  await expect(visibleRows.first()).toContainText("Demo-Ausschussmitglied 01");
  await expect(visibleRows.first().locator('a[href*="bundestag.de"]')).toHaveAttribute(
    "href",
    /^https:\/\/(?:www\.)?bundestag\.de\//
  );

  await page.locator("#search").fill("10100");
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`)).toHaveCount(1);
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`).first()).toContainText("Demo-Wahlkreis 01");

  await page.locator("#search").fill("Landesliste Hessen");
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`)).toHaveCount(1);
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`).first()).toContainText("Kein Wahlkreis");
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`).first()).toContainText("Nicht zutreffend");
});

test("Politik lässt sich über die Tabellenköpfe sortieren und filtern", async ({ page }) => {
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const committeeTable = page.locator(COMMITTEE_TABLE);
  const rows = committeeTable.locator(MEMBER_ROWS);
  const memberSort = committeeTable.locator('[data-politics-sort="name"]');
  await expect(memberSort).toHaveAttribute("aria-sort", "ascending");
  await expect(rows.first()).toContainText("Demo-Ausschussmitglied 01");

  await memberSort.click();
  await expect(memberSort).toHaveAttribute("aria-sort", "descending");
  await expect(rows.first()).toContainText("Demo-Ausschussmitglied 38");

  const factionFilter = committeeTable.locator('[data-politics-column="faction"] [data-politics-header-filter-button]');
  await factionFilter.click();
  const factionMenu = committeeTable.locator("#politics-header-filter-faction");
  await expect(factionMenu).toBeVisible();
  await factionMenu.locator('[data-politics-filter-value="SPD"]').click();
  await expect(rows).toHaveCount(7);
  await expect(rows).toContainText(["Demo-Ausschussmitglied 29", "Demo-Ausschussmitglied 28", "Demo-Ausschussmitglied 27", "Demo-Ausschussmitglied 26", "Demo-Ausschussmitglied 25", "Demo-Ausschussmitglied 24", "Demo-Ausschussmitglied 23"]);

  await factionFilter.click();
  await factionMenu.locator('[data-politics-filter-value=""]').click();
  await expect(rows).toHaveCount(38);

  const postalFilter = committeeTable.locator('[data-politics-column="postalCodes"] [data-politics-header-filter-button]');
  await postalFilter.click();
  const postalMenu = committeeTable.locator("#politics-header-filter-postalCodes");
  await postalMenu.locator("[data-politics-filter-search]").fill("10100");
  await postalMenu.locator('[data-politics-filter-value="10100"]').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Demo-Ausschussmitglied 01");
});

test("Politik-Mitglieder besitzen reduzierte Kontaktprofile mit Wahlkreis, PLZ und Bildquelle", async ({ page }) => {
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const firstRow = page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first();
  await firstRow.locator("[data-open-politics-profile]").click();

  await expect(page).toHaveURL(/#person\/politics\/demo-health-committee-member-01$/);
  const profile = page.locator(POLITICS_PROFILE);
  await expect(profile).toBeVisible();
  await expect(profile.locator(".detail-tabs")).toHaveCount(0);
  await expect(profile).toContainText("Demo-Ausschussmitglied 01");
  await expect(profile).toContainText("Wahlkreis 091: Demo-Wahlkreis 01");
  await expect(profile).toContainText("10100");
  await expect(profile).toContainText("Deutscher Bundestag / Demo-Fotografie 01");
  await expect(profile.locator(".politics-member-avatar img")).toHaveCount(0);
  await expect(profile.locator(".avatar-fallback")).toBeVisible();
  await expect(profile).toContainText("Bis zu einer dokumentierten Nutzungsfreigabe wird das Portrait nicht eingebettet");
  await expect(profile.locator('a[href="https://www.bundestag.de/services/impressum"]')).toBeVisible();
  const overflow = await page.locator("html").evaluate((node) =>
    Math.max(0, node.scrollWidth - node.clientWidth)
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await profile.locator("[data-person-profile-back]").click();
  await expect(page).toHaveURL(/#politics$/);
  await expect(page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS)).toHaveCount(38);
});

test("Politik-Profile lassen sich per Tastatur aus der Tabelle öffnen", async ({ page }) => {
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const firstMemberButton = page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first().locator("[data-open-politics-profile]");
  await firstMemberButton.focus();
  await firstMemberButton.press("Enter");
  await expect(page).toHaveURL(/#person\/politics\/demo-health-committee-member-01$/);
  await expect(page.locator(POLITICS_PROFILE)).toBeVisible();
});

test("Politik bleibt auf mobilen Viewports ohne horizontalen Seiten-Overflow lesbar", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Der responsive Zustand wird im Mobile-Projekt geprüft.");
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const politicsView = page.locator(POLITICS_VIEW);
  await expect(politicsView).toBeVisible();
  await expect(politicsView.locator(COMMITTEE_TABLE)).toBeVisible();

  const overflow = await page.locator("html").evaluate((node) =>
    Math.max(0, node.scrollWidth - node.clientWidth)
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Die öffentliche Demo zeigt keine realen Ausschuss-Personendaten", async ({ page }) => {
  await page.goto("/dist/pages/versorgungs-kompass.html#politics");

  const politicsView = page.locator(POLITICS_VIEW);
  await expect(politicsView).toBeVisible();
  await expect(politicsView.locator("#politics-data-notice")).toContainText(
    "In der öffentlichen Demo werden keine realen Personendaten angezeigt."
  );
  await expect(politicsView.locator(MEMBER_ROWS)).toHaveCount(0);
});
