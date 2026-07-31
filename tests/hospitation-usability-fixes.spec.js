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
  test("Fragebogen validiert Kontext, Beobachtung und Codierung schrittweise", async ({ page }, testInfo) => {
    await openDemo(page, "#questionnaire");
    const isMobile = testInfo.project.name.includes("mobile");
    const context = page.locator('[data-questionnaire-step="1"]');
    const observation = page.locator('[data-questionnaire-step="2"]');
    const coding = page.locator('[data-questionnaire-step="3"]');
    const mobileNavigation = page.locator("[data-questionnaire-mobile-navigation]");
    const advanceStep = async (step) => {
      if (isMobile) {
        await mobileNavigation.locator("[data-questionnaire-step-next]").click();
        return;
      }
      await step.getByRole("button", { name: "Schritt abschließen" }).click();
    };

    if (isMobile) {
      await expect(mobileNavigation).toBeVisible();
      await expect(context.getByRole("button", { name: "Schritt abschließen" })).toBeHidden();
    }

    await advanceStep(context);
    await expect(context).toHaveAttribute("open", "");
    await expect(context.locator("[data-questionnaire-step-validation]")).toContainText("Datum");
    await expect(page.locator("#questionnaire-date")).toBeFocused();

    await page.locator("#questionnaire-date").fill("2026-07-24");
    await page.locator("#questionnaire-organization").selectOption("demo-org-elbesozial");
    await advanceStep(context);
    await expect(observation).toHaveAttribute("open", "");

    await advanceStep(observation);
    await expect(observation).toHaveAttribute("open", "");
    await expect(observation.locator("[data-questionnaire-step-validation]")).toContainText("Kurztitel");
    await expect(page.locator('input[name="questionnaireObservations[1][title]"]')).toBeFocused();

    await page.locator('input[name="questionnaireObservations[1][title]"]').fill("Rückfrage im Übergabeprozess");
    await page.locator('textarea[name="questionnaireObservations[1][observation]"]').fill("Die Pflegefachperson ruft wegen eines fehlenden Befunds zurück.");
    await advanceStep(observation);
    await expect(coding).toHaveAttribute("open", "");

    await advanceStep(coding);
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

  test("Kalender verwendet in Jahresansicht und mobiler Agenda die Statusfarben", async ({ page }, testInfo) => {
    await openDemo(page, "#hospitations");
    await page.getByRole("button", { name: "Kalender" }).click();
    const isMobile = testInfo.project.name.includes("mobile");
    const events = isMobile
      ? page.locator(".hospitation-mobile-agenda .hospitation-calendar-event")
      : page.locator(".hospitation-calendar-year-event");

    if (isMobile) {
      await expect(page.locator(".hospitation-mobile-agenda")).toBeVisible();
      await expect(page.getByRole("button", { name: "Jahr" })).toHaveCount(0);
      await expect(page.locator(".hospitation-calendar")).toHaveCount(0);
    } else {
      await page.getByRole("button", { name: "Jahr" }).click();
    }

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

  test("Termineditor richtet alle vier Schritte in einer Zeile aus", async ({ page }, testInfo) => {
    await openDemo(page, "#hospitations");
    await page.getByRole("button", { name: "+ Neuer Termin" }).click();
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
    await openDemo(page, "#hospitations");
    await page.getByRole("button", { name: "+ Neuer Termin" }).click();
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

    const row = page.locator(".hospitation-row", { hasText: "Ada Pflege" });
    await expect(row).toBeVisible();
    await expect(row.locator(".hospitation-contact-match-indicator")).toHaveCount(0);
  });

  test("exakt eingetippter bestehender Kontakt wird ohne Optionsklick wiederverwendet", async ({ page }) => {
    await openDemo(page, "#hospitations");
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

    await page.getByRole("button", { name: "+ Neuer Termin" }).click();
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
    await openDemo(page, "#hospitations");
    const entryKeys = await page.locator("[data-open-hospitation-entry]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-open-hospitation-entry")).filter(Boolean)
    );
    expect(entryKeys.length).toBeGreaterThan(0);
    expect(entryKeys.every((key) => key.startsWith("hospitation:"))).toBe(true);
    await page.locator("[data-open-hospitation-entry]").first().click();
    const drawer = page.locator("#hospitation-editor-drawer");
    await expect(drawer).toHaveClass(/is-documentation-mode/);
    await expect(drawer.locator("#hospitation-editor-title")).not.toHaveText("Terminangebot bearbeiten");
    await expect(drawer.getByRole("tab", { name: "Kontext" })).toBeVisible();
  });

  test("Dashboard und Framework zählen dieselben dokumentierten Beobachtungen", async ({ page }, testInfo) => {
    await openDemo(page, "#hospitations:dashboard");
    const observationKpi = page.locator(".hospitation-dashboard-kpi-card", { hasText: "Beobachtungen" });
    await expect(observationKpi.locator(".hospitation-dashboard-kpi-card__value")).toHaveText("69");
    const frameworkNavigation = page.locator('[data-sidebar-section="planning"] [data-view-tab="framework"]');
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
    await expect(page).toHaveURL(/#framework$/);
    const frameworkModel = page.getByRole("region", { name: "Von Beobachtung zum nächsten Schritt" });
    await expect(frameworkModel.locator(".hospitation-dashboard-funnel-badge").first()).toHaveText("69");
  });
});
