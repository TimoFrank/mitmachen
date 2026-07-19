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

test("Issue 28: Kontaktprofil und Formatansicht pflegen denselben Beteiligungsstatus", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#person/contact/format-contact-ada", {
    role: "admin",
    backendFixtureScript: formatParticipationBackendFixtureScript()
  });

  const profile = page.locator("#person-profile-body");
  const formatSection = profile.locator("[data-format-profile-section]");
  await expect(formatSection).toBeVisible();
  await expect(formatSection.locator("[data-format-profile-group='upcoming']")).toContainText("Zukunftswerkstatt Versorgung");
  await expect(formatSection.locator("[data-format-profile-group='past']")).toContainText("Fachgespräch ePA");
  await expect(formatSection.locator("[data-format-profile-group='past']")).toContainText("Teilgenommen");
  await expect(formatSection.locator("[data-format-profile-link-form] option[value='format-unlinked']")).toHaveCount(1);

  const futureItem = formatSection.locator("[data-format-profile-item='format-future']");
  await futureItem.locator("[data-format-profile-status]").selectOption("Zugesagt");
  await expect(profile.locator("[data-format-profile-item='format-future'] [data-format-profile-status]")).toHaveValue("Zugesagt");

  await profile.locator("[data-format-profile-item='format-future'] [data-format-profile-action='open']").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "formats");
  await expect(page.locator("[data-format-detail='format-future']")).toHaveClass(/is-open/);
  const formatStatus = page.locator("[data-format-detail='format-future'] [data-participant-field='invitationStatus']");
  await expect(formatStatus).toHaveValue("Zugesagt");
  await formatStatus.selectOption("Teilgenommen");
  await expect(page.locator("[data-format-detail='format-future'] [data-participant-field='invitationStatus']")).toHaveValue("Teilgenommen");
  const participantRole = page.locator("[data-format-detail='format-future'] [data-participant-field='participantRole']");
  await participantRole.fill("Impulsgeberin");
  await participantRole.press("Tab");
  await expect(page.locator("[data-format-detail='format-future'] [data-participant-field='participantRole']")).toHaveValue("Impulsgeberin");

  await page.locator("[data-format-detail='format-future'] [data-open-format-contact='format-contact-ada']").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-view", "personProfile");
  await expect(profile.locator("[data-format-profile-item='format-future'] [data-format-profile-status]")).toHaveValue("Teilgenommen");
  await expect(profile.locator("[data-format-profile-item='format-future']")).toContainText("Rolle / Beitrag: Impulsgeberin");

  await profile.locator("[data-format-profile-action='list']").click();
  await expect(page.locator("#format-contact-filter")).toBeVisible();
  await expect(page.locator("#format-contact-filter-name")).toHaveText("Ada Versorgung");
  await expect(page.locator("[data-format-detail]")).toHaveCount(2);
  await page.locator("#format-contact-filter-clear").click();
  await expect(page.locator("#format-contact-filter")).toBeHidden();
  await expect(page.locator("[data-format-detail]")).toHaveCount(3);

  if (testInfo.project.name.includes("mobile")) {
    await expectNoHorizontalOverflow(page);
  }
});

test("Issue 28: Viewer sehen Beteiligungen, können sie aber nicht verändern", async ({ page }) => {
  await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#person/contact/format-contact-ada", {
    role: "viewer",
    backendFixtureScript: formatParticipationBackendFixtureScript("viewer")
  });

  const formatSection = page.locator("#person-profile-body [data-format-profile-section]");
  await expect(formatSection.locator("[data-format-profile-item]")).toHaveCount(2);
  await expect(formatSection.locator("[data-format-profile-status]")).toHaveCount(0);
  await expect(formatSection.locator("[data-format-profile-link-form]")).toHaveCount(0);
  await expect(formatSection).toContainText("Eingeladen");
  await expect(formatSection).toContainText("Teilgenommen");
});
