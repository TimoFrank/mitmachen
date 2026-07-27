import { expect, test } from "@playwright/test";

const APP = "/dist/pages/versorgungs-kompass.html";

async function openDemo(page, hash) {
  await page.goto(`${APP}${hash}`);
  const demoNotice = page.getByRole("note", { name: "Hinweis zur öffentlichen Demo" });
  if (await demoNotice.isVisible().catch(() => false)) {
    await demoNotice.getByRole("button", { name: "OK" }).click();
  }
}

test.describe("Hospitations-Usability-Fixes", () => {
  test("Fragebogen validiert Kontext, Beobachtung und Codierung schrittweise", async ({ page }) => {
    await openDemo(page, "#questionnaire");
    const context = page.locator('[data-questionnaire-step="1"]');
    const observation = page.locator('[data-questionnaire-step="2"]');
    const coding = page.locator('[data-questionnaire-step="3"]');

    await context.getByRole("button", { name: "Schritt abschließen" }).click();
    await expect(context).toHaveAttribute("open", "");
    await expect(context.locator("[data-questionnaire-step-validation]")).toContainText("Datum");
    await expect(page.locator("#questionnaire-date")).toBeFocused();

    await page.locator("#questionnaire-date").fill("2026-07-24");
    await page.locator("#questionnaire-organization").selectOption("demo-org-elbesozial");
    await context.getByRole("button", { name: "Schritt abschließen" }).click();
    await expect(observation).toHaveAttribute("open", "");

    await observation.getByRole("button", { name: "Schritt abschließen" }).click();
    await expect(observation).toHaveAttribute("open", "");
    await expect(observation.locator("[data-questionnaire-step-validation]")).toContainText("Kurztitel");
    await expect(page.locator('input[name="questionnaireObservations[1][title]"]')).toBeFocused();

    await page.locator('input[name="questionnaireObservations[1][title]"]').fill("Rückfrage im Übergabeprozess");
    await page.locator('textarea[name="questionnaireObservations[1][observation]"]').fill("Die Pflegefachperson ruft wegen eines fehlenden Befunds zurück.");
    await observation.getByRole("button", { name: "Schritt abschließen" }).click();
    await expect(coding).toHaveAttribute("open", "");

    await coding.getByRole("button", { name: "Schritt abschließen" }).click();
    await expect(coding).toHaveAttribute("open", "");
    await expect(coding.locator("[data-questionnaire-step-validation]")).toContainText("Relevanz");
    await expect(coding.locator(".questionnaire-select-shell.is-invalid")).toHaveCount(5);
    await expect(coding.locator(".custom-select-trigger").first()).toBeFocused();
  });

  test("bestehender Termin übernimmt auch spät gelistete Kontaktperson", async ({ page }) => {
    await openDemo(page, "#questionnaire");
    await page.locator("#questionnaire-hospitation-container").selectOption("demo-hospitation-sozialdienst-rehaantrag");

    await expect(page.locator("#questionnaire-date")).toHaveValue("2026-07-24");
    await expect(page.locator("#questionnaire-organization")).toHaveValue("demo-org-elbesozial");
    await expect(page.locator("#questionnaire-contact")).toHaveValue("demo-contact-89");
    await expect(page.locator('[data-select-type="questionnaire-contact"] .custom-select-trigger')).toContainText("Nele Hoffmann");
    await expect(page.locator("#questionnaire-context-notes")).not.toHaveValue("");
  });

  test("Terminwechsel übernimmt immer das Ziel des neu gewählten Termins", async ({ page }) => {
    await openDemo(page, "#questionnaire");
    const container = page.locator("#questionnaire-hospitation-container");
    const contextGoal = page.locator("#questionnaire-context-notes");

    await container.selectOption("demo-hospitation-medikationsabgleich-entlassung");
    await expect(contextGoal).toHaveValue(
      "Den Medikationsabgleich nach einer Krankenhausentlassung im laufenden Praxisbetrieb beobachten."
    );

    await container.selectOption("demo-hospitation-entlassmanagement");
    await expect(contextGoal).toHaveValue(
      "Die Vorbereitung einer ambulanten Weiterbehandlung am Entlasstag nachvollziehen."
    );

    await container.selectOption("__new__");
    await expect(contextGoal).toHaveValue("");
    await expect(page.locator("#questionnaire-date")).toHaveValue("");
    await expect(page.locator("#questionnaire-setting")).toHaveValue("");
    await expect(page.locator("#questionnaire-organization")).toHaveValue("");
    await expect(page.locator("#questionnaire-contact")).toHaveValue("");
  });

  test("Jahreskalender verwendet die Statusfarben der Legende", async ({ page }) => {
    await openDemo(page, "#hospitations");
    await page.getByRole("button", { name: "Kalender" }).click();
    await page.getByRole("button", { name: "Jahr" }).click();
    const events = page.locator(".hospitation-calendar-year-event");
    await expect(events.first()).toBeVisible();
    const tones = await events.evaluateAll((items) => items.map((item) => ({
      className: item.className,
      accent: getComputedStyle(item).getPropertyValue("--hospitation-event-accent").trim()
    })));
    expect(tones.find((item) => item.className.includes("documented"))?.accent).toBe("#16a34a");
    expect(new Set(tones.map((item) => item.accent).filter(Boolean)).size).toBeGreaterThan(1);
  });

  test("Fallvergleichsmatrix ist sichtbar horizontal bedienbar", async ({ page }) => {
    await openDemo(page, "#hospitations:observations");
    const panel = page.locator(".observation-analysis-panel");
    await panel.locator("summary").click();
    const matrix = panel.locator(".observation-matrix-wrap");
    await expect(panel.locator(".observation-matrix-toolbar")).toBeVisible();
    await expect(matrix).toHaveAttribute("tabindex", "0");
    await expect.poll(() => matrix.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await panel.getByRole("button", { name: "Fallvergleichsmatrix nach rechts verschieben" }).click();
    await expect.poll(() => matrix.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  });

  test("Termineditor richtet alle fünf Schritte in einer Zeile aus", async ({ page }) => {
    await openDemo(page, "#hospitations");
    await page.getByRole("button", { name: "+ Neuer Termin" }).click();
    const stepper = page.locator("#hospitation-editor-steps");
    await expect(stepper).toBeVisible();
    await expect(page.locator('[data-select-type="hospitation-contact"] .custom-select-trigger')).toBeFocused();
    const geometry = await stepper.evaluate((node) => ({
      columns: getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
      tops: [...node.children].map((child) => Math.round(child.getBoundingClientRect().top))
    }));
    expect(geometry.columns).toBe(5);
    expect(new Set(geometry.tops).size).toBe(1);
  });

  test("Dashboard und Framework zählen dieselben dokumentierten Beobachtungen", async ({ page }) => {
    await openDemo(page, "#hospitations:dashboard");
    const observationKpi = page.locator(".hospitation-dashboard-kpi-card", { hasText: "Beobachtungen" });
    await expect(observationKpi.locator(".hospitation-dashboard-kpi-card__value")).toHaveText("69");
    await page.getByRole("button", { name: "Framework", exact: true }).click();
    const frameworkModel = page.getByRole("region", { name: "Von Beobachtung zum nächsten Schritt" });
    await expect(frameworkModel.locator(".hospitation-dashboard-funnel-badge").first()).toHaveText("69");
  });
});
