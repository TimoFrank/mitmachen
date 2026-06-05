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

test("Expertenkreis: getrennte Kontakt- und Organisationsansicht rendert", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/app/versorgungs-kompass.html#experts");

  await expect(page.locator('[data-view-panel="experts"]')).toBeVisible();
  await expect(page.locator('[data-view-tab="experts"]')).toHaveClass(/is-active/);
  await expect(page.locator("#workspace-view-title")).toHaveText("Expertenkreis");
  await expect(page.locator('[data-filter-field="category"] summary')).toHaveText("Gruppe");
  await expect(page.locator("#expert-list .row, #expert-list .mobile-contact-card").first()).toBeVisible();
  await expect(page.locator("#experts-pagination-meta")).toContainText("Kontakten");
  await expect(page.locator("#view-select-button")).toBeHidden();

  await page.locator('[data-expert-mode="organizations"]').click();
  await expect(page.locator("#expert-organization-list .row").first()).toBeVisible();
  await expect(page.locator("#experts-pagination-meta")).toContainText("Organisationen");

  await attachScreenshot(page, testInfo, "expertenkreis");
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
  await page.locator('.detail-panel--registration [data-registration-action="defer"]').click();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(1);
  await page.locator("#registrations-reset-demo").click();
  await expect(page.locator("#registrations-list .registration-row")).toHaveCount(2);
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
