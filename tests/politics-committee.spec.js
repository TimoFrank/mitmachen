import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const APP_PATH = "/frontend/app/versorgungs-kompass.html";
const POLITICS_VIEW = '[data-view-panel="politics"]';
const POLITICS_TAB = '[data-view-tab="politics"]';
const COMMITTEE_TABLE = '[aria-label="Mitglieder des Ausschusses für Gesundheit"]';
const MEMBER_ROWS = "[data-politics-member-id]";

const EXPECTED_FACTION_COUNTS = new Map([
  ["CDU/CSU", 13],
  ["AfD", 9],
  ["SPD", 7],
  ["Bündnis 90/Die Grünen", 5],
  ["Die Linke", 4]
]);

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
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const politicsView = page.locator(POLITICS_VIEW);
  const committeeTable = politicsView.locator(COMMITTEE_TABLE);
  const memberRows = committeeTable.locator(MEMBER_ROWS);

  await expect(politicsView).toBeVisible();
  await expect(committeeTable).toBeVisible();
  await expect(memberRows).toHaveCount(38);

  for (const [faction, count] of EXPECTED_FACTION_COUNTS) {
    await expect(memberRows.filter({ hasText: faction })).toHaveCount(count);
  }

  await page.locator("#search").fill("Demo-Ausschussmitglied 01");

  const visibleRows = committeeTable.locator(`${MEMBER_ROWS}:visible`);
  await expect(visibleRows).toHaveCount(1);
  await expect(visibleRows.first()).toContainText("Demo-Ausschussmitglied 01");
  await expect(visibleRows.first().locator('a[href*="bundestag.de"]')).toHaveAttribute(
    "href",
    /^https:\/\/(?:www\.)?bundestag\.de\//
  );
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
