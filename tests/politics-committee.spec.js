import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const APP_PATH = "/frontend/app/versorgungs-kompass.html";
const PAGES_OFFLINE_POLITICS_PATH = "/dist/pages/politik-offline.html";
const POLITICS_VIEW = '[data-view-panel="politics"]';
const POLITICS_TAB = '[data-view-tab="politics"]';
const COMMITTEE_TABLE = '[aria-label="Mitglieder des Ausschusses für Gesundheit"]';
const MEMBER_ROWS = "[data-politics-member-id]";
const POLITICS_PROFILE = ".detail-panel--politics";
const POLITICS_DRAWER = "#detail-drawer";
const POLITICS_MAP_PANEL = "#politics-map-panel";
const POLITICS_MAP_FRAME = "#politics-map-frame";
const FIRST_MEMBER_ID = "demo-health-committee-member-01";

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

  await page.locator('[data-sidebar-subnav="stakeholder-people"] > .sidebar-subnav__toggle').click();
  const politicsTab = page.locator(POLITICS_TAB);
  await expect(politicsTab).toBeVisible();
  await politicsTab.click();

  await expect(page).toHaveURL(/#politics$/);
  await expect(politicsTab).toHaveAttribute("aria-current", "page");
  await expect(page.locator(POLITICS_VIEW)).toBeVisible();
});

test("Politik zeigt alle 38 Ausschussmitglieder und filtert nach Namen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Vollbestand und Tabellenfilter werden im Desktop-Projekt geprüft.");
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const politicsView = page.locator(POLITICS_VIEW);
  const committeeTable = politicsView.locator(COMMITTEE_TABLE);
  const memberRows = committeeTable.locator(MEMBER_ROWS);

  await expect(politicsView).toBeVisible();
  await expect(committeeTable).toBeVisible();
  await expect(memberRows).toHaveCount(38);
  await expect(committeeTable.locator("#politics-table-head > div")).toHaveCount(7);
  await expect(committeeTable.locator("[data-politics-sort]")).toHaveCount(5);
  await expect(committeeTable.locator("[data-politics-header-filter-button]")).toHaveCount(5);
  await expect(politicsView.locator("#politics-filter-button")).toHaveCount(1);
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
  await profile.locator("details.detail-more > summary").click();
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
  await expect(profile.locator(".politics-member-avatar img")).toHaveCSS(
    "object-fit",
    "contain"
  );
  await profile.locator("details.detail-more > summary").click();
  await expect(profile).toContainText("private und kommerzielle nicht-werbliche Zwecke");
  await expect(profile).toContainText("Werbe- und Wahlkampfnutzung");
  await expect(profile.locator(`a[href="${member.imageSourceUrl}"]`)).toBeVisible();
  await expect(profile.locator(`a[href="${member.imageUsageTermsUrl}"]`)).toBeVisible();
});

test("Politik synchronisiert Sammelfilter und zusätzliche Spaltenfilter", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Sortierung und kombinierte Filter werden im Desktop-Projekt geprüft.");
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const committeeTable = page.locator(COMMITTEE_TABLE);
  const rows = committeeTable.locator(MEMBER_ROWS);
  const memberSort = committeeTable.locator('[data-politics-sort="name"]');
  const memberHead = committeeTable.locator('[data-politics-column="name"]');
  await expect(memberHead).toHaveAttribute("aria-sort", "ascending");
  await expect(rows.first()).toContainText("Demo-Ausschussmitglied 01");

  await memberSort.click();
  await expect(memberHead).toHaveAttribute("aria-sort", "descending");
  await expect(rows.first()).toContainText("Demo-Ausschussmitglied 38");

  const filterButton = page.locator("#politics-table-toolbar #politics-filter-button");
  await expect(filterButton).toHaveCount(1);
  await expect(committeeTable.locator("[data-politics-header-filter-button]")).toHaveCount(5);
  await filterButton.click();
  const filterPanel = page.locator("#politics-filter-panel");
  await expect(filterPanel).toBeVisible();
  await expect(filterButton).toHaveAttribute("aria-expanded", "true");
  await filterPanel.locator('[data-directory-filter-key="faction"]').selectOption("SPD");
  await expect(rows).toHaveCount(7);
  await expect(rows).toContainText(["Demo-Ausschussmitglied 29", "Demo-Ausschussmitglied 28", "Demo-Ausschussmitglied 27", "Demo-Ausschussmitglied 26", "Demo-Ausschussmitglied 25", "Demo-Ausschussmitglied 24", "Demo-Ausschussmitglied 23"]);
  await expect(page.locator("#politics-filter-badge")).toHaveText("1");
  await expect(committeeTable.locator('[data-politics-column="faction"] [data-politics-header-filter-button]')).toHaveClass(/is-active/);

  await filterPanel.locator('[data-directory-filter-reset="politics"]').click();
  await expect(rows).toHaveCount(38);
  await expect(committeeTable.locator('[data-politics-column="faction"] [data-politics-header-filter-button]')).not.toHaveClass(/is-active/);
  await filterPanel.locator('[data-directory-filter-close="politics"]').click();
  await expect(filterPanel).toBeHidden();

  const postalHeaderFilter = committeeTable.locator('[data-politics-column="postalCodes"] [data-politics-header-filter-button]');
  await postalHeaderFilter.click();
  const postalHeaderMenu = page.locator("#politics-header-filter-postalCodes");
  await expect(postalHeaderMenu).toBeVisible();
  await postalHeaderMenu.locator('[data-politics-filter-value="10100"]').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Demo-Ausschussmitglied 01");
  const postalFilter = filterPanel.locator('[data-directory-filter-key="postalCodes"]');
  await expect(postalFilter).toHaveValue("10100");
  await expect(page.locator("#politics-filter-badge")).toHaveText("1");
  await expect(postalFilter.locator('option[value="10101"]')).toHaveCount(0);
});

test("Politik-Mitglieder öffnen im VK-paritätischen rechten Drawer mit Tabs, Wahlkreis und Minikarte", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const firstRow = page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first();
  await expect(firstRow.locator("[data-open-politics-profile]")).not.toHaveAttribute(
    "aria-haspopup",
    "dialog"
  );
  await firstRow.locator("[data-open-politics-profile]").click();

  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}$`));
  await expect(page.locator(POLITICS_VIEW)).toBeVisible();
  await expect(page.locator("#person-profile-page")).toBeHidden();
  const drawer = page.locator(POLITICS_DRAWER);
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  const profile = page.locator(POLITICS_PROFILE);
  await expect(profile).toBeVisible();
  await expect(profile.locator("#detail-close")).toBeFocused();
  await expect(profile).toHaveAttribute("aria-live", "polite");
  await expect(profile).not.toHaveAttribute("role", "dialog");
  await expect(profile).not.toHaveAttribute("aria-modal", "true");
  const tablist = profile.getByRole("tablist", { name: "Profilbereiche" });
  const overviewTab = profile.getByRole("tab", { name: "Überblick" });
  const themesTab = profile.getByRole("tab", { name: /^Themen/ });
  const notesTab = profile.getByRole("tab", { name: /^Notizen/ });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole("tab")).toHaveCount(3);
  await expect(overviewTab).toHaveAttribute("id", "detail-tab-overview");
  await expect(overviewTab).toHaveAttribute("aria-controls", "detail-overview");
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(overviewTab).toHaveAttribute("tabindex", "0");
  await expect(themesTab).toHaveAttribute("aria-selected", "false");
  await expect(themesTab).toHaveAttribute("tabindex", "-1");
  await expect(notesTab).toHaveAttribute("aria-selected", "false");
  await expect(profile.locator("#detail-overview")).toBeVisible();
  await expect(profile.locator("#detail-overview")).toHaveAttribute("role", "tabpanel");
  await expect(profile.locator("#detail-overview")).toHaveAttribute("aria-labelledby", "detail-tab-overview");
  await expect(profile.locator("#detail-themes")).toBeHidden();
  await expect(profile.locator("#detail-notes")).toBeHidden();
  await expect(profile).toContainText("Demo-Ausschussmitglied 01");
  await expect(profile).toContainText("Wahlkreis 091: Demo-Wahlkreis 01");
  await expect(profile).toContainText("PLZ (Auswahl)");
  await expect(profile.locator(".politics-postal-code")).toHaveText("10100");
  await expect(profile).not.toContainText("10101");
  await expect(profile.locator(".politics-member-avatar img")).toBeVisible();
  await expect(profile.locator(".avatar-fallback")).toHaveCount(0);
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

  await overviewTab.focus();
  await overviewTab.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}\\?tab=themes$`));
  await expect(profile.getByRole("tab", { name: /^Themen/ })).toHaveAttribute("aria-selected", "true");
  await expect(profile.getByRole("tab", { name: /^Themen/ })).toBeFocused();
  await expect(profile.locator("#detail-themes")).toBeVisible();
  await expect(profile.locator("#detail-overview")).toBeHidden();

  await profile.getByRole("tab", { name: /^Themen/ }).press("End");
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}\\?tab=notes$`));
  await expect(profile.getByRole("tab", { name: /^Notizen/ })).toBeFocused();
  await expect(profile.locator("#detail-notes")).toBeVisible();

  await profile.getByRole("tab", { name: /^Notizen/ }).press("Home");
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}$`));
  await expect(profile.getByRole("tab", { name: "Überblick" })).toBeFocused();
  await expect(profile.locator("#detail-overview")).toBeVisible();

  await profile.getByRole("tab", { name: /^Themen/ }).click();
  await profile.getByRole("tab", { name: /^Notizen/ }).click();
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}\\?tab=notes$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}\\?tab=themes$`));
  await expect(profile.getByRole("tab", { name: /^Themen/ })).toHaveAttribute("aria-selected", "true");
  await expect(profile.locator("#detail-themes")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}$`));
  await expect(profile.getByRole("tab", { name: "Überblick" })).toHaveAttribute("aria-selected", "true");
  await expect(profile.locator("#detail-overview")).toBeVisible();

  const sourceDetails = profile.locator("details.detail-more");
  await expect(sourceDetails).not.toHaveAttribute("open", "");
  await sourceDetails.locator("summary").click();
  await expect(sourceDetails).toHaveAttribute("open", "");
  await expect(sourceDetails).toContainText("Deutscher Bundestag / Demo-Fotografie 01");
  await expect(sourceDetails).toContainText("Dieses Portrait ist frei lizenziert");
  await expect(sourceDetails.locator('a[href="https://www.bundestag.de/services/impressum"]')).toBeVisible();

  const overflow = await page.locator("html").evaluate((node) =>
    Math.max(0, node.scrollWidth - node.clientWidth)
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await profile.locator("#detail-close").click();
  await expect(page).toHaveURL(/#politics$/);
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(drawer).not.toHaveClass(/is-open/);
  await expect(page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS)).toHaveCount(
    testInfo.project.name.includes("mobile") ? 6 : 38
  );
});

test("Listenmandate ohne Wahlkreis-PLZ erhalten einen eindeutigen Kartenhinweis", async ({ page }) => {
  await gotoAuthenticated(page, `${APP_PATH}#politics`);
  await page.locator("#search").fill("Landesliste Hessen");
  const listMandateRow = page.locator(COMMITTEE_TABLE).locator(`${MEMBER_ROWS}:visible`);
  await expect(listMandateRow).toHaveCount(1);
  await listMandateRow.locator("[data-open-politics-profile]").click();

  const profile = page.locator(POLITICS_PROFILE);
  await expect(profile.locator(".politics-profile-data-note")).toContainText(
    "keine repräsentative Wahlkreis-PLZ hinterlegt"
  );
  await expect(profile.locator(".politics-profile-data-note")).toContainText(
    "bundeslandweite regionale Zuordnung"
  );
  await expect(profile.locator(".politics-profile-data-note")).not.toContainText(
    "offiziellen Wahlkreisfläche"
  );
  await expect(profile.locator(".politics-constituency-preview")).toContainText("Landesliste");
  await expect(profile.locator(".politics-constituency-preview")).not.toContainText("PLZ-Auswahl");
});

test("Offline-Politik hält den Tastaturfokus im rechten Kontakt-Drawer", async ({ page }) => {
  await page.goto(PAGES_OFFLINE_POLITICS_PATH);
  await page.waitForFunction(() => window.__POLITIK_OFFLINE_READY__ === true);
  const opener = page.locator("button[data-open-member]").first();
  await opener.click();

  const drawer = page.locator("#detail-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("role", "dialog");
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  const closeButton = drawer.getByRole("button", { name: "Kontaktprofil schließen" });
  await expect(closeButton).toBeFocused();
  await closeButton.press("Shift+Tab");
  await expect.poll(() => page.evaluate(() =>
    document.querySelector("#detail-drawer")?.contains(document.activeElement)
  )).toBe(true);
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();

  await closeButton.click();
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Persönliche Politik-Themen und -Notizen werden über die VK-Reiter gespeichert", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Persistenz und Bearbeitungsablauf werden im Desktop-Projekt geprüft.");
  const fixture = createProtectedBackendFixture({ role: "admin" });
  await gotoAuthenticated(page, `${APP_PATH}#politics`, { backendFixture: fixture });

  await page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first().locator("[data-open-politics-profile]").click();
  const profile = page.locator(POLITICS_PROFILE);
  const theme = "Versorgungsforschung Politiktest";
  const note = "Persönliche Politiknotiz bleibt nach einem Neuladen erhalten.";
  const editedNote = "Bearbeitete persönliche Politiknotiz bleibt nach einem Neuladen erhalten.";

  await profile.getByRole("tab", { name: /^Themen/ }).click();
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}\\?tab=themes$`));
  await expect(profile).toContainText("Persönliche Ergänzungen werden in deinem geschützten Nutzerprofil gespeichert.");
  await profile.locator("#detail-theme-input").fill(theme);
  await profile.locator("#detail-theme-input").press("Enter");
  await expect(profile.locator("[data-detail-theme-remove]").filter({ hasText: theme })).toBeVisible();
  await expect(profile.getByRole("tab", { name: /^Themen, 1 Eintrag$/ })).toHaveAttribute("aria-selected", "true");

  await profile.getByRole("tab", { name: /^Notizen/ }).click();
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}\\?tab=notes$`));
  await profile.locator("#contact-notes-message").fill(note);
  await profile.locator("#contact-notes-composer").getByRole("button", { name: "Notiz senden" }).click();
  const savedNote = profile.locator("[data-contact-note]").filter({ hasText: note });
  await expect(savedNote).toBeVisible();
  await expect(profile.getByRole("tab", { name: /^Notizen, 1 Eintrag$/ })).toHaveAttribute("aria-selected", "true");

  await savedNote.getByRole("button", { name: "Bearbeiten" }).click();
  const editForm = profile.locator("[data-contact-note-edit-form]");
  await expect(editForm).toBeVisible();
  await editForm.getByRole("textbox", { name: "Kontaktnotiz bearbeiten" }).fill(editedNote);
  await editForm.getByRole("button", { name: "Speichern" }).click();
  await expect(profile.locator("[data-contact-note-edit-form]")).toHaveCount(0);
  await expect(profile.locator("[data-contact-note]").filter({ hasText: editedNote })).toBeVisible();

  await expect.poll(() =>
    fixture.userSettings.preferences?.politicsProfiles?.[FIRST_MEMBER_ID]
  ).toMatchObject({
    themes: [theme],
    notes: [expect.objectContaining({ text: editedNote })]
  });

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}\\?tab=notes$`));
  await expect(profile).toBeVisible();
  await expect(profile.locator("#detail-notes")).toBeVisible();
  await expect(profile.locator("[data-contact-note]").filter({ hasText: editedNote })).toBeVisible();

  await profile.getByRole("tab", { name: /^Themen/ }).click();
  await expect(profile.locator("[data-detail-theme-remove]").filter({ hasText: theme })).toBeVisible();
  await profile.getByRole("tab", { name: /^Notizen/ }).click();
  const persistedNote = profile.locator("[data-contact-note]").filter({ hasText: editedNote });
  page.once("dialog", (dialog) => dialog.accept());
  await persistedNote.getByRole("button", { name: "Löschen" }).click();
  await expect(profile.locator("[data-contact-note]")).toHaveCount(0);
  await expect(profile.getByRole("tab", { name: "Notizen" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() =>
    fixture.userSettings.preferences?.politicsProfiles?.[FIRST_MEMBER_ID]?.notes
  ).toEqual([]);
});

test("Politik-Profile lassen sich per Tastatur aus der Tabelle öffnen", async ({ page }) => {
  await gotoAuthenticated(page, `${APP_PATH}#politics`);

  const firstMemberButton = page.locator(COMMITTEE_TABLE).locator(MEMBER_ROWS).first().locator("[data-open-politics-profile]");
  await firstMemberButton.focus();
  await firstMemberButton.press("Enter");
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}$`));
  await expect(page.locator(POLITICS_PROFILE)).toBeVisible();
  await expect(page.locator(POLITICS_PROFILE).locator("#detail-close")).toBeFocused();

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
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}$`));
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
  const mobileRows = politicsView.locator(MEMBER_ROWS);
  await expect(mobileRows).toHaveCount(6);
  await expect(mobileRows).toHaveClass(Array.from({ length: 6 }, () => /mobile-collection-card/));
  await expect(mobileRows.locator("[data-contextual-row-select]")).toHaveCount(0);
  await expect(politicsView.locator("#contextual-bulk-toolbar")).toBeHidden();
  const politicsTableHead = politicsView.locator("#politics-table-head");
  await expect(politicsTableHead).toBeHidden();
  await expect(politicsTableHead.locator("[data-politics-header-filter-button]")).toHaveCount(5);
  await expect(politicsTableHead.locator("[data-politics-header-filter-button]").first()).toBeHidden();
  const filterButton = politicsView.locator("#politics-filter-button");
  const mapButton = politicsView.locator("#politics-map-open");
  await expect(filterButton).toBeVisible();
  await expect(mapButton).toBeVisible();
  await filterButton.click();
  await expect(politicsView.locator("#politics-filter-panel")).toBeVisible();
  await politicsView.locator('[data-directory-filter-close="politics"]').click();
  await expect(politicsView.locator(".politics-member-avatar img")).toHaveCount(6);
  await expect(mobileRows.first().locator("[data-politics-field]")).toHaveCount(0);
  await expect(mobileRows.first().locator(".mobile-contact-copy")).toContainText("Demo-Ausschussmitglied 01");
  await expect(politicsView.locator("#politics-pagination [data-politics-page]")).toHaveCount(7);
  await expect(politicsView.locator(COMMITTEE_TABLE)).toHaveAttribute("role", "region");
  await expect(mobileRows.first()).toHaveAttribute("role", "listitem");
  await expect(mobileRows.first().locator(":scope > *[role=cell]")).toHaveCount(0);

  for (const width of [520, 320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.locator("html").evaluate((node) =>
      Math.max(0, node.scrollWidth - node.clientWidth)
    );
    expect(overflow, `kein horizontaler Overflow bei ${width}px`).toBeLessThanOrEqual(1);
    await expect(mobileRows.first().locator(".mobile-contact-top")).toBeVisible();
    await expect(politicsTableHead).toBeHidden();

    const actionLayout = await politicsView.locator(".politics-context__actions").evaluate((container) => {
      const filter = container.querySelector("#politics-filter-button").getBoundingClientRect();
      const map = container.querySelector("#politics-map-open").getBoundingClientRect();
      return {
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth,
        filter: { left: filter.left, right: filter.right, top: filter.top },
        map: { left: map.left, right: map.right, top: map.top }
      };
    });
    expect(actionLayout.scrollWidth, `Aktionszeile passt bei ${width}px`).toBeLessThanOrEqual(actionLayout.clientWidth + 1);
    expect(Math.abs(actionLayout.filter.top - actionLayout.map.top), `Buttons stehen bei ${width}px in einer Zeile`).toBeLessThanOrEqual(1);
    expect(actionLayout.filter.right, `Filter steht bei ${width}px links von Karte`).toBeLessThanOrEqual(actionLayout.map.left);
  }

  await mobileRows.first().focus();
  await mobileRows.first().press("Enter");
  const drawer = page.locator(POLITICS_DRAWER);
  await expect(drawer).toHaveClass(/is-open/);
  await expect(page.locator("#person-profile-page")).toBeHidden();
  const profile = page.locator(POLITICS_PROFILE);
  await expect(profile.getByRole("tablist", { name: "Profilbereiche" }).getByRole("tab")).toHaveCount(3);
  await expect(profile.locator("#detail-overview")).toBeVisible();
  await expect(drawer.locator(".politics-constituency-preview")).toBeVisible();
  await expect(drawer.locator(".politics-postal-code")).toHaveText("10100");

  const drawerBounds = await drawer.boundingBox();
  const viewport = page.viewportSize();
  expect(drawerBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(drawerBounds.width).toBeLessThan(viewport.width);
  expect(Math.abs((drawerBounds.x + drawerBounds.width) - viewport.width)).toBeLessThanOrEqual(1);

  await profile.getByRole("tab", { name: /^Themen/ }).click();
  await expect(profile.locator("#detail-themes")).toBeVisible();
  await expect(profile.locator("#detail-overview")).toBeHidden();
  await profile.getByRole("tab", { name: /^Notizen/ }).click();
  await expect(profile.locator("#detail-notes")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#person/politics/${FIRST_MEMBER_ID}\\?tab=notes$`));

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

test("Die öffentliche Demo zeigt das minimierte öffentliche 38er-Politikverzeichnis", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Der vollständige öffentliche Tabellenbestand wird im Desktop-Projekt geprüft.");
  await page.goto("/dist/pages/versorgungs-kompass.html#politics");

  const politicsView = page.locator(POLITICS_VIEW);
  await expect(politicsView).toBeVisible();
  await expect(politicsView.locator("#politics-member-count")).toHaveText("38 ordentliche Mitglieder");
  await expect(politicsView.locator(MEMBER_ROWS)).toHaveCount(38);
  const postalCodeCells = politicsView.locator(`${MEMBER_ROWS} [data-politics-field="postalCodes"]`);
  await expect(postalCodeCells).toHaveCount(38);
  const postalCodeValues = (await postalCodeCells.allTextContents()).map((value) => value.trim());
  expect(postalCodeValues.every((value) => /^\d{5}$/.test(value) || ["Nicht zutreffend", "Nicht ausgewiesen"].includes(value))).toBe(true);
  await expect(politicsView.locator("#politics-source-meta")).toContainText("Offizielle Quelle");
  await expect(politicsView.locator("#politics-table-toolbar #politics-committee-source")).toHaveCount(0);
  await expect(politicsView.locator("#politics-table-footer #politics-committee-source")).toBeVisible();
  await expect(politicsView.locator("#politics-table-footer #politics-committee-source")).toHaveAttribute("target", "_blank");
  await expect(politicsView.locator("#politics-map-open")).toBeVisible();

  await politicsView.locator(MEMBER_ROWS).first().locator("[data-open-politics-profile]").click();
  const profile = page.locator(POLITICS_PROFILE);
  await expect(profile).toBeVisible();
  await expect(profile.getByRole("tablist", { name: "Profilbereiche" }).getByRole("tab")).toHaveCount(3);
  await expect(profile).toContainText("Persönliche Ergänzungen bleiben in der öffentlichen Demo nur für diese Browsersitzung erhalten.");
});
