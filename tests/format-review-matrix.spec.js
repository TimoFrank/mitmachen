import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

function formatReviewBackendFixture() {
  const fixture = createProtectedBackendFixture({ role: "admin" });
  fixture.contactNotes.push({
    id: "format-review-note-medienbruch",
    contactId: "demo-contact-01",
    contact_id: "demo-contact-01",
    body: "Synthetische Expertise zu Medienbruch und Medikationsabgleich.",
    text: "",
    createdAt: "2026-07-19T12:00:00.000Z",
    created_at: "2026-07-19T12:00:00.000Z"
  });
  for (let index = 0; index < 105; index += 1) {
    fixture.contactNotes.push({
      id: `format-review-note-crowding-${index}`,
      contactId: "demo-contact-01",
      contact_id: "demo-contact-01",
      body: `Verdrängungsanker aus wiederholter Notiz ${index + 1}.`,
      text: "",
      createdAt: "2026-07-19T12:00:00.000Z",
      created_at: "2026-07-19T12:00:00.000Z"
    });
  }
  fixture.contactNotes.push({
    id: "format-review-note-distinct-contact",
    contactId: "demo-contact-02",
    contact_id: "demo-contact-02",
    body: "Verdrängungsanker als eigenständige Expertise einer weiteren Person.",
    text: "",
    createdAt: "2026-07-19T12:00:00.000Z",
    created_at: "2026-07-19T12:00:00.000Z"
  });
  return fixture;
}

test("Format-Liveflow: anlegen, Kandidat auswählen und Beteiligungsstatus pflegen", async ({ page }, testInfo) => {
  const pageErrors = [];
  const contentSearchRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/contact-content-search")) contentSearchRequests.push(new URL(request.url()));
  });
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#formats", {
    backendFixture: formatReviewBackendFixture()
  });

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
  const participantDrawer = page.locator("#format-participant-drawer");
  const participantSearch = page.locator("#format-participant-search");
  const participantTable = page.locator(".format-participant-table");
  const participantRows = page.locator("#format-participant-list [data-planner-contact]");
  await expect(participantDrawer).toHaveAttribute("aria-hidden", "false");
  await expect(participantTable).toBeVisible();
  const participantColumns = ["Auswahl", "Person", "Organisation", "Sektor", "Ort", "Treffer im Profil"];
  await expect.poll(() => participantTable.locator("thead th").evaluateAll((headers) => (
    headers.map((header) => header.textContent.trim())
  ))).toEqual(participantColumns);
  const quickFilters = participantDrawer.locator(".format-participant-body > .format-participant-quick-filters");
  const sectorFilter = participantDrawer.locator("#format-participant-sector");
  const stateFilter = participantDrawer.locator("#format-participant-state");
  const filterReset = quickFilters.locator("#format-participant-filter-reset");
  const filterStatus = quickFilters.locator("#format-participant-filter-status");
  const globalReset = participantDrawer.locator("#format-participant-reset");
  await expect(quickFilters).toBeVisible();
  await expect(participantDrawer.locator(".format-participant-discovery .format-participant-quick-filters")).toHaveCount(0);
  await expect(participantDrawer.locator(".format-participant-discovery + .format-participant-results-head")).toHaveCount(1);
  await expect(participantDrawer.locator(".format-participant-results-head + .format-participant-quick-filters")).toHaveCount(1);
  await expect(quickFilters.locator("[data-participant-quick-filter]")).toHaveCount(2);
  await expect(sectorFilter).toBeVisible();
  await expect(stateFilter).toBeVisible();
  await expect(filterReset).toBeHidden();
  await expect(filterStatus).toBeHidden();
  await expect(globalReset).toHaveText("Suche zurücksetzen");
  await expect(participantDrawer.locator("#format-participant-specialty")).toHaveCount(0);
  await expect(participantDrawer.locator(".format-participant-filter-toggle")).toHaveCount(0);
  const searchScope = participantDrawer.locator("#format-participant-search-scope");
  await expect(participantDrawer.locator("#format-participant-title")).toHaveText("Personen einladen");
  await expect(participantDrawer.locator(".format-participant-discovery__intro")).toHaveCount(0);
  await expect(participantDrawer.locator("#format-participant-search-label")).toHaveText("Person oder Stichwort suchen");
  await expect(searchScope).toHaveText("Durchsucht auch Rollen, Organisationen, Orte, Themen, Notizen und Anhänge.");
  await expect(participantDrawer.locator("#format-participant-results")).not.toContainText("Nach Name");
  await expect(participantRows.first()).toBeVisible();
  const initialParticipantCount = await participantRows.count();
  expect(initialParticipantCount).toBeGreaterThan(1);
  await expect(participantSearch).toBeFocused();

  await sectorFilter.selectOption({ label: "Reha" });
  await stateFilter.selectOption({ label: "Baden-Wuerttemberg" });
  const candidateRow = page.locator('[data-planner-contact="demo-contact-08"]');
  await expect(candidateRow).toBeVisible();
  await expect(filterStatus).toBeVisible();
  await expect(filterStatus).toContainText(/2.*aktiv/i);
  await expect(filterReset).toBeVisible();
  await expect(filterReset).toHaveClass(/format-participant-filter-reset/);
  await expect(filterReset).toHaveText("Filter zurücksetzen");
  await expect(filterReset).toBeEnabled();
  await participantSearch.fill("Koordination");
  await expect(candidateRow).toBeVisible();
  await expect(candidateRow.locator(".format-participant-match__labels")).toContainText("Rolle");
  await filterReset.click();
  await expect(sectorFilter).toHaveValue("");
  await expect(stateFilter).toHaveValue("");
  await expect(participantSearch).toHaveValue("Koordination");
  await expect(filterReset).toBeHidden();
  await expect(filterStatus).toBeHidden();
  await participantSearch.fill("");

  await participantSearch.fill("Medienbruch");
  const noteMatch = page.locator('[data-planner-contact="demo-contact-01"]');
  await expect(noteMatch).toBeVisible();
  await expect(noteMatch.locator(".format-participant-match__labels")).toContainText("Notiz");
  await expect(noteMatch.locator(".format-participant-match__snippet")).toContainText("Medienbruch");
  await expect.poll(() => contentSearchRequests.some((url) => url.searchParams.get("distinctContacts") === "true")).toBe(true);

  await participantSearch.fill("Verdrängungsanker");
  await expect(page.locator('[data-planner-contact="demo-contact-01"]')).toBeVisible();
  await expect(page.locator('[data-planner-contact="demo-contact-02"]')).toBeVisible();

  for (const [query, source] of [
    ["Koordination", "Rolle"],
    ["Demo-Reha-Zentrum Neckarbogen", "Organisation"],
    ["Stuttgart", "Ort"],
    ["Baden-Wuerttemberg", "Ort"],
    ["Baden-Württemberg", "Ort"]
  ]) {
    await participantSearch.fill(query);
    await expect(candidateRow).toBeVisible();
    await expect(candidateRow.locator(".format-participant-match__labels")).toContainText(source);
  }

  await participantSearch.fill("Demo-Kontakt 08");
  const candidate = candidateRow.getByRole("checkbox", { name: "Demo-Kontakt 08 auswählen" });
  await expect(candidateRow).toBeVisible();
  await expect.poll(() => participantRows.count()).toBeLessThan(initialParticipantCount);
  await expect(page.locator("#format-participant-results")).toContainText(/\d+(?: von \d+)? Personen?/);
  await expect.poll(() => candidateRow.locator(":scope > td").evaluateAll((cells) => (
    cells.map((cell) => cell.dataset.label)
  ))).toEqual(participantColumns);
  const personCell = candidateRow.locator('[data-label="Person"]');
  await expect(personCell).toContainText("Demo-Kontakt 08");
  await expect(personCell).not.toContainText("Stuttgart");
  await expect(personCell).not.toContainText("Baden-Wuerttemberg");
  const organizationCell = candidateRow.locator('[data-label="Organisation"]');
  await expect(organizationCell).toHaveText("Demo-Reha-Zentrum Neckarbogen");
  await expect(candidateRow.locator('[data-label="Sektor"]')).toContainText("Reha");
  const locationCell = candidateRow.locator('[data-label="Ort"]');
  await expect(locationCell).toContainText("Stuttgart");
  await expect(locationCell).not.toContainText("Baden-Wuerttemberg");
  await expect(candidateRow.locator('[data-label="Rolle"]')).toHaveCount(0);
  await expect(candidateRow.locator('[data-label="Kontaktstatus"]')).toHaveCount(0);
  await candidate.check();
  await expect(page.locator("#format-participant-selection-count")).toContainText("1 Person ausgewählt");
  await expect(page.locator("#format-participant-add")).toHaveText("1 Person zur Einladungsliste hinzufügen");
  await page.locator("#format-participant-add").click();

  const status = createdFormat.locator('[data-participant-field="invitationStatus"]');
  await expect(status).toHaveValue("Kandidat");
  await status.selectOption("Eingeladen");
  await expect(status).toHaveValue("Eingeladen");

  const screenshotPath = testInfo.outputPath(`format-liveflow-${testInfo.project.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("format-liveflow", { path: screenshotPath, contentType: "image/png" });
});
