import { expect, test } from "@playwright/test";

const AUTH_KEY = "versorgungs-kompass-auth-v1";
function authSession() {
  return {
    authenticated: true,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  };
}

async function gotoAuthenticated(page, path, { role = "admin" } = {}) {
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
      body: `window.VERSORGUNGS_COMPASS_CONFIG = { dataMode: "demo", demoRole: ${JSON.stringify(role)} };`
    });
  });
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

async function attachScreenshot(page, testInfo, name) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true
  });
}

test("Kontakte: Liste und Filtertoolbar rendern", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator("#filter-panel-button")).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();

  await attachScreenshot(page, testInfo, "kontakte");
});

test("Organisationen: Demo-Daten rendern im CRM-Profilmodus", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#organizations");

  await expect(page.locator('[data-view-panel="organizations"]')).toBeVisible();
  await expect(page.locator("#organization-list .row, #organization-list .mobile-contact-card").first()).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();

  await attachScreenshot(page, testInfo, "organisationen");
});

test("Kontaktprofil: Detailpanel oeffnet im Lesemodus", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html");

  const firstContact = page.locator("#contact-list .row, #contact-list .mobile-contact-card").first();
  await expect(firstContact).toBeVisible();
  await firstContact.click();

  await expect(page.locator("#detail-drawer.is-open")).toBeVisible();
  await expect(page.locator(".detail-profile")).toBeVisible();
  await expect(page.locator(".detail-tabs")).toBeVisible();

  await attachScreenshot(page, testInfo, "kontaktprofil");
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
  await expect(page.locator("#archive-view-button")).toBeHidden();

  await attachScreenshot(page, testInfo, "viewer-rolle");
});

test("Rollen: Admin sieht Import und Archiv", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html", { role: "admin" });

  await expect(page.locator("#contact-list")).toBeVisible();
  await expect(page.locator("#sidebar-import-button")).toBeVisible();
  await expect(page.locator("#archive-view-button")).toHaveAttribute("aria-hidden", "false");
  if (!testInfo.project.name.includes("mobile")) {
    await expect(page.locator("#archive-view-button")).toBeVisible();
  }

  await attachScreenshot(page, testInfo, "admin-rolle");
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
  await expect(page.locator("#format-editor-form")).toBeVisible();
  await expect(page.locator("#format-title")).toBeVisible();
  await page.locator("#format-title").fill("Roundtable Testversorgung");
  await page.locator("#format-editor-form").getByRole("button", { name: "Format anlegen" }).click();
  await expect(page.locator(".format-list-item")).toContainText("Roundtable Testversorgung");
  await page.locator("#format-contact-select").selectOption("demo-contact-01");
  await page.locator("#add-format-contact").click();
  await expect(page.locator(".participant-card")).toBeVisible();

  await attachScreenshot(page, testInfo, "formate");
});
