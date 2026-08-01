import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

function teamSearchFixtureScript() {
  return `
    (() => {
      const now = "2026-07-28T08:00:00.000Z";
      const profiles = [
        {
          id: "profile-anna",
          email: "anna@example.test",
          display_name: "Anna Adler",
          initials: "AA",
          role: "admin",
          active: true,
          avatar_url: "",
          team: "Stabsstelle Versorgung",
          created_at: now,
          updated_at: now
        },
        {
          id: "profile-berta",
          email: "berta@example.test",
          display_name: "Berta Berg",
          initials: "BB",
          role: "editor",
          active: true,
          avatar_url: "",
          team: "Kommunikation",
          created_at: now,
          updated_at: now
        }
      ];
      const contacts = [
        {
          id: "contact-anna",
          name: "Kontakt Anna",
          displayName: "Kontakt Anna",
          organization: "Praxis Anna",
          category: "Praxis",
          sector: "Praxis",
          ownerId: "profile-anna",
          ownerIds: ["profile-anna"],
          owner: "Anna Adler",
          city: "Berlin",
          state: "Berlin",
          status: "active",
          createdAt: now,
          updatedAt: now
        },
        {
          id: "contact-shared",
          name: "Gemeinsam betreuter Kontakt",
          displayName: "Gemeinsam betreuter Kontakt",
          organization: "Gemeinschaftspraxis",
          category: "Praxis",
          sector: "Praxis",
          ownerId: "profile-anna",
          ownerIds: ["profile-anna", "profile-berta"],
          owner: "Anna Adler",
          city: "Berlin",
          state: "Berlin",
          status: "active",
          createdAt: now,
          updatedAt: now
        }
      ];
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

test("Teamsuche filtert live und zählt betreute Kontakte eindeutig", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#team", {
    role: "admin",
    backendFixtureScript: teamSearchFixtureScript()
  });

  await expect(page.locator('[data-view-panel="team"]')).toBeVisible();
  await expect(page.locator("#team-user-count")).toHaveText("2");
  await expect(page.locator("#team-contact-count")).toHaveText("2");
  await expect(page.locator("#team-directory-result")).toBeHidden();

  const search = page.getByRole("searchbox", { name: "Team oder Person suchen" });
  await search.fill("Berta");
  await expect(page.locator("#team-directory-result")).toHaveText("1 Treffer in 1 Team");
  await expect(page.locator("#team-account-list [data-team-group]")).toHaveCount(1);
  const resultTeam = page.locator('#team-account-list [data-team-group="Kommunikation"]');
  await expect(resultTeam.locator(".team-board-card__member-count")).toContainText("1");
  await expect(resultTeam.getByText("Berta Berg", { exact: true })).toBeVisible();
  await expect(page.locator("#team-selected-detail, #team-account-list [aria-pressed]")).toHaveCount(0);

  const ownerDetails = resultTeam.locator("[data-team-owner-profile='profile-berta']");
  await expect(ownerDetails.locator(".profile-owner-count")).toHaveText("1");
  await expect(ownerDetails.locator("[data-team-owner-list]")).toContainText("Kontakte werden erst beim Öffnen geladen");
  await ownerDetails.locator("summary").click();
  await expect(ownerDetails.locator("[data-team-owner-list]")).toContainText("Gemeinsam betreuter Kontakt");

  await page.getByRole("button", { name: "Teamsuche leeren" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator("#team-directory-result")).toBeHidden();

  const stabsstelleCard = page.locator('[data-team-group="Stabsstelle Versorgung"]');
  await expect(stabsstelleCard).toContainText("Anna Adler");
  const horizontalOverflow = await page.locator("html").evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("Benachrichtigungsfilter sind Tabs mit roving tabindex", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#profile-notifications", {
    role: "admin",
    localNotifications: [
      {
        id: "notification-contact",
        title: "Kontakt aktualisiert",
        body: "Ein synthetischer Kontakt wurde aktualisiert.",
        context: "contacts",
        entityType: "contact",
        entityId: "contact-anna",
        createdAt: "2026-07-28T08:00:00.000Z",
        unread: true
      }
    ]
  });

  const tablist = page.getByRole("tablist", { name: "Benachrichtigungen filtern" });
  await expect(tablist).toBeVisible();
  const unread = tablist.getByRole("tab", { name: "Ungelesen" });
  const all = tablist.getByRole("tab", { name: "Alle", exact: true });
  const product = tablist.getByRole("tab", { name: "Produkt" });
  await expect(unread).toHaveAttribute("aria-selected", "true");
  await expect(unread).toHaveAttribute("tabindex", "0");
  await expect(all).toHaveAttribute("tabindex", "-1");
  await expect(unread).not.toHaveAttribute("aria-pressed", /.*/);

  await unread.focus();
  await page.keyboard.press("ArrowRight");
  await expect(all).toBeFocused();
  await expect(all).toHaveAttribute("aria-selected", "true");
  await expect(unread).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#notifications-filter-panel")).toHaveAttribute("aria-labelledby", "notification-filter-all");

  await page.keyboard.press("End");
  await expect(product).toBeFocused();
  await expect(product).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(unread).toBeFocused();
  await expect(unread).toHaveAttribute("aria-selected", "true");
});

test("Experten-, alle Patientenmodi und Stakeholderlisten haben eine dynamische ARIA-Tabellenstruktur", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "chromium-mobile", "Die mobile Darstellung nutzt semantische Karten statt Tabellen.");
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#experts", { role: "admin" });

  const assertSemanticTable = async (nameOrLocator) => {
    const table = typeof nameOrLocator === "string"
      ? page.getByRole("table", { name: nameOrLocator })
      : nameOrLocator;
    await expect(table).toBeVisible();
    await expect(table).toHaveAccessibleName(/\S/);
    await expect(table).toHaveAttribute("aria-colcount", /[1-9]\d*/);
    await expect(table).toHaveAttribute("aria-rowcount", /[1-9]\d*/);
    await expect(table.locator(":scope > .thead")).toHaveAttribute("role", "row");
    await expect(table.locator(":scope > .thead > [role='columnheader']").first()).toBeAttached();
    const firstCell = table.locator(":scope [role='cell']").first();
    await expect(firstCell).toBeAttached();
    if ((page.viewportSize()?.width || 0) > 760) await expect(firstCell).toBeVisible();
  };

  await assertSemanticTable("Expertenkreis-Kontakte");

  await page.locator('[data-view-tab="patients"]').click();
  await expect(page.locator('[data-view-panel="patients"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Patienten", exact: true })).toBeVisible();
  await expect(page.locator("[data-workspace-brand]:visible")).toHaveCount(1);

  const patientModes = [
    { mode: "people", panel: "patient-people-table" },
    { mode: "organizations", panel: "patient-organizations-table" },
    { mode: "indications", panel: "patient-indications-table" }
  ];
  for (const { mode, panel } of patientModes) {
    const tab = page.locator(`#patient-mode-actions [data-patient-mode="${mode}"]`);
    await expect(tab).toHaveAttribute("role", "tab");
    await expect(tab).toHaveAttribute("aria-controls", panel);
    if (await tab.getAttribute("aria-selected") !== "true") {
      await tab.click();
    }
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`#${panel}`)).toBeVisible();
    await assertSemanticTable(page.locator(`#${panel} [role="table"]`));
  }

  await page.locator('[data-view-tab="stakeholders"]').first().click();
  await expect(page.locator('[data-view-panel="stakeholders"]')).toBeVisible();
  await assertSemanticTable("Stakeholder-Organisationen");
});
