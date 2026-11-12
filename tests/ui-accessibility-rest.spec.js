import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

function teamDirectoryFixtureScript() {
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

test("Teamverzeichnis zählt gemeinsam betreute Kontakte eindeutig und öffnet Zuständigkeiten", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#team", {
    role: "admin",
    backendFixtureScript: teamDirectoryFixtureScript()
  });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator("#profile-tab-team")).toBeVisible();
  await expect(page.locator('[data-profile-tab="team"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#team-user-count")).toHaveText("2");
  await expect(page.locator("#team-contact-count")).toHaveText("2");
  await expect(page.locator("#team-directory-result, #team-search-input")).toHaveCount(0);
  await expect(page.locator("#team-account-list [data-team-group]")).toHaveCount(2);
  const resultTeam = page.locator('#team-account-list [data-team-group="Kommunikation"]');
  await expect(resultTeam.locator(".team-board-card__member-count")).toContainText("1");
  await expect(resultTeam.getByText("Berta Berg", { exact: true })).toBeVisible();
  await expect(page.locator("#team-selected-detail, #team-account-list [aria-pressed]")).toHaveCount(0);

  const ownerDetails = resultTeam.locator("[data-team-owner-profile='profile-berta']");
  await expect(ownerDetails.locator(".profile-owner-count")).toHaveText("1");
  await expect(ownerDetails.locator("[data-team-owner-list]")).toContainText("Kontakte werden erst beim Öffnen geladen");
  await ownerDetails.locator("summary").click();
  await expect(ownerDetails.locator("[data-team-owner-list]")).toContainText("Gemeinsam betreuter Kontakt");

  const stabsstelleCard = page.locator('[data-team-group="Stabsstelle Versorgung"]');
  await expect(stabsstelleCard).toContainText("Anna Adler");
  const horizontalOverflow = await page.locator("html").evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("Benachrichtigungsfilter ist als Dropdown per Tastatur und mit Rückfokus bedienbar", async ({ page }) => {
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

  const select = page.locator("#notifications-filter-select");
  const shell = select.locator("..");
  const trigger = shell.locator(".custom-select-trigger");
  const panel = shell.locator(".custom-select-panel");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(select).toHaveValue("unread");
  await expect(select.locator("option")).toHaveCount(8);
  expect(await select.locator("option").evaluateAll((options) => options.map((option) => option.value))).toEqual([
    "unread", "all", "contacts", "organizations", "hospitations", "formats", "team", "product"
  ]);
  await expect(select.locator('option[value="unread"]')).toHaveText(/^Ungelesen\s*\(1\)$/);
  await expect(select.locator('option[value="all"]')).toHaveText(/^Alle\s*\(1\)$/);
  await expect(page.locator("[data-notification-filter]")).toHaveCount(0);
  await expect(page.locator("#notifications-heading")).toHaveText("Alle Benachrichtigungen");
  await expect(page.locator("#notifications-filter-panel")).toHaveAttribute("role", "region");
  await expect(page.locator("#notifications-filter-panel")).toHaveAttribute("aria-labelledby", "notifications-heading");

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

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(panel).toBeVisible();
  const all = panel.locator('[data-option-value="all"]');
  await expect(all).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(select).toHaveValue("all");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("End");
  const product = panel.locator('[data-option-value="product"]');
  await expect(product).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(select).toHaveValue("product");
  await expect(trigger).toBeFocused();
  await expect(page.locator("#notifications-heading")).toHaveText("Produkt");
  await page.keyboard.press("Home");
  await expect(panel.locator('[data-option-value="unread"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(select).toHaveValue("unread");
  await expect(page.locator("#notifications-heading")).toHaveText("Alle Benachrichtigungen");
  await trigger.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
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
