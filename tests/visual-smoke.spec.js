import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

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

async function expectTourPanelInsideViewport(page) {
  await expect.poll(() => page.locator("#product-tour-panel").evaluate((panel) => panel.scrollTop)).toBe(0);
  await expect(page.locator("#product-tour-title")).toBeInViewport();
  await expect.poll(() => page.locator("#product-tour-panel").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return rect.top >= 0
      && rect.left >= 0
      && rect.right <= window.innerWidth + 1
      && rect.bottom <= window.innerHeight + 1;
  })).toBe(true);
}

async function expectTourSpotlightInsideViewport(page) {
  await expect(page.locator("#product-tour-spotlight")).toBeVisible();
  await expect.poll(() => page.locator("#product-tour-spotlight").evaluate((spotlight) => {
    const rect = spotlight.getBoundingClientRect();
    return rect.width > 0
      && rect.height > 0
      && rect.top >= 0
      && rect.left >= 0
      && rect.right <= window.innerWidth + 1
      && rect.bottom <= window.innerHeight + 1;
  })).toBe(true);
}

async function openMobileSidebarIfNeeded(page) {
  const isMobileLayout = await page.evaluate(() => matchMedia("(max-width: 760px)").matches);
  if (!isMobileLayout) return;

  const shell = page.locator(".app-shell");
  const isExpanded = await shell.evaluate((element) => element.classList.contains("is-mobile-sidebar-expanded"));
  if (!isExpanded) {
    await page.locator("#sidebar-collapse-button").click();
  }
  await expect(shell).toHaveClass(/is-mobile-sidebar-expanded/);
}

async function expandSidebarSectionIfNeeded(page, section) {
  await openMobileSidebarIfNeeded(page);
  const toggle = page.locator(`[data-sidebar-section-toggle="${section}"]`);
  if (await toggle.getAttribute("aria-expanded") !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

async function expectTourPanelClearOfSpotlight(page, minimumGap = 0, context = "aktueller Schritt") {
  await expect.poll(async () => {
    const [panelBox, spotlightBox] = await Promise.all([
      page.locator("#product-tour-panel").boundingBox(),
      page.locator("#product-tour-spotlight").boundingBox()
    ]);
    if (!panelBox || !spotlightBox) return "Geometrie fehlt";
    const overlaps = panelBox.x < spotlightBox.x + spotlightBox.width + minimumGap
      && panelBox.x + panelBox.width > spotlightBox.x - minimumGap
      && panelBox.y < spotlightBox.y + spotlightBox.height + minimumGap
      && panelBox.y + panelBox.height > spotlightBox.y - minimumGap;
    return overlaps ? JSON.stringify({ panelBox, spotlightBox, minimumGap }) : "";
  }, { message: `Tour-Panel und Spotlight duerfen sich nicht ueberlagern (${context}).` }).toBe("");
}

async function expectTourTargetDescribed(page, stepId) {
  const mainTarget = page.locator('[data-product-tour-active="true"]');
  if (stepId !== "map") {
    await expect(mainTarget, `Aktives Tour-Ziel für ${stepId} fehlt.`).toHaveCount(1);
    await expect(mainTarget).toHaveAttribute("aria-describedby", /product-tour-copy/);
    await expect.poll(() => mainTarget.evaluate((target) => String(target.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean)
      .every((id) => Boolean(target.ownerDocument.getElementById(id))))).toBe(true);
    return;
  }
  const frameTarget = page.frameLocator("#map-view-frame").locator('[data-product-tour-active="true"]');
  await expect(frameTarget).toHaveAttribute("aria-describedby", /product-tour-target-description/);
  await expect.poll(() => frameTarget.evaluate((target) => String(target.getAttribute("aria-describedby") || "")
    .split(/\s+/)
    .filter(Boolean)
    .every((id) => Boolean(target.ownerDocument.getElementById(id))))).toBe(true);
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
          return profile;
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

function onboardingBackendFixtureScript({ completed = false } = {}) {
  const completedPreferences = completed
    ? `{
          onboarding: {
            version: 1,
            profileCompletedAt: "2026-06-09T09:00:00.000Z",
            tourOfferedAt: "2026-06-09T09:00:05.000Z",
            tourSkippedAt: "2026-06-09T09:01:00.000Z"
          }
        }`
    : "{}";
  return `
    (() => {
      const profile = {
        id: "11111111-1111-4111-8111-111111111111",
        email: "neues-konto@onboarding.example.invalid",
        display_name: "steffen",
        initials: "ST",
        role: "viewer",
        active: true,
        avatar_url: "",
        team: "",
        bio: "",
        created_at: "2026-06-09T08:30:00.000Z",
        updated_at: "2026-06-09T08:30:00.000Z"
      };
      window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA = {
        profiles: [profile],
        contacts: [{
          id: "demo-onboarding-contact",
          name: "Demo-Kontakt Onboarding",
          organization: "Demo-Praxis Onboarding",
          category: "Praxis",
          sector: "Praxis",
          specialty: "Allgemeinmedizin",
          city: "Musterstadt",
          state: "Berlin",
          priority: "Mittel",
          ownerId: profile.id,
          ownerIds: [profile.id],
          status: "active",
          updatedAt: "2026-06-09T09:00:00.000Z"
        }],
        organizations: [],
        changes: [],
        activityEvents: [],
        savedViews: [],
        formats: [],
        hospitations: [],
        userSettings: {
          userId: profile.id,
          defaultViewType: "contacts",
          tableDensity: "comfortable",
          theme: "system",
          fontScale: 1,
          pageSize: 20,
          preferences: ${completedPreferences}
        }
      };
    })();
  `;
}

function delayedInitialDataServiceScript() {
  return onboardingDataServiceScript({ completed: true }).replace(
    "loadContacts: async () => contacts,",
    `loadContacts: async () => new Promise((resolve) => {
          window.__resolveInitialContacts = () => resolve(contacts);
        }),`
  );
}

function failingHospitationDataServiceScript() {
  return onboardingDataServiceScript({ completed: true }).replace(
    "loadFormats: async () => [],",
    `loadFormats: async () => [],
        loadHospitationSlots: async () => [],
        loadHospitations: async () => { throw new Error("Hospitationsdienst ist nicht erreichbar"); },
        loadRoadmapItems: async () => [],
        loadHospitationRoadmapAssessments: async () => [],
        loadHospitationUnmetNeeds: async () => [],`
  );
}

async function attachScreenshot(page, testInfo, name, options = {}) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: options.fullPage ?? true
  });
}

async function expectNoHorizontalOverflow(page, selector = "html") {
  const overflow = await page.locator(selector).evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
  expect(overflow).toBeLessThanOrEqual(1);
}

function largeQuestionnaireBackendFixtureScript() {
  return `
    (() => {
      const now = "2026-07-11T08:00:00.000Z";
      const profile = { id: "11111111-1111-4111-8111-111111111111", email: "qa@example.test", display_name: "QA Admin", initials: "QA", role: "admin", active: true, avatar_url: "", team: "QA", created_at: now, updated_at: now };
      const sectors = ["Praxis", "Pflege", "Krankenhaus", "Apotheke"];
      const organizations = Array.from({ length: 180 }, (_, index) => {
        const number = String(index + 1).padStart(3, "0");
        const sector = sectors[index % sectors.length];
        return {
          id: "large-org-" + number,
          name: index === 137 ? "Suchtreffer Zentrum Havel" : "Große Organisation " + number,
          normalizedName: "",
          sector,
          organizationType: sector,
          postalCode: "10" + number,
          city: index % 2 ? "Berlin" : "Potsdam",
          state: index % 2 ? "Berlin" : "Brandenburg",
          status: "active",
          createdAt: now,
          updatedAt: now
        };
      });
      const contacts = Array.from({ length: 260 }, (_, index) => {
        const number = String(index + 1).padStart(3, "0");
        const organization = organizations[index % organizations.length];
        return {
          id: "large-contact-" + number,
          name: index === 211 ? "Zora Suchtreffer" : "Kontaktperson " + number,
          displayName: index === 211 ? "Zora Suchtreffer" : "Kontaktperson " + number,
          organizationId: organization.id,
          organization: organization.name,
          category: organization.sector,
          sector: organization.sector,
          specialty: "Versorgung",
          priority: "Mittel",
          ownerId: profile.id,
          status: "active",
          createdAt: now,
          updatedAt: now
        };
      });
      window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA = {
        profiles: [profile],
        contacts,
        organizations,
        changes: [],
        savedViews: [],
        userSettings: {
          userId: profile.id,
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

function activitiesBackendFixtureScript() {
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
      window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA = {
        profiles,
        contacts,
        organizations: [],
        changes,
        savedViews: [],
        userSettings: {
          defaultViewType: "contacts",
          pageSize: 20,
          tableDensity: "comfortable",
          theme: "system",
          fontScale: 1,
          preferences: {
            onboarding: {
              version: 1,
              profileCompletedAt: now.toISOString(),
              tourSkippedAt: now.toISOString()
            }
          }
        },
        formats: []
      };
    })();
  `;
}

function consentBackendFixtureScript({ savedViews = [] } = {}) {
  const savedViewsJson = JSON.stringify(savedViews);
  return `
    (() => {
      const adminId = "11111111-1111-4111-8111-111111111111";
      const editorId = "22222222-2222-4222-8222-222222222222";
      const viewerId = "33333333-3333-4333-8333-333333333333";
      const now = "2026-07-15T10:00:00.000Z";
      const profiles = [
        { id: adminId, email: "consent.admin@example.test", display_name: "Consent Admin", initials: "CA", role: "admin", active: true, avatar_url: "", team: "Versorgung", created_at: now, updated_at: now },
        { id: editorId, email: "consent.editor@example.test", display_name: "Consent Editor", initials: "CE", role: "editor", active: true, avatar_url: "", team: "Kontaktpflege", created_at: now, updated_at: now },
        { id: viewerId, email: "consent.viewer@example.test", display_name: "Consent Viewer", initials: "CV", role: "viewer", active: true, avatar_url: "", team: "Lesende", created_at: now, updated_at: now }
      ];
      const baseContact = {
        organization: "Consent-Testzentrum",
        category: "Praxis",
        sector: "Praxis",
        specialty: "Allgemeinmedizin",
        priority: "Mittel",
        ownerId: adminId,
        ownerIds: [adminId],
        city: "Berlin",
        state: "Berlin",
        postalCode: "10115",
        email: "consent@example.test",
        phone: "+49 30 000000",
        themes: ["#Mitmachen"],
        sources: ["Consent-Smoke-Test"],
        status: "active",
        createdAt: "2026-06-01T08:00:00.000Z",
        updatedAt: now,
        mitmachenConsentTextVersion: "mitmachen-kontakt-v1"
      };
      const contacts = [
        {
          ...baseContact,
          id: "consent-granted-valid",
          name: "Ava Vorhanden",
          mitmachenConsentStatus: "granted",
          mitmachenConsentEffectiveAt: "2026-06-01T09:00:00.000Z",
          mitmachenConsentSource: "email",
          mitmachenConsentRecordedBy: adminId,
          mitmachenConsentNote: "Per E-Mail dokumentiert."
        },
        {
          ...baseContact,
          id: "consent-not-requested",
          name: "Berta Nicht angefragt",
          mitmachenConsentStatus: "not_requested",
          mitmachenConsentEffectiveAt: "",
          mitmachenConsentSource: "",
          mitmachenConsentRecordedBy: "",
          mitmachenConsentNote: ""
        },
        {
          ...baseContact,
          id: "consent-declined",
          name: "Clara Abgelehnt",
          mitmachenConsentStatus: "declined",
          mitmachenConsentEffectiveAt: "2026-06-02T09:00:00.000Z",
          mitmachenConsentSource: "written",
          mitmachenConsentRecordedBy: adminId,
          mitmachenConsentNote: "Ablehnung dokumentiert."
        },
        {
          ...baseContact,
          id: "consent-withdrawn",
          name: "Dora Widerrufen",
          mitmachenConsentStatus: "withdrawn",
          mitmachenConsentEffectiveAt: "2026-06-03T09:00:00.000Z",
          mitmachenConsentSource: "email",
          mitmachenConsentRecordedBy: adminId,
          mitmachenConsentNote: "Widerruf dokumentiert."
        },
        {
          ...baseContact,
          id: "consent-clarification",
          name: "Emil Klärung",
          mitmachenConsentStatus: "clarification_needed",
          mitmachenConsentEffectiveAt: "",
          mitmachenConsentSource: "",
          mitmachenConsentRecordedBy: adminId,
          mitmachenConsentNote: "Nachweis wird geprüft."
        },
        {
          ...baseContact,
          id: "consent-granted-invalid",
          name: "Frieda Ungültiger Zeitpunkt",
          mitmachenConsentStatus: "granted",
          mitmachenConsentEffectiveAt: "kein-datum",
          mitmachenConsentSource: "email",
          mitmachenConsentRecordedBy: adminId,
          mitmachenConsentNote: "Fehlerhafter Altdatenwert."
        },
        {
          ...baseContact,
          id: "consent-granted-future",
          name: "Gustav Zukünftiger Zeitpunkt",
          mitmachenConsentStatus: "granted",
          mitmachenConsentEffectiveAt: "2099-01-01T09:00:00.000Z",
          mitmachenConsentSource: "online_form",
          mitmachenConsentRecordedBy: adminId,
          mitmachenConsentNote: "Zukünftiger Testwert."
        }
      ];
      window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA = {
        profiles,
        contacts,
        organizations: [],
        changes: [],
        savedViews: ${savedViewsJson},
        userSettings: {
          userId: adminId,
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

function hospitationProfileBackendFixtureScript() {
  return `
    (() => {
      const adminId = "11111111-1111-4111-8111-111111111111";
      const editorId = "22222222-2222-4222-8222-222222222222";
      const viewerId = "33333333-3333-4333-8333-333333333333";
      const now = "2026-07-16T08:00:00.000Z";
      const profiles = [
        { id: adminId, email: "history.admin@example.test", display_name: "History Admin", initials: "HA", role: "admin", active: true, avatar_url: "", team: "Versorgung", created_at: now, updated_at: now },
        { id: editorId, email: "history.editor@example.test", display_name: "History Editor", initials: "HE", role: "editor", active: true, avatar_url: "", team: "Hospitation", created_at: now, updated_at: now },
        { id: viewerId, email: "history.viewer@example.test", display_name: "History Viewer", initials: "HV", role: "viewer", active: true, avatar_url: "", team: "Lesende", created_at: now, updated_at: now }
      ];
      const contacts = [
        {
          id: "hospitation-profile-contact",
          name: "Anna Verlauf",
          displayName: "Anna Verlauf",
          organization: "Praxis Verlauf",
          category: "Praxis",
          sector: "Praxis",
          specialty: "Allgemeinmedizin",
          priority: "Hoch",
          ownerId: adminId,
          ownerIds: [adminId],
          city: "Berlin",
          state: "Berlin",
          postalCode: "10115",
          email: "anna.verlauf@example.test",
          status: "active",
          createdAt: "2025-01-01T08:00:00.000Z",
          updatedAt: now
        },
        {
          id: "hospitation-other-contact",
          name: "Berta Andere",
          displayName: "Berta Andere",
          organization: "MVZ Andere",
          category: "Praxis",
          sector: "Praxis",
          specialty: "Innere Medizin",
          priority: "Mittel",
          ownerId: editorId,
          ownerIds: [editorId],
          city: "Potsdam",
          state: "Brandenburg",
          postalCode: "14467",
          email: "berta.andere@example.test",
          status: "active",
          createdAt: "2025-01-01T08:00:00.000Z",
          updatedAt: now
        }
      ];
      const target = "hospitation-profile-contact";
      const base = { contactId: target, ownerId: adminId, ownerIds: [adminId], organizationName: "Praxis Verlauf", sector: "Praxis", location: "Berlin" };
      const hospitations = [
        { ...base, id: "history-upcoming", status: "Gebucht", startsAt: "2099-08-15T10:30:00.000Z", endsAt: "2099-08-15T12:00:00.000Z", goal: "Nächsten Praxisbesuch vorbereiten" },
        { ...base, id: "history-documented", status: "Dokumentiert", startsAt: "2026-06-20T09:00:00.000Z", endsAt: "2026-06-20T11:00:00.000Z", goal: "Praxisablauf verstehen", documentationSummary: "Ablauf und Übergaben dokumentiert.", documentedAt: "2026-06-20T12:00:00.000Z" },
        { ...base, id: "history-completed", status: "Durchgeführt", startsAt: "2026-05-12T09:00:00.000Z", endsAt: "2026-05-12T11:00:00.000Z", ownerId: editorId, ownerIds: [editorId], goal: "Versorgungsübergang beobachten" },
        { ...base, id: "history-archived", status: "Archiviert", startsAt: "2026-04-08T09:00:00.000Z", endsAt: "2026-04-08T11:00:00.000Z", goal: "Archivierter Kontext" },
        { ...base, id: "history-older-documented", status: "Dokumentiert", startsAt: "2026-03-01T09:00:00.000Z", endsAt: "2026-03-01T11:00:00.000Z", goal: "Älterer Besuch", documentationSummary: "Ältere Dokumentation vorhanden." },
        { ...base, id: "history-cancelled", status: "Abgesagt", startsAt: "2026-07-15T09:00:00.000Z", endsAt: "2026-07-15T11:00:00.000Z", goal: "Abgesagter Termin" },
        { ...base, id: "history-past-scheduled", status: "Gebucht", startsAt: "2026-07-14T09:00:00.000Z", endsAt: "2026-07-14T11:00:00.000Z", goal: "Noch nicht abgeschlossen" },
        { ...base, id: "history-future-documented", status: "Dokumentiert", startsAt: "2099-09-01T09:00:00.000Z", endsAt: "2099-09-01T11:00:00.000Z", goal: "Inkonsistenter Zukunftseintrag", documentationSummary: "Darf nicht als bisher erfolgt erscheinen." },
        { id: "history-other-contact", contactId: "hospitation-other-contact", ownerId: editorId, ownerIds: [editorId], status: "Durchgeführt", startsAt: "2026-07-01T09:00:00.000Z", endsAt: "2026-07-01T11:00:00.000Z", organizationName: "MVZ Andere", sector: "Praxis", location: "Potsdam", goal: "Anderer Kontakt" }
      ];
      window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA = {
        profiles,
        contacts,
        organizations: [],
        changes: [],
        savedViews: [],
        userSettings: {
          userId: adminId,
          defaultViewType: "contacts",
          tableDensity: "comfortable",
          theme: "system",
          fontScale: 1,
          pageSize: 20,
          preferences: { onboarding: { version: 1, profileCompletedAt: now, tourSkippedAt: now } }
        },
        formats: [],
        hospitationSlots: [],
        hospitations,
        roadmapItems: [],
        hospitationRoadmapAssessments: [],
        hospitationUnmetNeeds: []
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

test("Neuladen zeigt bis zur Zielansicht nur das neutrale Skeleton", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#questionnaire", {
    dataServiceScript: delayedInitialDataServiceScript()
  });

  const appShell = page.locator(".app-shell");
  await expect(appShell).toHaveClass(/is-initializing/);
  await expect(appShell).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#app-initial-skeleton")).toBeVisible();
  await expect(page.locator("#view-map")).toBeHidden();
  await expect(page.locator("#map-view-frame")).toBeHidden();
  await expect(page.locator("#view-questionnaire")).toBeHidden();

  await page.evaluate(() => window.__resolveInitialContacts());

  await expect(appShell).not.toHaveClass(/is-initializing/);
  await expect(appShell).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#app-initial-skeleton")).toBeHidden();
  await expect(page.locator("#view-questionnaire")).toBeVisible();
  await expect(page.locator("#view-map")).toBeHidden();
});

test("Kontakte: Liste und Filtertoolbar rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts");

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator("#filter-panel-button")).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator('[data-sidebar-section-toggle="care"]').filter({ hasText: "Versorgung" })).toHaveCount(1);
  await expect(page.locator('[data-sidebar-section-toggle="stakeholders"]').filter({ hasText: "Stakeholder" })).toHaveCount(1);
  await expect(page.locator('[data-sidebar-section-toggle="formats"]').filter({ hasText: "Formate" })).toHaveCount(1);
  await expect(page.locator('[data-sidebar-section-toggle="hospitations"]')).toHaveCount(0);
  await expect(page.locator('[data-sidebar-section-toggle="planning"]').filter({ hasText: "Hospitation" })).toHaveCount(1);
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveAttribute("aria-label", "Hospitation");
  await expect(page.locator('[data-sidebar-section-toggle="admin"]')).toHaveCount(0);
  const careTabOrder = await page.locator("#sidebar-section-care-content [data-view-tab]").evaluateAll((nodes) => nodes.map((node) => node.querySelector("span:not(.notification-count-indicator)")?.textContent.trim()));
  expect(careTabOrder).toEqual(["Karte", "Kontakte", "Organisationen", "Auswertung", "Aktivitäten"]);
  await expect(page.locator('[data-sidebar-section="care"]')).toHaveClass(/is-expanded/);
  await expect(page.locator('[data-sidebar-section-toggle="care"]')).toHaveAttribute("aria-expanded", "true");
  const stakeholderTabOrder = await page.locator('[data-sidebar-section="stakeholders"] [data-view-tab]').evaluateAll((nodes) => nodes.map((node) => node.querySelector("span:not(.notification-count-indicator)")?.textContent.trim()));
  expect(stakeholderTabOrder).toEqual(["Patienten", "Stakeholder", "Expertenkreis"]);
  await expect(page.locator('[data-sidebar-section="stakeholders"]')).toHaveClass(/is-collapsed/);
  await expect(page.locator('[data-sidebar-section-toggle="stakeholders"]')).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveClass(/is-collapsed/);
  await expect(page.locator('[data-sidebar-section-toggle="planning"]')).toHaveAttribute("aria-expanded", "false");
  const planningTabOrder = await page.locator('[data-sidebar-section="planning"] [data-view-tab]').evaluateAll((nodes) => nodes.map((node) => node.querySelector("span:not(.notification-count-indicator)")?.textContent.trim()));
  expect(planningTabOrder).toEqual(["Framework", "Hospitationen", "Fragebogen", "Beobachtungen", "Muster", "Dashboard"]);
  const formatsTabOrder = await page.locator('[data-sidebar-section="formats"] [data-view-tab]').evaluateAll((nodes) => nodes.map((node) => node.querySelector("span:not(.notification-count-indicator)")?.textContent.trim()));
  expect(formatsTabOrder).toEqual(["Formate"]);
  await expect(page.locator('[data-sidebar-section="formats"]')).toHaveClass(/is-collapsed/);
  await expect(page.locator('[data-sidebar-section-toggle="formats"]')).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-sidebar-section="admin"]')).toHaveCount(0);
  await expect(page.locator("#sidebar-administration-section")).toHaveCount(0);
  await expect(page.locator("#sidebar-import-button")).toHaveCount(0);
  await expect(page.locator('[data-profile-tab="imports"]')).toHaveText("Importe");
  await expect(page.locator('[data-sidebar-section="care"]')).toHaveClass(/is-active-section/);
  await expect(page.locator('[data-sidebar-section="hospitations"]')).toHaveCount(0);
  await expect(page.locator('[data-view-tab="map"]')).toContainText("Karte");
  await expect(page.locator('[data-view-tab="contacts"]')).toContainText("Kontakte");
  await expect(page.locator('[data-view-tab="organizations"]')).toContainText("Organisationen");
  await expect(page.locator('[data-view-tab="framework"]')).toContainText("Framework");
  await expect(page.locator('[data-view-tab="hospitations"]')).toContainText("Hospitationen");
  await expect(page.locator('[data-view-tab="hospitations:observations"]')).toContainText("Beobachtungen");
  await expect(page.locator('[data-view-tab="questionnaire"]')).toContainText("Fragebogen");
  await expect(page.locator('[data-view-tab="hospitations:patterns"]')).toContainText("Muster");
  await expect(page.locator('[data-view-tab="hospitations:dashboard"]')).toContainText("Dashboard");
  await expect(page.locator('[data-view-tab="formats"]')).toContainText("Formate");
  await expect(page.locator('[data-view-tab="stakeholders"]')).toContainText("Stakeholder");
  await expect(page.locator("#care-mode-actions")).toHaveCount(0);
  await expect(page.locator('[data-view-tab="experts"]')).toContainText("Expertenkreis");
  await expect(page.locator("#contact-matching-worklist-button")).toContainText("Dubletten");
  if (!testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#contact-list .owner-avatar-stack").first()).toBeVisible();
  }

  await attachScreenshot(page, testInfo, "kontakte");
});

test("Kontakte: Einwilligungsspalte bewertet, filtert und sortiert nachvollziehbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Spalte, Kopfzeilenfilter und Sortierung werden in der Desktop-Tabelle geprüft.");
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "admin",
    backendFixtureScript: consentBackendFixtureScript()
  });

  const rows = page.locator("#contact-list .row");
  const consentHeader = page.locator("#contacts-table-head .cell--consent");
  const consentBadges = rows.locator(".cell--consent [data-consent-availability]");
  await expect(rows).toHaveCount(7);
  await expect(consentHeader).toContainText("Einwilligung");
  await expect(consentBadges).toHaveCount(7);

  const availableBadge = page.locator('#contact-list .row[data-id="consent-granted-valid"] [data-consent-availability]');
  await expect(availableBadge).toHaveText("Vorhanden");
  await expect(availableBadge).toHaveAttribute("data-consent-availability", "available");
  await expect(availableBadge).toHaveAttribute("data-consent-status", "granted");
  await expect(availableBadge).toHaveAttribute("title", /Detailstatus: Erteilt.*vollständig dokumentiert/);

  const expectedMissing = [
    ["consent-not-requested", "not_requested"],
    ["consent-declined", "declined"],
    ["consent-withdrawn", "withdrawn"],
    ["consent-clarification", "clarification_needed"],
    ["consent-granted-invalid", "granted"],
    ["consent-granted-future", "granted"]
  ];
  for (const [contactId, status] of expectedMissing) {
    const badge = page.locator(`#contact-list .row[data-id="${contactId}"] [data-consent-availability]`);
    await expect(badge).toHaveText("Nicht vorhanden");
    await expect(badge).toHaveAttribute("data-consent-availability", "missing");
    await expect(badge).toHaveAttribute("data-consent-status", status);
  }
  await expect(page.locator('#contact-list .row[data-id="consent-granted-invalid"] [data-consent-availability]')).toHaveAttribute("data-consent-reason", "Wirksamkeitszeitpunkt ist ungültig.");
  await expect(page.locator('#contact-list .row[data-id="consent-granted-future"] [data-consent-availability]')).toHaveAttribute("data-consent-reason", "Wirksamkeitszeitpunkt liegt in der Zukunft.");
  const distinctStatuses = await consentBadges.evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("data-consent-status")))].sort());
  expect(distinctStatuses).toEqual(["clarification_needed", "declined", "granted", "not_requested", "withdrawn"]);

  const filterButton = page.locator('#contacts-table-head [data-header-filter-button][data-header-filter-key="consent"]');
  await filterButton.click();
  await page.locator('[data-header-filter-menu][data-header-filter-key="consent"]:not([hidden]) [data-header-filter-value="available"]').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-id", "consent-granted-valid");

  await filterButton.click();
  await page.locator('[data-header-filter-menu][data-header-filter-key="consent"]:not([hidden]) [data-header-filter-value="missing"]').click();
  await expect(rows).toHaveCount(6);
  await expect(rows.locator('[data-consent-availability="available"]')).toHaveCount(0);

  await filterButton.click();
  await page.locator('[data-header-filter-menu][data-header-filter-key="consent"]:not([hidden]) [data-header-filter-value=""]').click();
  await expect(rows).toHaveCount(7);

  const sortButton = page.locator('#contacts-table-head [data-contact-sort="consent"]');
  await sortButton.click();
  await expect(sortButton).toHaveAttribute("aria-sort", "descending");
  await expect(rows.first()).toHaveAttribute("data-id", "consent-granted-valid");

  await sortButton.click();
  await expect(sortButton).toHaveAttribute("aria-sort", "ascending");
  await expect(rows.first()).toHaveAttribute("data-id", "consent-not-requested");
  await expect(rows.last()).toHaveAttribute("data-id", "consent-granted-valid");
});

test("Kontakte: Gespeicherte Ansicht stellt Einwilligungsfilter und Sortierung wieder her", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Die gespeicherte Tabellenansicht wird in der Desktop-Navigation geprüft.");
  const savedView = {
    id: "consent-missing-view",
    name: "Einwilligung offen",
    scope: "private",
    viewType: "contacts",
    filters: { consentAvailability: ["missing"] },
    searchQuery: "",
    sortKey: "consent_availability",
    sortDirection: "asc",
    pageSize: 20,
    isDefault: false
  };
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "admin",
    backendFixtureScript: consentBackendFixtureScript({ savedViews: [savedView] })
  });

  await page.locator("#view-select-button").click();
  const savedViewButton = page.locator('#view-select-saved-views [data-apply-saved-view="consent-missing-view"]');
  await expect(savedViewButton).toBeVisible();
  await savedViewButton.click();

  const rows = page.locator("#contact-list .row");
  await expect(page.locator("#view-select-label")).toHaveText("Owner: Einwilligung offen");
  await expect(rows).toHaveCount(6);
  await expect(rows.locator('[data-consent-availability="available"]')).toHaveCount(0);
  await expect(page.locator('#contacts-table-head [data-contact-sort="consent"]')).toHaveAttribute("aria-sort", "ascending");
  await expect(rows.first()).toHaveAttribute("data-id", "consent-not-requested");
});

test("Kontakte: Einwilligungsbadge bleibt mobil sichtbar", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Die kompakte Kontaktkarte wird im Mobile-Projekt geprüft.");
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "admin",
    backendFixtureScript: consentBackendFixtureScript()
  });

  const cards = page.locator("#contact-list .mobile-contact-card");
  const badges = cards.locator(".mobile-contact-consent [data-consent-availability]");
  await expect(cards).toHaveCount(6);
  await expect(badges).toHaveCount(6);
  await expect(page.locator('#contact-list .mobile-contact-card[data-id="consent-granted-valid"] [data-consent-availability]')).toHaveText("Vorhanden");
  await expect(page.locator('#contact-list .mobile-contact-card[data-id="consent-granted-invalid"] [data-consent-availability]')).toHaveText("Nicht vorhanden");
  await page.locator('#pagination [data-page-nav="next"]').click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('#contact-list .mobile-contact-card[data-id="consent-granted-future"] [data-consent-availability]')).toHaveText("Nicht vorhanden");
  await expectNoHorizontalOverflow(page);
});

test("Hospitation: Framework-Modul rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#framework");

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "framework", { timeout: 15000 });
  await expect(page.locator(".workspace-header")).toBeHidden();
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveClass(/is-active-section/);
  await expect(page.locator('[data-view-tab="framework"]')).toHaveClass(/is-active/);
  const frameworkView = page.locator("#view-framework");
  await expect(frameworkView).toBeVisible();
  await expect(frameworkView).toContainText("Hospitations-Framework");
  await expect(frameworkView).toContainText("Hospitationen als Wissensformat");
  await expect(frameworkView).toContainText("Von Beobachtung zum nächsten Schritt");
  await expect(frameworkView.locator(".framework-header")).toHaveClass(/hospitation-dashboard-preview-card/);
  await expect(frameworkView.locator(".framework-header strong")).toHaveText("Hospitationen als Wissensformat");
  await expect(frameworkView.locator(".framework-summary-card")).toHaveCount(0);
  await expect(frameworkView.locator(".framework-section-card")).toHaveCount(4);
  await expect(frameworkView.locator(".framework-accordion")).toHaveCount(4);
  await expect(frameworkView.locator(".framework-hero-metric")).toHaveCount(0);
  await expect(frameworkView.locator(".framework-process-card")).toHaveCount(0);
  await expect(frameworkView.locator('[data-framework-accordion="model"]')).toHaveCount(0);
  await expect(frameworkView.locator('[data-framework-accordion="use"]')).toHaveCount(0);
  await expect(frameworkView.locator('[data-framework-accordion="quality"]')).toHaveCount(0);
  await expect(frameworkView.locator('[data-framework-accordion="idea"]')).toHaveCount(0);
  await expect(frameworkView.locator('[data-framework-accordion="goal"]')).toHaveCount(0);
  await expect(frameworkView.locator('[data-framework-accordion="method"]')).toHaveCount(0);
  await expect(frameworkView.locator(".framework-accordion-kicker")).toHaveCount(0);
  await expect(frameworkView.locator('[data-framework-accordion="observations"] .framework-accordion-title')).toHaveText("Beobachtungen");
  await expect(frameworkView.locator('[data-framework-accordion="patterns"] .framework-accordion-title')).toHaveText("Muster");
  await expect(frameworkView.locator('[data-framework-accordion="hypothesis"] .framework-accordion-title')).toHaveText("Hypothesen");
  await expect(frameworkView.locator('[data-framework-accordion="evidence"] .framework-accordion-title')).toHaveText("Nächster Schritt");
  await expect(frameworkView.locator(".framework-accordion-copy")).toHaveCount(0);
  const modelSection = frameworkView.locator(".framework-model-section");
  await expect(modelSection).toBeVisible();
  await expect(modelSection.locator(".framework-model-heading > span")).toHaveCount(0);
  await expect(modelSection.locator("#framework-model-title")).toHaveText("Von Beobachtung zum nächsten Schritt");
  await expect(modelSection.locator(".framework-process-flow")).toBeVisible();
  const frameworkProcessSteps = modelSection.locator(".hospitation-dashboard-funnel-step");
  await expect(frameworkProcessSteps).toHaveCount(4);
  await expect(frameworkProcessSteps.nth(0).locator(".hospitation-dashboard-funnel-badge")).toHaveText("39");
  await expect(frameworkProcessSteps.nth(0).locator(".hospitation-dashboard-funnel-copy > strong")).toHaveText("Beobachtungen");
  await expect(frameworkProcessSteps.nth(1).locator(".hospitation-dashboard-funnel-badge")).toHaveText("8");
  await expect(frameworkProcessSteps.nth(1).locator(".hospitation-dashboard-funnel-copy > strong")).toHaveText("Muster");
  await expect(frameworkProcessSteps.nth(2).locator(".hospitation-dashboard-funnel-badge")).toHaveText("0");
  await expect(frameworkProcessSteps.nth(2).locator(".hospitation-dashboard-funnel-copy > strong")).toHaveText("Hypothesen");
  await expect(frameworkProcessSteps.nth(3).locator(".hospitation-dashboard-funnel-badge")).toHaveText("0");
  await expect(frameworkProcessSteps.nth(3).locator(".hospitation-dashboard-funnel-copy > strong")).toHaveText("Nächster Schritt");
  await expect(modelSection.locator(".hospitation-dashboard-funnel-copy > span")).toHaveCount(0);
  const frameworkProcessButtons = modelSection.locator(".framework-process-button");
  await expect(frameworkProcessButtons).toHaveCount(4);
  await expect(frameworkProcessButtons.nth(3)).toHaveAccessibleName("Mehr zum nächsten Schritt");
  await expect(frameworkProcessButtons).toHaveText([
    "Mehr zum Schritt",
    "Mehr zum Schritt",
    "Mehr zum Schritt",
    "Mehr zum Schritt"
  ]);
  await expect(frameworkView.locator(".framework-step-explainer, .framework-step-card, .framework-source-link")).toHaveCount(0);
  await expect(modelSection).not.toContainText("Epic-Kandidaten");
  await expect(modelSection).not.toContainText("Kontext");
  await expect(modelSection).not.toContainText("Material");
  await expect(modelSection).not.toContainText("Feldnotiz");
  await expect(modelSection).not.toContainText("Setting");
  await expect(frameworkView.locator(".framework-model-divider")).toBeVisible();
  const processButtonCases = [
    { id: "observations", logic: "Beteiligte", example: "Medikationsplan", quality: "ohne Bewertung" },
    { id: "patterns", logic: "gleiche Reibungen oder Umgehungen", example: "gleichen Codes", quality: "wann es nicht auftritt" },
    { id: "hypothesis", logic: "Annahme", example: "bessere Verfügbarkeit", quality: "bestätigt, verändert oder verworfen" },
    { id: "evidence", logic: "Mehrere Quellen", example: "Roadmap", quality: "Gegenbeispiele" }
  ];
  for (const [index, processCase] of processButtonCases.entries()) {
    const button = frameworkProcessButtons.nth(index);
    const lowerAccordion = frameworkView.locator(`[data-framework-accordion="${processCase.id}"]`);
    await expect(button).toHaveAttribute("aria-controls", `framework-accordion-${processCase.id}`);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(lowerAccordion).toHaveAttribute("open", "");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(frameworkView.locator(".framework-accordion[open]")).toHaveCount(1);
    await expect(lowerAccordion.locator(".framework-step-row p").first()).toBeVisible();
    await expect(lowerAccordion.locator(".framework-step-row").nth(0)).toContainText(processCase.logic);
    await expect(lowerAccordion.locator(".framework-step-row").nth(1)).toContainText(processCase.example);
    await expect(lowerAccordion.locator(".framework-step-row").nth(2)).toContainText(processCase.quality);
    await expect(lowerAccordion.locator(".framework-publication-card")).toHaveCount(1);
    for (let buttonIndex = 0; buttonIndex < processButtonCases.length; buttonIndex += 1) {
      await expect(frameworkProcessButtons.nth(buttonIndex)).toHaveAttribute("aria-expanded", buttonIndex === index ? "true" : "false");
    }
  }
  const dividerMarginTop = await frameworkView.locator(".framework-model-divider").evaluate((divider) =>
    Number.parseFloat(getComputedStyle(divider).marginTop)
  );
  expect(dividerMarginTop).toBeGreaterThanOrEqual(20);
  const lowerStepAccordions = [
    {
      id: "observations",
      title: "Beobachtungen",
      text: "qualitativer Zugang",
      example: "fehlende Information",
      source: "https://www.sciencedirect.com/science/article/pii/S2532204425001108",
      badge: "PDF",
      publication: "Using observation to better understand the healthcare context",
      summary: "Die Publikation zeigt, dass Beobachtungen reale Abläufe, Rollen und Kontext sichtbar machen. Sie begründet, warum Hospitationen neben Gesprächen eine belastbare qualitative Quelle sind.",
      authors: "Weston, Krein & Harrod",
      journal: "Qualitative Research in Medicine & Healthcare, 2021"
    },
    {
      id: "patterns",
      title: "Muster",
      text: "wiederkehrender Zusammenhang",
      example: "gleichen Codes",
      source: "https://link.springer.com/content/pdf/10.1186/1471-2288-13-117.pdf",
      badge: "PDF",
      publication: "Using the framework method for the analysis of qualitative data",
      summary: "Die Publikation beschreibt, wie qualitative Daten systematisch nach Fällen und Themen geordnet werden. Das passt zur Musterbildung, weil Beobachtungen vergleichbar bleiben und trotzdem verdichtet werden.",
      authors: "Gale, Heath, Cameron et al.",
      journal: "BMC Medical Research Methodology, 2013"
    },
    {
      id: "hypothesis",
      title: "Hypothesen",
      text: "prüfbare Annahme",
      example: "bessere Verfügbarkeit",
      source: "https://www.sciencedirect.com/science/article/pii/S0165178119307917",
      badge: "Artikel",
      publication: "Qualitative methods in implementation research",
      summary: "Die Publikation erklärt, warum qualitative Forschung in der Implementierung die Warum- und Wie-Fragen klärt. Daraus können prüfbare Annahmen entstehen, ohne sofort eine Lösung festzulegen.",
      authors: "Hamilton & Finley",
      journal: "Psychiatry Research, 2019"
    },
    {
      id: "evidence",
      title: "Nächster Schritt",
      text: "tragfähig genug",
      example: "Roadmap- oder Portfolioentscheidung",
      source: "https://www.sciencedirect.com/science/article/pii/S2772628222000218",
      badge: "PDF",
      publication: "Direct observation methods: A practical guide",
      summary: "Die Publikation zeigt, wie direkte Beobachtung in Gesundheitsforschung sauber geplant und dokumentiert wird. Sie stützt die Idee, aus mehreren geprüften Hinweisen tragfähige Entscheidungsgrundlagen zu bilden.",
      authors: "Fix, Kim, Ruben & McCullough",
      journal: "PEC Innovation, 2022"
    }
  ];
  for (const lowerStep of lowerStepAccordions) {
    const lowerAccordion = frameworkView.locator(`[data-framework-accordion="${lowerStep.id}"]`);
    await expect(lowerAccordion.locator(".framework-accordion-title")).toHaveText(lowerStep.title);
    await lowerAccordion.locator("summary").click();
    const publicationCard = lowerAccordion.locator(".framework-publication-card");
    await expect(publicationCard).toBeVisible();
    await expect(publicationCard).toHaveAttribute("href", lowerStep.source);
    await expect(publicationCard.locator(".framework-publication-label")).toHaveText("Wissenschaftliche Grundlage");
    await expect(publicationCard.locator(".framework-publication-preview__tag")).toHaveText(lowerStep.badge);
    await expect(publicationCard).toContainText(lowerStep.publication);
    await expect(publicationCard.locator(".framework-publication-summary")).toHaveText(lowerStep.summary);
    await expect(publicationCard).toContainText(lowerStep.authors);
    await expect(publicationCard).toContainText(lowerStep.journal);
    await expect(lowerAccordion.locator(".framework-step-guide")).toBeVisible();
    await expect(lowerAccordion.locator(".framework-step-layout")).toBeVisible();
    await expect(frameworkView.locator(".framework-accordion[open]")).toHaveCount(1);
    const publicationPlacement = await lowerAccordion.evaluate((accordion) => {
      const guide = accordion.querySelector(".framework-step-guide");
      const card = accordion.querySelector(".framework-publication-card");
      const siblings = Array.from(guide?.parentElement?.children || []);
      const guideRect = guide?.getBoundingClientRect();
      const cardRect = card?.getBoundingClientRect();
      return Boolean(
        guide &&
        card &&
        siblings.indexOf(guide) < siblings.indexOf(card) &&
        guideRect &&
        cardRect &&
        cardRect.top >= guideRect.bottom - 1
      );
    });
    expect(publicationPlacement).toBe(true);
    const previewHeight = await publicationCard.locator(".framework-publication-preview").evaluate((preview) =>
      preview.getBoundingClientRect().height
    );
    expect(previewHeight).toBeLessThanOrEqual(122);
    await expect(lowerAccordion.locator(".framework-step-row")).toHaveCount(3);
    await expect(lowerAccordion.locator(".framework-step-label")).toHaveText(["Qualitative Logik", "Beispielpfad", "Qualität"]);
    await expect(lowerAccordion.locator(".framework-compact-item")).toHaveCount(0);
    await expect(lowerAccordion.locator(".framework-step-source")).toHaveCount(0);
    await expect(lowerAccordion).toContainText(lowerStep.text);
    await expect(lowerAccordion).toContainText(lowerStep.example);
    await lowerAccordion.locator("summary").click();
  }
  await expect(frameworkView).not.toContainText("Sachlich bleiben");
  await expect(frameworkView).not.toContainText("Anschluss an Muster");
  await expect(frameworkView).toContainText("Relevanz");
  await expect(frameworkView).toContainText("Prozessphase");
  await expect(frameworkView).toContainText("Problemtyp");
  if ((page.viewportSize()?.width || 0) >= 900) {
    const stepBoxes = await modelSection.locator(".hospitation-dashboard-funnel-step").evaluateAll((steps) =>
      steps.map((step) => step.getBoundingClientRect().left)
    );
    expect(stepBoxes[0]).toBeLessThan(stepBoxes[1]);
    expect(stepBoxes[1]).toBeLessThan(stepBoxes[2]);
    expect(stepBoxes[2]).toBeLessThan(stepBoxes[3]);
    const processRail = await modelSection.locator(".framework-process-flow").evaluate((flow) => {
      const style = getComputedStyle(flow, "::before");
      return {
        display: style.display,
        content: style.content
      };
    });
    expect(processRail.display).toBe("none");
    expect(processRail.content).toBe("none");
    const processArrow = await frameworkProcessSteps.nth(1).evaluate((step) => {
      const style = getComputedStyle(step, "::before");
      return {
        content: style.content,
        display: style.display,
        width: Number.parseFloat(style.width || "0")
      };
    });
    expect(processArrow.content).toContain("→");
    expect(processArrow.display).toBe("grid");
    expect(processArrow.width).toBeGreaterThanOrEqual(36);
    const firstBadgeOffset = await frameworkProcessSteps.first().evaluate((step) => {
      const stepRect = step.getBoundingClientRect();
      const badgeRect = step.querySelector(".hospitation-dashboard-funnel-badge")?.getBoundingClientRect();
      return badgeRect ? badgeRect.top - stepRect.top : 0;
    });
    expect(firstBadgeOffset).toBeLessThan(0);
  }
  await expect(page.locator(".controls")).toBeHidden();
  if (testInfo.project.name.includes("mobile")) {
    const mobileProcessButtons = frameworkView.locator(".framework-process-flow .framework-process-button");
    await expect(mobileProcessButtons).toHaveCount(4);
    const processButtonDisplays = await mobileProcessButtons.evaluateAll((items) => items.map((item) => getComputedStyle(item).display));
    expect(processButtonDisplays.every((display) => display !== "none")).toBe(true);
    await expect(page.locator(".app-sidebar")).toHaveCSS("width", `${page.viewportSize()?.width}px`);
    await expect(page.locator(".app-sidebar")).toHaveCSS("height", "60px");
    await expectNoHorizontalOverflow(page);
  }

  await attachScreenshot(page, testInfo, "planung-framework");
});

test("Hospitation: Beobachtungsseite zeigt das Framework mit Beobachtungsfokus", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations:observations");

  const panel = page.locator("#hospitation-observations-panel");
  const reminder = panel.locator("[data-hospitation-framework-reminder]");
  const steps = reminder.locator("[data-hospitation-framework-step]");
  await expect(panel).toBeVisible();
  await expect(reminder).toBeVisible();
  await expect(reminder.getByRole("heading", { name: "Framework", exact: true })).toBeVisible();
  await expect(reminder.locator(".hospitation-pattern-framework-reminder__intro > span")).toHaveText("Von Beobachtung zum nächsten Schritt");
  await expect(steps).toHaveCount(4);
  await expect(steps.locator(".hospitation-pattern-framework-reminder__copy > strong")).toHaveText([
    "Beobachtungen",
    "Muster",
    "Hypothesen",
    "Nächster Schritt"
  ]);
  await expect(reminder.locator("[data-hospitation-framework-count]")).toHaveText(["39", "8", "0", "0"]);
  const currentStep = reminder.locator('[aria-current="step"]');
  await expect(currentStep).toHaveCount(1);
  await expect(currentStep).toHaveAttribute("data-hospitation-framework-step", "observations");
  await expect(currentStep).toHaveClass(/is-current/);
  await expect(panel.locator(".observation-summary-strip")).toHaveCount(0);
  const observationActionRow = panel.locator(".observation-action-row");
  const observationActionLayout = await observationActionRow.evaluate((row) => {
    const controls = [...row.querySelectorAll("[data-observation-new], [data-observation-export], [data-observation-columns-button]")]
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, centerY: rect.top + rect.height / 2 };
      });
    return { controls, overflow: row.scrollWidth - row.clientWidth };
  });
  expect(observationActionLayout.controls).toHaveLength(4);
  expect(observationActionLayout.overflow).toBeLessThanOrEqual(1);
  if (testInfo.project.name.includes("mobile")) {
    expect(Math.max(...observationActionLayout.controls.slice(1).map((control) => control.centerY))
      - Math.min(...observationActionLayout.controls.slice(1).map((control) => control.centerY))).toBeLessThanOrEqual(2);
    expect(observationActionLayout.controls[0].bottom).toBeLessThanOrEqual(observationActionLayout.controls[1].top + 1);
  } else {
    expect(Math.max(...observationActionLayout.controls.map((control) => control.centerY))
      - Math.min(...observationActionLayout.controls.map((control) => control.centerY))).toBeLessThanOrEqual(2);
  }

  const visualHierarchy = await reminder.evaluate((element) => {
    const intro = element.querySelector(".hospitation-pattern-framework-reminder__intro")?.getBoundingClientRect();
    const flow = element.querySelector(".hospitation-pattern-framework-reminder__flow")?.getBoundingClientRect();
    const heading = element.querySelector(".hospitation-pattern-framework-reminder__intro > strong");
    const subtitle = element.querySelector(".hospitation-pattern-framework-reminder__intro > span");
    return {
      gap: (flow?.top || 0) - (intro?.bottom || 0),
      headingWeight: Number.parseInt(heading ? getComputedStyle(heading).fontWeight : "0", 10),
      subtitleWeight: Number.parseInt(subtitle ? getComputedStyle(subtitle).fontWeight : "0", 10),
      overflow: element.scrollWidth - element.clientWidth
    };
  });
  expect(visualHierarchy.gap).toBeGreaterThanOrEqual(8);
  expect(visualHierarchy.headingWeight).toBeGreaterThan(visualHierarchy.subtitleWeight);
  expect(visualHierarchy.overflow).toBeLessThanOrEqual(1);

  const pointEmphasis = await steps.evaluateAll((items) => items.map((step) => {
    const badge = step.querySelector(".hospitation-pattern-framework-reminder__badge");
    const style = badge ? getComputedStyle(badge) : null;
    return {
      current: step.getAttribute("aria-current") === "step",
      width: style ? Number.parseFloat(style.width) : 0,
      outlineWidth: style ? Number.parseFloat(style.outlineWidth) : 0
    };
  }));
  const activePoint = pointEmphasis.find((point) => point.current);
  const inactivePoints = pointEmphasis.filter((point) => !point.current);
  expect(activePoint?.width || 0).toBeGreaterThan(Math.max(...inactivePoints.map((point) => point.width)));
  expect(activePoint?.outlineWidth || 0).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(page, testInfo, "hospitation-beobachtungen-framework");
});

test("Hospitation: Musterseite zeigt alle abgeleiteten Muster", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations:patterns");

  await expect(page).toHaveURL(/#hospitations:patterns$/);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "hospitations");
  await expect(page.locator('[data-view-tab="hospitations:patterns"]')).toHaveClass(/is-active/);
  const panel = page.locator("#hospitation-patterns-panel");
  const cards = panel.locator("[data-hospitation-pattern]");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Muster", exact: true })).toBeVisible();
  const patternFramework = panel.locator("[data-hospitation-framework-reminder]");
  const patternFrameworkSteps = patternFramework.locator("[data-hospitation-framework-step]");
  await expect(patternFramework).toBeVisible();
  await expect(patternFramework.getByRole("heading", { name: "Framework", exact: true })).toBeVisible();
  await expect(patternFramework.locator(".hospitation-pattern-framework-reminder__intro > span")).toHaveText("Von Beobachtung zum nächsten Schritt");
  await expect(patternFrameworkSteps).toHaveCount(4);
  await expect(patternFrameworkSteps.locator(".hospitation-pattern-framework-reminder__copy > strong")).toHaveText([
    "Beobachtungen",
    "Muster",
    "Hypothesen",
    "Nächster Schritt"
  ]);
  await expect(patternFramework.locator("[data-hospitation-framework-count]")).toHaveText(["39", "8", "0", "0"]);
  const currentFrameworkStep = patternFramework.locator('[aria-current="step"]');
  await expect(currentFrameworkStep).toHaveCount(1);
  await expect(currentFrameworkStep).toHaveAttribute("data-hospitation-framework-step", "patterns");
  await expect(currentFrameworkStep).toHaveClass(/is-current/);
  await expect(patternFramework).not.toContainText("Aktuelle Seite");
  const frameworkHierarchy = await patternFramework.evaluate((reminder) => {
    const intro = reminder.querySelector(".hospitation-pattern-framework-reminder__intro")?.getBoundingClientRect();
    const flow = reminder.querySelector(".hospitation-pattern-framework-reminder__flow")?.getBoundingClientRect();
    const heading = reminder.querySelector(".hospitation-pattern-framework-reminder__intro > strong");
    const subtitle = reminder.querySelector(".hospitation-pattern-framework-reminder__intro > span");
    return {
      gap: (flow?.top || 0) - (intro?.bottom || 0),
      headingWeight: Number.parseInt(heading ? getComputedStyle(heading).fontWeight : "0", 10),
      subtitleWeight: Number.parseInt(subtitle ? getComputedStyle(subtitle).fontWeight : "0", 10)
    };
  });
  expect(frameworkHierarchy.gap).toBeGreaterThanOrEqual(8);
  expect(frameworkHierarchy.headingWeight).toBeGreaterThan(frameworkHierarchy.subtitleWeight);
  const frameworkPointEmphasis = await patternFrameworkSteps.evaluateAll((steps) => steps.map((step) => {
    const badge = step.querySelector(".hospitation-pattern-framework-reminder__badge");
    const style = badge ? getComputedStyle(badge) : null;
    return {
      current: step.getAttribute("aria-current") === "step",
      width: style ? Number.parseFloat(style.width) : 0,
      outlineWidth: style ? Number.parseFloat(style.outlineWidth) : 0,
      shadow: style?.boxShadow || "none"
    };
  }));
  const activeFrameworkPoint = frameworkPointEmphasis.find((point) => point.current);
  const inactiveFrameworkPoints = frameworkPointEmphasis.filter((point) => !point.current);
  expect(activeFrameworkPoint?.width || 0).toBeGreaterThan(Math.max(...inactiveFrameworkPoints.map((point) => point.width)));
  expect(activeFrameworkPoint?.outlineWidth || 0).toBeGreaterThan(0);
  expect(activeFrameworkPoint?.shadow).not.toBe("none");
  await expect(panel.locator(".observation-summary-strip")).toHaveCount(0);
  await expect(cards).toHaveCount(8);
  await expect(cards).not.toHaveCount(4);
  const patternTable = panel.locator("[data-hospitation-pattern-table]");
  const patternTableHead = patternTable.locator("[data-hospitation-pattern-table-head]");
  await expect(patternTable).toBeVisible();
  await expect(patternTableHead.locator("span:not([aria-hidden])")).toHaveText(["ID", "Muster", "Codierung", "Beobachtungen", "Hospitationen"]);
  if (testInfo.project.name.includes("mobile")) {
    await expect(patternTableHead).toBeHidden();
  } else {
    await expect(patternTableHead).toBeVisible();
    const patternColumnTemplates = await Promise.all([
      patternTableHead.evaluate((node) => getComputedStyle(node).gridTemplateColumns),
      cards.first().locator("[data-hospitation-pattern-select]").evaluate((node) => getComputedStyle(node).gridTemplateColumns)
    ]);
    expect(patternColumnTemplates[0]).toBe(patternColumnTemplates[1]);
  }
  const grid = panel.locator(".hospitation-patterns-grid");
  await expect(grid).toBeVisible();
  await expect.poll(() => grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length)).toBe(1);
  await expect.poll(async () => {
    const cardRects = await cards.evaluateAll((items) => items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width };
    }));
    const sameColumn = cardRects.every((rect) => Math.abs(rect.left - cardRects[0].left) <= 1 && Math.abs(rect.width - cardRects[0].width) <= 1);
    const ascendingRows = cardRects.slice(1).every((rect, index) => rect.top > cardRects[index].top);
    return sameColumn && ascendingRows;
  }).toBe(true);
  const examplePattern = cards.filter({ hasText: "positives Muster / Best Practice in Befund / Dokumentation" });
  await expect(examplePattern.locator('.hospitation-pattern-card__metric[aria-label="4 Hospitationen"]')).toBeVisible();
  const exampleCoding = examplePattern.locator(".hospitation-pattern-card__coding");
  await expect(exampleCoding.locator(".hospitation-dashboard-derived-code-badge")).toHaveCount(2);
  await expect(exampleCoding.locator(".hospitation-dashboard-derived-code-badge--problem")).toHaveText("positives Muster / Best Practice");
  await expect(exampleCoding.locator(".hospitation-dashboard-derived-code-badge--phase")).toHaveText("Befund / Dokumentation");
  await expect(panel.locator("[data-hospitation-pattern].is-selected")).toHaveCount(0);
  await expect(panel.locator("[data-hospitation-pattern-observations]")).toHaveCount(0);
  await expect(panel.locator("[data-hospitation-pattern-open]")).toHaveCount(0);
  await expect(panel.locator(".hospitation-patterns-section-count")).toHaveCount(0);
  await examplePattern.locator("[data-hospitation-pattern-select]").click();
  await expect(examplePattern.locator("[data-hospitation-pattern-select]")).toHaveAttribute("aria-pressed", "true");
  await expect(examplePattern).toHaveClass(/is-selected/);
  await expect(panel.locator("[data-hospitation-pattern].is-selected")).toHaveCount(1);
  const filteredPanel = panel.locator("[data-hospitation-pattern-observations]");
  const filteredRows = filteredPanel.locator("[data-hospitation-pattern-observation]");
  await expect(filteredPanel).toBeVisible();
  await expect(filteredRows).toHaveCount(4);
  await expect(examplePattern.getByText("positives Muster / Best Practice in Befund / Dokumentation", { exact: true })).toHaveCount(1);
  await expect(filteredPanel.locator(".hospitation-pattern-evidence-summary")).toHaveCount(0);
  await expect(filteredPanel.locator(".hospitation-pattern-evidence-note")).toHaveCount(0);
  await expect(filteredPanel.locator(".hospitation-pattern-card__sources")).toHaveCount(0);
  await expect(filteredPanel.locator(".hospitation-dashboard-derived-code-badge")).toHaveCount(0);
  await expect(filteredRows.locator(".observation-coding-badge")).toHaveCount(0);
  await expect.poll(async () => (await filteredRows.locator("[data-hospitation-pattern-observation-title]").allTextContents())
    .sort((left, right) => left.localeCompare(right, "de"))).toEqual([
    "Abweichung wird im Übergabeblatt sichtbar gemacht",
    "Arztbrief erreicht die Praxis ohne Postweg",
    "Drei Unterlagen verwenden unterschiedliche Bezeichnungen",
    "Korrigierte Liste trifft über KIM ein"
  ].sort((left, right) => left.localeCompare(right, "de")));
  await expect(filteredPanel).not.toContainText("Signaturdialog blockiert den nächsten Vorgang");
  await expect(filteredRows.locator(".avatar")).toHaveCount(4);
  await expect(filteredPanel).toContainText("Demo-Team Hausarztversorgung 01");
  await expect(filteredPanel).toContainText("Demo-Praxis Stadtpark 01");
  await expect(filteredPanel).toContainText("Ambulante Versorgung");
  await expectNoHorizontalOverflow(page);
  await expect.poll(() => panel.locator("[data-hospitation-pattern], [data-hospitation-pattern-observation]")
    .evaluateAll((items) => items.filter((item) => item.scrollWidth > item.clientWidth + 1).length)).toBe(0);
  await examplePattern.locator("[data-hospitation-pattern-select]").click();
  await expect(examplePattern.locator("[data-hospitation-pattern-select]")).toHaveAttribute("aria-expanded", "false");
  await expect(panel.locator("[data-hospitation-pattern].is-selected")).toHaveCount(0);
  await expect(panel.locator("[data-hospitation-pattern-observations]")).toHaveCount(0);
  await attachScreenshot(page, testInfo, "hospitation-muster");
});

test("Hospitation: Fragebogen-Modul rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#questionnaire");

  await expect(page.locator(".workspace-header")).toBeHidden();
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveClass(/is-active-section/);
  await expect(page.locator('[data-view-tab="questionnaire"]')).toHaveClass(/is-active/);
  await expect(page.locator("#hospitation-questionnaire-form")).toBeVisible();
  const questionnaireHeader = page.locator("#view-questionnaire .questionnaire-toolbar");
  await expect(questionnaireHeader).toHaveClass(/hospitation-dashboard-preview-card/);
  await expect(questionnaireHeader.locator(".hospitation-dashboard-preview-copy strong")).toHaveText("Hospitations-Fragebogen");
  const questionnaireOrganization = page.locator("#questionnaire-organization");
  const questionnaireContact = page.locator("#questionnaire-contact");
  const questionnaireSector = page.locator("#questionnaire-setting");
  const questionnaireContainer = page.locator("#questionnaire-hospitation-container");
  const questionnaireContainerShell = page.locator('[data-select-type="questionnaire-hospitation-container"]');
  const questionnaireSectorShell = page.locator('[data-select-type="questionnaire-sector"]');
  const questionnaireOrganizationShell = page.locator('[data-select-type="questionnaire-organization"]');
  const questionnaireContactShell = page.locator('[data-select-type="questionnaire-contact"]');
  const typeCustomSelectSearch = async (shell, query) => {
    const searchInput = shell.locator("[data-custom-select-search-input]");
    await searchInput.click();
    await searchInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await searchInput.press("Backspace");
    await page.keyboard.type(query);
    await expect(searchInput).toHaveValue(query);
  };
  await expect(questionnaireContainer).toHaveValue("__new__");
  await expect(questionnaireContainerShell.locator(".custom-select-trigger")).toBeVisible();
  await expect(page.locator('label[for="questionnaire-hospitation-container"]')).toHaveText("Termin");
  await expect(questionnaireContainer.locator('option[value="__new__"]')).toHaveText("Neuen Termin anlegen");
  await expect(page.locator('label[for="questionnaire-setting"]')).toHaveText("Sektor");
  await expect(questionnaireSectorShell.locator(".custom-select-trigger")).toBeVisible();
  await expect(questionnaireOrganizationShell.locator(".custom-select-trigger")).toBeVisible();
  await expect(questionnaireContactShell.locator(".custom-select-trigger")).toBeVisible();
  if (!testInfo.project.name.includes("mobile")) {
    const contextFieldRows = await page.locator(".questionnaire-meta-grid").evaluate((grid) => {
      const fieldFor = (selector) => grid.querySelector(selector)?.closest(".questionnaire-field")?.getBoundingClientRect();
      const container = fieldFor("#questionnaire-hospitation-container");
      const date = fieldFor("#questionnaire-date");
      const sector = fieldFor("#questionnaire-setting");
      const organization = fieldFor("#questionnaire-organization");
      const contact = fieldFor("#questionnaire-contact");
      return {
        containerTop: container?.top || 0,
        dateTop: date?.top || 0,
        sectorTop: sector?.top || 0,
        sectorLeft: sector?.left || 0,
        dateLeft: date?.left || 0,
        organizationTop: organization?.top || 0,
        contactTop: contact?.top || 0,
        organizationWidth: organization?.width || 0,
        contactWidth: contact?.width || 0
      };
    });
    expect(Math.abs(contextFieldRows.containerTop - contextFieldRows.sectorTop)).toBeLessThanOrEqual(3);
    expect(Math.abs(contextFieldRows.dateTop - contextFieldRows.sectorTop)).toBeLessThanOrEqual(3);
    expect(contextFieldRows.sectorLeft).toBeGreaterThan(contextFieldRows.dateLeft);
    expect(Math.abs(contextFieldRows.organizationTop - contextFieldRows.contactTop)).toBeLessThanOrEqual(3);
    expect(contextFieldRows.organizationWidth).toBeGreaterThan(240);
    expect(contextFieldRows.contactWidth).toBeGreaterThan(240);
  }
  await expect(page.locator('textarea[name="questionnaireGoal"]')).toHaveCount(0);
  await expect(page.locator('textarea[name="questionnaireProcess"]')).toHaveCount(0);
  await expect(page.locator("#questionnaire-context-goal-title")).toHaveText("Ziel");
  await expect(page.locator("#questionnaire-context-notes")).toBeVisible();
  await expect(page.locator("#questionnaire-context-notes")).toHaveAttribute("aria-label", "Ziel der Hospitation");
  await expect(page.locator('label[for="questionnaire-context-notes"]')).toHaveCount(0);
  await expect(page.locator("#view-questionnaire .questionnaire-panel")).toHaveCount(0);
  await expect(page.locator("#view-questionnaire .questionnaire-context-goal .questionnaire-question-list")).toHaveCount(0);
  await expect(page.locator("#view-questionnaire .questionnaire-context-goal")).not.toContainText("Nach der Hospitation möchte ich besser verstehen");
  await expect(page.locator("#view-questionnaire .questionnaire-context-goal")).not.toContainText("Ziel der Hospitation");
  await expect(page.locator("#view-questionnaire")).not.toContainText("Welche maximal drei Leitfragen");
  const questionnaireSteps = page.locator("#view-questionnaire [data-questionnaire-step]");
  const questionnaireContextStep = page.locator('[data-questionnaire-step="1"]');
  const questionnaireObservationStep = page.locator('[data-questionnaire-step="2"]');
  const questionnaireCodingStep = page.locator('[data-questionnaire-step="3"]');
  const questionnaireMaterialStep = page.locator('[data-questionnaire-step="4"]');
  const questionnaireProductStep = page.locator('[data-questionnaire-step="5"]');
  const questionnaireReflectionStep = page.locator('[data-questionnaire-step="6"]');
  const questionnaireEvidenceStep = page.locator('[data-questionnaire-step="7"]');
  const completeQuestionnaireStep = async (step) => {
    if (testInfo.project.name.includes("mobile")) {
      await page.locator("[data-questionnaire-step-next]").click();
    } else {
      await step.getByRole("button", { name: "Schritt abschließen" }).click();
    }
  };
  await expect(questionnaireSteps).toHaveCount(7);
  await expect(questionnaireContextStep).toHaveAttribute("open", "");
  await expect(questionnaireContextStep).toHaveClass(/questionnaire-section--meta/);
  await expect(page.locator("#questionnaire-context-title")).toContainText("Hospitationskontext");
  await expect(questionnaireContextStep).toContainText("Meta-Informationen");
  await expect(questionnaireObservationStep).not.toHaveAttribute("open", "");
  await expect(questionnaireCodingStep).not.toHaveAttribute("open", "");
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.locator("[data-questionnaire-mobile-progress]")).toBeVisible();
    await expect(page.locator("[data-questionnaire-progress-label]")).toHaveText("Schritt 1 von 7");
    await expect(page.locator("[data-questionnaire-mobile-navigation]")).toBeVisible();
    await expect(page.locator("[data-questionnaire-step-previous]")).toBeDisabled();
    await expect(page.locator("[data-questionnaire-step-next]")).toHaveText("Weiter");
    await expectNoHorizontalOverflow(page);
    await attachScreenshot(page, testInfo, "planung-fragebogen-start");
  }

  await questionnaireContainerShell.locator(".custom-select-trigger").click();
  await expect(questionnaireContainerShell.locator(".custom-select-panel")).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    const panelBounds = await questionnaireContainerShell.locator(".custom-select-panel").evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return { left: rect.left, right: rect.right, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
    });
    expect(panelBounds.left).toBeGreaterThanOrEqual(58);
    expect(panelBounds.right).toBeLessThanOrEqual(panelBounds.viewportWidth);
    expect(panelBounds.bottom).toBeLessThanOrEqual(panelBounds.viewportHeight);
  }
  await expect(questionnaireContainerShell.locator("[data-custom-select-search-input]")).toHaveAttribute("placeholder", "Termin suchen...");
  await expect(questionnaireContainerShell.locator("[data-custom-select-search-input]")).toBeFocused();
  await typeCustomSelectSearch(questionnaireContainerShell, "Hausarztversorgung 01");
  await expect(questionnaireContainerShell.locator(".custom-select-option", { hasText: "Demo-Team Hausarztversorgung 01" })).toBeVisible();
  await expect(questionnaireContainerShell.locator(".custom-select-option .avatar, .custom-select-option .organization-logo").first()).toBeVisible();
  await expect(questionnaireContainerShell.locator(".custom-select-option", { hasText: "Neuen Termin anlegen" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await questionnaireSectorShell.locator(".custom-select-trigger").click();
  await expect(questionnaireSectorShell.locator(".custom-select-panel")).toBeVisible();
  await expect(questionnaireSectorShell.locator("[data-custom-select-search-input]")).toHaveAttribute("placeholder", "Sektor suchen...");
  await typeCustomSelectSearch(questionnaireSectorShell, "Pflege");
  await expect(questionnaireSectorShell.locator(".custom-select-empty")).toBeHidden();
  await expect(questionnaireSectorShell.locator(".custom-select-option", { hasText: "Praxis" })).toHaveCount(0);
  await questionnaireSectorShell.locator(".custom-select-option", { hasText: "Pflege" }).click();
  await expect(questionnaireSector).toHaveValue("Pflege");
  await expect(questionnaireOrganization.locator('option[value="demo-org-havelpflege"]')).toHaveCount(1);
  await expect(questionnaireOrganization.locator('option[value="demo-org-nordstadt"]')).toHaveCount(0);
  await expect(questionnaireContact.locator('option[value="demo-contact-02"]')).toHaveCount(1);
  await expect(questionnaireContact.locator('option[value="demo-contact-01"]')).toHaveCount(0);

  await questionnaireOrganizationShell.locator(".custom-select-trigger").click();
  await expect(questionnaireOrganizationShell.locator(".custom-select-panel")).toBeVisible();
  await expect(questionnaireOrganizationShell.locator("[data-custom-select-search-input]")).toBeVisible();
  await expect(questionnaireOrganizationShell.locator(".custom-select-option .organization-logo").first()).toBeVisible();
  await typeCustomSelectSearch(questionnaireOrganizationShell, "keine organisation");
  await expect(questionnaireOrganizationShell.locator(".custom-select-empty")).toBeVisible();
  await typeCustomSelectSearch(questionnaireOrganizationShell, "Havelblick");
  await expect(questionnaireOrganizationShell.locator(".custom-select-empty")).toBeHidden();
  await questionnaireOrganizationShell.locator(".custom-select-option", { hasText: "Pflegeverbund Havelblick" }).click();
  await expect(questionnaireOrganization).toHaveValue("demo-org-havelpflege");
  await expect(questionnaireOrganizationShell.locator(".custom-select-trigger__label .organization-logo")).toBeVisible();
  await expect(questionnaireContact.locator('option[value="demo-contact-02"]')).toHaveCount(1);
  await expect(questionnaireContact.locator('option[value="demo-contact-03"]')).toHaveCount(0);

  await questionnaireContactShell.locator(".custom-select-trigger").click();
  await expect(questionnaireContactShell.locator(".custom-select-panel")).toBeVisible();
  await expect(questionnaireContactShell.locator("[data-custom-select-search-input]")).toBeVisible();
  await expect(questionnaireContactShell.locator(".custom-select-option .avatar").first()).toBeVisible();
  await typeCustomSelectSearch(questionnaireContactShell, "keine person");
  await expect(questionnaireContactShell.locator(".custom-select-empty")).toBeVisible();
  await typeCustomSelectSearch(questionnaireContactShell, "Demo-Kontakt 02");
  await expect(questionnaireContactShell.locator(".custom-select-empty")).toBeHidden();
  await questionnaireContactShell.locator(".custom-select-option", { hasText: "Demo-Kontakt 02" }).click();
  await expect(questionnaireOrganization).toHaveValue("demo-org-havelpflege");
  await expect(questionnaireSector).toHaveValue("Pflege");
  await expect(questionnaireContactShell.locator(".custom-select-trigger__label .avatar")).toBeVisible();

  await questionnaireSectorShell.locator(".custom-select-trigger").click();
  await questionnaireSectorShell.locator(".custom-select-option", { hasText: "Praxis" }).click();
  await expect(questionnaireSector).toHaveValue("Praxis");
  await expect(questionnaireOrganization).toHaveValue("");
  await expect(questionnaireContact).toHaveValue("");
  await expect(questionnaireOrganization.locator('option[value="demo-org-nordstadt"]')).toHaveCount(1);
  await expect(questionnaireOrganization.locator('option[value="demo-org-havelpflege"]')).toHaveCount(0);
  await expect(questionnaireContact.locator('option[value="demo-contact-01"]')).toHaveCount(1);
  await expect(questionnaireContact.locator('option[value="demo-contact-02"]')).toHaveCount(0);
  await questionnaireOrganization.selectOption("demo-org-nordstadt");
  await expect(questionnaireOrganization).toHaveValue("demo-org-nordstadt");
  await page.locator("#questionnaire-date").fill("2026-07-10");
  await expect(page.locator("#questionnaire-print-button")).toHaveCount(0);
  await expect(page.locator("#questionnaire-copy-button")).toHaveCount(0);
  await expect(page.locator('#view-questionnaire button[type="reset"]', { hasText: "Leeren" })).toHaveCount(0);
  const questionnaireWordDownload = page.locator('#view-questionnaire a[download="Mitmachen-Hospitations-Framework.docx"]');
  const questionnairePdfDownload = page.locator('#view-questionnaire a[download="Mitmachen-Hospitations-Framework.pdf"]');
  await expect(questionnaireWordDownload).toHaveText("Word");
  await expect(questionnairePdfDownload).toHaveText("PDF");
  await expect(questionnaireWordDownload.locator(".action-button__icon svg")).toBeVisible();
  await expect(questionnairePdfDownload.locator(".action-button__icon svg")).toBeVisible();
  await expect(questionnaireWordDownload).toHaveAttribute("href", "../../public/hospitation/mitmachen-hospitations-framework.docx");
  await expect(questionnairePdfDownload).toHaveAttribute("href", "../../public/hospitation/mitmachen-hospitations-framework.pdf");
  const questionnaireView = page.locator("#view-questionnaire");
  await completeQuestionnaireStep(questionnaireContextStep);
  await expect(questionnaireContextStep).not.toHaveAttribute("open", "");
  await expect(questionnaireObservationStep).toHaveAttribute("open", "");
  await expect(page.locator("#questionnaire-section-observe")).toContainText("Beobachtungen");
  await expect(questionnaireObservationStep).toContainText("Signale für Muster und Evidenz");
  await expect(page.locator("#questionnaire-section-coding")).toContainText("Beobachtung codieren");
  await expect(questionnaireObservationStep.locator(".questionnaire-question-list li")).toHaveCount(0);
  await expect(questionnaireObservationStep.locator(".questionnaire-observation-toolbar strong")).toHaveCount(0);
  await expect(questionnaireObservationStep.locator(".questionnaire-observation-toolbar [data-questionnaire-observation-add]")).toHaveCount(0);
  await expect(questionnaireObservationStep.locator(".questionnaire-step-actions [data-questionnaire-observation-add]")).toBeVisible();
  await expect(questionnaireView).not.toContainText("Was ist konkret passiert oder gesagt worden?");
  await expect(questionnaireView).not.toContainText("Welche Codes beschreiben die Beobachtung?");
  await expect(questionnaireView).not.toContainText("Welche Relevanz hat die Beobachtung für Musterbildung?");
  const observationCards = page.locator("[data-questionnaire-observation-card]");
  const codingCards = page.locator("[data-questionnaire-observation-coding-card]");
  await expect(observationCards).toHaveCount(1);
  await expect(codingCards).toHaveCount(1);
  await expect(observationCards.first().locator("[data-questionnaire-observation-title]")).toHaveText("Beobachtung 1");
  const observationTitleInput = page.locator('input[name="questionnaireObservations[1][title]"]');
  await expect(observationTitleInput).toBeVisible();
  await observationTitleInput.fill("Telefonische Rückfrage");
  const observationTextarea = page.locator('textarea[name="questionnaireObservations[1][observation]"]');
  await expect(observationTextarea).toBeVisible();
  await expect(observationTextarea).toHaveAttribute("placeholder", /Workaround/);
  const observationPlaceholder = await observationTextarea.getAttribute("placeholder");
  expect(observationPlaceholder).not.toContain(";");
  await observationTextarea.fill("MFA ruft wegen fehlender KIM-Adresse zurück und dokumentiert die Antwort parallel im PVS.");
  await expect(questionnaireObservationStep.locator('select[name="questionnaireObservations[1][processPhase]"]')).toHaveCount(0);
  await expect(questionnaireObservationStep.locator('select[name="questionnaireObservations[1][problemType]"]')).toHaveCount(0);
  await expect(questionnaireObservationStep.locator('select[name="questionnaireObservations[1][impact]"]')).toHaveCount(0);
  await expect(questionnaireObservationStep.locator('select[name="questionnaireObservations[1][observationType]"]')).toHaveCount(0);
  await expect(questionnaireObservationStep.locator('select[name="questionnaireObservations[1][relevance]"]')).toHaveCount(0);
  await expect(page.locator('textarea[name="questionnaireObservations[1][quote]"]')).toHaveCount(0);
  await expect(page.locator('input[name="questionnaireObservations[1][image]"][type="file"]')).toHaveCount(0);
  await expect(page.locator('textarea[name="questionnaireObservations[1][workaround]"]')).toHaveCount(0);
  await expect(page.locator('select[name="questionnaireObservations[1][product]"]')).toHaveCount(0);
  await page.locator("[data-questionnaire-observation-add]").click();
  await expect(observationCards).toHaveCount(2);
  await expect(codingCards).toHaveCount(2);
  await expect(observationCards.nth(1).locator("[data-questionnaire-observation-title]")).toHaveText("Beobachtung 2");
  await observationCards.nth(1).getByRole("button", { name: "Entfernen" }).click();
  await expect(observationCards).toHaveCount(1);
  await expect(codingCards).toHaveCount(1);
  await expect(page.locator('textarea[name="questionnaireObservationNote"]')).toHaveCount(0);
  await expect(page.locator('textarea[name="questionnaireDigitalNotes"]')).toHaveCount(0);
  await expect(page.locator('textarea[name="questionnairePeopleNotes"]')).toHaveCount(0);
  await expect(page.locator('input[name="questionnaireAffectedProduct"]')).toHaveCount(0);
  await expect(page.locator('input[name="questionnaireTopic"]')).toHaveCount(0);
  await expect(page.locator('input[name="questionnaireProcessPhase"]')).toHaveCount(0);
  await expect(page.locator('input[name="questionnaireProblemType"]')).toHaveCount(0);
  await completeQuestionnaireStep(questionnaireObservationStep);
  await expect(questionnaireCodingStep).toHaveAttribute("open", "");
  await expect(questionnaireCodingStep.locator("[data-questionnaire-observation-coding-title]")).toHaveText("Codierung: Telefonische Rückfrage");
  await expect(questionnaireCodingStep.locator('select[name="questionnaireObservations[1][processPhase]"] option[value="Befund / Dokumentation"]')).toHaveCount(1);
  await expect(questionnaireCodingStep.locator('select[name="questionnaireObservations[1][problemType]"] option[value="positives Muster / Best Practice"]')).toHaveCount(1);
  await expect(questionnaireCodingStep.locator('select[name="questionnaireObservations[1][impact]"] option[value="Patient:innen müssen selbst vermitteln"]')).toHaveCount(1);
  await expect(questionnaireCodingStep.locator('select[name="questionnaireObservations[1][observationType]"] option[value="Kontextwissen"]')).toHaveCount(1);
  await expect(questionnaireCodingStep.locator('select[name="questionnaireObservations[1][relevance]"] option[value="5"]')).toHaveCount(1);
  await questionnaireCodingStep.locator('select[name="questionnaireObservations[1][processPhase]"]').selectOption("Befund / Dokumentation");
  await questionnaireCodingStep.locator('select[name="questionnaireObservations[1][problemType]"]').selectOption("Rückfrage");
  await questionnaireCodingStep.locator('select[name="questionnaireObservations[1][impact]"]').selectOption("Arbeitsfluss wird unterbrochen");
  await questionnaireCodingStep.locator('select[name="questionnaireObservations[1][observationType]"]').selectOption("Reibung / Problem");
  await questionnaireCodingStep.locator('select[name="questionnaireObservations[1][relevance]"]').selectOption("5");
  await completeQuestionnaireStep(questionnaireCodingStep);
  await expect(questionnaireMaterialStep).toHaveAttribute("open", "");
  await expect(page.locator("#questionnaire-section-material")).toContainText("Zitate und Bilder");
  await expect(questionnaireMaterialStep.locator('textarea[name="questionnaireSupportingQuote"]')).toBeVisible();
  await expect(questionnaireMaterialStep.locator('input[name="questionnaireSupportingImage"][type="file"]')).toBeVisible();
  await expect(questionnaireMaterialStep.locator('select[name="questionnaireProductReference"]')).toHaveCount(0);
  await completeQuestionnaireStep(questionnaireMaterialStep);
  await expect(questionnaireProductStep).toHaveAttribute("open", "");
  await expect(page.locator("#questionnaire-section-product")).toContainText("Produktbezug");
  await expect(questionnaireProductStep.locator('select[name="questionnaireProductReference"]')).toHaveCount(0);
  await expect(questionnaireProductStep.locator(".detail-theme-group--selected")).toContainText("Ausgewählte Produkte");
  await expect(questionnaireProductStep.locator(".detail-theme-group--suggestions")).toContainText("gematik-Anwendungen und Dienste");
  await expect(questionnaireProductStep.locator('[data-questionnaire-product-toggle="KIM"]')).toBeVisible();
  await expect(questionnaireProductStep.locator('[data-questionnaire-product-toggle="ePA für alle"]')).toBeVisible();
  await questionnaireProductStep.locator('[data-questionnaire-product-toggle="KIM"]').click();
  await questionnaireProductStep.locator('[data-questionnaire-product-toggle="ePA für alle"]').click();
  await expect(questionnaireProductStep.locator("[data-questionnaire-product-selected]")).toContainText("KIM");
  await expect(questionnaireProductStep.locator("[data-questionnaire-product-selected]")).toContainText("ePA für alle");
  await expect(questionnaireProductStep.locator('[data-questionnaire-product-toggle="KIM"]')).toHaveAttribute("aria-pressed", "true");
  await expect(questionnaireProductStep.locator('input[name="questionnaireProductReference"][value="KIM"]')).toHaveCount(1);
  await expect(questionnaireProductStep.locator('input[name="questionnaireProductReference"][value="ePA für alle"]')).toHaveCount(1);
  await questionnaireProductStep.locator('[data-questionnaire-product-toggle="KIM"]').click();
  await expect(questionnaireProductStep.locator("[data-questionnaire-product-selected]")).not.toContainText("KIM");
  await expect(questionnaireProductStep.locator('input[name="questionnaireProductReference"][value="KIM"]')).toHaveCount(0);
  await completeQuestionnaireStep(questionnaireProductStep);
  await expect(questionnaireReflectionStep).toHaveAttribute("open", "");
  await expect(page.locator("#questionnaire-section-reflect")).toContainText("Interne Kommunikation");
  await expect(questionnaireReflectionStep).toContainText("neutral teilbar");
  await expect(questionnaireReflectionStep.locator(".questionnaire-question-list li")).toHaveCount(0);
  await expect(questionnaireReflectionStep.locator('label[for="questionnaire-reflection-note"]')).toHaveText("Notiz");
  const reflectionThread = questionnaireReflectionStep.locator(".questionnaire-reflection-thread");
  await expect(reflectionThread.locator(".format-chat-list")).toBeVisible();
  await expect(reflectionThread.locator(".empty")).toHaveText("Noch keine Notiz im Verlauf.");
  await expect(reflectionThread.locator(".format-chat-composer")).toBeVisible();
  await expect(page.locator('textarea[name="questionnaireReflectionNote"]')).toHaveCount(0);
  await expect(page.locator('input[name="questionnaireReflectionNote"][type="hidden"]')).toHaveCount(1);
  await expect(reflectionThread.locator("#questionnaire-reflection-note")).toHaveAttribute("name", "questionnaireReflectionDraft");
  await expect(reflectionThread.locator("#questionnaire-reflection-note")).toHaveAttribute("placeholder", "Neue Notiz schreiben...");
  await expect(questionnaireReflectionStep).not.toContainText("Reflexionsnotiz");
  await expect(reflectionThread.locator(".format-chat-message")).toHaveCount(0);
  await reflectionThread.locator("#questionnaire-reflection-note").fill("Interne Notiz aus dem Fragebogen");
  await reflectionThread.getByRole("button", { name: "Notiz senden" }).click();
  await expect(reflectionThread.locator(".format-chat-message")).toContainText("Interne Notiz aus dem Fragebogen");
  await expect(page.locator('input[name="questionnaireReflectionNote"]')).toHaveValue(/Interne Notiz aus dem Fragebogen/);
  await expect(page.locator('textarea[name="questionnaireEvidence"]')).toHaveCount(0);
  await expect(page.locator('textarea[name="questionnaireNeedsNotes"]')).toHaveCount(0);
  await completeQuestionnaireStep(questionnaireReflectionStep);
  await expect(questionnaireEvidenceStep).toHaveAttribute("open", "");
  await expect(page.locator("#questionnaire-section-followup")).toContainText("Muster, Hypothese, Evidenz");
  await expect(page.locator('input[name="questionnaireEvidenceStage"][value="Hypothese"]')).toBeVisible();
  await expect(questionnaireView).not.toContainText("Versorgungsblick");
  await expect(questionnaireView).not.toContainText("Beleg oder Fundstück");
  await page.locator('input[name="questionnaireEvidenceStage"][value="Hypothese"]').check();
  await page.locator('textarea[name="questionnaireFollowupNotes"]').fill("Rückfragen zu KIM-Adressen treten als Musterkandidat auf.");
  await page.locator('textarea[name="questionnaireNextStep"]').fill("In weiteren Hospitationen auf Wiederholung prüfen.");
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.locator("[data-questionnaire-step-next]")).toHaveText("In Termin übernehmen");
    await page.locator("[data-questionnaire-step-next]").click();
  } else {
    await page.locator('[data-questionnaire-submit]').click();
  }
  await expect(page.locator("[data-questionnaire-save-status]")).toContainText("In Termin übernommen");
  await expect(page.locator("[data-questionnaire-open-container]")).toBeVisible();
  await page.locator("[data-questionnaire-open-container]").click();
  const questionnaireDrawer = page.locator("#hospitation-editor-drawer");
  await expect(questionnaireDrawer).toHaveClass(/is-open/);
  await expect(questionnaireDrawer).toContainText("Telefonische Rückfrage");
  await expect(questionnaireDrawer).toContainText("aus Fragebogen");
  const questionnaireDrawerObservation = questionnaireDrawer.locator('[data-repeatable-card][data-repeatable-type="observation"]').first();
  await expect(questionnaireDrawerObservation).toContainText("Beobachtung");
  await expect(questionnaireDrawerObservation).toContainText("Codierung");
  await expect(questionnaireDrawerObservation).not.toContainText("Produktbezug");
  await expect(questionnaireDrawerObservation).not.toContainText("Zitate und Bilder");
  await expect(questionnaireDrawerObservation.locator('[data-repeatable-field="observed"]')).toContainText("MFA ruft wegen fehlender KIM-Adresse zurück");
  await expect(questionnaireDrawerObservation.locator('[data-repeatable-field="processPhase"]')).toHaveValue("Befund / Dokumentation");
  await expect(questionnaireDrawerObservation.locator('[data-repeatable-field="problemType"]')).toHaveValue("Rückfrage");
  await expect(questionnaireDrawerObservation.locator('[data-repeatable-field="impact"]')).toHaveValue("Arbeitsfluss wird unterbrochen");
  await expect(questionnaireDrawerObservation.locator('[data-repeatable-field="observationType"]')).toHaveValue("Reibung / Problem");
  await expect(questionnaireDrawerObservation.locator('[data-repeatable-field="relevanceScore"]')).toHaveValue("5");
  await expect(questionnaireDrawerObservation.locator('[data-repeatable-field="affectedProducts"]')).toHaveValue("ePA für alle");
  await expect(questionnaireDrawerObservation.locator("[data-repeatable-product-editor]")).toHaveCount(0);
  await expect(questionnaireDrawerObservation).not.toContainText("Situation / Kontext");
  await expect(questionnaireDrawerObservation).not.toContainText("Auslöser");
  await expect(questionnaireDrawerObservation).not.toContainText("Handlungsschritte");
  await expect(questionnaireDrawerObservation).not.toContainText("Systeme und Dokumente");
  await questionnaireDrawer.getByRole("tab", { name: "Produkte" }).click();
  await expect(questionnaireDrawer).toContainText("ePA für alle");
  await questionnaireDrawer.getByRole("tab", { name: "Notizen" }).click();
  await expect(questionnaireDrawer).toContainText("Interne Notiz aus dem Fragebogen");
  await expect(page.locator(".controls")).toBeHidden();

  await attachScreenshot(page, testInfo, "planung-fragebogen");
});

test("Hospitation: Fragebogen-Dropdowns suchen performant in großen Kontaktlisten", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#questionnaire", {
    backendFixtureScript: largeQuestionnaireBackendFixtureScript()
  });

  await expect(page.locator("#hospitation-questionnaire-form")).toBeVisible();
  const organizationSelect = page.locator("#questionnaire-organization");
  const contactSelect = page.locator("#questionnaire-contact");
  const organizationShell = page.locator('[data-select-type="questionnaire-organization"]');
  const contactShell = page.locator('[data-select-type="questionnaire-contact"]');
  const typeCustomSelectSearch = async (shell, query) => {
    const searchInput = shell.locator("[data-custom-select-search-input]");
    await searchInput.click();
    await searchInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await searchInput.press("Backspace");
    await page.keyboard.type(query);
    await expect(searchInput).toHaveValue(query);
  };

  await expect(organizationSelect.locator("option")).toHaveCount(80);
  await expect(contactSelect.locator("option")).toHaveCount(80);

  await organizationShell.locator(".custom-select-trigger").click();
  await expect(organizationShell.locator(".custom-select-empty")).toContainText("mindestens 2 Zeichen");
  await expect(organizationShell.locator(".custom-select-option")).toHaveCount(0);
  await typeCustomSelectSearch(organizationShell, "Havel");
  await expect(organizationShell.locator(".custom-select-option", { hasText: "Suchtreffer Zentrum Havel" })).toBeVisible();
  await expect(organizationShell.locator(".custom-select-option")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await contactShell.locator(".custom-select-trigger").click();
  await expect(contactShell.locator(".custom-select-empty")).toContainText("mindestens 2 Zeichen");
  await expect(contactShell.locator(".custom-select-option")).toHaveCount(0);
  await typeCustomSelectSearch(contactShell, "Zora");
  await expect(contactShell.locator(".custom-select-option", { hasText: "Zora Suchtreffer" })).toBeVisible();
  await expect(contactShell.locator(".custom-select-option")).toHaveCount(1);
  await contactShell.locator(".custom-select-option", { hasText: "Zora Suchtreffer" }).click();
  await expect(contactSelect).toHaveValue("large-contact-212");
  await expect(contactSelect.locator('option[value="large-contact-212"]')).toHaveCount(1);
  await expect(contactShell.locator(".custom-select-trigger__label")).toContainText("Zora Suchtreffer");
});

test("Hospitation: alle Seiten bleiben auf Smartphone und Tablet ohne horizontalen Overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Responsive-Matrix läuft im Mobile-Projekt.");
  test.setTimeout(60_000);
  const views = [
    { hash: "framework", selector: "#view-framework" },
    { hash: "hospitations", selector: "#view-hospitations" },
    { hash: "questionnaire", selector: "#view-questionnaire" },
    { hash: "hospitations:patterns", selector: "#hospitation-patterns-panel" },
    { hash: "hospitations:dashboard", selector: "#hospitation-dashboard" },
    { hash: "formats", selector: "#view-formats" }
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAuthenticated(page, `/frontend/app/versorgungs-kompass.html#${views[0].hash}`);
  for (const view of views) {
    await page.goto(`/frontend/app/versorgungs-kompass.html#${view.hash}`);
    await expect(page.locator(view.selector)).toBeVisible();
    for (const width of [320, 390, 430, 768, 980]) {
      await page.setViewportSize({ width, height: width <= 430 ? 844 : 1024 });
      await expect(page.locator(view.selector)).toBeVisible();
      if (width >= 768) await page.waitForTimeout(350);
      const overflow = await page.locator("html").evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
      expect(overflow, `${view.hash} bei ${width}px`).toBeLessThanOrEqual(1);
      if (width <= 760) {
        await expect(page.locator(".app-sidebar")).toHaveCSS("width", `${width}px`);
        await expect(page.locator(".app-sidebar")).toHaveCSS("height", "60px");
      }
    }
  }
});

test("Hospitationen: Zwischenbreiten nutzen eine kompakte Kartenliste ohne Tabellenüberlauf", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Responsive-Matrix läuft im Mobile-Projekt.");
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations");

  const table = page.locator("#hospitation-list .hospitation-table").first();
  const header = table.locator(".hospitation-table-head");
  const row = table.locator(".hospitation-row").first();

  for (const width of [768, 900, 1100, 1279]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(row).toBeVisible();
    await expect(header).toBeHidden();
    await expect(row.locator("[data-hospitation-row-select]")).toBeHidden();
    await expect(row.locator(".hospitation-row__status")).toBeHidden();
    await expect(row.locator(".hospitation-row__documentation")).toBeHidden();
    await expect(row.locator(".hospitation-row__mobile-date")).toBeVisible();
    await expect(row.locator(".hospitation-row__mobile-organization")).toBeVisible();
    await expect(row.locator(".hospitation-row__mobile-chevron")).toBeVisible();
    const columnCount = await table.evaluate((node) =>
      window.getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length
    );
    expect(columnCount, `Kartenliste bei ${width}px`).toBe(1);
    const overflow = await page.locator("html").evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
    expect(overflow, `Hospitationsliste bei ${width}px`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(header).toBeVisible();
  await expect(row.locator("[data-hospitation-row-select]")).toBeVisible();
  await expect(row.locator(".hospitation-row__mobile-date")).toBeHidden();
  const desktopOverflow = await page.locator("html").evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
  expect(desktopOverflow, "Hospitationsliste bei 1280px").toBeLessThanOrEqual(1);
});

test("Hospitationen: alte Dokumentationsroute zeigt Termine", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations:documentation");

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "hospitations");
  await expect(page.locator('[data-hospitation-tab="documentation"]')).toHaveCount(0);
  await expect(page.locator('[data-hospitation-tab="appointments"]')).toHaveCount(0);
  await expect(page.locator("#hospitation-list .hospitation-table").first()).toBeVisible();
  await expect(page.locator("[data-hospitation-data-mode-switch]")).toHaveCount(0);
});

test("Hospitationen: geschützte synthetische Backend-Fixture ist observation-first und bewertungsfrei", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations");

  await expect(page.locator("[data-hospitation-data-mode-switch]")).toHaveCount(0);
  const row = page.locator("#hospitation-list .hospitation-row", { hasText: "Demo-Team Hausarztversorgung 01" }).first();
  await expect(row).toBeVisible();
  await row.locator(".hospitation-row__head").click();

  const drawer = page.locator("#hospitation-editor-drawer");
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer).toContainText("Rein synthetische Demo-Hospitation");
  await drawer.getByRole("tab", { name: "Beobachten" }).click();

  const observations = drawer.locator('[data-repeatable-card][data-repeatable-type="observation"]');
  await expect(observations).toHaveCount(3);
  const first = observations.first();
  await expect(first).toContainText("Beobachtung");
  await expect(first).toContainText("Codierung");
  await expect(first).not.toContainText("Produktbezug");
  await expect(first).not.toContainText("Zitate und Bilder");
  await expect(first.locator('[data-repeatable-field="affectedProducts"]')).toHaveValue("");
  await expect(first.locator(".hospitation-observation-advanced")).toHaveCount(1);
  await expect(first.locator(".hospitation-observation-advanced > summary")).toContainText("Erweiterte Details");
  await expect(first.locator('[data-repeatable-field="title"]')).toHaveValue("Drei Medikationsstände liegen gleichzeitig vor");
  await expect(first.locator('[data-repeatable-field="sequence"]')).toHaveValue("1");
  await expect(first.locator('[data-repeatable-field="observedAt"]')).toHaveValue("08:47 Uhr");
  await expect(first.locator('[data-repeatable-field="trigger"]')).toContainText("Entlassbrief");
  await expect(first.locator('[data-repeatable-field="actions"]')).toContainText("MFA öffnet die Medikationsliste");
  await expect(first.locator('[data-repeatable-field="toolsAndDocuments"]')).toContainText("PVS");
  await expect(first.locator('[data-repeatable-field="immediateConsequence"]')).toContainText("nicht aktualisiert");
  await expect(first.locator('[data-repeatable-field="sourceReference"]')).toContainText("Synthetischer Demo-Quellenhinweis 04");
  await expect(first.locator('[data-repeatable-field="uncertainty"]')).toContainText("synthetischer Demo-Fall");
  await expect(first.locator('[data-repeatable-field="evidenceType"]')).toHaveValue("synthetic_source_based");
  await expect(first.locator('[data-repeatable-field="careRelevance"]')).toHaveCount(0);
  await expect(first.locator('[data-repeatable-field="nextUse"]')).toHaveCount(0);
  await expect(drawer).not.toContainText("Roadmap-Bewertung");
});

test("Startseite: minimalistischer Einstieg und Sidebar-Zustand funktionieren auf Desktop und Mobile", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("versorgungs-kompass-sidebar-collapsed", "false");
    window.sessionStorage.removeItem("versorgungs-kompass:home-reveal");
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html", { role: "admin" });

  const shell = page.locator(".app-shell");
  const isMobile = testInfo.project.name.includes("mobile");
  const homeScroller = page.locator("[data-home-scroller]");
  const homeDestinations = page.locator("#home-destinations");
  const heading = page.getByRole("heading", { level: 1, name: "Willkommen im Versorgungs-Kompass" });
  const brand = page.locator(".home-hero__brand");
  const scrollCue = page.getByRole("button", { name: "Bereiche ansehen" });
  const destinationLinks = page.locator(".home-destination-link");

  await expect(shell).toHaveAttribute("data-active-view", "home");
  await expect(homeScroller).toHaveAttribute("tabindex", "0");
  await expect(homeScroller).toHaveAttribute("aria-label", "Startseiteninhalt");
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await expect(page.locator('[data-view-tab="home"]')).toHaveAttribute("aria-current", "page");
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute("data-home-reveal-lines", '["Willkommen im","Versorgungs-Kompass"]');
  await expect(brand).toBeVisible();
  await expect(brand).toHaveAttribute("alt", "#Mitmachen");
  await expect(brand).toHaveAttribute("src", /lockup-horizontal\.svg$/);
  await expect(page.locator(".home-hero__lead")).toHaveText("Wähle den Bereich, in dem du arbeiten möchtest.");
  await expect(scrollCue).toBeVisible();
  await expect(scrollCue).toHaveAttribute("aria-controls", "home-destinations");
  await expect(destinationLinks).toHaveCount(4);
  await expect(destinationLinks.locator("strong")).toHaveText(["Versorgung", "Stakeholder", "Hospitation", "Formate"]);
  await expect(destinationLinks.locator(".home-destination-link__top > span:first-child")).toHaveText(["01", "02", "03", "04"]);
  await expect(destinationLinks.locator(".home-destination-link__copy")).toHaveText([
    "Regionen, Kontakte und Organisationen im Blick.",
    "Perspektiven und Netzwerke gezielt verbinden.",
    "Beobachtungen in belastbares Wissen überführen.",
    "Austausch planen und Wirkung gemeinsam gestalten."
  ]);
  await expect(page.locator(".sidebar-nav > *").first()).toHaveClass(/sidebar-home-entry/);
  expect(await destinationLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual([
    "#map",
    "#stakeholders",
    "#framework",
    "#formats"
  ]);
  await expect(page.locator(".workspace-header")).toBeHidden();
  await expect(page.locator(".sidebar-section.is-expanded")).toHaveCount(0);
  await expect(page.locator("#brand-home-link")).toHaveAttribute("href", "#home");

  await expect(heading).toHaveClass(/is-prepared/);
  await expect(heading).toHaveAttribute("data-character-count", "31");
  await expect(heading.locator(".home-reveal-heading__char")).toHaveCount(31);
  await expect(heading).toHaveClass(/is-complete/);
  await expect(heading).not.toHaveClass(/is-playing/);
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("versorgungs-kompass:home-reveal"))).toBe("1");
  const headingGeometry = await heading.evaluate((element) => {
    const words = [...element.querySelectorAll(".home-reveal-heading__word")].map((word) => {
      const rect = word.getBoundingClientRect();
      return { text: word.textContent, top: rect.top, bottom: rect.bottom };
    });
    const leadTop = document.querySelector(".home-hero__lead")?.getBoundingClientRect().top || 0;
    return { words, leadTop };
  });
  const titleSegments = headingGeometry.words.filter((word) => ["Versorgungs-", "Kompass"].includes(word.text));
  expect(titleSegments).toHaveLength(2);
  expect(Math.abs(titleSegments[0].top - titleSegments[1].top)).toBeLessThanOrEqual(1);
  expect(Math.max(...headingGeometry.words.map((word) => word.bottom))).toBeLessThan(headingGeometry.leadTop);

  await expect.poll(() => homeScroller.evaluate((scroller) => scroller.scrollTop)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await scrollCue.click();
  await expect(homeDestinations).toBeFocused();
  await expect.poll(() => homeScroller.evaluate((scroller) => scroller.scrollTop)).toBeGreaterThan(100);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(() => homeDestinations.evaluate((destinations) => {
    const scroller = destinations.closest("[data-home-scroller]");
    if (!scroller) return false;
    const scrollerRect = scroller.getBoundingClientRect();
    const destinationsRect = destinations.getBoundingClientRect();
    return destinationsRect.top >= scrollerRect.top - 1
      && destinationsRect.top <= scrollerRect.top + 32
      && destinationsRect.bottom <= scrollerRect.bottom + 1;
  })).toBe(true);

  const firstModuleLink = destinationLinks.filter({ has: page.locator('strong:text-is("Versorgung")') });
  await page.keyboard.press("Tab");
  await firstModuleLink.focus();
  await expect(firstModuleLink).toBeFocused();
  await expect(firstModuleLink).toHaveCSS("outline-style", "solid");
  await expect(firstModuleLink).toHaveCSS("outline-width", "3px");
  await expect(firstModuleLink).toHaveCSS("outline-color", "rgb(21, 95, 228)");

  if (isMobile) {
    await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
    await expect(shell).not.toHaveClass(/is-mobile-sidebar-expanded/);
  } else {
    await expect(shell).toHaveClass(/is-sidebar-collapsed/);
    await expect(page.locator("#sidebar-collapse-button")).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("versorgungs-kompass-sidebar-collapsed"))).toBe("false");
    await page.locator("#sidebar-collapse-button").click();
    await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
  }

  await page.locator('.home-destination-link[href="#map"]').click();
  await expect(shell).toHaveAttribute("data-active-view", "map");
  await expect(page.locator('[data-sidebar-section="care"]')).toHaveClass(/is-expanded/);
  await expect(page.locator(".sidebar-section.is-expanded")).toHaveCount(1);

  if (isMobile) {
    await page.locator("#sidebar-collapse-button").click();
    await expect(shell).toHaveClass(/is-mobile-sidebar-expanded/);
    await page.locator('[data-view-tab="home"]').click();
    await expect(shell).not.toHaveClass(/is-mobile-sidebar-expanded/);
  } else {
    await page.locator("#brand-home-link").click();
  }
  await expect(shell).toHaveAttribute("data-active-view", "home");
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await expect(page.locator(".sidebar-section.is-expanded")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(() => homeScroller.evaluate((scroller) => scroller.scrollTop)).toBe(0);
  await expect(heading).toHaveClass(/is-complete/);
  if (!isMobile) await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
});

test("Sidebar: Desktop nutzt dieselbe Ein-Modul-Accordionlogik wie Mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Die mobile Accordion-Navigation wird separat geprüft.");
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });

  const shell = page.locator(".app-shell");
  const careSection = page.locator('[data-sidebar-section="care"]');
  const stakeholderSection = page.locator('[data-sidebar-section="stakeholders"]');
  const planningSection = page.locator('[data-sidebar-section="planning"]');
  const formatsSection = page.locator('[data-sidebar-section="formats"]');
  const careToggle = page.locator('[data-sidebar-section-toggle="care"]');
  const planningToggle = page.locator('[data-sidebar-section-toggle="planning"]');
  const careContent = page.locator("#sidebar-section-care-content");
  const planningContent = page.locator("#sidebar-section-planning-content");
  const collapseButton = page.locator("#sidebar-collapse-button");
  await expect(shell).toHaveAttribute("data-active-view", "contacts");
  await expect(careSection).toHaveClass(/is-expanded/);
  await expect(stakeholderSection).toHaveClass(/is-collapsed/);
  await expect(planningSection).toHaveClass(/is-collapsed/);
  await expect(formatsSection).toHaveClass(/is-collapsed/);
  await expect(page.locator('[data-sidebar-section="admin"]')).toHaveCount(0);
  await expect(collapseButton.locator(".sidebar-collapse-label")).toHaveText("Menü einklappen");
  await expect(careToggle).toHaveAttribute("aria-expanded", "true");
  await expect(careContent).toBeVisible();
  await expect(page.locator(".sidebar-module-icon")).toHaveCount(4);
  await expect(planningToggle.locator(".sidebar-module-icon")).toHaveAttribute("aria-hidden", "true");
  await expect(planningToggle.locator(".sidebar-module-icon svg rect")).toHaveCount(1);
  await expect(planningToggle.locator(".sidebar-module-icon svg circle")).toHaveCount(1);
  await expect(planningToggle.locator(".sidebar-section-title")).toHaveText("Hospitation");

  await planningToggle.focus();
  await planningToggle.press("Enter");
  await expect(shell).toHaveAttribute("data-active-view", "contacts");
  await expect(careSection).toHaveClass(/is-collapsed/);
  await expect(stakeholderSection).toHaveClass(/is-collapsed/);
  await expect(planningSection).toHaveClass(/is-expanded/);
  await expect(formatsSection).toHaveClass(/is-collapsed/);
  await expect(careToggle).toHaveAttribute("aria-expanded", "false");
  await expect(careContent).toBeHidden();
  await expect(planningToggle).toHaveAttribute("aria-expanded", "true");
  await expect(planningContent).toBeVisible();
  await expect(page.locator(".sidebar-section.is-expanded")).toHaveCount(1);

  await planningToggle.press("Space");
  await expect(shell).toHaveAttribute("data-active-view", "contacts");
  await expect(planningSection).toHaveClass(/is-collapsed/);
  await expect(planningToggle).toHaveAttribute("aria-expanded", "false");
  await expect(planningContent).toBeHidden();
  await expect(page.locator(".sidebar-section.is-expanded")).toHaveCount(0);

  await planningToggle.click();
  await expect(shell).toHaveAttribute("data-active-view", "contacts");
  await expect(planningSection).toHaveClass(/is-expanded/);
  await expect(careSection).toHaveClass(/is-collapsed/);
  await expect(stakeholderSection).toHaveClass(/is-collapsed/);
  await expect(formatsSection).toHaveClass(/is-collapsed/);
  await page.locator('[data-view-tab="framework"]').click();
  await expect(shell).toHaveAttribute("data-active-view", "framework");
  await expect(page).toHaveURL(/#framework$/);

  await page.locator('[data-sidebar-section-toggle="stakeholders"]').click();
  await expect(shell).toHaveAttribute("data-active-view", "framework");
  await expect(stakeholderSection).toHaveClass(/is-expanded/);
  await expect(careSection).toHaveClass(/is-collapsed/);
  await expect(planningSection).toHaveClass(/is-collapsed/);
  await expect(formatsSection).toHaveClass(/is-collapsed/);
  await expect(page.locator(".sidebar-section.is-expanded")).toHaveCount(1);

  await page.locator('[data-sidebar-section="stakeholders"] [data-view-tab="stakeholders"]').click();
  await expect(shell).toHaveAttribute("data-active-view", "stakeholders");
  await expect(stakeholderSection).toHaveClass(/is-active-section/);
  await expect(page).toHaveURL(/#stakeholders$/);

  await page.locator('[data-sidebar-section-toggle="formats"]').click();
  await expect(shell).toHaveAttribute("data-active-view", "stakeholders");
  await expect(formatsSection).toHaveClass(/is-expanded/);
  await expect(stakeholderSection).toHaveClass(/is-collapsed/);
  await expect(planningSection).toHaveClass(/is-collapsed/);
  await page.locator('[data-view-tab="formats"]').click();
  await expect(shell).toHaveAttribute("data-active-view", "formats");
  await expect(formatsSection).toHaveClass(/is-active-section/);
  await expect(page).toHaveURL(/#formats$/);

  await page.locator('[data-sidebar-section-toggle="care"]').click();
  await expect(formatsSection).toHaveClass(/is-collapsed/);
  await page.locator("#sidebar-analytics-button").click();
  await expect(shell).toHaveAttribute("data-active-view", "analytics");
  await expect(careSection).toHaveClass(/is-expanded/);
  await expect(careSection).toHaveClass(/is-active-section/);
  await expect(stakeholderSection).toHaveClass(/is-collapsed/);
  await expect(planningSection).toHaveClass(/is-collapsed/);
  await expect(formatsSection).toHaveClass(/is-collapsed/);
  await expect(page.locator(".sidebar-section.is-expanded")).toHaveCount(1);
  await expect(page).toHaveURL(/#analytics$/);

  const expandedCollapseBox = await collapseButton.boundingBox();
  await collapseButton.click();
  await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  await expect(collapseButton).toHaveAttribute("aria-label", "Seitenleiste ausklappen");
  await expect(collapseButton.locator(".sidebar-collapse-label")).toHaveText("Menü ausklappen");
  await expect(page.locator(".sidebar-nav > .sidebar-section:visible")).toHaveCount(1);
  await expect(careSection).toBeVisible();
  await expect(page.locator(".sidebar-home-entry")).toBeVisible();
  await expect(stakeholderSection).toBeHidden();
  await expect(planningSection).toBeHidden();
  await expect(formatsSection).toBeHidden();
  for (const selector of ["#sidebar-tour-button", "#sidebar-team-button", "#sidebar-notifications-button", "#sidebar-profile-button"]) {
    await expect(page.locator(selector)).toHaveCSS("width", "40px");
    await expect(page.locator(selector)).toHaveCSS("height", "40px");
  }
  const collapsedAccountOrder = await page.evaluate(() => ({
    notificationTop: document.querySelector("#sidebar-notifications-button")?.getBoundingClientRect().top || 0,
    profileTop: document.querySelector("#sidebar-profile-button")?.getBoundingClientRect().top || 0
  }));
  expect(collapsedAccountOrder.notificationTop).toBeLessThan(collapsedAccountOrder.profileTop);
  const collapsedCollapseBox = await collapseButton.boundingBox();
  expect(expandedCollapseBox).not.toBeNull();
  expect(collapsedCollapseBox).not.toBeNull();
  expect(collapsedCollapseBox.height).toBeGreaterThanOrEqual(expandedCollapseBox.height);
  expect(collapsedCollapseBox.y).toBeGreaterThan(expandedCollapseBox.y + 20);
  const collapsedBrandBox = await page.locator(".sidebar-brand").boundingBox();
  expect(collapsedBrandBox).not.toBeNull();
  expect(collapsedCollapseBox.y).toBeGreaterThanOrEqual(collapsedBrandBox.y + collapsedBrandBox.height - 1);

  await attachScreenshot(page, testInfo, "sidebar-section-first-page");
});

test("Sidebar: Ruhiger Desktop-Modus nutzt die kurze Höhe ohne Navigationsscroll", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Der höhenadaptive Desktop-Modus wird separat geprüft.");
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });

  const sidebarNav = page.locator(".sidebar-nav");
  const accountSection = page.locator(".sidebar-account-section");
  const shell = page.locator(".app-shell");
  const collapseButton = page.locator("#sidebar-collapse-button");
  const activeTab = page.locator('[data-view-tab="contacts"]');
  const inactiveTab = page.locator('[data-view-tab="map"]');
  const careToggle = page.locator('[data-sidebar-section-toggle="care"]');

  await expect(careToggle).toHaveCSS("text-transform", "none");
  await expect(careToggle).toHaveCSS("font-weight", "600");
  await expect(careToggle).toHaveCSS("border-left-width", "3px");
  const moduleAccentColors = await page.locator("[data-sidebar-section] > .sidebar-section-toggle").evaluateAll((toggles) =>
    toggles.map((toggle) => getComputedStyle(toggle).borderLeftColor)
  );
  expect(new Set(moduleAccentColors).size).toBe(4);
  const moduleAccentAlphas = moduleAccentColors.map((color) => {
    const channels = color.match(/rgba?\(([^)]+)\)/)?.[1]?.split(",").map((value) => Number.parseFloat(value.trim())) || [];
    return channels.length > 3 ? channels[3] : 1;
  });
  expect(Math.min(...moduleAccentAlphas)).toBeGreaterThanOrEqual(0.9);
  await expect(page.locator('[data-sidebar-section="stakeholders"]')).toHaveCSS("border-top-width", "0px");
  await expect(page.locator("#sidebar-administration-section")).toHaveCount(0);
  await expect(activeTab).toHaveCSS("min-height", "38px");
  await expect(collapseButton).toHaveCSS("position", "absolute");
  await expect(collapseButton.locator(".sidebar-collapse-label")).toBeHidden();

  const metrics = await page.evaluate(() => {
    const sidebar = document.querySelector(".app-sidebar");
    const nav = document.querySelector(".sidebar-nav");
    const account = document.querySelector(".sidebar-account-section");
    const brand = document.querySelector(".sidebar-brand");
    const collapse = document.querySelector("#sidebar-collapse-button");
    const active = document.querySelector('[data-view-tab="contacts"]');
    const inactive = document.querySelector('[data-view-tab="map"]');
    const rect = (element) => element?.getBoundingClientRect();
    return {
      accountHeight: rect(account)?.height || 0,
      accountBottomInset: (rect(sidebar)?.bottom || 0) - (rect(account)?.bottom || 0),
      accountPaddingBottom: account ? Number.parseFloat(getComputedStyle(account).paddingBottom) : 0,
      accountRowGap: account ? Number.parseFloat(getComputedStyle(account).rowGap) : 0,
      activeBackground: active ? getComputedStyle(active).backgroundColor : "",
      activeOpacity: active ? Number(getComputedStyle(active).opacity) : 0,
      collapseBottom: rect(collapse)?.bottom || 0,
      collapseTop: rect(collapse)?.top || 0,
      inactiveBackground: inactive ? getComputedStyle(inactive).backgroundColor : "",
      inactiveOpacity: inactive ? Number(getComputedStyle(inactive).opacity) : 0,
      navClientHeight: nav?.clientHeight || 0,
      navRowGap: nav ? Number.parseFloat(getComputedStyle(nav).rowGap) : 0,
      navScrollHeight: nav?.scrollHeight || 0,
      navTop: rect(nav)?.top || 0,
      brandBottom: rect(brand)?.bottom || 0
    };
  });

  expect(metrics.navScrollHeight).toBeLessThanOrEqual(metrics.navClientHeight + 1);
  expect(metrics.navRowGap).toBeGreaterThanOrEqual(6);
  expect(metrics.accountHeight).toBeLessThan(165);
  expect(metrics.accountRowGap).toBeGreaterThanOrEqual(4);
  expect(metrics.accountPaddingBottom).toBeGreaterThanOrEqual(6);
  expect(metrics.accountBottomInset).toBeGreaterThanOrEqual(17);
  expect(metrics.collapseBottom).toBeLessThanOrEqual(metrics.navTop);
  expect(metrics.collapseBottom).toBeLessThanOrEqual(metrics.brandBottom);
  expect(metrics.activeOpacity).toBeGreaterThan(metrics.inactiveOpacity);
  expect(metrics.activeBackground).not.toBe(metrics.inactiveBackground);

  await attachScreenshot(page, testInfo, "sidebar-calm-desktop");

  await collapseButton.click();
  await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  await expect(collapseButton).toHaveCSS("position", "static");
  const collapsedControlTop = await collapseButton.evaluate((element) => element.getBoundingClientRect().top);
  const collapsedBrandBottom = await page.locator(".sidebar-brand").evaluate((element) => element.getBoundingClientRect().bottom);
  expect(collapsedControlTop).toBeGreaterThanOrEqual(collapsedBrandBottom - 1);
  expect(collapsedControlTop).toBeGreaterThan(metrics.collapseTop + 20);

  await collapseButton.click();
  await page.locator('[data-sidebar-section-toggle="planning"]').click();
  await page.locator('[data-view-tab="hospitations:dashboard"]').click();
  await expect(page.locator('[data-view-tab="hospitations:dashboard"]')).toHaveAttribute("aria-current", "page");
  await expect.poll(async () => page.evaluate(() => {
    const nav = document.querySelector(".sidebar-nav")?.getBoundingClientRect();
    const active = document.querySelector('.sidebar-nav [aria-current="page"]')?.getBoundingClientRect();
    return Boolean(nav && active && active.top >= nav.top - 1 && active.bottom <= nav.bottom + 1);
  })).toBe(true);
});

test("Sidebar: Mobiles Profilavatar entspricht der Größe der Kontoaktionen", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Die mobile Sidebar wird im Mobile-Projekt geprüft.");
  await page.addInitScript(() => window.localStorage.setItem("versorgungs-kompass-sidebar-collapsed", "true"));
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });

  const shell = page.locator(".app-shell");
  const collapseButton = page.locator("#sidebar-collapse-button");
  await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
  await expect(page.locator(".sidebar-nav")).toBeHidden();
  await expect(page.locator(".sidebar-account-section")).toBeHidden();
  await expect(page.locator(".sidebar-nav .primary-tab:visible")).toHaveCount(0);
  await expect(page.locator(".sidebar-brand")).toBeVisible();
  await expect(page.locator(".sidebar-brand-kicker")).toHaveText("#Mitmachen");
  const closedMobileLayout = await page.evaluate(() => {
    const sidebar = document.querySelector(".app-sidebar")?.getBoundingClientRect();
    const main = document.querySelector(".app-main")?.getBoundingClientRect();
    return sidebar && main
      ? { sidebarHeight: sidebar.height, sidebarWidth: sidebar.width, mainLeft: main.left, mainWidth: main.width }
      : null;
  });
  expect(closedMobileLayout).not.toBeNull();
  expect(closedMobileLayout.sidebarHeight).toBe(60);
  expect(closedMobileLayout.sidebarWidth).toBe(390);
  expect(closedMobileLayout.mainLeft).toBe(0);
  expect(closedMobileLayout.mainWidth).toBe(390);
  const collapsedControlBox = await collapseButton.boundingBox();
  await collapseButton.click();
  await expect(shell).toHaveClass(/is-mobile-sidebar-expanded/);
  const expandedControlBox = await collapseButton.boundingBox();
  expect(collapsedControlBox).not.toBeNull();
  expect(expandedControlBox).not.toBeNull();
  expect(collapsedControlBox.width).toBe(44);
  expect(expandedControlBox.height).toBe(collapsedControlBox.height);
  expect(expandedControlBox.width).toBe(collapsedControlBox.width);
  expect(Math.abs(expandedControlBox.y - collapsedControlBox.y)).toBeLessThanOrEqual(1);
  await expect(collapseButton.locator(".sidebar-collapse-label")).toBeHidden();
  await expect(collapseButton.locator(".sidebar-collapse-label")).toHaveText("Menü einklappen");
  await expect(page.locator("#sidebar-user-badge")).toHaveCSS("width", "42px");
  await expect(page.locator("#sidebar-user-badge")).toHaveCSS("height", "42px");
  await expect(page.locator("#sidebar-notifications-button")).toHaveCSS("width", "42px");
  await expect(page.locator("#sidebar-notifications-button")).toHaveCSS("height", "42px");
  await expect(page.locator('[data-sidebar-section="care"]')).toHaveClass(/is-expanded/);
  await expect(page.locator('[data-sidebar-section="stakeholders"]')).toHaveClass(/is-collapsed/);
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveClass(/is-collapsed/);
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveAttribute("aria-label", "Hospitation");
  await expect(page.locator('[data-sidebar-section-toggle="planning"]')).toContainText("Hospitation");
  await expect(page.locator('[data-sidebar-section="formats"]')).toHaveClass(/is-collapsed/);
  await expect(page.locator('[data-sidebar-section="admin"]')).toHaveCount(0);
  await expect(page.locator("#sidebar-administration-section")).toHaveCount(0);
  await expect(page.locator("#sidebar-import-button")).toHaveCount(0);

  const moduleAccentColors = await page.locator("[data-sidebar-section] > .sidebar-section-toggle").evaluateAll((toggles) =>
    toggles.map((toggle) => getComputedStyle(toggle).borderLeftColor)
  );
  expect(new Set(moduleAccentColors).size).toBe(4);
  await expect(page.locator(".sidebar-module-icon:visible")).toHaveCount(4);
  await expect(page.locator(".sidebar-module-icon").first()).toHaveCSS("width", "32px");
  await expect(page.locator('[data-sidebar-section-toggle="planning"] .sidebar-module-icon svg')).toHaveCSS("transform", "none");
  await expect(page.locator('[data-view-tab="contacts"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".sidebar-nav")).toHaveCSS("overflow-y", "auto");

  const brandLayout = await page.locator(".sidebar-brand").evaluate((brand) => {
    const mark = brand.querySelector(".brand-mark")?.getBoundingClientRect();
    const copy = brand.querySelector(".sidebar-brand-copy")?.getBoundingClientRect();
    return {
      markRight: mark?.right || 0,
      copyLeft: copy?.left || 0,
      copyRight: copy?.right || 0,
      brandRight: brand.getBoundingClientRect().right
    };
  });
  expect(brandLayout.copyLeft).toBeGreaterThan(brandLayout.markRight);
  expect(brandLayout.copyRight).toBeLessThanOrEqual(brandLayout.brandRight + 1);

  await page.locator('[data-sidebar-section-toggle="planning"]').click();
  await expect(page.locator('[data-sidebar-section="care"]')).toHaveClass(/is-collapsed/);
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveClass(/is-expanded/);
  await expect(shell).toHaveAttribute("data-active-view", "contacts");

  await attachScreenshot(page, testInfo, "sidebar-mobile-expanded");

  await page.keyboard.press("Escape");
  await expect(shell).not.toHaveClass(/is-mobile-sidebar-expanded/);
  await expect(collapseButton).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  await expect(collapseButton).toHaveAttribute("aria-label", "Seitenleiste ausklappen");
  await expect(collapseButton).toHaveAttribute("aria-expanded", "false");
});

test("Suche: Versorgung filtert Karte und wird beim Modulwechsel geloescht", async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#map", {
    backendFixtureScript: `
      window.VERSORGUNGS_COMPASS_CONTACTS = [
        {
          id: "demo-map-contact-01",
          name: "Demo-Kontakt Karte 01",
          organization: "Demo-Praxis Karte",
          category: "Praxis",
          sector: "Praxis",
          specialty: "Allgemeinmedizin",
          contactRole: "Praxisinhaber",
          city: "Berlin",
          state: "Berlin",
          lat: 52.52,
          lon: 13.405,
          themes: ["Anbindung"],
          status: "active"
        },
        {
          id: "demo-map-contact-02",
          name: "Demo-Kontakt Karte 02",
          organization: "Demo-Klinik Karte",
          category: "Krankenhaus",
          sector: "Krankenhaus",
          specialty: "Kardiologie",
          contactRole: "Projektleitung",
          city: "Hamburg",
          state: "Hamburg",
          lat: 53.5511,
          lon: 9.9937,
          themes: ["Pilotierung"],
          status: "active"
        }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_INDICATIONS = [
        { id: "patient-indication-beratung", name: "Beratung", description: "Patientenberatung.", sortOrder: 10 }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATIONS = [
        { id: "demo-patient-org-beratung", name: "Demo-Patientenberatung Mitte", sector: "Beratung", organizationType: "Patientenorganisation", city: "Berlin", state: "Berlin", status: "active" }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_PEOPLE = [
        { id: "demo-patient-person-beratung", name: "Demo-Patientenkontakt 01", organizationId: "demo-patient-org-beratung", organization: "Demo-Patientenberatung Mitte", indication: "Beratung", city: "Berlin", state: "Berlin", status: "active" }
      ];`,
    navigationWaitUntil: "domcontentloaded"
  });

  await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
  await expect(page.frameLocator("#map-view-frame").locator("#count")).toContainText("2 / 2", { timeout: 20000 });

  await page.locator("#search").fill("Karte 01");
  await expect(page.frameLocator("#map-view-frame").locator("#count")).toContainText("1 / 1");

  await expect(page.locator("#search-clear-button")).toBeVisible();
  await page.locator("#search-clear-button").click({ force: true });
  await expect(page.locator("#search")).toHaveValue("");
  await expect(page.frameLocator("#map-view-frame").locator("#count")).toContainText("2 / 2");

  await page.locator("#search").fill("Karte 01");
  if (testInfo.project.name.includes("mobile")) {
    await page.locator("#sidebar-collapse-button").click();
    await expect(page.locator(".app-shell")).toHaveClass(/is-mobile-sidebar-expanded/);
  }
  const stakeholderSection = page.locator('[data-sidebar-section="stakeholders"]');
  if (await stakeholderSection.evaluate((section) => section.classList.contains("is-collapsed"))) {
    await page.locator('[data-sidebar-section-toggle="stakeholders"]').click();
    await expect(stakeholderSection).toHaveClass(/is-expanded/);
  }
  await page.locator('[data-view-tab="patients"]').click();
  await expect(page.locator("#search")).toHaveValue("");
  await expect(page.locator('#patient-mode-actions [data-patient-mode="organizations"] .experts-mode-count')).not.toHaveText("0");
  await expect(page.locator("#patients-pagination-meta")).toHaveText(/^[1-9]/);
});

test("Onboarding: neuer geschützter Account richtet Profil ein und startet Tour", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#map", {
    role: "viewer",
    backendFixtureScript: onboardingBackendFixtureScript()
  });

  await expect(page.locator('[data-view-panel="onboarding"]')).toBeVisible();
  await expect(page.locator("#workspace-view-title")).toHaveText("Willkommen");
  await expect(page.locator("#onboarding-display-name")).toHaveValue("steffen");
  await page.locator("#onboarding-team").selectOption("Stabsstelle Versorgung");
  await page.locator("#onboarding-profile-submit").click();
  await expect(page.locator("#onboarding-tour-panel")).toBeVisible();

  await page.locator("#onboarding-tour-start").click();
  await expect(page.locator("#product-tour")).toBeVisible();
  await expect(page.locator("#product-tour-meta")).toHaveText(/Schritt 1 von \d+/);
  await expect(page.locator("#product-tour-title")).toHaveText("Willkommen bei #Mitmachen");
  await expect(page.locator("#product-tour-panel")).toHaveClass(/is-welcome/);
  await expect(page.locator("#product-tour-details li")).toHaveCount(3);
  const onboardingTourStepCount = await page.locator("#product-tour-meta").textContent()
    .then((text) => text?.match(/von (\d+)/)?.[1] || "");
  await expect(page.locator(".product-tour-highlight")).toHaveCount(0);
  await page.locator("#product-tour-next").click();
  await expect(page.locator("#product-tour-meta")).toHaveText(`Schritt 2 von ${onboardingTourStepCount}`);
  await expect(page.locator("#product-tour-title")).toHaveText("Dein Profil ist der Ausgangspunkt");
  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator(".product-tour-highlight")).toHaveCount(1);
  await page.locator("#product-tour-prev").click();
  await expect(page.locator("#product-tour-meta")).toHaveText(`Willkommen · Schritt 1 von ${onboardingTourStepCount}`);
  await expect(page.locator(".product-tour-highlight")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await expect(page.locator("#product-tour")).toBeHidden();
  await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
  const settings = await page.evaluate(() => window.dataService.getUserSettings());
  expect(settings.preferences.onboarding.profileCompletedAt).toBeTruthy();
  expect(settings.preferences.onboarding.tourSkippedAt).toBeTruthy();

  await attachScreenshot(page, testInfo, "onboarding");
});

test("Onboarding: erster Start auf Home bleibt transient eingeklappt", async ({ page }, testInfo) => {
  await page.addInitScript(() => window.localStorage.setItem("versorgungs-kompass-sidebar-collapsed", "false"));
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html", {
    role: "viewer",
    backendFixtureScript: onboardingBackendFixtureScript()
  });

  const shell = page.locator(".app-shell");
  await expect(page.locator('[data-view-panel="onboarding"]')).toBeVisible();
  await page.locator("#onboarding-team").selectOption("Stabsstelle Versorgung");
  await page.locator("#onboarding-profile-submit").click();
  await expect(page.locator("#onboarding-tour-panel")).toBeVisible();
  await page.locator("#onboarding-tour-skip").click();
  await expect(shell).toHaveAttribute("data-active-view", "home");
  await expect(page.locator('[data-view-panel="home"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("versorgungs-kompass-sidebar-collapsed"))).toBe("false");
  if (testInfo.project.name.includes("mobile")) {
    await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
    await expect(shell).not.toHaveClass(/is-mobile-sidebar-expanded/);
  } else {
    await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  }
});

test("Onboarding: abgeschlossener neuer Account landet direkt in Zielansicht", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "viewer",
    backendFixtureScript: onboardingBackendFixtureScript({ completed: true })
  });

  await expect(page.locator('[data-view-panel="onboarding"]')).toBeHidden();
  await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();
  await openMobileSidebarIfNeeded(page);
  await page.locator("#sidebar-profile-button").click();
  await expect(page.locator("#profile-onboarding-status")).toContainText("Du kannst sie über App-Tour in der Sidebar jederzeit erneut starten.");
  const profileOnboardingStatusHtml = await page.locator("#profile-onboarding-status").evaluate((element) => element.innerHTML);
  expect(profileOnboardingStatusHtml).toContain("<br>");
  expect(profileOnboardingStatusHtml).toContain("Du kannst sie über App-Tour in der Sidebar jederzeit erneut starten.");
});

test("Organisationen: Demo-Daten rendern im CRM-Profilmodus", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#organizations");

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
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeVisible();
    await page.locator("#detail-drawer [data-open-organization-profile]").click();
  }

  const profile = page.locator("#organization-profile-body");
  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/care\//);
  await expect(profile.locator(".detail-profile")).toBeVisible();
  await expect(profile.locator("[data-organization-profile-back]")).toBeVisible();
  await expect(profile.locator("#organization-overview")).toBeVisible();
  await expect(profile.locator("#organization-overview")).toContainText("PVS · Praxisverwaltungssystem");
  await expect(profile.locator("#organization-overview")).toContainText("DemoSoft · Praxis Pilot");
  await expect(profile.locator("#organization-contacts")).toBeHidden();
  await profile.locator(".detail-tab").filter({ hasText: "Kontakte" }).click();
  await expect(profile.locator("#organization-overview")).toBeHidden();
  await expect(profile.locator("#organization-contacts")).toBeVisible();

  await attachScreenshot(page, testInfo, "organisationen");
});

test("Organisationsprofil: direkter Deeplink rendert Profilseite", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#organization/care/demo-org-nordstadt");

  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/care\/demo-org-nordstadt$/);
  await expect(page.locator("#organization-profile-body .detail-profile h3")).toContainText("MVZ Nordstadt");
  await expect(page.locator("#organization-profile-body #organization-overview")).toBeVisible();
  await expect(page.locator(".app-shell[data-active-view='organizationProfile'] .workspace-header")).toBeHidden();
  await expect(page.locator("#search")).toBeHidden();
});

test("Aktivitäten: globaler Kontaktverlauf rendert aufgeräumt und lädt vollständig", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#activities", {
    backendFixtureScript: activitiesBackendFixtureScript()
  });

  await expect(page.locator('[data-view-panel="activities"]')).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "activities");
  await expect(page.locator("#search")).toHaveAttribute("placeholder", /Aktivitäten nach Kontakt/);
  await expect(page.locator(".activities-search-slot .search-shell")).toBeVisible();
  await expect(page.locator("#activities-list .activity-item")).toHaveCount(36);
  await expect(page.locator("#activities-list .activity-item").first()).toHaveAttribute("data-activity-event-key", "contact.updated");
  await expect(page.locator("#activities-list .activity-item").first()).toHaveAttribute("data-activity-category", "master_data");
  await expect(page.locator("#activities-list .activity-item").first()).toHaveAttribute("data-activity-origin", "legacy");
  await expect(page.locator('#activities-list .activity-item[data-activity-event-key="contact.created"][data-activity-origin="data_import"]')).toHaveCount(5);
  await expect(page.locator('#activities-list .activity-item[data-activity-category="ownership"]')).toHaveCount(6);
  await expect(page.locator("#activities-load-more-row")).toHaveCount(0);
  await expect(page.locator(".app-shell[data-active-view='activities'] #summary-grid")).toBeHidden();
  await expect(page.locator(".activities-filter-field")).toHaveCount(3);
  await expect(page.locator(".activities-filter-field[data-custom-select] .custom-select-trigger")).toHaveCount(3);
  const activityKindSelectShell = page.locator('[data-select-type="activity-category"]');
  const activityUserSelectShell = page.locator('[data-select-type="activity-user"]');
  const activityRangeSelectShell = page.locator('[data-select-type="activity-range"]');
  await expect(activityKindSelectShell.locator(".custom-select-trigger__label")).toHaveText("Alle Kategorien");
  await expect(activityUserSelectShell.locator(".custom-select-trigger__label .activity-user-filter-name")).toHaveText("Alle Nutzer");
  await expect(activityUserSelectShell.locator(".custom-select-trigger__label .activity-user-filter-avatar")).toBeVisible();
  await expect(activityRangeSelectShell.locator(".custom-select-trigger__label")).toHaveText("Alle Zeiten");
  await activityKindSelectShell.locator(".custom-select-trigger").click();
  await expect(activityKindSelectShell.locator(".custom-select-panel")).toBeVisible();
  await expect(activityKindSelectShell.locator(".custom-select-option")).toHaveCount(8);
  await activityKindSelectShell.locator(".custom-select-option", { hasText: "Alle Kategorien" }).click();
  await activityUserSelectShell.locator(".custom-select-trigger").click();
  await expect(activityUserSelectShell.locator(".custom-select-panel")).toBeVisible();
  await expect(activityUserSelectShell.locator(".custom-select-option .activity-user-filter-avatar").first()).toBeVisible();
  await activityUserSelectShell.locator(".custom-select-option", { hasText: "Alle Nutzer" }).click();
  await activityRangeSelectShell.locator(".custom-select-trigger").click();
  await expect(activityRangeSelectShell.locator(".custom-select-panel")).toBeVisible();
  await expect(activityRangeSelectShell.locator(".custom-select-option")).toHaveCount(4);
  await activityRangeSelectShell.locator(".custom-select-option", { hasText: "Alle Zeiten" }).click();
  await expect(page.locator(".activity-type-chip")).toHaveCount(0);
  await expect(page.locator("#activities-meta")).toHaveText("36 Aktivitäten");
  await expect(page.locator("#activities-list .activity-title")).toHaveCount(36);
  await expect(page.locator("#activities-list .activity-title").first()).toHaveText("Kontaktdaten aktualisiert");
  await expect(page.locator("#activities-list .activity-category-icon").first()).toBeVisible();
  await expect(page.locator("#activities-list .activity-category-badge").first()).toHaveText("Stammdaten");
  await expect(page.locator('#activities-list [data-activity-origin="legacy"] .activity-origin')).toHaveCount(0);
  await expect(page.locator("#activities-list")).not.toContainText("Herkunft: Altdaten");
  await expect(page.locator('#activities-list [data-activity-origin="data_import"] .activity-origin').first()).toHaveText(/Herkunft\s*Datenimport/);
  await expect(page.locator("#activities-list .activity-entry-head time")).toHaveCount(0);
  await expect(page.locator("#activities-list .activity-detail-meta time")).toHaveCount(36);
  await expect(page.locator(".activity-contact-button")).toHaveCount(0);
  await expect(page.locator("#activities-list .activity-actor-cell").first()).toBeVisible();
  await expect(page.locator("#activities-list .activity-actor-team").first()).toHaveText("Versorgung");
  const allOwnerTeamBadgesAreFullyVisible = await page.locator("#activities-list .activity-actor-team").evaluateAll((nodes) => nodes.every((node) => {
    const style = getComputedStyle(node);
    return node.scrollWidth <= node.clientWidth + 1
      && node.scrollHeight <= node.clientHeight + 1
      && style.borderRadius !== "0px"
      && style.textOverflow === "clip";
  }));
  expect(allOwnerTeamBadgesAreFullyVisible).toBe(true);
  await expect(page.locator("#activities-list .activity-contact-avatar").first()).toBeVisible();
  await expect(page.locator("#activities-list .activity-contact-context").first()).toBeVisible();
  await expect(page.locator("#activities-list .activity-contact-meta")).toHaveCount(0);
  await expect(page.locator("#activities-list .activity-subject-cell .activity-object-context")).toHaveCount(0);
  await expect(page.locator("#activities-list")).not.toContainText("MVZ Aktiv Nord");
  await expect(page.locator("#activities-list .activity-contact-name").first()).toHaveText("Aktivitätskontakt 1");
  const firstActivityUsesCompactTableOrder = await page.locator("#activities-list .activity-item").first().evaluate((node) => {
    const actor = node.querySelector(".activity-actor-cell")?.getBoundingClientRect();
    const title = node.querySelector(".activity-title-cell")?.getBoundingClientRect();
    const subject = node.querySelector(".activity-subject-cell")?.getBoundingClientRect();
    const icon = node.querySelector(".activity-title-cell .activity-category-icon")?.getBoundingClientRect();
    const contactAvatar = node.querySelector(".activity-subject-cell .activity-contact-avatar")?.getBoundingClientRect();
    const category = node.querySelector(".activity-category-cell")?.getBoundingClientRect();
    const details = node.querySelector(".activity-entry-side")?.getBoundingClientRect();
    if (!actor || !title || !subject || !icon || !contactAvatar || !category || !details) return false;
    const usesTwoContentRows = title.bottom <= subject.top;
    const iconsShareVerticalAxis = Math.abs(icon.left - contactAvatar.left) <= 1
      && Math.abs(icon.width - contactAvatar.width) <= 1
      && icon.bottom <= contactAvatar.top;
    if (window.innerWidth <= 760) return actor.bottom <= title.top && usesTwoContentRows && iconsShareVerticalAxis && details.right < category.left;
    return actor.right < title.left && usesTwoContentRows && iconsShareVerticalAxis && subject.right < category.left && category.right < details.left;
  });
  expect(firstActivityUsesCompactTableOrder).toBe(true);
  const firstCollapsedActivityHeight = await page.locator("#activities-list .activity-entry").first().evaluate((node) => node.getBoundingClientRect().height);
  if (page.viewportSize()?.width > 760) {
    expect(firstCollapsedActivityHeight).toBeGreaterThan(76);
    expect(firstCollapsedActivityHeight).toBeLessThan(104);
  }
  await expect(page.locator("#activities-list .activity-time-chip")).toHaveCount(0);
  const firstDetailsButton = page.locator("#activities-list .activity-details-toggle").first();
  await expect(firstDetailsButton).toBeVisible();
  await expect(firstDetailsButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#activities-list .activity-detail-panel").first()).toBeHidden();
  await firstDetailsButton.click();
  await expect(firstDetailsButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#activities-list .activity-detail-panel").first()).toBeVisible();
  await expect(page.locator("#activities-list .activity-detail-meta time").first()).toBeVisible();
  await expect(page.locator("#activities-list .activity-detail-time").first()).toBeVisible();
  await expect(page.locator("#activities-list .activity-detail-time-icon").first()).toBeVisible();
  await expect(page.locator("#activities-list .activity-detail-date").first()).toContainText("2026");
  await expect(page.locator("#activities-list .activity-detail-clock").first()).toContainText("Uhr");
  await expect(page.locator("#activities-list .activity-detail-title")).toHaveCount(0);
  await expect(page.locator("#activities-list .history-change").first()).toBeVisible();
  await page.locator("#activities-list .activity-item").first().click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "activities");
  await expect(page).toHaveURL(/#activities$/);
  const badgeBackgrounds = await page.locator("#activities-list .activity-category-badge").evaluateAll((nodes) => (
    [...new Set(nodes.map((node) => getComputedStyle(node).backgroundColor))]
  ));
  expect(badgeBackgrounds.length).toBeGreaterThanOrEqual(2);

  await attachScreenshot(page, testInfo, "aktivitaeten");

  await activityKindSelectShell.locator(".custom-select-trigger").click();
  await activityKindSelectShell.locator(".custom-select-option", { hasText: "Zuständigkeit" }).click();
  await expect(page.locator("#activity-kind-filter")).toHaveValue("ownership");
  await expect(page.locator("#activities-list .activity-item").first()).toBeVisible();
  await expect(page.locator('#activities-list .activity-item:not([data-activity-category="ownership"])')).toHaveCount(0);
  await expect(page.locator("#activities-list .activity-category-badge").first()).toHaveText("Zuständigkeit");
  await expect(page.locator("#activities-list .activity-details-toggle").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Aktivitäten: kanonischer Read-Pfad speist globalen und kontaktbezogenen Verlauf", async ({ page }, testInfo) => {
  const backendFixture = createProtectedBackendFixture({ role: "admin" });
  backendFixture.activities = [
      {
        id: "local-activity-hospitation",
        event_key: "hospitation.created",
        category: "hospitation",
        action: "created",
        entity_type: "hospitation",
        entity_id: "hospitation-activity-test",
        contact_id: "activity-contact-01",
        actor_id: "11111111-1111-4111-8111-111111111111",
        occurred_at: "2026-06-09T10:05:00.000Z",
        origin_type: "manual",
        references: [{ type: "contact", id: "activity-contact-01", label: "Aktivitätskontakt 1" }],
        changes: { status: { before: "", after: "Geplant" } },
        metadata: { entityLabel: "Test-Hospitation" },
        created_at: "2026-06-09T10:05:00.000Z"
      },
      {
        id: "local-activity-format-invitation",
        event_key: "format.invitation.created",
        category: "format",
        action: "invited",
        entity_type: "format_invitation",
        entity_id: "format-invitation-activity-test",
        contact_id: "activity-contact-01",
        actor_id: "11111111-1111-4111-8111-111111111111",
        occurred_at: "2026-06-09T10:04:00.000Z",
        origin_type: "manual",
        references: [{ type: "contact", id: "activity-contact-01", label: "Aktivitätskontakt 1" }],
        changes: {},
        metadata: { entityLabel: "Test-Einladung" },
        created_at: "2026-06-09T10:04:00.000Z"
      },
      {
        id: "local-activity-consent",
        event_key: "contact.consent.granted",
        category: "consent",
        action: "granted",
        entity_type: "contact",
        entity_id: "activity-contact-01",
        contact_id: "activity-contact-01",
        actor_id: "11111111-1111-4111-8111-111111111111",
        occurred_at: "2026-06-09T10:03:00.000Z",
        origin_type: "manual",
        references: [{ type: "contact", id: "activity-contact-01", label: "Aktivitätskontakt 1" }],
        changes: { mitmachen_consent_status: { before: "not_requested", after: "granted" } },
        metadata: { entityLabel: "Aktivitätskontakt 1" },
        created_at: "2026-06-09T10:03:00.000Z"
      },
      {
        id: "local-activity-note",
        event_key: "note.created",
        category: "note_document",
        action: "created",
        entity_type: "note",
        entity_id: "note-activity-test",
        contact_id: "activity-contact-01",
        actor_id: "11111111-1111-4111-8111-111111111111",
        occurred_at: "2026-06-09T10:02:00.000Z",
        origin_type: "manual",
        references: [{ type: "contact", id: "activity-contact-01", label: "Aktivitätskontakt 1" }],
        changes: { body: { before: "", after: "Gespräch dokumentiert" } },
        metadata: { entityLabel: "Gesprächsnotiz" },
        created_at: "2026-06-09T10:02:00.000Z"
      },
      {
        id: "local-activity-legacy",
        event_key: "legacy.activity.recorded",
        category: "unknown",
        action: "recorded",
        entity_type: "activity",
        entity_id: "legacy-activity-test",
        contact_id: "activity-contact-01",
        actor_id: "11111111-1111-4111-8111-111111111111",
        occurred_at: "2026-06-09T10:01:00.000Z",
        origin_type: "legacy",
        references: [{ type: "contact", id: "activity-contact-01", label: "Aktivitätskontakt 1" }],
        changes: {},
        metadata: { title: "Historischer Eintrag" },
        created_at: "2026-06-09T10:01:00.000Z"
      },
      {
        id: "local-activity-owner",
        event_key: "contact.owner.changed",
        category: "ownership",
        action: "changed",
        entity_type: "contact",
        entity_id: "activity-contact-01",
        contact_id: "activity-contact-01",
        actor_id: "11111111-1111-4111-8111-111111111111",
        occurred_at: "2026-06-09T10:00:00.000Z",
        origin_type: "manual",
        references: [{ type: "contact", id: "activity-contact-01", label: "Aktivitätskontakt 1" }],
        changes: { owner_ids: { before: [], after: ["11111111-1111-4111-8111-111111111111"] } },
        metadata: { entityLabel: "Aktivitätskontakt 1" },
        created_at: "2026-06-09T10:00:00.000Z"
      },
      {
        id: "local-activity-master-data",
        event_key: "contact.updated",
        category: "master_data",
        action: "updated",
        entity_type: "contact",
        entity_id: "activity-contact-01",
        contact_id: "activity-contact-01",
        actor_id: "11111111-1111-4111-8111-111111111111",
        occurred_at: "2026-06-09T09:59:00.000Z",
        origin_type: "manual",
        references: [{ type: "contact", id: "activity-contact-01", label: "Aktivitätskontakt 1" }],
        changes: { city: { before: "Beispielstadt", after: "Musterstadt" } },
        metadata: { entityLabel: "Aktivitätskontakt 1" },
        created_at: "2026-06-09T09:59:00.000Z"
      }
    ];
  backendFixture.changes = [];
  backendFixture.contacts = [{
    id: "activity-contact-01",
    name: "Aktivitätskontakt 1",
    organization: "Demo-Organisation Aktivität",
    category: "Praxis",
    sector: "Praxis",
    specialty: "Allgemeinmedizin",
    city: "Musterstadt",
    state: "Berlin",
    ownerId: "11111111-1111-4111-8111-111111111111",
    ownerIds: ["11111111-1111-4111-8111-111111111111"],
    status: "active"
  }];
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    backendFixture
  });

  const result = await page.evaluate(async () => {
    const global = await window.dataService.getActivities({ eventKey: "hospitation.created", limit: 10 });
    const contact = await window.dataService.getContactChanges("activity-contact-01", { eventKey: "hospitation.created" });
    const withoutChanges = await window.dataService.getActivities({ eventKey: "format.invitation.created", limit: 10 });
    const created = global.items[0] || {};
    return {
      publicProducerType: typeof window.dataService.recordActivityEvent,
      createdId: created.id,
      createdEventKey: created.eventKey,
      createdCategory: created.categoryKey,
      createdActorId: created.actorId,
      emptyChangeCount: withoutChanges.items[0]?.changes?.length,
      globalIds: global.items.map((item) => item.id),
      contactIds: contact.map((item) => item.id)
    };
  });

  expect(result.publicProducerType).toBe("undefined");
  expect(result.createdId).toBeTruthy();
  expect(result.createdEventKey).toBe("hospitation.created");
  expect(result.createdCategory).toBe("hospitation");
  expect(result.createdActorId).toBe("11111111-1111-4111-8111-111111111111");
  expect(result.emptyChangeCount).toBe(0);
  expect(result.globalIds).toContain(result.createdId);
  expect(result.contactIds).toContain(result.createdId);

  await page.evaluate(() => { window.location.hash = "#activities"; });
  await expect(page.locator("#activities-list .activity-subject-cell .activity-object-context")).toHaveCount(0);
  const withoutChangesItem = page.locator('#activities-list .activity-item[data-activity-event-key="format.invitation.created"]');
  await expect(withoutChangesItem).toBeVisible();
  await expect(withoutChangesItem.locator(".activity-title")).toHaveText("Zu Format eingeladen");
  await expect(withoutChangesItem.locator(".activity-category-badge")).toHaveText("Format");
  await expect(withoutChangesItem.locator(".activity-category-icon")).toBeVisible();
  await expect(withoutChangesItem.locator(".activity-details-toggle")).toBeEnabled();
  await expect(withoutChangesItem.locator(".history-change")).toHaveCount(0);
  await withoutChangesItem.locator(".activity-details-toggle").click();
  await expect(withoutChangesItem.locator(".activity-detail-meta time")).toBeVisible();
  const globalHospitationVisual = await page.locator('#activities-list .activity-row[data-activity-event-key="hospitation.created"]').evaluate((node) => ({
    accent: getComputedStyle(node.querySelector(".activity-entry")).borderLeftColor,
    badge: getComputedStyle(node.querySelector(".activity-category-badge")).color,
    icon: node.querySelector(".activity-category-icon svg")?.innerHTML || ""
  }));
  const categoryVisuals = await page.locator("#activities-list .activity-row").evaluateAll((nodes) => {
    const byCategory = new Map();
    nodes.forEach((node) => {
      const key = node.getAttribute("data-activity-category") || "unknown";
      if (!byCategory.has(key)) {
        byCategory.set(key, {
          label: node.querySelector(".activity-category-badge")?.textContent?.trim() || "",
          accent: getComputedStyle(node.querySelector(".activity-entry")).borderLeftColor,
          hasIcon: Boolean(node.querySelector(".activity-category-icon svg"))
        });
      }
    });
    return Object.fromEntries(byCategory);
  });
  expect(Object.keys(categoryVisuals).sort()).toEqual(["consent", "format", "hospitation", "master_data", "note_document", "ownership", "unknown"]);
  expect(new Set(Object.values(categoryVisuals).map(({ accent }) => accent)).size).toBeGreaterThanOrEqual(5);
  expect(Object.values(categoryVisuals).every(({ label, hasIcon }) => Boolean(label && hasIcon))).toBe(true);

  const categoryFilter = page.locator("#activity-kind-filter");
  for (const categoryKey of ["master_data", "ownership", "consent", "hospitation", "format", "note_document", "unknown"]) {
    await categoryFilter.selectOption(categoryKey);
    await expect(page.locator(`#activities-list .activity-item[data-activity-category="${categoryKey}"]`).first()).toBeVisible();
    await expect(page.locator(`#activities-list .activity-item:not([data-activity-category="${categoryKey}"])`)).toHaveCount(0);
  }
  await categoryFilter.selectOption("all");

  await page.evaluate(() => { window.location.hash = "#contacts"; });
  await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();
  await page.locator('#contact-list [data-id="activity-contact-01"]').click();
  const profileRoot = page.locator(testInfo.project.name.includes("mobile") ? "#person-profile-body" : "#detail-drawer");
  await profileRoot.locator('[data-detail-tab="activity"]').click();
  const profileHospitation = profileRoot.locator('#history-timeline .activity-row[data-activity-event-key="hospitation.created"]');
  await expect(profileHospitation).toBeVisible();
  await expect(profileHospitation).toHaveClass(/history-item/);
  await expect(profileHospitation.locator(".activity-title")).toHaveText("Hospitation angelegt");
  await expect(profileHospitation.locator(".activity-category-badge")).toHaveText("Hospitation");
  await expect(profileHospitation.locator(".activity-category-icon")).toBeVisible();
  const profileHospitationVisual = await profileHospitation.evaluate((node) => ({
    accent: getComputedStyle(node.querySelector(".activity-entry")).borderLeftColor,
    badge: getComputedStyle(node.querySelector(".activity-category-badge")).color,
    icon: node.querySelector(".activity-category-icon svg")?.innerHTML || ""
  }));
  expect(profileHospitationVisual).toEqual(globalHospitationVisual);
  await profileHospitation.locator(".activity-details-toggle").click();
  await expect(profileHospitation.locator(".activity-detail-panel")).toBeVisible();
  await expect(profileHospitation.locator(".history-value-label")).toHaveText(["Zeitpunkt", "Vorher", "Nachher"]);
  await expect(profileRoot.locator('#history-filters [data-history-filter="hospitation"]')).toHaveText("Hospitation");
  await profileRoot.locator('#history-filters [data-history-filter="hospitation"]').click();
  await expect(profileRoot.locator('#history-timeline .activity-row:not([data-activity-category="hospitation"])')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("Benachrichtigungen: Glocke öffnet Vorschau und Profil-Reiter rendert Inbox", async ({ page }, testInfo) => {
  const backendFixture = createProtectedBackendFixture({
    role: "admin",
    notifications: [
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
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    backendFixture
  });

  await openMobileSidebarIfNeeded(page);
  await expect(page.locator("#notification-count-total")).toBeVisible();
  await page.locator("#sidebar-notifications-button").click();
  await expect(page.locator("#notification-popover")).toBeVisible();
  await expect(page.locator("#notification-popover-title")).toHaveText("Benachrichtigungen");
  await expect(page.locator("#notification-popover-meta")).toHaveCount(0);
  await expect(page.locator("#notification-popover-list .notification-popover__loading")).toHaveCount(0);
  await expect(page.locator("#notification-popover")).not.toContainText("Benachrichtigungen werden geladen");
  await expect(page.locator("#notification-popover-list .notification-preview-item")).toHaveCount(5);
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
  await expect.poll(() => backendFixture.notifications.find((item) => item.id === "visual-notification-contact-update")?.readAt).toBeTruthy();
  await expect(page.locator("#notifications-list .notifications-empty")).toBeVisible();
  await expect(page.locator("#notification-count-total")).toBeHidden();
  await page.locator('[data-notification-filter="all"]').click();
  const readContactNotification = page.locator('#notifications-list [data-notification-id="visual-notification-contact-update"]');
  await expect(readContactNotification).toBeVisible();
  await expect(readContactNotification).not.toHaveClass(/is-unread/);
  await expect(page.locator("#notifications-mark-all-read")).toBeDisabled();
  await page.locator('[data-notification-filter="unread"]').click();
  await expect(page.locator("#notifications-list .notifications-empty")).toBeVisible();
  await expect(page.locator("#notifications-list .notification-empty-state__icon")).toBeVisible();
  await expect(page.locator("#notifications-mark-all-read")).toBeHidden();

  await openMobileSidebarIfNeeded(page);
  await page.locator("#sidebar-notifications-button").click();
  await expect(page.locator("#notification-popover")).toBeVisible();
  await expect(page.locator("#notification-popover-list .notification-popover__empty")).toContainText("Keine neuen Benachrichtigungen.");
  await expect(page.locator("#notification-popover-list .notification-empty-state__icon")).toBeVisible();

  await attachScreenshot(page, testInfo, "hinweise");
});

test("Expertenkreis: getrennte Kontakt- und Organisationsansicht rendert", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#experts");

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
  await expect(page.locator("#experts-pagination-meta")).toHaveText(/1-\d+ von \d+ Kontakten/);
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
    const longGroupOption = groupFilterMenu.locator(".filter-option", { hasText: "Demo-Wissenschaftliche Einrichtung und Patientenorganisation" });
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
    await expect(page.locator("#person-profile-body #detail-overview")).toBeVisible();
    await expect(page.locator("#expert-detail-overview")).toHaveCount(0);
    await expect(page.locator("#person-profile-body .detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
    await page.locator('#person-profile-body [data-detail-tab="themes"]').click();
    await expect(page.locator("#person-profile-body #detail-themes")).toContainText("Mögliche Themen");
    await expect(page.locator("#person-profile-body #detail-theme-input")).toBeVisible();
    await page.locator("#person-profile-body [data-person-profile-back]").click();
  } else {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await expect(page.locator("#detail-open-profile")).toHaveCount(0);
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-profile-meta")).toContainText("Owner");
    await expect(page.locator("#detail-drawer .detail-profile-top")).not.toContainText("Demo-Wissenschaftliche Einrichtung und Patientenorganisation");
    await expect(page.locator("#detail-drawer .detail-profile-top")).not.toContainText("Experte seit");
    await expect(page.locator("#detail-drawer #detail-overview .detail-line").filter({ hasText: "Gruppe" })).toContainText("Demo-Wissenschaftliche Einrichtung und Patientenorganisation");
    await page.locator('#detail-drawer [data-detail-tab="themes"]').click();
    await expect(page.locator("#detail-drawer #detail-themes")).toContainText("Mögliche Themen");
    await expect(page.locator("#detail-drawer #detail-theme-input")).toBeVisible();
    expect(await page.locator("#detail-drawer #detail-themes .theme-tag--preset").count()).toBeGreaterThan(1);
    await page.locator("#detail-drawer #detail-theme-input").fill("Interoperabilitäts-Testthema");
    await page.locator("#detail-drawer #detail-theme-add").click();
    await expect(page.locator("#detail-drawer #detail-themes")).toContainText("Interoperabilitäts-Testthema");
    await page.locator('#detail-drawer [data-detail-tab="notes"]').click();
    await expect(page.locator("#detail-drawer .contact-notes-thread")).toBeVisible();
    await expect(page.locator("#detail-drawer #contact-notes-composer")).toBeVisible();
    await page.locator("#detail-close").click();
    await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  }

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
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeVisible();
    await page.locator("#detail-drawer [data-open-organization-profile]").click();
  }
  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/expert\//);
  await expect(page.locator("#organization-profile-body .detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await page.locator("#organization-profile-body [data-organization-profile-back]").click();

  await attachScreenshot(page, testInfo, "expertenkreis");
});

test("Patienten: Organisationsliste nach Indikation rendert ohne Kontakte", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#patients", {
    backendFixtureScript: `
      window.VERSORGUNGS_COMPASS_PATIENT_INDICATIONS = [
        {
          id: "patient-indication-oncology",
          name: "Onkologie und Hämatologie",
          description: "Bündelt Krebserkrankungen, solide Tumoren sowie Erkrankungen des Blut- und Lymphsystems.",
          sortOrder: 10
        },
        {
          id: "patient-indication-rare",
          name: "Seltene Erkrankungen und Genetik",
          description: "Querschnitt für seltene, häufig genetisch bedingte Erkrankungen.",
          sortOrder: 20
        }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATIONS = [
        {
          id: "demo-patient-oncology-org",
          name: "Demo-Patientenverband Onkologie",
          groupId: "patient-indication-oncology",
          group: "Onkologie und Hämatologie",
          category: "Onkologie und Hämatologie",
          sector: "Onkologie und Hämatologie",
          organizationType: "Patientenorganisation",
          postalCode: "10115",
          city: "Berlin",
          state: "Berlin",
          website: "https://patienten-onkologie.example.invalid",
          source: "Geschütztes Test-Backend",
          status: "active",
          updatedAt: "2026-06-20T00:00:00.000Z"
        },
        {
          id: "demo-patient-rare-org",
          name: "Demo-Netzwerk Seltene Erkrankungen",
          groupId: "patient-indication-rare",
          group: "Seltene Erkrankungen und Genetik",
          category: "Seltene Erkrankungen und Genetik",
          sector: "Seltene Erkrankungen und Genetik",
          organizationType: "Patientenorganisation",
          postalCode: "20095",
          city: "Hamburg",
          state: "Hamburg",
          website: "https://patienten-selten.example.invalid",
          source: "Geschütztes Test-Backend",
          status: "active",
          updatedAt: "2026-06-21T00:00:00.000Z"
        }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_PEOPLE = [
        {
          id: "demo-patient-person-oncology",
          name: "Demo-Patientenkontakt 01",
          organizationId: "demo-patient-oncology-org",
          organization: "Demo-Patientenverband Onkologie",
          role: "Vorstand",
          city: "Berlin",
          state: "Berlin",
          indicationId: "patient-indication-oncology",
          indication: "Onkologie und Hämatologie",
          group: "Onkologie und Hämatologie",
          category: "Onkologie und Hämatologie",
          sector: "Onkologie und Hämatologie",
          source: "Geschütztes Test-Backend",
          status: "active"
        }
      ];`
  });

  await expect(page.locator('[data-view-panel="patients"]')).toBeVisible();
  await expect(page.locator('[data-view-tab="patients"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-sidebar-section="stakeholders"]')).toHaveClass(/is-active-section/);
  await expect(page.locator("#workspace-view-title")).toHaveText("Patienten");
  await expect(page.locator('.app-shell[data-active-view="patients"] #summary-grid')).toBeHidden();
  const mobileProject = testInfo.project.name.includes("mobile");
  await expect(page.locator("#patient-mode-actions")).toBeVisible();
  await expect(page.locator('#patient-mode-actions [data-patient-mode="organizations"]')).toHaveClass(/is-active/);
  await expect(page.locator('#patient-mode-actions [data-patient-mode="people"]')).toContainText("Personen");
  await expect(page.locator('#patient-mode-actions [data-patient-mode="organizations"]')).toContainText("Organisationen");
  await expect(page.locator('#patient-mode-actions [data-patient-mode="indications"]')).toContainText("Indikationen");
  await expect(page.locator('[data-filter-field="category"] summary')).toHaveText("Indikation");
  await expect(page.locator("#patient-organizations-table")).toBeVisible();
  await expect(page.locator("#patient-people-table")).toBeHidden();
  await expect(page.locator("#patient-organizations-table-head")).toContainText("Indikation");
  await expect(page.locator("#patient-organizations-table-head")).not.toContainText("Gruppe");
  await expect(page.locator("#patient-organizations-table-head")).not.toContainText("Kontakte");
  await expect(page.locator("#patient-organization-list .row").first()).toBeVisible();
  await expect(page.locator("#patient-organization-list .row").first().locator(".cell--organization .contact-subline")).toHaveCount(0);
  const organizationIndicationBadges = mobileProject
    ? page.locator("#patient-organization-list .organization-mobile-sector .patient-indication-badge")
    : page.locator("#patient-organization-list .cell--sector .patient-indication-badge");
  await expect(organizationIndicationBadges.first()).toBeVisible();
  const oncologyBadge = organizationIndicationBadges.filter({ hasText: "Onkologie" }).first();
  await expect(oncologyBadge).toBeVisible();
  const oncologyBadgeTone = await oncologyBadge.evaluate((badge) =>
    getComputedStyle(badge).getPropertyValue("--patient-indication-bg").trim()
  );
  expect(await organizationIndicationBadges.count()).toBeGreaterThan(1);
  const organizationBadgeTones = await organizationIndicationBadges.evaluateAll((badges) =>
    badges.map((badge) => getComputedStyle(badge).getPropertyValue("--patient-indication-bg").trim())
  );
  expect(new Set(organizationBadgeTones).size).toBeGreaterThan(1);
  if (!mobileProject) {
    await expect(page.locator("#patient-organization-list .row").first().locator(".cell--location")).not.toContainText(/\b\d{5}\b/);
  }
  await expect(page.locator("#patients-pagination-meta")).toContainText("Organisationen");
  await expectPageSizeDropdownUsable(page, "#view-patients .page-size-shell");

  await page.locator('#patient-mode-actions [data-patient-mode="people"]').click();
  await expect(page.locator("#patient-people-table")).toBeVisible();
  await expect(page.locator("#patient-organizations-table")).toBeHidden();
  await expect(page.locator("#patient-people-table-head")).toContainText("Person");
  await expect(page.locator("#patient-people-table-head")).toContainText("Organisation");
  await expect(page.locator("#patient-people-table-head")).toContainText("Indikation");
  await expect(page.locator("#patient-people-table-head")).not.toContainText("Gruppe");
  await expect(page.locator("#patient-people-table-head")).not.toContainText("Kontakte");
  const patientPersonEntry = mobileProject
    ? page.locator("#patient-people-list .mobile-contact-card").first()
    : page.locator("#patient-people-list .row").first();
  await expect(patientPersonEntry).toBeVisible();
  if (mobileProject) {
    await expect(patientPersonEntry).toContainText("Demo-Patientenkontakt 01");
    await expect(patientPersonEntry).toContainText("Demo-Patientenverband Onkologie");
  } else {
    await expect(patientPersonEntry.locator(".cell--name .contact-subline")).toHaveCount(0);
    await expect(patientPersonEntry.locator(".cell--indication .patient-indication-badge")).toContainText("Onkologie");
    await expect(patientPersonEntry.locator(".cell--role")).toContainText("Vorstand");
  }
  await expect(page.locator("#patients-pagination-meta")).toContainText("Personen");

  await page.locator('#patient-mode-actions [data-patient-mode="indications"]').click();
  await expect(page.locator("#patient-indications-panel")).toBeVisible();
  await expect(page.locator("#patient-people-table")).toBeHidden();
  await expect(page.locator("#patient-organizations-table")).toBeHidden();
  const indicationCards = page.locator("#patient-indications-list .patient-indication-card");
  const oncologyCard = indicationCards.filter({ hasText: "Onkologie und Hämatologie" }).first();
  await expect(oncologyCard).toBeVisible();
  await expect(oncologyCard.locator(".patient-indication-card__icon")).toBeVisible();
  await expect(page.locator("#patient-indications-list .patient-indication-card__icon")).toHaveCount(await indicationCards.count());
  const oncologyCardTone = await oncologyCard.evaluate((card) =>
    getComputedStyle(card).getPropertyValue("--patient-indication-bg").trim()
  );
  expect(oncologyCardTone).toBe(oncologyBadgeTone);
  await expect(page.locator("#patient-indications-list .patient-indication-card").filter({ hasText: "Seltene Erkrankungen und Genetik" })).toBeVisible();
  await expect(page.locator("#patients-pagination-meta")).toContainText("Indikationen");

  await page.locator('#patient-mode-actions [data-patient-mode="organizations"]').click();
  await expect(page.locator("#patient-organizations-table")).toBeVisible();
  await page.locator("#patient-organization-list .row").first().click();
  if (testInfo.project.name.includes("mobile")) {
    await expect(page).toHaveURL(/#organization\/patient\//);
    await expect(page.locator("#organization-profile-page")).toBeVisible();
    await expect(page.locator("#organization-profile-body")).toContainText("Indikation");
    await expect(page.locator("#organization-profile-body")).toContainText("PLZ");
    await expect(page.locator("#organization-profile-body")).toContainText("Stadt");
    await expect(page.locator("#organization-profile-body")).not.toContainText("Zugeordnete Kontakte");
  } else {
    await expect(page.locator("#detail-drawer")).toHaveClass(/is-open/);
    await expect(page.locator("#detail-drawer #patient-organization-overview .detail-line").filter({ hasText: "Indikation" })).toBeVisible();
    await expect(page.locator("#detail-drawer #patient-organization-overview .detail-line").filter({ hasText: "PLZ" })).toBeVisible();
    await expect(page.locator("#detail-drawer #patient-organization-overview .detail-line").filter({ hasText: "Stadt" })).toBeVisible();
    await expect(page.locator("#detail-drawer #patient-organization-overview .detail-line").filter({ hasText: "Standort" })).toHaveCount(0);
    await expect(page.locator("#detail-drawer")).not.toContainText("Zugeordnete Kontakte");
  }

  await attachScreenshot(page, testInfo, "patienten");
});

test("Patienten: Organisationsindikationen nutzen kuratiertes Mapping nach ID", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#patients", {
    backendFixtureScript: `
      window.VERSORGUNGS_COMPASS_PATIENT_INDICATIONS = [
        {
          id: "patient-indication-cross-cutting",
          name: "Übergreifende Patientenvertretung und Beratung",
          description: "Querschnitt für Patientenrechte, unabhängige Beratung und Patientensicherheit.",
          sortOrder: 10
        },
        {
          id: "patient-indication-gastro",
          name: "Gastroenterologie und Verdauung",
          description: "Umfasst Erkrankungen von Magen, Darm, Leber und Verdauung.",
          sortOrder: 20
        },
        {
          id: "patient-indication-mental-health",
          name: "Psychische Gesundheit und Neurodivergenz",
          description: "Fasst psychische Erkrankungen und psychosoziale Versorgung zusammen.",
          sortOrder: 30
        }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATION_INDICATIONS = {
        "demo-patient-cross": "Übergreifende Patientenvertretung und Beratung",
        "demo-patient-gastro": "Gastroenterologie und Verdauung",
        "demo-patient-mental": "Psychische Gesundheit und Neurodivergenz"
      };
      window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATIONS = [
        {
          id: "demo-patient-cross",
          name: "Demo-Patientenvertretung Übergreifend",
          organizationType: "Patientensicherheitsnetzwerk",
          city: "Berlin",
          state: "Berlin",
          status: "active"
        },
        {
          id: "demo-patient-gastro",
          name: "Demo-Patientenverband Gastro",
          organizationType: "Krankheitsbezogene Selbsthilfevertretung",
          city: "Berlin",
          state: "Berlin",
          status: "active"
        },
        {
          id: "demo-patient-mental",
          name: "Demo-Patientenverband Psychische Gesundheit",
          organizationType: "Krankheitsbezogene Patientenvertretung",
          city: "Bonn",
          state: "Nordrhein-Westfalen",
          status: "active"
        }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_PEOPLE = [
        {
          id: "demo-patient-person-mental",
          name: "Demo-Patientenkontakt 02",
          organizationId: "demo-patient-mental",
          organization: "Demo-Patientenverband Psychische Gesundheit",
          role: "Ansprechperson",
          city: "Bonn",
          state: "Nordrhein-Westfalen",
          status: "active"
        }
      ];`
  });

  const mobileProject = testInfo.project.name.includes("mobile");
  const entrySelector = "#patient-organization-list .row";
  const organizationEntry = (label) => page.locator(entrySelector).filter({ hasText: label }).first();

  await expect(organizationEntry("Demo-Patientenvertretung Übergreifend")).toContainText("Übergreifende Patientenvertretung und Beratung");
  await expect(organizationEntry("Demo-Patientenverband Gastro")).toContainText("Gastroenterologie und Verdauung");
  await expect(organizationEntry("Demo-Patientenverband Psychische Gesundheit")).toContainText("Psychische Gesundheit und Neurodivergenz");

  await page.locator('#patient-mode-actions [data-patient-mode="people"]').click();
  const personSelector = mobileProject
    ? "#patient-people-list .mobile-contact-card"
    : "#patient-people-list .row";
  const personEntry = page.locator(personSelector).filter({ hasText: "Demo-Patientenkontakt 02" }).first();
  await expect(personEntry).toBeVisible();
  if (mobileProject) {
    await expect(personEntry).toContainText("Demo-Patientenverband Psychische Gesundheit");
  } else {
    await expect(personEntry).toContainText("Psychische Gesundheit und Neurodivergenz");
  }
});

test("Patienten: Kontakt und Organisation werden im Patientenbereich angelegt", async ({ page }) => {
  const importPayloads = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/stakeholder-import")) return;
    importPayloads.push(request.postDataJSON());
  });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#patients", {
    backendFixtureScript: `
      window.VERSORGUNGS_COMPASS_PATIENT_INDICATIONS = [
        {
          id: "patient-indication-neuro",
          name: "Neurologie und Neurodegeneration",
          description: "Für Erkrankungen von Gehirn, Rückenmark und Nerven.",
          sortOrder: 10
        },
        {
          id: "patient-indication-cross-cutting",
          name: "Übergreifende Patientenvertretung und Beratung",
          description: "Querschnitt für Patientenrechte und Beratung.",
          sortOrder: 20
        }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATIONS = [
        { id: "demo-patient-seed-neuro", name: "Demo-Patientenorganisation Neurologie Bestand", sector: "Neurologie und Neurodegeneration", organizationType: "Patientenorganisation", status: "active" },
        { id: "demo-patient-seed-cross", name: "Demo-Patientenorganisation Beratung Bestand", sector: "Übergreifende Patientenvertretung und Beratung", organizationType: "Patientenorganisation", status: "active" }
      ];
      window.VERSORGUNGS_COMPASS_PATIENT_PEOPLE = [];`
  });

  await expect(page.locator("#new-patient-organization-button")).toBeVisible();
  await page.locator("#new-patient-organization-button").click();
  await expect(page.locator("#organization-editor-drawer")).toHaveClass(/is-open/);
  await expect(page.locator("#organization-editor-title")).toHaveText("Patientenorganisation anlegen");
  await page.locator("#organization-field-name").fill("Demo-Patientenorganisation Neurologie Neu");
  await page.locator("#organization-field-sector").selectOption("Neurologie und Neurodegeneration");
  await page.locator("#organization-editor-next").click();
  await page.locator("#organization-field-postal-code").fill("10115");
  await page.locator("#organization-field-city").fill("Berlin");
  await page.locator("#organization-field-state").selectOption("Berlin");
  await page.locator("#organization-editor-save").click();

  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page.locator("#organization-profile-body")).toContainText("Demo-Patientenorganisation Neurologie Neu");
  await expect(page.locator("#organization-profile-body")).toContainText("Neurologie und Neurodegeneration");
  await page.locator("#organization-profile-body [data-organization-profile-back]").click();

  await page.locator('#patient-mode-actions [data-patient-mode="people"]').click();
  await expect(page.locator("#new-patient-contact-button")).toBeVisible();
  await page.locator("#new-patient-contact-button").click();
  await expect(page.locator("#editor-drawer")).toHaveClass(/is-open/);
  await expect(page.locator("#editor-title")).toHaveText("Patienten-Kontakt anlegen");
  await expect(page.locator('label[for="field-category"]')).toContainText("Indikation");
  await page.locator("#field-name").fill("Demo-Patientenkontakt Neurologie Neu");
  await page.locator("#field-organization").fill("Demo-Patientenorganisation Neurologie Neu");
  await page.locator("#field-category").selectOption("Neurologie und Neurodegeneration");
  await page.locator("#field-contact-role").fill("Vorstand");
  await page.locator("#editor-save").click();

  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page.locator("#person-profile-body")).toContainText("Demo-Patientenkontakt Neurologie Neu");
  await expect(page.locator("#person-profile-body")).toContainText("Demo-Patientenorganisation Neurologie Neu");
  const savedOrganizations = importPayloads.flatMap((payload) => payload.organizations || []);
  const savedPeople = importPayloads.flatMap((payload) => payload.people || []);
  expect(savedOrganizations.find((organization) => organization.name === "Demo-Patientenorganisation Neurologie Neu")).toMatchObject({
    stakeholderTypeId: "patient-associations",
    name: "Demo-Patientenorganisation Neurologie Neu",
    sector: "Neurologie und Neurodegeneration"
  });
  expect(savedPeople.find((person) => person.name === "Demo-Patientenkontakt Neurologie Neu")).toMatchObject({
    stakeholderTypeId: "patient-associations",
    name: "Demo-Patientenkontakt Neurologie Neu",
    organization: "Demo-Patientenorganisation Neurologie Neu"
  });
});

test("Expertenkreis: Kontakt und Organisation werden getrennt angelegt", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#experts", {
    backendFixtureScript: `window.VERSORGUNGS_COMPASS_CONTACTS = [];
    window.VERSORGUNGS_COMPASS_EXPERT_GROUPS = [
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
  await page.locator("#field-name").fill("Demo-Expertenkontakt Neu");
  await page.locator("#field-organization").fill("Demo-Interop-Allianz");
  await page.locator("#editor-save").click();

  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/expert\//);
  await expect(page.locator("#person-profile-body .detail-profile h3")).toContainText("Demo-Expertenkontakt Neu");
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
  await page.locator("#organization-field-name").fill("Demo-FHIR-Forum Neu");
  await page.locator("#organization-editor-save").click();

  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/expert\//);
  await expect(page.locator("#organization-profile-body .detail-profile h3")).toContainText("Demo-FHIR-Forum Neu");
  await expect(page.locator("#organization-profile-body .detail-tab").filter({ hasText: "Verbindungen" })).toBeVisible();
  await page.locator("#organization-profile-body [data-organization-profile-back]").click();
  await expect(page.locator('#expert-mode-actions [data-expert-mode="organizations"] .experts-mode-count')).toHaveText("2");

  await attachScreenshot(page, testInfo, "expertenkreis-anlage");
});

test("Dubletten: Admin-Ansichten bleiben im jeweiligen Tab", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html", {
    backendFixtureScript: `window.VERSORGUNGS_COMPASS_CONTACTS = [
      { id: "demo-contact-match-a", name: "Demo-Dublettenperson A", organizationId: "demo-org-match-a", organization: "Demo-Klinik A", sector: "Krankenhaus", category: "Krankenhaus", city: "Musterstadt", state: "Nord", status: "active" },
      { id: "demo-contact-match-b", name: "Demo-Dublettenperson B", organization: "Demo-Praxis B", sector: "Praxis", category: "Praxis", status: "active" }
    ];
    window.VERSORGUNGS_COMPASS_EXPERT_GROUPS = [
      { id: "expert-group-wissenschaft", name: "Wissenschaftliche Einrichtung und Patientenorganisation", sortOrder: 10 }
    ];
    window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS = [
      { id: "demo-expert-match-a", name: "Demo-Dublettenperson A", groupId: "expert-group-wissenschaft", group: "Wissenschaftliche Einrichtung und Patientenorganisation", category: "Wissenschaftliche Einrichtung und Patientenorganisation", organizationId: "demo-expert-org-match-a", organization: "Demo-Klinik A", status: "active" },
      { id: "demo-expert-match-b", name: "Demo-Dublettenperson B", groupId: "expert-group-wissenschaft", group: "Wissenschaftliche Einrichtung und Patientenorganisation", category: "Wissenschaftliche Einrichtung und Patientenorganisation", organizationId: "demo-expert-org-match-b", organization: "Demo-Praxis B", status: "active" }
    ];
    window.VERSORGUNGS_COMPASS_EXPERT_ORGANIZATIONS = [
      { id: "demo-expert-org-match-a", name: "Demo-Klinik A", groupId: "expert-group-wissenschaft", group: "Wissenschaftliche Einrichtung und Patientenorganisation", category: "Wissenschaftliche Einrichtung und Patientenorganisation", organizationType: "Demo-Klinik", status: "active" }
    ];`
  });

  await expandSidebarSectionIfNeeded(page, "care");
  await page.locator('[data-view-tab="contacts"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "contacts");
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

  await expandSidebarSectionIfNeeded(page, "care");
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
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts");

  const isMobile = testInfo.project.name.includes("mobile");
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 720 });
  const firstContact = page.locator("#contact-list .row, #contact-list .mobile-contact-card").first();
  await expect(firstContact).toBeVisible();
  await firstContact.click();

  if (isMobile) {
    await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  } else {
    await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-profile")).toBeVisible();
    await expect(page.locator("#detail-open-profile")).toBeVisible();
    await expect(page.locator("#detail-drawer .detail-tabs")).toBeVisible();
    const contactOwnerControl = page.locator("#detail-drawer .profile-owner-control");
    await expect(contactOwnerControl.locator(".profile-owner-control__badge")).toBeVisible();
    const tabMetrics = await page.locator("#detail-drawer .detail-tabs").evaluate((tabs) => ({
      clientWidth: tabs.clientWidth,
      scrollWidth: tabs.scrollWidth,
      labels: [...tabs.querySelectorAll(".detail-tab")].map((tab) => tab.dataset.detailTabLabel),
      roles: [...tabs.querySelectorAll(".detail-tab")].map((tab) => tab.getAttribute("role"))
    }));
    expect(tabMetrics.labels).toEqual(["Überblick", "Kontakt", "Themen", "Einwilligung", "Notizen", "Aktivitäten"]);
    expect(tabMetrics.roles).toEqual(["tab", "tab", "tab", "tab", "tab", "tab"]);
    expect(tabMetrics.scrollWidth).toBeLessThanOrEqual(tabMetrics.clientWidth + 1);
    const overviewTab = page.locator('#detail-drawer [data-detail-tab="overview"]');
    await overviewTab.focus();
    await page.keyboard.press("End");
    await expect(page.locator('#detail-drawer [data-detail-tab="activity"]')).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(page.locator('#detail-drawer [data-detail-tab="overview"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#detail-drawer #detail-overview")).toHaveAttribute("role", "tabpanel");
    await expect(page.locator("#detail-drawer .detail-more")).not.toHaveAttribute("open", "");
    await expect(page.locator("#detail-drawer .detail-more .detail-mini-map")).toBeHidden();
    await page.locator("#detail-drawer .detail-more > summary").click();
    await expect(page.locator("#detail-drawer .detail-more .detail-mini-map")).toBeVisible();
    await expect(page.locator("#detail-drawer [data-hospitation-profile-section]")).toContainText("Nicht geplant");
    await expect(page.locator("#detail-drawer [data-hospitation-profile-history]")).toContainText("Noch keine bisherigen Hospitationen");
    await expect(page.locator("#detail-drawer [data-hospitation-profile-action='request']")).toHaveText("Hospitation planen");
    await expect(page.locator("#detail-drawer [data-hospitation-profile-action='booking']")).toHaveCount(0);
    await expect(page.locator("#detail-drawer .hospitation-profile-summary__item")).toHaveCount(0);
    await expect(page.locator("#detail-drawer [data-hospitation-profile-section]")).not.toContainText("Dokumentation");
    await expect(page.locator("#detail-drawer [data-hospitation-profile-section]")).not.toContainText("Follow-ups");
    await expect(page.locator("#detail-drawer [data-hospitation-profile-action='list']")).toHaveText("Alle Hospitationen anzeigen");
    await expect(page.locator("#detail-drawer #detail-edit")).toHaveCount(0);
    await expect(page.locator("#detail-drawer .detail-section-edit[data-detail-edit-section='overview']")).toHaveText("Stammdaten bearbeiten");
    await expect(contactOwnerControl.getByRole("button", { name: "Owner bearbeiten" })).toBeVisible();
    await expect(contactOwnerControl.locator("[data-detail-owner-picker]")).toBeHidden();
    await contactOwnerControl.getByRole("button", { name: "Owner bearbeiten" }).click();
    await expect(contactOwnerControl.locator("[data-detail-owner-picker]")).toBeVisible();
    const contactOwnerSearch = contactOwnerControl.getByRole("searchbox", { name: "Owner suchen" });
    await expect(contactOwnerSearch).toBeFocused();
    await contactOwnerSearch.fill("nicht vorhanden");
    await expect(contactOwnerControl.locator("[data-owner-search-empty]")).toBeVisible();
    await contactOwnerSearch.fill("");
    const contactOwnerPickerInputs = contactOwnerControl.locator('[data-detail-owner-picker] input[type="checkbox"]');
    const contactOwnerPickerCount = await contactOwnerPickerInputs.count();
    const initialOwnerSelection = await contactOwnerPickerInputs.evaluateAll((inputs) => inputs.map((input) => input.checked));
    if (contactOwnerPickerCount) {
      await contactOwnerPickerInputs.first().setChecked(!initialOwnerSelection[0]);
      await expect(contactOwnerControl.locator("[data-owner-picker-status]")).toHaveText("Ungespeicherte Auswahl");
      await contactOwnerControl.getByRole("button", { name: "Abbrechen" }).click();
      await expect(contactOwnerControl.locator("[data-detail-owner-picker]")).toBeHidden();
      await contactOwnerControl.getByRole("button", { name: "Owner bearbeiten" }).click();
      await expect(contactOwnerControl.locator('[data-detail-owner-picker] input[type="checkbox"]').first()).toBeChecked({ checked: initialOwnerSelection[0] });
    }
    for (let index = 0; index < Math.min(3, contactOwnerPickerCount); index += 1) {
      const input = contactOwnerControl.locator('[data-detail-owner-picker] input[type="checkbox"]').nth(index);
      if (!(await input.isChecked())) await input.setChecked(true);
      await expect(contactOwnerControl.locator('[data-detail-owner-picker] input[type="checkbox"]').nth(index)).toBeChecked();
    }
    await contactOwnerControl.getByRole("button", { name: "Speichern" }).click();
    await expect(contactOwnerControl.locator("[data-detail-owner-picker]")).toBeHidden();
    if (contactOwnerPickerCount > 1) {
      await expect(contactOwnerControl.locator(".profile-owner-control__badge .owner-badge")).toHaveCount(2);
      const ownerLabels = await contactOwnerControl.locator(".profile-owner-control__badge .owner-badge__label").allTextContents();
      expect(ownerLabels.every((label) => label.trim().length > 0)).toBe(true);
    }
    if (contactOwnerPickerCount > 2) {
      await expect(contactOwnerControl.locator(".profile-owner-control__badge .owner-badge-more")).toHaveText("+1");
    }
    await expect(page.locator("#detail-drawer .detail-overflow-actions")).toBeVisible();
    await expect(page.locator("#detail-drawer #detail-delete")).toBeHidden();
    const drawerMetrics = await page.locator("#detail-drawer").evaluate((drawer) => {
      const panel = drawer.querySelector(".detail-panel");
      const drawerRect = drawer.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const initialPanelScroll = panel.scrollTop;
      panel.scrollTop = panel.scrollHeight;
      const scrolledPanel = panel.scrollTop;
      return {
        bodyOverflow: document.body.style.overflow,
        canScrollPanel: panel.scrollHeight > panel.clientHeight,
        drawerBottom: drawerRect.bottom,
        drawerTop: drawerRect.top,
        panelBottom: panelRect.bottom,
        panelTop: panelRect.top,
        scrolledPanel,
        initialPanelScroll,
        viewportHeight: window.innerHeight,
        windowScrollY: window.scrollY
      };
    });
    expect(drawerMetrics.drawerTop).toBeLessThanOrEqual(1);
    expect(drawerMetrics.panelTop).toBeLessThanOrEqual(1);
    expect(drawerMetrics.drawerBottom).toBeGreaterThanOrEqual(drawerMetrics.viewportHeight - 1);
    expect(drawerMetrics.panelBottom).toBeGreaterThanOrEqual(drawerMetrics.viewportHeight - 1);
    expect(drawerMetrics.bodyOverflow).toBe("hidden");
    expect(drawerMetrics.canScrollPanel).toBe(true);
    expect(drawerMetrics.scrolledPanel).toBeGreaterThan(drawerMetrics.initialPanelScroll);
    expect(drawerMetrics.windowScrollY).toBe(0);
    await page.locator("#detail-drawer .detail-panel").evaluate((panel) => { panel.scrollTop = 0; });
    await page.locator("#detail-open-profile").click();
  }

  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/contact\//);
  await expect(page.locator("#person-profile-body .detail-profile")).toBeVisible();
  await expect(page.locator("#person-profile-body .detail-tabs")).toBeVisible();
  await expect(page.locator("#person-profile-body [data-person-profile-back]")).toBeVisible();
  await expect(page.locator("#person-profile-body #detail-contactways")).toBeHidden();
  await expect(page.locator("#person-profile-body .profile-owner-control__badge").first()).toBeVisible();
  if (isMobile) {
    const mobileOwnerControl = page.locator("#person-profile-body .profile-owner-control");
    await mobileOwnerControl.getByRole("button", { name: "Owner bearbeiten" }).click();
    await expect(mobileOwnerControl.getByRole("searchbox", { name: "Owner suchen" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(mobileOwnerControl.locator("[data-detail-owner-picker]")).toBeHidden();
    await expect(mobileOwnerControl.getByRole("button", { name: "Owner bearbeiten" })).toBeFocused();
  }
  await page.locator('#person-profile-body [data-detail-tab="activity"]').click();
  const profileActivity = page.locator("#person-profile-body #history-timeline .history-item").first();
  await expect(profileActivity).toBeVisible();
  await expect(profileActivity).toHaveAttribute("data-activity-event-key", "contact.created");
  await expect(profileActivity).toHaveAttribute("data-activity-category", "master_data");
  await expect(profileActivity).toHaveAttribute("data-activity-origin", "legacy");

  await attachScreenshot(page, testInfo, "kontaktprofil");
});

test("Kontaktprofil: naechste Hospitation zeigt Datum und Owner kompakt", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-Kontaktprofil pruefen");
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts");
  await page.setViewportSize({ width: 1440, height: 760 });

  const firstContact = page.locator("#contact-list .row").first();
  await expect(firstContact).toBeVisible();
  await firstContact.click();
  const section = page.locator("#detail-drawer [data-hospitation-profile-section]");
  await expect(section).toContainText("Nicht geplant");
  await section.locator("[data-hospitation-profile-action='request']").click();

  const editor = page.locator("#hospitation-editor-drawer");
  await expect(editor).toHaveAttribute("data-hospitation-editor-mode", "request");
  await editor.locator("#hospitation-editor-next").click();
  await editor.locator("#hospitation-start").fill("2099-08-15T10:30");
  await editor.locator("#hospitation-editor-save").click();
  await expect(editor).not.toHaveClass(/is-open/);
  await page.locator("#detail-drawer #detail-close").click();
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await firstContact.click();
  await expect(page.locator("#detail-drawer")).toHaveClass(/is-open/);

  await expect(section.locator(".hospitation-profile-next")).toHaveClass(/hospitation-profile-next--planned/);
  await expect(section.locator(".hospitation-profile-next__copy")).toContainText("Geplant");
  await expect(section.locator(".hospitation-profile-next__date")).toHaveText("15.08.2099");
  await expect(section.locator(".hospitation-profile-next__date")).not.toContainText(":");
  await expect(section.locator(".hospitation-profile-next__owner .owner-avatar-stack__item")).toHaveCount(1);
  await expect(section.locator("[data-hospitation-profile-action='open']")).toHaveText("Hospitation öffnen");
  await expect(section.locator("[data-hospitation-profile-action='booking']")).toHaveCount(0);
  await expect(section).not.toContainText("Dokumentation");
  await expect(section).not.toContainText("Follow-ups");

  await attachScreenshot(page, testInfo, "kontaktprofil-naechste-hospitation");
});

test("Kontaktprofil: bisherige Hospitationen sind statuskorrekt, sortiert und mobil kompakt", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "admin",
    backendFixtureScript: hospitationProfileBackendFixtureScript()
  });

  await page.locator('#contact-list [data-id="hospitation-profile-contact"]').click();
  const isMobile = testInfo.project.name.includes("mobile");
  const root = page.locator(isMobile ? "#person-profile-body" : "#detail-drawer");
  const section = root.locator("[data-hospitation-profile-section]");
  const history = section.locator("[data-hospitation-profile-history]");

  await expect(section.locator(".hospitation-profile-next__date")).toHaveText("15.08.2099");
  await expect(history).toContainText("Bisherige Hospitationen");
  await expect(history).toContainText("Neueste zuerst");
  const primaryHistory = history.locator("[data-hospitation-profile-history-list]").first().locator(":scope > [data-hospitation-profile-history-id]");
  await expect(primaryHistory).toHaveCount(3);
  await expect(primaryHistory.locator(".hospitation-profile-history__date")).toHaveText([
    "20.06.2026",
    "12.05.2026",
    "08.04.2026"
  ]);
  await expect(primaryHistory.locator(".hospitation-status-badge")).toHaveText([
    "Dokumentiert",
    "Durchgeführt",
    "Archiviert"
  ]);
  await expect(primaryHistory.first()).toContainText("Praxis Verlauf");
  await expect(primaryHistory.first()).toContainText("Owner: History Admin");
  await expect(primaryHistory.first()).toContainText("Dokumentation: Dokumentiert");
  await expect(history.locator('[data-hospitation-profile-history-id="history-cancelled"]')).toHaveCount(0);
  await expect(history.locator('[data-hospitation-profile-history-id="history-past-scheduled"]')).toHaveCount(0);
  await expect(history.locator('[data-hospitation-profile-history-id="history-future-documented"]')).toHaveCount(0);
  await expect(history.locator('[data-hospitation-profile-history-id="history-archived"]')).toHaveAttribute("data-hospitation-profile-phase", "archived");
  const more = history.locator(".hospitation-profile-history__more");
  await expect(more.locator("summary")).toHaveText("Alle 4 bisherigen anzeigen");
  await expect(more.locator('[data-hospitation-profile-history-id="history-older-documented"]')).toBeHidden();
  await more.locator("summary").click();
  await expect(more.locator('[data-hospitation-profile-history-id="history-older-documented"]')).toBeVisible();

  await expectNoHorizontalOverflow(page, isMobile ? "#person-profile-body" : "#detail-drawer");
  await attachScreenshot(page, testInfo, "kontaktprofil-bisherige-hospitationen", { fullPage: false });
});

test("Kontaktprofil: Hospitations-Ladefehler ist kein Leerzustand", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Fehlerzustand einmal im Desktop-Drawer prüfen");
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    dataServiceScript: failingHospitationDataServiceScript()
  });

  await page.locator('#contact-list [data-id="contact-anna"]').click();
  const history = page.locator("#detail-drawer [data-hospitation-profile-history]");
  await expect(history.getByRole("alert")).toContainText("Hospitationen konnten nicht geladen werden");
  await expect(history.getByRole("alert")).toContainText("Hospitationsdienst ist nicht erreichbar");
  await expect(history.getByRole("button", { name: "Erneut laden" })).toBeVisible();
  await expect(history).not.toContainText("Noch keine bisherigen Hospitationen");
});

test("Kontaktprofil: Hospitation und Dokumentation öffnen direkt; Gesamtliste übernimmt Kontaktfilter", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Direktaktionen einmal im Desktop-Drawer prüfen");
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "admin",
    backendFixtureScript: hospitationProfileBackendFixtureScript()
  });

  await page.locator('#contact-list [data-id="hospitation-profile-contact"]').click();
  const root = page.locator("#detail-drawer");
  const documented = root.locator('[data-hospitation-profile-history-id="history-documented"]');
  await expect(root).toHaveClass(/is-open/);
  await expect(documented).toBeVisible();
  await documented.getByRole("button", { name: "Hospitation öffnen" }).click();
  const editor = page.locator("#hospitation-editor-drawer");
  await expect(editor).toHaveClass(/is-open/);
  await expect(editor).toHaveAttribute("data-hospitation-editor-mode", "documentation");
  await expect(editor.locator('[data-hospitation-editor-panel="overview"]')).toBeVisible();
  await editor.locator("#hospitation-editor-close").click();
  await expect(editor).toHaveAttribute("aria-hidden", "true");

  await documented.getByRole("button", { name: "Dokumentation" }).click();
  await expect(editor).toHaveClass(/is-open/);
  await expect(editor.locator('[data-hospitation-editor-panel="hospitation"]')).toBeVisible();
  await editor.locator("#hospitation-editor-close").click();
  await expect(editor).toHaveAttribute("aria-hidden", "true");

  await root.locator('[data-hospitation-profile-action="list"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "hospitations");
  const contextFilter = page.locator("#hospitation-list [data-hospitation-context-filter]");
  await expect(page.locator("#hospitation-list")).toBeVisible();
  await expect(contextFilter).toBeVisible();
  await expect(contextFilter).toContainText("Gefiltert nach Kontakt: Anna Verlauf");
  await expect(page.locator("#hospitation-list")).toContainText("Anna Verlauf");
  await expect(page.locator("#hospitation-list")).not.toContainText("Berta Andere");

  await contextFilter.getByRole("button", { name: "Filter aufheben" }).click();
  await expect(page.locator("#hospitation-list [data-hospitation-context-filter]")).toHaveCount(0);
  await expect(page.locator("#hospitation-list")).toContainText("Berta Andere");
});

test("Kontaktprofil: direkter Deeplink rendert Profilseite", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#person/contact/demo-contact-01");

  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/contact\/demo-contact-01$/);
  await expect(page.locator("#person-profile-body .detail-profile h3")).toBeVisible();
  await expect(page.locator("#person-profile-body #detail-overview")).toBeVisible();
  await expect(page.locator(".app-shell[data-active-view='personProfile'] .workspace-header")).toBeHidden();
  await expect(page.locator("#search")).toBeHidden();
});

test("Kontaktprofil: bereichsbezogene Bearbeitung bleibt eindeutig", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });

  const isMobile = testInfo.project.name.includes("mobile");
  await page.locator("#contact-list .row, #contact-list .mobile-contact-card").first().click();
  const root = page.locator(isMobile ? "#person-profile-body" : "#detail-drawer");

  await root.getByRole("button", { name: "Stammdaten bearbeiten" }).click();
  await expect(root.locator('.detail-profile-copy [data-detail-field="name"]')).toBeVisible();
  await expect(root.getByRole("button", { name: "Änderungen speichern" })).toBeVisible();
  await expect(root.locator('[data-detail-tab="contact"]')).toBeDisabled();
  await root.getByRole("button", { name: "Abbrechen" }).click();

  await root.locator('[data-detail-tab="contact"]').click();
  await root.getByRole("button", { name: "Kontaktwege bearbeiten" }).click();
  await expect(root.locator('#detail-contactways [data-detail-field="email"]')).toBeVisible();
  await expect(root.locator('.detail-profile-copy [data-detail-field="name"]')).toHaveCount(0);
  await expect(root.locator('[data-detail-tab="overview"]')).toBeDisabled();
});

test("Kontaktprofil: Hospitationsverlinkung führt in die Terminübersicht", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts");

  const isMobile = testInfo.project.name.includes("mobile");
  await page.locator("#contact-list .row, #contact-list .mobile-contact-card").first().click();
  const root = page.locator(isMobile ? "#person-profile-body" : "#detail-drawer");
  await root.locator('[data-hospitation-profile-action="list"]').click();

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "hospitations");
  await expect(page.locator("#view-hospitations")).toBeVisible();
  await expect(page).toHaveURL(/#hospitations/);
});

test("Kontaktprofil: #Mitmachen-Einwilligung ist inline und per Tastatur dokumentierbar", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "admin",
    backendFixtureScript: consentBackendFixtureScript()
  });

  const isMobile = testInfo.project.name.includes("mobile");
  await page.locator('#contact-list [data-id="consent-not-requested"]').click();
  const root = page.locator(isMobile ? "#person-profile-body" : "#detail-drawer");
  await expect(root.locator('[data-detail-tab="consent"]')).toHaveText("Einwilligung");
  await root.locator('[data-detail-tab="consent"]').click();
  await expect(root.locator("#detail-consent")).toBeVisible();
  await expect(root.locator(".consent-status-pill")).toHaveText("Noch nicht angefragt");
  await expect(root.locator("#detail-consent")).toContainText("Vor allgemeinen #Mitmachen-Einladungen ist eine ausdrückliche Bestätigung erforderlich");
  await expect(root.locator("#detail-consent .detail-line__label")).toHaveText([
    "Status",
    "Zweck",
    "Wirksamkeitszeitpunkt",
    "Quelle",
    "Textversion",
    "Erfasst von",
    "Nachweisvermerk",
    "Geltungsbereich",
    "Hinweis"
  ]);
  await expect(root.locator("#mitmachen-consent-form")).toHaveCount(0);
  await expect(root.locator(".consent-inline-editor")).toHaveCount(5);
  await expect(root.locator(".consent-inline-editor:visible")).toHaveCount(0);
  await attachScreenshot(page, testInfo, "kontaktprofil-einwilligung-zeilen", { fullPage: false });

  const statusEditButton = root.locator('[data-edit-consent-field="status"]');
  await expect(statusEditButton).toHaveAccessibleName("Status bearbeiten");
  await statusEditButton.click();
  const statusForm = root.locator("#mitmachen-consent-editor-status");
  await expect(statusEditButton).toHaveAttribute("aria-expanded", "true");
  await expect(statusForm).toBeVisible();
  await expect(statusForm.locator('select[name="status"]')).toBeFocused();
  await expect(root.locator(".consent-inline-editor:visible")).toHaveCount(1);

  const textVersionEditButton = root.locator('[data-edit-consent-field="textVersion"]');
  await expect(textVersionEditButton).toHaveAccessibleName("Textversion bearbeiten");
  await textVersionEditButton.click();
  const textVersionForm = root.locator("#mitmachen-consent-editor-textVersion");
  await expect(statusForm).toBeHidden();
  await expect(textVersionForm).toBeVisible();
  await expect(root.locator(".consent-inline-editor:visible")).toHaveCount(1);
  await expect(textVersionForm.locator('input[name="textVersion"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(textVersionForm).toBeHidden();
  await expect(textVersionEditButton).toBeFocused();

  await statusEditButton.click();
  await statusForm.locator('select[name="status"]').selectOption("granted");
  await statusForm.locator('select[name="source"]').selectOption("manual_transfer");
  await expect(statusForm.locator('input[name="effectiveAt"]')).not.toHaveValue("");
  const note = statusForm.locator('textarea[name="note"]');
  await expect(note).toBeVisible();
  await note.press("Control+Enter");
  await expect(statusForm).toBeVisible();
  await expect(statusForm.locator("[data-consent-status]")).toContainText("Nachweisvermerk erforderlich");
  await expect(note).toBeFocused();

  await note.fill("Am 16.07.2026 aus dem freigegebenen Altbestand nachvollziehbar übernommen.");
  await note.press("Control+Enter");
  await expect(root.locator(".consent-status-pill")).toHaveText("Erteilt");
  await expect(root.locator('[data-consent-row="source"] [data-consent-display]')).toContainText("Manuelle Übernahme");
  await expect(root.locator('[data-consent-row="note"] [data-consent-display]')).toContainText("freigegebenen Altbestand");

  await root.locator('[data-detail-tab="activity"]').click();
  const grantedActivity = root.locator('#history-timeline .history-item[data-activity-event-key="contact.consent.granted"]').first();
  await expect(grantedActivity).toBeVisible();
  await expect(grantedActivity).toHaveAttribute("data-activity-category", "consent");
  await expect(grantedActivity.locator(".activity-title")).toContainText("Einwilligung erteilt");
  await grantedActivity.locator(".activity-details-toggle").click();
  await expect(grantedActivity.locator(".activity-detail-panel")).toBeVisible();
  await expect(grantedActivity.locator(".history-field")).toContainText("#Mitmachen-Einwilligungsstatus");
  await expect(grantedActivity.locator(".history-value--new")).toContainText("Erteilt");

  await root.locator('[data-detail-tab="consent"]').click();
  await root.getByRole("button", { name: "Status bearbeiten" }).click();
  const withdrawalForm = root.locator("#mitmachen-consent-editor-status");
  await withdrawalForm.locator('select[name="status"]').selectOption("withdrawn");
  let withdrawalDialog = "";
  page.once("dialog", async (dialog) => {
    withdrawalDialog = dialog.message();
    await dialog.accept();
  });
  await withdrawalForm.locator('button[type="submit"]').click();
  await expect(root.locator(".consent-status-pill")).toHaveText("Widerrufen");
  expect(withdrawalDialog).toContain("nicht für allgemeine #Mitmachen-Einladungen");
  await expect(root.locator("#detail-consent")).toContainText("darf nicht für allgemeine #Mitmachen-Einladungen genutzt werden");

  await root.locator('[data-detail-tab="activity"]').click();
  await expect(root.locator('#history-timeline .history-item[data-activity-event-key="contact.consent.withdrawn"]').first()).toBeVisible();
});

test("Kontaktprofil: Editor kann Einwilligungszeilen bearbeiten und abbrechen", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "editor",
    backendFixtureScript: consentBackendFixtureScript()
  });

  const isMobile = testInfo.project.name.includes("mobile");
  await page.locator('#contact-list [data-id="consent-not-requested"]').click();
  const root = page.locator(isMobile ? "#person-profile-body" : "#detail-drawer");
  await root.locator('[data-detail-tab="consent"]').click();

  const sourceEditButton = root.locator('[data-edit-consent-field="source"]');
  await expect(sourceEditButton).toHaveAccessibleName("Quelle bearbeiten");
  await sourceEditButton.click();
  const sourceForm = root.locator("#mitmachen-consent-editor-source");
  await expect(sourceForm).toBeVisible();
  await expect(sourceForm.locator('select[name="source"]')).toBeFocused();
  await sourceForm.getByRole("button", { name: "Abbrechen" }).click();
  await expect(sourceForm).toBeHidden();
  await expect(sourceEditButton).toBeFocused();
});

test("Kontaktprofil-Drawer: Notizen erscheinen als Chat", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Mobile oeffnet Kontaktprofile direkt als Profilseite.");

  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts");

  await page.locator("#contact-list .row").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await page.locator('#detail-drawer [data-detail-tab="notes"]').click();

  const notesPanel = page.locator("#detail-drawer #detail-notes");
  await expect(notesPanel.locator(".contact-notes-thread")).toBeVisible();
  await expect(notesPanel.locator(".format-chat-list")).toBeVisible();
  await expect(notesPanel.locator("#contact-notes-composer")).toBeVisible();
  await expect(notesPanel.locator("#contact-notes-message")).toBeVisible();
  await expect(notesPanel.locator(".detail-note-block")).toHaveCount(0);
  await expect(notesPanel.locator("#detail-note-input")).toHaveCount(0);
});

test("Detaildrawer schliesst beim Wechsel zwischen Hauptbereichen", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts");

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
  await openMobileSidebarIfNeeded(page);
  await page.locator('[data-view-tab="organizations"]').click();
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
    await page.locator('[data-view-tab="contacts"]').click();
  }
  await expect(page.locator("#detail-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await expect(page.locator("#organization-profile-page")).toHaveAttribute("aria-hidden", "true");
  if (isMobile) {
    await openMobileSidebarIfNeeded(page);
    await page.locator('[data-view-tab="contacts"]').click();
  }

  await attachScreenshot(page, testInfo, "drawer-wechsel-kontakte", { fullPage: false });
});

test("Kontaktprofil: Notizen als Chat pflegen", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts");

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
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "viewer" });

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
  await profile.locator('[data-detail-tab="consent"]').click();
  await expect(profile.locator("#detail-consent")).toBeVisible();
  await expect(profile.locator("#mitmachen-consent-form")).toHaveCount(0);
  await expect(profile.locator(".consent-inline-editor")).toHaveCount(0);
  await expect(profile.locator("[data-edit-consent-field]")).toHaveCount(0);
  await expect(profile.locator("#detail-consent .consent-detail-list")).toBeVisible();
  await expect(profile.locator(".profile-owner-control__badge")).toBeVisible();
  await expect(profile.getByRole("button", { name: "Owner bearbeiten" })).toHaveCount(0);
});

test("Hospitationen: Dokumentationsdrawer mit Reitern", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#hospitations");

  await expect(page.locator("#new-hospitation-request-button")).toContainText("Neuer Termin");
  await expect(page.locator("#new-hospitation-booking-button")).toHaveCount(0);
  await expect(page.locator("#new-hospitation-slot-button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Termin direkt buchen|^Buchen$/ })).toHaveCount(0);
  await page.locator("#new-hospitation-request-button").click();
  const bookingDrawer = page.locator("#hospitation-editor-drawer");
  await expect(bookingDrawer).toHaveClass(/is-open/);
  await expect(bookingDrawer.locator("#hospitation-editor-title")).toHaveText("Neuen Termin anlegen");
  await expect(bookingDrawer.locator("#hospitation-editor-subtitle")).toContainText("Nur Kontakt, Organisation oder Freitext ist Pflicht");
  await expect(bookingDrawer.locator("#hospitation-editor-steps .import-step")).toHaveCount(5);
  await expect(bookingDrawer.locator("#hospitation-editor-steps .import-step").nth(0)).toContainText("Schnellerfassung");
  await expect(bookingDrawer.locator("#hospitation-editor-back")).toBeHidden();
  await expect(bookingDrawer.locator("#hospitation-editor-save")).toBeVisible();
  await expect(bookingDrawer.locator("#hospitation-contact-name")).toBeVisible();
  await bookingDrawer.locator("#hospitation-contact-name").fill("Freitext Kontakt Visualtest");
  await bookingDrawer.locator("#hospitation-editor-next").click();
  await expect(bookingDrawer.locator('[data-hospitation-editor-step="appointment"]')).toBeVisible();
  await expect(bookingDrawer.locator("#hospitation-editor-back")).toBeVisible();
  await bookingDrawer.locator("#hospitation-start").fill("2026-07-03T10:00");
  await bookingDrawer.locator("#hospitation-editor-next").click();
  await expect(bookingDrawer.locator('[data-hospitation-editor-step="contact"]')).toBeVisible();
  await bookingDrawer.locator("#hospitation-editor-next").click();
  await expect(bookingDrawer.locator('[data-hospitation-editor-step="topics"]')).toBeVisible();
  await bookingDrawer.locator("#hospitation-goal").fill("Freitext-Kontakt Ziel aus dem Visualtest");
  await bookingDrawer.getByRole("button", { name: "Termin speichern" }).click();
  await expect(bookingDrawer).not.toHaveClass(/is-open/);
  const freetextContactRow = page.locator(".hospitation-row", { hasText: "Freitext Kontakt Visualtest" }).first();
  await expect(freetextContactRow).toBeVisible();
  await expect(freetextContactRow.locator(".hospitation-contact-match-indicator")).toHaveText("!");
  await expect(freetextContactRow.locator(".hospitation-row__cell").nth(0)).toContainText("03.07.26");
  await expect(freetextContactRow.locator(".hospitation-row__cell").nth(0)).not.toContainText("2026");
  const scheduleTable = page.locator("#hospitation-list .hospitation-table").first();
  const scheduleHeaderCells = scheduleTable.locator(".hospitation-table-head > *");
  await expect(scheduleHeaderCells).toHaveCount(9);
  await expect(scheduleHeaderCells.nth(0).locator("[data-hospitation-select-all]")).toHaveCount(1);
  await expect(scheduleHeaderCells.nth(1)).toContainText("Termin");
  await expect(scheduleHeaderCells.nth(1).locator("[data-hospitation-date-sort]")).toHaveCount(1);
  await expect(scheduleHeaderCells.nth(1).locator("[data-hospitation-header-filter-button]")).toHaveCount(1);
  await expect(scheduleHeaderCells.nth(2)).toContainText("Status");
  await expect(scheduleHeaderCells.nth(3)).toContainText("Kontakt");
  await expect(scheduleHeaderCells.nth(4)).toContainText("Organisation");
  await expect(scheduleHeaderCells.nth(5)).toContainText("Beobachtungen");
  await expect(scheduleHeaderCells.nth(6)).toContainText("Sektor");
  await expect(scheduleHeaderCells.nth(7)).toContainText("Owner");
  await expect(scheduleHeaderCells.nth(8)).toContainText("Dokumentation");
  await expect(scheduleTable.locator(".hospitation-row__toggle")).toHaveCount(0);
  await expect(page.locator(".hospitation-schedule-toolbar")).toHaveCount(0);
  if (!testInfo.project.name.includes("mobile")) {
    await scheduleHeaderCells.nth(1).locator("[data-hospitation-header-filter-button]").click();
    const appointmentDateFilter = page.locator("#hospitation-header-filter-appointments-date");
    await expect(appointmentDateFilter).toBeVisible();
    const dateFilterBox = await appointmentDateFilter.evaluate((menu) => {
      const rect = menu.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewportWidth: window.innerWidth };
    });
    expect(dateFilterBox.left).toBeGreaterThanOrEqual(0);
    expect(dateFilterBox.right).toBeLessThanOrEqual(dateFilterBox.viewportWidth);
    await appointmentDateFilter.getByRole("button", { name: /03\.07\.2026/ }).click();
    await expect(freetextContactRow).toBeVisible();
    await scheduleHeaderCells.nth(1).locator("[data-hospitation-header-filter-button]").click();
    await page.locator("#hospitation-header-filter-appointments-date").getByRole("button", { name: "Alle" }).click();
  }
  if (testInfo.project.name.includes("mobile")) {
    await expect(freetextContactRow.locator("[data-hospitation-row-select]")).toBeHidden();
    await expect(page.locator("#hospitation-bulk-toolbar")).toBeHidden();
  } else {
    await freetextContactRow.locator("[data-hospitation-row-select]").check();
    await expect(page.locator("#hospitation-bulk-toolbar")).toBeVisible();
    await expect(page.locator("#hospitation-bulk-selection-count")).toHaveText("1 Termin ausgewählt");
    await page.locator("#hospitation-bulk-clear-selection").click();
    await expect(page.locator("#hospitation-bulk-toolbar")).toBeHidden();
  }
  await page.locator('[data-hospitation-schedule-view="calendar"]').click();
  if (testInfo.project.name.includes("mobile")) {
    const agenda = page.locator("#hospitation-list .hospitation-mobile-agenda");
    await expect(agenda).toBeVisible();
    await expect(agenda).toContainText("Terminübersicht");
    await expect(agenda.locator(".hospitation-calendar-event").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  } else {
    const calendar = page.locator("#hospitation-list .hospitation-calendar");
    await expect(calendar).toBeVisible();
  await expect(calendar).toHaveClass(/hospitation-calendar--month/);
  await expect(calendar.locator("[data-hospitation-calendar-mode]")).toHaveCount(3);
  await expect(calendar.locator('[data-hospitation-calendar-mode="month"]')).toHaveAttribute("aria-pressed", "true");
  await expect(calendar.locator(".hospitation-calendar-weekday")).toHaveText(["Mo", "Di", "Mi", "Do", "Fr"]);
  await expect(calendar.locator(".hospitation-calendar-summary__item")).toHaveCount(0);
  await expect(calendar.locator(".hospitation-calendar-legend__item")).toHaveCount(6);
  await expect(calendar.locator(".hospitation-calendar-grid + .hospitation-calendar-legend")).toHaveCount(1);
  await expect(calendar.locator(".hospitation-calendar-legend")).toContainText("Terminiert");
  await expect(calendar.locator(".hospitation-calendar-legend")).toContainText("Durchgeführt");
  await expect(calendar.locator(".hospitation-calendar-legend")).toContainText("Dokumentiert");
  await expect(calendar.locator(".hospitation-calendar-legend")).toContainText("Belegt");
  await expect(calendar.locator(".hospitation-calendar-legend")).not.toContainText("Gebucht");
  await calendar.locator('[data-hospitation-calendar-mode="week"]').click();
  await expect(calendar).toHaveClass(/hospitation-calendar--week/);
  await expect(calendar.locator(".hospitation-calendar-weekday")).toHaveText(["Mo", "Di", "Mi", "Do", "Fr"]);
  await calendar.locator('[data-hospitation-calendar-mode="year"]').click();
  await expect(calendar).toHaveClass(/hospitation-calendar--year/);
  await expect(calendar.locator(".hospitation-calendar-year-month")).toHaveCount(12);
  await expect(calendar.locator(".hospitation-calendar-weekday")).toHaveCount(0);
  await calendar.locator('[data-hospitation-calendar-mode="month"]').click();
  await expect(calendar).toHaveClass(/hospitation-calendar--month/);
  await expect(calendar.locator(".hospitation-calendar-weekday")).toHaveText(["Mo", "Di", "Mi", "Do", "Fr"]);
  await expect(calendar.locator(".hospitation-calendar-day.has-events").first()).toBeVisible();
  await expect(calendar.locator(".hospitation-calendar-day__count")).toHaveCount(0);
  const calendarEvent = calendar.locator(".hospitation-calendar-event").first();
  await expect(calendarEvent).toBeVisible();
  await expect(calendarEvent).toHaveClass(/hospitation-calendar-event--/);
  await expect(calendarEvent.locator(".hospitation-calendar-event__time")).toBeVisible();
  await expect(calendarEvent.locator(".hospitation-calendar-event__status")).toBeHidden();
  const calendarEventMetrics = await calendarEvent.evaluate((event) => {
    const style = window.getComputedStyle(event);
    const gridColumns = style.gridTemplateColumns;
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderLeftWidth: Number.parseFloat(style.borderLeftWidth),
      boxShadow: style.boxShadow,
      gridColumns
    };
  });
  expect(`${calendarEventMetrics.backgroundColor} ${calendarEventMetrics.backgroundImage}`).not.toBe("rgba(0, 0, 0, 0) none");
  expect(calendarEventMetrics.borderLeftWidth).toBeGreaterThanOrEqual(3);
  expect(calendarEventMetrics.boxShadow).toBe("none");
  expect(calendarEventMetrics.gridColumns).not.toBe("none");
  }
  await page.locator('[data-hospitation-schedule-view="list"]').click();
  await expect(page.locator("#hospitation-list .hospitation-table").first()).toBeVisible();
  const freetextContactRowAfterCalendar = page.locator(".hospitation-row", { hasText: "Freitext Kontakt Visualtest" }).first();
  await expect(freetextContactRowAfterCalendar).toBeVisible();
  await freetextContactRowAfterCalendar.locator("[data-open-hospitation-entry]").click();
  await expect(bookingDrawer).toHaveClass(/is-open/);
  await expect(bookingDrawer.getByRole("tab", { name: "Kontext" })).toHaveAttribute("aria-selected", "true");
  await expect(bookingDrawer.getByRole("button", { name: /archivieren/i })).toBeVisible();
  await expect(bookingDrawer.getByRole("button", { name: "Löschen" })).toHaveCount(0);
  await bookingDrawer.locator("#hospitation-editor-close").click();
  await expect(bookingDrawer).not.toHaveClass(/is-open/);

  await page.locator("#new-hospitation-request-button").click();
  await expect(bookingDrawer).toHaveClass(/is-open/);
  await bookingDrawer.locator("#hospitation-contact-name").fill("Demo-Neuanlage Krankenhaus");
  await bookingDrawer.locator("#hospitation-editor-next").click();
  await bookingDrawer.locator("#hospitation-start").fill("2026-07-04T09:00");
  await bookingDrawer.getByRole("button", { name: "Termin speichern" }).click();
  await expect(bookingDrawer).not.toHaveClass(/is-open/);
  const newlyCreatedRow = page.locator("#hospitation-list .hospitation-row", { hasText: "Demo-Neuanlage Krankenhaus" }).first();
  await expect(newlyCreatedRow).toBeVisible();
  await newlyCreatedRow.locator("[data-open-hospitation-entry]").click();
  await expect(bookingDrawer).toHaveClass(/is-open/);
  await expect(bookingDrawer.getByRole("button", { name: "Löschen" })).toHaveCount(0);
  await expect(bookingDrawer.getByRole("button", { name: /archivieren/i })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await bookingDrawer.getByRole("button", { name: /archivieren/i }).click();
  await expect(bookingDrawer).not.toHaveClass(/is-open/);
  await expect(page.locator("#hospitation-list .hospitation-row", { hasText: "Demo-Neuanlage Krankenhaus" })).toHaveCount(0);

  const row = page.locator(".hospitation-row", { hasText: "Demo-Team Hausarztversorgung 01" }).first();
  await expect(row).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    await expect(row.locator(".hospitation-row__documentation .hospitation-documentation-state")).toBeHidden();
    await row.locator(".hospitation-row__head").click();
  } else {
    await expect(row.locator(".hospitation-row__documentation .hospitation-documentation-state")).toBeVisible();
    const rowDocumentationButton = row.locator(".hospitation-row__documentation").getByRole("button", { name: "Öffnen" });
    await expect(rowDocumentationButton).toBeVisible();
    await rowDocumentationButton.click();
  }
  await expect(bookingDrawer).toHaveClass(/is-open/);
  await expect(bookingDrawer).toContainText("Demo-Team Hausarztversorgung 01");
  if (testInfo.project.name.includes("mobile")) {
    await expect(bookingDrawer.getByRole("tab", { name: "Kontext" })).toHaveAttribute("aria-selected", "true");
    await bookingDrawer.getByRole("tab", { name: "Reflektieren" }).click();
  }
  await expect(bookingDrawer.getByRole("tab", { name: "Reflektieren" })).toHaveAttribute("aria-selected", "true");
  await expect(bookingDrawer.locator('[data-hospitation-editor-panel="hospitation"]')).toBeVisible();
  await bookingDrawer.locator("#hospitation-editor-close").click();
  await expect(bookingDrawer).not.toHaveClass(/is-open/);
  await expect(row.locator(".hospitation-row__detail")).toHaveCount(0);
  await row.locator("[data-open-hospitation-entry]").click();
  await expect(bookingDrawer).toHaveClass(/is-open/);
  await expect(bookingDrawer.getByRole("tab", { name: "Kontext" })).toHaveAttribute("aria-selected", "true");
  const drawerOverviewPanel = bookingDrawer.locator('[data-hospitation-editor-panel="overview"]');
  await expect(drawerOverviewPanel).toBeVisible();
  await expect(drawerOverviewPanel).toContainText("Termin");
  await expect(drawerOverviewPanel).toContainText("22.01.2026, 08:35");
  await expect(drawerOverviewPanel).toContainText("Status");
  await expect(drawerOverviewPanel.locator(".hospitation-status-badge")).toContainText("Durchgeführt");
  await expect(drawerOverviewPanel).toContainText("Setting / Sektor");
  await expect(drawerOverviewPanel.locator(".contact-sector-pill")).toBeVisible();
  await expect(bookingDrawer.locator(".hospitation-documentation-profile-top .detail-meta-control--owner .owner-badge")).toBeVisible();
  await expect(drawerOverviewPanel).not.toContainText("Owner");
  await expect(drawerOverviewPanel.locator(".owner-badge")).toHaveCount(0);
  await expect(drawerOverviewPanel).not.toContainText("Wunschzeitfenster");
  await expect(drawerOverviewPanel).not.toContainText("Keine Wunschzeitfenster hinterlegt.");
  await expect(drawerOverviewPanel.locator('[data-hospitation-edit-field]')).toHaveCount(0);
  await expect(drawerOverviewPanel).not.toContainText("Themen");
  await expect(drawerOverviewPanel).not.toContainText("Betroffene Produkte");
  await bookingDrawer.getByRole("tab", { name: "Themen" }).click();
  const drawerThemePanel = bookingDrawer.locator('[data-hospitation-editor-panel="themes"]');
  await expect(drawerThemePanel).toContainText("Themen");
  await expect(drawerThemePanel.locator(".detail-info-card > .detail-section-title")).toHaveCount(0);
  await expect(drawerThemePanel).not.toContainText("Betroffene Produkte");
  await bookingDrawer.getByRole("tab", { name: "Produkte" }).click();
  const drawerProductPanel = bookingDrawer.locator('[data-hospitation-editor-panel="products"]');
  await expect(drawerProductPanel).toBeVisible();
  await expect(drawerProductPanel).toContainText("Betroffene Produkte");
  await expect(drawerProductPanel.locator(".detail-info-card > .detail-section-title")).toHaveCount(0);
  await bookingDrawer.getByRole("tab", { name: "Notizen" }).click();
  const drawerNotesPanel = bookingDrawer.locator('[data-hospitation-editor-panel="notes"]');
  await expect(drawerNotesPanel).toBeVisible();
  await expect(drawerNotesPanel.locator(".hospitation-request-thread")).toBeVisible();
  await expect(drawerNotesPanel.locator(".format-chat-message").first()).toContainText("Rein synthetische Demo-Hospitation");
  await drawerNotesPanel.locator("#hospitation-request-message").fill("Rückfrage aus dem Visualtest");
  await drawerNotesPanel.locator("#hospitation-request-composer").getByRole("button", { name: "Notiz senden" }).click();
  await expect(bookingDrawer.locator('[data-hospitation-editor-panel="notes"] .format-chat-message').filter({ hasText: "Rückfrage aus dem Visualtest" })).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    await expect(bookingDrawer.locator(".detail-tabs")).toHaveCSS("overflow-x", "auto");
    await expect(bookingDrawer.locator(".format-participant-panel")).toHaveCSS("width", `${page.viewportSize()?.width}px`);
  }
  await attachScreenshot(page, testInfo, "hospitationen-notizen-chat", { fullPage: false });
  await bookingDrawer.locator("#hospitation-editor-close").click();
  await expect(bookingDrawer).not.toHaveClass(/is-open/);

  await expect(page.locator('[data-hospitation-tab="documentation"]')).toHaveCount(0);
  const hospitationCommandRow = page.locator("#hospitation-command-row");
  await expect(hospitationCommandRow).toBeVisible();
  await expect(hospitationCommandRow).toHaveClass(/hospitation-dashboard-preview-card/);
  await expect(hospitationCommandRow.locator(".hospitation-dashboard-preview-copy strong")).toHaveText("Hospitations-Termine");
  await expect(hospitationCommandRow.locator(".hospitation-appointments-header__mode")).toHaveCount(0);
  await expect(hospitationCommandRow.locator("#new-hospitation-request-button")).toHaveCount(0);
  const hospitationActionRow = page.locator("#hospitation-appointments-panel > .hospitation-appointments-action-row");
  await expect(hospitationActionRow.locator(".hospitation-appointments-action-row__left #new-hospitation-request-button")).toBeVisible();
  await expect(hospitationActionRow.locator("[data-hospitation-data-mode-switch]")).toHaveCount(0);
  await expect(hospitationActionRow.locator(".hospitation-appointments-action-row__right #hospitation-schedule-view-toggle")).toBeVisible();
  const headerSearchButton = hospitationCommandRow.locator("#hospitation-header-search-toggle");
  const headerSearchSlot = hospitationCommandRow.locator("#hospitation-header-search-slot");
  await expect(headerSearchButton).toBeVisible();
  await expect(headerSearchButton).toHaveCSS("width", "44px");
  await expect(headerSearchButton.locator("svg")).toHaveCSS("width", "22px");
  await expect(headerSearchButton).toHaveAttribute("aria-expanded", "false");
  await expect(headerSearchSlot).toBeHidden();
  await expect(page.locator(".controls")).toBeHidden();
  await headerSearchButton.click();
  await expect(headerSearchButton).toHaveAttribute("aria-expanded", "true");
  await expect(headerSearchSlot.locator(".search-shell")).toBeVisible();
  await expect(headerSearchSlot.locator(".search-shell")).toHaveCSS("min-height", "44px");
  await expect(page.locator("#search")).toBeFocused();
  await headerSearchButton.click();
  await expect(headerSearchButton).toHaveAttribute("aria-expanded", "false");
  await expect(headerSearchSlot).toBeHidden();
  await expect(page.locator("#new-hospitation-request-button")).toBeVisible();
  await expect(page.locator("#new-hospitation-booking-button")).toHaveCount(0);
  await expect(page.locator("#new-hospitation-slot-button")).toHaveCount(0);
  const documentationDrawer = page.locator("#hospitation-editor-drawer");
  await expect(page.locator("[data-hospitation-data-mode-switch]")).toHaveCount(0);
  await expect(page.locator('[data-hospitation-tab="appointments"]')).toHaveCount(0);
  await expect(page.locator(".hospitation-documentation-toolbar")).toHaveCount(0);
  await expect(page.locator("#hospitation-list")).toContainText("Demo-Team Hausarztversorgung 01");
  await expect(page.locator("#hospitation-list")).toContainText("Demo-Team Patienteninformation 13");
  await expect(page.locator("#new-hospitation-request-button")).toBeVisible();
  const protectedCalendarButton = page.locator('[data-hospitation-schedule-view="calendar"]');
  await expect(protectedCalendarButton).toBeEnabled();
  await protectedCalendarButton.click();
  if (testInfo.project.name.includes("mobile")) {
    const demoAgenda = page.locator("#hospitation-list .hospitation-mobile-agenda");
    await expect(demoAgenda).toBeVisible();
    await expect(demoAgenda).toContainText("Terminübersicht");
    await expect(demoAgenda).toContainText("Demo-Team Patienteninformation 13");
    await expect(page.locator("#hospitation-list .hospitation-calendar-grid")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  } else {
    const demoCalendar = page.locator("#hospitation-list .hospitation-calendar");
    await expect(demoCalendar).toBeVisible();
    const currentMonthLabel = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date());
    await expect(demoCalendar.locator(".hospitation-calendar-title")).toContainText(currentMonthLabel);
    await expect(demoCalendar).toContainText("Freitext Kontakt Visualtest");
    await expect(demoCalendar.locator(".hospitation-calendar-grid + .hospitation-calendar-legend")).toHaveCount(1);
  }
  await page.locator('[data-hospitation-schedule-view="list"]').click();
  const protectedDocumentationRow = page.locator("#hospitation-list .hospitation-row", { hasText: "Demo-Team Hausarztversorgung 01" }).first();
  await expect(protectedDocumentationRow).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    await expect(protectedDocumentationRow.locator("[data-hospitation-row-select]")).toBeHidden();
    await protectedDocumentationRow.locator(".hospitation-row__head").click();
  } else {
    await expect(protectedDocumentationRow.locator("[data-hospitation-row-select]")).toBeEnabled();
    await protectedDocumentationRow.locator(".hospitation-row__documentation").getByRole("button", { name: "Öffnen" }).click();
  }
  await expect(documentationDrawer).toHaveClass(/is-open/);
  await expect(documentationDrawer).not.toContainText("Demo-Daten werden nur als Vorschau angezeigt");
  await expect(documentationDrawer.getByRole("button", { name: "Dokumentation speichern" })).toHaveCount(0);
  await documentationDrawer.getByRole("tab", { name: "Notizen" }).click();
  await expect(documentationDrawer.locator('[data-hospitation-editor-panel="notes"] .hospitation-request-thread')).toBeVisible();
  await expect(documentationDrawer.locator("#hospitation-request-composer")).toBeVisible();
  await documentationDrawer.locator("#hospitation-editor-close").click();
  await expect(documentationDrawer).not.toHaveClass(/is-open/);
  await expect(page.locator("#new-hospitation-request-button")).toBeVisible();
  await expect(page.locator('[data-hospitation-schedule-view="calendar"]')).toBeEnabled();
  const documentationTable = page.locator("#hospitation-list .hospitation-table").first();
  await expect(documentationTable.locator(".hospitation-table-head > *")).toHaveCount(9);
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(1)).toContainText("Termin");
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(1).locator("[data-hospitation-date-sort]")).toHaveCount(1);
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(1).locator("[data-hospitation-header-filter-button]")).toHaveCount(1);
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(2)).toContainText("Status");
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(3)).toContainText("Kontakt");
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(4)).toContainText("Organisation");
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(5)).toContainText("Beobachtungen");
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(6)).toContainText("Sektor");
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(7)).toContainText("Owner");
  await expect(documentationTable.locator(".hospitation-table-head > *").nth(8)).toContainText("Dokumentation");
  await expect(documentationTable.locator(".hospitation-table-head").locator('[data-hospitation-filter-key="documentation"]')).toHaveCount(1);
  await expect(page.locator("#hospitation-list .hospitation-row", { hasText: "Freitext Kontakt Visualtest" })).toBeVisible();
  const documentationRow = page.locator("#hospitation-list .hospitation-row", { hasText: "Demo-Team Hausarztversorgung 01" }).first();
  await expect(documentationRow).toBeVisible();
  await expect(documentationRow.locator(".hospitation-row__person .avatar").first()).toHaveCSS("width", "48px");
  await expect(documentationRow.locator(".hospitation-row__person .avatar").first()).toHaveCSS("height", "48px");
  await expect(documentationRow.locator(".hospitation-row__person .hospitation-row__name")).toHaveText("Demo-Team Hausarztversorgung 01");
  await expect(documentationRow.locator(".hospitation-contact-match-indicator")).toHaveText("!");
  await expect(documentationRow.locator(".hospitation-row__person .hospitation-row__name")).not.toContainText("Demo-Praxis Stadtpark 01");
  await expect(documentationRow.locator(".hospitation-row__cell").nth(0)).toContainText("22.01.26");
  await expect(documentationRow.locator(".hospitation-row__cell").nth(0)).not.toContainText("2026");
  await expect(documentationRow.locator(".hospitation-row__cell").nth(0)).not.toContainText("08:35");
  await expect(documentationRow.locator(".hospitation-row__cell").nth(1)).toContainText("Demo-Praxis Stadtpark 01");
  if (testInfo.project.name.includes("mobile")) {
    await expect(documentationRow.locator(".hospitation-row__mobile-date")).toHaveText("22.01.26");
    await expect(documentationRow.locator(".hospitation-row__mobile-organization")).toContainText("Demo-Praxis Stadtpark 01");
    await expect(documentationRow.locator(".hospitation-row__mobile-footer .contact-sector-pill")).toBeVisible();
    await expect(documentationRow.locator(".hospitation-row__mobile-owner .owner-avatar-stack")).toBeVisible();
    await expect(documentationRow.locator(".hospitation-row__mobile-chevron")).toBeVisible();
    await expect(documentationRow.locator("[data-hospitation-row-select]")).toBeHidden();
    await expect(documentationRow.locator(".hospitation-row__status")).toBeHidden();
    await expect(documentationRow.locator(".hospitation-row__documentation")).toBeHidden();
  } else {
    await expect(documentationRow.locator(".hospitation-row__sector .contact-sector-pill")).toBeVisible();
    await expect(documentationRow.locator(".hospitation-row__owner .owner-avatar-stack")).toBeVisible();
  }
  const doneStatusBadge = documentationRow.locator(".hospitation-status-badge").first();
  if (testInfo.project.name.includes("mobile")) {
    await expect(doneStatusBadge).toBeHidden();
  } else {
    await expect(doneStatusBadge).toBeVisible();
  }
  await expect(doneStatusBadge).toContainText("Dokumentiert");
  await expect(documentationRow.locator(".hospitation-row__head > *").nth(2)).toContainText("Dokumentiert");
  await expect(page.locator("#view-hospitations")).not.toContainText("Gebucht");
  await expect(page.locator("#view-hospitations")).not.toContainText("Angeboten");
  await expect(page.locator("#view-hospitations")).not.toContainText("Abgelehnt");
  const documentationStateIcon = documentationRow.locator(".hospitation-documentation-state").first();
  if (testInfo.project.name.includes("mobile")) {
    await expect(documentationStateIcon).toBeHidden();
  } else {
    await expect(documentationStateIcon).toBeVisible();
    await expect(documentationStateIcon).toHaveCSS("width", "24px");
    await expect(documentationStateIcon.locator(".hospitation-documentation-state__icon")).toBeVisible();
  }
  await expect(documentationRow.locator(".hospitation-documentation-action__meta")).toHaveCount(0);
  await expect(documentationRow).not.toContainText("Noch keine Ergebnisnotiz erfasst");
  await expect(documentationRow).not.toContainText("Ø");
  if (testInfo.project.name.includes("mobile")) {
    await documentationRow.locator(".hospitation-row__head").click();
  } else {
    await documentationRow.locator(".hospitation-row__documentation").getByRole("button", { name: "Öffnen" }).click();
  }

  await expect(documentationDrawer).toHaveClass(/is-open/);
  await expect(documentationDrawer.locator("#hospitation-editor-title")).toHaveText(/\d+ von \d+ Hospitationen/);
  await expect(documentationDrawer.locator("#hospitation-editor-title")).not.toHaveText("Hospitation dokumentieren");
  if (testInfo.project.name.includes("mobile")) {
    await expect(documentationDrawer.getByRole("tab", { name: "Kontext" })).toHaveAttribute("aria-selected", "true");
  } else {
    await expect(documentationDrawer.getByRole("tab", { name: "Reflektieren" })).toHaveAttribute("aria-selected", "true");
  }
  await expect(documentationDrawer.locator("#hospitation-contact")).toHaveCount(0);
  await expect(documentationDrawer.locator("#hospitation-start")).toHaveCount(0);
  await expect(documentationDrawer.locator("#hospitation-owner")).toHaveCount(0);
  await expect(documentationDrawer.getByRole("button", { name: "Abbrechen" })).toHaveCount(0);
  await expect(documentationDrawer.getByRole("button", { name: "Dokumentation speichern" })).toHaveCount(0);
  await expect(documentationDrawer).toContainText("Demo-Team Hausarztversorgung 01");
  await expect(documentationDrawer).toContainText("22.01.2026, 08:35");
  const drawerProfileTop = documentationDrawer.locator(".hospitation-documentation-profile-top");
  await expect(drawerProfileTop.locator(".detail-profile-subline")).toHaveCount(0);
  await expect(drawerProfileTop).not.toContainText("22.01.2026, 08:35");
  const organizationLinkMetrics = await drawerProfileTop.locator(".hospitation-documentation-profile-link").evaluate((link) => {
    const text = link.querySelector(".hospitation-documentation-profile-link__text");
    const textStyle = text ? window.getComputedStyle(text) : null;
    const ownerMeta = link.closest(".detail-profile-top")?.querySelector(".detail-profile-meta");
    const ownerMetaStyle = ownerMeta ? window.getComputedStyle(ownerMeta) : null;
    const linkRect = link.getBoundingClientRect();
    const ownerRect = ownerMeta?.getBoundingClientRect();
    const overlapsOwner = ownerRect
      ? !(linkRect.right <= ownerRect.left || linkRect.left >= ownerRect.right || linkRect.bottom <= ownerRect.top || linkRect.top >= ownerRect.bottom)
      : false;
    return {
      linkWidth: linkRect.width,
      textWhiteSpace: textStyle?.whiteSpace || "",
      lineClamp: textStyle?.webkitLineClamp || "",
      ownerBorderLeftWidth: ownerMetaStyle?.borderLeftWidth || "",
      overlapsOwner
    };
  });
  expect(organizationLinkMetrics.textWhiteSpace).not.toBe("nowrap");
  expect(organizationLinkMetrics.lineClamp).toBe("2");
  if (!testInfo.project.name.includes("mobile")) {
    expect(organizationLinkMetrics.linkWidth).toBeLessThanOrEqual(360);
    expect(organizationLinkMetrics.ownerBorderLeftWidth).toBe("1px");
    expect(organizationLinkMetrics.overlapsOwner).toBe(false);
  } else {
    expect(organizationLinkMetrics.ownerBorderLeftWidth).toBe("0px");
  }
  const drawerOwnerControl = drawerProfileTop.locator(".detail-meta-control--owner");
  await expect(drawerOwnerControl.locator(".detail-meta-control__label")).toHaveText("Owner");
  await expect(drawerOwnerControl.locator(".owner-badge")).toBeVisible();
  await expect(drawerOwnerControl.getByRole("button", { name: "Owner bearbeiten" })).toBeVisible();
  await expect(drawerOwnerControl.locator("[data-hospitation-owner-picker]")).toBeHidden();
  await drawerOwnerControl.getByRole("button", { name: "Owner bearbeiten" }).click();
  await expect(drawerOwnerControl.locator("[data-hospitation-owner-picker]")).toBeVisible();
  await expect(drawerOwnerControl.getByRole("searchbox", { name: "Owner suchen" })).toBeFocused();
  const ownerPickerInputs = drawerOwnerControl.locator('[data-hospitation-owner-picker] input[type="checkbox"]');
  await expect(ownerPickerInputs.first()).toBeVisible();
  if (await ownerPickerInputs.count() > 1) {
    await ownerPickerInputs.nth(0).setChecked(true);
    await ownerPickerInputs.nth(1).setChecked(true);
    await drawerOwnerControl.getByRole("button", { name: "Speichern" }).click();
    await expect(drawerOwnerControl.locator(".owner-badge")).toHaveCount(2, { timeout: 5000 });
    await expect(
      drawerOwnerControl.locator(".hospitation-owner-control__badge .owner-badge").nth(1)
    ).toBeVisible();
    const ownerBadgeLabels = await drawerOwnerControl.locator(".hospitation-owner-control__badge .owner-badge__label").allTextContents();
    expect(ownerBadgeLabels.slice(0, 2).every((label) => {
      const trimmed = label.trim();
      return trimmed.length > 0 && !/\s/.test(trimmed);
    })).toBe(true);
    const ownerBadgeMetrics = await drawerOwnerControl.locator(".hospitation-owner-control__row").evaluate((row) => {
      const badgeArea = row.querySelector(".hospitation-owner-control__badge")?.getBoundingClientRect();
      const editButton = row.querySelector(".hospitation-owner-edit")?.getBoundingClientRect();
      if (!badgeArea) return [];
      return Array.from(row.querySelectorAll(".hospitation-owner-control__badge .owner-badge")).map((badge) => {
        const rect = badge.getBoundingClientRect();
        const visibleWidth = Math.min(rect.right, badgeArea.right) - Math.max(rect.left, badgeArea.left);
        const visibleHeight = Math.min(rect.bottom, badgeArea.bottom) - Math.max(rect.top, badgeArea.top);
        const overlapsEditButton = editButton
          ? !(rect.right <= editButton.left || rect.left >= editButton.right || rect.bottom <= editButton.top || rect.top >= editButton.bottom)
          : false;
        return {
          width: rect.width,
          top: rect.top,
          bottom: rect.bottom,
          visibleWidth,
          visibleHeight,
          overlapsEditButton
        };
      });
    });
    expect(ownerBadgeMetrics[1].top).toBeGreaterThanOrEqual(ownerBadgeMetrics[0].bottom - 1);
    expect(
      ownerBadgeMetrics
        .slice(0, 2)
        .every((badge) => (
          badge.width > 40
          && badge.visibleWidth > 40
          && badge.visibleHeight > 24
          && !badge.overlapsEditButton
        ))
    ).toBe(true);
    await expect.poll(async () => (
      documentationRow.locator(".hospitation-row__owner .owner-avatar-stack__item").count()
    )).toBeGreaterThanOrEqual(2);
    const listOwnerLabels = await documentationRow
      .locator(".hospitation-row__owner .owner-avatar-stack__item")
      .evaluateAll((items) => items.map((item) => item.getAttribute("aria-label") || item.getAttribute("title") || ""));
    expect(listOwnerLabels.slice(0, 2).every((label) => label.trim().length > 0)).toBe(true);
  }
  await expect(documentationDrawer.locator("#hospitation-editor-header-actions").getByRole("button", { name: "Profil öffnen" })).toBeVisible();
  await expect(documentationDrawer.locator("#hospitation-editor-header-actions").getByRole("button", { name: "Bearbeiten" })).toBeVisible();
  await expect(documentationDrawer).not.toContainText("Themen / Tags");
  await expect(documentationDrawer.locator(".hospitation-documentation-profile-topic-list")).toHaveCount(0);
  await expect(drawerProfileTop.locator("[data-documentation-quality]")).toHaveCount(0);
  await expect(drawerProfileTop.locator(".detail-profile-status")).toHaveCount(0);
  await expect(documentationDrawer.locator("[data-hospitation-editor-tab] [data-documentation-tab-warning]")).toHaveCount(0);
  await expect(documentationDrawer).toHaveClass(/is-documentation-mode/);
  const documentationPanel = documentationDrawer.locator(".format-participant-panel");
  const documentationPanelMetrics = await documentationPanel.evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return {
      width: rect.width,
      viewportWidth: window.innerWidth
    };
  });
  if (testInfo.project.name.includes("mobile")) {
    expect(documentationPanelMetrics.width).toBeGreaterThanOrEqual(documentationPanelMetrics.viewportWidth - 1);
  } else {
    expect(documentationPanelMetrics.width).toBeGreaterThanOrEqual(720);
    expect(documentationPanelMetrics.width).toBeLessThanOrEqual(900);
  }
  await expect(documentationDrawer.locator("details.hospitation-editor-section")).toHaveCount(0);
  await expect(documentationDrawer.locator(".detail-profile-top")).toBeVisible();
  const expectedDocumentationAvatarSize = testInfo.project.name.includes("mobile") ? "64px" : "104px";
  await expect(documentationDrawer.locator(".detail-profile-main .avatar").first()).toHaveCSS("width", expectedDocumentationAvatarSize);
  await expect(documentationDrawer.locator(".detail-profile-main .avatar").first()).toHaveCSS("height", expectedDocumentationAvatarSize);
  await expect(documentationDrawer.locator(".detail-profile-copy h3")).toContainText("Demo-Team Hausarztversorgung 01");
  await expect(documentationDrawer.locator(".detail-profile-copy h3")).not.toContainText("Demo-Praxis Stadtpark 01");
  await expect(documentationDrawer.locator(".detail-profile-role")).toContainText("Demo-Praxis Stadtpark 01");
  const organizationProfileLink = documentationDrawer.locator(".hospitation-documentation-profile-link");
  await expect(organizationProfileLink).toContainText("Demo-Praxis Stadtpark 01");
  await expect(organizationProfileLink.locator(".hospitation-documentation-profile-link__icon svg")).toBeVisible();
  await expect(organizationProfileLink.locator(".hospitation-documentation-profile-link__text")).toContainText("Demo-Praxis Stadtpark 01");
  const organizationProfileLinkStyle = await organizationProfileLink.evaluate((link) => {
    const style = window.getComputedStyle(link);
    return {
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
      borderWidth: Number.parseFloat(style.borderTopWidth),
      display: style.display,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      textDecorationLine: style.textDecorationLine
    };
  });
  expect(organizationProfileLinkStyle.display).toBe("inline-flex");
  expect(organizationProfileLinkStyle.borderRadius).toBeGreaterThan(14);
  expect(organizationProfileLinkStyle.borderWidth).toBeGreaterThan(0);
  expect(organizationProfileLinkStyle.paddingLeft).toBeGreaterThan(4);
  expect(organizationProfileLinkStyle.textDecorationLine).toBe("none");
  const profileNameMetrics = await documentationDrawer.locator(".detail-profile-copy h3").evaluate((nameNode) => {
    const style = window.getComputedStyle(nameNode);
    const rect = nameNode.getBoundingClientRect();
    return {
      height: rect.height,
      lineHeight: Number.parseFloat(style.lineHeight),
      overflowWrap: style.overflowWrap,
      whiteSpace: style.whiteSpace,
      width: rect.width,
      wordBreak: style.wordBreak
    };
  });
  expect(profileNameMetrics.overflowWrap).not.toBe("anywhere");
  expect(profileNameMetrics.wordBreak).not.toBe("break-all");
  expect(profileNameMetrics.width).toBeGreaterThan(160);
  expect(profileNameMetrics.height).toBeLessThanOrEqual(profileNameMetrics.lineHeight * 2 + 6);
  const documentationStickyMetrics = await documentationDrawer.locator(".hospitation-documentation-sticky-shell").evaluate((stickyShell) => {
    const panel = stickyShell.closest(".format-participant-panel");
    const header = panel?.querySelector(".format-participant-header");
    const headerStyle = header ? window.getComputedStyle(header) : null;
    const stickyStyle = window.getComputedStyle(stickyShell);
    return {
      headerPosition: headerStyle?.position || "",
      headerTop: headerStyle?.top || "",
      stickyPosition: stickyStyle.position,
      stickyTop: stickyStyle.top
    };
  });
  expect(documentationStickyMetrics.headerPosition).toBe("sticky");
  expect(documentationStickyMetrics.headerTop).toBe("0px");
  expect(documentationStickyMetrics.stickyPosition).toBe("sticky");
  expect(Number.parseFloat(documentationStickyMetrics.stickyTop)).toBeGreaterThanOrEqual(58);
  await expect(documentationDrawer.locator("[data-hospitation-editor-tab] > span:first-child")).toHaveText([
    "Kontext",
    "Themen",
    "Produkte",
    "Beobachten",
    "Reflektieren",
    "Teilen",
    "Notizen"
  ]);
  await documentationDrawer.getByRole("tab", { name: "Kontext" }).click();
  const overviewPanel = documentationDrawer.locator('[data-hospitation-editor-panel="overview"]');
  await expect(overviewPanel).toBeVisible();
  await expect(overviewPanel).toContainText("Termin");
  await expect(overviewPanel).not.toContainText("Rahmen");
  await expect(overviewPanel).not.toContainText("Hospitationsziel");
  await expect(overviewPanel).not.toContainText("Ziel & Zeitfenster");
  await expect(documentationDrawer.getByRole("button", { name: "Löschen" })).toHaveCount(0);
  await expect(documentationDrawer.locator(".hospitation-documentation-archive-action")).toBeVisible();
  await expect(documentationDrawer.locator("[data-documentation-context-topics]")).toHaveCount(0);
  await expect(overviewPanel).not.toContainText("Themen");
  await expect(overviewPanel).not.toContainText("Tags");
  await expect(overviewPanel).not.toContainText("Betroffene Produkte");
  await documentationDrawer.getByRole("tab", { name: "Themen" }).click();
  const themePanel = documentationDrawer.locator('[data-hospitation-editor-panel="themes"]');
  await expect(themePanel).toBeVisible();
  const themePanelWarning = themePanel.locator(":scope > .detail-section-title [data-documentation-tab-warning]");
  await expect(themePanelWarning).toBeHidden();
  const themeDetails = themePanel.locator(".detail-info-card").filter({ hasText: "Themen" });
  await expect(themeDetails).toBeVisible();
  await expect(themeDetails.locator("[data-documentation-theme-selected]")).toBeVisible();
  await expect(themeDetails.locator(".detail-theme-group").filter({ hasText: "Ausgewählte Themen" })).toBeVisible();
  await expect(themeDetails.locator(".detail-theme-group").filter({ hasText: "Mögliche Themen" })).toBeVisible();
  await themeDetails.locator("#hospitation-documentation-topic-input").fill("E-Überweisung");
  await themeDetails.locator("#hospitation-documentation-topic-add").click();
  await expect(themeDetails.locator("[data-documentation-theme-selected]")).toContainText("E-Überweisung");
  await expect(themePanelWarning).toBeHidden();
  await expect.poll(async () => page.evaluate(async () => {
    const rows = await window.dataService.getHospitations({ includeArchived: true });
    return rows.some((row) => {
      const topics = Array.isArray(row.topics) ? row.topics.join(" ") : String(row.topics || "");
      return topics.includes("E-Überweisung");
    });
  }), { timeout: 4000 }).toBe(true);
  await expect(themePanel).not.toContainText(/^Hospitation$/);
  await expect(themePanel).not.toContainText(/^Versorgungskontakt$/);
  await expect(themePanel).not.toContainText("Betroffene Produkte");
  await expect(themePanel.locator(".detail-info-card > .detail-section-title")).toHaveCount(0);
  await expect(themePanel.locator(".detail-theme-group--selected")).toContainText("Ausgewählte Themen");
  await expect(themePanel.locator(".detail-theme-group--suggestions")).toContainText("Mögliche Themen");
  await documentationDrawer.getByRole("tab", { name: "Produkte" }).click();
  const productsPanel = documentationDrawer.locator('[data-hospitation-editor-panel="products"]');
  await expect(productsPanel).toBeVisible();
  const productPanelWarning = productsPanel.locator(":scope > .detail-section-title [data-documentation-tab-warning]");
  await expect(productPanelWarning).toBeHidden();
  await expect(productsPanel.locator(".detail-info-card > .detail-section-title")).toHaveCount(0);
  await expect(productsPanel.locator(".detail-theme-group--selected")).toContainText("Ausgewählte Produkte");
  await expect(productsPanel.locator(".detail-theme-group--suggestions")).toContainText("gematik-Anwendungen und Dienste");
  const productDetails = productsPanel.locator(".detail-info-card").first();
  await expect(productDetails).toContainText("gematik-Anwendungen und Dienste");
  await expect(productDetails).toContainText("Alle Anwendungen");
  await expect(productDetails).toContainText("ePA für alle");
  await expect(productDetails).toContainText("VSDM");
  await expect(productDetails).toContainText("PoPP");
  await expect(productDetails).toContainText("SMC-B");
  await expect(productDetails).toContainText("eHBA");
  await expect(productDetails).toContainText("VZD");
  await expect(productDetails).toContainText("TI-Gateway");
  await expect(productDetails).toContainText("Einboxkonnektor");
  await expect(productDetails).toContainText("ISiK");
  await expect(productDetails.locator("#hospitation-documentation-product-input")).toHaveCount(0);
  await expect(productDetails).not.toContainText("Verzeichnisdienst (VZD)");
  await expect(productDetails).not.toContainText("KIM-Fachdienst");
  await expect(productDetails).not.toContainText("ePA-Aktensystem");
  const selectedProducts = productDetails.locator("[data-documentation-theme-selected]");
  if (!String(await selectedProducts.textContent()).includes("ePA für alle")) {
    await productDetails.locator('[data-documentation-theme-toggle="ePA für alle"]').click();
  }
  if (!String(await selectedProducts.textContent()).includes("KIM")) {
    await productDetails.locator('[data-documentation-theme-toggle="KIM"]').click();
  }
  await expect(productDetails.locator("[data-documentation-theme-selected]")).toContainText("ePA für alle");
  await expect(productDetails.locator("[data-documentation-theme-selected]")).toContainText("KIM");
  await documentationDrawer.getByRole("tab", { name: "Beobachten" }).click();
  const observationDetails = documentationDrawer.locator('[data-hospitation-editor-panel="observations"]');
  await expect(observationDetails).toBeVisible();
  const observationWarning = observationDetails.locator(":scope > .detail-section-title [data-documentation-tab-warning]");
  await expect(observationWarning).toBeVisible();
  await expect(observationWarning.locator("[data-documentation-tab-warning-popup]")).toContainText(/Beobachtung|Zitat|Bild/);
  await expect(observationDetails).not.toContainText("Betroffene Produkte");
  await expect(observationDetails).not.toContainText("Produktbezug");
  await expect(observationDetails).not.toContainText("Zitate und Bilder");
  await expect(observationDetails).toContainText("Optionale Stimmen");
  await expect(observationDetails).not.toContainText("Evidenzart");
  await expect(observationDetails).not.toContainText("betroffene Rollen");
  await expect(observationDetails).not.toContainText("Warum ist das relevant");
  await expect(observationDetails).not.toContainText("Versorgungsrelevanz");
  await expect(observationDetails).not.toContainText("mögliche Nutzung");
  const observationCards = observationDetails.locator('[data-repeatable-card][data-repeatable-type="observation"]');
  await expect(observationCards.first()).toBeVisible();
  const initialObservationCount = await observationCards.count();
  await observationCards.nth(0).locator('[data-repeatable-field="title"]').fill("Aufnahme ohne Überblick");
  await observationCards.nth(0).locator(".hospitation-observation-advanced > summary").click();
  await observationCards.nth(0).locator('[data-repeatable-field="sequence"]').fill("1");
  await observationCards.nth(0).locator('[data-repeatable-field="observedAt"]').fill("09:10 Uhr");
  await observationCards.nth(0).locator('[data-repeatable-field="trigger"]').fill("Ein Entlassbrief trifft kurz vor dem Termin ein.");
  await observationCards.nth(0).locator('[data-repeatable-field="observed"]').fill("Die aktuelle Medikamentenliste wird aus drei Quellen zusammengetragen.");
  await observationCards.nth(0).locator('[data-repeatable-field="actions"]').fill("Entlassbrief öffnen\nPVS-Liste vergleichen\nAbweichungen markieren");
  await observationCards.nth(0).locator('[data-repeatable-field="toolsAndDocuments"]').fill("PVS, Entlassbrief, Medikationsplan");
  await observationCards.nth(0).locator('[data-repeatable-field="immediateConsequence"]').fill("Die Liste bleibt bis zur ärztlichen Klärung offen.");
  await observationCards.nth(0).locator('[data-repeatable-field="sourceReference"]').fill("Anonymisierte Hospitationsnotiz");
  await observationCards.nth(0).locator('[data-repeatable-field="processPhase"]').selectOption({ label: "Anmeldung / Aufnahme" });
  await observationCards.nth(0).locator('[data-repeatable-field="problemType"]').selectOption({ label: "fehlende Information" });
  await expect(observationCards.nth(0).locator('[data-repeatable-field="affectedProducts"]')).toHaveCount(1);
  await observationCards.nth(0).locator('[data-repeatable-field="evidenceType"]').evaluate((input) => {
    input.value = "directly_observed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(observationCards.nth(0).locator('[data-repeatable-field="evidenceType"]')).toHaveValue("directly_observed");
  await expect(observationCards.nth(0).locator('[data-repeatable-field="nextUse"]')).toHaveCount(0);
  await expect(observationCards.nth(0).locator('[data-repeatable-field="careRelevance"]')).toHaveCount(0);
  const addObservationButton = observationDetails.getByRole("button", { name: "Beobachtung hinzufügen" });
  await addObservationButton.scrollIntoViewIfNeeded();
  await addObservationButton.click();
  await expect(observationCards).toHaveCount(initialObservationCount + 1);
  await observationCards.nth(initialObservationCount).locator('[data-repeatable-field="title"]').fill("Rückfrage ohne Zuständigkeit");
  await observationCards.nth(initialObservationCount).locator('[data-repeatable-field="observed"]').fill("Eine Rückfrage bleibt offen, weil keine Rolle eindeutig zuständig ist.");
  await observationCards.nth(initialObservationCount).locator('[data-repeatable-field="processPhase"]').selectOption({ label: "Kommunikation mit anderen Einrichtungen" });
  await observationCards.nth(initialObservationCount).locator('[data-repeatable-field="problemType"]').selectOption({ label: "Rollenunklarheit" });
  await expect(observationCards.nth(initialObservationCount).locator('[data-repeatable-field="evidenceType"]')).toHaveValue("directly_observed");
  await addObservationButton.scrollIntoViewIfNeeded();
  await addObservationButton.click();
  await expect(observationCards).toHaveCount(initialObservationCount + 2);
  await observationCards.nth(initialObservationCount + 1).locator('[data-repeatable-field="title"]').fill("Formular als Medienbruch");
  await observationCards.nth(initialObservationCount + 1).locator('[data-repeatable-field="observed"]').fill("Ein Papierformular wird eingescannt und anschließend manuell übertragen.");
  await observationCards.nth(initialObservationCount + 1).locator('[data-repeatable-field="processPhase"]').selectOption({ label: "Befund / Dokumentation" });
  await observationCards.nth(initialObservationCount + 1).locator('[data-repeatable-field="problemType"]').selectOption({ label: "Medienbruch" });
  await expect(observationCards.nth(initialObservationCount + 1).locator('[data-repeatable-field="evidenceType"]')).toHaveValue("directly_observed");
  await expect(observationDetails.locator('[data-repeatable-summary-title]').first()).toContainText("Aufnahme ohne Überblick");
  const quoteDetails = observationDetails.locator(".detail-info-card").filter({ hasText: "Optionale Stimmen" });
  await expect(observationDetails).toBeVisible();
  await expect(observationDetails.locator("[data-preserved-documentation-artifacts]")).toBeHidden();
  await quoteDetails.getByRole("button", { name: "Zitat hinzufügen" }).click();
  const quoteCard = quoteDetails.locator('[data-repeatable-card][data-repeatable-type="quote"]').first();
  await quoteCard.locator('[data-repeatable-field="quote"]').fill("Wir sehen oft nicht, wer als Nächstes dran ist.");
  await quoteCard.locator('[data-repeatable-field="personRole"]').fill("MFA");
  await quoteCard.locator('[data-repeatable-field="observationId"]').selectOption({ index: 1 });
  await quoteCard.locator('[data-repeatable-field="internalUseAllowed"]').selectOption("true");
  await expect(quoteCard.locator('[data-observation-link-select]')).toContainText("Aufnahme ohne Überblick");
  await documentationDrawer.getByRole("tab", { name: "Teilen" }).click();
  const impulseDetails = documentationDrawer.locator('[data-hospitation-editor-panel="impulses"]');
  await expect(impulseDetails).toBeVisible();
  await impulseDetails.getByRole("button", { name: "Impuls hinzufügen" }).click();
  const impulseCard = impulseDetails.locator('[data-repeatable-card][data-repeatable-type="impulse"]').first();
  await impulseCard.locator('[data-repeatable-field="title"]').fill("Zuständige Rolle bei Rückfragen");
  await impulseCard.locator('[data-repeatable-field="classification"]').selectOption({ label: "Prozessfrage" });
  await impulseCard.locator('[data-repeatable-field="problem"]').fill("Rückfragen verlieren Priorität und Zuständigkeit.");
  await impulseCard.locator('[data-repeatable-field="status"]').selectOption({ label: "zu prüfen" });
  await expect(documentationDrawer).not.toContainText("Roadmap-Bewertung");
  await documentationDrawer.getByRole("tab", { name: "Reflektieren" }).click();
  const hospitationDetails = documentationDrawer.locator('[data-hospitation-editor-panel="hospitation"]');
  await expect(hospitationDetails).toBeVisible();
  const scoreDetails = hospitationDetails;
  await expect(scoreDetails.locator("[data-documentation-score-row]:visible")).toHaveCount(1);
  await expect(scoreDetails.locator("#documentationScore_0_itemId")).not.toContainText("Eigenes Item");
  await expect(scoreDetails.locator(".hospitation-score-custom").first()).toContainText("Präzisierung");
  await expect(scoreDetails.locator(".hospitation-slider-score__ticks").first().locator("span")).toHaveText(["1", "2", "3", "4", "5"]);
  await hospitationDetails.locator("#hospitation-documentation-summary").fill("Dokumentationsnotiz aus dem Visualtest");
  await hospitationDetails.locator("#hospitation-documentation-insight").fill("Erkenntnis aus dem strukturierten Formular");
  await hospitationDetails.locator("#hospitation-documentation-next-use").fill("Nächste Nutzung aus dem Visualtest");
  await expect(documentationDrawer.locator(".hospitation-documentation-tab-warning:visible")).toHaveCount(0);
  await documentationDrawer.locator("#documentationScore_0_itemId").selectOption("medicationPlan");
  await documentationDrawer.locator("#hospitation-score-item-add").click();
  await expect(scoreDetails.locator("[data-documentation-score-row]:visible")).toHaveCount(2);
  await documentationDrawer.locator("#documentationScore_1_itemId").selectOption("dischargeLetter");
  await documentationDrawer.locator('[name="documentationScore_0_score"]').evaluate((input) => {
    input.value = "4";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await documentationDrawer.locator('[name="documentationScore_1_score"]').evaluate((input) => {
    input.value = "5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await documentationDrawer.locator("#hospitation-score-item-input").fill("Hilfsmittelstatus");
  await documentationDrawer.locator("#hospitation-score-item-add").click();
  await expect(scoreDetails.locator("[data-documentation-score-row]:visible")).toHaveCount(3);
  await expect(documentationDrawer.locator("[data-documentation-score-label]", { hasText: "Hilfsmittelstatus" })).toBeVisible();
  await documentationDrawer.locator('[name="documentationScore_2_score"]').evaluate((input) => {
    input.value = "3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(documentationDrawer.locator('[name="documentationScore_0_score"]').locator("xpath=ancestor::label[1]")).toContainText("4/5");
  await page.waitForTimeout(1500);
  await expect(documentationRow).toContainText("Dokumentiert", { timeout: 7000 });
  await documentationDrawer.locator("#hospitation-editor-close").click();
  await expect(documentationDrawer).not.toHaveClass(/is-open/);
  await expect(documentationRow).toContainText("Dokumentiert");
  const documentedStatusBadge = documentationRow.locator(".hospitation-status-badge").first();
  await expect(documentedStatusBadge).toContainText("Dokumentiert");
  if (testInfo.project.name.includes("mobile")) {
    await expect(documentedStatusBadge).toBeHidden();
  } else {
    await expect(documentedStatusBadge).toBeVisible();
  }
  await expect(documentationRow).not.toContainText("Dokumentationsnotiz aus dem Visualtest");
  await expect(documentationRow).not.toContainText("Ø");

  if (!testInfo.project.name.includes("mobile")) {
    const freetextArchiveRow = page.locator(".hospitation-row", { hasText: "Freitext Kontakt Visualtest" }).first();
    await expect(freetextArchiveRow).toBeVisible();
    await freetextArchiveRow.locator("[data-hospitation-row-select]").check();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#hospitation-bulk-archive").click();
    await expect(page.locator("#hospitation-list .hospitation-row", { hasText: "Freitext Kontakt Visualtest" })).toHaveCount(0);
    const archiveToggle = page.locator("[data-hospitation-archive-toggle]");
    await expect(archiveToggle).toContainText("Archiviert");
    await archiveToggle.click();
    await expect(page.locator(".hospitation-schedule-toolbar")).toHaveCount(0);
    await expect(page.locator("#hospitation-list .hospitation-row", { hasText: "Freitext Kontakt Visualtest" }).first()).toBeVisible();
    await page.locator("[data-hospitation-archive-toggle]").click();
  }

  await expect(page.locator('[data-hospitation-tab="dashboard"]')).toHaveCount(0);
  await openMobileSidebarIfNeeded(page);
  const hospitationDashboardTab = page.locator('[data-view-tab="hospitations:dashboard"]');
  if (!(await hospitationDashboardTab.isVisible())) {
    await page.locator('[data-sidebar-section-toggle="planning"]').click();
    await expect(hospitationDashboardTab).toBeVisible();
  }
  await hospitationDashboardTab.click();
  await expect(page).toHaveURL(/#hospitations:dashboard$/);
  await expect(page.locator('[data-view-tab="hospitations:dashboard"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-view-tab="hospitations"]')).not.toHaveClass(/is-active/);
  const dashboard = page.locator("#hospitation-dashboard");
  await expect(dashboard).toBeVisible();
  await expect(page.locator("#hospitation-mode-actions")).toBeHidden();
  await expect(page.locator(".controls")).toBeHidden();
  await expect(page.locator("#hospitation-command-row")).toBeHidden();
  if (testInfo.project.name.includes("mobile")) {
    const mobileGroups = dashboard.locator("[data-hospitation-dashboard-mobile-group]");
    await expect(mobileGroups).toHaveCount(3);
    await expect(mobileGroups.first()).toHaveAttribute("open", "");
    await expect(mobileGroups.nth(1)).not.toHaveAttribute("open", "");
    await expect(dashboard.locator("[data-hospitation-dashboard-layout-toggle]")).toHaveCount(0);
    await expect(dashboard.locator('[data-hospitation-dashboard-card="observation-signals"], [data-hospitation-dashboard-card="observation-patterns"], [data-hospitation-dashboard-card="readiness"], [data-hospitation-dashboard-card="epic-funnel"], [data-hospitation-dashboard-card="roadmap-review"], [data-hospitation-dashboard-card="relevance-hints"]')).toHaveCount(0);
    await mobileGroups.nth(1).locator(":scope > summary").click();
    await expect(mobileGroups.nth(1)).toHaveAttribute("open", "");
    await expect(mobileGroups.first()).not.toHaveAttribute("open", "");
    await expectNoHorizontalOverflow(page);
    await attachScreenshot(page, testInfo, "planung-dashboard-mobile");
    return;
  }
  await expect(dashboard).toContainText("Versorgungswissen-Cockpit");
  await expect(dashboard).toContainText("Das Dashboard konzentriert sich auf die aktuell relevanten Hospitationsdaten.");
  await expect(dashboard).toContainText("Musterbildung bleibt weiterhin Teil des Hospitations-Frameworks.");
  await expect(dashboard.getByRole("button", { name: /^(Echte Daten|Demo)$/ })).toHaveCount(0);
  await expect(dashboard).not.toContainText("Dashboard-Daten");
  await expect(dashboard).not.toContainText("Echte Dokumentationen");
  await expect(dashboard).not.toContainText("Methodischer Hinweis");
  await expect(dashboard).not.toContainText("Qualitative Daten aus Hospitationen. Nicht repräsentativ.");
  await expect(dashboard).not.toContainText("Optional eingrenzen");
  const dashboardFilterCard = dashboard.locator(".hospitation-dashboard-filter-card");
  await expect(dashboardFilterCard).toBeVisible();
  await expect(dashboardFilterCard).toContainText("Container filtern");
  await expect(dashboard.locator("[data-hospitation-dashboard-filter]")).toHaveCount(7);
  await expect(dashboard.locator('[data-hospitation-dashboard-filter="container"]')).toHaveCount(1);
  await expect(dashboard.locator('[data-hospitation-dashboard-filter="product"]')).toHaveCount(1);
  await expect(dashboard.locator('[data-hospitation-dashboard-filter="impact"]')).toHaveCount(0);
  await expect(dashboard.locator('[data-hospitation-dashboard-filter="relevance"]')).toHaveCount(0);
  const sectorCard = dashboard.locator('[data-hospitation-dashboard-card="sectors"]');
  const dashboardQuoteCard = dashboard.locator('[data-hospitation-dashboard-card="quotes"]');
  const locationCard = dashboard.locator('[data-hospitation-dashboard-card="locations"]');
  const observationsCard = dashboard.locator('[data-hospitation-dashboard-card="observations"]');
  const qualityCard = dashboard.locator('[data-hospitation-dashboard-card="quality"]');
  await expect(dashboard.locator("[data-hospitation-dashboard-card]")).toHaveCount(10);
  await expect(dashboard).toContainText("Hospitationen");
  await expect(dashboard).toContainText("Beobachtungen");
  await expect(dashboard).toContainText("Zitate");
  await expect(dashboard).not.toContainText("Zitate / Medien");
  await expect(dashboard).toContainText("Datenqualität");
  await expect(dashboard).toContainText("Wiederkehrende Themen");
  await expect(dashboard).toContainText("Freitext-Begriffe");
  await expect(dashboard).toContainText("Betroffene Produkte");
  await expect(dashboard).toContainText("Auffällige Prozessphasen");
  await expect(dashboard).toContainText("Sektoren");
  await expect(dashboard).toContainText("Regionale Verteilung");
  await expect(dashboard).toContainText("Beobachtungen");
  await expect(dashboard.locator(".hospitation-dashboard-quotes-card")).toContainText("Zitate");
  await expect(dashboard).not.toContainText("Mögliche Impulse");
  await expect(dashboard).not.toContainText("Explorative Relevanzhinweise");
  await expect(dashboard).toContainText("Problemtypen");
  await expect(dashboard).not.toContainText("Nächste Entscheidung");
  await expect(dashboard).not.toContainText("Mögliche Impulse & Relevanz");
  await expect(dashboard).not.toContainText("Metadaten-Auswertung");
  await expect(dashboard).not.toContainText("Analyse-Tags und Nutzung");
  await expect(dashboard).not.toContainText("Häufige Beobachtungstypen");
  await expect(dashboard).not.toContainText("Priorisierte Roadmap-Themen");
  await expect(dashboard).not.toContainText("Wichtigste qualitative Signale");
  await expect(dashboard).not.toContainText("Datenbasis & Kontext");
  await expect(dashboard).not.toContainText("Kontextmerkmale");
  await expect(dashboard).not.toContainText("Durchgeführte Hospitationen");
  await expect(dashboard).not.toContainText("Relevanz Ø");
  await expect(dashboard).not.toContainText("Sektoren & Settings");
  await expect(dashboard).not.toContainText("Settings und Rollen");
  await expect(dashboard).not.toContainText("Stimmen & Beobachtungen");
  await expect(dashboard).not.toContainText("Qualitative Belege bleiben sichtbar");
  await expect(dashboard.locator(".hospitation-dashboard-kpi", { hasText: "Sektoren" })).toHaveCount(0);
  await expect(dashboard.locator(".hospitation-dashboard-kpi", { hasText: "Themen / Tags" })).toHaveCount(0);
  await expect(dashboard).toContainText("Sektoren");
  await expect(dashboard.locator(".hospitation-dashboard-pie")).toBeVisible();
  await expect(dashboard).not.toContainText("intern frei");
  await expect(dashboard).not.toContainText("extern nutzbar");
  await expect(dashboard).not.toContainText("Schwärzung");
  await expect(dashboard).toContainText("doppelte Dokumentation");
  await expect(dashboard).toContainText("Befund / Dokumentation");
  await expect(dashboard).not.toContainText("Zuständige Rolle bei Rückfragen");
  await expect(dashboard).toContainText("Beobachtung");
  await expect(dashboard.locator('[data-hospitation-dashboard-card="observation-signals"], [data-hospitation-dashboard-card="observation-patterns"], [data-hospitation-dashboard-card="readiness"], [data-hospitation-dashboard-card="epic-funnel"], [data-hospitation-dashboard-card="roadmap-review"], [data-hospitation-dashboard-card="relevance-hints"]')).toHaveCount(0);
  await expect(dashboard.locator(".hospitation-dashboard-kpi-card", { hasText: "Muster" })).toHaveCount(0);
  await expect(dashboard.locator(".hospitation-dashboard-kpi-card", { hasText: "Roadmap-Signale" })).toHaveCount(0);
  await expect(dashboard.getByRole("button", { name: "Hospitation öffnen" }).first()).toBeEnabled();
  const layoutButton = dashboard.locator("[data-hospitation-dashboard-layout-toggle]");
  await expect(dashboard.locator("[data-hospitation-dashboard-layout-toolbar]")).toHaveCount(0);
  await expect(layoutButton).toBeVisible();
  await expect(layoutButton).toHaveText("Layout");
  await expect(sectorCard.locator(".hospitation-dashboard-legend-values").first()).toBeVisible();
  await expect(sectorCard.locator(".hospitation-dashboard-legend-count").first()).toBeVisible();
  await expect(sectorCard.locator(".hospitation-dashboard-legend-share").first()).toContainText("%");
  await expect(sectorCard).toHaveAttribute("draggable", "false");
  await expect(sectorCard.locator('[data-hospitation-dashboard-widget-size="sectors"]')).toHaveCount(0);
  await layoutButton.click();
  await expect(layoutButton).toHaveClass(/is-active/);
  await expect(dashboard.locator("[data-hospitation-dashboard-reset-layout]")).toBeVisible();
  await expect(sectorCard).toHaveAttribute("draggable", "true");
  await expect(sectorCard.locator('[data-hospitation-dashboard-widget-size="sectors"]')).toBeVisible();
  await sectorCard.locator('[data-hospitation-dashboard-widget-size="sectors"]').click();
  await expect(sectorCard).toHaveClass(/hospitation-dashboard-card--span-8/);
  await expect(sectorCard).toHaveAttribute("data-hospitation-dashboard-widget-size-state", "large");
  await sectorCard.locator('[data-hospitation-dashboard-widget-move="sectors"][data-direction="1"]').click();
  await expect.poll(async () => dashboard.evaluate(() => {
    const sectors = document.querySelector('[data-hospitation-dashboard-card="sectors"]');
    const locations = document.querySelector('[data-hospitation-dashboard-card="locations"]');
    return Boolean(locations && sectors && (locations.compareDocumentPosition(sectors) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await dashboard.locator("[data-hospitation-dashboard-reset-layout]").click();
  await expect(sectorCard).toHaveClass(/hospitation-dashboard-card--span-4/);
  await expect(locationCard).toHaveClass(/hospitation-dashboard-card--span-8/);
  await expect(dashboardQuoteCard).toHaveClass(/hospitation-dashboard-card--span-8/);
  await expect(locationCard).toContainText("Regionale Verteilung");
  await expect(locationCard.locator(".hospitation-dashboard-location-map-svg")).toBeVisible();
  await expect.poll(async () => locationCard.locator(".hospitation-dashboard-location-state").count()).toBeGreaterThan(0);
  await expect(observationsCard).toHaveClass(/hospitation-dashboard-card--span-6/);
  await layoutButton.click();
  await expect(layoutButton).not.toHaveClass(/is-active/);
  await expect(sectorCard).toHaveAttribute("draggable", "false");
  await expect.poll(async () => dashboard.evaluate(() => {
    const sectors = document.querySelector('[data-hospitation-dashboard-card="sectors"]');
    const quotes = document.querySelector('[data-hospitation-dashboard-card="quotes"]');
    const locations = document.querySelector('[data-hospitation-dashboard-card="locations"]');
    const observations = document.querySelector('[data-hospitation-dashboard-card="observations"]');
    const quality = document.querySelector('[data-hospitation-dashboard-card="quality"]');
    return Boolean(
      sectors &&
      quotes &&
      locations &&
      observations &&
      quality &&
      (sectors.compareDocumentPosition(locations) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (locations.compareDocumentPosition(quotes) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (quotes.compareDocumentPosition(quality) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (quality.compareDocumentPosition(observations) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  })).toBe(true);
  const topicsAccordion = dashboard.locator('[data-hospitation-dashboard-accordion="topics"]');
  const freeTextAccordion = dashboard.locator('[data-hospitation-dashboard-accordion="free-text-terms"]');
  const productsAccordion = dashboard.locator('[data-hospitation-dashboard-accordion="affected-products"]');
  const processAccordion = dashboard.locator('[data-hospitation-dashboard-accordion="process-phases"]');
  const observationsAccordion = dashboard.locator('[data-hospitation-dashboard-accordion="observations"]');
  const problemTypesAccordion = dashboard.locator('[data-hospitation-dashboard-accordion="problem-types"]');
  const removedSignalPattern = /muster|hypothese|evidenz|roadmap|impuls/i;
  const problemTypeFilterOptions = await dashboard.locator('[data-hospitation-dashboard-filter="problemType"] option').allTextContents();
  expect(problemTypeFilterOptions).not.toEqual(expect.arrayContaining([expect.stringMatching(removedSignalPattern)]));
  await expect(dashboard.locator(".hospitation-dashboard-accordion-card.hospitation-dashboard-card--span-6")).toHaveCount(6);
  await expect(dashboard.locator(".hospitation-dashboard-accordion-card.hospitation-dashboard-card--span-3")).toHaveCount(0);
  await expect(dashboard.locator(".hospitation-dashboard-accordion-card.hospitation-dashboard-card--span-4")).toHaveCount(0);
  await expect(topicsAccordion).not.toHaveAttribute("open", "");
  await expect(freeTextAccordion).not.toHaveAttribute("open", "");
  await expect(productsAccordion).not.toHaveAttribute("open", "");
  await expect(processAccordion).not.toHaveAttribute("open", "");
  await expect(observationsAccordion).toHaveAttribute("open", "");
  await expect(problemTypesAccordion).not.toHaveAttribute("open", "");
  await expect(topicsAccordion.locator("summary")).toContainText("Wiederkehrende Themen");
  await expect(freeTextAccordion.locator("summary")).toContainText("Freitext-Begriffe");
  await expect(productsAccordion.locator("summary")).toContainText("Betroffene Produkte");
  await expect(processAccordion.locator("summary")).toContainText("Auffällige Prozessphasen");
  await expect(observationsAccordion.locator("summary")).toContainText("Beobachtungen");
  await expect(problemTypesAccordion.locator("summary")).toContainText("Problemtypen");
  const visibleProblemTypeLabels = await problemTypesAccordion.locator(".hospitation-dashboard-topic__label").allTextContents();
  expect(visibleProblemTypeLabels).not.toEqual(expect.arrayContaining([expect.stringMatching(removedSignalPattern)]));
  const visibleWordCloudTerms = await freeTextAccordion.locator(".hospitation-dashboard-word").allTextContents();
  expect(visibleWordCloudTerms).not.toEqual(expect.arrayContaining([expect.stringMatching(removedSignalPattern)]));
  await expect(topicsAccordion.locator(".hospitation-dashboard-accordion-body")).toBeHidden();
  await expect(freeTextAccordion.locator(".hospitation-dashboard-accordion-body")).toBeHidden();
  await expect(productsAccordion.locator(".hospitation-dashboard-accordion-body")).toBeHidden();
  await expect(processAccordion.locator(".hospitation-dashboard-accordion-body")).toBeHidden();
  await expect(observationsAccordion.locator(".hospitation-dashboard-accordion-body")).toBeVisible();
  await expect(problemTypesAccordion.locator(".hospitation-dashboard-accordion-body")).toBeHidden();
  await expect(observationsAccordion).toHaveClass(/hospitation-dashboard-evidence-linked-card/);
  await expect(observationsAccordion.locator(".hospitation-dashboard-card-info")).toHaveCount(0);
  await expect(observationsAccordion.locator('button[data-hospitation-dashboard-detail="observations"]')).toBeVisible();
  await expect(observationsAccordion.locator('button[data-hospitation-dashboard-detail="observations"]')).toHaveText("Alle anzeigen");
  await expect(observationsAccordion.locator('summary button[data-hospitation-dashboard-detail="observations"]')).toHaveCount(0);
  await expect(observationsAccordion.locator('.hospitation-dashboard-accordion-footer button[data-hospitation-dashboard-detail="observations"]')).toBeVisible();
  await expect(observationsAccordion.locator(".hospitation-dashboard-preview-total")).toContainText(/^\d+\/\d+$/);
  await expect(observationsAccordion.locator(".hospitation-dashboard-preview-total")).not.toContainText("sichtbar");
  await expect(observationsAccordion.locator("summary .hospitation-dashboard-section-label")).toHaveCount(0);
  await expect.poll(async () => dashboard.evaluate(() => {
    const topics = document.querySelector('[data-hospitation-dashboard-accordion="topics"]');
    const freeText = document.querySelector('[data-hospitation-dashboard-accordion="free-text-terms"]');
    const products = document.querySelector('[data-hospitation-dashboard-accordion="affected-products"]');
    const process = document.querySelector('[data-hospitation-dashboard-accordion="process-phases"]');
    const problemTypes = document.querySelector('[data-hospitation-dashboard-accordion="problem-types"]');
    const observations = document.querySelector('[data-hospitation-dashboard-card="observations"]');
    return Boolean(
      topics &&
      freeText &&
      products &&
      process &&
      problemTypes &&
      observations &&
      (observations.compareDocumentPosition(topics) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (topics.compareDocumentPosition(freeText) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (freeText.compareDocumentPosition(products) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (products.compareDocumentPosition(process) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (process.compareDocumentPosition(problemTypes) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  })).toBe(true);
  const dashboardTopicLabels = await topicsAccordion.locator(".hospitation-dashboard-topic__label").evaluateAll((labels) =>
    labels.map((label) => label.textContent?.trim() || "").filter(Boolean)
  );
  expect(dashboardTopicLabels).not.toContain("Hospitation");
  expect(dashboardTopicLabels).not.toContain("Versorgungskontakt");
  expect(dashboardTopicLabels).not.toContain("Dokumentations-Tag");
  expect(dashboardTopicLabels).not.toContain("weiter validieren");
  expect(dashboardTopicLabels).not.toContain("Roadmap prüfen");
  const dashboardProductLabels = await productsAccordion.locator(".hospitation-dashboard-topic__label").evaluateAll((labels) =>
    labels.map((label) => label.textContent?.trim() || "").filter(Boolean)
  );
  expect(dashboardProductLabels).toContain("ePA für alle");
  expect(dashboardProductLabels).toContain("KIM");
  const liveQuoteKpi = dashboard.locator(".hospitation-dashboard-kpi-card", { hasText: "Zitate" }).first();
  await expect(liveQuoteKpi.locator(".hospitation-dashboard-kpi-card__value")).toHaveText("1");
  await expect(liveQuoteKpi.locator(".hospitation-dashboard-kpi-card__meta")).toHaveText("wörtlich dokumentiert");
  await expect(liveQuoteKpi).not.toContainText("Bilder");
  await expect(dashboard).not.toContainText("Demo-Preview");
  await expect(dashboard).not.toContainText("gepflegte Demo-Hospitationen");
  await expect(dashboard.locator(".hospitation-dashboard-kpi-card", { hasText: "Hospitationen" }).first()).toContainText("13");
  await expect(dashboard.locator('[data-hospitation-dashboard-card="observation-signals"], [data-hospitation-dashboard-card="observation-patterns"], [data-hospitation-dashboard-card="readiness"], [data-hospitation-dashboard-card="epic-funnel"], [data-hospitation-dashboard-card="roadmap-review"], [data-hospitation-dashboard-card="relevance-hints"]')).toHaveCount(0);
  await expect.poll(async () => locationCard.locator(".hospitation-dashboard-location-point").count()).toBeGreaterThan(10);
  await expect(locationCard.locator(".hospitation-dashboard-location-legend-values").first()).toBeVisible();
  await expect(locationCard.locator(".hospitation-dashboard-location-legend-count").first()).toBeVisible();
  await expect(locationCard.locator(".hospitation-dashboard-location-legend-share").first()).toContainText("%");
  const demoLocationSectorCount = await locationCard.locator(".hospitation-dashboard-location-point").evaluateAll((points) =>
    new Set(points.map((point) => point.getAttribute("data-sector")).filter(Boolean)).size
  );
  expect(demoLocationSectorCount).toBeGreaterThan(1);
  const firstLocationPoint = locationCard.locator(".hospitation-dashboard-location-point").first();
  const firstLocationSector = await firstLocationPoint.getAttribute("data-sector");
  await firstLocationPoint.click();
  const locationTooltip = locationCard.locator("[data-hospitation-dashboard-location-tooltip]");
  await expect(locationTooltip).toBeVisible();
  await expect(locationTooltip.locator("strong")).not.toHaveText("");
  if (firstLocationSector) await expect(locationTooltip).toContainText(firstLocationSector);
  const protectedQuoteCards = dashboard.locator("[data-hospitation-dashboard-quote-card]");
  await expect(protectedQuoteCards).toHaveCount(1);
  await expect(dashboard.locator(".hospitation-dashboard-quotes-card")).toContainText("1 von 1");
  const observationDashboardCard = dashboard.locator('[data-hospitation-dashboard-card="observations"]');
  const demoObservationCards = observationDashboardCard.locator("[data-hospitation-dashboard-observation-card]");
  await expect(demoObservationCards.first()).toBeVisible();
  await expect(demoObservationCards.first().locator(".hospitation-dashboard-observation-avatar")).toBeVisible();
  await expect(demoObservationCards.first().locator(".hospitation-dashboard-observation-owner-name")).not.toHaveText("");
  await expect(observationDashboardCard).not.toContainText("Dokumentiert von");
  await expect(demoObservationCards.first().getByRole("button", { name: "Öffnen" })).toBeVisible();
  await expect(observationDashboardCard.locator(".hospitation-dashboard-observation-type")).toHaveCount(0);
  await expect(observationDashboardCard.locator(".hospitation-dashboard-observation-meta")).toHaveCount(0);
  const observationColumns = await observationDashboardCard.locator(".hospitation-dashboard-observation-list").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
  );
  expect(observationColumns).toBe(1);
  const observationAccent = await demoObservationCards.first().evaluate((card) => getComputedStyle(card).borderLeftColor);
  expect(observationAccent).not.toBe("rgba(0, 0, 0, 0)");
  const observationTypography = await demoObservationCards.first().evaluate((card) => {
    const title = card.querySelector(".hospitation-dashboard-observation-title");
    const text = card.querySelector(".hospitation-dashboard-observation-text");
    return {
      title: title ? getComputedStyle(title).fontSize : "",
      text: text ? getComputedStyle(text).fontSize : ""
    };
  });
  expect(observationTypography.title).not.toBe("");
  expect(observationTypography.text).not.toBe("");
  await observationDashboardCard.locator('button[data-hospitation-dashboard-detail="observations"]').click();
  const observationDialog = page.getByRole("dialog", { name: "Alle Beobachtungen" });
  await expect(observationDialog).toBeVisible();
  await expect.poll(async () => observationDialog.locator("[data-hospitation-dashboard-detail-row]").count()).toBeGreaterThan(5);
  await expect(observationDialog).toContainText("Hospitation öffnen");
  await observationDialog.getByRole("button", { name: "Schließen" }).click();
  await expect(observationDialog).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /Alle Muster|Alle Hypothesen|Alle Evidenzhinweise/ })).toHaveCount(0);
  await dashboardQuoteCard.locator('button[data-hospitation-dashboard-detail="quotes"]').click();
  const quoteDialog = page.getByRole("dialog", { name: "Alle Zitate" });
  await expect(quoteDialog).toBeVisible();
  await expect(quoteDialog.locator("[data-hospitation-dashboard-detail-row]")).toHaveCount(1);
  await quoteDialog.getByRole("button", { name: "Schließen" }).click();
  await expect(quoteDialog).toHaveCount(0);
  await expect(dashboard).toContainText("Wiederkehrende Themen");
  await expect(dashboard).not.toContainText("(Hypothesen auf dem Weg zur Evidenz)");
  const protectedTopicLabels = await topicsAccordion.locator(".hospitation-dashboard-topic__label").evaluateAll((labels) =>
    labels.map((label) => label.textContent?.trim() || "").filter(Boolean)
  );
  expect(protectedTopicLabels).toContain("Befundtransfer");
  expect(protectedTopicLabels).not.toContain("weiter validieren");
  expect(protectedTopicLabels).not.toContain("Roadmap prüfen");
  expect(protectedTopicLabels).not.toContain("Roadmap-Kandidat");
  const protectedProductLabels = await productsAccordion.locator(".hospitation-dashboard-topic__label").evaluateAll((labels) =>
    labels.map((label) => label.textContent?.trim() || "").filter(Boolean)
  );
  expect(protectedProductLabels).toContain("ePA für alle");
  expect(protectedProductLabels).toContain("KIM");
  expect(protectedTopicLabels).not.toContain("Dokumentations-Tag");
  await expect(dashboard).not.toContainText("Echte Dokumentationen");
});

test("Karte: Kartenansicht und Controls rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#map");
  const mapFrame = page.frameLocator("#map-view-frame");

  await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
  await expect(mapFrame.locator("#map")).toBeVisible();
  await expect(mapFrame.locator(".cat-marker").first()).toBeVisible({ timeout: 20_000 });
  await expect(mapFrame.locator(".map-box > .map-controls")).toHaveCount(0);
  await expect(mapFrame.locator(".panel .body .map-controls--legacy")).toBeHidden();
  if (testInfo.project.name.includes("mobile")) {
    await expect(mapFrame.locator(".mobile-map-filter-bar")).toBeVisible();
    await expect(mapFrame.locator(".mobile-map-quick-filters")).toBeVisible();
    await expect(mapFrame.locator("#mobile-sector-filter")).toBeVisible();
    await expect(mapFrame.locator("#mobile-state-filter")).toBeVisible();
    const [sectorBox, stateBox] = await Promise.all([
      mapFrame.locator("#mobile-sector-filter").boundingBox(),
      mapFrame.locator("#mobile-state-filter").boundingBox()
    ]);
    expect(sectorBox).not.toBeNull();
    expect(stateBox).not.toBeNull();
    expect(Math.abs(sectorBox.y - stateBox.y)).toBeLessThanOrEqual(1);
    expect(stateBox.x).toBeGreaterThanOrEqual(sectorBox.x + sectorBox.width);
    await expect(mapFrame.locator(".mobile-filter-open")).toHaveCount(0);
    await expect(mapFrame.locator("#mobile-filter-sheet")).toHaveCount(0);

    const sectorMenu = mapFrame.locator("#mobile-sector-filter + .map-filter-menu");
    const stateMenu = mapFrame.locator("#mobile-state-filter + .map-filter-menu");
    const ownerMenu = mapFrame.locator("#mobile-owner-filter + .map-filter-menu");
    await mapFrame.locator("#mobile-sector-filter").click();
    await expect(mapFrame.locator("#mobile-sector-filter")).toHaveAttribute("aria-expanded", "true");
    await expect(sectorMenu).toBeVisible();
    await mapFrame.locator("#mobile-state-filter").click();
    await expect(sectorMenu).toBeHidden();
    await expect(stateMenu).toBeVisible();
    await stateMenu.getByRole("option", { name: "Berlin", exact: true }).click();
    await expect(mapFrame.locator("#mobile-state-filter")).toHaveText("Berlin");
    await mapFrame.locator("#mobile-owner-filter").click();
    await expect(ownerMenu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ownerMenu).toBeHidden();

    await mapFrame.locator("#mobile-state-filter").click();
    await stateMenu.getByRole("option", { name: "Alle", exact: true }).click();
    await expect(mapFrame.locator("#mobile-state-filter")).toHaveAccessibleName("Alle");
    await expect(mapFrame.locator("#points-toggle")).toHaveAttribute("aria-pressed", "true");
    const [mapBox, modeBox, zoomBox] = await Promise.all([
      mapFrame.locator("#map").boundingBox(),
      mapFrame.locator(".map-mode-controls").boundingBox(),
      mapFrame.locator(".leaflet-control-zoom").boundingBox()
    ]);
    expect(mapBox).not.toBeNull();
    expect(modeBox).not.toBeNull();
    expect(zoomBox).not.toBeNull();
    expect(modeBox.y + modeBox.height).toBeLessThanOrEqual(mapBox.y);
    expect(zoomBox.y).toBeGreaterThanOrEqual(mapBox.y);
    await mapFrame.locator("#heatmap-toggle").click();
    await expect(mapFrame.locator("#heatmap-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(mapFrame.locator("#points-toggle")).toHaveAttribute("aria-pressed", "false");
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(mapFrame.locator("#map")).toBeVisible();
      await expect(mapFrame.locator(".mobile-map-quick-filters")).toBeVisible();
      const horizontalOverflow = await mapFrame.locator("html").evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
    }
  } else {
    await expect(mapFrame.locator("#filters")).toBeVisible();
    await expect(mapFrame.locator("#filters .map-filter-dropdown")).toHaveCount(3);
    await expect(mapFrame.locator("#filters .map-filter-trigger").first()).toBeVisible();
    await mapFrame.locator(".cat-marker").first().hover();
    await expect(mapFrame.locator(".map-point-tooltip")).toBeVisible();
  }
  await expect(mapFrame.locator(".panel")).toBeVisible();

  await attachScreenshot(page, testInfo, "karte");
});

test("Rollen: Viewer sieht Admin-Bereiche nicht", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "viewer" });
  await openMobileSidebarIfNeeded(page);

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator("#sidebar-import-button")).toHaveCount(0);
  await expect(page.locator("#sidebar-activities-button")).toBeHidden();
  await expect(page.locator("#sidebar-administration-section")).toHaveCount(0);
  await expect(page.locator('[data-profile-tab="imports"]')).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator('[data-sidebar-section="admin"]')).toHaveCount(0);
  await expect(page.locator("#archive-view-button")).toBeHidden();

  await attachScreenshot(page, testInfo, "viewer-rolle");
});

test("Rollen: Admin sieht Import und Archiv", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });
  await openMobileSidebarIfNeeded(page);

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator("#sidebar-administration-section")).toHaveCount(0);
  await expect(page.locator("#archive-view-button")).toHaveAttribute("aria-hidden", "false");
  if (!testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#archive-view-button")).toBeVisible();
  }
  await expect(page.locator('[data-sidebar-section="admin"]')).toHaveCount(0);
  await expect(page.locator("#sidebar-import-button")).toHaveCount(0);
  await expect(page.locator('[data-profile-tab="imports"]')).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#sidebar-activities-button")).toBeVisible();

  await attachScreenshot(page, testInfo, "admin-rolle");
});

test("Sidebar: Team und Profil bleiben bei kurzer Höhe erreichbar", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name.includes("mobile");
  await page.setViewportSize(isMobile
    ? { width: 390, height: 460 }
    : { width: 1440, height: 460 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });

  const sidebar = page.locator(".app-sidebar");
  const sidebarNav = page.locator(".sidebar-nav");
  const accountSection = page.locator(".sidebar-account-section");
  await expect(sidebar).toBeVisible();

  if (isMobile) {
    await expect(sidebarNav).toBeHidden();
    await page.locator("#sidebar-collapse-button").click();
    await expect(sidebarNav).toBeVisible();
    await expect(sidebar).toHaveCSS("overflow-y", "hidden");
    await expect(sidebarNav).toHaveCSS("overflow-y", "auto");
    const mobileScrollMetrics = await sidebarNav.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop
      };
    });
    expect(mobileScrollMetrics.scrollHeight).toBeGreaterThan(mobileScrollMetrics.clientHeight);
    expect(mobileScrollMetrics.scrollTop).toBeGreaterThan(0);
    await expect(accountSection).toBeInViewport();
  } else {
    const scrollMetrics = await sidebarNav.evaluate((element) => {
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
    await expect(sidebar).toHaveCSS("overflow-y", "hidden");
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    expect(scrollMetrics.scrollTop).toBeGreaterThan(0);

    const accountTopBefore = await accountSection.evaluate((element) => element.getBoundingClientRect().top);
    await sidebarNav.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const accountTopAfter = await accountSection.evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(accountTopAfter - accountTopBefore)).toBeLessThanOrEqual(1);
  }

  await expect(page.locator("#sidebar-profile-button")).toBeInViewport();
  await page.locator("#sidebar-profile-button").click();
  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();

  if (isMobile) {
    await page.locator("#sidebar-collapse-button").click();
    await page.locator("#sidebar-team-button").scrollIntoViewIfNeeded();
  } else {
    await sidebarNav.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  }
  await page.locator("#sidebar-team-button").click();
  await expect(page.locator('[data-view-panel="team"]')).toBeVisible();

  await attachScreenshot(page, testInfo, "sidebar-scroll");
});

test("Mein Profil: Importe sind als eigener Admin-Reiter erreichbar", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#profile-imports:registrations", { role: "admin" });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator('[data-view-panel="settings"]')).toBeHidden();
  await expect(page.locator('[data-profile-tab="imports"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-tab-imports")).toBeVisible();
  await expect(page.locator("#profile-tab-imports > .settings-workspace")).toBeVisible();
  await expect(page.locator('[data-settings-tab="registrations"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#registrations-section")).toBeVisible();
  await expect(page.locator("#sidebar-import-button")).toHaveCount(0);

  await page.locator('[data-settings-tab="imports"]').click();
  await expect(page).toHaveURL(/#profile-imports:imports$/);
  await expect(page.locator("#settings-tab-imports")).toBeVisible();

  await attachScreenshot(page, testInfo, "profil-importe");
});

test("Mein Profil: Einstellungen sind als Profil-Reiter erreichbar", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#profile-settings", { role: "admin" });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator("#sidebar-settings-button")).toHaveCount(0);
  await expect(page.locator("#sidebar-about-button")).toHaveCount(0);
  await expect(page.locator('[data-profile-tab="settings"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-tab-settings")).toBeVisible();
  await expect(page.locator("#profile-tab-settings .settings-wip-note")).toBeVisible();

  await attachScreenshot(page, testInfo, "profil-einstellungen");
});

test("Mein Profil: Über die App ist als Profil-Reiter erreichbar", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#profile-about", { role: "admin" });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator('[data-profile-tab="about"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-tab-about")).toBeVisible();
  await expect(page.locator("#profile-tab-about .about-intro__highlight")).toContainText("verbindet Menschen");
  await expect(page.locator("#profile-tab-about .about-topic")).toHaveCount(6);
  await expect(page.locator("#profile-tab-about")).not.toContainText("Changelog");

  await attachScreenshot(page, testInfo, "profil-about");
});

test("Mein Profil: Changelog ist als Profil-Reiter erreichbar", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#profile-changelog", { role: "admin" });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator('[data-profile-tab="changelog"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-tab-changelog")).toBeVisible();
  const latestRelease = page.locator("#about-version-list .about-version").first();
  await expect(latestRelease).toBeVisible();
  await expect(latestRelease.locator(".about-version__badge")).toHaveText("0.20");
  await expect(latestRelease.locator("summary")).toContainText("Gemeinsam sicher vernetzt");
  await latestRelease.locator("summary").click();
  await expect(latestRelease.locator(".about-version__body")).toContainText("Was sich für Anwender geändert hat");

  await attachScreenshot(page, testInfo, "profil-changelog");
});

test("Hospitation: kompatible Planungsroute bleibt erhalten", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#planning");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "framework");
  await expect(page.locator('[data-view-panel="framework"]')).toBeVisible();
  await expect(page.locator('[data-sidebar-section="planning"]')).toHaveClass(/is-active-section/);
  await expect(page.locator('[data-sidebar-section-toggle="planning"]')).toContainText("Hospitation");
});

for (const role of ["admin", "editor", "viewer"]) {
  test(`Mein Profil: Onboarding-Tour ist für ${role} startbar`, async ({ page }) => {
    await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html", { role });
    const expectedAllowedPermissions = role === "admin" ? 9 : role === "editor" ? 5 : 2;

    await expect(page.locator('[data-sidebar-section="planning"]')).toHaveAttribute("aria-label", "Hospitation");
    await expect(page.locator('[data-sidebar-section-toggle="planning"]')).toContainText("Hospitation");
    await openMobileSidebarIfNeeded(page);
    await expect(page.locator("#sidebar-tour-button")).toBeVisible();
    await expect(page.locator("#sidebar-tour-button")).toHaveAttribute("aria-label", "App-Tour starten");
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
    await expect(page.locator("#product-tour-meta")).toHaveText(`Willkommen · Schritt 1 von ${role === "admin" ? 17 : 15}`);
    await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", "welcome");
    await expect(page.locator("#product-tour-title")).toHaveText("Willkommen bei #Mitmachen");
    await expectTourPanelInteractive(page);
    await page.locator("#product-tour-skip").click();
    await expect(page.locator("#product-tour")).toBeHidden();
  });
}

test("Produkttour: Sidebar-Einstieg startet mit #Mitmachen und bewahrt den Arbeitskontext", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#framework", { role: "editor" });

  await expect(page.locator('[data-view-panel="framework"]')).toBeVisible();
  await openMobileSidebarIfNeeded(page);
  await page.locator("#sidebar-tour-button").click();

  await expect(page.locator("#product-tour-title")).toHaveText("Willkommen bei #Mitmachen");
  await expect(page.locator("#product-tour-copy")).toContainText("Menschen, Beobachtungen und Wissen");
  await expect(page.locator("#product-tour-details")).toContainText("Vernetzen");
  await expect(page.locator("#product-tour-details")).toContainText("Verstehen");
  await expect(page.locator("#product-tour-details")).toContainText("Gestalten");
  await expect(page.locator("#product-tour-details li")).toHaveCount(3);
  await expect(page.locator(".product-tour__brand-copy")).toContainText("Versorgungs-Kompass");
  await expect(page.locator("#product-tour-step-icon")).toHaveText("✦");
  await expect(page.locator("#product-tour")).toHaveClass(/is-welcome/);
  const welcomeBackdropFilter = await page.locator("#product-tour-backdrop").evaluate((element) => getComputedStyle(element).backdropFilter || getComputedStyle(element).webkitBackdropFilter);
  expect(welcomeBackdropFilter).toContain("blur(18px)");
  await expect(page.locator(".product-tour-highlight")).toHaveCount(0);
  await expect(page).toHaveURL(/#framework$/);
  await attachScreenshot(page, testInfo, "product-tour-welcome", { fullPage: false });

  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#product-tour-next")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#product-tour-skip")).toBeFocused();

  await page.locator("#product-tour-next").click();
  await expect(page.locator("#product-tour-title")).toHaveText("Dein Profil ist der Ausgangspunkt");
  await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", "profile");
  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator('[data-sidebar-section="account"]')).toHaveClass(/product-tour-sidebar-section/);
  await expect(page.locator("#sidebar-profile-button")).toHaveClass(/product-tour-sidebar-page/);
  await expect(page.locator("#product-tour-details li")).toHaveCount(2);
  await expect(page.locator("#product-tour")).not.toHaveClass(/is-welcome/);
  await expect(page.locator(".product-tour-highlight")).toHaveCount(1);
  await page.locator("#product-tour-next").click();
  await expect(page.locator("#product-tour-title")).toHaveText("Orientierung in der Sidebar");
  await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", "sidebar-orientation");
  await expect(page.locator("#product-tour-copy")).toContainText("Hospitation");
  await expect(page.locator(".product-tour-highlight")).toHaveCount(1);
  await expect(page.locator('[data-sidebar-section="care"]')).toHaveClass(/product-tour-sidebar-section/);
  await page.locator("#product-tour-next").click();
  await expect(page.locator("#product-tour-title")).toHaveText("Teamprofile machen Zusammenarbeit transparent");
  await expect(page.locator('[data-view-panel="team"]')).toBeVisible();
  await expect(page.locator("#product-tour-copy")).toContainText("Ansprechperson");
  await expect(page).toHaveURL(/#framework$/);

  await page.locator("#product-tour-skip").click();
  await expect(page.locator("#product-tour")).toBeHidden();
  await expect(page.locator('[data-view-panel="framework"]')).toBeVisible();
  await expect(page).toHaveURL(/#framework$/);
});

test("Produkttour: Admin-Schritte bleiben sichtbar und bedienbar", async ({ page }) => {
  test.slow();
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html", { role: "admin" });
  await openMobileSidebarIfNeeded(page);
  await page.locator("#sidebar-profile-button").click();
  await page.locator("#profile-tour-start").click();

  const expectedTitles = [
    "Willkommen bei #Mitmachen",
    "Dein Profil ist der Ausgangspunkt",
    "Orientierung in der Sidebar",
    "Teamprofile machen Zusammenarbeit transparent",
    "Deutschlandkarte: Versorgung regional verstehen",
    "Kontakte finden, filtern und gemeinsam pflegen",
    "Spalten sortieren und direkt filtern",
    "Kontaktprofil: Beziehungen und Verlauf verstehen",
    "Organisationen bündeln Kontakte und Strukturen",
    "Von Beobachtung zum nächsten Schritt",
    "Hospitationen gemeinsam vorbereiten und begleiten",
    "Der Fragebogen strukturiert das Erlebte",
    "Formate bringen die richtigen Menschen zusammen",
    "Versorgungs-Forum Krankenhausentlassbrief öffnen",
    "Eine Beispielaktivität zeigt den gemeinsamen Verlauf",
    "Auswertung und Datenqualität steuern die Pflege",
    "Bereit für den Versorgungs-Kompass"
  ];

  const expectedIds = [
    "welcome",
    "profile",
    "sidebar-orientation",
    "team",
    "map",
    "contacts",
    "contacts-table",
    "contact-profile",
    "organizations",
    "hospitation-framework",
    "hospitation-appointments",
    "hospitation-questionnaire",
    "formats",
    "format-detail",
    "activities",
    "analytics",
    "finish"
  ];

  for (const [index, title] of expectedTitles.entries()) {
    await expect(page.locator("#product-tour-title")).toHaveText(title);
    await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", expectedIds[index]);
    await expect(page.locator("#product-tour-meta")).toHaveText(`${index === 0 ? "Willkommen · " : expectedIds[index] === "finish" ? "Abschluss · " : ""}Schritt ${index + 1} von ${expectedTitles.length}`);
    const tourCopy = (await page.locator("#product-tour-copy").textContent())?.trim() || "";
    expect(tourCopy.length).toBeGreaterThan(70);
    expect(await page.locator("#product-tour-details li").count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator("#product-tour-step-icon")).not.toHaveText("");
    await expectTourPanelInteractive(page);
    await expectTourPanelInsideViewport(page);
    if (index > 0 && expectedIds[index] !== "finish") {
      await expectTourSpotlightInsideViewport(page);
      await expectTourPanelClearOfSpotlight(page);
      await expectTourTargetDescribed(page, expectedIds[index]);
    }

    if (title === "Deutschlandkarte: Versorgung regional verstehen") {
      await expect(page.locator('[data-view-panel="map"]')).toBeVisible();
      await expect(page.frameLocator("#map-view-frame").locator("#map")).toBeVisible();
      if ((page.viewportSize()?.width || 0) <= 760) {
        await expect(page.frameLocator("#map-view-frame").locator(".map-mode-controls")).toHaveClass(/product-tour-highlight/);
      } else {
        const frameBox = await page.locator("#map-view-frame").boundingBox();
        const mapBox = await page.frameLocator("#map-view-frame").locator("#map").boundingBox();
        const spotlightBox = await page.locator("#product-tour-spotlight").boundingBox();
        expect(frameBox).toBeTruthy();
        expect(mapBox).toBeTruthy();
        expect(spotlightBox).toBeTruthy();
        expect(Math.abs(spotlightBox.x - Math.max(8, mapBox.x - 4))).toBeLessThanOrEqual(12);
        expect(Math.abs(spotlightBox.width - (mapBox.width + 8))).toBeLessThanOrEqual(14);
        expect(spotlightBox.height).toBeLessThanOrEqual(mapBox.height + 10);
      }
    }
    if (title === "Von Beobachtung zum nächsten Schritt") await expect(page.locator('[data-view-panel="framework"]')).toBeVisible();
    if (title === "Von Beobachtung zum nächsten Schritt") await expect(page.locator("#product-tour-copy")).toContainText("Beobachtung → Muster → Hypothese → Nächster Schritt");
    if (title === "Hospitationen gemeinsam vorbereiten und begleiten") await expect(page.locator("#hospitation-list .hospitation-row").first()).toHaveClass(/product-tour-highlight/);
    if (title === "Spalten sortieren und direkt filtern") {
      if (await page.evaluate(() => matchMedia("(max-width: 760px)").matches)) {
        await expect(page.locator("#contact-list .mobile-contact-card").first()).toHaveClass(/product-tour-highlight/);
      } else {
        await expect(page.locator("#contacts-table-head [data-contact-sort]")).toHaveCount(8);
        await expect(page.locator("#contacts-table-head [data-header-filter-button]")).not.toHaveCount(0);
      }
    }
    if (title === "Der Fragebogen strukturiert das Erlebte") {
      await expect(page.locator("#view-questionnaire .questionnaire-toolbar")).toBeVisible();
      await expect(page.locator("#view-questionnaire [data-questionnaire-section][open]")).toHaveCount(0);
    }
    if (title === "Versorgungs-Forum Krankenhausentlassbrief öffnen") {
      const openFormat = page.locator("#format-detail-panel .format-detail.is-open");
      await expect(openFormat).toBeVisible();
      await expect(openFormat).toContainText("Versorgungs-Forum Krankenhausentlassbrief");
      await expect(openFormat.locator(".format-tabs")).toBeVisible();
    }
    if (title === "Eine Beispielaktivität zeigt den gemeinsamen Verlauf") await expect(page.locator("#activities-list .activity-item").first()).toHaveClass(/product-tour-highlight/);
    if (title === "Auswertung und Datenqualität steuern die Pflege") await expect(page.locator('[data-view-panel="analytics"]')).toBeVisible();
    if (title === "Bereit für den Versorgungs-Kompass") {
      await expect(page.locator("#product-tour")).toHaveClass(/is-welcome/);
      await expect(page.locator(".product-tour-highlight")).toHaveCount(0);
      await expect(page.locator("#product-tour-meta")).toContainText("Abschluss");
    }

    await page.locator("#product-tour-next").click();
  }

  await expect(page.locator("#product-tour")).toBeHidden();
  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
});

for (const role of ["editor", "viewer"]) {
  test(`Produkttour: ${role} durchläuft alle freigegebenen Schritte`, async ({ page }) => {
    await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role });
    await openMobileSidebarIfNeeded(page);
    await page.locator("#sidebar-tour-button").click();
    const expectedIds = [
      "welcome",
      "profile",
      "sidebar-orientation",
      "team",
      "map",
      "contacts",
      "contacts-table",
      "contact-profile",
      "organizations",
      "hospitation-framework",
      "hospitation-appointments",
      "hospitation-questionnaire",
      "formats",
      "format-detail",
      "finish"
    ];

    for (const [index, stepId] of expectedIds.entries()) {
      await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", stepId);
      await expect(page.locator("#product-tour-meta")).toHaveText(`${index === 0 ? "Willkommen · " : stepId === "finish" ? "Abschluss · " : ""}Schritt ${index + 1} von ${expectedIds.length}`);
      await expectTourPanelInsideViewport(page);
      if (index > 0 && stepId !== "finish") {
        await expectTourSpotlightInsideViewport(page);
        await expectTourPanelClearOfSpotlight(page, 0, `${role}:${stepId}`);
        await expectTourTargetDescribed(page, stepId);
      }
      await page.locator("#product-tour-next").click();
    }

    await expect(page.locator("#product-tour")).toBeHidden();
    await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();
  });
}

test("Produkttour: alle Schritte bleiben bei 320 px, Tablet und Desktop kollisionsfrei", async ({ page }, testInfo) => {
  test.slow();
  test.skip(testInfo.project.name.includes("mobile"), "Die Viewport-Matrix wird einmal vollständig im Desktop-Projekt ausgeführt.");
  const expectedIds = [
    "welcome", "profile", "sidebar-orientation", "team", "map", "contacts", "contacts-table", "contact-profile", "organizations",
    "hospitation-framework", "hospitation-appointments", "hospitation-questionnaire", "formats", "format-detail",
    "activities", "analytics", "finish"
  ];
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#framework", { role: "admin" });
    await openMobileSidebarIfNeeded(page);
    await page.locator("#sidebar-tour-button").click();
    for (const [index, stepId] of expectedIds.entries()) {
      await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", stepId);
      await expectTourPanelInsideViewport(page);
      if (index > 0 && stepId !== "finish") {
        await expectTourSpotlightInsideViewport(page);
        await expectTourPanelClearOfSpotlight(page, 0, `${viewport.width}x${viewport.height}:${stepId}`);
      }
      if (viewport.width === 320 && ["team", "map", "contacts-table", "hospitation-framework", "format-detail"].includes(stepId)) {
        await attachScreenshot(page, testInfo, `product-tour-${stepId}-320`, { fullPage: false });
      }
      await page.locator("#product-tour-next").click();
    }
    await expect(page.locator("#product-tour")).toBeHidden();
  }
});

test("Produkttour: fehlendes und verspätet geladenes Ziel werden robust behandelt", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "viewer" });
  await openMobileSidebarIfNeeded(page);
  await page.locator("#sidebar-tour-button").click();
  await page.evaluate(() => {
    const target = document.querySelector("#profile-tab-profile .profile-hero");
    if (!target) return;
    const markup = target.outerHTML;
    target.remove();
    window.setTimeout(() => document.querySelector("#profile-tab-profile")?.insertAdjacentHTML("afterbegin", markup), 700);
  });
  await page.locator("#product-tour-next").click();
  await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", "profile");
  await expect(page.locator("#product-tour-spotlight")).toBeHidden();
  await expectTourPanelInsideViewport(page);
  await expect(page.locator("#profile-tab-profile .profile-hero")).toHaveClass(/product-tour-highlight/, { timeout: 3_000 });
  await expect(page.locator("#profile-tab-profile .profile-hero")).toHaveAttribute("aria-describedby", /product-tour-copy/);
  await expectTourSpotlightInsideViewport(page);
  await expectTourPanelClearOfSpotlight(page);
  await page.locator("#product-tour-next").click();
  await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", "sidebar-orientation");
  await expect(page.locator("#profile-tab-profile .profile-hero")).not.toHaveAttribute("data-product-tour-active", "true");
  await page.locator("#product-tour-prev").click();
  await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", "profile");
  await page.locator("#product-tour-skip").click();
  await expect(page.locator("#product-tour")).toBeHidden();
  await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();
});

test("Produkttour: geöffnetes Kontaktprofil, Reiter und Scrollposition werden wiederhergestellt", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Mobile Kontakte öffnen als eigene Profilseite statt im Drawer.");
  await page.setViewportSize({ width: 1440, height: 760 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "editor" });
  await page.locator("#contact-list .row").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  const contactHeading = (await page.locator("#detail-drawer .detail-profile-copy h3").textContent())?.trim();
  await page.locator('#detail-drawer [data-detail-tab="notes"]').click();
  await expect(page.locator('#detail-drawer [data-detail-tab="notes"]')).toHaveAttribute("aria-selected", "true");
  const expectedScrollTop = await page.locator("#detail-panel").evaluate((panel) => {
    panel.scrollTop = Math.min(96, Math.max(0, panel.scrollHeight - panel.clientHeight));
    return panel.scrollTop;
  });

  await page.locator("#sidebar-tour-button").click({ force: true });
  await page.locator("#product-tour-next").click();
  await expect(page.locator("#product-tour")).toHaveAttribute("data-tour-step-id", "profile");
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await page.locator("#product-tour-skip").click();

  await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator("#detail-drawer .detail-profile-copy h3")).toHaveText(contactHeading || "");
  await expect(page.locator('#detail-drawer [data-detail-tab="notes"]')).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.locator("#detail-panel").evaluate((panel) => panel.scrollTop)).toBe(expectedScrollTop);
});

test("Produkttour: 200 Prozent Schriftgröße bleibt in allen Schritten kollisionsfrei", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Die starke Schriftvergrößerung wird einmal vollständig im Desktop-Projekt geprüft.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html", { role: "admin" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    window.dispatchEvent(new Event("resize"));
  });
  await page.locator("#sidebar-tour-button").click();
  const stepCount = 17;
  for (let index = 0; index < stepCount; index += 1) {
    await expectTourPanelInsideViewport(page);
    if (index > 0 && index < stepCount - 1) {
      await expectTourSpotlightInsideViewport(page);
      await expectTourPanelClearOfSpotlight(page);
    }
    await page.locator("#product-tour-next").click();
  }
  await expect(page.locator("#product-tour")).toBeHidden();
});

test("Importe: Registrierungs-Inbox rendert Backend-Eingaenge", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#registrations", { role: "admin" });

  await expect(page.locator('[data-view-panel="profile"]')).toBeVisible();
  await expect(page.locator('[data-profile-tab="imports"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-settings-tab="registrations"]')).toHaveText("Registrierungskonzept");
  await expect(page.locator('[data-settings-tab="imports"]')).toHaveText("Dateiimport");
  await expect(page.locator('[data-settings-tab="onlineEntry"]')).toHaveText("Online-Erfassung");
  await expect(page.locator('[data-settings-tab="registrations"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".registration-page-head")).toContainText("Registrierungsszenario");
  await expect(page.locator(".registration-page-head")).toContainText("später freigegebenen gematik-Prozess");
  await expect(page.locator(".registration-process-flow li")).toHaveCount(5);
  await expect(page.locator(".registration-process-guide")).toContainText("Double-Opt-in");
  await expect(page.locator("#registration-metric-new")).toHaveText("2");
  await expect(page.locator("#registrations-status-filter")).toHaveValue("open");
  await expect(page.locator("#registrations-section")).toBeVisible();
  await expect(page.locator("#registrations-list .registration-row").first()).toBeVisible();
  await expect(page.locator("#registrations-list [data-registration-preview]").first()).toBeVisible();
  await expect(page.locator("#registrations-reset-demo")).toBeHidden();
  await page.locator("[data-registration-preview]").first().click();
  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator(".detail-panel--registration")).toBeVisible();
  await expect(page.locator('[data-registration-detail-tab="contact"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#registration-contact .detail-section-title")).toHaveText("Kontakt");
  await page.locator('[data-registration-detail-tab="profile"]').click();
  await expect(page.locator(".detail-section-title", { hasText: "Forschungsprofil" })).toBeVisible();
  await expect(page.locator("#registration-profile")).toContainText("Berufsgruppe");
  await page.locator('[data-registration-detail-tab="organization"]').click();
  await expect(page.locator("#registration-organization")).toContainText("Primärsystem");
  await page.locator('[data-registration-action="show-link"]').click();
  await expect(page.locator("#registration-link-picker")).toBeVisible();
  await expect(page.locator("#registration-link-picker .custom-select-trigger")).toBeVisible();
  await page.locator('#registration-link-picker [data-registration-action="cancel-link"]').click();
  await expect(page.locator("#registration-link-picker")).toBeHidden();
  await page.locator('[data-registration-detail-tab="notes"]').click();
  await expect(page.locator(".detail-section-title", { hasText: "Notizen" })).toBeVisible();

  await attachScreenshot(page, testInfo, "registrierungen");
});

test("Importe: optionale #Mitmachen-Einwilligung wird strukturiert übernommen", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#registrations", { role: "admin" });

  await page.locator("[data-registration-preview]").first().click();
  await expect(page.locator(".detail-panel--registration")).toContainText("Separate #Mitmachen-Einwilligung");
  await page.locator('.detail-panel--registration [data-registration-action="accept"]').click();
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await page.locator('#person-profile-body [data-detail-tab="consent"]').click();
  await expect(page.locator("#person-profile-body .consent-status-pill")).toHaveText("Erteilt");
  await expect(page.locator("#person-profile-body #detail-consent")).toContainText("Online-Formular");
  await expect(page.locator("#person-profile-body #detail-consent")).toContainText("mitmachen-kontakt-v1");
  await expect(page.locator("#person-profile-body #detail-consent")).toContainText("Versorgungs-Netzwerk-Registrierung demo-registration-001");
});

test("#Mitmachen-Registrierungsdemo ist sichtbar gekennzeichnet und übermittelt keine Daten", async ({ page }, testInfo) => {
  let submissionAttempts = 0;
  await page.route("**/api/network-registrations", async (route) => {
    submissionAttempts += 1;
    await route.abort();
  });
  await page.goto("/frontend/pages/mitmachen/versorgungs-netzwerk.html");

  await expect(page.locator(".concept-banner")).toContainText("Demo");
  await expect(page.locator(".concept-banner")).toContainText("keine echten personenbezogenen Daten");
  await expect(page.locator("#registration-form")).toBeVisible();
  await page.locator("#email").fill("versorgung@example.test");
  await page.locator("#first_name").fill("Mara");
  await page.locator("#last_name").fill("Beispiel");
  await page.locator("#eligibility_confirmed").check();
  await page.locator("#consent_processing").check();
  await page.locator("#next-to-profile").click();
  await expect(page.locator("#form-step-profile")).toBeVisible();
  await page.locator("#role").fill("Pflegedienstleitung");
  await page.locator("#organization").fill("Pflegezentrum Beispielstadt");
  await page.locator("#sector").selectOption("Pflege");
  await page.locator("#postal_code").fill("60311");
  await page.locator("#message").fill("Wir können Einblicke in Aufnahme, Medikationsprozess und digitale Kommunikation geben.");
  await page.locator('.submit-button[type="submit"]').click();

  await expect(page.locator("#confirmation")).toBeVisible();
  await expect(page.locator("#confirmation")).toContainText("keine Daten");
  await expect(page.locator("#confirmation")).toContainText("übermittelt oder gespeichert");
  expect(submissionAttempts).toBe(0);

  await attachScreenshot(page, testInfo, "mitmachen-concept-registration");
});

test("Importe: geöffneter Registrierungs-Reiter aktualisiert neue geschützte API-Eingänge", async ({ page }) => {
  const backendFixture = createProtectedBackendFixture({ role: "admin", registrations: [] });
  const incoming = createProtectedBackendFixture({ role: "admin" }).registrations[0];
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#registrations", { role: "admin", backendFixture });
  await page.locator("#registrations-refresh").click();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(0);
  backendFixture.registrations.push(incoming);
  await page.locator("#registrations-refresh").click();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(1);
  await expect(page.locator("#registrations-list")).toContainText("Demo-Praxis Registrierung");
});

test("#Mitmachen-Registrierungsdemo erlaubt den inerten Ablauf ohne Beispielprofil", async ({ page }) => {
  let submissionAttempts = 0;
  await page.route("**/api/network-registrations", async (route) => {
    submissionAttempts += 1;
    await route.abort();
  });
  await page.goto("/frontend/pages/mitmachen/versorgungs-netzwerk.html");
  await page.locator("#first_name").fill("Mina");
  await page.locator("#last_name").fill("Minimal");
  await page.locator("#email").fill("minimal@example.test");
  await page.locator("#eligibility_confirmed").check();
  await page.locator("#consent_processing").check();
  await page.locator("#next-to-profile").click();
  await page.locator("#submit-minimal").click();

  await expect(page.locator("#confirmation")).toBeVisible();
  await expect(page.locator("#confirmation")).toContainText("Alle Formulareingaben wurden verworfen");
  expect(submissionAttempts).toBe(0);
});

test("Importe: geschützte Registrierungen lassen sich zurückstellen", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#registrations", { role: "admin" });

  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(2);
  await expect(page.locator("#registrations-reset-demo")).toBeHidden();
  await page.locator("[data-registration-preview]").first().click();
  await expect(page.locator(".detail-panel--registration")).toBeVisible();
  const deferRegistrationButton = page.locator('.detail-panel--registration [data-registration-action="defer"]');
  await deferRegistrationButton.scrollIntoViewIfNeeded();
  await deferRegistrationButton.click();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(1);
});

test("Stakeholder: KVn rendern als Organisationstabelle ohne Listen-Modi", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#stakeholders", { role: "admin" });

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "stakeholders");
  await expect(page.locator("#stakeholder-mode-actions [data-stakeholder-type=\"kv\"]")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#stakeholder-mode-actions [data-stakeholder-mode]")).toHaveCount(0);
  await expect(page.locator("#stakeholder-mode-actions")).not.toContainText("Vorstände");
  await expect(page.locator("#stakeholder-mode-actions")).not.toContainText("Karte");
  await expect(page.locator("#stakeholder-organizations-table")).toBeVisible();
  await expect(page.locator("#stakeholder-people-table")).toHaveCount(0);
  await expect(page.locator("#stakeholder-map-panel")).toHaveCount(0);
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("2 KVn");
  await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toBeVisible();
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Mitgliederzahl");
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Kontakte");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Typ");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Bundesland");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Website");
  await expect(page.locator("#stakeholder-organization-list")).toContainText("3.200");
  await expect(page.locator("#stakeholder-organization-list .organization-logo").first()).toBeVisible();
  await expect(page.locator("#stakeholder-organization-list .organization-logo img")).toHaveCount(0);
  const stakeholderSearch = page.getByRole("searchbox", { name: "Kassenärztliche Vereinigungen suchen..." });
  await expect(stakeholderSearch).toBeVisible();
  for (const [query, id, count] of [
    ["Musterstadt", "demo-kv-nord", "3.200"],
    ["Beispielstadt", "demo-kv-mitte", "2.100"]
  ]) {
    await stakeholderSearch.fill(query);
    const row = page.locator(`#stakeholder-organization-list [data-stakeholder-organization-id="${id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(count);
    await expect(row.locator(".organization-logo img")).toHaveCount(0);
  }
  await stakeholderSearch.fill("");
  const isDesktop = testInfo.project.name.includes("desktop");
  if (isDesktop) {
    await expect(page.locator("#columns-button")).toBeHidden();
    await expectPageSizeDropdownUsable(page, "#view-stakeholders .page-size-shell");
    await expect(page.locator("#stakeholders-pagination-meta")).toContainText("1-2 von 2 KVn");
    await expect(page.locator('[data-stakeholder-organization-sort="organization"]')).toBeVisible();
    await expect(page.locator('[data-stakeholder-organization-sort="memberCount"]')).toHaveAttribute("aria-sort", "descending");
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("Demo-KV Nord");
    await page.locator('[data-stakeholder-organization-sort="organization"]').click();
    await expect(page.locator('[data-stakeholder-organization-sort="organization"]')).toHaveAttribute("aria-sort", "descending");
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("Demo-KV Nord");
    await page.locator('[data-stakeholder-organization-sort="organization"]').click();
    await expect(page.locator('[data-stakeholder-organization-sort="organization"]')).toHaveAttribute("aria-sort", "ascending");
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("Demo-KV Mitte");
    await page.locator('[data-stakeholder-organization-sort="memberCount"]').click();
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("Demo-KV Nord");
    await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("3.200");
  }
  const expectedDetailMemberCount = "3.200";
  const expectedDetailOrganization = "Demo-KV Nord";
  const expectedDetailWebsite = "demo-kv-nord.example.invalid";
  const expectedOrganizationPerson = "Demo-Ansprechperson 01";

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
  await expect(organizationProfile.locator(".organization-profile-logo")).toBeVisible();
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText(expectedDetailWebsite);
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("Synthetische Testangabe");
  await organizationProfile.locator('[data-detail-tab="themes"]').click();
  await expect(organizationProfile.locator("#stakeholder-organization-themes")).toBeVisible();
  await expect(organizationProfile.locator("#stakeholder-organization-themes")).toBeVisible();
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

test("Stakeholder: Krankenkassen und aerztliche Verbaende starten nach Mitgliederzahl", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#stakeholders", { role: "admin" });

  await page.locator('[data-stakeholder-type="health-insurance"]').click();
  await expect(page.locator('[data-stakeholder-type="health-insurance"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-stakeholder-organization-sort="memberCount"]')).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Kontakte");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Ansprechpersonen");
  await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("Demo-Krankenkasse A");
  await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("5.400");

  await page.locator('[data-stakeholder-type="physician-associations"]').click();
  await expect(page.locator('[data-stakeholder-type="physician-associations"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-stakeholder-organization-sort="memberCount"]')).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Kontakte");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Präsidium");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Personen");
  await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("Demo-Berufsverband A");
  await expect(page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first()).toContainText("1.800");
});

test("Stakeholder: Patientenverbaende zeigen recherchierte Mitgliederzahlen und sortieren danach", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "versorgungs-kompass-visible-stakeholder-organization-columns-v1",
      JSON.stringify(["organization", "location", "people"])
    );
  });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#stakeholders", { role: "admin" });

  await page.locator('[data-stakeholder-type="patient-associations"]').click();
  await expect(page.locator('[data-stakeholder-type="patient-associations"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("2 Patientenverbände");
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Mitgliederzahl");
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Kontakte");
  await expect(page.locator('[data-stakeholder-organization-sort="memberCount"]')).toHaveAttribute("aria-sort", "descending");

  const firstRow = page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first();
  await expect(firstRow).toContainText("Demo-Patientenverband Neuro");
  await expect(firstRow).toContainText("650");
  await attachScreenshot(page, testInfo, "stakeholder-patientenverbaende-liste");

  await firstRow.click();
  const profileButton = page.locator("#detail-drawer [data-open-organization-profile]");
  if (await profileButton.isVisible().catch(() => false)) {
    await expect(page.locator("#detail-drawer #stakeholder-organization-overview")).toContainText("650");
    await profileButton.click();
  }
  const organizationProfile = page.locator("#organization-profile-body");
  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("Demo-Patientenverband Neuro");
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("Mitgliederzahl");
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("650");
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("Synthetische Testangabe");
  await attachScreenshot(page, testInfo, "stakeholder-patientenverbaende");
});

test("Stakeholder: weitere Typen nutzen Organisationstabellen und Profile", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#stakeholders", {
    role: "admin",
    backendFixtureScript: `
      window.VERSORGUNGS_COMPASS_STAKEHOLDER_TYPES = [
        { id: "kv", label: "Kassenärztliche Vereinigungen", sortOrder: 10, status: "active" },
        { id: "health-insurance", label: "Krankenkassen", sortOrder: 20, status: "active" },
        { id: "patient-associations", label: "Patientenverbände", sortOrder: 30, status: "active" },
        { id: "hospital-associations", label: "Krankenhausgesellschaften", sortOrder: 40, status: "active" },
        { id: "physician-associations", label: "Ärztliche Berufsverbände", sortOrder: 50, status: "active" }
      ];
      window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS = [
        { id: "demo-health-test", stakeholderTypeId: "health-insurance", stakeholderType: "health-insurance", name: "Demo-Krankenkasse Test", organizationType: "Krankenkasse", city: "Musterstadt", state: "Nord", latitude: 52.52, longitude: 13.405, website: "https://demo-krankenkasse.example.invalid", memberCount: 123, source: "Geschütztes Test-Backend", status: "active" },
        { id: "demo-patient-test", stakeholderTypeId: "patient-associations", stakeholderType: "patient-associations", name: "Demo-Patientenverband Test", organizationType: "Patientenverband", city: "Beispielstadt", state: "Mitte", source: "Geschütztes Test-Backend", status: "active" }
      ];
      window.VERSORGUNGS_COMPASS_STAKEHOLDER_PEOPLE = [
        { id: "demo-health-test-person", stakeholderTypeId: "health-insurance", stakeholderType: "health-insurance", organizationId: "demo-health-test", organization: "Demo-Krankenkasse Test", name: "Demo-Ansprechperson Gesundheit", role: "Synthetische Fachperson", committee: "Ansprechperson", city: "Musterstadt", state: "Nord", mapPositionSource: "organization", source: "Geschütztes Test-Backend", status: "active" }
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
  await expect(page.locator("#stakeholder-organizations-table-head")).toContainText("Kontakte");
  await expect(page.locator("#stakeholder-organizations-table-head")).not.toContainText("Ansprechpersonen");
  await expect(page.locator("#stakeholder-organization-list")).toContainText("Demo-Krankenkasse Test");
  const healthListLogo = page.locator('#stakeholder-organization-list [data-stakeholder-organization-id="demo-health-test"] .organization-logo--stakeholder');
  await expect(healthListLogo).toHaveText("DT");
  await expect(healthListLogo.locator("img")).toHaveCount(0);
  await page.locator("#stakeholder-organization-list [data-stakeholder-organization-id]").first().click();
  const healthProfileButton = page.locator("#detail-drawer [data-open-organization-profile]");
  if (await healthProfileButton.isVisible().catch(() => false)) {
    await healthProfileButton.click();
  }
  const organizationProfile = page.locator("#organization-profile-body");
  await expect(page.locator("#organization-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#organization\/stakeholder\/demo-health-test$/);
  await expect(organizationProfile.locator("#stakeholder-organization-overview")).toContainText("Demo-Krankenkasse Test");
  const healthProfileLogo = organizationProfile.locator(".organization-profile-logo.organization-logo--stakeholder");
  await expect(healthProfileLogo).toHaveText("DT");
  await expect(healthProfileLogo.locator("img")).toHaveCount(0);
  await organizationProfile.locator('[data-detail-tab="people"]').click();
  await expect(organizationProfile.locator("#stakeholder-organization-people")).toContainText("Demo-Ansprechperson Gesundheit");
  await organizationProfile.locator("[data-organization-profile-back]").click();

  await page.locator('[data-stakeholder-type="patient-associations"]').click();
  await expect(page.locator("#stakeholder-organizations-table")).toBeVisible();
  await expect(page.locator("#stakeholder-mode-actions [data-stakeholder-mode]")).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Patientenverbände suchen..." })).toBeVisible();
  await expect(page.locator("#stakeholders-pagination-meta")).toContainText("1 Patientenverbände");
  await expect(page.locator("#stakeholder-organization-list")).toContainText("Demo-Patientenverband Test");
});

test("Stakeholder: Bereich ist im eigenen Sidebar-Abschnitt ohne obere Modus-Reiter erreichbar", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#stakeholders", { role: "viewer" });

  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "stakeholders");
  await expect(page.locator('[data-sidebar-section="stakeholders"]')).toHaveCount(1);
  await expect(page.locator('[data-sidebar-section="stakeholders"]')).toHaveClass(/is-active-section/);
  await expect(page.locator('button[data-view-tab="stakeholders"]')).toContainText("Stakeholder");
  await expect(page.locator("#care-mode-actions")).toHaveCount(0);
  await expect(page.locator("#stakeholder-type-actions [data-stakeholder-type]").first()).toBeVisible();
  await expect(page).toHaveURL(/#stakeholders$/);
});

test("Auswertung: Analytics-View rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html");

  await expandSidebarSectionIfNeeded(page, "care");
  await page.locator('[data-view-tab="analytics"]:visible').first().click();

  await expect(page.locator('[data-view-panel="analytics"]')).toBeVisible();
  await expect(page.locator("#view-analytics .dashboard-grid")).toBeVisible();
  await expect(page.locator("#workspace-view-title")).not.toBeVisible();
  await expect(page.locator("#workspace-view-subtitle")).not.toBeVisible();
  await expect(page.locator('[data-view-tab="quality"]')).toHaveCount(0);
  await expect(page.locator("#sidebar-quality-button")).toHaveCount(0);
  await expect(page.locator("#analytics-mode-actions")).toBeVisible();
  await expect(page.locator('#analytics-mode-actions [data-analytics-mode="analytics"]')).toHaveAttribute("aria-selected", "true");

  await page.locator('#analytics-mode-actions [data-analytics-mode="quality"]').click();
  await expect(page.locator('[data-view-panel="quality"]')).toBeVisible();
  await expect(page.locator("#workspace-view-title")).not.toBeVisible();
  await expect(page.locator("#workspace-view-subtitle")).not.toBeVisible();
  await expect(page.locator('#analytics-mode-actions [data-analytics-mode="quality"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#sidebar-analytics-button")).toHaveClass(/is-active/);
  await expect(page).toHaveURL(/#quality$/);

  await attachScreenshot(page, testInfo, "auswertung");
});

test("Formate: Arbeitsbereich und Editor rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#formats");

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
  const createdFormat = page.locator('[data-format-detail]', { hasText: "Roundtable Testversorgung" }).first();
  await expect(createdFormat.locator(".format-detail-title")).toContainText("Roundtable Testversorgung");
  await page.locator('[data-format-status-filter="Planung"]').click();
  await expect(page.locator('[data-format-status-filter="Planung"]')).toHaveAttribute("aria-pressed", "true");
  await expect(createdFormat.locator(".format-detail-title")).toContainText("Roundtable Testversorgung");
  await page.locator('[data-format-status-filter="Planung"]').click();
  await expect(page.locator('[data-format-status-filter="Planung"]')).toHaveAttribute("aria-pressed", "false");
  await expect(createdFormat.locator(".format-type-icon")).toBeVisible();
  await expect(page.locator(".format-detail.is-open")).toHaveCount(0);
  await expect(page.locator(".format-overview-hero")).toHaveCount(0);
  await createdFormat.locator("[data-toggle-format-detail]").click();
  await expect(page.locator(".format-overview-hero")).toBeVisible();
  await expect(page.locator(".format-roundtable-illustration")).toBeVisible();
  await expect(createdFormat).toBeVisible();
  await expect(page.locator('[data-edit-format]')).toHaveCount(0);
  await expect(page.locator('[data-format-tab="notes"]')).toHaveText("Notizen");
  await expect(page.locator('[data-format-tab="settings"]')).toBeVisible();
  await expect(page.locator(".format-list-facts")).toHaveCount(0);
  await expect(page.locator(".format-detail-body")).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.locator(".format-tabs")).toHaveCSS("overflow-x", "auto");
    await expect(page.locator(".format-status-legend")).toHaveCSS("overflow-x", "auto");
    await expectNoHorizontalOverflow(page);
    await attachScreenshot(page, testInfo, "planung-formate-mobile");
  }
  await createdFormat.locator("[data-toggle-format-detail]").click();
  await expect(page.locator(".format-detail-body")).toHaveCount(0);
  await createdFormat.locator("[data-toggle-format-detail]").click();
  await expect(page.locator(".format-detail-body")).toBeVisible();
  await page.locator('[data-format-tab="participants"]').click();
  await page.locator("#open-participant-planner").click();
  await expect(page.locator("#format-participant-drawer.is-open")).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#format-participant-drawer .format-participant-panel")).toHaveCSS("width", `${page.viewportSize()?.width}px`);
  }
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
  await expect(page.locator('.participant-card [data-participant-field="invitationStatus"]')).toBeVisible();
  await expect(page.locator('.participant-card [data-participant-field="invitationStatus"] option[value="Teilgenommen"]')).toHaveCount(1);
  await expect(page.locator('[data-format-tab="composition"]')).toHaveCount(0);
  await page.locator('[data-open-format-contact="demo-contact-01"]').first().click();
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page).toHaveURL(/#person\/contact\/demo-contact-01$/);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "personProfile");
  await expect(page.locator("#person-profile-body [data-format-profile-section]")).toBeVisible();
  await expect(page.locator("#person-profile-body [data-format-profile-group='upcoming']")).toContainText("Kommende Formate");
  await expect(page.locator("#person-profile-body [data-format-profile-group='past']")).toContainText("Vergangene Formate");
  await expect(page.locator("#person-profile-body [data-format-profile-status]").first()).toBeVisible();
  await page.locator("#person-profile-body [data-person-profile-back]").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "formats");
  await expect(page.locator(".format-diversity-board")).toHaveCount(0);
  await page.locator('[data-format-tab="invitationStatus"]').click();
  await expect(page.locator(".invitation-status-board")).toBeVisible();
  await expect(page.locator(".invitation-status-select")).toHaveCount(0);
  await expect(page.locator('[data-invitation-status-drop="Teilgenommen"]')).toHaveCount(1);
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
  if (testInfo.project.name.includes("mobile")) {
    await expect(createdFormat.locator('[data-format-tab="settings"]')).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    const settingsPanel = createdFormat.locator(".format-tab-panel");
    const panelBounds = await settingsPanel.boundingBox();
    expect(panelBounds).not.toBeNull();
    expect(panelBounds?.x || 0).toBeGreaterThanOrEqual(0);
    expect((panelBounds?.x || 0) + (panelBounds?.width || 0)).toBeLessThanOrEqual((page.viewportSize()?.width || 0) + 1);
  }

  await attachScreenshot(page, testInfo, "formate");
});
