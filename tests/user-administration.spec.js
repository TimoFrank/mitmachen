import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const path = "/frontend/app/versorgungs-kompass.html#home";
function fixture() {
  return { actorProfileId: "demo-profile-admin", canInvite: true, accessEndsAt: "2026-10-31T17:00:00Z", history: [], invitations: [], items: [
    { id: "admin", profileId: "demo-profile-admin", name: "Timo Beispiel", email: "admin@example.invalid", role: "admin", team: "Koordination", status: "active", scope: "standard", lastSignIn: "2026-09-30T09:00:00Z", version: "a".repeat(64), editable: true },
    { id: "lea", profileId: "lea", name: "Lea Muster", email: "lea.muster@example.invalid", role: "editor", team: "Versorgungsforschung", status: "active", scope: "standard", lastSignIn: "2026-09-28T09:00:00Z", version: "b".repeat(64), editable: true },
    { id: "max", profileId: "max", name: "Max Beispiel", email: "max.beispiel@example.invalid", role: "viewer", team: "", status: "blocked", scope: "test_only", lastSignIn: null, version: "c".repeat(64), editable: true },
    { id: "unbound", profileId: null, name: "Nora Test", email: "nora.test@example.invalid", role: null, team: "", status: "unbound", scope: null, lastSignIn: null, version: "d".repeat(64), editable: false }
  ] };
}
async function install(page, value, calls) {
  await page.route("**/api/admin/users**", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() === "GET") return route.fulfill({ json: value });
    const body = request.postDataJSON(); calls.push({ path: url.pathname, method: request.method(), body });
    if (request.method() === "PATCH") {
      const row = value.items.find(v => url.pathname.endsWith(`/${v.id}`)); row.role = body.role; row.status = body.enabled ? "active" : "blocked";
      return route.fulfill({ json: { updated: true } });
    }
    if (url.pathname.endsWith("/send")) { value.invitations[0].status = "sent"; return route.fulfill({ json: value.invitations[0] }); }
    const invitation = { ...body, id: body.operationId, status: "ready", preview: { subject: "Dein Zugang zu #Mitmachen", text: "Hallo Mara,\n\nlege dein Passwort fest: [Passwort festlegen]\n\nMelde dich auf #Mitmachen an.\n\nViele Grüße\nTimo", fingerprint: "e".repeat(64) } };
    value.invitations.push(invitation); return route.fulfill({ json: invitation });
  });
}

test("Konten filtern, sperren und Einladung nach Vorschau senden", async ({ page }, testInfo) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await gotoAuthenticated(page, path);
  await expect(page.locator("#sidebar-user-name")).not.toHaveText("Nutzerprofil");
  const data = fixture(), calls = []; await install(page, data, calls);
  await page.evaluate(() => { location.hash = "userAdmin"; });
  const view = page.locator("#view-userAdmin");
  await expect(view).toHaveClass(/is-active/);
  await expect(view.locator("[data-admin-count]")).toHaveText("4 von 4 Konten");
  await expect(view.locator('[data-admin-edit="admin"]')).toBeDisabled();
  await expect(view.locator('[data-admin-edit="unbound"]')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await mkdir("/tmp/vk-user-admin-previews", { recursive: true });
  await page.screenshot({ path: `/tmp/vk-user-admin-previews/${testInfo.project.name}-overview.png`, fullPage: true });
  if (testInfo.project.name === "chromium-desktop") {
    await page.setViewportSize({ width: 834, height: 1112 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: "/tmp/vk-user-admin-previews/tablet-overview.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await view.getByRole("button", { name: "Aktiv", exact: true }).click();
  await expect(view.locator("[data-admin-count]")).toHaveText("2 von 4 Konten");
  await view.locator("[data-admin-search]").fill("lea.muster");
  await expect(view.locator("[data-admin-count]")).toHaveText("1 von 4 Konten");
  await view.locator('[data-admin-edit="lea"]').click();
  await view.locator("[data-admin-enabled]").uncheck();
  page.once("dialog", dialog => dialog.accept());
  await view.getByRole("button", { name: "Änderung speichern" }).click();
  await expect(view.locator("[data-admin-status]")).toContainText("Konto geändert");
  expect(calls[0]).toMatchObject({ method: "PATCH", body: { version: "b".repeat(64), role: "editor", enabled: false } });
  await view.locator("[data-admin-search]").fill("");
  await view.getByRole("button", { name: "Alle", exact: true }).click();
  await view.getByRole("button", { name: "Nutzer einladen", exact: true }).click();
  await view.locator('[name="name"]').fill("Mara Beispiel");
  await view.locator('[name="email"]').fill("mara@example.invalid");
  await view.locator('[name="ownership"]').check();
  await page.screenshot({ path: `/tmp/vk-user-admin-previews/${testInfo.project.name}-invite.png`, fullPage: false });
  await view.getByRole("button", { name: "Einladung vorbereiten" }).click();
  await expect(view.locator("[data-admin-mail]")).toContainText("Melde dich auf #Mitmachen an.");
  expect(calls.filter(c => c.path.endsWith("/send"))).toHaveLength(0);
  await view.getByRole("button", { name: "Einladung senden", exact: true }).click();
  await expect(view.locator("[data-admin-status]")).toContainText("Einladung versendet");
  expect(calls.filter(c => c.path.endsWith("/send"))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("Ladefehler zeigt keine veralteten Kontodaten", async ({ page }) => {
  await gotoAuthenticated(page, path); await install(page, fixture(), []);
  await page.evaluate(() => { location.hash = "userAdmin"; });
  await expect(page.locator("[data-admin-count]")).toHaveText("4 von 4 Konten");
  await page.route("**/api/admin/users", route => route.fulfill({ status: 503, json: { error: "Nutzerverwaltung vorübergehend nicht erreichbar." } }));
  await page.locator("[data-admin-reload]").click();
  await expect(page.locator("[data-admin-status]")).toContainText("nicht erreichbar");
  await expect(page.locator("[data-admin-rows]")).not.toContainText("lea.muster");
  await expect(page.locator("[data-admin-invite]")).toBeDisabled();
});

for (const role of ["viewer", "editor"]) test(`${role} sieht keinen Admin-Einstieg`, async ({ page }) => {
  let requests = 0;
  await page.route("**/api/admin/users**", route => { requests++; return route.fulfill({ status: 403, json: {} }); });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#userAdmin", { role });
  await expect(page.locator("#sidebar-user-admin-button")).toBeHidden();
  await expect(page.locator("#view-userAdmin")).not.toHaveClass(/is-active/);
  expect(requests).toBe(0);
});
