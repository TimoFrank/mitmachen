import { expect, test } from "@playwright/test";

const AUTH_KEY = "versorgungs-kompass-auth-v1";
function authSession() {
  return {
    authenticated: true,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  };
}

async function gotoAuthenticated(page, path, { role = "admin", dataMode = "demo", contactsScript = "", expertsScript = "", demoDataScript = "", dataServiceScript = "" } = {}) {
  await page.route("**/login/auth-guard.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        window.VKAuth = {
          config: window.VK_AUTH_CONFIG || {},
          getStoredSession: () => ({ authenticated: true, expiresAt: Date.now() + 2592000000 }),
          isAuthenticated: () => true,
          setAuthenticated: () => ({ authenticated: true, expiresAt: Date.now() + 2592000000 }),
          clearAuthenticated: () => {},
          buildLoginUrl: () => "../login/login.html",
          getDefaultUrl: () => "../app/versorgungs-kompass.html"
        };
      `
    });
  });
  await page.route("**/data/supabase-config.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.VERSORGUNGS_COMPASS_CONFIG = { dataMode: ${JSON.stringify(dataMode)}, demoRole: ${JSON.stringify(role)} };`
    });
  });
  if (contactsScript) {
    await page.route("**/data/versorgungs-kompass-data.js", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: contactsScript
      });
    });
  }
  if (expertsScript) {
    await page.route("**/data/expertenkreis-data.js", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: expertsScript
      });
    });
  }
  if (demoDataScript) {
    await page.route("**/data/demo-data.js", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: demoDataScript
      });
    });
  }
  if (dataServiceScript) {
    await page.route("**/data/data-service.js", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: dataServiceScript
      });
    });
  }
  await page.goto("/");
  await page.evaluate(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: AUTH_KEY, session: authSession() }
  );
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/login\/login\.html/);
}

async function expectTourPanelInteractive(page) {
  await expect(page.locator("#product-tour-panel")).toBeVisible();
  const panelReceivesPointer = await page.locator("#product-tour-panel").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
    const topElement = document.elementFromPoint(x, y);
    return Boolean(topElement && (topElement === panel || panel.contains(topElement)));
  });
  expect(panelReceivesPointer).toBe(true);
}

function onboardingDataServiceScript({ createdAt = "2026-06-09T08:30:00.000Z", completed = false } = {}) {
  return `
    (() => {
      let profile = {
        id: "11111111-1111-4111-8111-111111111111",
        email: "steffen@example.test",
        display_name: "steffen",
        initials: "ST",
        role: "viewer",
        active: true,
        avatar_url: "",
        team: "",
        bio: "",
        created_at: ${JSON.stringify(createdAt)},
        updated_at: ${JSON.stringify(createdAt)}
      };
      let settings = ${completed ? `{
        userId: profile.id,
        defaultViewType: "contacts",
        tableDensity: "comfortable",
        theme: "system",
        fontScale: 1,
        pageSize: 20,
        preferences: {
          onboarding: {
            version: 1,
            profileCompletedAt: "2026-06-09T09:00:00.000Z",
            tourOfferedAt: "2026-06-09T09:00:05.000Z",
            tourSkippedAt: "2026-06-09T09:01:00.000Z"
          }
        }
      }` : `null`};
      const contacts = [
        {
          id: "contact-anna",
          name: "Anna Versorgung",
          organization: "Praxis Mitte",
          category: "Praxis",
          sector: "Praxis",
          specialty: "Allgemeinmedizin",
          city: "Berlin",
          state: "Berlin",
          priority: "Mittel",
          ownerId: profile.id,
          status: "active",
          updatedAt: "2026-06-09T09:00:00.000Z"
        }
      ];
      window.dataService = {
        isConfigured: () => true,
        getClient: () => ({ auth: { signOut: async () => ({}) } }),
        getProfiles: async () => [profile],
        getCurrentProfile: async () => profile,
        updateCurrentProfile: async (patch = {}) => {
          profile = {
            ...profile,
            display_name: patch.displayName ?? patch.display_name ?? profile.display_name,
            initials: patch.initials ?? profile.initials,
            team: patch.team ?? profile.team,
            avatar_url: patch.avatarUrl ?? patch.avatar_url ?? profile.avatar_url,
            updated_at: new Date().toISOString()
          };
          return profile;
        },
        uploadCurrentProfileImage: async () => {
          profile = { ...profile, avatar_url: "https://example.test/avatar.jpg" };
          return profile.avatar_url;
        },
        removeCurrentProfileImage: async () => {
          profile = { ...profile, avatar_url: "" };
          return profile;
        },
        loadContacts: async () => contacts,
        getContacts: async () => contacts,
        getContact: async (id) => contacts.find((contact) => contact.id === id),
        loadOrganizations: async () => [],
        getOrganization: async () => null,
        loadExpertGroups: async () => [],
        loadExpertContacts: async () => [],
        loadExpertOrganizations: async () => [],
        loadExpertEntityLinks: async () => [],
        loadFormats: async () => [],
        getSavedViews: async () => [],
        getUserSettings: async () => settings,
        upsertUserSettings: async (next = {}) => {
          settings = {
            userId: profile.id,
            defaultViewType: next.defaultViewType || "contacts",
            tableDensity: next.tableDensity || "comfortable",
            theme: next.theme || "system",
            fontScale: next.fontScale || 1,
            pageSize: next.pageSize || 20,
            preferences: next.preferences || {},
            updatedAt: new Date().toISOString()
          };
          window.__vkSettings = settings;
          return settings;
        },
        getDashboardStats: async () => ({ total: contacts.length, bySector: { Praxis: 1 }, byState: { Berlin: 1 }, byPriority: { Mittel: 1 } }),
        getMapData: async () => [],
        getContactChanges: async () => []
      };
    })();
  `;
}

async function attachScreenshot(page, testInfo, name, options = {}) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: options.fullPage ?? true
  });
}

function activitiesDemoDataScript() {
  return `
    (() => {
      const now = new Date("2026-06-09T10:00:00.000Z");
      const profiles = [
        { id: "11111111-1111-4111-8111-111111111111", email: "demo.admin@example.test", display_name: "Demo Admin", initials: "DA", role: "admin", active: true, avatar_url: "", team: "Versorgung", created_at: now.toISOString(), updated_at: now.toISOString() },
        { id: "22222222-2222-4222-8222-222222222222", email: "demo.editor@example.test", display_name: "Demo Editor", initials: "DE", role: "editor", active: true, avatar_url: "", team: "Kontaktpflege", created_at: now.toISOString(), updated_at: now.toISOString() }
      ];
      const contacts = Array.from({ length: 36 }, (_, index) => {
        const n = index + 1;
        const ownerIds = n % 6 === 0
          ? [profiles[index % profiles.length].id, profiles[(index + 1) % profiles.length].id]
          : [profiles[index % profiles.length].id];
        return {
          id: "activity-contact-" + String(n).padStart(2, "0"),
          name: "Aktivitätskontakt " + n,
          organization: n % 2 ? "MVZ Aktiv Nord" : "Pflegeverbund Aktiv Süd",
          category: n % 2 ? "Praxis" : "Pflege",
          specialty: n % 3 ? "Allgemeinmedizin" : "Geriatrie",
          contactRole: "Ansprechperson",
          priority: n % 2 ? "Hoch" : "Mittel",
          ownerId: ownerIds[0],
          ownerIds,
          owner: ownerIds.map((ownerId) => profiles.find((item) => item.id === ownerId)?.display_name || "").filter(Boolean).join(", "),
          postalCode: "10115",
          city: n % 2 ? "Berlin" : "Potsdam",
          state: n % 2 ? "Berlin" : "Brandenburg",
          email: "aktivitaet-" + n + "@example.test",
          phone: "+49 000 1000" + n,
          themes: ["Versorgung", "Audit"],
          note: "Fiktiver Kontakt für Aktivitäten-Smoke.",
          sources: ["Smoke-Test"],
          status: "active",
          createdAt: new Date(now.getTime() - n * 86400000).toISOString(),
          updatedAt: new Date(now.getTime() - n * 600000).toISOString()
        };
      });
      const changes = contacts.map((contact, index) => {
        const n = index + 1;
        const kind = n % 9 === 0 ? "archive" : n % 7 === 0 ? "import" : n % 5 === 0 ? "create" : "update";
        const fieldName = kind === "create" || kind === "import" ? "" : n % 4 === 0 ? "owner_ids" : "priority";
        const oldOwnerIds = [profiles[(index + 1) % profiles.length].id];
        return {
          id: n,
          contactId: contact.id,
          contact_id: contact.id,
          action: kind,
          fieldName,
          field_name: fieldName,
          oldValue: fieldName === "owner_ids" ? JSON.stringify(oldOwnerIds) : fieldName === "priority" ? "Mittel" : "",
          old_value: fieldName === "owner_ids" ? JSON.stringify(oldOwnerIds) : fieldName === "priority" ? "Mittel" : "",
          newValue: fieldName === "owner_ids" ? JSON.stringify(contact.ownerIds) : fieldName === "priority" ? contact.priority : contact.name,
          new_value: fieldName === "owner_ids" ? JSON.stringify(contact.ownerIds) : fieldName === "priority" ? contact.priority : contact.name,
          changedAt: new Date(now.getTime() - index * 300000).toISOString(),
          changed_at: new Date(now.getTime() - index * 300000).toISOString(),
          changedBy: profiles[index % profiles.length].id,
          changed_by: profiles[index % profiles.length].id
        };
      });
      window.VERSORGUNGS_COMPASS_DEMO_DATA = {
        profiles,
        contacts,
        organizations: [],
        changes,
        savedViews: [],
        userSettings: { defaultViewType: "contacts", pageSize: 20, tableDensity: "comfortable", theme: "system", fontScale: 1, preferences: {} },
        formats: []
      };
    })();
  `;
}

async function expectPageSizeDropdownUsable(page, shellSelector, nextValue = "50 pro Seite") {
  const shell = page.locator(shellSelector);
  await expect(shell).toBeVisible();
  const trigger = shell.locator(".custom-select-trigger");
  const label = trigger.locator(".custom-select-trigger__label");
  await expect(label).toHaveText("20 pro Seite");
  const labelMetrics = await label.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(labelMetrics.scrollWidth).toBeLessThanOrEqual(labelMetrics.clientWidth + 1);

  await trigger.click();
  await expect(shell).toHaveClass(/is-open/);
  const panel = shell.locator(".custom-select-panel--compact");
  await expect(panel).toBeVisible();
  const panelMetrics = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });
  expect(panelMetrics.left).toBeGreaterThanOrEqual(0);
  expect(panelMetrics.right).toBeLessThanOrEqual(panelMetrics.viewportWidth + 1);
  expect(panelMetrics.bottom).toBeLessThanOrEqual(panelMetrics.viewportHeight + 1);
  expect(panelMetrics.height).toBeGreaterThan(120);

  await shell.locator(".custom-select-option", { hasText: nextValue }).click();
  await expect(label).toHaveText(nextValue);
}

test("Kontakte: Liste und Filtertoolbar rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator("#filter-panel-button")).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator(".sidebar-section-label").filter({ hasText: "Versorgung" })).toHaveCount(1);
  await expect(page.locator(".sidebar-section-label").filter({ hasText: "IOP" })).toHaveCount(1);
  await expect(page.locator('[data-view-tab="experts"]')).toContainText("Expertenkreis");
  await expect(page.locator("#contact-matching-worklist-button")).toContainText("Dubletten");
  if (!testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#contact-list .owner-badge-group").first()).toBeVisible();
  }

  await attachScreenshot(page, testInfo, "kontakte");
});

test("Onboarding: neuer Supabase-Account richtet Profil ein und startet Tour", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#map", {
    dataMode: "supabase",
    dataServiceScript: onboardingDataServiceScript()
  });

  await expect(page.locator('[data-view-panel="onboarding"]')).toBeVisible();
  await expect(page.locator("#workspace-view-title")).toHaveText("Willkommen");
  await expect(page.locator("#onboarding-display-name")).toHaveValue("steffen");
  await page.locator("#onboarding-profile-submit").click();
  await expect(page.locator("#onboarding-status")).toContainText("Team");

  await page.locator("#onboarding-team").selectOption("Produktmanagement");
  await page.locator("#onboarding-profile-submit").click();
  await expect(page.locator("#onboarding-tour-panel")).toBeVisible();

  await page.locator("#onboarding-tour-start").click();
  await expect(page.locator("#product-tour")).toBeVisible();
  await expect(page.locator("#product-tour-meta")).toHaveText(/Schritt 1 von \d+/);
  const onboardingTourStepCount = await page.locator("#product-tour-meta").textContent()
    .then((text) => text?.match(/von (\d+)/)?.[1] || "");
  await expect(page.locator(".product-tour-highlight")).toHaveCount(1);
  await page.locator("#product-tour-next").click();
  await expect(page.locator("#product-tour-meta")).toHaveText(`Schritt 2 von ${onboardingTourStepCount}`);
  await page.locator("#product-tour-prev").click();
  await expect(page.locator("#product-tour-meta")).toHaveText(`Schritt 1 von ${onboardingTourStepCount}`);
  await page.keyboard.press("Escape");

  await expect(page.locator("#product-tour")).toBeHidden();
  await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
  const settings = await page.evaluate(() => window.__vkSettings);
  expect(settings.preferences.onboarding.profileCompletedAt).toBeTruthy();
  expect(settings.preferences.onboarding.tourSkippedAt).toBeTruthy();

  await attachScreenshot(page, testInfo, "onboarding");
});

test("Onboarding: abgeschlossener neuer Account landet direkt in Kontakte", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", {
    dataMode: "supabase",
    dataServiceScript: onboardingDataServiceScript({ completed: true })
  });

  await expect(page.locator('[data-view-panel="onboarding"]')).toBeHidden();
  await expect(page.locator("#contact-list")).toBeVisible();
});

test("Organisationen: Demo-Daten rendern im CRM-Profilmodus", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#organizations");

  await expect(page.locator('[data-view-panel="organizations"]')).toBeVisible();
  await expect(page.locator("#organization-list .row, #organization-list .mobile-contact-card").first()).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator("#organization-matching-worklist-button")).toContainText("Dubletten");

  await attachScreenshot(page, testInfo, "organisationen");
});

test("Aktivitäten: globaler Kontaktverlauf rendert mit Filtern und Paging", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#activities", {
    demoDataScript: activitiesDemoDataScript()
  });

  await expect(page.locator('[data-view-panel="activities"]')).toBeVisible();
  await expect(page.locator('[data-view-tab="activities"]')).toHaveClass(/is-active/);
  await expect(page.locator("#search")).toHaveAttribute("placeholder", /Aktivitäten nach Kontakt/);
  await expect(page.locator("#activities-list .activity-item")).toHaveCount(30);
  await expect(page.locator("#activities-load-more-row")).toBeVisible();

  await page.locator("#activities-load-more").click();
  await expect(page.locator("#activities-list .activity-item")).toHaveCount(36);

  await page.selectOption("#activity-kind-filter", "owner");
  await expect(page.locator("#activities-list .activity-item").first()).toBeVisible();
  await expect(page.locator(".history-action-pill--owner").first()).toBeVisible();
  await page.locator(".history-details summary").first().click();
  await expect(page.locator(".history-change").first()).toBeVisible();

  await page.locator(".activity-contact-button").first().click();
  await expect(page.locator("#detail-overview")).toBeVisible();

  await attachScreenshot(page, testInfo, "aktivitaeten");
});

test("Expertenkreis: getrennte Kontakt- und Organisationsansicht rendert", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#experts");

  await expect(page.locator('[data-view-panel="experts"]')).toBeVisible();
  await expect(page.locator('[data-view-tab="experts"]')).toHaveClass(/is-active/);
  await expect(page.locator("#workspace-view-title")).toHaveText("Expertenkreis");
  await expect(page.locator("#workspace-view-title")).not.toBeVisible();
  await expect(page.locator('[data-filter-field="category"] summary')).toHaveText("Gruppe");
  await expect(page.locator("#new-expert-contact-button")).toBeVisible();
  await expect(page.locator("#new-expert-organization-button")).toBeHidden();
  await expect(page.locator("#expert-duplicates-button")).toBeVisible();
  await expect(page.locator(".workspace-header #expert-mode-actions")).toBeVisible();
  await expect(page.locator(".workspace-header #search")).toBeVisible();
  await expect(page.locator(".controls")).not.toBeVisible();
  await expect(page.locator(".controls #search")).toHaveCount(0);
  await expect(page.locator(".workspace-header #expert-mode-actions .experts-mode-count")).toHaveCount(2);
  await expect(page.locator(".workspace-header #summary-grid")).not.toBeVisible();
  await expect(page.locator(".table-command-row--expert-tabs")).toHaveCount(0);
  await expect(page.locator("#expert-mode-actions [data-expert-mode]")).toHaveCount(2);
  await expect(page.locator('#expert-mode-actions [data-expert-mode="contacts"] .experts-mode-label')).toHaveText("Kontakte");
  await expect(page.locator('#expert-mode-actions [data-expert-mode="contacts"] .experts-mode-count')).toHaveText(/\d+/);
  await expect(page.locator('#expert-mode-actions [data-expert-mode="organizations"] .experts-mode-label')).toHaveText("Organisationen");
  await expect(page.locator('#expert-mode-actions [data-expert-mode="organizations"] .experts-mode-count')).toHaveText(/\d+/);
  await expect(page.locator('#expert-mode-actions [data-expert-mode="matching"]')).toHaveCount(0);
  await expect(page.locator("[data-expert-match-direction]")).toHaveCount(0);
  await expect(page.locator('[data-expert-table="duplicates"]')).toBeHidden();
  await expect(page.locator("#expert-list .row, #expert-list .mobile-contact-card").first()).toBeVisible();
  await expect(page.locator("#experts-pagination-meta")).toContainText("Kontakten");
  await expectPageSizeDropdownUsable(page, "#view-experts .page-size-shell");
  await expect(page.locator("#experts-pagination-meta")).toContainText("1-50 von");
  await expect(page.locator("#view-select-button")).toBeHidden();
  if (testInfo.project.name === "chromium-desktop") {
    const firstExpertCheckbox = page.locator("#expert-list [data-expert-row-select]").first();
    await firstExpertCheckbox.check();
    await expect(page.locator("#expert-bulk-toolbar")).toBeVisible();
    await expect(page.locator("#expert-bulk-selection-count")).toHaveText("1 Kontakt ausgewählt");
    await page.locator("#expert-bulk-clear-selection").click();
    await expect(page.locator("#expert-bulk-toolbar")).toBeHidden();

    await page.locator('[aria-controls="header-filter-experts-category"]').click();
    const groupFilterMenu = page.locator("#header-filter-experts-category");
    await expect(groupFilterMenu).toBeVisible();
    const longGroupOption = groupFilterMenu.locator(".filter-option", { hasText: "Wissenschaftliche Einrichtung" });
    await expect(longGroupOption).toBeVisible();
    await expect(longGroupOption).toHaveCSS("white-space", "normal");
    const longGroupMetrics = await longGroupOption.locator("span").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(longGroupMetrics.scrollWidth).toBeLessThanOrEqual(longGroupMetrics.clientWidth + 2);
    await page.locator("body").click({ position: { x: 4, y: 4 } });
  }
  await page.locator("#expert-list .row, #expert-list .mobile-contact-card").first().click();
  await expect(page.locator("#detail-overview")).toBeVisible();
  await expect(page.locator("#expert-detail-overview")).toHaveCount(0);
  await expect(page.locator(".detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await page.locator("#detail-close").click();

  await page.locator('#expert-mode-actions [data-expert-mode="organizations"]').click();
  await expect(page.locator("#expert-organization-list .row").first()).toBeVisible();
  await expect(page.locator("#experts-pagination-meta")).toContainText("Organisationen");
  await expect(page.locator('[data-expert-table="duplicates"]')).toBeHidden();
  await expect(page.locator("#new-expert-contact-button")).toBeHidden();
  await expect(page.locator("#new-expert-organization-button")).toBeVisible();
  await page.locator("#expert-organization-list .row").first().click();
  await expect(page.locator(".detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await page.locator("#detail-close").click();

  await attachScreenshot(page, testInfo, "expertenkreis");
});

test("Expertenkreis: Kontakt und Organisation werden getrennt angelegt", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#experts", {
    dataMode: "local",
    contactsScript: `window.VERSORGUNGS_COMPASS_CONTACTS = [];`,
    expertsScript: `window.VERSORGUNGS_COMPASS_EXPERT_GROUPS = [
      { id: "expert-group-anwender", name: "Anwender informationstechnischer Systeme", sortOrder: 10 },
      { id: "expert-group-wissenschaft", name: "Wissenschaftliche Einrichtung und Patientenorganisation", sortOrder: 20 }
    ];
    window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS = [];
    window.VERSORGUNGS_COMPASS_EXPERT_ORGANIZATIONS = [];`
  });

  await page.locator("#new-expert-contact-button").click();
  await expect(page.locator("#editor-drawer.is-open")).toBeVisible();
  await expect(page.locator('label[for="field-category"]')).toContainText("Gruppe");
  await expect(page.locator('label[for="field-specialty"]')).toHaveText("Fachbereich / Fokus");
  await expect(page.locator("#field-owner").locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' editor-field ')][1]")).toBeHidden();
  await page.locator("#field-name").fill("Tessa Interop");
  await page.locator("#field-organization").fill("Interop Allianz Test");
  await page.locator("#editor-save").click();

  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator(".detail-profile h3")).toContainText("Tessa Interop");
  await expect(page.locator(".detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await expect(page.locator('#expert-mode-actions [data-expert-mode="contacts"] .experts-mode-count')).toHaveText("1");
  await expect(page.locator("#new-expert-contact-button")).toBeVisible();
  await expect(page.locator("#new-expert-organization-button")).toBeHidden();
  await page.locator("#detail-close").click();

  await page.locator('#expert-mode-actions [data-expert-mode="organizations"]').click();
  await expect(page.locator('#expert-mode-actions [data-expert-mode="organizations"] .experts-mode-count')).toHaveText("1");
  await expect(page.locator("#new-expert-contact-button")).toBeHidden();
  await expect(page.locator("#new-expert-organization-button")).toBeVisible();
  await page.locator("#new-expert-organization-button").click();
  await expect(page.locator("#organization-editor-drawer.is-open")).toBeVisible();
  await expect(page.locator('label[for="organization-field-sector"]')).toContainText("Gruppe");
  await page.locator("#organization-field-name").fill("FHIR Forum Test");
  await page.locator("#organization-editor-save").click();

  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator(".detail-profile h3")).toContainText("FHIR Forum Test");
  await expect(page.locator(".detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await expect(page.locator('#expert-mode-actions [data-expert-mode="organizations"] .experts-mode-count')).toHaveText("2");

  await attachScreenshot(page, testInfo, "expertenkreis-anlage");
});

test("Dubletten: Admin-Ansichten bleiben im jeweiligen Tab", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", {
    dataMode: "local",
    contactsScript: `window.VERSORGUNGS_COMPASS_CONTACTS = [
      { id: "contact-peter", name: "Peter Gocke", organizationId: "11111111-1111-4111-8111-111111111111", organization: "Charite", sector: "Krankenhaus", category: "Krankenhaus", city: "Berlin", state: "Berlin", status: "active" },
      { id: "contact-florian", name: "Florian Rau", organization: "Praxis im Zentrum Harsefeld", sector: "Praxis", category: "Praxis", status: "active" }
    ];`,
    expertsScript: `window.VERSORGUNGS_COMPASS_EXPERT_GROUPS = [
      { id: "expert-group-wissenschaft", name: "Wissenschaftliche Einrichtung und Patientenorganisation", sortOrder: 10 }
    ];
    window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS = [
      { id: "expert-peter", name: "Dr. Peter Gocke", groupId: "expert-group-wissenschaft", group: "Wissenschaftliche Einrichtung und Patientenorganisation", category: "Wissenschaftliche Einrichtung und Patientenorganisation", organizationId: "expert-org-charite", organization: "Charite", status: "active" },
      { id: "expert-florian", name: "Florian Rau", groupId: "expert-group-wissenschaft", group: "Wissenschaftliche Einrichtung und Patientenorganisation", category: "Wissenschaftliche Einrichtung und Patientenorganisation", organizationId: "expert-org-selbst", organization: "selbststaendig", status: "active" }
    ];
    window.VERSORGUNGS_COMPASS_EXPERT_ORGANIZATIONS = [
      { id: "expert-org-charite", name: "Charite", groupId: "expert-group-wissenschaft", group: "Wissenschaftliche Einrichtung und Patientenorganisation", category: "Wissenschaftliche Einrichtung und Patientenorganisation", organizationType: "Universitaetsmedizin", status: "active" }
    ];`
  });

  await expect(page.locator("#contact-matching-worklist-button")).toContainText("Dubletten (2)");
  await page.locator("#contact-matching-worklist-button").click();

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "contacts");
  await expect(page.locator("#contact-duplicates-workspace")).toBeVisible();
  await expect(page.locator("#contact-list")).toBeHidden();
  await expect(page.locator("#contact-duplicates-meta")).toContainText("2 von 2");
  await expect(page.locator("#contact-duplicates-list .row, #contact-duplicates-list .expert-match-mobile-card")).toHaveCount(2);
  await expect(page.locator("#contact-duplicates-list [data-confirm-expert-link]")).toHaveCount(2);
  await expect(page.locator("#contact-duplicates-workspace .expert-matching-scope")).toHaveCount(0);
  await expect(page.locator("#contact-duplicates-list .expert-match-meta-line")).toHaveCount(0);
  await expect(page.locator("#contact-duplicates-list .expert-match-type")).toHaveCount(0);
  await expect(page.locator("[data-expert-match-direction]")).toHaveCount(0);

  await attachScreenshot(page, testInfo, "kontakte-dubletten");

  await page.locator('[data-view-tab="organizations"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "organizations");
  await expect(page.locator("#organization-matching-worklist-button")).toContainText("Dubletten (1)");
  await page.locator("#organization-matching-worklist-button").click();
  await expect(page.locator("#organization-duplicates-workspace")).toBeVisible();
  await expect(page.locator("#organization-list")).toBeHidden();
  await expect(page.locator("#organization-duplicates-meta")).toContainText("1 von 1");
  await expect(page.locator("#organization-duplicates-list .row, #organization-duplicates-list .expert-match-mobile-card")).toHaveCount(1);
  await expect(page.locator("#organization-duplicates-workspace .expert-matching-scope")).toHaveCount(0);
  await expect(page.locator("#organization-duplicates-list .expert-match-meta-line")).toHaveCount(0);
  await expect(page.locator("#organization-duplicates-list .expert-match-type")).toHaveCount(0);

  await attachScreenshot(page, testInfo, "organisationen-dubletten");

  await page.locator('[data-view-tab="experts"]').click();
  await expect(page.locator('[data-expert-table="duplicates"]')).toBeHidden();
  await expect(page.locator("#expert-duplicates-button")).toContainText("Dubletten (2)");
  await page.locator("#expert-duplicates-button").click();

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "experts");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-expert-mode", "duplicates");
  await expect(page.locator('[data-expert-table="duplicates"]')).toBeVisible();
  await expect(page.locator("#expert-matching-meta")).toContainText("2 von 2");
  await expect(page.locator("#expert-matching-list .row, #expert-matching-list .expert-match-mobile-card")).toHaveCount(2);
  await expect(page.locator("#expert-matching-list [data-confirm-expert-link]")).toHaveCount(2);
  await expect(page.locator('[data-expert-table="duplicates"] .expert-matching-scope')).toHaveCount(0);
  await expect(page.locator("#expert-matching-list .expert-match-meta-line")).toHaveCount(0);
  await expect(page.locator("#expert-matching-list .expert-match-type")).toHaveCount(0);
  await expect(page.locator("#new-expert-contact-button")).toBeVisible();
  await expect(page.locator("#new-expert-organization-button")).toBeHidden();
  await expect(page.locator("#expert-duplicates-button")).toHaveClass(/is-active/);

  await attachScreenshot(page, testInfo, "expertenkreis-dubletten");

  await page.locator('#expert-mode-actions [data-expert-mode="organizations"]').click();
  await expect(page.locator('[data-expert-table="duplicates"]')).toBeHidden();
  await expect(page.locator("#expert-organization-list .row").first()).toBeVisible();
  await expect(page.locator("#expert-duplicates-button")).not.toHaveClass(/is-active/);
  await expect(page.locator("#expert-duplicates-button")).toContainText("Dubletten (1)");
  await expect(page.locator("#new-expert-contact-button")).toBeHidden();
  await expect(page.locator("#new-expert-organization-button")).toBeVisible();
  await page.locator("#expert-duplicates-button").click();
  await expect(page.locator('[data-expert-table="duplicates"]')).toBeVisible();
  await expect(page.locator("#expert-matching-meta")).toContainText("1 von 1");
  await expect(page.locator("#expert-matching-list .row, #expert-matching-list .expert-match-mobile-card")).toHaveCount(1);
  await expect(page.locator("#new-expert-contact-button")).toBeHidden();
  await expect(page.locator("#new-expert-organization-button")).toBeVisible();
});

test("Kontaktprofil: Detailpanel oeffnet im Lesemodus", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  const firstContact = page.locator("#contact-list .row, #contact-list .mobile-contact-card").first();
  await expect(firstContact).toBeVisible();
  await firstContact.click();

  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator(".detail-profile")).toBeVisible();
  await expect(page.locator(".detail-tabs")).toBeVisible();
  await expect(page.locator("#detail-drawer .owner-badge-group, #detail-drawer [data-detail-owner-picker]").first()).toBeVisible();

  await attachScreenshot(page, testInfo, "kontaktprofil");
});

test("Detaildrawer schliesst beim Wechsel zwischen Hauptbereichen", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  await page.locator("#contact-list .row, #contact-list .mobile-contact-card").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await page.locator('[data-view-tab="organizations"]:visible').first().click();
  await expect(page.locator("#detail-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);

  await attachScreenshot(page, testInfo, "drawer-wechsel-organisationen", { fullPage: false });

  await expect(page.locator("#organization-list .row, #organization-list .mobile-contact-card").first()).toBeVisible();
  await page.locator("#organization-list .row, #organization-list .mobile-contact-card").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await page.locator('[data-view-tab="contacts"]:visible').first().click();
  await expect(page.locator("#detail-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);

  await attachScreenshot(page, testInfo, "drawer-wechsel-kontakte", { fullPage: false });
});

test("Kontaktprofil: Notizen als Chat pflegen", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  await page.locator("#contact-list .row, #contact-list .mobile-contact-card").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await page.locator(".detail-tab").filter({ hasText: "Notizen" }).click();
  await expect(page.locator("#contact-notes-composer")).toBeVisible();

  await page.locator("#contact-notes-message").fill("Testnotiz aus dem Kontakt-Visualtest");
  await page.locator("#contact-notes-composer").getByRole("button", { name: "Notiz senden" }).click();
  await expect(page.locator("#detail-notes .format-chat-message").filter({ hasText: "Testnotiz aus dem Kontakt-Visualtest" })).toBeVisible();
  await expect(page.locator("#detail-notes .format-chat-meta time").last()).toBeVisible();

  await attachScreenshot(page, testInfo, "kontaktprofil-notizen-chat", { fullPage: false });

  await page.locator("[data-edit-contact-note]").last().click();
  await page.locator("[data-contact-note-edit-form] textarea").fill("Bearbeitete Testnotiz aus dem Kontakt-Visualtest");
  await page.locator("[data-contact-note-edit-form]").getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("#detail-notes .format-chat-message").filter({ hasText: "Bearbeitete Testnotiz aus dem Kontakt-Visualtest" })).toBeVisible();
  await expect(page.locator("#detail-notes .format-chat-message").filter({ hasText: "bearbeitet" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-delete-contact-note]").last().click();
  await expect(page.locator("#detail-notes .format-chat-message").filter({ hasText: "Bearbeitete Testnotiz aus dem Kontakt-Visualtest" })).toHaveCount(0);
});

test("Kontaktprofil: Viewer lesen Notizen-Chat ohne Composer", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role: "viewer" });

  await page.locator("#contact-list .row, #contact-list .mobile-contact-card").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await page.locator(".detail-tab").filter({ hasText: "Notizen" }).click();

  await expect(page.locator("#detail-notes .format-chat-message").first()).toBeVisible();
  await expect(page.locator("#detail-notes .format-chat-message").first()).toContainText("Bisherige Notiz");
  await expect(page.locator("#contact-notes-composer")).toHaveCount(0);
  await expect(page.locator("#detail-notes .detail-permission-note")).toBeVisible();
});

test("Karte: Kartenansicht und Controls rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/map/versorgungs-kompass-map.html");

  await expect(page.locator("#map")).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#map-menu-toggle")).toBeVisible();
  } else {
    await expect(page.locator(".map-controls")).toBeVisible();
  }
  await expect(page.locator(".panel")).toBeVisible();

  await attachScreenshot(page, testInfo, "karte");
});

test("Rollen: Viewer sieht Admin-Bereiche nicht", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role: "viewer" });

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator("#sidebar-import-button")).toBeHidden();
  await expect(page.locator('[data-sidebar-section="import"]')).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".sidebar-section-label").filter({ hasText: "Import" })).toBeHidden();
  await expect(page.locator('[data-sidebar-section="analysis"]')).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#archive-view-button")).toBeHidden();

  await attachScreenshot(page, testInfo, "viewer-rolle");
});

test("Rollen: Admin sieht Import und Archiv", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role: "admin" });

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator('[data-sidebar-section="import"]')).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#sidebar-import-button")).toBeVisible();
  await expect(page.locator("#archive-view-button")).toHaveAttribute("aria-hidden", "false");
  if (!testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#archive-view-button")).toBeVisible();
  }

  await attachScreenshot(page, testInfo, "admin-rolle");
});

test("Sidebar: Team und Profil bleiben bei kurzer Höhe erreichbar", async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name.includes("mobile")
    ? { width: 390, height: 460 }
    : { width: 1440, height: 460 });
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role: "admin" });

  const sidebar = page.locator(".app-sidebar");
  await expect(sidebar).toBeVisible();

  const scrollMetrics = await sidebar.evaluate((element) => {
    element.scrollTop = 0;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    element.scrollTop = scrollHeight;
    return {
      clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight,
      scrollTop: element.scrollTop
    };
  });
  expect(scrollMetrics.overflowY).toMatch(/auto|scroll/);
  if (!testInfo.project.name.includes("mobile")) {
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    expect(scrollMetrics.scrollTop).toBeGreaterThan(0);
  }

  await expect(page.locator("#sidebar-profile-button")).toBeInViewport();
  await page.locator("#sidebar-profile-button").click();
  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();

  await sidebar.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.locator("#sidebar-team-button").click();
  await expect(page.locator('[data-view-panel="team"]')).toBeVisible();

  await attachScreenshot(page, testInfo, "sidebar-scroll");
});

test("Mein Profil: Einstellungen sind als Profil-Reiter erreichbar", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#profile-settings", { role: "admin" });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator("#sidebar-settings-button")).toHaveCount(0);
  await expect(page.locator("#sidebar-about-button")).toHaveCount(0);
  await expect(page.locator('[data-profile-tab="settings"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-tab-settings")).toBeVisible();
  await expect(page.locator("#profile-tab-settings .settings-wip-note")).toBeVisible();

  await attachScreenshot(page, testInfo, "profil-einstellungen");
});

test("Mein Profil: Über die App ist als Profil-Reiter erreichbar", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#profile-about", { role: "admin" });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator('[data-profile-tab="about"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-tab-about")).toBeVisible();
  await expect(page.locator("#about-version-list .about-version").first()).toBeVisible();

  await attachScreenshot(page, testInfo, "profil-about");
});

for (const role of ["admin", "editor", "viewer"]) {
  test(`Mein Profil: Onboarding-Tour ist für ${role} startbar`, async ({ page }) => {
    await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role });
    const expectedStepCount = role === "admin" ? 10 : 9;

    await page.locator("#sidebar-profile-button").click();
    await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
    await expect(page.locator("#profile-tab-profile")).toBeVisible();
    await expect(page.locator("#profile-onboarding-status")).toBeVisible();
    await expect(page.locator("#profile-tour-start")).toBeVisible();

    await page.locator("#profile-tour-start").click();
    await expect(page.locator("#product-tour")).toBeVisible();
    await expect(page.locator("#product-tour-meta")).toHaveText(`Schritt 1 von ${expectedStepCount}`);
    await expect(page.locator("#product-tour-title")).toHaveText("Navigation in der Sidebar");
    await expectTourPanelInteractive(page);
    await page.locator("#product-tour-skip").click();
    await expect(page.locator("#product-tour")).toBeHidden();
  });
}

test("Produkttour: Admin-Schritte bleiben sichtbar und bedienbar", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role: "admin" });
  await page.locator("#sidebar-profile-button").click();
  await page.locator("#profile-tour-start").click();

  const expectedTitles = [
    "Navigation in der Sidebar",
    "Kontakte und Schnellaktionen",
    "Suche, Filter und Owner",
    "CRM-Profil im Lesemodus",
    "Organisationen",
    "Karte",
    "Auswertung",
    "Datenqualität",
    "Importe und Online-Erfassung",
    "Team, Importe und eigenes Profil"
  ];

  for (const [index, title] of expectedTitles.entries()) {
    await expect(page.locator("#product-tour-title")).toHaveText(title);
    await expect(page.locator("#product-tour-meta")).toHaveText(`Schritt ${index + 1} von ${expectedTitles.length}`);
    await expectTourPanelInteractive(page);

    if (title === "Karte") await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
    if (title === "Auswertung") await expect(page.locator('[data-view-panel="analytics"]')).toBeVisible();

    await page.locator("#product-tour-next").click();
  }

  await expect(page.locator("#product-tour")).toBeHidden();
  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
});

test("Importe: Registrierungs-Inbox rendert Backend-Eingaenge", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#registrations", { role: "admin" });

  await expect(page.locator('[data-settings-tab="registrations"]')).toHaveText("Registrierungen");
  await expect(page.locator('[data-settings-tab="imports"]')).toHaveText("Dateiimport");
  await expect(page.locator('[data-settings-tab="onlineEntry"]')).toHaveText("Online-Erfassung");
  await expect(page.locator('[data-settings-tab="registrations"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#registrations-section")).toBeVisible();
  await expect(page.locator("#registrations-list .registration-row").first()).toBeVisible();
  await expect(page.locator("#registrations-list [data-registration-preview]").first()).toBeVisible();
  await expect(page.locator("#registrations-reset-demo")).toBeVisible();
  await page.locator("[data-registration-preview]").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator(".detail-panel--registration")).toBeVisible();
  await expect(page.locator('[data-registration-detail-tab="contact"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".detail-section-title", { hasText: "Kontakt" })).toBeVisible();
  await page.locator('[data-registration-detail-tab="notes"]').click();
  await expect(page.locator(".detail-section-title", { hasText: "Notizen" })).toBeVisible();

  await attachScreenshot(page, testInfo, "registrierungen");
});

test("Öffentliche Registrierung landet mit DSGVO-Status im Import", async ({ page }, testInfo) => {
  await page.goto("/mitmachen/versorgungs-netzwerk.html");

  await expect(page.locator("#registration-form")).toBeVisible();
  await page.locator("#email").fill("versorgung@example.test");
  await page.locator("#first_name").fill("Mara");
  await page.locator("#last_name").fill("Beispiel");
  await page.locator("#role").fill("Pflegedienstleitung");
  await page.locator("#organization").fill("Pflegezentrum Beispielstadt");
  await page.locator("#sector").selectOption("Pflegeeinrichtung");
  await page.locator("#postal_code").fill("60311");
  await page.locator("#message").fill("Wir können Einblicke in Aufnahme, Medikationsprozess und digitale Kommunikation geben.");
  await page.locator("#consent_processing").check();
  await page.locator(".submit-button").click();

  await expect(page.locator("#confirmation")).toBeVisible();
  await expect(page.locator("#confirmation")).toContainText("Eingang geprüft");

  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#registrations", { role: "admin" });
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(1);
  await expect(page.locator("#registrations-list")).toContainText("Pflegezentrum Beispielstadt");
  await page.locator("[data-registration-preview]").first().click();
  await expect(page.locator(".detail-panel--registration")).toBeVisible();
  await expect(page.locator(".detail-panel--registration")).toContainText("60311");
  await page.locator('[data-registration-detail-tab="privacy"]').click();
  await expect(page.locator(".detail-section-title", { hasText: "Datenschutz" })).toBeVisible();
  await expect(page.locator(".detail-panel--registration")).toContainText("DSGVO bereit zur Prüfung");
  await expect(page.locator(".detail-panel--registration")).toContainText("Nicht erteilt");

  await attachScreenshot(page, testInfo, "public-registration-import");
});

test("Importe: geöffneter Registrierungs-Reiter aktualisiert neue Demo-Eingaenge", async ({ page, context }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#registrations", { role: "admin" });
  await page.evaluate(() => {
    window.localStorage.setItem("versorgungs-kompass-backend-registrations-v1", JSON.stringify([]));
  });
  await page.locator("#registrations-refresh").click();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(0);

  const formPage = await context.newPage();
  await formPage.goto("/mitmachen/versorgungs-netzwerk.html");
  await formPage.locator("#email").fill("offener-tab@example.test");
  await formPage.locator("#first_name").fill("Nina");
  await formPage.locator("#last_name").fill("Rueckkehr");
  await formPage.locator("#role").fill("Praxismanagerin");
  await formPage.locator("#organization").fill("Hausarztpraxis Rueckkehr");
  await formPage.locator("#sector").selectOption("Praxis");
  await formPage.locator("#postal_code").fill("34117");
  await formPage.locator("#message").fill("Wir koennen Einblicke in Anmeldung, ePA und E-Rezept im hausärztlichen Alltag geben.");
  await formPage.locator("#consent_processing").check();
  await formPage.locator(".submit-button").click();
  await expect(formPage.locator("#confirmation")).toBeVisible();
  await formPage.close();

  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(1);
  await expect(page.locator("#registrations-list")).toContainText("Hausarztpraxis Rueckkehr");
});

test("Importe: Demo-Registrierungen lassen sich zurücksetzen", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#registrations", { role: "admin" });

  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(2);
  await page.locator("[data-registration-preview]").first().click();
  await expect(page.locator(".detail-panel--registration")).toBeVisible();
  const deferRegistrationButton = page.locator('.detail-panel--registration [data-registration-action="defer"]');
  await deferRegistrationButton.scrollIntoViewIfNeeded();
  await deferRegistrationButton.click();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(1);
  await page.locator("#registrations-reset-demo").click();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(2);
});

test("Stakeholder: KVn, Personen und Karte rendern im gemeinsamen Arbeitsbereich", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#stakeholders", { role: "admin" });

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "stakeholders");
  await expect(page.locator('button[data-stakeholder-mode="organizations"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("17 Organisationen");
  await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toBeVisible();
  await expect(page.locator("#stakeholder-header-search #search")).toBeVisible();
  await expect(page.locator("#expert-header-search #search")).toHaveCount(0);

  await page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator("#stakeholder-organization-overview")).toBeVisible();
  await page.locator('[data-detail-tab="people"]').click();
  await expect(page.locator("#stakeholder-organization-people")).toBeVisible();
  await expect(page.locator("#stakeholder-organization-people")).toContainText("VV Demo");
  await page.locator("#detail-close").click();
  await expect(page.locator("#detail-drawer")).toHaveAttribute("aria-hidden", "true");

  await page.locator('button[data-stakeholder-mode="people"]').click();
  await expect(page.locator("#stakeholder-people-table")).toBeVisible();
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("3 Personen");

  await page.locator('button[data-stakeholder-mode="map"]').click();
  await expect(page.locator("#stakeholder-map-panel")).toBeVisible();
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("3 Personen");
  await page.evaluate(() => {
    window.postMessage({ type: "versorgungs-kompass-open-detail", realm: "stakeholders", id: "stakeholder-person-demo-1" }, "*");
  });
  await expect(page.locator("#stakeholder-person-overview")).toBeVisible();
  await expect(page.locator("#stakeholder-person-overview")).toContainText("Vertreterversammlung");

  await attachScreenshot(page, testInfo, "stakeholder-kvn");
});

test("Stakeholder: KVn-Bereich ist nur fuer Admins sichtbar", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#stakeholders", { role: "viewer" });

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "contacts");
  await expect(page.locator('button[data-view-tab="stakeholders"]')).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator('button[data-view-tab="stakeholders"]')).toHaveClass(/is-role-hidden/);
  await expect(page.locator('[data-sidebar-section="stakeholders"]')).toHaveAttribute("aria-hidden", "true");
  await expect(page).toHaveURL(/#contacts$/);
});

test("Auswertung: Analytics-View rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  await page.locator('[data-view-tab="analytics"]:visible').first().click();

  await expect(page.locator('[data-view-panel="analytics"]')).toBeVisible();
  await expect(page.locator(".dashboard-grid")).toBeVisible();

  await attachScreenshot(page, testInfo, "auswertung");
});

test("Formate: Arbeitsbereich und Editor rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#formats");

  await expect(page.locator('[data-view-panel="formats"]')).toBeVisible();
  await expect(page.locator("#new-format-button")).toBeVisible();
  await page.locator("#new-format-button").click();
  await expect(page.locator("#format-editor-drawer.is-open")).toBeVisible();
  await expect(page.locator("#format-editor-form")).toBeVisible();
  await expect(page.locator("#format-editor-steps")).toBeVisible();
  await expect(page.locator("#format-title")).toBeVisible();
  await page.locator("#format-title").fill("Roundtable Testversorgung");
  await page.locator("#format-editor-next").click();
  await expect(page.locator('[data-format-editor-step="planung"]')).toBeVisible();
  await page.locator("#format-editor-next").click();
  await expect(page.locator('[data-format-editor-step="inhalt"]')).toBeVisible();
  await page.locator("#format-editor-form").getByRole("button", { name: "Format anlegen" }).click();
  await expect(page.locator("#format-editor-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#format-editor-drawer")).not.toHaveClass(/is-open/);
  await expect(page.locator("#toggle-format-overview")).toHaveCount(0);
  await expect(page.locator(".format-detail-title")).toContainText("Roundtable Testversorgung");
  await page.locator('[data-format-status-filter="Planung"]').click();
  await expect(page.locator('[data-format-status-filter="Planung"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".format-detail-title")).toContainText("Roundtable Testversorgung");
  await page.locator('[data-format-status-filter="Planung"]').click();
  await expect(page.locator('[data-format-status-filter="Planung"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".format-type-icon")).toBeVisible();
  await expect(page.locator(".format-detail.is-open")).toHaveCount(0);
  await expect(page.locator(".format-overview-hero")).toHaveCount(0);
  await page.locator("[data-toggle-format-detail]").first().click();
  await expect(page.locator(".format-overview-hero")).toBeVisible();
  await expect(page.locator(".format-roundtable-illustration")).toBeVisible();
  await expect(page.locator(".format-detail")).toBeVisible();
  await expect(page.locator('[data-edit-format]')).toHaveCount(0);
  await expect(page.locator('[data-format-tab="notes"]')).toHaveText("Notizen");
  await expect(page.locator('[data-format-tab="settings"]')).toBeVisible();
  await expect(page.locator(".format-list-facts")).toHaveCount(0);
  await expect(page.locator(".format-detail-body")).toBeVisible();
  await page.locator("[data-toggle-format-detail]").first().click();
  await expect(page.locator(".format-detail-body")).toHaveCount(0);
  await page.locator("[data-toggle-format-detail]").first().click();
  await expect(page.locator(".format-detail-body")).toBeVisible();
  await page.locator('[data-format-tab="participants"]').click();
  await page.locator("#open-participant-planner").click();
  await expect(page.locator("#format-participant-drawer.is-open")).toBeVisible();
  await expect(page.locator("#format-participant-steps")).toBeVisible();
  await expect(page.locator("#format-participant-search")).toBeVisible();
  await expect(page.locator("#format-participant-sector")).toBeVisible();
  await expect(page.locator('[data-format-participant-step="filters"]')).toBeVisible();
  await page.locator("#format-participant-next").click();
  await expect(page.locator('[data-format-participant-step="select"]')).toBeVisible();
  await page.locator('[data-planner-contact="demo-contact-01"] input').check();
  await page.locator("#format-participant-add").click();
  await expect(page.locator("#format-participant-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#format-participant-drawer")).not.toHaveClass(/is-open/);
  await page.waitForTimeout(300);
  await expect(page.locator(".participant-card")).toBeVisible();
  await expect(page.locator(".participant-card .avatar-lg")).toBeVisible();
  await expect(page.locator(".participant-card .contact-sector-pill")).toBeVisible();
  await expect(page.locator('[data-format-tab="composition"]')).toHaveCount(0);
  await page.locator('[data-open-format-contact="demo-contact-01"]').first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "formats");
  await page.locator("#detail-close").click();
  await expect(page.locator("#detail-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".format-diversity-board")).toHaveCount(0);
  await page.locator('[data-format-tab="invitationStatus"]').click();
  await expect(page.locator(".invitation-status-board")).toBeVisible();
  await expect(page.locator(".invitation-status-select")).toHaveCount(0);
  await expect(page.locator('[data-invitation-status-drop="Teilgenommen"]')).toHaveCount(0);
  if (testInfo.project.name === "chromium-desktop") {
    await page.locator('[data-invitation-card="demo-contact-01"]').dragTo(page.locator('[data-invitation-status-drop="Zugesagt"]'));
    await expect(page.locator('[data-invitation-status-drop="Zugesagt"] [data-invitation-card="demo-contact-01"]')).toBeVisible();
  }
  await page.locator('[data-format-tab="reporting"]').click();
  await expect(page.locator(".format-diversity-board")).toBeVisible();
  await expect(page.locator(".format-participant-mini-map")).toBeVisible();
  await expect(page.locator(".format-participant-map-marker")).toHaveCount(1);
  await expect(page.locator(".format-participant-map-marker").first()).toHaveAttribute("fill", /#[0-9a-fA-F]{6}/);
  await expect(page.locator(".format-participant-map")).not.toContainText("Personen mit Koordinaten");
  await page.locator('[data-format-tab="notes"]').click();
  await expect(page.locator("#format-notes-composer")).toBeVisible();
  const formatChatMessages = page.locator("#format-detail-panel .format-chat-message");
  await page.locator("#format-notes-message").fill("Testnotiz aus dem Formate-Visualtest");
  await page.locator("#format-notes-composer").getByRole("button", { name: "Notiz senden" }).click();
  await expect(formatChatMessages).toContainText("Testnotiz aus dem Formate-Visualtest");
  await expect(page.locator("#format-detail-panel .format-chat-meta time")).toBeVisible();
  await page.locator("[data-edit-format-note]").first().click();
  await page.locator("[data-format-note-edit-form] textarea").fill("Bearbeitete Testnotiz aus dem Formate-Visualtest");
  await page.locator("[data-format-note-edit-form]").getByRole("button", { name: "Speichern" }).click();
  await expect(formatChatMessages).toContainText("Bearbeitete Testnotiz aus dem Formate-Visualtest");
  await expect(formatChatMessages).toContainText("bearbeitet");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-delete-format-note]").first().click();
  await expect(formatChatMessages).toHaveCount(0);
  await page.locator('[data-format-tab="settings"]').click();
  await expect(page.locator("#export-format-participants")).toBeVisible();
  await expect(page.locator("[data-archive-format]")).toBeVisible();

  await attachScreenshot(page, testInfo, "formate");
});
