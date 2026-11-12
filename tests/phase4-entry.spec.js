import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

function teamDirectoryBackendFixtureScript() {
  return `
    (() => {
      const now = "2026-07-16T12:00:00.000Z";
      const teams = ["Stabsstelle Versorgung", "Kommunikation", "Produktentwicklung", ""];
      const roles = ["admin", "editor", "viewer"];
      const profiles = Array.from({ length: 36 }, (_, index) => {
        const number = String(index + 1).padStart(2, "0");
        return {
          id: "phase4-profile-" + number,
          email: "phase4-" + number + "@example.test",
          display_name: "Nutzer " + number,
          initials: "N" + number,
          role: roles[index % roles.length],
          active: true,
          avatar_url: "",
          team: teams[index % teams.length],
          created_at: now,
          updated_at: now
        };
      });
      const contacts = Array.from({ length: 18 }, (_, index) => {
        const number = String(index + 1).padStart(2, "0");
        const owner = profiles[index];
        return {
          id: "phase4-contact-" + number,
          name: "Zuständigkeitskontakt " + number,
          displayName: "Zuständigkeitskontakt " + number,
          organization: "Versorgungszentrum " + number,
          category: "Praxis",
          sector: "Praxis",
          specialty: "Allgemeinmedizin",
          priority: "Mittel",
          ownerId: owner.id,
          ownerIds: [owner.id],
          owner: owner.display_name,
          city: "Berlin",
          state: "Berlin",
          postalCode: "10115",
          status: "active",
          createdAt: now,
          updatedAt: now
        };
      });
      window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA = {
        profiles,
        contacts,
        organizations: [],
        changes: [],
        savedViews: [],
        userSettings: {
          userId: profiles[0].id,
          defaultViewType: "contacts",
          tableDensity: "comfortable",
          theme: "system",
          fontScale: 1,
          pageSize: 20,
          preferences: {
            onboarding: {
              version: 1,
              profileCompletedAt: now,
              tourSkippedAt: now
            }
          }
        },
        formats: [],
        hospitations: []
      };
    })();
  `;
}

async function expectNoHorizontalOverflow(page, selector = "html") {
  const overflow = await page.locator(selector).evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Phase 4: #Mitmachen führt in vier Module und Pages über die gemeinsame Startseite in die öffentliche Demo", async ({ page, request }) => {
  await page.goto("/frontend/pages/mitmachen/index.html");

  await expect(page).toHaveTitle(/#Mitmachen/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Willkommen.");
  await expect(page.locator("[data-home-compass-name]")).toHaveText([
    "Versorgungs-Kompass",
    "Stakeholder-Kompass",
    "Hospitations-Kompass",
    "Format-Kompass"
  ]);
  await expect(page.locator(".concept-notice")).toHaveCount(0);
  await expect(page.locator(".destinations > li")).toHaveCount(4);
  await expect(page.locator(".destinations strong")).toHaveText(["Versorgung", "Stakeholder", "Hospitation", "Formate"]);
  await expect(page.locator(".module-sidebar")).toBeVisible();
  await expect(page.locator(".module-sidebar__nav > a")).toHaveCount(4);
  await expect(page.locator(".destinations").getByRole("link", { name: /Versorgung/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#care");
  await expect(page.locator(".destinations").getByRole("link", { name: /Stakeholder/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#stakeholders");
  await expect(page.locator(".destinations").getByRole("link", { name: /Hospitation/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#planning");
  await expect(page.locator(".destinations").getByRole("link", { name: /Formate/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#formats");
  await expect(page.locator("#registration-form")).toHaveCount(0);

  const localLinks = await page.locator('a[href]:not([href^="http"])').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).filter(Boolean)
  );
  for (const href of [...new Set(localLinks)]) {
    if (href.startsWith("#")) {
      await expect(page.locator(href)).toHaveCount(1);
      continue;
    }
    const target = new URL(href, page.url());
    target.hash = "";
    const response = await request.get(target.toString());
    expect(response.ok(), `Interner Link ${href} ist erreichbar`).toBe(true);
  }

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Zum Inhalt springen" })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 760 });
  await expectNoHorizontalOverflow(page);

  const publicDemoExternalRequests = [];
  page.on("request", (outgoingRequest) => {
    const hostname = new URL(outgoingRequest.url()).hostname;
    if (!new Set(["127.0.0.1", "localhost"]).has(hostname)) publicDemoExternalRequests.push(outgoingRequest.url());
  });
  await page.goto("/dist/pages/index.html");
  await expect(page).toHaveURL(/\/dist\/pages\/index\.html$/);
  await expect(page).toHaveTitle("Startseite · #Mitmachen");
  await expect(page.locator(".app-sidebar")).toBeVisible();
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await expect(page.locator(".home-destination-name")).toHaveText([
    "Versorgungs-Kompass",
    "Stakeholder-Kompass",
    "Hospitations-Kompass",
    "Format-Kompass"
  ]);
  await expect(page.locator(".home-destination-link__mark")).toHaveCount(4);
  await expect(page.locator('body[data-public-entry="home"], [data-public-entry-styles]')).toHaveCount(0);
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator('[data-view-tab="contacts"]')).toHaveCount(1);
  await expect(page.locator('[data-view-tab="stakeholders"][data-stakeholder-type-route]')).toHaveCount(4);
  await expect(page.locator('[data-view-tab="hospitations:synthesis"]')).toHaveCount(1);
  await expect(page.locator('[data-view-tab="formats"]')).toHaveCount(1);
  await expect(page.locator('script[src^="./data/demo-data.js?v="]')).toHaveCount(1);
  await expect(page.locator('script[src^="./data/demo-api.js?v="]')).toHaveCount(1);
  await expect(page.locator('script[src^="./data/data-service.js?v="]')).toHaveCount(1);
  await expect(page.locator('script[src*="auth-"]')).toHaveCount(0);
  const removedEntryResponse = await request.get("/dist/pages/mitmachen/index.html");
  expect(removedEntryResponse.status()).toBe(404);
  await page.locator('.home-destination-link[data-home-module="care"]').click();
  await expect(page).toHaveURL(/#map$/);
  const careMap = page.frameLocator("#map-view-frame");
  await expect(careMap.getByRole("button", { name: "Sektoren", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(careMap.locator("#count")).toHaveText(/[1-9]\d*\s*\/\s*[1-9]\d*/);
  if (await page.locator("#sidebar-profile-button").isHidden()) {
    await page.locator("#sidebar-collapse-button").click();
    await expect(page.locator(".app-shell")).toHaveClass(/is-mobile-sidebar-expanded/);
  }
  await page.locator("#sidebar-profile-button").click();
  await expect(page.locator("#profile-page")).toBeVisible();
  await expect(page.locator("#profile-logout")).toHaveCount(0);
  await expect(page.getByText(/IAP-Anmeldung|Angemeldete Sitzung/)).toHaveCount(0);
  expect(publicDemoExternalRequests).toEqual([]);

  const publicDemoPosts = [];
  page.on("request", (outgoingRequest) => {
    if (outgoingRequest.method() === "POST") publicDemoPosts.push(outgoingRequest.url());
  });
  await page.goto("/dist/pages/mitmachen/versorgungs-netzwerk.html");
  await expect(page.locator('script[src*="data/demo-data.js"]')).toHaveCount(0);
  await expect(page.locator('script[src*="data/demo-api.js"]')).toHaveCount(0);
  await page.getByLabel(/Vorname/).fill("Demo");
  await page.getByLabel(/Nachname/).fill("Registrierung");
  await page.getByLabel(/E-Mail-Adresse/).fill("demo.registrierung@example.invalid");
  await page.getByLabel(/Demo-Hinweis verstanden/).check();
  await page.getByLabel(/Keine Datenverarbeitung/).check();
  await page.getByRole("button", { name: /Demo fortsetzen/ }).click();
  await page.getByRole("button", { name: /Demo ohne Profil abschließen/ }).click();
  await expect(page.locator("#confirmation")).toBeVisible();
  await expect(page.locator("#confirmation")).toContainText("Demo abgeschlossen");
  await expect(page.locator("#confirmation")).toContainText("keine Daten an die gematik oder einen anderen Dienst übermittelt oder gespeichert");
  await expect(page.locator("#confirmation")).toContainText("Formulareingaben wurden verworfen");
  expect(publicDemoPosts).toEqual([]);
});

test("Phase 4: die vier Module bleiben ohne JavaScript vollständig lesbar", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/dist/pages/index.html`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Willkommen.");
  await expect(page.getByRole("navigation", { name: "Arbeitsbereiche" })).toBeInViewport();
  await expect(page.locator(".home-destination-name")).toHaveText([
    "Versorgungs-Kompass",
    "Stakeholder-Kompass",
    "Hospitations-Kompass",
    "Format-Kompass"
  ]);
  await expect(page.getByRole("link", { name: "Versorgungs-Kompass", exact: true })).toBeInViewport();
  await expect(page.locator("#registration-form")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await context.close();
});

test("Phase 4: die Pages-Registrierung bleibt technisch inert", async ({ page }) => {
  const writes = [];
  const adapterRequests = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
    if (/\/data\/(?:demo-api|demo-data|runtime-config)\.js(?:$|\?)/.test(request.url())) adapterRequests.push(request.url());
  });

  await page.goto("/dist/pages/mitmachen/versorgungs-netzwerk.html");
  await page.getByLabel(/Vorname/).fill("Demo");
  await page.getByLabel(/Nachname/).fill("Inerte Demo");
  await page.getByLabel(/E-Mail-Adresse/).fill("inert@example.invalid");
  await page.getByLabel(/Demo-Hinweis verstanden/).check();
  await page.getByLabel(/Keine Datenverarbeitung/).check();
  await page.getByRole("button", { name: /Demo fortsetzen/ }).click();
  await page.getByRole("button", { name: /Demo ohne Profil abschließen/ }).click();

  await expect(page.locator("#confirmation")).toBeVisible();
  await expect(page.locator("#confirmation")).toContainText("Formulareingaben wurden verworfen");
  expect(writes).toEqual([]);
  expect(adapterRequests).toEqual([]);
});

test("Phase 4: Teams zeigen offene Bereiche mit Mitgliedern im direkten Kontext und laden Kontakte erst bei Bedarf", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#team", {
    role: "admin",
    backendFixtureScript: teamDirectoryBackendFixtureScript()
  });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator("#profile-tab-team")).toBeVisible();
  await expect(page.locator('[data-profile-tab="team"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#team-overview-title")).toHaveCount(0);
  await expect(page.locator("#workspace-view-title")).toHaveText("Teams");
  await expect(page.locator("#workspace-view-subtitle")).toHaveText("Personen, Teams und Zuständigkeiten im Überblick.");
  await expect(page.locator('[data-workspace-brand]')).toBeVisible();
  await expect(page.locator("#workspace-brand-image")).toHaveAttribute("alt", "#Mitmachen");
  await expect(page.locator("#team-user-count")).toHaveText("36");
  await expect(page.locator("#team-group-count")).toHaveText("3");
  await expect(page.locator("#team-directory-title")).toHaveCount(0);
  await expect(page.locator("#team-directory-result, #team-search-input")).toHaveCount(0);
  await expect(page.locator(".team-toolbar")).toHaveCount(0);
  const isMobile = (page.viewportSize()?.width || 1440) < 760;
  const workspaceWidth = await page.locator(".team-workspace").evaluate((element) => Math.round(element.getBoundingClientRect().width));
  expect(workspaceWidth).toBeGreaterThan(isMobile ? 280 : 600);
  expect(workspaceWidth).toBeLessThanOrEqual(isMobile ? 390 : 760);
  const panelWidth = await page.locator("#profile-tab-team").evaluate((element) => element.getBoundingClientRect().width);
  expect(workspaceWidth).toBeLessThanOrEqual(panelWidth + 1);
  await expect(page.locator("#profile-tab-team > .team-workspace")).toBeVisible();

  const metricsBox = await page.locator(".team-metrics").boundingBox();
  expect(metricsBox).not.toBeNull();
  await expect(page.locator(".team-metrics dd svg")).toHaveCount(3);
  if (isMobile) {
    const headerBox = await page.locator(".workspace-header").boundingBox();
    const mobileBarBox = await page.locator(".app-sidebar").boundingBox();
    const headerGap = headerBox.y - (mobileBarBox.y + mobileBarBox.height);
    expect(headerGap).toBeGreaterThanOrEqual(0);
    expect(headerGap).toBeLessThanOrEqual(16);
  }

  const teamCards = page.locator("#team-account-list .team-board-card");
  await expect(teamCards).toHaveCount(4);
  await expect(page.locator("#team-account-list .team-column")).toHaveCount(0);
  await expect(teamCards.filter({ hasText: "Strategie und Standards" })).toHaveCount(0);
  await expect(teamCards.filter({ hasText: "Ohne Team" })).toHaveCount(1);
  await expect(page.locator("#team-selected-detail, #team-account-list [aria-pressed]")).toHaveCount(0);

  const teamGridColumns = await page.locator(".team-board-grid").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length
  );
  expect(teamGridColumns).toBe(1);
  const teamGridBox = await page.locator(".team-board-grid").boundingBox();
  expect(teamGridBox.y - (metricsBox.y + metricsBox.height)).toBeGreaterThanOrEqual(24);
  expect(Math.abs(teamGridBox.x - metricsBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(teamGridBox.width - metricsBox.width)).toBeLessThanOrEqual(1);
  if (!isMobile) {
    const teamCardWidths = await teamCards.evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().width))
    );
    expect(new Set(teamCardWidths).size).toBe(1);
  }

  const firstTeam = teamCards.first();
  await expect(firstTeam.locator(".team-board-card__heading h4")).toHaveText("Stabsstelle Versorgung");
  await expect(firstTeam.locator(".team-board-card__heading span, .team-board-card__heading p")).toHaveCount(0);
  await expect(firstTeam.locator(".team-icon svg")).toBeVisible();
  await expect(firstTeam.locator(".team-board-card__member-count")).toContainText("9");
  await expect(firstTeam.locator(".team-account-card")).toHaveCount(9);
  await expect(page.locator("#team-account-list .team-account-card")).toHaveCount(36);
  await expect(firstTeam.locator(".team-account-card__contact-count")).toHaveCount(0);
  await expect(firstTeam.locator("summary.team-account-card__header")).toHaveCount(9);
  await expect(firstTeam.getByText("Profil ansehen")).toHaveCount(0);
  await expect(firstTeam.locator(".team-account-responsibilities")).toHaveCount(0);

  await expect(page.locator("#team-account-list .profile-owner-contact")).toHaveCount(0);
  const responsibilityDetails = page.locator("#team-account-list [data-team-owner-profile]").filter({ hasText: "1 Kontakt öffnen" }).first();
  const responsibilityCard = responsibilityDetails.locator("xpath=ancestor::article[contains(@class, 'team-account-card')]");
  const responsibilityCardBox = await responsibilityCard.boundingBox();
  const responsibilityDetailsBox = await responsibilityDetails.boundingBox();
  expect(responsibilityCardBox).not.toBeNull();
  expect(responsibilityDetailsBox).not.toBeNull();
  expect(responsibilityDetailsBox.width).toBeGreaterThan(responsibilityCardBox.width - 40);
  await responsibilityDetails.locator("summary").click();
  await expect(responsibilityDetails).toHaveAttribute("open", "");
  await expect(responsibilityDetails.locator(".profile-owner-contact")).toHaveCount(1);
  await expect(responsibilityDetails).not.toContainText("Kontakte werden erst beim Öffnen geladen.");

  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoHorizontalOverflow(page);
  const mobileTeamGridColumns = await page.locator(".team-board-grid").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length
  );
  expect(mobileTeamGridColumns).toBe(1);

  const navigableResponsibility = page.locator("#team-account-list [data-team-owner-profile]").filter({ hasText: "1 Kontakt öffnen" }).first();
  if ((await navigableResponsibility.getAttribute("open")) === null) await navigableResponsibility.locator("summary").click();
  await navigableResponsibility.locator("[data-team-owner-contact]").click();
  await expect(page.locator('[data-view-panel="personProfile"]')).toBeVisible();
  await expect(page).toHaveURL(/#person\/contact\/phase4-contact-/);
});

for (const role of ["viewer", "editor", "admin"]) {
  test(`Phase 4: ${role} sieht das zulässige Teamverzeichnis ohne Bearbeitungsaktionen`, async ({ page }) => {
    await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#team", {
      role,
      backendFixtureScript: teamDirectoryBackendFixtureScript()
    });
    const firstTeam = page.locator("#team-account-list .team-board-card").first();
    await expect(firstTeam.locator(".team-account-card").first()).toBeVisible();
    await expect(page.locator("#team-selected-detail, #team-account-list [aria-pressed]")).toHaveCount(0);
    await expect(page.locator("#team-account-list").getByRole("button", { name: /bearbeiten|löschen|Rolle ändern/i })).toHaveCount(0);
    await expect(page.locator("#team-account-list").getByText("Profil ansehen")).toHaveCount(0);
    await expect(firstTeam.getByText(/Kontakte? öffnen/).first()).toBeVisible();
  });
}

test("Teams: öffentliche Demo zeigt die drei Konten des Profilwechsels mit ihren Teams", async ({ page }) => {
  await page.goto("/dist/pages/versorgungs-kompass.html?demoProfile=demo-profile-admin#team");

  const directory = page.locator("#team-account-list");
  await expect(directory.locator(".team-board-card")).toHaveCount(3);
  await expect(directory.locator(".team-account-card")).toHaveCount(3);
  await expect(directory.locator(".team-account-copy > strong")).toHaveText([
    "Nora Demir", "Mara Stein", "Tobias Nguyen"
  ]);
  await expect(directory.locator(".team-account-role")).toHaveText(["Viewer", "Admin", "Editor"]);
  await expect(page.locator("#team-user-count")).toHaveText("3");
  await expect(page.locator("#team-group-count")).toHaveText("3");

  const demoState = await page.evaluate(() => window.VersorgungsCompassDemoApi.snapshot());
  expect(demoState.profiles.map((profile) => profile.id)).toEqual(expect.arrayContaining([
    "demo-profile-hospitation", "demo-profile-formate"
  ]));
  const directoryOwners = new Set(["demo-profile-admin", "demo-profile-editor", "demo-profile-viewer"]);
  const ownedContacts = demoState.contacts.filter((contact) =>
    contact.status !== "archived"
      && [contact.ownerId, ...(contact.ownerIds || [])].some((id) => directoryOwners.has(id))
  );
  await expect(page.locator("#team-contact-count")).toHaveText(String(ownedContacts.length));

  await expect(page.getByRole("searchbox", { name: "Team oder Person suchen" })).toHaveCount(0);
  const teamIcons = await directory.locator(".team-icon svg").evaluateAll((icons) =>
    icons.map((icon) => icon.innerHTML)
  );
  expect(new Set(teamIcons).size).toBe(3);
});

test.describe("Hospitations-Kompass als eigener Einstieg", () => {
  const focusedApp = "/frontend/app/versorgungs-kompass.html?workspace=hospitation";
  async function showNavigation(page, testInfo) {
    if (testInfo.project.name.includes("mobile") && !(await page.locator(".app-shell").evaluate((node) => node.classList.contains("is-mobile-sidebar-expanded")))) {
      await page.locator("#sidebar-collapse-button").click();
    }
  }

  test("behält den Fokus bei Bereichswechsel, Neuladen und Rückkehr zur Übersicht", async ({ page }, testInfo) => {
    await gotoAuthenticated(page, focusedApp);
    await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "hospitationOverview");
    await expect(page).toHaveTitle("Übersicht · Hospitations-Kompass");
    await showNavigation(page, testInfo);
    await expect(page.locator('[data-sidebar-group="care"]')).toBeHidden();
    await expect(page.locator('[data-sidebar-group="stakeholders"]')).toBeHidden();
    await expect(page.locator('[data-sidebar-group="formats"]')).toBeHidden();
    await expect(page.locator('[data-sidebar-group="planning"] .primary-tab:visible')).toHaveCount(6);
    await page.locator('[data-view-tab="hospitations:observations"]').click();
    await expect(page).toHaveURL(/workspace=hospitation#hospitations:observations$/);
    await page.reload();
    await expect(page.locator("#workspace-view-title")).toHaveText("Beobachtungen");
    await expect(page).toHaveTitle("Beobachtungen · Hospitations-Kompass");
    await showNavigation(page, testInfo);
    await page.locator("#sidebar-profile-button").click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "profile");
    await showNavigation(page, testInfo);
    await expect(page.locator('[data-sidebar-group="planning"] .primary-tab:visible')).toHaveCount(6);
    await page.locator("#brand-home-link").click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "hospitationOverview");
    await showNavigation(page, testInfo);
    await page.locator("#hospitation-other-apps").click();
    await expect(page).not.toHaveURL(/workspace=hospitation/);
    await expect(page.locator(".app-shell")).not.toHaveAttribute("data-workspace", "hospitation");
    await expect(page.locator("#hospitation-other-apps")).toBeHidden();
    await expect(page.locator("#hospitation-recent")).toBeHidden();
  });

  test("öffnet die zuletzt bearbeitete Beobachtung im bestehenden Editor", async ({ page }) => {
    await gotoAuthenticated(page, focusedApp);
    const recent = page.locator("[data-recent-observation]");
    await expect(recent).toHaveCount(3);
    const title = await recent.first().locator("strong").innerText();
    await recent.first().click();
    await expect(page).toHaveURL(/#hospitations:observations$/);
    await expect(page.locator("#observation-detail-drawer")).toHaveClass(/is-open/);
    await expect(page.locator("#observation-detail-drawer")).toContainText(title);
    await expect(page.locator(".app-shell")).toHaveAttribute("data-workspace", "hospitation");
  });

  test("behält Leserechte und zeigt einen leeren Bestand ohne Beispielersatz", async ({ page }, testInfo) => {
    const fixture = createProtectedBackendFixture({ role: "viewer" });
    fixture.hospitations = [];
    fixture.hospitationSlots = [];
    fixture.hospitationObservations = [];
    await gotoAuthenticated(page, focusedApp, { role: "viewer", backendFixture: fixture });
    await expect(page.locator(".hospitation-overview-priority")).toHaveAttribute("data-hospitation-overview-state", "ready");
    await expect(page.locator("#hospitation-overview-plan-button")).toBeHidden();
    await expect(page.locator("#hospitation-recent-items")).toHaveText("Noch keine Beobachtungen erfasst.");
    await expect(page.locator("[data-recent-observation]")).toHaveCount(0);
    await showNavigation(page, testInfo);
    await expect(page.locator("#hospitation-other-apps")).toBeVisible();
  });
});
