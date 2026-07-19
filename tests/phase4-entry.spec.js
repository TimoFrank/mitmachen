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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Willkommen.");
  await expect(page.locator(".destinations > li")).toHaveCount(4);
  await expect(page.locator(".destinations strong")).toHaveText(["Versorgung", "Stakeholder", "Hospitation", "Formate"]);
  await expect(page.locator(".module-sidebar")).toBeVisible();
  await expect(page.locator(".module-sidebar__nav > a")).toHaveCount(4);
  await expect(page.locator(".destinations").getByRole("link", { name: /Versorgung/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#map");
  await expect(page.locator(".destinations").getByRole("link", { name: /Stakeholder/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#stakeholders");
  await expect(page.locator(".destinations").getByRole("link", { name: /Hospitation/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#planning");
  await expect(page.locator(".destinations").getByRole("link", { name: /Formate/ })).toHaveAttribute("href", "../../app/versorgungs-kompass.html#formats");
  await expect(page.getByText(/registrier/i)).toHaveCount(0);

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

  await page.goto("/dist/pages/index.html");
  await expect(page).toHaveURL(/\/dist\/pages\/demo\/$/);
  await expect(page).toHaveTitle("Versorgungs-Kompass Demo");
  await expect(page.locator("#view-subtitle")).toContainText("ausschließlich synthetischen");
  await expect(page.locator("#demo-mode-banner")).toContainText("Demo");
  await expect(page.locator('script[src="../data/demo-data.js"]')).toHaveCount(1);
  await expect(page.locator('script[src*="data-service.js"]')).toHaveCount(0);
});

test("Phase 4: die vier Module bleiben ohne JavaScript vollständig lesbar", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/frontend/pages/mitmachen/index.html`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Willkommen.");
  await expect(page.locator(".destinations strong")).toHaveText(["Versorgung", "Stakeholder", "Hospitation", "Formate"]);
  await expect(page.getByText(/registrier/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await context.close();
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
