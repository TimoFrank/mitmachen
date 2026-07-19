import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const PROFILE_ID = "demo-profile-notes";
const CONTACT_ID = "demo-contact-notes-01";

function contactNotesBackendFixtureScript(role = "admin") {
  return `
    (() => {
      const now = "2026-07-16T12:00:00.000Z";
      const profile = {
        id: ${JSON.stringify(PROFILE_ID)},
        email: "notizen@tests.example.invalid",
        display_name: "Demo Notizkonto",
        initials: "DN",
        role: ${JSON.stringify(role)},
        active: true,
        avatar_url: "",
        team: "Versorgung",
        created_at: now,
        updated_at: now
      };
      const contact = {
        id: ${JSON.stringify(CONTACT_ID)},
        name: "Demo-Kontakt Notizen 01",
        displayName: "Demo-Kontakt Notizen 01",
        organization: "Demo-Praxis Notizen",
        category: "Praxis",
        sector: "Praxis",
        specialty: "Allgemeinmedizin",
        priority: "Mittel",
        ownerId: profile.id,
        ownerIds: [profile.id],
        owner: profile.display_name,
        city: "Berlin",
        state: "Berlin",
        postalCode: "10115",
        note: "Bisherige datenschutzkonforme Notiz",
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA = {
        profiles: [profile],
        contacts: [contact],
        organizations: [],
        formats: [],
        hospitationSlots: [],
        hospitations: [],
        changes: [],
        activityEvents: [],
        savedViews: [],
        userSettings: {
          userId: profile.id,
          defaultViewType: "contacts",
          tableDensity: "comfortable",
          theme: "system",
          fontScale: 1,
          pageSize: 20,
          preferences: { onboarding: { version: 1, profileCompletedAt: now, tourSkippedAt: now } }
        }
      };
    })();
  `;
}

async function openNotesTab(page) {
  const profile = page.locator("#person-profile-body");
  await profile.getByRole("tab", { name: /Notizen/ }).click();
  await expect(profile.locator("#detail-notes")).toBeVisible();
  return profile;
}

test("Issue 29: Chat-Nachricht, subtiler Anhang, Profilsuche und Deep Link funktionieren gemeinsam", async ({ page }) => {
  await gotoAuthenticated(page, `/frontend/app/versorgungs-kompass.html#person/contact/${CONTACT_ID}`, {
    role: "admin",
    backendFixtureScript: contactNotesBackendFixtureScript("admin")
  });

  const profile = await openNotesTab(page);
  const composer = profile.locator("#contact-notes-composer");
  await expect(composer).toBeVisible();
  await expect(composer.locator("input[name='contentType']")).toHaveCount(0);
  await expect(composer.locator("input[name='emailSubject']")).toHaveCount(0);
  await expect(composer.getByRole("button", { name: "Dokument anhängen" })).toBeVisible();

  const extractedSamples = await page.evaluate(async () => {
    const samples = [
      ["/public/hospitation/mitmachen-hospitations-framework.pdf", "application/pdf", "framework.pdf"],
      ["/public/hospitation/mitmachen-hospitations-framework.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "framework.docx"]
    ];
    return Promise.all(samples.map(async ([path, type, name]) => {
      const blob = await fetch(path).then((response) => response.blob());
      return window.DocumentTextExtractor.extract(new File([blob], name, { type }));
    }));
  });
  expect(extractedSamples.map((sample) => sample.status)).toEqual(["complete", "complete"]);
  expect(extractedSamples.every((sample) => sample.text.includes("Hospitations-Framework"))).toBe(true);

  await composer.locator("textarea[name='message']").fill("Entwurf bleibt beim Tabwechsel erhalten");
  await profile.getByRole("tab", { name: "Überblick" }).click();
  await profile.getByRole("tab", { name: /Notizen/ }).click();
  await expect(profile.locator("#contact-notes-message")).toHaveValue("Entwurf bleibt beim Tabwechsel erhalten");

  await composer.locator("textarea[name='message']").fill("Suchanker-Epsilon\n<img src=x onerror=window.issue29Xss=true>");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await composer.getByRole("button", { name: "Dokument anhängen" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "befund-uebergabe.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Extraktionsanker-Zeta steht nur im Anhang.", "utf8")
  });
  await expect(profile.locator(".contact-note-pending-file")).toContainText("befund-uebergabe.txt");
  await profile.locator("#contact-notes-composer").getByRole("button", { name: "Notiz senden" }).click();

  const savedNote = profile.locator("[data-contact-note]").filter({ hasText: "Suchanker-Epsilon" }).first();
  await expect(savedNote).toBeVisible();
  await expect(savedNote).toContainText("befund-uebergabe.txt");
  await expect(savedNote).toContainText("Text durchsuchbar");
  await expect(savedNote.locator("img[src='x']")).toHaveCount(0);
  await expect(page.evaluate(() => window.issue29Xss)).resolves.toBeUndefined();
  await expect(savedNote.locator("[data-delete-contact-note]")).toBeDisabled();

  const longMessage = `${"Lange Chat-Nachricht mit ausreichend Inhalt. ".repeat(18)}Ende-Lambda`;
  await profile.locator("#contact-notes-message").fill(longMessage);
  await profile.locator("#contact-notes-composer").getByRole("button", { name: "Notiz senden" }).click();
  const longNote = profile.locator("[data-contact-note]").filter({ hasText: "Lange Chat-Nachricht" }).first();
  const longText = longNote.locator(".contact-note-long-text");
  await expect(longText).not.toHaveAttribute("open", "");
  await expect(longText.getByText("Mehr anzeigen")).toBeVisible();
  await longText.locator("summary").click();
  await expect(longText).toHaveAttribute("open", "");
  await expect(longText.getByText("Weniger anzeigen")).toBeVisible();
  await expect(longText.locator(".format-chat-text")).toContainText("Ende-Lambda");

  await profile.locator(".contact-notes-search").fill("Extraktionsanker-Zeta");
  await expect(profile.locator("[data-contact-note]")).toHaveCount(1);
  await profile.locator(".contact-notes-search").fill("");

  const downloadPromise = page.waitForEvent("download");
  await savedNote.locator("[data-download-contact-note-attachment]").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("befund-uebergabe.txt");

  await profile.locator("[data-person-profile-back]").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "contacts");
  await page.locator("#search").fill("Extraktionsanker-Zeta");
  const searchResult = page.locator("#contact-content-search-results [data-contact-content-result]").filter({ hasText: "befund-uebergabe.txt" });
  await expect(searchResult).toBeVisible();
  await searchResult.click();
  await expect(page).toHaveURL(/#person\/contact\/demo-contact-notes-01\?tab=notes&note=/);
  await expect(page.locator("#detail-notes")).toBeVisible();
  await expect(page.locator(".contact-note-message--target")).toContainText("Suchanker-Epsilon");

  await page.setViewportSize({ width: 360, height: 780 });
  const overflow = await page.locator("html").evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Issue 29: Viewer sehen Notizen und Suche, aber keine Schreib- oder Löschaktionen", async ({ page }) => {
  await gotoAuthenticated(page, `/frontend/app/versorgungs-kompass.html#person/contact/${CONTACT_ID}?tab=notes`, {
    role: "viewer",
    backendFixtureScript: contactNotesBackendFixtureScript("viewer")
  });

  const profile = page.locator("#person-profile-body");
  await expect(profile.locator("#detail-notes")).toBeVisible();
  await expect(profile).toContainText("Bisherige datenschutzkonforme Notiz");
  await expect(profile.locator("#contact-notes-composer")).toHaveCount(0);
  await expect(profile.locator("[data-delete-contact-note]")).toHaveCount(0);
  await expect(profile.locator(".contact-notes-search")).toBeVisible();
  await expect(profile).toContainText(/Leserechte/);
});
