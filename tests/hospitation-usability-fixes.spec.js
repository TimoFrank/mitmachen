import { expect, test } from "@playwright/test";

const APP = "/dist/pages/versorgungs-kompass.html";
const QUESTIONNAIRE = "#hospitation-overview?tab=questionnaire";
const HOSPITATIONS = "#hospitations:synthesis?stage=hospitations";
const OBSERVATIONS = "#hospitations:synthesis?stage=observations";
const HOSPITATION_TITLE = '[data-synthesis-table="hospitations"] .hs-main-link[data-synthesis-hospitation]';

function questionnaire(page) {
  return page.locator("#ho-panel-questionnaire #hospitation-questionnaire-form");
}

async function openDemo(page, route) {
  await page.goto(`${APP}${route}`);
  const demoNotice = page.getByRole("note", { name: "Hinweis zur öffentlichen Demo" });
  if (await demoNotice.isVisible().catch(() => false)) {
    await demoNotice.getByRole("button", { name: "OK" }).click();
  }
}

test.describe("Hospitations-Usability-Fixes", () => {
  test("Fragebogen validiert Kontext und Beobachtung und lässt Codierung freiwillig", async ({ page }) => {
    await openDemo(page, QUESTIONNAIRE);
    const form = questionnaire(page);
    const context = form.locator('[data-questionnaire-step="1"]');
    const observation = form.locator('[data-questionnaire-step="2"]');
    const coding = form.locator('[data-questionnaire-step="3"]');
    const navigation = form.locator("[data-questionnaire-mobile-navigation]");
    const advanceStep = () => navigation.locator("[data-questionnaire-step-next]").click();

    await expect(navigation).toBeVisible();
    await expect(context.getByRole("button", { name: "Schritt abschließen" })).toBeHidden();
    await advanceStep();
    await expect(context).toHaveAttribute("open", "");
    await expect(context.locator("[data-questionnaire-step-validation]")).toContainText("Datum");
    await expect(form.locator("#questionnaire-date")).toBeFocused();

    await form.locator("#questionnaire-date").fill("2026-07-24");
    await form.locator("#questionnaire-organization").selectOption("demo-org-elbesozial");
    await advanceStep();
    await expect(observation).toHaveAttribute("open", "");

    await advanceStep();
    await expect(observation).toHaveAttribute("open", "");
    await expect(observation.locator("[data-questionnaire-step-validation]")).toContainText("Kurzfassung");
    await expect(form.locator('input[name="questionnaireObservations[1][title]"]')).toBeFocused();

    await form.locator('input[name="questionnaireObservations[1][title]"]').fill("Rückfrage im Übergabeprozess");
    await form.locator('textarea[name="questionnaireObservations[1][observation]"]').fill("Die Pflegefachperson ruft wegen eines fehlenden Befunds zurück.");
    await expect(observation.locator('select[name="questionnaireObservations[1][evidenceType]"]')).toHaveCount(0);
    await advanceStep();
    await expect(coding).toHaveAttribute("open", "");

    const codingField = (key) => coding.locator(`select[name="questionnaireObservations[1][${key}]"]`);
    for (const key of ["processPhase", "problemType", "impact", "observationType", "evidenceType"]) {
      await expect(codingField(key)).toHaveValue("");
      await expect(codingField(key)).toHaveJSProperty("required", false);
    }
    await expect(coding.locator('select[name="questionnaireObservations[1][relevance]"]')).toHaveCount(0);
    await expect(codingField("evidenceType").locator("option")).toHaveText([
      "Quelle noch offen", "direkt beobachtet", "berichtet", "Beobachtungsunterlage", "Annahme", "synthetisches Beispiel"
    ]);
    const codingGuide = coding.locator("[data-hospitation-codebook-guide]");
    const additionalCodingFields = coding.locator("[data-codebook-additional]");
    await expect(codingGuide).not.toHaveAttribute("open", "");
    await expect(codingGuide.locator(":scope > summary")).toHaveText("Codierung verstehen");
    await expect(codingGuide.locator("[data-hospitation-journey]")).toBeHidden();
    await expect(additionalCodingFields).not.toHaveAttribute("open", "");
    await expect(additionalCodingFields.locator("textarea")).toHaveCount(3);
    await expect(additionalCodingFields.locator("textarea").first()).toBeHidden();

    await advanceStep();
    const material = form.locator('[data-questionnaire-step="4"]');
    await expect(material).toHaveAttribute("open", "");
    await expect(coding).not.toHaveAttribute("open", "");
    await expect(coding.locator("[data-questionnaire-step-validation]")).toBeHidden();
    await expect(coding.locator(".is-invalid")).toHaveCount(0);

    await navigation.locator("[data-questionnaire-step-previous]").click();
    await expect(coding).toHaveAttribute("open", "");
    await codingField("processPhase").selectOption("Übergang");
    await additionalCodingFields.locator(":scope > summary").click();
    await codingField("observationType").selectOption("Hindernis");
    await codingField("problemType").selectOption("Information fehlt");
    await codingField("impact").selectOption("Zusätzliche Arbeit");
    await codingField("evidenceType").selectOption("reported");
    const sourceReference = coding.locator('textarea[name="questionnaireObservations[1][sourceReference]"]');
    await sourceReference.fill("Fiktiver Testbericht der Pflegefachperson, 24.07.2026");
    await expect(codingGuide.locator('[data-hospitation-journey] [aria-current="step"]')).toHaveCount(0);
    await advanceStep();
    await expect(material).toHaveAttribute("open", "");
    await expect(coding.locator(".is-invalid")).toHaveCount(0);
    await expect(codingField("processPhase")).toHaveValue("Übergang");
    await expect(codingField("problemType")).toHaveValue("Information fehlt");
    await expect(codingField("impact")).toHaveValue("Zusätzliche Arbeit");
    await expect(codingField("observationType")).toHaveValue("Hindernis");
    await expect(codingField("evidenceType")).toHaveValue("reported");
    await expect(sourceReference).toHaveValue("Fiktiver Testbericht der Pflegefachperson, 24.07.2026");
  });

  test("Fragebogen speichert eine vollständige Beobachtung mit offener Quelle und Codierung", async ({ page }) => {
    await openDemo(page, QUESTIONNAIRE);
    const form = questionnaire(page);
    const step = (number) => form.locator(`[data-questionnaire-step="${number}"]`);
    const advanceStep = () => form.locator("[data-questionnaire-step-next]").click();
    const title = "Rückfrage zunächst ohne Codierung";
    const description = "Die Pflegefachperson ruft wegen eines fehlenden Befunds zurück.";

    await form.locator("#questionnaire-date").fill("2026-07-24");
    await form.locator("#questionnaire-organization").selectOption("demo-org-elbesozial");
    await advanceStep();
    await expect(step(2)).toHaveAttribute("open", "");
    await form.locator('input[name="questionnaireObservations[1][title]"]').fill(title);
    await form.locator('textarea[name="questionnaireObservations[1][observation]"]').fill(description);
    await advanceStep();
    await expect(step(3)).toHaveAttribute("open", "");
    for (const field of ["evidenceType", "processPhase", "problemType", "impact", "observationType"]) {
      const control = step(3).locator(`select[name="questionnaireObservations[1][${field}]"]`);
      await expect(control).toHaveValue("");
      await expect(control).not.toHaveAttribute("required", "");
    }
    await advanceStep();
    for (const number of [4, 5, 6]) {
      await expect(step(number)).toHaveAttribute("open", "");
      await advanceStep();
    }
    await expect(step(7)).toHaveAttribute("open", "");
    await form.locator("[data-questionnaire-submit]").click();
    await expect(form.locator("[data-questionnaire-save-status]")).toContainText("In Termin übernommen");
    await form.locator("[data-questionnaire-open-container]").click();
    const drawer = page.locator("#hospitation-editor-drawer");
    await expect(drawer).toHaveClass(/is-open/);
    const saved = drawer.locator('[data-repeatable-card][data-repeatable-type="observation"]').first();
    await expect(saved.locator('[data-repeatable-field="title"]')).toHaveValue(title);
    await expect(saved.locator('[data-repeatable-field="observed"]')).toHaveValue(description);
    for (const field of ["evidenceType", "processPhase", "problemType", "impact", "observationType", "relevanceScore"]) {
      await expect(saved.locator(`[data-repeatable-field="${field}"]`)).toHaveValue("");
    }
  });

  test("bestehender Termin übernimmt auch spät gelistete Kontaktperson", async ({ page }) => {
    await openDemo(page, QUESTIONNAIRE);
    const form = questionnaire(page);
    await form.locator("#questionnaire-hospitation-container").selectOption("demo-hospitation-sozialdienst-rehaantrag");

    await expect(form.locator("#questionnaire-date")).toHaveValue("2026-07-24");
    await expect(form.locator("#questionnaire-organization")).toHaveValue("demo-org-elbesozial");
    await expect(form.locator("#questionnaire-contact")).toHaveValue("demo-contact-89");
    await expect(form.locator('[data-select-type="questionnaire-contact"] .custom-select-trigger')).toContainText("Nele Hoffmann");
    await expect(form.locator("#questionnaire-context-notes")).not.toHaveValue("");
  });

  test("Terminwechsel übernimmt immer das Ziel des neu gewählten Termins", async ({ page }) => {
    await openDemo(page, QUESTIONNAIRE);
    const form = questionnaire(page);
    const container = form.locator("#questionnaire-hospitation-container");
    const contextGoal = form.locator("#questionnaire-context-notes");

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
    await expect(form.locator("#questionnaire-date")).toHaveValue("");
    await expect(form.locator("#questionnaire-setting")).toHaveValue("");
    await expect(form.locator("#questionnaire-organization")).toHaveValue("");
    await expect(form.locator("#questionnaire-contact")).toHaveValue("");
  });

  test("Kalender verwendet in Jahresansicht und mobiler Agenda die Statusfarben", async ({ page }, testInfo) => {
    await openDemo(page, HOSPITATIONS);
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    const calendar = page.getByRole("region", { name: "Hospitationskalender" });
    const month = calendar.locator("[data-hfc-month]");

    if (testInfo.project.name.includes("mobile")) {
      const agenda = calendar.getByLabel("Terminagenda", { exact: true });
      await expect(calendar.locator(".hfc-grid")).toBeHidden();

      await month.fill("2026-07");
      const documented = agenda.locator('.hfc-event[data-status="done"]').first();
      await expect(documented).toBeVisible();
      await expect(documented).toHaveCSS("border-left-color", "rgb(0, 255, 100)");

      await month.fill("2026-08");
      const open = agenda.locator('.hfc-event[data-status="open"]').first();
      await expect(open).toBeVisible();
      await expect(open).toHaveCSS("border-left-color", "rgb(0, 14, 82)");
    } else {
      await calendar.getByRole("button", { name: "Jahr", exact: true }).click();
      await calendar.locator("[data-hfc-year]").fill("2026");
      const year = calendar.getByLabel("Monate im Jahr 2026", { exact: true });
      const documented = year.locator('.hfc-event[data-status="done"]').first();
      const open = year.locator('.hfc-event[data-status="open"]').first();
      await expect(documented).toBeVisible();
      await expect(open).toBeVisible();
      await expect(documented).toHaveCSS("border-left-color", "rgb(0, 255, 100)");
      await expect(open).toHaveCSS("border-left-color", "rgb(0, 14, 82)");
    }
  });

  test("Fallvergleichsmatrix in der bisherigen Hospitationsdokumentation bleibt horizontal bedienbar", async ({ page }) => {
    const viewport = page.viewportSize();
    if (viewport.width > 700) await page.setViewportSize({ ...viewport, width: 700 });
    await openDemo(page, "?standalone=hospitation-documentation#hospitations:observations");
    const panel = page.locator(".observation-analysis-panel");
    await panel.locator("summary").click();
    const matrix = panel.locator(".observation-matrix-wrap");
    await expect(panel.locator(".observation-matrix-toolbar")).toBeVisible();
    await expect(matrix).toHaveAttribute("tabindex", "0");
    await expect.poll(() => matrix.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await panel.getByRole("button", { name: "Fallvergleichsmatrix nach rechts verschieben" }).click();
    await expect.poll(() => matrix.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  });

  test("Beobachtungstabelle im Framework lässt sich horizontal per Tastatur verschieben", async ({ page }) => {
    const viewport = page.viewportSize();
    if (viewport.width > 1024) await page.setViewportSize({ ...viewport, width: 1024 });
    await openDemo(page, OBSERVATIONS);

    const grid = page.locator(".hs-table-scroll", { has: page.locator('[data-synthesis-table="observations"]') });
    await expect(grid).toBeVisible();
    await expect(grid).toHaveAttribute("tabindex", "0");
    await expect.poll(() => grid.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await grid.press("ArrowRight");
    await expect.poll(() => grid.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  });

  test("Termineditor richtet alle vier Schritte in einer Zeile aus", async ({ page }, testInfo) => {
    await openDemo(page, HOSPITATIONS);
    await page.getByRole("button", { name: "Hospitation planen", exact: true }).click();
    const stepper = page.locator("#hospitation-editor-steps");
    await expect(stepper).toBeVisible();
    await expect(stepper.locator(".import-step")).toHaveCount(4);
    await expect(stepper.locator(".import-step").nth(0)).toContainText("Grundlagen");
    await expect(stepper.locator(".import-step").nth(3)).toContainText("Notiz");
    const geometry = await stepper.evaluate((node) => ({
      columns: getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
      tops: [...node.children].map((child) => Math.round(child.getBoundingClientRect().top))
    }));
    if (!testInfo.project.name.includes("mobile")) expect(geometry.columns).toBe(4);
    expect(new Set(geometry.tops).size).toBe(1);
  });

  test("neuer Termin legt Kontakt und Organisation an und speichert nur Drawer-Felder", async ({ page }) => {
    await openDemo(page, HOSPITATIONS);
    await page.getByRole("button", { name: "Hospitation planen", exact: true }).click();
    const drawer = page.locator("#hospitation-editor-drawer");

    await expect(drawer.locator("#hospitation-contact-name")).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Termin speichern" })).toBeHidden();
    await drawer.locator("#hospitation-contact").fill("Ada Pflege");
    await expect(drawer.locator('[data-hospitation-entity-create="Ada Pflege"]')).toBeVisible();
    await drawer.locator("#hospitation-organization").fill("Pflegezentrum Morgenrot");
    await expect(drawer.locator('[data-hospitation-entity-create="Pflegezentrum Morgenrot"]')).toBeVisible();

    await drawer.locator("#hospitation-editor-next").click();
    await drawer.locator("#hospitation-date").fill("2098-04-23");
    await drawer.locator("#hospitation-location").fill("Station 3");
    await drawer.locator("#hospitation-editor-next").click();
    await drawer.locator("[data-documentation-theme-toggle]").first().click();
    await drawer.locator("#hospitation-editor-next").click();
    await expect(drawer.getByRole("button", { name: "Termin speichern" })).toBeVisible();
    await drawer.locator("#hospitation-request-message").fill("Bitte den Übergabeprozess besonders beachten.");
    await drawer.getByRole("button", { name: "Termin speichern" }).click();
    await expect(drawer).not.toHaveClass(/is-open/);

    const snapshot = await page.evaluate(() => window.VersorgungsCompassDemoApi.snapshot());
    const contact = snapshot.contacts.find((item) => (item.displayName || item.name) === "Ada Pflege");
    const organization = snapshot.organizations.find((item) => item.name === "Pflegezentrum Morgenrot");
    const hospitation = snapshot.hospitations.find((item) => item.contactId === contact?.id && item.scheduledOn === "2098-04-23");
    expect(contact).toBeTruthy();
    expect(organization).toBeTruthy();
    expect(contact.organizationId).toBe(organization.id);
    expect(hospitation?.organizationId).toBe(organization.id);
    expect(hospitation?.startsAt).toBeUndefined();
    expect(hospitation?.endsAt).toBeUndefined();
    expect(hospitation?.followUpOwnerId).toBeUndefined();
    expect(hospitation?.followUpDueAt).toBeUndefined();
    expect(Array.isArray(hospitation?.topics)).toBe(true);
    expect(JSON.parse(hospitation.requestNote)).toMatchObject({
      kind: "hospitation-request-thread-v1",
      messages: [{ text: "Bitte den Übergabeprozess besonders beachten." }]
    });

    const row = page.locator('[data-synthesis-table="hospitations"] tbody tr', { hasText: "Ada Pflege" });
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();
    await expect(row.locator(".hs-main-link[data-synthesis-hospitation]")).toHaveAttribute("data-synthesis-hospitation", hospitation.id);
  });

  test("exakt eingetippter bestehender Kontakt wird ohne Optionsklick wiederverwendet", async ({ page }) => {
    await openDemo(page, HOSPITATIONS);
    const candidate = await page.evaluate(() => {
      const snapshot = window.VersorgungsCompassDemoApi.snapshot();
      const activeContacts = snapshot.contacts.filter((item) => !["archived", "Archiviert"].includes(item.status));
      const contact = activeContacts.find((item) => {
        const name = String(item.displayName || item.name || "").trim().toLocaleLowerCase("de-DE");
        return name
          && item.organizationId
          && activeContacts.filter((other) =>
            String(other.displayName || other.name || "").trim().toLocaleLowerCase("de-DE") === name
          ).length === 1;
      });
      const organization = snapshot.organizations.find((item) => item.id === contact?.organizationId);
      return contact && organization
        ? { id: contact.id, name: contact.displayName || contact.name, organizationId: organization.id, organizationName: organization.name }
        : null;
    });
    expect(candidate).toBeTruthy();
    const contactsBefore = await page.evaluate(
      ({ name }) => window.VersorgungsCompassDemoApi.snapshot().contacts.filter((item) => (item.displayName || item.name) === name).length,
      candidate
    );

    await page.getByRole("button", { name: "Hospitation planen", exact: true }).click();
    const drawer = page.locator("#hospitation-editor-drawer");
    await drawer.locator("#hospitation-contact").fill(candidate.name);
    await drawer.locator("#hospitation-editor-next").click();
    await expect(drawer.locator('input[name="contactId"]')).toHaveValue(candidate.id);
    await expect(drawer.locator("#hospitation-organization")).toHaveValue(candidate.organizationName);
    await expect(drawer.locator('input[name="organizationId"]')).toHaveValue(candidate.organizationId);

    await drawer.locator("#hospitation-date").fill("2098-04-24");
    await drawer.locator("#hospitation-editor-next").click();
    await drawer.locator("#hospitation-editor-next").click();
    await drawer.getByRole("button", { name: "Termin speichern" }).click();
    await expect(drawer).not.toHaveClass(/is-open/);

    const result = await page.evaluate(({ id, name }) => {
      const snapshot = window.VersorgungsCompassDemoApi.snapshot();
      return {
        matchingContacts: snapshot.contacts.filter((item) => (item.displayName || item.name) === name).length,
        createdHospitation: snapshot.hospitations.find((item) => item.contactId === id && item.scheduledOn === "2098-04-24")
      };
    }, candidate);
    expect(result.matchingContacts).toBe(contactsBefore);
    expect(result.createdHospitation?.organizationId).toBe(candidate.organizationId);
  });

  test("Terminliste enthält nur echte Hospitationen und öffnet immer den Dokumentationsdrawer", async ({ page }) => {
    await openDemo(page, HOSPITATIONS);
    const entries = page.locator(HOSPITATION_TITLE);
    await expect(entries.first()).toBeVisible();
    const visibleIds = await entries.evaluateAll((nodes) => nodes.map((node) => node.dataset.synthesisHospitation));
    const visitIds = await page.evaluate(() => window.VersorgungsCompassDemoApi.snapshot().hospitations.map((item) => item.id));
    expect(visibleIds.every((id) => visitIds.includes(id))).toBe(true);
    expect(new Set(visibleIds).size).toBe(visibleIds.length);
    await entries.first().click();
    const drawer = page.locator("#hospitation-editor-drawer");
    await expect(drawer).toHaveClass(/is-documentation-mode/);
    await expect(drawer.locator("#hospitation-editor-title")).not.toHaveText("Terminangebot bearbeiten");
    await expect(drawer.getByRole("tab", { name: "Kontext" })).toBeVisible();
  });

  test("Dashboard und Framework zählen dieselben dokumentierten Beobachtungen", async ({ page }, testInfo) => {
    await openDemo(page, "#hospitations:dashboard");
    const observationCount = page.locator("[data-open-observations] strong");
    await expect(observationCount).toHaveText("69");
    const dashboardCount = await observationCount.textContent();
    const frameworkNavigation = page.locator('[data-sidebar-section="planning"] [data-view-tab="hospitations:synthesis"]');
    if (testInfo.project.name.includes("mobile")) {
      const shell = page.locator(".app-shell");
      await page.locator("#sidebar-collapse-button").click();
      await expect(shell).toHaveClass(/is-mobile-sidebar-expanded/);
      const planningSection = page.locator('[data-sidebar-section="planning"]');
      if (await planningSection.evaluate((element) => element.classList.contains("is-collapsed"))) {
        await planningSection.locator('[data-sidebar-section-toggle="planning"]').click();
      }
      await expect(frameworkNavigation).toBeVisible();
    }
    await frameworkNavigation.click();
    await expect(page).toHaveURL(/#hospitations:synthesis(?:\?|$)/);
    const framework = page.getByRole("navigation", { name: "Auswertungsschritte" });
    await expect(framework.locator('[data-synthesis-stage="observations"] .hs-step-count')).toHaveText(dashboardCount);
  });
});
