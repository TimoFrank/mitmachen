import { expect, test } from "@playwright/test";
import { gotoAuthenticated, installAppTestSession, writeAppTestStorage } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const APP = "/frontend/app/versorgungs-kompass.html";
const FAVORITES_FIXTURE_SCRIPT = `
  window.VERSORGUNGS_COMPASS_CONTACTS = [
    { id: "favorite-contact-1", name: "Anna Adler", organizationId: "favorite-org-1", organization: "MVZ Nord", category: "Praxis", city: "Berlin", state: "Berlin", status: "active" },
    { id: "favorite-contact-2", name: "Boris Brandt", organizationId: "favorite-org-2", organization: "Klinik Mitte", category: "Krankenhaus", city: "Berlin", state: "Berlin", status: "active" },
    { id: "favorite-contact-3", name: "Carla Conrad", organizationId: "favorite-org-3", organization: "Apotheke West", category: "Apotheke", city: "Potsdam", state: "Brandenburg", status: "active" }
  ];
  window.VERSORGUNGS_COMPASS_DEMO_DATA = {
    organizations: [
      { id: "favorite-org-1", name: "MVZ Nord", sector: "Praxis", city: "Berlin", state: "Berlin", status: "active" },
      { id: "favorite-org-2", name: "Klinik Mitte", sector: "Krankenhaus", city: "Berlin", state: "Berlin", status: "active" },
      { id: "favorite-org-3", name: "Apotheke West", sector: "Apotheke", city: "Potsdam", state: "Brandenburg", status: "active" }
    ],
    userSettings: {
      defaultViewType: "organizations",
      tableDensity: "comfortable",
      theme: "system",
      fontScale: 1,
      pageSize: 20,
      preferences: {
        favoriteContactIds: ["favorite-contact-1"],
        favoriteOrganizationIds: ["favorite-org-1", "favorite-org-2"],
        onboarding: {
          version: 1,
          profileCompletedAt: "2026-07-19T12:00:00.000Z",
          tourSkippedAt: "2026-07-19T12:00:00.000Z"
        }
      }
    }
  };
`;

function favoriteFixture(role = "viewer") {
  return createProtectedBackendFixture({ role, fixtureScript: FAVORITES_FIXTURE_SCRIPT });
}

function organizationStar(page, id) {
  return page.locator(`#organization-list [data-favorite-organization="${id}"]`);
}

test("Organisationsfavoriten sind auch für Viewer persönlich gespeichert und öffnen kein Profil", async ({ page }) => {
  const backendFixture = favoriteFixture();
  await gotoAuthenticated(page, `${APP}#organizations`, { role: "viewer", backendFixture });

  await expect(page.locator("#organization-list-switcher")).toBeVisible();
  await expect(page.locator("#favorite-organization-count")).toHaveText("2");
  await expect(organizationStar(page, "favorite-org-1")).toHaveAttribute("aria-pressed", "true");
  await expect(organizationStar(page, "favorite-org-3")).toHaveAttribute("aria-pressed", "false");

  await organizationStar(page, "favorite-org-3").click();
  await expect(page.locator('[data-view-panel="organizations"]')).toBeVisible();
  await expect(page.locator("#organization-profile-page")).toBeHidden();
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await expect.poll(() => backendFixture.userSettings.preferences.favoriteOrganizationIds).toEqual([
    "favorite-org-1", "favorite-org-2", "favorite-org-3"
  ]);
  expect(backendFixture.userSettings.preferences.favoriteContactIds).toEqual(["favorite-contact-1"]);

  await page.locator('[data-organization-list-mode="favorites"]').click();
  await expect(page.locator("#organization-list [data-organization-id]")).toHaveCount(3);
  await organizationStar(page, "favorite-org-2").click();
  await expect(page.locator('#organization-list [data-organization-id="favorite-org-2"]')).toHaveCount(0);
  await expect.poll(() => backendFixture.userSettings.preferences.favoriteOrganizationIds).toEqual([
    "favorite-org-1", "favorite-org-3"
  ]);

  await page.reload();
  await page.locator('[data-organization-list-mode="favorites"]').click();
  await expect(page.locator("#organization-list [data-organization-id]")).toHaveCount(2);
  await expect(organizationStar(page, "favorite-org-1")).toHaveAttribute("aria-pressed", "true");
  await expect(organizationStar(page, "favorite-org-3")).toHaveAttribute("aria-pressed", "true");
  const browserStorage = await page.evaluate(() => JSON.stringify(Object.entries(window.localStorage)));
  expect(browserStorage).not.toContain("favoriteOrganizationIds");
  expect(browserStorage).not.toContain("favoriteContactIds");
});

test("Gespeicherte Organisationsansichten stellen den Favoritenfilter wieder her", async ({ page }) => {
  const backendFixture = favoriteFixture();
  backendFixture.savedViews = [{
    id: "favorite-organization-view",
    name: "Meine Organisationen",
    scope: "private",
    viewType: "organizations",
    filters: { favoriteOrganizationsOnly: true },
    searchQuery: "",
    sortKey: "updated_at",
    sortDirection: "desc",
    pageSize: 20,
    isDefault: false
  }];
  await gotoAuthenticated(page, `${APP}#organizations`, { role: "viewer", backendFixture });

  await page.locator("#view-select-button").click();
  await page.locator('[data-apply-saved-view="favorite-organization-view"]').click();
  await expect(page.locator('[data-organization-list-mode="favorites"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#organization-list [data-organization-id]")).toHaveCount(2);
  await expect(organizationStar(page, "favorite-org-1")).toBeVisible();
  await expect(organizationStar(page, "favorite-org-2")).toBeVisible();
  expect(backendFixture.savedViews[0].filters).toEqual({ favoriteOrganizationsOnly: true });
});

test("Nach Entfernen des letzten Organisationsfavoriten bleibt Alle erreichbar", async ({ page }) => {
  const backendFixture = favoriteFixture();
  backendFixture.userSettings.preferences.favoriteOrganizationIds = ["favorite-org-1"];
  await gotoAuthenticated(page, `${APP}#organizations`, { role: "viewer", backendFixture });

  await page.locator('[data-organization-list-mode="favorites"]').click();
  await organizationStar(page, "favorite-org-1").click();
  await expect(page.locator("#favorite-organization-count")).toHaveText("0");
  await expect(page.locator("#organization-list [data-organization-id]")).toHaveCount(0);
  await expect(page.locator("#organization-list")).toContainText(/Favoriten/);
  await page.locator('[data-organization-list-mode="all"]').click();
  await expect(page.locator("#organization-list [data-organization-id]")).toHaveCount(3);
});

test("Ein API-Fehler setzt den Organisationsstern zurück und erhält Kontaktfavoriten", async ({ page }) => {
  const backendFixture = favoriteFixture();
  backendFixture.userSettings.preferences.favoriteOrganizationIds = [];
  await gotoAuthenticated(page, `${APP}#organizations`, { role: "viewer", backendFixture });
  await page.route("**/api/user-settings", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetischer Speicherfehler" }) });
      return;
    }
    await route.fallback();
  });

  await organizationStar(page, "favorite-org-3").click();
  await expect(organizationStar(page, "favorite-org-3")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#favorite-organization-count")).toHaveText("0");
  await expect(page.locator("#global-status")).toContainText(/nicht gespeichert/);
  expect(backendFixture.userSettings.preferences.favoriteContactIds).toEqual(["favorite-contact-1"]);
  expect(backendFixture.userSettings.preferences.favoriteOrganizationIds).toEqual([]);
});

test("Kontakt- und Organisationsfavoriten überschreiben sich bei laufender Speicherung nicht", async ({ page }) => {
  const backendFixture = favoriteFixture();
  await gotoAuthenticated(page, `${APP}#organizations`, { role: "viewer", backendFixture });
  let releaseWrite;
  let pendingWrite;
  const writeStarted = new Promise((resolve) => { pendingWrite = resolve; });
  const release = new Promise((resolve) => { releaseWrite = resolve; });
  let writes = 0;
  await page.route("**/api/user-settings", async (route) => {
    if (route.request().method() === "PUT" && writes++ === 0) {
      pendingWrite();
      await release;
    }
    await route.fallback();
  });

  try {
    await organizationStar(page, "favorite-org-3").click();
    await writeStarted;
    await page.goto(`${APP}#contacts`);
    const contactStar = page.locator('[data-id="favorite-contact-3"] [data-favorite-contact]');
    await expect(contactStar).toBeDisabled();
    releaseWrite();
    await expect(contactStar).toBeEnabled();
    await contactStar.click();
    await expect.poll(() => backendFixture.userSettings.preferences.favoriteContactIds).toEqual([
      "favorite-contact-1", "favorite-contact-3"
    ]);
    expect(backendFixture.userSettings.preferences.favoriteOrganizationIds).toEqual([
      "favorite-org-1", "favorite-org-2", "favorite-org-3"
    ]);
  } finally {
    releaseWrite();
  }
});

test("Ein früher Kontaktstern wartet auf persönliche Einstellungen und erhält Organisationsfavoriten", async ({ page }) => {
  const backendFixture = favoriteFixture();
  backendFixture.profiles.find((profile) => profile.id === backendFixture.currentProfileId).created_at = "2026-01-01T12:00:00.000Z";
  await installAppTestSession(page, { role: "viewer", backendFixture });
  let releaseSettings;
  const settingsGate = new Promise((resolve) => { releaseSettings = resolve; });
  await page.route("**/api/user-settings", async (route) => {
    if (route.request().method() === "GET") await settingsGate;
    await route.fallback();
  });
  try {
    await writeAppTestStorage(page);
    await page.goto(`${APP}#contacts`);
    const contactStar = page.locator('[data-id="favorite-contact-3"] [data-favorite-contact]');
    await expect(contactStar).toBeVisible();
    await contactStar.click();
    await expect(contactStar).toBeDisabled();
    await expect(contactStar).toHaveAttribute("aria-pressed", "false");
    releaseSettings();
    await expect(contactStar).toBeEnabled();
    await expect(contactStar).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => backendFixture.userSettings.preferences.favoriteContactIds).toEqual([
      "favorite-contact-1", "favorite-contact-3"
    ]);
    expect(backendFixture.userSettings.preferences.favoriteOrganizationIds).toEqual(["favorite-org-1", "favorite-org-2"]);
  } finally {
    releaseSettings();
  }
});

test("Verschiedene Nutzerkontexte übernehmen keine fremden Organisationsfavoriten", async ({ page, browser }) => {
  const viewerFixture = favoriteFixture("viewer");
  await gotoAuthenticated(page, `${APP}#organizations`, { role: "viewer", backendFixture: viewerFixture });
  await expect(page.locator("#favorite-organization-count")).toHaveText("2");

  const editorFixture = favoriteFixture("editor");
  editorFixture.userSettings.preferences.favoriteOrganizationIds = [];
  const editorContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: page.viewportSize(),
    timezoneId: "Europe/Berlin"
  });
  try {
    const editorPage = await editorContext.newPage();
    await gotoAuthenticated(editorPage, `${APP}#organizations`, { role: "editor", backendFixture: editorFixture });
    await expect(editorPage.locator("#favorite-organization-count")).toHaveText("0");
    await expect(organizationStar(editorPage, "favorite-org-1")).toHaveAttribute("aria-pressed", "false");
    await organizationStar(editorPage, "favorite-org-3").click();
    await expect.poll(() => editorFixture.userSettings.preferences.favoriteOrganizationIds).toEqual(["favorite-org-3"]);
    expect(viewerFixture.userSettings.preferences.favoriteOrganizationIds).toEqual(["favorite-org-1", "favorite-org-2"]);
    await expect(organizationStar(page, "favorite-org-3")).toHaveAttribute("aria-pressed", "false");
  } finally {
    await editorContext.close();
  }
});
