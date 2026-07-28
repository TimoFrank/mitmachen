import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

function formatParticipationBackendFixtureScript(role = "admin") {
  return `
    (() => {
      const now = "2026-07-16T12:00:00.000Z";
      const profile = {
        id: "11111111-1111-4111-8111-111111111111",
        email: "editor@example.test",
        display_name: "Erika Editor",
        initials: "EE",
        role: ${JSON.stringify(role)},
        active: true,
        avatar_url: "",
        team: "Versorgung",
        created_at: now,
        updated_at: now
      };
      const contact = {
        id: "format-contact-ada",
        name: "Ada Versorgung",
        displayName: "Ada Versorgung",
        organization: "Praxis Mitte",
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
        relationshipBasis: "active_collaboration",
        mitmachenConsentStatus: "granted",
        mitmachenConsentEffectiveAt: now,
        mitmachenConsentSource: "written",
        mitmachenConsentTextVersion: "mitmachen-kontakt-v2",
        mitmachenConsentRecordedBy: profile.id,
        mitmachenConsentNote: "Synthetische Einwilligung für den Beteiligungstest.",
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      const participant = (id, formatId, status, timestamps = {}) => ({
        id,
        formatId,
        contactId: contact.id,
        invitationStatus: status,
        participantRole: status === "Teilgenommen" ? "Praxisperspektive" : "",
        notes: "",
        createdAt: now,
        createdBy: profile.id,
        updatedAt: now,
        updatedBy: profile.id,
        ...timestamps
      });
      const formats = [
        {
          id: "format-future",
          title: "Zukunftswerkstatt Versorgung",
          formatType: "Workshop",
          startsAt: "2099-09-18T09:00:00.000Z",
          endsAt: "2099-09-18T12:00:00.000Z",
          location: "Online",
          ownerId: profile.id,
          status: "Planung",
          notes: "",
          createdAt: now,
          updatedAt: now,
          participants: [participant("participant-future", "format-future", "Eingeladen", { invitedAt: now, statusChangedAt: now })]
        },
        {
          id: "format-past",
          title: "Fachgespräch ePA",
          formatType: "Fachgespräch",
          startsAt: "2020-03-12T13:00:00.000Z",
          endsAt: "2020-03-12T15:00:00.000Z",
          location: "Berlin",
          ownerId: profile.id,
          status: "Abgeschlossen",
          notes: "",
          createdAt: now,
          updatedAt: now,
          participants: [participant("participant-past", "format-past", "Teilgenommen", { invitedAt: now, respondedAt: now, participatedAt: now, statusChangedAt: now })]
        },
        {
          id: "format-unlinked",
          title: "Unverknüpftes Forum",
          formatType: "Roundtable",
          startsAt: "2099-10-01T09:00:00.000Z",
          endsAt: "2099-10-01T10:00:00.000Z",
          location: "Hamburg",
          ownerId: profile.id,
          status: "Planung",
          notes: "",
          createdAt: now,
          updatedAt: now,
          participants: []
        }
      ];
      window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA = {
        profiles: [profile],
        contacts: [contact],
        organizations: [],
        formats,
        hospitationSlots: [],
        hospitations: [],
        hospitationRoadmapAssessments: [],
        hospitationUnmetNeeds: [],
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
          preferences: { onboarding: { version: 1, profileCompletedAt: now, tourSkippedAt: now } },
          createdAt: now,
          updatedAt: now
        }
      };
    })();
  `;
}

async function expectNoHorizontalOverflow(page, selector = "html") {
  const overflow = await page.locator(selector).evaluate((node) => Math.max(0, node.scrollWidth - node.clientWidth));
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Issue 28: Kontaktprofil zeigt Beteiligungsstatus kompakt; Pflege erfolgt im Format", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#person/contact/format-contact-ada", {
    role: "admin",
    backendFixtureScript: formatParticipationBackendFixtureScript()
  });

  const profile = page.locator("#person-profile-body");
  const formatSummary = profile.locator("[data-participation-summary-item='formats']");
  await expect(formatSummary).toContainText("Zukunftswerkstatt Versorgung");
  await expect(formatSummary.locator(".format-profile__type-badge")).toHaveText("Workshop");
  await expect(formatSummary.locator(".format-participation-status")).toHaveText("Eingeladen");
  await expect(formatSummary.locator(".profile-date-badge--format")).toHaveText(
    "18.09.2099, 11:00 – 18.09.2099, 14:00"
  );
  await formatSummary.click();
  await expect(profile.locator('[data-detail-tab="formats"]')).toHaveAttribute("aria-selected", "true");
  await expect(profile.locator('[data-detail-tab="formats"]')).toBeFocused();
  const formatSection = profile.locator("[data-format-profile-section]");
  await expect(formatSection).toBeVisible();
  await expect(formatSection.locator("[data-format-profile-group='upcoming']")).toContainText("Zukunftswerkstatt Versorgung");
  const pastGroup = formatSection.locator("[data-format-profile-group='past']");
  await expect(pastGroup).not.toHaveAttribute("open", "");
  await expect(pastGroup.locator("[data-format-profile-item='format-past']")).toBeHidden();
  await expect(formatSection.locator("[data-format-profile-status]")).toHaveCount(2);
  await expect(formatSection.locator("[data-format-profile-status='format-future']")).toHaveValue("Eingeladen");
  await expect(formatSection.locator("[data-format-profile-status='format-past']")).toHaveValue("Teilgenommen");
  await expect(formatSection.locator("[data-format-profile-status-form]")).toHaveCount(0);
  await expect(formatSection.locator("[data-format-profile-action='edit-status']")).toHaveCount(0);
  await expect(formatSection.locator("[data-format-profile-link-form]")).toHaveCount(0);
  await expect(formatSection.locator("[data-format-profile-action='list']")).toHaveCount(0);
  const futureItem = formatSection.locator("[data-format-profile-item='format-future']");
  await expect(futureItem.locator(".format-profile__copy > .profile-date-badge--format")).toHaveText(
    "18.09.2099, 11:00 – 18.09.2099, 14:00"
  );
  await expect(futureItem.locator(".format-profile__trailing .owner-badge__label")).toHaveText("Erika Editor");
  await expect(futureItem.locator(".format-profile__trailing .format-profile__type-badge")).toHaveText("Workshop");
  await expect(futureItem.locator("[data-format-profile-status='format-future']")).toHaveValue("Eingeladen");
  await page.locator("#global-status").evaluate((status) => { status.hidden = true; });
  await page.screenshot({ path: testInfo.outputPath("kontaktprofil-beteiligung-formate.png"), fullPage: false });
  await formatSection.getByRole("button", { name: "Zu Format hinzufügen" }).click();
  await expect(formatSection.locator("[data-format-profile-link-form] option[value='format-unlinked']")).toHaveCount(1);
  await expect(formatSection.locator("[data-format-profile-link-form]").getByRole("button", { name: "Hinzufügen", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("kontaktprofil-beteiligung-format-verknuepfen.png"), fullPage: false });
  await formatSection.locator("[data-format-profile-action='cancel-link']").click();

  await pastGroup.locator(":scope > summary").click();
  const pastItem = pastGroup.locator("[data-format-profile-item='format-past']");
  await expect(pastGroup).toHaveAttribute("open", "");
  await expect(pastItem).toBeVisible();
  await expect(pastItem.locator(".format-profile__copy > .profile-date-badge--format")).toHaveText(
    "12.03.2020, 14:00 – 12.03.2020, 16:00"
  );
  await expect(pastItem.locator(".format-profile__trailing .owner-badge__label")).toHaveText("Erika Editor");
  await expect(pastItem.locator(".format-profile__trailing .format-profile__type-badge")).toHaveText("Fachgespräch");
  await expect(pastItem.locator("[data-format-profile-status='format-past']")).toHaveValue("Teilgenommen");

  await profile.locator("[data-format-profile-item='format-future'] [data-format-profile-action='open']").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "formats");
  await expect(page.locator("[data-format-detail='format-future']")).toHaveClass(/is-open/);
  const formatStatus = page.locator("[data-format-detail='format-future'] [data-participant-field='invitationStatus']");
  await expect(formatStatus).toHaveValue("Eingeladen");
  await formatStatus.selectOption("Teilgenommen");
  await expect(page.locator("[data-format-detail='format-future'] [data-participant-field='invitationStatus']")).toHaveValue("Teilgenommen");
  const participantRole = page.locator("[data-format-detail='format-future'] [data-participant-field='participantRole']");
  await participantRole.fill("Impulsgeberin");
  await participantRole.press("Tab");
  await expect(page.locator("[data-format-detail='format-future'] [data-participant-field='participantRole']")).toHaveValue("Impulsgeberin");

  await page.locator("[data-format-detail='format-future'] [data-open-format-contact='format-contact-ada']").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "personProfile");
  await profile.locator('[data-detail-tab="formats"]').click();
  await expect(profile.locator("[data-format-profile-status='format-future']")).toHaveValue("Teilgenommen");
  await expect(profile.locator("[data-format-profile-item='format-future']")).not.toContainText("Rolle / Beitrag: Impulsgeberin");
  await expect(profile.locator("[data-format-profile-action='list']")).toHaveCount(0);

  if (testInfo.project.name.includes("mobile")) {
    await expectNoHorizontalOverflow(page);
  }
});

test("Issue 28: Viewer sehen Beteiligungen, können sie aber nicht verändern", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#person/contact/format-contact-ada", {
    role: "viewer",
    backendFixtureScript: formatParticipationBackendFixtureScript("viewer")
  });

  const profile = page.locator("#person-profile-body");
  await profile.locator('[data-detail-tab="formats"]').click();
  const formatSection = profile.locator("[data-format-profile-section]");
  await expect(formatSection.locator("[data-format-profile-item]")).toHaveCount(2);
  await expect(formatSection.locator("[data-format-profile-status]")).toHaveCount(0);
  await expect(formatSection.locator("[data-format-profile-link-form]")).toHaveCount(0);
  await expect(formatSection.locator("[data-format-profile-action='edit-status']")).toHaveCount(0);
  await expect(formatSection.locator("[data-format-profile-action='link']")).toHaveCount(0);
  await expect(formatSection.locator("[data-format-profile-action='list']")).toHaveCount(0);
  await expect(formatSection).toContainText("Eingeladen");
  await expect(formatSection).toContainText("Teilgenommen");
});
