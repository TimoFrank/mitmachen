import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const PAGES_APP = "/dist/pages/versorgungs-kompass.html";
const PROFILE_ADMIN = "demo-profile-admin";
const PROFILE_EDITOR = "demo-profile-editor";
const PROFILE_VIEWER = "demo-profile-viewer";

function pagesUrl(profileId, hash = "#contacts") {
  return `${PAGES_APP}?demoProfile=${encodeURIComponent(profileId)}${hash}`;
}

function onboardingPreviewUrl(profileId = PROFILE_VIEWER, hash = "#contacts") {
  return `${PAGES_APP}?demoProfile=${encodeURIComponent(profileId)}&demoOnboarding=fresh${hash}`;
}

async function revealProfileSwitcher(page) {
  const shell = page.locator(".app-shell");
  const switcher = page.locator("#demo-profile-switcher");
  const trigger = page.getByRole("button", { name: /Profil wechseln/ });
  const desktopLayout = await page.evaluate(() => window.matchMedia("(min-width: 761px)").matches);

  if (desktopLayout) {
    if (await shell.evaluate((element) => element.classList.contains("is-sidebar-collapsed"))) {
      await page.locator("#sidebar-collapse-button").click();
    }
    await expect(trigger).toBeVisible();
    await trigger.click();
  } else {
    if (!(await shell.evaluate((element) => element.classList.contains("is-mobile-sidebar-expanded")))) {
      await page.locator("#sidebar-collapse-button").click();
    }
    await expect(page.locator("[data-demo-profile-switcher-trigger]")).toBeHidden();
  }

  await expect(switcher).toBeVisible();
  await expect(switcher).toHaveAttribute("aria-labelledby", "demo-profile-switcher-title");
  await expect(page.getByRole("group", { name: "Ansicht wechseln" })).toBeVisible();
  return { desktopLayout, choices: switcher.locator("[data-demo-profile-choice]"), switcher, trigger };
}

test.describe("Pages-Profilwechsel", () => {
  test("normaler Demo-Modus bleibt ohne Onboarding-Vorschau", async ({ page }) => {
    await page.goto(pagesUrl(PROFILE_VIEWER));

    await expect(page.locator('[data-view-panel="onboarding"]')).toBeHidden();
    await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();
    await expect.poll(() => page.evaluate(
      () => window.VersorgungsCompassDemoApi.snapshot().currentProfileId
    )).toBe(PROFILE_VIEWER);
    expect(await page.evaluate(
      () => window.VERSORGUNGS_COMPASS_DEMO_RUNTIME.onboardingPreview
    )).toBe(false);

    await page.goto(onboardingPreviewUrl(PROFILE_ADMIN));
    await expect(page.locator('[data-view-panel="onboarding"]')).toBeHidden();
    await expect(page.locator('[data-view-panel="contacts"]')).toBeVisible();
    expect(await page.evaluate(
      () => window.VERSORGUNGS_COMPASS_DEMO_RUNTIME.onboardingPreview
    )).toBe(false);
  });

  test("Onboarding-Vorschau startet nur mit dem frischen Viewer-Vertrag", async ({ page }) => {
    await page.goto(onboardingPreviewUrl());

    await expect(page.locator('[data-view-panel="onboarding"]')).toBeVisible();
    await expect(page.locator('[data-onboarding-step-panel="welcome"]')).toBeVisible();
    await expect(page.locator("#workspace-view-title")).toHaveText("Willkommen");
    await expect(page.locator('[data-workspace-brand]')).toBeVisible();
    await expect(page.locator("#workspace-brand-image")).toHaveAttribute("alt", "Versorgungs-Kompass");
    await expect(page.locator('[data-onboarding-step-dot]')).toHaveCount(7);
    expect(await page.evaluate(
      () => window.VERSORGUNGS_COMPASS_DEMO_RUNTIME.onboardingPreview
    )).toBe(true);
    await expect.poll(() => page.evaluate(
      () => window.VersorgungsCompassDemoApi.snapshot().currentProfileId
    )).toBe(PROFILE_VIEWER);

    await page.locator("#onboarding-welcome-next").click();
    await expect(page.locator("#onboarding-profile-form")).toBeVisible();
    await expect(page.locator("#onboarding-display-name")).toHaveValue("Nora Demir");
  });

  test("zeigt genau drei direkt auswählbare Demo-Konten auf Desktop und Mobil", async ({ page }) => {
    await page.goto(pagesUrl(PROFILE_ADMIN));
    const { desktopLayout, choices, switcher } = await revealProfileSwitcher(page);

    await expect(switcher.getByRole("heading", { level: 3, name: "Ansicht wechseln" })).toBeVisible();
    await expect(switcher).not.toContainText(/Synthetische/i);
    await expect(switcher.locator("select")).toHaveCount(0);
    await expect(choices).toHaveCount(3);
    await expect(choices.locator("strong")).toHaveText(["Mara Stein", "Tobias Nguyen", "Nora Demir"]);
    await expect(choices.locator(".demo-profile-choice__copy > span")).toHaveText(["Admin", "Editor", "Viewer"]);

    const currentChoice = switcher.getByRole("button", { name: "Mara Stein Admin", exact: true });
    await expect(currentChoice).toHaveAttribute("aria-pressed", "true");
    if (desktopLayout) await expect(currentChoice).toBeFocused();

    const editorChoice = switcher.getByRole("button", { name: "Tobias Nguyen Editor", exact: true });
    await expect(editorChoice).toBeVisible();
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("demoProfile") === PROFILE_EDITOR && url.hash === "#contacts"),
      editorChoice.click()
    ]);
    await expect(page.locator("#sidebar-profile-button")).toContainText("Tobias Nguyen");
    await expect(page.locator("#sidebar-user-role")).toHaveText("Editor");
    await expect(page.locator("#new-contact-button")).toBeVisible();

    const viewerSwitcher = await revealProfileSwitcher(page);
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("demoProfile") === PROFILE_VIEWER && url.hash === "#contacts"),
      viewerSwitcher.switcher.getByRole("button", { name: "Nora Demir Viewer", exact: true }).click()
    ]);
    await expect(page.locator("#sidebar-profile-button")).toContainText("Nora Demir");
    await expect(page.locator("#sidebar-user-role")).toHaveText("Viewer");
    const permissionNotice = page.waitForEvent("dialog");
    const createAttempt = page.locator("#new-contact-button").click();
    const notice = await permissionNotice;
    expect(notice.message()).toContain("nur Leserechte");
    await notice.dismiss();
    await createAttempt;
    await expect(page.locator("#editor-drawer")).toHaveAttribute("aria-hidden", "true");
    await expect.poll(() => page.evaluate(
      () => window.VersorgungsCompassDemoApi.snapshot().currentProfileId
    )).toBe(PROFILE_VIEWER);
  });

  test("Demo-Kontowahl lässt im mobilen Querformat Platz für die Navigation", async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 390 });
    await page.goto(pagesUrl(PROFILE_ADMIN));
    await revealProfileSwitcher(page);

    const navigation = page.locator(".sidebar-nav.primary-nav");
    const accounts = page.locator('[data-sidebar-section="account"]');
    const navigationBox = await navigation.boundingBox();
    expect(navigationBox?.height).toBeGreaterThanOrEqual(80);
    expect(await accounts.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

    const viewerChoice = page.getByRole("button", { name: "Nora Demir Viewer", exact: true });
    await viewerChoice.scrollIntoViewIfNeeded();
    await expect(viewerChoice).toBeInViewport();

    const profileButton = page.locator("#sidebar-profile-button");
    await profileButton.scrollIntoViewIfNeeded();
    await expect(profileButton).toBeInViewport();
    expect(await accounts.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });

  test("geschützte Anwendung bietet keine Demo-Kontowahl", async ({ page }) => {
    await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", { role: "admin" });

    await expect(page.locator("[data-demo-profile-switcher]")).toHaveCount(0);
    await expect(page.locator("[data-demo-profile-switcher-trigger]")).toHaveCount(0);
  });

  test("Desktop-Avatar öffnet und schließt das Popup zugänglich", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Die Avatarinteraktion wird im Desktop-Projekt geprüft.");

    await page.goto(pagesUrl(PROFILE_ADMIN));
    const shell = page.locator(".app-shell");
    if (await shell.evaluate((element) => element.classList.contains("is-sidebar-collapsed"))) {
      await page.locator("#sidebar-collapse-button").click();
    }

    const trigger = page.getByRole("button", { name: /Profil wechseln/ });
    const switcher = page.locator("#demo-profile-switcher");
    const avatar = page.locator("#sidebar-user-badge");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAccessibleName(/Profil wechseln, aktuell .+, Rolle Admin/);
    await expect(trigger).toHaveAttribute("title", / · Admin$/);
    await expect(trigger).toHaveAttribute("aria-controls", "demo-profile-switcher");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger.locator(".sidebar-profile-switcher-indicator svg")).toBeVisible();
    await expect(switcher).toBeHidden();

    const [avatarBox, triggerBox] = await Promise.all([avatar.boundingBox(), trigger.boundingBox()]);
    expect(avatarBox).not.toBeNull();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox.x).toBeLessThanOrEqual(avatarBox.x);
    expect(triggerBox.y).toBeLessThanOrEqual(avatarBox.y);
    expect(triggerBox.x + triggerBox.width).toBeGreaterThanOrEqual(avatarBox.x + avatarBox.width);
    expect(triggerBox.y + triggerBox.height).toBeGreaterThanOrEqual(avatarBox.y + avatarBox.height);

    await page.mouse.click(avatarBox.x + avatarBox.width / 2, avatarBox.y + avatarBox.height / 2);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(switcher).toBeVisible();
    await expect(switcher.getByRole("button", { name: "Mara Stein Admin", exact: true })).toBeFocused();
    await expect(switcher.locator("[data-demo-profile-choice]")).toHaveCount(3);

    await page.keyboard.press("Escape");
    await expect(switcher).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    await page.locator("#sidebar-profile-button").click();
    await expect(page).toHaveURL(/#profile$/);
  });
});
