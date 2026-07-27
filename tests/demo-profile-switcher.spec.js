import { expect, test } from "@playwright/test";

const PAGES_APP = "/dist/pages/versorgungs-kompass.html";
const PROFILE_ADMIN = "demo-profile-admin";
const PROFILE_VIEWER = "demo-profile-viewer";

function pagesUrl(profileId, hash = "#contacts") {
  return `${PAGES_APP}?demoProfile=${encodeURIComponent(profileId)}${hash}`;
}

async function revealProfileSwitcher(page) {
  const shell = page.locator(".app-shell");
  const switcher = page.locator("#demo-profile-switcher");
  const trigger = page.getByRole("button", { name: /Demo-Profil wechseln/ });
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
  return { desktopLayout, select: switcher.getByRole("combobox", { name: "Demo-Profil" }), switcher, trigger };
}

test.describe("Pages-Profilwechsel", () => {
  test("zeigt die neue Überschrift und das modernisierte Dropdown in Desktop und Mobil", async ({ page }) => {
    await page.goto(pagesUrl(PROFILE_ADMIN));
    const { desktopLayout, select, switcher } = await revealProfileSwitcher(page);

    await expect(switcher.getByRole("heading", { level: 3, name: "Ansicht wechseln" })).toBeVisible();
    await expect(switcher).not.toContainText(/Synthetische/i);
    await expect(select).toHaveValue(PROFILE_ADMIN);
    if (desktopLayout) await expect(select).toBeFocused();

    const optionLabels = await select.locator("option").allTextContents();
    expect(optionLabels.length).toBeGreaterThan(1);
    expect(optionLabels).toEqual(expect.arrayContaining([
      expect.stringMatching(/ · Admin$/),
      expect.stringMatching(/ · Editor$/),
      expect.stringMatching(/ · Viewer$/)
    ]));

    const selectStyle = await select.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const shell = element.closest(".demo-profile-select-shell");
      const shellAfter = shell ? window.getComputedStyle(shell, "::after") : null;
      return {
        appearance: style.appearance,
        borderRadius: Number.parseFloat(style.borderRadius),
        cursor: style.cursor,
        minHeight: Number.parseFloat(style.minHeight),
        shellAfterBackground: shellAfter?.backgroundImage || "none"
      };
    });
    expect(selectStyle.appearance).toBe("none");
    expect(selectStyle.borderRadius).toBeGreaterThanOrEqual(12);
    expect(selectStyle.cursor).toBe("pointer");
    expect(selectStyle.minHeight).toBeGreaterThanOrEqual(42);
    expect(selectStyle.shellAfterBackground).not.toBe("none");

    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("demoProfile") === PROFILE_VIEWER && url.hash === "#contacts"),
      select.selectOption(PROFILE_VIEWER)
    ]);
    await expect(page.locator("#sidebar-profile-button")).toContainText("Nora Demir");
    await expect.poll(() => page.evaluate(
      () => window.VersorgungsCompassDemoApi.snapshot().currentProfileId
    )).toBe(PROFILE_VIEWER);
  });

  test("Desktop-Avatar öffnet und schließt das Popup zugänglich", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Die Avatarinteraktion wird im Desktop-Projekt geprüft.");

    await page.goto(pagesUrl(PROFILE_ADMIN));
    const shell = page.locator(".app-shell");
    if (await shell.evaluate((element) => element.classList.contains("is-sidebar-collapsed"))) {
      await page.locator("#sidebar-collapse-button").click();
    }

    const trigger = page.getByRole("button", { name: /Demo-Profil wechseln/ });
    const switcher = page.locator("#demo-profile-switcher");
    const avatar = page.locator("#sidebar-user-badge");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAccessibleName(/Demo-Profil wechseln, aktuell .+, Rolle Admin/);
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
    await expect(switcher.getByRole("combobox", { name: "Demo-Profil" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(switcher).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    await page.locator("#sidebar-profile-button").click();
    await expect(page).toHaveURL(/#profile$/);
  });
});
