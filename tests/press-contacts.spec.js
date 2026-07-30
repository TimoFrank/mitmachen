import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const APP_PATH = "/frontend/app/versorgungs-kompass.html";
const PRESS_VIEW = '[data-view-panel="press"]';
const PRESS_TAB = '[data-view-tab="press"]';
const PRESS_TABLE = '[role="table"][aria-label="Pressekontakte im Gesundheitswesen"]';
const PRESS_ROWS = "#press-contact-list [data-press-contact-id]";
const PRESS_COLUMN_KEYS = [
  "name",
  "organization",
  "role",
  "contactType",
  "themes",
  "email",
  "phone",
  "source"
];

function protectedPressFixture(role = "admin") {
  const fixture = createProtectedBackendFixture({ role });
  const people = fixture.stakeholderPeople
    .filter((person) => person.stakeholderTypeId === "press" && person.status !== "archived")
    .sort((left, right) => left.name.localeCompare(right.name, "de", {
      sensitivity: "base",
      numeric: true
    }));
  const organizations = fixture.stakeholderOrganizations
    .filter((organization) => organization.stakeholderTypeId === "press" && organization.status !== "archived");
  return { fixture, organizations, people };
}

function isMobileProject(testInfo) {
  return testInfo.project.name.includes("mobile");
}

async function expectNoHorizontalPageOverflow(page) {
  const overflow = await page.locator("html").evaluate((node) =>
    Math.max(0, node.scrollWidth - node.clientWidth)
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Presse ist über den Stakeholder-Kompass erreichbar und lädt den geschützten Pressebestand", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Navigation und vollständige Tabellenstruktur werden im Desktop-Projekt geprüft.");
  const { fixture, organizations, people } = protectedPressFixture();
  const requestedPressCollections = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["/api/stakeholder-organizations", "/api/stakeholder-people"].includes(url.pathname)
      && url.searchParams.get("stakeholderTypeId") === "press"
    ) {
      requestedPressCollections.add(url.pathname);
    }
  });

  await gotoAuthenticated(page, `${APP_PATH}#stakeholders/kv`, { backendFixture: fixture });

  const pressTab = page.locator(PRESS_TAB);
  await expect(pressTab).toBeVisible();
  await pressTab.click();

  await expect(page).toHaveURL(/#press$/);
  await expect(pressTab).toHaveAttribute("aria-current", "page");
  await expect(page.locator(PRESS_VIEW)).toBeVisible();
  await expect(page.locator("#workspace-view-title")).not.toBeVisible();
  await expect(page.locator("#press-page-header")).toBeVisible();
  await expect(page.locator("#press-page-title")).toHaveText("Pressekontakte");
  await expect(page.locator(".press-page-header__brand")).toBeVisible();
  await expect(page.locator(".press-page-header__brand")).toHaveAttribute(
    "src",
    "../../public/brand/modules/stakeholder/lockup-horizontal.svg"
  );
  await expect(page.locator(".press-page-header__brand")).toHaveAttribute("alt", "Stakeholder-Kompass");
  await expect(page.locator("#press-contact-count")).toHaveText(`${people.length} Pressekontakte`);
  await expect(page.locator(PRESS_TABLE)).toBeVisible();
  await expect(page.locator("#press-table-head > [data-press-column]")).toHaveCount(PRESS_COLUMN_KEYS.length);
  for (const columnKey of PRESS_COLUMN_KEYS) {
    await expect(page.locator(`#press-table-head > [data-press-column="${columnKey}"]`)).toBeVisible();
  }
  await expect(page.locator("#press-table-head [data-press-sort]")).toHaveCount(PRESS_COLUMN_KEYS.length);
  await expect(page.locator("#press-table-head [data-press-header-filter-button]")).toHaveCount(PRESS_COLUMN_KEYS.length);
  await expect(page.locator(PRESS_ROWS)).toHaveCount(20);
  await expect(page.locator(PRESS_ROWS).first()).toContainText(people[0].name);
  await expect(page.locator(`${PRESS_ROWS} small`)).toHaveCount(0);
  const renderedTableText = await page.locator("#press-contact-list").innerText();
  const locationValues = new Set(
    organizations.flatMap((organization) => [organization.city, organization.state]).filter(Boolean)
  );
  for (const locationValue of locationValues) {
    expect(renderedTableText).not.toContain(locationValue);
  }
  await expect(page.locator("#press-results-meta")).toHaveText(`1–20 von ${people.length} Pressekontakten`);
  expect(organizations).toHaveLength(12);
  expect(requestedPressCollections).toEqual(new Set([
    "/api/stakeholder-organizations",
    "/api/stakeholder-people"
  ]));
});

test("Presse durchsucht Name, Thema und beruflichen Kontaktweg", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Die vollständige Suchmatrix wird im Desktop-Projekt geprüft.");
  const { fixture } = protectedPressFixture();
  await gotoAuthenticated(page, `${APP_PATH}#press`, { backendFixture: fixture });

  const search = page.locator("#search");
  await expect(search).toBeVisible();
  await expect(search).toHaveAttribute("placeholder", /Pressekontakte nach Name, Medium, Funktion, Thema/);
  await expect(page.locator(PRESS_ROWS)).toHaveCount(20);

  await search.fill("Demo-Pressekontakt 01");
  await expect(page.locator(PRESS_ROWS)).toHaveCount(1);
  await expect(page.locator(PRESS_ROWS).first()).toContainText("Demo-Pressekontakt 01");

  await search.fill("FHIR");
  await expect(page.locator(PRESS_ROWS)).toHaveCount(2);
  await expect(page.locator(PRESS_ROWS).first()).toContainText("FHIR");

  await search.fill("pressekontakt-26@presse.example.invalid");
  await expect(page.locator(PRESS_ROWS)).toHaveCount(1);
  await expect(page.locator(PRESS_ROWS).first()).toContainText("Demo-Pressekontakt 26");
});

test("Presse lässt sich über Tabellenköpfe sortieren und nach Kontaktart filtern", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Sortierung und Spaltenfilter werden im Desktop-Projekt geprüft.");
  const { fixture, people } = protectedPressFixture();
  await gotoAuthenticated(page, `${APP_PATH}#press`, { backendFixture: fixture });

  const rows = page.locator(PRESS_ROWS);
  const nameSort = page.locator('#press-table-head [data-press-sort="name"]');
  await expect(rows).toHaveCount(20);
  await expect(nameSort).toHaveAttribute("aria-sort", "ascending");
  await expect(rows.first()).toContainText(people[0].name);

  await nameSort.click();
  await expect(nameSort).toHaveAttribute("aria-sort", "descending");
  await expect(rows.first()).toContainText(people.at(-1).name);

  const contactTypeFilter = page.locator(
    '#press-table-head [data-press-column="contactType"] [data-press-header-filter-button]'
  );
  await contactTypeFilter.click();
  const contactTypeMenu = page.locator("#press-header-filter-contactType");
  await expect(contactTypeMenu).toBeVisible();
  await contactTypeMenu.locator('[data-press-filter-value="Pressestelle"]').click();

  await expect(rows).toHaveCount(4);
  await expect(rows.locator('[data-press-field="contactType"]')).toHaveText([
    "Pressestelle",
    "Pressestelle",
    "Pressestelle",
    "Pressestelle"
  ]);
  await expect(page.locator("#press-results-meta")).toHaveText(`1–4 von 4 Pressekontakten · ${people.length} gesamt`);

  await contactTypeFilter.click();
  await page.locator("#press-header-filter-contactType").locator('[data-press-filter-value=""]').click();
  await expect(rows).toHaveCount(20);
});

test("Presse unterstützt Seitengröße und Pagination wie die Kontaktlisten", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Pagination und Seitengröße werden im Desktop-Projekt geprüft.");
  const { fixture, people } = protectedPressFixture();
  await gotoAuthenticated(page, `${APP_PATH}#press`, { backendFixture: fixture });

  const rows = page.locator(PRESS_ROWS);
  const pageSize = page.locator("#press-page-size-select");
  await expect(rows).toHaveCount(20);
  await expect(page.locator("#press-pagination [data-press-page]")).toHaveCount(2);

  await pageSize.selectOption("10");
  await expect(rows).toHaveCount(10);
  await expect(page.locator("#press-results-meta")).toHaveText(`1–10 von ${people.length} Pressekontakten`);
  await expect(page.locator("#press-pagination [data-press-page]")).toHaveCount(3);

  await page.locator('#press-pagination [data-press-page-nav="next"]').click();
  await expect(page.locator("#press-results-meta")).toHaveText(`11–20 von ${people.length} Pressekontakten`);
  await expect(rows.first()).toContainText(people[10].name);
  await expect(page.locator('#press-pagination [data-press-page="2"]')).toHaveClass(/is-active/);

  await pageSize.selectOption("50");
  await expect(rows).toHaveCount(people.length);
  await expect(page.locator("#press-results-meta")).toHaveText(`1–${people.length} von ${people.length} Pressekontakten`);
  await expect(page.locator("#press-pagination [data-press-page]")).toHaveCount(1);
});

test("Stakeholder-CSV sendet nur importierte Presse-Datensätze an die geschützte API", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Der Dateiimport wird einmal im Desktop-Projekt geprüft.");
  const fixture = createProtectedBackendFixture({ role: "admin" });
  const unrelatedOrganization = fixture.stakeholderOrganizations.find(
    (organization) => organization.stakeholderTypeId === "kv"
  );
  unrelatedOrganization.logoUrl = "https://legacy-logo.example.invalid/kv.svg";
  let importPayload = null;
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/stakeholder-import")) return;
    importPayload = request.postDataJSON();
  });

  await gotoAuthenticated(page, `${APP_PATH}#profile-imports:imports`, {
    role: "admin",
    backendFixture: fixture
  });
  await page.locator("#stakeholder-file-input").setInputFiles({
    name: "presse-delta-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "Stakeholder-Typ,Organisation,Person,Funktion,Themen,E-Mail,Telefon,Quelle",
      "press,Demo-Pressemedium Delta,Demo-Pressekontakt Delta,Redakteur Digital Health,Digital Health,delta@presse.example.invalid,+49 30 123456,Delta-Import-Test"
    ].join("\n"))
  });

  await expect.poll(() => importPayload).not.toBeNull();
  expect(importPayload.types).toHaveLength(1);
  expect(importPayload.types[0].id).toBe("press");
  expect(importPayload.organizations).toHaveLength(1);
  expect(importPayload.organizations[0]).toMatchObject({
    stakeholderTypeId: "press",
    name: "Demo-Pressemedium Delta",
    preserveExistingLogo: true
  });
  expect(importPayload.people).toHaveLength(1);
  expect(importPayload.people[0]).toMatchObject({
    stakeholderTypeId: "press",
    name: "Demo-Pressekontakt Delta",
    organization: "Demo-Pressemedium Delta"
  });
  expect(importPayload.organizations.some((organization) => organization.id === unrelatedOrganization.id)).toBe(false);
  await expect(page.locator("#global-status-message")).toContainText(
    "1 Stakeholder-Organisationen und 1 Stakeholder-Kontakte importiert"
  );
});

test("Pressezeilen öffnen Vorschau und Profil mit stabiler Zurückroute", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Der Desktop-Drawer wird getrennt vom mobilen Vollprofil geprüft.");
  const { fixture, people } = protectedPressFixture();
  const expectedPerson = people[0];
  await gotoAuthenticated(page, `${APP_PATH}#press`, { backendFixture: fixture });

  const firstRow = page.locator(PRESS_ROWS).first();
  await expect(firstRow).toContainText(expectedPerson.name);
  await firstRow.locator('[data-press-field="role"]').click();

  const drawer = page.locator("#detail-drawer");
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(drawer).toContainText(expectedPerson.name);
  await expect(page).toHaveURL(/#press$/);

  await drawer.locator("#stakeholder-person-open-profile").click();
  await expect(page).toHaveURL(new RegExp(`#person/press/${expectedPerson.id}$`));
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page.locator("#person-profile-body #stakeholder-person-overview")).toContainText(expectedPerson.organization);

  await page.locator('#person-profile-body [data-detail-tab="contact"]').click();
  await expect(page.locator("#person-profile-body #stakeholder-person-contact")).toContainText(expectedPerson.email);
  await page.locator("#person-profile-body [data-person-profile-back]").click();

  await expect(page).toHaveURL(/#press$/);
  await expect(page.locator(PRESS_VIEW)).toBeVisible();
  await expect(page.locator(PRESS_ROWS)).toHaveCount(20);
});

test("Presse bleibt mobil ohne horizontalen Seitenoverflow und öffnet das Vollprofil", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "Der responsive Zustand wird im Mobile-Projekt geprüft.");
  const { fixture, people } = protectedPressFixture();
  const expectedPerson = people[0];
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAuthenticated(page, `${APP_PATH}#press`, { backendFixture: fixture });

  await expect(page.locator(PRESS_VIEW)).toBeVisible();
  await expect(page.locator(PRESS_ROWS)).toHaveCount(20);
  await expect(page.locator("#workspace-view-title")).not.toBeVisible();
  await expect(page.locator("#press-page-header")).toBeVisible();
  await expect(page.locator(".press-page-header__brand")).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  const firstRow = page.locator(PRESS_ROWS).first();
  await expect(firstRow.locator("[data-press-field]")).toHaveCount(PRESS_COLUMN_KEYS.length);
  const mobileGeometry = await firstRow.evaluate((row) => ({
    clientWidth: row.clientWidth,
    scrollWidth: row.scrollWidth,
    gridColumns: getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
  }));
  expect(mobileGeometry.scrollWidth).toBeLessThanOrEqual(mobileGeometry.clientWidth + 1);
  expect(mobileGeometry.gridColumns).toBe(1);

  const headerBox = await page.locator("#press-page-header").boundingBox();
  const searchBox = await page.locator("#search").boundingBox();
  const tableBox = await page.locator(PRESS_TABLE).boundingBox();
  expect(headerBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(searchBox.y + 1);
  expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(tableBox.y + 1);

  await page.setViewportSize({ width: 520, height: 844 });
  await expectNoHorizontalPageOverflow(page);
  await expect.poll(() => firstRow.evaluate((row) =>
    getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
  )).toBe(2);

  await page.setViewportSize({ width: 320, height: 844 });
  await expectNoHorizontalPageOverflow(page);
  const compactMobileGeometry = await page.locator("#press-page-header").evaluate((header) => ({
    clientWidth: header.clientWidth,
    scrollWidth: header.scrollWidth
  }));
  expect(compactMobileGeometry.scrollWidth).toBeLessThanOrEqual(compactMobileGeometry.clientWidth + 1);
  expect(await page.locator(
    '#press-table-head [data-press-column="contactType"] .column-head__label'
  ).evaluate((label) => getComputedStyle(label, "::after").content)).toBe('"Typ"');

  await page.setViewportSize({ width: 390, height: 844 });
  await firstRow.locator('[data-press-field="role"]').click();
  await expect(page).toHaveURL(new RegExp(`#person/press/${expectedPerson.id}$`));
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page.locator("#person-profile-body")).toContainText(expectedPerson.name);
  await expectNoHorizontalPageOverflow(page);

  await page.locator("#person-profile-body [data-person-profile-back]").click();
  await expect(page).toHaveURL(/#press$/);
  await expect(page.locator(PRESS_VIEW)).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
});

test("Die öffentliche Presse-Demo zeigt ausschließlich synthetische Kontakte und reservierte Domains", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Der vollständige öffentliche Demobestand wird im Desktop-Projekt geprüft.");
  await page.goto("/dist/pages/versorgungs-kompass.html#press");

  await expect(page.locator(PRESS_VIEW)).toBeVisible();
  await expect(page.locator("#press-data-notice")).toContainText(
    "ausschließlich frei erfundene Presseorganisationen und Kontakte"
  );
  await expect(page.locator(".press-page-header__brand")).toBeVisible();
  expect(await page.locator(".press-page-header__brand").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator("#press-contact-count")).toHaveText("26 Pressekontakte");

  await page.locator("#press-page-size-select").selectOption("100");
  const rows = page.locator(PRESS_ROWS);
  await expect(rows).toHaveCount(26);
  await expect(page.locator("#press-contact-list")).toContainText("Redaktion Gesundheitsfenster");

  const emailLinks = await rows.locator('a[href^="mailto:"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") || "")
  );
  expect(emailLinks).toHaveLength(26);
  expect(emailLinks.every((href) => /^mailto:pressekontakt-\d+@presse\.example\.invalid$/.test(href))).toBe(true);

  const sourceLinks = await rows.locator("a.press-source-link").evaluateAll((links) =>
    links.map((link) => link.href)
  );
  expect(sourceLinks).toHaveLength(26);
  expect(sourceLinks.every((href) => new URL(href).hostname.endsWith(".example.invalid"))).toBe(true);
});
