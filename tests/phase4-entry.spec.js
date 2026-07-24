import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

function teamDirectoryBackendFixtureScript() {
  return `
    (() => {
      const now = "2026-07-16T12:00:00.000Z";
      const teams = ["Stabsstelle Versorgung", "Kommunikation", "Strategie und Standards", "Produktentwicklung", ""];
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

test("Phase 4: #Mitmachen führt in vier geschützte Module und Pages in die öffentliche Demo", async ({ page, request }) => {
  await page.goto("/frontend/pages/mitmachen/index.html");

  await expect(page).toHaveTitle(/#Mitmachen/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gemeinsam Versorgung gestalten.");
  await expect(page.locator(".concept-notice")).toHaveCount(0);
  await expect(page.locator(".destinations > li")).toHaveCount(4);
  await expect(page.locator(".destinations strong")).toHaveText(["Versorgung", "Stakeholder", "Hospitation", "Formate"]);
  await expect(page.locator(".module-sidebar")).toBeVisible();
  await expect(page.locator(".module-sidebar__nav > a")).toHaveCount(4);
  await expect(page.locator(".destinations").getByRole("link", { name: /Versorgung/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#map");
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
  await expect(page).toHaveURL(/\/dist\/pages\/versorgungs-kompass\.html#home$/);
  await expect(page).toHaveTitle("Versorgungs-Kompass");
  await expect(page.locator(".app-sidebar")).toBeVisible();
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await expect(page.locator('[data-view-tab="home"]')).toHaveAttribute("aria-current", "page");
  const welcomeHeading = page.getByRole("heading", { level: 1, name: "Willkommen im Versorgungs-Kompass" });
  const homeScroller = page.locator("[data-home-scroller]");
  const homeScrollCue = page.getByRole("button", { name: "Bereiche ansehen" });
  await expect(homeScroller).toHaveAttribute("tabindex", "0");
  await expect(homeScroller).toHaveAttribute("aria-label", "Startseiteninhalt");
  await expect(welcomeHeading).toBeVisible();
  await expect(page.locator(".home-hero__lead")).toHaveText("Wähle den Bereich, in dem du arbeiten möchtest.");
  await expect(homeScrollCue).toBeVisible();
  await expect(homeScrollCue).toHaveAttribute("aria-controls", "home-destinations");
  await expect(page.locator(".home-destination-card")).toHaveCount(4);
  await expect(page.locator(".home-destination-link")).toHaveCount(4);
  await expect(page.locator(".home-destination-link strong")).toHaveText(["Versorgung", "Stakeholder", "Hospitation", "Formate"]);
  const welcomeTextBox = await welcomeHeading.evaluate((heading) => {
    const rect = heading.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewportWidth: window.innerWidth };
  });
  expect(welcomeTextBox.left).toBeGreaterThanOrEqual(0);
  expect(welcomeTextBox.right).toBeLessThanOrEqual(welcomeTextBox.viewportWidth + 1);
  const initialHomeScroll = await homeScroller.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    windowScrollY: window.scrollY
  }));
  expect(initialHomeScroll.scrollTop).toBe(0);
  expect(initialHomeScroll.scrollHeight).toBeGreaterThan(initialHomeScroll.clientHeight);
  expect(initialHomeScroll.windowScrollY).toBe(0);
  await homeScrollCue.click();
  await expect(page.locator("#home-destinations")).toBeFocused();
  await expect.poll(() => homeScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator("#home-destinations")).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('[data-view-tab="contacts"]')).toHaveCount(1);
  await expect(page.locator('[data-view-tab="stakeholders"]')).toHaveCount(1);
  await expect(page.locator('[data-view-tab="hospitations"]')).toHaveCount(1);
  await expect(page.locator('[data-view-tab="formats"]')).toHaveCount(1);
  await expect(page.locator('script[src="./data/demo-data.js"]')).toHaveCount(1);
  await expect(page.locator('script[src="./data/demo-api.js"]')).toHaveCount(1);
  await expect(page.locator('script[src="./data/data-service.js"]')).toHaveCount(1);
  await expect(page.locator('script[src*="auth-"]')).toHaveCount(0);
  const demoNotice = page.locator("#vk-public-demo-notice");
  const demoNoticeClose = page.locator("[data-demo-notice-close]");
  const demoTrigger = page.locator("#vk-public-demo-trigger");
  await expect(demoNotice).toBeHidden();
  await expect(demoTrigger).toBeHidden();
  await page.locator('.home-destination-link[href="#map"]').click();
  await expect(page).toHaveURL(/#map$/);
  await expect(demoNotice).toBeVisible();
  await expect(demoNotice).toContainText("Öffentliche Demo");
  await expect(demoNotice.locator(".vk-demo-copy")).toHaveText("Hinweis: Öffentliche Demo");
  await expect(page.getByText("Bitte keine echten Angaben eingeben.", { exact: true })).toHaveCount(0);
  await expect(demoNotice).not.toContainText("synthetische Daten");
  await expect(demoNotice).not.toContainText("Änderungen verschwinden");
  await expect(demoNoticeClose).toHaveText("OK");
  const demoContactCount = await page.evaluate(async () => {
    await window.fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Temporärer UI-Testkontakt", status: "active" })
    });
    return window.VersorgungsCompassDemoApi.snapshot().contacts.length;
  });
  await demoNoticeClose.click();
  await expect(demoNotice).toBeHidden();
  await expect(demoTrigger).toBeVisible();
  await expect(demoTrigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.VersorgungsCompassDemoApi.snapshot().contacts.length)).toBe(demoContactCount);
  await page.evaluate(() => {
    window.location.hash = "#home";
  });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "home");
  await expect(demoNotice).toBeHidden();
  await expect(demoTrigger).toBeHidden();
  await page.locator('.home-destination-link[href="#map"]').click();
  await expect(page).toHaveURL(/#map$/);
  await expect(demoNotice).toBeHidden();
  await expect(demoTrigger).toBeVisible();
  await expect(demoTrigger).toHaveAttribute("aria-label", "Hinweis zur öffentlichen Demo anzeigen");
  await expect(demoTrigger.locator("svg")).toBeVisible();
  await demoTrigger.click();
  await expect(demoNotice).toBeVisible();
  await expect(demoTrigger).toBeHidden();
  await expect(demoNoticeClose).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expect(page.frameLocator('iframe[title="Karte des Versorgungs-Kompass"]').locator("#count")).toHaveText(/[1-9]\d*\s*\/\s*[1-9]\d*/);
  if (await page.locator("#sidebar-profile-button").isHidden()) {
    await page.locator("#sidebar-collapse-button").click();
    await expect(page.locator(".app-shell")).toHaveClass(/is-mobile-sidebar-expanded/);
  }
  await page.locator("#sidebar-profile-button").click();
  await expect(page.locator("#profile-page")).toBeVisible();
  await expect(demoNotice).toBeHidden();
  await expect(demoTrigger).toBeHidden();
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
  await page.goto(`${baseURL}/frontend/pages/mitmachen/index.html`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gemeinsam Versorgung gestalten.");
  await expect(page.locator(".destinations strong")).toHaveText(["Versorgung", "Stakeholder", "Hospitation", "Formate"]);
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

test("Phase 4: Teams starten kompakt und eingeklappt, zeigen Mitglieder und laden Kontakte erst bei Bedarf", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#team", {
    role: "admin",
    backendFixtureScript: teamDirectoryBackendFixtureScript()
  });

  await expect(page.locator('[data-view-panel="team"]')).toBeVisible();
  await expect(page.locator("#workspace-view-title")).not.toBeVisible();
  await expect(page.locator("#workspace-view-subtitle")).not.toBeVisible();
  await expect(page.locator("#team-overview-title")).toBeVisible();
  await expect(page.locator("#team-user-count")).toHaveText("36");
  await expect(page.locator("#team-group-count")).toHaveText("4");
  await expect(page.locator("#team-directory-title, #team-directory-result, .team-toolbar")).toHaveCount(0);
  const workspaceWidth = await page.locator(".team-workspace").evaluate((element) => Math.round(element.getBoundingClientRect().width));
  expect(workspaceWidth).toBeLessThanOrEqual(760);
  await expect(page.locator("#team-account-list > .team-column")).toHaveCount(5);
  await expect(page.locator("#team-account-list > .team-column[open]")).toHaveCount(0);

  const firstGroup = page.locator("#team-account-list > .team-column").first();
  await expect(firstGroup).not.toHaveAttribute("open", "");
  await expect(firstGroup.locator(".team-column-title strong")).toHaveText("Stabsstelle Versorgung");
  await expect(firstGroup.locator(".team-icon svg")).toBeVisible();
  const memberPreview = firstGroup.locator(".team-column-members");
  await expect(memberPreview).toBeVisible();
  const previewAvatarCount = await memberPreview.locator(".team-column-member-avatar").count();
  const memberBadgeCount = Number(await firstGroup.locator(".team-column-count strong").textContent());
  expect(previewAvatarCount).toBe(memberBadgeCount);
  await expect(firstGroup.locator(".team-column-accounts")).not.toBeVisible();
  const groupWidth = await firstGroup.evaluate((element) => Math.round(element.getBoundingClientRect().width));
  const directoryWidth = await page.locator("#team-account-list").evaluate((element) => Math.round(element.getBoundingClientRect().width));
  expect(Math.abs(directoryWidth - groupWidth)).toBeLessThanOrEqual(2);
  await firstGroup.locator(":scope > summary").click();
  await expect(firstGroup).toHaveAttribute("open", "");
  await expect(memberPreview).not.toBeVisible();
  await expect(firstGroup.locator(".team-column-accounts")).toBeVisible();
  await expect(firstGroup.getByText("Profil ansehen")).toHaveCount(0);
  await expect(firstGroup.locator(".team-account-responsibilities")).toHaveCount(0);

  await expect(page.locator("#team-account-list .profile-owner-contact")).toHaveCount(0);
  const responsibilityDetails = page.locator("#team-account-list [data-team-owner-profile]").filter({ hasText: "1 Kontakt öffnen" }).first();
  const responsibilityTeam = responsibilityDetails.locator("xpath=ancestor::details[@data-team-group]");
  if ((await responsibilityTeam.getAttribute("open")) === null) await responsibilityTeam.locator(":scope > summary").click();
  await responsibilityDetails.locator("summary").click();
  await expect(responsibilityDetails.locator(".profile-owner-contact")).toHaveCount(1);
  await expect(responsibilityDetails).not.toContainText("Kontakte werden erst beim Öffnen geladen.");

  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoHorizontalOverflow(page);

  const navigableResponsibility = page.locator("#team-account-list [data-team-owner-profile]").filter({ hasText: "1 Kontakt öffnen" }).first();
  const navigableTeam = navigableResponsibility.locator("xpath=ancestor::details[@data-team-group]");
  if ((await navigableTeam.getAttribute("open")) === null) await navigableTeam.locator(":scope > summary").click();
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
    const firstTeam = page.locator("#team-account-list > .team-column").first();
    await expect(page.locator("#team-account-list > .team-column[open]")).toHaveCount(0);
    await expect(firstTeam.locator(".team-column-members")).toBeVisible();
    await firstTeam.locator(":scope > summary").click();
    await expect(firstTeam.locator(".team-account-row").first()).toBeVisible();
    await expect(page.locator("#team-account-list").getByRole("button", { name: /bearbeiten|löschen|Rolle ändern/i })).toHaveCount(0);
    await expect(page.locator("#team-account-list").getByText("Profil ansehen")).toHaveCount(0);
    await expect(firstTeam.getByText(/Kontakte? öffnen/).first()).toBeVisible();
  });
}
