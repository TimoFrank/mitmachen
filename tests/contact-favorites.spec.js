import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const FAVORITES_FIXTURE_SCRIPT = `
  window.VERSORGUNGS_COMPASS_CONTACTS = [
    { id: "favorite-contact-1", name: "Anna Adler", organization: "MVZ Nord", category: "Praxis", priority: "Hoch", city: "Berlin", state: "Berlin", status: "active" },
    { id: "favorite-contact-2", name: "Boris Brandt", organization: "Klinik Mitte", category: "Krankenhaus", priority: "Mittel", city: "Berlin", state: "Berlin", status: "active" },
    { id: "favorite-contact-3", name: "Carla Conrad", organization: "Apotheke West", category: "Apotheke", priority: "Niedrig", city: "Potsdam", state: "Brandenburg", status: "active" }
  ];
  window.VERSORGUNGS_COMPASS_DEMO_DATA = {
    userSettings: {
      defaultViewType: "contacts",
      tableDensity: "comfortable",
      theme: "system",
      fontScale: 1,
      pageSize: 20,
      preferences: {
        favoriteContactIds: ["favorite-contact-1", "favorite-contact-2"],
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
  return createProtectedBackendFixture({
    role,
    fixtureScript: FAVORITES_FIXTURE_SCRIPT
  });
}

test("Persönliche Favoriten nutzen dieselbe Kontaktliste und bleiben serverseitig gespeichert", async ({ page }) => {
  const backendFixture = favoriteFixture();
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "viewer",
    backendFixture
  });

  await expect(page.locator("#favorite-contact-count")).toHaveText("2");
  await expect(page.locator('[data-id="favorite-contact-1"] [data-favorite-contact]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-id="favorite-contact-3"] [data-favorite-contact]')).toHaveAttribute("aria-pressed", "false");

  await page.locator('[data-id="favorite-contact-3"] [data-favorite-contact]').click();
  await expect(page.locator("#detail-drawer")).not.toHaveClass(/is-open/);
  await expect.poll(() => backendFixture.userSettings.preferences.favoriteContactIds).toEqual([
    "favorite-contact-1",
    "favorite-contact-2",
    "favorite-contact-3"
  ]);

  await page.locator('[data-contact-list-mode="favorites"]').click();
  await expect(page.locator("#contact-list [data-id]")).toHaveCount(3);
  await expect(page.getByRole("table", { name: "Favorisierte Kontakte" })).toBeVisible();

  await page.locator('[data-id="favorite-contact-2"] [data-favorite-contact]').click();
  await expect(page.locator('[data-id="favorite-contact-2"]')).toHaveCount(0);
  await expect.poll(() => backendFixture.userSettings.preferences.favoriteContactIds).toEqual([
    "favorite-contact-1",
    "favorite-contact-3"
  ]);

  await page.reload();
  await page.locator('[data-contact-list-mode="favorites"]').click();
  await expect(page.locator("#contact-list [data-id]")).toHaveCount(2);
  await expect(page.locator('[data-id="favorite-contact-1"]')).toBeVisible();
  await expect(page.locator('[data-id="favorite-contact-3"]')).toBeVisible();

  const browserStorage = await page.evaluate(() => JSON.stringify(Object.entries(window.localStorage)));
  expect(browserStorage).not.toContain("favoriteContactIds");
});

test("Gespeicherte Ansichten stellen den dynamischen Favoritenfilter wieder her", async ({ page }) => {
  const backendFixture = favoriteFixture();
  backendFixture.savedViews = [{
    id: "favorite-view",
    name: "Meine Favoriten",
    scope: "private",
    viewType: "contacts",
    filters: { favoriteContactsOnly: true },
    searchQuery: "",
    sortKey: "updated_at",
    sortDirection: "desc",
    pageSize: 20,
    isDefault: false
  }];
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "viewer",
    backendFixture
  });

  await page.locator("#view-select-button").click();
  await page.locator('[data-apply-saved-view="favorite-view"]').click();

  await expect(page.locator('[data-contact-list-mode="favorites"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#contact-list [data-id]")).toHaveCount(2);
  await expect(page.locator('[data-id="favorite-contact-1"]')).toBeVisible();
  await expect(page.locator('[data-id="favorite-contact-2"]')).toBeVisible();
  expect(backendFixture.savedViews[0].filters).toEqual({ favoriteContactsOnly: true });
});

test("Der letzte entfernte Favorit zeigt einen hilfreichen Leerzustand", async ({ page }) => {
  const backendFixture = favoriteFixture();
  backendFixture.userSettings.preferences.favoriteContactIds = ["favorite-contact-1"];
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "viewer",
    backendFixture
  });

  await page.locator('[data-contact-list-mode="favorites"]').click();
  await page.locator('[data-id="favorite-contact-1"] [data-favorite-contact]').click();

  await expect(page.locator(".favorite-empty-state")).toContainText("Noch keine Favoriten");
  await expect(page.locator(".favorite-empty-state")).toContainText("Markiere wichtige Kontakte über den Stern");
  await page.locator("[data-show-all-contacts]").click();
  await expect(page.locator("#contact-list [data-id]")).toHaveCount(3);
});

test("Ein Speicherfehler setzt den optimistischen Favoritenstatus zurück", async ({ page }) => {
  const backendFixture = favoriteFixture();
  backendFixture.userSettings.preferences.favoriteContactIds = [];
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "viewer",
    backendFixture
  });
  await page.route("**/api/user-settings", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetischer Speicherfehler" })
      });
      return;
    }
    await route.fallback();
  });

  const button = page.locator('[data-id="favorite-contact-1"] [data-favorite-contact]');
  await button.click();

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#global-status")).toContainText("Favorit konnte nicht gespeichert werden");
});
