import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

function expectNoContactChannelNullError(errors) {
  expect(errors.filter((message) => message.includes("contactChannelAccess"))).toEqual([]);
}

test("Versorgung: Die Kontakt-Neuanlage öffnet mit leeren Kontaktwegen", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "editor" });

  await page.locator("#new-contact-button").click();

  await expect(page.locator("#editor-drawer")).toHaveClass(/is-open/);
  await expect(page.locator("#editor-title")).toHaveText("Neuen Kontakt anlegen");
  await expect(page.locator("#field-email")).toHaveValue("");
  await expect(page.locator("#field-phone")).toHaveValue("");
  expectNoContactChannelNullError(pageErrors);
});

test("Patienten: Die Kontakt-Neuanlage öffnet im Personenmodus", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#patients", { role: "editor" });
  await page.locator('#patient-mode-actions [data-patient-mode="people"]').click();

  await page.locator("#new-patient-contact-button").click();

  await expect(page.locator("#editor-drawer")).toHaveClass(/is-open/);
  await expect(page.locator("#editor-title")).toHaveText("Patienten-Kontakt anlegen");
  await expect(page.locator("#field-email")).toHaveValue("");
  await expect(page.locator("#field-phone")).toHaveValue("");
  expectNoContactChannelNullError(pageErrors);
});

test("Expertenkreis: Die Kontakt-Neuanlage öffnet im Kontaktmodus", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#experts", { role: "editor" });

  await expect(page.locator("#new-expert-contact-button")).toBeEnabled();
  await page.locator("#new-expert-contact-button").click();

  await expect(page.locator("#editor-drawer")).toHaveClass(/is-open/);
  await expect(page.locator("#editor-title")).toHaveText("Expertenkreis-Kontakt anlegen");
  await expect(page.locator("#field-email")).toHaveValue("");
  await expect(page.locator("#field-phone")).toHaveValue("");
  expectNoContactChannelNullError(pageErrors);
});

test("Kontaktsuche erklärt lokale Organisationstreffer ohne widersprüchlichen Leerzustand", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
    role: "editor",
    backendFixtureScript: `
      window.VERSORGUNGS_COMPASS_CONTACTS = [
        { id: "search-contact-1", name: "Anna Adler", organization: "MVZ Spreewinkel", category: "Praxis", priority: "Mittel", city: "Berlin", state: "Berlin", status: "active" },
        { id: "search-contact-2", name: "Boris Brandt", organization: "MVZ Spreewinkel", category: "Praxis", priority: "Mittel", city: "Berlin", state: "Berlin", status: "active" },
        { id: "search-contact-3", name: "Carla Conrad", organization: "MVZ Spreewinkel", category: "Praxis", priority: "Mittel", city: "Berlin", state: "Berlin", status: "active" },
        { id: "search-contact-4", name: "Dora Dietrich", organization: "Praxis West", category: "Praxis", priority: "Mittel", city: "Potsdam", state: "Brandenburg", status: "active" }
      ];
    `
  });

  await page.locator("#search").fill("MVZ Spreewinkel");

  await expect(page.locator("#contact-list [data-id]")).toHaveCount(3);
  const searchState = page.locator("#contact-content-search-results .contact-content-search-state");
  await expect(searchState).toHaveText("3 Treffer in der Kontaktliste. Keine zusätzlichen Treffer in Notizen oder Anhängen.");
  await expect(searchState).not.toContainText("Keine Treffer in Kontakten");
});
