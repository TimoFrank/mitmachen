import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const APP_PATH = "/frontend/app/versorgungs-kompass.html";
const POLITICS_VIEW = '[data-view-panel="politics"]';
const POLITICS_TAB = '[data-view-tab="politics"]';
const COMMITTEE_TABLE = '[aria-label="Mitglieder des Ausschusses für Gesundheit"]';
const MEMBER_ROWS = "[data-politics-member-id]";
const POLITICS_PROFILE = ".detail-panel--politics";
const POLITICS_DRAWER = "#detail-drawer";
const POLITICS_MAP_PANEL = "#politics-map-panel";
const POLITICS_MAP_FRAME = "#politics-map-frame";

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
  await expect(memberRows.locator(".politics-member-avatar img")).toHaveCount(38);
  await expect(memberRows.locator(".avatar-fallback")).toHaveCount(0);
  const firstPortrait = memberRows.first().locator(".politics-member-avatar img");
  await expect(firstPortrait).toBeVisible();
  await expect(firstPortrait).toHaveAttribute(
    "src",
    /^https:\/\/www\.bundestag\.de\/resource\/image\//
  );
  await expect.poll(() => firstPortrait.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);

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

  const firstPostalCodeCell = memberRows.first().locator('[data-politics-field="postalCodes"]');
  await expect(firstPostalCodeCell).toHaveText("10100");
  await expect(firstPostalCodeCell).not.toContainText("10101");

  await page.locator("#search").fill("10100");
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`)).toHaveCount(1);
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`).first()).toContainText("Demo-Wahlkreis 01");

  await page.locator("#search").fill("10101");
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`)).toHaveCount(0);

  await page.locator("#search").fill("Landesliste Hessen");
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`)).toHaveCount(1);
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`).first()).toContainText("Kein Wahlkreis");
  await expect(committeeTable.locator(`${MEMBER_ROWS}:visible`).first()).toContainText("Nicht zutreffend");
});

test("Nicht freigegebene Bundestag-Portraits bleiben hinter dem Bildrechte-Gate", async ({ page }) => {
  const fixture = createProtectedBackendFixture({ role: "admin" });
  fixture.healthCommittee.members[0].imageRightsStatus = "review_required";
  const blockedPortraitUrl = fixture.healthCommittee.members[0].imageUrl;
  const blockedPortraitRequests = [];
  page.on("request", (request) => {
    if (request.url() === blockedPortraitUrl) blockedPortraitRequests.push(request.url());
  });

  await gotoAuthenticated(page, `${APP_PATH}#politics`, { backendFixture: fixture });

  const firstRow = page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first();
  await expect(firstRow.locator(".politics-member-avatar img")).toHaveCount(0);
  await expect(firstRow.locator(".avatar-fallback")).toBeVisible();
  expect(blockedPortraitRequests).toEqual([]);

  await firstRow.locator("[data-open-politics-profile]").click();
  const profile = page.locator(POLITICS_PROFILE);
  await expect(profile.locator(".politics-member-avatar img")).toHaveCount(0);
  await expect(profile.locator(".avatar-fallback")).toBeVisible();
  await expect(profile).toContainText("wird ohne nachgewiesene Weiterverwendungsfreigabe aber nicht eingebettet");
});

test("Freigegebene Bilder aus der Bundestag-Bilddatenbank werden vollständig mit Quellenhinweis gezeigt", async ({ page }) => {
  const fixture = createProtectedBackendFixture({ role: "admin" });
  const member = fixture.healthCommittee.members[0];
  member.imageUrl = "https://bilddatenbank.bundestag.de/fotos/file7o2ln3nzw44uqicjh0.jpg";
  member.imageSourceUrl = "https://bilddatenbank.bundestag.de/site/picture-detail?id=5013430";
  member.imageAttribution = "Deutscher Bundestag/Jörg Carstensen / photothek";
  member.imageLicense = "Private und kommerzielle nicht-werbliche Nutzung";
  member.imageProvider = "Bilddatenbank des Deutschen Bundestages";
  member.imageUsageTermsUrl = "https://bilddatenbank.bundestag.de/site/nutzungsbedingungen";
  member.imageRightsStatus = "approved";
  await page.route(member.imageUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#dce8ff"/></svg>'
    });
  });

  await gotoAuthenticated(page, `${APP_PATH}#politics`, { backendFixture: fixture });

  const firstRow = page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first();
  const portrait = firstRow.locator(".politics-member-avatar img");
  await expect(portrait).toHaveAttribute("src", member.imageUrl);
  await expect(portrait).toHaveCSS("object-fit", "contain");

  await firstRow.locator("[data-open-politics-profile]").click();
  const profile = page.locator(POLITICS_PROFILE);
  await expect(profile).toContainText("private und kommerzielle nicht-werbliche Zwecke");
  await expect(profile).toContainText("Werbe- und Wahlkampfnutzung");
  await expect(profile.locator(`a[href="${member.imageSourceUrl}"]`)).toBeVisible();
  await expect(profile.locator(`a[href="${member.imageUsageTermsUrl}"]`)).toBeVisible();
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

  await postalFilter.click();
  await postalMenu.locator("[data-politics-filter-search]").fill("10101");
  await expect(postalMenu.locator('[data-politics-filter-value="10101"]')).toHaveCount(0);
});

test("Politik-Mitglieder öffnen im rechten Drawer mit Wahlkreis, ausgewählter PLZ, Minikarte und Bildquelle", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const firstRow = page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first();
  await firstRow.locator("[data-open-politics-profile]").click();

  await expect(page).toHaveURL(/#person\/politics\/demo-health-committee-member-01$/);
  await expect(page.locator(POLITICS_VIEW)).toBeVisible();
  await expect(page.locator("#person-profile-page")).toBeHidden();
  const drawer = page.locator(POLITICS_DRAWER);
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  const profile = page.locator(POLITICS_PROFILE);
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute("role", "dialog");
  await expect(profile).toHaveAttribute("aria-modal", "true");
  await expect(profile.locator(".detail-tabs")).toHaveCount(0);
  await expect(profile).toContainText("Demo-Ausschussmitglied 01");
  await expect(profile).toContainText("Wahlkreis 091: Demo-Wahlkreis 01");
  await expect(profile).toContainText("PLZ (Auswahl)");
  await expect(profile.locator(".politics-postal-code")).toHaveText("10100");
  await expect(profile).not.toContainText("10101");
  await expect(profile).toContainText("Deutscher Bundestag / Demo-Fotografie 01");
  await expect(profile.locator(".politics-member-avatar img")).toBeVisible();
  await expect(profile.locator(".avatar-fallback")).toHaveCount(0);
  await expect(profile).toContainText("Dieses Portrait ist frei lizenziert");
  await expect(profile.locator('a[href="https://www.bundestag.de/services/impressum"]')).toBeVisible();
  const miniMap = profile.locator(".politics-constituency-preview");
  await expect(miniMap).toBeVisible();
  await expect(miniMap.locator(".politics-constituency-preview__state")).toHaveCount(16);
  await expect(miniMap.locator(".politics-constituency-preview__highlight")).toHaveCount(1);
  await expect(miniMap.locator(".politics-constituency-preview__point")).toHaveCount(1);
  await expect(miniMap).toContainText("PLZ-Auswahl 10100");

  if (!testInfo.project.name.includes("mobile")) {
    const panelBounds = await profile.boundingBox();
    const viewport = page.viewportSize();
    expect(panelBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(panelBounds.width).toBeLessThanOrEqual(650);
    expect(Math.abs((panelBounds.x + panelBounds.width) - viewport.width)).toBeLessThanOrEqual(1);
    expect(panelBounds.width).toBeLessThan(viewport.width * 0.6);
  }

  const overflow = await page.locator("html").evaluate((node) =>
    Math.max(0, node.scrollWidth - node.clientWidth)
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await profile.locator("#detail-close").click();
  await expect(page).toHaveURL(/#politics$/);
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(drawer).not.toHaveClass(/is-open/);
  await expect(page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS)).toHaveCount(38);
});

test("Politik-Profile lassen sich per Tastatur aus der Tabelle öffnen", async ({ page }) => {
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const firstMemberButton = page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first().locator("[data-open-politics-profile]");
  await firstMemberButton.focus();
  await firstMemberButton.press("Enter");
  await expect(page).toHaveURL(/#person\/politics\/demo-health-committee-member-01$/);
  await expect(page.locator(POLITICS_PROFILE)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#politics$/);
  await expect(page.locator(POLITICS_DRAWER)).toHaveAttribute("aria-hidden", "true");
  await expect(firstMemberButton).toBeFocused();
});

test("Veraltete Politik-Profillinks führen sicher zur Ausschussliste zurück", async ({ page }) => {
  await gotoAuthenticated(page, `${APP_PATH}#person/politics/nicht-vorhanden`);

  await expect(page).toHaveURL(/#politics$/);
  await expect(page.locator(POLITICS_DRAWER)).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(POLITICS_VIEW)).toBeVisible();
  await expect(page.locator("#politics-data-notice")).toContainText(
    "Das verlinkte Politikprofil ist im aktuellen Ausschussstand nicht vorhanden."
  );
});

test("Politik-Kartenmodus stellt alle 38 Mitglieder und Standortmarker dar und öffnet den Drawer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Der vollständige Kartenbestand wird im Desktop-Projekt geprüft.");
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const politicsView = page.locator(POLITICS_VIEW);
  await politicsView.locator("#politics-map-open").click();

  await expect(politicsView.locator(POLITICS_MAP_PANEL)).toBeVisible();
  await expect(politicsView.locator("#politics-table-wrap")).toBeHidden();
  await expect(politicsView.locator("#politics-map-meta")).toHaveText("38 von 38 Mitgliedern kartiert");

  const map = page.frameLocator(POLITICS_MAP_FRAME);
  const mapItems = map.locator("#list [data-map-contact-id]");
  await expect(map.locator("#count")).toHaveText("38 / 38");
  await expect(mapItems).toHaveCount(38);
  await expect(map.locator(".gematik-marker[data-map-marker-id]")).toHaveCount(38);
  await expect(mapItems.first()).toContainText("Demo-Ausschussmitglied 01");
  await expect(mapItems.first().locator("img")).toBeVisible();
  await expect(mapItems.first().locator("img")).toHaveCSS("object-fit", "contain");

  await mapItems.first().click();
  await expect(page).toHaveURL(/#person\/politics\/demo-health-committee-member-01$/);
  await expect(page.locator(POLITICS_DRAWER)).toHaveClass(/is-open/);
  await expect(page.locator(POLITICS_PROFILE)).toBeVisible();
  await expect(politicsView.locator(POLITICS_MAP_PANEL)).toBeVisible();

  await page.locator(POLITICS_PROFILE).locator("#detail-close").click();
  await expect(page).toHaveURL(/#politics$/);
  await politicsView.locator("#politics-map-close").click();
  await expect(politicsView.locator(POLITICS_MAP_PANEL)).toBeHidden();
  await expect(politicsView.locator("#politics-table-wrap")).toBeVisible();
});

test("Politik bleibt auf mobilen Viewports ohne horizontalen Seiten-Overflow lesbar", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Der responsive Zustand wird im Mobile-Projekt geprüft.");
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const politicsView = page.locator(POLITICS_VIEW);
  await expect(politicsView).toBeVisible();
  await expect(politicsView.locator(COMMITTEE_TABLE)).toBeVisible();
  await expect(politicsView.locator(".politics-member-avatar img")).toHaveCount(38);

  await politicsView.locator(MEMBER_ROWS).first().locator("[data-open-politics-profile]").click();
  const drawer = page.locator(POLITICS_DRAWER);
  await expect(drawer).toHaveClass(/is-open/);
  await expect(page.locator("#person-profile-page")).toBeHidden();
  await expect(drawer.locator(".politics-constituency-preview")).toBeVisible();
  await expect(drawer.locator(".politics-postal-code")).toHaveText("10100");

  let overflow = await page.locator("html").evaluate((node) =>
    Math.max(0, node.scrollWidth - node.clientWidth)
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await drawer.locator("#detail-close").click();
  await politicsView.locator("#politics-map-open").click();
  await expect(politicsView.locator(POLITICS_MAP_PANEL)).toBeVisible();
  await expect(politicsView.locator("#politics-map-meta")).toHaveText("38 von 38 Mitgliedern kartiert");
  const mobileMap = page.frameLocator(POLITICS_MAP_FRAME);
  await expect(mobileMap.locator("#count")).toHaveText("38 / 38");
  await expect(mobileMap.locator(".gematik-marker[data-map-marker-id]")).toHaveCount(38);
  await expect(mobileMap.locator("#list [data-map-contact-id]")).toHaveCount(5);

  overflow = await page.locator("html").evaluate((node) =>
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
  await expect(politicsView.locator("#politics-map-open")).toBeHidden();
});
