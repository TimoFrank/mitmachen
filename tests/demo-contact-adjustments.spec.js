import { expect, test } from "@playwright/test";

const PAGES_APP = "/dist/pages/versorgungs-kompass.html";

test("Öffentliche Demo stellt alle Bestandskontakte vollständig grün und einladbar", async ({ page }) => {
  await page.goto(`${PAGES_APP}#contacts`);
  await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();

  const invitationCheck = await page.evaluate(async () => {
    const snapshot = window.VersorgungsCompassDemoApi?.snapshot();
    const contacts = snapshot?.contacts || [];
    const invalidContacts = contacts.filter((contact) => {
      const effectiveTime = new Date(contact.mitmachenConsentEffectiveAt || "").getTime();
      return contact.mitmachenConsentStatus !== "granted"
        || !["online_form", "email", "written"].includes(contact.mitmachenConsentSource)
        || !Number.isFinite(effectiveTime)
        || effectiveTime > Date.now()
        || !contact.mitmachenConsentTextVersion
        || !contact.mitmachenConsentRecordedBy;
    }).map((contact) => contact.id);
    const archivedContacts = contacts
      .filter((contact) => ["archived", "Archiviert"].includes(contact.status))
      .map((contact) => contact.id);
    const formatId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const createResponse = await window.fetch("/api/formats", {
      method: "POST",
      body: JSON.stringify({
        title: "Einladbarkeitsprüfung der öffentlichen Demo",
        status: "Planung",
        idempotencyKey: formatId
      })
    });
    const invitationResponse = await window.fetch(`/api/formats/${formatId}/participants/batch`, {
      method: "POST",
      body: JSON.stringify({
        items: contacts.map((contact) => ({
          contactId: contact.id,
          invitationStatus: "Eingeladen"
        }))
      })
    });
    return {
      invalidContacts,
      archivedContacts,
      createStatus: createResponse.status,
      invitationStatus: invitationResponse.status,
      invitationPayload: await invitationResponse.json()
    };
  });

  expect(invitationCheck.invalidContacts).toEqual([]);
  expect(invitationCheck.archivedContacts).toEqual([]);
  expect(invitationCheck.createStatus).toBe(201);
  expect(invitationCheck.invitationStatus).toBe(200);
  expect(invitationCheck.invitationPayload.participants).toHaveLength(130);
  await expect(page.locator("#vk-public-demo-notice, #vk-public-demo-trigger")).toHaveCount(0);
});

test("Kontaktverlauf lädt nach Rückkehr aus einem Vollprofil im sichtbaren Drawer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Der Desktop-Drawer ist für diesen Regressionspfad maßgeblich.");

  await page.goto(`${PAGES_APP}#person/contact/demo-contact-130?tab=activity`);
  const fullProfile = page.locator("#person-profile-body");
  await expect(fullProfile.locator('[data-detail-tab="activity"]')).toHaveAttribute("aria-selected", "true");
  await expect(fullProfile.locator("#history-timeline .history-loading")).toHaveCount(0);

  await fullProfile.locator("[data-person-profile-back]").click();
  await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();
  await page.locator('#contact-list [data-id="demo-contact-01"]').click();

  const drawer = page.locator("#detail-drawer");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await drawer.locator('[data-detail-tab="activity"]').click();
  await expect(drawer.locator("#history-timeline .history-loading")).toHaveCount(0);
  await expect(drawer.locator("#history-timeline .history-item, #history-timeline .history-empty").first()).toBeVisible();
});

test("Kontaktverlauf verwirft verspätete Antworten eines zuvor geöffneten Kontakts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Der wiederverwendete Desktop-Drawer ist für diesen Regressionspfad maßgeblich.");

  await page.goto(`${PAGES_APP}#contacts`);
  await page.evaluate(() => {
    const originalGetContactChanges = window.dataService.getContactChanges.bind(window.dataService);
    let releaseContactOne;
    const contactOneGate = new Promise((resolve) => {
      releaseContactOne = resolve;
    });
    const contactOneRequests = [];
    window.__releaseContactOneChanges = async () => {
      releaseContactOne();
      await Promise.all(contactOneRequests);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    };
    window.dataService.getContactChanges = (contactId, options) => {
      const request = originalGetContactChanges(contactId, options);
      if (contactId !== "demo-contact-01") return request;
      const heldRequest = Promise.resolve(request).then(async (changes) => {
        await contactOneGate;
        return changes;
      });
      contactOneRequests.push(heldRequest);
      return heldRequest;
    };
  });

  const drawer = page.locator("#detail-drawer");
  await page.locator('#contact-list [data-id="demo-contact-01"]').click();
  await drawer.locator('[data-detail-tab="activity"]').click();
  await expect(drawer.locator("#history-timeline .history-loading")).toBeVisible();
  await drawer.locator("#detail-close").click();

  await page.locator('#contact-list [data-id="demo-contact-02"]').click();
  await drawer.locator('[data-detail-tab="activity"]').click();
  await expect(drawer.locator("#history-timeline")).toContainText("Verantwortung zugeordnet");
  await page.evaluate(() => window.__releaseContactOneChanges());
  await expect(drawer.locator("#history-timeline")).toContainText("Verantwortung zugeordnet");
  await expect(drawer.locator("#history-timeline")).not.toContainText("Kontaktdaten aktualisiert");
});

test("Kontakt-Formate zeigen keinen Einladungsstatus und das Format-Akkordeon kein Personenbild", async ({ page }) => {
  await page.goto(`${PAGES_APP}#person/contact/demo-contact-01?tab=formats`);
  const profile = page.locator("#person-profile-body");
  const formatSection = profile.locator("[data-format-profile-section]");
  await expect(formatSection).toBeVisible();
  await expect(formatSection.locator("[data-format-profile-status], .format-participation-status")).toHaveCount(0);

  await page.evaluate(() => { window.location.hash = "#formats"; });
  const format = page.locator('[data-format-detail="demo-format-krankenhausentlassbrief"]');
  await expect(format).toBeVisible();
  if (!await format.evaluate((node) => node.classList.contains("is-open"))) {
    await format.locator("[data-toggle-format-detail]").click();
  }
  await expect(format.locator(".format-overview-hero")).toBeVisible();
  await expect(format.locator(".format-overview-visual, .format-roundtable-illustration")).toHaveCount(0);
});
