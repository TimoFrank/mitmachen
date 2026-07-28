import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

test("Format-Liveflow: anlegen, Kandidat auswählen und Beteiligungsstatus pflegen", async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#formats");

  await page.locator("#search").fill("Nichtpassender Suchbegriff");
  await page.locator("#new-format-button").click();
  await expect(page.locator("#format-editor-drawer")).toHaveAttribute("aria-hidden", "false");
  expect(pageErrors).toEqual([]);
  await page.locator("#format-title").fill("Matrix Roundtable Versorgung");
  await page.locator("#format-title").press("Enter");
  await expect(page.locator('[data-format-editor-step="planung"]')).toBeVisible();
  await page.locator("#format-editor-next").click();
  await page.locator("#format-editor-form").getByRole("button", { name: "Format anlegen" }).click();

  const createdFormat = page.locator('[data-format-detail]', { hasText: "Matrix Roundtable Versorgung" }).first();
  await expect(page.locator("#search")).toHaveValue("");
  await expect(createdFormat).toHaveClass(/is-open/);
  await expect(page.locator("#open-participant-planner")).toBeFocused();

  await createdFormat.getByRole("tab", { name: "Teilnehmer" }).click();
  await page.locator("#open-participant-planner").click();
  await page.locator("#format-participant-search").fill("Demo-Kontakt 08");
  await page.locator("#format-participant-next").click();
  const candidate = page.locator('[data-planner-contact="demo-contact-08"] input');
  await expect(candidate).toBeVisible();
  await candidate.check();
  await page.locator("#format-participant-add").click();

  const status = createdFormat.locator('[data-participant-field="invitationStatus"]');
  await expect(status).toHaveValue("Kandidat");
  await status.selectOption("Eingeladen");
  await expect(status).toHaveValue("Eingeladen");

  const screenshotPath = testInfo.outputPath(`format-liveflow-${testInfo.project.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("format-liveflow", { path: screenshotPath, contentType: "image/png" });
});
