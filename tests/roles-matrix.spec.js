import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const allowedByRole = {
  admin: 9,
  editor: 5,
  viewer: 2
};

for (const [role, allowedCount] of Object.entries(allowedByRole)) {
  test(`Rollenmatrix zeigt die Standardrechte für ${role}`, async ({ page }) => {
    await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#profile", { role });

    const matrix = page.locator(".role-matrix-workspace");
    await expect(matrix).toBeHidden();
    await expect(page.locator("#profile-permission-details")).not.toHaveAttribute("open");
    await page.getByText("Funktionen und Berechtigungen", { exact: true }).click();
    await expect(matrix).toBeVisible();
    await expect(page.locator("#role-matrix-body tr")).toHaveCount(9);
    await expect(page.locator("#role-matrix-role-overview")).toHaveCount(0);
    await expect(page.locator("#role-matrix-body th > span")).toHaveCount(0);
    await expect(page.locator(`[data-role-matrix-heading="${role}"]`)).toHaveAttribute("aria-current", "true");
    await expect(page.locator(`#role-matrix-body [data-role-matrix-role="${role}"].is-allowed`)).toHaveCount(allowedCount);
    await expect(page.locator(`#role-matrix-body [data-role-matrix-role="${role}"].is-unavailable`)).toHaveCount(9 - allowedCount);
    await expect(matrix.locator(".role-matrix-notes")).toHaveText("Rollenvergabe: zentral verwaltet.");
    await expect(page.locator("#profile-role-description")).toHaveCount(0);
    const roleHeading = page.locator(".profile-role-heading");
    await expect(roleHeading.getByRole("heading", { name: "Meine Rolle" })).toBeVisible();
    await expect(roleHeading.locator("#profile-role-display")).toHaveText(new RegExp(role, "i"));
    const layout = await roleHeading.evaluate((root) => {
      const title = root.querySelector("h3").getBoundingClientRect();
      const role = root.querySelector("#profile-role-display").getBoundingClientRect();
      return { gap: role.left - title.right, centerDelta: Math.abs((title.top + title.height / 2) - (role.top + role.height / 2)) };
    });
    expect(layout.gap).toBeGreaterThanOrEqual(10);
    expect(layout.centerDelta).toBeLessThanOrEqual(2);
    await expect(matrix).toContainText("Standardrechte");
  });
}
