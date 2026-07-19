import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZVbkAAAAASUVORK5CYII=",
  "base64"
);

async function openFirstContactProfile(page) {
  const firstContact = page.locator("#contact-list .row, #contact-list .mobile-contact-card").first();
  await expect(firstContact).toBeVisible();
  await firstContact.click();
  const profileButton = page.locator("#detail-open-profile");
  if (await profileButton.isVisible()) await profileButton.click();
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
}

test("Kontaktbild im Profil hochladen, per HTTPS-Link ersetzen und entfernen", async ({ page }) => {
  await page.route("https://images.example.test/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "editor" });
  await openFirstContactProfile(page);

  await page.locator("#person-profile-body #detail-image-edit").click();
  const imageForm = page.locator("#person-profile-body #detail-image-form");
  await expect(imageForm).toBeVisible();
  await imageForm.locator('input[name="imageFile"]').setInputFiles({
    name: "kontakt.png",
    mimeType: "image/png",
    buffer: PNG_1X1
  });
  await imageForm.getByRole("button", { name: "Bild speichern" }).click();
  await expect(imageForm).toHaveCount(0);
  await expect(page.locator("#person-profile-body .contact-profile-image img")).toHaveAttribute("src", /\/api\/contact-images\//);

  await page.locator("#person-profile-body #detail-image-edit").click();
  await page.locator('#person-profile-body #detail-image-form input[name="imageUrl"]').fill("https://images.example.test/contact.png");
  await page.locator("#person-profile-body #detail-image-form").getByRole("button", { name: "Bild speichern" }).click();
  await expect(page.locator("#person-profile-body #detail-image-form")).toHaveCount(0);
  await expect(page.locator("#person-profile-body .contact-profile-image img")).toHaveAttribute("src", "https://images.example.test/contact.png");

  await page.locator("#person-profile-body #detail-image-edit").click();
  await page.locator("#person-profile-body #detail-image-form").getByRole("button", { name: "Bild entfernen" }).click();
  await expect(page.locator("#person-profile-body #detail-image-form")).toHaveCount(0);
  await expect(page.locator("#person-profile-body .contact-profile-image img")).toHaveCount(0);
  await expect(page.locator("#person-profile-body .contact-profile-image .avatar-fallback")).toBeVisible();
});

test("Kontaktbild ist schon bei der Kontaktanlage verfügbar", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "editor" });
  await page.locator("#new-contact-button").click();
  await page.locator("#field-name").fill("Bildkontakt Test");
  for (let step = 0; step < 4; step += 1) await page.locator("#editor-next").click();
  await expect(page.locator('[data-editor-step="sources"]')).toBeVisible();
  await page.locator('#editor-form input[name="imageFile"]').setInputFiles({
    name: "neuer-kontakt.png",
    mimeType: "image/png",
    buffer: PNG_1X1
  });
  await page.locator("#editor-save").click();
  await expect(page.locator("#person-profile-page.is-active")).toBeVisible();
  await expect(page.locator("#person-profile-body h3")).toContainText("Bildkontakt Test");
  await expect(page.locator("#person-profile-body .contact-profile-image img")).toHaveAttribute("src", /\/api\/contact-images\//);
});

test("Viewer sehen Kontaktbilder, aber keine Bildbearbeitung", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "viewer" });
  await openFirstContactProfile(page);
  await expect(page.locator("#person-profile-body .contact-profile-image")).toBeVisible();
  await expect(page.locator("#detail-image-edit")).toHaveCount(0);
  await expect(page.locator("#detail-image-form")).toHaveCount(0);
});

test("Kontaktbild-Editor erklärt ungültige Links und Dateitypen", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "editor" });
  await openFirstContactProfile(page);
  await page.locator("#person-profile-body #detail-image-edit").click();
  const imageForm = page.locator("#person-profile-body #detail-image-form");
  await imageForm.locator('input[name="imageUrl"]').fill("http://images.example.test/contact.png");
  await imageForm.getByRole("button", { name: "Bild speichern" }).click();
  await expect(imageForm.locator("[data-contact-image-status]")).toContainText("HTTPS");

  await imageForm.locator('input[name="imageFile"]').setInputFiles({
    name: "kein-bild.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("kein Bild")
  });
  await imageForm.getByRole("button", { name: "Bild speichern" }).click();
  await expect(imageForm.locator("[data-contact-image-status]")).toContainText("JPG-, PNG- oder WebP");
});
