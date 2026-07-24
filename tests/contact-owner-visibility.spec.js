import { expect, test } from "@playwright/test";
import XLSX from "xlsx-js-style";

const PAGES_APP = "/dist/pages/versorgungs-kompass.html";
const PROFILE_ADMIN = "demo-profile-admin";
const PROFILE_VIEWER = "demo-profile-viewer";
const CONTACT_01_EMAIL = "demo-contact-01@example.invalid";
const CONTACT_01_PHONE = "+49 000 120001";
const CONTACT_02_EMAIL = "demo-contact-02@example.invalid";
const CONTACT_02_PHONE = "+49 000 120002";
const CONTACT_03_EMAIL = "demo-contact-03@example.invalid";
const CONTACT_03_PHONE = "+49 000 120003";

function pagesUrl(profileId, hash) {
  return `${PAGES_APP}?demoProfile=${encodeURIComponent(profileId)}${hash}`;
}

async function openContactChannels(page, { profileId, contactId, contactName }) {
  await page.goto(pagesUrl(profileId, `#person/contact/${contactId}?tab=contact`));

  const profile = page.locator("#person-profile-body");
  await expect(profile).toBeVisible();
  await expect(profile.getByRole("heading", { level: 3, name: contactName })).toBeVisible();

  const contactPanel = profile.locator("#detail-contactways");
  await expect(contactPanel).toBeVisible();
  return { contactPanel, profile };
}

async function revealDemoProfileSwitcher(page) {
  const switcher = page.locator("[data-demo-profile-switcher]");
  if (!(await switcher.isVisible())) {
    await page.locator("#sidebar-collapse-button").click();
  }
  await expect(switcher).toBeVisible();
  return switcher.getByRole("combobox", { name: "Demo-Profil" });
}

function expectContactLinks(panel, { email, phone }) {
  return Promise.all([
    expect(panel.getByRole("link", { name: email })).toHaveAttribute("href", `mailto:${email}`),
    expect(panel.getByRole("link", { name: phone })).toHaveAttribute("href", `tel:${phone}`),
    expect(panel.locator(".contact-channel-restricted")).toHaveCount(0)
  ]);
}

async function downloadBuffer(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function workbookRows(workbook, sheetName = workbook.SheetNames[0]) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: ""
  });
}

test.describe("GitHub-Pages-Demo: Owner-Sichtbarkeit der Kontaktkanäle", () => {
  test("Admin-Owner sieht E-Mail und Telefon samt Kontaktlinks", async ({ page }) => {
    const { contactPanel } = await openContactChannels(page, {
      profileId: PROFILE_ADMIN,
      contactId: "demo-contact-01",
      contactName: "Demo Dr. Leonie Albrecht"
    });

    await expectContactLinks(contactPanel, {
      email: CONTACT_01_EMAIL,
      phone: CONTACT_01_PHONE
    });
  });

  test("Admin-Non-Owner sieht weder Werte noch Links des eingeschränkten Kontakts", async ({ page }) => {
    const { contactPanel } = await openContactChannels(page, {
      profileId: PROFILE_ADMIN,
      contactId: "demo-contact-02",
      contactName: "Demo Murat Albrecht"
    });

    const restrictions = contactPanel.locator(".contact-channel-restricted");
    await expect(restrictions).toHaveCount(2);
    await expect(restrictions).toHaveText([
      /Nur für Owner sichtbar/,
      /Nur für Owner sichtbar/
    ]);
    await expect(contactPanel.locator('a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);
    await expect(contactPanel.getByRole("button", { name: "Kontaktwege bearbeiten" })).toHaveCount(0);

    const pageMarkup = await page.locator("html").innerHTML();
    expect(pageMarkup).not.toContain(CONTACT_02_EMAIL);
    expect(pageMarkup).not.toContain(CONTACT_02_PHONE);
    expect(pageMarkup).not.toContain(`mailto:${CONTACT_02_EMAIL}`);
    expect(pageMarkup).not.toContain(`tel:${CONTACT_02_PHONE}`);
  });

  test("Viewer-Owner sieht die Kanäle, aber keine Bearbeitungsaktionen", async ({ page }) => {
    const { contactPanel, profile } = await openContactChannels(page, {
      profileId: PROFILE_VIEWER,
      contactId: "demo-contact-03",
      contactName: "Demo Sophie Albrecht"
    });

    await expectContactLinks(contactPanel, {
      email: CONTACT_03_EMAIL,
      phone: CONTACT_03_PHONE
    });
    await expect(profile.locator(
      "#detail-image-edit, [data-detail-owner-edit], [data-detail-edit-section], #detail-save-edit"
    )).toHaveCount(0);
  });

  test("Pages-Profilumschalter setzt demoProfile, bewahrt den Hash und lädt das Profil neu", async ({ page, request }) => {
    const runtimeResponse = await request.get("/dist/pages/data/runtime-config.js");
    expect(runtimeResponse.ok()).toBe(true);
    const runtimeConfig = await runtimeResponse.text();
    expect(runtimeConfig).toContain('dataMode: "demo"');
    expect(runtimeConfig).toMatch(/ownerOnlyContactChannels:\s*true/);

    await page.goto(pagesUrl(PROFILE_ADMIN, "#contacts"));
    let select = await revealDemoProfileSwitcher(page);
    await expect(select).toHaveValue(PROFILE_ADMIN);

    await Promise.all([
      page.waitForURL((url) =>
        url.searchParams.get("demoProfile") === PROFILE_VIEWER
        && url.hash === "#contacts"
      ),
      select.selectOption(PROFILE_VIEWER)
    ]);

    select = page.locator("#demo-profile-select");
    await expect(select).toHaveValue(PROFILE_VIEWER);
    await expect(page.locator("#sidebar-profile-button")).toContainText("Demo Lesekonto");
    await expect.poll(() => page.evaluate(
      () => window.VersorgungsCompassDemoApi.snapshot().currentProfileId
    )).toBe(PROFILE_VIEWER);
  });

  test("Kartenflow öffnet den Non-Owner-Kontakt mit eingeschränkten Kanälen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Die stabile Karten-Detailintegration wird am Desktop geprüft.");

    await page.goto(pagesUrl(PROFILE_ADMIN, "#map"));
    const mapFrame = page.frameLocator('iframe[title="Karte des Versorgungs-Kompass"]');
    const restrictedContact = mapFrame.getByText("Demo Murat Albrecht", { exact: true });
    await expect(restrictedContact).toBeVisible();
    await restrictedContact.click();

    const drawer = page.locator("#detail-drawer");
    await expect(drawer).toHaveAttribute("aria-hidden", "false");
    await drawer.getByRole("tab", { name: "Kontakt", exact: true }).click();

    const contactPanel = drawer.locator("#detail-contactways");
    await expect(contactPanel).toBeVisible();
    const restrictions = contactPanel.locator(".contact-channel-restricted");
    await expect(restrictions).toHaveCount(2);
    await expect(restrictions).toHaveText([
      /Nur für Owner sichtbar/,
      /Nur für Owner sichtbar/
    ]);
    await expect(contactPanel.locator('a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);
  });

  test("Non-Owner-Editor zeigt keine Kontaktfelder und sendet sie bei erlaubten Änderungen nicht mit", async ({ page }) => {
    await page.goto(pagesUrl(
      PROFILE_ADMIN,
      "#person/contact/demo-contact-02?tab=contact"
    ));

    const profile = page.locator("#person-profile-body");
    const contactPanel = profile.locator("#detail-contactways");
    await expect(contactPanel).toBeVisible();
    const demoNoticeClose = page.locator("[data-demo-notice-close]");
    if (await demoNoticeClose.isVisible()) {
      await demoNoticeClose.click();
    }
    await expect(contactPanel.locator('input[type="email"], input[type="tel"]')).toHaveCount(0);
    await expect(contactPanel.locator(".contact-channel-restricted")).toHaveCount(2);

    await profile.getByRole("tab", { name: "Überblick", exact: true }).click();
    await profile.getByRole("button", { name: "Stammdaten bearbeiten" }).click();

    await expect(profile.getByRole("tab", { name: "Kontakt", exact: true })).toBeDisabled();
    await expect(profile.locator('input[type="email"]:visible, input[type="tel"]:visible')).toHaveCount(0);
    await expect(page.locator("#editor-drawer")).toHaveAttribute("aria-hidden", "true");

    await page.evaluate(() => {
      window.__ownerVisibilityPatches = [];
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const requestUrl = typeof input === "string" ? input : input.url;
        const method = String(init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
        const pathname = new URL(requestUrl, window.location.href).pathname;
        if (method === "PATCH" && pathname.endsWith("/api/contacts/demo-contact-02")) {
          window.__ownerVisibilityPatches.push(JSON.parse(String(init.body || "{}")));
        }
        return originalFetch(input, init);
      };
    });

    const newRole = "Koordination Owner-Sichtbarkeit";
    await profile.locator('[data-detail-field="contactRole"]').fill(newRole);
    await profile.getByRole("button", { name: "Änderungen speichern" }).click();

    await expect.poll(() => page.evaluate(
      () => window.__ownerVisibilityPatches.length
    )).toBe(1);
    const [allowedPatch] = await page.evaluate(() => window.__ownerVisibilityPatches);
    expect(allowedPatch.contactRole).toBe(newRole);
    expect(allowedPatch).not.toHaveProperty("email");
    expect(allowedPatch).not.toHaveProperty("phone");
    expect(allowedPatch).not.toHaveProperty("contactChannelAccess");

    const revealedContact = await page.evaluate(async () => {
      const response = await window.fetch("/api/contacts/demo-contact-02", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: "demo-profile-editor",
          ownerIds: ["demo-profile-editor", "demo-profile-admin"]
        })
      });
      return response.json();
    });
    expect(revealedContact.email).toBe(CONTACT_02_EMAIL);
    expect(revealedContact.phone).toBe(CONTACT_02_PHONE);
    expect(revealedContact.contactRole).toBe(newRole);
    expect(revealedContact.contactChannelAccess).toBe("owner");
  });

  test("CSV-Download lässt eingeschränkte E-Mail und Telefon leer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Der Tabellenexport wird einmal am Desktop geprüft.");

    await page.goto(pagesUrl(PROFILE_ADMIN, "#contacts"));
    const restrictedCheckbox = page.locator('[data-row-select="demo-contact-02"]');
    await expect(restrictedCheckbox).toBeVisible();
    await restrictedCheckbox.check();
    await expect(page.locator("#bulk-toolbar")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#bulk-export").click()
    ]);
    const csv = (await downloadBuffer(download)).toString("utf8");
    const csvWorkbook = XLSX.read(csv, { type: "string" });
    const rows = workbookRows(csvWorkbook);
    const headers = rows[0];
    const restrictedRow = rows.find((row) => row[0] === "demo-contact-02");

    expect(restrictedRow).toBeDefined();
    expect(restrictedRow[headers.indexOf("email")]).toBe("");
    expect(restrictedRow[headers.indexOf("phone")]).toBe("");
    expect(csv).not.toContain(CONTACT_02_EMAIL);
    expect(csv).not.toContain(CONTACT_02_PHONE);
  });

  test("XLSX-Download lässt eingeschränkte Kanäle leer und exportiert Owner-Werte weiterhin", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Der Excel-Export wird einmal am Desktop geprüft.");

    await page.goto(pagesUrl(PROFILE_ADMIN, "#formats"));
    const format = page.locator('[data-format-detail="demo-format-krankenhausentlassbrief"]');
    await format.locator('[data-toggle-format-detail="demo-format-krankenhausentlassbrief"]').click();
    await format.getByRole("tab", { name: "Einstellungen" }).click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      format.getByRole("button", { name: "Aktuelle Excel-Datei" }).click()
    ]);
    const workbook = XLSX.read(await downloadBuffer(download), { type: "buffer" });
    const rows = workbookRows(workbook, "Einladungen");
    const restrictedRow = rows.find((row) => row[9] === "demo-contact-02");
    const ownerRow = rows.find((row) => row[9] === "demo-contact-01");

    expect(restrictedRow).toBeDefined();
    expect(restrictedRow[4]).toBe("");
    expect(restrictedRow[5]).toBe("");
    expect(ownerRow).toBeDefined();
    expect(ownerRow[4]).toBe(CONTACT_01_EMAIL);
    expect(ownerRow[5]).toBe(CONTACT_01_PHONE);
    expect(JSON.stringify(rows)).not.toContain(CONTACT_02_EMAIL);
    expect(JSON.stringify(rows)).not.toContain(CONTACT_02_PHONE);
  });
});
