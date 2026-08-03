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
        title: "Kontaktdaten aktualisiert",
        body: "Telefonnummer und Zuständigkeit wurden aktualisiert.",
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
  const unread = tablist.getByRole("tab", { name: "Ungelesen – 1 ungelesene Benachrichtigung" });
  const all = tablist.getByRole("tab", { name: "Alle Benachrichtigungen", exact: true });
  const hospitations = tablist.getByRole("tab", { name: "Hospitationen – keine ungelesenen Benachrichtigungen" });
  const product = tablist.getByRole("tab", { name: "Produktinformationen" });
  await expect(hospitations).toBeVisible();
  await expect(unread).toHaveAttribute("aria-selected", "true");
  await expect(unread).toHaveAttribute("tabindex", "0");
  await expect(all).toHaveAttribute("tabindex", "-1");
  await expect(unread).not.toHaveAttribute("aria-pressed", /.*/);

  const notificationItem = page.locator('[data-notification-id="notification-contact"]');
  const notificationToggle = notificationItem.getByRole("button", { name: "Kontaktdaten aktualisiert. Kategorie: Kontakte. Datum: 28.07.2026. Status: Ungelesen" });
  const notificationDetails = notificationItem.locator(".notification-item__details");
  const notificationOpen = notificationItem.getByRole("button", { name: "Benachrichtigung „Kontaktdaten aktualisiert“ öffnen" });
  await expect(notificationToggle).toBeVisible();
  await expect(notificationToggle).toHaveAttribute("aria-expanded", "false");
  await expect(notificationItem.locator(".notification-item__category-group > .notification-item__compass-mark + .notification-item__category")).toBeVisible();
  await expect(notificationItem.locator(".notification-item__compass-mark")).toHaveAttribute("src", "../../public/brand/versorgungs-kompass/mark.svg");
  await expect(notificationItem.locator(".notification-item__compass-mark")).toHaveAttribute("alt", "");
  await expect(notificationItem.locator(".notification-item__compass-mark")).toHaveAttribute("aria-hidden", "true");
  await expect(notificationItem.locator(".notification-item__category")).toHaveText("Kontakte");
  await expect(notificationItem.locator(".notification-item__summary-status")).toHaveText("Ungelesen");
  await expect(notificationItem.locator(".notification-item__summary-date")).toHaveText("28.07.2026");
  await expect(notificationItem.locator("time.notification-item__summary-date")).toHaveAttribute("datetime", "2026-07-28T08:00:00.000Z");
  await expect(notificationItem.locator(".notification-item__summary > *")).toHaveCount(3);
  expect(await notificationItem.locator(".notification-item__summary > *").evaluateAll((nodes) => nodes.map((node) => node.className))).toEqual([
    "notification-item__summary-meta",
    "notification-item__title",
    "notification-item__summary-status is-unread"
  ]);
  await expect(notificationDetails).toBeHidden();
  await expect(notificationOpen).toBeHidden();
  await notificationToggle.focus();
  await page.keyboard.press("Enter");
  await expect(notificationToggle).toBeFocused();
  await expect(notificationToggle).toHaveAttribute("aria-expanded", "true");
  await expect(notificationDetails).toBeVisible();
  await expect(notificationItem.locator(".notification-item__text")).toHaveText("Telefonnummer und Zuständigkeit wurden aktualisiert.");
  await expect(notificationOpen).toBeVisible();
  await page.keyboard.press("Space");
  await expect(notificationToggle).toHaveAttribute("aria-expanded", "false");
  await expect(notificationDetails).toBeHidden();

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

  const stakeholderOrganizationSubnav = page.locator('[data-sidebar-subnav="stakeholder-organizations"]');
  if (!await stakeholderOrganizationSubnav.getAttribute("open")) {
    await stakeholderOrganizationSubnav.locator(".sidebar-subnav__toggle").click();
  }
  await stakeholderOrganizationSubnav.locator('[data-view-tab="stakeholders"]').first().click();
  await expect(page.locator('[data-view-panel="stakeholders"]')).toBeVisible();
  await assertSemanticTable("Stakeholder-Organisationen");
});
