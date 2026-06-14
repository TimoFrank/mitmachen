import { expect, test } from "@playwright/test";

const AUTH_KEY = "versorgungs-kompass-auth-v1";
function authSession() {
  return {
    authenticated: true,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  };
}

async function gotoAuthenticated(page, path, { role = "admin", dataMode = "demo", contactsScript = "", expertsScript = "", stakeholderScript = "", demoDataScript = "", dataServiceScript = "", localNotifications = [] } = {}) {
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
  if (stakeholderScript) {
    await page.route("**/data/stakeholder-data.js", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: stakeholderScript
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
    ({ key, session, notifications }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
      window.localStorage.setItem("versorgungs-kompass-notifications-v1", JSON.stringify(notifications));
    },
    { key: AUTH_KEY, session: authSession(), notifications: localNotifications }
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
  await expect(page.locator(".sidebar-section-label").filter({ hasText: "Kontakte" })).toHaveCount(1);
  await expect(page.locator(".sidebar-section-label").filter({ hasText: "Planung" })).toHaveCount(1);
  await expect(page.locator(".sidebar-section-label").filter({ hasText: "Admin" })).toHaveCount(1);
  await expect(page.locator('[data-view-tab="experts"]')).toContainText("Expertenkreis");
  await expect(page.locator("#contact-matching-worklist-button")).toContainText("Dubletten");
  if (!testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#contact-list .owner-avatar-stack").first()).toBeVisible();
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
  if (!(await page.locator("#onboarding-tour-panel").isVisible())) {
    await expect(page.locator("#onboarding-status")).toContainText("Team");
    await page.locator("#onboarding-team").selectOption("Produktmanagement");
    await page.locator("#onboarding-profile-submit").click();
  }
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
  await page.locator("#sidebar-profile-button").click();
  await expect(page.locator("#profile-onboarding-status")).toContainText("Du kannst sie jederzeit erneut starten.");
  const profileOnboardingStatusHtml = await page.locator("#profile-onboarding-status").evaluate((element) => element.innerHTML);
  expect(profileOnboardingStatusHtml).toContain("<br>");
  expect(profileOnboardingStatusHtml).toContain("Du kannst sie jederzeit erneut starten.");
});

test("Organisationen: Demo-Daten rendern im CRM-Profilmodus", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#organizations");

  const isMobile = testInfo.project.name.includes("mobile");
  await expect(page.locator('[data-view-panel="organizations"]')).toBeVisible();
  const firstOrganization = page.locator("#organization-list .row, #organization-list .mobile-contact-card").first();
  await expect(firstOrganization).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator("#organization-matching-worklist-button")).toContainText("Dubletten");
  await firstOrganization.click();

  if (isMobile) {
    await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  } else {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-profile")).toBeVisible();
    await expect(page.locator("#detail-drawer [data-open-organization-profile]")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeHidden();
    await page.locator("#detail-drawer [data-open-organization-profile]").click();
  }

  const profile = page.locator("#organization-profile-body");
  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/care\//);
  await expect(profile.locator(".detail-profile")).toBeVisible();
  await expect(profile.locator("[data-organization-profile-back]")).toBeVisible();
  await expect(profile.locator("#organization-overview")).toBeVisible();
  await expect(profile.locator("#organization-contacts")).toBeHidden();
  await profile.locator(".detail-tab").filter({ hasText: "Kontakte" }).click();
  await expect(profile.locator("#organization-overview")).toBeHidden();
  await expect(profile.locator("#organization-contacts")).toBeVisible();

  await attachScreenshot(page, testInfo, "organisationen");
});

test("Organisationsprofil: direkter Deeplink rendert Profilseite", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#organization/care/demo-org-nordstadt");

  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/care\/demo-org-nordstadt$/);
  await expect(page.locator("#organization-profile-body .detail-profile h3")).toContainText("MVZ Nordstadt");
  await expect(page.locator("#organization-profile-body #organization-overview")).toBeVisible();
  await expect(page.locator(".app-shell[data-active-view='organizationProfile'] .workspace-header")).toBeHidden();
  await expect(page.locator("#search")).toBeHidden();
});

test("Aktivitäten: globaler Kontaktverlauf rendert mit Filtern und Paging", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#activities", {
    demoDataScript: activitiesDemoDataScript()
  });

  await expect(page.locator('[data-view-panel="activities"]')).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "activities");
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
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/contact\//);
  await expect(page.locator("#person-profile-body #detail-overview")).toBeVisible();

  await attachScreenshot(page, testInfo, "aktivitaeten");
});

test("Benachrichtigungen: Glocke öffnet Vorschau und Profil-Reiter rendert Inbox", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#contacts", {
    localNotifications: [
      {
        id: "visual-notification-contact-update",
        eventType: "contact_updated",
        entityType: "contact",
        entityId: "kontakt-1",
        title: "Kontakt aktualisiert",
        body: "Stammdaten wurden angepasst.",
        route: "#contacts",
        occurredAt: "2026-06-12T08:30:00.000Z",
        createdAt: "2026-06-12T08:30:00.000Z",
        readAt: ""
      }
    ]
  });

  await expect(page.locator("#notification-count-total")).toBeVisible();
  await page.locator("#sidebar-notifications-button").click();
  await expect(page.locator("#notification-popover")).toBeVisible();
  await expect(page.locator("#notification-popover-title")).toHaveText("Benachrichtigungen");
  await expect(page.locator("#notification-popover-meta")).toHaveCount(0);
  await expect(page.locator("#notification-popover-list .notification-popover__loading")).toHaveCount(0);
  await expect(page.locator("#notification-popover")).not.toContainText("Benachrichtigungen werden geladen");
  await expect(page.locator("#notification-popover-list .notification-preview-item")).toHaveCount(1);
  const popoverLayout = await page.evaluate(() => {
    const popover = document.querySelector("#notification-popover")?.getBoundingClientRect();
    const accountRow = document.querySelector(".sidebar-account-row")?.getBoundingClientRect();
    return popover && accountRow
      ? { popoverBottom: popover.bottom, accountTop: accountRow.top }
      : null;
  });
  expect(popoverLayout).not.toBeNull();
  expect(popoverLayout.popoverBottom).toBeLessThanOrEqual(popoverLayout.accountTop - 6);

  await page.locator("#notification-popover-all").click();
  await expect(page).toHaveURL(/#profile-notifications$/);
  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator('[data-profile-tab="notifications"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-tab-notifications")).toBeVisible();
  await expect(page.locator("#workspace-view-title")).toHaveText("Benachrichtigungen");
  await expect(page.locator("#sidebar-notifications-button")).toHaveClass(/is-active/);
  await expect(page.locator("#notifications-list .notification-item").first()).toBeVisible();
  await expect(page.locator("#profile-tab-notifications .profile-setting-toggle")).toBeVisible();
  await expect(page.locator("#profile-tab-settings .profile-setting-toggle")).toHaveCount(0);
  await expect(page.locator("#search")).toBeHidden();
  await expect(page.locator("#summary-grid")).toBeHidden();
  await expect(page.locator("#notifications-list .notifications-loading")).toHaveCount(0);
  await expect(page.locator("#notifications-meta")).not.toHaveText("Benachrichtigungen werden geladen");
  await expect(page.locator('[data-notification-filter]').last()).toHaveText("Produkt");

  await page.locator("#notifications-mark-all-read").click();
  await expect(page.locator("#notifications-list .notifications-empty")).toBeVisible();
  await expect(page.locator("#notifications-list .notification-empty-state__icon")).toBeVisible();
  await expect(page.locator("#notifications-mark-all-read")).toBeHidden();
  await expect(page.locator("#notification-count-total")).toBeHidden();

  await page.locator("#sidebar-notifications-button").click();
  await expect(page.locator("#notification-popover")).toBeVisible();
  await expect(page.locator("#notification-popover-list .notification-popover__empty")).toContainText("Keine neuen Benachrichtigungen.");
  await expect(page.locator("#notification-popover-list .notification-empty-state__icon")).toBeVisible();

  await attachScreenshot(page, testInfo, "hinweise");
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
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator(".controls")).toBeVisible();
  await expect(page.locator(".controls #search")).toHaveCount(1);
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
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  } else {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await expect(page.locator("#detail-open-profile")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeHidden();
    await page.locator("#detail-open-profile").click();
  }
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/expert\//);
  await expect(page.locator("#person-profile-body #detail-overview")).toBeVisible();
  await expect(page.locator("#expert-detail-overview")).toHaveCount(0);
  await expect(page.locator("#person-profile-body .detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await page.locator("#person-profile-body [data-person-profile-back]").click();

  await page.locator('#expert-mode-actions [data-expert-mode="organizations"]').click();
  await expect(page.locator("#expert-organization-list .row").first()).toBeVisible();
  await expect(page.locator("#experts-pagination-meta")).toContainText("Organisationen");
  await expect(page.locator('[data-expert-table="duplicates"]')).toBeHidden();
  await expect(page.locator("#new-expert-contact-button")).toBeHidden();
  await expect(page.locator("#new-expert-organization-button")).toBeVisible();
  await page.locator("#expert-organization-list .row").first().click();
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  } else {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await expect(page.locator("#detail-drawer [data-open-organization-profile]")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeHidden();
    await page.locator("#detail-drawer [data-open-organization-profile]").click();
  }
  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/expert\//);
  await expect(page.locator("#organization-profile-body .detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await page.locator("#organization-profile-body [data-organization-profile-back]").click();

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

  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/expert\//);
  await expect(page.locator("#person-profile-body .detail-profile h3")).toContainText("Tessa Interop");
  await expect(page.locator("#person-profile-body .detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await expect(page.locator('#expert-mode-actions [data-expert-mode="contacts"] .experts-mode-count')).toHaveText("1");
  await expect(page.locator("#new-expert-contact-button")).toBeHidden();
  await expect(page.locator("#new-expert-organization-button")).toBeHidden();
  await page.locator("#person-profile-body [data-person-profile-back]").click();
  await expect(page.locator("#new-expert-contact-button")).toBeVisible();
  await expect(page.locator("#new-expert-organization-button")).toBeHidden();

  await page.locator('#expert-mode-actions [data-expert-mode="organizations"]').click();
  await expect(page.locator('#expert-mode-actions [data-expert-mode="organizations"] .experts-mode-count')).toHaveText("1");
  await expect(page.locator("#new-expert-contact-button")).toBeHidden();
  await expect(page.locator("#new-expert-organization-button")).toBeVisible();
  await page.locator("#new-expert-organization-button").click();
  await expect(page.locator("#organization-editor-drawer.is-open")).toBeVisible();
  await expect(page.locator('label[for="organization-field-sector"]')).toContainText("Gruppe");
  await page.locator("#organization-field-name").fill("FHIR Forum Test");
  await page.locator("#organization-editor-save").click();

  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/expert\//);
  await expect(page.locator("#organization-profile-body .detail-profile h3")).toContainText("FHIR Forum Test");
  await expect(page.locator("#organization-profile-body .detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await page.locator("#organization-profile-body [data-organization-profile-back]").click();
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

  await page.locator('button[data-care-mode="organizations"]').click();
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

  await page.evaluate(() => {
    window.location.hash = "experts";
  });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "experts");
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

  const isMobile = testInfo.project.name.includes("mobile");
  const firstContact = page.locator("#contact-list .row, #contact-list .mobile-contact-card").first();
  await expect(firstContact).toBeVisible();
  await firstContact.click();

  if (isMobile) {
    await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  } else {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-profile")).toBeVisible();
    await expect(page.locator("#detail-open-profile")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeHidden();
    await expect(page.locator("#detail-drawer .owner-summary-list").first()).toBeVisible();
    await page.locator("#detail-open-profile").click();
  }

  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/contact\//);
  await expect(page.locator("#person-profile-body .detail-profile")).toBeVisible();
  await expect(page.locator("#person-profile-body .detail-tabs")).toBeVisible();
  await expect(page.locator("#person-profile-body [data-person-profile-back]")).toBeVisible();
  await expect(page.locator("#person-profile-body #detail-contactways")).toBeHidden();
  await expect(page.locator("#person-profile-body .owner-summary-list").first()).toBeVisible();

  await attachScreenshot(page, testInfo, "kontaktprofil");
});

test("Kontaktprofil: direkter Deeplink rendert Profilseite", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#person/contact/demo-contact-01");

  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/contact\/demo-contact-01$/);
  await expect(page.locator("#person-profile-body .detail-profile h3")).toBeVisible();
  await expect(page.locator("#person-profile-body #detail-overview")).toBeVisible();
  await expect(page.locator(".app-shell[data-active-view='personProfile'] .workspace-header")).toBeHidden();
  await expect(page.locator("#search")).toBeHidden();
});

test("Detaildrawer schliesst beim Wechsel zwischen Hauptbereichen", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  const isMobile = testInfo.project.name.includes("mobile");
  await page.locator("#contact-list .row, #contact-list .mobile-contact-card").first().click();
  if (isMobile) {
    await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  } else {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  }
  if (isMobile) {
    await page.locator("#person-profile-body [data-person-profile-back]").click();
  }
  await page.locator('button[data-care-mode="organizations"]').click();
  await expect(page.locator("#detail-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await expect(page.locator("#person-profile-page")).toHaveAttribute("aria-hidden", "true");

  await attachScreenshot(page, testInfo, "drawer-wechsel-organisationen", { fullPage: false });

  await expect(page.locator("#organization-list .row, #organization-list .mobile-contact-card").first()).toBeVisible();
  await page.locator("#organization-list .row, #organization-list .mobile-contact-card").first().click();
  if (isMobile) {
    await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
    await page.locator("#organization-profile-body [data-organization-profile-back]").click();
  } else {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await page.locator('button[data-care-mode="contacts"]').click();
  }
  await expect(page.locator("#detail-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await expect(page.locator("#organization-profile-page")).toHaveAttribute("aria-hidden", "true");
  if (isMobile) {
    await page.locator('button[data-care-mode="contacts"]').click();
  }

  await attachScreenshot(page, testInfo, "drawer-wechsel-kontakte", { fullPage: false });
});

test("Kontaktprofil: Notizen als Chat pflegen", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  await page.locator("#contact-list .row, #contact-list .mobile-contact-card").first().click();
  if (!testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await page.locator("#detail-open-profile").click();
  }
  const profile = page.locator("#person-profile-body");
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await profile.locator(".detail-tab").filter({ hasText: "Notizen" }).click();
  await expect(profile.locator("#detail-overview")).toBeHidden();
  await expect(profile.locator("#contact-notes-composer")).toBeVisible();

  await profile.locator("#contact-notes-message").fill("Testnotiz aus dem Kontakt-Visualtest");
  await profile.locator("#contact-notes-composer").getByRole("button", { name: "Notiz senden" }).click();
  await expect(profile.locator("#detail-notes .format-chat-message").filter({ hasText: "Testnotiz aus dem Kontakt-Visualtest" })).toBeVisible();
  await expect(profile.locator("#detail-notes .format-chat-meta time").last()).toBeVisible();

  await attachScreenshot(page, testInfo, "kontaktprofil-notizen-chat", { fullPage: false });

  await profile.locator("[data-edit-contact-note]").last().click();
  await profile.locator("[data-contact-note-edit-form] textarea").fill("Bearbeitete Testnotiz aus dem Kontakt-Visualtest");
  await profile.locator("[data-contact-note-edit-form]").getByRole("button", { name: "Speichern" }).click();
  await expect(profile.locator("#detail-notes .format-chat-message").filter({ hasText: "Bearbeitete Testnotiz aus dem Kontakt-Visualtest" })).toBeVisible();
  await expect(profile.locator("#detail-notes .format-chat-message").filter({ hasText: "bearbeitet" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await profile.locator("[data-delete-contact-note]").last().click();
  await expect(profile.locator("#detail-notes .format-chat-message").filter({ hasText: "Bearbeitete Testnotiz aus dem Kontakt-Visualtest" })).toHaveCount(0);
});

test("Kontaktprofil: Viewer lesen Notizen-Chat ohne Composer", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role: "viewer" });

  await page.locator("#contact-list .row, #contact-list .mobile-contact-card").first().click();
  if (!testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await page.locator("#detail-open-profile").click();
  }
  const profile = page.locator("#person-profile-body");
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await profile.locator(".detail-tab").filter({ hasText: "Notizen" }).click();
  await expect(profile.locator("#detail-overview")).toBeHidden();

  await expect(profile.locator("#detail-notes .format-chat-message").first()).toBeVisible();
  await expect(profile.locator("#detail-notes .format-chat-message").first()).toContainText("Bisherige Notiz");
  await expect(profile.locator("#contact-notes-composer")).toHaveCount(0);
  await expect(profile.locator("#detail-notes .detail-permission-note")).toBeVisible();
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
  await expect(page.locator('[data-sidebar-section="admin"]')).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".sidebar-section-label").filter({ hasText: "Admin" })).toBeHidden();
  await expect(page.locator("#archive-view-button")).toBeHidden();

  await attachScreenshot(page, testInfo, "viewer-rolle");
});

test("Rollen: Admin sieht Import und Archiv", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role: "admin" });

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator('[data-sidebar-section="admin"]')).toHaveAttribute("aria-hidden", "false");
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
  await expect(page.locator("#profile-tab-about .about-intro__highlight")).toContainText("Ein gemeinsamer Blick auf Kontakte");
  await expect(page.locator("#profile-tab-about .about-topic")).toHaveCount(6);
  await expect(page.locator("#profile-tab-about")).not.toContainText("Changelog");

  await attachScreenshot(page, testInfo, "profil-about");
});

test("Mein Profil: Changelog ist als Profil-Reiter erreichbar", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#profile-changelog", { role: "admin" });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator('[data-profile-tab="changelog"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-tab-changelog")).toBeVisible();
  await expect(page.locator("#about-version-list .about-version").first()).toBeVisible();

  await attachScreenshot(page, testInfo, "profil-changelog");
});

for (const role of ["admin", "editor", "viewer"]) {
  test(`Mein Profil: Onboarding-Tour ist für ${role} startbar`, async ({ page }) => {
    await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role });
    const expectedAllowedPermissions = role === "admin" ? 9 : role === "editor" ? 5 : 2;

    await page.locator("#sidebar-profile-button").click();
    await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
    await expect(page.locator("#profile-tab-profile")).toBeVisible();
    await expect(page.locator("#profile-tab-profile")).not.toContainText("Die Tour zeigt die wichtigsten Arbeitsbereiche direkt in der Oberfläche: Sidebar, Versorgung, Filter, CRM-Profile, Planung, Admin, Team und Profil.");
    await expect(page.locator("#profile-onboarding-status")).toBeVisible();
    await expect(page.locator("#profile-tour-start")).toBeVisible();
    await page.locator("#profile-permissions-summary").click();
    await expect(page.locator("#profile-permissions-list .profile-permission-item")).toHaveCount(9);
    await expect(page.locator("#profile-permissions-list .profile-permission-item.is-allowed")).toHaveCount(expectedAllowedPermissions);
    await expect(page.locator("#profile-permissions-list .profile-permission-item.is-unavailable")).toHaveCount(9 - expectedAllowedPermissions);

    await page.locator("#profile-tour-start").click();
    await expect(page.locator("#product-tour")).toBeVisible();
    await expect(page.locator("#product-tour-meta")).toHaveText(/Schritt 1 von \d+/);
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
    "Versorgung als Arbeitsbereich",
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

test("Stakeholder: KVn rendern als Organisationstabelle ohne Listen-Modi", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#stakeholders", { role: "admin" });

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "stakeholders");
  await expect(page.locator("#stakeholder-mode-actions [data-stakeholder-type=\"kv\"]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#stakeholder-mode-actions [data-stakeholder-mode]")).toHaveCount(0);
  await expect(page.locator("#stakeholder-mode-actions")).not.toContainText("Vorstände");
  await expect(page.locator("#stakeholder-mode-actions")).not.toContainText("Karte");
  await expect(page.locator("#stakeholder-organizations-table")).toBeVisible();
  await expect(page.locator("#stakeholder-people-table")).toHaveCount(0);
  await expect(page.locator("#stakeholder-map-panel")).toHaveCount(0);
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("17 KVn");
  await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toBeVisible();
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Mitgliederzahl");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Typ");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Bundesland");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Website");
  await expect(page.locator("#stakeholder-organization-list")).toContainText("24.324");
  await expect(page.locator("#stakeholder-organization-list .organization-logo").first()).toBeVisible();
  await expect(page.locator("#stakeholder-organization-list .organization-logo img").first()).toHaveAttribute("src", /stakeholder-logos\/kv-/);
  const stakeholderSearch = page.getByRole("searchbox", { name: "Kassenärztliche Vereinigungen suchen..." });
  await expect(stakeholderSearch).toBeVisible();
  for (const [query, id, count] of [
    ["Berlin", "kv-berlin", "11.148"],
    ["Brandenburg", "kv-brandenburg", "5.099"],
    ["Bremen", "kv-bremen", "2.127"]
  ]) {
    await stakeholderSearch.fill(query);
    const row = page.locator(`#stakeholder-organization-list [data-stakeholder-organization-id="${id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(count);
    await expect(row.locator(".organization-logo img")).toHaveAttribute("src", new RegExp(`stakeholder-logos/${id}\\.svg`));
  }
  await stakeholderSearch.fill("");
  const isDesktop = testInfo.project.name.includes("desktop");
  if (isDesktop) {
    await expect(page.locator("#columns-button")).toBeHidden();
    await expect(page.locator('[data-stakeholder-organization-sort="organization"]')).toBeVisible();
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("KV Baden-Württemberg");
    await page.locator('[data-stakeholder-organization-sort="organization"]').click();
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("KV Westfalen-Lippe");
    await page.locator('[data-stakeholder-organization-sort="organization"]').click();
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("KV Baden-Württemberg");
    await page.locator('[data-stakeholder-organization-sort="memberCount"]').click();
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("KV Bayerns");
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("30.984");
  }
  const expectedDetailMemberCount = isDesktop ? "30.984" : "24.324";
  const expectedDetailOrganization = isDesktop ? "Kassenärztliche Vereinigung Bayerns" : "Kassenärztliche Vereinigung Baden-Württemberg";
  const expectedDetailWebsite = isDesktop ? "kvb.de" : "kvbawue.de";
  const expectedOrganizationPerson = isDesktop ? "Dr. Christian Pfeiffer" : "Dr. Karsten Braun";

  await page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first().click();
  if (isDesktop) {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await expect(page.locator("#detail-drawer [data-open-organization-profile]")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeVisible();
    await expect(page.locator("#detail-drawer #stakeholder-organization-overview")).toContainText(expectedDetailMemberCount);
    await page.locator("#detail-drawer [data-open-organization-profile]").click();
  }
  const organizationProfile = page.locator("#organization-profile-body");
  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/stakeholder\//);
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toBeVisible();
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("Mitgliederzahl");
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText(expectedDetailMemberCount);
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText(expectedDetailOrganization);
  await expect(organizationProfile.locator("#stakeholder-organization-overview .detail-line__label", { hasText: "Stakeholder-Typ" })).toHaveCount(0);
  await expect(organizationProfile.locator("#stakeholder-organization-overview .detail-line__label", { hasText: "Organisationstyp" })).toHaveCount(0);
  await expect(organizationProfile.locator("#stakeholder-organization-overview .detail-line__label", { hasText: "Bezugsgröße" })).toHaveCount(0);
  await expect(organizationProfile.locator("#stakeholder-organization-overview .detail-line__label", { hasText: "Zugeordnete Personen" })).toHaveCount(0);
  await expect(organizationProfile.locator("#stakeholder-organization-overview .stakeholder-member-info")).toBeVisible();
  await expect(organizationProfile.locator(".organization-profile-logo")).toBeVisible();
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText(expectedDetailWebsite);
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("KBV Bundesarztregister");
  await organizationProfile.locator('[data-detail-tab="themes"]').click();
  await expect(organizationProfile.locator("#stakeholder-organization-themes")).toBeVisible();
  await expect(organizationProfile.locator("#stakeholder-organization-themes")).toContainText("KV-Vorstand");
  await organizationProfile.locator('[data-detail-tab="activity"]').click();
  await expect(organizationProfile.locator("#stakeholder-organization-activity")).toBeVisible();
  await organizationProfile.locator('[data-detail-tab="notes"]').click();
  await expect(organizationProfile.locator("#stakeholder-organization-notes .stakeholder-notes-thread")).toBeVisible();
  await expect(organizationProfile.locator("#stakeholder-organization-notes [data-stakeholder-note-composer]")).toBeVisible();
  await organizationProfile.locator('[data-detail-tab="people"]').click();
  await expect(organizationProfile.locator("#stakeholder-organization-people")).toBeVisible();
  await expect(organizationProfile.locator("#stakeholder-organization-people")).toContainText(expectedOrganizationPerson);
  await organizationProfile.locator("[data-open-stakeholder-org-person]").first().click();
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/stakeholder\//);
  await expect(page.locator("#person-profile-body #stakeholder-person-overview")).toBeVisible();
  await expect(page.locator("#person-profile-body #stakeholder-person-contact")).toBeHidden();
  await expect(page.locator("#person-profile-body #stakeholder-person-overview")).toContainText(expectedDetailOrganization);
  await page.locator("#person-profile-body [data-person-profile-back]").click();
  await expect(page.locator('[data-view-panel="stakeholders"]')).toBeVisible();
  await expect(page.locator("#stakeholder-organizations-table")).toBeVisible();
  await expect(page.locator("#stakeholder-people-table")).toHaveCount(0);
  await expect(page.locator("#stakeholder-map-panel")).toHaveCount(0);

  await attachScreenshot(page, testInfo, "stakeholder-kvn");
});

test("Stakeholder: weitere Typen nutzen Organisationstabellen und Profile", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#stakeholders", {
    role: "admin",
    stakeholderScript: `
      window.VERSORGUNGS_COMPASS_STAKEHOLDER_TYPES = [
        { id: "kv", label: "Kassenärztliche Vereinigungen", sortOrder: 10, status: "active" },
        { id: "health-insurance", label: "Krankenkassen", sortOrder: 20, status: "active" },
        { id: "patient-associations", label: "Patientenverbände", sortOrder: 30, status: "active" },
        { id: "hospital-associations", label: "Krankenhausgesellschaften", sortOrder: 40, status: "active" },
        { id: "physician-associations", label: "Ärztliche Berufsverbände", sortOrder: 50, status: "active" }
      ];
      window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS = [
        { id: "health-aok-test", stakeholderTypeId: "health-insurance", stakeholderType: "health-insurance", name: "AOK Test", organizationType: "Krankenkasse", city: "Berlin", state: "Berlin", latitude: 52.52, longitude: 13.405, website: "https://example.org/aok-test", memberCount: 123, source: "Backend-Pflege", status: "active" },
        { id: "patient-test", stakeholderTypeId: "patient-associations", stakeholderType: "patient-associations", name: "Patientenverband Test", organizationType: "Patientenverband", city: "Hamburg", state: "Hamburg", source: "Backend-Pflege", status: "active" }
      ];
      window.VERSORGUNGS_COMPASS_STAKEHOLDER_PEOPLE = [
        { id: "health-aok-test-alex", stakeholderTypeId: "health-insurance", stakeholderType: "health-insurance", organizationId: "health-aok-test", organization: "AOK Test", name: "Alex Beispiel", role: "Referentin Versorgung", committee: "Ansprechperson", city: "Berlin", state: "Berlin", mapPositionSource: "organization", source: "Backend-Pflege", status: "active" }
      ];
    `
  });

  await expect(page.locator('[data-stakeholder-type="health-insurance"]')).toBeVisible();
  await expect(page.locator("#stakeholder-mode-actions [data-stakeholder-mode]")).toHaveCount(0);
  await expect(page.locator("#stakeholder-people-table")).toHaveCount(0);
  await expect(page.locator("#stakeholder-map-panel")).toHaveCount(0);
  await page.locator('[data-stakeholder-type="health-insurance"]').click();
  await expect(page.locator('[data-stakeholder-type="health-insurance"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("searchbox", { name: "Krankenkassen suchen..." })).toBeVisible();
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("1 Krankenkassen");
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Ansprechpersonen");
  await expect(page.locator("#stakeholder-organization-list")).toContainText("AOK Test");
  await page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first().click();
  const healthProfileButton = page.locator("#detail-drawer [data-open-organization-profile]");
  if (await healthProfileButton.isVisible().catch(() => false)) {
    await healthProfileButton.click();
  }
  const organizationProfile = page.locator("#organization-profile-body");
  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/stakeholder\/health-aok-test$/);
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("AOK Test");
  await organizationProfile.locator('[data-detail-tab="people"]').click();
  await expect(organizationProfile.locator("#stakeholder-organization-people")).toContainText("Alex Beispiel");
  await organizationProfile.locator("[data-organization-profile-back]").click();

  await page.locator('[data-stakeholder-type="patient-associations"]').click();
  await expect(page.locator("#stakeholder-organizations-table")).toBeVisible();
  await expect(page.locator("#stakeholder-mode-actions [data-stakeholder-mode]")).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Patientenverbände suchen..." })).toBeVisible();
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("1 Patientenverbände");
  await expect(page.locator("#stakeholder-organization-list")).toContainText("Patientenverband Test");
});

test("Stakeholder: KVn-Bereich ist nur fuer Admins sichtbar", async ({ page }) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#stakeholders", { role: "viewer" });

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "contacts");
  await expect(page.locator('button[data-view-tab="stakeholders"]')).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator('button[data-view-tab="stakeholders"]')).toHaveClass(/is-role-hidden/);
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
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/contact\/demo-contact-01$/);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "personProfile");
  await page.locator("#person-profile-body [data-person-profile-back]").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "formats");
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
