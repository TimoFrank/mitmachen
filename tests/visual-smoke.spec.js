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

test("Importe: Registrierungs-Inbox rendert Backend-Eingaenge", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#settings", { role: "admin" });

  await page.locator('[data-settings-tab="imports"]').click();
  await expect(page.locator("#registrations-section")).toBeVisible();
  await expect(page.locator("#imports-show-registrations")).toBeVisible();
  await page.locator("#imports-show-registrations").click();
  await expect(page.locator("#registrations-list .registration-row").first()).toBeVisible();
  await expect(page.locator('[data-registration-action="accept"]').first()).toBeVisible();

  await attachScreenshot(page, testInfo, "registrierungen");
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
  await page.locator("#format-notes-message").fill("Testnotiz aus dem Formate-Visualtest");
  await page.locator("#format-notes-composer").getByRole("button", { name: "Notiz senden" }).click();
  await expect(page.locator(".format-chat-message")).toContainText("Testnotiz aus dem Formate-Visualtest");
  await expect(page.locator(".format-chat-meta time")).toBeVisible();
  await page.locator("[data-edit-format-note]").first().click();
  await page.locator("[data-format-note-edit-form] textarea").fill("Bearbeitete Testnotiz aus dem Formate-Visualtest");
  await page.locator("[data-format-note-edit-form]").getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator(".format-chat-message")).toContainText("Bearbeitete Testnotiz aus dem Formate-Visualtest");
  await expect(page.locator(".format-chat-message")).toContainText("bearbeitet");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-delete-format-note]").first().click();
  await expect(page.locator(".format-chat-message")).toHaveCount(0);
  await page.locator('[data-format-tab="settings"]').click();
  await expect(page.locator("#export-format-participants")).toBeVisible();
  await expect(page.locator("[data-archive-format]")).toBeVisible();

  await attachScreenshot(page, testInfo, "formate");
});
